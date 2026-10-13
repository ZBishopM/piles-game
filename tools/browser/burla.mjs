// «Mi burla» del perfil y su sonido al llegar tarde a una carta.
//
//   node browser/burla.mjs [--base=local|beta] [--ver]
//
// No se oye el audio: se espía que el AudioContext se crea y que la síntesis
// arranca osciladores. Comprueba: el perfil guarda la elección en
// `localStorage.piles.taunt` y la recuerda al recargar, ▶ sintetiza sin errores
// (y con silencio activado dice «Silencio activado» y no suena), el valor viaja
// en `create_lobby`, y un `swap_failed` con `taunt` suena + avisa con el apodo
// (como texto), una segunda en <2 s no suena, un id desconocido no hace nada.
// Capturas del perfil a 390x700 y 1280x800 en $CAPTURAS (o la carpeta temporal).
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { lanzar, pagina, ok, info, fin, wait } from './comun.mjs';

const capturas = process.env.CAPTURAS || path.join(os.tmpdir(), 'piles-burla');
fs.mkdirSync(capturas, { recursive: true });

const espia = () => {
  window.__sent = [];
  window.__ctx = 0;
  window.__osc = 0;
  const S = WebSocket.prototype.send;
  WebSocket.prototype.send = function (d) {
    try { window.__sent.push(JSON.parse(d)); } catch { /* */ }
    return S.call(this, d);
  };
  const AC = window.AudioContext;
  window.AudioContext = class extends AC {
    constructor(...a) { super(...a); window.__ctx++; }
    createOscillator() { window.__osc++; return super.createOscillator(); }
  };
};

const browser = await lanzar();
const osc = p => p.evaluate(() => window.__osc);

async function sesion(ancho, alto, nombre) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 2 });
  await ctx.addInitScript(espia);
  const p = await pagina(ctx);
  await p.getByRole('button', { name: 'Perfil' }).or(p.locator('.profile-btn')).first().click();
  await p.locator('#profileScreen.active').waitFor();
  const desborde = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  ok(!desborde, `${nombre}: sin desborde horizontal`);
  await p.screenshot({ path: path.join(capturas, `perfil-${ancho}.png`) });
  const sec = p.locator('#tauntList');
  await sec.scrollIntoViewIfNeeded();
  await p.screenshot({ path: path.join(capturas, `perfil-${ancho}-burla.png`) });
  return { ctx, p };
}

