use super::models::{PlayerState, GameState};
use super::deck::{generate_deck, distribute_cards};
use std::collections::{HashMap, HashSet};
use std::ops::{Deref, DerefMut};
use std::sync::Arc;
use tokio::sync::{Mutex as AsyncMutex, OwnedMutexGuard, RwLock};
use uuid::Uuid;
use std::time::{Duration, Instant};

/// Cuánto sobrevive un lobby vacío antes de reciclarse.
const EMPTY_LOBBY_TTL: Duration = Duration::from_secs(30 * 60);

/// Cuánto se le espera a quien se le cae la conexión en plena partida.
///
/// Durante este rato su sitio y sus cartas siguen en la mesa y los demás
/// juegan igual. Al agotarse, la partida se redimensiona a un jugador menos
/// retirando prendas enteras (`deck::retire_types_on_leave`) en vez de borrar
/// sus cartas sueltas, que era lo que dejaba la partida sin solución.
pub const GRACE_PERIOD: Duration = Duration::from_secs(30);

/// Estado de un lobby
#[derive(Debug, Clone, PartialEq)]
pub enum LobbyStatus {
    Waiting,   // Esperando jugadores
    Ready,     // Todos listos, próximo a iniciar
    Playing,   // Juego en progreso
}

/// Información de un jugador en el lobby
#[derive(Debug, Clone)]
pub struct LobbyPlayer {
    pub id: Uuid,
    pub nickname: String,
    pub is_ready: bool,
    /// Hasta cuándo este jugador no puede intercambiar por haber perdido una
    /// pelea de cartas. Es el castigo por perder — y el aviso: no hay ningún
    /// texto que diga "has perdido", se nota porque el tablero se apaga.
    /// Se comprueba en el servidor, así que no basta con tocar el cliente.
    pub stunned_until: Option<Instant>,
    /// Desde cuándo se le cayó la conexión en plena partida. Mientras esté
    /// puesto, su sitio y sus cartas siguen ahí: los demás pueden seguir
    /// jugando y él tiene `GRACE_PERIOD` para volver.
    pub disconnected_at: Option<Instant>,
    /// Es un bot. Para el resto del servidor da igual —juega por el mismo
    /// camino que una persona—, pero hace falta para poder echarlo, para
    /// enseñarlo marcado y para no tratarlo como alguien a quien esperar si se
    /// le "cae" la conexión.
    pub is_bot: bool,
    /// Con qué dificultad juega, si es un bot: su Elo fijo sale de aquí.
    pub bot_level: Option<crate::bot::Difficulty>,
    /// De quién es su Elo (`anon:…` / `sm:…`). No se reenvía a nadie.
    pub rating_key: Option<String>,
    /// Secreto del asiento: lo que demuestra que quien vuelve es quien se
    /// sentó. Lo recibe solo el dueño (y no se graba), y con él recupera el
    /// asiento al instante aunque la conexión vieja siga pareciendo viva.
    ///
    /// Antes el asiento se reclamaba por apodo y solo si el servidor ya había
    /// notado la caída — hasta ~100 s después en un socket muerto, y todos los
    /// reintentos chocaban con "Ya hay alguien llamado…". `None` en los
    /// mirones, que no tienen asiento que recuperar.
    pub seat_token: Option<String>,
}

