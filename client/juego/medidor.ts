// Medidor secreto: FPS y latencia de quien juega, para comparar el móvil con el PC.
//
//   PC: la tecla a la izquierda del 1 (º en teclado español, ` en inglés).
//   Móvil: tocar la pantalla con tres dedos a la vez.
//
// Se recuerda en esta pestaña (localStorage). Solo mide mientras se ve: con él oculto no
// hay bucle de requestAnimationFrame de más.
import { est } from './estado.js';

const CLAVE = 'piles.medidor';
let caja: HTMLDivElement | null = null;
let rafId = 0;
const tiempos: number[] = [];   // duración de los últimos cuadros (ms)
let anterior = 0, ultimoPintado = 0;

/** Lo último medido: FPS (por segundo), p95 y peor cuadro (ms) y cuadros de más de 20 ms. */
export const medida = { fps: 0, p95: 0, peor: 0, lentos: 0, ping: null as number | null };

function cuadro(ahora: number) {
    if (anterior) {
        tiempos.push(ahora - anterior);
        if (tiempos.length > 120) tiempos.shift();
    }
    anterior = ahora;
    if (ahora - ultimoPintado > 500 && tiempos.length > 10) {
        ultimoPintado = ahora;
        const orden = [...tiempos].sort((a, b) => a - b), media = tiempos.reduce((s, t) => s + t, 0) / tiempos.length;
        medida.fps = Math.round(1000 / media);
        medida.p95 = orden[Math.floor(orden.length * 0.95)];
        medida.peor = orden[orden.length - 1];
        medida.lentos = tiempos.filter(t => t > 20).length;
        medida.ping = est.lastRtt ?? null;
        if (caja) caja.textContent = `${medida.fps} FPS · p95 ${medida.p95.toFixed(1)} ms · peor ${Math.round(medida.peor)} ms · lentos ${medida.lentos}/${tiempos.length}\n`
            + `ping ${medida.ping ?? '—'} ms · ${innerWidth}×${innerHeight} @${devicePixelRatio}x`;
    }
    rafId = requestAnimationFrame(cuadro);
}

export function mostrarMedidor(si: boolean) {
    try { localStorage.setItem(CLAVE, si ? '1' : ''); } catch { /* */ }
    if (!si) {
        cancelAnimationFrame(rafId); rafId = 0;
        caja?.remove(); caja = null;
        return;
    }
    if (caja) return;
    caja = document.createElement('div');
    caja.id = 'medidor';
    Object.assign(caja.style, {
        position: 'fixed', top: 'max(4px, env(safe-area-inset-top))', left: '50%', translate: '-50% 0', zIndex: '1000',
        pointerEvents: 'none', whiteSpace: 'pre', font: '700 11px/1.3 ui-monospace, monospace', color: '#e9e4d2',
        background: 'rgb(6 6 6 / 82%)', padding: '3px 7px', textAlign: 'center',
    });
    caja.textContent = 'midiendo…';
    document.body.append(caja);
    tiempos.length = 0; anterior = 0;
    rafId = requestAnimationFrame(cuadro);
}
const cambiar = () => mostrarMedidor(!caja);

addEventListener('keydown', e => {
    if (e.code !== 'Backquote' || e.repeat) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    cambiar();
});
addEventListener('touchstart', e => { if (e.touches.length === 3) cambiar(); }, { passive: true });
try { if (localStorage.getItem(CLAVE)) mostrarMedidor(true); } catch { /* */ }
