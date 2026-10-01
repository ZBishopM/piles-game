// Los toques con ratón cuentan siempre, y los repetidos no se acumulan.
//
//   node browser/toques.mjs [--base=local|beta] [--ver]
//
// Nació del caso del 2026-09-30 ("no me deja seleccionar una carta"): en
// escritorio `scrollHeight − clientHeight` daba 18 px aunque el overflow es
// `visible` (las cartas giradas lo desbordan), y entonces un clic solo contaba
// si no te movías más de 12 px, no tardabas más de 700 ms y el puntero no salía
// del contenedor. Si no, ni se enviaba ni se avisaba.
import { lanzar, pagina, aPartida, espiarEnvios, envios, cuenta, conRetraso, ok, info, fin, wait } from './comun.mjs';

const browser = await lanzar();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const p = await pagina(ctx);
await aPartida(p, 'Toques', 'Fácil');   // el bot fácil casi nunca se mete en peleas
await espiarEnvios(p);

const medida = await p.evaluate(() => {
  const c = document.getElementById('centerCards');
  return { diff: c.scrollHeight - c.clientHeight, overflowY: getComputedStyle(c).overflowY };
});
info(`centro: scrollHeight − clientHeight = ${medida.diff} px, overflow-y = ${medida.overflowY}`);

// Una carta del centro que se pueda tocar: no peleada y no escondida mientras
// vuela (la que acabas de soltar tarda ~280 ms en aterrizar y, hasta entonces,
// no recibe toques).
const centroDe = (cuantas = 1) => p.evaluate(n => [...document.querySelectorAll('#centerCards [data-tap]')]
  .filter(e => !e.classList.contains('qte-contested') && !e.classList.contains('qte-locked')
    && getComputedStyle(e).visibility !== 'hidden')
  .slice(0, n).map(el => {
    const r = el.getBoundingClientRect();
    return { id: Number(el.dataset.tap), x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }), cuantas).then(l => (cuantas === 1 ? l[0] : l));
const propiaDe = () => p.evaluate(() => {
  const el = document.querySelector('#yourCards [data-tap]');
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
async function soltar() {
  const { x, y } = await propiaDe();
  await p.mouse.click(x, y);
  await p.waitForFunction(() => owesCard(), null, { timeout: 4000 });
}
/** Suelta una carta, hace `gesto` sobre una del centro y mira si salió un take_card. */
async function prueba(nombre, gesto) {
  await espiarEnvios(p);
  await soltar();
  await wait(150);
  const { x, y } = await centroDe();
  await gesto(x, y);
  await wait(700);
  const enviado = await envios(p);
  const sale = (await cuenta(p, 'take_card')) === 1;
  if (!sale) info(`   (se envió: ${enviado.join(', ') || 'nada'}; deuda=${await p.evaluate(() => owesCard())}, qte=${await p.evaluate(() => qteActive)})`);
  // Deja la mano en orden para la siguiente: si no lo cogió, el plazo lo fuerza
  // (y si hubo pelea, se espera a que acabe).
  await p.waitForFunction(() => !owesCard() && !qteActive && !isStunned(), null, { timeout: 15000 });
  await wait(300);
  return ok(sale, nombre);
}

await prueba('un clic normal envía take_card', async (x, y) => { await p.mouse.click(x, y); });
await prueba('un clic en el que el ratón se mueve 40 px entre bajar y soltar, también', async (x, y) => {
  await p.mouse.move(x, y); await p.mouse.down();
  await p.mouse.move(x + 40, y + 30, { steps: 3 }); await p.mouse.up();
});
await prueba('un clic mantenido 1 s, también', async (x, y) => {
  await p.mouse.move(x, y); await p.mouse.down(); await wait(1000); await p.mouse.up();
});
await prueba('un clic en el que el puntero sale del centro antes de soltar, también', async (x, y) => {
  await p.mouse.move(x, y); await p.mouse.down();
  await p.mouse.move(x, y + 420, { steps: 4 }); await p.mouse.up();
});

// Con latencia (300 ms), los toques repetidos no se acumulan.
await conRetraso(p, 300);
{
  await espiarEnvios(p);
  const { x, y } = await propiaDe();
  for (let i = 0; i < 3; i++) { await p.mouse.click(x, y); await wait(40); }
  await wait(900);
  ok((await cuenta(p, 'drop_card')) === 1, `3 toques seguidos en una carta propia mandan UN drop_card (${await cuenta(p, 'drop_card')})`);
  await p.waitForFunction(() => owesCard(), null, { timeout: 3000 });

  await espiarEnvios(p);
  await wait(500);   // que la carta soltada haya aterrizado
  const dos = await centroDe(2);
  await p.mouse.click(dos[0].x, dos[0].y); await wait(60);
  await p.mouse.click(dos[1].x, dos[1].y);
  const pendiente = await p.evaluate(() => pendingTake?.card.id ?? null);
  await wait(900);
  ok((await cuenta(p, 'take_card')) === 1, `pedir otra carta con una cogida en vuelo no manda otra petición (${await cuenta(p, 'take_card')})`);
  ok(pendiente === dos[0].id, `y lo pendiente sigue siendo la primera carta (${pendiente} = ${dos[0].id})`);
}

ok(p.errores.length === 0, `sin errores de JavaScript${p.errores.length ? ': ' + p.errores.join(' | ') : ''}`);
await browser.close();
fin();
