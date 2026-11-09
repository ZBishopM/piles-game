// Los diales de Elo de la mesa, dibujados dentro de la escena (en vez de HTML encima).
//
// Por qué: en Firefox, cuatro diales HTML moviéndose sobre un lienzo que cambia en cada
// cuadro hundían el menú (de ~160 a ~50 FPS): el JS los recolocaba en cada cuadro y sus
// brillos, halos y mezclas se recomponían una y otra vez.
//
// Cómo: el dial lo sigue construyendo agapornis-ui (agDial) en HTML. Cuando se asienta se
// fotografía una vez (html-to-image) sin sus capas animadas, y la escena pinta esa foto donde
// iba el dial. Lo que se anima siempre (el barrido de brillo, el haz que gira, el halo que
// respira y las partículas de glory) se pinta aquí, con los colores y tiempos del rango.
import { toCanvas } from 'html-to-image';
import type { Lienzo } from './pincel.js';

/** Margen alrededor del dial en la foto: para que quepan sus sombras y su halo. */
const MARGEN = 40;
/** Margen del lienzo de partículas alrededor del marco (el de rank-fx.js). */
const M = 18;

export type Efectos = {
    barrido: { a: number; dur: number } | null;          // --rk-sheen-*: brillo que barre el marco
    haz: { b1: string; b2: string; dur: number } | null; // --rk-beam-*: haz cónico que gira (glory alto)
    halo: { color: string; r: number; dur: number } | null; // --rk-glow-*: halo que respira
    particulas: Ambiente | null;                         // rank-fx.js: ambiente de glory
};
/** Una pieza fotografiada (la etiqueta o el marco): su imagen, con MARGEN alrededor, y su sitio en el dial. */
type Pieza = { img: HTMLCanvasElement; x: number; y: number; w: number; h: number };
export type Foto = {
    clave: string; piezas: Pieza[]; w: number; h: number;   // el dial (px CSS)
    marco: { x: number; y: number; w: number; h: number; radio: number };   // el marco dentro del dial
    efectos: Efectos; texBarrido: HTMLCanvasElement | null; texHaz: HTMLCanvasElement | null; texHalo: HTMLCanvasElement | null;
    parts: Particula[]; t0: number;
};

// ── Partículas: las de agapornis-ui/rank-fx.js, mismo ambiente por rango ──────────────
type Ambiente = { n: number; orbit?: number; kind: string; colors: string[]; size: [number, number] };
const AMBIENT: Ambiente[] = [
    { n: 3, kind: 'flake', colors: ['#9a4a1e', '#7a3a16', '#b8601f'], size: [2, 4.5] },
    { n: 6, kind: 'ember', colors: ['#ffb066', '#e0823a', '#ffd9a8'], size: [1.2, 2.6] },
    { n: 10, kind: 'glint', colors: ['#ffffff', '#dfe8f5', '#b9c6d8'], size: [2, 5] },
    { n: 14, kind: 'glint', colors: ['#fff2b0', '#ffd76a', '#ffffff'], size: [2, 6] },
    { n: 18, kind: 'glint', colors: ['#e8f7ff', '#9fd8ff', '#ffffff'], size: [2, 6] },
    { n: 24, kind: 'prism', colors: ['#7fd0ff', '#ffffff', '#9aa8ff', '#7fffe0'], size: [2, 7] },
    { n: 30, kind: 'glint', colors: ['#fff6c0', '#ffe066', '#ffffff', '#ffc928'], size: [2.5, 7] },
    { n: 36, kind: 'glint', colors: ['#ffe39a', '#ff9ec7', '#ffffff', '#ffc2d9'], size: [2.5, 7.5] },
    { n: 44, orbit: 8, kind: 'glint', colors: ['#ffe066', '#ff7ac0', '#6dffa8', '#ffffff'], size: [2.5, 8] },
];
type Particula = { kind: string; color: string; color2: string; size: number; age: number; life: number; x: number; y: number;
    vx: number; vy: number; rot: number; vr: number; ph: number; amb?: boolean; orbit?: boolean; t?: number; sp?: number };
