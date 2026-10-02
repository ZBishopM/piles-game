//! El chat de la sala de espera: qué se acepta y con qué límites.
//!
//! Vive en memoria, dentro de la sala (`Lobby.chat`), y dura lo que dure la
//! sala: igual que ella, se pierde si se reinicia el servidor. Solo se escribe
//! con la sala en espera y **no se graba nunca**: `/api/recordings` es público y
//! se puede leer con la partida en curso.

use std::time::Duration;

/// Caracteres (no bytes) que cabe en un mensaje.
pub const MAX_CHARS: usize = 300;
/// Mensajes que se guardan por sala. Al pasarse, se tira el más viejo.
pub const KEEP: usize = 200;
/// Lo más deprisa que puede escribir una persona.
pub const MIN_GAP: Duration = Duration::from_millis(400);

/// Los que no se ven pero cambian lo que se lee: el texto de derecha a
/// izquierda puede hacer pasar un mensaje por otro, y los de ancho cero dejan
/// mensajes «vacíos» o apodos clonados.
fn invisible(c: char) -> bool {
    matches!(c,
        '\u{200B}'..='\u{200F}'   // ancho cero y marcas de dirección
        | '\u{202A}'..='\u{202E}' // incrustaciones y anulaciones de dirección
        | '\u{2060}'..='\u{2064}'
        | '\u{2066}'..='\u{2069}' // aislamientos de dirección
        | '\u{FEFF}')
}

/// Deja un mensaje listo para guardar, o `None` si no queda nada.
///
/// Los saltos de línea y los tabuladores pasan a espacio, el resto de
/// caracteres de control se descarta, los espacios seguidos se juntan en uno y
/// se corta a `MAX_CHARS` caracteres.
pub fn clean(raw: &str) -> Option<String> {
    let texto = raw.chars()
        .map(|c| if c.is_whitespace() { ' ' } else { c })
        .filter(|c| !c.is_control() && !invisible(*c))
        .collect::<String>();
    let texto = texto.split_whitespace().collect::<Vec<_>>().join(" ");
    if texto.is_empty() {
        return None;
    }
    Some(texto.chars().take(MAX_CHARS).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trims_and_collapses_spaces() {
        assert_eq!(clean("  hola   que\ttal \n").as_deref(), Some("hola que tal"));
    }

    #[test]
    fn an_empty_or_blank_message_is_nothing() {
        assert_eq!(clean(""), None);
        assert_eq!(clean("   \n\t "), None);
        // Solo caracteres de control o invisibles: tampoco hay mensaje.
        assert_eq!(clean("\u{0}\u{7}\u{200B}\u{FEFF}"), None);
    }

    #[test]
    fn control_characters_are_dropped_and_newlines_become_spaces() {
        assert_eq!(clean("a\u{0}b\u{7}c").as_deref(), Some("abc"));
        assert_eq!(clean("uno\r\ndos").as_deref(), Some("uno dos"));
    }

    #[test]
    fn right_to_left_overrides_cannot_disguise_a_message() {
        // U+202E invierte lo que sigue: `moc.etneuf` se leería «fuente.com».
        assert_eq!(clean("hola \u{202E}moc.etneuf").as_deref(), Some("hola moc.etneuf"));
    }

    #[test]
    fn it_cuts_at_300_characters_not_bytes() {
        let largo = "ñ".repeat(500);                 // 2 bytes cada una
        let cortado = clean(&largo).unwrap();
        assert_eq!(cortado.chars().count(), MAX_CHARS);
        let emojis = "😀".repeat(400);              // 4 bytes cada uno
        assert_eq!(clean(&emojis).unwrap().chars().count(), MAX_CHARS);
        // Y lo que cabe se queda tal cual.
        assert_eq!(clean("tarde, ¿jugamos? 🎮").as_deref(), Some("tarde, ¿jugamos? 🎮"));
    }

    #[test]
    fn markup_is_kept_as_text_the_client_never_interprets_it() {
        // El servidor no escapa nada: el cliente pinta con textContent.
        assert_eq!(clean("<img src=x onerror=alert(1)>").as_deref(), Some("<img src=x onerror=alert(1)>"));
    }
}
