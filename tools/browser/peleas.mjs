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
import { lanzar, pagina, aPartida, ok, fin, wait } from './comun.mjs';

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

ok(p.errores.length === 0, `sin errores de JavaScript${p.errores.length ? ': ' + p.errores.join(' | ') : ''}`);
await browser.close();
fin();
