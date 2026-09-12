# Piles! — Tareas Pendientes

Estado y despliegue: ver `README.md` y `DEPLOY.md`. El juego está en
producción (`piles.danassistantassistant.website`) con un entorno de pruebas
aparte (`beta.piles.danassistantassistant.website`).

---

## 🧪 Pruebas pendientes con jugadores reales

Lo de aquí abajo tiene tests automáticos o se ha comprobado con navegadores
reales, pero **no** con varias personas jugando a la vez, que es donde salen
los problemas de sincronización.

### Peleas
- [ ] Conflicto real: dos personas tocando la misma carta del centro a la vez
      (la ventana de detección son 300 ms; con navegadores automatizados sale
      siempre, con personas reales está sin confirmar)
- [ ] Conteo de clicks en vivo para ambos participantes
- [ ] Que la racha suba al ganar y se corte al perder, con dos personas de
      verdad peleando

### Flujo completo
- [ ] Partida entera a 2 **personas**: intercambios → pelea → verificación →
      fin. Entre bots ya corre sola (ver `D:/Temp/bot-e2e.mjs` como referencia
      del arnés), pero con personas sigue sin comprobarse.
- [ ] Partida a 3+ para ver los rankings (1º, 2º, 3º)
- [ ] Desconexión a mitad de partida, con personas: cerrar la pestaña de una y
      comprobar que las demás siguen jugando y ven la cuenta atrás, que volver
      antes de 30 s recupera el tablero, y que al agotarse la espera el centro y
      los sets quedan coherentes y la partida se puede terminar.
- [ ] `bot-e2e.mjs` vive en `D:/Temp/` y se perderá. Si los bots van a
      seguir, merece la pena meterlo en el repo (`tests/`) para que la única
      prueba multijugador automática no dependa de un fichero temporal.

---

## 🤖 Afinar los bots

Los cuatro mandos están en `Difficulty::knobs()` (`server/src/bot.rs`). Son
números, no lógica: tocarlos no puede romper nada.

| Mando | Fácil | Normal | Difícil |
|---|---|---|---|
| Pensar entre jugadas | 2,5 s | 1,2 s | 0,5 s |
| Pulsar en pelea (±25 % jitter) | 320 ms | 180 ms | 110 ms |
| Elige la carta buena | 50 % | 80 % | 95 % |
| Se pelea una carta que te ve coger | 5 % | 20 % | 50 % |

- [ ] Jugar contra los tres niveles y ajustar. Lo que hay es una primera
      aproximación, no algo medido con gente.
- [ ] El bot apunta al set con más cartas iguales y suelta lo que no encaja.
      No mira lo que han revelado los demás ni lo que hay en el centro para
      decidir qué set perseguir — se podría, si resulta demasiado tonto.

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

## 🖱️ Toques

`client/tap-test.mjs` — `node client/tap-test.mjs`. Saca `bindTap` del propio
`lobby.html`, así que no se queda vieja: si cambia la función, prueba la nueva.

Lo que fija, y por qué: un `click` solo existe si el dedo baja y sube sobre el
MISMO elemento, y el centro se redibuja entero cada vez que otro jugador mueve
una carta. Si eso caía entre el apoyo y el levantamiento, el toque se perdía sin
dejar rastro — el famoso "hay que darle dos veces". Por eso escucha el
contenedor y la carta se apunta al bajar el dedo.

Si algún día se vuelve a poner un `onclick` en cada carta, vuelve el fallo.

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
- [x] **Soltar y coger sustituyen al intercambio 1↔1** — hecho. Ya no hay
      intercambio simultáneo: tocas una carta tuya y va directa al centro
      (sin botón ni confirmación), y luego coges una del centro para tapar el
      hueco. Hasta taparlo no puedes soltar otra ni mostrar sets. La carta
      soltada la puede coger cualquiera, incluido tú.
      Las peleas ahora saltan cuando dos jugadores van a por la misma carta
      del centro, no al intercambiar. Las cartas se identifican por id y no
      por posición: el centro cambia de tamaño constantemente y un índice
      dejaría de apuntar a la misma carta.
- [x] **Desconexión en partida activa** — hecho, y convertido en mecánica. Se
      le espera 30 s (`GRACE_PERIOD`) con su sitio y sus cartas intactos
      mientras los demás siguen jugando; si vuelve, recupera el tablero. Si no
      vuelve, la partida se redimensiona a un jugador menos retirando **prendas
      enteras** (`deck::retire_types_on_leave`) en vez de borrar sus 24 cartas
      sueltas, que es lo que antes dejaba ~20 prendas imposibles de completar.
      Solo se cancela si no quedan dos personas.
      Nota: `owed_slot` guarda una sola deuda, así que cada superviviente puede
      absorber un hueco como máximo y normalmente se retiran menos de las 6
      prendas que sobran. Es seguro (sobrar sets solo da holgura). Recortar
      exacto pide convertir `owed_slot` en lista.
