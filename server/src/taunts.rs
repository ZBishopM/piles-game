//! Burlas: el sonido que oye quien llega tarde a una carta que otro acaba de
//! coger. El servidor no sintetiza nada (eso lo hace el cliente con WebAudio):
//! solo valida el id que cada jugador dice tener y recuerda quién cogió qué carta
//! y cuándo, para decidir si el `swap_failed` de quien llegó tarde lleva burla.

use std::collections::HashMap;
use std::time::{Duration, Instant};
use uuid::Uuid;

/// Catálogo cerrado. Debe coincidir con `TAUNTS` en `client/lobby.html`.
pub const IDS: [&str; 10] = [
    "honk", "trombon", "boing", "risa", "pedorreta",
    "sirena", "silbido", "campanita", "gallo", "pato",
];

/// Cuánto después de coger la carta sigue valiendo la burla.
pub const WINDOW: Duration = Duration::from_millis(500);
/// Pasado esto la entrada se tira.
const KEEP: Duration = Duration::from_secs(2);

/// Un id conocido o nada: lo que mande el cliente no se guarda tal cual.
pub fn valid(id: Option<String>) -> Option<String> {
    id.filter(|s| IDS.contains(&s.as_str()))
}

/// Quién cogió una carta, con qué burla y cuándo.
pub struct Taken {
    pub by: Uuid,
    pub nickname: String,
    pub taunt: Option<String>,
    pub at: Instant,
}

/// Últimas cartas cogidas: sala -> carta -> quién. Acotado: cada anotación tira
/// lo que pasa de 2 s en todas las salas y las salas vacías.
#[derive(Default)]
pub struct Recent(HashMap<String, HashMap<u32, Taken>>);

impl Recent {
    pub fn record(&mut self, lobby: &str, card: u32, t: Taken) {
        let now = t.at;
        self.0.retain(|_, m| {
            m.retain(|_, x| now.saturating_duration_since(x.at) < KEEP);
            !m.is_empty()
        });
        self.0.entry(lobby.to_string()).or_default().insert(card, t);
    }

    /// `(burla, apodo del ladrón)` si `victim` llega tarde a `card`.
    pub fn taunt_for(&self, lobby: &str, card: u32, victim: Uuid, now: Instant) -> Option<(String, String)> {
        let t = self.0.get(lobby)?.get(&card)?;
        if t.by == victim || now.saturating_duration_since(t.at) >= WINDOW {
            return None;
        }
        Some((t.taunt.clone()?, t.nickname.clone()))
    }

    #[cfg(test)]
    fn len(&self) -> usize {
        self.0.values().map(|m| m.len()).sum()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn taken(by: Uuid, taunt: Option<&str>, at: Instant) -> Taken {
        Taken { by, nickname: "Ana".into(), taunt: taunt.map(String::from), at }
    }

    #[test]
    fn ids_validos() {
        assert_eq!(valid(Some("honk".into())).as_deref(), Some("honk"));
        assert_eq!(valid(Some("desconocido".into())), None);
        assert_eq!(valid(Some("a".repeat(100_000))), None);
        assert_eq!(valid(Some(String::new())), None);
        assert_eq!(valid(None), None);
    }

    #[test]
    fn ids_iguales_a_los_del_cliente() {
        let html = std::fs::read_to_string("../client/lobby.html").expect("client/lobby.html");
        let ini = html.find("const TAUNTS = [").expect("TAUNTS en el cliente");
        let bloque = &html[ini..ini + html[ini..].find("\n];").expect("fin de TAUNTS")];
        let cliente: Vec<&str> = bloque.split("{ id: '").skip(1).map(|s| s.split('\'').next().unwrap()).collect();
        assert_eq!(cliente, IDS, "taunts.rs y TAUNTS del cliente deben coincidir (mismo orden)");
    }
    #[test]
    fn ventana_de_500_ms() {
        let (a, b) = (Uuid::new_v4(), Uuid::new_v4());
        let t0 = Instant::now();
        let mut r = Recent::default();
        r.record("L", 7, taken(a, Some("honk"), t0));
        let ms = Duration::from_millis;
        assert_eq!(r.taunt_for("L", 7, b, t0 + ms(499)), Some(("honk".into(), "Ana".into())));
        assert_eq!(r.taunt_for("L", 7, b, t0 + ms(501)), None);
        assert_eq!(r.taunt_for("L", 8, b, t0 + ms(10)), None, "otra carta");
        assert_eq!(r.taunt_for("M", 7, b, t0 + ms(10)), None, "otra sala");
        assert_eq!(r.taunt_for("L", 7, a, t0 + ms(10)), None, "el ladrón no se burla de sí mismo");
    }

    #[test]
    fn sin_burla_no_hay_burla_y_el_ultimo_manda() {
        let (a, b, c) = (Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4());
        let t0 = Instant::now();
        let mut r = Recent::default();
        r.record("L", 1, taken(a, None, t0));
        assert_eq!(r.taunt_for("L", 1, b, t0), None);
        r.record("L", 2, taken(a, Some("boing"), t0));
        r.record("L", 2, taken(c, None, t0 + Duration::from_millis(100)));
        assert_eq!(r.taunt_for("L", 2, b, t0 + Duration::from_millis(200)), None, "la cogió otro sin burla");
    }

    #[test]
    fn se_limpia() {
        let a = Uuid::new_v4();
        let t0 = Instant::now();
        let mut r = Recent::default();
        for card in 0..50 {
            r.record("L", card, taken(a, Some("honk"), t0));
            r.record("M", card, taken(a, Some("honk"), t0));
        }
        assert_eq!(r.len(), 100);
        r.record("N", 1, taken(a, Some("honk"), t0 + Duration::from_millis(2100)));
        assert_eq!(r.len(), 1, "todo lo viejo y las salas vacías se van");
    }
}
