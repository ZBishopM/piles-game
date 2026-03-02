# Guía de Deployment — Piles!

Tres opciones según tu situación. Elige la que más te convenga:

| Opción | Ideal para | Pros | Contras |
|---|---|---|---|
| **A. Arch Linux** | Probar con un amigo rápido | Sin costo, rápido, sin cuenta | Tu laptop debe estar encendida |
| **B. VPS** | MVP estable y accesible | Siempre disponible, HTTPS gratis | Costo (~$4-6/mes en DigitalOcean/Hetzner) |
| **C. Fly.io** | Hosting gratuito en nube | Gratis, HTTPS automático | Más pasos iniciales |

---

## Opción A — Laptop con Arch Linux + túnel cloudflared

La forma más rápida de probar con un amigo. Tu laptop actúa de servidor y cloudflared da una URL pública.

### 1. Instalar Rust (si no lo tienes)

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
```

### 2. Clonar/copiar el proyecto en la laptop

Si usas git:
```bash
git clone <tu-repo> ~/piles-game
cd ~/piles-game
```

O copia la carpeta manualmente con `scp` desde Windows:
```bash
# Desde Windows (PowerShell)
scp -r D:\2026-projects\piles-game usuario@ip-arch:~/piles-game
```

### 3. Compilar el servidor

```bash
cd ~/piles-game/server
cargo build --release
```

La primera vez tarda ~3-5 minutos. El binario queda en `target/release/piles-server`.

### 4. Lanzar el servidor

El binario necesita la carpeta `client/` al lado para servir el frontend:

```bash
cd ~/piles-game
./server/target/release/piles-server
```

Deberías ver:
```
🎮 Piles! Server iniciado en http://0.0.0.0:3000
🌐 Frontend disponible en http://0.0.0.0:3000/lobby.html
```

Prueba local: abre `http://localhost:3000/lobby.html` en el navegador.

### 5. Instalar cloudflared para el túnel público

```bash
# Arch Linux
yay -S cloudflared
# o con pacman si está en el repo oficial
pacman -S cloudflared
```

### 6. Crear el túnel (sin cuenta, gratis temporal)

```bash
cloudflared tunnel --url http://localhost:3000
```

cloudflared imprime algo como:
```
Your quick Tunnel has been created! Visit it at:
https://piles-abc123.trycloudflare.com
```

Esa URL es la que le mandas a tu amigo. Accede a:
- `https://piles-abc123.trycloudflare.com/lobby.html`

> **Nota**: El túnel gratis cambia de URL cada vez que lo reinicias. Para una URL permanente necesitas cuenta gratuita en cloudflare.com.

### 7. Mantenerlo corriendo (opcional con tmux)

```bash
# En un tmux para que siga corriendo si cierras el terminal
tmux new -s piles
# dentro del tmux:
cd ~/piles-game && ./server/target/release/piles-server

# Ctrl+B, D para desacoplar
# Para volver: tmux attach -t piles
```

---

## Opción B — VPS (DigitalOcean, Hetzner, Vultr, etc.)

Para tener el juego siempre disponible con tu propio dominio y HTTPS.

**Costo estimado**: Hetzner CAX11 (~€3.29/mes), DigitalOcean Droplet 1GB (~$4/mes).

### 1. Crear el servidor

Elige Ubuntu 22.04 o Debian 12 en tu proveedor. Anota la IP pública.

### 2. Conectarse por SSH

```bash
ssh root@<IP_DEL_VPS>
```

### 3. Instalar Docker en el VPS

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
```

### 4. Subir el proyecto al VPS

**Opción A — git (recomendada)**:
```bash
# En el VPS
git clone <tu-repo> /opt/piles-game
cd /opt/piles-game
```

**Opción B — scp desde tu máquina**:
```bash
# Desde tu Windows/Linux local (excluye la carpeta target/ enorme)
rsync -avz --exclude='server/target' D:/2026-projects/piles-game/ root@<IP>:/opt/piles-game/
```

### 5. Construir y levantar con Docker

```bash
cd /opt/piles-game
docker compose up -d --build
```

La primera build tarda unos minutos. Después:
```bash
docker compose logs -f app   # ver logs en vivo
docker compose ps            # ver estado
```

Prueba: `curl http://localhost:3000/health` → debería responder `OK`

### 6. Instalar Caddy para HTTPS automático

Caddy obtiene certificados SSL de Let's Encrypt automáticamente.

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install caddy
```

### 7. Configurar Caddy

Necesitas un dominio apuntando a la IP del VPS. Si no tienes dominio, usa uno gratuito en [freedns.afraid.org](https://freedns.afraid.org) o [duckdns.org](https://duckdns.org).

```bash
nano /etc/caddy/Caddyfile
```

Contenido del Caddyfile:
```
tu-dominio.com {
    reverse_proxy localhost:3000
}
```

```bash
systemctl reload caddy
```

Caddy obtiene el certificado automáticamente. Accede a `https://tu-dominio.com/lobby.html`.

