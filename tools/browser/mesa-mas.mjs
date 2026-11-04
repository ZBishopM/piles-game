// Menú en la mesa (diseno/menu-mesa/README.md) contra un servidor: perfil, idioma, tutorial,
// partida rápida + oferta de bots (12 s), QR, salir, entrar por código y echar a alguien.
//   node browser/mesa-mas.mjs [--base=local|beta] [carpeta para las fotos]
import { lanzar, base } from './comun.mjs';
const BASE = base + '/lobby.html';
const OUT = process.argv.slice(2).find(a => !a.startsWith('--')) ?? '.';
const espera = ms => new Promise(r => setTimeout(r, ms));
let fallos = 0;
const ok = (c, m) => { console.log((c ? '✔ ' : '✘ ') + m); if (!c) fallos++; };
const b = await lanzar();
const errores = [];
async function persona(nombre, vp = { width: 390, height: 844 }) {
  const ctx = await b.newContext({ viewport: vp });
  const p = await ctx.newPage();
  p.on('pageerror', e => errores.push(`${nombre}: ${e.message}`));
  await p.goto(BASE); await espera(1500);
  await p.fill('#nombre', nombre); await p.locator('#nombre').blur();
  return p;
}
const est = p => p.evaluate(() => ({ pantalla: mesa.pantalla, sala: currentLobbyId, mano: mesa.mano.map(c => c.dataset.nombre), estado: document.getElementById('estado').textContent }));
const tecla = async (p, k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await espera(350); } };
const foto = (p, n) => p.screenshot({ path: `${OUT}/${n}.png` });
const elegirNombre = (p, nombre) => p.evaluate(n => { const i = mesa.mano.findIndex(c => c.dataset.nombre === n); for (let k = 0; k < 12; k++) mesa.elegir(-1); for (let k = 0; k < i; k++) mesa.elegir(1); return i; }, nombre);

// 1) Perfil, tutorial e idioma
const P = await persona('Pepe');
await P.click('#escenario [data-act="perfil"]'); await espera(1500);
let e = await est(P); ok(e.pantalla === 'perfil', `perfil (${e.pantalla})`);
ok(await P.evaluate(() => document.querySelectorAll('#escenario [data-dial] .ag-dial, #escenario [data-dial] [class*="ag-dial"]').length > 0), 'diales de Elo en el perfil');
const elo = await P.evaluate(() => {
  const [f, g] = ['fun', 'glory'].map(k => document.querySelector(`#escenario [data-dial="${k}"]`).getBoundingClientRect());
  const letras = [...document.querySelectorAll('#escenario [data-dial] .ag-dial-label')].map(e => getComputedStyle(e).fontFamily);
  return { vertical: g.top >= f.bottom - 1, letras: new Set(letras).size, estado: document.getElementById('estado').textContent };
});
ok(elo.vertical && elo.letras === 1, `Elos en vertical y con la misma letra (${elo.letras} tipos)`);
ok(!elo.estado, `sin franja en el perfil («${elo.estado}»)`);
await foto(P, '20-perfil');
await P.click('#escenario [data-act="idioma"][data-v="EN"]'); await P.waitForLoadState('load'); await espera(2500);
e = await est(P); ok(e.pantalla === 'perfil' && e.mano.includes('Session Manager'), `tras recargar en inglés, sigue en perfil (${e.pantalla})`);
const txt = await P.evaluate(() => mesa.mano.map(c => c.querySelector('.nota').textContent).join(' | '));
ok(/account|taunt|Clown|honk/i.test(txt), `cartas en inglés (${txt.slice(0, 60)})`);
await foto(P, '21-perfil-en');
await P.click('#escenario [data-act="idioma"][data-v="ES"]'); await P.waitForLoadState('load'); await espera(2500);
await tecla(P, 'ArrowDown'); await espera(900);
await P.click('#escenario [data-act="ayuda"]'); await espera(1200);
e = await est(P); ok(e.pantalla === 'tutorial' && e.mano.length === 3, `tutorial (${e.pantalla})`);
await tecla(P, 'ArrowDown'); await espera(900);

