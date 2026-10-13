// Confeti del 1º puesto en la pantalla final.
//
//   node browser/confeti.mjs [--base=local|beta] [--ver]     (CAPTURAS=<carpeta> guarda capturas)
//
// Se llama a `onGameOver` con rankings inyectados. Mira que hay confeti solo si
// el jugador propio queda 1º con rivales, que no se relanza con el mensaje
// repetido, que se retira solo (~4 s) y con `returnToLobby`, que no captura
// clics, que con movimiento reducido no hay nada y que no hay errores ni desborde.
import { lanzar, pagina, ok, fin, wait } from './comun.mjs';

const carpeta = process.env.CAPTURAS;
const R = (pos, n) => ({ position: pos, nickname: n, points: 10, combo_points: 0, best_mult_x100: 100 });
const cuantos = p => p.evaluate(() => document.querySelectorAll('#confetiLayer .confeti').length);

const browser = await lanzar();

async function caso(nombre, rankings, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...opts });
  const p = await pagina(ctx);
  await p.evaluate(rs => { currentNickname = 'Yo'; onGameOver(rs, []); }, rankings);
  return { p, ctx };
}

// 1. Propio 1º
{
  const { p, ctx } = await caso('1º', [R(1, 'Yo'), R(2, 'Bot')]);
  await wait(100);
  ok(await cuantos(p) >= 30, `1º: hay confeti (${await cuantos(p)} piezas)`);
  const t = await p.evaluate(() => {
    const l = document.getElementById('confetiLayer');
    const r = l.getBoundingClientRect();
    return { pe: getComputedStyle(l).pointerEvents, hit: document.elementFromPoint(640, 400)?.closest('#confetiLayer') !== null, anchoScroll: document.documentElement.scrollWidth > innerWidth };
  });
  ok(t.pe === 'none' && !t.hit, 'no captura clics (pointer-events:none)');
  ok(!t.anchoScroll, 'sin desborde horizontal');
  // mensaje repetido: no duplica
  await p.evaluate(() => onGameOver([{ position: 1, nickname: 'Yo' }, { position: 2, nickname: 'Bot' }], []));
  ok(await p.evaluate(() => document.querySelectorAll('#confetiLayer').length) === 1, 'mensaje repetido: una sola capa');
  await wait(500);
  if (carpeta) {
    await p.screenshot({ path: `${carpeta}/confeti-1280x800.png` });
    await p.setViewportSize({ width: 390, height: 700 });
    await p.screenshot({ path: `${carpeta}/confeti-390x700.png` });
    await p.setViewportSize({ width: 1280, height: 800 });
  }
  await wait(4300);
  ok(await p.evaluate(() => !document.getElementById('confetiLayer')), 'se retira solo a los ~5 s');
  ok(p.errores.length === 0, `sin errores de JS${p.errores.length ? ': ' + p.errores.join(' | ') : ''}`);
  await ctx.close();
}

// 2. returnToLobby limpia
{
  const { p, ctx } = await caso('limpia', [R(1, 'Yo'), R(2, 'Bot')]);
  await wait(300);
  await p.evaluate(() => returnToLobby());
  ok(await p.evaluate(() => !document.getElementById('confetiLayer')), 'returnToLobby retira el confeti');
  ok(p.errores.length === 0, 'sin errores de JS tras returnToLobby');
  await ctx.close();
}

// 3. Propio 2º, solo 1 jugador, espectador: nada
for (const [n, rs] of [['2º', [R(1, 'Bot'), R(2, 'Yo')]], ['solo', [R(1, 'Yo')]], ['espectador', [R(1, 'A'), R(2, 'B')]]]) {
  const { p, ctx } = await caso(n, rs);
  await wait(300);
  ok(await cuantos(p) === 0, `${n}: sin confeti`);
  await ctx.close();
}

// 4. Movimiento reducido
{
  const { p, ctx } = await caso('reducido', [R(1, 'Yo'), R(2, 'Bot')], { reducedMotion: 'reduce' });
  await wait(300);
  ok(await cuantos(p) === 0, 'movimiento reducido: sin confeti');
  await ctx.close();
}

await browser.close();
fin();
