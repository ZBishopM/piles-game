// El código del juego tal cual lo carga lobby.html: para las pruebas que leen la fuente.
//   html: lobby.html · css: lobby.css · js: client/juego/*.js en el orden de sus <script>
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const CLIENTE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'client');
const leer = f => fs.readFileSync(path.join(CLIENTE, f), 'utf8');

export const html = leer('lobby.html');
export const css = leer('lobby.css');
export const js = [...html.matchAll(/<script src="\/(juego\/[\w-]+\.js)"><\/script>/g)]
    .map(m => leer(m[1])).join('\n');
/** Todo junto, como era lobby.html antes de partirlo. */
export const todo = [html, css, js].join('\n');
