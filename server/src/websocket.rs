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
    COMBO_WINDOW, COMBO_LINKS_TAKE, COMBO_LINKS_FIGHT_WON, COMBO_LINKS_SET_DONE,
    get_clothing_name,
};
use crate::game::lobby::GRACE_PERIOD;

/// Tipo para enviar mensajes a un cliente específico
type ClientSender = mpsc::UnboundedSender<ServerMessage>;

/// Alguien ha ido a por una carta del centro y estamos dentro de la ventana
/// en la que otro puede ir a por la misma.
#[derive(Debug, Clone)]
pub struct TakeIntent {
    player_id: Uuid,
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

/// Estado compartido de la aplicación
#[derive(Clone)]
pub struct AppState {
    pub lobby_manager: Arc<LobbyManager>,
    /// Mapa de player_id -> sender para broadcast
    pub connections: Arc<RwLock<HashMap<Uuid, ClientSender>>>,
    /// Intentos de coger carta: lobby_id -> card_id -> TakeIntent
    pub take_intents: Arc<RwLock<HashMap<String, HashMap<u32, TakeIntent>>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            lobby_manager: Arc::new(LobbyManager::new()),
            connections: Arc::new(RwLock::new(HashMap::new())),
            take_intents: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Envía un mensaje a todos los jugadores de un lobby
    async fn broadcast_to_lobby(&self, lobby_id: &str, message: ServerMessage) {
        if let Some(lobby) = self.lobby_manager.get_lobby(lobby_id).await {
            let connections = self.connections.read().await;

            for player in &lobby.players {
                if let Some(sender) = connections.get(&player.id) {
                    let _ = sender.send(message.clone());
                }
            }
        }
    }

    /// Envía un mensaje a un jugador específico
    async fn send_to_player(&self, player_id: &Uuid, message: ServerMessage) {
        let connections = self.connections.read().await;
        if let Some(sender) = connections.get(player_id) {
            let _ = sender.send(message);
        }
    }
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
                status: format!("{:?}", l.status),
            })
            .collect(),
    };
    let _ = tx.send(welcome_msg);

    // Loop principal de mensajes del cliente
    while let Some(msg) = ws_receiver.next().await {
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
                break;
            }
            Err(e) => {
                // "connection reset without closing handshake" es normal cuando el navegador
                // cierra la pestaña abruptamente — no es un error del servidor
                tracing::debug!("Conexión WebSocket cerrada abruptamente ({}): {}", player_id, e);
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

    // Si estaba en un lobby, decidir qué hacer con su sitio.
    if let Some(lobby_id) = &current_lobby {
        if let Some(mut lobby) = state.lobby_manager.get_lobby(lobby_id).await {
            // En plena partida NO se le quita el sitio: se le espera.
            //
            // Antes un solo corte de conexión cancelaba la partida de todos, y
            // lo hacía porque quitarle el sitio le borraba las 24 cartas — con
            // 4 cartas por prenda, eso dejaba media partida sin poder
            // completarse. Ahora sus cartas se quedan en la mesa, los demás
            // siguen jugando, y solo si no vuelve en GRACE_PERIOD se
            // redimensiona la partida retirando prendas enteras.
            if lobby.status == LobbyStatus::Playing {
                if let Some(nickname) = lobby.mark_disconnected(&player_id) {
                    tracing::info!(
                        "⏳ {} ({}) se cayó en partida; {}s para volver",
                        nickname, player_id, GRACE_PERIOD.as_secs()
                    );
                    let connected = lobby.connected_count();
                    state.lobby_manager.update_lobby(lobby).await;

                    state.broadcast_to_lobby(lobby_id, ServerMessage::PlayerDisconnected {
                        nickname: nickname.clone(),
                        seconds: GRACE_PERIOD.as_secs(),
                    }).await;

                    if connected < 2 {
                        // Sin dos personas no hay partida que sostener.
                        cancel_match(&state, lobby_id, &nickname).await;
                    } else {
                        tokio::spawn(run_grace_period(
                            state.clone(), lobby_id.clone(), player_id));
                    }
                }
                return;
            }

            if let Some(nickname) = lobby.remove_player(&player_id) {
                tracing::info!("🚪 {} ({}) salió del lobby {}", nickname, player_id, lobby_id);

                if lobby.players.is_empty() {
                    // Lobby vacío: guardarlo como Finished y limpiar intents
                    state.lobby_manager.update_lobby(lobby).await;
                    state.take_intents.write().await.remove(lobby_id);
                } else {
                    // En lobby normal: notificar actualización
                    let player_infos: Vec<PlayerInfo> = lobby.players.iter().map(|p| PlayerInfo {
                        id: p.id.to_string(),
                        nickname: p.nickname.clone(),
                        is_ready: p.is_ready,
                    }).collect();
                    let ready_count = lobby.ready_count();
                    let max_players = lobby.max_players;
                    let status = format!("{:?}", lobby.status).to_lowercase();
                    state.lobby_manager.update_lobby(lobby).await;

                    state.broadcast_to_lobby(lobby_id, ServerMessage::LobbyUpdate {
                        players: player_infos,
                        ready_count,
                        max_players,
                        status,
                    }).await;
                }
            }
        }
    }

    tracing::info!("🔌 Conexión WebSocket cerrada: {}", player_id);
}

