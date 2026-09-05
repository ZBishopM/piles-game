use super::models::{Card, PlayerState, GameState};
use super::deck::{generate_deck, distribute_cards};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

/// Cuánto sobrevive un lobby vacío antes de reciclarse.
const EMPTY_LOBBY_TTL: Duration = Duration::from_secs(30 * 60);

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
    /// Desde cuándo el lobby está vacío. Se mantiene reutilizable un rato
    /// para que quien se desconecta pueda volver a su misma sala; pasado
    /// `EMPTY_LOBBY_TTL` se recicla.
    #[serde(skip)]
    pub empty_since: Option<Instant>,
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
            empty_since: None,
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
        self.empty_since = None;

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

    /// Elimina un jugador del lobby (por desconexión o salida)
    /// Devuelve el nickname del jugador eliminado, si existía
    pub fn remove_player(&mut self, player_id: &Uuid) -> Option<String> {
        let pos = self.players.iter().position(|p| p.id == *player_id)?;
        let nickname = self.players.remove(pos).nickname;

        // Eliminar del game_state si había partida en curso
        if let Some(game) = &mut self.game_state {
            game.players.retain(|p| p.id != *player_id);
        }

        // Un lobby vacío NO se da por terminado: quien se desconecta (o
        // cierra la pestaña sin querer) tiene que poder volver a su misma
        // sala, y los demás tienen que poder seguir entrando con el mismo
        // código. Marcarlo Finished aquí lo mataba para siempre —
        // add_player() rechaza todo lo que no esté en Waiting, así que la
        // sala quedaba inaccesible incluso para su propio creador.
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
        self.game_state = Some(GameState::new(
            self.id.clone(),
            player_states,
            center_cards
        ));

        self.status = LobbyStatus::Playing;

        // Resetear is_ready para que la siguiente ronda no arranque prematuramente
        for player in self.players.iter_mut() {
            player.is_ready = false;
        }

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
        let mut rng = rand::thread_rng();

        (0..LOBBY_CODE_LEN)
            .map(|_| {
                let idx = rng.gen_range(0..LOBBY_CODE_CHARSET.len());
                LOBBY_CODE_CHARSET[idx] as char
            })
            .collect()
    }

    /// Crea un nuevo lobby
    pub async fn create_lobby(&self, max_players: u8) -> String {
        self.reap_stale_lobbies().await;
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
    ) -> Result<Lobby, String> {
        let mut lobbies = self.lobbies.write().await;
        let lobby = lobbies.get_mut(lobby_id)
            .ok_or("Lobby no encontrado")?;

        let abandoned: Vec<Uuid> = lobby.players.iter()
            .filter(|p| p.nickname == nickname && !live.contains(&p.id))
            .map(|p| p.id)
            .collect();
        for stale_id in abandoned {
            lobby.remove_player(&stale_id);
        }

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
        let lobby_id = manager.create_lobby(4).await;
        let ghost = Uuid::new_v4();
        let alive = Uuid::new_v4();
        let no_one = HashSet::new();
        manager.join_lobby(&lobby_id, ghost, "Ana".to_string(), &no_one).await.unwrap();
        manager.join_lobby(&lobby_id, alive, "Beto".to_string(), &no_one).await.unwrap();

        // Solo `alive` conserva socket: Ana recargó la página.
        let live: HashSet<Uuid> = [alive].into_iter().collect();

        let reconnected = Uuid::new_v4();
        let lobby = manager.join_lobby(&lobby_id, reconnected, "Ana".to_string(), &live).await
            .expect("volver a entrar con el propio nombre tras recargar");
        assert_eq!(lobby.players.len(), 2, "Ana recupera su sitio en vez de duplicarse");
        assert!(lobby.players.iter().any(|p| p.id == reconnected));
        assert!(!lobby.players.iter().any(|p| p.id == ghost));

        // A alguien que sigue conectado no se le puede quitar el sitio.
        let impostor = Uuid::new_v4();
        let live: HashSet<Uuid> = [alive, reconnected].into_iter().collect();
        assert!(manager.join_lobby(&lobby_id, impostor, "Beto".to_string(), &live).await.is_err());
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
