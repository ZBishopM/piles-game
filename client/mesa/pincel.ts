// El pincel de la escena del menú: las llamadas de Canvas2D que usa escena.ts, pintadas con
// Canvas2D (respaldo) o con PixiJS sobre WebGL.
//
// Por qué: Firefox pinta este lienzo 2D por software en parte (la estela con
// destination-out, los degradados, el modo lighter…) y el menú iba a 23–31 FPS frente a
// 139 en Chrome. Con WebGL lo pinta la GPU igual en todos los navegadores.
//
// La escena sigue llamando a g.fillStyle, g.beginPath, g.fill… como siempre. PincelPixi
// las traduce: los caminos a Graphics (en lotes), drawImage a Sprite, fillText a Text, los
// modos de mezcla a blendMode y la estela a un búfer que no se borra entre cuadros.
import {
    autoDetectRenderer, BlurFilter, Color, Container, Graphics, Matrix, Rectangle, RenderTexture, Sprite, Text, Texture,
    type BLEND_MODES, type Renderer,
} from 'pixi.js';

/** Lo que la escena usa del contexto 2D. CanvasRenderingContext2D ya lo cumple. */
export interface Lienzo {
    fillStyle: string | CanvasGradient | CanvasPattern;
    strokeStyle: string | CanvasGradient | CanvasPattern;
    lineWidth: number; globalAlpha: number; globalCompositeOperation: GlobalCompositeOperation;
    lineCap: CanvasLineCap; shadowBlur: number; shadowColor: string; font: string; textAlign: CanvasTextAlign;
    save(): void; restore(): void; translate(x: number, y: number): void; rotate(a: number): void;
    scale(x: number, y: number): void; transform(a: number, b: number, c: number, d: number, e: number, f: number): void;
    beginPath(): void; moveTo(x: number, y: number): void; lineTo(x: number, y: number): void; closePath(): void;
    arc(x: number, y: number, r: number, a0: number, a1: number): void;
    ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number): void;
    fill(): void; stroke(): void; clip(): void;
    fillRect(x: number, y: number, w: number, h: number): void; strokeRect(x: number, y: number, w: number, h: number): void;
    fillText(t: string, x: number, y: number): void;
    drawImage(img: CanvasImageSource, ...n: number[]): void;
    createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradient;
}
/** El pincel: el lienzo más el principio y el final de cada cuadro y el tamaño. */
export type Pincel = Lienzo & {
    nombre: '2d' | 'pixi';
    canvas: HTMLCanvasElement;
    empezar(): void; terminar(): void; tam(w: number, h: number): void;
    /** Pintar encima de la escena, sin estela (diales, viñeta). En Canvas2D no hay capas: no hace nada. */
    encima(si: boolean): void;
};

/** Canvas2D tal cual (el respaldo, y lo que había). */
export function pincel2d(canvas: HTMLCanvasElement): Pincel {
    const ctx = canvas.getContext('2d')!;
    const p = ctx as unknown as Pincel;
    Object.assign(p, { nombre: '2d', empezar() { /* */ }, terminar() { /* */ }, tam() { /* el lienzo ya lo dice */ }, encima() { /* */ } });
    return p;
}

// ── PixiJS ─────────────────────────────────────────────────────────────────────────
type M = [number, number, number, number, number, number];   // a b c d e f, como el de canvas
const mul = (m: M, a: number, b: number, c: number, d: number, e: number, f: number): M =>
    [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]];
type Forma = { tipo: 'poli'; pts: number[]; cerrado: boolean } | { tipo: 'elipse'; x: number; y: number; rx: number; ry: number };
type Estado = {
    m: M; alfa: number; modo: GlobalCompositeOperation; relleno: string | CanvasGradient | CanvasPattern;
    trazo: string | CanvasGradient | CanvasPattern; ancho: number; cap: CanvasLineCap; sombra: number; colorSombra: string;
    fuente: string; alinear: CanvasTextAlign; capa: Container | null;
};
const MEZCLA: Partial<Record<GlobalCompositeOperation, BLEND_MODES>> = { 'source-over': 'normal', lighter: 'add', screen: 'screen', 'destination-out': 'erase' };

