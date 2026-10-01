// Utilidades comunes de las pruebas con sockets reales (tools/repro/*.mjs).
//
// Uso de cualquier script:   node repro/asiento.mjs [--base=local|beta|prod|<url>]
// Por defecto, local (http://127.0.0.1:3077).
//
// Un "cliente" aquí es un WebSocket suelto con su bandeja de mensajes: sirve
// para hacer de jugador sin navegador. NO manda pings por su cuenta (un cliente
// de verdad lo hace cada 3 s en partida): cada script decide cuándo.

import WebSocket from 'ws';

export const BASES = {
  local: 'http://127.0.0.1:3077',
  beta: 'https://beta.piles.danassistantassistant.website',
  prod: 'https://piles.danassistantassistant.website',
};

export function baseDe(argv = process.argv) {
  const a = argv.find(x => x.startsWith('--base='))?.slice(7) ?? 'local';
  return BASES[a] ?? a;
}
export const base = baseDe();
export const WS_URL = base.replace(/^http/, 'ws') + '/ws';
export const largo = process.argv.includes('--largo');

export const wait = ms => new Promise(r => setTimeout(r, ms));

let fallos = 0;
export const ok = (c, m) => { console.log(`${c ? 'OK   ' : 'FALLA'} ${m}`); if (!c) fallos++; return c; };
export const info = m => console.log(`     ${m}`);
export function fin() {
  console.log(fallos ? `\n${fallos} FALLO(S)` : '\ntodo bien');
  process.exit(fallos ? 1 : 0);
}

export function cliente(nombre) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(WS_URL);
    const c = { nombre, ws, msgs: [], token: null, lobby: null, abierto: Date.now() };
    ws.on('message', d => {
      const m = JSON.parse(d);
      m._t = Date.now();
      c.msgs.push(m);
      if (m.type === 'seat_token') c.token = m.token;
      if (m.type === 'lobby_created' || m.type === 'joined_lobby') c.lobby = m.lobby_id;
    });
    ws.once('open', () => res(c));
    ws.once('error', rej);
  });
}
export const send = (c, m) => c.ws.send(JSON.stringify(m));
export const tipos = c => c.msgs.map(m => m.type);
export const ultimo = (c, t) => [...c.msgs].reverse().find(m => m.type === t);

/** Espera al primer mensaje que cumpla `pred` (de los ya recibidos o de los que lleguen). */
export async function esperar(c, pred, ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const m = c.msgs.find(pred);
    if (m) return m;
    await wait(40);
  }
  return null;
}

/** Manda un ping cada `cada` ms, como un cliente de verdad en partida. Devuelve quien lo para. */
export function pinguear(c, cada = 3000) {
  const id = setInterval(() => {
    if (c.ws.readyState === WebSocket.OPEN) send(c, { type: 'ping', rtt_ms: null });
  }, cada);
  return () => clearInterval(id);
}

export async function lista() {
  const c = await cliente('lista');
  const l = await esperar(c, m => m.type === 'lobby_list');
  c.ws.close();
  return (l?.lobbies ?? []).map(x => x.id);
}

export async function crear(nick, extra = {}) {
  const c = await cliente(nick);
  send(c, { type: 'create_lobby', nickname: nick, max_players: 4, is_public: true, ...extra });
  await esperar(c, m => m.type === 'seat_token');
  return c;
}

export async function unirse(nick, lobby) {
  const c = await cliente(nick);
  send(c, { type: 'join_lobby', nickname: nick, lobby_id: lobby });
  await esperar(c, m => m.type === 'seat_token');
  return c;
}

/** Los dos listos: devuelve los `game_start` de cada uno. */
export async function empezar(a, b) {
  send(a, { type: 'set_ready', ready: true });
  send(b, { type: 'set_ready', ready: true });
  return Promise.all([
    esperar(a, m => m.type === 'game_start', 6000),
    esperar(b, m => m.type === 'game_start', 6000),
  ]);
}

/** ¿Existe la sala? (el QR solo se genera si existe) */
export const existe = async code => (await fetch(`${base}/api/qr/${code}`)).status === 200;

export async function grabaciones(n = 5) {
  return (await fetch(`${base}/api/recordings?n=${n}`)).json();
}
export async function grabacionDe(lobby) {
  const f = (await grabaciones(100)).find(r => r.lobby === lobby);
  if (!f) return null;
  const txt = await (await fetch(`${base}/api/recordings/${f.file}`)).text();
  return { file: f.file, lineas: txt.trim().split('\n').map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) };
}
