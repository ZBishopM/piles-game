# Piles! — Tareas Pendientes

Estado y despliegue: ver `README.md` y `DEPLOY.md`. El juego está en
producción (`piles.danassistantassistant.website`) con un entorno de pruebas
aparte (`beta.piles.danassistantassistant.website`).

---

## 🧪 Pruebas pendientes con jugadores reales

Lo de aquí abajo tiene tests automáticos o se ha comprobado con navegadores
reales, pero **no** con varias personas jugando a la vez, que es donde salen
los problemas de sincronización.

### Nuevas funcionalidades
 - [ ] cuando tomas una carta y alguien clickea en menos de medio segundo el lugar donde la carta no esta, reproducir un audio personalizado que puedes configurar en el perfil, una burla personalizada para cuando te "roban" alguna que querías, quizá tambien añadir cuando ganas o pierdes una pelea.

### Peleas
- [ ] a veces jugadores empatan pero uno gana, ver como solucionar esto para que no se vea injusto para el que perido, mostrar un segundo minijuego de muerte subita maybe.

### Flujo completo
- [ ] las partidas cuando todos estan listos empieza muy rápido, agregar un  contador hacia atrás para empezar a jugar
- [ ] `bot-e2e.mjs` vive en `D:/Temp/` y se perderá. Si los bots van a
      seguir, merece la pena meterlo en el repo (`tests/`) para que la única
      prueba multijugador automática no dependa de un fichero temporal.

---

## 🤖 Afinar los bots

Los cuatro mandos están en `Difficulty::knobs()` (`server/src/bot.rs`). Son
números, no lógica: tocarlos no puede romper nada.

| Mando | Fácil | Normal | Difícil |
|---|---|---|---|
| Pensar entre jugadas | 2 s | 1,5 s | 1 s |
| Pulsar en pelea (±25 % jitter) | 320 ms | 180 ms | 110 ms |
| Elige la carta buena | 80 % | 95 % | 100 % |
| Se pelea una carta que te ve coger | 5 % | 15 % | 30 % |

- [ ] El bot apunta al set con más cartas iguales y suelta lo que no encaja.
      No mira lo que han revelado los demás ni lo que hay en el centro para
      decidir qué set perseguir — en dificil, el bot no debería soltar una carta que un jugador tiene 3 de ellos.
[to verify]
- [ ] **Los bots cierran sets, pero demasiado pocos** (2026-09-11). Cerraron uno
      en 2 de 5 partidas medidas; antes, ninguno en 3. Para ganar hacen falta 6,
      así que siguen sin terminar una partida. La mesa ya no se para.

      **Arreglado, y era la causa de que no cerraran ninguno**: esperaban cartas
      que tenían ellos mismos. Las cartas caen en el hueco del que soltaste, así
      que dos copias de la misma prenda en sets distintos no se juntan jamás —hay
      que soltar la descolgada al centro y recogerla ya en el set bueno. Medido
      antes del arreglo: **88 de 132 esperas eran esto**, y en las peores el bot
      tenía las cuatro copias repartidas esperando una quinta.

      **No es el reparto.** Entre personas las partidas sí terminan. Descartado
      además leyendo el código: el mazo tiene exactamente 4 copias por prenda,
      `take_card_into_slot` mete la carta en el hueco del que soltaste, y
      `is_set_complete` y `set_is_done` piden lo mismo.

      **Lo que queda**: las cuartas copias que otro necesita siguen muertas en
      los cinco sets que el bot no toca nunca, porque solo suelta del set al que
      apunta. Soltar del set *peor* se probó **dos veces** para eso —suelto, y
      con compromiso de destino— y midió peor las dos: la segunda dejó la mesa
      parada en 20 actualizaciones. No repetirlo sin una idea distinta detrás.

      Ojo con cualquier arreglo que haga al bot cambiar de set: cambiar de set no
      mueve ninguna carta, así que un bot dando vueltas entre sets parece ocupado
      y para la mesa entera sin que salte ningún error. Por eso `SwitchSet` no
      cuenta como avance para el contador de espera.

**Ojo si se toca el bucle del bot**: hay dos relojes separados y no es un
descuido. `think` es la dificultad; `watch` (80 ms fijos) es mirar si alguien va
a por una carta para disputársela. La ventana de conflicto son 300 ms, así que
comprobándolo al ritmo de `think` (500 ms en difícil) casi nunca cae dentro:
con un solo reloj, dos bots en difícil jugaban partidas enteras sin pelearse una
sola carta.

---

## 📼 Grabar partidas y verlas después

    ./server/target/release/piles-server
    # jugar una partida, y luego:
    #   http://<host>/replay.html

Existe una línea de tiempo, ir evento a evento (flechas, space to play)
se puede navegar entre sets y jugadores

