// Gestos (tareas #34 y #35, client/gestos.ts), con el ratón: los mismos pointer events que
// el dedo. Lo táctil de verdad no se puede dar por probado con eventos sintéticos; por
// eso además se comprueba el `touch-action` de cada zona (sin él, el navegador se queda
// el arrastre y manda pointercancel). Capturas en $CAPTURAS o la carpeta temporal.
//
//   node browser/gestos.mjs [--base=...] [--ver]
import os from 'node:os';
import path from 'node:path';
import { lanzar, pagina, aPartida, espiarEnvios, cuenta, ok, info, wait, fin } from './comun.mjs';

const capturas = process.env.CAPTURAS ?? os.tmpdir();
const nav = await lanzar();
const ctx = await nav.newContext({ viewport: { width: 390, height: 700 } });
const p = await pagina(ctx);
await p.evaluate(() => localStorage.setItem('piles.gestos', '1'));   // los gestos, también bajo Playwright

/** Arrastra con el ratón de (x0, y0) a (x1, y1) en `pasos` movimientos. */
async function arrastrar(x0, y0, x1, y1, pasos = 12) {
  await p.mouse.move(x0, y0);
  await p.mouse.down();
  for (let i = 1; i <= pasos; i++) await p.mouse.move(x0 + (x1 - x0) * i / pasos, y0 + (y1 - y0) * i / pasos);
  await p.mouse.up();
  await wait(350);
}
const caja = sel => p.locator(sel).boundingBox();
const activa = () => p.evaluate(() => document.querySelector('.screen.active')?.id);
async function deslizarBoton(loc, fraccion = 1) {
  const b = await loc.boundingBox();
  const y = b.y + b.height / 2;
  await arrastrar(b.x + 18, y, b.x + 18 + (b.width - 18) * fraccion, y);
}

// ── touch-action de cada zona ────────────────────────────────────────────
const ta = sel => p.evaluate(s => getComputedStyle(document.querySelector(s)).touchAction, sel);
await p.getByPlaceholder(/Jugador1/).fill('Gestos');
ok(await ta('#pomo3') === 'none', `#pomo3 touch-action none (${await ta('#pomo3')})`);
ok(await ta('button.desliza') === 'pan-y', `botón deslizable pan-y (${await ta('button.desliza')})`);
ok(await ta('#gestoBorde') === 'none', 'franja del borde touch-action none');
ok(await ta('#yourCards') === 'none', 'tus cartas touch-action none');
await p.screenshot({ path: path.join(capturas, 'gestos-inicio.png') });

// ── Inicio: el pomo de tres destinos ─────────────────────────────────────
const c = await caja('.pomo3-centro');
const cx = c.x + c.width / 2, cy = c.y + c.height / 2;
await arrastrar(cx, cy, cx + 30, cy);
ok(await activa() === 'homeScreen', 'pomo arrastrado poco: no va a ningún sitio');
await arrastrar(cx, cy, cx, cy - 110);
ok(await activa() === 'hostScreen', `pomo ↑ = Crear sala (${await activa()})`);

