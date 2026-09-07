# Piles! — Tareas Pendientes

Estado y despliegue: ver `README.md` y `DEPLOY.md`. El juego está en
producción (`piles.danassistantassistant.website`) con un entorno de pruebas
aparte (`beta.piles.danassistantassistant.website`).

---

## 🧪 Pruebas pendientes con jugadores reales

Lo de aquí abajo tiene tests automáticos o se ha comprobado con navegadores
reales, pero **no** con varias personas jugando a la vez, que es donde salen
los problemas de sincronización.

### QTE
- [ ] Conflicto real: dos personas tocando la misma carta del centro a la vez
      (la ventana de detección son 300 ms; con navegadores automatizados sale
      siempre, con personas reales está sin confirmar)
- [ ] Conteo de clicks en vivo para ambos participantes
- [ ] **Ceder** (`🏳️ Ceder la carta`) — debe cerrar el QTE al instante
- [ ] Race condition: el QTE vence por timeout justo cuando alguien concede

### Flujo completo
- [ ] Partida entera a 2 jugadores: intercambios → QTE → verificación → fin
- [ ] Partida a 3+ para ver los rankings (1º, 2º, 3º)
- [ ] Desconexión a mitad de partida (hoy se cancela la partida y todos
      vuelven a la sala; falta decidir si eso es lo que queremos)

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
- [ ] **Desconexión en partida activa**: ahora mismo cancela la partida entera
      para todos. Lo suyo sería que el resto pudiera seguir jugando sin quien
      se fue. Requiere reconstruir el estado de juego sin ese jugador.
- [ ] **Reconexión automática**: al caerse la conexión aparece un overlay con
      botón *Reconectar*. Volver a la sala ya funciona (y sobrevive a un F5),
      pero hay que pulsar el botón; falta reintentar solo, con backoff.
- [ ] **Anti-cheat del QTE**: no hay ningún límite de clicks por segundo, así
      que un autoclicker gana siempre.
- [ ] `ListLobbies`: el servidor lo implementa y el cliente lo ignora
      (`case 'lobby_list': break`). Falta la pantalla de salas abiertas.
- [ ] Reanudar partida en curso tras reconectar (hoy se pierde el estado del
      tablero; solo se recupera la sala).

---

## 📱 Responsive / móvil

- [ ] Media queries para el **tablero** (`#gameScreen`) en < 768px. Las
      pantallas de entrada (home, perfil, tutorial, hospedar, unirse) ya las
      tienen; el tablero es lo que falta.
- [ ] Sustituir estados `:hover` por eventos táctiles
- [ ] Layout vertical en móvil (centro arriba, set propio abajo, oponentes
      colapsables)

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

- [ ] Sonidos: tomar carta, completar set, ganar QTE, verificación
- [ ] Animación de la carta al intercambiar (del set al centro y viceversa)
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
