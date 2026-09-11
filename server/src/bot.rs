//! Jugadores de mentira, para poder jugar solo y para tener con quién probar.
//!
//! No hacen falta ni dependencias nuevas ni tocar la lógica del juego, porque
//! `handle_client_message` ya no necesita un socket: le basta un `player_id`,
//! un `current_lobby` y el `AppState`. Y las conexiones son un
//! `HashMap<Uuid, UnboundedSender<ServerMessage>>`. Así que un bot:
//!
//!   1. registra su propio canal en `state.connections` con un uuid nuevo,
//!   2. lee su receptor como "los mensajes que recibe",
//!   3. llama a `handle_client_message` para actuar.
//!
//! Para el resto del servidor es indistinguible de una persona, lo que además
//! convierte una partida entre bots en la primera prueba automática de
//! multijugador que ha tenido este juego.

use crate::game::{CardInfo, ClientMessage, ServerMessage};
use crate::websocket::{handle_client_message, AppState};
use futures::future::BoxFuture;
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};
use tokio::sync::mpsc;
use tokio::time::sleep;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Difficulty {
    Easy,
    Normal,
    Hard,
}

impl Default for Difficulty {
    fn default() -> Self {
        Difficulty::Normal
    }
}

/// Los cuatro mandos que definen lo fuerte que es un bot.
pub struct Knobs {
    /// Cuánto tarda entre jugadas. Es el mando que más se nota.
    pub think: Duration,
    /// Cada cuánto pulsa en una pelea. Con jitter: un ritmo exacto se oye como
    /// un metrónomo y no como alguien peleando.
    pub click: Duration,
    /// Probabilidad de elegir la carta buena en vez de una al azar.
    pub good_choice: f64,
    /// Probabilidad de pelearte una carta que te ha visto coger.
    pub contest: f64,
}

impl Difficulty {
    pub fn knobs(self) -> Knobs {
        match self {
            // `contest` es por CARTA que ves coger a otro, no por comprobación.
            // Antes se tiraba el dado cada 80 ms mientras durase el intento, o
            // sea ~4 veces por oportunidad: el 0.35 de normal acababa siendo un
            // 82 % real y los bots se peleaban por todo.
            Difficulty::Easy => Knobs {
                think: Duration::from_millis(2500),
                click: Duration::from_millis(320),
                good_choice: 0.50,
                contest: 0.05,
            },
            Difficulty::Normal => Knobs {
                think: Duration::from_millis(1200),
                click: Duration::from_millis(180),
                good_choice: 0.80,
                contest: 0.20,
            },
            Difficulty::Hard => Knobs {
                think: Duration::from_millis(500),
                click: Duration::from_millis(110),
                good_choice: 0.95,
                contest: 0.50,
            },
        }
    }
}

/// Lo que tarda en tapar el hueco tras soltar. No es dificultad: hasta el bot
/// fácil coge rápido, porque dejar la carta ahí es lo que ensucia el centro y
/// lo que le haría perder una carta al azar por el plazo de 3 s del servidor.
const REFLEX_DELAY: Duration = Duration::from_millis(250);

/// Cuántos turnos aguanta esperando su prenda antes de soltar igual.
/// Con todos los bots esperando a la vez nadie suelta, el centro no cambia y la
/// partida se queda quieta; esto la mueve.
const IDLE_TICKS_BEFORE_CHURN: u8 = 3;

/// Lo que el bot sabe del tablero. Solo lo que le han mandado a él, igual que
/// un cliente: no mira el estado del servidor para decidir sus jugadas.
struct Bot {
    id: Uuid,
    knobs: Knobs,
    sets: Vec<Vec<Option<CardInfo>>>,
    center: Vec<CardInfo>,
    current_set: usize,
    playing: bool,
    stunned_until: Option<Instant>,
    fighting: bool,
    /// Última carta por la que ya decidió si peleaba. El dado se tira una vez
    /// por carta, no una vez por comprobación.
    last_intent: Option<u32>,
    /// Sets que ya ha enseñado. Hay que voltear los 6 para poder verificar, así
    /// que sin esto un bot no puede ganar por muy bien que juegue.
    flipped: [bool; 6],
    /// La verificación se pide una sola vez.
    verification_sent: bool,
}

impl Bot {
    fn owes(&self) -> bool {
        self.sets.iter().any(|s| s.iter().any(|c| c.is_none()))
    }

    fn stunned(&self) -> bool {
        self.stunned_until.map_or(false, |t| Instant::now() < t)
    }

