//! Grabación de partidas, para poder verlas después junto a un vídeo del móvil.
//!
//! Los fallos de este juego han sido casi siempre cosas que ninguna prueba ve:
//! una pelea que congelaba a todos, un aviso que no se cerraba, un cliente
//! pintando un tablero con el que el servidor no estaba de acuerdo. Todos se
//! encontraron jugando y se reconstruyeron después de memoria.
//!
//! Esto graba la partida entera desde el servidor, que es el único sitio que la
//! ve completa: muchos mensajes van a un solo jugador (`GameStart.your_sets`,
//! `SwapSuccess.your_new_set`, `Stunned`, `ComboUpdate`…), así que una grabación
//! hecha en un navegador solo tiene la mitad de la verdad — y si ese cliente es
//! el que se congeló, su registro se corta justo donde empieza lo interesante.
//!
//! # Por qué JSONL y no un JSON
//!
//! Un array JSON hay que *cerrarlo*. Si el proceso muere —que es justo lo que
//! estamos cazando— el fichero queda sin cerrar y no se puede leer. En JSONL se
//! pierde como mucho la última línea y todo lo anterior sigue valiendo.
//!
//! # Por qué se escribe línea a línea y sin `BufWriter`
//!
//! Por lo mismo. Un `BufWriter` con volcados cada cierto tiempo pierde la cola
//! de exactamente la grabación que querías. Un `write` normal va al caché del
//! kernel, que sobrevive a un panic, a un abort y al OOM killer. No se hace
//! `fsync`: no hace falta para eso y en un VPS compartido es presión de disco
//! gratis.
//!
//! # Regla dura
//!
//! **Grabar no puede tumbar una partida.** Todo aquí traga sus errores, el
//! canal tiene tope y cuando se llena se tiran líneas en vez de bloquear: la
//! máquina no tiene swap y una cola sin límite detrás de un disco lento es un
//! OOM.

use std::collections::HashMap;
use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{sync_channel, SyncSender};
use std::time::{SystemTime, UNIX_EPOCH};

/// Cuántas grabaciones se guardan. La máquina es compartida, sin swap, y
/// también tiene producción y el correo: un disco lleno se los lleva por
/// delante.
const KEEP: usize = 10;

/// Tope por fichero. Seguro barato contra una partida patológica.
const MAX_BYTES: u64 = 32 * 1024 * 1024;

/// Cola de escritura. Si se llena se tiran líneas; nunca se bloquea el juego.
const QUEUE: usize = 4096;

/// Milisegundos desde epoch. Es lo que permite cuadrar la grabación con la hora
/// que marca el vídeo del móvil.
pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

enum Job {
    Open(String, String),
    Line(String, String),
    Close(String),
}

pub struct Recorder {
    tx: SyncSender<Job>,
    dir: PathBuf,
}

impl Recorder {
    /// Arranca el hilo de escritura. `None` si no hay que grabar.
    ///
    /// Se enciende con `PILES_REC=1`. Apagado por defecto a propósito: en
    /// producción se juegan partidas de verdad y nadie ha pedido que queden
    /// guardadas en disco.
    pub fn start(dir: PathBuf) -> Option<Self> {
        if std::env::var("PILES_REC").ok().as_deref() != Some("1") {
            return None;
        }
        if let Err(e) = std::fs::create_dir_all(&dir) {
            tracing::warn!("no se pudo crear {}: {e}; no se grabará", dir.display());
            return None;
        }
        prune(&dir, KEEP);

        let (tx, rx) = sync_channel::<Job>(QUEUE);
        let hilo_dir = dir.clone();
        // Un hilo para todo el servidor, no uno por partida.
        std::thread::spawn(move || {
            let mut abiertos: HashMap<String, (File, u64)> = HashMap::new();
            for job in rx {
                match job {
                    Job::Open(nombre, cabecera) => {
                        let ruta = hilo_dir.join(&nombre);
                        match OpenOptions::new().create(true).append(true).open(&ruta) {
                            Ok(mut f) => {
                                let _ = f.write_all(cabecera.as_bytes());
                                abiertos.insert(nombre, (f, cabecera.len() as u64));
                            }
                            Err(e) => tracing::warn!("no se pudo abrir {}: {e}", ruta.display()),
                        }
                    }
                    Job::Line(nombre, linea) => {
                        if let Some((f, escritos)) = abiertos.get_mut(&nombre) {
                            if *escritos < MAX_BYTES {
                                let _ = f.write_all(linea.as_bytes());
                                *escritos += linea.len() as u64;
                                if *escritos >= MAX_BYTES {
                                    let _ = f.write_all(b"{\"t\":\"truncated\"}\n");
                                }
                            }
                        }
                    }
                    Job::Close(nombre) => {
                        abiertos.remove(&nombre);
                        prune(&hilo_dir, KEEP);
                    }
                }
            }
        });

        tracing::info!("📼 grabando partidas en {}", dir.display());
        Some(Self { tx, dir })
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    pub fn open(&self, file: &str, header_line: String) {
        let _ = self.tx.try_send(Job::Open(file.to_string(), header_line));
    }

    /// Escribe una línea. Si la cola está llena se pierde, y eso está bien:
    /// antes una grabación con huecos que una partida bloqueada por el disco.
    pub fn line(&self, file: &str, line: String) {
        let _ = self.tx.try_send(Job::Line(file.to_string(), line));
    }

    pub fn close(&self, file: &str) {
        let _ = self.tx.try_send(Job::Close(file.to_string()));
    }
}

/// Deja solo las `keep` más nuevas.
///
/// El nombre empieza por los milisegundos de epoch, así que ordenar por nombre
/// **es** ordenar por fecha y no hay que preguntarle al sistema de ficheros.
fn prune(dir: &Path, keep: usize) {
    let Ok(entradas) = std::fs::read_dir(dir) else { return };
    let mut ficheros: Vec<PathBuf> = entradas
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|e| e == "jsonl"))
        .collect();
    if ficheros.len() <= keep {
        return;
    }
    ficheros.sort();
    let sobran = ficheros.len() - keep;
    for viejo in ficheros.into_iter().take(sobran) {
        let _ = std::fs::remove_file(&viejo);
    }
}

