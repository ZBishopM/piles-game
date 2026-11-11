// La URL del juego es la raíz (/). Los enlaces y QR viejos (/lobby.html?join=CÓDIGO) llevan a /?join=CÓDIGO
// y el juego recoge el código igual que antes.
//   node browser/url-limpia.mjs [--base=...]
import { lanzar, pagina, base, ok, wait, fin } from './comun.mjs';

const nav = await lanzar();
const A = await pagina(await nav.newContext());
ok(new URL(A.url()).pathname === '/' && await A.evaluate(() => typeof juego === 'object'), 'el juego carga en /');
const enlace = await A.evaluate(() => juego.joinLinkFor('ABC123'));
ok(enlace === `${new URL(base).origin}/?join=ABC123`, `enlace de invitación sin lobby.html: ${enlace}`);

// Un enlace viejo: redirige a / y el juego recoge el ?join (luego lo quita de la barra, como siempre)
const ctxB = await nav.newContext();
// Lo que ve cada documento al cargar, antes de que el juego limpie la barra
await ctxB.addInitScript(() => { if (location.pathname === '/') sessionStorage.setItem('llegada', location.pathname + location.search); });
const B = await ctxB.newPage();
B.errores = [];
B.on('pageerror', e => B.errores.push(e.message));
await B.goto(`${base}/lobby.html?join=ABC123`);
await B.waitForFunction(() => typeof juego === 'object' && !!juego.est, null, { timeout: 10000 });
await wait(500);
const llegada = await B.evaluate(() => sessionStorage.getItem('llegada'));
ok(llegada === '/?join=ABC123', `/lobby.html?join=ABC123 → ${llegada}`);
ok(A.errores.length + B.errores.length === 0, `sin errores de página ${[...A.errores, ...B.errores].join(' | ')}`);
await nav.close();
fin();
