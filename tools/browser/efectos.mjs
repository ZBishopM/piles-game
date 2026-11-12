// Cada efecto de sonido (client/juego/sonido.ts) suena, no satura y no se alarga: se toca uno a
// uno en la página y se mide lo que llega a la salida (pico y duración).
//   node browser/efectos.mjs [--base=...]
import { lanzar, pagina, aPartida, ok, wait, fin } from './comun.mjs';

const nav = await lanzar();
const ctx = await nav.newContext();
// Todo lo que se conecta a la salida pasa también por un analizador
await ctx.addInitScript(() => {
  const con = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...r) {
    if (dest === this.context.destination) {
      const a = (this.context.__an ??= Object.assign(this.context.createAnalyser(), { fftSize: 2048 }));
      con.call(this, a);
    }
    return con.call(this, dest, ...r);
  };
  window.__medir = async ms => {
    const c = juego.audioCtx, a = c.__an, buf = new Float32Array(a.fftSize);
    let pico = 0, ultimo = 0; const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      a.getFloatTimeDomainData(buf);
      let p = 0; for (const v of buf) p = Math.max(p, Math.abs(v));
      if (p > pico) pico = p;
      if (p > 0.003) ultimo = performance.now() - t0;
      await new Promise(r => setTimeout(r, 15));
    }
    return { pico, ultimo };
  };
});
await ctx.route('**/musica/*.ogg', r => r.abort());   // sin música: se mide solo el efecto
const p = await pagina(ctx);
await p.mouse.click(200, 300);   // el gesto que abre el audio
await wait(300);
ok(await p.evaluate(() => typeof juego.playSfx === 'function' && !!juego.audioCtx), 'el audio está abierto');

const nombres = await p.evaluate(() => juego.sfxNombres());
console.log('efecto          pico dBFS   dura ms');
for (const n of nombres) {
  const m = await p.evaluate(async n => { juego.playSfx(n, 3); return __medir(1700); }, n);
  const db = m.pico > 0 ? 20 * Math.log10(m.pico) : -Infinity;
  console.log(`${n.padEnd(15)} ${db.toFixed(1).padStart(8)}   ${String(Math.round(m.ultimo)).padStart(6)}`);
  ok(m.pico > 0.004, `${n}: suena`);
  ok(m.pico < 0.5, `${n}: no satura (pico ${db.toFixed(1)} dBFS)`);
  ok(m.ultimo < 1650, `${n}: se apaga (${Math.round(m.ultimo)} ms)`);
  await wait(250);
}

// El golpe suena cuando la carta ATERRIZA (la animación tarda 360 ms en caer), no al lanzarla:
// se suelta una carta en una partida y se mira cuándo llega el pico más alto.
await aPartida(p, 'Oido');
await wait(1500);
const mia = await p.evaluate(() => { const r = document.querySelector('#yourCards [data-tap]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
const curva = await p.evaluate(async ({ x, y }) => {
  const a = juego.audioCtx.__an, buf = new Float32Array(a.fftSize), pts = [];
  const el = document.elementFromPoint(x, y);
  for (const tipo of ['pointerdown', 'pointerup', 'click']) el.dispatchEvent(new PointerEvent(tipo, { bubbles: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true }));
  const t0 = performance.now();
  while (performance.now() - t0 < 900) {
    a.getFloatTimeDomainData(buf);
    let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v));
    pts.push([Math.round(performance.now() - t0), m]);
    await new Promise(r => setTimeout(r, 12));
  }
  return pts;
}, mia);
const [tPico, pico] = curva.reduce((a, b) => (b[1] > a[1] ? b : a));
const temprano = Math.max(...curva.filter(([t]) => t < 200).map(([, v]) => v));
console.log(`soltar una carta: roce ${temprano.toFixed(3)} en los primeros 200 ms · golpe ${pico.toFixed(3)} a los ${tPico} ms`);
ok(tPico >= 300 && tPico <= 620, `el golpe llega con el aterrizaje (${tPico} ms; la caída dura 360)`);
ok(pico > temprano * 1.5, 'el golpe pesa más que el roce del lanzamiento');
ok(p.errores.length === 0, `sin errores de página ${p.errores.join(' | ')}`);
await nav.close();
fin();
