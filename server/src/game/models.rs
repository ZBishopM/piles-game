
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use std::time::{Duration, Instant};

/// Cuánto se mantiene viva una racha sin hacer nada.
///
/// Son 4 s contra los 3 s de `STUN_DURATION` a propósito: el bloqueo por
/// perder una pelea **no** debe comerse la racha de rebote, porque entonces
/// "pierdes el combo" sería un efecto secundario del reloj y no una regla. Al
/// perder se resetea explícitamente (ver `reset_combo`), así la pelea es de
/// verdad a dos bandas: ganas y la racha sube, pierdes y la pierdes entera
/// además de quedarte congelado.
pub const COMBO_WINDOW: Duration = Duration::from_secs(4);

/// Tope del multiplicador. Sin tope, una racha larga convertiría la
/// puntuación de la partida en ruido.
pub const COMBO_MAX_MULTIPLIER: u32 = 5;

/// Puntos por eslabón antes de multiplicar.
pub const COMBO_POINTS_PER_LINK: u32 = 10;

/// Cuántos eslabones vale cada jugada. Coger una carta mantiene el ritmo;
/// ganar una pelea es lo que queremos que la gente busque, así que paga más;
/// completar un set es el objetivo del juego y paga todavía más.
pub const COMBO_LINKS_TAKE: u32 = 1;
pub const COMBO_LINKS_FIGHT_WON: u32 = 2;
pub const COMBO_LINKS_SET_DONE: u32 = 3;

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

/// Las 50 prendas dibujadas en `client/cards.webp`, **en el orden exacto de
/// la hoja de sprites**: 4 prendas por fila, 4 variantes de color cada una.
/// El cliente calcula la celda a partir del índice, así que reordenar esta
/// lista cambia qué dibujo sale en cada carta.
///
/// Los nombres ya no se muestran en pantalla (las cartas son solo imagen),
/// pero se siguen enviando y sirven para tooltips/depuración.
pub const CLOTHING_NAMES: &[&str] = &[
    // fila 0
    "Calcetines cortos", "Calcetines largos", "Calzoncillos", "Bóxers",
    // fila 1
    "Top deportivo", "Camiseta de tirantes", "Bermudas cargo", "Shorts de baño",
    // fila 2
    "Shorts deportivos", "Shorts vaqueros", "Falda plisada", "Pantalones chinos",
    // fila 3
    "Pantalón de chándal", "Pantalones cargo", "Jeans rotos", "Leggings",
    // fila 4
    "Jumpsuit", "Peto vaquero", "Camiseta manga corta", "Polo",
    // fila 5
    "Camisa hawaiana", "Blusa de tirantes", "Camisa de franela", "Camiseta sin mangas",
    // fila 6
    "Camiseta de baloncesto", "Camiseta de béisbol", "Sudadera sin capucha", "Suéter de punto",
    // fila 7
    "Camisa formal", "Blusa abullonada", "Mono corto", "Túnica",
    // fila 8
    "Chaleco de rombos", "Chaleco acolchado", "Sudadera con capucha", "Chaqueta",
    // fila 9
    "Cárdigan", "Chaqueta universitaria", "Plumífero", "Parka",
    // fila 10
    "Gabardina", "Vestido de verano", "Sudadera con cremallera", "Body de bebé",
    // fila 11
    "Bufanda", "Guantes", "Gorro de lana", "Bata",
    // fila 12 (la celda siguiente de la hoja es el reverso, sin usar)
    "Bikini", "Bañador",
];

/// Cuántas prendas distintas existen. Con 8 jugadores hacen falta 49 sets,
/// así que siempre queda al menos una prenda fuera de la partida.
pub const TOTAL_CLOTHING_TYPES: u8 = CLOTHING_NAMES.len() as u8;

/// Obtiene el nombre de una prenda según su tipo
pub fn get_clothing_name(clothing_type: u8) -> &'static str {
    CLOTHING_NAMES.get(clothing_type as usize)
        .unwrap_or(&"Desconocida")
}