const rnd = (a: number, b: number) => a + Math.random() * (b - a), pick = <T>(l: T[]) => l[(Math.random() * l.length) | 0];
const TAU = Math.PI * 2, SHARD = [[0, 1], [2.1, 0.7], [3.6, 1.1], [5.0, 0.6]];

function ambiente(cfg: Ambiente, mw: number, mh: number, viejo: boolean): Particula {
    const p: Particula = { kind: cfg.kind, amb: true, color: pick(cfg.colors), color2: pick(cfg.colors), size: rnd(...cfg.size), age: 0,
        life: 1, x: 0, y: 0, vx: 0, vy: 0, rot: rnd(0, TAU), vr: rnd(-1.5, 1.5), ph: rnd(0, TAU) };
    if (cfg.kind === 'flake') { p.x = M + rnd(0.05, 0.95) * mw; p.y = M + rnd(0.05, 0.55) * mh; p.vx = rnd(-5, 5); p.vy = rnd(10, 22); p.life = rnd(2.6, 4.2); }
    else if (cfg.kind === 'ember') { p.x = M + rnd(0.05, 0.95) * mw; p.y = M + rnd(0.55, 1.0) * mh; p.vy = -rnd(14, 30); p.life = rnd(1.6, 2.8); }
    else { p.x = M + rnd(-0.03, 1.03) * mw; p.y = M + rnd(-0.12, 1.12) * mh; p.vx = rnd(-4, 4); p.vy = rnd(-4, 4); p.life = rnd(0.9, 2.0); }
    if (viejo) p.age = rnd(0, p.life);
    return p;
}
function estrella(g: Lienzo, x: number, y: number, s: number) {
    const k = s * 0.18;
    g.beginPath();
    g.moveTo(x, y - s); g.lineTo(x + k, y - k); g.lineTo(x + s, y); g.lineTo(x + k, y + k);
    g.lineTo(x, y + s); g.lineTo(x - k, y + k); g.lineTo(x - s, y); g.lineTo(x - k, y - k);
    g.closePath(); g.fill();
}
// El original las suma (lighter) en su propio lienzo, que luego se compone normal sobre el dial:
// sumarlas aquí directamente sobre el marco claro las quemaba a blanco. Van en modo normal.
function particula(g: Lienzo, p: Particula, a: number) {
    g.globalAlpha = Math.max(0, Math.min(1, a)) * alfaBase;
    g.fillStyle = p.color;
    g.globalCompositeOperation = 'source-over';
    if (p.kind === 'flake') {
        g.beginPath();
        SHARD.forEach(([an, r], i) => { const x = p.x + Math.cos(p.rot + an) * p.size * r, y = p.y + Math.sin(p.rot + an) * p.size * r; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
        g.closePath(); g.fill();
    } else if (p.kind === 'ember') {
        g.beginPath(); g.arc(p.x, p.y, p.size * 2.2, 0, TAU); g.globalAlpha *= 0.35; g.fill();   // su resplandor, sin shadowBlur
        g.globalAlpha /= 0.35; g.beginPath(); g.arc(p.x, p.y, p.size, 0, TAU); g.fill();
    } else {
        const s = p.size * (0.55 + 0.45 * a);
        estrella(g, p.x, p.y, s);
        g.globalAlpha *= 0.55;
        g.beginPath(); g.arc(p.x, p.y, s * 0.42, 0, TAU); g.fill();
        if (p.kind === 'prism' && a > 0.6) {
            g.fillStyle = p.color2;
            g.save(); g.translate(p.x, p.y); g.rotate(Math.PI / 4); estrella(g, 0, 0, s * 0.7); g.restore();
        }
    }
}
let alfaBase = 1;

// ── La foto ──────────────────────────────────────────────────────────────────────────
const seg = (anim: string) => { const m = /([\d.]+)s/.exec(anim); return m ? Number(m[1]) * 1000 : 0; };
function efectosDe(el: HTMLElement, rangoIdx: number | null, glory: boolean): Efectos {
    const cs = getComputedStyle(el), v = (k: string) => cs.getPropertyValue(k).trim();
    const barrido = v('--rk-sheen-anim'), haz = v('--rk-beam-anim'), halo = v('--rk-glow-anim');
    return {
        barrido: barrido && barrido !== 'none' ? { a: Number(v('--rk-sheen-a') || 0.3), dur: seg(barrido) || 4000 } : null,
        haz: haz && haz !== 'none' ? { b1: v('--rk-b1') || 'transparent', b2: v('--rk-b2') || 'transparent', dur: seg(haz) || 5000 } : null,
        halo: halo && halo !== 'none' ? { color: v('--rk-glow') || 'transparent', r: parseFloat(v('--rk-glow-hi-r')) || 30, dur: seg(halo) || 2200 } : null,
        particulas: glory && rangoIdx !== null ? AMBIENT[rangoIdx] ?? null : null,
    };
}
/** Las @font-face de la página, con las fuentes incrustadas (data:), una vez. html-to-image las
 *  buscaría solo, pero resuelve los @import de agapornis.css contra la página y da 404. */
let fuentes: Promise<string> | null = null;
function cssFuentes() {
    return fuentes ??= (async () => {
        const reglas: { css: string; base: string }[] = [];
        const recorrer = (hoja: CSSStyleSheet) => {
            let lista: CSSRuleList; try { lista = hoja.cssRules; } catch { return; }
            for (const r of lista) {
                if (r instanceof CSSImportRule && r.styleSheet) recorrer(r.styleSheet);
                else if (r instanceof CSSFontFaceRule) reglas.push({ css: r.cssText, base: hoja.href ?? location.href });
            }
        };
        for (const h of document.styleSheets) recorrer(h);
        const aData = async (url: string) => {
            const b = await (await fetch(url)).blob();
            return await new Promise<string>(ok => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.readAsDataURL(b); });
        };
        const hechas = await Promise.all(reglas.map(async ({ css, base }) => {
            let out = css;
            for (const m of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
                if (m[1].startsWith('data:')) continue;
                try { out = out.replace(m[0], `url(${await aData(new URL(m[1], base).href)})`); } catch { /* sin esa fuente */ }
            }
            return out;
        }));
        return hechas.join('\n');
    })();
}
const lienzoDe = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };

