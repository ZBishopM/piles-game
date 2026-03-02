use serde::{Deserialize, Serialize};
use uuid::Uuid;
use super::models::Card;

/// Mensajes que el cliente envía al servidor
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    /// Crear un nuevo lobby
    CreateLobby {
        nickname: String,
        max_players: u8,
    },
    /// Unirse a un lobby existente
    JoinLobby {
        lobby_id: String,
        nickname: String,
    },
    /// Listar lobbies disponibles
    ListLobbies,
    /// Marcar como listo/no listo
    SetReady {
        ready: bool,
    },
    /// Cambiar de set actual
    SwitchSet {
        set_index: usize,
    },
    /// Intercambiar carta
    SwapCard {
        my_card_index: usize,
        center_card_index: usize,
    },
    /// Voltear un set para que otros lo vean
    FlipSet {
        set_index: usize,
    },
    /// Solicitar verificación final
    RequestVerification,
    /// Click durante QTE
    QteClick,
    /// Ceder la carta al oponente en un QTE
    QteConcede,
}

/// Mensajes que el servidor envía al cliente
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMessage {
    /// Confirmación de lobby creado
    LobbyCreated {
        lobby_id: String,
        player_id: String,
    },
    /// Confirmación de unión a lobby
    JoinedLobby {
        lobby_id: String,
        player_id: String,
        players: Vec<PlayerInfo>,
    },
    /// Lista de lobbies disponibles
    LobbyList {
        lobbies: Vec<LobbyInfo>,
    },
    /// Actualización del estado del lobby
    LobbyUpdate {
        players: Vec<PlayerInfo>,
        ready_count: usize,
        max_players: u8,
        status: String,
    },
    /// El juego ha comenzado
    GameStart {
        your_sets: Vec<Vec<CardInfo>>,
        center_cards: Vec<CardInfo>,
        current_set: usize,
        players: Vec<String>,
    },
    /// Confirmación de cambio de set
    SetSwitched {
        set_index: usize,
        cards: Vec<CardInfo>,
    },
    /// Conflicto de intercambio (inicia QTE)
    SwapConflict {
        players: Vec<String>,
        center_card_index: usize,
        qte_duration: u64,
    },
    /// Actualización de clicks del QTE
    QteUpdate {
        clicks: std::collections::HashMap<String, u32>,
    },
    /// Intercambio exitoso
    SwapSuccess {
        player: String,
        set_index: usize,
        your_new_set: Option<Vec<CardInfo>>,
        center_cards: Vec<CardInfo>,
    },
    /// Intercambio fallido
    SwapFailed {
        reason: String,
    },
    /// Un jugador volteó un set
    SetFlipped {
        player: String,
        set_index: usize,
        cards: Vec<CardInfo>,
    },
    /// Inicio de verificación
    VerificationStarted {
        player: String,
    },
    /// Resultado de verificación de un set
    SetVerificationResult {
        player: String,
        set_index: usize,
        is_valid: bool,
        cards: Vec<CardInfo>,
    },
    /// Verificación fallida
    VerificationFailed {
        player: String,
        failed_sets: Vec<usize>,
    },
    /// Verificación exitosa
    VerificationSuccess {
        player: String,
        position: u8,
    },
    /// Actualización general del juego
    GameUpdate {
        center_cards: Vec<CardInfo>,
        players_progress: Vec<PlayerProgress>,
    },
    /// Un jugador terminó
    PlayerFinished {
        player: String,
        position: u8,
    },
    /// QTE resuelto (broadcast a todos)
    QteResolved {
        winner: String,
    },
    /// El juego ha terminado
    GameOver {
        rankings: Vec<RankingEntry>,
        your_total_points: Option<u32>,
    },
    /// Error
    Error {
        message: String,
    },
}

/// Información de una carta para el cliente
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CardInfo {
    pub id: u32,
    pub clothing_type: u8,
    pub name: String,
}

impl From<Card> for CardInfo {
    fn from(card: Card) -> Self {
        Self {
            id: card.id,
            clothing_type: card.clothing_type,
            name: super::get_clothing_name(card.clothing_type).to_string(),
        }
    }
}

/// Información de un jugador en el lobby
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerInfo {
    pub id: String,
    pub nickname: String,
    pub is_ready: bool,
}

/// Información de un lobby
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LobbyInfo {
    pub id: String,
    pub player_count: usize,
    pub max_players: u8,
    pub status: String,
}

/// Progreso de un jugador
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerProgress {
    pub nickname: String,
    pub completed_sets: usize,
    pub finished: bool,
}

/// Entrada en el ranking final
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RankingEntry {
    pub position: u8,
    pub nickname: String,
    pub points: u32,
}
