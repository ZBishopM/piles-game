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
  ningún asiento, con el porqué), `join_error` (el servidor le contestó un error) y\r\n  `cuenta_atras` (`fase: fin` = la cuenta de 3 s terminó y se repartió; `inicio` y\r\n  `cancelada` --con `motivo`: `not_ready` / `left` / `joined`-- solo se anotan si la\r\n  sala ya está grabando, es decir, casi nunca: la grabación empieza al repartir).
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
- `peleas` lista cada pelea con su ganador y, si hubo empate, las rondas de muerte
  súbita (`qte_tiebreak`), si se decidió al azar y los clicks finales (de
  `qte_resolved`); las grabaciones anteriores salen sin esos datos.
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
| `mirar.mjs [--largo]` | Mirar partidas: la lista pública con las que están en curso (`status`, jugadores, mirones; ver también `roles.mjs`), la mano de TODOS por ids (coincide con el `game_start` de cada jugador y se actualiza en <1 s), sin mensajes privados ni acciones; `--largo` (~35 s) añade la cola de espera: la mesa llena no echa a quien miraba, se sienta al liberarse un hueco y puede escribir en el chat |
| `encuesta.mjs` | Caída sin vuelta (~2 min): a los 30 s encuesta de 15 s; todos Sí o nadie contesta = otros 30 s, un No cancela; volver en plena encuesta la cierra; «Salir» retira como antes, sin encuesta |
| `desempate.mjs` | Empate de clicks en una pelea → muerte súbita (~25 s): 0-0 = 3 rondas extra de 1 s y al azar (`random`), 5-5 y luego gana quien pulsa = 1 ronda, ceder en la ronda extra pierde sin bloqueo; `qte_tiebreak` llega a los dos, `qte_resolved` trae `clicks`/`tiebreaks`, ganador `swap_success`, perdedor `swap_failed` + `stunned` |
| `cuenta.mjs` | La cuenta atrás de 3 s antes de repartir (~20 s): `countdown` a todos y `game_start` a los ~3 s; desmarcarse, entrar un tercero sin listo o salir uno la cancelan (`countdown_cancelled` con motivo) y la tarea vieja no reparte; cancelar y reabrir rápido reparte una sola vez; añadir un bot con un humano listo también espera; `conn`/`cuenta_atras`/`fin` en la grabación |
| `roles.mjs` | La lista pública con `status` en cada estado (`waiting` con hueco y llena, `starting` en la cuenta atrás, `playing`; ni privadas ni vacías), entrar con `spectate:true` (con hueco, llena, empezando: no corta la cuenta atrás; llena sin `spectate` = cola, ya no error), `set_spectator` en los dos sentidos (`lobby_update.queue`, `seat_token`, cuenta atrás cortada con `left`/`joined` y sin reabrirse), jugador→espectador rechazado en partida, y al acabar la partida se sienta quien esperaba en cola y no quien miraba por gusto (~45 s) |
| `votekick.mjs` | Votar para echar a alguien de la sala de espera: solo la más antigua abre la votación, el votado la ve y no vota, unanimidad menos el votado expulsa (`kicked`), un No la cancela, enfriamiento de 30 s para el mismo par, el expulsado no vuelve (5 min; ni con otro apodo y la misma clave de Elo); quien vuelve a media votación o un espectador tardío recibe `kick_poll` con sus segundos y votos (cerrada, nada); y echar al único sin marcar, o que se vaya, abre la cuenta atrás si el resto ya estaba listo (con uno solo, no) |
| `mismo-ms.mjs [--rondas=60]` | 4 jugadores soltando y cogiendo a la vez: ninguna jugada se pierde, todos ven el mismo centro, y quien intenta coger sin deber (o soltar debiendo) recibe su mano verdadera |
| `burla.mjs` | La burla: Ana (con `taunt`) coge una carta y Beto pide la misma; a 100 ms de ejecutarse el take de Ana su `swap_failed` lleva `taunt` y `by`; a 700 ms, con id desconocido, id enorme o Ana sin burla, no |

| `bots.mjs [--seg=60]` | La mesa no se para con bots (~65 s): 3 salas a la vez (fácil, normal, difícil), cada una con 1 humano que solo manda pings + 3 bots. Falla si no arranca (`game_start` en 12 s), si el servidor manda un `error` o si el centro (`game_update`) se queda quieto >15 s; imprime una tabla por dificultad (cambios del centro, peleas, sets cerrados, silencio máximo) sin fallar por los sets |

### `browser/` — Playwright (`--ver` abre la ventana)

