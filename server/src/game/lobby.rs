use super::models::{Card, PlayerState, GameState};
use super::deck::{generate_deck, distribute_cards};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;
use serde::{Deserialize, Serialize};

/// Estado de un lobby
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum LobbyStatus {
    Waiting,   // Esperando jugadores
    Ready,     // Todos listos, próximo a iniciar
    Playing,   // Juego en progreso
    Finished,  // Juego terminado
}

/// Información de un jugador en el lobby
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LobbyPlayer {
    pub id: Uuid,
    pub nickname: String,
    pub is_ready: bool,
}

/// Representa un lobby de juego
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Lobby {
    pub id: String,
    pub players: Vec<LobbyPlayer>,
    pub max_players: u8,
    pub status: LobbyStatus,
    #[serde(skip)]
    pub game_state: Option<GameState>,
}

impl Lobby {
    /// Crea un nuevo lobby
    pub fn new(lobby_id: String, max_players: u8) -> Self {
        Self {
            id: lobby_id,
            players: Vec::new(),
            max_players: max_players.clamp(2, 8),
            status: LobbyStatus::Waiting,
            game_state: None,
        }
    }

    /// Agrega un jugador al lobby
    pub fn add_player(&mut self, player_id: Uuid, nickname: String) -> Result<(), String> {
        if self.players.len() >= self.max_players as usize {
            return Err("Lobby lleno".to_string());
        }

        if self.status != LobbyStatus::Waiting {
            return Err("El juego ya ha comenzado".to_string());
        }

        if self.players.iter().any(|p| p.nickname == nickname) {
            return Err("Nickname ya en uso".to_string());
        }

        self.players.push(LobbyPlayer {
            id: player_id,
            nickname,
            is_ready: false,
        });

        Ok(())
    }

    /// Marca un jugador como listo
    pub fn set_player_ready(&mut self, player_id: &Uuid, ready: bool) -> Result<(), String> {
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
        self.game_state = Some(GameState::new(
            self.id.clone(),
            player_states,
            center_cards
        ));

        self.status = LobbyStatus::Playing;

        Ok(())
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

/// Gestor de lobbies global
pub struct LobbyManager {
    lobbies: Arc<RwLock<HashMap<String, Lobby>>>,
}

impl LobbyManager {
    pub fn new() -> Self {
        Self {
            lobbies: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Genera un ID único para un lobby (código de 6 caracteres)
    fn generate_lobby_id() -> String {
        use rand::Rng;
        const CHARSET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let mut rng = rand::thread_rng();

        (0..6)
            .map(|_| {
                let idx = rng.gen_range(0..CHARSET.len());
                CHARSET[idx] as char
            })
            .collect()
    }

    /// Crea un nuevo lobby
    pub async fn create_lobby(&self, max_players: u8) -> String {
        let lobby_id = Self::generate_lobby_id();
        let lobby = Lobby::new(lobby_id.clone(), max_players);

        let mut lobbies = self.lobbies.write().await;
        lobbies.insert(lobby_id.clone(), lobby);

        lobby_id
    }

    /// Obtiene un lobby por su ID
    pub async fn get_lobby(&self, lobby_id: &str) -> Option<Lobby> {
        let lobbies = self.lobbies.read().await;
        lobbies.get(lobby_id).cloned()
    }

    /// Actualiza un lobby
    pub async fn update_lobby(&self, lobby: Lobby) {
        let mut lobbies = self.lobbies.write().await;
        lobbies.insert(lobby.id.clone(), lobby);
    }

    /// Agrega un jugador a un lobby
    pub async fn join_lobby(&self, lobby_id: &str, player_id: Uuid, nickname: String) -> Result<Lobby, String> {
        let mut lobbies = self.lobbies.write().await;
        let lobby = lobbies.get_mut(lobby_id)
            .ok_or("Lobby no encontrado")?;

        lobby.add_player(player_id, nickname)?;
        Ok(lobby.clone())
    }

    /// Lista todos los lobbies disponibles (en estado Waiting y no llenos)
    pub async fn list_available_lobbies(&self) -> Vec<Lobby> {
        let lobbies = self.lobbies.read().await;
        lobbies.values()
            .filter(|l| l.status == LobbyStatus::Waiting && !l.is_full())
            .cloned()
            .collect()
    }

    /// Elimina lobbies terminados (opcional, para limpieza)
    pub async fn cleanup_finished_lobbies(&self) {
        let mut lobbies = self.lobbies.write().await;
        lobbies.retain(|_, lobby| lobby.status != LobbyStatus::Finished);
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
}
