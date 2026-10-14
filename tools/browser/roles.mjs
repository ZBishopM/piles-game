// La lista con estados y el botón de rol (jugar ↔ mirar) en el navegador.
//
//   node browser/roles.mjs [--base=local|beta] [--ver]        (~25 s)
//
// - «Unirse» enseña UNA lista con una etiqueta por sala («en espera», «empezando»,
//   «jugando»), ordenada por estado, y dice qué pasará al tocarla.
// - Tocar una sala llena entra a MIRAR y deja ver la sala de espera (lista, chat,
//   aviso «Estás mirando»), sin «Listo» ni bots.
// - El botón de la sala alterna: «Quiero jugar» (cola si no hay hueco, «Salir de la
//   cola»), se sienta si hay hueco y «Pasar a espectador» lo devuelve a mirar.
// - 390x700 y 1280x800 sin desborde, botón ≥ 40 px, sin errores de JavaScript.
//   Capturas en $CAPTURAS (o en la carpeta temporal).
import { lanzar, ok, info, fin, wait, base } from './comun.mjs';
import { crear, unirse, send, esperar, pinguear } from '../repro/comun.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const browser = await lanzar();
const capturas = process.env.CAPTURAS || path.join(os.tmpdir(), 'piles-roles');
fs.mkdirSync(capturas, { recursive: true });
const MOVIL = { width: 390, height: 700 }, ESCRITORIO = { width: 1280, height: 800 };

async function pestana(nick, viewport, url = `${base}/lobby.html`) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  await ctx.addInitScript(n => localStorage.setItem('piles_nickname', n), nick);
  const p = await ctx.newPage();
  p.errores = [];
  p.on('pageerror', e => p.errores.push(e.message));
  await p.goto(url, { waitUntil: 'networkidle' });
  return p;
}
const foto = (p, nombre) => p.screenshot({ path: path.join(capturas, nombre + '.png'), fullPage: true });
const sinDesborde = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const fila = (p, codigo) => p.locator('.lobby-row', { hasText: codigo });
const pings = [];

// ── Cuatro salas en los tres estados ───────────────────────────────────────
const r1 = await crear('Ana1', { max_players: 4 });                    // en espera, con hueco
const r4 = await crear('Ana4', { max_players: 2 });                    // en espera, llena
const b4 = await unirse('Beto4', r4.lobby);
const r3 = await crear('Ana3', { max_players: 2 });                    // jugando
const b3 = await unirse('Beto3', r3.lobby);
send(r3, { type: 'set_ready', ready: true });
send(b3, { type: 'set_ready', ready: true });
await esperar(r3, m => m.type === 'game_start', 8000);
pings.push(pinguear(r3), pinguear(b3));
const r2 = await crear('Ana2', { max_players: 4 });                    // empezando (más abajo)
const b2 = await unirse('Beto2', r2.lobby);

const M = await pestana('Movil', MOVIL);
const E = await pestana('Escritorio', ESCRITORIO);
for (const p of [M, E]) await p.evaluate(() => openJoinScreen());
for (const p of [M, E]) for (const r of [r1, r3, r4]) await fila(p, r.lobby).waitFor({ timeout: 6000 });

