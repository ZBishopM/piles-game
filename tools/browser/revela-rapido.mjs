// Revelar con un gesto rápido, con el dedo (eventos táctiles de verdad, por CDP).
//   node browser/revela-rapido.mjs [--base=local|beta]
// Un ↓ rápido y corto sobre tu mano tiene que revelar, como en el selector de apps del
// móvil: lo que cuenta es el impulso, no llegar hasta abajo.
import { lanzar, pagina, aPartida, espiarEnvios, cuenta, wait, ok, info, fin } from './comun.mjs';
const b = await lanzar();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const p = await pagina(ctx);
await aPartida(p, 'Revela', 'Fácil');
await p.evaluate(() => juego.send({ type: 'set_ready', ready: false }));
const cdp = await ctx.newCDPSession(p);
const toque = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
/** Un ↓ de `dy` px en `ms`, con `pasos` movimientos intermedios. */
async function desliza(dy, ms, pasos, dx = 0) {
  const r = await p.locator('#yourCards').boundingBox();
  const x = r.x + r.width / 2, y = r.y + 12;
  await toque('touchStart', x, y);
  for (let i = 1; i <= pasos; i++) { await wait(ms / (pasos + 1)); await toque('touchMove', x + dx * i / pasos, y + dy * i / pasos); }
  await wait(ms / (pasos + 1));
  await toque('touchEnd');
}
const casos = [
  ['lento, hasta el 60 %', 300, 600, 12],
  ['rápido y corto (90 px en 70 ms)', 90, 70, 2],
  ['rápido, un solo movimiento (110 px)', 110, 40, 1],
  ['rápido algo torcido (100 px, 35 de lado)', 100, 60, 2, 35],
];
for (const [nombre, dy, ms, pasos, dx = 0] of casos) {
  await wait(1200);
  await espiarEnvios(p);
  await desliza(dy, ms, pasos, dx);
  await wait(700);
  const n = await cuenta(p, 'flip_set');
  info(`${nombre}: ${n} flip_set`);
  ok(n === 1, `${nombre}: revela`);
  const [rev, dorso] = await p.evaluate(() => [!!juego.est.myFlippedSets[juego.est.currentSetIndex], document.getElementById('yourCards').classList.contains('volteado')]);
  ok(rev === dorso, `${nombre}: tu mano enseña ${rev ? 'el dorso (volteado)' : 'el frente'}`);
}
// Coger una carta del centro y revelar enseguida: el servidor retiene la cogida 300 ms
// (ventana de pelea) y antes ignoraba el revelado que llegaba en ese rato.
// (Si el bot se lleva esa misma carta hay pelea y no se puede revelar: ese intento no cuenta.)
for (let i = 0, hechos = 0; hechos < 3 && i < 8; i++) {
  await wait(1200);
  if (await p.evaluate(() => juego.est.qteActive)) { await wait(4000); continue; }
  const antes = await p.evaluate(() => juego.est.myFlippedSets[juego.est.currentSetIndex]);
  await p.evaluate(() => juego.onPlayerCardClick(0));
  await p.waitForFunction(() => !juego.est.pendingDrop, null, { timeout: 3000 });
  await wait(300);
  await p.evaluate(() => juego.onCenterCardClick(juego.est.centerCards[0].id));
  await wait(60);
  await desliza(110, 50, 1);
  await wait(1200);
  if (await p.evaluate(() => juego.est.qteActive || juego.est.allSets.some(s => s.some(c => !c)))) { info('pelea con el bot por esa carta: no cuenta'); await wait(4000); continue; }
  const despues = await p.evaluate(() => juego.est.myFlippedSets[juego.est.currentSetIndex]);
  ok(despues !== antes, `coger y revelar seguido (${++hechos}): se revela`);
}
// Debiendo carta no se revela: la tabla no da la vuelta
{
  await wait(1200);
  await p.evaluate(() => juego.onPlayerCardClick(0));
  await wait(500);
  await espiarEnvios(p);
  await desliza(160, 80, 3);
  await wait(500);
  ok(await cuenta(p, 'flip_set') === 0, 'debiendo carta: no manda flip_set');
  await p.evaluate(() => juego.onCenterCardClick(juego.est.centerCards[0].id));
  await wait(800);
}
// Lo que no debe revelar: un toque, y un ↓ lento que se queda corto
for (const [nombre, dy, ms, pasos] of [['toque', 4, 60, 1], ['↓ lento y corto (40 px)', 40, 500, 8]]) {
  await wait(1200);
  await espiarEnvios(p);
  await desliza(dy, ms, pasos);
  await wait(700);
  ok(await cuenta(p, 'flip_set') === 0, `${nombre}: no revela`);
}
info(`errores: ${JSON.stringify(p.errores)}`);
await b.close(); fin();