/// Estado de un jugador individual
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerState {
    pub id: Uuid,
    pub nickname: String,
    /// 6 sets de 4 huecos. Un hueco puede estar vacío: al soltar una carta
    /// al centro se queda ahí el sitio libre hasta que el jugador coge otra.
    pub sets: [[Option<Card>; 4]; 6],
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
    /// Hueco que quedó libre al soltar una carta, `(set, carta)`. Mientras
    /// haya deuda no se puede soltar otra, ni intercambiar, ni mostrar sets:
    /// lo único que se puede hacer es coger una carta del centro.
    pub owed_slot: Option<(usize, usize)>,
    /// Eslabones encadenados ahora mismo. El servidor es el único que lo
    /// calcula: si el cliente llevara la cuenta, el multiplicador sería un
    /// número que se puede inventar.
    pub combo: u32,
    /// Cuándo se corta la racha si no haces nada.
    #[serde(skip)]
    pub combo_expires_at: Option<Instant>,
    /// La racha más larga de la partida, para el resumen final.
    pub best_combo: u32,
    /// Puntos acumulados por combo. Se suman a los del puesto final.
    pub combo_points: u32,
}

impl PlayerState {
    pub fn new(id: Uuid, nickname: String, sets: [[Card; 4]; 6]) -> Self {
        Self {
            id,
            nickname,
            sets: sets.map(|set| set.map(Some)),
            current_set_index: 0,
            flipped_sets: [false; 6],
            is_verifying: false,
            finished_at: None,
            finished_position: None,
            owed_slot: None,
            combo: 0,
            combo_expires_at: None,
            best_combo: 0,
            combo_points: 0,
        }
    }

    /// ¿Le falta una carta por coger?
    pub fn owes_card(&self) -> bool {
        self.owed_slot.is_some()
    }

    /// Multiplicador actual. Una sola expresión en vez de una tabla de tramos.
    pub fn combo_multiplier(&self) -> u32 {
        (1 + self.combo / 3).min(COMBO_MAX_MULTIPLIER)
    }

    /// ¿Queda ventana? Lo usa todo lo demás para no repetir la comparación.
    pub fn combo_is_live(&self) -> bool {
        self.combo_expires_at.map_or(false, |until| Instant::now() < until)
    }

    /// Corta la racha si la ventana ya venció.
    ///
    /// Se llama al principio de cada acción en vez de montar un temporizador
    /// por jugador: sale más barato y deja al servidor como única fuente de
    /// verdad. El cliente solo anima su propia barra con `window_ms`, igual
    /// que ya hace la barra del bloqueo.
    pub fn expire_combo_if_stale(&mut self) {
        if self.combo > 0 && !self.combo_is_live() {
            self.reset_combo();
        }
    }

    /// Suma eslabones y devuelve los puntos que ha dado la jugada.
    /// El multiplicador se aplica **después** de sumar, así el eslabón que te
    /// sube de tramo ya cobra al tramo nuevo.
    pub fn add_combo_links(&mut self, links: u32) -> u32 {
        self.expire_combo_if_stale();
        self.combo += links;
        if self.combo > self.best_combo {
            self.best_combo = self.combo;
        }
        self.combo_expires_at = Some(Instant::now() + COMBO_WINDOW);
        let earned = COMBO_POINTS_PER_LINK * links * self.combo_multiplier();
        self.combo_points += earned;
        earned
    }

    /// Racha a cero. Los puntos ya ganados no se tocan: se han cobrado.
    pub fn reset_combo(&mut self) {
        self.combo = 0;
        self.combo_expires_at = None;
    }

    /// Racha viva y lo bastante alta para que los demás la vean. Es lo que se
    /// difunde en `PlayerProgress` para que den ganas de ir a quitarle cartas.
    pub fn is_on_fire(&self) -> bool {
        self.combo_is_live() && self.combo_multiplier() >= 2
    }

    /// Verifica si un set específico está completo (4 cartas idénticas)
    pub fn is_set_complete(&self, set_index: usize) -> bool {
        if set_index >= 6 {
            return false;
        }

        // Un set con un hueco libre no puede estar completo, por muy iguales
        // que sean las otras tres.
        let set = &self.sets[set_index];
        let Some(first) = set[0] else { return false };
        set.iter().all(|slot| matches!(slot, Some(c) if c.clothing_type == first.clothing_type))
    }

