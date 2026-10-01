// Una conexión que deja de hablar en partida se da por caída (~20 s), y quien
// sigue mandando pings no se corta.
//
//   node repro/silencio.mjs [--base=local|beta]      (tarda ~35 s)
//
// Nació del caso del 2026-09-30: el servidor tardó ~100 s en notar que una
// conexión había muerto (no había tiempo máximo de silencio).
import WebSocket from 'ws';
import {
  wait, ok, info, fin, cliente, send, esperar, crear, unirse, empezar, pinguear,
  grabacionDe,
} from './comun.mjs';

const a = await crear('Ana');
const b = await unirse('Beto', a.lobby);
await empezar(a, b);
const paraB = pinguear(b);       // Beto se comporta como un cliente de verdad
const t0 = Date.now();           // Ana deja de decir nada desde aquí

// Beto debe enterarse de que Ana cayó, entre ~20 y ~27 s (se mira cada 5 s).
const caida = await esperar(b, m => m.type === 'player_disconnected' && m.nickname === 'Ana', 30000);
const t = caida ? (caida._t - t0) / 1000 : null;
ok(!!caida, `Beto recibe player_disconnected de Ana (a los ${t?.toFixed(1)} s)`);
ok(t !== null && t >= 19 && t <= 27, 'entre 19 y 27 s: el límite es de 20 s y se mira cada 5');

// Y el servidor corta la conexión muerta (sin esto el socket seguiría abierto).
for (let i = 0; i < 40 && a.ws.readyState === WebSocket.OPEN; i++) await wait(100);
ok(a.ws.readyState !== WebSocket.OPEN, 'el servidor cierra el socket de Ana');

// Beto sigue conectado: mandó pings todo el rato.
ok(b.ws.readyState === WebSocket.OPEN, 'Beto, que sí habla, no se corta');
ok(!b.msgs.some(m => m.type === 'player_disconnected' && m.nickname === 'Beto'), 'y nadie lo da por caído');

// Ana vuelve con su secreto dentro de la gracia.
const a2 = await cliente('Ana2');
send(a2, { type: 'join_lobby', nickname: 'Ana', lobby_id: a.lobby, seat_token: a.token });
ok(!!(await esperar(a2, m => m.type === 'game_start', 3000)), 'Ana vuelve con su secreto y recupera la partida');

// La grabación cuenta la caída con su motivo.
await wait(500);
const g = await grabacionDe(a.lobby);
const cierre = g?.lineas.find(l => l.t === 'conn' && l.kind === 'close' && l.player === 'Ana');
info(`conn/close de Ana: ${JSON.stringify(cierre)}`);
ok(cierre?.motivo === 'silencio', `la grabación dice por qué se cerró: ${cierre?.motivo}`);
ok(!!g?.lineas.find(l => l.t === 'conn' && l.kind === 'grace_start' && l.player === 'Ana'), 'y cuándo empezó la gracia');
ok(!!g?.lineas.find(l => l.t === 'conn' && l.kind === 'replaced' && l.player === 'Ana'), 'y que Ana recuperó su asiento');
const clave = g?.lineas.filter(l => l.t === 'key').at(-1);
ok(clave?.conn && 'Ana' in clave.conn, `y los fotogramas clave llevan el estado de conexión (${JSON.stringify(clave?.conn?.Ana)})`);

paraB(); a2.ws.close(); b.ws.close();
fin();
