use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, State},
    response::Response,
};
use futures::{sink::SinkExt, stream::StreamExt};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::{mpsc, RwLock};
use tokio::time::{sleep, Duration};
use uuid::Uuid;

use crate::game::{
    LobbyManager, ClientMessage, ServerMessage, PlayerInfo, LobbyInfo, CardInfo,
    LobbyStatus, PlayerProgress, Card, RankingEntry, STUN_DURATION, set_to_info,
    COMBO_WINDOW, COMBO_BASE_X100, COMBO_GAIN_FIGHT_WON_X100, COMBO_GAIN_SET_DONE_X100,
    FRENZY_STUN,
    get_clothing_name,
};
use crate::game::lobby::{DEBT_DEADLINE, GRACE_PERIOD};

/// Tipo para enviar mensajes a un cliente específico
type ClientSender = mpsc::UnboundedSender<ServerMessage>;

/// Alguien ha ido a por una carta del centro y estamos dentro de la ventana
/// en la que otro puede ir a por la misma.
#[derive(Debug, Clone)]
pub struct TakeIntent {
    /// `pub(crate)` para que un bot pueda ver que alguien va a por una carta y
    /// decidir si se la pelea. Es el mismo camino que usan dos personas.
    pub(crate) player_id: Uuid,
    nickname: String,
    timestamp: Instant,
}

/// Participante en una pelea. Dónde va la carta lo dice su propio
/// `owed_slot`, así que aquí no hace falta nada más.
#[derive(Debug, Clone)]
struct QtePlayerData {
    player_id: Uuid,
    nickname: String,
}

/// Ventana para considerar que dos jugadores van a por la misma carta.
const CONFLICT_WINDOW: Duration = Duration::from_millis(300);

/// Cada cuánto se mira si una conexión lleva demasiado callada.
const IDLE_CHECK: Duration = Duration::from_secs(5);
/// Cuánto silencio se aguanta EN PARTIDA antes de dar la conexión por caída.
/// Ver el bucle de `handle_socket` para de dónde sale el número.
const IDLE_IN_GAME: Duration = Duration::from_secs(20);

/// Estado compartido de la aplicación
#[derive(Clone)]
pub struct AppState {
    pub lobby_manager: Arc<LobbyManager>,
    /// Mapa de player_id -> sender para broadcast
    pub connections: Arc<RwLock<HashMap<Uuid, ClientSender>>>,
    /// Intentos de coger carta: lobby_id -> card_id -> TakeIntent
    pub take_intents: Arc<RwLock<HashMap<String, HashMap<u32, TakeIntent>>>>,
    /// Grabador de partidas. Siempre activo: es la función, no una opción.
    pub rec: Arc<crate::record::Recorder>,
    /// El Elo de todos. Ver `ratings.rs`.
    pub ratings: Arc<crate::ratings::Ratings>,
    /// Partidas que se están grabando ahora mismo: lobby -> estado.
    pub grabando: Arc<RwLock<HashMap<String, RecState>>>,
    /// Cuándo se oyó por última vez a cada conexión. Candado normal y no
    /// `RwLock` de tokio: se toca en cada mensaje, nunca a través de un await.
    pub last_seen: Arc<std::sync::Mutex<HashMap<Uuid, Instant>>>,
    /// Jugadores cuyo tablero no cuadraba con el del servidor en la última
    /// muestra: el desajuste solo se da por bueno si se repite (ver
    /// `check_desync`).
    pub desync_seen: Arc<std::sync::Mutex<HashMap<Uuid, DesyncSeen>>>,
    /// Desde cuándo corre el servidor. Para `/api/estado`.
    pub started: Instant,
}

/// Un desajuste visto una vez, a la espera de volver a verse.
pub struct DesyncSeen {
    diff: crate::debug::StateDiff,
    at: Instant,
    reported: bool,
}

/// Lo que hace falta saber de una partida mientras se graba.
pub struct RecState {
    /// Fichero al que va.
    pub file: String,
    /// Arranque, para el desplazamiento en ms de cada línea.
    pub t0: Instant,
    /// Última vez que se guardó un fotograma clave.
    pub last_key: Instant,
    /// Quién es quién. Se muestra el **nickname**, no el uuid: al reconectar,
    /// `rebind_seat` le cambia el uuid a media partida (y `rec_rebind` apunta
    /// el nuevo aquí) y el mismo jugador aparecería partido en dos.
    pub nicks: HashMap<Uuid, String>,
}

/// Cada cuánto se guarda el estado entero.
const KEYFRAME_EVERY: Duration = Duration::from_millis(2000);

/// Lo que dura una pelea. Estaba escrito a mano en tres sitios —el estado, el
/// mensaje que lo anuncia y el bucle que lo cuenta—, así que cambiarlo pedía
/// acertar los tres.
const QTE_MS: u64 = 3000;
/// Cada cuánto se manda el marcador durante la pelea.
const QTE_TICK_MS: u64 = 500;

impl AppState {
    pub fn new() -> Self {
        Self {
            lobby_manager: Arc::new(LobbyManager::new()),
            connections: Arc::new(RwLock::new(HashMap::new())),
            take_intents: Arc::new(RwLock::new(HashMap::new())),
            rec: Arc::new(crate::record::Recorder::new(
                std::path::PathBuf::from("recordings"),
            )),
            ratings: Arc::new(crate::ratings::Ratings::load(
                std::path::PathBuf::from("ratings.json"),
            )),
            grabando: Arc::new(RwLock::new(HashMap::new())),
            last_seen: Arc::new(std::sync::Mutex::new(HashMap::new())),
            desync_seen: Arc::new(std::sync::Mutex::new(HashMap::new())),
            started: Instant::now(),
        }
    }

    /// Cierra las grabaciones de partidas que ya no existen.
    ///
    /// No todas las partidas acaban por la puerta: si todo el mundo cierra la
    /// pestaña a la vez —medido: los cuatro en el mismo milisegundo—, cada
    /// desconexión ve a los otros tres todavía dentro, nadie cruza el umbral
    /// que cancela la partida, y el fichero se quedaría abierto para siempre.
    /// Esto lo recoge unos segundos después.
    pub fn spawn_recording_sweeper(&self) {
        let state = self.clone();
        tokio::spawn(async move {
            loop {
                sleep(Duration::from_secs(5)).await;
                let abiertas: Vec<String> = state.grabando.read().await.keys().cloned().collect();
                for lobby_id in abiertas {
                    let viva = state.lobby_manager.get_lobby(&lobby_id).await
                        .is_some_and(|l| l.status == LobbyStatus::Playing
                                         && l.game_state.is_some());
                    if !viva {
                        state.rec_close(&lobby_id, "abandoned").await;
                    }
                }
            }
        });
    }

    /// Envía un mensaje a todos los jugadores de un lobby
    async fn broadcast_to_lobby(&self, lobby_id: &str, message: ServerMessage) {
        if let Some(lobby) = self.lobby_manager.get_lobby(lobby_id).await {
            // Se graba aquí, en el cuello de botella, y no en cada sitio que
            // manda algo: así un mensaje nuevo queda grabado sin que nadie
            // tenga que acordarse. Y `get_lobby` ya devuelve una copia entera
            // del estado, así que el fotograma clave sale gratis.
            self.rec_broadcast(lobby_id, &lobby, &message).await;

            let connections = self.connections.read().await;

            // Los espectadores reciben lo mismo que la sala, y solo eso: como
            // nunca pasan por `send_to_player`, no les llega ninguna mano
            // privada. El filtro lo hace la forma del protocolo, no un `if`.
            for player in lobby.players.iter().chain(&lobby.spectators) {
                if let Some(sender) = connections.get(&player.id) {
                    let _ = sender.send(message.clone());
                }
            }
        }
    }

    /// Envía un mensaje a un jugador específico
    async fn send_to_player(&self, player_id: &Uuid, message: ServerMessage) {
        self.rec_private(player_id, &message).await;
        let connections = self.connections.read().await;
        if let Some(sender) = connections.get(player_id) {
            let _ = sender.send(message);
        }
    }
}

// ─── Grabación ────────────────────────────────────────────────────────────
//
// Todo lo de aquí es infalible a propósito: se traga sus errores y nunca
// devuelve nada que haya que comprobar. Grabar no puede romper una partida.

impl AppState {
    /// Empieza a grabar. Se llama justo al arrancar la partida, antes de
    /// mandarle a cada uno su `GameStart`, para que esos mensajes privados
    /// —que traen la mano de cada jugador— entren en el fichero.
    async fn rec_open(&self, lobby_id: &str, lobby: &crate::game::Lobby) {
        let Some(gs) = lobby.game_state.as_ref() else { return };

        let started_ms = crate::record::now_ms();
        let file = format!("{started_ms}-{lobby_id}.jsonl");

        // El mapa de cartas va en la cabecera y no se deduce: `generate_deck`
        // baraja y recorta las prendas, así que `id / 4` NO es la prenda. Sin
        // este mapa una grabación no se puede dibujar.
        let mut cards = serde_json::Map::new();
        let mut anota = |c: &crate::game::Card| {
            cards.insert(
                c.id.to_string(),
                serde_json::json!({ "c": c.clothing_type,
                                    "n": crate::game::get_clothing_name(c.clothing_type) }),
            );
        };
        for c in &gs.center_cards { anota(c); }
        for p in &gs.players {
            for set in &p.sets {
                for c in set.iter().flatten() { anota(c); }
            }
        }

        let nicks: HashMap<Uuid, String> =
            gs.players.iter().map(|p| (p.id, p.nickname.clone())).collect();

        let cabecera = serde_json::json!({
            "t": "header", "v": 1,
            "lobby": lobby_id,
            "started_ms": started_ms,
            "players": gs.players.iter().map(|p| serde_json::json!({
                "nick": p.nickname,
                "bot": lobby.players.iter().any(|lp| lp.id == p.id && lp.is_bot),
            })).collect::<Vec<_>>(),
            "cards": cards,
        });
        self.rec.open(&file, format!("{cabecera}\n"));

        let ahora = Instant::now();
        self.grabando.write().await.insert(lobby_id.to_string(), RecState {
            file,
            t0: ahora,
            // Se fuerza el primero: `last_key` muy atrás.
            last_key: ahora - KEYFRAME_EVERY * 2,
            nicks,
        });
    }

    /// Un mensaje que va a toda la sala, más el fotograma clave si toca.
    async fn rec_broadcast(&self, lobby_id: &str, lobby: &crate::game::Lobby, msg: &ServerMessage) {
        let mut mapa = self.grabando.write().await;
        let Some(est) = mapa.get_mut(lobby_id) else { return };

        // `GameOver` obliga a guardar estado: una línea después, en
        // `game_state = None`, ya no hay nada que guardar.
        let final_de_partida = matches!(msg, ServerMessage::GameOver { .. });
        if final_de_partida || est.last_key.elapsed() >= KEYFRAME_EVERY {
            if let Some(gs) = lobby.game_state.as_ref() {
                // Quién está conectado y cuánto lleva callado cada uno: la
                // mitad de lo que hace falta para entender una caída, y no se
                // veía en ninguna parte de la grabación.
                let conn: serde_json::Map<String, serde_json::Value> = {
                    let vistos = self.last_seen.lock().map(|v| v.clone()).unwrap_or_default();
                    lobby.players.iter().map(|p| (p.nickname.clone(), serde_json::json!({
                        "ok": p.disconnected_at.is_none(),
                        "silencio_ms": vistos.get(&p.id).map(|t| t.elapsed().as_millis() as u64),
                    }))).collect()
                };
                let linea = keyframe_json(gs, est.t0.elapsed().as_millis() as u64, conn);
                self.rec.line(&est.file, linea);
                est.last_key = Instant::now();
            }
        }

        let linea = serde_json::json!({
            "t": "out",
            "ms": est.t0.elapsed().as_millis() as u64,
            "w": crate::record::now_ms(),
            "m": msg,
        });
        self.rec.line(&est.file, format!("{linea}\n"));
    }

    /// Un mensaje que va a UNA persona. Es la mitad que ningún cliente puede
    /// grabar por su cuenta, y por eso esto vive en el servidor.
    async fn rec_private(&self, player_id: &Uuid, msg: &ServerMessage) {
        // El secreto del asiento NO se graba: `/api/recordings` es público y
        // se puede leer con la partida en curso, así que un secreto ahí sería
        // regalar el asiento a quien mire la lista.
        if matches!(msg, ServerMessage::SeatToken { .. }) {
            return;
        }
        let mapa = self.grabando.read().await;
        // El mapa tiene una entrada por partida en curso: buscar ahí es más
        // barato que mantener un índice jugador→sala aparte.
        let Some(est) = mapa.values().find(|e| e.nicks.contains_key(player_id)) else { return };
        let linea = serde_json::json!({
            "t": "out",
            "ms": est.t0.elapsed().as_millis() as u64,
            "w": crate::record::now_ms(),
            "to": est.nicks.get(player_id),
            "m": msg,
        });
        self.rec.line(&est.file, format!("{linea}\n"));
    }

    /// Lo que MANDA un jugador: la "línea de tiempo de acciones". "¿Llegó mi
    /// toque?" es la mitad de cualquier fallo que se compare con un vídeo del
    /// móvil, y los bots pasan por aquí también, así que sus decisiones quedan
    /// grabadas gratis.
    async fn rec_in(&self, player_id: &Uuid, msg: &ClientMessage) {
        let mapa = self.grabando.read().await;
        let Some(est) = mapa.values().find(|e| e.nicks.contains_key(player_id)) else { return };
        // Sin el secreto del asiento (ver `rec_private`).
        let mut m = serde_json::to_value(msg).unwrap_or_default();
        if let Some(obj) = m.as_object_mut() {
            obj.remove("seat_token");
        }
        let linea = serde_json::json!({
            "t": "in",
            "ms": est.t0.elapsed().as_millis() as u64,
            "w": crate::record::now_ms(),
            "from": est.nicks.get(player_id),
            "m": m,
        });
        self.rec.line(&est.file, format!("{linea}\n"));
    }

