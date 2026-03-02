# Piles! — Tareas Pendientes

## 🚀 Prioridad Alta: Deployment (Desbloquea prueba de QTE)

- [ ] **Desplegar en VPS** — necesario para probar QTE con dos jugadores reales
  - Compilar release build: `cargo build --release`
  - Configurar `Dockerfile` y `docker-compose.yml`
  - Servir el frontend estático (directamente con Axum o Caddy/nginx)
  - Configurar variables de entorno (`HOST`, `PORT`)
  - Exponer puertos WebSocket y HTTP
  - Alternativa rápida: usar `ngrok` o `cloudflared` desde tu máquina local

---

## 🧪 Pruebas Pendientes (Post-Deployment)

### QTE
- [ ] Probar detección de conflicto (ventana de 300ms): dos jugadores toman la misma carta simultáneamente
- [ ] Verificar que el conteo de clicks se actualiza en tiempo real para ambos participantes
- [ ] Probar que el ganador recibe la carta correctamente y el perdedor recibe `swap_failed`
- [ ] Probar **conceder** (`🏳️ Ceder la carta`) — QTE debe terminar de inmediato dando la carta al oponente
- [ ] Verificar que espectadores ven la notificación de batalla (no bloqueante) y pueden seguir jugando
- [ ] Probar race condition: QTE termina por timeout al mismo tiempo que alguien concede

### FlipSet + Auto-Verificación
- [ ] Verificar que al voltear todos los sets se auto-envía `RequestVerification`
- [ ] Comprobar que sets fallidos se desmarcan (se les quita el volteo) tras verificación fallida
- [ ] Verificar que los oponentes ven correctamente los sets volteados en el panel lateral
- [ ] Comprobar que solo se muestra la primera carta del set (no las 4)

### Flujo Completo
- [ ] Partida completa 2 jugadores: inicio → intercambios → QTE → verificación → game over
- [ ] Partida con 3+ jugadores para probar rankings (1°, 2°, 3°)
- [ ] Probar desconexión de un jugador a mitad de partida (¿el juego se cuelga?)

---

## 🗄️ Base de Datos PostgreSQL (Diferido)

- [ ] Levantar PostgreSQL con Docker
- [ ] Implementar migración inicial (`001_init.sql`) — tabla `players`
- [ ] Implementar `db.rs`: guardar puntos al terminar partida
- [ ] Endpoint `GET /leaderboard` — top 10 jugadores
- [ ] Mostrar puntos acumulados en pantalla de resultados (`game_over`)
- [ ] Mostrar tabla de puntuaciones en la pantalla de inicio (`index.html`)

---

## 📱 Responsive / Mobile

- [ ] Media queries para pantallas < 768px
- [ ] Reemplazar hover-clicks por touch events en móvil
- [ ] Cartas más grandes en pantalla táctil
- [ ] Layout vertical en móvil (centro arriba, set propio abajo, oponentes colapsables)

---

## 🎮 Mecánicas / Bugs Conocidos

- [ ] Manejo de desconexión de jugador en partida activa (quitar del lobby, continuar juego)
- [ ] Limpiar lobbies inactivos automáticamente (TTL o garbage collection)
- [ ] `ListLobbies` — implementar en frontend (pantalla de lobbies disponibles)
- [ ] Anti-cheat QTE: limitar a 20 CPS máximo (actualmente no hay límite)
- [ ] Reconexión automática de WebSocket en cliente si se cae la conexión

---

## ✨ Polish / Mejoras Futuras

- [ ] Sonidos: tomar carta, completar set, ganar QTE, verificación correcta/incorrecta
- [ ] Animación de carta al hacer swap (slide desde set al centro y viceversa)
- [ ] Drag & drop en lugar de click-click para intercambiar cartas
- [ ] Pantalla de resultados con animación de confetti para el 1° lugar
- [ ] Imágenes reales de prendas (reemplazar placeholders de texto + color)
- [ ] Chat básico en el lobby
- [ ] Avatar / foto de perfil guardada en `localStorage`
- [ ] Tema oscuro

---

## 📋 Estado Actual del Proyecto

| Módulo | Estado |
|---|---|
| Modelos de juego (`models.rs`) | ✅ Completo |
| Mazo de cartas (`deck.rs`) | ✅ Completo |
| Sistema de lobbies (`lobby.rs`) | ✅ Completo |
| Mensajes WebSocket (`messages.rs`) | ✅ Completo |
| Lógica WebSocket (`websocket.rs`) | ✅ Completo |
| Frontend lobby (`lobby.html`) | ✅ Completo |
| QTE sistema | ✅ Implementado, pendiente pruebas reales |
| FlipSet + auto-verificación | ✅ Implementado, pendiente pruebas reales |
| PostgreSQL / puntuación | ⏳ Diferido |
| Deployment | ⏳ Pendiente |
| Mobile responsive | ⏳ Diferido |
