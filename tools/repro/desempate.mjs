// Empate en una pelea -> muerte súbita (rondas extra de 1 s).
//
//   node repro/desempate.mjs [--base=local|beta|<url>]      (~25 s)
//
// Antes, con los clicks iguales (incluido 0-0) ganaba quien pulsó SEGUNDO la
// carta: el empate se resolvía por orden de llegada y parecía injusto. Ahora el
// servidor abre hasta 3 rondas extra con los contadores a cero y, si siguen
// empatados, echa a suertes (y lo dice en `qte_resolved.random`).
//
// Tres peleas con dos sockets reales:
//   A. nadie pulsa (0-0): 3 rondas extra y al azar (~6 s).
//   B. ambos pulsan lo mismo (5-5) y en la ronda extra solo Ana: gana Ana tras 1 ronda.
//   C. quien cede durante la muerte súbita pierde, aunque el otro no pulse.
// En todas: `qte_tiebreak` llega a los dos, `qte_resolved` trae `clicks`/`tiebreaks`,
// el ganador recibe `swap_success` y el perdedor `swap_failed` + `stunned`
// (salvo cesión: sin bloqueo).
import { crear, unirse, empezar, send, esperar, wait, ok, info, fin } from './comun.mjs';

async function preparar() {
  const ana = await crear('Ana');
  const beto = await unirse('Beto', ana.lobby);
  await empezar(ana, beto);
  await wait(300);
  for (const c of [ana, beto]) {
    send(c, { type: 'drop_card', my_card_index: 0 });
    await esperar(c, m => m.type === 'swap_success');
  }
  await wait(400);
  const centro = [...ana.msgs].reverse().find(m => m.center_cards)?.center_cards;
  const carta = centro[0].id;
  send(ana, { type: 'take_card', card_id: carta });
  send(beto, { type: 'take_card', card_id: carta });
  const conflicto = await esperar(ana, m => m.type === 'swap_conflict', 3000);
  ok(!!conflicto, 'empieza la pelea');
  return { ana, beto, t0: conflicto?._t ?? Date.now(), carta };
}

const tiebreaks = c => c.msgs.filter(m => m.type === 'qte_tiebreak');
const de = (c, t) => c.msgs.filter(m => m.type === t);

async function final(nombre, { ana, beto }, esperadoGanador, esperadasRondas, azar, cedio = false) {
  const res = await esperar(ana, m => m.type === 'qte_resolved', 12000);
  ok(!!res, `${nombre}: la pelea se resuelve`);
  if (!res) return null;
  const ganador = res.winner === 'Ana' ? ana : beto;
  const perdedor = ganador === ana ? beto : ana;
  await wait(500);
  info(`${nombre}: ganó ${res.winner} · rondas extra ${res.tiebreaks ?? 0} · clicks ${JSON.stringify(res.clicks)} · azar ${res.random ?? false}`);
  ok(tiebreaks(ana).length === esperadasRondas && tiebreaks(beto).length === esperadasRondas,
    `${nombre}: ambos reciben ${esperadasRondas} qte_tiebreak (rondas ${tiebreaks(ana).map(m => m.round)}; duración ${tiebreaks(ana)[0]?.duration ?? '-'})`);
  ok((res.tiebreaks ?? 0) === esperadasRondas, `${nombre}: qte_resolved.tiebreaks = ${res.tiebreaks ?? 'ausente'}`);
  ok(!!res.clicks && 'Ana' in res.clicks && 'Beto' in res.clicks, `${nombre}: qte_resolved trae los clicks finales`);
  ok(!!res.random === azar, `${nombre}: random ${azar ? 'sí' : 'no'}`);
  if (esperadoGanador) ok(res.winner === esperadoGanador, `${nombre}: gana ${esperadoGanador}`);
  ok(de(ganador, 'swap_success').length >= 2, `${nombre}: el ganador recibe swap_success`);
  ok(de(perdedor, 'swap_failed').some(m => m.kind === 'gone'), `${nombre}: el perdedor recibe swap_failed`);
  ok(de(perdedor, 'stunned').length === (cedio ? 0 : 1), `${nombre}: bloqueo al perdedor ${cedio ? '(no: cedió)' : '(sí)'}`);
  return res;
}

// ── A. 0-0 todo el rato ──
{
  const j = await preparar();
  const res = await final('A 0-0', j, null, 3, true);
  if (res) {
    const dur = res._t - j.t0;
    ok(dur >= 5800 && dur < 8500, `A: tarda 3 s + 3 rondas (${dur} ms)`);
  }
  for (const c of [j.ana, j.beto]) c.ws.close();
}

// ── B. 5-5 y luego solo Ana ──
{
  const j = await preparar();
  for (let i = 0; i < 5; i++) { send(j.ana, { type: 'qte_click' }); send(j.beto, { type: 'qte_click' }); await wait(60); }
  const tb = await esperar(j.ana, m => m.type === 'qte_tiebreak', 5000);
  ok(!!tb && tb.round === 1 && tb.duration === 1000, 'B: tras 5-5 llega qte_tiebreak ronda 1 de 1000 ms');
  const dur = (tb?._t ?? 0) - j.t0;
  ok(dur >= 2800 && dur < 3600, `B: la ronda extra empieza al acabar los 3 s (${dur} ms)`);
  for (let i = 0; i < 4; i++) { send(j.ana, { type: 'qte_click' }); await wait(80); }
  await final('B 5-5', j, 'Ana', 1, false);
  for (const c of [j.ana, j.beto]) c.ws.close();
}

// ── C. ceder en muerte súbita ──
{
  const j = await preparar();
  await esperar(j.ana, m => m.type === 'qte_tiebreak', 5000);
  send(j.beto, { type: 'give_up_card' });
  await final('C ceder', j, 'Ana', 1, false, true);
  for (const c of [j.ana, j.beto]) c.ws.close();
}

fin();