    /// Cuenta cuántos sets están completos
    pub fn count_completed_sets(&self) -> usize {
        (0..6).filter(|&i| self.is_set_complete(i)).count()
    }
}

/// Estado del Quick Time Event
#[derive(Debug, Clone, Serialize)]
pub struct QteState {
    /// Participantes del QTE (player_id, nickname)
    pub participants: Vec<(Uuid, String)>,
    /// Carta en disputa, por id: el centro cambia de tamaño y un índice
    /// dejaría de apuntar a la misma carta.
    pub card_id: u32,
    /// Clicks por jugador
    pub clicks: std::collections::HashMap<Uuid, u32>,
    /// Duración del QTE en milisegundos (ej: 3000ms)
    pub duration_ms: u64,
}

/// Estado completo del juego
#[derive(Debug, Clone, Serialize)]
pub struct GameState {
    pub lobby_id: String,
    pub players: Vec<PlayerState>,
    /// El centro empieza con 4 pero crece: al soltar una carta se añade aquí
    /// y cualquiera puede cogerla. Cada deuda pendiente es una carta de más.
    pub center_cards: Vec<Card>,
    /// IDs de jugadores que han terminado (en orden)
    pub rankings: Vec<Uuid>,
    /// QTE activo (si existe)
    pub active_qte: Option<QteState>,
}

