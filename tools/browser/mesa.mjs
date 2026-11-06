// Menú en la mesa (diseno/menu-mesa/README.md) contra un servidor: dos personas, crear,
// unirse por la lista, chat, bots, listos, ganar + cuenta atrás y partida.
//   node browser/mesa.mjs [--base=local|beta] [carpeta para las fotos]
import { lanzar, base } from './comun.mjs';
const BASE = base + '/lobby.html';
const OUT = process.argv.slice(2).find(a => !a.startsWith('--')) ?? '.';
const espera = ms => new Promise(r => setTimeout(r, ms));
const ok = (c, m) => { console.log((c ? '✔ ' : '✘ ') + m); if (!c) fallos++; };
let fallos = 0;
const b = await lanzar();
const errores = [];
async function persona(nombre, vp) {
  const ctx = await b.newContext({ viewport: vp });
  const p = await ctx.newPage();
  p.on('pageerror', e => errores.push(`${nombre}: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') errores.push(`${nombre} consola: ${m.text()}`); });
  await p.goto(BASE); await espera(1500);
  await p.fill('#nombre', nombre); await p.locator('#nombre').blur();
  return p;
}
const estadoDe = p => p.evaluate(() => ({ pantalla: mesa.pantalla, sala: est.currentLobbyId, mano: mesa.mano.map(c => c.dataset.nombre), cab: document.querySelectorAll('.carta.cabecera').length }));
const tecla = async (p, k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await espera(350); } };
const foto = (p, n) => p.screenshot({ path: `${OUT}/${n}.png` });

const A = await persona('Ana', { width: 390, height: 844 });
await foto(A, '01-inicio');
let e = await estadoDe(A);
ok(e.pantalla === 'inicio' && e.mano.length === 3, `A en inicio con 3 cartas (${e.mano})`);
ok(await A.evaluate(() => !document.getElementById('homeScreen') && document.querySelectorAll('.screen').length === 1 && vistaActual === 'homeScreen'), 'sin pantallas viejas: solo la partida');

// Crear sala (4) y abrirla
await tecla(A, 'ArrowRight'); await tecla(A, 'ArrowUp'); await espera(900);
e = await estadoDe(A); ok(e.pantalla === 'crear', `A en crear (${e.pantalla})`);
await foto(A, '02-crear');
await tecla(A, 'ArrowUp'); await espera(2000);
e = await estadoDe(A); ok(e.pantalla === 'sala' && /^[A-Z0-9]{6}$/.test(e.sala), `A en su sala ${e.sala} (${e.pantalla})`);
await foto(A, '03-sala-sola');
const codigo = e.sala;

// Beto se une por la lista de salas (escritorio)
const B = await persona('Beto', { width: 1280, height: 800 });
await tecla(B, 'ArrowRight', 2); await tecla(B, 'ArrowUp'); await espera(1800);
e = await estadoDe(B); ok(e.pantalla === 'unirse' && e.mano.includes(codigo), `B ve la sala ${codigo} en la lista (${e.mano})`);
await foto(B, '04-unirse');
const i = e.mano.indexOf(codigo);
await B.evaluate(i => { while (mesa.mano.length && mesa.mano.indexOf(mesa.mano.find(c => c.classList.contains('elegida'))) < i) mesa.elegir(1); }, i);
await tecla(B, 'ArrowUp'); await espera(2200);
e = await estadoDe(B); ok(e.pantalla === 'sala' && e.sala === codigo, `B dentro (${e.pantalla} ${e.sala})`);
await espera(800);
const jugA = await A.evaluate(() => document.querySelectorAll('.carta.jugador:not(.vacia)').length);
ok(jugA === 2, `A ve 2 cartas de jugador (${jugA})`);
// Sin franja de texto: los huecos son cartas vacías y el chat crece
const sala = await A.evaluate(() => ({ vacias: document.querySelectorAll('.carta.jugador.vacia').length, estado: document.getElementById('estado').textContent,
  chat: Math.round(document.querySelector('#escenario .pieza .log')?.closest('.pieza').getBoundingClientRect().height ?? 0),
  pool: document.querySelector('#escenario .pieza .pool')?.textContent }));
ok(sala.vacias === 2 && !sala.estado && sala.chat >= 200 && sala.pool === 'GLORY', `sala sin franja: 2 huecos, chat ${sala.chat}px, chip ${sala.pool} («${sala.estado}»)`);

// Chat: A escribe, B lo lee
await A.click('#escenario .pieza [data-act="chat"]'); await A.keyboard.type('hola mesa'); await A.keyboard.press('Enter'); await espera(900);
const logB = await B.evaluate(() => document.querySelector('#escenario .pieza .log')?.textContent ?? '');
ok(logB.includes('hola mesa'), `B lee el chat (${logB.slice(-40)})`);
await foto(B, '05-sala-pc');

// A añade dos bots (sala llena: 4)
await tecla(A, 'ArrowRight'); await tecla(A, 'ArrowUp'); await espera(1200);
e = await estadoDe(A); ok(e.pantalla === 'bots', `A en bots (${e.pantalla})`);
await tecla(A, 'ArrowUp'); await espera(700); await tecla(A, 'ArrowUp'); await espera(1500);
const n = await A.evaluate(() => document.querySelectorAll('.carta.jugador:not(.vacia)').length);
ok(n === 4, `4 en la sala tras dos bots (${n})`);
await foto(A, '06-bots');
await tecla(A, 'ArrowDown'); await espera(1200);
e = await estadoDe(A); ok(e.pantalla === 'sala', `A vuelve a la sala (${e.pantalla})`);

// Los dos listos: gana uno, cuenta atrás (5 s) y partida
await tecla(B, 'ArrowUp'); await espera(500);
await tecla(A, 'ArrowUp');
await espera(900); await foto(A, '07-gana'); e = await estadoDe(A); ok(e.pantalla === 'cuenta', `cuenta atrás en A (${e.pantalla})`);
await espera(1800); await foto(A, '08-tres');
await espera(3500);
const enPartida = await A.evaluate(() => document.body.classList.contains('en-partida') && document.getElementById('gameScreen').classList.contains('active'));
ok(enPartida, 'A en la partida (tablero de siempre)');
await foto(A, '09-partida');
await b.close();
console.log('errores:', errores.length ? errores : 'ninguno');
console.log(fallos ? `${fallos} FALLOS` : 'todo bien');
