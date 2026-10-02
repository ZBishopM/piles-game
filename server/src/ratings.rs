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

/// Para entrar en el Top 3 hacen falta tantas partidas…
pub const TOP_MIN_GAMES: u32 = 10;
/// …y más Elo que el de partida: con pocos jugadores, sin esto los tres
/// primeros lo serían aunque estuvieran por debajo de 1000.
pub const TOP_MIN_RATING: i32 = START;
pub const TOP_SIZE: usize = 3;

/// Los mejores de una clasificación: los `TOP_SIZE` con más Elo entre quienes
/// cumplen el mínimo de partidas y de Elo. A igualdad manda quien lleva más
/// partidas, y por último la clave, para que el resultado sea estable.
fn top3_of(map: &HashMap<String, Record>, pool: Pool) -> Vec<String> {
    let mut v: Vec<(&String, PoolRating)> = map.iter()
        .filter_map(|(k, rec)| {
            rec.pool(pool)
                .filter(|p| p.n >= TOP_MIN_GAMES && p.r > TOP_MIN_RATING)
                .map(|p| (k, p))
        })
        .collect();
    v.sort_by(|a, b| b.1.r.cmp(&a.1.r).then(b.1.n.cmp(&a.1.n)).then(a.0.cmp(b.0)));
    v.into_iter().take(TOP_SIZE).map(|(k, _)| k.clone()).collect()
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

    /// `(fun, glory)`: ¿está esta clave en el Top 3 de cada clasificación?
    pub fn top3_flags(&self, key: &str) -> (bool, bool) {
        let map = self.map.lock().unwrap();
        (
            top3_of(&map, Pool::Fun).iter().any(|k| k == key),
            top3_of(&map, Pool::Glory).iter().any(|k| k == key),
        )
    }

    /// Lo que enseña la sala de espera junto a cada nombre: `(Elo, ¿Top 3?)` en
    /// la clasificación `pool`, para cada clave en el mismo orden. `None` = sin
    /// clave de Elo (una pestaña antigua): sin chip. Quien aún no ha jugado en
    /// esa clasificación va con `START`, que es con lo que entraría al cálculo.
    ///
    /// Con **un solo** candado y un solo `top3_of` para toda la sala: se llama
    /// en cada `lobby_update`, y `top3_flags` ordena el mapa entero por clave.
    pub fn lobby_view(&self, keys: &[Option<String>], pool: Pool) -> Vec<Option<(i32, bool)>> {
        let map = self.map.lock().unwrap();
        let top = top3_of(&map, pool);
        keys.iter()
            .map(|k| k.as_ref().map(|k| {
                let r = map.get(k).and_then(|rec| rec.pool(pool)).map_or(START, |p| p.r);
                (r, top.contains(k))
            }))
            .collect()
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
        // Quién estaba arriba antes de esta partida.
        let top_antes = top3_of(&map, pool);
        let mut aplicados = Vec::new();
        for ((s, before), d) in seats.iter().zip(&antes).zip(&cambios) {
            let (None, Some(key)) = (&s.bot, &s.key) else { continue };
            let after = before + d.round() as i32;
            let rec = map.entry(key.clone()).or_default();
            let n = rec.pool(pool).map_or(0, |p| p.n) + 1;
            *rec.pool_mut(pool) = Some(PoolRating { r: after, n });
            rec.nick = s.nickname.clone();
            rec.updated = ahora;
            aplicados.push((key.clone(), s.nickname.clone(), *before, after));
        }
        // Y quién después, ya con todos los cambios aplicados: el Top 3 se
        // reordena con la partida entera, no jugador a jugador.
        let top_despues = top3_of(&map, pool);
        let out: Vec<EloChange> = aplicados.into_iter().map(|(key, nickname, before, after)| EloChange {
            nickname, pool, before, after,
            top3_before: top_antes.contains(&key),
            top3_after: top_despues.contains(&key),
        }).collect();
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

    /// Mete a mano un Elo y un número de partidas, sin jugar partidas.
    fn poner(s: &Ratings, key: &str, pool: Pool, r: i32, n: u32) {
        let mut map = s.map.lock().unwrap();
        *map.entry(key.to_string()).or_default().pool_mut(pool) = Some(PoolRating { r, n });
    }

    #[test]
    fn the_top_three_need_enough_games_and_more_than_the_starting_rating() {
        let s = store();
        poner(&s, "anon:a", Pool::Glory, 1300, 12);   // entra
        poner(&s, "anon:b", Pool::Glory, 1200, 10);   // entra (justo 10)
        poner(&s, "anon:c", Pool::Glory, 1100, 30);   // entra
        poner(&s, "anon:d", Pool::Glory, 1090, 50);   // cuarto: fuera
        poner(&s, "anon:e", Pool::Glory, 1900, 9);    // 9 partidas: no cuenta
        poner(&s, "anon:f", Pool::Glory, 1000, 99);   // no pasa de 1000: no cuenta
        let map = s.map.lock().unwrap();
        assert_eq!(top3_of(&map, Pool::Glory), vec!["anon:a", "anon:b", "anon:c"]);
    }

    #[test]
    fn ties_go_to_whoever_has_played_more_and_pools_are_separate() {
        let s = store();
        poner(&s, "anon:a", Pool::Glory, 1100, 10);
        poner(&s, "anon:b", Pool::Glory, 1100, 20);
        poner(&s, "anon:z", Pool::Fun, 1500, 15);
        let map = s.map.lock().unwrap();
        assert_eq!(top3_of(&map, Pool::Glory), vec!["anon:b", "anon:a"], "a igualdad, más partidas");
        assert_eq!(top3_of(&map, Pool::Fun), vec!["anon:z"], "cada clasificación la suya");
        drop(map);
        assert_eq!(s.top3_flags("anon:b"), (false, true));
        assert_eq!(s.top3_flags("anon:z"), (true, false));
        assert_eq!(s.top3_flags("anon:nadie"), (false, false));
    }

    #[test]
    fn the_waiting_room_shows_each_persons_rating_in_the_rooms_pool() {
        let s = store();
        poner(&s, "anon:a", Pool::Glory, 1300, 12);   // Top 3 de glory
        poner(&s, "anon:a", Pool::Fun, 950, 3);       // y en fun, uno cualquiera
        poner(&s, "anon:b", Pool::Fun, 1250, 4);
        let claves = [
            Some("anon:a".to_string()),
            Some("anon:b".to_string()),
            Some("anon:nuevo".to_string()),   // clave válida que nunca ha jugado
            None,                             // sin clave de Elo
        ];
        let glory = s.lobby_view(&claves, Pool::Glory);
        assert_eq!(glory, vec![Some((1300, true)), Some((START, false)), Some((START, false)), None]);
        let fun = s.lobby_view(&claves, Pool::Fun);
        // b no llega a las 10 partidas, a no pasa de 1000: nadie en el Top 3 de fun.
        assert_eq!(fun, vec![Some((950, false)), Some((1250, false)), Some((START, false)), None]);
    }

    #[test]
    fn a_game_reports_who_enters_and_who_leaves_the_top_three() {
        let s = store();
        poner(&s, "anon:a", Pool::Glory, 1100, 20);
        poner(&s, "anon:b", Pool::Glory, 1090, 20);
        poner(&s, "anon:c", Pool::Glory, 1080, 20);
        // d tiene un Elo más bajo pero gana a c, que va tercero.
        poner(&s, "anon:d", Pool::Glory, 1075, 20);
        let cambios = s.settle(&[
            seat("D", Some("anon:d"), None, Finish::Placed(1)),
            seat("C", Some("anon:c"), None, Finish::Unfinished(0)),
        ]);
        let de = |n: &str| cambios.iter().find(|c| c.nickname == n).unwrap();
        assert!(!de("D").top3_before && de("D").top3_after, "d entra");
        assert!(de("C").top3_before && !de("C").top3_after, "c sale");
        assert_eq!(de("D").pool, Pool::Glory);
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
