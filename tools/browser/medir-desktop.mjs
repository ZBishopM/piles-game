// Mide, sin servidor, cuánto desborda el centro en escritorio.
//
//   node browser/medir-desktop.mjs
//
// Carga lobby.html con las peticiones interceptadas (nada de red) e inyecta un
// `game_start` con 4–8 cartas en el centro. Es la medición que enseñó, el
// 2026-09-30, que `scrollHeight − clientHeight` da 18 px aunque el
// `overflow-y` es `visible`: las cartas giradas desbordan el contenedor. Por eso
// "desborda" no significa "puede desplazarse" (ver `bindTap`).
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client');
const browser = await chromium.launch();
for (const vp of [{ width: 1920, height: 1080 }, { width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  const page = await (await browser.newContext({ viewport: vp })).newPage();
  await page.route('http://localhost:9/**', route => {
    const u = new URL(route.request().url());
    const f = path.join(raiz, u.pathname === '/' ? 'lobby.html' : decodeURIComponent(u.pathname));
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return route.fulfill({ path: f });
    return route.abort();
  });
  await page.goto('http://localhost:9/lobby.html', { waitUntil: 'load' });
  const res = await page.evaluate(() => {
    const carta = (id, t) => ({ id, clothing_type: t, name: 'x' + t });
    const sets = Array.from({ length: 6 }, (_, s) => Array.from({ length: 4 }, (_, i) => carta(s * 4 + i, 2 + s)));
    currentNickname = 'Ana';
    const salida = [];
    for (const n of [4, 6, 8]) {
      let peor = -99, ejemplo = '';
      for (let intento = 0; intento < 40; intento++) {
        const centro = Array.from({ length: n }, (_, i) => carta(100 + intento * 17 + i * 5 + i * i, 20 + i));
        handleMsg({ type: 'game_start', your_sets: sets, center_cards: centro, current_set: 0, players: ['Ana', 'Beto'] });
        const c = document.getElementById('centerCards');
        const d = c.scrollHeight - c.clientHeight;
        if (d > peor) { peor = d; ejemplo = `overflow-y=${getComputedStyle(c).overflowY}`; }
      }
      salida.push(`   ${n} cartas: scrollHeight − clientHeight = ${peor} px (${ejemplo})`);
    }
    return salida.join('\n');
  });
  console.log(`── ${vp.width}×${vp.height}\n${res}`);
}
await browser.close();