| Script | Comprueba |
|---|---|
| `toques.mjs` | Con ratón, el clic cuenta al bajar (movido, mantenido, saliendo del centro); 3 toques = 1 envío |
| `peleas.mjs` | Una pelea ajena no pisa la propia; y el empate (mensajes inyectados `qte_tiebreak` / `qte_resolved` ampliado): rótulo «¡EMPATE! Muerte súbita» con el marcador anterior, contadores a 0, clicks finales y «Desempate al azar», aviso de espectador, `aria-live`, movimiento reducido, 390 y 1280 sin desborde (capturas `empate-*.png` en `$CAPTURAS` o la carpeta temporal) |
| `avisos.mjs` | Dos peleas ajenas a la vez: sin ids repetidos, cada aviso mueve su barra y marcadores, apodo con `<img onerror>` como texto; y la oferta de bots tras partida rápida (sale si no llega nadie; no reaparece al descartar, salir, crear sala o aceptar). Tarda ~45 s (esperas reales de 12 s) |
| `vigilante.mjs` | Sin `pong` el cliente reabre el socket en 8–16 s y recupera su mano |
| `mirar.mjs` | Mirar desde «Unirse» (~45 s): la lista se refresca sola (cada 2 s) y pasa la sala a «jugando · Entrarás a mirar»; el botón «Jugar la próxima» del tablero alterna la cola; «Mirando desde» cada jugador y «Todos» enseñan las cartas de verdad (comparadas con el `allSets` de su pestaña); ver la deuda al soltar; móvil sin desborde; «Salir de la sala»; y al acabar la partida, de vuelta en la sala de espera con chat |
| `version.mjs` | Una pestaña abierta desde antes de un despliegue se recarga sola: la primera versión (`hello`) que ve es la suya, un cambio en una reconexión recarga (con aviso), y no más de una vez cada 30 s. En local la versión es «dev» y se ignora |
| `sala.mjs` | La sala de espera: chat entre pestañas e historial, texto sin interpretar (apodos y mensajes con `<img onerror>`), chips de Elo con el color de su rango, For glory ↔ For fun al añadir un bot, orden lista→chat→bots, botón de «listo» en la fila propia (foco y cancelar), desplegable de bots (teclado, recuerda lo elegido), móvil 390 sin desborde, y pantalla final sin puntos ni combo (capturas en `$CAPTURAS` o en la carpeta temporal) |
| `confeti.mjs` | Confeti del 1º puesto en la pantalla final: solo si el propio queda 1º con rivales, una sola capa con el mensaje repetido, no captura clics, se retira solo (~5 s) y con `returnToLobby`, nada con movimiento reducido (capturas en `$CAPTURAS`) |
| `rangos.mjs` | Rangos en los diales de Elo (fin de partida y perfil): pastilla ▲/▼, un sonido por cruce, corona del Top 3, partículas solo en glory, movimiento reducido |
| `burla.mjs` | «Mi burla» del perfil: guarda `piles.taunt` y lo recuerda, ▶ sintetiza (AudioContext y osciladores espiados) o dice «Silencio activado», el id viaja en `create_lobby`/`quick_match`, un `swap_failed` con `taunt` suena y avisa con el apodo como texto (no dos en 2 s, no en pelea); capturas 390x700 y 1280x800 |
| `encuesta.mjs` | La encuesta en pantalla (~70 s): aviso de caída, botones Esperar/Cancelar que se pueden pulsar, «Votaste esperar», nueva cuenta atrás, Cancelar vuelve a la sala; apodo `<i>` como texto |
| `votekick.mjs` | La votación en pantalla: «Echar» solo para la más antigua, encuesta pegada a la fila del votado (contador, cuenta atrás, quién votó, Sí/No solo a quien vota), sin desbordes ni tapar «Listo»/chat en 390x700 y 1280x800 (capturas `votekick-*.png`), un No cancela, recargar a media votación la recupera con el contador real y el voto reflejado, el expulsado vuelve a la lista con el aviso y no entra por el enlace, y «X fue expulsado» convive con la cuenta atrás de 3 s en 390x700 |
| `titulo.mjs` | El título animado del inicio, en el lobby real: sin errores, anima, hay un set visible (4 de la misma prenda en 4 colores) en dos manos seguidas, se pausa del todo al salir de la pantalla de inicio o con la pestaña oculta y reanuda, formulario sin scroll en 390x700, y con movimiento reducido queda «Piles!» quieta (~25 s; fotos en `$CAPTURAS`) |
| `cuenta.mjs` | El overlay de la cuenta atrás: 3-2-1 grande visible con `role=status`, no tapa el botón de listo ni el chat, se cierra con `game_start`, se cancela con aviso al desmarcarse otro, y con movimiento reducido no anima (capturas 390x700 y 1280x800 en `` o en la carpeta temporal) |
| `roles.mjs` | La lista de «Unirse» con una etiqueta por sala («en espera», «empezando», «jugando»), ordenada y con «Entrarás a jugar/mirar»; tocar una sala llena entra a mirar la sala de espera («Estás mirando», sin «Listo» ni bots); el botón de rol en ambos sentidos («Quiero jugar», «Salir de la cola», «Pasar a espectador», ≥ 40 px); 390x700 y 1280x800 sin desborde ni errores de JS (~25 s; capturas en `$CAPTURAS`) |
| `idiomas.mjs [--solo=en,zh]` | Los tres idiomas de punta a punta (~1 min por idioma; ver «Idiomas» abajo). Por idioma recorre portada, perfil, cómo jugar, nueva sala, «Unirse» con lista, sala de espera con bots y chat, cuenta atrás, partida, un espectador, errores reales del servidor (`code` + `args`), y —con mensajes inyectados— pelea y desempate, caída y encuesta, verificación, fin con rango, partida cancelada, más la votación para echar con tres personas. En cada pantalla exige que el texto visible (también `aria-label`, `title`, `placeholder` y `::before/::after`) no traiga claves crudas ni `undefined`, que en en/zh no haya español (acentos y palabras típicas; en zh, ni inglés suelto) y que no desborde en 390x700 y 1280x800. Aparte: `<html lang>`, `navigator.language` → idioma, el selector y que persiste, cambiar de idioma dentro de una sala vuelve a ella, el respaldo a español, la fuente CJK y `replay.html`. Capturas `idiomas-<idioma>-*.png` en `$CAPTURAS` o en la carpeta temporal: **míralas** |
| `medir-desktop.mjs` | Desbordamiento real del centro en escritorio (sin servidor) |

