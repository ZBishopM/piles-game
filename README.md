# 🎮 Piles! — Juego de Cartas Multijugador

Juego de cartas multijugador en tiempo real donde los jugadores compiten para completar 6 sets de 4 prendas idénticas. Backend en Rust (Axum + WebSockets), frontend estático (HTML/CSS/JS vanilla) servido por el mismo binario.

## 🚀 Características

- ✅ Multijugador en tiempo real (2–8 jugadores) vía WebSockets
- ✅ Quick Time Events (QTE) para resolver conflictos de intercambio
- ✅ Sistema de lobbies
- ⏳ Puntuación persistente con PostgreSQL — diferido, ver `TODO.md`

No hay base de datos: el servidor no tiene ninguna dependencia externa y el estado vive en memoria. Los resultados que se guardan van a Session Manager.

## 📋 Requisitos previos

- **Rust** (stable) con Cargo
- **[nushell](https://www.nushell.sh/)** — la consola de este proyecto en local
- Navegador web moderno

Los bloques marcados `nu` se ejecutan en tu máquina. Los marcados `bash` se
ejecutan en el VPS, cuya consola es bash (ver `DEPLOY.md`).

## 🛠️ Correr en local

El binario sirve el frontend estático desde `./client` **relativo al directorio de trabajo**, así que hay que lanzarlo desde la raíz del repo, no desde `server/`:

```nu
cd d:/2026-projects/piles-game
cargo run --manifest-path server/Cargo.toml
```

Servidor, WebSocket (`/ws`) y frontend quedan todos en `http://localhost:3000` — abre directamente `http://localhost:3000/lobby.html`. No hace falta un servidor HTTP aparte para el cliente.

(`PORT` es configurable por variable de entorno; por defecto `3000`.)

## 🎯 Endpoints

- `GET /health` — health check
- `GET /api/qr/:lobby_code` — SVG con el QR de invitación de la sala
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
├── client/                     # Frontend estático (lo sirve el propio binario)
│   ├── lobby.html              # TODA la UI: menú, sala y partida, en un fichero
│   ├── index.html              # Redirección a /lobby.html
│   ├── cards.webp              # Hoja de sprites: 50 prendas × 4 colores + reverso
│   └── qr-scanner*.min.js      # qr-scanner 1.4.2 (nimiq, MIT), vendorizado
├── .env.example
├── DEPLOY.md                   # Entornos (producción/beta) y cómo desplegar
└── TODO.md                     # Backlog real y priorizado — léelo antes que este README
```

## 🧪 Testing

```nu
cd server
cargo test
```

Smoke test manual:
```nu
http get http://localhost:3000/health   # → OK
```

## 🐛 Troubleshooting

- **404 en `/lobby.html` o cualquier estático**: casi siempre significa que lanzaste el binario desde `server/` en vez de la raíz del repo — `ServeDir::new("client")` resuelve relativo al cwd.
- **El servidor no inicia**: verifica que el puerto 3000 esté disponible.
- **Error de compilación de Rust**: `rustup update`, luego `cargo clean` y `cargo build`. En nu cada línea corre solo si la anterior fue bien, así que basta con ponerlas seguidas.

## 📝 Backlog

Ver `TODO.md` — tiene el estado real: qué falta probar con jugadores de verdad, qué mecánicas están a medias y qué bugs se conocen (reconexión aún manual, sin anti-cheat en las peleas, tablero sin adaptar a móvil).

## 🚢 Deploy

VPS compartido con artchat y gamesessions (agapornis), con pm2 + nginx.
Este proyecto no usa Docker.

Hay **dos entornos aislados**, con procesos, puertos y checkouts distintos:

| | dominio | rama | puerto |
|---|---|---|---|
| producción | `piles.danassistantassistant.website` | `master` | 3000 |
| beta | `beta.piles.danassistantassistant.website` | `beta` | 3010 |

Los cambios van **siempre a beta primero**; solo se promueven a `master` una
vez probados ahí. La beta no se conecta con Session Manager: no hace falta
cuenta y las partidas de prueba no cuentan en perfiles reales.

Procedimiento completo, y las dos reglas de la máquina (compilar con `nice`
y `-j 1` porque no hay swap; `sudo` pide contraseña) en `DEPLOY.md`.

## 👥 Autores

- Desarrollado con Claude Code

---

🎮 ¡Diviértete jugando Piles!