impl GameState {
    pub fn new(lobby_id: String, players: Vec<PlayerState>, center_cards: Vec<Card>) -> Self {
        Self {
            lobby_id,
            players,
            center_cards,
            rankings: Vec::new(),
            active_qte: None,
        }
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
    fn test_clothing_names() {
        // El orden es el de client/cards.webp: 4 prendas por fila.
        assert_eq!(get_clothing_name(0), "Calcetines cortos");
        assert_eq!(get_clothing_name(18), "Camiseta manga corta");
        assert_eq!(get_clothing_name(49), "Bañador");
        assert_eq!(get_clothing_name(TOTAL_CLOTHING_TYPES), "Desconocida");
    }

    #[test]
    fn there_are_enough_clothes_for_a_full_table() {
        // 8 jugadores necesitan 49 sets; la hoja dibuja 50 prendas, así que
        // siempre sobra alguna. Si alguien recorta la lista, esto avisa.
        assert_eq!(CLOTHING_NAMES.len(), 50);
        assert!(TOTAL_CLOTHING_TYPES > 49);
    }

    // Soltar una carta deja un hueco. Mientras esté ahí el set no puede
    // darse por completo, aunque las otras tres sean iguales — si no, se
    // podría "completar" un set teniendo solo 3 cartas.
    #[test]
    fn a_set_with_a_hole_is_never_complete() {
        let full = [Card::new(0, 7), Card::new(1, 7), Card::new(2, 7), Card::new(3, 7)];
        let sets = [full, full, full, full, full, full];
        let mut player = PlayerState::new(Uuid::new_v4(), "Ana".to_string(), sets);
        assert!(player.is_set_complete(0));
        assert_eq!(player.count_completed_sets(), 6);
        assert!(!player.owes_card());

        player.sets[0][2] = None;   // soltó una carta
        player.owed_slot = Some((0, 2));

        assert!(!player.is_set_complete(0), "con un hueco no está completo");
        assert_eq!(player.count_completed_sets(), 5);
        assert_ne!(player.count_completed_sets(), 6);
        assert!(player.owes_card());

        player.sets[0][2] = Some(Card::new(9, 7));   // cogió otra igual
        player.owed_slot = None;
        assert!(player.is_set_complete(0));
        assert_eq!(player.count_completed_sets(), 6);
    }

    #[test]
    fn a_hole_in_the_first_slot_also_blocks_completion() {
        // El primer hueco es el que define el tipo del set, así que si el
        // vacío cae ahí hay que tratarlo aparte.
        let full = [Card::new(0, 3), Card::new(1, 3), Card::new(2, 3), Card::new(3, 3)];
        let mut player = PlayerState::new(Uuid::new_v4(), "Ana".to_string(), [full; 6]);
        player.sets[0][0] = None;
        assert!(!player.is_set_complete(0));
    }

    fn a_player() -> PlayerState {
        let full = [Card::new(0, 7), Card::new(1, 7), Card::new(2, 7), Card::new(3, 7)];
        PlayerState::new(Uuid::new_v4(), "Ana".to_string(), [full; 6])
    }

    #[test]
    fn combo_multiplier_climbs_every_three_links_and_then_stops() {
        let mut p = a_player();
        assert_eq!(p.combo_multiplier(), 1, "sin racha no hay multiplicador");

        for (links, expected) in [(2u32, 1u32), (1, 2), (3, 3), (3, 4), (3, 5)] {
            p.add_combo_links(links);
            assert_eq!(p.combo_multiplier(), expected, "tras {} eslabones", p.combo);
        }

        // El tope aguanta: veinte eslabones más no lo suben.
        p.add_combo_links(20);
        assert_eq!(p.combo_multiplier(), COMBO_MAX_MULTIPLIER);
    }

    #[test]
    fn a_link_is_paid_at_the_tier_it_reaches() {
        // Dos eslabones sueltos se cobran a x1; el tercero ya sube a x2 y cobra
        // a x2. Si se multiplicara antes de sumar, cobraría a x1.
        let mut p = a_player();
        assert_eq!(p.add_combo_links(1), COMBO_POINTS_PER_LINK);
        assert_eq!(p.add_combo_links(1), COMBO_POINTS_PER_LINK);
        assert_eq!(p.add_combo_links(1), COMBO_POINTS_PER_LINK * 2);
        assert_eq!(p.combo_points, COMBO_POINTS_PER_LINK * 4);
    }

    #[test]
    fn losing_a_fight_zeroes_the_streak_but_not_the_points() {
        let mut p = a_player();
        p.add_combo_links(COMBO_LINKS_SET_DONE);
        p.add_combo_links(COMBO_LINKS_FIGHT_WON);
        let banked = p.combo_points;
        assert!(banked > 0);
        assert_eq!(p.best_combo, 5);

        p.reset_combo();

        assert_eq!(p.combo, 0);
        assert!(!p.combo_is_live());
        assert_eq!(p.combo_multiplier(), 1);
        assert_eq!(p.combo_points, banked, "lo ya cobrado no se devuelve");
        assert_eq!(p.best_combo, 5, "el récord de la partida se conserva");
    }

    // La ventana (4 s) es más larga que el bloqueo por perder (3 s) a
    // propósito: perder tiene que cortar la racha por regla, no porque el
    // reloj llegue justo. Aquí se comprueba que una ventana vencida sí corta.
    #[test]
    fn an_expired_window_cuts_the_streak() {
        let mut p = a_player();
        p.add_combo_links(COMBO_LINKS_SET_DONE);
        assert!(p.combo_is_live());

        // Vencida hace un instante, sin esperar 4 s en un test.
        p.combo_expires_at = Some(Instant::now() - Duration::from_millis(1));
        assert!(!p.combo_is_live());

        p.expire_combo_if_stale();
        assert_eq!(p.combo, 0);

        // Y el siguiente eslabón arranca de cero, no de donde se quedó.
        assert_eq!(p.add_combo_links(1), COMBO_POINTS_PER_LINK);
        assert_eq!(p.combo, 1);
    }

    #[test]
    fn on_fire_needs_a_live_streak_of_at_least_two_times() {
        let mut p = a_player();
        assert!(!p.is_on_fire(), "nadie arde sin racha");

        p.add_combo_links(2);   // x1 todavía
        assert!(!p.is_on_fire());

        p.add_combo_links(1);   // x2
        assert!(p.is_on_fire());

        // Una racha alta pero vencida no arde: si no, el icono se quedaría
        // encendido para siempre en el tablero de los demás.
        p.combo_expires_at = Some(Instant::now() - Duration::from_millis(1));
        assert!(!p.is_on_fire());
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
        assert_ne!(player.count_completed_sets(), 6);
    }
}