`toques.mjs` y `peleas.mjs` fallan contra un cliente **sin** el arreglo: sirven de prueba
de que el bug estaba. Para reproducir un bug nuevo, escribe antes la prueba que falla.

Las pruebas con navegador arrancan Chromium con `--lang=es-ES` (`lanzar()` en `browser/comun.mjs`):
buscan los textos en español y, sin eso, el idioma saldría del sistema donde se ejecuten.
`idiomas.mjs` lo cambia por contexto con `localStorage['piles.lang']`.

## Idiomas

Español (base), inglés y chino simplificado, sin librerías ni peticiones nuevas.

- **Dónde vive**: `client/i18n.js` (lo cargan `lobby.html` y `replay.html`; `index.html` solo redirige y
  no tiene texto). Arriba, el glosario de términos del juego (hay que respetarlo); abajo, el diccionario:
  una línea por clave, `'clave': { es, en, zh }`, con `{x}` para las variables y `{ one, other }` (o
  `{ 1, 2, 3, other }` para ordinales) para los plurales por `n`.
- **Usarlo**: `t('clave', { n })` en JS; `data-i18n` (texto), `data-i18n-html` (solo textos del
  diccionario, con `<strong>`), `data-i18n-attr="aria-label:clave;title:otra"` en el HTML estático; el
  texto en español queda en el HTML como respaldo. Los apodos y todo lo que escribe otra persona se
  insertan con `textContent` o `esc()`, nunca dentro de un `t()` que acabe en `innerHTML`. Si falta una
  clave en el idioma activo cae a español; si falta en todos devuelve la clave y avisa por consola.
- **Elegir idioma**: `localStorage['piles.lang']` → `navigator.language` (`zh*` → zh, `en*` → en, lo
  demás → es). Selector ES / EN / 中文 en la portada y en el perfil. Cambiarlo **recarga la página**:
  el asiento vive en `localStorage`, así que dentro de una sala se vuelve a ella igual que con F5, y
  desde la portada, el perfil o «Unirse» se vuelve a esa pantalla. (Aplicar en caliente habría obligado a
  repintar a mano medio centenar de textos creados desde JS.)
- **Añadir un idioma**: su código en `LANGS`, `LANG_LABEL` y `HTML_LANG` de `i18n.js`, y un campo con ese
  código en cada clave. Hasta que esté completo cae a español; `node i18n-test.mjs` dice lo que falta.
  Si es CJK u otro alfabeto, una pila tipográfica en `injectStyle()` (como la del chino).
- **Textos del servidor**: no habla en otro idioma. `error`, `swap_failed` y `game_cancelled` llevan un
  `code` opcional (más `args` con los datos: segundos, apodos, minutos) y conservan el texto en español
  de siempre como respaldo; `player_left` suma `retired_types` (ids de prenda). El cliente traduce por
  `err.<code>`, `swapfail.<code>` o `cancel.<code>`; sin `code` (pestaña o servidor viejo) o con uno
  que no conoce, enseña el texto del servidor. En Rust, `Fail` (`messages.rs`) los construye.
- **Rangos y burlas**: los nombres de rango salen de `agapornis-ui/rank.js` (copia vendored); se traducen
  desde `traducirVendored()` en `lobby.html`, por id, sin tocar su lógica. Único cambio al vendored: un
  gancho `window.agText` en `dial.js` para la pastilla «Asciendes / Desciendes». Las burlas se nombran
  con `taunt.<id>`; las prendas, con `cloth.<tipo>`.

| Script | Comprueba |
|---|---|
| `node i18n-test.mjs` | Los diccionarios, sin navegador: las tres lenguas tienen las mismas claves y las mismas `{variables}`, los plurales tienen `other`, toda clave que usa el código existe (y cada `t()` da las variables que pide), y están traducidos todos los `code` de error del servidor, los ids de burla, los de rango y las 50 prendas |

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
