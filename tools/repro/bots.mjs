// La mesa no se para con bots: un humano que solo hace ping + 3 bots, ~60 s.
//
//   node repro/bots.mjs [--base=local|beta|<url>] [--seg=60]
//
// Una sala por dificultad (fácil, normal, difícil), las tres a la vez (~65 s).
// El humano no juega: marca «listo», manda pings como un cliente de verdad y escucha.
// FALLA solo por lo robusto: no arranca, error del servidor, o el centro se queda
// quieto más de 15 s. Cambios del centro, peleas y sets cerrados se informan sin fallar.
// Si alguien termina la partida antes de tiempo, se mide hasta entonces.
import {
  wait, ok, info, fin, send, esperar, pinguear, crear,
} from './comun.mjs';

const SEG = Number(process.argv.find(x => x.startsWith('--seg='))?.slice(6) ?? 60);
const MAX_SILENCIO = 15000;

async function sala(dif) {
  const h = await crear(`H-${dif}`);
  for (let i = 0; i < 3; i++) send(h, { type: 'add_bot', difficulty: dif });
  await wait(600);
  const parar = pinguear(h);
  send(h, { type: 'set_ready', ready: true });
  const gs = await esperar(h, m => m.type === 'game_start', 12000);
  if (!gs) { parar(); return { dif, h, arranco: false }; }
  const t0 = Date.now();
  await wait(SEG * 1000);
  parar();
  h.ws.close();

  // Solo lo posterior al arranque, y hasta el fin de la partida si llegó.
  let msgs = h.msgs.filter(m => m._t >= gs._t);
  const go = msgs.find(m => m.type === 'game_over');
  if (go) msgs = msgs.filter(m => m._t <= go._t);
  const tFin = go ? go._t : t0 + SEG * 1000;
  // El centro cambia con cada game_update; el silencio cuenta también desde el arranque y hasta el final.
  const cambios = msgs.filter(m => m.type === 'game_update').map(m => m._t);
  const marcas = [gs._t, ...cambios, tFin];
  let silencio = 0;
  for (let i = 1; i < marcas.length; i++) silencio = Math.max(silencio, marcas[i] - marcas[i - 1]);
  const n = t => msgs.filter(m => m.type === t).length;
  return {
    dif, h, arranco: true, terminada: !!go, seg: (tFin - gs._t) / 1000,
    cambios: cambios.length, peleas: n('swap_conflict'),
    sets: msgs.filter(m => m.type === 'set_verification_result' && m.is_valid).length,
    verif: n('verification_success'), silencio,
    errores: msgs.filter(m => m.type === 'error').map(m => m.message),
  };
}

info(`3 salas (easy, normal, hard) con 1 humano + 3 bots, ${SEG} s…`);
const res = await Promise.all(['easy', 'normal', 'hard'].map(sala));

for (const r of res) {
  ok(r.arranco, `${r.dif}: la partida arranca`);
  if (!r.arranco) continue;
  ok(r.errores.length === 0, `${r.dif}: el servidor no manda errores${r.errores.length ? ' ' + JSON.stringify(r.errores) : ''}`);
  ok(r.silencio <= MAX_SILENCIO, `${r.dif}: sin silencios de más de ${MAX_SILENCIO / 1000} s (máx ${(r.silencio / 1000).toFixed(1)} s)`);
}

console.log('\ndificultad  medido(s)  cambios  peleas  sets_ok  verif_ok  silencio_max(s)  fin');
for (const r of res) {
  if (!r.arranco) { console.log(`${r.dif.padEnd(10)}  NO ARRANCÓ`); continue; }
  console.log(`${r.dif.padEnd(10)}  ${r.seg.toFixed(0).padStart(9)}  ${String(r.cambios).padStart(7)}  ${String(r.peleas).padStart(6)}  ${String(r.sets).padStart(7)}  ${String(r.verif).padStart(8)}  ${(r.silencio / 1000).toFixed(1).padStart(15)}  ${r.terminada ? 'game_over' : 'en curso'}`);
}
fin();
