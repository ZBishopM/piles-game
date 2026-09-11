use super::models::{Card, GameState, PlayerState, TOTAL_CLOTHING_TYPES};
use rand::seq::SliceRandom;
use rand::thread_rng;
use uuid::Uuid;

/// Calcula el número total de sets necesarios según el número de jugadores
/// Fórmula: total_sets = 13 + ((num_players - 2) * 6)
pub fn calculate_total_sets(num_players: u8) -> u8 {
    if num_players < 2 || num_players > 8 {
        panic!("El número de jugadores debe estar entre 2 y 8");
    }
    13 + ((num_players - 2) * 6)
}

/// Genera un mazo completo de cartas según el número de jugadores
///
/// Cada set completo tiene 4 cartas idénticas del mismo tipo de prenda.
/// El número total de cartas = num_sets * 4
///
/// # Ejemplos:
/// - 2 jugadores: 13 sets → 52 cartas totales
/// - 4 jugadores: 25 sets → 100 cartas totales
/// - 8 jugadores: 49 sets → 196 cartas totales
pub fn generate_deck(num_players: u8) -> Vec<Card> {
    let num_sets = calculate_total_sets(num_players);
    assert!(
        num_sets <= TOTAL_CLOTHING_TYPES,
        "hacen falta {num_sets} prendas distintas y solo hay {TOTAL_CLOTHING_TYPES}"
    );
    let mut rng = thread_rng();

    // Qué prendas entran se sortea entre las 50 dibujadas, no se cogen las
    // primeras en orden: si no, cada partida de 2 jugadores usaría siempre
    // las mismas 13. Con 8 jugadores hacen falta 49, así que siempre queda
    // alguna fuera.
    let mut clothing_types: Vec<u8> = (0..TOTAL_CLOTHING_TYPES).collect();
    clothing_types.shuffle(&mut rng);
    clothing_types.truncate(num_sets as usize);

    // Los ids son correlativos y se reparten de 4 en 4, así que `id % 4`
    // identifica la variante de color dentro del set — es lo que usa el
    // cliente para elegir la celda de la hoja de sprites.
    let mut deck = Vec::new();
    let mut card_id = 0;
    for clothing_type in clothing_types {
        for _ in 0..4 {
            deck.push(Card::new(card_id, clothing_type));
            card_id += 1;
        }
    }

    deck.shuffle(&mut rng);

    deck
}

/// Distribuye las cartas del mazo entre los jugadores y el centro
///
/// # Retorna
/// - Una tupla con: (sets_de_jugadores, cartas_del_centro)
/// - Cada jugador recibe 24 cartas organizadas en 6 sets de 4 cartas
/// - El centro recibe 4 cartas
///
/// # Panics
/// Si el mazo no tiene suficientes cartas para todos los jugadores y el centro
pub fn distribute_cards(deck: Vec<Card>, num_players: u8) -> (Vec<[[Card; 4]; 6]>, [Card; 4]) {
    let cards_per_player = 24; // 6 sets * 4 cartas
    let cards_for_center = 4;
    let total_cards_needed = (num_players as usize * cards_per_player) + cards_for_center;

    if deck.len() < total_cards_needed {
        panic!(
            "Mazo insuficiente: tiene {} cartas, necesita {}",
            deck.len(),
            total_cards_needed
        );
    }

    let mut card_iter = deck.into_iter();
    let mut player_sets = Vec::new();

    // Distribuir cartas a cada jugador
    for _ in 0..num_players {
        let mut sets: [[Card; 4]; 6] = [[Card::new(0, 0); 4]; 6];

        for set_idx in 0..6 {
            for card_idx in 0..4 {
                sets[set_idx][card_idx] = card_iter.next()
                    .expect("No hay suficientes cartas para los jugadores");
            }
        }

        player_sets.push(sets);
    }

    // Tomar 4 cartas para el centro
    let center_cards: [Card; 4] = [
        card_iter.next().expect("No hay suficientes cartas para el centro"),
        card_iter.next().expect("No hay suficientes cartas para el centro"),
        card_iter.next().expect("No hay suficientes cartas para el centro"),
        card_iter.next().expect("No hay suficientes cartas para el centro"),
    ];

    (player_sets, center_cards)
}

/// Qué pasó cuando alguien abandonó la partida a medias.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct RetireOutcome {
    /// Prendas que salen de la partida entera, con sus 4 cartas.
    pub retired_types: Vec<u8>,
    /// Cartas del que se fue que siguen en juego y han ido al centro.
    pub returned_to_center: usize,
    /// Huecos abiertos a jugadores que seguían jugando.
    pub holes_punched: usize,
}

