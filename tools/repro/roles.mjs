// Estados de las salas en la lista pública, entrar mirando, y cambiar de rol. //
//   node repro/roles.mjs [--base=local|beta|<url>]       (~45 s: espera la gracia de 30 s)
//
// - La lista enseña TODA sala pública no vacía con su `status`: waiting (con
//   hueco o llena), starting (cuenta atrás de 3 s) y playing.
// - `join_lobby` con `spectate: true` entra mirando aunque haya hueco, sin cortar
//   una cuenta atrás; una sala llena ya no da error: se entra en cola.
// - `set_spectator`: un jugador pasa a mirar (fuera de partida), un espectador
//   pide sitio (se sienta ya o queda en cola) y sale de la cola. Cortar la cuenta
//   atrás con `left` / `joined`, sin reabrirla sola.
// - Al acabar una partida se sienta quien esperaba en cola, no quien miraba por gusto.
import {
  base, wait, ok, info, fin, send, esperar, cliente, crear, unirse, empezar, pinguear,
} from './comun.mjs';

const ultimaDe = (c, t) => [...c.msgs].reverse().find(m => m.type === t);
const ids = c => c.msgs.find(m => m.type === 'joined_lobby' || m.type === 'lobby_created')?.player_id;
const tipos = (c, desde = 0) => c.msgs.slice(desde).map(m => m.type);

/** La sala tal y como la ve la lista pública. */
async function enLista(lobby) {
  const c = await cliente('Lista');
  const l = await esperar(c, m => m.type === 'lobby_list');
  c.ws.close();
  return (l?.lobbies ?? []).find(x => x.id === lobby) ?? null;
}

/** Entra con los campos extra; espera `joined_lobby` o un error. */
async function entrar(nick, lobby, extra = {}) {
  const c = await cliente(nick);
  send(c, { type: 'join_lobby', nickname: nick, lobby_id: lobby, ...extra });
  await esperar(c, m => m.type === 'joined_lobby' || m.type === 'error');
  await wait(300);
  return c;
}
const pararTodo = [];
const vivo = c => { pararTodo.push(pinguear(c)); return c; };
const cerrar = (...cs) => cs.forEach(c => c.ws.close());

// ── 1. La lista y sus estados ─────────────────────────────────────────────
{
  const a = await crear('Ana', { max_players: 2 });
  let e = await enLista(a.lobby);
  ok(e?.status === 'waiting' && e.player_count === 1, `sala con hueco: waiting (${e?.status}, ${e?.player_count}/${e?.max_players})`);

  const b = await unirse('Beto', a.lobby);
  e = await enLista(a.lobby);
  ok(e?.status === 'waiting' && e.player_count === 2, `sala en espera LLENA: sigue en la lista, waiting (${e?.status}, ${e?.player_count}/${e?.max_players})`);

  send(a, { type: 'set_ready', ready: true });
  send(b, { type: 'set_ready', ready: true });
  const cuenta = await esperar(a, m => m.type === 'countdown', 2000);
  e = await enLista(a.lobby);
  ok(!!cuenta && e?.status === 'starting', `con la cuenta atrás abierta: starting (${e?.status})`);

  await esperar(a, m => m.type === 'game_start', 6000);
  vivo(a); vivo(b);
  e = await enLista(a.lobby);
  ok(e?.status === 'playing', `en partida: playing (${e?.status})`);

  const priv = await crear('Priv', { max_players: 2, is_public: false });
  const vacia = await crear('Vacia', { max_players: 2 });
  send(vacia, { type: 'leave_lobby' });
  await wait(300);
  ok((await enLista(priv.lobby)) === null, 'una sala privada no sale en la lista');
  ok((await enLista(vacia.lobby)) === null, 'ni una sala vacía');
  cerrar(a, b, priv, vacia);
}