/// Centro y progreso tal y como hay que mandarlos al cliente.
fn snapshot(lobby: &crate::game::Lobby) -> (Vec<CardInfo>, Vec<PlayerProgress>) {
    let Some(gs) = lobby.game_state.as_ref() else { return (vec![], vec![]) };
    let center = gs.center_cards.iter().map(|&c| CardInfo::from(c)).collect();
    let progress = gs.players.iter().map(|p| PlayerProgress {
        nickname: p.nickname.clone(),
        completed_sets: p.count_completed_sets(),
        finished: p.finished_position.is_some(),
        on_fire: p.is_on_fire(),
    }).collect();
    (center, progress)
}

/// Maneja un mensaje del cliente y envía respuestas vía broadcast
async fn handle_client_message(
    msg: ClientMessage,
    player_id: Uuid,
    current_lobby: &mut Option<String>,
    state: &AppState,
) {
    match msg {
        ClientMessage::CreateLobby { nickname, max_players, is_public } => {
            let lobby_id = state.lobby_manager.create_lobby(max_players, is_public).await;
            enter_new_lobby(state, player_id, current_lobby, &lobby_id, nickname).await;
        }

        ClientMessage::QuickMatch { nickname } => {
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
                        Ok(lobby) => {
                            *current_lobby = Some(lobby_id.clone());
                            let players: Vec<PlayerInfo> = lobby.players.iter()
                                .map(|p| PlayerInfo {
                                    id: p.id.to_string(),
                                    nickname: p.nickname.clone(),
                                    is_ready: p.is_ready,
                                }).collect();
                            state.send_to_player(&player_id, ServerMessage::JoinedLobby {
                                lobby_id: lobby_id.clone(),
                                player_id: player_id.to_string(),
                                players,
                            }).await;
                            send_lobby_update(state, &lobby_id).await;
                        }
                        Err(_) => {
                            // Se llenó o arrancó entre la consulta y la
                            // entrada: abrir una nueva en vez de dar error.
                            let fresh = state.lobby_manager.create_lobby(8, true).await;
                            enter_new_lobby(state, player_id, current_lobby, &fresh, nickname).await;
                        }
                    }
                }
                None => {
                    let fresh = state.lobby_manager.create_lobby(8, true).await;
                    enter_new_lobby(state, player_id, current_lobby, &fresh, nickname).await;
                }
            }
        }

        ClientMessage::JoinLobby { lobby_id, nickname } => {
            // ¿Es alguien a quien estamos esperando en una partida en curso?
            // Entonces no "entra": recupera su asiento y sus cartas. Pasar por
            // join_lobby lo trataría como nuevo y le borraría la mano.
            if let Some(mut lobby) = state.lobby_manager.get_lobby(&lobby_id).await {
                if lobby.status == LobbyStatus::Playing {
                    if let Some(old_id) = lobby.rebind_disconnected(&nickname, player_id) {
                        *current_lobby = Some(lobby_id.clone());
                        let resumed = lobby.game_state.as_ref()
                            .and_then(|g| g.players.iter().find(|p| p.id == player_id))
                            .map(|p| (
                                p.sets.iter().map(|s| set_to_info(s)).collect::<Vec<_>>(),
                                p.current_set_index,
                            ));
                        let names: Vec<String> = lobby.players.iter()
                            .map(|p| p.nickname.clone()).collect();
                        let infos: Vec<PlayerInfo> = lobby.players.iter().map(|p| PlayerInfo {
                            id: p.id.to_string(),
                            nickname: p.nickname.clone(),
                            is_ready: p.is_ready,
                        }).collect();
                        let (center, _) = snapshot(&lobby);
                        state.lobby_manager.update_lobby(lobby).await;
                        state.connections.write().await.remove(&old_id);

                        tracing::info!("↩️ {} volvió a la partida {}", nickname, lobby_id);
                        state.send_to_player(&player_id, ServerMessage::JoinedLobby {
                            lobby_id: lobby_id.clone(),
                            player_id: player_id.to_string(),
                            players: infos,
                        }).await;
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
                        send_lobby_update(&state, &lobby_id).await;
                        return;
                    }
                }
            }

            let live: std::collections::HashSet<Uuid> =
                state.connections.read().await.keys().copied().collect();
            match state.lobby_manager.join_lobby(&lobby_id, player_id, nickname, &live).await {
                Ok(lobby) => {
                    *current_lobby = Some(lobby_id.clone());

                    let players: Vec<PlayerInfo> = lobby.players.iter().map(|p| PlayerInfo {
                        id: p.id.to_string(),
                        nickname: p.nickname.clone(),
                        is_ready: p.is_ready,
                    }).collect();

                    // Enviar confirmación al jugador que se unió
                    state.send_to_player(&player_id, ServerMessage::JoinedLobby {
                        lobby_id: lobby_id.clone(),
                        player_id: player_id.to_string(),
                        players,
                    }).await;

                    // Broadcast actualización a todos los jugadores del lobby
                    send_lobby_update(&state, &lobby_id).await;
                }
                Err(e) => {
                    state.send_to_player(&player_id, ServerMessage::Error { message: e }).await;
                }
            }
        }

        ClientMessage::ListLobbies => {
            let lobbies = state.lobby_manager.list_available_lobbies().await;
            let lobby_infos: Vec<LobbyInfo> = lobbies.into_iter().map(|l| LobbyInfo {
                id: l.id,
                player_count: l.players.len(),
                max_players: l.max_players,
                status: format!("{:?}", l.status),
            }).collect();

            state.send_to_player(&player_id, ServerMessage::LobbyList { lobbies: lobby_infos }).await;
        }

        ClientMessage::SetReady { ready } => {
            if let Some(ref lobby_id) = current_lobby {
                if let Some(mut lobby) = state.lobby_manager.get_lobby(lobby_id).await {
                    match lobby.set_player_ready(&player_id, ready) {
                        Ok(_) => {
                            // Intentar iniciar el juego si todos están listos
                            if lobby.status == LobbyStatus::Ready {
                                if let Ok(_) = lobby.start_game() {
                                    // Juego iniciado, actualizar lobby
                                    state.lobby_manager.update_lobby(lobby.clone()).await;

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

                        player.current_set_index = set_index;
                        player.sets[set_index].iter()
                            .filter_map(|slot| slot.map(CardInfo::from))
                            .collect::<Vec<CardInfo>>()
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

            let result = {
                let Some(game_state) = lobby.game_state.as_mut() else { return };
                if game_state.active_qte.is_some() { return; }
                let Some(idx) = game_state.players.iter().position(|p| p.id == player_id) else { return };
                let player = &mut game_state.players[idx];
                if player.is_verifying || player.owes_card() { return; }

                let set_index = player.current_set_index;
                let Some(card) = player.sets[set_index][my_card_index].take() else { return };
                player.owed_slot = Some((set_index, my_card_index));
                game_state.center_cards.push(card);

                (set_index, set_to_info(&game_state.players[idx].sets[set_index]))
            };

            let (set_index, new_set) = result;
            let (new_center, players_progress) = snapshot(&lobby);
            let nickname = lobby.players.iter()
                .find(|p| p.id == player_id)
                .map(|p| p.nickname.clone())
                .unwrap_or_default();
            state.lobby_manager.update_lobby(lobby).await;

            state.send_to_player(&player_id, ServerMessage::SwapSuccess {
                player: nickname,
                set_index,
                your_new_set: Some(new_set),
                center_cards: new_center.clone(),
            }).await;
            state.broadcast_to_lobby(&lobby_id, ServerMessage::GameUpdate {
                center_cards: new_center,
                players_progress,
            }).await;
        }

        // ── Coger una carta del centro para tapar el hueco ──
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

            let nickname = {
                let Some(game_state) = lobby.game_state.as_ref() else { return };
                if game_state.active_qte.is_some() { return; }
                if !game_state.center_cards.iter().any(|c| c.id == card_id) { return; }
                let Some(p) = game_state.players.iter().find(|p| p.id == player_id) else { return };
                // Solo se coge para tapar un hueco: sin deuda no hay nada que
                // rellenar, y sin intercambio 1↔1 no hay otra forma de coger.
                if !p.owes_card() { return; }
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
                            gs.active_qte = Some(crate::game::QteState {
                                participants: vec![
                                    (me.player_id, me.nickname.clone()),
                                    (them.player_id, them.nickname.clone()),
                                ],
                                card_id,
                                clicks: std::collections::HashMap::new(),
                                duration_ms: 3000,
                            });
                        }
                        state.lobby_manager.update_lobby(lobby).await;
                    }

                    state.broadcast_to_lobby(&lobby_id, ServerMessage::SwapConflict {
                        players: vec![me.nickname.clone(), them.nickname.clone()],
                        card_id,
                        qte_duration: 3000,
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
            if let Some(ref lobby_id) = *current_lobby {
                if let Some(mut lobby) = state.lobby_manager.get_lobby(lobby_id).await {
                    let mut updated = false;
                    if let Some(gs) = lobby.game_state.as_mut() {
                        if let Some(qte) = gs.active_qte.as_mut() {
                            if qte.participants.iter().any(|(id, _)| *id == player_id) {
                                *qte.clicks.entry(player_id).or_insert(0) += 1;
                                updated = true;
                            }
                        }
                    }
                    if updated {
                        state.lobby_manager.update_lobby(lobby).await;
                    }
                }
            }
        }

        ClientMessage::Ping => {
            // Responder con Pong para mantener la conexión viva
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
                    player.finished_at = Some(Instant::now());
                    player.finished_position = Some(position);
                }
                game_state.rankings.push(player_id);

                let game_over = game_state.is_finished();
                let rankings_snapshot: Vec<(Uuid, String, u32, u32)> = game_state.rankings.iter()
                    .filter_map(|pid| {
                        game_state.players.iter().find(|p| p.id == *pid)
                            .map(|p| (*pid, p.nickname.clone(), p.combo_points, p.best_combo))
                    })
                    .collect();

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
                        .map(|(idx, (_, nickname, combo_points, best_combo))| RankingEntry {
                            position: idx as u8 + 1,
                            nickname: nickname.clone(),
                            points: calculate_points(idx as u8 + 1) + combo_points,
                            combo_points: *combo_points,
                            best_combo: *best_combo,
                        })
                        .collect();

                    state.broadcast_to_lobby(&lobby_id, ServerMessage::GameOver {
                        rankings,
                        your_total_points: None,
                    }).await;

                    // Resetear lobby para siguiente ronda
                    if let Some(mut lobby) = state.lobby_manager.get_lobby(&lobby_id).await {
                        lobby.game_state = None;
                        lobby.status = LobbyStatus::Waiting;
                        for player in lobby.players.iter_mut() {
                            player.is_ready = false;
                        }
                        let player_infos: Vec<PlayerInfo> = lobby.players.iter().map(|p| PlayerInfo {
                            id: p.id.to_string(),
                            nickname: p.nickname.clone(),
                            is_ready: false,
                        }).collect();
                        let max_players = lobby.max_players;
                        state.lobby_manager.update_lobby(lobby).await;
                        // Limpiar intents de swap del lobby terminado
                        state.take_intents.write().await.remove(&lobby_id);
                        state.broadcast_to_lobby(&lobby_id, ServerMessage::LobbyUpdate {
                            players: player_infos,
                            ready_count: 0,
                            max_players,
                            status: "waiting".to_string(),
                        }).await;
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
        if game_state.active_qte.is_some() { return; }
        let taken = take_card_into_slot(game_state, player_id, card_id);
        // Coger una carta mantiene el ritmo; si además cierra un set, suma más.
        let combo_msg = match &taken {
            Some((_, _, completed)) =>
                award_combo(game_state, &player_id, COMBO_LINKS_TAKE, *completed),
            None => None,
        };
        (taken, combo_msg)
    };

    let Some((set_index, new_set, _completed)) = taken else {
        // Otro se la llevó mientras esperábamos: se sigue debiendo una.
        state.send_to_player(&player_id, ServerMessage::SwapFailed {
            reason: "Esa carta ya no está".to_string(),
        }).await;
        return;
    };

    // snapshot() después de award_combo, para que `on_fire` salga ya actualizado.
    let (new_center, players_progress) = snapshot(&lobby);
    let nickname = lobby.players.iter()
        .find(|p| p.id == player_id)
        .map(|p| p.nickname.clone())
        .unwrap_or_default();
    state.lobby_manager.update_lobby(lobby).await;

    state.send_to_player(&player_id, ServerMessage::SwapSuccess {
        player: nickname,
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
    }).await;
}

/// Mete al jugador en una sala recién creada y le confirma. Lo comparten
/// `CreateLobby` y `QuickMatch`, que hacen exactamente lo mismo una vez que la
/// sala existe.
async fn enter_new_lobby(
    state: &AppState,
    player_id: Uuid,
    current_lobby: &mut Option<String>,
    lobby_id: &str,
    nickname: String,
) {
    // Sala recién creada: está vacía, no hay ningún sitio que reclamar.
    let live = std::collections::HashSet::new();
    match state.lobby_manager.join_lobby(lobby_id, player_id, nickname, &live).await {
        Ok(_lobby) => {
            *current_lobby = Some(lobby_id.to_string());
            state.send_to_player(&player_id, ServerMessage::LobbyCreated {
                lobby_id: lobby_id.to_string(),
                player_id: player_id.to_string(),
            }).await;
            send_lobby_update(state, lobby_id).await;
        }
        Err(e) => {
            state.send_to_player(&player_id, ServerMessage::Error { message: e }).await;
        }
    }
}

/// Corta la partida y devuelve a todos a la sala. Es el único caso que queda
/// en el que una desconexión cancela: cuando no quedan dos personas.
async fn cancel_match(state: &AppState, lobby_id: &str, because_of: &str) {
    let Some(mut lobby) = state.lobby_manager.get_lobby(lobby_id).await else { return };
    lobby.game_state = None;
    lobby.status = LobbyStatus::Waiting;
    lobby.players.retain(|p| p.disconnected_at.is_none());
    for p in lobby.players.iter_mut() {
        p.is_ready = false;
    }
    let player_infos: Vec<PlayerInfo> = lobby.players.iter().map(|p| PlayerInfo {
        id: p.id.to_string(),
        nickname: p.nickname.clone(),
        is_ready: false,
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
        status: "waiting".to_string(),
    }).await;
}

/// Espera a quien se cayó y, si no vuelve, redimensiona la partida.
///
/// Si vuelve, `rebind_disconnected` le cambia el id, así que este id ya no
/// existe en el lobby y la tarea se va sin hacer nada — no hace falta
/// cancelarla desde fuera.
async fn run_grace_period(state: AppState, lobby_id: String, player_id: Uuid) {
    sleep(GRACE_PERIOD).await;

    let Some(mut lobby) = state.lobby_manager.get_lobby(&lobby_id).await else { return };
    // ¿Sigue esperándose a este mismo id?
    if !lobby.players.iter().any(|p| p.id == player_id && p.disconnected_at.is_some()) {
        return;
    }
    // La partida pudo acabar o cancelarse mientras esperábamos. Entonces no
    // hay nada que redimensionar, pero al que no volvió hay que sacarlo igual:
    // si se queda, sigue contando como jugador y, con `is_ready` en false,
    // bloquea la siguiente ronda para siempre — nadie volvería a poder empezar.
    if lobby.status != LobbyStatus::Playing || lobby.game_state.is_none() {
        lobby.players.retain(|p| p.id != player_id);
        let empty = lobby.players.is_empty();
        state.lobby_manager.update_lobby(lobby).await;
        if !empty {
            send_lobby_update(&state, &lobby_id).await;
        }
        return;
    }

    let nickname = lobby.players.iter()
        .find(|p| p.id == player_id)
        .map(|p| p.nickname.clone())
        .unwrap_or_default();

    if lobby.connected_count() < 2 {
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

    // El estado propio de cada uno puede haber cambiado (un hueco por una
    // prenda retirada), así que se reenvía antes del resumen común.
    let per_player: Vec<(Uuid, Vec<Vec<Option<CardInfo>>>)> = lobby.game_state.as_ref()
        .map(|g| g.players.iter()
            .map(|p| (p.id, p.sets.iter().map(|s| set_to_info(s)).collect()))
            .collect())
        .unwrap_or_default();
    let (new_center, players_progress) = snapshot(&lobby);
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
    }).await;
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
) -> Option<(usize, Vec<Option<CardInfo>>, bool)> {
    let idx = game_state.center_cards.iter().position(|c| c.id == card_id)?;
    let p = game_state.players.iter().position(|p| p.id == player_id)?;
    let (set_index, card_index) = game_state.players[p].owed_slot?;

    let was_complete = game_state.players[p].is_set_complete(set_index);
    let card = game_state.center_cards.remove(idx);
    game_state.players[p].sets[set_index][card_index] = Some(card);
    game_state.players[p].owed_slot = None;
    let completed = !was_complete && game_state.players[p].is_set_complete(set_index);
    Some((set_index, set_to_info(&game_state.players[p].sets[set_index]), completed))
}

/// Suma eslabones a la racha y devuelve el aviso para ese jugador.
///
/// `base_links` es lo que vale la jugada en sí: coger una carta o ganar una
/// pelea. Completar un set suma aparte, porque puede pasar a la vez.
fn award_combo(
    game_state: &mut crate::game::models::GameState,
    player_id: &Uuid,
    base_links: u32,
    completed_a_set: bool,
) -> Option<ServerMessage> {
    let p = game_state.find_player_mut(player_id)?;
    let links = base_links + if completed_a_set { COMBO_LINKS_SET_DONE } else { 0 };
    let points = p.add_combo_links(links);
    Some(ServerMessage::ComboUpdate {
        combo: p.combo,
        multiplier: p.combo_multiplier(),
        window_ms: COMBO_WINDOW.as_millis() as u64,
        points,
        total_points: p.combo_points,
    })
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
        multiplier: 1,
        window_ms: 0,
        points: 0,
        total_points: p.combo_points,
    })
}


/// Ejecuta el QTE: envía updates cada 500ms y resuelve al finalizar
async fn run_qte(
    state: AppState,
    lobby_id: String,
    card_id: u32,
    p_a: QtePlayerData,
    p_b: QtePlayerData,
) {
    // 6 updates × 500ms = 3 segundos
    for _ in 0..6 {
        sleep(Duration::from_millis(500)).await;
        if let Some(lobby) = state.lobby_manager.get_lobby(&lobby_id).await {
            if let Some(gs) = &lobby.game_state {
                if let Some(qte) = &gs.active_qte {
                    let clicks: std::collections::HashMap<String, u32> = qte.participants.iter()
                        .map(|(id, name)| (name.clone(), *qte.clicks.get(id).unwrap_or(&0)))
                        .collect();
                    state.broadcast_to_lobby(&lobby_id, ServerMessage::QteUpdate { clicks }).await;
                }
            }
        }
    }

    // Resolver QTE: determinar ganador
    if let Some(mut lobby) = state.lobby_manager.get_lobby(&lobby_id).await {
        let outcome = {
            let game_state = match lobby.game_state.as_mut() {
                Some(gs) => gs,
                None => return,
            };
            let qte = match game_state.active_qte.take() {
                Some(q) => q,
                None => return,
            };

            let clicks_a = *qte.clicks.get(&p_a.player_id).unwrap_or(&0);
            let clicks_b = *qte.clicks.get(&p_b.player_id).unwrap_or(&0);

            let (winner, loser) = if clicks_a >= clicks_b {
                (p_a.clone(), p_b.clone())
            } else {
                (p_b.clone(), p_a.clone())
            };

            // El ganador se lleva la carta a su hueco.
            let Some((winner_set, winner_new_set, completed)) =
                take_card_into_slot(game_state, winner.player_id, card_id) else { return };

            // Ganar una pelea es la jugada que más queremos que se busque, así
            // que paga más eslabones que coger una carta sin disputa. Perder
            // corta la racha: la ventana dura más que el bloqueo, así que si no
            // se cortara aquí, perder no costaría la racha.
            let winner_combo = award_combo(
                game_state, &winner.player_id, COMBO_LINKS_FIGHT_WON, completed);
            let loser_combo = break_combo(game_state, &loser.player_id);

            let new_center: Vec<CardInfo> = game_state.center_cards.iter()
                .map(|&c| CardInfo::from(c)).collect();
            let players_progress: Vec<PlayerProgress> = game_state.players.iter()
                .map(|p| PlayerProgress {
                    nickname: p.nickname.clone(),
                    completed_sets: p.count_completed_sets(),
                    finished: p.finished_position.is_some(),
                    on_fire: p.is_on_fire(),
                }).collect();
            (winner, loser, winner_set, winner_new_set, new_center, players_progress,
             winner_combo, loser_combo)
        };

        let (winner, loser, winner_set, winner_new_set, new_center, players_progress,
             winner_combo, loser_combo) = outcome;
        // Perder cuesta unos segundos sin poder intercambiar. No hay ningún
        // mensaje de "has perdido": el tablero apagándose es el aviso.
        lobby.stun_player(&loser.player_id);
        state.lobby_manager.update_lobby(lobby).await;

        // Broadcast: pelea resuelta (cierra el overlay en todos)
        state.broadcast_to_lobby(&lobby_id, ServerMessage::QteResolved {
            winner: winner.nickname.clone(),
        }).await;

        // Ganador: swap_success
        state.send_to_player(&winner.player_id, ServerMessage::SwapSuccess {
            player: winner.nickname,
            set_index: winner_set,
            your_new_set: Some(winner_new_set),
            center_cards: new_center.clone(),
        }).await;
        if let Some(msg) = winner_combo {
            state.send_to_player(&winner.player_id, msg).await;
        }

        // Perdedor: swap_failed (el cliente no lo muestra) + el bloqueo
        state.send_to_player(&loser.player_id, ServerMessage::SwapFailed {
            reason: "Perdiste la carta".to_string(),
        }).await;
        state.send_to_player(&loser.player_id, ServerMessage::Stunned {
            ms: STUN_DURATION.as_millis() as u64,
        }).await;
        if let Some(msg) = loser_combo {
            state.send_to_player(&loser.player_id, msg).await;
        }

        // Todos: actualización del centro
        state.broadcast_to_lobby(&lobby_id, ServerMessage::GameUpdate {
            center_cards: new_center,
            players_progress,
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
        }).collect();

        let update_msg = ServerMessage::LobbyUpdate {
            players,
            ready_count: lobby.ready_count(),
            max_players: lobby.max_players,
            status: format!("{:?}", lobby.status),
        };

        state.broadcast_to_lobby(lobby_id, update_msg).await;
    }
}
