// Mensajes del protocolo que ya no usa nadie, por los dos lados.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(AQUI, '..', 'server', 'src') + path.sep;
const msgs = fs.readFileSync(path.join(R, 'game', 'messages.rs'), 'utf8');
const server = ['websocket.rs', 'bot.rs', 'game/lobby.rs', 'game/models.rs', 'game/deck.rs']
    .map(f => { try { return fs.readFileSync(path.join(R, f), 'utf8'); } catch { return ''; } }).join('\n');
const client = fs.readFileSync(path.join(AQUI, '..', 'client', 'lobby.html'), 'utf8');

// snake_case, que es como viajan por el cable.
const snake = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

function variantes(nombreEnum) {
    const i = msgs.indexOf(`enum ${nombreEnum}`);
    if (i === -1) return [];
    let d = 0, j = msgs.indexOf('{', i), fin = j;
    for (let k = j; k < msgs.length; k++) {
        if (msgs[k] === '{') d++;
        else if (msgs[k] === '}') { d--; if (d === 0) { fin = k; break; } }
    }
    const cuerpo = msgs.slice(j, fin);
    return [...cuerpo.matchAll(/^\s{4}([A-Z][A-Za-z0-9]*)\s*[{,(]/gm)].map(m => m[1]);
}

for (const [nombre, quienManda, quienRecibe] of [
    ['ClientMessage', client, server],
    ['ServerMessage', server, client],
]) {
    console.log(`=== ${nombre} ===`);
    for (const v of variantes(nombre)) {
        const w = snake(v);
        const mandado = quienManda.includes(w) || quienManda.includes(v);
        const recibido = quienRecibe.includes(v) || quienRecibe.includes(w);
        if (!mandado && !recibido) console.log(`  ${v}: no lo manda ni lo recibe nadie`);
        else if (!mandado) console.log(`  ${v}: nadie lo manda`);
        else if (!recibido) console.log(`  ${v}: nadie lo recibe`);
    }
}
