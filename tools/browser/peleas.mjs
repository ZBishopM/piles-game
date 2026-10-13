// Dos peleas a la vez: la ajena no pisa la tuya.
//
//   node browser/peleas.mjs [--base=local|beta] [--ver]
//
// `onSwapConflict` escribía `qtePlayers`, `qteContestedCard` y `qteContestedIndex`
// también para peleas ajenas, así que una que empezara a media tuya la pisaba:
// el overlay propio dejaba de recibir `qte_update` y se cerraba cuando se
// resolvía la OTRA. Contra un cliente sin el arreglo (beta antes de desplegar)
// esto da "FALLA". Los mensajes se inyectan en la página: no hace falta que
// haya de verdad tres personas.
import { lanzar, pagina, aPartida, ok, info, fin, wait } from './comun.mjs';

const browser = await lanzar();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const p = await pagina(ctx);
await aPartida(p, 'Peleas');

const inyectar = m => p.evaluate(m => handleMsg(m), m);
const estado = () => p.evaluate(() => ({
  overlay: document.getElementById('qteOverlay').classList.contains('active'),
  qteActive, mia: qteMyCardId, bloqueadas: [...qteBlockedCards],
  avisos: document.querySelectorAll('#verifyNotifications .qte-battle-notif').length,
}));

const [X, Y] = await p.evaluate(() => [centerCards[0].id, centerCards[1].id]);
const yo = 'Peleas', bot = '🤖 Bot 1';

// Empieza mi pelea por X…
await inyectar({ type: 'swap_conflict', players: [yo, bot], card_id: X, qte_duration: 3000 });
let e = await estado();
ok(e.overlay && e.qteActive, 'mi pelea abre el overlay');

// …y a media, empieza una ajena por Y.
await inyectar({ type: 'swap_conflict', players: ['Pepe', 'Luis'], card_id: Y, qte_duration: 3000 });
e = await estado();
ok(e.overlay && e.qteActive, 'una pelea ajena a media no cierra mi overlay');
ok(e.mia === X, `y no pisa cuál es la mía (${e.mia} = ${X})`);
ok(e.avisos === 1, 'la ajena sí sale como aviso pequeño');

// Mi marcador sigue recibiendo lo mío.
await inyectar({ type: 'qte_update', card_id: X, clicks: { [yo]: 7, [bot]: 4 } });
const mio = await p.evaluate(yo => document.getElementById(`qte-n-${yo}`)?.textContent, yo);
ok(mio === '7', `mi marcador se actualiza (${mio})`);

// La ajena se resuelve ANTES que la mía: no me cierra el overlay.
await inyectar({ type: 'qte_resolved', card_id: Y, winner: 'Pepe' });
await wait(1200);   // más que FIGHT_RESULT_MS, por si cerrara tarde
e = await estado();
ok(e.overlay && e.qteActive, 'que se resuelva la ajena primero no me cierra la mía');
ok(e.avisos === 0 && !e.bloqueadas.includes(Y), 'y su aviso y su carta se limpian');
await inyectar({ type: 'qte_update', card_id: X, clicks: { [yo]: 9, [bot]: 5 } });
ok((await p.evaluate(yo => document.getElementById(`qte-n-${yo}`)?.textContent, yo)) === '9', 'mi marcador sigue vivo después');

// Se resuelve la mía: ahora sí se cierra, tras enseñar el resultado.
await inyectar({ type: 'qte_resolved', card_id: X, winner: yo });
await wait(1300);
e = await estado();
ok(!e.overlay && !e.qteActive && e.mia === null, 'mi pelea se resuelve y el overlay se cierra');

// Una pelea mía por una carta que ya no está en mi copia del centro
// (cambió justo al empezar): se reconoce igual como mía.
await inyectar({ type: 'swap_conflict', players: [yo, bot], card_id: 99999, qte_duration: 3000 });
e = await estado();
ok(e.overlay && e.mia === 99999, 'una pelea por una carta que no está en mi centro también es mía');
await inyectar({ type: 'qte_resolved', card_id: 99999, winner: bot });
await wait(1300);
e = await estado();
ok(!e.overlay && !e.qteActive, 'y se resuelve y se cierra (antes se quedaba pegada)');

