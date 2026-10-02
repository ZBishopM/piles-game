// Mirar una partida desde «Unirse»: la lista, «Mirando desde», «Todos», y volver a la sala.
//
//   node browser/mirar.mjs [--base=local|beta] [--ver]      (tarda ~45 s: espera la gracia de 30 s)
//
// Tres pestañas: Ana y Beto juegan, Caro mira. Lo importante es que lo que Caro
// ve de cada uno **son las cartas de verdad** de ese jugador (se comparan por
// `data-card-id` con el `allSets` de su propia pestaña), no una aproximación.
import { lanzar, ok, info, fin, wait, base, pagina } from './comun.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const browser = await lanzar();
const capturas = process.env.CAPTURAS || path.join(os.tmpdir(), 'piles-mirar');
fs.mkdirSync(capturas, { recursive: true });

async function pestana(nick, url, viewport = { width: 1100, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(n => localStorage.setItem('piles_nickname', n), nick);
  const p = await ctx.newPage();
  p.errores = [];
  p.on('pageerror', e => p.errores.push(e.message));
  await p.goto(url, { waitUntil: 'networkidle' });
  return p;
}
/** Los ids de las 4 cartas del set abierto (null = hueco) de una pestaña que JUEGA. */
const suyas = (p, set) => p.evaluate(s => allSets[s ?? currentSetIndex].map(c => (c ? c.id : null)), set ?? null);
/** Lo que se pinta en una fila de cartas del espectador. */
const pintadas = (p, sel) => p.locator(`${sel} > *`).evaluateAll(es => es.map(e => (e.dataset.cardId !== undefined ? Number(e.dataset.cardId) : null)));
const mismas = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── Ana abre la sala, Beto entra, Caro se queda en «Unirse» ─────────────────
const ctxA = await browser.newContext({ viewport: { width: 1100, height: 900 } });
const A = await pagina(ctxA);
await A.getByPlaceholder(/Jugador1/).fill('Ana');
await A.getByRole('button', { name: /Crear sala/ }).click();
await A.getByRole('button', { name: /Empezar/ }).click();
await A.locator('#lobbyScreen.active').waitFor({ timeout: 5000 });
const codigo = (await A.locator('#lobbyCodeDisplay').textContent()).trim();
const B = await pestana('Beto', `${base}/lobby.html?join=${codigo}`);
await B.locator('#lobbyScreen.active').waitFor({ timeout: 8000 });

const S = await pestana('Caro', `${base}/lobby.html`);
await S.evaluate(() => openJoinScreen());
await S.locator('.lobby-row', { hasText: codigo }).waitFor({ timeout: 5000 });
// (Solo nuestra sala: en un servidor compartido puede haber otras partidas en curso.)
ok((await S.locator('.lobby-row.en-curso', { hasText: codigo }).count()) === 0, 'con la sala en espera, la lista la enseña para jugar (no en curso)');
ok(/Para jugar/.test(await S.locator('#lobbyList').textContent()) && /Partidas en curso/.test(await S.locator('#lobbyList').textContent()),
   'la lista tiene las dos secciones: «Para jugar» y «Partidas en curso»');

// ── Empieza la partida: la lista de Caro se refresca sola ──────────────────
await A.locator('#readyBtn').click();
await B.locator('#readyBtn').click();
await A.locator('#gameScreen.active').waitFor({ timeout: 8000 });
await B.locator('#gameScreen.active').waitFor({ timeout: 8000 });
const fila = S.locator('.lobby-row.en-curso', { hasText: codigo });
await fila.waitFor({ timeout: 9000 });   // el refresco es cada 4 s
const textoFila = await fila.textContent();
ok(/En partida/.test(textoFila) && /2 jugadores/.test(textoFila) && /Mirar/.test(textoFila), `sin pulsar nada, la partida pasa a «En partida · 2 jugadores · Mirar» (${textoFila})`);
await S.screenshot({ path: path.join(capturas, 'lista.png') });

// ── Caro la mira ───────────────────────────────────────────────────────────
await fila.click();
await S.locator('#gameScreen.espectador').waitFor({ timeout: 8000 });
await S.locator('#specCards .card').first().waitFor({ timeout: 5000 });
ok(await S.locator('#espectadorBanda').textContent().then(t => /estás mirando/.test(t) && /Salir de la sala/.test(t)), 'la banda dice «estás mirando» y tiene «Salir de la sala»');
const botones = await S.locator('.spec-seat').evaluateAll(es => es.map(e => e.textContent));
ok(JSON.stringify(botones) === JSON.stringify(['Ana', 'Beto', 'Todos']), `«mirando desde»: ${botones.join(' · ')}`);
ok((await S.locator('#yourCards').isHidden()) && (await S.locator('#setNav').isHidden()), 'y no tiene mano ni botones de set propios');

// ── Cada perspectiva es la de verdad ───────────────────────────────────────
await S.locator('.spec-seat', { hasText: 'Ana' }).click();
ok(mismas(await pintadas(S, '#specCards'), await suyas(A)), 'viendo a Ana: las 4 cartas son las de su set abierto');
await S.locator('.spec-seat', { hasText: 'Beto' }).click();
ok(mismas(await pintadas(S, '#specCards'), await suyas(B)), 'viendo a Beto: las de Beto');
await S.locator('.spec-seat', { hasText: 'Ana' }).click();
await S.locator('#specSetNav .set-btn[data-set="3"]').click();
ok(mismas(await pintadas(S, '#specCards'), await suyas(A, 3)), 'y al abrir el set 4 de Ana, las 4 cartas de ese set suyo');
ok(await S.locator('#specSetNav .set-btn.active').getAttribute('data-set') === '3', 'con ese set marcado');
await S.screenshot({ path: path.join(capturas, 'uno-a-uno.png') });

// ── Todos a la vez ─────────────────────────────────────────────────────────
await S.locator('.spec-seat', { hasText: 'Todos' }).click();
ok((await S.locator('#specAll .spec-mini-set').count()) === 12, '«Todos»: 6 sets de cada uno = 12 minisets');
const todasAna = await S.locator('#specAll .spec-player').first().locator('.card').evaluateAll(es => es.map(e => (e.dataset.cardId !== undefined ? Number(e.dataset.cardId) : null)));
const todasSuyas = await A.evaluate(() => allSets.flat().map(c => (c ? c.id : null)));
ok(todasAna.length === 24 && mismas(todasAna, todasSuyas), 'y las 24 cartas de Ana, en su orden, son las suyas');
ok((await S.locator('#specAll .spec-player').count()) === 2 && (await S.locator('#specAll .card').count()) === 48, '48 cartas en total (2 × 24)');
await S.screenshot({ path: path.join(capturas, 'todos.png') });

// ── Lo que hacen se ve ─────────────────────────────────────────────────────
await S.locator('.spec-seat', { hasText: 'Ana' }).click();
await S.locator('#specSetNav .set-btn[data-set="0"]').click();
const cartaSoltada = (await suyas(A, 0))[0];
await A.evaluate(() => send({ type: 'drop_card', my_card_index: 0 }));
await S.locator('#specCards .card-empty').waitFor({ timeout: 2500 });
ok(await S.locator('#specEstado').textContent().then(t => /debe una carta \(set 1, hueco 1\)/.test(t)), 'Ana suelta una carta: Caro ve el hueco y «debe una carta (set 1, hueco 1)»');
await S.locator('.spec-seat', { hasText: 'Todos' }).click();
ok((await S.locator('#specAll .spec-player').first().locator('.card-empty').count()) === 1, 'y en «Todos» el hueco también');
await A.evaluate(id => send({ type: 'take_card', card_id: centerCards.find(c => c.id !== id).id }), cartaSoltada);
await S.locator('.spec-seat', { hasText: 'Ana' }).click();
await S.waitForFunction(() => document.querySelectorAll('#specCards .card-empty').length === 0, null, { timeout: 4000 });
ok(await S.locator('#specEstado').textContent().then(t => /sin deuda/.test(t)), 'Ana coge otra: el hueco se tapa y vuelve a «sin deuda»');

// ── En el móvil ─────────────────────────────────────────────────────────────
await S.setViewportSize({ width: 390, height: 844 });
await wait(300);
ok(!(await S.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'en 390 px, uno a uno no desborda');
await S.locator('.spec-seat', { hasText: 'Todos' }).click();
await wait(300);
ok(!(await S.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'y «Todos» tampoco');
await S.screenshot({ path: path.join(capturas, 'todos-movil.png'), fullPage: true });
await S.setViewportSize({ width: 1100, height: 900 });

// ── Salir mirando ───────────────────────────────────────────────────────────
{
  const D = await pestana('Dani', `${base}/lobby.html?join=${codigo}`);
  await D.locator('#gameScreen.espectador').waitFor({ timeout: 8000 });
  await D.locator('#espectadorBanda button').click();
  await D.locator('#homeScreen.active').waitFor({ timeout: 4000 });
  ok(true, '«Salir de la sala» devuelve a quien mira al inicio');
  await D.context().close();
}

// ── La partida acaba: Caro vuelve a la sala de espera ──────────────────────
info('Beto se va; esperando los 30 s de gracia hasta que se cancele la partida…');
await B.evaluate(() => leaveLobby());
await S.locator('#lobbyScreen.active').waitFor({ timeout: 45000 });
ok(true, 'al acabar la partida Caro está en la sala de espera, sin hacer nada');
await wait(500);
ok(await S.evaluate(() => soyEspectador === false), 'ya no es espectador: se ha sentado a la mesa');
const nombres = await S.locator('#playerList .player-name').evaluateAll(es => es.map(e => e.textContent));
ok(nombres.includes('Ana') && nombres.includes('Caro'), `la lista de la sala: ${nombres.join(', ')}`);
ok(await S.locator('#readyBtn').isVisible(), 'con su botón de «Listo» para la siguiente');
ok((await S.locator('#lobbyCodeDisplay').textContent()).trim() === codigo, 'y el código de la sala');
await S.locator('#chatInput').fill('lista la siguiente');
await S.locator('#chatInput').press('Enter');
await A.locator('#chatLog .chat-line', { hasText: 'lista la siguiente' }).waitFor({ timeout: 4000 });
ok(true, 'y puede escribir en el chat: Ana lo recibe');
await S.screenshot({ path: path.join(capturas, 'sala-despues.png') });

for (const [n, p] of [['Ana', A], ['Beto', B], ['Caro', S]]) {
  ok(p.errores.length === 0, `${n}: sin errores de JavaScript${p.errores.length ? ': ' + p.errores.join(' | ') : ''}`);
}
info(`capturas en ${capturas}`);
await browser.close();
fin();
