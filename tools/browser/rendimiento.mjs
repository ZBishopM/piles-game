// Cuánto cuesta cada cuadro en el menú (la mesa) y en la partida.
//
//   node browser/rendimiento.mjs [--base=local|beta] [--cpu=4] [--solo=pc1|pc2|movil]
//
// Por pantalla (PC 1920×1080 a escala 1 y 2, móvil 390×844 a escala 3): 6 s en el menú y
// 8 s de partida con tres bots. Mide el tiempo entre cuadros (media, p95, % > 20 ms) y lo que
// el navegador gastó en script, estilo, layout y pintado (CDP Performance.getMetrics).
// --cpu=N frena la CPU N veces (Emulation.setCPUThrottlingRate): un PC lento, y las
// diferencias se ven más. Las cifras valen para comparar antes/después en la misma máquina.
import { lanzar, base } from './comun.mjs';

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const CPU = Number(arg('cpu', 4));
const PANTALLAS = {
  pc1: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  pc2: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 },
  movil: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
const espera = ms => new Promise(r => setTimeout(r, ms));

async function medir(p, cdp, ms) {
  const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const dts = await p.evaluate(ms => new Promise(fin => {
    const dts = []; let antes = performance.now(); const hasta = antes + ms;
    const paso = t => { dts.push(t - antes); antes = t; t < hasta ? requestAnimationFrame(paso) : fin(dts); };
    requestAnimationFrame(paso);
  }), ms);
  const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const d = k => ((m1[k] - m0[k]) / (ms / 1000) * 100).toFixed(0) + '%';   // fracción del tiempo real
  const o = [...dts].sort((a, b) => a - b);
  return {
    cuadros: dts.length,
    media: (dts.reduce((a, b) => a + b, 0) / dts.length).toFixed(1),
    p95: o[Math.floor(o.length * 0.95)].toFixed(1),
    lentos: (dts.filter(x => x > 20).length / dts.length * 100).toFixed(0) + '%',
    script: d('ScriptDuration'), estilo: d('RecalcStyleDuration'), layout: d('LayoutDuration'), tarea: d('TaskDuration'),
  };
}

const b = await lanzar();
const filas = [];
for (const [nombre, opc] of Object.entries(PANTALLAS)) {
  if (arg('solo', nombre) !== nombre) continue;
  const ctx = await b.newContext(opc);
  const p = await ctx.newPage();
  const errores = []; p.on('pageerror', e => errores.push(e.message));
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Performance.enable');
  await p.goto(base + '/lobby.html'); await espera(1500);
  await p.fill('#nombre', 'Ana'); await p.locator('#nombre').blur(); await espera(800);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  filas.push({ pantalla: nombre, donde: 'menú', ...await medir(p, cdp, 6000) });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  // A la partida con tres bots (el mismo camino que .tmp-gravedad.mjs)
  const k = async (t, x = 1) => { for (let i = 0; i < x; i++) { await p.keyboard.press(t); await espera(350); } };
  await k('ArrowRight'); await k('ArrowUp'); await espera(900); await k('ArrowUp'); await espera(2000);
  await k('ArrowRight'); await k('ArrowUp'); await espera(1000); await k('ArrowRight'); await k('ArrowUp'); await espera(1500);
  await k('ArrowDown'); await espera(1000); await k('ArrowUp');
  await p.waitForFunction(() => document.getElementById('gameScreen').classList.contains('active'), null, { timeout: 20000 });
  await espera(1500);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  filas.push({ pantalla: nombre, donde: 'partida', ...await medir(p, cdp, 8000) });
  if (errores.length) console.log(nombre, 'errores:', errores);
  await ctx.close();
}
await b.close();
console.log(`CPU ×${CPU}, ${base}`);
console.table(filas);
