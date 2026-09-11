use serde::{Deserialize, Serialize};
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
    /// Soltar una carta al centro. Es el único modo de deshacerse de una
    /// carta: no hay intercambio 1↔1, se suelta y luego se coge.
    DropCard {
        my_card_index: usize,
    },
    /// Coger una carta del centro para tapar el hueco que dejó DropCard.
    /// Por id y no por posición: el centro cambia de tamaño constantemente
    /// según quién debe una carta, así que un índice deja de apuntar a la
    /// misma carta en cuanto alguien coge otra.
    TakeCard {
        card_id: u32,
    },
    /// Voltear un set para que otros lo vean
    FlipSet {
        set_index: usize,
    },
    /// Solicitar verificación final
    RequestVerification,
    /// Click durante QTE
    QteClick,
    /// Ping para mantener la conexión viva
    Ping,
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
        /// Un hueco puede venir vacío (`null`) si el jugador debe una carta.
        your_sets: Vec<Vec<Option<CardInfo>>>,
        center_cards: Vec<CardInfo>,
        current_set: usize,
        players: Vec<String>,
    },
    /// Confirmación de cambio de set
    SetSwitched {
        set_index: usize,
        cards: Vec<CardInfo>,
    },
    /// Dos jugadores van a por la misma carta del centro: empieza la pelea.
    SwapConflict {
        players: Vec<String>,
        card_id: u32,
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
        your_new_set: Option<Vec<Option<CardInfo>>>,
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
    /// Al que pierde una pelea se le bloquea el intercambio unos segundos.
    /// La duración la manda el servidor —que es quien la aplica— para que
    /// cliente y servidor no puedan discrepar.
    Stunned {
        ms: u64,
    },
    /// Tu racha, solo para ti. Igual que con el bloqueo, la ventana la manda
    /// el servidor y el cliente solo anima la barra: así el multiplicador no
    /// es un número que el cliente pueda inventarse.
    ComboUpdate {
        combo: u32,
        multiplier: u32,
        /// Cuánto queda de ventana. 0 = racha cortada.
        window_ms: u64,
        /// Puntos que ha dado esta jugada (0 al cortarse).
        points: u32,
        /// Total acumulado por combo en la partida.
        total_points: u32,
    },
    /// El juego ha terminado
    GameOver {
        rankings: Vec<RankingEntry>,
        your_total_points: Option<u32>,
    },
    /// Partida cancelada (un jugador se desconectó)
    GameCancelled {
        reason: String,
    },
    /// Respuesta a Ping del cliente
    Pong,
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

/// Un set tal y como lo ve su dueño: 4 huecos, alguno posiblemente vacío.
pub fn set_to_info(set: &[Option<Card>; 4]) -> Vec<Option<CardInfo>> {
    set.iter().map(|slot| slot.map(CardInfo::from)).collect()
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
    /// Lleva una racha viva de x2 o más. Se difunde a todos a propósito: ver
    /// quién está encadenando es lo que da ganas de ir a pelearle una carta.
    pub on_fire: bool,
}

/// Entrada en el ranking final
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RankingEntry {
    pub position: u8,
    pub nickname: String,
    pub points: u32,
    /// Lo que ha aportado el combo a esos puntos. Se manda aparte para poder
    /// enseñarlo en la pantalla final: un total sin desglose no premia nada.
    pub combo_points: u32,
    /// La racha más larga que consiguió en la partida.
    pub best_combo: u32,
}