/** Degradado radial concéntrico (los de la escena lo son): una textura por paradas, cacheada. */
class Degradado implements CanvasGradient {
    paradas: [number, string][] = [];
    constructor(public x: number, public y: number, public r: number) {}
    addColorStop(o: number, c: string) { this.paradas.push([o, c]); }
}
const TAM_DEG = 256;
const texDeg = new Map<string, Texture>();
function texturaDeg(d: Degradado) {
    const k = JSON.stringify(d.paradas);
    let t = texDeg.get(k);
    if (!t) {
        const c = document.createElement('canvas'); c.width = c.height = TAM_DEG;
        const x = c.getContext('2d')!, gr = x.createRadialGradient(TAM_DEG / 2, TAM_DEG / 2, 0, TAM_DEG / 2, TAM_DEG / 2, TAM_DEG / 2);
        for (const [o, col] of d.paradas) gr.addColorStop(o, col);
        x.fillStyle = d.paradas.at(-1)?.[1] ?? 'transparent'; x.fillRect(0, 0, TAM_DEG, TAM_DEG);   // fuera del radio, la última
        x.fillStyle = gr; x.fillRect(0, 0, TAM_DEG, TAM_DEG);
        t = Texture.from(c);
        texDeg.set(k, t);
    }
    return t;
}

const colores = new Map<string, { color: number; alpha: number }>();
function color(s: string) {
    let c = colores.get(s);
    if (!c) { const k = new Color(s); c = { color: k.toNumber(), alpha: k.alpha }; colores.set(s, c); }
    return c;
}

/** «800 30px Geist, sans-serif» → estilo de Text. */
function estiloFuente(f: string) {
    const m = /^(?:(\d{3}|bold|normal)\s+)?(\d+(?:\.\d+)?)px\s+(.+)$/.exec(f.trim());
    return m ? { fontWeight: (m[1] ?? 'normal') as '800', fontSize: Number(m[2]), fontFamily: m[3] } : { fontSize: 10, fontFamily: 'sans-serif' };
}