// ── 2. Entrar mirando ─────────────────────────────────────────────────────
{
  // Con hueco y en espera: mira por gusto.
  const a = await crear('Ana2', { max_players: 4 });
  const c = await entrar('Caro2', a.lobby, { spectate: true });
  ok(ultimaDe(c, 'joined_lobby')?.spectator === true, 'spectate:true en una sala con hueco entra como espectador');
  ok(!c.msgs.some(m => m.type === 'seat_token'), 'sin secreto de asiento');
  const u = ultimaDe(a, 'lobby_update');
  ok(u.players.length === 1 && u.spectators === 1 && u.queue.length === 0, `la sala cuenta 1 jugador, 1 mirón, nadie en cola (${u.players.length}/${u.spectators}/${u.queue})`);
  ok(ultimaDe(c, 'lobby_update')?.status === 'waiting' && c.msgs.some(m => m.type === 'chat_history'), 'recibe lobby_update y el historial del chat');
  ok(c.msgs.every(m => m.type !== 'game_start'), 'y ningún game_start: no hay partida');

  // Sin cortar la cuenta atrás.
  const b = await unirse('Beto2', a.lobby);
  send(a, { type: 'set_ready', ready: true });
  send(b, { type: 'set_ready', ready: true });
  await esperar(a, m => m.type === 'countdown', 2000);
  const d = await entrar('Dani2', a.lobby, { spectate: true });
  ok(ultimaDe(d, 'joined_lobby')?.spectator === true, 'durante la cuenta atrás se entra mirando');
  ok(!a.msgs.some(m => m.type === 'countdown_cancelled'), 'y no se corta la cuenta atrás');
  const ini = await esperar(a, m => m.type === 'game_start', 6000);
  ok(!!ini, 'la partida arranca');
  const dIni = await esperar(d, m => m.type === 'game_start' && m.your_sets.length === 0, 3000);
  ok(!!dIni && !!(await esperar(d, m => m.type === 'spectator_state', 3000)), 'y los que miraban reciben el tablero de espectador');
  // Entrar a jugar sin `spectate` a una sala empezada: en cola (como siempre).
  vivo(a); vivo(b);
  const e = await entrar('Eli2', a.lobby);
  ok(ultimaDe(e, 'joined_lobby')?.spectator === true && ultimaDe(e, 'lobby_update').queue.includes(ids(e)), 'sin spectate y con partida en marcha: espectador en cola');
  ok(!ultimaDe(e, 'lobby_update').queue.includes(ids(c)), 'quien miraba por gusto antes no está en la cola');
  cerrar(a, b, c, d, e);
}
{
  // Sala llena: ya no es un error.
  const a = await crear('Ana3', { max_players: 2 });
  await unirse('Beto3', a.lobby);
  const c = await entrar('Caro3', a.lobby);
  ok(ultimaDe(c, 'joined_lobby')?.spectator === true && !c.msgs.some(m => m.type === 'error'), 'sala llena: entra como espectador, sin «Lobby lleno»');
  ok(ultimaDe(c, 'lobby_update').queue.includes(ids(c)), 'en cola: se sentará solo');
  const d = await entrar('Dani3', a.lobby, { spectate: true });
  ok(!ultimaDe(d, 'lobby_update').queue.includes(ids(d)), 'con spectate:true en sala llena: mira por gusto, no hace cola');
  info(`sala ${a.lobby}`);
  a.cuatro = [c, d];
  globalThis.mesaLlena = a;
}

