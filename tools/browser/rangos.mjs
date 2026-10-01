// Rangos en los diales de Elo: el de fin de partida y los del perfil.
//
//   node browser/rangos.mjs [--base=local|beta] [--ver]
//
// No hace falta jugar una partida entera: se llama a `onGameOver` con el
// `elo` que mandaría el servidor (incluidos `top3_before` / `top3_after`).
// Mira que el rango se pinta, que cruzar un umbral muestra la pastilla y avisa
// al sonido UNA vez, que el Top 3 pone la corona, que el perfil usa
// `top3` de /api/elo/:key y que con movimiento reducido no hay partículas.
import { lanzar, pagina, ok, info, fin, wait } from './comun.mjs';

const browser = await lanzar();

async function finDePartida(p, elo) {
  await p.evaluate(elo => {
    window.__sfx = [];
    if (!window.__espiado) {
      const o = window.playSfx;
      window.playSfx = (n, a) => { __sfx.push(n); return o(n, a); };
      window.__espiado = true;
    }
    currentNickname = 'Rangos';
    onGameOver([{ position: 1, nickname: 'Rangos', points: 10, combo_points: 0, best_mult_x100: 100 }], elo);
  }, elo);
  // 450 ms de espera + el giro (1,8–3,4 s) + el golpe final
  await p.waitForFunction(() => document.querySelector('#eloDial .ag-dial-delta.is-shown'), null, { timeout: 12000 });
  await wait(1200);
}
const leer = p => p.evaluate(() => {
  const d = document.getElementById('eloDial');   // el propio contenedor es el dial
  return {
    skin: d?.dataset.skin, rango: d?.dataset.rank,
    etiqueta: d?.querySelector('.ag-dial-label')?.textContent,
    pastilla: d?.querySelector('.ag-dial-rank')?.textContent || '',
    pastillaClase: d?.querySelector('.ag-dial-rank')?.className || '',
    corona: !!d?.querySelector('.ag-rank-crown'),
    canvas: d?.querySelectorAll('canvas.ag-rank-fx').length ?? 0,
    sfx: [...window.__sfx],
  };
});
const cuenta = (l, n) => l.filter(x => x === n).length;

// ── 1. Glory: de Plata (1195) a Oro (1207) ────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await pagina(ctx);
  await finDePartida(p, [{ nickname: 'Rangos', pool: 'glory', before: 1195, after: 1207, top3_before: false, top3_after: false }]);
  const r = await leer(p);
  info(JSON.stringify({ ...r, sfx: `${r.sfx.length} sonidos` }));
  ok(r.skin === 'glory' && r.rango === 'oro', `glory 1195→1207 termina en Oro (${r.rango})`);
  ok(/For glory · Oro/i.test(r.etiqueta), `la etiqueta dice el rango (${r.etiqueta})`);
  ok(/Asciendes/i.test(r.pastilla) && /Oro/.test(r.pastilla) && /is-up/.test(r.pastillaClase), `y la pastilla de ascenso (${r.pastilla})`);
  ok(cuenta(r.sfx, 'rankUp') === 1 && cuenta(r.sfx, 'rankDown') === 0, `suena rankUp una vez (${cuenta(r.sfx, 'rankUp')})`);
  ok(cuenta(r.sfx, 'dialGlory') >= 10, `y el clac de glory en cada punto (${cuenta(r.sfx, 'dialGlory')})`);
  ok(r.canvas === 1, 'glory tiene su canvas de partículas');
  await p.locator('#gameOverOverlay').screenshot({ path: `${process.env.TEMP ?? '.'}/rangos-glory-sube.png` }).catch(() => {});
  ok(p.errores.length === 0, `sin errores de JavaScript${p.errores.length ? ': ' + p.errores.join(' | ') : ''}`);
  await ctx.close();
}

// ── 2. Fun: de Latón (1103) a Juguete (1096), baja ────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await pagina(ctx);
  await finDePartida(p, [{ nickname: 'Rangos', pool: 'fun', before: 1103, after: 1096, top3_before: false, top3_after: false }]);
  const r = await leer(p);
  ok(r.skin === 'fun' && r.rango === 'juguete', `fun 1103→1096 termina en Juguete (${r.rango})`);
  ok(/Desciendes/i.test(r.pastilla) && /is-down/.test(r.pastillaClase), `con la pastilla de descenso (${r.pastilla})`);
  ok(cuenta(r.sfx, 'rankDown') === 1 && cuenta(r.sfx, 'rankUp') === 0, `suena rankDown una vez (${cuenta(r.sfx, 'rankDown')})`);
  ok(r.canvas === 0, 'fun NO tiene partículas');
  await ctx.close();
}

