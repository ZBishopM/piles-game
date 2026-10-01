// Asiento con secreto, salir de verdad y esperar en vez de cancelar.
//
//   node repro/asiento.mjs [--base=local|beta] [--largo]
//
// --largo espera los 30 s de gracia (se cancela si no vuelve nadie).
// Nació del caso del 2026-09-30: tras un corte de red el servidor tardó ~100 s
// en notar la conexión muerta y los reintentos chocaban con el propio apodo.
import {
  base, largo, wait, ok, fin, cliente, send, tipos, ultimo, esperar, lista, crear,
  unirse, empezar, existe, grabaciones,
} from './comun.mjs';

// ── 1. Crear → salir de verdad
{
  const a = await crear('Ana');
  ok(a.token?.length === 32, `crear da un secreto de 128 bits (${a.token?.length} hex)`);
  ok((await lista()).includes(a.lobby), 'la sala sale en la lista');
  send(a, { type: 'leave_lobby' }); await wait(400);
  ok(!(await lista()).includes(a.lobby), 'tras salir, la sala NO sale en la lista');
  ok(!(await existe(a.lobby)), 'y el código ya no existe');
  send(a, { type: 'create_lobby', nickname: 'Ana', max_players: 4, is_public: true }); await wait(400);
  ok(tipos(a).filter(t => t === 'lobby_created').length === 2 && !tipos(a).includes('error'),
     'el mismo apodo vuelve a crear sin error');
  a.ws.close();
}

// ── 2. Crear otra sin salir (cliente viejo): la primera desaparece
{
  const a = await crear('Beto');
  const primera = a.lobby;
  send(a, { type: 'create_lobby', nickname: 'Beto', max_players: 4, is_public: true }); await wait(500);
  ok(a.lobby !== primera, 'crea una segunda sala');
  ok(!(await existe(primera)), 'la primera desaparece (una conexión, un asiento)');
  a.ws.close();
}

// ── 3. Cliente viejo: "salió" solo en pantalla y escribe otra vez el mismo código
{
  const a = await crear('Caro');
  const antes = a.msgs.length;
  send(a, { type: 'join_lobby', nickname: 'Caro', lobby_id: a.lobby }); await wait(500);
  const nuevos = a.msgs.slice(antes).map(m => m.type);
  ok(nuevos.includes('joined_lobby') && !nuevos.includes('error'),
     `unirse a tu propia sala confirma, sin "ya hay alguien": ${nuevos}`);
  a.ws.close();
}

// ── 4. Recuperar el asiento en espera con el secreto, con la conexión vieja viva
{
  const a = await crear('Dani');
  const a2 = await cliente('Dani2');
  send(a2, { type: 'join_lobby', nickname: 'Dani', lobby_id: a.lobby, seat_token: a.token });
  const j = await esperar(a2, m => m.type === 'joined_lobby');
  ok(!!j && j.spectator === false, 'la conexión nueva recupera el asiento');
  ok(a2.token === a.token, 'el secreto no rota');
  ok(!!(await esperar(a, m => m.type === 'seat_replaced')), 'la conexión vieja recibe seat_replaced');
  a.ws.close(); await wait(400);
  const gente = ultimo(a2, 'lobby_update')?.players?.length;
  ok(gente === 1, `al cerrarse la vieja el asiento sigue (jugadores: ${gente})`);
  ok((await lista()).includes(a2.lobby), 'y la sala sigue');
  a2.ws.close();
}