    /// El hueco que debe tapar, si hay alguno.
    fn hole(&self) -> Option<usize> {
        self.sets.iter().position(|s| s.iter().any(|c| c.is_none()))
    }

    /// Prenda mayoritaria de un set y cuántas lleva: es la que conviene
    /// completar.
    fn modal(&self, set_index: usize) -> Option<(u8, usize)> {
        let set = self.sets.get(set_index)?;
        let mut best: Option<(u8, usize)> = None;
        for slot in set.iter().flatten() {
            let n = set.iter().flatten()
                .filter(|c| c.clothing_type == slot.clothing_type)
                .count();
            if best.map_or(true, |(_, bn)| n > bn) {
                best = Some((slot.clothing_type, n));
            }
        }
        best
    }

    fn set_is_done(&self, set_index: usize) -> bool {
        self.sets.get(set_index).map_or(false, |s| {
            s.iter().all(|c| c.is_some())
                && self.modal(set_index).map_or(false, |(_, n)| n == 4)
        })
    }

    /// ¿Hay en el centro alguna carta de esta prenda?
    fn center_has(&self, clothing_type: u8) -> bool {
        self.center.iter().any(|c| c.clothing_type == clothing_type)
    }

    /// Cuántas cartas de esa prenda lleva en toda la mano.
    fn count_in_hand(&self, clothing_type: u8) -> usize {
        self.sets.iter().flatten().flatten()
            .filter(|c| c.clothing_type == clothing_type)
            .count()
    }

    /// El set incompleto al que merece la pena ir.
    ///
    /// No basta con "el que más cartas iguales tiene": si la prenda que le
    /// falta no está en el centro, se queda soltando y cogiendo basura para
    /// siempre sin cerrar nada. Por eso tener la prenda a la vista pesa tanto
    /// como llevar dos cartas más de ella.
    fn best_set(&self) -> Option<usize> {
        (0..self.sets.len())
            .filter(|&i| !self.set_is_done(i))
            .max_by_key(|&i| {
                let (t, n) = match self.modal(i) {
                    Some(v) => v,
                    None => return 0,
                };
                n * 2 + if self.center_has(t) { 4 } else { 0 }
            })
    }

    /// Qué hacer ahora. `None` = esperar.
    fn decide(&self, rng: &mut impl Rng) -> Option<ClientMessage> {
        if !self.playing || self.stunned() || self.fighting {
            return None;
        }

        // Enseñar y verificar va antes que seguir moviendo cartas: ganar exige
        // los 6 sets volteados, y eso es lo que dispara la verificación. Sin
        // esto un bot podía tener los 6 sets perfectos y no terminar nunca.
        // Debiendo una carta no se puede voltear: primero se tapa el hueco.
        if !self.owes() {
            if let Some(i) = (0..6).find(|&i| self.set_is_done(i) && !self.flipped[i]) {
                return Some(ClientMessage::FlipSet { set_index: i });
            }
            if !self.verification_sent && self.flipped.iter().all(|f| *f) {
                return Some(ClientMessage::RequestVerification);
            }
        }

        let well = rng.gen_bool(self.knobs.good_choice);

        // Debiendo una carta no se puede hacer nada más que coger del centro.
        if let Some(hole_set) = self.hole() {
            if self.center.is_empty() {
                return None;
            }
            let pick = if well {
                let want = self.modal(hole_set).map(|(t, _)| t);
                // 1) la prenda que cierra este set;
                want.and_then(|t| self.center.iter().find(|c| c.clothing_type == t))
                    // 2) si no está, algo que ya tenga en ESE set, que es donde
                    //    va a caer la carta;
                    .or_else(|| self.center.iter().find(|c| {
                        self.sets.get(hole_set).is_some_and(|s| {
                            s.iter().flatten().any(|h| h.clothing_type == c.clothing_type)
                        })
                    }))
                    // 3) y si tampoco, lo que más tenga en la mano: al menos no
                    //    empeora. Coger la primera del centro era lo que le
                    //    hacía dar vueltas cambiando basura por basura.
                    .or_else(|| self.center.iter()
                        .max_by_key(|c| self.count_in_hand(c.clothing_type)))
            } else {
                self.center.get(rng.gen_range(0..self.center.len()))
            };
            return pick.map(|c| ClientMessage::TakeCard { card_id: c.id });
        }

        let target = self.best_set()?;

        // Soltar solo si la prenda que cierra este set ESTÁ ya en el centro.
        //
        // Es lo que hacía que no cerraran nunca. Soltar obliga a coger, así que
        // si lo que necesitas no está, sueltas una carta y te llevas otra que
        // tampoco sirve: el ciclo entero suma cero y encima regalas una carta.
        // Solo se avanza cuando la prenda buena está en la mesa en el momento
        // de coger, así que fuera de ese caso lo correcto es esperar.
        // Esperar para siempre bloquearía la mesa —si nadie suelta, el centro
        // no cambia—, de eso se encarga `force_drop` desde el bucle.
        if well && !self.modal(target).is_some_and(|(t, _)| self.center_has(t)) {
            return None;
        }

        self.drop_from(target, well)
    }