- [x] **Reconexión automática** — hecho. Al caerse la conexión el cliente
      reintenta solo con backoff (1s, 2s, 4s, 8s y luego cada 15s, sin límite
      de intentos) y el overlay dice por qué intento va. El botón
      *Reconectar* se queda como "ahora mismo, sin esperar".
- [x] `ListLobbies` — construido en vez de borrado. Las salas llevan
      `is_public` (público por defecto, con interruptor al crearla), así que
      `list_available_lobbies` ya no anuncia la sala que compartes por QR con
      tus amigos — que es lo que habría pasado en cuanto el cliente empezara a
      enseñar la lista. El `case 'lobby_list': break` ya hace algo.
- [x] **Partida rápida** — entra en la sala pública **más llena** (repartir
      gente entre salas medio vacías es como nadie llega nunca a 2), y si no
      hay ninguna abre una y espera. No mete bots por su cuenta: si sigues solo
      a los 12 s, pregunta.
- [x] **Bots** — `server/src/bot.rs`. Se añaden desde la sala, hasta llenarla,
      con dificultad fácil/normal/difícil. Cuatro mandos: tiempo de pensar,
      ritmo de pulsación en las peleas (con jitter, que un ritmo exacto suena a
      metrónomo), calidad de la elección de carta, y ganas de pelear. Para
      pelear leen `take_intents`, donde el servidor ya apunta quién va a por
      qué dentro de la ventana de 300 ms, así que la pelea sale por el mismo
      camino que entre dos personas.
      No hicieron falta dependencias nuevas ni tocar la lógica del juego:
      `handle_client_message` nunca necesitó un socket, así que un bot registra
      su canal en `state.connections` y la llama directamente.
- [x] Reanudar partida en curso tras reconectar — hecho con el mecanismo de
      espera de arriba: al volver se reenvía el tablero entero, no solo la
      sala.

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

- [ ] **Sonido**. Es la mitad que falta del impacto: lo visual ya está, y sin
      audio la pelea sigue siendo muda. Referencia: Balatro, donde cada carta
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
- [ ] Chat básico en la sala
- [ ] Avatar guardado en `localStorage`
- [ ] Usar el reverso de la hoja de sprites (fila 12, celda 8) para las cartas
      boca abajo — está dibujado y sin usar

---

## ✅ Hecho

- **Una pelea podía congelar la partida entera** (2026-09-11). `run_qte` tenía
  un `return` a secas cuando el ganador ya no podía quedarse la carta, y eso se
  saltaba el `QteResolved`. Como cliente y bot solo salen del estado "peleando"
  con ese mensaje, **todos los de esa pelea se quedaban bloqueados para
  siempre**: una partida medida movió 92 cartas en dos minutos y luego nada en
  seis. Ahora la pelea se resuelve siempre; sin premio no hay carta, ni racha,
  ni bloqueo al perdedor —una pelea que no reparte nada no puede castigar.
  La causa era el plazo de 3 s: al tapar el hueco dejaba vivo el intento de
  coger, así que otro podía convertirlo en pelea que su "ganador" ya no podía
  ganar. Ahora saldar la deuda borra los intentos de ese jugador.
- **Los bots no podían ganar** (2026-09-11). Ganar exige voltear los 6 sets,
  que es lo que dispara la verificación, y los bots no mandaban nunca `FlipSet`
  ni `RequestVerification`: podían tener los 6 sets perfectos y no terminar
  jamás. Ahora enseñan cada set en cuanto lo cierran —nunca debiendo una
  carta— y piden verificación al tener los seis.
- **Los bots peleaban por todo** (2026-09-11). El dado de pelear se tiraba cada
  80 ms mientras durase el intento rival, o sea ~4 veces por oportunidad: el
  0,35 de normal era un 82 % real. Ahora se tira **una vez por carta**, y los
  números bajan a 5 % / 20 % / 50 %.
