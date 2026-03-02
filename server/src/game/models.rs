// Permitir código no usado temporalmente (se usará en fases futuras)
#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use uuid::Uuid;
use std::time::Instant;

/// Representa una carta individual en el juego
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Card {
    /// ID único de esta carta específica (0-195 para 8 jugadores)
    pub id: u32,
    /// Tipo de prenda (0-48 para 49 tipos diferentes)
    pub clothing_type: u8,
}

impl Card {
    pub fn new(id: u32, clothing_type: u8) -> Self {
        Self { id, clothing_type }
    }
}

/// Nombres de las 49 prendas disponibles
pub const CLOTHING_NAMES: &[&str] = &[
    "Camiseta manga corta", "Camiseta manga larga", "Polo", "Camisa formal", "Blusa",
    "Sudadera con capucha", "Sudadera sin capucha", "Chaqueta", "Abrigo", "Blazer",
    "Jeans", "Pantalones de vestir", "Shorts", "Bermudas", "Falda",
    "Vestido casual", "Vestido formal", "Jumpsuit", "Overol", "Leggings",
    "Zapatos deportivos", "Zapatos formales", "Botas", "Sandalias", "Tacones",
    "Gorra", "Sombrero", "Beanie", "Bufanda", "Guantes",
    "Calcetines", "Medias", "Cinturón", "Corbata", "Moño",
    "Mochila", "Bolso", "Cartera", "Lentes de sol", "Reloj",
    "Bikini", "Traje de baño", "Pijama", "Bata", "Ropa interior",
    "Suéter", "Chaleco", "Poncho", "Kimono"
];

/// Obtiene el nombre de una prenda según su tipo
pub fn get_clothing_name(clothing_type: u8) -> &'static str {
    CLOTHING_NAMES.get(clothing_type as usize)
        .unwrap_or(&"Desconocida")
}

/// Estado de un jugador individual
#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct PlayerState {
    pub id: Uuid,
    pub nickname: String,
    /// 6 sets de 4 cartas cada uno
    pub sets: [[Card; 4]; 6],
    /// Set que está viendo actualmente (0-5)
    pub current_set_index: usize,
    /// Sets que el jugador ha volteado (visibles para todos)
    pub flipped_sets: [bool; 6],
    /// Si está en proceso de verificación
    pub is_verifying: bool,
    /// Momento en que terminó
    #[serde(skip)]
    pub finished_at: Option<Instant>,
    /// Posición final (1, 2, o 3)
    pub finished_position: Option<u8>,
}

#[allow(dead_code)]
impl PlayerState {
    pub fn new(id: Uuid, nickname: String, sets: [[Card; 4]; 6]) -> Self {
        Self {
            id,
            nickname,
            sets,
            current_set_index: 0,
            flipped_sets: [false; 6],
            is_verifying: false,
            finished_at: None,
            finished_position: None,
        }
    }

    /// Verifica si un set específico está completo (4 cartas idénticas)
    pub fn is_set_complete(&self, set_index: usize) -> bool {
        if set_index >= 6 {
            return false;
        }

        let set = &self.sets[set_index];
        let first_type = set[0].clothing_type;
        set.iter().all(|card| card.clothing_type == first_type)
    }

    /// Cuenta cuántos sets están completos
    pub fn count_completed_sets(&self) -> usize {
        (0..6).filter(|&i| self.is_set_complete(i)).count()
    }

    /// Verifica si todos los sets están completos
    pub fn all_sets_complete(&self) -> bool {
        self.count_completed_sets() == 6
    }
}

