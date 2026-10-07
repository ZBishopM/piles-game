// La encuesta "¿seguimos esperando?" en el navegador (~70 s).
//
//   node browser/encuesta.mjs [--base=local|beta] [--ver]
//
// La página juega con dos sockets: Beto, que se queda, y otro que se cae y no
// vuelve. A los 30 s el aviso de su caída pasa a ser una encuesta con dos
// botones que se pueden pulsar (los demás avisos dejan pasar los clics); Esperar
// + el Sí de Beto = otra espera; a la segunda encuesta, Cancelar = de vuelta a la
// sala. El que se cae se llama `<i>Caro</i>`: su apodo tiene que salir como
// texto, no como HTML (el servidor no filtra apodos).
import { lanzar, pagina, ok, info, fin, wait } from './comun.mjs';
import { unirse, send, esperar, pinguear } from '../repro/comun.mjs';

const CAIDO = '<i>Caro</i>';
const browser = await lanzar();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const p = await pagina(ctx);

await p.getByPlaceholder(/Jugador1/).fill('Lola');
await p.getByRole('button', { name: /Crear sala/ }).click();
await p.getByRole('button', { name: /Empezar/ }).click();
await p.locator('#lobbyScreen.active').waitFor({ timeout: 5000 });
const codigo = (await p.locator('#lobbyCodeDisplay').textContent()).trim();
const beto = await unirse('Beto', codigo);
const caro = await unirse(CAIDO, codigo);
send(beto, { type: 'set_ready', ready: true });
send(caro, { type: 'set_ready', ready: true });
await p.getByRole('button', { name: /Marcar como Listo/ }).click();
await p.locator('#gameScreen.active').waitFor({ timeout: 10000 });
const parar = pinguear(beto);
ok(true, `partida de tres en ${codigo}`);

caro.ws.terminate();
const aviso = p.locator('[data-grace]');
await aviso.waitFor({ timeout: 5000 });
ok(/se cayó/.test(await aviso.textContent()), `aviso de la caída: "${(await aviso.textContent()).trim()}"`);
ok((await aviso.locator('i').count()) === 0 && (await aviso.textContent()).includes(CAIDO),
   'el apodo sale como texto, sin interpretarlo como HTML');

info('…esperando los 30 s de gracia');
const encuesta = p.locator('[data-grace].wait-poll');
await encuesta.waitFor({ timeout: 36000 });
ok(/seguimos esperando/.test(await encuesta.textContent()), `encuesta: "${(await encuesta.textContent()).trim()}"`);const esperar_ = encuesta.getByRole('button', { name: 'Esperar' });
ok(await esperar_.isVisible() && await encuesta.getByRole('button', { name: 'Cancelar' }).isVisible(), 'con los botones Esperar y Cancelar');

await esperar_.click();   // si el aviso dejara pasar los clics, esto no llegaría al botón
ok(/Votaste esperar/.test(await encuesta.textContent()), 'tras pulsar Esperar: "Votaste esperar", sin botones');
send(beto, { type: 'wait_poll_vote', nickname: CAIDO, keep_waiting: true });
await p.locator('[data-grace]:not(.wait-poll)').waitFor({ timeout: 4000 });
ok(/se cayó/.test(await aviso.textContent()), 'los dos dijeron Sí: vuelve el aviso con otra cuenta atrás');

info('…segunda espera');
await encuesta.waitFor({ timeout: 36000 });
await encuesta.getByRole('button', { name: 'Cancelar' }).click();
await p.locator('#lobbyScreen.active').waitFor({ timeout: 5000 });
ok(true, 'Cancelar: la partida se cancela y vuelve a la sala');
ok(!!(await esperar(beto, m => m.type === 'game_cancelled', 2000)), 'y a Beto también');
ok((await p.locator('[data-grace]').count()) === 0, 'sin avisos colgando');

ok(p.errores.length === 0, `sin errores de JavaScript${p.errores.length ? ': ' + p.errores.join(' | ') : ''}`);
parar();
beto.ws.close();
await browser.close();
fin();
