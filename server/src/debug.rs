//! Lo que sirve para depurar: funciones puras y con prueba.
//!
//! Nace de la sesión del 2026-09-30, en la que hubo tres casos que no se
//! pudieron cerrar por falta de datos: el servidor no veía los toques que el
//! cliente descartaba, ni lo que le pasaba a un cliente mientras estaba sin
//! conexión, ni si su tablero seguía cuadrando con el del servidor.

use std::collections::HashSet;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

/// ¿Lleva callada esta conexión más de lo que se le aguanta?
pub fn silent_too_long(ultimo: Instant, limite: Duration) -> bool {
    ultimo.elapsed() >= limite
}

/// Tope de una nota del cliente. La grabación es pública y tiene un máximo de
/// 32 MB por fichero: un cliente que mande notas gigantes no puede llenarla.
pub const NOTE_KIND_MAX: usize = 40;
pub const NOTE_DETAIL_MAX: usize = 600;

pub fn note_too_big(kind: &str, detail: &serde_json::Value) -> bool {
    kind.len() > NOTE_KIND_MAX || detail.to_string().len() > NOTE_DETAIL_MAX
}

/// Lo que el cliente cree tener, en la nota `state`.
#[derive(Debug, Clone, Deserialize)]
pub struct ClientState {
    /// Los 6 sets × 4 huecos aplanados; `null` donde cree que hay un hueco.
    pub hand: Vec<Option<u32>>,
    /// Las cartas que ve en el centro, en cualquier orden.
    pub center: Vec<u32>,
}

/// En qué difiere el tablero del cliente del del servidor.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct StateDiff {
    /// `(set, hueco, servidor, cliente)` de cada hueco que no coincide.
    pub hand: Vec<(usize, usize, Option<u32>, Option<u32>)>,
    /// Cartas que el servidor tiene en el centro y el cliente no ve.
    pub center_only_server: Vec<u32>,
    /// Cartas que el cliente ve en el centro y el servidor ya no tiene.
    pub center_only_client: Vec<u32>,
}

/// Compara el tablero del servidor con el que dice tener el cliente. `None` =
/// cuadra. Una sola muestra no basta para hablar de desajuste (una jugada en
/// vuelo lo provoca sin que haya fallo); lo decide quien llama, pidiendo que
/// se repita.
pub fn diff_state(
    server_hand: &[Vec<Option<u32>>],
    server_center: &[u32],
    cli: &ClientState,
) -> Option<StateDiff> {
    let mut hand = Vec::new();
    for (s, set) in server_hand.iter().enumerate() {
        for (i, srv) in set.iter().enumerate() {
            let c = cli.hand.get(s * 4 + i).copied().flatten();
            if *srv != c {
                hand.push((s, i, *srv, c));
            }
        }
    }
    let srv: HashSet<u32> = server_center.iter().copied().collect();
    let cl: HashSet<u32> = cli.center.iter().copied().collect();
    let mut center_only_server: Vec<u32> = srv.difference(&cl).copied().collect();
    let mut center_only_client: Vec<u32> = cl.difference(&srv).copied().collect();
    center_only_server.sort_unstable();
    center_only_client.sort_unstable();

    if hand.is_empty() && center_only_server.is_empty() && center_only_client.is_empty() {
        None
    } else {
        Some(StateDiff { hand, center_only_server, center_only_client })
    }
}

