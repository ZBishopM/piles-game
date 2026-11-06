// El código del cliente, para las pruebas que leen la fuente.
//   html: lobby.html · css: lobby.css
//   js: los módulos que junta client/juego/index.js (juego/*.js, la mesa y la partida), en su orden
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const CLIENTE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'client');
const leer = f => fs.readFileSync(path.join(CLIENTE, f), 'utf8');

export const html = leer('lobby.html');
export const css = leer('lobby.css');
export const js = [...leer('juego/index.js').matchAll(/^import .*'(\.\.?\/[\w/.-]+\.js)';$/gm)]
    .map(m => leer(path.join('juego', m[1]))).join('\n');
/** Todo junto, como era lobby.html antes de partirlo. */
export const todo = [html, css, js].join('\n');