// ── 3. Cambiar de rol (sala llena Ana3 + Beto3, cola Caro3, mirón Dani3) ──
{
  const a = globalThis.mesaLlena;
  const [c, d] = a.cuatro;
  const b = null;
  const sala = a.lobby;
  const beto = await cliente('x'); beto.ws.close();   // (solo para tener el tipo)
  const jugadores = () => ultimaDe(a, 'lobby_update').players.map(p => p.nickname);

  // Ana (jugadora) pasa a mirar: su sitio es para Caro3 (cola), no para Dani3 (voluntario).
  const m0 = a.msgs.length;
  send(a, { type: 'set_spectator', spectate: true });
  // Se espera al lobby_update donde Ana3 ya no juega (con un servidor remoto, 500 ms fijos no bastan siempre).
  await esperar(a, m => a.msgs.indexOf(m) >= m0 && m.type === 'lobby_update' && !m.players.some(p => p.nickname === 'Ana3'), 4000);
  await esperar(c, m => m.type === 'seat_token', 4000);
  await wait(200);
  const ua = ultimaDe(a, 'lobby_update');
  ok(!ua.players.some(p => p.nickname === 'Ana3') && ua.players.some(p => p.nickname === 'Caro3') && !ua.players.some(p => p.nickname === 'Dani3'),
     `Ana3 pasa a mirar; el hueco es de Caro3 y no de Dani3 (${jugadores()})`);
  ok(c.msgs.some(m => m.type === 'seat_token'), 'Caro3 recibe su secreto de asiento');
  ok(!a.msgs.slice(m0).some(m => m.type === 'seat_token'), 'Ana3, ahora espectadora, no recibe secreto');
  ok(ua.spectators === 2 && ua.queue.length === 0, `quedan 2 mirando y nadie en cola (${ua.spectators}, ${ua.queue})`);
  ok(!a.msgs.slice(m0).some(m => m.type === 'error'), 'sin errores');

  // Idempotente.
  const n = a.msgs.length;
  send(a, { type: 'set_spectator', spectate: true });
  await wait(400);
  ok(!a.msgs.slice(n).some(m => m.type === 'lobby_update'), 'pedir mirar siendo espectador no hace nada');

  // Quiere jugar, pero la mesa está llena: cola.
  send(a, { type: 'set_spectator', spectate: false });
  await wait(500);
  ok(ultimaDe(a, 'lobby_update').queue.includes(ids(a)), 'Ana3 pide jugar con la mesa llena: se queda en cola');
  ok(!ultimaDe(a, 'lobby_update').players.some(p => p.nickname === 'Ana3'), 'y sigue sin sitio');
  send(a, { type: 'set_spectator', spectate: true });
  await wait(500);
  ok(!ultimaDe(a, 'lobby_update').queue.includes(ids(a)), '«Salir de la cola» (spectate:true) la deja mirando por gusto');

  // Se libera un hueco: Dani3 y Ana3 son voluntarios, no se sientan solos.
  send(c, { type: 'leave_lobby' });
  await wait(600);
  ok(ultimaDe(a, 'lobby_update').players.length === 1 && !d.msgs.some(m => m.type === 'seat_token'),
     'se va Caro3: quedan 1 jugador y los voluntarios siguen mirando (nadie se sienta solo)');
  ok(ultimaDe(a, 'lobby_update').spectators === 2, 'dos mirando');

  // Dani3 pide jugar y hay hueco: se sienta ya, sin listo.
  send(d, { type: 'set_spectator', spectate: false });
  const tok = await esperar(d, m => m.type === 'seat_token', 2000);
  await wait(300);
  const ud = ultimaDe(d, 'lobby_update');
  ok(!!tok && ud.players.some(p => p.nickname === 'Dani3' && !p.is_ready) && ud.spectators === 1, 'Dani3 pide jugar con hueco: se sienta ya (con secreto, sin listo)');
  const n2 = d.msgs.length;
  send(d, { type: 'set_spectator', spectate: false });
  await wait(400);
  ok(!d.msgs.slice(n2).some(m => m.type === 'lobby_update'), 'pedir jugar siendo jugador no hace nada');
  cerrar(a, c, d);
}

// ── 4. La cuenta atrás ────────────────────────────────────────────────────
{
  // Un jugador listo se pasa a mirar: se corta con `left` y no se reabre sola.
  const a = await crear('Ana4', { max_players: 3 });
  const b = await unirse('Beto4', a.lobby);
  send(a, { type: 'set_ready', ready: true });
  send(b, { type: 'set_ready', ready: true });
  await esperar(a, m => m.type === 'countdown', 2000);
  const n = a.msgs.length;
  send(b, { type: 'set_spectator', spectate: true });
  const corte = await esperar(a, m => a.msgs.indexOf(m) >= n && m.type === 'countdown_cancelled', 2000);
  ok(corte?.reason === 'left', `Beto4 pasa a mirar con la cuenta abierta: se corta con motivo left (${corte?.reason})`);
  await wait(3500);
  ok(!a.msgs.slice(n).some(m => m.type === 'game_start' || m.type === 'countdown'), 'y no se reabre sola ni arranca (Ana4 sigue lista, pero es la única)');
  ok(ultimaDe(a, 'lobby_update').status === 'waiting', 'la sala vuelve a waiting');
  // Beto4 vuelve: el hueco existe; entra sin listo y Ana4 sigue lista: no empieza.
  send(b, { type: 'set_spectator', spectate: false });
  await wait(600);
  ok(ultimaDe(a, 'lobby_update').players.length === 2 && ultimaDe(a, 'lobby_update').ready_count === 1, 'Beto4 vuelve a sentarse sin listo (1 de 2 listos)');
  cerrar(a, b);
}
{
  // Un espectador pide sitio con la cuenta abierta: entra uno sin listo, se corta con `joined`.
  const a = await crear('Ana5', { max_players: 4 });
  const b = await unirse('Beto5', a.lobby);
  const c = await entrar('Caro5', a.lobby, { spectate: true });
  send(a, { type: 'set_ready', ready: true });
  send(b, { type: 'set_ready', ready: true });
  await esperar(a, m => m.type === 'countdown', 2000);
  const n = a.msgs.length;
  send(c, { type: 'set_spectator', spectate: false });
  const corte = await esperar(a, m => a.msgs.indexOf(m) >= n && m.type === 'countdown_cancelled', 2000);
  ok(corte?.reason === 'joined', `Caro5 se sienta con la cuenta abierta: se corta con motivo joined (${corte?.reason})`);
  cerrar(a, b, c);
}

