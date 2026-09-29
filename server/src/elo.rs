//! Elo de piles: MultiElo, el Elo por parejas generalizado a N jugadores.
//!
//! Una partida de N se trata como las N·(N−1)/2 partidas a dos que contiene.
//! Con dos jugadores es exactamente el Elo de siempre, y la suma de cambios es
//! cero. Fuente: <https://github.com/djcunningham0/multielo> (MIT).
//!
//! Se descartaron OpenSkill y TrueSkill: aprenden antes con pocos datos, pero
//! dan una media y una incertidumbre en vez de "un Elo" que se pueda leer y ver
//! subir, y para un grupo de amigos la diferencia no compensa.

use serde::{Deserialize, Serialize};

use crate::bot::Difficulty;

/// Con lo que empieza todo el mundo.
pub const START: i32 = 1000;
/// Lo que se mueve por partida. El estándar.
const K: f64 = 32.0;
/// 400 puntos de diferencia = 10 a 1.
const D: f64 = 400.0;

/// Las dos clasificaciones. Con algún bot en la mesa es `Fun`, aunque jueguen
/// varias personas; solo entre personas es `Glory`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Pool {
    Fun,
    Glory,
}

/// Cómo acabó cada uno.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Finish {
    /// Terminó y pasó la verificación, en ese puesto.
    Placed(u8),
    /// No llegó a terminar: la partida acaba cuando terminan 1 (a dos) o 2.
    /// Se ordena por los sets que llevaba.
    Unfinished(usize),
    /// Se fue a mitad de partida. Va detrás de todos.
    Left,
}

/// Un asiento de la partida, tal y como estaba al empezar.
#[derive(Debug, Clone)]
pub struct Seat {
    pub nickname: String,
    /// De quién es el Elo: `anon:<uuid>` o `sm:<id>`. `None` = cliente viejo:
    /// juega con `START` en el cálculo y no se le guarda nada.
    pub key: Option<String>,
    /// Si es un bot, con qué dificultad. Su Elo es fijo y no se guarda.
    pub bot: Option<Difficulty>,
    pub finish: Finish,
}

/// El Elo fijo de un bot. Entran en el cálculo —ganarle a uno difícil vale más
/// que ganarle a uno fácil— pero nunca cambian.
pub fn bot_rating(d: Difficulty) -> i32 {
    match d {
        Difficulty::Easy => 800,
        Difficulty::Normal => 1000,
        Difficulty::Hard => 1200,
    }
}

pub fn pool(seats: &[Seat]) -> Pool {
    if seats.iter().any(|s| s.bot.is_some()) { Pool::Fun } else { Pool::Glory }
}

/// El puesto de cada uno, empezando en 1. Los empates comparten la media de
/// los puestos que ocupan (dos empatados en 3º y 4º quedan 3,5 los dos).
pub fn places(finishes: &[Finish]) -> Vec<f64> {
    // Clave de orden: primero quien terminó, por puesto; luego quien no, por
    // sets de más a menos; al final quien se fue.
    let key = |f: &Finish| -> (u8, i64) {
        match *f {
            Finish::Placed(p) => (0, p as i64),
            Finish::Unfinished(sets) => (1, -(sets as i64)),
            Finish::Left => (2, 0),
        }
    };
    let mut order: Vec<usize> = (0..finishes.len()).collect();
    order.sort_by_key(|&i| key(&finishes[i]));

    let mut out = vec![0.0; finishes.len()];
    let mut i = 0;
    while i < order.len() {
        let mut j = i;
        while j + 1 < order.len() && key(&finishes[order[j + 1]]) == key(&finishes[order[i]]) {
            j += 1;
        }
        // Puestos i+1 ..= j+1, repartidos a partes iguales.
        let media = (i + 1 + j + 1) as f64 / 2.0;
        for &k in &order[i..=j] {
            out[k] = media;
        }
        i = j + 1;
    }
    out
}

/// Lo que cambia el Elo de cada uno. `ratings` y `places` van en el mismo
/// orden. La puntuación por puesto es lineal: el 1º se lleva la mayor parte y
/// cada puesto vale lo mismo que el siguiente.
pub fn deltas(ratings: &[f64], places: &[f64]) -> Vec<f64> {
    let n = ratings.len();
    if n < 2 {
        return vec![0.0; n];
    }
    let parejas = (n * (n - 1)) as f64 / 2.0;
    (0..n)
        .map(|a| {
            let esperado: f64 = (0..n)
                .filter(|&i| i != a)
                .map(|i| 1.0 / (1.0 + 10f64.powf((ratings[i] - ratings[a]) / D)))
                .sum::<f64>()
                / parejas;
            let real = (n as f64 - places[a]) / parejas;
            K * (n as f64 - 1.0) * (real - esperado)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn two_equal_players_is_classic_elo() {
        let d = deltas(&[1000.0, 1000.0], &places(&[Finish::Placed(1), Finish::Unfinished(3)]));
        assert!((d[0] - 16.0).abs() < 1e-9, "{d:?}");
        assert!((d[1] + 16.0).abs() < 1e-9, "{d:?}");
    }

    #[test]
    fn it_is_zero_sum() {
        let r = [1000.0, 1180.0, 940.0, 1033.0];
        let p = places(&[Finish::Placed(2), Finish::Placed(1), Finish::Unfinished(1), Finish::Left]);
        let suma: f64 = deltas(&r, &p).iter().sum();
        assert!(suma.abs() < 1e-9, "no suma cero: {suma}");
    }

    #[test]
    fn a_tie_between_equals_changes_nothing() {
        let d = deltas(&[1000.0, 1000.0], &places(&[Finish::Unfinished(2), Finish::Unfinished(2)]));
        assert!(d.iter().all(|x| x.abs() < 1e-9), "{d:?}");
    }

    #[test]
    fn a_better_place_never_pays_less() {
        // Mismo Elo para todos: cada puesto tiene que dar al menos lo del siguiente.
        let f = [Finish::Placed(1), Finish::Placed(2), Finish::Unfinished(4), Finish::Unfinished(1), Finish::Left];
        let d = deltas(&[1000.0; 5], &places(&f));
        for w in d.windows(2) {
            assert!(w[0] >= w[1], "{d:?}");
        }
    }

    #[test]
    fn beating_a_stronger_player_pays_more() {
        let contra_fuerte = deltas(&[1000.0, 1200.0], &[1.0, 2.0])[0];
        let contra_debil = deltas(&[1000.0, 800.0], &[1.0, 2.0])[0];
        assert!(contra_fuerte > contra_debil, "{contra_fuerte} vs {contra_debil}");
    }

    #[test]
    fn who_did_not_finish_is_ordered_by_sets_and_leavers_go_last() {
        let p = places(&[
            Finish::Left,
            Finish::Unfinished(1),
            Finish::Placed(1),
            Finish::Unfinished(4),
            Finish::Unfinished(4),
        ]);
        assert_eq!(p, vec![5.0, 4.0, 1.0, 2.5, 2.5]);
    }

    fn seat(bot: Option<Difficulty>) -> Seat {
        Seat { nickname: "x".into(), key: None, bot, finish: Finish::Left }
    }

    #[test]
    fn one_bot_makes_it_for_fun() {
        assert_eq!(pool(&[seat(None), seat(None), seat(Some(Difficulty::Easy))]), Pool::Fun);
        assert_eq!(pool(&[seat(None), seat(None)]), Pool::Glory);
    }
}
