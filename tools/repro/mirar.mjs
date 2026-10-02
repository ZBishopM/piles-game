// Mirar partidas en curso: la lista, la mano de todos, y la cola de espera.
//
//   node repro/mirar.mjs [--base=local|beta] [--largo]
//
// --largo añade la parte que espera los 30 s de gracia (se cancela la partida y
// quien miraba vuelve a la sala de espera, sentado o esperando plaza).
//
// - «Unirse» ve las partidas públicas en curso (`status`, jugadores, mirones).
// - Quien entra mirando recibe la tabla de cartas y la mano de TODOS, por ids, y
//   coincide con lo que cada jugador recibió en su `game_start`. Cuando alguien
//   suelta o coge, la foto lo refleja enseguida.
// - Un espectador no recibe mensajes privados de nadie y lo que manda se ignora.
// - Con la mesa llena al acabar la partida, quien miraba NO sale de la sala:
//   espera plaza, escribe en el chat, y se sienta en cuanto se libera un hueco.
import {
  base, wait, ok, info, fin, send, esperar, cliente, crear, unirse, empezar, pinguear, largo,
} from './comun.mjs';

const tras = (c, marca, pred, ms = 2500) => esperar(c, m => c.msgs.indexOf(m) >= marca && pred(m), ms);
const ids = set => set.map(c => (c ? c.id : null));

/** La sala tal y como la ve la lista pública. */
async function enLista(lobby) {
  const c = await cliente('Lista');
  const l = await esperar(c, m => m.type === 'lobby_list');
  c.ws.close();
  return (l?.lobbies ?? []).find(x => x.id === lobby) ?? null;
}

/** Entrar a una sala empezada: se entra mirando. */
async function mirar(nick, lobby) {
  const c = await cliente(nick);
  send(c, { type: 'join_lobby', nickname: nick, lobby_id: lobby });
  await esperar(c, m => m.type === 'joined_lobby');
  return c;
}

// ── Una partida en curso: Ana y Beto ───────────────────────────────────────
const a = await crear('Ana');
const b = await unirse('Beto', a.lobby);
const [gsA, gsB] = await empezar(a, b);
const parar = [pinguear(a), pinguear(b)];
await wait(300);

{
  const e = await enLista(a.lobby);
  ok(e?.status === 'playing', `la lista enseña la partida en curso (status ${e?.status})`);
  ok(e?.player_count === 2 && e?.spectators === 0, `con sus 2 jugadores y nadie mirando (${e?.player_count}, ${e?.spectators})`);
}

// ── Entra a mirar ──────────────────────────────────────────────────────────
const c = await mirar('Caro', a.lobby);
const pc = pinguear(c);
parar.push(pc);
const [inicio, tabla, foto] = await Promise.all([
  esperar(c, m => m.type === 'game_start', 3000),
  esperar(c, m => m.type === 'spectator_cards', 3000),
  esperar(c, m => m.type === 'spectator_state', 3000),
]);
ok(c.msgs.find(m => m.type === 'joined_lobby')?.spectator === true, 'entra como espectador');
ok(inicio && inicio.your_sets.length === 0, 'el game_start no trae sets propios');
ok(!!tabla && !!foto, 'recibe la tabla de cartas y la foto de las manos');
{
  const mia = n => foto.players[n].sets;
  ok(JSON.stringify(mia('Ana')) === JSON.stringify(gsA.your_sets.map(ids)), 'la mano de Ana que ve es la que Ana recibió');
  ok(JSON.stringify(mia('Beto')) === JSON.stringify(gsB.your_sets.map(ids)), 'la de Beto, la de Beto');
  const todas = [...foto.center, ...Object.values(foto.players).flatMap(p => p.sets.flat())].filter(x => x !== null);
  ok(todas.length === 24 * 2 + gsA.center_cards.length && todas.every(id => tabla.cards[id]), `y la tabla trae las ${todas.length} cartas (prenda y nombre)`);
  ok(JSON.stringify(foto.center) === JSON.stringify(gsA.center_cards.map(x => x.id)), 'el centro coincide');
  const p = foto.players.Ana;
  ok(p.owed === null && p.cur === 0 && p.flip.length === 6 && typeof p.mult === 'number', 'con su deuda, set abierto, revelados y racha');
}
{
  const e = await enLista(a.lobby);
  ok(e?.spectators === 1, `y la lista ya cuenta a quien mira (${e?.spectators})`);
}