// ── 3. Sin cambio de rango: sin pastilla ni sonido de rango ───────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await pagina(ctx);
  await finDePartida(p, [{ nickname: 'Rangos', pool: 'glory', before: 1210, after: 1218, top3_before: false, top3_after: false }]);
  const r = await leer(p);
  ok(r.rango === 'oro' && r.pastilla === '', `1210→1218 sigue en Oro y sin pastilla (${r.rango}, "${r.pastilla}")`);
  ok(cuenta(r.sfx, 'rankUp') + cuenta(r.sfx, 'rankDown') === 0, 'ni sonido de rango');
  await ctx.close();
}

// ── 4. Top 3: lo decide el servidor, y pone la corona ─────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await pagina(ctx);
  await finDePartida(p, [{ nickname: 'Rangos', pool: 'glory', before: 1655, after: 1665, top3_before: false, top3_after: true }]);
  const r = await leer(p);
  ok(r.rango === 'top3' && r.corona, `entrar en el Top 3 → rango top3 y corona (${r.rango}, corona=${r.corona})`);
  ok(/Top 3/.test(r.pastilla) && cuenta(r.sfx, 'rankUp') === 1, `pastilla "${r.pastilla}" y un rankUp`);
  await ctx.close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await pagina(ctx);
  await finDePartida(p, [{ nickname: 'Rangos', pool: 'glory', before: 1665, after: 1650, top3_before: true, top3_after: false }]);
  await wait(1500);
  const r = await leer(p);
  ok(r.rango === 'gran-master' && !r.corona, `salir del Top 3 baja a Gran máster y quita la corona (${r.rango}, corona=${r.corona})`);
  ok(cuenta(r.sfx, 'rankDown') === 1, 'con un rankDown');
  await ctx.close();
}

// ── 5. El perfil: dos diales quietos con el rango del servidor ────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await pagina(ctx);
  await p.evaluate(() => {
    window.fetch = async () => new Response(JSON.stringify({ glory: { r: 1520, n: 12 }, fun: { r: 980, n: 3 }, top3: { glory: true, fun: false } }), { status: 200 });
    return loadProfileElo();
  });
  await wait(600);
  const perfil = await p.evaluate(() => ['profileEloGlory', 'profileEloFun'].map(id => {
    const d = document.getElementById(id);
    return { rango: d.dataset.rank, etiqueta: d.querySelector('.ag-dial-label')?.textContent, canvas: d.querySelectorAll('canvas.ag-rank-fx').length, corona: !!d.querySelector('.ag-rank-crown') };
  }));
  info(JSON.stringify(perfil));
  ok(perfil[0].rango === 'top3' && perfil[0].corona, 'perfil glory: Top 3 con corona (viene de `top3` de /api/elo)');
  ok(perfil[0].canvas === 1, 'y con partículas de ambiente, quieto');
  ok(perfil[1].rango === 'carton' && perfil[1].canvas === 0, `perfil fun 980: Cartón y sin partículas (${perfil[1].rango})`);
  ok(/For fun · Cartón/i.test(perfil[1].etiqueta), `etiqueta "${perfil[1].etiqueta}"`);
  await ctx.close();
}

// ── 6. Movimiento reducido: rango y pastilla, pero sin partículas ─────────
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const p = await pagina(ctx);
  await p.evaluate(() => {
    window.__sfx = [];
    currentNickname = 'Rangos';
    onGameOver([{ position: 1, nickname: 'Rangos', points: 10, combo_points: 0, best_mult_x100: 100 }],
      [{ nickname: 'Rangos', pool: 'glory', before: 1195, after: 1207, top3_before: false, top3_after: false }]);
  });
  await wait(1200);
  const r = await leer(p);
  ok(r.rango === 'oro' && /Asciendes/i.test(r.pastilla), `reducido: Oro y pastilla al instante (${r.rango}, "${r.pastilla}")`);
  ok(r.canvas === 0, 'y sin canvas de partículas');
  await ctx.close();
}

await browser.close();
fin();