    /// Suelta algo del set `target`, cambiando antes a él si hace falta.
    fn drop_from(&self, target: usize, well: bool) -> Option<ClientMessage> {
        // DropCard suelta del set que tengas abierto, así que primero hay que
        // cambiarse a él.
        if target != self.current_set {
            return Some(ClientMessage::SwitchSet { set_index: target });
        }

        let keep = self.modal(target).map(|(t, _)| t);
        let set = self.sets.get(target)?;
        let spare = if well {
            // Cualquiera que no sea la mayoritaria.
            //
            // Se intentó "la más rara del set" y resultó no cambiar nada: en un
            // set de 4, si la mayoritaria son 2, las otras dos son
            // forzosamente singletons, y si son todas distintas también. Nunca
            // hay una que sea más rara que otra, así que ordenar por rareza
            // elegía siempre la misma que este `find`. Lo que sí mejora al bot
            // es a qué set va y qué coge, no cuál de las sobrantes suelta.
            (0..set.len()).find(|&i| {
                set[i].as_ref().is_some_and(|c| Some(c.clothing_type) != keep)
            })
        } else {
            (0..set.len()).find(|&i| set[i].is_some())
        };
        spare.map(|i| ClientMessage::DropCard { my_card_index: i })
    }

    /// Soltar aunque no convenga, para que la mesa no se pare.
    ///
    /// Si todos esperan a que aparezca su prenda y nadie suelta, el centro no
    /// cambia nunca y la partida se queda congelada. Tras unos turnos sin hacer
    /// nada, el bot suelta igual: mueve el centro y le da opciones a los demás.
    ///
    /// Se probó soltar del set PEOR en vez del mejor, con la idea de que las
    /// cuartas copias que los demás esperan se quedan muertas en el montón de
    /// basura. No sirvió: medido sobre 3 minutos, ni así cerró nadie un set, y
    /// el desvío costaba un turno de cambio de set cada vez. Se vuelve a lo
    /// simple. Lo que impide cerrar está en el reparto, no aquí: ver TODO.md.
    fn force_drop(&self, rng: &mut impl Rng) -> Option<ClientMessage> {
        if !self.playing || self.stunned() || self.fighting || self.owes() {
            return None;
        }
        let target = self.best_set()?;
        self.drop_from(target, rng.gen_bool(self.knobs.good_choice))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn card(id: u32, t: u8) -> CardInfo {
        CardInfo { id, clothing_type: t, name: format!("prenda {t}") }
    }

    /// Bot con una mano y un centro concretos. `good_choice` a 1.0 para probar
    /// la decisión buena, no el dado.
    fn bot_with(sets: Vec<Vec<Option<CardInfo>>>, center: Vec<CardInfo>) -> Bot {
        Bot {
            id: Uuid::new_v4(),
            knobs: Knobs {
                think: Duration::from_millis(1),
                click: Duration::from_millis(1),
                good_choice: 1.0,
                contest: 0.0,
            },
            sets,
            center,
            current_set: 0,
            playing: true,
            stunned_until: None,
            fighting: false,
            last_intent: None,
            flipped: [false; 6],
            verification_sent: false,
        }
    }

    fn full(t: u8, base: u32) -> Vec<Option<CardInfo>> {
        (0..4).map(|i| Some(card(base + i, t))).collect()
    }

    /// Relleno que NO está completo. Hace falta porque enseñar un set hecho va
    /// antes que mover cartas: con `full()` de relleno el bot querría enseñar
    /// esos sets y nunca llegaría a la decisión que prueba el test.
    fn mixed(base: u32) -> Vec<Option<CardInfo>> {
        (0..4).map(|i| Some(card(base + i, 20 + i as u8))).collect()
    }

    #[test]
    fn it_chases_the_set_whose_garment_it_can_actually_get() {
        // Set 0: tres iguales del tipo 1, pero no hay ningún 1 en el centro.
        // Set 1: dos iguales del tipo 2, y en el centro hay un 2.
        // Ir al 0 es quedarse dando vueltas sin poder cerrarlo nunca, que es lo
        // que hacía antes.
        let sets = vec![
            vec![Some(card(0, 1)), Some(card(1, 1)), Some(card(2, 1)), Some(card(3, 9))],
            vec![Some(card(4, 2)), Some(card(5, 2)), Some(card(6, 8)), Some(card(7, 7))],
            full(3, 10), full(4, 20), full(5, 30), full(6, 40),
        ];
        let bot = bot_with(sets, vec![card(99, 2)]);
        assert_eq!(bot.best_set(), Some(1));
    }

    #[test]
    fn it_never_drops_the_card_the_set_is_built_around() {
        // Mayoritaria el 6 con dos copias; sobran el 5 y el 7, sueltas. Cuál de
        // las dos suelte da igual —en un set de 4 las sobrantes son siempre
        // igual de raras—, pero tocar el 6 sería deshacer el propio set.
        let sets = vec![
            vec![Some(card(0, 6)), Some(card(1, 6)), Some(card(2, 5)), Some(card(3, 7))],
            mixed(10), mixed(20), mixed(30), mixed(40), mixed(50),
        ];
        let bot = bot_with(sets, vec![card(99, 6)]);
        let mut rng = rand::thread_rng();
        match bot.decide(&mut rng) {
            Some(ClientMessage::DropCard { my_card_index }) => {
                assert!(my_card_index == 2 || my_card_index == 3,
                        "soltó la mayoritaria y se deshizo el set");
            }
            other => panic!("esperaba soltar una carta, fue {other:?}"),
        }
    }

    #[test]
    fn owing_it_takes_what_closes_the_set() {
        let mut sets = vec![
            vec![Some(card(0, 5)), Some(card(1, 5)), Some(card(2, 5)), None],
            full(3, 10), full(4, 20), full(5, 30), full(6, 40), full(8, 50),
        ];
        sets[0][3] = None;
        let bot = bot_with(sets, vec![card(90, 9), card(91, 5), card(92, 4)]);
        let mut rng = rand::thread_rng();
        match bot.decide(&mut rng) {
            Some(ClientMessage::TakeCard { card_id }) => assert_eq!(card_id, 91),
            other => panic!("esperaba coger la que cierra el set, fue {other:?}"),
        }
    }

    #[test]
    fn owing_with_nothing_useful_it_still_picks_the_least_bad() {
        // Sin la prenda que cierra ni ninguna del set, se queda con la que más
        // tiene en la mano. Coger la primera del centro era lo que le hacía
        // cambiar basura por basura sin avanzar.
        let sets = vec![
            vec![Some(card(0, 5)), Some(card(1, 5)), Some(card(2, 5)), None],
            full(7, 10), full(7, 20), full(4, 30), full(6, 40), full(8, 50),
        ];
        let bot = bot_with(sets, vec![card(90, 9), card(91, 7)]);
        let mut rng = rand::thread_rng();
        match bot.decide(&mut rng) {
            // El 7 lo lleva 8 veces en la mano; el 9, ninguna.
            Some(ClientMessage::TakeCard { card_id }) => assert_eq!(card_id, 91),
            other => panic!("esperaba coger la menos mala, fue {other:?}"),
        }
    }

    // La razón de que no cerraran sets: soltar obliga a coger, así que si la
    // prenda que necesitas no está en el centro, sueltas una carta y te llevas
    // otra que tampoco sirve. El ciclo entero suma cero. Lo correcto es esperar.
    #[test]
    fn it_waits_instead_of_trading_junk_for_junk() {
        let sets = vec![
            vec![Some(card(0, 5)), Some(card(1, 5)), Some(card(2, 5)), Some(card(3, 9))],
            mixed(10), mixed(20), mixed(30), mixed(40), mixed(50),
        ];
        // Ni un 5 en el centro: soltar ahora no puede mejorar nada.
        let bot = bot_with(sets, vec![card(90, 2), card(91, 3)]);
        let mut rng = rand::thread_rng();
        assert!(bot.decide(&mut rng).is_none(), "no debería soltar sin ganar nada");
    }

    #[test]
    fn but_it_does_move_when_the_table_would_otherwise_freeze() {
        // Si todos esperan, nadie suelta y el centro no cambia nunca. Pasados
        // unos turnos el bucle llama a force_drop, que sí mueve algo: aquí
        // cambiarse al montón malo, que es el paso previo a soltar de él.
        let sets = vec![
            vec![Some(card(0, 5)), Some(card(1, 5)), Some(card(2, 5)), Some(card(3, 9))],
            mixed(10), mixed(20), mixed(30), mixed(40), mixed(50),
        ];
        let bot = bot_with(sets, vec![card(90, 2), card(91, 3)]);
        let mut rng = rand::thread_rng();
        assert!(matches!(bot.force_drop(&mut rng), Some(ClientMessage::DropCard { .. })));
    }

    #[test]
    fn it_does_drop_when_the_garment_it_needs_is_on_the_table() {
        let sets = vec![
            vec![Some(card(0, 5)), Some(card(1, 5)), Some(card(2, 5)), Some(card(3, 9))],
            mixed(10), mixed(20), mixed(30), mixed(40), mixed(50),
        ];
        let bot = bot_with(sets, vec![card(90, 5)]);
        let mut rng = rand::thread_rng();
        match bot.decide(&mut rng) {
            Some(ClientMessage::DropCard { my_card_index }) => assert_eq!(my_card_index, 3),
            other => panic!("con el 5 en la mesa tenía que soltar el 9, fue {other:?}"),
        }
    }

    // Sin esto un bot no puede ganar jamás: verificar exige los 6 sets
    // volteados, y los bots no volteaban ninguno.
    #[test]
    fn it_shows_a_finished_set() {
        let mut sets = vec![full(5, 0)];
        sets.extend((1..6).map(|i| {
            vec![Some(card(100 + i * 4, 1)), Some(card(101 + i * 4, 2)),
                 Some(card(102 + i * 4, 3)), Some(card(103 + i * 4, 4))]
        }));
        let bot = bot_with(sets, vec![card(90, 9)]);
        let mut rng = rand::thread_rng();
        match bot.decide(&mut rng) {
            Some(ClientMessage::FlipSet { set_index }) => assert_eq!(set_index, 0),
            other => panic!("con un set hecho tenía que enseñarlo, fue {other:?}"),
        }
    }

    #[test]
    fn it_does_not_show_sets_while_it_owes_a_card() {
        // Con deuda lo único que se puede hacer es coger del centro; el
        // servidor rechaza voltear.
        let mut sets = vec![full(5, 0)];
        sets.extend((1..6).map(|_| vec![Some(card(200, 1)), Some(card(201, 1)), None, Some(card(203, 1))]));
        let bot = bot_with(sets, vec![card(90, 1)]);
        let mut rng = rand::thread_rng();
        assert!(matches!(bot.decide(&mut rng), Some(ClientMessage::TakeCard { .. })));
    }

    #[test]
    fn with_all_six_shown_it_asks_to_be_verified() {
        let bot_sets: Vec<Vec<Option<CardInfo>>> =
            (0..6).map(|i| full(i as u8, i * 4)).collect();
        let mut bot = bot_with(bot_sets, vec![card(90, 9)]);
        bot.flipped = [true; 6];
        let mut rng = rand::thread_rng();
        assert!(matches!(bot.decide(&mut rng), Some(ClientMessage::RequestVerification)));

        // Y solo una vez.
        bot.verification_sent = true;
        assert!(!matches!(bot.decide(&mut rng), Some(ClientMessage::RequestVerification)));
    }

    #[test]
    fn a_stunned_bot_sits_still() {
        let mut bot = bot_with(vec![full(1, 0); 6], vec![card(90, 9)]);
        bot.stunned_until = Some(Instant::now() + Duration::from_secs(5));
        let mut rng = rand::thread_rng();
        assert!(bot.decide(&mut rng).is_none());
    }
}

/// Nombre libre para un bot en esa sala. `add_player` rechaza nicknames
/// repetidos, así que no se puede poner el mismo dos veces.
async fn free_bot_name(state: &AppState, lobby_id: &str) -> String {
    let taken: Vec<String> = match state.lobby_manager.get_lobby(lobby_id).await {
        Some(l) => l.players.iter().map(|p| p.nickname.clone()).collect(),
        None => Vec::new(),
    };
    (1..=8)
        .map(|n| format!("🤖 Bot {n}"))
        .find(|name| !taken.contains(name))
        .unwrap_or_else(|| format!("🤖 Bot {}", Uuid::new_v4().simple()))
}

/// Mete un bot en la sala y lo deja jugando. Devuelve su id, para poder
/// echarlo después.
///
/// Devuelve un futuro en caja, y no es un `async fn`, porque hay un ciclo:
/// `spawn_bot` → `run` → `apply` → `handle_client_message` → `spawn_bot` (el
/// handler de `AddBot`). Con `async fn` en todo el recorrido, el tipo del
/// futuro se define en términos de sí mismo y rustc lo rechaza con
/// "cycle detected when computing type of opaque". Meterlo en un `Box<dyn
/// Future>` borra el tipo justo en este borde y corta el ciclo.
pub fn spawn_bot<'a>(
    state: &'a AppState,
    lobby_id: &'a str,
    difficulty: Difficulty,
) -> BoxFuture<'a, Option<Uuid>> {
    Box::pin(spawn_bot_inner(state, lobby_id, difficulty))
}

