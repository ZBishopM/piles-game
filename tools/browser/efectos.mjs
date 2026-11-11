// Cada efecto de sonido (client/juego/sonido.ts) suena, no satura y no se alarga: se toca uno a
// uno en la página y se mide lo que llega a la salida (pico y duración).
//   node browser/efectos.mjs [--base=...]
import { lanzar, pagina, ok, wait, fin } from './comun.mjs';

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
ok(p.errores.length === 0, `sin errores de página ${p.errores.join(' | ')}`);
await nav.close();
fin();
