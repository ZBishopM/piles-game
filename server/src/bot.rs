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
            Difficulty::Easy => Knobs {
                think: Duration::from_millis(2500),
                click: Duration::from_millis(320),
                good_choice: 0.50,
                contest: 0.10,
            },
            Difficulty::Normal => Knobs {
                think: Duration::from_millis(1200),
                click: Duration::from_millis(180),
                good_choice: 0.80,
                contest: 0.35,
            },
            Difficulty::Hard => Knobs {
                think: Duration::from_millis(500),
                click: Duration::from_millis(110),
                good_choice: 0.95,
                contest: 0.70,
            },
        }
    }
}

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

    /// El set incompleto más cerca de cerrarse.
    fn best_set(&self) -> Option<usize> {
        (0..self.sets.len())
            .filter(|&i| !self.set_is_done(i))
            .max_by_key(|&i| self.modal(i).map_or(0, |(_, n)| n))
    }

    /// Qué hacer ahora. `None` = esperar.
    fn decide(&self, rng: &mut impl Rng) -> Option<ClientMessage> {
        if !self.playing || self.stunned() || self.fighting {
            return None;
        }
        let well = rng.gen_bool(self.knobs.good_choice);

        // Debiendo una carta no se puede hacer nada más que coger del centro.
        if let Some(hole_set) = self.hole() {
            if self.center.is_empty() {
                return None;
            }
            let want = self.modal(hole_set).map(|(t, _)| t);
            let pick = if well {
                want.and_then(|t| self.center.iter().find(|c| c.clothing_type == t))
                    .or_else(|| self.center.first())
            } else {
                self.center.get(rng.gen_range(0..self.center.len()))
            };
            return pick.map(|c| ClientMessage::TakeCard { card_id: c.id });
        }

        let target = self.best_set()?;
        // DropCard suelta del set que tengas abierto, así que primero hay que
        // cambiarse a él.
        if target != self.current_set {
            return Some(ClientMessage::SwitchSet { set_index: target });
        }

        let keep = self.modal(target).map(|(t, _)| t);
        let set = self.sets.get(target)?;
        let spare = if well {
            // Soltar algo que no sirve para completar este set.
            (0..set.len()).find(|&i| {
                set[i].as_ref().map_or(false, |c| Some(c.clothing_type) != keep)
            })
        } else {
            (0..set.len()).find(|&i| set[i].is_some())
        };
        spare.map(|i| ClientMessage::DropCard { my_card_index: i })
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

    loop {
        tokio::select! {
            msg = rx.recv() => {
                let Some(msg) = msg else { return };   // canal cerrado: fuera
                if !apply(&state, &mut bot, &mut current_lobby, msg).await {
                    return;
                }
            }
            _ = watch.tick() => {
                try_contest(&state, &bot, &mut current_lobby).await;
            }
            _ = think.tick() => {
                let action = {
                    let mut rng = rand::thread_rng();
                    bot.decide(&mut rng)
                };
                if let Some(action) = action {
                    handle_client_message(action, id, &mut current_lobby, &state).await;
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
        }
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
async fn try_contest(state: &AppState, bot: &Bot, current_lobby: &mut Option<String>) -> bool {
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
    let Some(card_id) = rival_card else { return false };

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
