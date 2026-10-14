// Votación para echar a alguien de la sala de espera.
//
//   node repro/votekick.mjs [--base=local|beta|<url>]
//
// Tres personas en una sala (Ana la abre, así que es la más antigua):
//   1. Expulsión: solo Ana puede abrirla; el votado la ve pero no vota; con el Sí
//      de Beto (unanimidad menos el votado) Caro sale y recibe `kicked`.
//   2. Cancelación: un No de Beto la cierra al instante, y repetirla contra el
//      mismo votado espera el enfriamiento.
//   3. Reentrada: Caro no vuelve a esa sala (ni con otro apodo y la misma clave
//      de Elo) y el mensaje dice cuánto falta (5 min). Que pasados 5 min sí vuelva
//      lo cubre el test de Rust (`el_expulsado_no_vuelve_y_el_mismo_par_espera`).
// Sin esperas fijas: se espera a los mensajes.
import { ok, info, fin, wait, cliente, send, esperar, ultimo, crear, unirse } from './comun.mjs';
import { randomUUID } from 'node:crypto';

const idDe = c => c.msgs.find(m => m.type === 'joined_lobby' || m.type === 'lobby_created')?.player_id;
const tras = (t, pred) => m => m._t >= t && pred(m);
const sala = async (...nicks) => {
  const a = await crear(nicks[0]);
  const rest = [];
  for (const n of nicks.slice(1)) rest.push(await unirse(n, a.lobby));
  await esperar(a, m => m.type === 'lobby_update' && m.players.length === nicks.length);
  return [a, ...rest];
};
const cierra = (res) => m => m.type === 'kick_poll_ended' && m.result === res;

// ── 1. Expulsión ───────────────────────────────────────────────────────────
const claveCaro = 'anon:' + randomUUID();
const ana = await crear('Ana');
const beto = await unirse('Beto', ana.lobby);
const caro = await cliente('Caro');
send(caro, { type: 'join_lobby', nickname: 'Caro', lobby_id: ana.lobby, rating_key: claveCaro });
await esperar(caro, m => m.type === 'seat_token');
await esperar(ana, m => m.type === 'lobby_update' && m.players.length === 3);
const lobby = ana.lobby;
let t = Date.now();
send(beto, { type: 'start_kick', target: idDe(caro) });
ok(!!(await esperar(beto, tras(t, m => m.type === 'error'))), '1: Beto no es el más antiguo: error');
ok(!beto.msgs.some(m => m.type === 'kick_poll'), '1: y no se abre nada');
const up = await esperar(ana, m => m.type === 'lobby_update');
ok(up.oldest === idDe(ana), '1: el lobby_update dice que Ana es la más antigua');

t = Date.now();
send(ana, { type: 'start_kick', target: idDe(caro) });
const p = await esperar(beto, tras(t, m => m.type === 'kick_poll'));
ok(!!p && p.nickname === 'Caro' && p.initiator === 'Ana' && JSON.stringify(p.voters) === '["Ana","Beto"]' && JSON.stringify(p.yes) === '["Ana"]',
   `1: Beto ve «¿Echar a Caro?», votan Ana y Beto y Ana ya dijo Sí (${p && JSON.stringify([p.voters, p.yes])})`);
ok(p?.seconds >= 14 && p?.seconds <= 15, `1: quedan ${p?.seconds} s`);
ok(!!(await esperar(caro, tras(t, m => m.type === 'kick_poll'))), '1: Caro (el votado) también la ve');
send(caro, { type: 'kick_vote', yes: false });
send(ana, { type: 'start_kick', target: idDe(beto) });
ok(!!(await esperar(ana, tras(t, m => m.type === 'error'))), '1: una sola votación a la vez');
ok(!ana.msgs.some(tras(t, cierra('rechazado'))), '1: el voto de Caro (el votado) no cuenta');

t = Date.now();
send(beto, { type: 'kick_vote', yes: true });
ok(!!(await esperar(ana, tras(t, cierra('expulsado')))), '1: con el Sí de Beto se echa a Caro');
ok(!!(await esperar(caro, tras(t, m => m.type === 'kicked'))), '1: Caro recibe `kicked`');
const quedan = await esperar(ana, tras(t, m => m.type === 'lobby_update' && m.players.length === 2));
ok(!!quedan, '1: la sala queda con dos');

// ── 3. Reentrada ───────────────────────────────────────────────────────────
t = Date.now();
const caro2 = await cliente('Caro2');
send(caro2, { type: 'join_lobby', nickname: 'Caro', lobby_id: lobby });
const e1 = await esperar(caro2, m => m.type === 'error');
ok(!!e1 && /echaron.*5 min/.test(e1.message), `3: Caro no vuelve a entrar y se le dice cuánto falta («${e1?.message}»)`);
const caro3 = await cliente('Caro3');
send(caro3, { type: 'join_lobby', nickname: 'Otro', lobby_id: lobby, rating_key: claveCaro });
ok(!!(await esperar(caro3, m => m.type === 'error' && /echaron/.test(m.message))), '3: tampoco con otro apodo y la misma clave de Elo');
ok(!caro2.msgs.some(m => m.type === 'joined_lobby') && !caro3.msgs.some(m => m.type === 'joined_lobby'), '3: ni jugando ni mirando');
for (const c of [caro2, caro3]) c.ws.close();

