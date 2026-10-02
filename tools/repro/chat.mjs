// Chat de la sala de espera y el Elo junto a cada nombre.
//
//   node repro/chat.mjs [--base=local|beta]
//
// - El chat llega a todos, lo recibe entero quien entra después o vuelve con su
//   secreto, y dura mientras la sala siga abierta (aunque se vaya quien lo abrió).
// - Se limpia (espacios, control, 300 caracteres), tiene límite de ritmo, y no se
//   puede escribir en partida: ese texto no llega a la grabación pública.
// - `lobby_update` trae `pool` y el Elo de cada uno: glory con personas, fun en
//   cuanto hay un bot, y el Elo fijo del bot según su dificultad.
import { randomUUID } from 'node:crypto';
import {
  base, wait, ok, info, fin, send, esperar, cliente, grabacionDe,
} from './comun.mjs';

const clave = () => `anon:${randomUUID()}`;
/** El primer mensaje que cumple `pred` y llegó DESPUÉS de `marca`. */
const tras = (c, marca, pred, ms = 2000) => esperar(c, m => c.msgs.indexOf(m) >= marca && pred(m), ms);
const ultimaSala = c => [...c.msgs].reverse().find(m => m.type === 'lobby_update');

async function entrar(nick, lobby, extra = {}) {
  const c = await cliente(nick);
  if (lobby) send(c, { type: 'join_lobby', nickname: nick, lobby_id: lobby, ...extra });
  else send(c, { type: 'create_lobby', nickname: nick, max_players: 4, is_public: true, ...extra });
  await esperar(c, m => m.type === 'seat_token');
  return c;
}

// ── Sala con dos personas, una sin clave de Elo ────────────────────────────
const a = await entrar('Ana', null, { rating_key: clave() });
const b = await entrar('Beto', a.lobby, { rating_key: clave() });
const vieja = await entrar('Vieja', a.lobby);   // una pestaña antigua: sin clave
await wait(300);

{
  const u = ultimaSala(a);
  const de = n => u.players.find(p => p.nickname === n);
  ok(u.pool === 'glory', `solo personas: la sala es glory (${u.pool})`);
  ok(de('Ana').elo === 1000 && de('Beto').elo === 1000, `quien aún no ha jugado va con 1000 (${de('Ana').elo}, ${de('Beto').elo})`);
  ok(de('Vieja').elo === null, 'quien no tiene clave de Elo va sin Elo (sin chip)');
  ok(de('Ana').top3 === false, 'y nadie es del Top 3 sin partidas');
}

// ── El chat llega a todos ───────────────────────────────────────────────────
{
  const m = [a, b, vieja].map(c => c.msgs.length);
  send(a, { type: 'chat', text: 'hola' });
  const r = await Promise.all([a, b, vieja].map((c, i) => tras(c, m[i], x => x.type === 'chat')));
  ok(r.every(x => x?.from === 'Ana' && x.text === 'hola'), 'el mensaje llega a los tres, con quién lo escribe');
  ok(Math.abs(Date.now() - r[1].at) < 5000, `y con su hora (${Date.now() - r[1].at} ms de diferencia)`);
}

// ── Quien entra después recibe el historial ─────────────────────────────────
await wait(450);
{
  const c = await entrar('Caro', a.lobby, { rating_key: clave() });
  const h = await esperar(c, m => m.type === 'chat_history');
  ok(h && h.messages.length === 1 && h.messages[0].text === 'hola', `quien entra tarde recibe el historial (${h?.messages.length} mensaje)`);
  c.ws.close();
}

// ── Limpieza ────────────────────────────────────────────────────────────────
await wait(450);
{
  const m = b.msgs.length;
  send(a, { type: 'chat', text: '  hola \u0007  doble\t\n ' });
  const r = await tras(b, m, x => x.type === 'chat');
  ok(r?.text === 'hola doble', `se limpian espacios, saltos y caracteres de control (${JSON.stringify(r?.text)})`);
}
await wait(450);
{
  const m = b.msgs.length;
  send(a, { type: 'chat', text: '   \n\t ' });
  const r = await tras(b, m, x => x.type === 'chat', 800);
  ok(!r, 'un mensaje en blanco no llega a nadie');
}
await wait(450);
{
  const m = b.msgs.length;
  send(a, { type: 'chat', text: 'ñ'.repeat(500) });
  const r = await tras(b, m, x => x.type === 'chat');
  ok([...(r?.text ?? '')].length === 300, `se corta a 300 caracteres (${[...(r?.text ?? '')].length})`);
}
await wait(450);
{
  const m = b.msgs.length;
  const html = '<img src=x onerror=alert(1)>';
  send(a, { type: 'chat', text: html });
  const r = await tras(b, m, x => x.type === 'chat');
  ok(r?.text === html, 'el servidor no toca el marcado: el cliente lo pinta como texto');
}

