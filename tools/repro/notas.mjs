// La caja negra del cliente: las notas (`client_note`) se graban con la partida,
// las demasiado grandes no, y un tablero que no cuadra queda como `desync`.
//
//   node repro/notas.mjs [--base=local|beta]
//
// Nació del caso del 2026-09-30: tres plazos de 3 s agotados sin ningún intento
// de coger, y el servidor no veía los toques que el cliente descartaba.
import {
  wait, ok, info, fin, send, esperar, crear, unirse, empezar, pinguear, grabacionDe,
} from './comun.mjs';

const a = await crear('Ana');
const b = await unirse('Beto', a.lobby);
const [gsA, gsB] = await empezar(a, b);
const parar = [pinguear(a), pinguear(b)];
await wait(300);

// ── Notas normales y notas que no deben grabarse
send(a, { type: 'client_note', kind: 'tap_ignored', detail: { reason: 'moved', dist: 31, target: 'center', pointer: 'mouse' } });
send(a, { type: 'client_note', kind: 'x'.repeat(41), detail: {} });
send(a, { type: 'client_note', kind: 'err', detail: { msg: 'z'.repeat(5000) } });
await wait(500);

// ── Un tablero que no cuadra, dos veces seguidas (Ana) y una sola (Beto)
const centro = a.msgs.filter(m => m.type === 'swap_success' || m.type === 'game_update' || m.type === 'game_start')
  .at(-1)?.center_cards.map(c => c.id) ?? gsA.center_cards.map(c => c.id);
const manoA = gsA.your_sets.flatMap(s => s.map(c => (c ? c.id : null)));
const torcida = [...manoA]; torcida[0] = 99999;
send(a, { type: 'client_note', kind: 'state', detail: { hand: torcida, center: centro } });
send(b, { type: 'client_note', kind: 'state', detail: { hand: gsB.your_sets.flatMap(s => s.map(c => (c ? c.id : null))).map((x, i) => (i === 3 ? 88888 : x)), center: centro } });
await wait(300);
send(a, { type: 'client_note', kind: 'state', detail: { hand: torcida, center: centro } });
await wait(600);

const g = await grabacionDe(a.lobby);
const notas = g.lineas.filter(l => l.t === 'in' && l.m?.type === 'client_note');
info(`notas grabadas: ${notas.map(n => n.m.kind).join(', ')}`);
ok(notas.some(n => n.m.kind === 'tap_ignored' && n.m.detail.dist === 31 && n.from === 'Ana'), 'una nota normal queda grabada, con quién la mandó');
ok(!notas.some(n => n.m.kind.length > 40), 'una con el tipo demasiado largo no se graba');
ok(!notas.some(n => n.m.kind === 'err' && JSON.stringify(n.m.detail).length > 1000), 'una de 5.000 caracteres tampoco');

const desync = g.lineas.filter(l => l.t === 'desync');
info(`desync: ${JSON.stringify(desync)}`);
ok(desync.some(d => d.player === 'Ana' && d.diff.hand[0][0] === 0 && d.diff.hand[0][3] === 99999),
   'el tablero torcido de Ana, repetido, queda como desync con el hueco exacto');
ok(!desync.some(d => d.player === 'Beto'), 'una sola muestra torcida (Beto) no se da por desajuste');

// ── Y uno que cuadra no deja nada, y borra el aviso pendiente
send(b, { type: 'client_note', kind: 'state', detail: { hand: gsB.your_sets.flatMap(s => s.map(c => (c ? c.id : null))), center: centro } });
await wait(300);

parar.forEach(p => p());
a.ws.close(); b.ws.close();
fin();
