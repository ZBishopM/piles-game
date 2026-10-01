// /api/estado (qué hay en marcha, redactado) y /api/recordings?n=.
//
//   node repro/estado.mjs [--base=local|beta|prod]
//
// Sirve para lo que costó esta sesión: saber, antes de desplegar, si hay una
// partida en curso. Aquí se comprueba que el resumen dice la verdad y que no
// regala el código de una sala privada.
import {
  base, wait, ok, info, fin, send, esperar, cliente, crear, unirse, empezar, pinguear,
} from './comun.mjs';

const estado = async () => (await fetch(`${base}/api/estado`)).json();

const antes = await estado();
ok(typeof antes.version === 'string' && typeof antes.uptime_s === 'number', `versión ${antes.version}, en marcha ${antes.uptime_s} s`);
info(`conexiones: ${antes.conexiones}; salas: ${antes.salas.length}; partidas en curso: ${antes.partidas_en_curso}`);

// Una sala pública y otra privada
const pub = await crear('Ana');
const priv = await cliente('Beto');
send(priv, { type: 'create_lobby', nickname: 'Beto', max_players: 4, is_public: false });
await esperar(priv, m => m.type === 'seat_token');

let j = await estado();
const texto = JSON.stringify(j);
ok(texto.includes(pub.lobby), 'el código de la sala pública se ve');
ok(!texto.includes(priv.lobby), 'el de la privada NO se ve');
ok(j.salas.some(s => /^privada-\d+$/.test(s.id) && s.publica === false), 'en su lugar, privada-N');
ok(!/token|seat|sets"/.test(texto), 'y no hay secretos ni manos');

// Una partida en curso la cuenta
const c = await unirse('Caro', pub.lobby);
await empezar(pub, c);
const parar = [pinguear(pub), pinguear(c)];
j = await estado();
const sala = j.salas.find(s => s.id === pub.lobby);
ok(sala?.estado === 'partida', `la sala pasa a "partida" (${sala?.estado})`);
ok(j.partidas_en_curso >= 1, `partidas_en_curso ≥ 1 (${j.partidas_en_curso})`);
ok(sala?.jugadores.every(p => p.conectado), 'los dos jugadores constan como conectados');

// El listado de grabaciones: 10 por defecto, más con ?n=
const corta = await (await fetch(`${base}/api/recordings`)).json();
const larga = await (await fetch(`${base}/api/recordings?n=100`)).json();
ok(corta.length <= 10, `por defecto, como mucho 10 (${corta.length})`);
ok(larga.length >= corta.length && larga.length <= 100, `con ?n=100, hasta 100 (${larga.length})`);
const una = await (await fetch(`${base}/api/recordings?n=1`)).json();
ok(una.length === 1, '?n=1 devuelve una');

parar.forEach(p => p());
pub.ws.close(); c.ws.close(); priv.ws.close();
await wait(300);
fin();
