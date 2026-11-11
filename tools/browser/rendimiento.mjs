// Rendimiento: FPS (el medidor secreto del juego) y tiempo de CPU por cuadro, en el menú y en
// partida, en PC (1 y 2 de escala) y en móvil.
//   node browser/rendimiento.mjs [--base=local|beta] [--headed]
// Con --headed el navegador usa la GPU de verdad (sin ventana, Chromium dibuja por software y
// los FPS salen peores de lo que son: vale para comparar antes y después, no en absoluto).
import { chromium } from '@playwright/test';
import { base, wait, info, fin } from '../repro/comun.mjs';
import { aPartida } from './comun.mjs';
const headed = process.argv.includes('--headed');
const b = await chromium.launch({ headless: !headed, args: ['--lang=es-ES'] });
const PANTALLAS = [
  ['PC 1920×1080 @1', { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }],
  ['PC 1920×1080 @2', { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 }],
  ['móvil 390×844 @3', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }],
];
async function medir(p, cdp, ms = 6000) {
  const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  await wait(ms);
  const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const d = k => ((m1[k] - m0[k]) * 1000 / (ms / 1000)).toFixed(0);   // ms de CPU por segundo
  const med = await p.evaluate(() => ({ ...juego.medida, lienzo: document.getElementById('juego')?.width }));
  return `lienzo ${med.lienzo} · ${med.fps} FPS · p95 ${med.p95.toFixed(1)} · peor ${Math.round(med.peor)} · lentos ${med.lentos} | CPU ms/s: script ${d('ScriptDuration')} estilo ${d('RecalcStyleDuration')} layout ${d('LayoutDuration')} tareas ${d('TaskDuration')}`;
}
for (const [nombre, opc] of PANTALLAS) {
  const ctx = await b.newContext(opc);
  const p = await ctx.newPage();
  await p.goto(base + '/', { waitUntil: 'networkidle' });
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Performance.enable');
  await p.evaluate(() => juego.mostrarMedidor(true));
  await wait(1500);
  info(`${nombre} · menú:    ${await medir(p, cdp)}`);
  await aPartida(p, 'Mide', 'Normal');
  info(`${nombre} · partida: ${await medir(p, cdp)}`);
  await p.evaluate(() => juego.mostrarMedidor(false));
  await ctx.close();
}
await b.close(); fin();