/** Fotografía el dial `el` (ya asentado) sin sus capas animadas. Escala: píxeles por px CSS. */
export async function fotografiar(el: HTMLElement, clave: string, rangoIdx: number | null, escala: number): Promise<Foto> {
    el.classList.add('ag-foto');
    const tuyo = el.classList.contains('tuyo'); el.classList.remove('tuyo');
    const transformAntes = el.style.transform; el.style.transform = 'none';
    try {
        const w = el.offsetWidth, h = el.offsetHeight;
        const fr = el.querySelector<HTMLElement>('.ag-dial-frame')!, a = el.getBoundingClientRect(), b = fr.getBoundingClientRect();
        const marco = { x: b.left - a.left, y: b.top - a.top, w: b.width, h: b.height, radio: parseFloat(getComputedStyle(fr).borderTopLeftRadius) || 0 };
        const glory = el.querySelector('.ag-dial')?.getAttribute('data-skin') === 'glory' || el.dataset.skin === 'glory';
        const efectos = efectosDe(el.querySelector<HTMLElement>('.ag-dial') ?? el, rangoIdx, glory);
        // El dial entero, con su display de siempre (inline-flex en columna, centrado: forzar block
        // descolocaba el marco) y un margen para que quepan sombras y halo.
        const img = await toCanvas(el, {
            pixelRatio: escala, width: w + 2 * MARGEN, height: h + 2 * MARGEN, skipAutoScale: true, fontEmbedCSS: await cssFuentes(),
            // (en horizontal ya lo centra html-to-image en el ancho dado: un margen a los lados contaba doble)
            style: { margin: `${MARGEN}px 0`, transform: 'none', opacity: '1', transition: 'none' },
            filter: c => !(c instanceof HTMLCanvasElement) && !(c instanceof Element && c.classList.contains('ag-dial-glow')),
        });
        const piezas: Pieza[] = [{ img, x: 0, y: 0, w, h }];
        const f: Foto = { clave, piezas, w, h, marco, efectos, texBarrido: null, texHaz: null, texHalo: null, parts: [], t0: performance.now() };
        prepararTexturas(f);
        if (efectos.particulas) {
            const cfg = efectos.particulas, n = cfg.n - (cfg.orbit ?? 0);
            for (let i = 0; i < n; i++) f.parts.push(ambiente(cfg, marco.w, marco.h, true));
            for (let i = 0; i < (cfg.orbit ?? 0); i++) f.parts.push({ ...ambiente(cfg, marco.w, marco.h, false), kind: 'glint', amb: false, orbit: true, t: i / cfg.orbit!, sp: rnd(0.1, 0.17), life: 1 });
        }
        return f;
    } finally {
        el.style.transform = transformAntes;
        if (tuyo) el.classList.add('tuyo');
        el.classList.remove('ag-foto');
    }
}

