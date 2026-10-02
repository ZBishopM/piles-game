// Jugadas en el mismo milisegundo: ninguna se pierde, y el servidor corrige a quien se desincroniza.
//
//   node repro/mismo-ms.mjs [--base=local|beta] [--rondas=60]
//
// Nació de la partida del 2026-10-02 (sala DBBWV4): a los 47,3 s un bot y una
// persona soltaron una carta en el MISMO milisegundo. El servidor leía una
// copia de la sala para cada una y la última en escribir borraba la jugada de
// la otra: el bot creyó deber una carta que el servidor ya no le debía y estuvo
// 6 minutos pidiendo cartas ("Suelta una carta antes de coger otra") sin soltar
// nada.
//
// 1. Cuatro jugadores sueltan a la vez (cuatro `send` seguidos) y cada uno coge
//    una carta distinta. Con el fallo, alguien recibe `swap_failed` al coger.
// 2. Quien pide coger sin deber nada (o soltar debiendo) recibe además su mano
//    verdadera (`sets_resynced`), para que no se quede así hasta que otra cosa lo
//    arregle. Contra un servidor SIN esto, esta parte da "FALLA".
import {
  base, wait, ok, info, fin, send, esperar, crear, unirse, pinguear, largo,
} from './comun.mjs';

const rondas = Number(process.argv.find(a => a.startsWith('--rondas='))?.slice(9) ?? 60);

const a = await crear('Ana');
const resto = [await unirse('Beto', a.lobby), await unirse('Caro', a.lobby), await unirse('Dani', a.lobby)];
const jug = [a, ...resto];
for (const c of jug) send(c, { type: 'set_ready', ready: true });
const starts = await Promise.all(jug.map(c => esperar(c, m => m.type === 'game_start', 8000)));
ok(starts.every(Boolean), 'los cuatro empiezan la partida');
const parar = jug.map(c => pinguear(c));

const centro = c => {
  const m = [...c.msgs].reverse().find(x => Array.isArray(x.center_cards));
  return (m?.center_cards ?? []).map(x => x.id);
};
const tras = (c, marca, pred, ms) => esperar(c, m => c.msgs.indexOf(m) >= marca && pred(m), ms);
const respuesta = m => m.type === 'swap_success' || m.type === 'swap_failed';

let perdidas = 0, soltadasRechazadas = 0, primeraFalla = null, centrosDistintos = 0;
for (let ronda = 1; ronda <= rondas; ronda++) {
  const pre = centro(a);
  if (pre.length < 4) { info(`ronda ${ronda}: el centro tiene ${pre.length} cartas, se para`); break; }

  const m1 = jug.map(c => c.msgs.length);
  for (const c of jug) send(c, { type: 'drop_card', my_card_index: 0 });   // los cuatro, seguidos
  const r1 = await Promise.all(jug.map((c, i) => tras(c, m1[i], respuesta, 1500)));
  const malas1 = r1.filter(r => r?.type !== 'swap_success').length;
  soltadasRechazadas += malas1;
  await wait(150);

  const m2 = jug.map(c => c.msgs.length);
  jug.forEach((c, i) => send(c, { type: 'take_card', card_id: pre[i] }));
  const r2 = await Promise.all(jug.map((c, i) => tras(c, m2[i], respuesta, 2500)));
  const malas2 = r2.filter(r => r?.type !== 'swap_success');
  perdidas += malas2.length;
  if (malas2.length && primeraFalla === null) {
    primeraFalla = ronda;
    info(`ronda ${ronda}: ${malas2.length} jugador(es) no pudieron coger tras soltar a la vez: ${malas2.map(r => r?.reason ?? 'sin respuesta').join(' | ')}`);
  }
  await wait(250);
  // En reposo los cuatro tienen que ver el MISMO centro. Si dos jugadas seguidas
  // se notifican en orden inverso, unos se quedan con el centro de la vieja.
  const vistas = jug.map(c => centro(c).slice().sort((x, y) => x - y).join(','));
  if (new Set(vistas).size > 1) {
    centrosDistintos++;
    if (centrosDistintos === 1) info(`ronda ${ronda}: los jugadores ven centros distintos: ${vistas.map(v => `[${v}]`).join(' ')}`);
  }
}
ok(perdidas === 0 && soltadasRechazadas === 0,
   `${rondas} rondas con 4 jugadores soltando a la vez: ninguna jugada perdida (cogidas rechazadas: ${perdidas}, soltadas rechazadas: ${soltadasRechazadas}${primeraFalla ? `, primera en la ronda ${primeraFalla}` : ''})`);

ok(centrosDistintos === 0, `y al terminar cada ronda todos ven el mismo centro (rondas con centros distintos: ${centrosDistintos})`);

// ── 2. El servidor corrige a quien se desincroniza ─────────────────────────
// Al día: nadie debe nada tras la última ronda y no llega nada más (con la
// máquina cargada llegaban `game_update` rezagados y se leía un centro viejo).
async function enCalma(cs, ms = 500) {
  for (;;) {
    const n = cs.map(c => c.msgs.filter(m => m.type !== 'pong').length);
    await wait(ms);
    if (cs.every((c, i) => c.msgs.filter(m => m.type !== 'pong').length === n[i])) return;
  }
}
await enCalma(jug);
{
  const pre = centro(a);
  const marca = a.msgs.length;
  send(a, { type: 'take_card', card_id: pre[0] });     // coger sin deber nada
  const fallo = await tras(a, marca, m => m.type === 'swap_failed', 2000);
  if (fallo?.kind !== 'rule') info(`centro que veía Ana: [${pre}]; últimos mensajes: ${a.msgs.slice(-6).map(m => m.type).join(', ')}`);
  const resync = await tras(a, marca, m => m.type === 'sets_resynced', 1500);
  ok(fallo?.kind === 'rule', `coger sin deber nada se rechaza como regla (${fallo?.reason})`);
  ok(!!resync, 'y el servidor le reenvía su mano verdadera (sets_resynced)');
  ok(resync && resync.your_sets.every(s => s.every(c => c !== null)), 'que no tiene ningún hueco: el servidor no le debe nada');
}
{
  // Soltar y volver a soltar debiendo: el segundo se rechaza y también se corrige.
  await enCalma(jug);
  const marca = a.msgs.length;
  send(a, { type: 'drop_card', my_card_index: 1 });
  await tras(a, marca, m => m.type === 'swap_success', 2000);
  const marca2 = a.msgs.length;
  send(a, { type: 'drop_card', my_card_index: 2 });
  const fallo = await tras(a, marca2, m => m.type === 'swap_failed', 2000);
  const resync = await tras(a, marca2, m => m.type === 'sets_resynced', 1500);
  ok(fallo?.kind === 'rule', `soltar debiendo una carta se rechaza (${fallo?.reason})`);
  ok(!!resync, 'y también se le reenvía su mano');
  const huecos = resync ? resync.your_sets.flat().filter(c => c === null).length : -1;
  ok(huecos === 1, `con exactamente el hueco que debe (${huecos})`);
  // Salda la deuda para no dejarla colgando.
  const pre = centro(a);
  send(a, { type: 'take_card', card_id: pre[0] });
  await wait(700);
}

parar.forEach(p => p());
for (const c of jug) c.ws.close();
fin();