export async function pincelPixi(canvas: HTMLCanvasElement, w: number, h: number, alPerder: () => void): Promise<Pincel> {
    const renderer: Renderer = await autoDetectRenderer({
        preference: 'webgl', canvas, width: w, height: h, backgroundAlpha: 0, antialias: true,
        resolution: 1, autoDensity: false,
    });
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); alPerder(); }, { once: true });

    // Dos capas: la escena se pinta en una textura que no se borra entre cuadros (la estela: lo
    // pintado se queda y destination-out lo va apagando); encima, sin estela, lo que no debe
    // dejar rastro (los diales, la viñeta). En pantalla, las dos juntas.
    const nuevaRT = (w2: number, h2: number) => RenderTexture.create({ width: w2, height: h2, antialias: true });
    let rt = nuevaRT(w, h);
    const escenario = new Container(), arriba = new Container(), fondo = new Sprite(rt), pantalla = new Container();
    pantalla.addChild(fondo, arriba);
    let enArriba = false;
    const gs: Graphics[] = [], sombras: Graphics[] = [], sprites: Sprite[] = [], capas: Container[] = [], mascaras: Graphics[] = [];
    let iG = 0, iS = 0, iSp = 0, iC = 0, iM = 0;
    const textos = new Map<string, Text[]>(), usoTexto = new Map<string, number>();
    const texImg = new Map<CanvasImageSource, Texture>(), texCelda = new Map<string, Texture>();
    let idImg = 0; const ids = new WeakMap<object, number>();

    let est: Estado = {
        m: [1, 0, 0, 1, 0, 0], alfa: 1, modo: 'source-over', relleno: '#000', trazo: '#000', ancho: 1, cap: 'butt',
        sombra: 0, colorSombra: 'transparent', fuente: '10px sans-serif', alinear: 'start', capa: null,
    };
    const pila: Estado[] = [];
    let camino: Forma[] = [], actual: Forma & { tipo: 'poli' } | null = null;
    let lote: { g: Graphics; clave: string } | null = null;

    const padre = () => est.capa ?? (enArriba ? arriba : escenario);
    const nuevo = <T>(pool: T[], i: number, crear: () => T) => (pool[i] ??= crear());
    /** El Graphics donde van las formas: el mismo mientras no cambie la mezcla ni el recorte. */
    function grafico() {
        const clave = `${est.modo}|${pila.length && est.capa ? (est.capa as Container & { uid: number }).uid : 0}`;
        if (lote && lote.clave === clave && lote.g.parent === padre() && padre().children.at(-1) === lote.g) return lote.g;
        const g = nuevo(gs, iG++, () => new Graphics());
        g.clear(); g.blendMode = MEZCLA[est.modo] ?? 'normal';
        padre().addChild(g);
        lote = { g, clave };
        return g;
    }
    function sombraDe(): Graphics {
        const g = nuevo(sombras, iS++, () => { const s = new Graphics(); s.filters = [new BlurFilter({ strength: 8, quality: 3 })]; return s; });
        g.clear(); (g.filters as BlurFilter[])[0].strength = est.sombra * 0.5;
        padre().addChild(g); lote = null;
        return g;
    }
    function trazar(g: Graphics) {
        g.setTransform(...est.m); g.beginPath();
        for (const f of camino) {
            if (f.tipo === 'elipse') g.ellipse(f.x, f.y, f.rx, f.ry);
            else if (f.pts.length >= 4) g.poly(f.pts, f.cerrado);
        }
    }
    function estilo(s: string | CanvasGradient | CanvasPattern, extra: Record<string, unknown> = {}) {
        if (s instanceof Degradado) {
            const k = 2 * s.r / TAM_DEG;
            return { texture: texturaDeg(s), matrix: new Matrix(k, 0, 0, k, s.x - s.r, s.y - s.r), textureSpace: 'global' as const, alpha: est.alfa, ...extra };
        }
        const c = color(typeof s === 'string' ? s : '#000');
        return { color: c.color, alpha: c.alpha * est.alfa, ...extra };
    }
    const conSombra = (pinta: (g: Graphics, col?: string) => void) => {
        if (est.sombra > 0 && color(est.colorSombra).alpha > 0) pinta(sombraDe(), est.colorSombra);
        pinta(grafico());
    };
    function texturaDe(img: CanvasImageSource, sx?: number, sy?: number, sw?: number, sh?: number) {
        let base = texImg.get(img);
        if (!base) { base = Texture.from(img as HTMLImageElement); texImg.set(img, base); }
        if (sx === undefined) return base;
        let id = ids.get(img); if (id === undefined) { id = idImg++; ids.set(img, id); }
        const k = `${id}|${sx}|${sy}|${sw}|${sh}`;
        let t = texCelda.get(k);
        if (!t) { t = new Texture({ source: base.source, frame: new Rectangle(sx, sy!, sw!, sh!) }); texCelda.set(k, t); }
        return t;
    }

    const p: Pincel = {
        nombre: 'pixi', canvas,
        get fillStyle() { return est.relleno; }, set fillStyle(v) { est.relleno = v; },
        get strokeStyle() { return est.trazo; }, set strokeStyle(v) { est.trazo = v; },
        get lineWidth() { return est.ancho; }, set lineWidth(v) { est.ancho = v; },
        get globalAlpha() { return est.alfa; }, set globalAlpha(v) { est.alfa = v; },
        get globalCompositeOperation() { return est.modo; }, set globalCompositeOperation(v) { est.modo = v; },
        get lineCap() { return est.cap; }, set lineCap(v) { est.cap = v; },
        get shadowBlur() { return est.sombra; }, set shadowBlur(v) { est.sombra = v; },
        get shadowColor() { return est.colorSombra; }, set shadowColor(v) { est.colorSombra = v; },
        get font() { return est.fuente; }, set font(v) { est.fuente = v; },
        get textAlign() { return est.alinear; }, set textAlign(v) { est.alinear = v; },
        save() { pila.push({ ...est, m: [...est.m] as M }); },
        restore() { const e = pila.pop(); if (e) { if (e.capa !== est.capa) lote = null; est = e; } },
        translate(x, y) { est.m = mul(est.m, 1, 0, 0, 1, x, y); },
        rotate(a) { const c = Math.cos(a), s = Math.sin(a); est.m = mul(est.m, c, s, -s, c, 0, 0); },
        scale(x, y) { est.m = mul(est.m, x, 0, 0, y, 0, 0); },
        transform(a, b, c, d, e, f) { est.m = mul(est.m, a, b, c, d, e, f); },
        beginPath() { camino = []; actual = null; },
        moveTo(x, y) { actual = { tipo: 'poli', pts: [x, y], cerrado: false }; camino.push(actual); },
        lineTo(x, y) { if (!actual) p.moveTo(x, y); else actual.pts.push(x, y); },
        closePath() { if (actual) { actual.cerrado = true; actual = null; } },
        arc(x, y, r, a0, a1) {
            if (Math.abs(a1 - a0) >= Math.PI * 2 - 1e-3) { camino.push({ tipo: 'elipse', x, y, rx: r, ry: r }); actual = null; return; }
            const n = Math.max(8, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 32)));
            for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; p.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
        },
        ellipse(x, y, rx, ry) { camino.push({ tipo: 'elipse', x, y, rx, ry }); actual = null; },
        fill() {
            conSombra((g, col) => { trazar(g); g.fill(estilo(col ?? est.relleno)); });
        },
        stroke() {
            conSombra((g, col) => { trazar(g); g.stroke({ ...estilo(col ?? est.trazo), width: est.ancho, cap: est.cap, join: 'miter' }); });
        },
        clip() {
            const c = nuevo(capas, iC++, () => new Container()), m = nuevo(mascaras, iM++, () => new Graphics());
            c.removeChildren(); m.clear();
            trazar(m); m.fill(0xffffff);
            c.addChild(m); c.mask = m;
            padre().addChild(c); est.capa = c; lote = null;
        },
        fillRect(x, y, w, h) {
            const g = grafico(); g.setTransform(...est.m); g.beginPath(); g.rect(x, y, w, h); g.fill(estilo(est.relleno));
        },
        strokeRect(x, y, w, h) {
            const g = grafico(); g.setTransform(...est.m); g.beginPath(); g.rect(x, y, w, h);
            g.stroke({ ...estilo(est.trazo), width: est.ancho, join: 'miter' });
        },
        drawImage(img, ...n) {
            if (img instanceof HTMLImageElement && !img.complete) return;
            if (img instanceof HTMLVideoElement && img.readyState < 2) return;
            const [sx, sy, sw, sh, dx, dy, dw, dh] = n.length >= 8 ? n : [undefined, undefined, undefined, undefined, n[0], n[1], n[2], n[3]];
            const t = texturaDe(img, sx, sy, sw, sh);
            if (img instanceof HTMLVideoElement) t.source.update();
            const s = nuevo(sprites, iSp++, () => new Sprite());
            s.texture = t; s.alpha = est.alfa; s.blendMode = MEZCLA[est.modo] ?? 'normal';
            const fw = t.frame.width, fh = t.frame.height;
            const m = mul(est.m, (dw ?? fw) / fw, 0, 0, (dh ?? fh) / fh, dx ?? 0, dy ?? 0);
            s.setFromMatrix(new Matrix(...m));
            padre().addChild(s); lote = null;
        },
        fillText(txt, x, y) {
            const k = `${est.fuente}|${typeof est.relleno === 'string' ? est.relleno : ''}|${txt}`;
            const i = usoTexto.get(k) ?? 0; usoTexto.set(k, i + 1);
            const lista = textos.get(k) ?? []; textos.set(k, lista);
            const c = color(typeof est.relleno === 'string' ? est.relleno : '#fff');
            const t = lista[i] ??= new Text({ text: txt, style: { ...estiloFuente(est.fuente), fill: c.color }, resolution: 1 });
            t.anchor.set(est.alinear === 'center' ? 0.5 : est.alinear === 'right' || est.alinear === 'end' ? 1 : 0, 0.8);   // 0,8: la línea base
            t.alpha = c.alpha * est.alfa;
            t.setFromMatrix(new Matrix(...mul(est.m, 1, 0, 0, 1, x, y)));
            padre().addChild(t); lote = null;
        },
        createRadialGradient(_x0, _y0, _r0, x1, y1, r1) { return new Degradado(x1, y1, r1); },
        empezar() {
            escenario.removeChildren(); arriba.removeChildren(); iG = iS = iSp = iC = iM = 0; usoTexto.clear(); lote = null;
            pila.length = 0; est.capa = null; enArriba = false;
        },
        terminar() {
            renderer.render({ container: escenario, target: rt, clear: false });
            renderer.render({ container: pantalla });
        },
        tam(w2, h2) {
            renderer.resize(w2, h2);
            const vieja = rt; rt = nuevaRT(w2, h2); fondo.texture = rt; vieja.destroy(true);
        },
        encima(si) { if (si !== enArriba) { enArriba = si; lote = null; } },
    };
    return p;
}