Trae dos relojes a propósito: el desplazamiento desde el inicio para moverse, y
la **hora de reloj** para cuadrarlo con un vídeo real.

**Las vueltas atrás salen marcadas**, que es lo que más cuesta ver en un vídeo:
pediste una carta y llegaste tarde (`swap_failed` con `kind: gone`), la jugada
rompía una regla, o el plazo de 3 s te asignó una carta. En el móvil las tres se
ven igual, como un parpadeo raro. [ tiene que ver con la nueva funcionalidad arriba]  

Se guardan **las 10 últimas**; las viejas se borran solas. La máquina no tiene
swap y también lleva producción y el correo: un disco lleno se los lleva. [to verify, que yo sepa se guardan todas pero se muestran 10 ]

⚠️ **Ahora graba también producción.** Una grabación contiene la mano de todos
los jugadores y la puede abrir cualquiera que tenga el enlace. Es aceptable
jugando entre amigos, que es lo que hay hoy, pero **hay que cerrarlo antes de
abrir el juego a desconocidos**: pedir sesión en `/api/recordings`, o no grabar
salas públicas. Ver `LANZAMIENTO.md`.

Hubo un detector de desajustes (comparaba lo reconstruido con el fotograma
clave) y un `replay.html?test` que lo probaba. Se quitaron: nadie los pidió y
en ninguna partida encontraron nada.

---

Pendientes, encontrados en la revisión del 2026-09-16 y **sin arreglar**:

- [ ] `id="qbnFill"` duplicado (`lobby.html`, aviso de pelea ajena): con dos
      peleas de espectador a la vez hay dos elementos con el mismo id. Hoy
      funciona porque la búsqueda va acotada al aviso, pero es HTML inválido.
      Debería ser una clase.
- [ ] `cameFromQuickMatch` nunca vuelve a `false` (`lobby.html`): tras una
      partida rápida, cualquier `lobby_update` con un jugador o menos vuelve a
      ofrecer bots.
- [ ] `replay.html` no está enlazado desde ningún sitio: solo se llega
      escribiendo la URL. El "historial en el perfil" se quedó a medias.

---

## 🖱️ Toques

Las herramientas viven en `tools/`, no en `client/`. El binario sirve `client/`
entera, así que ahí dentro cualquiera se las podía descargar desde internet.

`tools/tap-test.mjs` — `node tools/tap-test.mjs`. Saca `bindTap` del propio
`lobby.html`, así que no se queda vieja: si cambia la función, prueba la nueva.

`tools/giveup-test.mjs` — `node tools/giveup-test.mjs`, con el servidor levantado.
Uno cede la carta mientras el otro machaca: la pelea tiene que cortarse al
momento y no llegar a los 3 s del reloj.

**Y por qué lleva además una comprobación estática del CSS**: el botón de ceder
no funcionaba en el móvil y pasaba todas las pruebas. Faltaba
`touch-action: none`. Sin eso, el navegador trata el dedo apoyado como el
principio de un desplazamiento, se queda el gesto y manda `pointercancel`, que
corta la cuenta de 700 ms. `preventDefault()` en `pointerdown` **no** lo evita.
Un navegador automatizado no hace gestos de verdad, así que mandar eventos
sintéticos nunca lo habría visto: ese fallo solo se puede cazar leyendo el CSS
o con un teléfono en la mano.

Lo mismo con `setPointerCapture`: el círculo mide 52 px y un pulgar apoyado
700 ms se mueve; sin capturar el puntero, `pointerleave` cortaba la cuenta.

`tools/spectator-test.mjs` — `node tools/spectator-test.mjs`, con el servidor
levantado. Alguien entra en una partida ya empezada: comprueba que recibe el
tablero sin sets propios, que a los que juegan les llega la cuenta de mirones,
que no le llega ningún mensaje privado, y que lo que mande no mueve nada.

`tools/two-fights-test.mjs` — `node tools/two-fights-test.mjs`, con el servidor
levantado. Cuatro jugadores, dos peleas a la vez por cartas distintas. Cuenta
cuántas peleas se resuelven y cuántos clicks cuentan **en cada una**.

Ojo con lo que se afirma aquí: `qte_resolved` se difunde a TODA la sala, así que
"los cuatro recibieron uno" no prueba nada —con una sola resolución la reciben
los cuatro igual—. La primera versión de este test pasaba con el fallo delante.
Hay que contar resoluciones y clicks por pareja.

`tools/take-race-test.mjs` — `node tools/take-race-test.mjs`, con el servidor
levantado desde la raíz del repo. Reproduce con dos clientes de verdad el caso
que confundía jugando: eliges una carta y desaparece sin pelea y sin aviso.

Cómo lo provoca: uno coge la carta, espera 600 ms (más que los 300 ms de
`CONFLICT_WINDOW`, así que NO puede haber pelea) y el otro pide la misma carta.
Antes el servidor no contestaba nada; ahora manda `swap_failed`.

