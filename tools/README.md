# Depurar piles

Qué mirar y con qué, según lo que te cuenten. Todo se ejecuta desde la raíz del repo
(o desde `tools/`). **Local** es `http://127.0.0.1:3077`:

```nu
$env.PORT = "3077"; cargo run --release --manifest-path server/Cargo.toml
```

Los scripts de Node y de Playwright aceptan `--base=local|beta|prod|<url>` (por defecto
local); los de nu, `-b`. Primera vez: `cd tools; pnpm install` (los navegadores de
Playwright se bajan aparte: `pnpm exec playwright install chromium`).

## Qué hacer cuando…

| Te cuentan | Empieza por |
|---|---|
| "Se me cayó y no pude volver" / "dice que ya hay alguien con mi nombre" | `grab.nu humanos` (huecos y `conn`), `grab.nu notas` (qué vio el cliente), `log.nu --desde 30min -g "cayó|cerró|rejoin"` |
| "No me deja coger una carta" | `grab.nu jugadas` → **deudas forzadas con su causa**; `grab.nu notas` → `tap_ignored` / `tap_refused` / `state` del cliente |
| "Se canceló la partida" | `grab.nu resumen` (línea `end` y su motivo) y `grab.nu notas` (eventos `conn`: gracia, encuesta y quién votó No, relevo, cancelación) |
| "Las cartas de alguien se fueron al centro" | `grab.nu notas` (`grace_end: retirado` = se fue con «Salir» y no volvió en 30 s; una caída ya no retira: abre encuesta). `humanos` no lista a quien no llegó a mandar nada |
| "Los bots hacen cosas raras" | `grab.nu bots` (ciclos soltar→coger, ping-pong, cuánto dura lo que sueltan) |
| "Se quedó pillado en una pelea" | `grab.nu peleas` (ganador, solapes, `SIN RESOLVER`) |
| "El bot se quedó parado" / "pido cartas y no pasa nada" | `grab.nu bots`; `grab.nu notas` (líneas `RESYNC`: el servidor le corrigió la mano); en bruto, rechazos "Suelta una carta antes de coger otra" repetidos al mismo jugador = su mano no coincide con la del servidor |
| "No puedo volver a entrar" | `grab.nu notas` (`rejoin_sin_asiento` / `join_error` con el porqué) y `log.nu -g "🔑|🚫|recuperó"`. Ojo: una pestaña de antes de un despliegue no manda `client_note`; recargar la actualiza |
| "Lo veo distinto a como lo ve el otro" | `grab.nu notas`: líneas `DESYNC` (el servidor compara el tablero del cliente cada 5 s) |
| "¿Puedo desplegar?" | `estado.nu -b beta` (código 1 = hay partida en curso) |
| Hay que mirar el log del servidor | `log.nu -b beta -n 500 -g "texto|otro"` (hora local, sin colores) |

**Antes de que rote**: el servidor guarda 100 grabaciones (tope 150 MB) pero
`/api/recordings` solo lista 10 salvo `?n=`. `grab.nu bajar -b beta -n 50` las copia a
`tools/.cache/` (ignorado en git). Haz esto **antes** de probar cosas en beta.

## Las grabaciones

JSONL público (`/api/recordings/<fichero>`). Una línea por evento, con `ms` desde que
empezó la partida:

- `in` / `out`: mensajes del cliente al servidor y al revés (`from` / `to`; sin `to` =
  difusión). Los secretos de asiento no se graban.
- `key`: foto del estado verdadero cada pocos segundos (manos, centro, conexiones).
- `ping`: latencias.
- `conn`: **conexión** — `close` (con motivo: cierre limpio, error, `silencio`),
  `grace_start`, `grace_end` (`volvio` / `retirado`), `encuesta` (se acabó la gracia
  de una caída), `voto`, `encuesta_fin` (`seguir` / `volvio` / `cancelar` / `fin`),
  `replaced`, `cancel`, y los
  reingresos que no salieron: `rejoin_sin_asiento` (volvió con secreto y no abrió
  ningún asiento, con el porqué) y `join_error` (el servidor le contestó un error).
- `resync`: el servidor rechazó una jugada porque el cliente creía algo falso (coger
  sin deber nada, soltar debiendo) y le reenvió su mano verdadera. Si salen muchas,
  hay un fallo de sincronización que investigar.
- `desync`: el cliente dice un tablero distinto al del servidor en dos muestras seguidas.
- `end`: cierre y motivo. **Sin `end` el servidor se cortó** o la partida sigue.
- Notas del cliente (la caja negra) llegan como `in` con `m.type = client_note`:
  `state` (cada 5 s), `tap_ignored`, `tap_refused`, `ws` (`open`, `close`, `rejoin_ok`),
  `vis` (pestaña oculta/visible), `err`, `pong_timeout`.

## Herramientas

### `grab.nu` — leer grabaciones

`listar`, `bajar`, `resumen`, `humanos`, `jugadas`, `peleas`, `bots`, `notas`, `linea`.
Cada subcomando acepta una ruta, un nombre de fichero o `ultima` (la más reciente de la
caché). `nu tools/grab.nu` sin argumentos imprime la ayuda.

- `jugadas` clasifica cada **deuda forzada** (se agotaron los 3 s): pelea perdida o
  cedida · intento rechazado · intento sin respuesta (carrera del plazo) · **sin ningún
  intento** (aquí mira `notas`: si el cliente descartó el toque, saldrá `tap_ignored`).