/// 128 bits aleatorios en hexadecimal.
pub fn new_seat_token() -> String {
    use rand::Rng;
    let bytes: [u8; 16] = rand::thread_rng().gen();
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Cuánto dura el bloqueo tras perder una pelea.
///
/// 3 s en una partida donde un set se completa en segundos es un castigo de
/// verdad. Ceder la carta (`GiveUpCard`) **no** pasa por aquí: quien cede
/// pierde la carta pero no se bloquea ni pierde la racha. Lo que se gana
/// rindiéndose son los segundos que ibas a pasar machacando una pelea perdida;
/// si además costara el bloqueo no lo usaría nadie. Ver `run_qte`.
///
/// Es más corto que `COMBO_WINDOW` (4 s) a propósito: el bloqueo no debe
/// comerse la racha por sí solo, así que perder la corta por regla explícita
/// (ver `break_combo` en websocket.rs).
pub const STUN_DURATION: Duration = Duration::from_secs(3);

/// Cuánto puedes tener una carta soltada sin coger otra.
///
/// Al agotarse, el servidor te asigna una del centro al azar. Existe porque el
/// hueco no cuesta nada mientras no lo tapes: con varios jugadores —y sobre
/// todo con bots— soltando y sin prisa, el centro se quedaba fijo en 7 u 8
/// cartas y dejaba de poder leerse. Además empuja al ritmo que queremos:
/// sueltas y coges, no sueltas y piensas.
///
/// La cuenta se pausa mientras estás bloqueado por perder una pelea: perder ya
/// cuesta la carta y tres segundos parado, y encima una carta al azar sería un
/// tercer castigo por el mismo error.
pub const DEBT_DEADLINE: Duration = Duration::from_secs(3);

/// Representa un lobby de juego
#[derive(Debug, Clone)]
pub struct Lobby {
    pub id: String,
    pub players: Vec<LobbyPlayer>,
    pub max_players: u8,
    pub status: LobbyStatus,
    /// Si sale en la lista de salas abiertas. Las salas son públicas por
    /// defecto; quien hospeda puede marcarla privada y entonces solo se entra
    /// con el código o el QR.
    ///
    /// Hace falta de verdad: `list_available_lobbies` devolvía **todas** las
    /// salas en espera, así que en cuanto el cliente empezara a enseñar la
    /// lista, una sala compartida por QR entre amigos quedaría abierta a
    /// cualquiera sin que nadie lo hubiera pedido.
    pub is_public: bool,
    pub game_state: Option<GameState>,
    /// Quien llegó con la partida ya empezada. Mira, no juega.
    ///
    /// Lista aparte y **no** dentro de `players` a propósito: `players` manda
    /// en el tamaño del mazo, en `is_full`, en el recuento de "listos", en los
    /// rankings y en el umbral que cancela la partida. Meter aquí a un mirón
    /// rompería las cinco cosas a la vez.
    pub spectators: Vec<LobbyPlayer>,
    /// Desde cuándo el lobby está vacío. Se mantiene reutilizable un rato
    /// para que quien se desconecta pueda volver a su misma sala; pasado
    /// `EMPTY_LOBBY_TTL` se recicla.
    pub empty_since: Option<Instant>,
    /// Quién jugaba al empezar la partida, para el Elo. Hace falta aparte de
    /// `players` porque quien se va a mitad desaparece de ahí, y tiene que
    /// contar igual (último).
    pub seats: Vec<crate::elo::Seat>,
}

impl Lobby {
    /// Crea un nuevo lobby. Público por defecto; `set_public` lo cambia.
    pub fn new(lobby_id: String, max_players: u8) -> Self {
        Self {
            id: lobby_id,
            players: Vec::new(),
            max_players: max_players.clamp(2, 8),
            status: LobbyStatus::Waiting,
            is_public: true,
            game_state: None,
            spectators: Vec::new(),
            empty_since: None,
            seats: Vec::new(),
        }
    }

    /// Agrega un jugador al lobby. `true` si entró **mirando**.
    ///
    /// Llegar con la partida empezada ya no es un error: antes devolvía "El
    /// juego ya ha comenzado" y te quedabas fuera mirando una pantalla de
    /// error. Ahora entras igual, sin jugar. Que un espectador le sople cartas
    /// a alguien es un riesgo asumido: esto es para jugar entre amigos.
    pub fn add_player(&mut self, player_id: Uuid, nickname: String) -> Result<bool, String> {
        if self.players.iter().chain(&self.spectators).any(|p| p.nickname == nickname) {
            return Err(format!("Ya hay alguien llamado «{nickname}» en esta sala. Cambia tu nombre en el inicio y vuelve a intentarlo."));
        }

        let nuevo = LobbyPlayer {
            id: player_id,
            nickname,
            is_ready: false,
            stunned_until: None,
            disconnected_at: None,
            is_bot: false,
            bot_level: None,
            rating_key: None,
            seat_token: None,
        };

        // Con partida en curso —o sin sitio en la mesa— se entra a mirar.
        if self.status == LobbyStatus::Playing {
            self.spectators.push(nuevo);
            self.empty_since = None;
            return Ok(true);
        }

        if self.players.len() >= self.max_players as usize {
            return Err("Lobby lleno".to_string());
        }

        let mut nuevo = nuevo;
        nuevo.seat_token = Some(new_seat_token());
        self.players.push(nuevo);
        self.empty_since = None;
        Ok(false)
    }

    /// ¿Está mirando en vez de jugando?
    pub fn is_spectator(&self, player_id: &Uuid) -> bool {
        self.spectators.iter().any(|s| s.id == *player_id)
    }

    /// Los espectadores pasan a jugadores cuando la sala vuelve a estar en
    /// espera. Devuelve a quienes no cupieron, que se quedan fuera.
    ///
    /// Sin esto se quedarían mirando para siempre una sala que ya no juega.
    pub fn promote_spectators(&mut self) -> Vec<LobbyPlayer> {
        let mut fuera = Vec::new();
        for mut s in std::mem::take(&mut self.spectators) {
            if self.players.len() < self.max_players as usize {
                // Ahora tiene asiento, y con él su secreto. Quien llama se lo
                // manda (`send_seat_tokens`): el mirón no tenía ninguno.
                s.seat_token = Some(new_seat_token());
                self.players.push(s);
            } else {
                fuera.push(s);
            }
        }
        if !self.players.is_empty() {
            self.empty_since = None;
        }
        fuera
    }

    /// Marca un jugador como listo
    pub fn set_player_ready(&mut self, player_id: &Uuid, ready: bool) -> Result<(), String> {
        // Con la partida en marcha no hay "listo" que marcar. Sin este corte,
        // un SetReady tardío (el bot, o una pestaña vieja) recalculaba el
        // estado de abajo y devolvía la sala a Waiting en plena partida.
        if self.status == LobbyStatus::Playing {
            return Err("La partida ya empezó".to_string());
        }
        let player = self.players.iter_mut()
            .find(|p| p.id == *player_id)
            .ok_or("Jugador no encontrado")?;

        player.is_ready = ready;

        // Verificar si todos están listos y hay al menos 2 jugadores
        if self.players.len() >= 2 && self.players.iter().all(|p| p.is_ready) {
            self.status = LobbyStatus::Ready;
        } else {
            self.status = LobbyStatus::Waiting;
        }

        Ok(())
    }

    /// Elimina un jugador del lobby (por desconexión o salida)
    /// Devuelve el nickname del jugador eliminado, si existía
    pub fn remove_player(&mut self, player_id: &Uuid) -> Option<String> {
        // Un espectador sale sin más: no tiene cartas, no cuenta para nada y
        // nadie le está esperando.
        if let Some(pos) = self.spectators.iter().position(|s| s.id == *player_id) {
            return Some(self.spectators.remove(pos).nickname);
        }

        let pos = self.players.iter().position(|p| p.id == *player_id)?;
        let nickname = self.players.remove(pos).nickname;

        // Eliminar del game_state si había partida en curso
        if let Some(game) = &mut self.game_state {
            game.players.retain(|p| p.id != *player_id);
        }

        // Un lobby vacío NO se da por terminado: quien se desconecta (o
        // cierra la pestaña sin querer) tiene que poder volver a su misma
        // sala, y los demás tienen que poder seguir entrando con el mismo
        // código. Marcarlo como terminado lo mataba para siempre.
        if self.players.is_empty() {
            self.status = LobbyStatus::Waiting;
            self.game_state = None;
            self.empty_since = Some(Instant::now());
        } else if self.status == LobbyStatus::Ready {
            // Revalidar: si alguien se fue, volver a Waiting
            self.status = LobbyStatus::Waiting;
        }

        Some(nickname)
    }

    /// Inicia el juego y genera el estado inicial
    pub fn start_game(&mut self) -> Result<(), String> {
        if self.status != LobbyStatus::Ready {
            return Err("No todos los jugadores están listos".to_string());
        }

        if self.players.len() < 2 {
            return Err("Se necesitan al menos 2 jugadores".to_string());
        }

        // Generar el mazo
        let num_players = self.players.len() as u8;
        let deck = generate_deck(num_players);
        let (player_sets, center_cards) = distribute_cards(deck, num_players);

        // Crear PlayerState para cada jugador
        let player_states: Vec<PlayerState> = self.players.iter()
            .enumerate()
            .map(|(idx, lobby_player)| {
                PlayerState::new(
                    lobby_player.id,
                    lobby_player.nickname.clone(),
                    player_sets[idx]
                )
            })
            .collect();

        // Crear el estado del juego
        self.game_state = Some(GameState::new(player_states, center_cards.to_vec()));

        // Quién se sienta, para el Elo. Por apodo: al reconectar cambia el id,
        // el apodo no.
        self.seats = self.players.iter().map(|p| crate::elo::Seat {
            nickname: p.nickname.clone(),
            key: p.rating_key.clone(),
            bot: p.bot_level,
            finish: crate::elo::Finish::Left,
        }).collect();

        self.status = LobbyStatus::Playing;

        // Resetear is_ready para que la siguiente ronda no arranque prematuramente
        for player in self.players.iter_mut() {
            player.is_ready = false;
        }

        Ok(())
    }

    /// Los asientos de la partida con cómo acabó cada uno, para el Elo.
    pub fn final_seats(&self) -> Vec<crate::elo::Seat> {
        use crate::elo::Finish;
        let Some(gs) = self.game_state.as_ref() else { return Vec::new() };
        self.seats.iter().map(|s| {
            let finish = match gs.players.iter().find(|p| p.nickname == s.nickname) {
                Some(p) => match p.finished_position {
                    Some(pos) => Finish::Placed(pos),
                    None => Finish::Unfinished(p.count_completed_sets()),
                },
                None => Finish::Left,
            };
            crate::elo::Seat { finish, ..s.clone() }
        }).collect()
    }

    /// Bloquea a un jugador tras perder una pelea.
    pub fn stun_player(&mut self, player_id: &Uuid) {
        self.stun_player_for(player_id, STUN_DURATION);
    }

    /// Bloquea durante un rato concreto. El frenesí bloquea menos que perder
    /// una pelea, y nunca acorta un bloqueo que ya estuviera corriendo.
    pub fn stun_player_for(&mut self, player_id: &Uuid, how_long: Duration) {
        if let Some(p) = self.players.iter_mut().find(|p| p.id == *player_id) {
            let hasta = Instant::now() + how_long;
            p.stunned_until = Some(match p.stunned_until {
                Some(ya) if ya > hasta => ya,
                _ => hasta,
            });
        }
    }

    /// Si sigue bloqueado, cuánto le queda. `None` si ya puede jugar.
    pub fn stun_remaining(&self, player_id: &Uuid) -> Option<Duration> {
        let until = self.players.iter()
            .find(|p| p.id == *player_id)?
            .stunned_until?;
        until.checked_duration_since(Instant::now())
    }

    /// Se le cayó la conexión en plena partida. No se le quita el sitio ni las
    /// cartas: los demás siguen jugando y él tiene `GRACE_PERIOD` para volver.
    /// Devuelve su nickname, para poder avisar a la mesa.
    pub fn mark_disconnected(&mut self, player_id: &Uuid) -> Option<String> {
        let p = self.players.iter_mut().find(|p| p.id == *player_id)?;
        p.disconnected_at = Some(Instant::now());
        p.is_ready = false;
        Some(p.nickname.clone())
    }

    /// Recupera un asiento **y sus cartas** con su secreto.
    ///
    /// Hay que reasignar el id porque la identidad de un jugador es el uuid de
    /// su socket, y al reconectar el socket es otro. Antes esto pasaba por
    /// `remove_player` + `add_player`, que es justo lo que le borraba las
    /// cartas. Devuelve el id viejo, que es el que hay que limpiar de las
    /// conexiones.
    ///
    /// Se busca por secreto y no por apodo, y **no** se exige que el servidor
    /// haya notado ya la caída: un socket muerto puede parecer vivo durante
    /// minutos, y quien vuelve no tiene por qué esperar a que se entere.
    pub fn rebind_seat(&mut self, token: &str, new_id: Uuid) -> Option<Uuid> {
        if token.is_empty() {
            return None;
        }
        let p = self.players.iter_mut()
            .find(|p| p.seat_token.as_deref() == Some(token))?;
        let old_id = p.id;
        p.id = new_id;
        p.disconnected_at = None;

        if let Some(game) = &mut self.game_state {
            if let Some(ps) = game.players.iter_mut().find(|ps| ps.id == old_id) {
                ps.id = new_id;
            }
            // Si estaba en una pelea, su identidad también vive ahí.
            for qte in game.active_qtes.iter_mut() {
                for (id, _) in qte.participants.iter_mut() {
                    if *id == old_id { *id = new_id; }
                }
                if let Some(clicks) = qte.clicks.remove(&old_id) {
                    qte.clicks.insert(new_id, clicks);
                }
            }
        }
        Some(old_id)
    }

    /// Cuántos siguen con conexión. Por debajo de 2 no hay partida posible.
    pub fn connected_count(&self) -> usize {
        self.players.iter().filter(|p| p.disconnected_at.is_none()).count()
    }

    /// Cuenta cuántos jugadores están listos
    pub fn ready_count(&self) -> usize {
        self.players.iter().filter(|p| p.is_ready).count()
    }

    /// Verifica si el lobby está lleno
    pub fn is_full(&self) -> bool {
        self.players.len() >= self.max_players as usize
    }
}

/// Alfabeto de los códigos de lobby. Excluye I, O, 0 y 1 para que nadie
/// tenga que adivinar entre caracteres parecidos al dictar un código.
pub const LOBBY_CODE_CHARSET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
pub const LOBBY_CODE_LEN: usize = 6;

/// Valida un código con el mismo alfabeto que lo genera — un `[A-Z0-9]{6}`
/// aceptaría I/O/0/1, que nunca se generan.
pub fn is_valid_lobby_code(code: &str) -> bool {
    code.len() == LOBBY_CODE_LEN
        && code.bytes().all(|b| LOBBY_CODE_CHARSET.contains(&b))
}

/// Gestor de lobbies global
pub struct LobbyManager {
    lobbies: Arc<RwLock<HashMap<String, Lobby>>>,
    /// Un candado por sala para las transacciones (ver `LobbyManager::txn`).
    txn_locks: std::sync::Mutex<HashMap<String, Arc<AsyncMutex<()>>>>,
}

/// Una sala en préstamo para leerla, cambiarla y devolverla **sin que nadie
/// más la toque entretanto** (ver `LobbyManager::txn`).
///
/// Se usa como una `Lobby` (`Deref`/`DerefMut`). `commit` la devuelve y suelta
/// el candado; si se descarta sin `commit` (un `return` temprano), el candado
/// también se suelta y no se escribe nada.
pub struct LobbyTxn {
    lobby: Lobby,
    lobbies: Arc<RwLock<HashMap<String, Lobby>>>,
    _guard: OwnedMutexGuard<()>,
}

impl Deref for LobbyTxn {
    type Target = Lobby;
    fn deref(&self) -> &Lobby { &self.lobby }
}
impl DerefMut for LobbyTxn {
    fn deref_mut(&mut self) -> &mut Lobby { &mut self.lobby }
}

impl LobbyTxn {
    /// Escribe los cambios. Solo si la sala sigue existiendo: una sala cerrada
    /// entretanto no resucita.
    pub async fn commit(self) {
        let LobbyTxn { lobby, lobbies, _guard } = self;
        let mut lobbies = lobbies.write().await;
        if let Some(slot) = lobbies.get_mut(&lobby.id) {
            *slot = lobby;
        }
    }

    /// Escribe los cambios **sin soltar** la sala: el candado sigue hasta que la
    /// transacción se descarte (al acabar el bloque).
    ///
    /// Es lo que hay que usar cuando a continuación se mandan los mensajes del
    /// cambio. Si se suelta antes, dos jugadas seguidas pueden notificarse al
    /// revés —la segunda envía su aviso antes de que la primera envíe el suyo— y
    /// los clientes se quedan con el centro de la jugada VIEJA: una carta
    /// pintada que ya no existe ("no me deja coger esta carta"). Enviar dentro
    /// del candado hace que el orden de los avisos sea el de los cambios.
    ///
    /// Con la transacción abierta solo se puede mandar mensajes (`send_to_player`,
    /// `broadcast_to_lobby`) o lanzar tareas; abrir otra transacción de la misma
    /// sala se esperaría a sí mismo.
    pub async fn save(&mut self) {
        let mut lobbies = self.lobbies.write().await;
        if let Some(slot) = lobbies.get_mut(&self.lobby.id) {
            *slot = self.lobby.clone();
        }
    }

    /// Como `commit`, pero devuelve la sala escrita para seguir usándola.
    pub async fn commit_keep(self) -> Lobby {
        let LobbyTxn { lobby, lobbies, _guard } = self;
        {
            let mut lobbies = lobbies.write().await;
            if let Some(slot) = lobbies.get_mut(&lobby.id) {
                *slot = lobby.clone();
            }
        }
        lobby
    }
}

impl LobbyManager {
    pub fn new() -> Self {
        Self {
            lobbies: Arc::new(RwLock::new(HashMap::new())),
            txn_locks: std::sync::Mutex::new(HashMap::new()),
        }
    }

    /// El candado de transacciones de una sala. Siempre se coge ANTES que el de
    /// `lobbies`, y nunca dentro de otra transacción de la misma sala (un
    /// `tokio::Mutex` no es reentrante: se quedaría esperándose a sí mismo).
    async fn txn_guard(&self, lobby_id: &str) -> OwnedMutexGuard<()> {
        let lock = {
            let mut locks = self.txn_locks.lock().unwrap_or_else(|e| e.into_inner());
            locks.entry(lobby_id.to_string()).or_default().clone()
        };
        lock.lock_owned().await
    }

    /// Lee la sala para cambiarla y devolverla. **Es la única forma de escribir
    /// una sala entera**: `get_lobby` + volcar una copia hacía que dos mensajes
    /// a la vez se pisaran —el segundo en escribir borraba lo del primero—, y
    /// así se perdió una jugada: dos personas soltaron una carta en el mismo
    /// milisegundo y una de las dos se quedó con una deuda que el servidor ya
    /// no tenía. Aquí el segundo espera a que el primero termine.
    ///
    /// Mientras se tiene la transacción solo debe hacerse trabajo síncrono y
    /// mandar mensajes (`send_to_player`): llamar a otra cosa que abra una
    /// transacción de la misma sala (`txn`, `mutate`, `join_lobby`) se queda
    /// esperando para siempre. Para cambios pequeños, `mutate`.
    pub async fn txn(&self, lobby_id: &str) -> Option<LobbyTxn> {
        let guard = self.txn_guard(lobby_id).await;
        let lobby = self.get_lobby(lobby_id).await?;
        Some(LobbyTxn { lobby, lobbies: self.lobbies.clone(), _guard: guard })
    }

    /// Genera un ID único para un lobby (código de 6 caracteres)
    fn generate_lobby_id() -> String {
        use rand::Rng;
        let mut rng = rand::thread_rng();

        (0..LOBBY_CODE_LEN)
            .map(|_| {
                let idx = rng.gen_range(0..LOBBY_CODE_CHARSET.len());
                LOBBY_CODE_CHARSET[idx] as char
            })
            .collect()
    }

    /// Crea un nuevo lobby
    pub async fn create_lobby(&self, max_players: u8, is_public: bool) -> String {
        self.reap_stale_lobbies().await;
        let lobby_id = Self::generate_lobby_id();
        let mut lobby = Lobby::new(lobby_id.clone(), max_players);
        lobby.is_public = is_public;

        let mut lobbies = self.lobbies.write().await;
        lobbies.insert(lobby_id.clone(), lobby);

        lobby_id
    }

    /// Obtiene un lobby por su ID
    pub async fn get_lobby(&self, lobby_id: &str) -> Option<Lobby> {
        let lobbies = self.lobbies.read().await;
        lobbies.get(lobby_id).cloned()
    }

    /// Escribe una copia entera. Solo para pruebas: en el código normal se
    /// escribe con `txn` + `commit` o con `mutate`, que no se pisan entre sí.
    #[cfg(test)]
    pub async fn update_lobby(&self, lobby: Lobby) {
        let mut lobbies = self.lobbies.write().await;
        lobbies.insert(lobby.id.clone(), lobby);
    }

    /// Modifica un lobby **dentro** del candado.
    ///
    /// `get_lobby` + `update_lobby` es sacar una copia y volcarla entera, así
    /// que dos mensajes a la vez se pisan: el segundo en volcar borra lo que
    /// escribió el primero. Da igual casi siempre porque los mensajes van
    /// espaciados — menos durante una pelea, donde el rival manda un
    /// `qte_click` cada pocas decenas de milisegundos. Ceder la carta se perdía
    /// ahí: escribías `conceded_by` y el siguiente click del otro lo borraba.
    ///
    /// Úsalo para cualquier cambio pequeño que compita con otro.
    pub async fn mutate<T>(&self, lobby_id: &str, f: impl FnOnce(&mut Lobby) -> T) -> Option<T> {
        // Con el candado de las transacciones: si no, un `mutate` en mitad de
        // una transacción abierta quedaba borrado cuando ésta escribía.
        let _guard = self.txn_guard(lobby_id).await;
        let mut lobbies = self.lobbies.write().await;
        lobbies.get_mut(lobby_id).map(f)
    }

    /// Agrega un jugador a un lobby
    /// `live` son los player_id que todavía tienen socket abierto.
    ///
    /// Al recargar la página el socket nuevo puede llegar antes de que el
    /// servidor termine de limpiar el viejo, y entonces el jugador chocaba
    /// con su propio nombre ("Nickname ya en uso") y no podía volver a su
    /// sala. Si el que ocupa el nombre ya no tiene conexión, cede el sitio.
    /// A un jugador conectado no se le puede echar así.
    pub async fn join_lobby(
        &self,
        lobby_id: &str,
        player_id: Uuid,
        nickname: String,
        live: &HashSet<Uuid>,
    ) -> Result<(Lobby, bool), String> {
        let _guard = self.txn_guard(lobby_id).await;
        let mut lobbies = self.lobbies.write().await;
        let lobby = lobbies.get_mut(lobby_id)
            .ok_or("Lobby no encontrado")?;

        // Solo fuera de partida. En partida un asiento sin conexión no está
        // abandonado: está esperando a su dueño, que vuelve con su secreto
        // (`rebind_seat`), y quitárselo a quien solo comparte el apodo es
        // borrarle las cartas.
        if lobby.status != LobbyStatus::Playing {
            let abandoned: Vec<Uuid> = lobby.players.iter().chain(&lobby.spectators)
                .filter(|p| p.nickname == nickname && !live.contains(&p.id))
                .map(|p| p.id)
                .collect();
            for stale_id in abandoned {
                lobby.remove_player(&stale_id);
            }
        }

        let mirando = lobby.add_player(player_id, nickname)?;
        Ok((lobby.clone(), mirando))
    }

    /// Todas las salas, públicas y privadas. Para `/api/estado`.
    pub async fn all_lobbies(&self) -> Vec<Lobby> {
        self.lobbies.read().await.values().cloned().collect()
    }

    /// Salas a las que se puede entrar desde la lista pública: en espera, no
    /// llenas, marcadas como públicas y con alguien dentro. Las privadas y las
    /// vacías existen igual (una vacía se guarda para que quien se cayó
    /// vuelva), solo que hay que saber su código.
    pub async fn list_available_lobbies(&self) -> Vec<Lobby> {
        let lobbies = self.lobbies.read().await;
        lobbies.values()
            .filter(|l| l.is_public && l.status == LobbyStatus::Waiting && !l.is_full()
                && !l.players.is_empty())
            .cloned()
            .collect()
    }

    /// Para la partida rápida: la sala pública **más llena** a la que se pueda
    /// entrar. Se llenan salas antes que repartir gente entre varias medio
    /// vacías, que es como nadie llega nunca al mínimo de 2.
    pub async fn fullest_open_lobby(&self) -> Option<String> {
        let lobbies = self.lobbies.read().await;
        lobbies.values()
            .filter(|l| l.is_public && l.status == LobbyStatus::Waiting && !l.is_full())
            .max_by_key(|l| l.players.len())
            .map(|l| l.id.clone())
    }

    /// Cierra una sala del todo (deja de existir también por código).
    pub async fn remove_lobby(&self, lobby_id: &str) {
        self.lobbies.write().await.remove(lobby_id);
        self.txn_locks.lock().unwrap_or_else(|e| e.into_inner()).remove(lobby_id);
    }

    /// Recicla los lobbies que llevan vacíos más de `EMPTY_LOBBY_TTL`.
    /// Se llama al crear uno nuevo en vez de con una tarea de fondo: los
    /// lobbies vacíos no molestan a nadie, solo hay que evitar que se
    /// acumulen indefinidamente.
    async fn reap_stale_lobbies(&self) {
        let mut lobbies = self.lobbies.write().await;
        lobbies.retain(|_, lobby| match lobby.empty_since {
            Some(since) => since.elapsed() < EMPTY_LOBBY_TTL,
            None => true,
        });
        // Y los candados de las salas que ya no existen.
        self.txn_locks.lock().unwrap_or_else(|e| e.into_inner())
            .retain(|id, _| lobbies.contains_key(id));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_lobby() {
        let lobby = Lobby::new("TEST123".to_string(), 4);
        assert_eq!(lobby.id, "TEST123");
        assert_eq!(lobby.max_players, 4);
        assert_eq!(lobby.status, LobbyStatus::Waiting);
        assert_eq!(lobby.players.len(), 0);
    }

    #[test]
    fn test_add_player() {
        let mut lobby = Lobby::new("TEST123".to_string(), 4);
        let player_id = Uuid::new_v4();

        let result = lobby.add_player(player_id, "Player1".to_string());
        assert!(result.is_ok());
        assert_eq!(lobby.players.len(), 1);
        assert_eq!(lobby.players[0].nickname, "Player1");
    }

    // 2026-09-05: al quedarse vacío el lobby se marcaba Finished, y
    // add_player() rechaza todo lo que no esté en Waiting. Resultado: quien
    // hospedaba y se desconectaba un momento no podía volver a su sala ni
    // marcar Listo, y nadie más podía entrar con ese código — la sala moría
    // en cuanto su creador se quedaba solo y perdía la conexión.
    #[test]
    fn empty_lobby_stays_joinable() {
        let mut lobby = Lobby::new("TEST123".to_string(), 4);
        let host = Uuid::new_v4();
        lobby.add_player(host, "Host".to_string()).unwrap();

        lobby.remove_player(&host);

        assert!(lobby.players.is_empty());
        assert_eq!(lobby.status, LobbyStatus::Waiting, "un lobby vacío tiene que seguir siendo reutilizable");
        assert!(lobby.empty_since.is_some(), "hay que fechar cuándo quedó vacío para poder reciclarlo");
        assert!(lobby.add_player(Uuid::new_v4(), "Host".to_string()).is_ok());
        assert!(lobby.empty_since.is_none(), "al volver a entrar alguien deja de estar vacío");
    }

    #[tokio::test]
    async fn rejoin_reclaims_an_abandoned_seat_but_never_a_live_one() {
        let manager = LobbyManager::new();
        let lobby_id = manager.create_lobby(4, true).await;
        let ghost = Uuid::new_v4();
        let alive = Uuid::new_v4();
        let no_one = HashSet::new();
        manager.join_lobby(&lobby_id, ghost, "Ana".to_string(), &no_one).await.unwrap();
        manager.join_lobby(&lobby_id, alive, "Beto".to_string(), &no_one).await.unwrap();

        // Solo `alive` conserva socket: Ana recargó la página.
        let live: HashSet<Uuid> = [alive].into_iter().collect();

        let reconnected = Uuid::new_v4();
        let (lobby, _) = manager.join_lobby(&lobby_id, reconnected, "Ana".to_string(), &live).await
            .expect("volver a entrar con el propio nombre tras recargar");
        assert_eq!(lobby.players.len(), 2, "Ana recupera su sitio en vez de duplicarse");
        assert!(lobby.players.iter().any(|p| p.id == reconnected));
        assert!(!lobby.players.iter().any(|p| p.id == ghost));

        // A alguien que sigue conectado no se le puede quitar el sitio.
        let impostor = Uuid::new_v4();
        let live: HashSet<Uuid> = [alive, reconnected].into_iter().collect();
        assert!(manager.join_lobby(&lobby_id, impostor, "Beto".to_string(), &live).await.is_err());
    }

    /// El fallo del botón de ceder la carta, en pequeño: mientras tú te rindes,
    /// el rival está machacando clicks. Cada click leía una copia de la sala y
    /// la volcaba entera, así que el primer click posterior a tu rendición la
    /// borraba y la pelea seguía como si nada.
    #[tokio::test]
    async fn a_click_does_not_undo_a_concession() {
        let manager = LobbyManager::new();
        let lobby_id = manager.create_lobby(4, true).await;
        let ana = Uuid::new_v4();
        let beto = Uuid::new_v4();
        manager.join_lobby(&lobby_id, ana, "Ana".to_string(), &HashSet::new()).await.unwrap();
        manager.join_lobby(&lobby_id, beto, "Beto".to_string(), &HashSet::new()).await.unwrap();
        manager.mutate(&lobby_id, |l| {
            l.status = LobbyStatus::Ready;
            l.start_game().unwrap();
            l.game_state.as_mut().unwrap().active_qtes.push(crate::game::QteState {
                participants: vec![(ana, "Ana".into()), (beto, "Beto".into())],
                card_id: 7,
                clicks: std::collections::HashMap::new(),
                conceded_by: None,
            });
        }).await.unwrap();

        // Ana cede, y Beto sigue machacando: los dos pasan por `mutate`, que es
        // lo que hacen los manejadores de verdad.
        manager.mutate(&lobby_id, |l| {
            l.game_state.as_mut().unwrap().active_qtes[0].conceded_by = Some(ana);
        }).await.unwrap();
        for _ in 0..5 {
            manager.mutate(&lobby_id, |l| {
                let q = &mut l.game_state.as_mut().unwrap().active_qtes[0];
                *q.clicks.entry(beto).or_insert(0) += 1;
            }).await.unwrap();
        }

        let qte = manager.get_lobby(&lobby_id).await.unwrap()
            .game_state.unwrap().active_qtes.remove(0);
        assert_eq!(qte.conceded_by, Some(ana),
                   "los clicks del rival borraron la rendición");
        assert_eq!(qte.clicks.get(&beto), Some(&5), "y sus clicks siguen contando");
    }

    /// Y por qué no vale `get_lobby` + `update_lobby` para esto: deja claro,
    /// con la secuencia exacta, que volcar una copia entera borra lo que otro
    /// escribió mientras tanto. Si algún día alguien vuelve a ese patrón en el
    /// camino de la pelea, esto explica lo que va a pasar.
    #[tokio::test]
    async fn writing_back_a_whole_clone_loses_concurrent_changes() {
        let manager = LobbyManager::new();
        let lobby_id = manager.create_lobby(4, true).await;
        manager.join_lobby(&lobby_id, Uuid::new_v4(), "Ana".to_string(), &HashSet::new())
            .await.unwrap();

        let copia = manager.get_lobby(&lobby_id).await.unwrap();   // copia vieja
        manager.mutate(&lobby_id, |l| l.max_players = 7).await.unwrap();
        manager.update_lobby(copia).await;                         // se vuelca encima

        assert_ne!(manager.get_lobby(&lobby_id).await.unwrap().max_players, 7,
                   "si esto deja de perderse, `mutate` ya no hace falta");
    }

    /// Una sala con dos jugadores y la partida ya en marcha.
    fn playing_lobby() -> (Lobby, Uuid, Uuid) {
        let mut lobby = Lobby::new("TEST123".to_string(), 4);
        let a = Uuid::new_v4();
        let b = Uuid::new_v4();
        lobby.add_player(a, "Ana".to_string()).unwrap();
        lobby.add_player(b, "Beto".to_string()).unwrap();
        lobby.set_player_ready(&a, true).unwrap();
        lobby.set_player_ready(&b, true).unwrap();
        lobby.start_game().unwrap();
        (lobby, a, b)
    }

    // Llegar tarde ya no es un error: se entra a mirar.
    #[test]
    fn joining_a_running_match_makes_you_a_spectator() {
        let (mut lobby, _, _) = playing_lobby();
        let mirón = Uuid::new_v4();

        assert_eq!(lobby.add_player(mirón, "Caro".to_string()), Ok(true),
                   "con la partida en curso se entra mirando");
        assert!(lobby.is_spectator(&mirón));
        assert_eq!(lobby.players.len(), 2, "el mirón NO se sienta a la mesa");
        assert_eq!(lobby.game_state.as_ref().unwrap().players.len(), 2,
                   "ni entra en la partida: el mazo ya está repartido");
    }

    // Lo que hace peligroso meter espectadores en `players`: cuentan para el
    // aforo y para el "todos listos", y arrancarían partidas que no deben.
    #[test]
    fn spectators_count_for_nothing() {
        let mut lobby = Lobby::new("TEST123".to_string(), 2);
        let a = Uuid::new_v4();
        let b = Uuid::new_v4();
        lobby.add_player(a, "Ana".to_string()).unwrap();
        lobby.add_player(b, "Beto".to_string()).unwrap();
        lobby.set_player_ready(&a, true).unwrap();
        lobby.set_player_ready(&b, true).unwrap();
        lobby.start_game().unwrap();

        lobby.add_player(Uuid::new_v4(), "Caro".to_string()).unwrap();
        assert!(lobby.is_full(), "el aforo lo marcan los jugadores, no los mirones");
        assert_eq!(lobby.ready_count(), 0, "un mirón no cuenta como listo");
    }

    // Si no, se quedarían mirando para siempre una sala que ya no juega.
    #[test]
    fn spectators_sit_down_when_the_match_ends() {
        let (mut lobby, _, _) = playing_lobby();
        let mirón = Uuid::new_v4();
        lobby.add_player(mirón, "Caro".to_string()).unwrap();

        lobby.status = LobbyStatus::Waiting;
        assert!(lobby.promote_spectators().is_empty(), "hay sitio para los tres");
        assert!(!lobby.is_spectator(&mirón));
        assert!(lobby.players.iter().any(|p| p.id == mirón));
    }

    // La mesa llena manda: no se echa a nadie para hacerle sitio a un mirón.
    #[test]
    fn spectators_with_no_seat_are_left_out() {
        let mut lobby = Lobby::new("TEST123".to_string(), 2);
        let a = Uuid::new_v4();
        let b = Uuid::new_v4();
        lobby.add_player(a, "Ana".to_string()).unwrap();
        lobby.add_player(b, "Beto".to_string()).unwrap();
        lobby.set_player_ready(&a, true).unwrap();
        lobby.set_player_ready(&b, true).unwrap();
        lobby.start_game().unwrap();
        let mirón = Uuid::new_v4();
        lobby.add_player(mirón, "Caro".to_string()).unwrap();

        lobby.status = LobbyStatus::Waiting;
        let fuera = lobby.promote_spectators();
        assert_eq!(fuera.len(), 1);
        assert_eq!(fuera[0].id, mirón);
        assert_eq!(lobby.players.len(), 2);
    }

    // Salir mirando no es abandonar: no hay cartas que retirar ni a quien
    // esperar, así que la partida ni se entera.
    #[test]
    fn a_spectator_leaving_does_not_touch_the_match() {
        let (mut lobby, _, _) = playing_lobby();
        let mirón = Uuid::new_v4();
        lobby.add_player(mirón, "Caro".to_string()).unwrap();

        assert_eq!(lobby.remove_player(&mirón), Some("Caro".to_string()));
        assert!(lobby.spectators.is_empty());
        assert_eq!(lobby.status, LobbyStatus::Playing, "la partida sigue");
        assert_eq!(lobby.game_state.as_ref().unwrap().players.len(), 2);
    }

    // Perder una pelea bloquea unos segundos. Es el único aviso de que has
    // perdido —no hay texto—, así que tiene que aplicarse de verdad en el
    // servidor y no solo pintarse en el cliente.
    #[test]
    fn losing_a_fight_stuns_only_the_loser() {
        let mut lobby = Lobby::new("TEST123".to_string(), 4);
        let winner = Uuid::new_v4();
        let loser = Uuid::new_v4();
        lobby.add_player(winner, "Ana".to_string()).unwrap();
        lobby.add_player(loser, "Beto".to_string()).unwrap();

        assert!(lobby.stun_remaining(&loser).is_none(), "nadie empieza bloqueado");

        lobby.stun_player(&loser);

        let left = lobby.stun_remaining(&loser).expect("el perdedor queda bloqueado");
        assert!(left <= STUN_DURATION && left > Duration::from_millis(500));
        assert!(lobby.stun_remaining(&winner).is_none(), "al ganador no se le bloquea");
    }

    #[test]
    fn an_unknown_player_is_never_stunned() {
        let mut lobby = Lobby::new("TEST123".to_string(), 4);
        lobby.add_player(Uuid::new_v4(), "Ana".to_string()).unwrap();
        // Que no entre en pánico ni bloquee a nadie por un id que no existe.
        lobby.stun_player(&Uuid::new_v4());
        assert!(lobby.stun_remaining(&Uuid::new_v4()).is_none());
    }

    // Lo que motivó todo el mecanismo de abandono: al caerse la conexión en
    // plena partida, el jugador NO pierde sus cartas. Antes se le quitaba del
    // game_state y con él sus 24 cartas, y como cada prenda tiene exactamente
    // 4, eso dejaba ~20 prendas imposibles de completar para los que seguían.
    #[test]
    fn a_disconnect_keeps_the_seat_and_the_cards() {
        let mut lobby = Lobby::new("TEST123".to_string(), 4);
        let ana = Uuid::new_v4();
        let beto = Uuid::new_v4();
        lobby.add_player(ana, "Ana".to_string()).unwrap();
        lobby.add_player(beto, "Beto".to_string()).unwrap();
        lobby.set_player_ready(&ana, true).unwrap();
        lobby.set_player_ready(&beto, true).unwrap();
        lobby.start_game().unwrap();

        let cards_before = lobby.game_state.as_ref().unwrap()
            .players.iter().find(|p| p.id == ana).unwrap().sets;

        assert_eq!(lobby.mark_disconnected(&ana).as_deref(), Some("Ana"));
        assert_eq!(lobby.connected_count(), 1, "Ana ya no cuenta como conectada");
        assert_eq!(lobby.players.len(), 2, "pero su sitio sigue ahí");
        assert!(lobby.game_state.is_some(), "la partida no se cancela");

        // Vuelve con otro socket, así que con otro uuid, y con su secreto.
        let ana_again = Uuid::new_v4();
        let token = lobby.players.iter().find(|p| p.id == ana).unwrap()
            .seat_token.clone().expect("quien se sienta tiene secreto");
        let old = lobby.rebind_seat(&token, ana_again).expect("recupera su sitio");
        assert_eq!(old, ana);
        assert_eq!(lobby.connected_count(), 2);

        let ps = lobby.game_state.as_ref().unwrap()
            .players.iter().find(|p| p.id == ana_again)
            .expect("el PlayerState se reasigna al uuid nuevo");
        assert_eq!(ps.sets, cards_before, "sus cartas siguen siendo las mismas");
        assert!(!lobby.players.iter().any(|p| p.id == ana), "el uuid viejo no se queda");
    }

    // Lo que esto protege: antes `list_available_lobbies` devolvía TODAS las
    // salas en espera, así que la sala que compartes por QR con tus amigos
    // habría salido en la lista pública para cualquiera.
    #[tokio::test]
    async fn a_private_lobby_never_shows_in_the_public_list() {
        let manager = LobbyManager::new();
        let no_one = HashSet::new();
        let open = manager.create_lobby(4, true).await;
        let secret = manager.create_lobby(4, false).await;
        manager.join_lobby(&open, Uuid::new_v4(), "Ana".to_string(), &no_one).await.unwrap();
        manager.join_lobby(&secret, Uuid::new_v4(), "Beto".to_string(), &no_one).await.unwrap();

        let listed: Vec<String> = manager.list_available_lobbies().await
            .into_iter().map(|l| l.id).collect();

        assert!(listed.contains(&open));
        assert!(!listed.contains(&secret), "una sala privada no se anuncia");
        // Pero sigue existiendo: con el código se entra igual.
        assert!(manager.get_lobby(&secret).await.is_some());
    }

    // 2026-09-28, visto en beta: el bot recibía un LobbyUpdate, esperaba
    // 400 ms y mandaba SetReady; si la partida empezaba en esa espera, el
    // SetReady llegaba con la sala en Playing y la devolvía a Waiting. La
    // partida seguía, pero la sala volvía a anunciarse como abierta, la
    // grabación se cerraba como "abandoned" y las desconexiones dejaban de
    // tratarse como caídas en partida.
    #[test]
    fn set_ready_during_a_match_changes_nothing() {
        let mut lobby = Lobby::new("TEST123".to_string(), 4);
        let ana = Uuid::new_v4();
        let bot = Uuid::new_v4();
        lobby.add_player(ana, "Ana".to_string()).unwrap();
        lobby.add_player(bot, "Bot".to_string()).unwrap();
        lobby.set_player_ready(&ana, true).unwrap();
        lobby.set_player_ready(&bot, true).unwrap();
        lobby.start_game().unwrap();
        assert_eq!(lobby.status, LobbyStatus::Playing);

        assert!(lobby.set_player_ready(&bot, true).is_err(), "en partida no hay nada que marcar");
        assert!(lobby.set_player_ready(&ana, false).is_err());
        assert_eq!(lobby.status, LobbyStatus::Playing, "la partida sigue siendo una partida");
    }

    // El Elo cuenta a todos los que se sentaron: quien terminó por su puesto,
    // quien no por sus sets, y quien se fue a mitad al final — aunque ya no
    // esté en `players`.
    #[test]
    fn final_seats_cover_everyone_who_sat_down() {
        use crate::elo::Finish;
        let mut lobby = Lobby::new("TEST123".to_string(), 4);
        let (ana, beto, caro, bot) = (Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4());
        for (id, n) in [(ana, "Ana"), (beto, "Beto"), (caro, "Caro"), (bot, "Bot")] {
            lobby.add_player(id, n.to_string()).unwrap();
        }
        lobby.players[0].rating_key = Some("anon:x".into());
        lobby.players[3].is_bot = true;
        lobby.players[3].bot_level = Some(crate::bot::Difficulty::Hard);
        for id in [ana, beto, caro, bot] {
            lobby.set_player_ready(&id, true).unwrap();
        }
        lobby.start_game().unwrap();

        lobby.game_state.as_mut().unwrap().find_player_mut(&ana).unwrap().finished_position = Some(1);
        lobby.remove_player(&caro);   // se fue a mitad

        let seats = lobby.final_seats();
        assert_eq!(seats.len(), 4, "Caro también cuenta");
        let de = |n: &str| seats.iter().find(|s| s.nickname == n).unwrap();
        assert_eq!(de("Ana").finish, Finish::Placed(1));
        assert_eq!(de("Ana").key.as_deref(), Some("anon:x"));
        assert!(matches!(de("Beto").finish, Finish::Unfinished(_)));
        assert_eq!(de("Caro").finish, Finish::Left);
        assert_eq!(de("Bot").bot, Some(crate::bot::Difficulty::Hard));
        assert_eq!(crate::elo::pool(&seats), crate::elo::Pool::Fun);
    }

    // Una sala vacía se guarda un rato para que quien se cayó vuelva con el
    // código, pero anunciarla en la lista pública es invitar a entrar a una
    // sala donde no hay nadie.
    #[tokio::test]
    async fn an_empty_lobby_is_kept_but_not_listed() {
        let manager = LobbyManager::new();
        let no_one = HashSet::new();
        let id = manager.create_lobby(4, true).await;
        let ana = Uuid::new_v4();
        manager.join_lobby(&id, ana, "Ana".to_string(), &no_one).await.unwrap();
        assert_eq!(manager.list_available_lobbies().await.len(), 1);

        let mut lobby = manager.get_lobby(&id).await.unwrap();
        lobby.remove_player(&ana);
        manager.update_lobby(lobby).await;

        assert!(manager.list_available_lobbies().await.is_empty(), "vacía: fuera de la lista");
        assert!(manager.get_lobby(&id).await.is_some(), "pero se puede volver con el código");
    }

    #[tokio::test]
    async fn quick_match_fills_the_busiest_room_first() {
        // Repartir gente entre salas medio vacías es como nadie llega nunca a
        // los 2 jugadores que hacen falta para empezar.
        let manager = LobbyManager::new();
        let no_one = HashSet::new();
        let quiet = manager.create_lobby(4, true).await;
        let busy = manager.create_lobby(4, true).await;
        manager.join_lobby(&busy, Uuid::new_v4(), "Ana".to_string(), &no_one).await.unwrap();
        manager.join_lobby(&busy, Uuid::new_v4(), "Beto".to_string(), &no_one).await.unwrap();
        manager.join_lobby(&quiet, Uuid::new_v4(), "Cris".to_string(), &no_one).await.unwrap();

        assert_eq!(manager.fullest_open_lobby().await.as_deref(), Some(busy.as_str()));

        // Y una privada nunca se ofrece para partida rápida.
        let manager = LobbyManager::new();
        manager.create_lobby(4, false).await;
        assert!(manager.fullest_open_lobby().await.is_none());
        let _ = quiet;
    }

    // 2026-09-30, beta: tras un corte de red el servidor tardó ~100 s en notar
    // que la conexión vieja había muerto, y mientras tanto cada reintento de la
    // misma persona chocaba con su propio apodo. El asiento se recupera con el
    // secreto, no con el apodo, y no hace falta que el servidor ya se haya
    // enterado de la caída.
    #[test]
    fn a_seat_is_taken_back_with_its_secret_even_if_the_old_socket_looks_alive() {
        let mut lobby = Lobby::new("TEST123".to_string(), 4);
        let (ana, beto) = (Uuid::new_v4(), Uuid::new_v4());
        lobby.add_player(ana, "Ana".to_string()).unwrap();
        lobby.add_player(beto, "Beto".to_string()).unwrap();
        let token = lobby.players[0].seat_token.clone().unwrap();

        // Sin `mark_disconnected`: para el servidor Ana sigue conectada.
        let nuevo = Uuid::new_v4();
        assert_eq!(lobby.rebind_seat(&token, nuevo), Some(ana));
        assert_eq!(lobby.players[0].id, nuevo);
        assert_eq!(lobby.players[0].nickname, "Ana");
        // El uuid viejo ya no es de nadie: su cierre posterior no toca nada.
        assert!(lobby.mark_disconnected(&ana).is_none());
        assert!(lobby.remove_player(&ana).is_none());
    }

    #[test]
    fn a_nickname_is_not_a_key() {
        let mut lobby = Lobby::new("TEST123".to_string(), 4);
        let ana = Uuid::new_v4();
        lobby.add_player(ana, "Ana".to_string()).unwrap();

        // Ni con el apodo, ni con un secreto inventado, ni vacío.
        assert!(lobby.rebind_seat("Ana", Uuid::new_v4()).is_none());
        assert!(lobby.rebind_seat(&new_seat_token(), Uuid::new_v4()).is_none());
        assert!(lobby.rebind_seat("", Uuid::new_v4()).is_none());
        assert_eq!(lobby.players[0].id, ana, "el asiento no se movió");
    }

    #[test]
    fn every_seat_has_its_own_secret_and_spectators_have_none() {
        let mut lobby = Lobby::new("TEST123".to_string(), 4);
        lobby.add_player(Uuid::new_v4(), "Ana".to_string()).unwrap();
        lobby.add_player(Uuid::new_v4(), "Beto".to_string()).unwrap();
        let (a, b) = (lobby.players[0].seat_token.clone().unwrap(), lobby.players[1].seat_token.clone().unwrap());
        assert_ne!(a, b);
        assert_eq!(a.len(), 32, "128 bits en hexadecimal");

        lobby.set_player_ready(&lobby.players[0].id.clone(), true).unwrap();
        lobby.set_player_ready(&lobby.players[1].id.clone(), true).unwrap();
        lobby.start_game().unwrap();
        let mirón = Uuid::new_v4();
        assert_eq!(lobby.add_player(mirón, "Caro".to_string()), Ok(true));
        assert!(lobby.spectators[0].seat_token.is_none(), "un mirón no tiene asiento que recuperar");
    }

    // La expulsión por apodo de un asiento "sin conexión" es para una sala en
    // espera. En partida ese asiento espera a su dueño con las cartas dentro.
    #[tokio::test]
    async fn in_a_match_a_namesake_does_not_evict_a_dropped_seat() {
        let manager = LobbyManager::new();
        let id = manager.create_lobby(4, true).await;
        let (ana, beto) = (Uuid::new_v4(), Uuid::new_v4());
        let todos: HashSet<Uuid> = [ana, beto].into_iter().collect();
        manager.join_lobby(&id, ana, "Ana".to_string(), &todos).await.unwrap();
        manager.join_lobby(&id, beto, "Beto".to_string(), &todos).await.unwrap();
        manager.mutate(&id, |l| {
            l.set_player_ready(&ana, true).unwrap();
            l.set_player_ready(&beto, true).unwrap();
            l.start_game().unwrap();
            l.mark_disconnected(&ana);
        }).await.unwrap();

        // Ana ya no tiene conexión (no está en `live`), y alguien más escribe «Ana».
        let solo_beto: HashSet<Uuid> = [beto].into_iter().collect();
        let intruso = manager.join_lobby(&id, Uuid::new_v4(), "Ana".to_string(), &solo_beto).await;
        assert!(intruso.is_err(), "el apodo sigue siendo de Ana");
        let lobby = manager.get_lobby(&id).await.unwrap();
        assert!(lobby.players.iter().any(|p| p.id == ana), "su asiento sigue ahí");
        assert!(lobby.game_state.as_ref().unwrap().players.iter().any(|p| p.id == ana),
                "y sus cartas también");
    }

    // En espera el asiento abandonado sí cede el apodo (recarga con el socket
    // nuevo llegando antes de que el servidor limpie el viejo).
    #[tokio::test]
    async fn while_waiting_an_abandoned_seat_still_yields_its_nickname() {
        let manager = LobbyManager::new();
        let id = manager.create_lobby(4, true).await;
        let vieja = Uuid::new_v4();
        let ninguna = HashSet::new();
        manager.join_lobby(&id, vieja, "Ana".to_string(), &ninguna).await.unwrap();
        assert!(manager.join_lobby(&id, Uuid::new_v4(), "Ana".to_string(), &ninguna).await.is_ok());
    }

    #[test]
    fn test_lobby_full() {
        let mut lobby = Lobby::new("TEST123".to_string(), 2);

        lobby.add_player(Uuid::new_v4(), "Player1".to_string()).unwrap();
        lobby.add_player(Uuid::new_v4(), "Player2".to_string()).unwrap();

        assert!(lobby.is_full());

        let result = lobby.add_player(Uuid::new_v4(), "Player3".to_string());
        assert!(result.is_err());
    }

    #[test]
    fn test_ready_status() {
        let mut lobby = Lobby::new("TEST123".to_string(), 2);
        let player1_id = Uuid::new_v4();
        let player2_id = Uuid::new_v4();

        lobby.add_player(player1_id, "Player1".to_string()).unwrap();
        lobby.add_player(player2_id, "Player2".to_string()).unwrap();

        assert_eq!(lobby.status, LobbyStatus::Waiting);

        lobby.set_player_ready(&player1_id, true).unwrap();
        assert_eq!(lobby.status, LobbyStatus::Waiting);

        lobby.set_player_ready(&player2_id, true).unwrap();
        assert_eq!(lobby.status, LobbyStatus::Ready);
    }

    #[test]
    fn test_start_game() {
        let mut lobby = Lobby::new("TEST123".to_string(), 2);
        let player1_id = Uuid::new_v4();
        let player2_id = Uuid::new_v4();

        lobby.add_player(player1_id, "Player1".to_string()).unwrap();
        lobby.add_player(player2_id, "Player2".to_string()).unwrap();
        lobby.set_player_ready(&player1_id, true).unwrap();
        lobby.set_player_ready(&player2_id, true).unwrap();

        let result = lobby.start_game();
        assert!(result.is_ok());
        assert_eq!(lobby.status, LobbyStatus::Playing);
        assert!(lobby.game_state.is_some());

        let game_state = lobby.game_state.unwrap();
        assert_eq!(game_state.players.len(), 2);
        assert_eq!(game_state.center_cards.len(), 4);
    }

    // ── Transacciones: dos mensajes a la vez no se pisan ──────────────────

    /// El fallo de la partida del 2026-10-02: dos personas soltaron una carta en
    /// el mismo milisegundo y una de las dos jugadas se perdió (cada una leía una
    /// copia de la sala y la última en escribir borraba lo de la otra). Un bot se
    /// quedó 6 minutos pidiendo cartas que el servidor ya no le debía.
    /// Aquí, 200 tareas a la vez, cada una sienta a alguien: si una se pisa, faltan.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn concurrent_transactions_do_not_overwrite_each_other() {
        let manager = Arc::new(LobbyManager::new());
        let id = manager.create_lobby(8, true).await;
        // `Lobby::new` limita a 8: aquí hacen falta muchos más sentados.
        manager.mutate(&id, |l| l.max_players = 255).await.unwrap();
        let mut tareas = Vec::new();
        for i in 0..200 {
            let (m, id) = (manager.clone(), id.clone());
            tareas.push(tokio::spawn(async move {
                let mut txn = m.txn(&id).await.unwrap();
                // Un cambio de tarea justo en mitad: ahí se colaban las otras.
                tokio::task::yield_now().await;
                txn.add_player(Uuid::new_v4(), format!("p{i}")).unwrap();
                txn.commit().await;
            }));
        }
        for t in tareas { t.await.unwrap(); }
        assert_eq!(manager.get_lobby(&id).await.unwrap().players.len(), 200);
    }

    /// `mutate` y `txn` comparten candado: un `mutate` a mitad de una transacción
    /// abierta no queda borrado cuando ésta escribe.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn mutate_and_transactions_do_not_overwrite_each_other() {
        let manager = Arc::new(LobbyManager::new());
        let id = manager.create_lobby(8, true).await;
        // `Lobby::new` limita a 8: aquí hacen falta muchos más sentados.
        manager.mutate(&id, |l| l.max_players = 255).await.unwrap();
        let mut tareas = Vec::new();
        for i in 0..100 {
            let (m1, id1) = (manager.clone(), id.clone());
            tareas.push(tokio::spawn(async move {
                let mut txn = m1.txn(&id1).await.unwrap();
                tokio::task::yield_now().await;
                txn.add_player(Uuid::new_v4(), format!("t{i}")).unwrap();
                txn.commit().await;
            }));
            let (m2, id2) = (manager.clone(), id.clone());
            tareas.push(tokio::spawn(async move {
                m2.mutate(&id2, |l| { l.add_player(Uuid::new_v4(), format!("m{i}")).unwrap(); }).await.unwrap();
            }));
        }
        for t in tareas { t.await.unwrap(); }
        assert_eq!(manager.get_lobby(&id).await.unwrap().players.len(), 200);
    }

    /// Un `return` a medias (la transacción se descarta sin `commit`) no escribe
    /// nada y no deja la sala bloqueada.
    #[tokio::test]
    async fn a_dropped_transaction_writes_nothing_and_frees_the_room() {
        let manager = LobbyManager::new();
        let id = manager.create_lobby(4, true).await;
        {
            let mut txn = manager.txn(&id).await.unwrap();
            txn.add_player(Uuid::new_v4(), "Ana".to_string()).unwrap();
        }
        assert!(manager.get_lobby(&id).await.unwrap().players.is_empty());
        let otra = tokio::time::timeout(Duration::from_millis(500), manager.txn(&id)).await;
        assert!(otra.is_ok(), "la sala quedó bloqueada tras descartar la transacción");
    }

    /// Una sala cerrada mientras alguien tenía la transacción no resucita al escribir.
    #[tokio::test]
    async fn committing_to_a_closed_room_does_not_bring_it_back() {
        let manager = LobbyManager::new();
        let id = manager.create_lobby(4, true).await;
        let mut txn = manager.txn(&id).await.unwrap();
        txn.add_player(Uuid::new_v4(), "Ana".to_string()).unwrap();
        manager.remove_lobby(&id).await;
        txn.commit().await;
        assert!(manager.get_lobby(&id).await.is_none());
    }

    /// Transacciones de salas distintas no se esperan entre sí.
    #[tokio::test]
    async fn transactions_of_different_rooms_do_not_block_each_other() {
        let manager = LobbyManager::new();
        let a = manager.create_lobby(4, true).await;
        let b = manager.create_lobby(4, true).await;
        let _ta = manager.txn(&a).await.unwrap();
        let tb = tokio::time::timeout(Duration::from_millis(500), manager.txn(&b)).await;
        assert!(tb.is_ok(), "la sala B esperó a la A");
    }
}