/// Posiciones `(set, hueco)` donde ese jugador tiene cartas de esa prenda.
fn slots_of_type(p: &PlayerState, clothing_type: u8) -> Vec<(usize, usize)> {
    let mut out = Vec::new();
    for (s, set) in p.sets.iter().enumerate() {
        for (c, slot) in set.iter().enumerate() {
            if matches!(slot, Some(card) if card.clothing_type == clothing_type) {
                out.push((s, c));
            }
        }
    }
    out
}

/// ¿Se puede retirar esta prenda sin hacer daño?
///
/// Se comprueba dos veces —al puntuar y otra vez justo antes de retirar—
/// porque retirar una prenda abre huecos y cambia quién puede recibir el
/// siguiente: puntuar una sola vez al principio dejaría pasar un segundo
/// hueco a la misma persona.
fn is_safe_to_retire(game: &GameState, clothing_type: u8, punched: &[Uuid]) -> Option<usize> {
    let mut cost = 0usize;
    for p in &game.players {
        let slots = slots_of_type(p, clothing_type);
        if slots.is_empty() {
            continue;
        }
        // Nunca deshacer un set ya completo: es lo más cruel que te puede
        // pasar por culpa de la conexión de otro.
        if slots.iter().any(|(s, _)| p.is_set_complete(*s)) {
            return None;
        }
        // `owed_slot` guarda UN hueco, así que no se puede abrir un segundo a
        // la misma persona ni pisar una deuda que ya tenía.
        if slots.len() > 1 || punched.contains(&p.id) {
            return None;
        }
        cost += slots.len();
    }
    Some(cost)
}

