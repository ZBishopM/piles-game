// La burla: Ana coge una carta, Beto pide la misma carta después y le llega
// `swap_failed` (kind gone). Con la burla de Ana configurada y menos de 500 ms
// desde que SE EJECUTÓ su take (el servidor lo retrasa 300 ms: referencia =
// el swap_success de Ana), el mensaje lleva `taunt` y `by`. Si no, nada.
//
//   node repro/burla.mjs [--base=...]
import { cliente, send, esperar, wait, ok, fin, info } from './comun.mjs';

async function partida(tauntAna, tauntBeto) {
  const ana = await cliente('Ana');
  const beto = await cliente('Beto');
  send(ana, { type: 'create_lobby', nickname: 'Ana', max_players: 2, is_public: false, taunt: tauntAna });
  await esperar(ana, m => m.type === 'lobby_created');
  send(beto, { type: 'join_lobby', lobby_id: ana.lobby, nickname: 'Beto', taunt: tauntBeto });
  await esperar(beto, m => m.type === 'joined_lobby');
  await wait(200);
  send(beto, { type: 'set_ready', ready: true });
  send(ana, { type: 'set_ready', ready: true });
  const gs = await esperar(ana, m => m.type === 'game_start', 12000);
  await esperar(beto, m => m.type === 'game_start', 12000);
  if (!gs) throw new Error('la partida no arrancó');
  await wait(300);
  for (const c of [ana, beto]) {
    send(c, { type: 'drop_card', my_card_index: 0 });
    await esperar(c, m => m.type === 'swap_success');
  }
  await wait(400);
  return { ana, beto, carta: gs.center_cards[0] ?? null };
}

/** Ana coge, y `despues` ms tras ejecutarse su take Beto pide la misma carta. */
async function carrera(despues, tauntAna, tauntBeto) {
  const { ana, beto, carta } = await partida(tauntAna, tauntBeto);
  const centro = [...ana.msgs].reverse().find(m => m.center_cards)?.center_cards ?? [];
  const objetivo = centro[0] ?? carta;
  const n = ana.msgs.filter(m => m.type === 'swap_success').length;
  send(ana, { type: 'take_card', card_id: objetivo.id });
  await esperar(ana, () => ana.msgs.filter(m => m.type === 'swap_success').length > n);
  await wait(despues);
  const antes = beto.msgs.length;
  send(beto, { type: 'take_card', card_id: objetivo.id });
  const fallo = await esperar(beto, m => m.type === 'swap_failed' && beto.msgs.indexOf(m) >= antes, 2500);
  ana.ws.close(); beto.ws.close();
  return fallo;
}

let f = await carrera(100, 'honk');
ok(f?.kind === 'gone' && f.taunt === 'honk' && f.by === 'Ana', `a 100 ms: burla de Ana (${JSON.stringify(f)})`);

f = await carrera(700, 'honk');
ok(f?.kind === 'gone' && f.taunt === undefined && f.by === undefined, `a 700 ms: sin burla (${JSON.stringify(f)})`);

f = await carrera(100, 'no-existe');
ok(f?.kind === 'gone' && f.taunt === undefined, `id desconocido: sin burla (${JSON.stringify(f)})`);

f = await carrera(100, 'x'.repeat(5000));
ok(f?.kind === 'gone' && f.taunt === undefined, `id enorme: sin burla (${JSON.stringify(f)})`);

f = await carrera(100, undefined, 'boing');
ok(f?.kind === 'gone' && f.taunt === undefined, `Ana sin burla (aunque Beto la tenga): nada (${JSON.stringify(f)})`);

info('la referencia de tiempo es el swap_success de Ana (el take se ejecuta 300 ms después de llegar)');
fin();
