use super::models::Card;
use rand::seq::SliceRandom;
use rand::thread_rng;

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
    let mut deck = Vec::new();
    let mut card_id = 0;

    // Generar 4 cartas por cada tipo de prenda
    for clothing_type in 0..num_sets {
        for _ in 0..4 {
            deck.push(Card::new(card_id, clothing_type));
            card_id += 1;
        }
    }

    // Barajar el mazo
    let mut rng = thread_rng();
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

#[cfg(test)]
mod tests {
    use super::*;

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

        // Verificar que cada tipo de prenda (0-12) aparece exactamente 4 veces
        for clothing_type in 0..13 {
            let count = deck.iter().filter(|c| c.clothing_type == clothing_type).count();
            assert_eq!(count, 4, "Tipo {} debería aparecer 4 veces", clothing_type);
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
