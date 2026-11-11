// El mismo dibujo con los dos pinceles (Canvas2D y PixiJS), lado a lado: transformaciones,
// recortes, degradados, imágenes, texto y modos de mezcla.
//   node browser/pincel-prueba.mjs <salida.png> [--base=local|beta]
import { chromium } from '@playwright/test';
import { base, wait } from '../repro/comun.mjs';
const OUT = process.argv.slice(2).find(a => !a.startsWith('--')) ?? 'pincel.png';
const b = await chromium.launch({ headless: false });
const p = await (await b.newContext({ viewport: { width: 900, height: 480 } })).newPage();
await p.goto(base + '/', { waitUntil: 'networkidle' });
await p.evaluate(async () => {
  document.body.innerHTML = '<div style="display:flex;gap:20px;background:#556;padding:10px"><canvas id="a" width="420" height="420"></canvas><canvas id="b" width="420" height="420"></canvas></div>';
  const { pincel2d, pincelPixi } = window.__pinceles;
  const img = document.createElement('canvas'); img.width = img.height = 64;
  const ix = img.getContext('2d'); ix.fillStyle = '#f80'; ix.fillRect(0, 0, 64, 64); ix.fillStyle = '#08f'; ix.fillRect(0, 0, 32, 32); ix.fillStyle = '#fff'; ix.fillRect(32, 32, 32, 32);
  const dibujo = g => {
    g.empezar();
    g.fillStyle = '#222'; g.fillRect(0, 0, 420, 420);
    // 1 transformaciones encadenadas + polígono
    g.save(); g.translate(80, 80); g.rotate(0.4); g.scale(1.5, 1);
    g.beginPath(); g.moveTo(-20, -20); g.lineTo(20, -20); g.lineTo(20, 20); g.lineTo(-20, 20); g.closePath();
    g.fillStyle = 'rgba(255,0,0,0.8)'; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke(); g.restore();
    // 2 imagen con recorte
    g.save(); g.translate(220, 40);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(80, 0); g.lineTo(80, 50); g.lineTo(0, 50); g.closePath(); g.clip();
    g.drawImage(img, 0, 0, 64, 64, -20, -20, 128, 128);
    g.restore();
    // 3 degradado radial y lighter
    g.save(); g.globalCompositeOperation = 'lighter';
    const gr = g.createRadialGradient(100, 250, 0, 100, 250, 60); gr.addColorStop(0, 'rgba(255,255,200,0.9)'); gr.addColorStop(1, 'rgba(255,255,200,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(100, 250, 60, 0, 7); g.fill(); g.restore();
    // 4 texto
    g.fillStyle = '#e8402a'; g.font = '800 24px sans-serif'; g.textAlign = 'center'; g.fillText('HOLA 123', 300, 250);
    // 5 imagen transformada (rotada, escalada, espejo)
    g.save(); g.translate(300, 340); g.rotate(-0.5); g.scale(-1, 0.7); g.drawImage(img, 0, 0, 64, 64, -32, -32, 64, 64); g.restore();
    // 6 elipse y alfa
    g.globalAlpha = 0.5; g.fillStyle = '#0f0'; g.beginPath(); g.ellipse(100, 370, 50, 25, 0, 0, 7); g.fill(); g.globalAlpha = 1;
    g.terminar();
  };
  dibujo(pincel2d(document.getElementById('a')));
  const px = await pincelPixi(document.getElementById('b'), 420, 420, () => {});
  dibujo(px);
});
await wait(500);
await p.screenshot({ path: OUT });
await b.close();
