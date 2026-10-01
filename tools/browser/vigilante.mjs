// El perro guardián: sin `pong`, el cliente abandona el socket, reconecta con
// su secreto y recupera su mano; y lo anota en la caja negra.
//
//   node browser/vigilante.mjs [--base=local|beta] [--ver]      (tarda ~25 s)
//
// Con la red caída el navegador tarda minutos en enterarse de que el socket ha
// muerto, y mientras tanto la pantalla parece viva y nada responde.
import { lanzar, pagina, aPartida, mano, ok, info, fin, wait, grabacionDe } from './comun.mjs';

const browser = await lanzar();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const p = await pagina(ctx);
const codigo = await aPartida(p, 'Vigilante');
const antes = await mano(p);

let sockets = 0;
p.on('websocket', () => { sockets++; });

// El servidor deja de contestar (para el cliente): se descartan los pong.
await p.evaluate(() => {
  const original = window.handleMsg;
  window.handleMsg = m => (m.type === 'pong' ? undefined : original(m));
});
const t0 = Date.now();

// Debe abrir otro socket pasados ~9 s (más el siguiente tic de 3 s y 1 s de espera).
let reabierto = null, overlayVisto = false;
for (let i = 0; i < 200 && reabierto === null; i++) {
  await wait(100);
  if (await p.locator('#reconnectOverlay').isVisible()) overlayVisto = true;
  if (sockets > 0) reabierto = (Date.now() - t0) / 1000;
}
ok(reabierto !== null, `el cliente abre otro socket a los ${reabierto?.toFixed(1)} s sin pong`);
ok(reabierto !== null && reabierto >= 8 && reabierto <= 16, 'entre 8 y 16 s (9 s sin pong + el tic de 3 s + 1 s de espera)');
ok(overlayVisto, 'y avisa con el overlay de reconexión');

// Vuelve a la partida con su misma mano.
await p.locator('#gameScreen.active').waitFor({ timeout: 8000 });
await wait(800);
ok((await mano(p)) === antes, 'recupera su misma mano');
ok(await p.locator('#reconnectOverlay').isHidden(), 'y el overlay desaparece');

// La caja negra lo cuenta.
await wait(800);
const g = await grabacionDe(codigo);
const notas = g.lineas.filter(l => l.t === 'in' && l.m?.type === 'client_note').map(l => `${l.m.kind}${l.m.detail?.ev ? ':' + l.m.detail.ev : ''}`);
info(`notas del cliente en la grabación: ${notas.join(', ')}`);
ok(notas.includes('pong_timeout'), 'la grabación tiene el pong_timeout');
ok(notas.includes('ws:open') && notas.includes('ws:rejoin_ok'), 'y la reapertura y la vuelta a la sala, que ocurrieron SIN asiento y salieron en cuanto volvió');
ok(g.lineas.some(l => l.t === 'conn' && l.kind === 'replaced') || g.lineas.some(l => l.t === 'conn' && l.kind === 'grace_start'),
   'y el servidor anotó la caída o el relevo del asiento');

ok(p.errores.length === 0, `sin errores de JavaScript${p.errores.length ? ': ' + p.errores.join(' | ') : ''}`);
await browser.close();
fin();
