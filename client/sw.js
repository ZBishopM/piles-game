// Service worker de Piles!. Existe para que sea instalable y para que la
// aplicación abra aunque falle la red un momento; NO cachea nada de la partida.
//
// Red primero, caché de respaldo: el servidor manda `no-cache` a propósito
// (tras un despliegue hay que jugar con lo nuevo), así que con red siempre
// se usa lo último y la caché solo entra cuando no hay red. Por eso la caché
// no necesita versión: cada carga con red la renueva.
// El WebSocket (/ws) no pasa por aquí, y /api/ tampoco: son datos vivos.
const CACHE = 'piles';
const BASE = ['/lobby.html', '/cards.webp', '/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)));
  self.skipWaiting();
});

self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