async fn spawn_bot_inner(
    state: &AppState,
    lobby_id: &str,
    difficulty: Difficulty,
) -> Option<Uuid> {
    let id = Uuid::new_v4();
    let (tx, rx) = mpsc::unbounded_channel::<ServerMessage>();
    // Antes de entrar: si no, el broadcast del propio join no le llegaría.
    state.connections.write().await.insert(id, tx);

    let nickname = free_bot_name(state, lobby_id).await;
    let mut current_lobby = None;
    handle_client_message(
        ClientMessage::JoinLobby {
            lobby_id: lobby_id.to_string(),
            nickname: nickname.clone(),
        },
        id,
        &mut current_lobby,
        state,
    )
    .await;

    if current_lobby.is_none() {
        // No pudo entrar (llena, o ya empezó): no dejar el canal colgado.
        state.connections.write().await.remove(&id);
        return None;
    }

    // Marcarlo como bot: juega por el mismo camino que una persona, pero hay
    // que poder echarlo y enseñarlo marcado.
    if let Some(mut lobby) = state.lobby_manager.get_lobby(lobby_id).await {
        if let Some(p) = lobby.players.iter_mut().find(|p| p.id == id) {
            p.is_bot = true;
            tracing::info!("🤖 {} entró en {} ({:?})", p.nickname, lobby_id, difficulty);
        }
        state.lobby_manager.update_lobby(lobby).await;
    }

    tokio::spawn(run(state.clone(), id, current_lobby, difficulty, rx));
    Some(id)
}

