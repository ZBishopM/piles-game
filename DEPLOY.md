# Guía de Deployment — Piles!

> Lo de aquí arriba es **el despliegue real**. Las "Opción A / Opción B" de
> más abajo son alternativas para montarlo en otro sitio desde cero; describen
> Caddy y Docker, que **no** es lo que corre hoy.

**Dos consolas, dos máquinas.** Los bloques marcados `nu` se ejecutan en tu
máquina, cuya consola es [nushell](https://www.nushell.sh/). Los marcados
`bash` se ejecutan dentro del VPS, cuya consola es bash — allí no hay nu.
Cada bloque dice en cuál de las dos va.

## Cómo está montado ahora

Dos entornos aislados en el mismo VPS (`agapornis`, 167.233.88.83, usuario
`bicho`), sin Docker: pm2 lanza el binario directamente y nginx hace de
proxy.

| | producción | beta |
|---|---|---|
| dominio | `piles.danassistantassistant.website` | `beta.piles.danassistantassistant.website` |
| rama | `master` | `beta` |
| checkout | `/var/www/piles-game` | `/home/bicho/piles-beta` |
| proceso pm2 | `piles-game`, puerto 3000 | `piles-beta`, puerto 3010 |
| Session Manager | reclama resultados | **no lo toca nunca** |

Cada entorno tiene su propio proceso, su propio checkout y su propia memoria:
los lobbies **no** se comparten, y romper la beta no puede afectar a quien
esté jugando en producción.

**Modo beta**: el cliente lo detecta por el hostname (prefijo `beta.`). Quita
el botón de perfil, no reclama resultados en Session Manager — los testers no
necesitan cuenta y sus partidas no ensucian perfiles reales — y muestra una
insignia BETA para que ningún reporte de bug sea ambiguo. No hay flag de
build ni fichero de configuración aparte.

**nginx**: en beta se hace proxy de *todo* (incluidos los estáticos) al
puerto 3010, porque el binario ya sirve `client/` con su propio `ServeDir`.
Producción, en cambio, sirve los estáticos desde disco y solo hace proxy de
`/ws` y `/api/`. Ojo: `ServeDir::new("client")` es **relativo al CWD**, así
que el proceso pm2 tiene que arrancar con `cwd` en la raíz del checkout.

## Flujo de trabajo: beta primero, luego producción

Los cambios van **siempre a beta antes que a producción**, por pequeños que
parezcan. La beta existe justo para eso, y ya se ganó el sueldo: el fallo de
la hoja de sprites (tablero en blanco los primeros segundos) se detectó ahí
antes de que lo viera ningún jugador. Además reiniciar producción corta las
partidas en curso, así que cada despliegue evitable cuesta partidas reales.

**1. Desarrollar sobre la rama beta** — en tu máquina:

```nu
git checkout beta
git commit -am "..."
git push origin beta
```

**2. Desplegar en beta** — lo hace el CI solo al hacer push a `beta` (ver
[CI y deploy](#ci-y-deploy)). A mano, dentro del VPS, tras `ssh bicho@167.233.88.83`:

```bash
cd ~/piles-beta && git pull --ff-only
# solo si cambió algo de server/:
cd server && nice -n 19 ~/.cargo/bin/cargo build --release -j 1
pm2 restart piles-beta
# si solo cambió client/, no hace falta ni compilar ni reiniciar
```

**3. Probar** en https://beta.piles.danassistantassistant.website

**4. Promover a producción** — con `.github/workflows/promote.yml`, que pide
aprobación:

- GitHub: Actions → **Promote to production** → Run workflow (sobre `master`;
  `sha` vacío = HEAD de beta) → cuando pida revisión, **Approve and deploy**
  (también desde la app de GitHub en el móvil).
- O desde la terminal: `gh workflow run promote.yml -R ZBishopM/piles-game`
  (opcional `-f sha=<commit>`). Queda esperando la aprobación en GitHub.

Promueve el **mismo binario** que el CI compiló para ese commit en beta; no se
compila nada nuevo. Espera hasta 10 min si hay partidas en curso en :3000.
Si `/health` no responde tras reiniciar, **vuelve solo** al commit y al binario
anteriores. Si sale bien, mueve `master` a ese commit: **`master` = lo que hay
en producción**, no se empuja a mano.

Volver a una versión anterior: relanzar el workflow con el `sha` anterior
(tiene que ser ancestro de beta; el binario se conserva 90 días).

**Emergencia (sin GitHub)**, dentro del VPS. Primero comprobar que no hay
nadie jugando:

```bash
ss -tn state established '( sport = :3000 )'
cd /var/www/piles-game && git pull --ff-only
cd server && nice -n 19 ~/.cargo/bin/cargo build --release -j 1
pm2 restart piles-game
```

### Dos cosas que hay que respetar

**Compilar con `nice -n 19 ... -j 1`.** La máquina tiene 2 núcleos, 3,7 GB y
**sin swap**, y encima comparte sitio con el correo (Stalwart), Postgres, n8n
y gamesessions. Una compilación sin limitar puede disparar el OOM killer
sobre algo que importa.

**`sudo` pide contraseña.** Cualquier cosa de nginx, certbot o `/var/www` la
tiene que ejecutar una persona; no se puede automatizar desde aquí.

### CI y deploy

`.github/workflows/ci.yml`:

- Cada push a `beta`/`master` y cada PR: job `build` → `cargo test --locked` → `cargo build --release --locked` (en `server/`, Ubuntu 24.04; el VPS tiene glibc 2.43, compatible) → sube el binario como artifact `piles-server` (90 días).
- Push a `beta` en verde: job `deploy-beta` (environment `beta`) baja el artifact → `scp` a `~/piles-beta/server/target/release/piles-server.new` → `git merge --ff-only <sha>` → `chmod 755` (el artifact pierde el bit de ejecución) → `mv` → `pm2 restart piles-beta` → `curl /health` en 3010. En el VPS no se compila nada.
- Producción: solo con `promote.yml` (paso 4). Environment `production` en Settings → Environments: revisor obligatorio ZBishopM, solo desde la rama `master`.
- Configuración en GitHub (Settings → Secrets and variables → Actions):
  - variable `DEPLOY_HOST` = `167.233.88.83`
  - secret `SSH_KEY` = clave privada cuya pública está en `~/.ssh/authorized_keys` de `bicho`
  - sin `DEPLOY_HOST`, el deploy se salta.
- Relanzar: Actions → CI → Run workflow (sobre `beta`). `workflow_dispatch` no despliega; para eso, push.
- Revertir beta: `git revert <commit>` + push a `beta`.
- Fuera del CI: `cargo fmt --check` y `cargo clippy -D warnings` (hoy no pasan).

### Levantar otro entorno desde cero

```bash
git clone --branch beta https://github.com/ZBishopM/piles-game.git ~/piles-beta
cd ~/piles-beta/server && nice -n 19 ~/.cargo/bin/cargo build --release -j 1
cd ~/piles-beta && PORT=3010 pm2 start ./server/target/release/piles-server \
    --name piles-beta --cwd /home/bicho/piles-beta
pm2 save
```

Después, con el registro DNS ya apuntando al VPS (y como `sudo` pide
contraseña, esto lo hace una persona):

```bash
sudo cp ~/piles-beta-nginx.conf /etc/nginx/sites-available/piles-beta
sudo ln -s /etc/nginx/sites-available/piles-beta /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d beta.piles.danassistantassistant.website
```

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
```nu
# Desde tu máquina
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

## Montarlo en otro VPS desde cero

El despliegue real está descrito arriba. Si hace falta levantarlo en otra
máquina, el resumen es:

1. Ubuntu/Debian con Rust instalado (`rustup`) y nginx.
2. `git clone` del repo, `cargo build --release` dentro de `server/`.
3. Lanzar el binario con `pm2`, con el `cwd` en la raíz del checkout — el
   servidor sirve `client/` con `ServeDir` y esa ruta es relativa al CWD.
4. nginx como proxy al puerto elegido, con los headers de `Upgrade` para el
   WebSocket (ver el bloque de troubleshooting más abajo).
5. `certbot --nginx -d <dominio>` para el HTTPS.

El `PORT` se pasa por entorno (`PORT=3010 pm2 start ...`); por defecto 3000.

> Este proyecto **no usa Docker**. Hubo un `Dockerfile` y un
> `docker-compose.yml`, pero ningún entorno los usaba y se eliminaron para
> que nadie los siga creyendo la vía de despliegue.

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
# Logs en vivo
pm2 logs piles-game        # producción
pm2 logs piles-beta        # beta

# Estado y consumo
pm2 list
pm2 jlist | jq '.[] | select(.name|test("piles")) | {name, status: .pm2_env.status}'

# Reiniciar
pm2 restart piles-game

# Comprobar que responde
curl -s -o /dev/null -w '%{http_code}
' https://piles.danassistantassistant.website/health

# Ver si hay alguien jugando antes de reiniciar
ss -tn state established '( sport = :3000 )'
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

**Error al compilar en el VPS (poca RAM)**
- Rust puede consumir hasta 1,5 GB compilando. En `agapornis` esto se resuelve
  con `nice -n 19 … -j 1`, como dice el flujo de arriba — **no añadas swap**:
  la máquina no tiene y es compartida, así que tocar eso afecta al correo y a
  los demás servicios.
- Si aun así no compila, compila en tu máquina y sube solo el binario (ver
  justo debajo).

**Compilar en Windows y subir solo el binario al VPS Linux**
```nu
# En tu máquina (cross-compile para Linux)
rustup target add x86_64-unknown-linux-gnu
cargo build --release --target x86_64-unknown-linux-gnu

# Subir binario + client/ al VPS
scp server/target/x86_64-unknown-linux-gnu/release/piles-server root@<IP>:/opt/piles-game/
scp -r client/ root@<IP>:/opt/piles-game/
```

Y ya dentro del VPS:

```bash
cd /opt/piles-game && ./piles-server
```
