// Permitir imports no usados temporalmente (se usarán en fases futuras)
#![allow(unused_imports)]

pub mod models;
pub mod deck;
pub mod lobby;
pub mod messages;

// Re-exportar tipos comunes para facilitar su uso
pub use models::{Card, PlayerState, GameState, QteState, get_clothing_name, CLOTHING_NAMES};
pub use deck::{generate_deck, distribute_cards, calculate_total_sets};
pub use lobby::{Lobby, LobbyManager, LobbyStatus, LobbyPlayer};
pub use messages::{ClientMessage, ServerMessage, CardInfo, PlayerInfo, LobbyInfo, PlayerProgress, RankingEntry};