// ── Límite de ritmo ─────────────────────────────────────────────────────────
await wait(500);
{
  const mb = b.msgs.length, ma = a.msgs.length;
  send(a, { type: 'chat', text: 'uno' });
  send(a, { type: 'chat', text: 'dos' });
  const error = await tras(a, ma, x => x.type === 'error', 1500);
  await wait(300);
  const llegaron = b.msgs.slice(mb).filter(x => x.type === 'chat').map(x => x.text);
  ok(/despacio/i.test(error?.message ?? ''), `dos mensajes seguidos: el segundo se rechaza (${error?.message})`);
  ok(llegaron.length === 1 && llegaron[0] === 'uno', `y solo llegó el primero (${llegaron})`);
}

// ── Dura mientras la sala esté abierta: se va quien la abrió ───────────────
send(a, { type: 'leave_lobby' });
await wait(500);
{
  const d = await entrar('Dani', a.lobby, { rating_key: clave() });
  const h = await esperar(d, m => m.type === 'chat_history');
  ok(h && h.messages.length >= 5 && h.messages[0].text === 'hola', `el anfitrión se fue y el historial sigue (${h?.messages.length} mensajes)`);
  // Y reingresar con el secreto también lo trae.
  const token = d.msgs.find(m => m.type === 'seat_token')?.token;
  d.ws.close();
  await wait(300);
  const d2 = await cliente('Dani');
  send(d2, { type: 'join_lobby', nickname: 'Dani', lobby_id: a.lobby, seat_token: token });
  const h2 = await esperar(d2, m => m.type === 'chat_history');
  ok(h2 && h2.messages.length === h.messages.length, 'volver con el secreto del asiento también trae el historial');
  d2.ws.close();
}

// ── Bots: el Elo fijo y el cambio de clasificación ──────────────────────────
{
  for (const [dif, esperado] of [['easy', 800], ['normal', 1000], ['hard', 1200]]) {
    const m = b.msgs.length;
    send(b, { type: 'add_bot', difficulty: dif });
    const u = await tras(b, m, x => x.type === 'lobby_update' && x.players.some(p => p.is_bot && p.elo === esperado), 2000);
    ok(!!u, `un bot ${dif} lleva su Elo fijo (${esperado})`);
    if (u) {
      ok(u.pool === 'fun', `y con un bot la sala pasa a fun (${u.pool})`);
      send(b, { type: 'remove_bot', player_id: u.players.find(p => p.is_bot).id });
      await wait(300);
    }
  }
  const m = b.msgs.length;
  const u = await tras(b, m, x => x.type === 'lobby_update' && !x.players.some(p => p.is_bot), 2000);
  ok(!u || u.pool === 'glory', 'al echar el bot vuelve a glory');
}

// ── En partida no se escribe, y no queda en la grabación ────────────────────
{
  const marcador = `secreto-${randomUUID().slice(0, 8)}`;
  const e = await entrar('Eva', b.lobby, { rating_key: clave() });
  send(b, { type: 'add_bot', difficulty: 'easy' });
  await wait(400);
  // Beto, Vieja (sigue sentada) y Eva; el bot ya entra listo.
  for (const c of [b, vieja, e]) send(c, { type: 'set_ready', ready: true });
  const empezo = await Promise.all([b, vieja, e].map(c => esperar(c, m => m.type === 'game_start', 8000)));
  ok(empezo.every(Boolean), 'empieza la partida');
  await wait(600);   // pasada la ventana del límite de ritmo

  const m = b.msgs.length;
  send(b, { type: 'chat', text: marcador });
  const error = await tras(b, m, x => x.type === 'error', 2000);
  await wait(300);
  ok(/sala de espera/i.test(error?.message ?? ''), `en partida el chat se rechaza (${error?.message})`);
  ok(!e.msgs.some(x => x.type === 'chat' && x.text === marcador), 'y no llega a nadie');

  const g = await grabacionDe(b.lobby);
  const texto = JSON.stringify(g?.lineas ?? []);
  ok(!!g, 'la partida se está grabando');
  ok(!texto.includes(marcador), 'y el texto escrito en partida NO aparece en la grabación pública');
  ok(!(g?.lineas ?? []).some(l => l.m?.type === 'chat' || l.m?.type === 'chat_history'), 'ni ningún mensaje de chat');
  for (const c of [b, e]) c.ws.close();
}

for (const c of [a, vieja]) c.ws.close();
fin();