/// Saca un bot de la sala y cierra su canal.
pub async fn remove_bot(state: &AppState, lobby_id: &str, bot_id: Uuid) {
    if let Some(mut lobby) = state.lobby_manager.get_lobby(lobby_id).await {
        lobby.remove_player(&bot_id);
        state.lobby_manager.update_lobby(lobby).await;
    }
    // Al cerrarse el canal, el bucle del bot termina solo.
    state.connections.write().await.remove(&bot_id);
}

/// El bucle del bot: escucha, piensa, actúa.
async fn run(
    state: AppState,
    id: Uuid,
    mut current_lobby: Option<String>,
    difficulty: Difficulty,
    mut rx: mpsc::UnboundedReceiver<ServerMessage>,
) {
    let mut bot = Bot {
        id,
        knobs: difficulty.knobs(),
        sets: Vec::new(),
        center: Vec::new(),
        current_set: 0,
        playing: false,
        stunned_until: None,
        fighting: false,
        last_intent: None,
        flipped: [false; 6],
        verification_sent: false,
    };

    // Dos relojes distintos a propósito.
    //
    // `think` es lo que tarda en decidir una jugada, y es el mando de
    // dificultad. `watch` es mirar si alguien va a por una carta para
    // disputársela, y tiene que ir MUCHO más rápido: la ventana de conflicto
    // son 300 ms, así que comprobándolo al ritmo de `think` (500 ms en
    // difícil) casi nunca cae dentro — dos bots en difícil jugaban 25 s
    // enteros sin pelearse una sola carta por esto.
    let mut think = tokio::time::interval(bot.knobs.think);
    let mut watch = tokio::time::interval(Duration::from_millis(80));
    // Turnos seguidos sin hacer nada, esperando a que salga su prenda.
    let mut idle: u8 = 0;

    loop {
        tokio::select! {
            msg = rx.recv() => {
                let Some(msg) = msg else { return };   // canal cerrado: fuera
                if !apply(&state, &mut bot, &mut current_lobby, msg).await {
                    return;
                }
            }
            _ = watch.tick() => {
                try_contest(&state, &mut bot, &mut current_lobby).await;
            }
            _ = think.tick() => {
                let action = {
                    let mut rng = rand::thread_rng();
                    match bot.decide(&mut rng) {
                        Some(a) => { idle = 0; Some(a) }
                        // Esperando a que salga su prenda. Si lleva demasiado
                        // esperando, suelta igual: con todos esperando nadie
                        // suelta, el centro no cambia y la mesa se para.
                        None => {
                            idle += 1;
                            if idle >= IDLE_TICKS_BEFORE_CHURN {
                                idle = 0;
                                bot.force_drop(&mut rng)
                            } else {
                                None
                            }
                        }
                    }
                };
                let dropped = matches!(action, Some(ClientMessage::DropCard { .. }));
                if let Some(action) = action {
                    handle_client_message(action, id, &mut current_lobby, &state).await;
                }

                // Tapar el hueco es un reflejo, no una decisión: si acaba de
                // soltar, vuelve enseguida en vez de esperar un ciclo entero.
                // Con varios bots eso es casi todo lo que mantiene el centro
                // despejado — cada uno con una carta suelta lo dejaba fijo en
                // 7 u 8 cartas. Y con el plazo de 3 s del servidor, esperar un
                // ciclo entero en fácil le costaría una carta al azar.
                if dropped {
                    sleep(REFLEX_DELAY).await;
                    // Vaciar lo que haya llegado —entre otras cosas el
                    // SwapSuccess del propio drop—: sin esto decidiría con una
                    // mano vieja, en la que todavía no hay hueco.
                    while let Ok(msg) = rx.try_recv() {
                        if !apply(&state, &mut bot, &mut current_lobby, msg).await {
                            return;
                        }
                    }
                    if bot.owes() {
                        let take = {
                            let mut rng = rand::thread_rng();
                            bot.decide(&mut rng)
                        };
                        if let Some(take) = take {
                            handle_client_message(take, id, &mut current_lobby, &state).await;
                        }
                    }
                }
            }
        }
    }
}

