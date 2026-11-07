// Coger del centro en el juego de verdad, contra un rival por websocket, grabado en video.
//   node browser/arrebato.mjs [carpeta de video] [--base=local|beta]
// 1 «pelea»: los dos piden la misma carta a la vez → la carta ya estaba en tu mano, el guante
//   del rival te la arranca y empieza la pelea.
// 2 «robo»: el rival la coge antes y tú, con la red lenta, la pides tarde → te la quita y se va.
import { lanzar, pagina, wait, ok, info, fin, conRetraso } from './comun.mjs';
import { unirse, send, esperar } from '../repro/comun.mjs';
const OUT = process.argv.slice(2).find(a => !a.startsWith('--')) ?? null;
const b = await lanzar();

async function mesa(nick) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2, ...(OUT && { recordVideo: { dir: OUT, size: { width: 390, height: 800 } } }) });
  const p = await pagina(ctx);
  await p.fill('#nombre', nick);
  await p.locator('#nombre').blur();
  await p.evaluate(() => juego.createLobby(4));
  await p.waitForFunction(() => !!juego.est.currentLobbyId, null, { timeout: 5000 });
  const r = await unirse('Rival', await p.evaluate(() => juego.est.currentLobbyId));
  await p.waitForFunction(() => juego.jugadoresEnSala >= 2, null, { timeout: 5000 });
  await p.evaluate(() => juego.toggleReady());
  send(r, { type: 'set_ready', ready: true });
  await p.locator('#gameScreen.active').waitFor({ timeout: 15000 });
  await esperar(r, m => m.type === 'game_start', 8000);
  await wait(2200);
  // Los dos sueltan una: los dos deben carta y hay dos en el centro.
  await p.evaluate(() => juego.onPlayerCardClick(0));
  send(r, { type: 'drop_card', my_card_index: 0 });
  await esperar(r, m => m.type === 'swap_success', 3000);
  await wait(900);
  const x = await p.evaluate(() => juego.est.centerCards[0].id);
  return { ctx, p, r, x };
}

{
  const { ctx, p, r, x } = await mesa('Pelea');
  await p.evaluate(x => juego.onCenterCardClick(x), x);
  send(r, { type: 'take_card', card_id: x });
  const c = await esperar(r, m => m.type === 'swap_conflict', 2000);
  ok(!!c, 'pelea: swap_conflict');
  await wait(150);
  const enMano = await p.evaluate(x => juego.est.allSets.flat().some(c => c?.id === x), x);
  ok(!enMano, 'pelea: la carta salió de tu mano');
  ok(await p.evaluate(() => juego.est.qteActive), 'pelea: la pelea empezó sin esperar a las manos');
  await wait(4000);
  info(`errores: ${JSON.stringify(p.errores)}`);
  r.ws.close(); await ctx.close();
}
{
  const { ctx, p, r, x } = await mesa('Robo');
  await conRetraso(p, 1000);        // tu red, muy lenta: aún ves la carta en el centro
  send(r, { type: 'take_card', card_id: x });
  await esperar(r, m => m.type === 'swap_success' && m.your_new_set?.some(c => c?.id === x), 2000);
  await wait(800);
  await p.evaluate(x => juego.onCenterCardClick(x), x);
  await wait(150);
  ok(await p.evaluate(x => juego.est.allSets.flat().some(c => c?.id === x), x), 'robo: al tocarla, ya está en tu mano');
  await wait(2600);
  const res = await p.evaluate(x => ({ mia: juego.est.allSets.flat().some(c => c?.id === x), qte: juego.est.qteActive }), x);
  info(`robo: ${JSON.stringify(res)}`);
  ok(!res.mia, 'robo: al final no es tuya');
  info(`errores: ${JSON.stringify(p.errores)}`);
  r.ws.close(); await ctx.close();
}
await b.close(); fin();
