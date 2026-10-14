// La votación para echar a alguien, en pantalla.
//
//   node browser/votekick.mjs [--base=local|beta|<url>] [--ver]
//
// Ana (la más antigua) abre la sala; entran Beto y «<i>Caro</i>». Ana pulsa «Echar»
// en la fila de Caro: la encuesta aparece pegada a esa fila (pregunta, contador,
// cuenta atrás, quién votó, Sí/No solo para quien vota), sin tapar «Listo» ni el
// chat y sin desbordar en 390x700 ni en 1280x800. Un No la cancela; con el Sí de
// Beto Caro vuelve a la lista de salas con el aviso. Capturas en `$CAPTURAS` o en
// la carpeta temporal (`votekick-*.png`). Apodos como texto, nunca como HTML.
import { lanzar, pagina, ok, info, fin, wait, base } from './comun.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const browser = await lanzar();
const capturas = process.env.CAPTURAS || path.join(os.tmpdir(), 'piles-votekick');
fs.mkdirSync(capturas, { recursive: true });
const DESK = { width: 1280, height: 800 }, MOV = { width: 390, height: 700 };

async function entrar(nick, codigo, viewport) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(n => localStorage.setItem('piles_nickname', n), nick);
  const p = await ctx.newPage();
  p.errores = [];
  p.on('pageerror', e => p.errores.push(e.message));
  await p.goto(`${base}/lobby.html?join=${codigo}`, { waitUntil: 'networkidle' });
  await p.locator('#lobbyScreen.active').waitFor({ timeout: 8000 });
  return p;
}
const fila = (p, nick) => p.locator('#playerList li', { has: p.locator('.player-name', { hasText: nick }) });

const A = await pagina(await browser.newContext({ viewport: DESK }));
await A.getByPlaceholder(/Jugador1/).fill('Ana');
await A.getByRole('button', { name: /Crear sala/ }).click();
await A.getByRole('button', { name: /Empezar/ }).click();
await A.locator('#lobbyScreen.active').waitFor({ timeout: 5000 });
const codigo = (await A.locator('#lobbyCodeDisplay').textContent()).trim();
const B = await entrar('Beto', codigo, MOV);
const C = await entrar('<i>Caro</i>', codigo, DESK);
await A.waitForFunction(() => document.querySelectorAll('#playerList li').length === 3);

// ── Solo la más antigua ve «Echar» ──────────────────────────────────────────
ok((await A.getByRole('button', { name: /Votar para echar/ }).count()) === 2, 'Ana ve «Echar» junto a Beto y a Caro');
ok((await B.getByRole('button', { name: /Votar para echar/ }).count()) === 0, 'Beto no ve ningún «Echar»');
ok((await A.locator('#playerList li.mine .kick-human').count()) === 0, 'y Ana no puede echarse a sí misma');

await A.screenshot({ path: path.join(capturas, 'votekick-echar-escritorio-1280x800.png') });

// ── Se abre ─────────────────────────────────────────────────────────────────
await A.getByRole('button', { name: 'Votar para echar a <i>Caro</i>' }).click();
await B.locator('.kick-poll').waitFor({ timeout: 4000 });
await C.locator('.kick-poll').waitFor({ timeout: 4000 });
const filaCaroB = fila(B, 'Caro');
ok((await filaCaroB.locator('.kick-poll').count()) === 1, 'la encuesta está dentro de la fila del votado');
ok((await B.locator('.kick-q').textContent()) === '¿Echar a <i>Caro</i>?' && (await B.locator('#playerList .kick-q i, #playerList .player-name i').count()) === 0, 'pregunta con el apodo como texto');
ok(/1 de 2 a favor/.test(await B.locator('.kick-meta').first().textContent()), 'contador: 1 de 2 (Ana ya cuenta como Sí)');
ok((await B.locator('.kick-poll [role=status]').count()) === 1, 'el aviso es role=status');
ok((await B.getByRole('button', { name: /Votar sí/ }).count()) === 1 && (await B.getByRole('button', { name: /Votar no/ }).count()) === 1, 'Beto (vota) tiene Sí y No');
ok((await A.locator('.kick-poll .kick-btns').count()) === 0, 'Ana ya votó: sin botones');
ok((await C.locator('.kick-poll .kick-btns').count()) === 0 && /Hay una votación para echarte/.test(await C.locator('.kick-q').textContent()), 'el votado ve la encuesta sobre él y no puede votar');
ok((await A.locator('#playerList .kick-human').first().isHidden()), 'mientras hay votación, «Echar» se oculta');
const t0 = parseInt(await B.locator('.kick-time').textContent());
await wait(1300);
ok(parseInt(await B.locator('.kick-time').textContent()) < t0, `la cuenta atrás baja (${t0} s)`);

