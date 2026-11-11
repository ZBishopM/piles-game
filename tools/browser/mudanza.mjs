// La mudanza de dominio, sin servidor ni red: el dominio viejo redirige al nuevo y
// le pasa las claves piles* de localStorage (nombre, Elo vinculado, ajustes) la
// primera vez; las siguientes solo redirige, sin pisar lo que cambió en el nuevo.
//
//   node browser/mudanza.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client');
const VIEJO = 'https://piles.danassistantassistant.website', NUEVO = 'https://piles.agapornis.app';
let fallos = 0;
const ok = (c, m) => { console.log(c ? '✓' : '✗', m); if (!c) fallos++; };

const browser = await chromium.launch();
const ctx = await browser.newContext();
// Los dos dominios sirven client/ del disco; /semilla es una página vacía para escribir localStorage.
// Lo demás (WebSocket, Session Manager…) se corta.
await ctx.route('**/*', route => {
    const u = new URL(route.request().url());
    if (![new URL(VIEJO).host, new URL(NUEVO).host].includes(u.host)) return route.abort();
    if (u.pathname === '/semilla') return route.fulfill({ contentType: 'text/html', body: '<!doctype html>' });
    const f = path.join(raiz, u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname));
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return route.fulfill({ path: f });
    return route.abort();
});
const p = await ctx.newPage();
const errores = [];
p.on('pageerror', e => errores.push(e.message));
const leer = () => p.evaluate(() => ({ nick: localStorage.getItem('piles_nickname'), key: localStorage.getItem('piles_rating_key'), otra: localStorage.getItem('otra') }));

await p.goto(`${VIEJO}/semilla`);
await p.evaluate(() => { localStorage.setItem('piles_nickname', 'Ana'); localStorage.setItem('piles_rating_key', 'sm:abc'); localStorage.setItem('otra', 'x'); });

await p.goto(`${VIEJO}/?join=ABC123`);
await p.waitForURL(`${NUEVO}/**`);
await p.waitForLoadState('load');
ok(new URL(p.url()).host === new URL(NUEVO).host, `el viejo redirige al nuevo: ${p.url()}`);
ok(p.url() === `${NUEVO}/?join=ABC123`, `conserva ?join y limpia el #: ${p.url()}`);
const r = await leer();
ok(r.nick === 'Ana' && r.key === 'sm:abc', `trae nombre y Elo: ${JSON.stringify(r)}`);
ok(r.otra === null, 'solo claves piles*');

// En el nuevo cambia el nombre; volver por el viejo no lo pisa
await p.evaluate(() => localStorage.setItem('piles_nickname', 'Bea'));
await p.goto(`${VIEJO}/`);
await p.waitForURL(`${NUEVO}/**`);
await p.waitForLoadState('load');
ok((await leer()).nick === 'Bea', 'la segunda visita al viejo no pisa el nuevo');

// El nuevo, entrado directo, no hace nada raro
await p.goto(`${NUEVO}/`);
ok(p.url() === `${NUEVO}/`, 'en el nuevo no redirige');
ok(errores.length === 0, `sin errores de página ${errores.join(' | ')}`);
await browser.close();
console.log(fallos ? `\n${fallos} fallos` : '\ntodo bien');
process.exit(fallos ? 1 : 0);
