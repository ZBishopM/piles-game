// El botón de silencio de la partida: un toque basta (data-toque), también con los gestos activos.
// Antes era un «botón de icono» de gestos.ts y había que mantenerlo pulsado 0,6 s: en el móvil parecía roto.
//   node browser/silencio.mjs [--base=...]
import { lanzar, pagina, aPartida, ok, wait, fin } from './comun.mjs';

const nav = await lanzar();
const ctx = await nav.newContext({ viewport: { width: 390, height: 700 } });
const p = await pagina(ctx);
await aPartida(p, 'Silencio');
await p.evaluate(() => localStorage.setItem('piles.gestos', '1'));    // los gestos, también bajo Playwright
const b = await p.locator('#muteBtn').boundingBox();
const toca = async () => { await p.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await wait(300); };
const mudo = () => p.evaluate(() => juego.est.sfxMuted);
const icono = () => p.locator('#muteBtn').innerHTML();

const antes = await mudo(), ico0 = await icono();
await toca();
ok(await mudo() === !antes && await icono() !== ico0, `un toque cambia el silencio y el icono (${antes} → ${await mudo()})`);
await toca();
ok(await mudo() === antes && await icono() === ico0, 'otro toque lo devuelve');
ok(p.errores.length === 0, `sin errores de página ${p.errores.join(' | ')}`);
await nav.close();
fin();