/// Actualiza lo que el bot sabe. `false` para terminar.
async fn apply(
    state: &AppState,
    bot: &mut Bot,
    current_lobby: &mut Option<String>,
    msg: ServerMessage,
) -> bool {
    match msg {
        // Los bots se marcan listos solos; arrancar sigue siendo del anfitrión.
        ServerMessage::LobbyUpdate { players, .. } => {
            let me_ready = players.iter()
                .any(|p| p.id == bot.id.to_string() && p.is_ready);
            if !bot.playing && !me_ready {
                sleep(Duration::from_millis(400)).await;
                handle_client_message(
                    ClientMessage::SetReady { ready: true }, bot.id, current_lobby, state).await;
            }
        }
        ServerMessage::GameStart { your_sets, center_cards, current_set, .. } => {
            bot.sets = your_sets;
            bot.center = center_cards;
            bot.current_set = current_set;
            bot.playing = true;
            bot.fighting = false;
            bot.stunned_until = None;
            bot.flipped = [false; 6];
            bot.verification_sent = false;
            bot.last_intent = None;
        }
        // Solo interesan los propios: es lo que dice si ya enseñó ese set.
        ServerMessage::SetFlipped { player, set_index, .. } => {
            let mine = current_lobby.as_deref().map(|lid| (lid.to_string(), player));
            if let Some((lid, who)) = mine {
                if bot_has_nickname(state, &lid, bot.id, &who).await {
                    if let Some(f) = bot.flipped.get_mut(set_index) { *f = true; }
                }
            }
        }
        ServerMessage::VerificationStarted { .. } => bot.verification_sent = true,
        ServerMessage::SetsResynced { your_sets, center_cards } => {
            bot.sets = your_sets;
            bot.center = center_cards;
        }
        ServerMessage::SwapSuccess { set_index, your_new_set, center_cards, .. } => {
            if let Some(set) = your_new_set {
                if let Some(slot) = bot.sets.get_mut(set_index) { *slot = set; }
            }
            bot.center = center_cards;
        }
        ServerMessage::SetSwitched { set_index, .. } => bot.current_set = set_index,
        ServerMessage::GameUpdate { center_cards, .. } => bot.center = center_cards,
        ServerMessage::Stunned { ms } => {
            bot.stunned_until = Some(Instant::now() + Duration::from_millis(ms));
        }
        ServerMessage::SwapConflict { players, .. } => {
            // Solo pelea si es suya. El nickname es lo único que identifica a
            // los participantes en este mensaje.
            let mine = current_lobby.as_deref()
                .map(|lid| (lid.to_string(), players.clone()));
            if let Some((lid, names)) = mine {
                if bot_is_in(state, &lid, bot.id, &names).await {
                    bot.fighting = true;
                    tokio::spawn(spam_clicks(
                        state.clone(), bot.id, lid, bot.knobs.click));
                }
            }
        }
        ServerMessage::QteResolved { .. } => bot.fighting = false,
        ServerMessage::GameOver { .. } | ServerMessage::GameCancelled { .. } => {
            bot.playing = false;
            bot.sets.clear();
            bot.center.clear();
            bot.fighting = false;
            bot.stunned_until = None;
        }
        _ => {}
    }
    true
}