// ── La lista: etiquetas, orden y texto de la acción ────────────────────────
{
  const t = async (r) => ({
    tag: await fila(M, r.lobby).locator('.lr-tag').textContent(),
    texto: await fila(M, r.lobby).textContent(),
    nombre: await fila(M, r.lobby).getAttribute('aria-label'),
  });
  const [t1, t4, t3] = [await t(r1), await t(r4), await t(r3)];
  ok(t1.tag === 'en espera' && /1\/4/.test(t1.texto) && /Entrarás a jugar/.test(t1.texto), `sala con hueco: «en espera», 1/4, «Entrarás a jugar» (${t1.texto})`);
  ok(t4.tag === 'en espera' && /2\/2/.test(t4.texto) && /Entrarás a mirar/.test(t4.texto), `sala llena: «en espera», 2/2, «Entrarás a mirar» (${t4.texto})`);
  ok(t3.tag === 'jugando' && /Entrarás a mirar/.test(t3.texto), `sala en partida: «jugando», «Entrarás a mirar» (${t3.texto})`);
  ok(/en espera/.test(t4.nombre) && /Entrarás a mirar/.test(t4.nombre) && /2 de 2 jugadores/.test(t4.nombre), `el nombre accesible lo dice todo (${t4.nombre})`);

  // Orden: en espera (la más llena primero), después empezando, después jugando.
  const orden = await M.locator('.lobby-row').evaluateAll(es => es.map(e => [e.querySelector('.lr-code').textContent, e.querySelector('.lr-tag').className.split(' ')[1]]));
  const rank = { waiting: 0, starting: 1, playing: 2 };
  ok(orden.every((x, i) => i === 0 || rank[orden[i - 1][1]] <= rank[x[1]]), `ordenada por estado: ${orden.map(x => x[1][0]).join('')}`);
  const pos = r => orden.findIndex(x => x[0] === r.lobby);
  ok(pos(r4) < pos(r1) && pos(r1) < pos(r3), 'dentro de «en espera», la más llena primero; «jugando» al final');
}

// ── «Empezando»: la cuenta atrás abierta se ve en la lista ─────────────────
{
  send(r2, { type: 'set_ready', ready: true });
  send(b2, { type: 'set_ready', ready: true });
  const t0 = Date.now();
  let visto = false;
  while (Date.now() - t0 < 2800 && !visto) {
    await M.evaluate(() => refreshLobbies());
    await wait(200);
    visto = (await fila(M, r2.lobby).locator('.lr-tag.starting').count()) > 0;
  }
  ok(visto, 'durante la cuenta atrás la sala sale «empezando»');
  if (visto) {
    const tx = await fila(M, r2.lobby).textContent();
    ok(/empezando/.test(tx) && /Entrarás a mirar/.test(tx), `y dice «Entrarás a mirar» (${tx})`);
    await E.evaluate(() => refreshLobbies());
    await wait(150);
    await foto(M, 'lista-movil');
    await foto(E, 'lista-escritorio');
  }
  await esperar(r2, m => m.type === 'game_start', 8000);
  pings.push(pinguear(r2), pinguear(b2));
  await M.evaluate(() => refreshLobbies());
  await fila(M, r2.lobby).locator('.lr-tag.playing').waitFor({ timeout: 4000 });
  ok(true, 'y al repartir pasa a «jugando» sin tocar nada');
}
ok(await sinDesborde(M) && await sinDesborde(E), 'la lista no desborda en 390 ni en 1280');