// ── Lo que pasa en la partida se ve ────────────────────────────────────────
{
  const m = c.msgs.length;
  const t0 = Date.now();
  send(a, { type: 'drop_card', my_card_index: 1 });
  const f = await tras(c, m, x => x.type === 'spectator_state' && x.players.Ana.sets[0][1] === null, 2000);
  ok(!!f, `Ana suelta una carta y quien mira ve el hueco (${Date.now() - t0} ms)`);
  ok(Date.now() - t0 < 900, 'en menos de 0,9 s');
  ok(f && JSON.stringify(f.players.Ana.owed) === JSON.stringify([0, 1]), 'con la deuda marcada (set 1, posición 2)');
  ok(f && f.center.length === foto.center.length + 1, 'y la carta ya está en el centro');

  const m2 = c.msgs.length;
  const dueda = f.center[f.center.length - 1];
  const otra = f.center.find(id => id !== dueda);
  send(a, { type: 'take_card', card_id: otra });
  const g = await tras(c, m2, x => x.type === 'spectator_state' && x.players.Ana.sets[0][1] === otra, 3000);
  ok(!!g && g.players.Ana.owed === null, 'Ana coge una carta y el hueco se tapa, sin deuda');
}

// ── Quien mira no actúa ni ve lo privado ───────────────────────────────────
{
  const m = c.msgs.length;
  send(c, { type: 'drop_card', my_card_index: 0 });
  send(c, { type: 'take_card', card_id: 0 });
  send(c, { type: 'switch_set', set_index: 3 });
  await wait(700);
  const nuevos = c.msgs.slice(m).map(x => x.type);
  ok(!nuevos.includes('swap_success') && !nuevos.includes('swap_failed') && !nuevos.includes('error'), `lo que manda se ignora, sin respuesta (${[...new Set(nuevos)].join(',')})`);
  const privados = c.msgs.filter(x => ['swap_success', 'sets_resynced', 'set_switched', 'debt_started', 'combo_update'].includes(x.type));
  ok(privados.length === 0, 'y no le llega ningún mensaje privado de nadie');
  const ana = a.msgs.filter(x => x.type === 'swap_success').length;
  ok(ana >= 2, 'mientras tanto la partida siguió con normalidad para Ana');
}

// ── Sala sin hueco: quien mira espera plaza ────────────────────────────────
if (!largo) {
  info('(la parte de la cola de espera tarda ~35 s: pasa --largo)');
} else {
  const a2 = await crear('Ana2', { max_players: 2 });
  const b2 = await unirse('Beto2', a2.lobby);
  await empezar(a2, b2);
  const pp = [pinguear(a2), pinguear(b2)];
  const c2 = await mirar('Caro2', a2.lobby);
  const d2 = await mirar('Dani2', a2.lobby);
  pp.push(pinguear(c2), pinguear(d2));
  await wait(300);
  const e = await enLista(a2.lobby);
  ok(e?.spectators === 2, `dos personas miran la partida de 2 (${e?.spectators})`);

  // Ana se va: pasan los 30 s de gracia y la partida se cancela.
  info('Ana2 se va; esperando la gracia de 30 s…');
  send(a2, { type: 'leave_lobby' });
  const cancelada = await esperar(b2, m => m.type === 'game_cancelled', 40000);
  ok(!!cancelada, 'la partida se cancela al no volver');
  await wait(800);

  const ultima = c => [...c.msgs].reverse().find(m => m.type === 'lobby_update');
  const uc = ultima(c2), ud = ultima(d2);
  ok(uc?.status === 'waiting' && uc.players.some(p => p.nickname === 'Caro2'), 'Caro2, el primero que esperaba, se sienta (está en la lista de jugadores)');
  ok(c2.msgs.some(m => m.type === 'seat_token'), 'y recibe el secreto de su asiento');
  ok(ud?.status === 'waiting' && !ud.players.some(p => p.nickname === 'Dani2') && ud.spectators === 1,
     `Dani2 no cabe y NO sale de la sala: sigue esperando plaza (jugadores: ${ud?.players.map(p => p.nickname)}, esperando ${ud?.spectators})`);
  ok(!d2.msgs.some(m => m.type === 'error'), 'sin ningún error («la sala se llenó») para él');
  ok(!d2.msgs.some(m => m.type === 'seat_token'), 'ni asiento: aún no tiene plaza');

  // Escribe en el chat desde la cola.
  const mark = d2.msgs.length;
  send(d2, { type: 'chat', text: 'espero plaza' });
  const eco = await tras(b2, b2.msgs.length - 1, m => m.type === 'chat' && m.from === 'Dani2', 2000);
  const mio = await tras(d2, mark, m => m.type === 'chat', 2000);
  ok(eco?.text === 'espero plaza' && !!mio, 'quien espera plaza puede escribir en el chat de la sala');

  // Se libera un hueco: se va Caro2 y se sienta Dani2.
  send(c2, { type: 'leave_lobby' });
  await wait(900);
  const ud2 = ultima(d2);
  ok(ud2?.players.some(p => p.nickname === 'Dani2'), 'al irse Caro2, Dani2 se sienta solo');
  ok(d2.msgs.some(m => m.type === 'seat_token'), 'y recibe su secreto de asiento');
  ok(ud2?.spectators === 0, 'y ya no queda nadie esperando');
  pp.forEach(p => p());
  for (const x of [a2, b2, c2, d2]) x.ws.close();
}

parar.forEach(p => p());
for (const x of [a, b, c]) x.ws.close();
fin();