// ── 2. Cancelación por un No y enfriamiento ────────────────────────────────
const [a2, b2, c2] = await sala('Eli', 'Fer', 'Gael');
t = Date.now();
send(a2, { type: 'start_kick', target: idDe(c2) });
await esperar(b2, tras(t, m => m.type === 'kick_poll'));
t = Date.now();
send(b2, { type: 'kick_vote', yes: false });
ok(!!(await esperar(a2, tras(t, cierra('rechazado')), 1500)), '2: un No la cancela al instante');
ok(!c2.msgs.some(m => m.type === 'kicked'), '2: Gael sigue en la sala');
t = Date.now();
send(a2, { type: 'start_kick', target: idDe(c2) });
const frio = await esperar(a2, tras(t, m => m.type === 'error'));
ok(!!frio && /Espera/.test(frio.message), `2: repetirla contra Gael espera el enfriamiento («${frio?.message}»)`);
t = Date.now();
send(a2, { type: 'start_kick', target: idDe(b2) });
ok(!!(await esperar(b2, tras(t, m => m.type === 'kick_poll'))), '2: contra otra persona sí se puede');

// ── 4. Recarga a media votación y entrada tardía ───────────────────────────
{
  const [a, b, c, d] = await sala('Ana4', 'Beto4', 'Caro4', 'Dani4');
  send(a, { type: 'start_kick', target: idDe(d) });
  await esperar(b, m => m.type === 'kick_poll');
  send(b, { type: 'kick_vote', yes: true });
  await esperar(a, m => m.type === 'kick_poll' && m.yes.length === 2);
  b.ws.close();                                                    // recarga: cierra y vuelve
  await esperar(a, m => m.type === 'lobby_update' && m.players.length === 3);
  const b2 = await cliente('Beto4b');
  send(b2, { type: 'join_lobby', nickname: 'Beto4', lobby_id: a.lobby });
  const p4 = await esperar(b2, m => m.type === 'kick_poll');
  ok(!!p4 && p4.yes.includes('Beto4') && p4.voters.includes('Beto4') && p4.seconds <= 15, `4: al volver recibe la encuesta con su voto (${p4 && JSON.stringify(p4.yes)}, ${p4?.seconds} s)`);
  send(b2, { type: 'kick_vote', yes: true });
  await wait(300);
  ok(ultimo(a, 'kick_poll').yes.length === 2, '4: votar otra vez no suma');
  const mir = await cliente('Miron4');
  send(mir, { type: 'join_lobby', nickname: 'Miron4', lobby_id: a.lobby, spectate: true });
  const pm = await esperar(mir, m => m.type === 'kick_poll');
  ok(!!pm && !pm.voters.includes('Miron4'), '4: un espectador que entra tarde la ve y no vota');
  send(mir, { type: 'kick_vote', yes: false });
  send(c, { type: 'kick_vote', yes: false });
  ok(!!(await esperar(a, cierra('rechazado'))), '4: y solo el No de quien vota la cierra');
  ok(!mir.msgs.some(m => m.type === 'kick_poll_ended' && m.result === 'expulsado'), '4: (el voto del espectador no contó)');
  const tarde = await cliente('Tarde4');
  send(tarde, { type: 'join_lobby', nickname: 'Tarde4', lobby_id: a.lobby });
  await esperar(tarde, m => m.type === 'chat_history');
  await wait(300);
  ok(!tarde.msgs.some(m => m.type === 'kick_poll'), '4: con la votación cerrada no se manda nada');
  for (const x of [a, b2, c, d, mir, tarde]) x.ws.close();
}

// ── 5. Tras echar, o al irse, quien queda ya listo arranca la cuenta atrás ──
{
  const [a, b, c] = await sala('Ana5', 'Beto5', 'Caro5');
  send(a, { type: 'set_ready', ready: true });
  send(b, { type: 'set_ready', ready: true });
  await esperar(a, m => m.type === 'lobby_update' && m.ready_count === 2);
  send(a, { type: 'start_kick', target: idDe(c) });
  await esperar(b, m => m.type === 'kick_poll');
  t = Date.now();
  send(b, { type: 'kick_vote', yes: true });
  ok(!!(await esperar(a, tras(t, m => m.type === 'countdown'))), '5: echar al único sin marcar abre la cuenta atrás de 3 s');
  ok(!!(await esperar(a, tras(t, m => m.type === 'game_start'), 6000)), '5: y reparte');
  const [e, f, g] = await sala('Eli5', 'Fer5', 'Gus5');
  send(e, { type: 'set_ready', ready: true });
  send(f, { type: 'set_ready', ready: true });
  await esperar(e, m => m.type === 'lobby_update' && m.ready_count === 2);
  t = Date.now();
  send(g, { type: 'leave_lobby' });
  ok(!!(await esperar(e, tras(t, m => m.type === 'countdown'))), '5: si se va el único sin marcar, también arranca');
  // Si queda uno solo, nada; y quien se desmarca durante la cuenta la cancela.
  const [h, i] = await sala('Hugo5', 'Iris5');
  send(h, { type: 'set_ready', ready: true });
  await esperar(h, m => m.type === 'lobby_update' && m.ready_count === 1);
  t = Date.now();
  send(h, { type: 'start_kick', target: idDe(i) });
  await esperar(h, tras(t, cierra('expulsado')));
  await wait(500);
  ok(!h.msgs.some(m => m.type === 'countdown'), '5: si tras echar queda uno solo, no hay cuenta atrás');
  for (const x of [a, b, c, e, f, g, h, i]) x.ws.close();
}

for (const c of [ana, beto, caro, a2, b2, c2]) c.ws.close();
info('bots y espectadores: cubiertos por los tests de Rust');
fin();
