// El título animado de la pantalla de inicio (.piles-titulo en client/lobby.html).
//
//   node browser/titulo.mjs [--base=local|beta] [--ver]
//
// Abre el lobby de verdad y comprueba: sin errores de JS; anima; en algún momento hay
// 4 cartas visibles de la misma prenda en 4 colores distintos (el set), en dos manos
// seguidas; al salir de la pantalla de inicio o ocultar la pestaña se pausa todo (ni una
// animación en marcha ni avance del reloj) y al volver sigue; el formulario cabe en 390x700
// sin desbordar; y con movimiento reducido queda la palabra «Piles!» quieta.
// Con CAPTURAS=<carpeta> guarda fotos (inicio, set completo, palabra final) a 390x700 y 1280x800.
import { lanzar, base, wait, ok, info, fin } from './comun.mjs';

const salida = process.env.CAPTURAS;
const browser = await lanzar();

// Dentro de la página. enMarcha: animaciones corriendo; reloj: suma de sus tiempos (quieto si está pausado).
const enMarcha = () => document.querySelector('.piles-titulo').getAnimations({ subtree: true }).filter(a => a.playState === 'running').length;
const reloj = () => document.querySelector('.piles-titulo').getAnimations({ subtree: true }).reduce((s, a) => s + (a.currentTime || 0), 0);
// Set: 4 cartas con la prenda visible (volteadas y opacas) de la misma prenda y los 4 colores. Devuelve la prenda, o 0.
const setVisible = () => {
  const v = [...document.querySelectorAll('.piles-titulo .pt-b')].filter(b => {
    const m = new DOMMatrix(getComputedStyle(b.parentElement).transform);
    return m.m11 < -0.99 && +getComputedStyle(b.closest('.pt-slot')).opacity > 0.99;
  });
  const tipos = new Set(v.map(b => b.dataset.tipo)), colores = new Set(v.map(b => b.dataset.color));
  return v.length === 4 && tipos.size === 1 && colores.size === 4 ? +[...tipos][0] : 0;
};

async function abrir(opts, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, ...opts });
  const p = await ctx.newPage();
  p.errores = [];
  p.on('pageerror', e => p.errores.push(e.message));
  p.on('console', m => { if (m.type() === 'error') p.errores.push(m.text()); });
  const t0 = Date.now();
  await p.goto(base + '/lobby.html', { waitUntil: 'networkidle' });
  p.t0 = t0;
  return p;
}
const foto = (p, nombre) => salida && p.screenshot({ path: `${salida}/titulo_${nombre}.png` });

// ─── Móvil, movimiento normal ───
const p = await abrir({}, { width: 390, height: 700 });
await p.locator('.pt-slot').first().waitFor({ timeout: 5000 });
await foto(p, 'movil_inicio');
await wait(1000);
ok(await p.evaluate(() => document.querySelector('.piles-titulo').getAnimations({ subtree: true }).length) > 0, 'el título anima (getAnimations > 0)');
ok(await p.evaluate(() => document.querySelector('.piles-titulo .pt-sr').textContent) === 'Piles!', 'el h1 se lee «Piles!»');
ok(await p.evaluate(() => document.querySelectorAll('.piles-titulo *').length) <= 60, `nodos del título: ${await p.evaluate(() => document.querySelectorAll('.piles-titulo *').length)} (≤ 60 con las externas en vuelo)`);

// Formulario a la vista y sin desbordes
const caja = async sel => p.locator(sel).first().boundingBox();
const botones = await p.locator('#homeScreen .home-actions .btn').all();
const ultimo = await botones[3].boundingBox();
ok(botones.length === 4 && ultimo.y + ultimo.height <= 700, `nombre y 4 botones sin scroll en 390x700 (último botón acaba en y=${Math.round(ultimo.y + ultimo.height)})`);
const [h1, panel] = [await caja('.piles-titulo'), await caja('#homeScreen')];
ok(h1.x >= panel.x && h1.x + h1.width <= panel.x + panel.width + 0.5, `el título no desborda el panel (${Math.round(h1.width)} de ${Math.round(panel.width)} px)`);
ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'sin scroll horizontal');
info(`alto del título: ${Math.round(h1.height)} px`);

