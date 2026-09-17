// Busca cosas enchufadas a nada en el cliente: botones que no hacen nada,
// funciones que no llama nadie, ids y clases que ya no existen.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const P = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'client', 'lobby.html');
const s = fs.readFileSync(P, 'utf8');
const js = s.slice(s.indexOf('<script>') + 8, s.lastIndexOf('</script>'));
const html = s.slice(s.indexOf('<body>'), s.indexOf('<script>'));
const css = s.slice(s.indexOf('<style>'), s.indexOf('</style>'));

const linea = (i) => s.slice(0, i).split('\n').length;

console.log('=== funciones que no llama nadie ===');
// `async function` también cuenta: buscar solo `^function` daba por rotos dos
// botones que funcionan perfectamente.
const defs = [...js.matchAll(/^(?:async\s+)?function\s+([A-Za-zÀ-ÿ_$][\w$]*)/gm)];
for (const d of defs) {
    const n = d[1];
    const usos = (s.match(new RegExp(`\\b${n}\\b`, 'g')) || []).length;
    if (usos <= 1) console.log(`  ${n}  (definida y nunca usada)`);
}

console.log('=== onclick/on* que apuntan a funciones inexistentes ===');
const nombres = new Set(defs.map(d => d[1]));
for (const m of html.matchAll(/on\w+="([A-Za-zÀ-ÿ_$][\w$]*)\(/g)) {
    if (!nombres.has(m[1])) console.log(`  ${m[1]}()  no existe`);
}

console.log('=== getElementById de ids que no están en el HTML ===');
const idsHtml = new Set([...s.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
const vistos = new Set();
for (const m of js.matchAll(/getElementById\(['"`]([^'"`]+)['"`]\)/g)) {
    if (!idsHtml.has(m[1]) && !vistos.has(m[1])) { vistos.add(m[1]); console.log(`  #${m[1]}`); }
}

console.log('=== ids creados por JS (no son fallo, solo para descartar) ===');
for (const m of js.matchAll(/\.id\s*=\s*[`'"]([^`'"$]*)/g)) {
    if (m[1]) console.log(`  ${m[1]}…`);
}

console.log('=== selectores CSS de clases que nadie pone ===');
const clasesCss = new Set();
for (const m of css.matchAll(/\.([a-zA-Z][\w-]*)/g)) clasesCss.add(m[1]);
const fuera = s.slice(s.indexOf('</style>'));
for (const c of [...clasesCss].sort()) {
    const re = new RegExp(`(class="[^"]*\\b${c}\\b|classList\\.[a-z]+\\(\\s*['"\`]${c}|className\\s*=[^;]*\\b${c}\\b|['"\`]${c}['"\`])`);
    if (!re.test(fuera)) console.log(`  .${c}`);
}

console.log('=== ids del HTML que nadie consulta ni estiliza ===');
for (const id of idsHtml) {
    const enJs = new RegExp(`['"\`]${id}['"\`]`).test(js);
    const enCss = new RegExp(`#${id}\\b`).test(css);
    if (!enJs && !enCss) console.log(`  #${id}`);
}