// ── 5. En partida ─────────────────────────────────────────────────────────
{
  const a = await crear('Ana6', { max_players: 2 });
  const b = await unirse('Beto6', a.lobby);
  const v = await entrar('Volu6', a.lobby, { spectate: true });   // voluntario, con la sala llena
  await empezar(a, b);
  vivo(a); vivo(b); vivo(v);
  const q = await entrar('Cola6', a.lobby);                        // llega con la partida en marcha: cola
  vivo(q);
  ok(ultimaDe(q, 'joined_lobby')?.spectator === true, 'Cola6 llega con la partida en marcha y mira');

  // Jugador → espectador: rechazado en partida.
  const n = a.msgs.length;
  send(a, { type: 'set_spectator', spectate: true });
  const err = await esperar(a, m => a.msgs.indexOf(m) >= n && m.type === 'error', 2000);
  ok(!!err, `en partida, un jugador no puede pasarse a espectador (${err?.message})`);
  const medio = ultimaDe(a, 'lobby_update');
  ok(!medio || medio.players.some(p => p.nickname === 'Ana6'), 'y sigue en la mesa');

  // Espectador voluntario pide la próxima: se anota en la cola; y la deja.
  const nv = v.msgs.length;
  send(v, { type: 'set_spectator', spectate: false });
  const u1 = await esperar(v, m => v.msgs.indexOf(m) >= nv && m.type === 'lobby_update', 2000);
  ok(u1?.status === 'playing' && u1.queue.includes(ids(v)) && u1.queue.includes(ids(q)), 'Volu6 pide jugar la próxima partida: queda en cola, con Cola6');
  const nv2 = v.msgs.length;
  send(v, { type: 'set_spectator', spectate: true });
  const u2 = await esperar(v, m => v.msgs.indexOf(m) >= nv2 && m.type === 'lobby_update', 2000);
  ok(!u2.queue.includes(ids(v)) && u2.queue.includes(ids(q)), 'y la deja: otra vez solo mira por gusto');

  // Acaba la partida (Ana6 se va y no vuelve): se sienta la cola, no el voluntario.
  info('Ana6 se va; esperando la gracia de 30 s…');
  send(a, { type: 'leave_lobby' });
  const cancelada = await esperar(b, m => m.type === 'game_cancelled', 40000);
  ok(!!cancelada, 'la partida se cancela');
  await wait(900);
  const uq = ultimaDe(q, 'lobby_update'), uv = ultimaDe(v, 'lobby_update');
  ok(uq.players.some(p => p.nickname === 'Cola6') && q.msgs.some(m => m.type === 'seat_token'), 'Cola6 (en cola) se sienta solo y recibe su secreto');
  ok(!uv.players.some(p => p.nickname === 'Volu6') && uv.spectators === 1 && !v.msgs.some(m => m.type === 'seat_token'),
     `Volu6 (mira por gusto) NO se sienta aunque hay sitio (mesa: ${uv.players.map(p => p.nickname)})`);
  cerrar(a, b, v, q);
}

pararTodo.forEach(p => p());
fin();
