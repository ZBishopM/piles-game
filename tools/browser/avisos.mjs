// Avisos de pelea ajena y oferta de bots.
//
//   node browser/avisos.mjs [--base=local|beta] [--ver]
//
// 1) Dos peleas ajenas a la vez vistas por quien no pelea: sin ids repetidos en el
//    documento, cada aviso mueve SU barra y SUS marcadores, y un apodo como
//    `<img src=x onerror=...>` sale como texto y no ejecuta nada.
// 2) `cameFromQuickMatch` vuelve a false: tras una partida rápida, salir y crear
//    otra sala con un jugador NO reabre `#quickBotOffer` (12 s reales); y la oferta
//    sí sale en una partida rápida normal en la que no llega nadie.
import { lanzar, pagina, aPartida, ok, fin, wait } from './comun.mjs';

const browser = await lanzar();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const p = await pagina(ctx);
await p.evaluate(() => { window.__xss = undefined; });
await aPartida(p, 'Mirón');

const inyectar = m => p.evaluate(m => handleMsg(m), m);
const [X, Y] = await p.evaluate(() => [centerCards[0].id, centerCards[1].id]);
const malo = '<img src=x onerror=window.__xss=1>';

await inyectar({ type: 'swap_conflict', players: [malo, 'Luis'], card_id: X, qte_duration: 4000 });
await inyectar({ type: 'swap_conflict', players: ['Pepe', 'Ana'], card_id: Y, qte_duration: 4000 });
await wait(600);

const avisos = () => p.evaluate(() => [...document.querySelectorAll('#verifyNotifications .qte-battle-notif')].map(n => ({
  barra: parseFloat(n.querySelector('.qbn-bar-fill').style.width),
  marcadores: [...n.querySelectorAll('[data-nick]')].map(s => s.textContent),
  jugadores: [...n.querySelectorAll('.qbn-player')].map(s => s.textContent),
  imgs: n.querySelectorAll('img').length,
})));
let a = await avisos();
ok(a.length === 2, `hay dos avisos a la vez (${a.length})`);

const dup = await p.evaluate(() => {
  const ids = [...document.querySelectorAll('[id]')].map(e => e.id);
  return ids.filter((id, i) => ids.indexOf(id) !== i);
});
ok(dup.length === 0, `sin ids repetidos en el documento${dup.length ? ': ' + dup.join(', ') : ''}`);

ok(a[0].jugadores[0] === malo && a[0].imgs === 0, 'el apodo con <img onerror> sale como texto, sin elemento');
await wait(300);
ok(await p.evaluate(() => window.__xss === undefined), 'y no se ejecutó nada (window.__xss sin definir)');

// Cada aviso mueve lo suyo.
await inyectar({ type: 'qte_update', card_id: Y, clicks: { Pepe: 5, Ana: 2 } });
a = await avisos();
ok(a[1].marcadores.join('|') === '5 clicks|2 clicks', `la pelea Y actualiza su aviso (${a[1].marcadores})`);
ok(a[0].marcadores.join('|') === '0 clicks|0 clicks', `y no toca el de X (${a[0].marcadores})`);
await inyectar({ type: 'qte_update', card_id: X, clicks: { [malo]: 3, Luis: 1 } });
a = await avisos();
ok(a[0].marcadores.join('|') === '3 clicks|1 clicks', `la pelea X actualiza el suyo, incluso con apodo raro (${a[0].marcadores})`);

// Cada barra corre por su cuenta.
const b1 = a[0].barra;
await wait(700);
a = await avisos();
ok(a[0].barra < b1 && a[1].barra < 100, `las dos barras bajan (${b1} -> ${a[0].barra}, ${a[1].barra})`);

await inyectar({ type: 'qte_resolved', card_id: X, winner: 'Luis' });
a = await avisos();
ok(a.length === 1 && a[0].jugadores[0] === 'Pepe', 'resolver una cierra solo su aviso');
await inyectar({ type: 'qte_resolved', card_id: Y, winner: 'Pepe' });
ok((await avisos()).length === 0, 'y la otra, la suya');
ok(p.errores.length === 0, `sin errores de JavaScript${p.errores.length ? ': ' + p.errores.join(' | ') : ''}`);

// ── Oferta de bots ───────────────────────────────────────────────────────
const oferta = q => q.evaluate(() => !document.getElementById('quickBotOffer').hidden);

// a) partida rápida y nadie llega: la oferta sale.
const q1 = await pagina(await browser.newContext({ viewport: { width: 390, height: 700 } }));
await q1.getByPlaceholder(/Jugador1/).fill('Rapido');
await q1.getByRole('button', { name: /Partida rápida/ }).click();
await q1.locator('#lobbyScreen.active').waitFor({ timeout: 5000 });
ok(!(await oferta(q1)), 'recién entrado, la oferta no está');
await wait(13000);
ok(await oferta(q1), 'tras 12 s solo, la oferta de bots aparece');

// b) «Seguir esperando» la cierra y no vuelve con el siguiente lobby_update.
await q1.getByRole('button', { name: /Seguir esperando/ }).click();
ok(await q1.evaluate(() => cameFromQuickMatch === false), 'descartar la oferta apaga cameFromQuickMatch');
await q1.evaluate(() => handleMsg({ type: 'lobby_update', players: [{ id: currentPlayerId, nickname: 'Rapido' }], max_players: 4 }));
await wait(13000);
ok(!(await oferta(q1)), 'un lobby_update con un jugador no la reabre tras descartarla');

// c) salir y crear otra sala: nada de oferta.
await q1.evaluate(() => leaveLobby());
await q1.evaluate(() => { cameFromQuickMatch = true; });   // peor caso: bandera sucia
await q1.getByRole('button', { name: /Crear sala/ }).click();
await q1.getByRole('button', { name: /Empezar/ }).click();
await q1.locator('#lobbyScreen.active').waitFor({ timeout: 5000 });
ok(await q1.evaluate(() => cameFromQuickMatch === false), 'crear sala apaga cameFromQuickMatch');
await wait(13000);
ok(!(await oferta(q1)), 'en la sala nueva con un jugador no sale la oferta de bots');

// d) partida rápida y salir: la bandera se apaga.
const q2 = await pagina(await browser.newContext());
await q2.getByPlaceholder(/Jugador1/).fill('Rapido2');
await q2.getByRole('button', { name: /Partida rápida/ }).click();
await q2.locator('#lobbyScreen.active').waitFor({ timeout: 5000 });
await q2.evaluate(() => leaveLobby());
ok(await q2.evaluate(() => cameFromQuickMatch === false), 'salir de la sala apaga cameFromQuickMatch');

// e) aceptar la oferta apaga la bandera y los lobby_update siguientes no la rearman.
await q2.getByPlaceholder(/Jugador1/).fill('Rapido3');
await q2.getByRole('button', { name: /Partida rápida/ }).click();
await q2.locator('#lobbyScreen.active').waitFor({ timeout: 5000 });
await q2.evaluate(() => acceptBotsOffer());
ok(await q2.evaluate(() => cameFromQuickMatch === false), 'aceptar la oferta apaga cameFromQuickMatch');
ok(q2.errores.length === 0 && q1.errores.length === 0, 'sin errores de JavaScript en las pestañas de la oferta');

await browser.close();
fin();
