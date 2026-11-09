// Entrada del cliente: esbuild junta desde aquí client/dist/piles.js (ver tools/package.json).
// El orden de los import es el de ejecución al cargar: bus y estado primero
// (no importan nada), luego el juego, y al final la mesa y la partida, que
// escuchan al juego por el bus.
import '../gestos.js';   // antes que nada: los botones se vuelven deslizables según aparecen
import * as bus from './bus.js';
import * as estado from './estado.js';
import * as red from './red.js';
import * as sala from './sala.js';
import * as espectador from './espectador.js';
import * as tablero from './tablero.js';
import * as sonido from './sonido.js';
import * as burlas from './burlas.js';
import * as musica from './musica.js';
import * as toques from './toques.js';
import * as pelea from './pelea.js';
import * as verificacion from './verificacion.js';
import * as cuenta from './cuenta.js';
import * as medidor from './medidor.js';   // FPS y ping secretos: º / tres dedos
import '../mesa/mesa.js';
import '../partida/partida.js';

// Los botones de lobby.html: data-accion="nombre" llama a esa función, sin argumentos.
const acciones: Record<string, () => void> = {
    toggleMute: musica.toggleMute,
    fireFrenzy: tablero.fireFrenzy,
    flipCurrentSet: () => toques.flipCurrentSet(),
    closeVerifyOverlay: verificacion.closeVerifyOverlay,
    returnToLobby: cuenta.returnToLobby,
    reconnect: red.reconnect,
    recargar: () => location.reload(),
};
for (const b of document.querySelectorAll<HTMLElement>('[data-accion]')) {
    b.addEventListener('click', () => acciones[b.dataset.accion!]());
}

// Para las pruebas (tools/browser) y la consola: juego.handleMsg(...), juego.est.centerCards…
const modulos: Record<string | symbol, unknown>[] = [bus, estado, red, sala, espectador, tablero, sonido, burlas, musica, toques, pelea, verificacion, cuenta, medidor];
window.juego = new Proxy({}, {
    get: (_, k) => modulos.find(m => k in m)?.[k],
    has: (_, k) => modulos.some(m => k in m),
});
