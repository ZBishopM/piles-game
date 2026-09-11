pub mod models;
pub mod deck;
pub mod lobby;
pub mod messages;

// Solo lo que se usa fuera de `game`. El resto se importa por su módulo.
pub use models::{
    Card, QteState, get_clothing_name,
    COMBO_WINDOW, COMBO_LINKS_TAKE, COMBO_LINKS_FIGHT_WON, COMBO_LINKS_SET_DONE,
};
pub use lobby::{Lobby, LobbyManager, LobbyStatus, is_valid_lobby_code, STUN_DURATION};
pub use messages::{
    ClientMessage, ServerMessage, CardInfo, PlayerInfo, LobbyInfo, PlayerProgress,
    RankingEntry, set_to_info,
};