/// ¿Está este bot entre los nombres que pelean?
async fn bot_is_in(state: &AppState, lobby_id: &str, bot_id: Uuid, names: &[String]) -> bool {
    match state.lobby_manager.get_lobby(lobby_id).await {
        Some(l) => l.players.iter()
            .any(|p| p.id == bot_id && names.contains(&p.nickname)),
        None => false,
    }
}

/// ¿Es ese nickname el de este bot? Varios mensajes identifican al jugador por
/// nombre y no por id.
async fn bot_has_nickname(state: &AppState, lobby_id: &str, bot_id: Uuid, name: &str) -> bool {
    match state.lobby_manager.get_lobby(lobby_id).await {
        Some(l) => l.players.iter().any(|p| p.id == bot_id && p.nickname == name),
        None => false,
    }
}

/// Pulsa durante la pelea. El jitter evita que el ritmo sea exacto.
async fn spam_clicks(state: AppState, bot_id: Uuid, lobby_id: String, base: Duration) {
    let mut current = Some(lobby_id.clone());
    for _ in 0..60 {
        let jitter = {
            let mut rng = rand::thread_rng();
            rng.gen_range(0.75..1.25)
        };
        sleep(base.mul_f64(jitter)).await;

        let still = state.lobby_manager.get_lobby(&lobby_id).await
            .and_then(|l| l.game_state.map(|g| g.active_qte.is_some()))
            .unwrap_or(false);
        if !still {
            return;
        }
        handle_client_message(ClientMessage::QteClick, bot_id, &mut current, &state).await;
    }
}

