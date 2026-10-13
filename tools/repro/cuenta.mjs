// La cuenta atrás de 3 s antes de repartir.
//
//   node repro/cuenta.mjs [--base=local|beta]
//
// 1. Todos listos -> `countdown {seconds:3}` a todos y el `game_start` llega a
//    los ~3 s (ni antes ni mucho después).
// 2. Desmarcarse a mitad -> `countdown_cancelled` (not_ready), la partida NO
//    arranca; volver a marcarse abre otra y arranca UNA sola vez.
// 3. Entra un tercero sin estar listo -> cancelada (joined); al marcarse él,
//    cuenta nueva y arranca.
// 4. Sale uno de tres listos -> cancelada (left).
// 5. La grabación lleva la línea `conn` `cuenta_atras` / `fin`.
import {
  wait, ok, info, fin, send, esperar, crear, unirse, grabacionDe,
} from './comun.mjs';

const desde = (c, marca, pred, ms) => esperar(c, m => c.msgs.indexOf(m) >= marca && pred(m), ms);
const tipo = t => m => m.type === t;
const cuantos = (c, t, marca = 0) => c.msgs.filter((m, i) => i >= marca && m.type === t).length;

// ── 1: arranque a los ~3 s ──
{
  const a = await crear('Ana');
  const b = await unirse('Beto', a.lobby);
  send(b, { type: 'set_ready', ready: true });
  await wait(300);
  ok(cuantos(a, 'countdown') === 0, '1: con uno solo listo no hay cuenta atrás');
  const t0 = Date.now();
  send(a, { type: 'set_ready', ready: true });
  const ca = await esperar(a, tipo('countdown'), 2000);
  const cb = await esperar(b, tipo('countdown'), 2000);
  ok(ca?.seconds === 3 && cb?.seconds === 3, '1: los dos reciben countdown {seconds: 3}');
  await wait(1500);
  ok(cuantos(a, 'game_start') === 0 && cuantos(b, 'game_start') === 0, '1: a 1,5 s aún no ha repartido');
  const ga = await esperar(a, tipo('game_start'), 5000);
  const gb = await esperar(b, tipo('game_start'), 2000);
  const dt = (ga?._t ?? 0) - t0;
  info(`game_start a los ${dt} ms`);
  ok(!!ga && !!gb, '1: los dos reciben game_start');
  ok(dt >= 2800 && dt <= 4200, '1: llega a los ~3 s');
  await wait(300);
  const g = await grabacionDe(a.lobby);
  const l = g?.lineas.find(x => x.t === 'conn' && x.kind === 'cuenta_atras' && x.fase === 'fin');
  ok(!!l, '1: la grabación lleva conn/cuenta_atras/fin');
  a.ws.close(); b.ws.close();
}

// ── 2: desmarcarse a mitad ──
{
  const a = await crear('Cora');
  const b = await unirse('Dani', a.lobby);
  send(a, { type: 'set_ready', ready: true });
  send(b, { type: 'set_ready', ready: true });
  await esperar(a, tipo('countdown'), 2000);
  await wait(1000);
  send(b, { type: 'set_ready', ready: false });
  const c1 = await esperar(a, tipo('countdown_cancelled'), 1500);
  ok(c1?.reason === 'not_ready', '2: countdown_cancelled (not_ready) al desmarcarse');
  ok(!!(await esperar(b, tipo('countdown_cancelled'), 1000)), '2: y el otro también lo recibe');
  await wait(3500);
  ok(cuantos(a, 'game_start') === 0, '2: no arranca (la tarea vieja no dispara)');
  // Reabrir rápido: desmarcar y marcar de nuevo en seguida; arranca una vez.
  const n = a.msgs.length;
  send(b, { type: 'set_ready', ready: true });
  send(b, { type: 'set_ready', ready: false });
  send(b, { type: 'set_ready', ready: true });
  ok(!!(await desde(a, n, tipo('countdown'), 2000)), '2: reabre la cuenta');
  await wait(4500);
  ok(cuantos(a, 'game_start') === 1 && cuantos(b, 'game_start') === 1, '2: cancelar y reabrir rápido arranca una sola vez');
  a.ws.close(); b.ws.close();
}

// ── 3: entra un tercero sin listo ──
{
  const a = await crear('Eva');
  const b = await unirse('Fran', a.lobby);
  send(a, { type: 'set_ready', ready: true });
  send(b, { type: 'set_ready', ready: true });
  await esperar(a, tipo('countdown'), 2000);
  await wait(800);
  const c = await unirse('Gael', a.lobby);
  const can = await esperar(a, tipo('countdown_cancelled'), 1500);
  ok(can?.reason === 'joined', '3: entra otro sin listo -> countdown_cancelled (joined)');
  ok(!!(await esperar(c, m => m.type === 'countdown_cancelled' || m.type === 'lobby_update', 1500)), '3: el recién llegado ve la sala');
  await wait(3500);
  ok(cuantos(a, 'game_start') === 0, '3: no arranca sin el tercero');
  const n = a.msgs.length;
  send(c, { type: 'set_ready', ready: true });
  ok(!!(await desde(a, n, tipo('countdown'), 2000)), '3: al marcarse el tercero, cuenta nueva');
  ok(!!(await esperar(c, tipo('game_start'), 6000)), '3: y arranca para los tres');

  a.ws.close(); b.ws.close(); c.ws.close();
}

// ── 4: sale uno ──
{
  const a = await crear('Hugo');
  const b = await unirse('Ines', a.lobby);
  const c = await unirse('Jon', a.lobby);
  for (const x of [a, b, c]) send(x, { type: 'set_ready', ready: true });
  await esperar(a, tipo('countdown'), 2000);
  await wait(600);
  send(c, { type: 'leave_lobby' });
  const can = await esperar(a, tipo('countdown_cancelled'), 1500);
  ok(can?.reason === 'left', '4: sale uno -> countdown_cancelled (left)');
  await wait(3500);
  ok(cuantos(a, 'game_start') === 0, '4: no arranca tras la salida (hasta que alguien se marque de nuevo)');
  a.ws.close(); b.ws.close(); c.ws.close();
}

// ── 5: un bot con un humano listo también espera la cuenta ──
{
  const a = await crear('Kiko');
  send(a, { type: 'set_ready', ready: true });
  const t0 = Date.now();
  send(a, { type: 'add_bot', difficulty: 'easy' });
  ok(!!(await esperar(a, tipo('countdown'), 2000)), '5: añadir un bot abre la cuenta atrás');
  await wait(1200);
  ok(cuantos(a, 'game_start') === 0, '5: y no reparte al instante');
  const g = await esperar(a, tipo('game_start'), 5000);
  ok(!!g && g._t - t0 >= 2800, `5: reparte tras ~3 s (${(g?._t ?? 0) - t0} ms)`);
  a.ws.close();
}

fin();