    /// Quien recupera su asiento llega con otro uuid; sin esto sus mensajes
    /// dejaban de grabarse en cuanto volvía.
    async fn rec_rebind(&self, old: &Uuid, new: &Uuid) {
        let mut mapa = self.grabando.write().await;
        for est in mapa.values_mut() {
            if let Some(nick) = est.nicks.get(old).cloned() {
                est.nicks.insert(*new, nick);
            }
        }
    }

    /// El ping que informa el propio cliente. Es lo que dice si una pelea se
    /// perdió por lentitud de dedos o de red.
    async fn rec_ping(&self, player_id: &Uuid, rtt_ms: u32) {
        let mapa = self.grabando.read().await;
        let Some(est) = mapa.values().find(|e| e.nicks.contains_key(player_id)) else { return };
        let linea = serde_json::json!({
            "t": "ping",
            "ms": est.t0.elapsed().as_millis() as u64,
            "player": est.nicks.get(player_id),
            "rtt": rtt_ms,
        });
        self.rec.line(&est.file, format!("{linea}\n"));
    }

    /// Una línea que NO es un mensaje sino algo que pasó en el servidor: una
    /// conexión que se cierra, la gracia que empieza, un desajuste. Es lo que
    /// faltaba para contar una caída sin ir al log de pm2 (que va en UTC, con
    /// colores y mezclado con todas las salas).
    ///
    /// `t` es el tipo de línea (`conn`, `desync`…); `extra` va tal cual dentro.
    async fn rec_line_lobby(&self, lobby_id: &str, t: &str, extra: serde_json::Value) {
        let mapa = self.grabando.read().await;
        let Some(est) = mapa.get(lobby_id) else { return };
        self.rec_line_est(est, t, extra, None);
    }

    /// Lo mismo, para una conexión: busca su sala y añade el apodo.
    async fn rec_line_player(&self, player_id: &Uuid, t: &str, extra: serde_json::Value) {
        let mapa = self.grabando.read().await;
        let Some(est) = mapa.values().find(|e| e.nicks.contains_key(player_id)) else { return };
        self.rec_line_est(est, t, extra, est.nicks.get(player_id));
    }

    fn rec_line_est(&self, est: &RecState, t: &str, extra: serde_json::Value, player: Option<&String>) {
        let mut linea = serde_json::json!({
            "t": t,
            "ms": est.t0.elapsed().as_millis() as u64,
            "w": crate::record::now_ms(),
        });
        if let Some(obj) = linea.as_object_mut() {
            if let Some(nick) = player {
                obj.insert("player".into(), serde_json::Value::String(nick.clone()));
            }
            if let Some(e) = extra.as_object() {
                for (k, v) in e {
                    obj.insert(k.clone(), v.clone());
                }
            }
        }
        self.rec.line(&est.file, format!("{linea}\n"));
    }

    /// Cierra la grabación. Hay que llamarlo por los DOS caminos por los que
    /// acaba una partida —final normal y cancelación—: si falta uno, ese
    /// fichero se queda abierto para siempre. Es idempotente.
    async fn rec_close(&self, lobby_id: &str, reason: &str) {
        let Some(est) = self.grabando.write().await.remove(lobby_id) else { return };
        let linea = serde_json::json!({
            "t": "end",
            "ms": est.t0.elapsed().as_millis() as u64,
            "w": crate::record::now_ms(),
            "reason": reason,
        });
        self.rec.line(&est.file, format!("{linea}\n"));
        self.rec.close(&est.file);
    }
}

/// El estado de verdad en un instante, con las cartas por id.
///
/// Sirve para dos cosas, y la segunda es la importante: además de poder saltar
/// a cualquier punto sin rehacer la partida entera, el visor puede comparar lo
/// que reconstruyó con esto. Si no cuadra, acaba de encontrar un fallo.
fn keyframe_json(
    gs: &crate::game::models::GameState,
    ms: u64,
    conn: serde_json::Map<String, serde_json::Value>,
) -> String {
    let jugadores: serde_json::Map<String, serde_json::Value> = gs.players.iter()
        .map(|p| (p.nickname.clone(), serde_json::json!({
            "sets": p.sets.iter().map(|s| s.iter()
                    .map(|c| c.map(|c| c.id)).collect::<Vec<_>>()).collect::<Vec<_>>(),
            "cur": p.current_set_index,
            "flip": p.flipped_sets,
            "owed": p.owed_slot,
            "mult": p.combo_multiplier_x100(),
            "pts": p.combo_points,
            "frenzy": p.frenzy_ready,
            "fin": p.finished_position,
            "verif": p.is_verifying,
        })))
        .collect();

    let linea = serde_json::json!({
        "t": "key",
        "ms": ms,
        "w": crate::record::now_ms(),
        "center": gs.center_cards.iter().map(|c| c.id).collect::<Vec<_>>(),
        "players": jugadores,
        "conn": conn,
        "qtes": gs.active_qtes.iter().map(|q| serde_json::json!({
            "card": q.card_id,
            "players": q.participants.iter().map(|(_, n)| n).collect::<Vec<_>>(),
        })).collect::<Vec<_>>(),
    });
    format!("{linea}\n")
}

