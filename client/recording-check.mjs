// ¿Sirve de algo lo que se ha grabado? Se comprueba lo que el visor necesita.
import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';
const dir = process.argv[2]
    ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'recordings');
const f = fs.readdirSync(dir).filter(x => x.endsWith('.jsonl'))[0];
const texto = fs.readFileSync(path.join(dir, f), 'utf8');

let lineas = [], rotas = 0;
for (const l of texto.split('\n')) {
    if (!l.trim()) continue;
    try { lineas.push(JSON.parse(l)); } catch { rotas++; }
}

const por = {};
for (const l of lineas) por[l.t] = (por[l.t] || 0) + 1;
console.log(`fichero: ${f}`);
console.log(`líneas: ${lineas.length}  ilegibles: ${rotas}`);
console.log('por tipo:', JSON.stringify(por));

const cab = lineas.find(l => l.t === 'header');
console.log(`cabecera: sala=${cab?.lobby} jugadores=${(cab?.players||[]).map(p=>p.nick).join(',')}`);
console.log(`mapa de cartas: ${Object.keys(cab?.cards || {}).length} ids`);

// Lo que de verdad importa: los mensajes privados, que ningún cliente ve.
const privados = lineas.filter(l => l.t === 'out' && l.to);
const tiposPriv = [...new Set(privados.map(l => l.m?.type))];
console.log(`mensajes privados: ${privados.length}  tipos: ${tiposPriv.join(', ')}`);

const entrantes = lineas.filter(l => l.t === 'in');
console.log(`mensajes entrantes: ${entrantes.length}  tipos: ${[...new Set(entrantes.map(l=>l.m?.type))].slice(0,8).join(', ')}`);

const peleas = lineas.filter(l => l.t === 'out' && l.m?.type === 'swap_conflict').length;
const resueltas = lineas.filter(l => l.t === 'out' && l.m?.type === 'qte_resolved').length;
console.log(`peleas grabadas: ${peleas}  resoluciones: ${resueltas}`);

const claves = lineas.filter(l => l.t === 'key');
console.log(`fotogramas: ${claves.length}`);
if (claves.length) {
    const k = claves[claves.length - 1];
    const nicks = Object.keys(k.players || {});
    console.log(`  último: ms=${k.ms} jugadores=${nicks.join(',')} centro=${(k.center||[]).length} cartas`);
    const a = k.players[nicks[0]];
    console.log(`  ${nicks[0]}: sets=${JSON.stringify(a.sets[0])} mult=${a.mult} flip=${JSON.stringify(a.flip)}`);
}

const fin = lineas.find(l => l.t === 'end');
console.log(`cierre: ${fin ? `sí (${fin.reason}, ms=${fin.ms})` : 'NO — el fichero quedó abierto'}`);

const conReloj = lineas.filter(l => l.w).length;
console.log(`líneas con hora de reloj: ${conReloj}/${lineas.length}`);

let fallos = [];
if (!cab) fallos.push('sin cabecera');
if (!Object.keys(cab?.cards || {}).length) fallos.push('sin mapa de cartas — no se puede dibujar');
if (!privados.length) fallos.push('sin mensajes privados — sería como grabar desde el navegador');
if (!claves.length) fallos.push('sin fotogramas');
if (!fin) fallos.push('sin línea de cierre');
if (!peleas) fallos.push('sin peleas grabadas');
console.log(fallos.length ? 'FALLOS: ' + fallos.join(' · ') : 'OK: la grabación tiene todo lo que el visor necesita');
process.exit(fallos.length ? 1 : 0);