// 2) Partida rápida sola → a los 12 s la oferta de bots → VS bots
await tecla(P, 'ArrowUp'); await espera(2500);
e = await est(P); ok(e.pantalla === 'sala' && !!e.sala, `partida rápida: en sala ${e.sala}`);
await espera(11500);
e = await est(P); ok(e.pantalla === 'oferta' && !e.estado, `oferta de bots, sin franja («${e.estado}»)`);
ok(await P.evaluate(() => /oponentes/.test(document.querySelector('#escenario .pieza .log')?.textContent)), 'la frase de la oferta, en el chat');
await foto(P, '22-oferta');
await tecla(P, 'ArrowUp'); await espera(2500);
e = await est(P);
const nJ = await P.evaluate(() => document.querySelectorAll('.carta.jugador:not(.vacia)').length);
ok(e.pantalla === 'sala' && nJ === 4, `VS bots: sala con ${nJ}`);
const nombres = await P.evaluate(() => [...document.querySelectorAll('.carta.jugador:not(.vacia) .nombre')].map(n => n.textContent).join(','));
ok(!/\p{Extended_Pictographic}/u.test(nombres), `sin emoji en los nombres (${nombres})`);

// 3) QR del servidor, hecho con cartas
await P.click('#escenario [data-act="qr"]'); await espera(2500);
e = await est(P); ok(e.pantalla === 'qr', `QR (${e.pantalla})`);
const celdas = await P.evaluate(() => mesa.X.mosaico?.celdas?.length ?? 0);
ok(celdas > 400, `QR con ${celdas} cartas`);
await foto(P, '23-qr');
await tecla(P, 'ArrowDown'); await espera(900);
// salir de la sala
await tecla(P, 'ArrowDown'); await espera(1500);
e = await est(P); ok(e.pantalla === 'inicio' && !e.sala, `salir: inicio sin sala (${e.pantalla} ${e.sala})`);

// 4) Echar: A (la más antigua), B y C; A propone echar a B, C vota sí
const A = await persona('Ana'), B = await persona('Beto'), C = await persona('Coca');
await tecla(A, 'ArrowRight'); await tecla(A, 'ArrowUp'); await espera(900); await tecla(A, 'ArrowUp'); await espera(2000);
const cod = (await est(A)).sala;
for (const X of [B, C]) {
  await tecla(X, 'ArrowRight', 2); await tecla(X, 'ArrowUp'); await espera(900);
  await X.click('#escenario [data-act="codigo"]'); await X.keyboard.type(cod); await espera(2500);
  e = await est(X); ok(e.pantalla === 'sala' && e.sala === cod, `entra por código (${e.pantalla} ${e.sala})`);
}
await espera(800);
const cartaB = A.locator('.carta.jugador:not(.vacia)', { hasText: 'Beto' });
const caja = await cartaB.boundingBox();
await A.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2); await espera(1300);
e = await est(A); ok(e.pantalla === 'echar', `A: echar a Beto (${e.pantalla} · ${e.mano})`);
await foto(A, '24-echar');
await tecla(A, 'ArrowUp'); await espera(1800);
e = await est(C); ok(e.pantalla === 'votar', `C vota (${e.pantalla} · ${e.mano})`);
await foto(C, '25-votar');
await tecla(C, 'ArrowUp'); await espera(2500);
e = await est(B); ok(!e.sala, `Beto fuera (${e.pantalla} ${e.sala})`);
e = await est(C); ok(e.pantalla === 'sala', `C de vuelta en la sala (${e.pantalla})`);
await b.close();
console.log('errores:', errores.length ? errores : 'ninguno');
console.log(fallos ? `${fallos} FALLOS` : 'todo bien');
