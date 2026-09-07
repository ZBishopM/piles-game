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

- [ ] **Subir el bloqueo por perder a 3 s** (ahora son 2). Es
      `STUN_DURATION` en `server/src/game/lobby.rs`; el cliente ya pinta la
      barra con la duración que le manda el servidor, así que no hace falta
      tocar nada más. Probar en beta antes: 3 s en una partida donde los sets
      se encuentran en segundos es bastante castigo, y es justo lo que
      convierte "ceder la carta" en una opción real.
- [ ] **Soltar una carta al centro sin coger otra a cambio**: dejar un hueco
      en tu set, que cualquiera puede coger, y no poder soltar otra hasta
      haber cogido una. Hoy el intercambio es siempre 1↔1 y el centro tiene
      exactamente 4 cartas; esto rompe las dos cosas:
      - el centro pasa a tener un número variable de cartas (¿tope?, ¿se
        apilan?), y `GameState.center_cards` es un `[Card; 4]` fijo
      - tu set queda temporalmente con 3 cartas, así que
        `is_set_complete` / `count_completed_sets` y la verificación tienen
        que aceptar sets incompletos sin darlos por fallidos
      - hace falta estado nuevo por jugador ("debe" una carta) y bloquear
        soltar otra hasta saldarlo
      - decidir qué pasa si nadie coge la carta soltada, y si se puede
        recuperar la propia
      Es un cambio de reglas, no un retoque: conviene diseñarlo antes de
      tocar código.
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

Hoy no hay base de datos: `sqlx`/Postgres siguen comentados en `Cargo.toml`.
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
- [ ] Drag & drop en vez de click-click
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