/** Las texturas de los efectos, una vez por foto (a 2× para que no se pixelen al acercarse). */
function prepararTexturas(f: Foto) {
    const { w: mw, h: mh } = f.marco, E = f.efectos, K = 2;
    if (E.barrido) {   // linear-gradient(105deg, transparent 46%, blanco a 50%, transparent 54%) en una caja de 4 marcos
        const c = lienzoDe(4 * mw * K, mh * K), x = c.getContext('2d')!, W = c.width, H = c.height, an = 105 * Math.PI / 180;
        const dx = Math.sin(an), dy = -Math.cos(an), L = Math.abs(W * dx) + Math.abs(H * dy);
        const gr = x.createLinearGradient(W / 2 - dx * L / 2, H / 2 - dy * L / 2, W / 2 + dx * L / 2, H / 2 + dy * L / 2);
        gr.addColorStop(0.46, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${E.barrido.a})`); gr.addColorStop(0.54, 'rgba(255,255,255,0)');
        x.fillStyle = gr; x.fillRect(0, 0, W, H);
        f.texBarrido = c;
    }
    if (E.haz) {   // conic-gradient(transparent 0 66%, b1 80%, b2 92%, transparent 100%), en un cuadrado que cubre el marco al girar
        const D = Math.hypot(mw, mh) * K, c = lienzoDe(D, D), x = c.getContext('2d')!;
        const gr = x.createConicGradient(-Math.PI / 2, D / 2, D / 2);   // conic-gradient empieza arriba
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.66, 'rgba(0,0,0,0)'); gr.addColorStop(0.8, E.haz.b1);
        gr.addColorStop(0.92, E.haz.b2); gr.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = gr; x.fillRect(0, 0, D, D);
        f.texHaz = c;
    }
    if (E.halo) {   // box-shadow: 0 0 R 3px color, alrededor del marco
        const R = E.halo.r, P = R * 2 + 6, c = lienzoDe((mw + 2 * P) * K, (mh + 2 * P) * K), x = c.getContext('2d')!;
        x.scale(K, K);
        x.shadowColor = E.halo.color; x.shadowBlur = R; x.shadowOffsetX = 10000;
        x.fillStyle = '#000'; x.beginPath(); x.roundRect(P - 3 - 10000, P - 3, mw + 6, mh + 6, f.marco.radio + 3); x.fill();
        f.texHalo = c;
    }
}

/** Pinta el dial: muñeca en (x, y) px del lienzo (abajo al centro), a escala s (px del lienzo por px CSS). */
export function pintarDial(g: Lienzo, f: Foto, x: number, y: number, s: number, alfa: number, tuyo: boolean, ahora: number, dt: number) {
    if (alfa <= 0.01) return;
    const t = ahora - f.t0, { x: mx, y: my, w: mw, h: mh } = f.marco, E = f.efectos;
    g.save();
    g.translate(x, y); g.scale(s, s); g.translate(-f.w / 2, -f.h);
    g.globalAlpha = alfa; alfaBase = alfa;
    // Halo que respira (ag-breathe: opacidad 0 → 1, ida y vuelta, ease-in-out), detrás del dial
    if (f.texHalo && E.halo) {
        const u = (t / E.halo.dur) % 2, k = u < 1 ? u : 2 - u, e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        const P = E.halo.r * 2 + 6;
        g.globalAlpha = alfa * e;
        g.drawImage(f.texHalo, 0, 0, f.texHalo.width, f.texHalo.height, mx - P, my - P, mw + 2 * P, mh + 2 * P);
        g.globalAlpha = alfa;
    }
    for (const q of f.piezas) g.drawImage(q.img, 0, 0, q.img.width, q.img.height, q.x - MARGEN, q.y - MARGEN, q.w + 2 * MARGEN, q.h + 2 * MARGEN);
    // Barrido y haz: dentro del marco, sumando luz (la mezcla screen del original)
    if (f.texBarrido || f.texHaz) {
        g.save();
        g.beginPath(); g.moveTo(mx, my); g.lineTo(mx + mw, my); g.lineTo(mx + mw, my + mh); g.lineTo(mx, my + mh); g.closePath(); g.clip();
        g.globalCompositeOperation = 'screen';   // el mix-blend-mode del original
        if (f.texBarrido && E.barrido) {   // background-position de 100 % a 0 %: la banda cruza de izquierda a derecha
            const p = 1 - (t % E.barrido.dur) / E.barrido.dur;
            g.drawImage(f.texBarrido, 0, 0, f.texBarrido.width, f.texBarrido.height, mx - 3 * mw * p, my, 4 * mw, mh);
        }
        if (f.texHaz && E.haz) {
            const D = Math.hypot(mw, mh);
            g.save(); g.translate(mx + mw / 2, my + mh / 2); g.rotate((t / E.haz.dur) * TAU);
            g.drawImage(f.texHaz, 0, 0, f.texHaz.width, f.texHaz.height, -D / 2, -D / 2, D, D);
            g.restore();
        }
        g.restore();
    }
    // Partículas (rank-fx.js): en el sistema del marco, con su margen M
    if (f.parts.length && E.particulas) {
        g.save(); g.translate(mx - M, my - M);
        const cfg = E.particulas, per = 2 * (mw + mh);
        const enPerimetro = (u: number): [number, number] => {
            let d = (((u % 1) + 1) % 1) * per;
            if (d < mw) return [M + d, M]; d -= mw; if (d < mh) return [M + mw, M + d]; d -= mh; if (d < mw) return [M + mw - d, M + mh]; d -= mw; return [M, M + mh - d];
        };
        let vivas = 0;
        for (let i = f.parts.length - 1; i >= 0; i--) {
            const p = f.parts[i];
            p.age += dt;
            if (!p.orbit && p.age >= p.life) { f.parts[i] = f.parts[f.parts.length - 1]; f.parts.pop(); continue; }
            if (p.amb) vivas++;
            let a: number;
            if (p.orbit) {
                p.t! += p.sp! * dt;
                for (let k = 3; k >= 1; k--) { const [tx, ty] = enPerimetro(p.t! - k * 0.006); particula(g, { ...p, x: tx, y: ty, size: p.size * (1 - k * 0.2) }, 0.5 - k * 0.1); }
                [p.x, p.y] = enPerimetro(p.t!); a = 0.9;
            } else {
                if (p.kind === 'ember') p.vx = Math.sin(p.age * 3 + p.ph) * 8;
                p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
                const u = p.age / p.life;
                a = p.kind === 'flake' ? 0.85 * (1 - u) ** 0.7 : Math.sin(Math.PI * u) ** 1.4;
            }
            particula(g, p, a);
        }
        for (let i = vivas; i < cfg.n - (cfg.orbit ?? 0); i++) f.parts.push(ambiente(cfg, mw, mh, false));
        g.restore();
    }
    g.globalCompositeOperation = 'source-over';
    // Tu dial: la punta bermellón debajo, apuntando a tu figura (.dialMesa.tuyo::after)
    if (tuyo) {
        g.globalAlpha = alfa;
        g.fillStyle = '#000'; g.beginPath(); g.moveTo(f.w / 2 - 7 + 2, f.h + 3 + 2); g.lineTo(f.w / 2 + 7 + 2, f.h + 3 + 2); g.lineTo(f.w / 2 + 2, f.h + 12 + 2); g.closePath(); g.fill();
        g.fillStyle = '#e8402a'; g.beginPath(); g.moveTo(f.w / 2 - 7, f.h + 3); g.lineTo(f.w / 2 + 7, f.h + 3); g.lineTo(f.w / 2, f.h + 12); g.closePath(); g.fill();
    }
    g.restore();
}