// El set, dos manos seguidas
const sets = [];
for (let i = 0; i < 2; i++) {
  const t = Date.now();
  const tipo = await p.waitForFunction(setVisible, null, { polling: 30, timeout: 30000 }).then(h => h.jsonValue(), () => 0);
  sets.push(tipo);
  ok(tipo > 0, `mano ${i + 1}: 4 cartas visibles de la misma prenda en 4 colores${tipo ? ` (prenda ${tipo}, tras ${((Date.now() - (i ? t : p.t0)) / 1000).toFixed(1)} s)` : ''}`);
  if (i === 0) await foto(p, 'movil_set');
  if (tipo) await p.waitForFunction(() => document.querySelectorAll('.piles-titulo .pt-slot').length === 6 && document.querySelector('.pt-e').classList.contains('pt-brillo'), null, { polling: 100, timeout: 10000 }).catch(() => {});
  if (i === 0) await foto(p, 'movil_palabra');
}
ok(sets[0] && sets[1] && sets[0] !== sets[1], 'la segunda mano es otra prenda');

// Pausa al salir de la pantalla de inicio
ok(await p.evaluate(enMarcha) > 0, 'en la pantalla de inicio hay animaciones en marcha');
await p.evaluate(() => showScreen('hostScreen'));
await wait(300);
const r0 = await p.evaluate(reloj);
ok(await p.evaluate(enMarcha) === 0, 'al salir de la pantalla de inicio no queda ninguna animación en marcha');
await wait(1000);
ok(await p.evaluate(reloj) === r0, 'y el reloj de las animaciones no avanza');
await p.evaluate(() => showScreen('homeScreen'));
await wait(300);
ok(await p.evaluate(enMarcha) > 0 && await p.evaluate(reloj) > r0, 'al volver se reanuda donde estaba');

// Pestaña oculta (se simula: Playwright no oculta la pestaña de verdad)
const oculta = h => p.evaluate(h => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
  document.dispatchEvent(new Event('visibilitychange'));
}, h);
await oculta(true);
await wait(300);
const r1 = await p.evaluate(reloj);
ok(await p.evaluate(enMarcha) === 0, 'con la pestaña oculta no hay animaciones en marcha');
await wait(1000);
ok(await p.evaluate(reloj) === r1, 'y no consume (reloj quieto)');
await oculta(false);
await wait(300);
ok(await p.evaluate(enMarcha) > 0, 'al volver a la pestaña sigue');
ok(p.errores.length === 0, 'sin errores de JS en el lobby' + (p.errores.length ? ': ' + p.errores.join(' | ') : ''));
await p.context().close();

// ─── Escritorio (solo fotos y desborde) ───
const d = await abrir({}, { width: 1280, height: 800 });
await d.locator('.pt-slot').first().waitFor({ timeout: 5000 });
await foto(d, 'escritorio_inicio');
await d.waitForFunction(setVisible, null, { polling: 30, timeout: 30000 }).catch(() => {});
await foto(d, 'escritorio_set');
await d.waitForFunction(() => document.querySelector('.pt-e').classList.contains('pt-brillo'), null, { polling: 100, timeout: 15000 }).catch(() => {});
await foto(d, 'escritorio_palabra');
const [dh, dp] = [await d.locator('.piles-titulo').boundingBox(), await d.locator('#homeScreen').boundingBox()];
ok(dh.x >= dp.x && dh.x + dh.width <= dp.x + dp.width + 0.5, 'escritorio: el título no desborda el panel');
info(`escritorio: título ${Math.round(dh.width)}x${Math.round(dh.height)} en un panel de ${Math.round(dp.width)} px`);
ok(d.errores.length === 0, 'escritorio: sin errores de JS');
await d.context().close();

// ─── Movimiento reducido: la palabra quieta ───
const q = await abrir({ reducedMotion: 'reduce' }, { width: 390, height: 700 });
await wait(1500);
ok(await q.evaluate(() => document.querySelectorAll('.piles-titulo .pt-slot').length) === 6, 'movimiento reducido: las 6 cartas');
ok(await q.evaluate(() => [...document.querySelectorAll('.piles-titulo .pt-letra')].map(e => e.textContent).join('')) === 'Piles!', 'movimiento reducido: con las letras de «Piles!»');
ok(await q.evaluate(enMarcha) === 0, 'movimiento reducido: ninguna animación en marcha (ni flotar)');
await foto(q, 'movil_reducido');
ok(q.errores.length === 0, 'movimiento reducido: sin errores de JS');

await browser.close();
fin();
