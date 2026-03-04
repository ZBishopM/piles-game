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
    LobbyStatus, PlayerProgress, Card, RankingEntry,
};

/// Tipo para enviar mensajes a un cliente específico
type ClientSender = mpsc::UnboundedSender<ServerMessage>;

/// Intento de swap pendiente (esperando posible conflicto QTE)
#[derive(Debug, Clone)]
struct SwapIntent {
    player_id: Uuid,
    player_nickname: String,
    player_set_index: usize,
    my_card_index: usize,
    timestamp: Instant,
}

/// Datos de un participante en el QTE
#[derive(Debug, Clone)]
struct QtePlayerData {
    player_id: Uuid,
    nickname: String,
    set_index: usize,
    card_index: usize,
}

/// Estado compartido de la aplicación
#[derive(Clone)]
pub struct AppState {
    pub lobby_manager: Arc<LobbyManager>,
    /// Mapa de player_id -> sender para broadcast
    pub connections: Arc<RwLock<HashMap<Uuid, ClientSender>>>,
    /// Intents de swap pendientes: lobby_id -> center_card_index -> SwapIntent
    pub swap_intents: Arc<RwLock<HashMap<String, HashMap<usize, SwapIntent>>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            lobby_manager: Arc::new(LobbyManager::new()),
            connections: Arc::new(RwLock::new(HashMap::new())),
            swap_intents: Arc::new(RwLock::new(HashMap::new())),
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
    let mut send_task = tokio::spawn(async move {
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

    // Si estaba en un lobby, eliminarlo y notificar a los demás
    if let Some(lobby_id) = &current_lobby {
        if let Some(mut lobby) = state.lobby_manager.get_lobby(lobby_id).await {
            let was_playing = lobby.status == LobbyStatus::Playing;

            if let Some(nickname) = lobby.remove_player(&player_id) {
                tracing::info!("🚪 {} ({}) salió del lobby {}", nickname, player_id, lobby_id);

                if lobby.players.is_empty() {
                    // Lobby vacío: guardarlo como Finished y limpiar intents
                    state.lobby_manager.update_lobby(lobby).await;
                    state.swap_intents.write().await.remove(lobby_id);
                } else if was_playing {
                    // Partida en curso cancelada: resetear lobby y notificar
                    lobby.game_state = None;
                    lobby.status = LobbyStatus::Waiting;
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
                    state.swap_intents.write().await.remove(lobby_id);

                    // Avisar a los demás que la partida fue cancelada
                    state.broadcast_to_lobby(lobby_id, ServerMessage::GameCancelled {
                        reason: format!("{} se desconectó", nickname),
                    }).await;
                    // Regresar al lobby
                    state.broadcast_to_lobby(lobby_id, ServerMessage::LobbyUpdate {
                        players: player_infos,
                        ready_count: 0,
                        max_players,
                        status: "waiting".to_string(),
                    }).await;
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

/// Maneja un mensaje del cliente y envía respuestas vía broadcast
async fn handle_client_message(
    msg: ClientMessage,
    player_id: Uuid,
    current_lobby: &mut Option<String>,
    state: &AppState,
) {
    match msg {
        ClientMessage::CreateLobby { nickname, max_players } => {
            let lobby_id = state.lobby_manager.create_lobby(max_players).await;

            match state.lobby_manager.join_lobby(&lobby_id, player_id, nickname).await {
                Ok(_lobby) => {
                    *current_lobby = Some(lobby_id.clone());

                    // Enviar confirmación al creador
                    state.send_to_player(&player_id, ServerMessage::LobbyCreated {
                        lobby_id: lobby_id.clone(),
                        player_id: player_id.to_string(),
                    }).await;

                    // Broadcast estado del lobby a todos (incluyendo el creador)
                    send_lobby_update(&state, &lobby_id).await;
                }
                Err(e) => {
                    state.send_to_player(&player_id, ServerMessage::Error { message: e }).await;
                }
            }
        }

        ClientMessage::JoinLobby { lobby_id, nickname } => {
            match state.lobby_manager.join_lobby(&lobby_id, player_id, nickname).await {
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
                                            let your_sets: Vec<Vec<CardInfo>> = player_state.sets.iter()
                                                .map(|set| set.iter().map(|&card| CardInfo::from(card)).collect())
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
                            .map(|&card| CardInfo::from(card))
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

        ClientMessage::SwapCard { my_card_index, center_card_index } => {
            let lobby_id = match current_lobby.as_ref() {
                Some(id) => id.clone(),
                None => {
                    state.send_to_player(&player_id, ServerMessage::Error {
                        message: "No estás en una partida".to_string(),
                    }).await;
                    return;
                }
            };

            if my_card_index >= 4 || center_card_index >= 4 {
                state.send_to_player(&player_id, ServerMessage::Error {
                    message: "Índice de carta inválido".to_string(),
                }).await;
                return;
            }

            // Validar estado del jugador (sin modificar nada aún)
            let player_info = {
                let lobby = match state.lobby_manager.get_lobby(&lobby_id).await {
                    Some(l) => l,
                    None => {
                        state.send_to_player(&player_id, ServerMessage::Error {
                            message: "Lobby no encontrado".to_string(),
                        }).await;
                        return;
                    }
                };
                let game_state = match lobby.game_state.as_ref() {
                    Some(gs) => gs,
                    None => {
                        state.send_to_player(&player_id, ServerMessage::Error {
                            message: "El juego no ha iniciado".to_string(),
                        }).await;
                        return;
                    }
                };
                if game_state.active_qte.is_some() {
                    state.send_to_player(&player_id, ServerMessage::Error {
                        message: "Hay un QTE en curso, ¡haz click!".to_string(),
                    }).await;
                    return;
                }
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
                        message: "No puedes intercambiar cartas durante la verificación".to_string(),
                    }).await;
                    return;
                }
                let current_set = game_state.players[player_idx].current_set_index;
                let nickname = game_state.players[player_idx].nickname.clone();
                (current_set, nickname)
            };
            let (current_set, player_nickname) = player_info;

            // Revisar si hay un intent previo para esta posición del centro
            let conflict = {
                let mut intents = state.swap_intents.write().await;
                let lobby_intents = intents.entry(lobby_id.clone()).or_default();
                let conflict = lobby_intents.get(&center_card_index).and_then(|existing| {
                    if existing.player_id != player_id
                        && existing.timestamp.elapsed() < Duration::from_millis(300)
                    {
                        Some(existing.clone())
                    } else {
                        None
                    }
                });
                if conflict.is_some() {
                    lobby_intents.remove(&center_card_index);
                } else {
                    lobby_intents.insert(center_card_index, SwapIntent {
                        player_id,
                        player_nickname: player_nickname.clone(),
                        player_set_index: current_set,
                        my_card_index,
                        timestamp: Instant::now(),
                    });
                }
                conflict
            };

            if let Some(other) = conflict {
                // ─── Iniciar QTE ───
                let p_a = QtePlayerData {
                    player_id,
                    nickname: player_nickname.clone(),
                    set_index: current_set,
                    card_index: my_card_index,
                };
                let p_b = QtePlayerData {
                    player_id: other.player_id,
                    nickname: other.player_nickname.clone(),
                    set_index: other.player_set_index,
                    card_index: other.my_card_index,
                };

                if let Some(mut lobby) = state.lobby_manager.get_lobby(&lobby_id).await {
                    if let Some(gs) = lobby.game_state.as_mut() {
                        let mut swap_data = std::collections::HashMap::new();
                        swap_data.insert(p_a.player_id, (p_a.set_index, p_a.card_index));
                        swap_data.insert(p_b.player_id, (p_b.set_index, p_b.card_index));
                        gs.active_qte = Some(crate::game::QteState {
                            participants: vec![
                                (p_a.player_id, p_a.nickname.clone()),
                                (p_b.player_id, p_b.nickname.clone()),
                            ],
                            center_card_index,
                            clicks: std::collections::HashMap::new(),
                            swap_data,
                            started_at: Instant::now(),
                            duration_ms: 3000,
                        });
                    }
                    state.lobby_manager.update_lobby(lobby).await;
                }

                state.broadcast_to_lobby(&lobby_id, ServerMessage::SwapConflict {
                    players: vec![p_a.nickname.clone(), p_b.nickname.clone()],
                    center_card_index,
                    qte_duration: 3000,
                }).await;

                let state_clone = state.clone();
                tokio::spawn(async move {
                    run_qte(state_clone, lobby_id, center_card_index, p_a, p_b).await;
                });
            } else {
                // ─── Swap diferido 300ms (sin conflicto) ───
                let state_clone = state.clone();
                tokio::spawn(async move {
                    sleep(Duration::from_millis(300)).await;
                    execute_delayed_swap(
                        state_clone, lobby_id, center_card_index,
                        player_id, current_set, my_card_index, player_nickname,
                    ).await;
                });
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

                        // Alternar el estado del set
                        let new_flipped = !game_state.players[player_idx].flipped_sets[set_index];
                        game_state.players[player_idx].flipped_sets[set_index] = new_flipped;

                        let player_nickname = game_state.players[player_idx].nickname.clone();

                        // Si está volteado: enviar la primera carta; si no: lista vacía
                        let cards: Vec<CardInfo> = if new_flipped {
                            vec![CardInfo::from(game_state.players[player_idx].sets[set_index][0])]
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

        ClientMessage::QteConcede => {
            let lobby_id = match current_lobby.as_ref() {
                Some(id) => id.clone(),
                None => return,
            };

            if let Some(mut lobby) = state.lobby_manager.get_lobby(&lobby_id).await {
                let outcome = {
                    let game_state = match lobby.game_state.as_mut() {
                        Some(gs) => gs,
                        None => return,
                    };
                    let qte = match game_state.active_qte.as_ref() {
                        Some(q) => q,
                        None => return,
                    };

                    // Solo un participante puede ceder
                    if !qte.participants.iter().any(|(id, _)| *id == player_id) {
                        return;
                    }

                    // El ganador es el otro participante
                    let winner_id = qte.participants.iter()
                        .find(|(id, _)| *id != player_id)
                        .map(|(id, _)| *id);
                    let winner_id = match winner_id {
                        Some(id) => id,
                        None => return,
                    };

                    let winner_nickname = qte.participants.iter()
                        .find(|(id, _)| *id == winner_id)
                        .map(|(_, n)| n.clone())
                        .unwrap_or_default();
                    let loser_nickname = qte.participants.iter()
                        .find(|(id, _)| *id == player_id)
                        .map(|(_, n)| n.clone())
                        .unwrap_or_default();

                    let center_card_index = qte.center_card_index;
                    let (winner_set, winner_card) = qte.swap_data
                        .get(&winner_id)
                        .copied()
                        .unwrap_or((0, 0));

                    // Tomar el QTE y ejecutar el swap del ganador
                    game_state.active_qte = None;

                    if let Some(w_idx) = game_state.players.iter().position(|p| p.id == winner_id) {
                        let my_card = game_state.players[w_idx].sets[winner_set][winner_card];
                        let center_card = game_state.center_cards[center_card_index];
                        game_state.players[w_idx].sets[winner_set][winner_card] = center_card;
                        game_state.center_cards[center_card_index] = my_card;
                    }

                    let new_center: Vec<CardInfo> = game_state.center_cards.iter()
                        .map(|&c| CardInfo::from(c)).collect();
                    let players_progress: Vec<PlayerProgress> = game_state.players.iter()
                        .map(|p| PlayerProgress {
                            nickname: p.nickname.clone(),
                            completed_sets: p.count_completed_sets(),
                            finished: p.finished_position.is_some(),
                        }).collect();
                    let winner_new_set: Vec<CardInfo> = game_state.players.iter()
                        .find(|p| p.id == winner_id)
                        .map(|p| p.sets[winner_set].iter().map(|&c| CardInfo::from(c)).collect())
                        .unwrap_or_default();

                    Some((winner_id, winner_nickname, winner_set, winner_new_set,
                          player_id, loser_nickname, new_center, players_progress))
                };

                if let Some((winner_id, winner_name, winner_set, winner_new_set,
                              loser_id, loser_name, new_center, players_progress)) = outcome {
                    state.lobby_manager.update_lobby(lobby).await;

                    state.broadcast_to_lobby(&lobby_id, ServerMessage::QteResolved {
                        winner: winner_name.clone(),
                    }).await;

                    state.send_to_player(&winner_id, ServerMessage::SwapSuccess {
                        player: winner_name,
                        set_index: winner_set,
                        your_new_set: Some(winner_new_set),
                        center_cards: new_center.clone(),
                    }).await;

                    state.send_to_player(&loser_id, ServerMessage::SwapFailed {
                        reason: format!("Cediste la carta a tu oponente"),
                    }).await;

                    state.broadcast_to_lobby(&lobby_id, ServerMessage::GameUpdate {
                        center_cards: new_center,
                        players_progress,
                    }).await;
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
    sets: [[Card; 4]; 6],
) {
    let mut failed_sets: Vec<usize> = Vec::new();

    for set_idx in 0..6 {
        sleep(Duration::from_millis(1000)).await;

        let set = sets[set_idx];
        let is_valid = set.iter().all(|c| c.clothing_type == set[0].clothing_type);
        let cards: Vec<CardInfo> = set.iter().map(|&c| CardInfo::from(c)).collect();

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
                let rankings_snapshot: Vec<(Uuid, String)> = game_state.rankings.iter()
                    .filter_map(|pid| {
                        game_state.players.iter().find(|p| p.id == *pid)
                            .map(|p| (*pid, p.nickname.clone()))
                    })
                    .collect();

                state.lobby_manager.update_lobby(lobby).await;

                state.broadcast_to_lobby(&lobby_id, ServerMessage::VerificationSuccess {
                    player: player_nickname,
                    position,
                }).await;

                if game_over {
                    let rankings: Vec<RankingEntry> = rankings_snapshot.iter().enumerate()
                        .map(|(idx, (_, nickname))| RankingEntry {
                            position: idx as u8 + 1,
                            nickname: nickname.clone(),
                            points: calculate_points(idx as u8 + 1),
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
                        state.swap_intents.write().await.remove(&lobby_id);
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

/// Ejecuta el swap diferido si no fue cancelado por un QTE
async fn execute_delayed_swap(
    state: AppState,
    lobby_id: String,
    center_card_index: usize,
    player_id: Uuid,
    player_set_index: usize,
    my_card_index: usize,
    player_nickname: String,
) {
    // Verificar que el intent sigue siendo nuestro
    {
        let mut intents = state.swap_intents.write().await;
        let still_ours = intents
            .get(&lobby_id)
            .and_then(|m| m.get(&center_card_index))
            .map(|i| i.player_id == player_id)
            .unwrap_or(false);
        if !still_ours {
            return; // El intent fue consumido por un QTE
        }
        if let Some(m) = intents.get_mut(&lobby_id) {
            m.remove(&center_card_index);
        }
    }

    // Ejecutar el swap
    if let Some(mut lobby) = state.lobby_manager.get_lobby(&lobby_id).await {
        let result = {
            let game_state = match lobby.game_state.as_mut() {
                Some(gs) => gs,
                None => return,
            };
            if game_state.active_qte.is_some() {
                return; // QTE se inició mientras esperábamos
            }
            let player_idx = match game_state.players.iter().position(|p| p.id == player_id) {
                Some(idx) => idx,
                None => return,
            };

            let my_card = game_state.players[player_idx].sets[player_set_index][my_card_index];
            let center_card = game_state.center_cards[center_card_index];
            game_state.players[player_idx].sets[player_set_index][my_card_index] = center_card;
            game_state.center_cards[center_card_index] = my_card;

            let new_set: Vec<CardInfo> = game_state.players[player_idx].sets[player_set_index].iter()
                .map(|&c| CardInfo::from(c)).collect();
            let new_center: Vec<CardInfo> = game_state.center_cards.iter()
                .map(|&c| CardInfo::from(c)).collect();
            let players_progress: Vec<PlayerProgress> = game_state.players.iter()
                .map(|p| PlayerProgress {
                    nickname: p.nickname.clone(),
                    completed_sets: p.count_completed_sets(),
                    finished: p.finished_position.is_some(),
                }).collect();

            (new_set, new_center, players_progress)
        };

        let (new_set, new_center, players_progress) = result;
        state.lobby_manager.update_lobby(lobby).await;

        state.send_to_player(&player_id, ServerMessage::SwapSuccess {
            player: player_nickname,
            set_index: player_set_index,
            your_new_set: Some(new_set),
            center_cards: new_center.clone(),
        }).await;

        state.broadcast_to_lobby(&lobby_id, ServerMessage::GameUpdate {
            center_cards: new_center,
            players_progress,
        }).await;
    }
}

/// Ejecuta el QTE: envía updates cada 500ms y resuelve al finalizar
async fn run_qte(
    state: AppState,
    lobby_id: String,
    center_card_index: usize,
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

            // Ejecutar swap del ganador
            if let Some(w_idx) = game_state.players.iter().position(|p| p.id == winner.player_id) {
                let my_card = game_state.players[w_idx].sets[winner.set_index][winner.card_index];
                let center_card = game_state.center_cards[center_card_index];
                game_state.players[w_idx].sets[winner.set_index][winner.card_index] = center_card;
                game_state.center_cards[center_card_index] = my_card;
            }

            let new_center: Vec<CardInfo> = game_state.center_cards.iter()
                .map(|&c| CardInfo::from(c)).collect();
            let players_progress: Vec<PlayerProgress> = game_state.players.iter()
                .map(|p| PlayerProgress {
                    nickname: p.nickname.clone(),
                    completed_sets: p.count_completed_sets(),
                    finished: p.finished_position.is_some(),
                }).collect();
            let winner_new_set: Vec<CardInfo> = game_state.players.iter()
                .find(|p| p.id == winner.player_id)
                .map(|p| p.sets[winner.set_index].iter().map(|&c| CardInfo::from(c)).collect())
                .unwrap_or_default();

            (winner, loser, winner_new_set, new_center, players_progress)
        };

        let (winner, loser, winner_new_set, new_center, players_progress) = outcome;
        state.lobby_manager.update_lobby(lobby).await;

        // Broadcast: QTE resuelto (cierra overlay en todos)
        state.broadcast_to_lobby(&lobby_id, ServerMessage::QteResolved {
            winner: winner.nickname.clone(),
        }).await;

        // Ganador: swap_success
        state.send_to_player(&winner.player_id, ServerMessage::SwapSuccess {
            player: winner.nickname,
            set_index: winner.set_index,
            your_new_set: Some(winner_new_set),
            center_cards: new_center.clone(),
        }).await;

        // Perdedor: swap_failed
        state.send_to_player(&loser.player_id, ServerMessage::SwapFailed {
            reason: "Perdiste el QTE".to_string(),
        }).await;

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
