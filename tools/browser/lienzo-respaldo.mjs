// La escena arranca con WebGL (Pixi) y, si el navegador pierde el contexto, vuelve sola a Canvas2D
// con los diales otra vez en HTML. También si WebGL va lento, y ?lienzo=2d.
//   node browser/lienzo-respaldo.mjs [--base=local|beta]
import { chromium, firefox } from '@playwright/test';
import { base, wait } from '../repro/comun.mjs';
let fallos = 0;
const ok = (c, m) => { console.log(c ? 'OK   ' : 'FALLO', m); if (!c) fallos++; };
const estado = p => p.evaluate(() => ({
  pincel: document.getElementById('juego')?.dataset.pincel,
  dialesHtml: [...document.querySelectorAll('.dialMesa')].filter(e => e.style.display !== 'none' && e.style.opacity !== '0').length,
}));
for (const tipo of [chromium, firefox]) {
  const b = await tipo.launch({ headless: false });
  const p = await (await b.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const errores = []; p.on('pageerror', e => errores.push(e.message));
  await p.goto(base + '/', { waitUntil: 'networkidle' });
  await wait(6000);
  let e = await estado(p);
  ok(e.pincel === 'pixi', `${tipo.name()}: por defecto WebGL (${e.pincel})`);
  ok(e.dialesHtml === 0, `${tipo.name()}: diales en la escena, no en HTML (${e.dialesHtml} en HTML)`);
  await p.evaluate(() => {
    const c = document.getElementById('juego');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    gl.getExtension('WEBGL_lose_context').loseContext();
  });
  await wait(4000);
  e = await estado(p);
  ok(e.pincel === '2d', `${tipo.name()}: contexto perdido → Canvas2D (${e.pincel})`);
  ok(e.dialesHtml > 0, `${tipo.name()}: diales de vuelta en HTML (${e.dialesHtml})`);
  const pintado = await p.evaluate(() => {
    const c = document.getElementById('juego'), x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i + 1] + d[i + 2] > 30) n++;
    return n;
  });
  ok(pintado > 50, `${tipo.name()}: la escena 2D se sigue pintando (${pintado} muestras con luz)`);
  await p.goto(base + '/?lienzo=2d', { waitUntil: 'networkidle' });
  await wait(3000);
  e = await estado(p);
  ok(e.pincel === '2d', `${tipo.name()}: ?lienzo=2d fuerza Canvas2D (${e.pincel})`);
  // WebGL lento (como una GPU por software): cada cuadro tarda 60 ms → a los ~2 s, Canvas2D
  await p.goto(base + '/', { waitUntil: 'networkidle' });
  await wait(5000);
  await p.evaluate(() => { const f = () => { const t = performance.now(); while (performance.now() - t < 60); if (!window.__basta) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await wait(5000);
  await p.evaluate(() => { window.__basta = true; });
  e = await estado(p);
  ok(e.pincel === '2d', `${tipo.name()}: WebGL lento → Canvas2D (${e.pincel})`);
  ok(errores.length === 0, `${tipo.name()}: sin errores (${errores.join(' | ')})`);
  await b.close();
}
console.log(fallos ? `\n${fallos} fallos` : '\ntodo bien');
process.exit(fallos ? 1 : 0);
