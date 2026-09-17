// Ceder la carta mientras el rival machaca.
//
// El botón de la bandera blanca "no hacía nada". No era el cliente: el mensaje
// llegaba y el servidor escribía `conceded_by`, pero `qte_click` leía una copia
// entera de la sala y la volcaba de vuelta, así que el primer click del rival
// posterior a la rendición la borraba. Y durante una pelea el rival manda un
// click cada pocas decenas de milisegundos, así que la borraba casi siempre.
//
// Una pelea cedida se resuelve **ya**, sin esperar los 3 s del reloj.
//
// Uso: node tools/giveup-test.mjs [ws://127.0.0.1:3000/ws]
// Necesita el servidor levantado desde la raíz del repo.
const URL = process.argv[2] || 'ws://127.0.0.1:3000/ws';
const dormir = (ms) => new Promise(r => setTimeout(r, ms));
const fallo = (msg) => { console.log(`FALLO: ${msg}`); process.exit(1); };

// ── Lo que rompía el botón en el móvil, y que ningún test de sockets ve ──
//
// Mantener 700 ms falla en un teléfono si el navegador decide que ese dedo
// apoyado era el principio de un desplazamiento: se queda el gesto y manda
// `pointercancel`. Solo lo evita `touch-action: none`; `preventDefault()` en
// `pointerdown` no. Y sin capturar el puntero, el temblor del pulgar se sale
// del círculo de 52 px y `pointerleave` cortaba la cuenta.
//
// Es estático a propósito: un navegador automatizado no hace gestos de verdad,
// así que esto NO se puede comprobar mandando eventos. Por eso se coló.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
const html = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'client', 'lobby.html'), 'utf8');

const reglaBoton = html.match(/#qteGiveUpBtn\s*\{[^}]*\}/)?.[0] ?? '';
if (!/touch-action:\s*none/.test(reglaBoton)) {
    fallo('#qteGiveUpBtn no declara `touch-action: none`: en el móvil el navegador se queda el gesto y el mantener pulsado no llega a los 700 ms');
}
if (!/setPointerCapture/.test(html)) {
    fallo('el botón no captura el puntero: el dedo se sale del círculo de 52 px y se corta la cuenta');
}
const cancelaciones = html.match(/for \(const ev of \[([^\]]*)\]\)\s*\{\s*btn\.addEventListener/)?.[1] ?? '';
if (/pointerleave/.test(cancelaciones)) {
    fallo('`pointerleave` vuelve a cancelar el mantener pulsado: con el puntero capturado eso corta el gesto sin motivo');
}
console.log('OK  el mantener pulsado aguanta el gesto en táctil (touch-action + captura de puntero)');

function cliente(nombre) {
    const ws = new WebSocket(URL);
    const c = {
        nombre, ws, recibido: [], sets: null, centro: [],
        abierto: new Promise((r, rej) => {
            ws.addEventListener('open', r);
            ws.addEventListener('error', () => rej(new Error(`sin servidor en ${URL}`)));
        }),
        envia: (o) => ws.send(JSON.stringify(o)),
        espera: (tipo, ms = 5000) => new Promise(r => {
            const ya = c.recibido.find(m => m.type === tipo);
            if (ya) return r(ya);
            const t = setTimeout(() => r(null), ms);
            const h = (ev) => {
                const m = JSON.parse(ev.data);
                // Con su hora: sin ella, el `__t` del mensaje salía `undefined`
                // y la comprobación de "tardó demasiado" era `NaN > 2200`, o
                // sea, una comprobación que no podía fallar nunca.
                m.__t = Date.now();
                if (m.type === tipo) { clearTimeout(t); ws.removeEventListener('message', h); r(m); }
            };
            ws.addEventListener('message', h);
        }),
    };
    ws.addEventListener('message', (ev) => {
        const m = JSON.parse(ev.data);
        m.__t = Date.now();
        c.recibido.push(m);
        if (m.type === 'game_start') { c.sets = m.your_sets; c.centro = m.center_cards; }
        if (m.type === 'game_update' || m.type === 'swap_success') c.centro = m.center_cards;
    });
    return c;
}

const ana = cliente('Ana'), beto = cliente('Beto');
for (const c of [ana, beto]) await c.abierto;

ana.envia({ type: 'create_lobby', nickname: 'Ana', max_players: 4, is_public: false });
const creada = await ana.espera('lobby_created');
if (!creada) fallo('no se creó la sala');

beto.envia({ type: 'join_lobby', lobby_id: creada.lobby_id, nickname: 'Beto' });
if (!await beto.espera('lobby_update')) fallo('Beto no entró');
beto.envia({ type: 'set_ready', ready: true });
await dormir(200);
ana.envia({ type: 'set_ready', ready: true });
for (const c of [ana, beto]) if (!await c.espera('game_start')) fallo(`${c.nombre} no arrancó`);
await dormir(300);

// Los dos sueltan, para que los dos deban una carta y puedan coger.
for (const c of [ana, beto]) { c.envia({ type: 'drop_card', my_card_index: 0 }); await c.espera('swap_success'); }
await dormir(400);

// Los dos van a por la misma: pelea.
const carta = ana.centro[0].id;
ana.envia({ type: 'take_card', card_id: carta });
beto.envia({ type: 'take_card', card_id: carta });

const pelea = await ana.espera('swap_conflict');
if (!pelea) fallo('no empezó ninguna pelea');
const empezo = Date.now();

// Beto machaca, que es lo que borraba la rendición.
const machaque = setInterval(() => beto.envia({ type: 'qte_click' }), 60);

// Ana mantiene la bandera 700 ms y cede.
await dormir(700);
ana.envia({ type: 'give_up_card' });

const fin = await ana.espera('qte_resolved');
clearInterval(machaque);
if (!fin) fallo('la pelea no se resolvió: la rendición se perdió y siguió hasta el final');

const tardo = fin.__t - empezo;
if (!Number.isFinite(tardo)) fallo('no se pudo medir cuánto tardó; la comprobación de abajo no valdría nada');
console.log(`la pelea se resolvió en ${tardo} ms · ganó ${fin.winner}`);

// Los 3 s del reloj menos los 700 de mantener pulsado: si se acerca a 3000, la
// rendición no se aplicó y la pelea murió de vieja.
if (tardo > 2200) fallo(`tardó ${tardo} ms: eso es el reloj agotándose, no una rendición`);
if (fin.winner !== 'Beto') fallo(`ganó ${fin.winner}; quien cede pierde la carta`);
console.log('OK  ceder corta la pelea al momento aunque el rival esté machacando');

// Ceder no bloquea: el sentido de rendirse es volver a jugar YA.
await dormir(400);
if (ana.recibido.some(m => m.type === 'stunned')) fallo('a Ana la bloquearon por ceder');
console.log('OK  quien cede no se lleva bloqueo');

console.log('OK: el botón de ceder la carta funciona.');
for (const c of [ana, beto]) c.ws.close();
process.exit(0);
