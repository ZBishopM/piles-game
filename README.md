# 🎮 Piles! — Juego de Cartas Multijugador

Juego de cartas multijugador en tiempo real donde los jugadores compiten para completar 6 sets de 4 prendas idénticas. Backend en Rust (Axum + WebSockets), frontend estático (HTML/CSS/JS vanilla) servido por el mismo binario.

## 🚀 Características

- ✅ Multijugador en tiempo real (2–8 jugadores) vía WebSockets
- ✅ Quick Time Events (QTE) para resolver conflictos de intercambio
- ✅ Sistema de lobbies
- ⏳ Puntuación persistente con PostgreSQL — diferido, ver `TODO.md`

No hay base de datos en este momento: `sqlx`/Postgres están comentados en `Cargo.toml`, `docker-compose.yml` y `.env.example`, y el servidor corre sin ninguna dependencia externa.

## 📋 Requisitos previos

- **Rust** (stable) con Cargo
- Navegador web moderno
- (Docker es opcional — solo para el deploy vía `Dockerfile`, no hace falta para desarrollo local)

## 🛠️ Correr en local

El binario sirve el frontend estático desde `./client` **relativo al directorio de trabajo**, así que hay que lanzarlo desde la raíz del repo, no desde `server/`:

```bash
cd d:/2026-projects/piles-game
cargo run --manifest-path server/Cargo.toml
```

Servidor, WebSocket (`/ws`) y frontend quedan todos en `http://localhost:3000` — abre directamente `http://localhost:3000/lobby.html`. No hace falta un servidor HTTP aparte para el cliente.

(`PORT` es configurable por variable de entorno; por defecto `3000`.)

## 🎯 Endpoints

- `GET /health` — health check
- `GET /api/test-deck/:num_players` — genera un mazo de prueba
- `GET /ws` — WebSocket del juego (lobbies, intercambios, QTE, verificación)
- todo lo demás — estático, servido desde `client/`

## 📁 Estructura del proyecto

```
piles-game/
├── server/              # Backend Rust (Axum)
│   ├── src/
│   │   ├── main.rs      # Entry point, rutas, sirve client/ como estático
│   │   ├── websocket.rs # Lógica de conexión/lobby/QTE/verificación
│   │   └── game/        # Modelos, mazo, lobbies (deck.rs, models.rs, lobby.rs)
│   └── Cargo.toml
├── client/               # Frontend estático
│   ├── lobby.html        # La UI real del juego (lobby + partida)
│   ├── index.html        # Landing
│   ├── css/, js/, assets/
├── Dockerfile            # Build para deploy (VPS + Docker, ver DEPLOY.md)
├── docker-compose.yml    # Solo el contenedor de la app; el bloque Postgres está comentado
├── .env.example
└── TODO.md               # Backlog real y priorizado — léelo antes que este README
```

## 🧪 Testing

```bash
cd server
cargo test
```

Smoke test manual:
```bash
curl http://localhost:3000/health   # → OK
```

## 🐛 Troubleshooting

- **404 en `/lobby.html` o cualquier estático**: casi siempre significa que lanzaste el binario desde `server/` en vez de la raíz del repo — `ServeDir::new("client")` resuelve relativo al cwd.
- **El servidor no inicia**: verifica que el puerto 3000 esté disponible.
- **Error de compilación de Rust**: `rustup update`, luego `cargo clean && cargo build`.

## 📝 Backlog

Ver `TODO.md` — tiene el estado real del proyecto (QTE implementado pendiente de pruebas reales, mobile responsive diferido, PostgreSQL diferido, y una lista de bugs conocidos: heartbeat de WebSocket ausente, sin reconexión automática, sin límite anti-cheat en el QTE, entre otros).

## 🚢 Deploy

VPS compartido con artchat y gamesessions (agapornis), vía Docker + nginx. Ver `DEPLOY.md` para el procedimiento completo.

## 👥 Autores

- Desarrollado con Claude Code

---

🎮 ¡Diviértete jugando Piles!
