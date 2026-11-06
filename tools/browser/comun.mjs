// Utilidades comunes de las pruebas con navegador (tools/browser/*.mjs).
//
//   node browser/toques.mjs [--base=local|beta|prod] [--ver]
//
// --ver abre el navegador a la vista (por defecto va sin ventana).
import { chromium } from '@playwright/test';
export { base, wait, ok, info, fin, grabacionDe, grabaciones } from '../repro/comun.mjs';
import { base, wait } from '../repro/comun.mjs';

export const ver = process.argv.includes('--ver');

export async function lanzar() {
  // Navegador en español, como el de un jugador hispano: las pruebas buscan los textos
  // en español, y sin esto el idioma saldría del sistema donde se ejecuten. Las pruebas
  // de idioma (idiomas.mjs) lo fuerzan con `localStorage['piles.lang']`.
  return chromium.launch({ headless: !ver, args: ['--lang=es-ES'] });
}

/** Una pestaña con la página del juego abierta y sus errores recogidos. */
export async function pagina(ctx) {
  const p = await ctx.newPage();
  p.errores = [];
  p.on('pageerror', e => p.errores.push(e.message));
  await p.goto(base + '/lobby.html', { waitUntil: 'networkidle' });
  return p;
}

/** Crea sala con un bot (por el menú de la mesa, con el teclado) y espera a estar en el
 *  tablero. Devuelve el código de la sala. `dificultad`: 'Fácil' | 'Normal' | 'Difícil'. */
export async function aPartida(p, nick, dificultad = null) {
  await p.fill('#nombre', nick);
  await p.locator('#nombre').blur();
  const tecla = async t => { await p.keyboard.press(t); await wait(350); };
  await tecla('ArrowRight'); await tecla('ArrowUp');          // inicio → Crear sala
  await wait(700); await tecla('ArrowUp');                    // Abrir sala
  await p.waitForFunction(() => vistaActual === 'lobbyScreen' && !!currentLobbyId, null, { timeout: 5000 });
  const codigo = await p.evaluate(() => currentLobbyId);
  if (dificultad) await p.evaluate(d => setBotDifficulty({ 'Fácil': 'easy', Normal: 'normal', 'Difícil': 'hard' }[d] ?? 'normal'), dificultad);
  await p.evaluate(() => addBot());
  await p.waitForFunction(() => jugadoresEnSala >= 2, null, { timeout: 5000 });
  await p.evaluate(() => toggleReady());
  await p.locator('#gameScreen.active').waitFor({ timeout: 15000 });
  await wait(2000);   // la entrada a la partida (el tablero cae en su sitio) dura ~1,3 s
  return codigo;
}

/** Espía lo que el cliente manda (sin pings ni notas). Después: `p.evaluate(() => __env)`. */
export async function espiarEnvios(p) {
  await p.evaluate(() => {
    window.__env = [];                       // cada llamada vacía la cuenta…
    if (ws.__espiado) return;                // …pero el espía se instala UNA vez
    const o = ws.send.bind(ws);
    ws.send = d => {
      try { const m = JSON.parse(d); if (m.type !== 'ping' && m.type !== 'client_note') __env.push(m.type); } catch { /* */ }
      return o(d);
    };
    ws.__espiado = true;
  });
}
export const envios = p => p.evaluate(() => [...__env]);
export const cuenta = async (p, tipo) => (await envios(p)).filter(t => t === tipo).length;

/** Retrasa todo lo que llega del servidor: lo que hace falta para ver duplicados que en localhost no salen. */
export async function conRetraso(p, ms) {
  await p.evaluate(ms => {
    const om = ws.onmessage;
    ws.onmessage = e => setTimeout(() => om(e), ms);
  }, ms);
}

export const mano = p => p.evaluate(() => JSON.stringify(allSets));
