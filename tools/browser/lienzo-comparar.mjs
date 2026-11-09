// La escena del menú con Canvas2D y con PixiJS (WebGL): capturas y FPS, en Chrome y Firefox.
//   node browser/lienzo-comparar.mjs <carpeta> [--base=local|beta] [--solo=chromium|firefox]
// Con ventana (GPU real). Deja <navegador>-<pincel>.png en la carpeta.
import { chromium, firefox } from '@playwright/test';
import { base, wait, info, fin } from '../repro/comun.mjs';
const OUT = process.argv.slice(2).find(a => !a.startsWith('--')) ?? '.';
const solo = process.argv.find(a => a.startsWith('--solo='))?.slice(7);
for (const [nombre, tipo] of [['chromium', chromium], ['firefox', firefox]]) {
  if (solo && solo !== nombre) continue;
  const b = await tipo.launch({ headless: false });
  for (const lienzo of ['2d', 'pixi']) {
    const p = await (await b.newContext({ viewport: { width: 1920, height: 1000 } })).newPage();
    const errores = []; p.on('pageerror', e => errores.push(e.message)); p.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') errores.push(m.text()); });
    await p.goto(`${base}/lobby.html?lienzo=${lienzo}`, { waitUntil: 'networkidle' });
    await p.evaluate(() => juego.mostrarMedidor(true));
    await wait(6000);
    const m = await p.evaluate(() => ({ ...juego.medida, pincel: document.getElementById('juego')?.dataset.pincel, w: document.getElementById('juego')?.width }));
    info(`${nombre} ${lienzo}: pincel ${m.pincel} · lienzo ${m.w} · ${m.fps} FPS · p95 ${m.p95.toFixed(1)} · peor ${Math.round(m.peor)}${errores.length ? ' · ' + errores.slice(0, 3).join(' | ') : ''}`);
    await p.evaluate(() => juego.mostrarMedidor(false));
    await wait(300);
    await p.screenshot({ path: `${OUT}/${nombre}-${lienzo}.png` });
    await p.context().close();
  }
  await b.close();
}
fin();