Sirve de molde para cualquier otro "toqué algo y no pasó nada": levantar dos
clientes, forzar la carrera, y mirar qué le llega al que pierde.

Lo que fija, y por qué: un `click` solo existe si el dedo baja y sube sobre el
MISMO elemento, y el centro se redibuja entero cada vez que otro jugador mueve
una carta. Si eso caía entre el apoyo y el levantamiento, el toque se perdía sin
dejar rastro — el famoso "hay que darle dos veces". Por eso escucha el
contenedor y la carta se apunta al bajar el dedo.

Si algún día se vuelve a poner un `onclick` en cada carta, vuelve el fallo.

---

## 🔊 Sonido

Sintetizado con WebAudio en `lobby.html`, sin ficheros. El motivo no es la
pereza: lo que hace que Balatro suene a Balatro es que **cada eslabón suena más
agudo que el anterior**, y eso pide un tono calculado. Con muestras haría falta
una grabación por escalón.

Se miraron los packs libres. Los de [Kenney](https://kenney.nl/assets/interface-sounds)
son CC0 (uso comercial, sin atribución) y servirían. Si algún día se quieren
muestras de verdad, el único sitio que hay que tocar es `playSfx`.

- [ ] Ajustar volúmenes jugando. Están puestos a oído, sin nadie delante.
- [x] El silencio se recuerda en `localStorage` (`piles.mute`).

---

## 💡 Ideas por probar

- [ ] **Toda la pantalla es el botón de pelear** (puesto el 2026-09-11 *a modo de
      prueba*, decidir si se queda). Apuntar al botón se perdía cuando venías de
      tocar una carta en la otra punta de la pantalla: el dedo ya estaba lejos y
      la pelea dura un suspiro. Ahora vale tocar donde sea.

      Lo que hay que mirar jugando: si al tocar en cualquier sitio se pierde la
      referencia de *dónde* estás tocando, y si con el móvil en la mano se dan
      toques sin querer. Si molesta, volver a un botón grande centrado es un
      cambio de dos líneas: devolver el `onclick` al botón y quitar el
      `pointerdown` del overlay.

- [ ] **Romper los plantes con el combo** (idea de 2026-09-11, por probar).
      Pasa también entre personas: llega un momento en que todos esperan a que
      otro suelte por fin la carta que les falta, y nadie suelta. La partida no
      se bloquea, pero se hace lenta justo al final, que es cuando debería
      apretar.

      La idea: si alguien aguanta un combo por encima de cierto multiplicador
      durante cierto tiempo, **bloquea un segundo a los demás**. No es un castigo
      al que espera, es un premio al que está jugando rápido: mientras los demás
      están bloqueados, el que va lanzado tiene la mesa para él y puede coger lo
      que necesita sin que se lo disputen. Rompe el plante desde arriba, sin
      obligar a nadie a soltar.

      Por decidir antes de escribir nada: a partir de qué multiplicador, cuánto
      hay que aguantarlo, y si el bloqueo se repite mientras dure la racha o es
      una sola vez. Hay que probarlo jugando: puede ser justo lo que le falta al
      final de la partida, o puede ser insufrible para el que lo recibe.

      La maquinaria ya está: `Stunned { ms }` con su bloqueo en el cliente,
      `ComboUpdate` con multiplicador y ventana, y `is_on_fire()` que ya se
      difunde a todos.

---

## 🎮 Mecánicas / bugs conocidos

- [x] **Bloqueo por perder subido a 3 s** — `STUN_DURATION` en
      `server/src/game/lobby.rs`. El cliente pinta la barra con la duración
      que le manda el servidor, así que se cambia en un sitio.
- [ ] **Logros de Piles en Session Manager**. La tubería ya funciona entera:
      `/api/piles/claim` crea una partida sintética que dispara
      `match_finished.pb.js`, que desbloquea logros. Lo que falta es que
      existan: el catálogo tiene la entrada "Piles" pero **cero logros**,
      porque `GEMINI_API_KEY` no está puesta en producción y
      `game_created.pb.js` se saltó la generación. Además el hook solo mira
      los que están en `status = "approved"`.
      - Rápido, sin tocar código: proponer unos cuantos desde
        `/games/{id}` y aprobarlos en el panel de superusuario. Con el DSL
        actual dan para: primera victoria, N victorias, racha, y partidas
        rápidas (`wins_on_game`, `current_streak_wins`,
        `match_duration_minutes`…).
      - Lo interesante sería que fueran **de Piles de verdad** (ganar N
        peleas, completar un set sin intercambiar, terminar sin perder
        ninguna pelea), y eso no se puede hoy: el claim solo manda
        `placement` y `points`, así que esos datos ni siquiera salen del
        juego. Haría falta mandarlos y ampliar el juego de variables del
        DSL (`src/lib/core/achievement-generator.ts` y `achievements.ts` en
        session-manager).

---

## 📱 Responsive / móvil

- [x] Media queries para el **tablero** (`#gameScreen`) en < 768px — hecho.
      Se aprieta el espacio (cabecera, hint, etiquetas, huecos del grid), los
      objetivos táctiles suben a 44 px de alto (`.set-btn`, `#flipBtn`), y el
      botón de verificar deja de estar fijo abajo a la derecha tapando las
      últimas cartas: pasa al flujo, al final del tablero y a todo el ancho.
      También se quita el `min-width` en `vw` de `.card-row`, que forzaba
      scroll horizontal en pantallas estrechas.
- [x] `:hover` en táctil — hecho con `@media (hover: none)`, que anula el
      hover donde no hay puntero. Un toque dejaba la carta levantada y el
      botón iluminado hasta tocar otra cosa. Sale más barato que reescribir
      los estados como eventos táctiles, y no toca el ratón.
- [x] Layout vertical en móvil — ya lo era: el orden del DOM es centro → tus
      sets → oponentes. Lo que faltaba era el tamaño, no el orden. Los
      oponentes colapsables se quedan fuera hasta que estorben de verdad.

---

## 🗄️ Base de datos / puntuación (diferido)

Hoy no hay base de datos y el servidor no tiene dependencias externas.
Los resultados que se guardan van a Session Manager, no aquí.

- [ ] Levantar PostgreSQL
- [ ] Migración inicial (`001_init.sql`) — tabla `players`
- [ ] `db.rs`: guardar puntos al terminar la partida
- [ ] `GET /leaderboard` — top 10
- [ ] Mostrar puntos acumulados en la pantalla de resultados

---

## ✨ Polish / mejoras futuras

- [x] **Sonido** — hecho, sintetizado con WebAudio (ver 🔊 Sonido). Era la
      mitad que faltaba del impacto. Referencia: Balatro, donde cada carta
      tiene su golpe seco y el acierto sube de tono al encadenar.
      - Momentos que piden sonido: soltar carta, coger carta, empezar pelea,
        cada click durante la pelea, ganar pelea, perder (el bloqueo), set
        completo, verificación correcta/incorrecta, fin de partida.
      - Que el tono suba con la racha (ver el sistema de combo abajo) es lo
        que engancha; un sonido plano repetido cansa a los diez minutos.
      - Detalles que hay que respetar: arrancar el audio solo tras la primera
        interacción del usuario (los navegadores bloquean el autoplay), un
        botón de silencio que se recuerde en `localStorage`, y precargar los
        clips para que el primer golpe no llegue tarde. Con `Audio` del
        navegador y varios elementos reutilizables basta; no hace falta
        meter una librería.
- [x] **Sistema de combo** — hecho. Eslabones: coger carta +1, ganar pelea +2,
      completar set +3. Multiplicador `1 + combo/3` con tope en x5, ventana de
      4 s, y puntos `10 × multiplicador` por eslabón que se suman **encima** de
      los del puesto final (ganar la carrera sigue siendo lo que más puntúa).
      La racha se corta al vencer la ventana o al **perder una pelea** — por
      regla explícita, porque la ventana (4 s) dura más que el bloqueo (3 s) y
      si no se cortara, perder no costaría la racha.
      Lo lleva el servidor entero (`PlayerState` en `models.rs`); el cliente
      solo pinta lo que recibe en `combo_update`. `PlayerProgress.on_fire` se
      difunde a todos a propósito: ver quién encadena es lo que da ganas de ir
      a quitarle una carta.
- [x] Animación de la carta al intercambiar (del set al centro y viceversa) —
      hecha con `flyCard()` y `#fxLayer`: la carta vuela de origen a destino
      y el hueco de destino se oculta durante el vuelo para que no se vea
      dos veces.
- [ ] **Drag & drop en vez de click-click**. Hoy todo es seleccionar y luego
      pulsar: carta tuya → carta del centro para intercambiar, y carta tuya →
      botón para soltar. Arrastrar diría por sí solo lo que hace cada gesto
      (llevar una carta al centro = soltarla; traer una del centro = cogerla)
      y quitaría el botón de soltar de en medio. Hay que cubrir también el
      táctil (`pointerdown`/`pointermove`/`pointerup`, no sólo los eventos
      de arrastre de escritorio) y dejar el click-click funcionando como
      alternativa accesible.
- [ ] Confeti para el 1º puesto
- [ ] Avatar guardado en `localStorage`
- [ ] personalizar tema o tener currency virtual para comprar esteticos
- [ ] incitar a jugadores mediante mensajes al final de la partida para que se registren en sessionmanager, y guardar sus puntos asociados a un nombre, un ping y acceder a esteticos desde cualquier dispositivo

---
