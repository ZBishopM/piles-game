// La sala de espera: chat, Elo con rango coloreado junto a cada nombre, y la pantalla final sin puntos.
//
//   node browser/sala.mjs [--base=local|beta] [--ver]
//
// - El chat llega a todos, quien entra tarde ve el historial, y lo que escribe o
//   se llama cualquiera se pinta como TEXTO (nada de `innerHTML`).
// - Cada nombre lleva su Elo y su rango con el color del rango; la clasificación
//   (For glory / For fun) sale del servidor y cambia al añadir un bot.
// - La pantalla final enseña puesto, nombre y ±Elo: ni puntos ni combo.
//
// Los diales de rango de la pantalla final tienen su propia prueba (rangos.mjs).
import { lanzar, pagina, ok, info, fin, wait, base } from './comun.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const browser = await lanzar();
const capturas = process.env.CAPTURAS || path.join(os.tmpdir(), 'piles-sala');
fs.mkdirSync(capturas, { recursive: true });

/** Una pestaña en su propio contexto (su propia clave de Elo), ya dentro de la sala. */
async function entrarPorEnlace(nick, codigo, viewport = { width: 1100, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(n => localStorage.setItem('piles_nickname', n), nick);
  const p = await ctx.newPage();
  p.errores = [];
  p.on('pageerror', e => p.errores.push(e.message));
  await p.goto(`${base}/lobby.html?join=${codigo}`, { waitUntil: 'networkidle' });
  await p.locator('#lobbyScreen.active').waitFor({ timeout: 8000 });
  return p;
}
const escribir = async (p, texto) => {
  await p.locator('#chatInput').fill(texto);
  await p.locator('#chatInput').press('Enter');
};
const lineas = p => p.locator('#chatLog .chat-line');

// ── Ana abre la sala; Beto entra ────────────────────────────────────────────
const ctxA = await browser.newContext({ viewport: { width: 1100, height: 900 } });
const A = await pagina(ctxA);
await A.getByPlaceholder(/Jugador1/).fill('Ana');
await A.getByRole('button', { name: /Crear sala/ }).click();
await A.getByRole('button', { name: /Empezar/ }).click();
await A.locator('#lobbyScreen.active').waitFor({ timeout: 5000 });
const codigo = (await A.locator('#lobbyCodeDisplay').textContent()).trim();
const B = await entrarPorEnlace('Beto', codigo);
await wait(600);

// ── Orden, botón de «listo» en la fila propia y desplegable de bots ────────
{
  const y = s => A.locator(s).evaluate(e => e.getBoundingClientRect().top);
  const [yl, yc, yb] = [await y('#playerList'), await y('#chatBox'), await y('#botControls')];
  ok(yl < (await y('#readyCount')) && (await y('#readyCount')) < yc && yc < yb, 'orden: lista, recuento, chat y, al final, bots');
  ok((await A.locator('#playerList li.mine #readyBtn').count()) === 1 && (await A.locator('#readyBtn').count()) === 1,
    'el botón de listo está dentro de la fila propia, y es el único');
  ok((await A.locator('#playerList li:not(.mine) #readyBtn').count()) === 0 && (await A.locator('#playerList li:not(.mine) .ready-status').count()) === 1,
    'la fila de Beto sigue con su ⏳');
  ok((await A.locator('#botsToggle').getAttribute('aria-expanded')) === 'true', 'quien abrió la sala solo la ve con los bots abiertos');
  await A.locator('#botsToggle').focus();
  await A.keyboard.press('Enter');
  ok((await A.locator('#botsToggle').getAttribute('aria-expanded')) === 'false', 'con el teclado se cierra');
  await wait(400);
  ok(!(await A.getByRole('button', { name: /Añadir bot/ }).count()), 'cerrado, «Añadir bot» no está al alcance');
  await B.locator('#readyBtn').focus();
  await B.locator('#readyBtn').click();                       // listo
  await A.waitForFunction(() => document.getElementById('readyCount').textContent.startsWith('1 de'), null, { timeout: 4000 });
  ok(await A.locator('#playerList li:not(.mine) .ready-status').first().textContent() === '✅ Listo', 'Ana ve a Beto listo en su fila');
  ok((await B.locator('#readyBtn').textContent()) === '✅ Listo' && await B.locator('#readyBtn').evaluate(e => e === document.activeElement),
    'Beto: el botón dice «✅ Listo» y conserva el foco tras redibujarse');
  await B.locator('#readyBtn').click();                       // y cancelado
  await B.waitForFunction(() => document.getElementById('readyBtn').textContent === 'Estoy listo');
  await A.waitForFunction(() => document.getElementById('readyCount').textContent.startsWith('0 de'), null, { timeout: 4000 });
  ok(true, 'vuelve a «Estoy listo»');
  // Llega otro mientras Ana lo tiene cerrado a mano: no se reabre solo.
  const Cx = await entrarPorEnlace('Caro', codigo);
  await wait(500);
  ok((await A.locator('#botsToggle').getAttribute('aria-expanded')) === 'false', 'lo cerrado a mano sigue cerrado cuando llega gente');
  await A.locator('#botsToggle').click();
  await A.getByRole('button', { name: /Añadir bot/ }).waitFor({ timeout: 2000 });
  ok(true, 'y al abrirlo aparece «Añadir bot»');
  await Cx.context().close();
  await wait(400);
  // Móvil: sin desborde y con el botón a mano.
  const M = await entrarPorEnlace('Mov', codigo, { width: 390, height: 700 });
  await wait(500);
  ok(await M.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'móvil 390: sin desborde horizontal');
  const caja = await M.locator('#readyBtn').boundingBox();
  ok(caja.height >= 40 && caja.x >= 0 && caja.x + caja.width <= 390, `móvil: el botón de listo mide ${caja.height} px de alto y cabe`);
  await M.context().close();
}

// ── Chat entre dos ──────────────────────────────────────────────────────────
await escribir(A, 'hola a todos');
await B.locator('#chatLog .chat-line').first().waitFor({ timeout: 4000 });
ok((await lineas(B).first().textContent()).includes('hola a todos'), 'lo que escribe Ana le llega a Beto');
ok((await lineas(A).count()) === 1, 'y Ana también lo ve, una sola vez');
ok(await lineas(A).first().evaluate(e => e.classList.contains('mine')), 'lo propio va marcado como propio');
await wait(450);
await escribir(B, 'buenas');
await lineas(A).nth(1).waitFor({ timeout: 4000 });
ok((await lineas(A).nth(1).textContent()).includes('buenas'), 'y lo de Beto le llega a Ana');

// ── El que entra tarde ve el historial; apodo y mensaje con marcado ────────
await wait(450);
const marcado = '<img src=x onerror="window.__xss=1">';
await escribir(A, marcado);
await lineas(B).nth(2).waitFor({ timeout: 4000 });
const C = await entrarPorEnlace('<b>Caro</b>', codigo);
await lineas(C).nth(2).waitFor({ timeout: 4000 });
ok((await lineas(C).count()) === 3, 'quien entra tarde recibe el historial entero (3 mensajes)');
for (const [nombre, p] of [['Ana', A], ['Beto', B], ['Caro', C]]) {
  ok(await p.evaluate(() => window.__xss === undefined), `${nombre}: el marcado de un mensaje no se ejecuta`);
}
ok((await C.locator('#chatLog .chat-text img').count()) === 0, 'el mensaje con <img> se pinta como texto, no como elemento');
ok((await C.locator('#chatLog .chat-text').nth(2).textContent()) === marcado, 'con el texto tal cual');
const nombreRaro = await A.locator('#playerList .player-name', { hasText: 'Caro' }).first().textContent();
ok(nombreRaro === '<b>Caro</b>' && (await A.locator('#playerList b').count()) === 0, `un apodo con etiquetas se pinta literal en la lista (${nombreRaro})`);

// ── Elo y rango junto a cada nombre ─────────────────────────────────────────
// Sin partidas todos tienen 1000: Hierro oxidado en glory.
const chips = await A.locator('#playerList .ag-rank-chip').evaluateAll(es => es.map(e => ({ rango: e.dataset.rank, elo: e.querySelector('.ag-rank-elo')?.textContent, nombre: e.querySelector('.ag-rank-name')?.textContent, titulo: e.title })));
info(JSON.stringify(chips));
ok(chips.length === 3 && chips.every(c => c.rango === 'hierro' && c.elo === '1000'), 'tres chips: 1000 · Hierro oxidado (For glory, sin partidas)');
ok(await A.locator('#poolNote').textContent().then(t => /For glory/.test(t)), 'la sala dice que el Elo es de For glory');

// Elo de otros rangos, inyectados como los mandaría el servidor.
await A.evaluate(() => handleMsg({
  type: 'lobby_update', pool: 'glory', ready_count: 0, max_players: 4, spectators: 0,
  players: [
    { id: currentPlayerId, nickname: 'Ana', is_ready: false, is_bot: false, elo: 1000, top3: false },
    { id: 'x', nickname: 'Beto', is_ready: false, is_bot: false, elo: 1250, top3: false },
    { id: 'y', nickname: '<b>Caro</b>', is_ready: true, is_bot: false, elo: 1700, top3: true },
  ],
}));
const colorDe = (p, sel) => p.locator(sel).first().evaluate(e => getComputedStyle(e).color);
const rangos = await A.locator('#playerList .ag-rank-chip').evaluateAll(es => es.map(e => e.dataset.rank));
ok(JSON.stringify(rangos) === JSON.stringify(['hierro', 'oro', 'top3']), `1000 → Hierro oxidado, 1250 → Oro, 1700 con Top 3 → Top 3 global (${rangos})`);
ok((await colorDe(A, '#playerList .ag-rank-chip[data-rank="hierro"] .ag-rank-name')) === 'rgb(176, 106, 56)', 'el nombre del rango lleva su color (hierro: #b06a38)');
ok((await colorDe(A, '#playerList .ag-rank-chip[data-rank="oro"] .ag-rank-name')) === 'rgb(242, 203, 92)', 'oro: #f2cb5c');
const top3 = await A.locator('#playerList .ag-rank-chip[data-rank="top3"] .ag-rank-name').evaluate(e => ({ c: getComputedStyle(e).color, bg: getComputedStyle(e).backgroundImage }));
ok(top3.c === 'rgba(0, 0, 0, 0)' && /linear-gradient/.test(top3.bg), 'el Top 3 va en degradado dorado-rosa-verde');
// El nombre de quien escribe toma el color de su rango.
ok(await A.locator('#chatLog .chat-name[data-from="Beto"]').evaluate(e => e.classList.contains('ag-rank-chip') && e.dataset.rank === 'oro' && getComputedStyle(e).color === 'rgb(242, 203, 92)'),
   'y en el chat, el nombre de Beto sale en el color de su rango (oro)');
await A.screenshot({ path: path.join(capturas, 'sala-glory.png') });

// ── Un bot: la clasificación pasa a For fun ────────────────────────────────
// Se vuelve a pedir la sala real al servidor añadiendo un bot.
await A.getByRole('button', { name: /Añadir bot/ }).click();
await A.waitForFunction(() => /For fun/.test(document.getElementById('poolNote')?.textContent ?? ''), null, { timeout: 5000 });
const enFun = await A.locator('#playerList .ag-rank-chip').evaluateAll(es => es.map(e => ({ rango: e.dataset.rank, titulo: e.title })));
ok(enFun.length === 4 && enFun.every(c => c.rango === 'carton' && /For fun/.test(c.titulo)), `con un bot (Normal, 1000) todos pasan a rangos de For fun: Cartón (${enFun.map(c => c.rango)})`);
await A.screenshot({ path: path.join(capturas, 'sala-fun.png') });
// Y al echarlo, vuelve a For glory (y queda sitio para el cuarto).
await A.locator('.kick-bot').click();
await A.waitForFunction(() => /For glory/.test(document.getElementById('poolNote')?.textContent ?? ''), null, { timeout: 5000 });
ok(true, 'al echar el bot la sala vuelve a For glory');

// ── En el móvil ─────────────────────────────────────────────────────────────
{
  const M = await entrarPorEnlace('Movil', codigo, { width: 390, height: 844 });
  await wait(500);
  const desborda = await M.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  ok(!desborda, 'en 390 px la sala no desborda en horizontal');
  const tam = await M.locator('#chatInput').evaluate(e => parseFloat(getComputedStyle(e).fontSize));
  ok(tam >= 16, `el campo del chat tiene ${tam}px: iOS no hace zoom al enfocarlo`);
  await M.screenshot({ path: path.join(capturas, 'sala-movil.png'), fullPage: true });
  await M.context().close();
}

// ── Pantalla final: sin puntos ni combo ────────────────────────────────────
await A.evaluate(() => {
  currentNickname = 'Ana';
  onGameOver(
    [
      { position: 1, nickname: '<i>Zeta</i>', points: 100, combo_points: 30, best_combo: 5, best_mult_x100: 300 },
      { position: 2, nickname: 'Ana', points: 75, combo_points: 0, best_combo: 0, best_mult_x100: 100 },
    ],
    [{ nickname: 'Ana', pool: 'glory', before: 1000, after: 984, top3_before: false, top3_after: false }],
  );
});
await wait(400);
const final = await A.evaluate(() => ({
  puntos: document.querySelectorAll('#rankingList .rank-points').length,
  combo: document.querySelectorAll('#rankingList .rank-combo').length,
  texto: document.getElementById('rankingList').textContent,
  filas: [...document.querySelectorAll('#rankingList .ranking-entry')].map(f => [...f.children].map(c => c.className.trim())),
  nombre: document.querySelector('#rankingList .rank-name').textContent,
  etiquetas: document.querySelectorAll('#rankingList i').length,
  elo: document.querySelector('#rankingList .rank-elo')?.textContent,
}));
info(JSON.stringify(final.filas));
ok(final.puntos === 0 && final.combo === 0, 'la pantalla final no tiene puntos ni combo');
ok(!/pts|🔥|×/.test(final.texto), `y no queda ningún «pts», 🔥 ni ×N en el texto (${JSON.stringify(final.texto.replace(/\s+/g, ' ').trim())})`);
ok(final.filas.every(f => f.join(' ').startsWith('rank-pos rank-name')), 'cada fila: puesto, nombre y, si hay, el ±Elo');
ok(final.nombre === '<i>Zeta</i>' && final.etiquetas === 0, 'un apodo con marcado se pinta como texto también aquí');
ok(final.elo === '−16', `y el ±Elo sigue (${final.elo})`);
await A.screenshot({ path: path.join(capturas, 'final.png') });

for (const p of [A, B, C]) {
  ok(p.errores.length === 0, `sin errores de JavaScript${p.errores.length ? ': ' + p.errores.join(' | ') : ''}`);
}
info(`capturas en ${capturas}`);
await browser.close();
fin();
