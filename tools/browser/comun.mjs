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
  return chromium.launch({ headless: !ver });
}

/** Una pestaña con la página del juego abierta y sus errores recogidos. */
export async function pagina(ctx) {
  const p = await ctx.newPage();
  p.errores = [];
  p.on('pageerror', e => p.errores.push(e.message));
  await p.goto(base + '/lobby.html', { waitUntil: 'networkidle' });
  return p;
}

/** Crea sala con un bot y espera a estar en el tablero. Devuelve el código de la sala. */
export async function aPartida(p, nick, dificultad = null) {
  await p.getByPlaceholder(/Jugador1/).fill(nick);
  await p.getByRole('button', { name: /Crear sala/ }).click();
  await p.getByRole('button', { name: /Empezar/ }).click();
  await p.locator('#lobbyScreen.active').waitFor({ timeout: 5000 });
  const codigo = (await p.locator('#lobbyCodeDisplay').textContent()).trim();
  if (dificultad) await p.getByRole('button', { name: dificultad, exact: true }).click();
  await p.getByRole('button', { name: /Añadir bot/ }).click();
  await wait(500);
  await p.getByRole('button', { name: /Marcar como Listo/ }).click();
  await p.locator('#gameScreen.active').waitFor({ timeout: 10000 });
  await wait(800);
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
