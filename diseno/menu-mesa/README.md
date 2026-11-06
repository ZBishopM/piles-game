# Menú en la mesa

El menú de Piles: cada opción es una carta y, de fondo, una partida de cuatro personas a
cámara lenta cuya cámara cambia con cada menú. Empezó como un prototipo aparte
(`mesa.html`, simulado; publicado en <https://claude.ai/artifact/FBdguCXa621gQyVxUvB1wT>).
**El prototipo ya no existe** (se retiró en la limpieza de 2026-11, está en el historial de
git): el código es `client/mesa/` (ver «Conectado con Piles», al final). Lo que sigue
describe el diseño.

## Archivos

| Archivo | Qué es |
|---|---|
| `siluetas.py` → `siluetas.webp` | Figuras de cuerpo entero (Blender). Se copia a `client/mesa/`. |
| `brazos.py` → `brazos.webp` | Solo el brazo, para la pelea por la carta (Blender). Se copia a `client/mesa/`. |
| `manos-siluetas.json`, `anclas-brazos.json` | Dónde cae la mano en cada fotograma. Ya van copiados dentro de `client/mesa/escena.js` (`MANOS`, `ANC`); los JSON son la fuente por si se vuelve a renderizar. |

## Las figuras: Blender + MPFB

**Por qué:** las manos dibujadas a mano «desentonaban» (dedos como rectángulos, codo
alto). Se cambiaron por renders de un cuerpo hecho: el `chasqui.glb` de MPFB del
proyecto Chasqui (MakeHuman, CC0).

- **Blender 4.5** (`externos/blender-4.5.14/…/blender.exe`), EEVEE con sombreado *toon*.
  Se lanza con `blender -b -P siluetas.py -- <carpeta de salida>` (igual `brazos.py`).
- **`siluetas.py`**: 4 vistas (frente, espalda, izquierda, derecha) × 24 columnas, celdas de
  240×384 tras reducir a la mitad. Columnas:
  - 0–11: lanzar la carta **como una apuesta de póker** (0–5 amagar, 6–11 soltar de muñeca);
  - 12–19: alzar la carta ganada;
  - 20–23: vuelta directa a la postura de reposo.
  - Constantes: `AMAGA_D (-0.12,-0.34,0.90)`, `LANZA_D (-0.08,-0.54,0.82)`, muñeca −45° atrás / 35° delante.
  - Escribe `manos.json`: el píxel de `middle_02_r` en cada vista y columna, para que la
    carta salga **de la mano** y no de un punto fijo.
- **`brazos.py`**: solo el brazo (modificador Mask con un grupo de vértices de los huesos del
  brazo y los dedos), IK, 512×512 ortográfica.
  - 3 poses: llega alzada con los dedos abiertos / aprieta / aprieta y tira.
  - **Palma hacia abajo y dedos estirados** (nada de dedos doblados): `hand_r` girada Y −38°,
    medido con `index_01.x − pinky_01.x` y la diferencia en z.
  - 16 vistas: 8 azimuts × 2 alturas (20° y 55°). En el juego se elige la vista por la
    cámara y se refleja según el lado del codo.
  - Escribe `anclas.json` con `{h, a, f}` (hombro, ancla, dedos) por fotograma.
- Tiras con ffmpeg: `tile=24x1`, `vstack` de las vistas y escala ½ → webp.

## La escena (canvas)

Pseudo-3D a mano, sin librería: cámara con `yaw/pitch/dist/cy/roll/mx/mz/my`, `proy()` y su
inversa `desproy()`, cartas en la mesa con `quad()`, planos del mundo con `enPlano()`.

- **La partida de fondo** es una línea de tiempo determinista: al avanzar de menú corre hacia
  delante y al volver se rebobina de verdad.
- **Cada menú tiene su cámara** (`CAMS`): inicio, crear, unirse, sala, bots, tutorial, perfil,
  burla, idioma, privacidad, código, partida, qr, cuenta, visor, vacías, elo, sm, mirar.
- Las cartas tienen **tamaño real** respecto a las manos (6,3 × 8,8 cm): al principio se veían
  enormes y se redujeron.
- La pelea por una carta: las manos llegan rápido (`suave(0, 0.3)`), la aprietan y tiran.
- **Solo hay 4 asientos dibujados**, aunque la sala sea de 8. Decidido así: la escena enseña al
  público cómo se juega, no es un mapa de la sala.

### Qué cuenta la escena en cada menú

| Menú | Toma |
|---|---|
| QR de la sala | **Vista de helicóptero**: las cartas del centro forman el QR. Se escanea de verdad (comprobado con jsQR). Las celdas claras se agrandan un poco y se dibujan primero para que no queden rendijas oscuras. |
| Cuenta atrás | Desde arriba, las cartas forman **3, 2, 1, ¡YA!** (solo donde hay trazo). |
| Unirse | Cada sala abierta es **otra mesa** en la misma sala oscura; al pasar por su carta la cámara vuela hasta ella. |
| Escanear QR | La cámara del móvil en el centro de la mesa, entre cuatro esquinas de cartas (`getUserMedia` + `BarcodeDetector`). |
| Session Manager | Una **placa en el respaldo de tu silla** con el código o «✓ VINCULADO». |
| Echar a alguien | Primer plano de su asiento, desde el centro de la mesa. |
| Partida rápida sin nadie | A los 5 s (en Piles 12 s): «No hay oponentes dignos…» y la cámara recorre las sillas vacías. |
| Mirar | Tú no estás en la mesa; aviso «Estás mirando». |
| Mi burla | Tu figura se sacude al pasar por cada burla y suena (sintetizada; en Piles son archivos). |
| Conexión perdida | Tecla **D**: la lámpara parpadea, todo se congela sin color y vuelve al reconectar. |
| Partida | La cámara baja a la mesa; tras alzar la carta ganada, se reparte. |

### La mesa es maciza

Los fragmentos del fondo iban **encima** del canvas (opacidad .55) y cruzaban la mesa: parecía
de cristal. Ahora van **debajo**: la estela de cámara lenta borra a transparente
(`destination-out`) en vez de pintar negro, así la mesa y las figuras tapan el fondo. La mesa
tiene además **canto** (9 cm), que de lado se ve.

### La pelea de la sala y quién gana

- En la sala la cámara mira **de cerca y algo desde arriba** las dos manos sobre la carta
  (`CAMS.sala`, `bots`). Antes se centraba a `cy 0.24`, justo debajo de la fila de jugadores.
- Su altura en pantalla (`cy`) la fija la propia sala (`escena.fijarCy`) al **centro del hueco
  libre** entre los jugadores y el chat/estado. En el móvil el chat baja y se acorta (≤ 150 px)
  para dejar ese hueco.
- **Todos listos → primero gana uno, luego la cuenta atrás.** `escena.ganar()`: la del asiento 0
  arranca la carta (temblor, destello, chispas, onda) y la cámara se aparta hacia ella, que la
  tiene en alto con **rayos bermellón** (cámara `ganador`; en vertical, más lejos y de frente).
  A los 1,8 s la cámara sube y las cartas forman 3, 2, 1, ¡YA! **en bermellón**. En el móvil el
  chat se pliega durante la victoria (taparía la carta). La partida ya no repite el arranque.
  - **Para conectarlo:** en Piles la cuenta atrás del servidor dura 3 s; la victoria tiene que
    caber dentro (o acortar los números).

### «Tú», en bermellón

| Dónde | Cómo |
|---|---|
| Tu figura en la mesa | Contorno bermellón más grueso y tu nombre en bermellón (`X.tu`). Pegada a la cámara no lleva contorno (se vería a través al desvanecerse). |
| Tu carta en la sala | Borde y sombra dura bermellón (`.carta.jugador.tuya`). |
| Tu dial de Elo | Una punta bermellón debajo, hacia tu figura. |
| Tus mensajes del chat | Tu nombre en bermellón. |
| A quién se vota echar | Su figura con el mismo contorno (`X.marca`): lo señalado. |

### Sombras

Cartas y piezas llevan **sombra dura** desplazada (sin difuminar, estilo Persona): la forma va
en `::before` para que `drop-shadow` siga el corte. La carta elegida, sombra negra más larga; tu
carta de la sala, sombra bermellón.

### Elo: los diales sobre cada jugador

Se eligió entre «B» (encima del jugador) y «C» (en la mesa): **el dial de agapornis-ui
encima de cada jugador, casi pegado a la mesa**. El tambor solo gira si es **la misma
persona** con otro Elo; si se sienta otra, aparece quieto (antes salía «Desciendes» al
cambiar de persona). Sin pastilla de delta ni de rango en la mesa. En móvil, ×0,75.

**Un dial que tocaría algo de la interfaz, o se saldría de la pantalla, se esconde**: la
interfaz manda (`chocaDial`).

## La interfaz (DOM encima del canvas)

### Cartas y mano

- Cada opción es una **carta-botón**. La mano va en abanico; la elegida, centrada y alzada.
- **Pocas cartas por nivel** (antes había demasiadas): lo que no es «ir a otro sitio» vive en
  las piezas.
- Al **jugar** una carta, **vuela directa arriba, en bermellón, y se queda como cabecera**.
  Las dos jugadas de antes **asoman detrás**, más oscuras: ese es el camino recorrido.
- **Quitado**: la fila de rótulos de abajo («Juega · Tu mesa…») repetía lo que dice la
  cabecera, y la pista de uso («toca o ← → elegir…») era texto que nadie lee. Se quitaron las dos.

### El gesto: todo sigue al dedo, nada pasa hasta soltar

- **Al tocar**, la carta elegida ya responde (sube 8 px).
- **De lado**, la mano se desliza con el dedo; cada 90 px cambia la elegida; en los extremos, resistencia.
- **Hacia arriba**, en proporción a lo arrastrado (190 px = todo): la carta sube hacia la
  cabecera, el resto se aparta y se apaga, la cabecera actual se oscurece, **la cámara se
  asoma al menú siguiente** y la partida de fondo se adelanta (`escena.asomar`).
- **Hacia abajo**, igual pero hacia atrás: la cabecera baja hacia la mano y se asoma el menú anterior.
- **Si vuelves el dedo, todo vuelve.** Al soltar: se confirma si pasó de la mitad o fue un
  golpe rápido (> 0,6 px/ms y > 40 px); si no, todo regresa con su animación.
- Una carta que es una **acción** (no cambia de menú) solo amaga (30 %).
- Teclado: ← → eligen, ↑ / Enter juegan, ↓ / Esc vuelven.

### Las piezas

Tres figuras angulosas (`#p1 #p2 #p3`) que **se transforman** en lo que cada pantalla
necesita, con la misma curva que el fondo. No son decoración: cada una tiene una función.

| Pantalla | Piezas |
|---|---|
| Inicio | Perfil (icono) y «? Reglas», en la fila 2. |
| Crear | **Tambor** de jugadores (2–8) y Pública / Privada. |
| Unirse | Código (entra solo al escribir la 6.ª letra) y Escanear QR. |
| Sala (y bots, QR, echar, oferta) | **El chat, siempre**, en caja oscurecida, y el chip de la sala: clasificación (FUN / GLORY), código y QR (toca → QR). En bots, la dificultad. |

**Ninguna pantalla tiene franja de frase.** Lo que decía cada una:

| Antes | Ahora |
|---|---|
| «Conectando… / Conectado al servidor» | La escena apagada y la lámpara que parpadea. |
| «Cualquiera puede entrar / No se anuncia…» | El interruptor Pública / Privada. |
| «Tu burla: X», «Elo de este navegador» | La nota de la carta «Mi burla» y la placa del respaldo. |
| «Elige un nombre primero», «Código no válido» | El campo tiembla en rojo (`sacude`). |
| «Buscando mesa… / Abriendo sala… / Entrando…» | La carta jugada late en bermellón mientras responde el servidor (`espera`). |
| «No hay oponentes dignos…» | En el chat, como línea gris. |
| «Desmárcate (↓) para cancelar» | Dos iconos: ↓ ✕. |
| Solo quedan, en texto, los errores de verdad: no se abre la cámara, no carga el QR. | |

**Perfil:** los dos Elos en vertical, en la columna de las piezas. Los rótulos de los diales van
con la misma letra que el resto (la piel *glory* de agapornis-ui usa Georgia; aquí se iguala).

**En la sala no hay franja de texto** («2/6 en la sala · 1 de 2 listos · For fun · con bots»
ocupaba 4 líneas en el móvil). Todo se deduce: cuántos sois y cuántos caben = cartas de
jugador + **cartas vacías** por cada asiento libre; quién está listo = carta salvia con ✓;
la clasificación = la etiqueta del chip. Los avisos cortos van al chat como líneas grises. Ese
sitio es del chat (en el móvil, de 150 a ~275 px en 390×844), dejando al menos 120 px para ver
la pelea.
| Perfil | Los dos diales (fun / glory) y el idioma. |

- **Opciones contiguas** (pública/privada, dificultad, idioma): el resalte **se desliza** de la
  opción de antes a la nueva (420 ms) en vez de saltar.
- **Tambor de números**: como los diales de Elo; se ve el número de antes y el de después y
  gira al cambiar. Se mueve con − / +, arrastrando arriba y abajo o con la rueda.

### Rejilla (una sola regla para todo)

Antes había ~20 posiciones a ojo (`H*0.66-70`, `H*0.34-20`…) y las cosas se tapaban. Ahora
todo sale de `rejilla()`:

- margen **16**, separación **8**;
- fila 1 (y 16): título · fila 2 (y 64, alto 40): cabecera a la izquierda, botones pequeños a la derecha;
- **zona de piezas desde y 120**, apiladas;
- abajo, de abajo arriba: la mano (anclada al borde) y el estado;
- **≥ 1024 px**: el chat en columna a la derecha; si no, apilado bajo los jugadores;
- **< 720 px de alto**: la mano al 80 %;
- cabecera y cartas de jugador **sin inclinación 3D**; la perspectiva de la mano tiene el ojo a
  su altura, para que inclinada no crezca.

Se comprobó midiendo las cajas de todo en las 16 vistas y 6 tamaños (PC 1280×800, móvil
390×844, 360×640, tablet 820×1180, y en inglés y chino): **cero choques** salvo una carta de
jugador aún cayendo a su sitio. Límite conocido: 360×640 con 5–8 jugadores deja el chat en su
mínimo (88 px).

### Color

| Token | Valor | Para qué |
|---|---|---|
| `--tinta` | casi negro | fondos |
| `--militar` | `#4b5320` | fragmentos de fondo, dorsos |
| `--salvia` | `#a9b689` | rótulos, marcas, «listo» |
| `--hueso` | `#e9e6da` | cartas de jugador, texto claro |
| **`--acento`** | **`#e8402a` bermellón** | **lo elegido, lo que se mueve y tú**: carta elegida, cabecera, resalte, líneas del tambor, barrido, el «!» del logo, todo lo «tuyo» y quien gana la carta |

**Por qué un acento y por qué este.** Persona 5 usa un único color fuerte (carmesí) y evita
cualquier otro salvo en HP/MP para que su rojo sea inconfundible; su director de arte lo eligió
porque P3 era turquesa y P4 amarillo ([Siliconera](https://www.siliconera.com/?p=668266),
[Segabits/Famitsu](https://segabits.com/page/210/?cat=9)). Persona 3 Reload conserva su azul
con la idea de agua y burbujas ([Automaton](https://automaton-media.com/en/news/20240207-26873/)).
Regla adoptada: un color = «esto se toca / esto es lo elegido».

Se compararon cuatro sobre la misma pantalla:
- **bermellón** (elegido): contrario del verde en la rueda de pintor; verde militar + rojo de aviso;
- naranja señal: se confundía con los diales de óxido y bronce;
- violeta: se aleja del tono militar y roza el rosa del Top 3;
- cian: frío y choca con el Top 3.

**Contraste:** lo claro lleva borde oscuro (cabecera, nombre, jugadores, campo de texto); el
texto suelto, fondo oscuro (estado) o sombra (rótulos de los diales).

### Sin emoji

Todos los iconos son **SVG propios** (`ICONOS`, 24 trazos rectos de 2,5 px, del color del
texto): rayo, más, entrar, enlace, bocina, teclado, cruz, flecha, copiar, silla, volver, bot,
reloj, nota, vacío, play, ojo, check, cambio, llenar, fuera, persona, cámara, QR. En una carta,
`palo: 'i:nombre'` pinta el icono. Los avisos son solo texto. Queda «✓» (símbolo de texto, no
se dibuja como emoji).

### Idiomas

ES / EN / 中文 al momento, sin recargar (en Piles recarga). Los textos de las cartas se guardan
en español (`dataset`) y se traducen al pintar; `DIC` usa el glosario de `client/i18n.js`
(rangos, burlas, «Estoy listo», echar, mirar). Se recuerda en `localStorage`
(`piles.proto.lang`) y la primera vez se toma del navegador. No se traducen los nombres ni el
chat ya escrito.

## Conectado con Piles (`client/mesa/`)

El menú en la mesa sustituye a las pantallas `homeScreen`, `profileScreen`,
`howToPlayScreen`, `hostScreen`, `joinScreen` y `lobbyScreen`, que **ya no existen**: sus ids
quedan como nombres de vista (`vistaActual`, `showScreen(id)`). La lógica (`client/juego/`)
—WebSocket, asiento, reconexión, Elo, votos— recibe los datos como argumentos
(`createLobby(n)`, `joinLobby(código)`, `sendChat(texto)`, `setSmCode`…), sin campos ocultos.
`gameScreen` (la partida) es la única pantalla del DOM.

| Archivo | Qué es |
|---|---|
| `client/mesa/mesa.js` | La interfaz conectada: cartas, piezas, gestos. Importa de `client/juego/` lo que usa. |
| `client/mesa/escena.js` | La partida de fondo (canvas): `escena.ir()`, `escena.X`… |
| `client/mesa/dic.js` | Los textos (`DIC`, `T()`). |

Los tres son módulos ES y van en `client/dist/piles.js`: tras editarlos, `pnpm build` en tools/.
| `client/mesa/mesa.css` | Estilos, todos bajo `#escenario` (las variables también). |
| `client/mesa/siluetas.webp`, `brazos.webp` | Las hojas de sprites (archivos aparte, cacheables). |

Cómo se engancha a la lógica (`client/juego/`):

- **Acciones**: las cartas y piezas llaman a sus funciones (`quickMatch`, `createLobby`,
  `joinLobby`, `toggleReady`, `addBot`, `removeBot`, `setBotDifficulty`, `setVisibility`,
  `cambiarRol`, `sendChat`, `start_kick`/`kick_vote`, `acceptBotsOffer`, `toggleScanner`,
  `PilesI18n.setLang`…). El tambor de jugadores se pasa a `createLobby(n)`; el nombre es `#nombre` (lo lee `miNombre()`).
- **Datos**: avisos del juego (`al(…)`, ver `client/juego/bus.ts`): `handleMsg` (después de lo
  suyo, se pinta aquí: `lobby_update`, `lobby_list`, `chat`, `kick_poll`…), `showScreen` (cuando
  el juego cambia de vista por su cuenta —entraste, te echaron, F5, fin de partida— la mesa va a
  la suya), `startCountdown` / `closeCountdown`, `sinNombre` y `ofertaBots(abierta)`.
- **Cuenta atrás**: el servidor la manda de **5 s** (`COUNTDOWN`); la mesa la llena hacia atrás
  desde el reparto (victoria + 3, 2, 1). Con un servidor de 3 s no hay victoria.
- **QR**: `/api/qr/:sala/matriz` (el mismo QR que el SVG, como módulos) → cartas vistas desde arriba.
- **Escáner**: el `qr-scanner` de siempre; su `<video>` sale de la pantalla oculta y se dibuja en la mesa.
- `gestos.js` no toca la mesa (`data-sin-gestos`) y su borde-atrás no sale fuera de la partida.
- Los nombres llegan con emoji (bots: «🤖 Bot 1»): en la mesa se quitan (`sinEmoji`).
- Pruebas: `tools/browser/mesa.mjs` y `mesa-mas.mjs` (dos y tres navegadores contra el servidor).
  **Las pruebas viejas de `tools/browser` que pulsan las pantallas de menú ya no valen para el
  menú**; las de la partida, sí.

| En el menú | En `client/juego/` (función → mensaje) |
|---|---|
| Partida rápida | `quickMatch()` → `quick_match`; oferta de bots: `armQuickMatchOffer`, `acceptBotsOffer` |
| Crear sala (tambor, pública/privada) | `createLobby()` → `create_lobby`; `setVisibility` |
| Unirse: mesas abiertas | `refreshLobbies()` → `list_lobbies` / `lobby_list`; `joinLobby()` → `join_lobby` |
| Código / QR / escanear | `extractLobbyCode`, `joinLinkFor`, `handleJoinDeepLink`, qr-scanner |
| Gente que llega, Elo, listos | `onLobbyUpdate` (`lobby_update`), `onEnteredLobby` (`joined_lobby`) |
| Estoy listo | `toggleReady()` → `set_ready` |
| Bots: añadir / quitar / dificultad | `addBot` → `add_bot`, `removeBot` → `remove_bot`, `setBotDifficulty` |
| Chat | `sendChat` → `chat`; `onChat`, `onChatHistory` |
| Mirar / jugar | `cambiarRol()` → `set_spectator` |
| Echar | `start_kick`, `kick_vote`; `onKickPoll`, `onKickPollEnded`, `onKicked` |
| Cuenta atrás | `countdown`, `countdown_cancelled` → `startCountdown`, `onCountdownCancelled` |
| Empieza la partida | `game_start` → `onGameStart` |
| Session Manager | `refreshSmCodeUi`, `askEloChoice`, `unlinkAccountElo` |
| Mi burla | `buildTauntList`, `playTaunt`, `getTaunt` |
| Conexión | `connectWs`, `scheduleReconnect`, `onHello` (versión) |
| Salir de la sala | `leaveLobby()` → `leave_lobby` |

## Pendiente / límites

- Cámara real y escaneo de QR sin probar en un móvil.
- Al mirar no hay figura fantasma tuya.
- Sólo hay 4 asientos dibujados (tú y los tres primeros), aunque la sala sea de hasta 8.
- El perfil sin sala enseña nombres de ejemplo en las otras sillas (no hay endpoint del top global).
