// Entrar en una partida ya empezada.
//
// Antes esto devolvía `error: "El juego ya ha comenzado"` y te quedabas fuera.
// Ahora entras a mirar. Lo que se comprueba:
//
//   a) el que llega tarde recibe `game_start` —con los sets vacíos, porque no
//      tiene mano— en vez de un `error`;
//   b) a los que juegan les llega `spectators: 1` en su `game_update`;
//   c) lo que mande el espectador no mueve nada: el guardia del servidor lo
//      tira antes de llegar al `match`.
//
// Uso: node tools/spectator-test.mjs [ws://127.0.0.1:3000/ws]
// Necesita el servidor levantado desde la raíz del repo.
const URL = process.argv[2] || 'ws://127.0.0.1:3000/ws';
const dormir = (ms) => new Promise(r => setTimeout(r, ms));
const fallo = (msg) => { console.log(`FALLO: ${msg}`); process.exit(1); };

function cliente(nombre) {
    const ws = new WebSocket(URL);
    const c = {
        nombre, ws, recibido: [], sets: null, centro: [],
        abierto: new Promise((r, rej) => {
            ws.addEventListener('open', r);
            ws.addEventListener('error', () => rej(new Error(`sin servidor en ${URL}`)));
        }),
        envia: (o) => ws.send(JSON.stringify(o)),
        espera: (tipo, ms = 4000) => new Promise(r => {
            const ya = c.recibido.find(m => m.type === tipo);
            if (ya) return r(ya);
            const t = setTimeout(() => r(null), ms);
            const h = (ev) => {
                const m = JSON.parse(ev.data);
                if (m.type === tipo) { clearTimeout(t); ws.removeEventListener('message', h); r(m); }
            };
            ws.addEventListener('message', h);
        }),
        ultimo: (tipo) => [...c.recibido].reverse().find(m => m.type === tipo),
    };
    ws.addEventListener('message', (ev) => {
        const m = JSON.parse(ev.data);
        c.recibido.push(m);
        if (m.type === 'game_start') { c.sets = m.your_sets; c.centro = m.center_cards; }
        if (m.type === 'game_update') c.centro = m.center_cards;
        if (m.type === 'swap_success') c.centro = m.center_cards;
    });
    return c;
}

const ana = cliente('Ana'), beto = cliente('Beto'), caro = cliente('Caro');
for (const c of [ana, beto, caro]) await c.abierto;

ana.envia({ type: 'create_lobby', nickname: 'Ana', max_players: 4, is_public: false });
const creada = await ana.espera('lobby_created');
if (!creada) fallo('no se creó la sala');
const sala = creada.lobby_id;

beto.envia({ type: 'join_lobby', lobby_id: sala, nickname: 'Beto' });
if (!await beto.espera('lobby_update')) fallo('Beto no entró');

beto.envia({ type: 'set_ready', ready: true });
await dormir(200);
ana.envia({ type: 'set_ready', ready: true });
for (const c of [ana, beto]) if (!await c.espera('game_start')) fallo(`${c.nombre} no arrancó`);
await dormir(300);

// ── (a) Caro llega tarde ──────────────────────────────────────────────────
caro.envia({ type: 'join_lobby', lobby_id: sala, nickname: 'Caro' });
const entrada = await caro.espera('joined_lobby');
if (!entrada) fallo('Caro no recibió respuesta al entrar');
if (entrada.spectator !== true) fallo('Caro entró como jugador, no como espectador');
if (caro.recibido.some(m => m.type === 'error')) {
    fallo(`a Caro le llegó un error: ${JSON.stringify(caro.ultimo('error'))}`);
}

const inicio = await caro.espera('game_start');
if (!inicio) fallo('Caro no recibió el tablero');
if (inicio.your_sets.length !== 0) {
    fallo(`Caro recibió ${inicio.your_sets.length} sets propios; un espectador no tiene mano`);
}
if (!inicio.center_cards.length) fallo('Caro recibió el centro vacío');
console.log(`OK  Caro entra mirando y ve ${inicio.center_cards.length} cartas en el centro`);

// ── (b) los que juegan saben que les miran ────────────────────────────────
ana.envia({ type: 'drop_card', my_card_index: 0 });
await ana.espera('swap_success');
await dormir(400);

const upd = beto.ultimo('game_update');
if (!upd) fallo('Beto no recibió ningún game_update');
if (upd.spectators !== 1) fallo(`Beto ve spectators=${upd.spectators}, se esperaba 1`);
console.log('OK  a los jugadores les llega 👁 1');

// El espectador también recibe las difusiones: es lo que le deja mirar.
if (!caro.ultimo('game_update')) fallo('al espectador no le llegan las difusiones');
console.log('OK  el espectador recibe las difusiones de la sala');

// ...y ninguna mano privada, que es la mitad que no debe ver.
const privados = caro.recibido.filter(m => m.type === 'swap_success' || m.type === 'sets_resynced');
if (privados.length) fallo(`al espectador le llegaron ${privados.length} mensajes privados`);
console.log('OK  el espectador no recibe mensajes privados de nadie');

// ── (c) lo que mande el espectador no mueve nada ──────────────────────────
const antes = JSON.stringify(beto.centro.map(c => c.id));
caro.envia({ type: 'drop_card', my_card_index: 0 });
caro.envia({ type: 'take_card', card_id: beto.centro[0].id });
caro.envia({ type: 'flip_set', set_index: 0 });
caro.envia({ type: 'set_ready', ready: true });
await dormir(700);

const despues = JSON.stringify(beto.centro.map(c => c.id));
if (antes !== despues) fallo(`el espectador movió el centro:\n  antes  ${antes}\n  después ${despues}`);
console.log('OK  lo que manda el espectador se ignora entero');

console.log('OK: se puede entrar a mirar una partida en curso.');
for (const c of [ana, beto, caro]) c.ws.close();
process.exit(0);
