// Una pestaña abierta desde antes de un despliegue se recarga sola.
//
//   node browser/version.mjs [--base=local|beta] [--ver]
//
// El servidor manda `hello { version }` nada más conectar. La primera versión que
// ve la página es la suya; si en una reconexión llega otra, el servidor se
// desplegó con la pestaña abierta y la página se recarga (una vez cada 30 s).
//
// No se despliega nada: los `hello` se inyectan en la página como los mandaría el
// servidor. Los de versión «dev» (el servidor local) se ignoran.
import { lanzar, pagina, ok, info, fin, wait } from './comun.mjs';

const browser = await lanzar();
const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
const p = await pagina(ctx);

let recargas = 0;
p.on('framenavigated', f => { if (f === p.mainFrame()) recargas++; });
const hola = v => p.evaluate(v => handleMsg({ type: 'hello', version: v }), v);
const marca = () => p.evaluate(() => window.__marca ?? null);

await p.evaluate(() => { window.__marca = 'antes'; sessionStorage.removeItem('piles_reloaded_at'); });

// Con el servidor local, la versión es «dev» y no se mira. Contra beta o
// producción el primer `hello` real ya fijó la versión de la página.
const real = await p.evaluate(() => versionDelServidor);
let aaa = 'aaa1111';
if (real === null) {
  await hola('dev'); await hola('dev');
  await wait(1800);
  ok(recargas === 0 && (await marca()) === 'antes', 'versión «dev»: nunca se recarga (en local no hay despliegues)');
  // La primera versión real es la de esta página: no recarga.
  await hola(aaa);
  await wait(1800);
  ok(recargas === 0 && (await marca()) === 'antes', 'la primera versión que ve la página es la suya: no recarga');
} else {
  aaa = real;
  info(`el servidor dice ${real}: esa es la versión de esta página`);
  await wait(1500);
  ok(recargas === 0 && (await marca()) === 'antes', 'la versión real del servidor es la de la página: no recarga');
}
await hola(aaa);
await wait(1500);
ok(recargas === 0, 'y la misma otra vez, tampoco');

// Se despliega otra: la pestaña se actualiza.
await hola('bbb2222');
const aviso = p.locator('.ag-toast', { hasText: 'Versión nueva' });
await aviso.first().waitFor({ timeout: 2000 }).catch(() => {});
info(`aviso visible: ${await aviso.count() > 0}`);
await p.waitForEvent('framenavigated', { timeout: 5000 }).catch(() => {});
await p.waitForLoadState('networkidle');
ok(recargas === 1 && (await marca()) === null, `la versión cambia (${aaa} → bbb2222): la página se recarga sola, una vez (${recargas})`);
ok(await p.evaluate(() => Number(sessionStorage.getItem('piles_reloaded_at')) > 0), 'y recuerda cuándo, para no repetirlo');

// Tras recargar, otra versión inmediatamente: solo avisa, no entra en bucle.
await p.evaluate(() => { window.__marca = 'despues'; });
await hola('ccc3333');
await hola('ddd4444');
await wait(2200);
ok(recargas === 1 && (await marca()) === 'despues', 'otro cambio de versión dentro de los 30 s: NO vuelve a recargar');
const manual = await p.locator('.ag-toast', { hasText: 'Hay una versión nueva' }).count();
ok(manual >= 1, 'solo avisa de que hay que recargar a mano (Ctrl+F5)');

// Pasados los 30 s sí.
await p.evaluate(() => sessionStorage.setItem('piles_reloaded_at', String(Date.now() - 31000)));
await hola('eee5555');
await p.waitForEvent('framenavigated', { timeout: 5000 }).catch(() => {});
await p.waitForLoadState('networkidle');
ok(recargas === 2, `pasado el margen vuelve a recargar (${recargas})`);

ok(p.errores.length === 0, `sin errores de JavaScript${p.errores.length ? ': ' + p.errores.join(' | ') : ''}`);
await browser.close();
fin();