### 8. Configurar auto-restart del contenedor

El `restart: unless-stopped` en docker-compose ya lo hace. Para que Docker arranque al boot:

```bash
systemctl enable docker
```

### 9. Actualizar el juego cuando hagas cambios

```bash
cd /opt/piles-game
git pull                          # si usas git
docker compose up -d --build      # reconstruye y reinicia
```

---

## Opción C — Fly.io (hosting gratuito en nube)

Fly.io tiene un free tier que incluye una máquina pequeña (256MB RAM). Suficiente para el MVP.

### 1. Crear cuenta en fly.io

Ve a [fly.io](https://fly.io) y crea una cuenta (requiere tarjeta de crédito para verificación, pero no cobra por el free tier).

### 2. Instalar flyctl

```bash
# Linux/Arch
curl -L https://fly.io/install.sh | sh
# Agregar al PATH:
export PATH="$HOME/.fly/bin:$PATH"
echo 'export PATH="$HOME/.fly/bin:$PATH"' >> ~/.bashrc
```

```bash
fly auth login
```

### 3. Crear el archivo fly.toml en la raíz del proyecto

Crea `piles-game/fly.toml`:

```toml
app = "piles-game"          # cámbialo si ese nombre ya existe
primary_region = "mia"      # Miami (más cercano a Latinoamérica)

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true    # apaga cuando no hay tráfico (ahorra free tier)
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  memory = "256mb"
  cpu_kind = "shared"
  cpus = 1
```

### 4. Desplegar

```bash
cd D:\2026-projects\piles-game   # o donde tengas el proyecto
fly launch --no-deploy           # configura la app sin hacer deploy aún
fly deploy                       # construye y despliega
```

La primera vez construye la imagen Docker en sus servidores (~5 minutos).

### 5. Ver la app

```bash
fly status          # ver estado
fly logs            # ver logs en vivo
fly open            # abrir en el navegador
```

La URL será `https://piles-game.fly.dev/lobby.html`.

### 6. Actualizar cuando hagas cambios

```bash
fly deploy   # rebuilds y redeploy automático
```

> **Limitación del free tier**: Las máquinas se apagan tras inactividad y tardan ~1-2 segundos en despertar. Para el MVP está bien; si molesta, usa `min_machines_running = 1` (puede salir del free tier).

---

## Verificar que todo funciona

Independientemente de la opción elegida, prueba esto en el navegador:

1. `https://tu-url/lobby.html` → debe cargar la interfaz
2. En la consola del navegador: debe aparecer `✅ Conectado al servidor`
3. Crea un lobby → te debe dar un código
4. Tu amigo abre la misma URL, ingresa el código → debe unirse

---

## Comandos útiles post-deployment

```bash
# Ver logs del servidor (Docker)
docker compose logs -f app

# Reiniciar el servidor
docker compose restart app

# Detener todo
docker compose down

# Ver uso de recursos
docker stats piles-app
```

---

## Troubleshooting frecuente

**"Error de conexión" en el frontend**
- Verifica que el servidor esté corriendo: `curl http://localhost:3000/health`
- Verifica que el puerto 3000 esté abierto en el firewall del VPS: `ufw allow 3000`

**WebSocket no conecta con HTTPS/WSS**
- Si usas Caddy o un reverse proxy, verifica que el proxy pase el header `Upgrade`. Caddy lo hace automáticamente. Con nginx añade:
  ```nginx
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  ```

**El servidor se apaga en Fly.io entre pruebas**
- Normal con `auto_stop_machines = true`. El primer jugador que entra tarda 1-2 segundos en despertar la máquina. Para la sesión de pruebas puedes poner `min_machines_running = 1` temporalmente.

**Error al compilar en el VPS (poca RAM)**
- Rust puede consumir hasta 1.5GB compilando. Si el VPS tiene solo 1GB, añade swap:
  ```bash
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  ```
  O compila en tu máquina local y sube solo el binario (ver sección "compilar localmente").

**Compilar en Windows y subir solo el binario al VPS Linux**
```bash
# En Windows (cross-compile para Linux)
rustup target add x86_64-unknown-linux-gnu
cargo build --release --target x86_64-unknown-linux-gnu

# Subir binario + client/ al VPS
scp server/target/x86_64-unknown-linux-gnu/release/piles-server root@<IP>:/opt/piles-game/
scp -r client/ root@<IP>:/opt/piles-game/
# Ejecutar en el VPS:
# cd /opt/piles-game && ./piles-server
```
