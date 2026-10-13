// El overlay de la cuenta atrás antes de repartir.
//
//   node browser/cuenta.mjs [--base=local|beta] [--ver]
//
// - Todos listos: aparece el 3-2-1 grande (con `role=status` que lo anuncia),
//   no tapa el botón de listo ni el chat (el toque pasa), y se cierra solo
//   cuando llega la partida.
// - Si uno se desmarca a mitad, el otro ve cerrarse el overlay con un aviso y
//   la partida no arranca.
// - Con movimiento reducido el número no anima.
//
// Capturas 390x700 y 1280x800 (x2) en `$CAPTURAS` o en la carpeta temporal.
import { lanzar, pagina, ok, info, fin, wait, base } from './comun.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const browser = await lanzar();
const capturas = process.env.CAPTURAS || path.join(os.tmpdir(), 'piles-cuenta');
fs.mkdirSync(capturas, { recursive: true });

async function sala(nickA, nickB, vA, vB, extra = {}) {
  const ctxA = await browser.newContext({ viewport: vA, deviceScaleFactor: 2, ...extra });
  const A = await pagina(ctxA);
  await A.getByPlaceholder(/Jugador1/).fill(nickA);
  await A.getByRole('button', { name: /Crear sala/ }).click();
  await A.getByRole('button', { name: /Empezar/ }).click();
  await A.locator('#lobbyScreen.active').waitFor({ timeout: 5000 });
  const codigo = (await A.locator('#lobbyCodeDisplay').textContent()).trim();
  const ctxB = await browser.newContext({ viewport: vB, deviceScaleFactor: 2, ...extra });
  await ctxB.addInitScript(n => localStorage.setItem('piles_nickname', n), nickB);
  const B = await ctxB.newPage();
  B.errores = []; A.errores ??= [];
  B.on('pageerror', e => B.errores.push(e.message));
  await B.goto(`${base}/lobby.html?join=${codigo}`, { waitUntil: 'networkidle' });
  await B.locator('#lobbyScreen.active').waitFor({ timeout: 8000 });
  await A.waitForFunction(() => document.getElementById('playerCount').textContent === '2', null, { timeout: 5000 });
  return { A, B, ctxA, ctxB };
}
const overlay = p => p.evaluate(() => ({
  on: document.getElementById('cuentaAtras').classList.contains('on'),
  num: document.getElementById('cuentaNum').textContent,
  anuncio: document.getElementById('cuentaAnuncio').textContent,
}));

// ── 1: 3-2-1, el toque pasa, y se cierra con la partida ──────────────────────
{
  const { A, B, ctxA, ctxB } = await sala('Ana', 'Beto', { width: 390, height: 700 }, { width: 1280, height: 800 });
  await B.locator('#readyBtn').click();
  await wait(300);
  ok(!(await overlay(A)).on, '1: con uno solo listo no hay overlay');
  await A.locator('#readyBtn').click();
  await A.locator('#cuentaAtras.on').waitFor({ timeout: 2000 });
  await B.locator('#cuentaAtras.on').waitFor({ timeout: 2000 });
  ok(true, '1: el overlay aparece en las dos pestañas');

  const vistos = [];
  let fotos = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 5000 && !(await A.locator('#gameScreen.active').count())) {
    const o = await overlay(A);
    if (o.on && vistos.at(-1) !== o.num) {
      vistos.push(o.num);
      if (o.num === '2' && !fotos++) {            // a media cuenta: el número ya está pintado
        await A.screenshot({ path: path.join(capturas, 'cuenta-390x700.png') });
        await B.screenshot({ path: path.join(capturas, 'cuenta-1280x800.png') });
        ok(o.anuncio === '2', '1: el anuncio accesible (role=status) dice el número');
        const rol = await A.locator('#cuentaAnuncio').evaluate(e => [e.getAttribute('role'), e.getAttribute('aria-live')]);
        ok(rol.join() === 'status,assertive', '1: role=status y aria-live=assertive');
        // El toque atraviesa el overlay: lo que hay bajo el botón de listo ES el botón.
        const encima = await A.evaluate(() => {
          const r = document.getElementById('readyBtn').getBoundingClientRect();
          return !!document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('#readyBtn');
        });
        ok(encima, '1: el botón de listo sigue siendo pulsable bajo el overlay');
        const chat = await A.evaluate(() => {
          const r = document.getElementById('chatInput').getBoundingClientRect();
          return r.height > 0 && !!document.elementFromPoint(r.x + 5, Math.min(r.y + r.height / 2, innerHeight - 1))?.closest('#chatInput');
        });
        info(chat ? 'el chat se alcanza' : 'el chat queda fuera de la pantalla (390x700) o tapado');
      }
    }
    await wait(60);
  }
  info(`números vistos: ${vistos.join(' ')}`);
  ok(['3', '2', '1'].every(n => vistos.includes(n)), '1: se ven 3, 2 y 1');
  await A.locator('#gameScreen.active').waitFor({ timeout: 4000 });
  await B.locator('#gameScreen.active').waitFor({ timeout: 4000 });
  ok(!(await overlay(A)).on && !(await overlay(B)).on, '1: llega la partida y el overlay se cierra');
  ok((await A.evaluate(() => document.getElementById('cuentaAnuncio').textContent)) === '', '1: y el anuncio se vacía');
  ok(A.errores.length + B.errores.length === 0, `1: sin errores de página ${A.errores.concat(B.errores).join('|')}`);
  await ctxA.close(); await ctxB.close();
}

// ── 2: se desmarca uno a mitad ───────────────────────────────────────────────
{
  const { A, B, ctxA, ctxB } = await sala('Cora', 'Dani', { width: 390, height: 700 }, { width: 1280, height: 800 });
  await A.locator('#readyBtn').click();
  await B.locator('#readyBtn').click();
  await A.locator('#cuentaAtras.on').waitFor({ timeout: 2000 });
  await wait(900);
  await B.locator('#readyBtn').click();           // Dani cancela
  await A.waitForFunction(() => !document.getElementById('cuentaAtras').classList.contains('on'), null, { timeout: 2000 });
  ok(true, '2: el overlay se cierra al cancelar');
  const aviso = A.locator('.ag-toast', { hasText: 'Cuenta atrás cancelada' });
  await aviso.first().waitFor({ timeout: 2000 });
  ok(/ya no está listo/i.test(await aviso.first().textContent()), '2: aviso «Cuenta atrás cancelada: alguien ya no está listo»');
  await A.screenshot({ path: path.join(capturas, 'cancelada-390x700.png') });
  await wait(3500);
  ok(!(await A.locator('#gameScreen.active').count()), '2: la partida no arranca');
  await ctxA.close(); await ctxB.close();
}

// ── 3: movimiento reducido ───────────────────────────────────────────────────
{
  const { A, B, ctxA, ctxB } = await sala('Eva', 'Fran', { width: 390, height: 700 }, { width: 390, height: 700 }, { reducedMotion: 'reduce' });
  await A.locator('#readyBtn').click();
  await B.locator('#readyBtn').click();
  await A.locator('#cuentaAtras.on').waitFor({ timeout: 2000 });
  const anim = await A.locator('#cuentaNum').evaluate(e => getComputedStyle(e).animationName);
  ok(anim === 'none', `3: con movimiento reducido el número no anima (${anim})`);
  await ctxA.close(); await ctxB.close();
}

info(`capturas en ${capturas}`);
await browser.close();
fin();