// ── Capturas y que no tape nada ─────────────────────────────────────────────
async function medir(p, nombre, viewport) {
  await p.setViewportSize(viewport);
  await wait(250);
  const r = await p.evaluate(() => {
    const b = s => document.querySelector(s)?.getBoundingClientRect();
    const poll = b('.kick-poll'), chat = b('#chatBox'), listo = b('#readyBtn');
    return {
      desborda: document.documentElement.scrollWidth > innerWidth + 1,
      pollDentro: poll.left >= 0 && poll.right <= innerWidth,
      sobreChat: poll.bottom <= chat.top + 1,
      listoLibre: !(poll.top < listo.bottom && poll.bottom > listo.top && poll.left < listo.right && poll.right > listo.left),
    };
  });
  ok(!r.desborda && r.pollDentro, `${nombre}: sin desbordes, la encuesta cabe`);
  ok(r.sobreChat && r.listoLibre, `${nombre}: no tapa el chat ni el botón Listo`);
  await p.screenshot({ path: path.join(capturas, `votekick-${nombre}.png`), fullPage: true });
}
await medir(B, 'movil-390x700-votante', MOV);
await medir(A, 'escritorio-1280x800-iniciador', DESK);
await medir(C, 'escritorio-1280x800-votado', DESK);
await A.setViewportSize(MOV);
await medir(A, 'movil-390x700-iniciador', MOV);
await A.setViewportSize(DESK);

// ── Un No la cancela ────────────────────────────────────────────────────────
await B.getByRole('button', { name: /Votar no/ }).click();
await A.waitForFunction(() => /No se echa|Alguien votó No/.test(document.querySelector('.kick-q')?.textContent ?? ''), null, { timeout: 4000 });
ok(true, 'un No: el resultado se enseña unos segundos');
await A.waitForFunction(() => !document.querySelector('.kick-poll'), null, { timeout: 7000 });
ok((await A.getByRole('button', { name: /Votar para echar/ }).count()) === 2, 'y «Echar» vuelve');

// ── Con el Sí de Beto, fuera ────────────────────────────────────────────────
// (el mismo par espera 30 s; se prueba con Beto como votado en su lugar y Caro de votante)
await A.getByRole('button', { name: 'Votar para echar a Beto' }).click();
await C.getByRole('button', { name: /Votar sí/ }).click();
await B.locator('#joinScreen.active').waitFor({ timeout: 5000 });
ok(true, 'Beto, echado, vuelve a la lista de salas');
ok(/Te echaron de la sala/.test(await B.locator('body').innerText()), 'con el aviso «Te echaron de la sala»');
await A.waitForFunction(() => document.querySelectorAll('#playerList li').length === 2);
ok(/fue expulsado/.test(await A.locator('body').innerText()), 'los demás ven «Beto fue expulsado»');
await B.screenshot({ path: path.join(capturas, 'votekick-expulsado-movil.png') });

// ── Y no entra por el enlace ────────────────────────────────────────────────
await B.goto(`${base}/lobby.html?join=${codigo}`, { waitUntil: 'networkidle' });
await wait(1200);
ok(!(await B.locator('#lobbyScreen.active').count()), 'por el enlace tampoco vuelve a entrar');