/// Alguien se fue y no volvió: la partida se redimensiona a un jugador menos.
///
/// La cuenta cuadra sola: un jugador lleva 24 cartas y pasar de `n` a `n-1`
/// jugadores son justo 6 sets = 24 cartas menos. Lo que estaba mal antes no
/// era cuántas cartas se quitaban sino **cuáles**: borrar las 24 sueltas del
/// que se iba rompía ~20 prendas distintas, y como cada prenda tiene
/// exactamente 4 cartas, una prenda a la que le falta una ya no se puede
/// completar nunca. Por eso aquí se retiran **prendas enteras**.
///
/// Retirar menos de 6 es inofensivo: sobran sets, y sobrar solo da holgura.
/// Por eso el algoritmo es codicioso y sin caso de fallo.
pub fn retire_types_on_leave(game: &mut GameState, leaver: &Uuid) -> RetireOutcome {
    let Some(pos) = game.players.iter().position(|p| p.id == *leaver) else {
        return RetireOutcome::default();
    };
    let gone = game.players.remove(pos);
    let leaver_cards: Vec<Card> = gone.sets.iter().flatten().filter_map(|slot| *slot).collect();

    let give_back_everything = |game: &mut GameState, cards: Vec<Card>| {
        let n = cards.len();
        game.center_cards.extend(cards);
        RetireOutcome { retired_types: Vec::new(), returned_to_center: n, holes_punched: 0 }
    };

    // Con menos de dos ya no hay partida que redimensionar; cancelar o no lo
    // decide quien llama.
    let remaining = game.players.len();
    if remaining < 2 {
        return give_back_everything(game, leaver_cards);
    }

    // Prendas que hay ahora, contando las del que se fue: todavía no han ido
    // a ningún sitio.
    let mut in_play: Vec<u8> = game.players.iter()
        .flat_map(|p| p.sets.iter().flatten().filter_map(|slot| *slot))
        .map(|c| c.clothing_type)
        .chain(game.center_cards.iter().map(|c| c.clothing_type))
        .chain(leaver_cards.iter().map(|c| c.clothing_type))
        .collect();
    in_play.sort_unstable();
    in_play.dedup();

    let target = calculate_total_sets(remaining as u8) as usize;
    let to_retire = in_play.len().saturating_sub(target);
    if to_retire == 0 {
        return give_back_everything(game, leaver_cards);
    }

    // Quien ya debía una carta no puede recibir otro hueco.
    let mut punched: Vec<Uuid> = game.players.iter()
        .filter(|p| p.owes_card())
        .map(|p| p.id)
        .collect();

    // Coste 0 = esa prenda solo vive en la mano del que se fue y en el centro,
    // así que retirarla no la nota nadie. Se ordena por coste, y el número de
    // prenda desempata para que el resultado sea determinista.
    let mut scored: Vec<(usize, u8)> = in_play.iter()
        .filter_map(|&t| is_safe_to_retire(game, t, &punched).map(|cost| (cost, t)))
        .collect();
    scored.sort_unstable();

    let mut outcome = RetireOutcome::default();
    for (_, t) in scored {
        if outcome.retired_types.len() >= to_retire {
            break;
        }
        // Revalidar: los huecos abiertos hasta ahora cambian quién puede
        // recibir el siguiente.
        if is_safe_to_retire(game, t, &punched).is_none() {
            continue;
        }

        for p in game.players.iter_mut() {
            for (s, c) in slots_of_type(p, t) {
                p.sets[s][c] = None;
                p.owed_slot = Some((s, c));
                outcome.holes_punched += 1;
                punched.push(p.id);
            }
        }
        game.center_cards.retain(|c| c.clothing_type != t);
        outcome.retired_types.push(t);
    }

    // Lo que llevaba y no se ha retirado vuelve al centro: toda prenda que
    // siga en juego tiene que conservar sus 4 cartas, o deja de completarse.
    let kept: Vec<Card> = leaver_cards.into_iter()
        .filter(|c| !outcome.retired_types.contains(&c.clothing_type))
        .collect();
    outcome.returned_to_center = kept.len();
    game.center_cards.extend(kept);

    outcome
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Abandonar la partida ──────────────────────────────────────────────

    /// Reparte una partida de verdad y devuelve su GameState.
    fn a_game(num_players: u8) -> GameState {
        let deck = generate_deck(num_players);
        let (sets, center) = distribute_cards(deck, num_players);
        let players: Vec<PlayerState> = sets.into_iter().enumerate()
            .map(|(i, s)| PlayerState::new(Uuid::new_v4(), format!("P{i}"), s))
            .collect();
        GameState::new("TEST".to_string(), players, center.to_vec())
    }

    /// Todas las cartas que siguen en juego, en manos o en el centro.
    fn cards_in_play(game: &GameState) -> Vec<Card> {
        game.players.iter()
            .flat_map(|p| p.sets.iter().flatten().filter_map(|slot| *slot))
            .chain(game.center_cards.iter().copied())
            .collect()
    }

    /// La invariante que el bug original rompía: cada prenda que siga viva
    /// tiene que conservar sus 4 cartas, o no se puede completar nunca.
    fn every_live_type_is_whole(game: &GameState) {
        let cards = cards_in_play(game);
        let mut types: Vec<u8> = cards.iter().map(|c| c.clothing_type).collect();
        types.sort_unstable();
        types.dedup();
        for t in types {
            let n = cards.iter().filter(|c| c.clothing_type == t).count();
            assert_eq!(n, 4, "la prenda {t} se quedó con {n} cartas y ya no se puede completar");
        }
    }

    #[test]
    fn leaving_keeps_every_surviving_type_completable() {
        let mut game = a_game(4);
        let leaver = game.players[1].id;

        retire_types_on_leave(&mut game, &leaver);

        assert_eq!(game.players.len(), 3);
        every_live_type_is_whole(&game);
    }

    // Recortar de 25 prendas a las 19 de una partida a 3 querría retirar 6,
    // pero `owed_slot` solo guarda UN hueco por jugador: con 3 supervivientes
    // solo se pueden retirar las prendas que no tiene nadie (coste 0) más, como
    // mucho, una por jugador. Así que normalmente se retiran menos de 6, y eso
    // es correcto: sobrar sets solo da holgura. Lo que nunca puede pasar es
    // pasarse de recorte y dejar la partida sin resolver.
    #[test]
    fn leaving_trims_towards_the_smaller_deck_without_overtrimming() {
        let mut game = a_game(4);
        let leaver = game.players[0].id;
        let before = {
            let mut t: Vec<u8> = cards_in_play(&game).iter().map(|c| c.clothing_type).collect();
            t.sort_unstable(); t.dedup(); t.len()
        };

        let out = retire_types_on_leave(&mut game, &leaver);

        let mut types: Vec<u8> = cards_in_play(&game).iter().map(|c| c.clothing_type).collect();
        types.sort_unstable();
        types.dedup();

        let target = calculate_total_sets(3) as usize;
        assert!(out.retired_types.len() <= 6, "nunca más de las 6 que sobran");
        assert!(types.len() <= before, "no puede haber más prendas que antes");
        assert!(types.len() >= target, "pasarse de recorte dejaría la partida sin resolver");
        // Lo que de verdad importa: los 3 que siguen necesitan 18 sets y tiene
        // que haber al menos eso.
        assert!(types.len() >= 3 * 6, "los que siguen tienen que poder acabar");
    }

    #[test]
    fn a_completed_set_is_never_dismantled() {
        let mut game = a_game(3);
        // Regalarle a P1 un set completo de una prenda que también está en la
        // mano del que se va, para que sea justo la candidata más barata.
        let leaver = game.players[0].id;
        let victim_type = game.players[0].sets[0][0].unwrap().clothing_type;
        let full = [
            Some(Card::new(900, victim_type)), Some(Card::new(901, victim_type)),
            Some(Card::new(902, victim_type)), Some(Card::new(903, victim_type)),
        ];
        game.players[1].sets[0] = full;
        // Por id y no por índice: al sacar al que se va, el vector se recoloca.
        let victim = game.players[1].id;
        assert!(game.players[1].is_set_complete(0));

        retire_types_on_leave(&mut game, &leaver);

        let victim = game.players.iter().find(|p| p.id == victim).expect("sigue jugando");
        assert!(victim.is_set_complete(0), "no se puede deshacer un set ya hecho");
        assert!(victim.sets[0].iter().all(|s| s.is_some()));
    }

    #[test]
    fn nobody_ends_up_owing_two_cards() {
        // owed_slot solo guarda un hueco, así que abrir dos a la misma persona
        // perdería uno y la dejaría con un agujero que nunca podría tapar.
        let mut game = a_game(5);
        let leaver = game.players[4].id;

        let out = retire_types_on_leave(&mut game, &leaver);

        // Cada hueco abierto corresponde a un jugador distinto.
        let owing = game.players.iter().filter(|p| p.owes_card()).count();
        assert_eq!(owing, out.holes_punched, "algún jugador recibió más de un hueco");
        every_live_type_is_whole(&game);
    }

    #[test]
    fn someone_who_already_owed_a_card_is_left_alone() {
        let mut game = a_game(4);
        let leaver = game.players[3].id;
        game.players[0].sets[2][1] = None;
        game.players[0].owed_slot = Some((2, 1));
        let debt_before = game.players[0].owed_slot;

        retire_types_on_leave(&mut game, &leaver);

        assert_eq!(game.players[0].owed_slot, debt_before,
                   "no se le puede pisar una deuda que ya tenía");
    }

    #[test]
    fn dropping_below_two_players_just_returns_the_cards() {
        // Con un solo superviviente no hay nada que redimensionar; cancelar o
        // no es decisión de quien llama, aquí solo no se pierde ninguna carta.
        let mut game = a_game(2);
        let before = cards_in_play(&game).len();
        let leaver = game.players[0].id;

        let out = retire_types_on_leave(&mut game, &leaver);

        assert_eq!(game.players.len(), 1);
        assert!(out.retired_types.is_empty());
        assert_eq!(cards_in_play(&game).len(), before, "no desaparece ninguna carta");
        every_live_type_is_whole(&game);
    }

    #[test]
    fn an_unknown_leaver_changes_nothing() {
        let mut game = a_game(3);
        let before = cards_in_play(&game).len();

        let out = retire_types_on_leave(&mut game, &Uuid::new_v4());

        assert_eq!(out, RetireOutcome::default());
        assert_eq!(game.players.len(), 3);
        assert_eq!(cards_in_play(&game).len(), before);
    }

    #[test]
    fn test_calculate_total_sets() {
        assert_eq!(calculate_total_sets(2), 13);
        assert_eq!(calculate_total_sets(3), 19);
        assert_eq!(calculate_total_sets(4), 25);
        assert_eq!(calculate_total_sets(5), 31);
        assert_eq!(calculate_total_sets(6), 37);
        assert_eq!(calculate_total_sets(7), 43);
        assert_eq!(calculate_total_sets(8), 49);
    }

    #[test]
    #[should_panic]
    fn test_calculate_total_sets_invalid_too_few() {
        calculate_total_sets(1);
    }

    #[test]
    #[should_panic]
    fn test_calculate_total_sets_invalid_too_many() {
        calculate_total_sets(9);
    }

    #[test]
    fn test_generate_deck() {
        let deck = generate_deck(2);
        assert_eq!(deck.len(), 52); // 13 sets * 4 cartas

        let deck = generate_deck(4);
        assert_eq!(deck.len(), 100); // 25 sets * 4 cartas

        let deck = generate_deck(8);
        assert_eq!(deck.len(), 196); // 49 sets * 4 cartas
    }

    #[test]
    fn test_generate_deck_has_all_clothing_types() {
        let deck = generate_deck(2);

        // Las prendas ya no son las 13 primeras sino 13 cualesquiera de las
        // 50, pero cada una elegida sigue apareciendo exactamente 4 veces.
        let mut types: Vec<u8> = deck.iter().map(|c| c.clothing_type).collect();
        types.sort_unstable();
        types.dedup();
        assert_eq!(types.len(), 13);
        for clothing_type in types {
            let count = deck.iter().filter(|c| c.clothing_type == clothing_type).count();
            assert_eq!(count, 4, "el tipo {clothing_type} debería aparecer 4 veces");
            assert!(clothing_type < TOTAL_CLOTHING_TYPES);
        }
    }

    #[test]
    fn deck_picks_a_different_set_of_clothes_each_game() {
        // Sin esto cada partida de 2 jugadores usaba siempre las 13 mismas
        // prendas, porque los tipos se cogían en orden (0..num_sets).
        let types_of = || {
            let mut t: Vec<u8> = generate_deck(2).iter().map(|c| c.clothing_type).collect();
            t.sort_unstable();
            t.dedup();
            t
        };
        let first = types_of();
        // Con 13 de 50 la probabilidad de repetir selección es ínfima; 10
        // intentos descartan el caso de "siempre la misma lista".
        assert!((0..10).any(|_| types_of() != first), "la selección de prendas no varía");
    }

    #[test]
    fn eight_players_leave_at_least_one_garment_out() {
        let deck = generate_deck(8);
        let mut types: Vec<u8> = deck.iter().map(|c| c.clothing_type).collect();
        types.sort_unstable();
        types.dedup();
        assert_eq!(types.len(), 49, "8 jugadores usan 49 sets");
        assert!(
            (TOTAL_CLOTHING_TYPES as usize) > types.len(),
            "siempre tiene que sobrar alguna prenda"
        );
    }

    #[test]
    fn card_ids_encode_the_colour_variant() {
        // El cliente saca la variante de color con `id % 4`, así que los 4
        // ids de un mismo set tienen que cubrir 0,1,2,3 exactamente.
        let deck = generate_deck(4);
        let mut types: Vec<u8> = deck.iter().map(|c| c.clothing_type).collect();
        types.sort_unstable();
        types.dedup();
        for clothing_type in types {
            let mut variants: Vec<u32> = deck.iter()
                .filter(|c| c.clothing_type == clothing_type)
                .map(|c| c.id % 4)
                .collect();
            variants.sort_unstable();
            assert_eq!(variants, vec![0, 1, 2, 3], "tipo {clothing_type}");
        }
    }

    #[test]
    fn test_distribute_cards() {
        let deck = generate_deck(2);
        let (player_sets, center_cards) = distribute_cards(deck, 2);

        // Verificar que hay 2 jugadores
        assert_eq!(player_sets.len(), 2);

        // Verificar que cada jugador tiene 6 sets
        for sets in &player_sets {
            assert_eq!(sets.len(), 6);

            // Verificar que cada set tiene 4 cartas
            for set in sets.iter() {
                assert_eq!(set.len(), 4);
            }
        }

        // Verificar que el centro tiene 4 cartas
        assert_eq!(center_cards.len(), 4);

        // Verificar el total de cartas distribuidas
        let total_distributed = (2 * 24) + 4; // 2 jugadores * 24 cartas + 4 centro
        assert_eq!(total_distributed, 52);
    }

    #[test]
    fn test_distribute_cards_all_unique() {
        let deck = generate_deck(2);
        let (player_sets, center_cards) = distribute_cards(deck, 2);

        // Recolectar todos los IDs de cartas
        let mut all_card_ids = Vec::new();

        for sets in &player_sets {
            for set in sets.iter() {
                for card in set.iter() {
                    all_card_ids.push(card.id);
                }
            }
        }

        for card in center_cards.iter() {
            all_card_ids.push(card.id);
        }

        // Verificar que todos los IDs son únicos
        all_card_ids.sort();
        for i in 1..all_card_ids.len() {
            assert_ne!(
                all_card_ids[i - 1],
                all_card_ids[i],
                "Encontrado ID duplicado: {}",
                all_card_ids[i]
            );
        }
    }
}