/// El cuerpo de `/api/estado`: lo que hace falta para decidir sin entrar al
/// servidor si se puede desplegar (¿hay una partida en curso?) y para ver de
/// un vistazo qué le pasa a cada sala.
///
/// Es público, así que **no lleva nada que dé acceso a algo**: el código de una
/// sala privada se sustituye por `privada-N` (un número de orden, no un hash:
/// un hash corto se puede invertir por fuerza bruta, y con él se entra a la
/// sala), y no hay manos, secretos de asiento ni claves de Elo.
pub fn estado_json(
    lobbies: &[crate::game::Lobby],
    conexiones: usize,
    uptime_s: u64,
    version: &str,
    ultimo_mensaje: &std::collections::HashMap<uuid::Uuid, Instant>,
) -> serde_json::Value {
    use crate::game::LobbyStatus;
    let mut privadas = 0;
    let salas: Vec<serde_json::Value> = lobbies.iter().map(|l| {
        let id = if l.is_public {
            l.id.clone()
        } else {
            privadas += 1;
            format!("privada-{privadas}")
        };
        let estado = match l.status {
            LobbyStatus::Waiting => "espera",
            LobbyStatus::Ready => "lista",
            LobbyStatus::Playing => "partida",
        };
        let jugadores: Vec<serde_json::Value> = l.players.iter().map(|p| serde_json::json!({
            "nick": p.nickname,
            "bot": p.is_bot,
            "conectado": p.disconnected_at.is_none(),
            "en_gracia_s": p.disconnected_at.map(|t| t.elapsed().as_secs()),
            "silencio_s": ultimo_mensaje.get(&p.id).map(|t| t.elapsed().as_secs()),
        })).collect();
        serde_json::json!({
            "id": id,
            "publica": l.is_public,
            "estado": estado,
            "personas": l.players.iter().filter(|p| !p.is_bot).count(),
            "bots": l.players.iter().filter(|p| p.is_bot).count(),
            "en_gracia": l.players.iter().filter(|p| p.disconnected_at.is_some()).count(),
            "mirones": l.spectators.len(),
            "vacia_s": l.empty_since.map(|t| t.elapsed().as_secs()),
            "jugadores": jugadores,
        })
    }).collect();

    serde_json::json!({
        "version": version,
        "uptime_s": uptime_s,
        "conexiones": conexiones,
        "salas": salas,
        "partidas_en_curso": lobbies.iter().filter(|l| l.status == LobbyStatus::Playing).count(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use uuid::Uuid;

    fn sala(codigo: &str, publica: bool, jugando: bool) -> crate::game::Lobby {
        let mut l = crate::game::Lobby::new(codigo.to_string(), 4);
        l.is_public = publica;
        l.add_player(Uuid::new_v4(), "Ana".to_string()).unwrap();
        l.add_player(Uuid::new_v4(), "Beto".to_string()).unwrap();
        if jugando {
            for id in l.players.iter().map(|p| p.id).collect::<Vec<_>>() {
                l.set_player_ready(&id, true).unwrap();
            }
            l.start_game().unwrap();
        }
        l
    }

    #[test]
    fn the_status_counts_matches_in_progress_and_hides_private_codes() {
        let salas = vec![sala("ABCDEF", true, true), sala("SECRET", false, false)];
        let j = estado_json(&salas, 3, 120, "abc1234", &Default::default());
        assert_eq!(j["partidas_en_curso"], 1);
        assert_eq!(j["conexiones"], 3);
        assert_eq!(j["version"], "abc1234");

        let texto = j.to_string();
        assert!(texto.contains("ABCDEF"), "el código de una sala pública sí se ve");
        assert!(!texto.contains("SECRET"), "el de una privada, nunca");
        assert!(texto.contains("privada-1"));
    }

    #[test]
    fn it_tells_who_is_connected_and_who_is_in_grace() {
        let mut l = sala("ABCDEF", true, true);
        let ana = l.players[0].id;
        l.mark_disconnected(&ana);
        let j = estado_json(&[l], 1, 5, "dev", &Default::default());
        assert_eq!(j["salas"][0]["en_gracia"], 1);
        assert_eq!(j["salas"][0]["jugadores"][0]["conectado"], false);
        assert_eq!(j["salas"][0]["jugadores"][1]["conectado"], true);
        // Y nada que dé acceso: ni secretos de asiento ni manos.
        let t = j.to_string();
        assert!(!t.contains("seat") && !t.contains("token") && !t.contains("sets"));
    }

    fn mano(huecos: &[(usize, Option<u32>)]) -> Vec<Vec<Option<u32>>> {
        let mut m: Vec<Vec<Option<u32>>> = (0..6)
            .map(|s| (0..4).map(|i| Some((s * 4 + i) as u32)).collect())
            .collect();
        for &(pos, v) in huecos {
            m[pos / 4][pos % 4] = v;
        }
        m
    }

    fn cliente(huecos: &[(usize, Option<u32>)], centro: &[u32]) -> ClientState {
        let m = mano(huecos);
        ClientState { hand: m.into_iter().flatten().collect(), center: centro.to_vec() }
    }

    #[test]
    fn it_is_silent_only_after_the_limit() {
        let ahora = Instant::now();
        assert!(!silent_too_long(ahora, Duration::from_secs(20)));
        let hace_21 = ahora.checked_sub(Duration::from_secs(21)).unwrap();
        assert!(silent_too_long(hace_21, Duration::from_secs(20)));
        let hace_19 = ahora.checked_sub(Duration::from_secs(19)).unwrap();
        assert!(!silent_too_long(hace_19, Duration::from_secs(20)));
    }

    #[test]
    fn a_matching_board_has_no_diff() {
        let s = mano(&[(5, None)]);
        let c = cliente(&[(5, None)], &[40, 41, 42]);
        // El orden del centro da igual.
        let c = ClientState { center: vec![42, 40, 41], ..c };
        assert_eq!(diff_state(&s, &[40, 41, 42], &c), None);
    }

    #[test]
    fn it_names_the_slot_that_does_not_match() {
        // El servidor tiene un hueco en el set 1, hueco 2 (posición 6);
        // el cliente cree que sigue la carta 6.
        let s = mano(&[(6, None)]);
        let c = cliente(&[], &[1, 2]);
        let d = diff_state(&s, &[1, 2], &c).unwrap();
        assert_eq!(d.hand, vec![(1, 2, None, Some(6))]);
        assert!(d.center_only_server.is_empty() && d.center_only_client.is_empty());
    }

    #[test]
    fn it_tells_which_side_has_the_extra_center_card() {
        // El caso del 2026-09-29: otro cogió una carta y el cliente seguía
        // enseñándola.
        let s = mano(&[]);
        let c = cliente(&[], &[10, 11, 12]);
        let d = diff_state(&s, &[10, 11], &c).unwrap();
        assert_eq!(d.center_only_client, vec![12]);
        assert!(d.center_only_server.is_empty());

        let d = diff_state(&s, &[10, 11, 12, 13], &c).unwrap();
        assert_eq!(d.center_only_server, vec![13]);
    }

    #[test]
    fn a_short_hand_counts_as_holes() {
        let s = mano(&[]);
        let c = ClientState { hand: vec![Some(0), Some(1)], center: vec![] };
        let d = diff_state(&s, &[], &c).unwrap();
        assert_eq!(d.hand.len(), 22, "los 22 huecos que el cliente no declaró");
    }

    #[test]
    fn oversized_notes_are_refused() {
        assert!(!note_too_big("state", &json!({"a": 1})));
        assert!(note_too_big(&"k".repeat(41), &json!({})));
        assert!(note_too_big("err", &json!({"m": "x".repeat(5000)})));
    }
}