// ── Recargar a media votación, y echar al único sin marcar ─────────────────
{
  const A2 = await pagina(await browser.newContext({ viewport: DESK }));
  await A2.getByPlaceholder(/Jugador1/).fill('Ana');
  await A2.getByRole('button', { name: /Crear sala/ }).click();
  await A2.getByRole('button', { name: /Empezar/ }).click();
  await A2.locator('#lobbyScreen.active').waitFor({ timeout: 5000 });
  const cod2 = (await A2.locator('#lobbyCodeDisplay').textContent()).trim();
  const B2 = await entrar('Beto', cod2, MOV);
  const C2 = await entrar('Caro', cod2, DESK);
  const D2 = await entrar('Dani', cod2, DESK);
  await A2.waitForFunction(() => document.querySelectorAll('#playerList li').length === 4);
  for (const p of [A2, B2, C2]) await p.locator('#readyBtn').click();     // Dani no
  await A2.waitForFunction(() => document.getElementById('readyCount').textContent.startsWith('3 de'));

  await A2.getByRole('button', { name: 'Votar para echar a Dani' }).click();
  await B2.getByRole('button', { name: /Votar sí/ }).click();
  await B2.waitForFunction(() => /tu voto: Sí/.test(document.querySelector('.kick-meta')?.textContent ?? ''));
  ok((await B2.getByRole('button', { name: /Votar (sí|no)/ }).count()) === 0, 'Beto ya votó: sin botones');
  await wait(2200);
  await B2.goto(base + '/lobby.html', { waitUntil: 'networkidle' });   // una recarga de verdad: sin ?join, vuelve con el secreto del asiento
  await B2.locator('.kick-poll').waitFor({ timeout: 6000 });
  const resto = parseInt(await B2.locator('.kick-time').textContent());
  ok(resto <= 13 && resto >= 6, `recargar a media votación: la encuesta reaparece con el contador real (${resto} s)`);
  ok(/tu voto: Sí/.test(await B2.locator('.kick-meta').first().textContent()) && (await B2.getByRole('button', { name: /Votar (sí|no)/ }).count()) === 0,
     'y su voto sigue reflejado, sin botones vivos');
  ok(/2 de 3 a favor/.test(await B2.locator('.kick-meta').first().textContent()), 'con el recuento de votos (2 de 3)');
  ok((await D2.locator('.kick-poll .kick-btns').count()) === 0, 'el votado la sigue viendo sin poder votar');

  await B2.locator('#readyBtn').click();                                // recargar le quitó el «listo»
  await A2.waitForFunction(() => document.getElementById('readyCount').textContent.startsWith('3 de'));
  await C2.getByRole('button', { name: /Votar sí/ }).click();         // unanimidad: Dani fuera, quedan 3 listos
  await B2.locator('#cuentaAtras.on').waitFor({ timeout: 3000 });
  await B2.locator('.ag-toast').filter({ hasText: 'fue expulsado' }).waitFor({ timeout: 3000 });
  const g = await B2.evaluate(() => {
    const r = s => document.querySelector(s).getBoundingClientRect();
    const t = r('.ag-toast'), p = r('#cuentaAtras .ca-panel');
    return { solapan: t.left < p.right && t.right > p.left && t.top < p.bottom && t.bottom > p.top,
             dentro: t.left >= 0 && t.right <= innerWidth, num: document.getElementById('cuentaNum').textContent };
  });
  await B2.screenshot({ path: path.join(capturas, 'votekick-expulsado-con-cuenta-movil-390x700.png') });
  ok(!g.solapan && g.dentro, `aviso y cuenta atrás conviven sin taparse en 390x700 (cuenta: ${g.num})`);
  await A2.waitForFunction(() => document.getElementById('gameScreen').classList.contains('active'), null, { timeout: 8000 });
  ok(true, 'tras expulsar al único sin marcar, la cuenta atrás reparte sola');
  for (const [n, p] of [['Ana2', A2], ['Beto2', B2], ['Caro2', C2]]) {
    ok(p.errores.length === 0, `${n}: sin errores de JavaScript${p.errores.length ? ': ' + p.errores.join(' | ') : ''}`);
  }
}

for (const [n, p] of [['Ana', A], ['Beto', B], ['Caro', C]]) {
  ok(p.errores.length === 0, `${n}: sin errores de JavaScript${p.errores.length ? ': ' + p.errores.join(' | ') : ''}`);
}
info(`capturas en ${capturas}`);
await browser.close();
fin();
