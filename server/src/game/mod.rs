pub mod models;
pub mod deck;
pub mod lobby;
pub mod messages;

// Solo lo que se usa fuera de `game`. El resto se importa por su módulo.
pub use models::{
    Card, QteState, get_clothing_name,
    COMBO_WINDOW, COMBO_BASE_X100, COMBO_MAX_X100, FRENZY_STUN,
    COMBO_GAIN_SWAP_X100, COMBO_GAIN_SAME_TYPE_X100,
    COMBO_GAIN_FIGHT_WON_X100, COMBO_GAIN_SET_DONE_X100,
};
pub use lobby::{Lobby, LobbyManager, LobbyStatus, is_valid_lobby_code, STUN_DURATION};
pub use messages::{
    ClientMessage, ServerMessage, CardInfo, PlayerInfo, LobbyInfo, PlayerProgress,
    RankingEntry, set_to_info,
};
