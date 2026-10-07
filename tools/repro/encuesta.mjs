// La encuesta "¿seguimos esperando?" cuando alguien se cae y no vuelve (~2 min).
//
//   node repro/encuesta.mjs [--base=local|beta]
//
// Nació del 2026-10-06 (sala CUX5KZ): a Daixi se le cayó la conexión al empezar,
// a los 30 s se la retiró y sus 18 cartas fueron al centro (de 4 a 22). Ahora,
// al agotarse la espera, votan las personas que siguen: Sí = otros 30 s, No =
// se cancela (basta uno), y quien no contesta en 15 s cuenta como Sí. Irse a
// propósito no abre encuesta: la partida se redimensiona como antes.
//
// Tres partidas a la vez:
//   1. Caro se cae: todos Sí → otra espera; nadie contesta → otra espera; un No → cancelada.
//   2. Gael se cae y vuelve con su secreto en plena encuesta → se cierra ("volvio").
//   3. Ivo se va con "Salir" → a los 30 s se le retira, sin encuesta.
import {
  wait, ok, info, fin, cliente, send, tipos, esperar, crear, unirse, pinguear, grabacionDe,
} from './comun.mjs';

const GRACIA = 30_000, VOTO = 15_000, MARGEN = 4_000;

/** Tres en una sala, empezando la partida; todos mandan pings como un cliente de verdad. */
async function mesa(n1, n2, n3) {
  const a = await crear(n1);
  const b = await unirse(n2, a.lobby);
  const c = await unirse(n3, a.lobby);
  for (const x of [a, b, c]) send(x, { type: 'set_ready', ready: true });
  const gs = await Promise.all([a, b, c].map(x => esperar(x, m => m.type === 'game_start', 8000)));
  const paros = [a, b, c].map(x => pinguear(x));
  return { a, b, c, empezo: gs.every(Boolean), parar: () => paros.forEach(p => p()) };
}

const poll = nick => m => m.type === 'wait_poll' && m.nickname === nick;
const cerrada = (nick, res) => m => m.type === 'wait_poll_closed' && m.nickname === nick && m.result === res;
const caida = nick => m => m.type === 'player_disconnected' && m.nickname === nick;
/** Solo lo que llegue desde el instante `t` (cada mensaje lleva `_t`, su hora de llegada). */
const tras = (t, pred) => m => m._t >= t && pred(m);

async function partida1() {
  const { a, b, c, empezo, parar } = await mesa('Ana', 'Beto', 'Caro');
  ok(empezo, '1: la partida arranca');
  c.ws.terminate();
  ok(!!(await esperar(a, caida('Caro'))), '1: Ana ve que Caro se cayó');

  // Ronda 1: todos Sí → se cierra enseguida y vuelve a esperar.
  const p1 = await esperar(a, poll('Caro'), GRACIA + MARGEN);
  ok(!!p1 && p1.seconds === 15, `1: a los 30 s, encuesta por Caro (${p1?.seconds} s)`);
  ok(!!(await esperar(b, poll('Caro'), 2000)), '1: Beto también la ve');
  let t = Date.now();
  send(a, { type: 'wait_poll_vote', nickname: 'Caro', keep_waiting: true });
  send(b, { type: 'wait_poll_vote', nickname: 'Caro', keep_waiting: true });
  ok(!!(await esperar(a, tras(t, cerrada('Caro', 'seguir')), 2000)), '1: todos Sí → se cierra al momento ("seguir")');
  ok(!!(await esperar(a, tras(t, caida('Caro')), 2000)), '1: y se la espera otros 30 s');

  // Ronda 2: nadie contesta → al acabar los 15 s cuenta como Sí.
  ok(!!(await esperar(a, tras(t + 1000, poll('Caro')), GRACIA + MARGEN)), '1: segunda encuesta al acabar la segunda espera');
  t = Date.now();
  const s2 = await esperar(a, tras(t, cerrada('Caro', 'seguir')), VOTO + MARGEN);
  const tardo = Math.round((Date.now() - t) / 1000);
  ok(!!s2 && tardo >= 12, `1: sin votos se cierra a los ~15 s como Sí (${tardo} s)`);

  // Ronda 3: un No cancela.
  ok(!!(await esperar(a, tras(t + 1000, poll('Caro')), GRACIA + MARGEN)), '1: tercera encuesta');
  t = Date.now();
  send(b, { type: 'wait_poll_vote', nickname: 'Caro', keep_waiting: false });
  ok(!!(await esperar(a, tras(t, cerrada('Caro', 'cancelar')), 2000)), '1: el No de Beto la cierra ("cancelar")');
  const canc = await esperar(a, tras(t, m => m.type === 'game_cancelled'), 2000);
  ok(!!canc, `1: y la partida se cancela para Ana ("${canc?.reason}")`);
  ok(!!(await esperar(b, tras(t, m => m.type === 'game_cancelled'), 2000)), '1: y para Beto');
  ok(!tipos(a).includes('player_left'), '1: nunca se retiró a Caro (sus cartas no fueron al centro)');

  await wait(500);
  const g = await grabacionDe(a.lobby);
  const kinds = (g?.lineas ?? []).filter(l => l.t === 'conn').map(l => `${l.kind}${l.result ? ':' + l.result : ''}`);
  ok(['encuesta', 'voto', 'encuesta_fin:seguir', 'encuesta_fin:cancelar'].every(k => kinds.includes(k)),
     `1: la grabación lo cuenta (${kinds.filter(k => !k.startsWith('close')).join(' ')})`);
  parar(); a.ws.close(); b.ws.close();
}

async function partida2() {
  const { a, b, c, empezo, parar } = await mesa('Eli', 'Fer', 'Gael');
  ok(empezo, '2: la partida arranca');
  const lobby = a.lobby, token = c.token;
  c.ws.terminate();
  ok(!!(await esperar(a, poll('Gael'), GRACIA + MARGEN)), '2: encuesta por Gael');
  send(a, { type: 'wait_poll_vote', nickname: 'Gael', keep_waiting: true });   // Fer no vota aún
  const c2 = await cliente('Gael2');
  send(c2, { type: 'join_lobby', nickname: 'Gael', lobby_id: lobby, seat_token: token });
  ok(!!(await esperar(c2, m => m.type === 'game_start', 3000)), '2: Gael vuelve con su secreto en plena encuesta');
  ok(!!(await esperar(a, cerrada('Gael', 'volvio'), 2000)), '2: la encuesta se cierra ("volvio")');
  await wait(1000);
  send(b, { type: 'wait_poll_vote', nickname: 'Gael', keep_waiting: false });   // tarde: ya no hay encuesta
  await wait(800);
  ok(!tipos(a).includes('game_cancelled'), '2: un No a una encuesta ya cerrada no cancela nada');
  parar(); a.ws.close(); b.ws.close(); c2.ws.close();
}

async function partida3() {
  const { a, b, c, empezo, parar } = await mesa('Hugo', 'Ines', 'Ivo');
  ok(empezo, '3: la partida arranca');
  send(c, { type: 'leave_lobby' });
  const left = await esperar(a, m => m.type === 'player_left' && m.nickname === 'Ivo', GRACIA + MARGEN);
  ok(!!left, `3: irse con "Salir" retira a Ivo a los 30 s como antes (fuera: ${left?.retired?.join(', ') || 'nada'})`);
  ok(!a.msgs.some(poll('Ivo')), '3: sin encuesta');
  parar(); a.ws.close(); b.ws.close(); c.ws.close();
}

info('tres partidas a la vez; tarda unos 2 min');
await Promise.all([partida1(), partida2(), partida3()]);
fin();