- `linea <f> <quien> <desde_ms> <hasta_ms>`: todo lo de una persona alrededor de un
  instante, sin el ruido de `qte_click`/`pong`/`combo_update`.

### `log.nu`, `estado.nu`

`log.nu`: `tail` por SSH del log de pm2 (solo lectura) filtrado en local.
`estado.nu`: `/api/estado` → "NO / CON CUIDADO / SÍ". Un servidor sin `/api/estado`
(versión antigua) responde con el estado de su última grabación y código 2.

### `repro/` — sockets reales (Node + `ws`, sin navegador)

| Script | Comprueba |
|---|---|
| `asiento.mjs [--largo]` | Reconectar con el secreto, salir de verdad, gracia de 30 s, salas fantasma |
| `silencio.mjs` | ~20 s sin hablar en partida = caída; quien manda pings no se corta |
| `plazo.mjs` | Un `take_card` a los 2,85 s no pierde contra el reloj de 3 s |
| `notas.mjs` | `client_note` se graba; la demasiado grande no; `desync` aparece |
| `estado.mjs` | `/api/estado` dice la verdad y no regala salas privadas |
| `chat.mjs` | Chat de la sala de espera (llega a todos, historial al entrar o volver, limpieza y límites, rechazado en partida y fuera de la grabación pública) y el Elo junto a cada nombre (`pool` y `elo` del `lobby_update`, Elo fijo de los bots) |
| `mirar.mjs [--largo]` | Mirar partidas: la lista pública con las que están en curso (`status`, jugadores, mirones), la mano de TODOS por ids (coincide con el `game_start` de cada jugador y se actualiza en <1 s), sin mensajes privados ni acciones; `--largo` (~35 s) añade la cola de espera: la mesa llena no echa a quien miraba, se sienta al liberarse un hueco y puede escribir en el chat |
| `encuesta.mjs` | Caída sin vuelta (~2 min): a los 30 s encuesta de 15 s; todos Sí o nadie contesta = otros 30 s, un No cancela; volver en plena encuesta la cierra; «Salir» retira como antes, sin encuesta |
| `mismo-ms.mjs [--rondas=60]` | 4 jugadores soltando y cogiendo a la vez: ninguna jugada se pierde, todos ven el mismo centro, y quien intenta coger sin deber (o soltar debiendo) recibe su mano verdadera |

### `browser/` — Playwright (`--ver` abre la ventana)

| Script | Comprueba |
|---|---|
| `toques.mjs` | Con ratón, el clic cuenta al bajar (movido, mantenido, saliendo del centro); 3 toques = 1 envío |
| `peleas.mjs` | Una pelea ajena no pisa la propia |
| `vigilante.mjs` | Sin `pong` el cliente reabre el socket en 8–16 s y recupera su mano |
| `mirar.mjs` | Mirar desde «Unirse» (~45 s): la lista se refresca sola y pasa la sala a «En partida · Mirar»; «Mirando desde» cada jugador y «Todos» enseñan las cartas de verdad (comparadas con el `allSets` de su pestaña); ver la deuda al soltar; móvil sin desborde; «Salir de la sala»; y al acabar la partida, de vuelta en la sala de espera con chat |
| `version.mjs` | Una pestaña abierta desde antes de un despliegue se recarga sola: la primera versión (`hello`) que ve es la suya, un cambio en una reconexión recarga (con aviso), y no más de una vez cada 30 s. En local la versión es «dev» y se ignora |
| `sala.mjs` | La sala de espera: chat entre pestañas e historial, texto sin interpretar (apodos y mensajes con `<img onerror>`), chips de Elo con el color de su rango, For glory ↔ For fun al añadir un bot, móvil sin desborde, y pantalla final sin puntos ni combo (capturas en `$CAPTURAS` o en la carpeta temporal) |
| `rangos.mjs` | Rangos en los diales de Elo (fin de partida y perfil): pastilla ▲/▼, un sonido por cruce, corona del Top 3, partículas solo en glory, movimiento reducido |
| `encuesta.mjs` | La encuesta en pantalla (~70 s): aviso de caída, botones Esperar/Cancelar que se pueden pulsar, «Votaste esperar», nueva cuenta atrás, Cancelar vuelve a la sala; apodo `<i>` como texto |
| `medir-desktop.mjs` | Desbordamiento real del centro en escritorio (sin servidor) |

`toques.mjs` y `peleas.mjs` fallan contra un cliente **sin** el arreglo: sirven de prueba
de que el bug estaba. Para reproducir un bug nuevo, escribe antes la prueba que falla.

## Reglas

- Pruebas contra **beta**: sí (no hay anti-cheat, es de amigos). Contra **prod**: solo
  lectura (`grab.nu`, `estado.nu`, `repro/estado.mjs`).
- No despliegues a beta con una partida en curso: reiniciar la corta. `estado.nu` primero.
- Las pruebas crean salas y grabaciones reales; con 100 plazas no desplazan lo que
  importa, pero **baja primero lo que necesites**.

Los scripts `*-test.mjs` y `*-audit.mjs` sueltos en `tools/` son anteriores a esto y
siguen valiendo: `node take-race-test.mjs ws://127.0.0.1:3077/ws` (igual `two-fights`,
`giveup`, `spectator`). `tap-test.mjs` prueba `bindTap` sin servidor ni navegador: lo
saca de `client/lobby.html`, así que si cambias la función se prueba la nueva.
