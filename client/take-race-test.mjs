// Reproduce el caso que confunde jugando: eliges una carta, desaparece, y no
// hay pelea ni aviso ninguno.
//
// Pasa cuando otro se lleva la carta en el instante ANTES de que llegue tu
// mensaje. El servidor, al no encontrarla ya en el centro, se limitaba a no
// hacer nada: ni pelea (esa solo salta si los dos vais a por ella dentro de los
// 300 ms de la ventana de conflicto) ni `swap_failed`. La carta se esfumaba de
// la mesa por la actualización del otro y tú te quedabas mirando.
//
// Uso: node client/take-race-test.mjs [ws://127.0.0.1:3000/ws]
//
// Necesita el servidor levantado. Desde la raíz del repo:
//   ./server/target/release/piles-server
const URL = process.argv[2] || 'ws://127.0.0.1:3000/ws';
const ESPERA_MS = 600;        // > CONFLICT_WINDOW (300 ms): así NO debe haber pelea

const dormir = (ms) => new Promise(r => setTimeout(r, ms));

/** Un cliente de mentira: manda, recibe y guarda lo que le llega. */
function cliente(nombre) {
    const ws = new WebSocket(URL);
    const c = {
        nombre, ws,
        recibido: [],
        sets: null,
        centro: [],
        abierto: new Promise((r, rej) => {
            ws.addEventListener('open', r);
            // Sin esto, si el servidor no está levantado el script se queda
            // colgado sin decir por qué.
            ws.addEventListener('error', () => rej(
                new Error(`no se pudo conectar a ${URL}: ¿está levantado el servidor?`)));
        }),
        envia: (o) => ws.send(JSON.stringify(o)),
        /** Espera a que llegue un tipo de mensaje, o null si no llega. */
        espera: (tipo, ms = 3000) => new Promise(r => {
            const ya = c.recibido.find(m => m.type === tipo);
            if (ya) return r(ya);
            const t = setTimeout(() => r(null), ms);
            const h = (ev) => {
                const m = JSON.parse(ev.data);
                if (m.type === tipo) { clearTimeout(t); ws.removeEventListener('message', h); r(m); }
            };
            ws.addEventListener('message', h);
        }),
        /** Mensajes recibidos después de un momento dado. */
        desde: (i) => c.recibido.slice(i),
    };
    ws.addEventListener('message', (ev) => {
        const m = JSON.parse(ev.data);
        c.recibido.push(m);
        if (m.type === 'game_start') { c.sets = m.your_sets; c.centro = m.center_cards; }
        if (m.type === 'game_update') c.centro = m.center_cards;
        if (m.type === 'swap_success') {
            c.centro = m.center_cards;
            if (m.your_new_set) c.sets[m.set_index] = m.your_new_set;
        }
        if (m.type === 'sets_resynced') { c.sets = m.your_sets; c.centro = m.center_cards; }
    });
    return c;
}

const fallo = (msg) => { console.log(`FALLO: ${msg}`); process.exit(1); };

const ana = cliente('Ana');
const beto = cliente('Beto');

await ana.abierto;
await beto.abierto;

// ── Montar una partida de dos ──
ana.envia({ type: 'create_lobby', nickname: 'Ana', max_players: 2, is_public: false });
const creada = await ana.espera('lobby_created');
if (!creada) fallo('no se creó la sala');
const sala = creada.lobby_id || creada.lobbyId || creada.id;
if (!sala) fallo(`lobby_created sin id: ${JSON.stringify(creada)}`);

beto.envia({ type: 'join_lobby', lobby_id: sala, nickname: 'Beto' });
await beto.espera('lobby_update');
beto.envia({ type: 'set_ready', ready: true });
await dormir(200);
ana.envia({ type: 'set_ready', ready: true });

if (!await ana.espera('game_start')) fallo('la partida no arrancó');
await beto.espera('game_start');
await dormir(300);

// ── Los dos sueltan, así que los dos deben una carta y pueden coger ──
ana.envia({ type: 'drop_card', my_card_index: 0 });
await ana.espera('swap_success');
beto.envia({ type: 'drop_card', my_card_index: 0 });
await beto.espera('swap_success');
await dormir(400);

// ── La carrera ──
// Ana coge una carta y se deja pasar de sobra la ventana de conflicto, para que
// lo de Beto NO pueda ser una pelea: cuando llegue, la carta ya no estará.
const objetivo = ana.centro[0];
if (!objetivo) fallo('el centro está vacío');

ana.envia({ type: 'take_card', card_id: objetivo.id });
await dormir(ESPERA_MS);

const desaparecida = !beto.centro.some(c => c.id === objetivo.id);
if (!desaparecida) fallo('Ana no llegó a llevarse la carta; el test no prueba nada');

const antes = beto.recibido.length;
beto.envia({ type: 'take_card', card_id: objetivo.id });
await dormir(1200);

const respuesta = beto.desde(antes).filter(m =>
    m.type === 'swap_failed' || m.type === 'swap_conflict' || m.type === 'swap_success');

console.log(`Beto pidió una carta que ya no estaba y recibió: ${
    respuesta.length ? respuesta.map(m => m.type).join(', ') : 'NADA'}`);

const pelea = respuesta.some(m => m.type === 'swap_conflict');
if (pelea) fallo('salió una pelea: la espera es menor que la ventana de conflicto');

if (!respuesta.length) {
    console.log('FALLO: el servidor no contestó nada. La carta se desvanece sin explicación.');
    process.exit(1);
}

console.log('OK: el servidor avisa de que la carta ya no está.');
ana.ws.close();
beto.ws.close();
process.exit(0);