/// Ir a por una carta que otro acaba de tocar, y así provocar una pelea.
/// Devuelve si ha actuado, para que el tick no haga además la jugada normal.
///
/// Se lee `take_intents`, que es donde el servidor ya apunta quién ha ido a por
/// qué dentro de la ventana de 300 ms. Entrar ahí dentro produce una pelea por
/// el mismo camino que usan dos personas: no hace falta protocolo nuevo.
async fn try_contest(state: &AppState, bot: &mut Bot, current_lobby: &mut Option<String>) -> bool {
    if !bot.playing || bot.stunned() || bot.fighting {
        return false;
    }
    let Some(lobby_id) = current_lobby.clone() else { return false };

    let rival_card = {
        let intents = state.take_intents.read().await;
        intents.get(&lobby_id)
            .and_then(|m| m.iter()
                .find(|(_, i)| i.player_id != bot.id)
                .map(|(card_id, _)| *card_id))
    };
    let Some(card_id) = rival_card else {
        bot.last_intent = None;
        return false;
    };

    // Una tirada por carta, no una por comprobación. Esto se mira cada 80 ms y
    // un intento dura 300 ms, así que tirando cada vez salían ~4 tiradas por
    // oportunidad y el 20 % de normal se convertía en un 59 % real. Era por lo
    // que los bots se peleaban por todo.
    if bot.last_intent == Some(card_id) {
        return false;
    }
    bot.last_intent = Some(card_id);

    let go = {
        let mut rng = rand::thread_rng();
        rng.gen_bool(bot.knobs.contest)
    };
    if !go {
        return false;
    }

    // Debiendo una carta ya se puede coger: basta con ir a por la disputada en
    // vez de a por la que le convenía. Es además el caso más frecuente, porque
    // el ciclo normal del bot es soltar y coger.
    if bot.owes() {
        handle_client_message(
            ClientMessage::TakeCard { card_id }, bot.id, current_lobby, state).await;
        return true;
    }

    // Sin deuda hay que soltar primero, igual que una persona.
    let drop = {
        let mut rng = rand::thread_rng();
        bot.decide(&mut rng)
    };
    match drop {
        Some(ClientMessage::DropCard { my_card_index }) => {
            handle_client_message(
                ClientMessage::DropCard { my_card_index }, bot.id, current_lobby, state).await;
            handle_client_message(
                ClientMessage::TakeCard { card_id }, bot.id, current_lobby, state).await;
            true
        }
        // Tocaba cambiar de set: se hace y se intentará pelear en el siguiente
        // tick, en vez de perder el turno.
        Some(other) => {
            handle_client_message(other, bot.id, current_lobby, state).await;
            true
        }
        None => false,
    }
}
