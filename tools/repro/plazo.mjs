// Un toque a tiempo no pierde contra el reloj de 3 s de la deuda.
//
//   node repro/plazo.mjs [--base=local|beta]
//
// Coger espera 300 ms (por si otro va a por la misma carta). Un `take_card`
// mandado a los 2,85 s llega DENTRO del plazo y se ejecuta a los 3,15 s: el
// reloj (3,0 s) vencía en medio, forzaba una carta al azar y borraba el
// intento. Contra un servidor SIN el arreglo esto da "FALLA" (llega
// `debt_forced`); contra uno con él, la carta elegida.
import {
  wait, ok, info, fin, send, esperar, crear, unirse, empezar, pinguear,
} from './comun.mjs';

const a = await crear('Ana');
const b = await unirse('Beto', a.lobby);
await empezar(a, b);
const parar = [pinguear(a), pinguear(b)];

let forzadas = 0, bien = 0;
for (let intento = 1; intento <= 3; intento++) {
  const n0 = a.msgs.length;
  send(a, { type: 'drop_card', my_card_index: 0 });
  const dep = await esperar(a, m => a.msgs.indexOf(m) >= n0 && m.type === 'swap_success', 2000);
  if (!dep) { ok(false, `intento ${intento}: no llegó el swap_success del drop`); break; }
  const t0 = dep._t;
  const soltada = dep.your_new_set.findIndex(c => c === null);
  // Una carta del centro que no sea la que acabo de soltar.
  const centro = dep.center_cards.map(c => c.id);
  const mia = centro[centro.length - 1];
  const elegida = centro.find(id => id !== mia);

  await wait(Math.max(0, 2850 - (Date.now() - t0)));
  send(a, { type: 'take_card', card_id: elegida });
  await wait(1800);

  const nuevos = a.msgs.slice(n0);
  const fuerza = nuevos.find(m => m.type === 'debt_forced');
  const ultimoSwap = [...nuevos].reverse().find(m => m.type === 'swap_success');
  const cogio = ultimoSwap?.your_new_set?.some(c => c && c.id === elegida);
  if (fuerza) forzadas++;
  if (cogio && !fuerza) bien++;
  info(`intento ${intento}: tomada=${cogio ? 'la elegida (' + elegida + ')' : 'otra'}, debt_forced=${!!fuerza}`);
  await wait(300);
}
ok(forzadas === 0, `ningún toque a los 2,85 s perdió contra el reloj (forzadas: ${forzadas} de 3)`);
ok(bien === 3, `las 3 veces se quedó la carta que elegí (${bien} de 3)`);

parar.forEach(p => p());
a.ws.close(); b.ws.close();
fin();