// ── Móvil: elegir, recordar, ▶, silencio ───────────────────────────────────
{
  const { ctx, p } = await sesion(390, 700, 'móvil');
  const radios = await p.locator('#tauntList input[type=radio]').count();
  ok(radios === 11, `Ninguna + 10 burlas (${radios})`);
  ok(await p.locator('#tauntList input[value=""]').isChecked(), 'por defecto: Ninguna');

  await p.getByRole('radio', { name: 'Honk de payaso' }).check();
  ok(await p.evaluate(() => localStorage.getItem('piles.taunt')) === 'honk', 'la elección se guarda en piles.taunt');
  ok((await p.locator('#tauntStatus').textContent()).includes('Honk de payaso'), 'avisa de la elección');

  await p.reload({ waitUntil: 'networkidle' });
  await p.locator('.profile-btn').click();
  ok(await p.getByRole('radio', { name: 'Honk de payaso' }).isChecked(), 'al recargar sigue elegida');

  // ▶ de cada una: sin errores y con osciladores nuevos.
  const botones = p.locator('.taunt-play');
  ok(await botones.count() === 10, 'un ▶ por burla');
  let todas = true;
  for (let i = 0; i < 10; i++) {
    const antes = await osc(p);
    await botones.nth(i).click();
    if (await osc(p) <= antes) { todas = false; info(`la burla ${i} no sintetizó nada`); }
  }
  ok(todas, 'cada ▶ sintetiza');
  ok(await p.evaluate(() => window.__ctx) >= 1, 'se creó el AudioContext');
  const est = await p.evaluate(() => audioCtx?.state);
  ok(est === 'running', `el AudioContext está en marcha (${est})`);
  ok(p.errores.length === 0, `sin errores de página (${p.errores.join(' | ')})`);

  // Silencio activado.
  await p.evaluate(() => { sfxMuted = true; });
  const antes = await osc(p);
  await botones.first().click();
  ok(await osc(p) === antes, 'en silencio no suena');
  ok((await p.locator('#tauntStatus').textContent()) === 'Silencio activado', 'dice «Silencio activado»');
  await p.evaluate(() => { sfxMuted = false; });

  // El valor viaja en el primer mensaje al servidor.
  await p.getByRole('button', { name: 'Atrás' }).click();
  await p.getByPlaceholder(/Jugador1/).fill('Burlon');
  await p.getByRole('button', { name: /Crear sala/ }).click();
  await p.getByRole('button', { name: /Empezar/ }).click();
  await p.locator('#lobbyScreen.active').waitFor({ timeout: 5000 });
  const cl = await p.evaluate(() => window.__sent.find(m => m.type === 'create_lobby'));
  ok(cl?.taunt === 'honk', `create_lobby lleva taunt (${JSON.stringify(cl)})`);

  // Llega un swap_failed con burla.
  const f = (extra = {}) => p.evaluate(m => onSwapFailed({ kind: 'gone', reason: 'Esa carta ya no está', ...m }), extra);
  await p.evaluate(() => { tauntLastAt = -Infinity; });
  let o0 = await osc(p);
  await f({ taunt: 'honk', by: '<i>Ana</i>' });
  ok(await osc(p) > o0, 'swap_failed con taunt sintetiza');
  const toast = await p.locator('.ag-toast').last().textContent();
  ok(toast.includes('<i>Ana</i> te la quitó'), `aviso con el apodo como texto (${toast})`);
  ok(await p.locator('.ag-toast i').count() === 0, 'el apodo no se interpreta como HTML');
  o0 = await osc(p);
  const toasts = () => p.locator('.ag-toast').count();
  const t0 = await toasts();
  await f({ taunt: 'honk', by: 'Ana' });
  ok(await osc(p) === o0, 'una segunda en <2 s no suena');
  ok(await toasts() === t0, 'ni avisa (sin sonido, sin burla visible)');
  await p.evaluate(() => { tauntLastAt = -Infinity; sfxMuted = true; });
  await f({ taunt: 'honk', by: 'Ana' });
  ok(await osc(p) === o0 && await toasts() === t0, 'en silencio ni suena ni avisa');
  await p.evaluate(() => { sfxMuted = false; });
  await p.evaluate(() => { tauntLastAt = -Infinity; });
  o0 = await osc(p);
  await f({ taunt: 'inventada', by: 'Ana' });
  await f({});
  ok(await osc(p) === o0, 'id desconocido o sin taunt: nada');
  // En pelea o aturdido no suena.
  await p.evaluate(() => { qtePlayers = [currentNickname]; });
  await f({ taunt: 'honk', by: 'Ana' });
  ok(await osc(p) === o0, 'en pelea no suena');
  ok(p.errores.length === 0, `sin errores de página (${p.errores.join(' | ')})`);
  await ctx.close();
}

// ── Escritorio ──────────────────────────────────────────────────────────────
{
  const { ctx, p } = await sesion(1280, 800, 'escritorio');
  // El primer mensaje con la burla guardada, entrando por quick_match.
  await p.evaluate(() => localStorage.setItem('piles.taunt', 'pato'));
  await p.reload({ waitUntil: 'networkidle' });
  await p.getByPlaceholder(/Jugador1/).fill('Burlon2');
  await p.getByRole('button', { name: /Partida rápida|rápida/i }).first().click().catch(() => info('no hay botón de partida rápida visible'));
  await wait(800);
  const q = await p.evaluate(() => window.__sent.find(m => m.type === 'quick_match'));
  if (q) ok(q.taunt === 'pato', `quick_match lleva taunt (${JSON.stringify(q)})`);
  ok(p.errores.length === 0, `sin errores de página (${p.errores.join(' | ')})`);
  await ctx.close();
}

info(`capturas en ${capturas}`);
await browser.close();
fin();