// ── 5. En partida: tomar el asiento con la mano intacta, con la conexión vieja viva
const secretos = [];
{
  const a = await crear('Eva');
  const b = await unirse('Fran', a.lobby);
  secretos.push(a.token, b.token);
  const [gsA] = await empezar(a, b);
  ok(!!gsA, 'la partida arranca');
  const manoInicial = JSON.stringify(gsA.your_sets);

  const a2 = await cliente('Eva2');
  send(a2, { type: 'join_lobby', nickname: 'Eva', lobby_id: a.lobby, seat_token: a.token });
  const gs2 = await esperar(a2, m => m.type === 'game_start', 3000);
  ok(!!gs2, 'recupera la partida al instante');
  ok(gs2 && JSON.stringify(gs2.your_sets) === manoInicial, 'con su misma mano');
  ok(!!(await esperar(a, m => m.type === 'seat_replaced')), 'la vieja se entera');
  ok(!tipos(b).includes('player_disconnected'), 'Fran no ve ninguna desconexión');

  a.ws.terminate(); await wait(600);   // la vieja se cierra: no debe tocar el asiento
  send(a2, { type: 'drop_card', my_card_index: 0 });
  ok(!!(await esperar(a2, m => m.type === 'swap_success', 2000)), 'tras cerrarse la vieja, la nueva sigue jugando');
  ok(!tipos(b).includes('player_disconnected'), 'y seguimos sin desconexión');

  // 6. Un homónimo sin secreto, o con uno falso, no entra a su sitio
  const c = await cliente('intruso');
  send(c, { type: 'join_lobby', nickname: 'Eva', lobby_id: a.lobby });
  const e1 = await esperar(c, m => m.type === 'error', 2000);
  ok(!!e1 && /Ya hay alguien/.test(e1.message), `sin secreto: "${e1?.message}"`);
  send(c, { type: 'join_lobby', nickname: 'Eva', lobby_id: a.lobby, seat_token: 'f'.repeat(32) });
  await wait(500);
  ok(c.msgs.filter(m => m.type === 'error').length === 2, 'con un secreto falso: también error');
  ok(!tipos(c).includes('game_start'), 'y no ve nada de la partida');
  c.ws.close();

  // 7. Se cae de verdad: otro con su apodo sigue sin poder; con el secreto, sí
  a2.ws.terminate(); await wait(600);
  ok(!!(await esperar(b, m => m.type === 'player_disconnected')), 'Fran ve la desconexión de Eva');
  const d = await cliente('homonimo');
  send(d, { type: 'join_lobby', nickname: 'Eva', lobby_id: a.lobby });
  ok(!!(await esperar(d, m => m.type === 'error', 2000)), 'caída y en gracia: el apodo sigue siendo suyo');
  d.ws.close();
  const a3 = await cliente('Eva3');
  send(a3, { type: 'join_lobby', nickname: 'Eva', lobby_id: a.lobby, seat_token: a.token });
  ok(!!(await esperar(a3, m => m.type === 'game_start', 3000)), 'con el secreto vuelve dentro de la gracia');
  a3.ws.close(); b.ws.close();
}

// ── 8. Una persona contra un bot: caerse no cancela al instante
{
  const d = await crear('Gus');
  send(d, { type: 'add_bot', difficulty: 'easy' }); await wait(500);
  send(d, { type: 'set_ready', ready: true });
  ok(!!(await esperar(d, m => m.type === 'game_start', 6000)), 'arranca contra el bot');
  secretos.push(d.token);
  const lobby = d.lobby;
  d.ws.terminate(); await wait(4000);
  const d2 = await cliente('Gus2');
  send(d2, { type: 'join_lobby', nickname: 'Gus', lobby_id: lobby, seat_token: d.token });
  ok(!!(await esperar(d2, m => m.type === 'game_start', 3000)),
     'vuelve a los 4 s: la partida seguía (antes se cancelaba en el mismo ms)');
  if (largo) {
    d2.ws.terminate();
    console.log('…esperando los 30 s de gracia');
    await wait(33000);
    const f = (await grabaciones(100)).find(r => r.lobby === lobby);
    const txt = await (await fetch(`${base}/api/recordings/${f.file}`)).text();
    const final = JSON.parse(txt.trim().split('\n').at(-1));
    ok(final.reason === 'cancelled', `si no vuelve, se cancela al cumplirse el plazo (reason=${final.reason})`);
    ok(!(await existe(lobby)), 'y la sala desaparece (solo quedaba el bot)');
  } else d2.ws.close();
}

// ── 9. Ninguna grabación contiene un secreto
{
  const lista = await grabaciones(100);
  let fugas = 0;
  for (const r of lista) {
    const txt = await (await fetch(`${base}/api/recordings/${r.file}`)).text();
    for (const s of secretos) if (s && txt.includes(s)) fugas++;
    if (txt.includes('seat_token')) fugas++;
  }
  ok(fugas === 0, `ninguna de ${lista.length} grabaciones contiene un secreto`);
}

fin();