/// Handler para el upgrade de WebSocket
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> Response {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

/// Maneja una conexión WebSocket individual
async fn handle_socket(socket: WebSocket, state: AppState) {
    let (mut ws_sender, mut ws_receiver) = socket.split();

    let player_id = Uuid::new_v4();
    let mut current_lobby: Option<String> = None;

    println!("🔌 Nuevo cliente WebSocket conectado: {}", player_id);

    // Crear canal para este jugador
    let (tx, mut rx) = mpsc::unbounded_channel::<ServerMessage>();

    // Registrar la conexión
    {
        let mut connections = state.connections.write().await;
        connections.insert(player_id, tx.clone());
    }

    // Tarea para enviar mensajes desde el canal al WebSocket
    let send_task = tokio::spawn(async move {
        while let Some(message) = rx.recv().await {
            if let Ok(text) = serde_json::to_string(&message) {
                if ws_sender.send(Message::Text(text)).await.is_err() {
                    break;
                }
            }
        }
    });

    // Enviar mensaje de bienvenida
    let welcome_msg = ServerMessage::LobbyList {
        lobbies: state.lobby_manager.list_available_lobbies().await
            .into_iter()
            .map(|l| LobbyInfo {
                id: l.id,
                player_count: l.players.len(),
                max_players: l.max_players,
            })
            .collect(),
    };
    let _ = tx.send(welcome_msg);

    // Loop principal de mensajes del cliente.
    //
    // Con un límite de silencio EN PARTIDA. Antes se esperaba sin tiempo
    // máximo y un socket muerto (la red se cae sin avisar) tardaba ~100 s en
    // notarse, lo que dejaba a los demás mirando a alguien que ya no estaba y
    // retrasaba lo que viene después (la gracia de 30 s). En partida el cliente
    // manda un ping cada 3 s —medido: el mayor silencio de una persona activa
    // fue 4,7 s—, así que 20 s sin nada es una conexión muerta. Fuera de
    // partida no se aplica: el cliente solo pinga cada 25 s y un teléfono que
    // se va a otra app a mandar el código de la sala no debe perder su sitio.
    let mut ultimo = Instant::now();
    let mut motivo = "cierre";
    loop {
        let sig = match tokio::time::timeout(IDLE_CHECK, ws_receiver.next()).await {
            Ok(sig) => sig,
            Err(_) => {
                let en_partida = match current_lobby.as_deref() {
                    Some(id) => state.lobby_manager.get_lobby(id).await
                        .is_some_and(|l| l.status == LobbyStatus::Playing),
                    None => false,
                };
                if en_partida && crate::debug::silent_too_long(ultimo, IDLE_IN_GAME) {
                    tracing::info!(
                        "🔇 {} lleva {} s sin decir nada en partida: se da por caído",
                        player_id, ultimo.elapsed().as_secs()
                    );
                    motivo = "silencio";
                    break;
                }
                continue;
            }
        };
        let Some(msg) = sig else { break };
        ultimo = Instant::now();
        if let Ok(mut vistos) = state.last_seen.lock() {
            vistos.insert(player_id, ultimo);
        }
        match msg {
            Ok(Message::Text(text)) => {
                // Parsear mensaje del cliente
                match serde_json::from_str::<ClientMessage>(&text) {
                    Ok(client_msg) => {
                        handle_client_message(
                            client_msg,
                            player_id,
                            &mut current_lobby,
                            &state,
                        ).await;
                    }
                    Err(e) => {
                        eprintln!("Error parseando mensaje: {}", e);
                        let error_msg = ServerMessage::Error {
                            message: format!("Mensaje inválido: {}", e),
                        };
                        let _ = tx.send(error_msg);
                    }
                }
            }
            Ok(Message::Close(_)) => {
                tracing::info!("Cliente cerró conexión limpiamente: {}", player_id);
                motivo = "cierre limpio";
                break;
            }
            Err(e) => {
                // "connection reset without closing handshake" es normal cuando el navegador
                // cierra la pestaña abruptamente — no es un error del servidor
                tracing::debug!("Conexión WebSocket cerrada abruptamente ({}): {}", player_id, e);
                motivo = "error";
                break;
            }
            _ => {}
        }
    }

    // Cleanup: remover del mapa de conexiones primero
    {
        let mut connections = state.connections.write().await;
        connections.remove(&player_id);
    }
    send_task.abort();
    let silencio_ms = ultimo.elapsed().as_millis() as u64;
    if let Ok(mut vistos) = state.last_seen.lock() { vistos.remove(&player_id); }
    if let Ok(mut d) = state.desync_seen.lock() { d.remove(&player_id); }
    if current_lobby.is_some() {
        state.rec_line_player(&player_id, "conn", serde_json::json!({
            "kind": "close", "motivo": motivo, "silencio_ms": silencio_ms,
        })).await;
    }

    // Si estaba en un lobby, decidir qué hacer con su sitio.
    if let Some(lobby_id) = &current_lobby {
        leave_current_lobby(&state, player_id, lobby_id, false).await;
    }

    tracing::info!("🔌 Conexión WebSocket cerrada: {}", player_id);
}

/// Qué pasa con el asiento de una conexión que se va de su sala.
///
/// `voluntary`: pulsó "Salir" (o abrió otra sala con la misma conexión), no se
/// le cayó la red. Importa en un único sitio: una sala que se queda sin nadie.
/// Si fue una caída se guarda un rato, sin listarse, para volver con el código
/// tras un F5; si se fue a propósito, deja de existir ya.
///
/// Antes esto vivía dentro de `handle_socket`, así que solo se ejecutaba al
/// cerrarse el socket. Y "Salir" solo cambiaba de pantalla: el asiento seguía,
/// la sala seguía listada y el apodo seguía ocupado.
async fn leave_current_lobby(state: &AppState, player_id: Uuid, lobby_id: &str, voluntary: bool) {
    let Some(mut lobby) = state.lobby_manager.get_lobby(lobby_id).await else { return };

    // En plena partida NO se le quita el sitio a quien juega: se le espera.
    //
    // Antes un solo corte de conexión cancelaba la partida de todos, y lo hacía
    // porque quitarle el sitio le borraba las 24 cartas — con 4 cartas por
    // prenda, eso dejaba media partida sin poder completarse. Ahora sus cartas
    // se quedan en la mesa, los demás siguen jugando, y solo si no vuelve en
    // GRACE_PERIOD se redimensiona la partida retirando prendas enteras.
    //
    // Tampoco se cancela al instante cuando se cae la única persona o falta
    // gente para seguir (2026-09-30: la única persona contra un bot se cayó, la
    // partida se canceló en el mismo milisegundo y no tuvo a qué volver). Se
    // espera igual; `run_grace_period` decide al cumplirse el plazo.
    if lobby.status == LobbyStatus::Playing && !lobby.is_spectator(&player_id) {
        if let Some(nickname) = lobby.mark_disconnected(&player_id) {
            tracing::info!(
                "⏳ {} ({}) se cayó en partida; {}s para volver",
                nickname, player_id, GRACE_PERIOD.as_secs()
            );
            state.lobby_manager.update_lobby(lobby).await;
            state.rec_line_lobby(lobby_id, "conn", serde_json::json!({
                "kind": "grace_start", "player": nickname, "secs": GRACE_PERIOD.as_secs(),
                "voluntaria": voluntary,
            })).await;
            state.broadcast_to_lobby(lobby_id, ServerMessage::PlayerDisconnected {
                nickname,
                seconds: GRACE_PERIOD.as_secs(),
            }).await;
            tokio::spawn(run_grace_period(state.clone(), lobby_id.to_string(), player_id));
        }
        // Si no está en `players`, su asiento ya lo tomó otra conexión suya
        // (`rebind_seat`): este cierre ya no pinta nada.
        return;
    }

    let Some(nickname) = lobby.remove_player(&player_id) else { return };
    tracing::info!("🚪 {} ({}) salió del lobby {}", nickname, player_id, lobby_id);

    if lobby.players.is_empty() {
        if voluntary {
            // Se fue la última persona a propósito: la sala deja de existir.
            state.lobby_manager.remove_lobby(lobby_id).await;
            tracing::info!("🚪 sala {} cerrada: se fue la última persona", lobby_id);
        } else {
            // Se queda en `Waiting` a propósito (ver `remove_player`) para que
            // quien se cayó pueda volver a su misma sala.
            state.lobby_manager.update_lobby(lobby).await;
        }
        state.take_intents.write().await.remove(lobby_id);
        return;
    }

    // Un mirón que se va en plena partida no mueve nada de la sala de espera.
    let en_partida = lobby.status == LobbyStatus::Playing;
    let player_infos: Vec<PlayerInfo> = lobby.players.iter().map(|p| PlayerInfo {
        id: p.id.to_string(),
        nickname: p.nickname.clone(),
        is_ready: p.is_ready,
        is_bot: p.is_bot,
    }).collect();
    let ready_count = lobby.ready_count();
    let max_players = lobby.max_players;
    let mirones = lobby.spectators.len();
    state.lobby_manager.update_lobby(lobby).await;

    if !en_partida {
        state.broadcast_to_lobby(lobby_id, ServerMessage::LobbyUpdate {
            players: player_infos,
            ready_count,
            max_players,
            spectators: mirones,
        }).await;
        retire_orphan_bots(state, lobby_id).await;
    }
}

/// Compara lo que el cliente dice tener (nota `state`) con el tablero del
/// servidor. Si no cuadra **en dos muestras seguidas con la misma diferencia**
/// lo apunta en la grabación como `desync`, con las diferencias exactas.
///
/// Una sola muestra no vale: una jugada en vuelo (la respuesta del servidor
/// aún no ha llegado) produce una diferencia que no es ningún fallo. El cliente
/// manda una muestra cada 5 s, así que lo que se repite dura de verdad.
async fn check_desync(state: &AppState, player_id: Uuid, lobby_id: &str, detail: &serde_json::Value) {
    let Ok(cli) = serde_json::from_value::<crate::debug::ClientState>(detail.clone()) else { return };
    let Some(lobby) = state.lobby_manager.get_lobby(lobby_id).await else { return };
    if lobby.status != LobbyStatus::Playing { return }
    let Some(gs) = lobby.game_state.as_ref() else { return };
    let Some(p) = gs.players.iter().find(|p| p.id == player_id) else { return };

    let mano: Vec<Vec<Option<u32>>> = p.sets.iter()
        .map(|s| s.iter().map(|c| c.map(|c| c.id)).collect())
        .collect();
    let centro: Vec<u32> = gs.center_cards.iter().map(|c| c.id).collect();
    let diff = crate::debug::diff_state(&mano, &centro, &cli);

    let avisar = {
        let Ok(mut vistos) = state.desync_seen.lock() else { return };
        match diff {
            None => { vistos.remove(&player_id); None }
            Some(d) => match vistos.get_mut(&player_id) {
                // La misma diferencia otra vez, y no demasiado tarde.
                Some(prev) if prev.diff == d => {
                    if !prev.reported && prev.at.elapsed() <= Duration::from_secs(20) {
                        prev.reported = true;
                        Some(d)
                    } else {
                        None
                    }
                }
                _ => {
                    vistos.insert(player_id, DesyncSeen { diff: d, at: Instant::now(), reported: false });
                    None
                }
            },
        }
    };
    if let Some(d) = avisar {
        tracing::warn!("⚠️ el tablero de {} no cuadra con el del servidor: {:?}", p.nickname, d);
        state.rec_line_lobby(lobby_id, "desync", serde_json::json!({
            "player": p.nickname, "diff": d,
        })).await;
    }
}

/// Si en la sala solo quedan bots, se cierra: los bots se van y la sala deja
/// de existir. Sin esto un bot se quedaba sentado para siempre en una sala
/// "abierta con 1 jugador" (visto en beta el 2026-09-28). Una persona caída
/// dentro del periodo de gracia cuenta como persona: puede volver. Una sala
/// vacía SIN bots se sigue guardando un rato para volver con el código.
async fn retire_orphan_bots(state: &AppState, lobby_id: &str) {
    let Some(lobby) = state.lobby_manager.get_lobby(lobby_id).await else { return };
    if lobby.players.is_empty() || lobby.players.iter().any(|p| !p.is_bot) {
        return;
    }
    let bots: Vec<Uuid> = lobby.players.iter().map(|p| p.id).collect();
    for bot_id in &bots {
        crate::bot::remove_bot(state, lobby_id, *bot_id).await;
    }
    state.lobby_manager.remove_lobby(lobby_id).await;
    state.take_intents.write().await.remove(lobby_id);
    tracing::info!("🚪 sala {} cerrada: solo quedaban {} bot(s)", lobby_id, bots.len());
}

/// Centro, progreso y cuánta gente mira: los tres campos de un `GameUpdate`.
///
/// Los mirones viajan aquí y no en un mensaje aparte porque esto ya sale en
/// cada movimiento de carta; un mensaje propio sería otra cosa que mantener al
/// día para enseñar un número.
fn snapshot(lobby: &crate::game::Lobby) -> (Vec<CardInfo>, Vec<PlayerProgress>, usize) {
    let mirones = lobby.spectators.len();
    let Some(gs) = lobby.game_state.as_ref() else { return (vec![], vec![], mirones) };
    let center = gs.center_cards.iter().map(|&c| CardInfo::from(c)).collect();
    let progress = gs.players.iter().map(|p| PlayerProgress {
        nickname: p.nickname.clone(),
        completed_sets: p.count_completed_sets(),
        finished: p.finished_position.is_some(),
        on_fire: p.is_on_fire(),
    }).collect();
    (center, progress, mirones)
}

/// Maneja un mensaje del cliente y envía respuestas vía broadcast
/// `pub(crate)` porque los bots la llaman directamente: no tienen socket, pero
/// esta función nunca lo necesitó — le basta el id, la sala y el estado.
pub(crate) async fn handle_client_message(
    msg: ClientMessage,
    player_id: Uuid,
    current_lobby: &mut Option<String>,
    state: &AppState,
) {
    // Una nota demasiado grande ni se graba: la grabación es pública y tiene
    // tope de tamaño.
    if let ClientMessage::ClientNote { kind, detail } = &msg {
        if crate::debug::note_too_big(kind, detail) {
            return;
        }
    }

    // Lo que manda cada jugador, grabado antes de atenderlo. Los bots pasan
    // por aquí también, así que sus decisiones quedan registradas igual.
    state.rec_in(&player_id, &msg).await;

    // Un espectador mira y poco más. Un solo guardia aquí en vez de nueve
    // comprobaciones repartidas por `drop_card`, `take_card`, `qte_click`,
    // `frenzy`, `give_up_card`, `flip_set`, `switch_set`,
    // `request_verification` y `set_ready`: un mensaje nuevo queda cubierto sin
    // que nadie tenga que acordarse.
    // Irse o abrir otra sala sí se le deja: el guardia lo dejaba sin salida, y
    // un mirón que volvía a "Crear sala" no creaba nada.
    if !matches!(msg, ClientMessage::Ping { .. } | ClientMessage::ListLobbies
        | ClientMessage::LeaveLobby | ClientMessage::CreateLobby { .. }
        | ClientMessage::QuickMatch { .. } | ClientMessage::JoinLobby { .. })
    {
        if let Some(id) = current_lobby.as_deref() {
            if state.lobby_manager.get_lobby(id).await
                .is_some_and(|l| l.is_spectator(&player_id))
            {
                return;
            }
        }
    }

    // Una conexión, un asiento. Abrir o entrar en otra sala con la conexión ya
    // sentada es irse de la anterior; si no, el asiento viejo se quedaba
    // ocupando su sala y su apodo para siempre (el cliente de antes ni avisaba
    // al darle a "Salir").
    let abre_otra = match &msg {
        ClientMessage::CreateLobby { .. } | ClientMessage::QuickMatch { .. } => true,
        ClientMessage::JoinLobby { lobby_id, .. } => current_lobby.as_deref() != Some(lobby_id.as_str()),
        _ => false,
    };
    if abre_otra {
        if let Some(anterior) = current_lobby.take() {
            leave_current_lobby(state, player_id, &anterior, true).await;
        }
    }

    match msg {
        ClientMessage::CreateLobby { nickname, max_players, is_public, rating_key } => {
            let lobby_id = state.lobby_manager.create_lobby(max_players, is_public).await;
            enter_new_lobby(state, player_id, current_lobby, &lobby_id, nickname, rating_key).await;
        }

        ClientMessage::QuickMatch { nickname, rating_key } => {
            // Entrar en la sala pública más llena. Si no hay ninguna, se abre
            // una pública y se espera ahí. Los bots NO se añaden solos: el
            // cliente pregunta primero, porque alguien que pide partida rápida
            // normalmente quiere gente, no máquinas.
            match state.lobby_manager.fullest_open_lobby().await {
                Some(lobby_id) => {
                    let live: std::collections::HashSet<Uuid> =
                        state.connections.read().await.keys().copied().collect();
                    match state.lobby_manager
                        .join_lobby(&lobby_id, player_id, nickname.clone(), &live).await
                    {
                        // `fullest_open_lobby` solo devuelve salas en espera, así
                        // que por aquí nunca se entra a mirar.
                        Ok((lobby, mirando)) => {
                            *current_lobby = Some(lobby_id.clone());
                            remember_rating_key(state, &lobby_id, player_id, rating_key).await;
                            state.send_to_player(&player_id, ServerMessage::JoinedLobby {
                                lobby_id: lobby_id.clone(),
                                player_id: player_id.to_string(),
                                spectator: mirando,
                            }).await;
                            send_seat_token(state, &lobby, player_id).await;
                            send_lobby_update(state, &lobby_id).await;
                        }
                        Err(_) => {
                            // Se llenó o arrancó entre la consulta y la
                            // entrada: abrir una nueva en vez de dar error.
                            let fresh = state.lobby_manager.create_lobby(8, true).await;
                            enter_new_lobby(state, player_id, current_lobby, &fresh, nickname, rating_key).await;
                        }
                    }
                }
                None => {
                    let fresh = state.lobby_manager.create_lobby(8, true).await;
                    enter_new_lobby(state, player_id, current_lobby, &fresh, nickname, rating_key).await;
                }
            }
        }

        ClientMessage::LeaveLobby => {
            if let Some(lobby_id) = current_lobby.take() {
                leave_current_lobby(state, player_id, &lobby_id, true).await;
            }
        }

        ClientMessage::JoinLobby { lobby_id, nickname, rating_key, seat_token } => {
            // Ya está sentado en esa sala con esta misma conexión (doble toque
            // en "Unirse", o un cliente que "salió" solo en pantalla): no hay
            // nada que hacer, solo confirmar. Antes chocaba con su propio apodo.
            if current_lobby.as_deref() == Some(lobby_id.as_str()) {
                if let Some(lobby) = state.lobby_manager.get_lobby(&lobby_id).await {
                    // En partida la confirmación llevaría a la pantalla de
                    // sala, encima del tablero.
                    if lobby.status != LobbyStatus::Playing {
                        state.send_to_player(&player_id, ServerMessage::JoinedLobby {
                            lobby_id: lobby_id.clone(),
                            player_id: player_id.to_string(),
                            spectator: lobby.is_spectator(&player_id),
                        }).await;
                        send_seat_token(state, &lobby, player_id).await;
                        send_lobby_update(state, &lobby_id).await;
                    }
                }
                return;
            }

            // ¿Vuelve alguien a su asiento? Entonces no "entra": lo recupera
            // con sus cartas. Pasar por join_lobby lo trataría como nuevo y le
            // borraría la mano.
            //
            // Con el SECRETO del asiento, no con el apodo: el apodo lo escribe
            // cualquiera, y exigir que el servidor ya hubiera notado la caída
            // dejaba fuera a quien volvía antes de que se enterase (2026-09-30:
            // ~100 s de reintentos rechazados con un socket muerto).
            if let Some(token) = seat_token.as_deref() {
                if let Some(mut lobby) = state.lobby_manager.get_lobby(&lobby_id).await {
                    if let Some(old_id) = lobby.rebind_seat(token, player_id).filter(|o| *o != player_id) {
                        *current_lobby = Some(lobby_id.clone());
                        let resumed = lobby.game_state.as_ref()
                            .and_then(|g| g.players.iter().find(|p| p.id == player_id))
                            .map(|p| (
                                p.sets.iter().map(|s| set_to_info(s)).collect::<Vec<_>>(),
                                p.current_set_index,
                            ));
                        let names: Vec<String> = lobby.players.iter()
                            .map(|p| p.nickname.clone()).collect();
                        let (center, _, _) = snapshot(&lobby);
                        let nick = lobby.players.iter().find(|p| p.id == player_id)
                            .map(|p| p.nickname.clone()).unwrap_or_default();
                        let asiento = lobby.clone();
                        state.lobby_manager.update_lobby(lobby).await;

                        // La conexión vieja ya no es la buena. Se le avisa para
                        // que no intente volver (dos pestañas se quitarían el
                        // asiento sin parar) y se la saca del mapa.
                        state.send_to_player(&old_id, ServerMessage::SeatReplaced).await;
                        state.connections.write().await.remove(&old_id);
                        state.rec_rebind(&old_id, &player_id).await;
                        // Cuánto llevaba callada la conexión vieja: si el
                        // servidor ya la daba por muerta o la tenía por viva.
                        let vieja_callada_ms = state.last_seen.lock().ok()
                            .and_then(|v| v.get(&old_id).map(|t| t.elapsed().as_millis() as u64));
                        state.rec_line_player(&player_id, "conn", serde_json::json!({
                            "kind": "replaced", "vieja_callada_ms": vieja_callada_ms,
                        })).await;

                        tracing::info!("↩️ {} recuperó su asiento en {}", nick, lobby_id);
                        state.send_to_player(&player_id, ServerMessage::JoinedLobby {
                            lobby_id: lobby_id.clone(),
                            player_id: player_id.to_string(),
                            // Recupera su asiento, no entra a mirar.
                            spectator: false,
                        }).await;
                        send_seat_token(state, &asiento, player_id).await;
                        // El tablero entero tal y como está ahora: es lo que
                        // faltaba para poder reanudar una partida en curso.
                        if let Some((your_sets, current_set)) = resumed {
                            state.send_to_player(&player_id, ServerMessage::GameStart {
                                your_sets,
                                center_cards: center,
                                current_set,
                                players: names,
                            }).await;
                        }
                        // Su asiento ya la tenía; esto cubre a quien entró con
                        // una pestaña de antes del Elo y vuelve con la nueva.
                        remember_rating_key(state, &lobby_id, player_id, rating_key).await;
                        send_lobby_update(&state, &lobby_id).await;
                        return;
                    }
                }
            }

            let live: std::collections::HashSet<Uuid> =
                state.connections.read().await.keys().copied().collect();
            match state.lobby_manager.join_lobby(&lobby_id, player_id, nickname, &live).await {
                Ok((lobby, mirando)) => {
                    *current_lobby = Some(lobby_id.clone());
                    remember_rating_key(state, &lobby_id, player_id, rating_key).await;

                    // Enviar confirmación al jugador que se unió
                    state.send_to_player(&player_id, ServerMessage::JoinedLobby {
                        lobby_id: lobby_id.clone(),
                        player_id: player_id.to_string(),
                        spectator: mirando,
                    }).await;
                    send_seat_token(state, &lobby, player_id).await;

                    // Quien entra a mirar necesita el tablero de una vez: a
                    // partir de ahí las difusiones lo mantienen al día. Sin
                    // sets propios, porque no tiene.
                    if mirando {
                        let (center, _, _) = snapshot(&lobby);
                        state.send_to_player(&player_id, ServerMessage::GameStart {
                            your_sets: Vec::new(),
                            center_cards: center,
                            current_set: 0,
                            players: lobby.players.iter().map(|p| p.nickname.clone()).collect(),
                        }).await;
                    }

                    // Broadcast actualización a todos los jugadores del lobby
                    send_lobby_update(&state, &lobby_id).await;
                }
                Err(e) => {
                    state.send_to_player(&player_id, ServerMessage::Error { message: e }).await;
                }
            }
        }

        ClientMessage::AddBot { difficulty } => {
            let Some(lobby_id) = current_lobby.clone() else { return };
            let Some(lobby) = state.lobby_manager.get_lobby(&lobby_id).await else { return };
            // Solo en la sala: meter un bot en mitad de una partida sería
            // repartirle cartas que ya están en manos de otros.
            if lobby.status != LobbyStatus::Waiting || lobby.is_full() {
                state.send_to_player(&player_id, ServerMessage::Error {
                    message: "No se pueden añadir bots ahora".to_string(),
                }).await;
                return;
            }
            if crate::bot::spawn_bot(state, &lobby_id, difficulty).await.is_some() {
                send_lobby_update(state, &lobby_id).await;
            }
        }

        ClientMessage::RemoveBot { player_id: bot } => {
            let Some(lobby_id) = current_lobby.clone() else { return };
            let Some(bot_id) = Uuid::parse_str(&bot).ok() else { return };
            let Some(lobby) = state.lobby_manager.get_lobby(&lobby_id).await else { return };
            if lobby.status != LobbyStatus::Waiting {
                return;
            }
            // Solo bots: este mensaje no sirve para expulsar a personas.
            if !lobby.players.iter().any(|p| p.id == bot_id && p.is_bot) {
                return;
            }
            crate::bot::remove_bot(state, &lobby_id, bot_id).await;
            send_lobby_update(state, &lobby_id).await;
        }

        ClientMessage::ListLobbies => {
            let lobbies = state.lobby_manager.list_available_lobbies().await;
            let lobby_infos: Vec<LobbyInfo> = lobbies.into_iter().map(|l| LobbyInfo {
                id: l.id,
                player_count: l.players.len(),
                max_players: l.max_players,
            }).collect();

            state.send_to_player(&player_id, ServerMessage::LobbyList { lobbies: lobby_infos }).await;
        }

        ClientMessage::SetReady { ready } => {
            if let Some(ref lobby_id) = current_lobby {
                if let Some(mut lobby) = state.lobby_manager.get_lobby(lobby_id).await {
                    // Un SetReady tardío (el del bot que esperaba 400 ms, o
                    // una pestaña vieja) no significa nada con la partida en
                    // marcha: se ignora sin avisar a nadie.
                    if lobby.status == LobbyStatus::Playing {
                        return;
                    }
                    match lobby.set_player_ready(&player_id, ready) {
                        Ok(_) => {
                            // Intentar iniciar el juego si todos están listos
                            if lobby.status == LobbyStatus::Ready {
                                if let Ok(_) = lobby.start_game() {
                                    // Juego iniciado, actualizar lobby
                                    state.lobby_manager.update_lobby(lobby.clone()).await;
                                    // Grabar desde aquí: los GameStart de
                                    // más abajo son privados y traen la mano
                                    // de cada uno.
                                    state.rec_open(&lobby_id, &lobby).await;

                                    if let Some(game_state) = &lobby.game_state {
                                        // Enviar estado del juego a cada jugador (cada uno ve sus propias cartas)
                                        for player_state in &game_state.players {
                                            let your_sets: Vec<Vec<Option<CardInfo>>> = player_state.sets.iter()
                                                .map(set_to_info)
                                                .collect();

                                            let center_cards: Vec<CardInfo> = game_state.center_cards.iter()
                                                .map(|&card| CardInfo::from(card))
                                                .collect();

                                            let players: Vec<String> = game_state.players.iter()
                                                .map(|p| p.nickname.clone())
                                                .collect();

                                            state.send_to_player(&player_state.id, ServerMessage::GameStart {
                                                your_sets,
                                                center_cards,
                                                current_set: 0,
                                                players,
                                            }).await;
                                        }
                                    }
                                    return; // Juego iniciado, salir
                                }
                            }

                            // Actualizar lobby en el manager
                            state.lobby_manager.update_lobby(lobby.clone()).await;

                            // Broadcast actualización a todos
                            send_lobby_update(&state, lobby_id).await;
                        }
                        Err(e) => {
                            state.send_to_player(&player_id, ServerMessage::Error { message: e }).await;
                        }
                    }
                } else {
                    state.send_to_player(&player_id, ServerMessage::Error {
                        message: "Lobby no encontrado".to_string()
                    }).await;
                }
            } else {
                state.send_to_player(&player_id, ServerMessage::Error {
                    message: "No estás en un lobby".to_string()
                }).await;
            }
        }

        ClientMessage::SwitchSet { set_index } => {
            if let Some(ref lobby_id) = *current_lobby {
                if let Some(mut lobby) = state.lobby_manager.get_lobby(lobby_id).await {
                    if set_index >= 6 {
                        state.send_to_player(&player_id, ServerMessage::Error {
                            message: "Índice de set inválido (debe ser 0-5)".to_string(),
                        }).await;
                        return;
                    }

                    let cards = {
                        let game_state = match lobby.game_state.as_mut() {
                            Some(gs) => gs,
                            None => {
                                state.send_to_player(&player_id, ServerMessage::Error {
                                    message: "El juego no ha iniciado".to_string(),
                                }).await;
                                return;
                            }
                        };

                        let player = match game_state.find_player_mut(&player_id) {
                            Some(p) => p,
                            None => {
                                state.send_to_player(&player_id, ServerMessage::Error {
                                    message: "Jugador no encontrado".to_string(),
                                }).await;
                                return;
                            }
                        };

                        // Debiendo una carta no se cambia de set: el hueco está
                        // en el set que dejas atrás y se te queda fuera de la
                        // vista, que es justo el lío del que venía el bloqueo.
                        // Lo único que puedes hacer mientras debes es coger.
                        if player.owes_card() {
                            return;
                        }

                        // Con el mismo helper que GameStart y SwapSuccess: el
                        // hueco tiene que viajar como `null`, no desaparecer.
                        player.current_set_index = set_index;
                        set_to_info(&player.sets[set_index])
                    };

                    state.lobby_manager.update_lobby(lobby).await;

                    state.send_to_player(&player_id, ServerMessage::SetSwitched {
                        set_index,
                        cards,
                    }).await;
                } else {
                    state.send_to_player(&player_id, ServerMessage::Error {
                        message: "Lobby no encontrado".to_string(),
                    }).await;
                }
            } else {
                state.send_to_player(&player_id, ServerMessage::Error {
                    message: "No estás en una partida".to_string(),
                }).await;
            }
        }

        ClientMessage::RequestVerification => {
            if let Some(ref lobby_id) = *current_lobby {
                if let Some(mut lobby) = state.lobby_manager.get_lobby(lobby_id).await {
                    let verification_data = {
                        let game_state = match lobby.game_state.as_mut() {
                            Some(gs) => gs,
                            None => {
                                state.send_to_player(&player_id, ServerMessage::Error {
                                    message: "El juego no ha iniciado".to_string(),
                                }).await;
                                return;
                            }
                        };

                        let player_idx = match game_state.players.iter().position(|p| p.id == player_id) {
                            Some(idx) => idx,
                            None => {
                                state.send_to_player(&player_id, ServerMessage::Error {
                                    message: "Jugador no encontrado".to_string(),
                                }).await;
                                return;
                            }
                        };

                        if game_state.players[player_idx].is_verifying {
                            state.send_to_player(&player_id, ServerMessage::Error {
                                message: "Ya estás verificando".to_string(),
                            }).await;
                            return;
                        }

                        if game_state.players[player_idx].finished_position.is_some() {
                            state.send_to_player(&player_id, ServerMessage::Error {
                                message: "Ya terminaste el juego".to_string(),
                            }).await;
                            return;
                        }

                        game_state.players[player_idx].is_verifying = true;
                        let player_nickname = game_state.players[player_idx].nickname.clone();
                        let sets = game_state.players[player_idx].sets;

                        (player_nickname, sets)
                    };

                    let (player_nickname, sets) = verification_data;
                    let lobby_id_owned = lobby_id.clone();

                    state.lobby_manager.update_lobby(lobby).await;

                    state.broadcast_to_lobby(&lobby_id_owned, ServerMessage::VerificationStarted {
                        player: player_nickname.clone(),
                    }).await;

                    // Tarea async para la verificación con delays
                    let state_clone = state.clone();
                    tokio::spawn(async move {
                        run_verification(state_clone, lobby_id_owned, player_id, player_nickname, sets).await;
                    });
                } else {
                    state.send_to_player(&player_id, ServerMessage::Error {
                        message: "Lobby no encontrado".to_string(),
                    }).await;
                }
            } else {
                state.send_to_player(&player_id, ServerMessage::Error {
                    message: "No estás en una partida".to_string(),
                }).await;
            }
        }

        // ── Soltar una carta al centro sin coger nada a cambio ──
        // Deja un hueco en tu set. Hasta que lo tapes cogiendo otra carta no
        // puedes soltar más, ni intercambiar, ni mostrar sets: lo único que
        // puedes hacer es coger. Se comprueba aquí, no solo en el cliente.
        ClientMessage::DropCard { my_card_index } => {
            let lobby_id = match current_lobby.as_ref() {
                Some(id) => id.clone(),
                None => return,
            };
            if my_card_index >= 4 { return; }

            let Some(mut lobby) = state.lobby_manager.get_lobby(&lobby_id).await else { return };
            if let Some(left) = lobby.stun_remaining(&player_id) {
                state.send_to_player(&player_id, ServerMessage::Stunned {
                    ms: left.as_millis() as u64,
                }).await;
                return;
            }

            // Igual que al coger: una jugada que no se puede hacer se contesta.
            // Quedarse callado se ve exactamente igual que un toque perdido, y
            // lo que hace el jugador entonces es volver a tocar.
            let result = {
                let Some(game_state) = lobby.game_state.as_mut() else { return };
                let Some(idx) = game_state.players.iter().position(|p| p.id == player_id) else { return };
                if qte_blocks(game_state, player_id, None) {
                    Err(("Espera a que acabe tu pelea", "rule"))
                } else {
                    let player = &mut game_state.players[idx];
                    if player.is_verifying {
                        Err(("Estás verificando tus pilas", "rule"))
                    } else if player.owes_card() {
                        Err(("Coge una carta del centro antes de soltar otra", "rule"))
                    } else {
                        let set_index = player.current_set_index;
                        match player.sets[set_index][my_card_index].take() {
                            // Ya no está donde creías: el cliente iba con una
                            // mano vieja, así que se deshace y no se dice nada.
                            None => Err(("Ese hueco ya está vacío", "gone")),
                            Some(card) => {
                                player.owed_slot = Some((set_index, my_card_index));
                                player.owed_since = Some(Instant::now());
                                // Para saber luego si vuelve a coger justo ésta.
                                player.note_drop(card.clothing_type);
                                game_state.center_cards.push(card);
                                Ok((set_index, set_to_info(&game_state.players[idx].sets[set_index])))
                            }
                        }
                    }
                }
            };

            let (set_index, new_set) = match result {
                Ok(v) => v,
                Err((reason, kind)) => {
                    state.send_to_player(&player_id, ServerMessage::SwapFailed {
                        reason: reason.to_string(), kind: kind.to_string(),
                    }).await;
                    return;
                }
            };
            let (new_center, players_progress, mirones) = snapshot(&lobby);
            state.lobby_manager.update_lobby(lobby).await;

            state.send_to_player(&player_id, ServerMessage::SwapSuccess {
                set_index,
                your_new_set: Some(new_set),
                center_cards: new_center.clone(),
            }).await;
            state.send_to_player(&player_id, ServerMessage::DebtStarted {
                ms: DEBT_DEADLINE.as_millis() as u64,
            }).await;
            state.broadcast_to_lobby(&lobby_id, ServerMessage::GameUpdate {
                center_cards: new_center,
                players_progress,
                spectators: mirones,
            }).await;

            tokio::spawn(run_debt_deadline(state.clone(), lobby_id, player_id));
        }

        // ── Coger una carta del centro para tapar el hueco ──
        // Aquí es donde se pelea: si dos jugadores van a por la misma carta
        // con menos de CONFLICT_WINDOW de diferencia, se resuelve a clicks.
        ClientMessage::TakeCard { card_id } => {
            let lobby_id = match current_lobby.as_ref() {
                Some(id) => id.clone(),
                None => return,
            };

            let Some(lobby) = state.lobby_manager.get_lobby(&lobby_id).await else { return };
            if let Some(left) = lobby.stun_remaining(&player_id) {
                state.send_to_player(&player_id, ServerMessage::Stunned {
                    ms: left.as_millis() as u64,
                }).await;
                return;
            }

            // Cada salida de aquí contesta algo. Callarse es lo que dejaba al
            // jugador mirando cómo la carta que había elegido se esfumaba sin
            // pelea ni aviso: al llegar su mensaje otro ya se la había llevado,
            // el servidor no la encontraba en el centro y no hacía nada.
            // La pelea solo salta si los dos van a por ella dentro de los 300 ms
            // de `CONFLICT_WINDOW`; fuera de esa ventana no hay pelea que valga,
            // pero sigue haciendo falta decirlo.
            let nickname = {
                let Some(game_state) = lobby.game_state.as_ref() else { return };
                if qte_blocks(game_state, player_id, Some(card_id)) {
                    state.send_to_player(&player_id, ServerMessage::SwapFailed {
                        reason: "Esa carta se está peleando".to_string(), kind: "gone".to_string(),
                    }).await;
                    return;
                }
                if !game_state.center_cards.iter().any(|c| c.id == card_id) {
                    state.send_to_player(&player_id, ServerMessage::SwapFailed {
                        reason: "Esa carta ya no está".to_string(), kind: "gone".to_string(),
                    }).await;
                    return;
                }
                let Some(p) = game_state.players.iter().find(|p| p.id == player_id) else { return };
                // Solo se coge para tapar un hueco: sin deuda no hay nada que
                // rellenar, y sin intercambio 1↔1 no hay otra forma de coger.
                if !p.owes_card() {
                    state.send_to_player(&player_id, ServerMessage::SwapFailed {
                        reason: "Suelta una carta antes de coger otra".to_string(), kind: "rule".to_string(),
                    }).await;
                    return;
                }
                p.nickname.clone()
            };

            let rival = {
                let mut intents = state.take_intents.write().await;
                let per_card = intents.entry(lobby_id.clone()).or_default();
                let rival = per_card.get(&card_id).and_then(|other| {
                    (other.player_id != player_id && other.timestamp.elapsed() < CONFLICT_WINDOW)
                        .then(|| other.clone())
                });
                if rival.is_some() {
                    per_card.remove(&card_id);
                } else {
                    per_card.insert(card_id, TakeIntent {
                        player_id,
                        nickname: nickname.clone(),
                        timestamp: Instant::now(),
                    });
                }
                rival
            };

            match rival {
                Some(other) => {
                    let me = QtePlayerData { player_id, nickname: nickname.clone() };
                    let them = QtePlayerData { player_id: other.player_id, nickname: other.nickname };

                    if let Some(mut lobby) = state.lobby_manager.get_lobby(&lobby_id).await {
                        if let Some(gs) = lobby.game_state.as_mut() {
                            // Se añade, no se sustituye: con cuatro jugadores
                            // puede haber dos peleas a la vez y antes la segunda
                            // borraba la primera.
                            // Peleando no se puede jugar: se para el reloj de
                            // la racha de los dos, o pelear te costaría el
                            // combo por no poder tocar nada.
                            for id in [me.player_id, them.player_id] {
                                if let Some(p) = gs.find_player_mut(&id) { p.freeze_combo(); }
                            }
                            gs.active_qtes.retain(|q| q.card_id != card_id);
                            gs.active_qtes.push(crate::game::QteState {
                                participants: vec![
                                    (me.player_id, me.nickname.clone()),
                                    (them.player_id, them.nickname.clone()),
                                ],
                                card_id,
                                clicks: std::collections::HashMap::new(),
                                conceded_by: None,
                            });
                        }
                        state.lobby_manager.update_lobby(lobby).await;
                    }

                    state.broadcast_to_lobby(&lobby_id, ServerMessage::SwapConflict {
                        players: vec![me.nickname.clone(), them.nickname.clone()],
                        card_id,
                        qte_duration: QTE_MS,
                    }).await;

                    let state_clone = state.clone();
                    tokio::spawn(async move {
                        run_qte(state_clone, lobby_id, card_id, me, them).await;
                    });
                }
                None => {
                    // Sin rival de momento: se espera la ventana por si aparece.
                    let state_clone = state.clone();
                    tokio::spawn(async move {
                        sleep(CONFLICT_WINDOW).await;
                        execute_delayed_take(state_clone, lobby_id, card_id, player_id).await;
                    });
                }
            }
        }


        ClientMessage::FlipSet { set_index } => {
            if let Some(ref lobby_id) = *current_lobby {
                if let Some(mut lobby) = state.lobby_manager.get_lobby(lobby_id).await {
                    if set_index >= 6 {
                        state.send_to_player(&player_id, ServerMessage::Error {
                            message: "Índice de set inválido (debe ser 0-5)".to_string(),
                        }).await;
                        return;
                    }

                    let flip_data = {
                        let game_state = match lobby.game_state.as_mut() {
                            Some(gs) => gs,
                            None => {
                                state.send_to_player(&player_id, ServerMessage::Error {
                                    message: "El juego no ha iniciado".to_string(),
                                }).await;
                                return;
                            }
                        };

                        let player_idx = match game_state.players.iter().position(|p| p.id == player_id) {
                            Some(idx) => idx,
                            None => {
                                state.send_to_player(&player_id, ServerMessage::Error {
                                    message: "Jugador no encontrado".to_string(),
                                }).await;
                                return;
                            }
                        };

                        // Con una carta a deber no se muestra nada: el set
                        // tiene un hueco y no puede estar completo.
                        if game_state.players[player_idx].owes_card() {
                            return;
                        }

                        // Alternar el estado del set
                        let new_flipped = !game_state.players[player_idx].flipped_sets[set_index];
                        game_state.players[player_idx].flipped_sets[set_index] = new_flipped;

                        let player_nickname = game_state.players[player_idx].nickname.clone();

                        // Si está volteado: enviar la primera carta; si no: lista vacía
                        let cards: Vec<CardInfo> = if new_flipped {
                            game_state.players[player_idx].sets[set_index][0]
                                .map(|c| vec![CardInfo::from(c)])
                                .unwrap_or_default()
                        } else {
                            vec![]
                        };

                        (player_nickname, new_flipped, cards)
                    };

                    let (player_nickname, _is_flipped, cards) = flip_data;
                    let lobby_id_owned = lobby_id.clone();

                    state.lobby_manager.update_lobby(lobby).await;

                    state.broadcast_to_lobby(&lobby_id_owned, ServerMessage::SetFlipped {
                        player: player_nickname,
                        set_index,
                        cards,
                    }).await;
                } else {
                    state.send_to_player(&player_id, ServerMessage::Error {
                        message: "Lobby no encontrado".to_string(),
                    }).await;
                }
            } else {
                state.send_to_player(&player_id, ServerMessage::Error {
                    message: "No estás en una partida".to_string(),
                }).await;
            }
        }

        ClientMessage::QteClick => {
            let Some(ref lobby_id) = *current_lobby else { return };
            // `mutate` y no `get_lobby` + `update_lobby`: esto llega cada pocas
            // decenas de milisegundos mientras alguien machaca, y volcar una
            // copia entera de la sala borraba lo que hubiera escrito otro
            // mensaje entre medias. Así se perdían las rendiciones.
            state.lobby_manager.mutate(lobby_id, |lobby| {
                let Some(gs) = lobby.game_state.as_mut() else { return };
                // El click va a LA pelea de quien lo manda, no a la única que
                // hubiera guardada. Con dos peleas a la vez, buscar "la pelea
                // activa" hacía que los clicks de una de las dos parejas no
                // contaran absolutamente nada.
                let mia = gs.active_qtes.iter_mut()
                    .find(|q| q.participants.iter().any(|(id, _)| *id == player_id));
                if let Some(qte) = mia {
                    *qte.clicks.entry(player_id).or_insert(0) += 1;
                }
            }).await;
        }

        // ── Soltar el frenesí ──
        //
        // Bloquea 2 s a todo el mundo, salvo a quien tenga el suyo cargado: a
        // ése se le gasta el suyo y se queda libre. Por eso llegar a x5 no es
        // solo un premio, es también un seguro — y guardarlo o gastarlo es una
        // decisión de verdad, porque soltarlo cuesta la racha entera.
        ClientMessage::Frenzy => {
            let Some(ref lobby_id) = *current_lobby else { return };
            let Some(mut lobby) = state.lobby_manager.get_lobby(lobby_id).await else { return };

            let resultado = {
                let Some(gs) = lobby.game_state.as_mut() else { return };
                let Some(yo) = gs.players.iter().position(|p| p.id == player_id) else { return };
                if !gs.players[yo].spend_frenzy() {
                    None
                } else {
                    let nombre = gs.players[yo].nickname.clone();
                    let mut pararon = Vec::new();
                    let mut bloqueados = Vec::new();
                    for i in 0..gs.players.len() {
                        if i == yo || gs.players[i].finished_position.is_some() { continue; }
                        if gs.players[i].spend_frenzy() {
                            pararon.push((gs.players[i].id, gs.players[i].nickname.clone()));
                        } else {
                            bloqueados.push((gs.players[i].id, gs.players[i].nickname.clone()));
                        }
                    }
                    Some((nombre, pararon, bloqueados))
                }
            };

            let Some((nombre, pararon, bloqueados)) = resultado else {
                state.send_to_player(&player_id, ServerMessage::Error {
                    message: "No tienes frenesí".to_string(),
                }).await;
                return;
            };

            for (id, _) in &bloqueados {
                lobby.stun_player_for(id, FRENZY_STUN);
            }

            // Quien lo soltó y quienes lo pararon se quedan sin racha: hay que
            // decírselo o el multiplicador se les queda pintado en pantalla.
            let mut avisos = Vec::new();
            if let Some(gs) = lobby.game_state.as_ref() {
                for id in std::iter::once(&player_id).chain(pararon.iter().map(|(id, _)| id)) {
                    if let Some(p) = gs.players.iter().find(|p| p.id == *id) {
                        avisos.push((*id, combo_update_for(p, 0)));
                    }
                }
            }
            state.lobby_manager.update_lobby(lobby).await;

            for (id, msg) in avisos {
                state.send_to_player(&id, msg).await;
            }
            for (id, _) in &bloqueados {
                state.send_to_player(id, ServerMessage::Stunned {
                    ms: FRENZY_STUN.as_millis() as u64,
                }).await;
            }
            state.broadcast_to_lobby(lobby_id, ServerMessage::FrenzyFired {
                player: nombre,
                countered: pararon.into_iter().map(|(_, n)| n).collect(),
                stunned: bloqueados.into_iter().map(|(_, n)| n).collect(),
            }).await;
        }

        // ── Ceder la carta que se está peleando ──
        //
        // Una pelea dura 3 s a base de machacar la pantalla. Cuando ya se ve
        // que la pierdes, esos 3 s no deciden nada: solo te tienen ocupado.
        // Esto la termina ya, el otro se lleva la carta, y tú vuelves a jugar.
        //
        // Se busca LA pelea de quien lo manda, igual que hace `QteClick`: con
        // dos peleas a la vez, coger "la pelea activa" mandaba la rendición a
        // la pareja equivocada.
        ClientMessage::GiveUpCard => {
            let Some(ref lobby_id) = *current_lobby else { return };
            let cedida = state.lobby_manager.mutate(lobby_id, |lobby| {
                let Some(gs) = lobby.game_state.as_mut() else { return false };
                let mia = gs.active_qtes.iter_mut()
                    .find(|q| q.participants.iter().any(|(id, _)| *id == player_id));
                match mia {
                    Some(qte) if qte.conceded_by.is_none() => {
                        qte.conceded_by = Some(player_id);
                        true
                    }
                    _ => false,
                }
            }).await.unwrap_or(false);
            if cedida {
                tracing::info!("🏳️ {} cede la carta en {}", player_id, lobby_id);
            }
        }

        ClientMessage::ClientNote { kind, detail } => {
            // Ya quedó grabada arriba. Del `state` además se aprovecha para
            // comparar el tablero del cliente con el del servidor.
            if kind == "state" {
                if let Some(lobby_id) = current_lobby.as_deref() {
                    check_desync(state, player_id, lobby_id, &detail).await;
                }
            }
        }

        ClientMessage::Ping { rtt_ms } => {
            // El cliente es el único que puede medir su ida y vuelta, así que
            // manda la medida anterior pegada al siguiente ping.
            if let Some(rtt) = rtt_ms {
                state.rec_ping(&player_id, rtt).await;
            }
            state.send_to_player(&player_id, ServerMessage::Pong).await;
        }
    }
}

/// Ejecuta la verificación con delays de 1s entre sets
async fn run_verification(
    state: AppState,
    lobby_id: String,
    player_id: Uuid,
    player_nickname: String,
    sets: [[Option<Card>; 4]; 6],
) {
    let mut failed_sets: Vec<usize> = Vec::new();

    for set_idx in 0..6 {
        sleep(Duration::from_millis(1000)).await;

        // Un set con un hueco sin tapar no puede ser válido.
        let set = sets[set_idx];
        let is_valid = match set[0] {
            Some(first) => set.iter()
                .all(|slot| matches!(slot, Some(c) if c.clothing_type == first.clothing_type)),
            None => false,
        };
        let cards: Vec<CardInfo> = set.iter().filter_map(|slot| slot.map(CardInfo::from)).collect();

        state.broadcast_to_lobby(&lobby_id, ServerMessage::SetVerificationResult {
            player: player_nickname.clone(),
            set_index: set_idx,
            is_valid,
            cards,
        }).await;

        if !is_valid {
            failed_sets.push(set_idx);
        }
    }

    if failed_sets.is_empty() {
        // Todos los sets son correctos → asignar posición
        if let Some(mut lobby) = state.lobby_manager.get_lobby(&lobby_id).await {
            if let Some(game_state) = lobby.game_state.as_mut() {
                let position = game_state.rankings.len() as u8 + 1;

                if let Some(player) = game_state.find_player_mut(&player_id) {
                    player.is_verifying = false;
                    player.finished_position = Some(position);
                }
                game_state.rankings.push(player_id);

                let game_over = game_state.is_finished();
                let rankings_snapshot: Vec<(Uuid, String, u32, u32, u32)> = game_state.rankings.iter()
                    .filter_map(|pid| {
                        game_state.players.iter().find(|p| p.id == *pid)
                            .map(|p| (*pid, p.nickname.clone(), p.combo_points, p.best_combo,
                                      p.best_mult_x100))
                    })
                    .collect();

                // El Elo se liquida aquí, con el estado aún vivo: hace falta
                // saber también cómo iban quienes no terminaron.
                let elo = if game_over { state.ratings.settle(&lobby.final_seats()) } else { Vec::new() };
                for c in &elo {
                    tracing::info!("🏆 {} {:?}: {} → {}", c.nickname, c.pool, c.before, c.after);
                }

                state.lobby_manager.update_lobby(lobby).await;

                state.broadcast_to_lobby(&lobby_id, ServerMessage::VerificationSuccess {
                    player: player_nickname,
                    position,
                }).await;

                if game_over {
                    // El combo suma *encima* del puesto, no lo sustituye: ganar
                    // la carrera sigue siendo lo que más puntúa, y la racha es
                    // el premio por jugarla deprisa.
                    let rankings: Vec<RankingEntry> = rankings_snapshot.iter().enumerate()
                        .map(|(idx, (_, nickname, combo_points, best_combo, best_mult))| RankingEntry {
                            position: idx as u8 + 1,
                            nickname: nickname.clone(),
                            points: calculate_points(idx as u8 + 1) + combo_points,
                            combo_points: *combo_points,
                            best_combo: *best_combo,
                            best_mult_x100: *best_mult,
                        })
                        .collect();

                    state.broadcast_to_lobby(&lobby_id, ServerMessage::GameOver {
                        rankings,
                        elo,
                    }).await;

                    // Cerrar la grabación AQUÍ: el `GameOver` de arriba ya
                    // guardó el fotograma final mientras el estado existía, y
                    // tres líneas más abajo se destruye.
                    state.rec_close(&lobby_id, "game_over").await;

                    // Resetear lobby para siguiente ronda
                    if let Some(mut lobby) = state.lobby_manager.get_lobby(&lobby_id).await {
                        lobby.game_state = None;
                        lobby.status = LobbyStatus::Waiting;
                        for player in lobby.players.iter_mut() {
                            player.is_ready = false;
                        }
                        // Quien estaba mirando se sienta a la mesa: la sala ya
                        // no juega, así que seguir de mirón no significaría
                        // nada. Los que no quepan salen.
                        let sin_sitio = lobby.promote_spectators();
                        let player_infos: Vec<PlayerInfo> = lobby.players.iter().map(|p| PlayerInfo {
                            id: p.id.to_string(),
                            nickname: p.nickname.clone(),
                            is_ready: false,
                            is_bot: p.is_bot,
                        }).collect();
                        let max_players = lobby.max_players;
                        state.lobby_manager.update_lobby(lobby).await;
                        // Limpiar intents de swap del lobby terminado
                        state.take_intents.write().await.remove(&lobby_id);
                        state.broadcast_to_lobby(&lobby_id, ServerMessage::LobbyUpdate {
                            players: player_infos,
                            ready_count: 0,
                            max_players,
                            spectators: 0,
                        }).await;
                        for s in &sin_sitio {
                            state.send_to_player(&s.id, ServerMessage::Error {
                                message: "La sala se llenó al acabar la partida".to_string(),
                            }).await;
                        }
                        send_seat_tokens(&state, &lobby_id).await;
                    }
                }
            }
        }
    } else {
        // Verificación fallida → limpiar estado y desoltear sets incorrectos
        if let Some(mut lobby) = state.lobby_manager.get_lobby(&lobby_id).await {
            if let Some(game_state) = lobby.game_state.as_mut() {
                if let Some(player) = game_state.find_player_mut(&player_id) {
                    player.is_verifying = false;
                    // Desoltear los sets fallidos para que el jugador deba re-voltearlos
                    for &set_idx in &failed_sets {
                        player.flipped_sets[set_idx] = false;
                    }
                }
            }
            state.lobby_manager.update_lobby(lobby).await;
        }

        // Broadcast desoltear cada set fallido
        for &set_idx in &failed_sets {
            state.broadcast_to_lobby(&lobby_id, ServerMessage::SetFlipped {
                player: player_nickname.clone(),
                set_index: set_idx,
                cards: vec![],  // Vacío = desolteado
            }).await;
        }

        state.broadcast_to_lobby(&lobby_id, ServerMessage::VerificationFailed {
            player: player_nickname,
            failed_sets,
        }).await;
    }
}

/// Coge la carta una vez pasada la ventana de conflicto, si sigue disponible.
async fn execute_delayed_take(
    state: AppState,
    lobby_id: String,
    card_id: u32,
    player_id: Uuid,
) {
    {
        // Si el intent ya no es nuestro, es que se convirtió en pelea.
        let mut intents = state.take_intents.write().await;
        let mine = intents.get(&lobby_id)
            .and_then(|m| m.get(&card_id))
            .map(|i| i.player_id == player_id)
            .unwrap_or(false);
        if !mine { return; }
        if let Some(m) = intents.get_mut(&lobby_id) { m.remove(&card_id); }
    }

    let Some(mut lobby) = state.lobby_manager.get_lobby(&lobby_id).await else { return };
    let (taken, combo_msg) = {
        let Some(game_state) = lobby.game_state.as_mut() else { return };
        if qte_blocks(game_state, player_id, Some(card_id)) { return; }
        let taken = take_card_into_slot(game_state, player_id, card_id);
        // Coger una carta mantiene el ritmo; si además cierra un set, suma más.
        let combo_msg = match &taken {
            Some((_, _, completed, gain)) =>
                award_combo(game_state, &player_id, *gain, *completed),
            None => None,
        };
        (taken, combo_msg)
    };

    let Some((set_index, new_set, _completed, _gain)) = taken else {
        // Otro se la llevó mientras esperábamos: se sigue debiendo una.
        state.send_to_player(&player_id, ServerMessage::SwapFailed {
            reason: "Esa carta ya no está".to_string(), kind: "gone".to_string(),
        }).await;
        return;
    };

    // snapshot() después de award_combo, para que `on_fire` salga ya actualizado.
    let (new_center, players_progress, mirones) = snapshot(&lobby);
    state.lobby_manager.update_lobby(lobby).await;

    state.send_to_player(&player_id, ServerMessage::SwapSuccess {
        set_index,
        your_new_set: Some(new_set),
        center_cards: new_center.clone(),
    }).await;
    if let Some(msg) = combo_msg {
        state.send_to_player(&player_id, msg).await;
    }
    state.broadcast_to_lobby(&lobby_id, ServerMessage::GameUpdate {
        center_cards: new_center,
        players_progress,
        spectators: mirones,
    }).await;
}

/// Borra los intentos de coger carta que tuviera ese jugador pendientes.
///
/// Un intento vive 300 ms y es lo que convierte en pelea que otro vaya a por la
/// misma carta. Si mientras tanto la deuda del jugador se salda por otro camino
/// —el plazo de 3 s, por ejemplo—, el intento se queda ahí sin dueño válido: la
/// pelea arranca igual y su "ganador" ya no tiene hueco donde meter la carta.
/// Esa era la causa de que una pelea acabara sin premio y, antes del arreglo de
/// `run_qte`, dejara a todo el mundo colgado.
async fn clear_intents_for(state: &AppState, lobby_id: &str, player_id: &Uuid) {
    let mut intents = state.take_intents.write().await;
    if let Some(per_card) = intents.get_mut(lobby_id) {
        per_card.retain(|_, i| i.player_id != *player_id);
    }
}

/// Mete al jugador en una sala recién creada y le confirma. Lo comparten
/// `CreateLobby` y `QuickMatch`, que hacen exactamente lo mismo una vez que la
/// sala existe.
/// Apunta de quién es el Elo de este jugador. Una clave mal formada se ignora:
/// se juega igual, sin Elo.
async fn remember_rating_key(state: &AppState, lobby_id: &str, player_id: Uuid, key: Option<String>) {
    let Some(key) = key.filter(|k| crate::ratings::valid_key(k)) else { return };
    let Some(mut lobby) = state.lobby_manager.get_lobby(lobby_id).await else { return };
    if let Some(p) = lobby.players.iter_mut().chain(lobby.spectators.iter_mut())
        .find(|p| p.id == player_id)
    {
        p.rating_key = Some(key);
    }
    state.lobby_manager.update_lobby(lobby).await;
}

/// Le manda su secreto de asiento a quien se acaba de sentar a jugar. Los
/// mirones no tienen asiento y no reciben nada. Por `send_to_player`, que no
/// lo graba (ver `rec_private`).
async fn send_seat_token(state: &AppState, lobby: &crate::game::Lobby, player_id: Uuid) {
    let Some(token) = lobby.players.iter()
        .find(|p| p.id == player_id)
        .and_then(|p| p.seat_token.clone())
    else { return };
    state.send_to_player(&player_id, ServerMessage::SeatToken {
        lobby_id: lobby.id.clone(),
        token,
    }).await;
}

async fn enter_new_lobby(
    state: &AppState,
    player_id: Uuid,
    current_lobby: &mut Option<String>,
    lobby_id: &str,
    nickname: String,
    rating_key: Option<String>,
) {
    // Sala recién creada: está vacía, no hay ningún sitio que reclamar.
    let live = std::collections::HashSet::new();
    match state.lobby_manager.join_lobby(lobby_id, player_id, nickname, &live).await {
        Ok((lobby, _)) => {
            *current_lobby = Some(lobby_id.to_string());
            remember_rating_key(state, lobby_id, player_id, rating_key).await;
            state.send_to_player(&player_id, ServerMessage::LobbyCreated {
                lobby_id: lobby_id.to_string(),
                player_id: player_id.to_string(),
            }).await;
            send_seat_token(state, &lobby, player_id).await;
            send_lobby_update(state, lobby_id).await;
        }
        Err(e) => {
            state.send_to_player(&player_id, ServerMessage::Error { message: e }).await;
        }
    }
}

/// Vigila la deuda de un jugador y, si se le pasa el plazo, le asigna una carta.
///
/// Se reprograma en vez de disparar a ciegas: mientras esté bloqueado por haber
/// perdido una pelea el reloj no corre, y mientras haya una pelea en marcha
/// tampoco —la carta en disputa es justo la que se está resolviendo—. Si la
/// deuda se salda antes, la tarea se va sin hacer nada.
async fn run_debt_deadline(state: AppState, lobby_id: String, player_id: Uuid) {
    let mut wait = DEBT_DEADLINE;
    // Cuántas veces se ha aplazado el plazo por un toque a tiempo. Tope por si
    // alguien lo estirara a base de intentos.
    let mut aplazos = 0;
    loop {
        sleep(wait).await;

        let Some(mut lobby) = state.lobby_manager.get_lobby(&lobby_id).await else { return };
        if lobby.status != LobbyStatus::Playing {
            return;
        }
        // Bloqueado: el plazo se reanuda cuando pueda volver a jugar.
        if let Some(left) = lobby.stun_remaining(&player_id) {
            wait = left + DEBT_DEADLINE;
            continue;
        }
        {
            let Some(gs) = lobby.game_state.as_ref() else { return };
            // Solo se pausa el plazo de quien está peleando. Al resto no les
            // afecta la pelea, así que su cuenta atrás sigue corriendo.
            if qte_blocks(gs, player_id, None) {
                wait = Duration::from_millis(500);
                continue;
            }
            let Some(p) = gs.players.iter().find(|p| p.id == player_id) else { return };
            // Ya la tapó: nada que forzar.
            if !p.owes_card() {
                return;
            }
            // Soltó otra carta después: manda el plazo de esa deuda.
            match p.owed_since {
                Some(since) if since.elapsed() >= DEBT_DEADLINE => {}
                Some(since) => {
                    wait = DEBT_DEADLINE.saturating_sub(since.elapsed());
                    continue;
                }
                None => return,
            }
        }

        // Un toque a tiempo no puede perder contra el reloj. Coger espera
        // `CONFLICT_WINDOW` (por si otro va a por la misma carta), así que uno
        // mandado en el último instante llega al servidor DENTRO del plazo y se
        // ejecuta justo DESPUÉS: aquí se fuerzaba una carta al azar y
        // `clear_intents_for` le borraba el intento. Si hay uno vivo, se espera
        // a que se resuelva: si coge, ya no debe nada; si no, se fuerza.
        if aplazos < 3 {
            let vivo = {
                let intents = state.take_intents.read().await;
                intents.get(&lobby_id)
                    .is_some_and(|m| has_pending_take(m, &player_id, CONFLICT_WINDOW))
            };
            if vivo {
                aplazos += 1;
                wait = CONFLICT_WINDOW + Duration::from_millis(100);
                continue;
            }
        }

        let forced = {
            let Some(gs) = lobby.game_state.as_mut() else { return };
            if gs.center_cards.is_empty() {
                return;   // nada que asignar; se reintentará al soltar alguien
            }
            let pick = {
                use rand::Rng;
                let n = gs.center_cards.len();
                gs.center_cards[rand::thread_rng().gen_range(0..n)]
            };
            // Por el mismo camino que una cogida normal, para que el combo, el
            // set completado y el aviso se comporten igual.
            take_card_into_slot(gs, player_id, pick.id).map(|taken| (pick, taken))
        };
        let Some((card, (set_index, new_set, completed, gain))) = forced else { return };

        let combo_msg = {
            let Some(gs) = lobby.game_state.as_mut() else { return };
            gs.find_player_mut(&player_id).map(|p| p.owed_since = None);
            // La carta que asigna el plazo cuenta como cualquier otra: si diera
            // de más, dejar correr los 3 s sería la forma barata de subir.
            award_combo(gs, &player_id, gain, completed)
        };

        let (new_center, players_progress, mirones) = snapshot(&lobby);
        let nickname = lobby.players.iter()
            .find(|p| p.id == player_id)
            .map(|p| p.nickname.clone())
            .unwrap_or_default();
        state.lobby_manager.update_lobby(lobby).await;
        // Ya no debe nada: cualquier intento suyo que siguiera vivo provocaría
        // una pelea que no podría ganar, porque no le queda hueco.
        clear_intents_for(&state, &lobby_id, &player_id).await;

        tracing::info!("⏱️ a {} se le acabó el plazo: carta {} asignada", nickname, card.id);
        state.send_to_player(&player_id, ServerMessage::DebtForced {
            card: CardInfo::from(card),
        }).await;
        state.send_to_player(&player_id, ServerMessage::SwapSuccess {
            set_index,
            your_new_set: Some(new_set),
            center_cards: new_center.clone(),
        }).await;
        if let Some(msg) = combo_msg {
            state.send_to_player(&player_id, msg).await;
        }
        state.broadcast_to_lobby(&lobby_id, ServerMessage::GameUpdate {
            center_cards: new_center,
            players_progress,
            spectators: mirones,
        }).await;
        return;
    }
}

/// Manda su secreto a cada persona sentada. Hace falta tras `promote_spectators`
/// (los mirones que se sientan al acabar la partida no tenían ninguno); a quien
/// ya lo tenía se le repite el mismo, que no cuesta nada.
async fn send_seat_tokens(state: &AppState, lobby_id: &str) {
    let Some(lobby) = state.lobby_manager.get_lobby(lobby_id).await else { return };
    for p in lobby.players.iter().filter(|p| !p.is_bot) {
        send_seat_token(state, &lobby, p.id).await;
    }
}

/// ¿Tiene este jugador un intento de coger vivo (dentro de la ventana de
/// conflicto)? Lo mira el plazo de la deuda antes de forzar una carta.
fn has_pending_take(intents: &HashMap<u32, TakeIntent>, player: &Uuid, within: Duration) -> bool {
    intents.values().any(|i| i.player_id == *player && i.timestamp.elapsed() < within)
}

/// Corta la partida y devuelve a todos a la sala. Una caída la cancela cuando,
/// agotado el plazo de gracia, no quedan dos jugadores o ninguna persona.
async fn cancel_match(state: &AppState, lobby_id: &str, because_of: &str) {
    state.rec_line_lobby(lobby_id, "conn", serde_json::json!({
        "kind": "cancel", "por": because_of,
    })).await;
    state.rec_close(lobby_id, "cancelled").await;
    let Some(mut lobby) = state.lobby_manager.get_lobby(lobby_id).await else { return };
    lobby.game_state = None;
    lobby.status = LobbyStatus::Waiting;
    // Por remove_player y no con retain: si la sala se queda sin nadie,
    // remove_player la fecha como vacía y así se puede reciclar.
    let caidos: Vec<Uuid> = lobby.players.iter()
        .filter(|p| p.disconnected_at.is_some())
        .map(|p| p.id)
        .collect();
    for id in &caidos {
        lobby.remove_player(id);
    }
    for p in lobby.players.iter_mut() {
        p.is_ready = false;
    }
    // La sala vuelve a estar en espera, así que los mirones se sientan.
    let sin_sitio = lobby.promote_spectators();
    let player_infos: Vec<PlayerInfo> = lobby.players.iter().map(|p| PlayerInfo {
        id: p.id.to_string(),
        nickname: p.nickname.clone(),
        is_ready: false,
        is_bot: p.is_bot,
    }).collect();
    let max_players = lobby.max_players;
    state.lobby_manager.update_lobby(lobby).await;
    state.take_intents.write().await.remove(lobby_id);

    state.broadcast_to_lobby(lobby_id, ServerMessage::GameCancelled {
        reason: format!("{because_of} se desconectó"),
    }).await;
    state.broadcast_to_lobby(lobby_id, ServerMessage::LobbyUpdate {
        players: player_infos,
        ready_count: 0,
        max_players,
        spectators: 0,
    }).await;
    for s in &sin_sitio {
        state.send_to_player(&s.id, ServerMessage::Error {
            message: "La sala se llenó al acabar la partida".to_string(),
        }).await;
    }
    send_seat_tokens(state, lobby_id).await;
    retire_orphan_bots(state, lobby_id).await;
}

/// Espera a quien se cayó y, si no vuelve, redimensiona la partida.
///
/// Si vuelve, `rebind_seat` le cambia el id, así que este id ya no existe en
/// el lobby y la tarea se va sin hacer nada — no hace falta cancelarla desde
/// fuera.
///
/// Es aquí, y no en el momento de la caída, donde se decide si la partida se
/// cancela: antes se cancelaba al instante cuando se caía la única persona (o
/// quedaba una sola), y quien volvía a los pocos segundos ya no tenía partida.
async fn run_grace_period(state: AppState, lobby_id: String, player_id: Uuid) {
    sleep(GRACE_PERIOD).await;

    let Some(mut lobby) = state.lobby_manager.get_lobby(&lobby_id).await else { return };
    // ¿Sigue esperándose a este mismo id?
    if !lobby.players.iter().any(|p| p.id == player_id && p.disconnected_at.is_some()) {
        state.rec_line_player(&player_id, "conn", serde_json::json!({
            "kind": "grace_end", "result": "volvio",
        })).await;
        return;
    }
    // La partida pudo acabar o cancelarse mientras esperábamos. Entonces no
    // hay nada que redimensionar, pero al que no volvió hay que sacarlo igual:
    // si se queda, sigue contando como jugador y, con `is_ready` en false,
    // bloquea la siguiente ronda para siempre — nadie volvería a poder empezar.
    if lobby.status != LobbyStatus::Playing || lobby.game_state.is_none() {
        // remove_player y no retain: fecha la sala como vacía si lo queda.
        lobby.remove_player(&player_id);
        let empty = lobby.players.is_empty();
        state.lobby_manager.update_lobby(lobby).await;
        if !empty {
            send_lobby_update(&state, &lobby_id).await;
        }
        retire_orphan_bots(&state, &lobby_id).await;
        return;
    }

    let nickname = lobby.players.iter()
        .find(|p| p.id == player_id)
        .map(|p| p.nickname.clone())
        .unwrap_or_default();

    // Sin dos jugadores, o sin ninguna persona, no hay partida que sostener.
    // Los bots cuentan como conectados: sin la segunda condición, 1 persona +
    // 2 bots seguían jugando entre ellos sin nadie mirando.
    let hay_persona = lobby.players.iter().any(|p| !p.is_bot && p.disconnected_at.is_none());
    if lobby.connected_count() < 2 || !hay_persona {
        cancel_match(&state, &lobby_id, &nickname).await;
        return;
    }

    // Retirar prendas enteras en vez de borrar sus cartas sueltas: quitar 24
    // cartas repartidas entre ~20 prendas rompe esas 20 para siempre, porque
    // cada prenda necesita sus 4 cartas exactas.
    let retired: Vec<String> = {
        let game = lobby.game_state.as_mut().expect("comprobado arriba");
        let outcome = crate::game::deck::retire_types_on_leave(game, &player_id);
        tracing::info!(
            "🧺 {} no volvió: {} prendas retiradas, {} cartas al centro, {} huecos",
            nickname, outcome.retired_types.len(),
            outcome.returned_to_center, outcome.holes_punched
        );
        outcome.retired_types.iter()
            .map(|t| get_clothing_name(*t).to_string())
            .collect()
    };
    lobby.players.retain(|p| p.id != player_id);
    state.rec_line_lobby(&lobby_id, "conn", serde_json::json!({
        "kind": "grace_end", "result": "retirado", "player": nickname,
        "prendas": retired.len(),
    })).await;

    // El estado propio de cada uno puede haber cambiado (un hueco por una
    // prenda retirada), así que se reenvía antes del resumen común.
    let per_player: Vec<(Uuid, Vec<Vec<Option<CardInfo>>>)> = lobby.game_state.as_ref()
        .map(|g| g.players.iter()
            .map(|p| (p.id, p.sets.iter().map(|s| set_to_info(s)).collect()))
            .collect())
        .unwrap_or_default();
    let (new_center, players_progress, mirones) = snapshot(&lobby);
    state.lobby_manager.update_lobby(lobby).await;
    state.take_intents.write().await.remove(&lobby_id);

    for (pid, your_sets) in per_player {
        state.send_to_player(&pid, ServerMessage::SetsResynced {
            your_sets,
            center_cards: new_center.clone(),
        }).await;
    }
    state.broadcast_to_lobby(&lobby_id, ServerMessage::PlayerLeft {
        nickname,
        retired,
    }).await;
    state.broadcast_to_lobby(&lobby_id, ServerMessage::GameUpdate {
        center_cards: new_center,
        players_progress,
        spectators: mirones,
    }).await;
}

/// ¿Le impide jugar a este jugador la pelea que haya en curso?
///
/// Solo a quien pelea, y solo sobre la carta en disputa. Antes una pelea
/// paraba la mesa entera: los otros dos jugadores se quedaban mirando aunque no
/// tuvieran nada que ver. Una pelea dura un instante, pero pasan a menudo, y
/// entre todas se comían buena parte de la partida de los demás.
fn qte_blocks(
    game_state: &crate::game::models::GameState,
    player_id: Uuid,
    card_id: Option<u32>,
) -> bool {
    // Te frena tu propia pelea, y la carta que se esté peleando frena a todos.
    // Las peleas ajenas por otras cartas no frenan a nadie.
    game_state.qte_of_player(&player_id).is_some()
        || card_id.is_some_and(|c| game_state.qte_for_card(c).is_some())
}

/// Saca la carta del centro y la mete en el hueco que ese jugador debe.
/// `None` si la carta ya no está o el jugador no debe nada.
///
/// El tercer valor dice si esa carta **completó** el set. Es el único sitio
/// donde una carta entra en un hueco, así que es también el único momento en
/// que un set puede pasar a estar completo: detectarlo aquí evita recalcularlo
/// por todos lados.
fn take_card_into_slot(
    game_state: &mut crate::game::models::GameState,
    player_id: Uuid,
    card_id: u32,
) -> Option<(usize, Vec<Option<CardInfo>>, bool, u32)> {
    let idx = game_state.center_cards.iter().position(|c| c.id == card_id)?;
    let p = game_state.players.iter().position(|p| p.id == player_id)?;
    let (set_index, card_index) = game_state.players[p].owed_slot?;

    let was_complete = game_state.players[p].is_set_complete(set_index);
    let card = game_state.center_cards.remove(idx);

    // Cuánto vale para la racha se mide ANTES de colocarla: si no, la carta
    // recién puesta cuenta como "ya la tenía" y todo vale el doble.
    let gain = game_state.players[p].combo_gain_for_take(card.clothing_type, set_index);

    game_state.players[p].sets[set_index][card_index] = Some(card);
    game_state.players[p].owed_slot = None;
    game_state.players[p].owed_since = None;
    game_state.players[p].note_take(card.clothing_type, set_index);
    let completed = !was_complete && game_state.players[p].is_set_complete(set_index);
    Some((set_index, set_to_info(&game_state.players[p].sets[set_index]), completed, gain))
}

/// Suma eslabones a la racha y devuelve el aviso para ese jugador.
///
/// `base_gain` es lo que vale la jugada en sí, en centésimas de multiplicador.
/// Cerrar un set suma aparte, porque puede pasar a la vez.
fn award_combo(
    game_state: &mut crate::game::models::GameState,
    player_id: &Uuid,
    base_gain_x100: u32,
    completed_a_set: bool,
) -> Option<ServerMessage> {
    let p = game_state.find_player_mut(player_id)?;
    let gain = base_gain_x100 + if completed_a_set { COMBO_GAIN_SET_DONE_X100 } else { 0 };
    let points = p.add_combo(gain);
    Some(combo_update_for(p, points))
}

/// El aviso de racha tal y como lo ve su dueño.
fn combo_update_for(p: &crate::game::models::PlayerState, points: u32) -> ServerMessage {
    ServerMessage::ComboUpdate {
        combo: p.combo,
        multiplier_x100: p.combo_multiplier_x100(),
        window_ms: COMBO_WINDOW.as_millis() as u64,
        points,
        frenzy_ready: p.frenzy_ready,
        // Lo que costará el siguiente. Sube medio punto cada vez, y el jugador
        // tiene que poder verlo: si no, la barra parece que se atasca antes de
        // llenarse y no se entiende por qué.
        frenzy_cost_x100: p.frenzy_cost_x100(),
    }
}

/// Corta la racha (perder una pelea) y devuelve el aviso, si había algo que
/// cortar. Perder se castiga por regla y no esperando a que venza la ventana:
/// la ventana (4 s) dura más que el bloqueo (3 s), así que si no se cortara
/// aquí la racha sobreviviría a la derrota.
fn break_combo(
    game_state: &mut crate::game::models::GameState,
    player_id: &Uuid,
) -> Option<ServerMessage> {
    let p = game_state.find_player_mut(player_id)?;
    if p.combo == 0 {
        return None;
    }
    p.reset_combo();
    Some(ServerMessage::ComboUpdate {
        combo: 0,
        multiplier_x100: COMBO_BASE_X100,
        window_ms: 0,
        points: 0,
        // Un frenesí ya ganado no se pierde por perder una pelea.
        frenzy_ready: p.frenzy_ready,
        frenzy_cost_x100: p.frenzy_cost_x100(),
    })
}


/// Quién gana una pelea. Devuelve `(gana el primero, el perdedor había cedido)`.
///
/// Aparte para poder probarlo: el resto de la resolución vive dentro de una
/// función async con sockets de por medio, y estas tres reglas —ceder pierde,
/// los clicks deciden el resto, el empate va para el primero— son justo las que
/// no pueden salir mal en silencio.
fn decide_fight(
    qte: &crate::game::QteState,
    a: Uuid,
    b: Uuid,
) -> (bool, bool) {
    // Ceder pierde, se hubiera pulsado lo que se hubiera pulsado.
    if qte.conceded_by == Some(a) {
        return (false, true);
    }
    if qte.conceded_by == Some(b) {
        return (true, true);
    }
    let clicks_a = *qte.clicks.get(&a).unwrap_or(&0);
    let clicks_b = *qte.clicks.get(&b).unwrap_or(&0);
    (clicks_a >= clicks_b, false)
}

/// Ejecuta el QTE: envía updates cada 500ms y resuelve al finalizar
async fn run_qte(
    state: AppState,
    lobby_id: String,
    card_id: u32,
    p_a: QtePlayerData,
    p_b: QtePlayerData,
) {
    // Marcador cada tick hasta agotar la pelea, o menos si alguien cede.
    for _ in 0..(QTE_MS / QTE_TICK_MS) {
        sleep(Duration::from_millis(QTE_TICK_MS)).await;
        let mut cedida = false;
        if let Some(lobby) = state.lobby_manager.get_lobby(&lobby_id).await {
            if let Some(gs) = &lobby.game_state {
                // Solo la pelea de ESTA carta: si no, dos peleas a la vez se
                // pisaban los marcadores en pantalla.
                if let Some(qte) = gs.qte_for_card(card_id) {
                    cedida = qte.conceded_by.is_some();
                    let clicks: std::collections::HashMap<String, u32> = qte.participants.iter()
                        .map(|(id, name)| (name.clone(), *qte.clicks.get(id).unwrap_or(&0)))
                        .collect();
                    state.broadcast_to_lobby(&lobby_id, ServerMessage::QteUpdate { card_id, clicks }).await;
                }
            }
        }
        // Alguien se rindió: la pelea se acaba aquí. Se mira en el mismo bucle
        // que ya relee la sala, así que no hace falta ni un temporizador más.
        if cedida {
            break;
        }
    }

    // Resolver QTE: determinar ganador
    if let Some(mut lobby) = state.lobby_manager.get_lobby(&lobby_id).await {
        let outcome = {
            let game_state = match lobby.game_state.as_mut() {
                Some(gs) => gs,
                None => return,
            };
            // La pelea de ESTA carta. Coger "la pelea activa" resolvía la de
            // otra pareja con los participantes de ésta: el resultado salía 0-0
            // y ganaba quien estuviera primero en la lista.
            let qte = match game_state.take_qte_for_card(card_id) {
                Some(q) => q,
                None => return,
            };

            let (gana_a, cedio_el_perdedor) =
                decide_fight(&qte, p_a.player_id, p_b.player_id);
            let (winner, loser) = if gana_a {
                (p_a.clone(), p_b.clone())
            } else {
                (p_b.clone(), p_a.clone())
            };

            // El ganador se lleva la carta a su hueco.
            //
            // Puede fallar: si su deuda se saldó por otro camino mientras duraba
            // la pelea, ya no tiene hueco donde meterla. Antes aquí había un
            // `return` a secas y eso se saltaba el QteResolved de más abajo —
            // con lo que TODOS los clientes de esa pelea se quedaban con el
            // overlay abierto y sin poder jugar, para siempre. Una partida
            // medida así movió 92 cartas en dos minutos y luego nada en seis.
            // La pelea tiene que resolverse siempre, aunque no haya premio.
            // Se acabó la pelea: el reloj de la racha vuelve a correr donde se
            // quedó. Al perdedor se le corta igualmente más abajo, pero eso es
            // una regla del juego y no el reloj comiéndosela mientras peleaba.
            for (id, _) in &qte.participants {
                if let Some(p) = game_state.find_player_mut(id) { p.thaw_combo(); }
            }

            let awarded = take_card_into_slot(game_state, winner.player_id, card_id);

            // Ganar una pelea es la jugada que más queremos que se busque, así
            // que paga más eslabones que coger una carta sin disputa. Perder
            // corta la racha: la ventana dura más que el bloqueo, así que si no
            // se cortara aquí, perder no costaría la racha.
            //
            // Sin premio no hay ni racha ni castigo: una pelea que no reparte
            // carta no puede además bloquear al que la perdió.
            //
            // Ceder es otra cosa que perder: pierdes la carta, pero ni te corta
            // la racha ni te bloquea. Lo que compras rindiéndote son los
            // segundos que ibas a pasar machacando; si encima costara lo mismo
            // que perder, no habría ningún motivo para tocar la bandera.
            let (winner_combo, loser_combo) = match &awarded {
                Some((_, _, completed, _)) => (
                    award_combo(game_state, &winner.player_id, COMBO_GAIN_FIGHT_WON_X100, *completed),
                    if cedio_el_perdedor { None } else { break_combo(game_state, &loser.player_id) },
                ),
                None => (None, None),
            };

            let new_center: Vec<CardInfo> = game_state.center_cards.iter()
                .map(|&c| CardInfo::from(c)).collect();
            let players_progress: Vec<PlayerProgress> = game_state.players.iter()
                .map(|p| PlayerProgress {
                    nickname: p.nickname.clone(),
                    completed_sets: p.count_completed_sets(),
                    finished: p.finished_position.is_some(),
                    on_fire: p.is_on_fire(),
                }).collect();
            (winner, loser, awarded, new_center, players_progress,
             winner_combo, loser_combo, cedio_el_perdedor)
        };

        let (winner, loser, awarded, new_center, players_progress,
             winner_combo, loser_combo, cedio_el_perdedor) = outcome;
        if awarded.is_some() && !cedio_el_perdedor {
            // Perder cuesta unos segundos sin poder intercambiar. No hay ningún
            // mensaje de "has perdido": el tablero apagándose es el aviso.
            // Ceder no: el sentido de rendirse es volver a jugar YA.
            lobby.stun_player(&loser.player_id);
        } else if awarded.is_none() {
            tracing::warn!(
                "pelea por la carta {} sin premio: {} ya no tenía hueco; se resuelve sin carta ni bloqueo",
                card_id, winner.nickname
            );
        }
        let mirones = lobby.spectators.len();
        state.lobby_manager.update_lobby(lobby).await;

        // Broadcast: esta pelea se acabó. Va con la carta porque puede haber
        // otra en marcha, y quien esté en ésa no debe cerrar la suya.
        state.broadcast_to_lobby(&lobby_id, ServerMessage::QteResolved {
            card_id,
            winner: winner.nickname.clone(),
        }).await;

        // El reparto solo va si hubo premio. El QteResolved de arriba ya salió
        // pase lo que pase, que es lo que impide que nadie se quede colgado.
        if let Some((winner_set, winner_new_set, _, _)) = awarded {
            state.send_to_player(&winner.player_id, ServerMessage::SwapSuccess {
                set_index: winner_set,
                your_new_set: Some(winner_new_set),
                center_cards: new_center.clone(),
            }).await;
            if let Some(msg) = winner_combo {
                state.send_to_player(&winner.player_id, msg).await;
            }

            // Perdedor: swap_failed (el cliente no lo muestra) + el bloqueo.
            // Quien cedió se queda sin la carta pero sin bloqueo: vuelve a
            // jugar en el momento, que es justo lo que ha comprado.
            state.send_to_player(&loser.player_id, ServerMessage::SwapFailed {
                reason: "Perdiste la carta".to_string(), kind: "gone".to_string(),
            }).await;
            if !cedio_el_perdedor {
                state.send_to_player(&loser.player_id, ServerMessage::Stunned {
                    ms: STUN_DURATION.as_millis() as u64,
                }).await;
            }
            if let Some(msg) = loser_combo {
                state.send_to_player(&loser.player_id, msg).await;
            }
        }

        // Todos: actualización del centro
        state.broadcast_to_lobby(&lobby_id, ServerMessage::GameUpdate {
            center_cards: new_center,
            players_progress,
            spectators: mirones,
        }).await;
    }
}

fn calculate_points(position: u8) -> u32 {
    match position {
        1 => 100,
        2 => 75,
        3 => 50,
        _ => 25,
    }
}

/// Helper: Envía actualización del lobby a todos los jugadores
async fn send_lobby_update(state: &AppState, lobby_id: &str) {
    if let Some(lobby) = state.lobby_manager.get_lobby(lobby_id).await {
        let players: Vec<PlayerInfo> = lobby.players.iter().map(|p| PlayerInfo {
            id: p.id.to_string(),
            nickname: p.nickname.clone(),
            is_ready: p.is_ready,
            is_bot: p.is_bot,
        }).collect();

        let update_msg = ServerMessage::LobbyUpdate {
            players,
            ready_count: lobby.ready_count(),
            max_players: lobby.max_players,
            spectators: lobby.spectators.len(),
        };

        state.broadcast_to_lobby(lobby_id, update_msg).await;
    }
}

#[cfg(test)]
mod qte_scope_tests {
    use super::*;
    use crate::game::models::{Card, GameState, PlayerState, QteState};

    fn state_with_fight(fighters: [Uuid; 2], card_id: u32) -> GameState {
        let sets = [[Card::new(0, 1); 4]; 6];
        let players = fighters.iter()
            .map(|id| PlayerState::new(*id, "x".to_string(), sets))
            .collect();
        let mut gs = GameState::new(players, vec![Card::new(card_id, 3)]);
        gs.active_qtes.push(QteState {
            participants: fighters.iter().map(|id| (*id, "x".to_string())).collect(),
            card_id,
            clicks: std::collections::HashMap::new(),
            conceded_by: None,
        });
        gs
    }

    #[test]
    fn a_fight_stops_only_the_two_fighting() {
        let a = Uuid::new_v4();
        let b = Uuid::new_v4();
        let mirando = Uuid::new_v4();
        let gs = state_with_fight([a, b], 7);

        assert!(qte_blocks(&gs, a, None), "el que pelea no juega a la vez");
        assert!(qte_blocks(&gs, b, None));
        // Lo que rompía la partida a los demás: la mesa entera parada.
        assert!(!qte_blocks(&gs, mirando, None), "no tiene nada que ver con esa pelea");
    }

    #[test]
    fn the_contested_card_is_off_limits_to_everyone() {
        let a = Uuid::new_v4();
        let b = Uuid::new_v4();
        let mirando = Uuid::new_v4();
        let gs = state_with_fight([a, b], 7);

        assert!(qte_blocks(&gs, mirando, Some(7)), "se la llevaría en mitad de la pelea");
        assert!(!qte_blocks(&gs, mirando, Some(8)), "esa no la pelea nadie");
    }

    // ── Ceder la carta ──

    #[test]
    fn conceding_loses_the_card_however_hard_you_clicked() {
        // El caso que importa: te rindes DESPUÉS de haber pulsado más que el
        // otro. Si mandaran los clicks, ceder no serviría de nada.
        let a = Uuid::new_v4();
        let b = Uuid::new_v4();
        let mut gs = state_with_fight([a, b], 7);
        let qte = &mut gs.active_qtes[0];
        qte.clicks.insert(a, 30);
        qte.clicks.insert(b, 2);
        qte.conceded_by = Some(a);

        let (gana_a, cedio) = decide_fight(&gs.active_qtes[0], a, b);
        assert!(!gana_a, "quien cede pierde aunque llevara 30 a 2");
        assert!(cedio, "y consta que fue por rendirse");
    }

    #[test]
    fn without_a_concession_the_clicks_decide() {
        let a = Uuid::new_v4();
        let b = Uuid::new_v4();
        let mut gs = state_with_fight([a, b], 7);
        gs.active_qtes[0].clicks.insert(a, 4);
        gs.active_qtes[0].clicks.insert(b, 9);

        let (gana_a, cedio) = decide_fight(&gs.active_qtes[0], a, b);
        assert!(!gana_a, "gana quien más pulsó");
        assert!(!cedio, "nadie cedió: el perdedor sí se lleva bloqueo y corte de racha");
    }

    #[test]
    fn a_tie_goes_to_the_first_and_is_not_a_concession() {
        // El desempate por orden ya existía; lo que no puede pasar es que un
        // empate se confunda con una rendición y deje al perdedor sin castigo.
        let a = Uuid::new_v4();
        let b = Uuid::new_v4();
        let gs = state_with_fight([a, b], 7);
        let (gana_a, cedio) = decide_fight(&gs.active_qtes[0], a, b);
        assert!(gana_a);
        assert!(!cedio);
    }

    #[test]
    fn without_a_fight_nothing_is_blocked() {
        let a = Uuid::new_v4();
        let sets = [[Card::new(0, 1); 4]; 6];
        let gs = GameState::new(
            vec![PlayerState::new(a, "x".to_string(), sets)],
            vec![Card::new(7, 3)],
        );
        assert!(!qte_blocks(&gs, a, Some(7)));
    }
}

#[cfg(test)]
mod pending_take_tests {
    use super::*;

    fn intent(player: Uuid, hace: Duration) -> TakeIntent {
        TakeIntent {
            player_id: player,
            nickname: "x".into(),
            timestamp: Instant::now().checked_sub(hace).unwrap(),
        }
    }

    // El plazo de 3 s se comía un toque mandado en el último instante: coger
    // espera 300 ms y el reloj vencía dentro de esa espera.
    #[test]
    fn a_take_still_inside_its_window_holds_the_deadline() {
        let (yo, otro) = (Uuid::new_v4(), Uuid::new_v4());
        let mut m = HashMap::new();
        m.insert(7, intent(yo, Duration::from_millis(50)));
        assert!(has_pending_take(&m, &yo, CONFLICT_WINDOW));
        assert!(!has_pending_take(&m, &otro, CONFLICT_WINDOW), "el intento de otro no cuenta");
    }

    #[test]
    fn an_old_intent_does_not() {
        let yo = Uuid::new_v4();
        let mut m = HashMap::new();
        m.insert(7, intent(yo, Duration::from_millis(900)));
        assert!(!has_pending_take(&m, &yo, CONFLICT_WINDOW));
        assert!(!has_pending_take(&HashMap::new(), &yo, CONFLICT_WINDOW));
    }
}