// ── Tocar una sala llena: entras a mirar la sala de espera ─────────────────
await fila(M, r4.lobby).click();
await M.locator('#lobbyScreen.active').waitFor({ timeout: 5000 });
await M.locator('#lobbyScreen.espera-hueco').waitFor({ timeout: 3000 });
{
  ok(await M.evaluate(() => soyEspectador === true && enCola === false), 'entras como espectador, sin hacer cola (mirar por gusto)');
  ok(await M.locator('#huecoBanda').isVisible() && /Estás mirando/.test(await M.locator('#huecoBanda').textContent()), 'aviso «Estás mirando»');
  ok(!(await M.locator('#readyBtn').isVisible()) && !(await M.locator('#botControls').isVisible()), 'sin botón de «Listo» ni bots');
  const nombres = await M.locator('#playerList .player-name').evaluateAll(es => es.map(e => e.textContent));
  ok(nombres.join() === 'Ana4,Beto4', `ve la lista de jugadores (${nombres})`);
  ok(/de 2 listos/.test(await M.locator('#readyCount').textContent()) && await M.locator('#readyCount').isVisible(), 'y el recuento de listos');
  ok(await M.locator('#chatBox').isVisible(), 'y el chat');
  const btn = M.locator('#rolBtn');
  ok(/Quiero jugar/.test(await btn.textContent()), 'el botón dice «Quiero jugar»');
  ok((await btn.boundingBox()).height >= 40, `y mide ${Math.round((await btn.boundingBox()).height)} px de alto (≥ 40)`);
  await foto(M, 'mirando-movil');

  // Sin hueco: cola.
  await btn.click();
  await M.waitForFunction(() => enCola === true, null, { timeout: 3000 });
  ok(/Salir de la cola/.test(await btn.textContent()) && /te sentarás en cuanto haya un hueco/.test(await M.locator('#huecoBanda').textContent()),
     'sin hueco: «Salir de la cola» y «te sentarás en cuanto haya un hueco»');
  await foto(M, 'en-cola-movil');
  await btn.click();
  await M.waitForFunction(() => enCola === false, null, { timeout: 3000 });
  ok(/Quiero jugar/.test(await btn.textContent()), '«Salir de la cola» vuelve a mirar por gusto');

  // Se libera un hueco: no se sienta solo; lo pide y se sienta ya.
  send(b4, { type: 'leave_lobby' });
  await M.waitForFunction(() => document.getElementById('playerCount').textContent === '1', null, { timeout: 3000 });
  await wait(500);
  ok(await M.evaluate(() => soyEspectador === true), 'con hueco libre, quien mira por gusto sigue mirando');
  await btn.click();
  await M.waitForFunction(() => soyEspectador === false, null, { timeout: 3000 });
  await M.locator('#readyBtn').waitFor({ state: 'visible', timeout: 3000 });
  ok(/Pasar a espectador/.test(await btn.textContent()) && !(await M.locator('#lobbyScreen').evaluate(e => e.classList.contains('espera-hueco'))),
     '«Quiero jugar» con hueco: te sientas (aparece «Estoy listo») y el botón pasa a «Pasar a espectador»');
  ok((await btn.boundingBox()).height >= 40, 'también ≥ 40 px');
  await foto(M, 'sentado-movil');
  ok(await sinDesborde(M), 'sin desborde en 390');

  // Y de vuelta a mirar.
  await btn.click();
  await M.waitForFunction(() => soyEspectador === true, null, { timeout: 3000 });
  await M.locator('#lobbyScreen.espera-hueco').waitFor({ timeout: 3000 });
  ok(/Quiero jugar/.test(await btn.textContent()) && !(await M.locator('#readyBtn').isVisible()), '«Pasar a espectador» te devuelve a mirar');
}

// ── Escritorio: sala con hueco, entras a jugar, y el botón en 1280 ─────────
{
  await fila(E, r1.lobby).click();
  await E.locator('#lobbyScreen.active').waitFor({ timeout: 5000 });
  await E.locator('#readyBtn').waitFor({ state: 'visible', timeout: 3000 });
  ok(await E.evaluate(() => soyEspectador === false), 'tocar «en espera» con hueco entra a jugar');
  const btn = E.locator('#rolBtn');
  ok(/Pasar a espectador/.test(await btn.textContent()) && await btn.isVisible(), 'con el botón «Pasar a espectador»');
  await foto(E, 'sentado-escritorio');
  await btn.click();
  await E.waitForFunction(() => soyEspectador === true, null, { timeout: 3000 });
  await E.locator('#lobbyScreen.espera-hueco').waitFor({ timeout: 3000 });
  ok(await E.locator('#huecoBanda').isVisible() && /Quiero jugar/.test(await btn.textContent()), 'y pasa a mirar: aviso y «Quiero jugar»');
  await foto(E, 'mirando-escritorio');
  ok(await sinDesborde(E), 'sin desborde en 1280');
  // Salir de la sala la última persona sentada: la sala persiste mientras miren.
  await E.getByRole('button', { name: /Salir de la sala/ }).click();
  await E.locator('#homeScreen.active').waitFor({ timeout: 3000 });
  ok(true, '«Salir de la sala» sigue funcionando mirando');
}

for (const [n, p] of [['Movil', M], ['Escritorio', E]]) {
  ok(p.errores.length === 0, `${n}: sin errores de JavaScript${p.errores.length ? ': ' + p.errores.join(' | ') : ''}`);
}
info(`capturas en ${capturas}`);
pings.forEach(p => p());
await browser.close();
fin();