/// Estado del Quick Time Event
#[derive(Debug, Clone, Serialize)]
#[allow(dead_code)]
pub struct QteState {
    /// Participantes del QTE (player_id, nickname)
    pub participants: Vec<(Uuid, String)>,
    /// Índice de la carta en disputa (0-3)
    pub center_card_index: usize,
    /// Clicks por jugador
    pub clicks: std::collections::HashMap<Uuid, u32>,
    /// Datos del swap de cada participante: player_id -> (set_index, card_index)
    #[serde(skip)]
    pub swap_data: std::collections::HashMap<Uuid, (usize, usize)>,
    /// Momento en que inició el QTE
    #[serde(skip)]
    pub started_at: Instant,
    /// Duración del QTE en milisegundos (ej: 3000ms)
    pub duration_ms: u64,
}

/// Estado completo del juego
#[derive(Debug, Clone, Serialize)]
#[allow(dead_code)]
pub struct GameState {
    pub lobby_id: String,
    pub players: Vec<PlayerState>,
    /// Siempre 4 cartas en el centro
    pub center_cards: [Card; 4],
    /// IDs de jugadores que han terminado (en orden)
    pub rankings: Vec<Uuid>,
    /// QTE activo (si existe)
    pub active_qte: Option<QteState>,
    /// Momento en que inició el juego
    #[serde(skip)]
    pub started_at: Instant,
}

#[allow(dead_code)]
impl GameState {
    pub fn new(lobby_id: String, players: Vec<PlayerState>, center_cards: [Card; 4]) -> Self {
        Self {
            lobby_id,
            players,
            center_cards,
            rankings: Vec::new(),
            active_qte: None,
            started_at: Instant::now(),
        }
    }

    /// Encuentra un jugador por su ID
    pub fn find_player(&self, player_id: &Uuid) -> Option<&PlayerState> {
        self.players.iter().find(|p| p.id == *player_id)
    }

    /// Encuentra un jugador por su ID (mutable)
    pub fn find_player_mut(&mut self, player_id: &Uuid) -> Option<&mut PlayerState> {
        self.players.iter_mut().find(|p| p.id == *player_id)
    }

    /// Verifica si el juego ha terminado
    /// - 2 jugadores: termina cuando gana el 1er lugar
    /// - 3+ jugadores: termina cuando se define el 2do lugar
    pub fn is_finished(&self) -> bool {
        let required = if self.players.len() <= 2 { 1 } else { 2 };
        self.rankings.len() >= required
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_card_creation() {
        let card = Card::new(0, 5);
        assert_eq!(card.id, 0);
        assert_eq!(card.clothing_type, 5);
    }

    #[test]
    fn test_clothing_names() {
        assert_eq!(get_clothing_name(0), "Camiseta manga corta");
        assert_eq!(get_clothing_name(10), "Jeans");
        assert_eq!(get_clothing_name(48), "Kimono");
    }

    #[test]
    fn test_is_set_complete() {
        let sets = [
            // Set 0: completo (todas tipo 0)
            [Card::new(0, 0), Card::new(1, 0), Card::new(2, 0), Card::new(3, 0)],
            // Set 1: incompleto (mezcla)
            [Card::new(4, 1), Card::new(5, 2), Card::new(6, 1), Card::new(7, 1)],
            // Set 2: completo (todas tipo 5)
            [Card::new(8, 5), Card::new(9, 5), Card::new(10, 5), Card::new(11, 5)],
            // Set 3-5: incompletos
            [Card::new(12, 3), Card::new(13, 4), Card::new(14, 5), Card::new(15, 6)],
            [Card::new(16, 7), Card::new(17, 8), Card::new(18, 9), Card::new(19, 10)],
            [Card::new(20, 11), Card::new(21, 12), Card::new(22, 0), Card::new(23, 1)],
        ];

        let player = PlayerState::new(Uuid::new_v4(), "TestPlayer".to_string(), sets);

        assert!(player.is_set_complete(0)); // Completo
        assert!(!player.is_set_complete(1)); // Incompleto
        assert!(player.is_set_complete(2)); // Completo
        assert!(!player.is_set_complete(3)); // Incompleto

        assert_eq!(player.count_completed_sets(), 2);
        assert!(!player.all_sets_complete());
    }
}