// ── Un clic no basta; deslizar sí; a medias vuelve ───────────────────────
const empezar = p.getByRole('button', { name: /Empezar/ });
await empezar.click();
await wait(400);
ok(await activa() === 'hostScreen', 'un clic en «Empezar» no hace nada');
ok(await empezar.evaluate(b => b.classList.contains('desliza-pista')), 'y menea el pomo para indicar que se arrastra');
await deslizarBoton(empezar, 0.5);
ok(await activa() === 'hostScreen', 'deslizado a la mitad no confirma');
ok(await empezar.evaluate(b => parseFloat(getComputedStyle(b).getPropertyValue('--p')) === 0), 'y vuelve al principio');
// Grupo de opciones: se desliza por encima y se suelta sobre una.
{
  const ops = await p.locator('#maxPlayersGroup button').evaluateAll(bs => bs.map(b => {
    const r = b.getBoundingClientRect(); return { t: b.textContent.trim(), x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }));
  const de = ops[0], a = ops.find(o => o.t === '6');
  await arrastrar(de.x, de.y, a.x, a.y, 10);
  const valor = await p.locator('#maxPlayersGroup button.active').textContent();
  ok(valor.trim() === '6', `deslizar por el grupo y soltar en «6» lo elige (${valor.trim()})`);
}
await p.screenshot({ path: path.join(capturas, 'gestos-crear.png') });

// ── Borde izquierdo = atrás ──────────────────────────────────────────────
await arrastrar(6, 350, 130, 352);
ok(await activa() === 'homeScreen', `del borde a la derecha = Atrás (${await activa()})`);

// ── Botón de icono (👤): se mantiene pulsado ─────────────────────────────
{
  const b = await caja('.profile-btn');
  await p.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await wait(300);
  ok(await activa() === 'homeScreen', 'un toque en 👤 no abre el perfil');
  await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await p.mouse.down(); await wait(750); await p.mouse.up();
  await wait(300);
  ok(await activa() === 'profileScreen', `mantener 👤 abre el perfil (${await activa()})`);
  await arrastrar(6, 350, 130, 352);
}

// ── Teclado: Enter sigue funcionando ─────────────────────────────────────
await p.locator('#homeScreen button.solo-teclado', { hasText: /Crear sala/ }).focus();
await p.keyboard.press('Enter');
await wait(300);
ok(await activa() === 'hostScreen', 'Enter en «Crear sala» (oculto, con foco) funciona');

// ── Mantener pulsado = confirmar ─────────────────────────────────────────
const e = await empezar.boundingBox();
await p.mouse.move(e.x + e.width / 2, e.y + e.height / 2);
await p.mouse.down();
await wait(750);
await p.mouse.up();
await p.locator('#lobbyScreen.active').waitFor({ timeout: 5000 });
ok(true, 'mantener pulsado «Empezar» crea la sala');
await p.screenshot({ path: path.join(capturas, 'gestos-sala.png') });
ok(!(await p.locator('#gestoBorde').isHidden()), 'en la sala la franja del borde está (hay «Salir»)');

// ── Partida: revelar con ↓↓, cancelar con ↑ ─────────────────────────────
await arrastrar(6, 350, 130, 352);                                   // salir de la sala
await p.locator('#homeScreen.active').waitFor({ timeout: 3000 });
await p.evaluate(() => localStorage.removeItem('piles.gestos'));     // aPartida pulsa botones
await aPartida(p, 'Gestos');
await p.evaluate(() => localStorage.setItem('piles.gestos', '1'));
await espiarEnvios(p);
const cartas = await caja('#yourCards');
const mx = cartas.x + cartas.width / 2;
const swipe = async (dy, sobre = cartas) => arrastrar(mx, sobre.y + sobre.height / 2, mx, sobre.y + sobre.height / 2 + dy, 8);

await swipe(70);
ok(await p.locator('#revelaBarra.fuera').count() === 1, 'primer ↓: sale la barra');
await p.screenshot({ path: path.join(capturas, 'gestos-barra.png') });
await swipe(70, await caja('#revelaBarra'));
ok(await p.locator('#revelaBarra.revelando').count() === 1, 'segundo ↓: «revelando»');
await p.screenshot({ path: path.join(capturas, 'gestos-revelando.png') });
await swipe(-70);
await wait(1200);
ok(await cuenta(p, 'flip_set') === 0, '↑ durante el segundo: cancelado, no se manda flip_set');

await swipe(70);
await swipe(70, await caja('#revelaBarra'));
await wait(1300);
ok(await cuenta(p, 'flip_set') === 1, '↓ ↓ y esperar: un flip_set');
await wait(500);
ok(await p.evaluate(() => !!juego.est.myFlippedSets[juego.est.currentSetIndex]), 'el set queda revelado');

await swipe(-70);
ok(await p.locator('#revelaBarra.fuera').count() === 1, 'revelado: ↑ saca la barra de ocultar');
await swipe(-70, await caja('#revelaBarra'));
await wait(600);
ok(await cuenta(p, 'flip_set') === 2, '↑ ↑ oculta (sin espera)');

ok(await cuenta(p, 'drop_card') === 0, 'ningún gesto sobre las cartas soltó una carta');
const antes = await p.evaluate(() => juego.est.currentSetIndex);
await arrastrar(cartas.x + cartas.width * 0.8, cartas.y + cartas.height / 2, cartas.x + cartas.width * 0.2, cartas.y + cartas.height / 2, 8);
ok(await p.evaluate(() => juego.est.currentSetIndex) === antes + 1, `← cambia al set siguiente (${antes} → ${await p.evaluate(() => juego.est.currentSetIndex)})`);

ok(p.errores.length === 0, `sin errores de página ${p.errores.join(' | ')}`);
info(`capturas en ${capturas}`);
await nav.close();
fin();
