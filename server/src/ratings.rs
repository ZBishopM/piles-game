//! Dónde vive el Elo de cada uno.
//!
//! Un JSON en el directorio de trabajo, junto a `recordings/`. Beta y
//! producción corren en directorios distintos, así que cada una tiene el suyo
//! sin configurar nada.
//!
//! Se escribe entero a un temporal y se renombra: si el proceso muere a mitad,
//! queda el fichero anterior y no uno a medias.
//!
//! ponytail: el mapa entero en memoria y en disco, con un solo escritor. Para
//! un grupo de amigos (cientos de claves como mucho) sobra; si crece, SQLite.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::elo::{self, Pool, Seat, START};
use crate::game::messages::EloChange;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct PoolRating {
    pub r: i32,
    /// Partidas jugadas en esta clasificación.
    pub n: u32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Record {
    #[serde(default)]
    pub fun: Option<PoolRating>,
    #[serde(default)]
    pub glory: Option<PoolRating>,
    /// El último apodo con el que jugó. Solo para leer el fichero a mano.
    #[serde(default)]
    pub nick: String,
    #[serde(default)]
    pub updated: u64,
}

impl Record {
    fn pool(&self, p: Pool) -> Option<PoolRating> {
        match p { Pool::Fun => self.fun, Pool::Glory => self.glory }
    }
    fn pool_mut(&mut self, p: Pool) -> &mut Option<PoolRating> {
        match p { Pool::Fun => &mut self.fun, Pool::Glory => &mut self.glory }
    }
    fn played(&self) -> bool {
        self.fun.is_some() || self.glory.is_some()
    }
}

/// ¿Es una clave de Elo aceptable? `anon:<uuid>` (navegador) o `sm:<id>`
/// (cuenta de Session Manager; los ids de PocketBase son 15 alfanuméricos).
pub fn valid_key(key: &str) -> bool {
    if let Some(u) = key.strip_prefix("anon:") {
        return uuid::Uuid::parse_str(u).is_ok();
    }
    if let Some(id) = key.strip_prefix("sm:") {
        return (1..=32).contains(&id.len()) && id.chars().all(|c| c.is_ascii_alphanumeric());
    }
    false
}

pub struct Ratings {
    path: PathBuf,
    map: Mutex<HashMap<String, Record>>,
}

impl Ratings {
    /// Carga el fichero. Si no existe se empieza de cero; si está roto se
    /// avisa y también se empieza de cero, sin pisar el roto hasta que haya
    /// algo que guardar.
    pub fn load(path: PathBuf) -> Self {
        let map = match std::fs::read_to_string(&path) {
            Ok(texto) => serde_json::from_str(&texto).unwrap_or_else(|e| {
                tracing::warn!("{} no se puede leer ({e}); Elo desde cero", path.display());
                HashMap::new()
            }),
            Err(_) => HashMap::new(),
        };
        tracing::info!("🏆 Elo: {} jugadores en {}", map.len(), path.display());
        Self { path, map: Mutex::new(map) }
    }

    fn save(&self, map: &HashMap<String, Record>) {
        let tmp = self.path.with_extension("json.tmp");
        let texto = match serde_json::to_string(map) {
            Ok(t) => t,
            Err(e) => return tracing::warn!("no se pudo serializar el Elo: {e}"),
        };
        if let Err(e) = std::fs::write(&tmp, texto).and_then(|_| std::fs::rename(&tmp, &self.path)) {
            tracing::warn!("no se pudo guardar {}: {e}", self.path.display());
        }
    }

    pub fn get(&self, key: &str) -> Option<Record> {
        self.map.lock().unwrap().get(key).cloned()
    }

    /// Aplica el resultado de una partida y devuelve cómo le fue a cada
    /// persona con clave. Los bots y los clientes sin clave cuentan en el
    /// cálculo pero no se guardan.
    pub fn settle(&self, seats: &[Seat]) -> Vec<EloChange> {
        if seats.len() < 2 {
            return Vec::new();
        }
        let pool = elo::pool(seats);
        let mut map = self.map.lock().unwrap();

        let antes: Vec<i32> = seats.iter().map(|s| match (&s.bot, &s.key) {
            (Some(d), _) => elo::bot_rating(*d),
            (None, Some(k)) => map.get(k).and_then(|r| r.pool(pool)).map_or(START, |p| p.r),
            (None, None) => START,
        }).collect();
        let puestos = elo::places(&seats.iter().map(|s| s.finish).collect::<Vec<_>>());
        let cambios = elo::deltas(&antes.iter().map(|&r| r as f64).collect::<Vec<_>>(), &puestos);

        let ahora = crate::record::now_ms();
        let mut out = Vec::new();
        for ((s, before), d) in seats.iter().zip(&antes).zip(&cambios) {
            let (None, Some(key)) = (&s.bot, &s.key) else { continue };
            let after = before + d.round() as i32;
            let rec = map.entry(key.clone()).or_default();
            let n = rec.pool(pool).map_or(0, |p| p.n) + 1;
            *rec.pool_mut(pool) = Some(PoolRating { r: after, n });
            rec.nick = s.nickname.clone();
            rec.updated = ahora;
            out.push(EloChange { nickname: s.nickname.clone(), pool, before: *before, after });
        }
        if !out.is_empty() {
            self.save(&map);
        }
        out
    }

    /// Vincula el Elo de un navegador con una cuenta. `keep_anon`: el del
    /// navegador pasa a la cuenta (y sustituye lo que tuviera); si no, se
    /// queda el de la cuenta. En los dos casos el anónimo desaparece.
    pub fn link(&self, anon: &str, account: &str, keep_anon: bool) -> Result<Option<Record>, &'static str> {
        if !anon.starts_with("anon:") || !valid_key(anon) {
            return Err("clave anónima no válida");
        }
        if !account.starts_with("sm:") || !valid_key(account) {
            return Err("cuenta no válida");
        }
        let mut map = self.map.lock().unwrap();
        let del_navegador = map.remove(anon);
        if keep_anon {
            if let Some(rec) = del_navegador.filter(Record::played) {
                map.insert(account.to_string(), rec);
            }
        }
        let cuenta = map.get(account).cloned();
        self.save(&map);
        Ok(cuenta)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bot::Difficulty;
    use crate::elo::Finish;

    fn store() -> Ratings {
        let dir = std::env::temp_dir().join(format!("piles-elo-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        Ratings::load(dir.join("ratings.json"))
    }

    fn anon() -> String { format!("anon:{}", uuid::Uuid::new_v4()) }

    fn seat(nick: &str, key: Option<&str>, bot: Option<Difficulty>, finish: Finish) -> Seat {
        Seat { nickname: nick.into(), key: key.map(String::from), bot, finish }
    }

    #[test]
    fn keys_are_checked() {
        assert!(valid_key(&anon()));
        assert!(valid_key("sm:abc123def456ghi"));
        assert!(!valid_key("anon:no-soy-un-uuid"));
        assert!(!valid_key("sm:con espacio"));
        assert!(!valid_key("cualquier cosa"));
    }

    #[test]
    fn bots_count_but_are_not_stored() {
        let s = store();
        let ana = anon();
        let cambios = s.settle(&[
            seat("Ana", Some(&ana), None, Finish::Placed(1)),
            seat("🤖 Bot 1", None, Some(Difficulty::Hard), Finish::Unfinished(2)),
        ]);
        assert_eq!(cambios.len(), 1, "solo Ana tiene Elo");
        assert_eq!(cambios[0].pool, Pool::Fun);
        assert_eq!(cambios[0].before, START);
        // Ganarle a un bot difícil (1200) da más de los 16 de un igual.
        assert!(cambios[0].after - cambios[0].before > 16, "{:?}", cambios[0]);
        assert_eq!(s.map.lock().unwrap().len(), 1, "el bot no se guarda");
    }

    #[test]
    fn it_survives_a_restart() {
        let s = store();
        let (ana, beto) = (anon(), anon());
        s.settle(&[
            seat("Ana", Some(&ana), None, Finish::Placed(1)),
            seat("Beto", Some(&beto), None, Finish::Unfinished(0)),
        ]);
        let otra_vez = Ratings::load(s.path.clone());
        let r = otra_vez.get(&ana).unwrap();
        assert_eq!(r.glory, Some(PoolRating { r: 1016, n: 1 }));
        assert_eq!(r.fun, None);
        assert_eq!(otra_vez.get(&beto).unwrap().glory.unwrap().r, 984);
    }

    #[test]
    fn linking_can_bring_the_browser_rating_along() {
        let s = store();
        let (ana, beto) = (anon(), anon());
        s.settle(&[
            seat("Ana", Some(&ana), None, Finish::Placed(1)),
            seat("Beto", Some(&beto), None, Finish::Unfinished(0)),
        ]);
        let cuenta = s.link(&ana, "sm:cuentadeana0001", true).unwrap().unwrap();
        assert_eq!(cuenta.glory.unwrap().r, 1016);
        assert!(s.get(&ana).is_none(), "el anónimo desaparece");
    }

    #[test]
    fn linking_can_keep_the_account_and_drop_the_browser() {
        let s = store();
        let (ana, beto) = (anon(), anon());
        s.settle(&[
            seat("Ana", Some(&ana), None, Finish::Placed(1)),
            seat("Beto", Some(&beto), None, Finish::Unfinished(0)),
        ]);
        // La cuenta ya había jugado en otro dispositivo y perdió.
        s.settle(&[
            seat("Ana", Some("sm:cuentadeana0001"), None, Finish::Unfinished(0)),
            seat("Beto", Some(&beto), None, Finish::Placed(1)),
        ]);
        let cuenta = s.link(&ana, "sm:cuentadeana0001", false).unwrap().unwrap();
        assert!(cuenta.glory.unwrap().r < 1000, "se queda el de la cuenta");
        assert!(s.get(&ana).is_none(), "el anónimo se borra");
    }
}