// ── Empate: muerte súbita (mensajes inyectados) ──
// Participante en 390x700 y 1280x800, con capturas (en $CAPTURAS o en la carpeta temporal).
import { tmpdir } from 'os';
import { join } from 'path';
const carpeta = process.env.CAPTURAS || tmpdir();
const texto = (q, ctxPag = p) => ctxPag.evaluate(q => document.querySelector(q)?.textContent ?? null, q);
for (const [w, h] of [[390, 700], [1280, 800]]) {
  const c2 = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const q = await pagina(c2);
  await aPartida(q, 'Empate');
  const iny = m => q.evaluate(m => handleMsg(m), m);
  const Z = await q.evaluate(() => centerCards[0].id);
  const rival = '🤖 Bot 1';
  await iny({ type: 'swap_conflict', players: ['Empate', rival], card_id: Z, qte_duration: 3000 });
  await iny({ type: 'qte_update', card_id: Z, clicks: { Empate: 5, [rival]: 5 } });
  await iny({ type: 'qte_tiebreak', card_id: Z, round: 1, duration: 1000 });
  await wait(150);
  const t = await texto('#qteTitle', q), d = await texto('#qteDesc', q);
  ok(/EMPATE/.test(t) && /Muerte súbita/i.test(t), `${w}px: rótulo «${t}»`);
  ok(/5 – 5/.test(d), `${w}px: se ve el marcador anterior («${d}»)`);
  const cero = await q.evaluate(() => [...document.querySelectorAll('.qte-count')].map(e => e.textContent));
  ok(cero.every(x => x === '0'), `${w}px: marcadores a 0`);
  const vivo = await q.evaluate(() => ({
    live: document.getElementById('qteTitle').getAttribute('aria-live'),
    activo: document.getElementById('qteOverlay').classList.contains('active') && qteActive,
    caja: document.getElementById('qteBox').getBoundingClientRect().right <= innerWidth,
  }));
  ok(vivo.live === 'polite' && vivo.activo && vivo.caja, `${w}px: aria-live, sigue activo y sin desborde`);
  await q.screenshot({ path: join(carpeta, `empate-${w}.png`) });
  // Segunda ronda desde cero y resolución al azar: clicks finales y aviso.
  await wait(1100);
  ok((await texto('#qteTitle', q)).includes('CLICK'), `${w}px: pasado 1 s vuelve el título normal`);
  await iny({ type: 'qte_update', card_id: Z, clicks: { Empate: 0, [rival]: 0 } });
  await iny({ type: 'qte_resolved', card_id: Z, winner: 'Empate', clicks: { Empate: 3, [rival]: 3 }, tiebreaks: 3, random: true });
  ok((await texto('#qteDesc', q)) === 'Desempate al azar', `${w}px: «Desempate al azar»`);
  ok((await texto('#qte-n-Empate', q)) === '3', `${w}px: clicks finales visibles`);
  await q.screenshot({ path: join(carpeta, `empate-azar-${w}.png`) });
  await wait(1900);
  ok(!(await q.evaluate(() => document.getElementById('qteOverlay').classList.contains('active'))), `${w}px: se cierra`);
  // Mensaje viejo (sin campos nuevos) sigue valiendo.
  await iny({ type: 'swap_conflict', players: ['Empate', rival], card_id: Z, qte_duration: 3000 });
  await iny({ type: 'qte_resolved', card_id: Z, winner: rival });
  await wait(1100);
  ok(!(await q.evaluate(() => qteActive)), `${w}px: qte_resolved sin los campos nuevos funciona`);
  // Espectador: aviso reducido.
  await iny({ type: 'swap_conflict', players: ['Pepe', 'Luis'], card_id: Z + 1, qte_duration: 3000 });
  await iny({ type: 'qte_tiebreak', card_id: Z + 1, round: 1, duration: 1000 });
  ok(/EMPATE/.test(await texto('.qte-battle-notif .qbn-title', q)), `${w}px: el espectador ve el aviso de empate`);
  if (w === 390) await q.screenshot({ path: join(carpeta, `empate-espectador-${w}.png`) });
  await iny({ type: 'qte_resolved', card_id: Z + 1, winner: 'Pepe' });
  ok(q.errores.length === 0, `${w}px: sin errores de JavaScript${q.errores.length ? ': ' + q.errores.join(' | ') : ''}`);
  await c2.close();
}
info(`capturas en ${carpeta}`);

// Movimiento reducido: el rótulo no anima.
const c3 = await browser.newContext({ viewport: { width: 390, height: 700 }, reducedMotion: 'reduce' });
const r = await pagina(c3);
await aPartida(r, 'Quieto');
const Zr = await r.evaluate(() => centerCards[0].id);
await r.evaluate(Z => { handleMsg({ type: 'swap_conflict', players: ['Quieto', '🤖 Bot 1'], card_id: Z, qte_duration: 3000 }); handleMsg({ type: 'qte_tiebreak', card_id: Z, round: 1, duration: 1000 }); }, Zr);
ok((await r.evaluate(() => getComputedStyle(document.getElementById('qteTitle')).animationName)) === 'none', 'con movimiento reducido el rótulo no anima');
await c3.close();

ok(p.errores.length === 0, `sin errores de JavaScript${p.errores.length ? ': ' + p.errores.join(' | ') : ''}`);
await browser.close();
fin();