/// Las grabaciones que hay, de la más nueva a la más vieja.
///
/// Solo lee la PRIMERA línea de cada fichero: la cabecera ya trae sala,
/// jugadores y hora de inicio, y no hay motivo para cargar megas de eventos
/// para pintar una lista.
pub fn list(dir: &Path) -> Vec<serde_json::Value> {
    let Ok(entradas) = std::fs::read_dir(dir) else { return Vec::new() };
    let mut ficheros: Vec<PathBuf> = entradas
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|e| e == "jsonl"))
        .collect();
    ficheros.sort();
    ficheros.reverse();

    ficheros
        .iter()
        .filter_map(|p| {
            let nombre = p.file_name()?.to_str()?.to_string();
            let bytes = std::fs::metadata(p).ok().map(|m| m.len()).unwrap_or(0);
            let texto = std::fs::read_to_string(p).ok()?;
            let primera = texto.lines().next()?;
            let mut cab: serde_json::Value = serde_json::from_str(primera).ok()?;
            // Cuánto duró: el `ms` de la última línea que se pueda leer. Una
            // grabación cortada a machetazos sigue dando su duración.
            let dur = texto
                .lines()
                .rev()
                .find_map(|l| serde_json::from_str::<serde_json::Value>(l).ok())
                .and_then(|v| v.get("ms").and_then(|m| m.as_u64()))
                .unwrap_or(0);
            if let Some(obj) = cab.as_object_mut() {
                obj.insert("file".into(), nombre.into());
                obj.insert("bytes".into(), bytes.into());
                obj.insert("dur_ms".into(), dur.into());
            }
            Some(cab)
        })
        .collect()
}

/// ¿Es un nombre de grabación y no un intento de salir del directorio?
///
/// Se rechaza, no se limpia: limpiar un nombre raro es cómo se cuelan los
/// `..` y los enlaces simbólicos.
pub fn valid_name(name: &str) -> bool {
    let Some(resto) = name.strip_suffix(".jsonl") else { return false };
    let Some((ms, sala)) = resto.split_once('-') else { return false };
    !ms.is_empty()
        && ms.len() <= 16
        && ms.bytes().all(|b| b.is_ascii_digit())
        && !sala.is_empty()
        && sala.len() <= 12
        && sala.bytes().all(|b| b.is_ascii_uppercase() || b.is_ascii_digit())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp() -> PathBuf {
        let d = std::env::temp_dir().join(format!("piles-rec-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn prune_keeps_the_newest_and_drops_the_rest() {
        let d = temp();
        // El nombre empieza por epoch-ms, así que el orden alfabético es el
        // cronológico. Se comprueba justo eso.
        for ms in [1000u64, 3000, 2000, 5000, 4000] {
            std::fs::write(d.join(format!("{ms}-AAAA.jsonl")), "{}\n").unwrap();
        }
        prune(&d, 3);

        let mut quedan: Vec<String> = std::fs::read_dir(&d)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_str().unwrap().to_string())
            .collect();
        quedan.sort();
        assert_eq!(quedan, vec!["3000-AAAA.jsonl", "4000-AAAA.jsonl", "5000-AAAA.jsonl"],
                   "se quedan las tres más nuevas, no tres cualesquiera");
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn prune_does_nothing_when_there_is_room() {
        let d = temp();
        std::fs::write(d.join("1000-AAAA.jsonl"), "{}\n").unwrap();
        prune(&d, 10);
        assert_eq!(std::fs::read_dir(&d).unwrap().count(), 1);
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn a_listing_survives_a_half_written_file() {
        // Es el caso normal tras un cierre a lo bruto: la última línea quedó a
        // medias. La lista tiene que seguir funcionando.
        let d = temp();
        std::fs::write(
            d.join("1700000000000-AB12.jsonl"),
            "{\"t\":\"header\",\"lobby\":\"AB12\",\"started_ms\":1700000000000}\n\
             {\"t\":\"out\",\"ms\":500}\n\
             {\"t\":\"out\",\"ms\":90",
        ).unwrap();

        let l = list(&d);
        assert_eq!(l.len(), 1);
        assert_eq!(l[0]["lobby"], "AB12");
        assert_eq!(l[0]["dur_ms"], 500, "la última línea entera manda");
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn only_real_recording_names_are_served() {
        assert!(valid_name("1700000000000-AB12.jsonl"));
        assert!(!valid_name("../../etc/passwd"));
        assert!(!valid_name("1700-ab12.jsonl"), "la sala va en mayúsculas");
        assert!(!valid_name("nope.jsonl"));
        assert!(!valid_name("1700000000000-AB12.txt"));
        assert!(!valid_name("1700000000000-AB12.jsonl/../x"));
    }
}
