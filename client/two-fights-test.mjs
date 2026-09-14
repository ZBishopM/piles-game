// Dos peleas a la vez. Con 4 jugadores es de lo más normal, y el servidor solo
// guardaba UNA pelea (`active_qte: Option<QteState>`), así que la segunda
// pisaba a la primera.
//
// Lo que se ve jugando:
//   - tus clicks dejan de contar (ya no sales en `participants` de la pelea que
//     hay guardada), así que pierdes contra quien sea, bot incluido;
//   - una de las dos peleas se corta a los pocos segundos;
//   - la otra no recibe nunca `qte_resolved` y sus dos jugadores se quedan
//     colgados.
//
// Uso: node client/two-fights-test.mjs [ws://127.0.0.1:3000/ws]
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
        tiene: (tipo) => c.recibido.some(m => m.type === tipo),
    };
    ws.addEventListener('message', (ev) => {
        const m = JSON.parse(ev.data);
        c.recibido.push(m);
        if (m.type === 'game_start') { c.sets = m.your_sets; c.centro = m.center_cards; }
        if (m.type === 'game_update') c.centro = m.center_cards;
        if (m.type === 'swap_success') c.centro = m.center_cards;
        if (m.type === 'sets_resynced') c.centro = m.center_cards;
    });
    return c;
}

const nombres = ['Ana', 'Beto', 'Caro', 'Dani'];
const p = nombres.map(cliente);
for (const c of p) await c.abierto;

p[0].envia({ type: 'create_lobby', nickname: 'Ana', max_players: 4, is_public: false });
const creada = await p[0].espera('lobby_created');
if (!creada) fallo('no se creó la sala');
const sala = creada.lobby_id || creada.lobbyId || creada.id;

for (let i = 1; i < 4; i++) {
    p[i].envia({ type: 'join_lobby', lobby_id: sala, nickname: nombres[i] });
    await p[i].espera('lobby_update');
}

// Esperar a que los cuatro estén DENTRO antes de decir "listo". Marcar listo
// con la sala a medio llenar dejaba la partida sin arrancar de vez en cuando.
const cuatroDentro = async () => {
    for (let intento = 0; intento < 40; intento++) {
        const u = [...p[0].recibido].reverse().find(m => m.type === 'lobby_update');
        if (u && (u.players || []).length === 4) return true;
        await dormir(100);
    }
    return false;
};
if (!await cuatroDentro()) fallo('no llegaron a entrar los cuatro');

for (let i = 1; i < 4; i++) { p[i].envia({ type: 'set_ready', ready: true }); await dormir(120); }
await dormir(300);
p[0].envia({ type: 'set_ready', ready: true });

for (const c of p) if (!await c.espera('game_start')) fallo(`${c.nombre} no arrancó`);
await dormir(400);

// Los cuatro sueltan: así los cuatro deben una carta y pueden coger.
for (const c of p) { c.envia({ type: 'drop_card', my_card_index: 0 }); await c.espera('swap_success'); }
await dormir(500);

const centro = p[0].centro;
if (centro.length < 2) fallo(`el centro tiene ${centro.length} cartas, hacen falta 2`);
const [x, y] = [centro[0].id, centro[1].id];

// Dos parejas, dos cartas distintas, a la vez.
p[0].envia({ type: 'take_card', card_id: x });
p[1].envia({ type: 'take_card', card_id: x });
p[2].envia({ type: 'take_card', card_id: y });
p[3].envia({ type: 'take_card', card_id: y });

await dormir(1000);
const peleando = p.filter(c => c.tiene('swap_conflict')).map(c => c.nombre);
console.log(`peleas anunciadas a: ${peleando.join(', ') || 'nadie'}`);

// Clicks de todos, como haría cualquiera.
for (let i = 0; i < 12; i++) {
    for (const c of p) c.envia({ type: 'qte_click' });
    await dormir(80);
}

await dormir(5000);

// `qte_resolved` se difunde a TODA la sala, así que "todos recibieron uno" no
// prueba nada: con una sola resolución la reciben los cuatro igual. Lo que hay
// que contar es cuántas resoluciones hubo. Dos peleas, dos resoluciones.
const conflictos = p[0].recibido.filter(m => m.type === 'swap_conflict').length;
const resoluciones = p[0].recibido.filter(m => m.type === 'qte_resolved').length;
console.log(`peleas empezadas: ${conflictos} · resueltas: ${resoluciones}`);

if (conflictos < 2) fallo(`solo empezó ${conflictos} pelea; el test necesita dos a la vez`);
if (resoluciones < conflictos) {
    fallo(`${conflictos} peleas y solo ${resoluciones} resolución(es): una se pisó a la otra`);
}

// Y los clicks tienen que haber contado en LAS DOS peleas, no solo en una.
// Cada pelea se reconoce por quiénes aparecen en su `qte_update`.
const porPareja = new Map();
for (const m of p[0].recibido.filter(m => m.type === 'qte_update')) {
    const nombres = Object.keys(m.clicks || {}).sort().join('+');
    const total = Object.values(m.clicks || {}).reduce((a, b) => a + b, 0);
    porPareja.set(nombres, Math.max(porPareja.get(nombres) || 0, total));
}
for (const [pareja, total] of porPareja) {
    console.log(`  ${pareja}: ${total} clicks contados`);
}
if (porPareja.size < 2) {
    fallo(`solo se vieron clicks de ${porPareja.size} pelea(s): la otra no contaba ninguno`);
}
const muertas = [...porPareja].filter(([, n]) => n === 0).map(([k]) => k);
if (muertas.length) fallo(`en ${muertas.join(' y ')} no contó ni un click`);

console.log('OK: las dos peleas se resolvieron y los clicks contaron en ambas.');
for (const c of p) c.ws.close();
process.exit(0);
