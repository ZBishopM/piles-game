// Los diccionarios de client/i18n.js: sin navegador ni servidor.
//
//   node i18n-test.mjs
//
// Falla (código 1) si:
//  - a una clave le falta un idioma, o un valor está vacío;
//  - un idioma usa otras variables {x} que el español (cada una de las tres lenguas
//    tiene que poder rellenar lo mismo);
//  - un plural { one, other } no tiene `other`;
//  - el código usa (t('…'), data-i18n…) una clave que no existe;
//  - falta la traducción de algo que se compone por id: los códigos de error del
//    servidor (`Fail::new("x"`, `ServerMessage::error("x"`, `swap_failed("x"`,
//    `code: Some("x"`), las burlas de taunts.rs, los rangos de rank.js y las
//    prendas de models.rs;
//  - una llamada t('clave', { a }) no da todas las variables que pide el texto.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = f => fs.readFileSync(path.join(raiz, f), 'utf8');

// Carga i18n.js tal cual, con un "navegador" de mentira.
const ctx = { console, navigator: { language: 'es' }, localStorage: { getItem: () => null, setItem() {} } };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(leer('client/i18n.js'), ctx);
const { LANGS, dict } = ctx.PilesI18n;
const D = dict();

let fallos = 0;
const mal = (m) => { fallos++; console.log('✗', m); };

const formas = v => (v && typeof v === 'object') ? Object.values(v) : [v];
const vars = v => new Set(formas(v).flatMap(s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1])));
const igual = (a, b) => a.size === b.size && [...a].every(x => b.has(x));

// 1-3. Claves, idiomas, variables, plurales
for (const [k, e] of Object.entries(D)) {
  for (const l of LANGS) {
    if (e[l] === undefined || formas(e[l]).some(s => s === '' || s === undefined || s === null)) mal(`${k}: falta «${l}»`);
    if (e[l] && typeof e[l] === 'object' && e[l].other === undefined) mal(`${k}.${l}: el plural no tiene "other"`);
  }
  for (const l of Object.keys(e)) if (!LANGS.includes(l)) mal(`${k}: idioma desconocido «${l}»`);
  const base = vars(e.es);
  for (const l of LANGS) if (e[l] !== undefined && !igual(base, vars(e[l]))) {
    mal(`${k}: variables distintas en «${l}» ({${[...vars(e[l])]}}) y en «es» ({${[...base]}})`);
  }
}

// 4. Claves que usa el código y existen. Se miran lobby.html, replay.html y el propio i18n.js.
const fuentes = ['client/lobby.html', 'client/replay.html'].map(f => [f, leer(f)]);
const usadas = new Map();   // clave → [{ f, vars|null }]
const anota = (k, f, v) => { if (!usadas.has(k)) usadas.set(k, []); usadas.get(k).push({ f, vars: v }); };
for (const [f, s] of fuentes) {
  for (const m of s.matchAll(/\bt\(\s*'([\w.-]+)'\s*(?:,\s*\{([^{}]*)\}\s*)?\)/g)) {
    const v = m[2] === undefined ? new Set() : new Set(m[2].split(',').map(x => x.trim().split(/[:\s]/)[0]).filter(Boolean));
    anota(m[1], f, v);
  }
  for (const m of s.matchAll(/data-i18n(?:-html)?="([\w.-]+)"/g)) anota(m[1], f, null);
  for (const m of s.matchAll(/data-i18n-attr="([^"]+)"/g)) {
    for (const par of m[1].split(';')) anota(par.split(':')[1]?.trim(), f, null);
  }
}
anota('lang.label', 'client/i18n.js', null);
for (const [k, usos] of usadas) {
  if (!k) continue;
  if (!D[k]) { mal(`${k}: se usa en ${usos[0].f} y no está en el diccionario`); continue; }
  const pide = vars(D[k].es);
  for (const u of usos) if (u.vars && [...pide].some(x => !u.vars.has(x))) {
    mal(`${k}: ${u.f} no da {${[...pide].filter(x => !u.vars.has(x))}} (da {${[...u.vars]}})`);
  }
}
const todo = fuentes.map(([, s]) => s).join('\n');
const sinUso = Object.keys(D).filter(k => !usadas.has(k) && !todo.includes(`'${k}'`) && !/^(err|swapfail|cancel|cloth|rank|taunt)\./.test(k));
if (sinUso.length) console.log('· claves que ningún t() menciona (¿sobran?):', sinUso.join(', '));

// 5. Lo que se compone por id
const falta = (ns, ids, origen) => ids.filter(id => !D[`${ns}.${id}`]).forEach(id => mal(`${ns}.${id}: ${origen} y no hay traducción`));

const ws = leer('server/src/websocket.rs'), lobby = leer('server/src/game/lobby.rs'), msgs = leer('server/src/game/messages.rs');
const codigos = (re, s) => [...s.matchAll(re)].map(m => m[1]);
falta('err', [...new Set([
  ...codigos(/Fail::new\(\s*"(\w+)"/g, lobby + ws + msgs),
  ...codigos(/ServerMessage::error\(\s*"(\w+)"/g, ws),
])], 'el servidor manda ese error');
falta('swapfail', [...new Set([
  ...codigos(/swap_failed\(\s*"(\w+)"/g, ws),
  ...codigos(/Err\(\(\s*"(\w+)",/g, ws),
  ...codigos(/gone_msg\([^)]*?,\s*"(\w+)",\s*"/g, ws),
])], 'el servidor manda ese swap_failed');
falta('cancel', codigos(/code: Some\("(\w+)"\.to_string\(\)\),\s*args: Some/g, ws), 'el servidor cancela con ese motivo');

const taunts = leer('server/src/taunts.rs');
falta('taunt', [...new Set(codigos(/"(\w+)"/g, (taunts.match(/IDS: \[&str; \d+\] = \[([\s\S]*?)\];/) || [, ''])[1]))], 'taunts.rs lo lista');

const rank = leer('client/agapornis-ui/rank.js');
falta('rank', codigos(/\['([\w-]+)',\s*'[^']+'\]/g, rank), 'rank.js lo lista');

const nPrendas = (leer('server/src/game/models.rs').match(/CLOTHING_NAMES: &\[&str\] = &\[([\s\S]*?)\];/)[1].match(/"[^"]+"/g) || []).length;
falta('cloth', Array.from({ length: nPrendas }, (_, i) => String(i)), 'models.rs lo lista');

const n = Object.keys(D).length;
console.log(fallos ? `\n${fallos} fallos (${n} claves, ${LANGS.join('/')})` : `todo bien: ${n} claves en ${LANGS.join(', ')}; mismas claves y variables; ${usadas.size} claves usadas existen`);
process.exit(fallos ? 1 : 0);
