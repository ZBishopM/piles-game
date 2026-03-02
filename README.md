# 🎮 Piles! - Juego de Cartas Multijugador

Juego de cartas multijugador en tiempo real donde los jugadores compiten para completar 6 sets de 4 prendas idénticas.

## 🚀 Características

- ✅ Multijugador en tiempo real (2-8 jugadores)
- ✅ WebSockets para comunicación instantánea
- ✅ Quick Time Events (QTE) para resolver conflictos
- ✅ Sistema de lobbies
- ✅ Puntuación persistente con PostgreSQL
- ✅ Responsive design (PC y móvil)

## 📋 Requisitos Previos

- **Rust** 1.70+ con Cargo
- **Docker** y **Docker Compose** (para PostgreSQL)
- Navegador web moderno

## 🛠️ Instalación

### 1. Clonar el repositorio

```bash
cd d:/2026-projects/piles-game
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` si necesitas cambiar la configuración de la base de datos.

### 3. Iniciar PostgreSQL con Docker

```bash
docker-compose up -d
```

Verifica que PostgreSQL esté corriendo:
```bash
docker-compose ps
```

### 4. Compilar y ejecutar el servidor

```bash
cd server
cargo build --release
cargo run --release
```

El servidor estará disponible en `http://localhost:3000`

### 5. Abrir el cliente

Abre `client/index.html` en tu navegador web, o usa un servidor HTTP local:

```bash
cd client
python -m http.server 8000
```

Luego abre `http://localhost:8000` en tu navegador.

## 🎯 Endpoints Disponibles (Fase 1)

### Backend
- `GET /` - Información del servidor
- `GET /health` - Health check

## 📁 Estructura del Proyecto

```
piles-game/
├── server/              # Backend Rust
│   ├── src/
│   │   └── main.rs     # Entry point
│   ├── migrations/     # SQL migrations
│   └── Cargo.toml      # Dependencias
├── client/              # Frontend
│   ├── css/            # Estilos
│   ├── js/             # JavaScript
│   ├── assets/         # Recursos (imágenes, etc.)
│   └── index.html      # Página principal
├── docker-compose.yml   # PostgreSQL
├── .env.example        # Variables de entorno
└── README.md           # Este archivo
```

## 🧪 Testing

### Probar el servidor

1. Verifica que el servidor está corriendo:
   ```bash
   curl http://localhost:3000
   ```

   Deberías ver:
   ```
   🎮 Piles! Game Server

   Backend en funcionamiento.

   Endpoints disponibles:
   - GET / (este mensaje)
   - GET /health (health check)
   ```

2. Verifica el health check:
   ```bash
   curl http://localhost:3000/health
   ```

   Deberías ver: `OK`

### Probar PostgreSQL

```bash
docker exec -it piles-postgres psql -U piles_user -d piles_db -c "\dt"
```

## 🐛 Troubleshooting

### El servidor no inicia
- Verifica que el puerto 3000 esté disponible
- Revisa los logs con `docker-compose logs -f`

### PostgreSQL no se conecta
- Asegúrate de que Docker está corriendo
- Verifica que el puerto 5432 esté disponible
- Revisa la configuración en `.env`

### Error de compilación de Rust
- Actualiza Rust: `rustup update`
- Limpia el build: `cargo clean && cargo build`

## 📝 Próximos Pasos

- [ ] Implementar base de datos y modelos (Fase 2)
- [ ] Sistema de lobbies (Fase 3)
- [ ] Lógica del mazo de cartas (Fase 4)
- [ ] WebSocket y comunicación (Fase 5)
- [ ] Frontend básico (Fases 7-9)

## 🤝 Contribuir

Este proyecto está diseñado para ser fácil de mantener y colaborar:
1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

MIT License - siéntete libre de usar este proyecto

## 👥 Autores

- Desarrollado con Claude Code

---

🎮 ¡Diviértete jugando Piles!
