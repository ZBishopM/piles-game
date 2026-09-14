
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

/// El multiplicador se guarda en centésimas para no meter decimales en el
/// estado del juego: 100 = x1,00 · 125 = x1,25 · 500 = x5,00.
pub const COMBO_BASE_X100: u32 = 100;

/// Tope del multiplicador. Sin tope, una racha larga convertiría la
/// puntuación de la partida en ruido. Es además el umbral del frenesí.
pub const COMBO_MAX_X100: u32 = 500;

/// Puntos base de cada jugada, antes de multiplicar.
pub const COMBO_POINTS_PER_LINK: u32 = 10;

/// Lo que suma cada jugada al multiplicador.
///
/// Cambiar una carta por otra mantiene el ritmo; llevarte una prenda que YA
/// tienes en ese set es avanzar de verdad, y paga el doble.
pub const COMBO_GAIN_SWAP_X100: u32 = 25;
pub const COMBO_GAIN_SAME_TYPE_X100: u32 = 50;
pub const COMBO_GAIN_FIGHT_WON_X100: u32 = 50;
pub const COMBO_GAIN_SET_DONE_X100: u32 = 100;

/// Cuánto dura el bloqueo que reparte un frenesí.
pub const FRENZY_STUN: Duration = Duration::from_secs(2);

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
    /// Desde cuándo debe esa carta. Pasado `DEBT_DEADLINE` el servidor le
    /// asigna una del centro al azar: si no, con varios jugadores soltando y
    /// sin prisa por coger, el centro se queda permanentemente con 7 u 8
    /// cartas y nadie puede leer la mesa.
    #[serde(skip)]
    pub owed_since: Option<Instant>,
    /// Jugadas encadenadas ahora mismo. El servidor es el único que lo
    /// calcula: si el cliente llevara la cuenta, el multiplicador sería un
    /// número que se puede inventar.
    pub combo: u32,
    /// Multiplicador actual en centésimas. Arranca en 100 (x1).
    pub combo_mult_x100: u32,
    /// Cuándo se corta la racha si no haces nada.
    #[serde(skip)]
    pub combo_expires_at: Option<Instant>,
    /// La racha más larga de la partida, para el resumen final.
    pub best_combo: u32,
    /// Puntos acumulados por combo. Se suman a los del puesto final.
    pub combo_points: u32,
    /// Prenda que acaba de soltar. Recogerla otra vez no es avanzar.
    #[serde(skip)]
    pub last_dropped_type: Option<u8>,
    /// Cambios seguidos que no han mejorado ningún set.
    ///
    /// Es el freno contra el farmeo: mover cartas de acá para allá sin acercar
    /// ningún set paga cada vez menos. Avanzar de verdad lo pone a cero.
    #[serde(skip)]
    pub idle_swaps: u32,
    /// Tiene un frenesí cargado, listo para soltarlo o para parar el de otro.
    pub frenzy_ready: bool,
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
            owed_since: None,
            combo: 0,
            combo_mult_x100: COMBO_BASE_X100,
            combo_expires_at: None,
            best_combo: 0,
            combo_points: 0,
            last_dropped_type: None,
            idle_swaps: 0,
            frenzy_ready: false,
        }
    }

    /// ¿Le falta una carta por coger?
    pub fn owes_card(&self) -> bool {
        self.owed_slot.is_some()
    }

    /// Multiplicador actual, en centésimas.
    pub fn combo_multiplier_x100(&self) -> u32 {
        self.combo_mult_x100.min(COMBO_MAX_X100)
    }

    /// Lo que suma al multiplicador llevarte esa prenda a ese set.
    ///
    /// Tres reglas, y las dos últimas están para que no se pueda farmear:
    ///
    /// 1. Si la prenda YA está en ese set, te acerca a cerrarlo: +0,50.
    /// 2. Si es justo la que acabas de soltar, has deshecho tu propia jugada
    ///    y no vale nada. Sin esto, soltar y recoger la misma carta en bucle
    ///    subía el multiplicador solo.
    /// 3. Cualquier otro cambio vale +0,25, pero la mitad cada vez que
    ///    encadenas otro cambio que tampoco mejora nada: 25, 12, 6, 3… hasta
    ///    cero. Mover cartas sin acercar ningún set deja de pagar enseguida,
    ///    mientras que jugar de verdad cobra siempre entero.
    pub fn combo_gain_for_take(&self, taken: u8, set_index: usize) -> u32 {
        let ya_lo_tengo = self.sets.get(set_index).is_some_and(|s| {
            s.iter().flatten().any(|c| c.clothing_type == taken)
        });
        if ya_lo_tengo {
            return COMBO_GAIN_SAME_TYPE_X100;
        }
        if self.last_dropped_type == Some(taken) {
            return 0;
        }
        COMBO_GAIN_SWAP_X100 >> self.idle_swaps.min(8)
    }

    /// Apunta lo que acaba de soltar, para saber si luego lo recoge.
    pub fn note_drop(&mut self, dropped: u8) {
        self.last_dropped_type = Some(dropped);
    }

    /// Lleva la cuenta de cambios que no mejoran nada.
    pub fn note_take(&mut self, taken: u8, set_index: usize) {
        let mejoro = self.sets.get(set_index).is_some_and(|s| {
            s.iter().flatten().filter(|c| c.clothing_type == taken).count() >= 2
        });
        if mejoro { self.idle_swaps = 0; } else { self.idle_swaps += 1; }
        self.last_dropped_type = None;
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

    /// Sube el multiplicador y devuelve los puntos que ha dado la jugada.
    ///
    /// La subida se aplica **antes** de cobrar, así la jugada que te sube ya
    /// cobra al multiplicador nuevo. Con `gain_x100` a cero la racha sigue viva
    /// —la ventana se renueva— pero no sube: es lo que pasa al deshacer tu
    /// propia jugada o al encadenar cambios que no mejoran nada.
    pub fn add_combo(&mut self, gain_x100: u32) -> u32 {
        self.expire_combo_if_stale();
        self.combo += 1;
        if self.combo > self.best_combo {
            self.best_combo = self.combo;
        }
        self.combo_mult_x100 = (self.combo_mult_x100 + gain_x100).min(COMBO_MAX_X100);
        self.combo_expires_at = Some(Instant::now() + COMBO_WINDOW);

        // Tocar el techo carga el frenesí. Se guarda hasta gastarlo: puedes
        // soltarlo cuando quieras, o reservarlo para parar el de otro.
        if self.combo_mult_x100 >= COMBO_MAX_X100 {
            self.frenzy_ready = true;
        }

        let earned = COMBO_POINTS_PER_LINK * self.combo_multiplier_x100() / COMBO_BASE_X100;
        self.combo_points += earned;
        earned
    }

    /// Racha a cero. Los puntos ya ganados no se tocan: se han cobrado.
    /// El frenesí cargado tampoco: eso ya te lo habías ganado.
    pub fn reset_combo(&mut self) {
        self.combo = 0;
        self.combo_mult_x100 = COMBO_BASE_X100;
        self.combo_expires_at = None;
        self.idle_swaps = 0;
        self.last_dropped_type = None;
    }

    /// Gasta el frenesí. `false` si no había ninguno cargado.
    pub fn spend_frenzy(&mut self) -> bool {
        if !self.frenzy_ready {
            return false;
        }
        self.frenzy_ready = false;
        // Soltarlo cuesta la racha: si no, quien llega a x5 lo lanzaría cada
        // pocos segundos sin renunciar a nada.
        self.reset_combo();
        true
    }

    /// Racha viva y lo bastante alta para que los demás la vean. Es lo que se
    /// difunde en `PlayerProgress` para que den ganas de ir a quitarle cartas.
    pub fn is_on_fire(&self) -> bool {
        self.combo_is_live() && self.combo_multiplier_x100() >= 2 * COMBO_BASE_X100
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
    /// Peleas en curso, una por carta en disputa.
    ///
    /// Era un `Option`, es decir UNA sola pelea en toda la sala. Con cuatro
    /// jugadores dos peleas a la vez son de lo más normal, y la segunda pisaba
    /// a la primera: los de la primera dejaban de aparecer en `participants`,
    /// así que sus clicks no contaban ninguno y perdían 0-0 contra quien fuera.
    /// Medido: dos peleas simultáneas, 24 clicks contados en una y CERO en la
    /// otra.
    pub active_qtes: Vec<QteState>,
}

impl GameState {
    pub fn new(lobby_id: String, players: Vec<PlayerState>, center_cards: Vec<Card>) -> Self {
        Self {
            lobby_id,
            players,
            center_cards,
            rankings: Vec::new(),
            active_qtes: Vec::new(),
        }
    }

    /// La pelea por esa carta, si la hay.
    pub fn qte_for_card(&self, card_id: u32) -> Option<&QteState> {
        self.active_qtes.iter().find(|q| q.card_id == card_id)
    }

    /// La pelea en la que anda metido este jugador, si anda en alguna.
    pub fn qte_of_player(&self, player_id: &Uuid) -> Option<&QteState> {
        self.active_qtes.iter()
            .find(|q| q.participants.iter().any(|(id, _)| id == player_id))
    }

    /// Saca la pelea por esa carta para resolverla.
    pub fn take_qte_for_card(&mut self, card_id: u32) -> Option<QteState> {
        let i = self.active_qtes.iter().position(|q| q.card_id == card_id)?;
        Some(self.active_qtes.remove(i))
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
    fn the_multiplier_climbs_a_quarter_at_a_time_and_stops_at_five() {
        let mut p = a_player();
        assert_eq!(p.combo_multiplier_x100(), 100, "sin racha, x1");

        p.add_combo(COMBO_GAIN_SWAP_X100);
        assert_eq!(p.combo_multiplier_x100(), 125, "un cambio vale x0,25");

        p.add_combo(COMBO_GAIN_SAME_TYPE_X100);
        assert_eq!(p.combo_multiplier_x100(), 175, "la prenda que te sirve vale el doble");

        for _ in 0..20 { p.add_combo(COMBO_GAIN_SAME_TYPE_X100); }
        assert_eq!(p.combo_multiplier_x100(), COMBO_MAX_X100, "x5 es el techo");
    }

    #[test]
    fn a_play_is_paid_at_the_multiplier_it_reaches() {
        // Si se cobrara antes de subir, la jugada que te sube pagaría al
        // multiplicador viejo y subir nunca se notaría en la propia jugada.
        let mut p = a_player();
        assert_eq!(p.add_combo(COMBO_GAIN_SWAP_X100), COMBO_POINTS_PER_LINK * 125 / 100);
    }

    // El farmeo evidente: soltar una carta y volver a cogerla en bucle.
    #[test]
    fn taking_back_what_you_just_dropped_is_worth_nothing() {
        let mut p = a_player();          // sus 6 sets son del tipo 7
        p.note_drop(3);
        assert_eq!(p.combo_gain_for_take(3, 0), 0, "deshacer tu jugada no es avanzar");
    }

    #[test]
    fn a_garment_already_in_that_set_pays_double() {
        let mut p = a_player();
        p.note_drop(3);
        // El tipo 7 ya está en el set 0: eso sí acerca a cerrarlo.
        assert_eq!(p.combo_gain_for_take(7, 0), COMBO_GAIN_SAME_TYPE_X100);
    }

    // El otro farmeo: cambiar basura por basura sin parar. Paga, pero cada vez
    // menos, así que no compensa insistir.
    #[test]
    fn churning_junk_pays_less_every_time() {
        let mut p = a_player();
        let mut set1 = [Card::new(90, 1); 4];
        set1[0] = Card::new(90, 1);
        p.sets[1] = set1.map(Some);

        let primero = p.combo_gain_for_take(40, 1);
        assert_eq!(primero, COMBO_GAIN_SWAP_X100);

        // Tres cambios seguidos que no mejoran nada.
        for _ in 0..3 { p.note_take(40, 1); }
        let despues = p.combo_gain_for_take(41, 1);
        assert!(despues < primero, "{despues} debería ser menor que {primero}");

        // Y una jugada buena lo devuelve a tarifa completa.
        p.note_take(1, 1);
        assert_eq!(p.combo_gain_for_take(42, 1), COMBO_GAIN_SWAP_X100);
    }

    #[test]
    fn losing_a_fight_zeroes_the_streak_but_not_the_points() {
        let mut p = a_player();
        p.add_combo(COMBO_GAIN_SET_DONE_X100);
        p.add_combo(COMBO_GAIN_FIGHT_WON_X100);
        let banked = p.combo_points;
        assert!(banked > 0);
        assert_eq!(p.best_combo, 2);

        p.reset_combo();

        assert_eq!(p.combo, 0);
        assert!(!p.combo_is_live());
        assert_eq!(p.combo_multiplier_x100(), COMBO_BASE_X100);
        assert_eq!(p.combo_points, banked, "lo ya cobrado no se devuelve");
        assert_eq!(p.best_combo, 2, "el récord de la partida se conserva");
    }

    #[test]
    fn hitting_the_ceiling_loads_a_frenzy_and_spending_it_costs_the_streak() {
        let mut p = a_player();
        assert!(!p.frenzy_ready);

        for _ in 0..10 { p.add_combo(COMBO_GAIN_SAME_TYPE_X100); }
        assert_eq!(p.combo_multiplier_x100(), COMBO_MAX_X100);
        assert!(p.frenzy_ready, "llegar a x5 lo carga");

        assert!(p.spend_frenzy());
        assert!(!p.frenzy_ready, "se gasta");
        assert_eq!(p.combo_multiplier_x100(), COMBO_BASE_X100, "soltarlo cuesta la racha");
        assert!(!p.spend_frenzy(), "no se puede gastar dos veces");
    }

    #[test]
    fn a_frenzy_survives_losing_the_streak() {
        // Ganárselo cuesta llegar a x5; perderlo por un despiste o por perder
        // una pelea lo volvería un premio que nunca llegas a usar.
        let mut p = a_player();
        for _ in 0..10 { p.add_combo(COMBO_GAIN_SAME_TYPE_X100); }
        assert!(p.frenzy_ready);
        p.reset_combo();
        assert!(p.frenzy_ready, "la carga no se pierde con la racha");
    }

    // La ventana (4 s) es más larga que el bloqueo por perder (3 s) a
    // propósito: perder tiene que cortar la racha por regla, no porque el
    // reloj llegue justo. Aquí se comprueba que una ventana vencida sí corta.
    #[test]
    fn an_expired_window_cuts_the_streak() {
        let mut p = a_player();
        p.add_combo(COMBO_GAIN_SET_DONE_X100);
        assert!(p.combo_is_live());

        // Vencida hace un instante, sin esperar 4 s en un test.
        p.combo_expires_at = Some(Instant::now() - Duration::from_millis(1));
        assert!(!p.combo_is_live());

        p.expire_combo_if_stale();
        assert_eq!(p.combo, 0);

        // Y la siguiente jugada arranca de x1, no de donde se quedó.
        assert_eq!(p.add_combo(0), COMBO_POINTS_PER_LINK);
        assert_eq!(p.combo, 1);
    }

    #[test]
    fn on_fire_needs_a_live_streak_of_at_least_two_times() {
        let mut p = a_player();
        assert!(!p.is_on_fire(), "nadie arde sin racha");

        p.add_combo(COMBO_GAIN_SWAP_X100);   // x1,25 todavía
        assert!(!p.is_on_fire());

        p.add_combo(COMBO_GAIN_SET_DONE_X100);   // x2,25
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