- **El centro ya no se recoloca** (2026-09-11). El servidor lo guarda en una
  lista, así que coger una carta corría todas las de detrás y la que ibas a
  tocar se movía debajo del dedo. Ahora cada carta se queda en su hueco, el
  hueco vacío se queda vacío y la siguiente soltada ocupa el primero libre.
  Además caen "tiradas": ángulo y desplazamiento salen del id de la carta, así
  que son iguales en la pantalla de todos, y van en % para verse igual en
  cualquier tamaño.

- **Cuatro fallos salidos de jugar en beta** (2026-09-11).
  - *Soltar una carta y cambiar de set bloqueaba la partida.* La respuesta a
    `SwitchSet` se construía con `filter_map` y **se comía el hueco**: el set
    volvía con 3 cartas y sin ningún nulo, así que `owesCard()` en el cliente
    decía que no debías nada y el centro dejaba de responder — mientras el
    servidor sí seguía sabiendo que debías, con lo que tampoco podías soltar.
    Ahora viaja con `set_to_info()`, igual que `GameStart` y `SwapSuccess`, y
    además **no se puede cambiar de set mientras debes una carta**.
  - *Plazo de 3 s para tapar el hueco* (`DEBT_DEADLINE`). Si se agota, el
    servidor asigna una carta del centro al azar. El hueco no costaba nada
    mientras no lo taparas, y con varios jugadores el centro se quedaba fijo en
    7 u 8 cartas. La cuenta se **pausa mientras estás bloqueado** por perder una
    pelea: eso ya cuesta la carta y 3 s parado, y una carta al azar encima sería
    un tercer castigo por el mismo error.
  - *El centro ya no mueve la interfaz en móvil.* Tiene altura fija y se
    desplaza por dentro; antes, al añadirse una fila, empujaba hacia abajo las
    cartas y los botones y el toque caía donde no era. También cubre el centro
    enorme que deja alguien al abandonar.
  - *Bots que no cerraban sets.* Van al set cuya prenda **está en el centro** en
    vez de al que más cartas iguales tiene —perseguían sets imposibles—, y al
    coger prefieren la que cierra el set, luego una que ya tengan en él, y solo
    después la que más lleven en la mano; antes, si no estaba la que quería,
    cogía la primera del centro y se pasaba la partida cambiando basura por
    basura. Además tapan el hueco con un reflejo de 250 ms en lugar de esperar
    un ciclo entero, que es lo que más despeja el centro.
    (Se probó también "soltar la carta más rara del set" y se descartó: en un
    set de 4, las que no son mayoritarias son siempre igual de raras, así que
    elegía exactamente la misma que el código que ya había.)

- **Los logs del servidor se ven** (2026-09-10). `tracing_subscriber::fmt::init()`
  a secas y sin `RUST_LOG` puesta dejaba **todos** los `tracing::info!` fuera:
  quién entra, quién se cae, qué prendas se retiran. En el VPS pm2 recoge
  stdout, así que se veían los `println!` y ninguna traza — justo las que hacen
  falta para entender un incidente. Ahora el nivel por defecto es `info`, y
  `RUST_LOG` sigue mandando si está puesta.

- **Peso e impacto en las cartas** (2026-09-10). La carta se inclina hacia el
  puntero, se levanta al pasar por encima y se hunde al pulsarla; al aterrizar
  se aplasta y rebota con un anillo de choque; ganar una pelea lo hace en
  dorado, con chispas y una sacudida más fuerte; el centro destella cuando
  mueve otro. Todo compuesto en un solo `transform` con variables CSS
  (`--lift`, `--scale`, `--tilt-x/y`) para que las reglas no se pisen, y todo
  apagado bajo `prefers-reduced-motion`. Falta el sonido, que es la otra mitad
  (ver Polish).
- Despliegue en VPS con pm2 + nginx, y entorno beta aparte (`DEPLOY.md`)
- Arte real de las prendas desde `client/cards.webp` (50 prendas × 4 colores);
  las cartas ya no llevan texto
- Las prendas de cada partida se sortean entre las 50 (antes salían siempre
  las mismas por orden)
- Tutorial de 3 pasos en `#howToPlayScreen`, ilustrado con cartas reales
- Pantalla de inicio reorganizada: perfil, cómo jugar, hospedar y unirse
- Unirse por QR y por enlace `?join=CODE`, con escáner dentro de la app
- Heartbeat WebSocket (ping cada 25 s)
- Volver a la sala tras desconexión o F5, sin duplicar al jugador
- Las salas vacías siguen siendo reutilizables y se reciclan a los 30 min
- Nick guardado en `localStorage`
- La sala se mantiene al terminar la partida, lista para otra ronda
- Vinculación opcional con Session Manager (código en 👤 Perfil)
