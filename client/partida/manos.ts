// Manos de dibujo animado (guantes blancos, brazos de goma): el arrebato de una carta.
//
// El guante es un modelo 3D prerenderizado a sprites, como las figuras del menú
// (diseno/guantes/guantes.py → partida/guantes.webp): se cambia de dibujo por pose, como en
// la animación tradicional. El brazo es una manguera SVG que se dobla.
// Sin cara, la personalidad está en los gestos: el ladrón entra de puntillas sobre dos dedos
// (sigiloso, y no lo es), agarra con prisa, se sobresalta cuando aparece la tuya, que llega
// apuntándole con la «pistola».

const TINTA = '#0b0c09';

/** Columnas de la hoja (filas: 0 puño salvia = rival, 1 puño bermellón = tú). */
const POSES = ['abierta', 'tensa', 'agarra', 'puno', 'pistola', 'ok', 'puntilla1', 'puntilla2', 'like'] as const;
type NombrePose = typeof POSES[number];
const HOJA = '/partida/guantes.webp', CELDA = 256;
const MUNECA = [128, 203];          // píxel de la muñeca en cada celda (anclas.json ÷ 2)
/** El «like» se renderizó tumbado (puño de lado, pulgar arriba): su muñeca está a la izquierda
 *  y la imagen se gira −90° para que, como las demás, tenga los dedos «arriba» en el guante. */
const DE_LADO: Partial<Record<NombrePose, { muneca: [number, number]; giro: number }>> = { like: { muneca: [53, 128], giro: -90 } };
const MUNECA_PUNTA = 140;           // de la muñeca a la yema del medio, abierta (px de celda)
const BAJO_PUNO = 10;               // del centro de la muñeca al borde del puño, donde nace el brazo

const SVGNS = 'http://www.w3.org/2000/svg';
const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) => {
    const e = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    return e;
};

/** Un guante con su brazo. `set` lo coloca: muñeca (x, y), giro (0 = dedos arriba),
 *  escala (sx a lo ancho, sy a lo largo: aplastar y estirar), pose y de dónde sale el brazo.
 *  `tam` ≈ de la muñeca a la yema / 1,14 (la medida del guante dibujado de antes). */
function guante(capa: SVGElement, color: string, fila: 0 | 1, tam: number) {
    const brazo = el('g');
    const borde = el('path', { fill: 'none', stroke: color, 'stroke-width': tam * 0.3, 'stroke-linecap': 'round' });
    const tubo = el('path', { fill: 'none', stroke: TINTA, 'stroke-width': tam * 0.22, 'stroke-linecap': 'round' });
    brazo.append(borde, tubo);
    const mano = el('g');
    const ventana = el('svg', { width: CELDA, height: CELDA, viewBox: `0 0 ${CELDA} ${CELDA}`, x: -MUNECA[0], y: -MUNECA[1] });
    ventana.append(el('image', { href: HOJA, width: CELDA * POSES.length, height: CELDA * 2 }));
    const giro = el('g');
    giro.append(ventana);
    mano.append(giro);
    capa.append(brazo, mano);
    const k = tam * 1.14 / MUNECA_PUNTA;
    let actual = '';
    return {
        mano,
        /** Dolor: el guante entero se pone rojo (filtro `#guanteRojo` de la capa). */
        rojo(si: boolean) { if (si) mano.setAttribute('filter', 'url(#guanteRojo)'); else mano.removeAttribute('filter'); },
        set(x: number, y: number, rot: number, sx: number, sy: number, pose: NombrePose, ax: number, ay: number, onda: number) {
            mano.setAttribute('transform', `translate(${x} ${y}) rotate(${rot}) scale(${k * sx} ${k * sy})`);
            if (pose !== actual) {
                actual = pose;
                ventana.setAttribute('viewBox', `${POSES.indexOf(pose) * CELDA} ${fila * CELDA} ${CELDA} ${CELDA}`);
                const lado = DE_LADO[pose], m = lado?.muneca ?? MUNECA;
                ventana.setAttribute('x', String(-m[0])); ventana.setAttribute('y', String(-m[1]));
                giro.setAttribute('transform', lado ? `rotate(${lado.giro})` : '');
            }
            // El brazo: de su origen al borde del puño, con una curva que ondula.
            const rad = rot * Math.PI / 180, mx = x - Math.sin(rad) * BAJO_PUNO * k * sy, my = y + Math.cos(rad) * BAJO_PUNO * k * sy;
            const dx = mx - ax, dy = my - ay, n = Math.hypot(dx, dy) || 1, px = -dy / n, py = dx / n;
            const c1x = ax + dx * 0.33 + px * onda, c1y = ay + dy * 0.33 + py * onda;
            const c2x = ax + dx * 0.7 - px * onda * 0.8, c2y = ay + dy * 0.7 - py * onda * 0.8;
            const d = `M${ax} ${ay} C${c1x} ${c1y} ${c2x} ${c2y} ${mx} ${my}`;
            borde.setAttribute('d', d); tubo.setAttribute('d', d);
        },
    };
}

/** Clave de una pista: en el instante t (0..1) la mano está así. */
type Clave = { t: number; x: number; y: number; rot?: number; sx?: number; sy?: number; pose: NombrePose; onda?: number };
const suave = (u: number) => u * u * (3 - 2 * u);
/** Posición interpolada; el dibujo (pose) cambia de golpe a mitad de tramo, como en papel. */
function muestra(claves: Clave[], t: number) {
    let j = claves.findIndex(c => c.t > t);
    if (j === -1) j = claves.length - 1;
    const a = claves[Math.max(0, j - 1)], b = claves[j];
    const u = b.t === a.t ? 1 : suave(Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))));
    const l = (p: number, q: number) => p + (q - p) * u;
    return { x: l(a.x, b.x), y: l(a.y, b.y), rot: l(a.rot ?? 0, b.rot ?? 0), sx: l(a.sx ?? 1, b.sx ?? 1), sy: l(a.sy ?? 1, b.sy ?? 1), onda: l(a.onda ?? 0, b.onda ?? 0), pose: u < 0.5 ? a.pose : b.pose };
}

type Rect = { left: number; top: number; width: number; height: number };
/** Cómo acaba la pelea, cuando se sabe: quién gana y cuánto dura tu aturdimiento si pierdes. */
export type Final = { gano: boolean; aturdido: number };

/** Un tramo de animación de `ms`, cuadro a cuadro: `f(u)` con u de 0 a 1. */
const tramo = (ms: number, f: (u: number) => void) => new Promise<void>(fin => {
    const t0 = performance.now();
    const cuadro = (ahora: number) => { const u = Math.min(1, (ahora - t0) / ms); f(u); if (u < 1) requestAnimationFrame(cuadro); else fin(); };
    requestAnimationFrame(cuadro);
});

/** El arrebato: `carta` (un elemento ya colocado en `obj`) sale de `desde` (tu hueco); la mano
 *  del rival sale de `rival` (su franja) o de arriba; la tuya, de abajo. Dura `dura` ms.
 *  `robo`: sin pelea; el guante del rival te la quita y se la lleva a su franja.
 *  `final`: las dos manos se quedan forcejeando hasta que se resuelve la pelea, y entonces
 *  la que gana abofetea a la otra (desenlace). */
export function arrebato(fx: HTMLElement, carta: HTMLElement, desde: Rect, obj: Rect, rival: Rect | null, dura = 650, robo = false, final?: Promise<Final | null>): Promise<void> {
    const W = innerWidth, H = innerHeight;
    const capa = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
    Object.assign(capa.style, { position: 'fixed', inset: '0', zIndex: '123', pointerEvents: 'none', overflow: 'visible' });
    // Rojo de dolor: el blanco del guante pasa a bermellón y la tinta sigue negra
    capa.innerHTML = '<defs><filter id="guanteRojo" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0  .1 .1 .08 0 0  .06 .06 .05 0 0  0 0 0 1 0"/></filter></defs>';
    fx.append(capa);
    const tam = Math.min(obj.width * 0.95, 150);
    const R = guante(capa, '#a9b689', 0, tam), Y = robo ? null : guante(capa, '#e8402a', 1, tam);

    const cx = obj.left + obj.width / 2, top = obj.top, bot = obj.top + obj.height;
    const hx = desde.left + desde.width / 2, hy = desde.top;               // tu hueco
    const ax = rival ? rival.left + rival.width / 2 : cx + W * 0.25, ay = rival ? rival.top + rival.height : -40;   // origen del brazo rival
    const bx = cx - W * 0.1, by = H + 60;                                   // origen del tuyo
    const g = tam * 0.75;                                                   // de la muñeca al agarre, aprox.

    // El ladrón: entra de puntillas (dedos abajo, rot 180), se para, agarra, tira hacia arriba,
    // se sobresalta al ver la tuya y forcejea.
    const rv: Clave[] = [
        { t: 0, x: ax, y: ay, rot: 180, sx: 0.8, sy: 0.8, pose: 'puntilla1', onda: 0 },
        { t: 0.1, x: ax + (hx - ax) * 0.35, y: ay + (hy - g - ay) * 0.35, rot: 170, sy: 1.1, pose: 'puntilla2', onda: 40 },
        { t: 0.18, x: ax + (hx - ax) * 0.7, y: ay + (hy - g - ay) * 0.7, rot: 190, sy: 0.9, pose: 'puntilla1', onda: -40 },
        { t: 0.26, x: hx, y: hy - g - 10, rot: 180, sx: 1, sy: 1.15, pose: 'abierta', onda: 20 },     // asoma, se estira
        { t: 0.32, x: hx, y: hy - g * 0.55, rot: 180, sx: 1.25, sy: 0.8, pose: 'agarra', onda: 0 },   // ¡zas!, aplastada
        { t: 0.44, x: cx, y: top - g * 0.5, rot: 172, sx: 0.85, sy: 1.25, pose: 'agarra', onda: 60 }, // tira hacia arriba
        { t: 0.52, x: cx + 6, y: top - g * 0.7, rot: 165, sx: 1.2, sy: 1.25, pose: 'tensa', onda: 90 },   // ¡pillado!
        { t: 0.58, x: cx - 4, y: top - g * 0.5, rot: 186, sx: 1, sy: 1, pose: 'agarra', onda: -50 },
        { t: 0.7, x: cx, y: top - g * 0.65, rot: 176, sy: 1.15, pose: 'agarra', onda: 50 },
        { t: 0.82, x: cx, y: top - g * 0.4, rot: 185, sy: 0.85, pose: 'agarra', onda: -40 },
        { t: 1, x: cx, y: top - g * 0.55, rot: 180, pose: 'agarra', onda: 0 },
    ];
    // La tuya: sale disparada de abajo apuntando con la pistola, y agarra el borde de abajo.
    const yo: Clave[] = [
        { t: 0, x: bx, y: by + 200, pose: 'pistola' },
        { t: 0.42, x: bx, y: by + 200, pose: 'pistola' },
        { t: 0.5, x: cx - tam * 0.2, y: bot + g * 1.3, rot: 18, sx: 0.85, sy: 1.25, pose: 'pistola', onda: 30 },   // ¡quieto!
        { t: 0.56, x: cx - tam * 0.2, y: bot + g * 1.4, rot: 6, sx: 1.1, sy: 0.9, pose: 'pistola', onda: 10 },     // retroceso
        { t: 0.64, x: cx, y: bot + g * 0.5, rot: 0, sx: 1.25, sy: 0.8, pose: 'agarra', onda: -20 },               // agarra
        { t: 0.7, x: cx, y: bot + g * 0.75, sy: 1.2, pose: 'agarra', onda: 40 },
        { t: 0.82, x: cx, y: bot + g * 0.45, sy: 0.85, pose: 'agarra', onda: -30 },
        { t: 1, x: cx, y: bot + g * 0.6, pose: 'agarra', onda: 0 },
    ];
    // Robo: entra rápido (dos pasitos), agarra y se va por donde vino con la carta colgando.
    const robado: Clave[] = [
        { t: 0, x: ax, y: ay, rot: 180, sx: 0.8, sy: 0.8, pose: 'puntilla1' },
        { t: 0.18, x: ax + (hx - ax) * 0.5, y: ay + (hy - g - ay) * 0.5, rot: 172, sy: 1.15, pose: 'puntilla2', onda: 40 },
        { t: 0.36, x: hx, y: hy - g - 8, rot: 180, sy: 1.15, pose: 'abierta', onda: -20 },
        { t: 0.46, x: hx, y: hy - g * 0.55, rot: 180, sx: 1.25, sy: 0.8, pose: 'agarra' },          // ¡zas!
        { t: 0.62, x: hx + (ax - hx) * 0.2, y: hy - g * 0.9, rot: 188, sx: 0.85, sy: 1.3, pose: 'agarra', onda: 60 },
        { t: 1, x: ax, y: ay - g, rot: 180, sy: 1.2, pose: 'agarra', onda: -30 },
    ];
    // La carta: en tu hueco hasta que la agarran; sube con el ladrón; luego, entre las dos.
    const k0 = desde.width / obj.width;
    const sx0 = hx - cx, sy0 = desde.top + desde.height / 2 - (top + obj.height / 2);
    const t0 = performance.now();
    carta.style.transition = 'none';   // la mueve cada cuadro: con la transición de .card iba a la zaga de la mano
    carta.style.transform = `translate(${sx0}px, ${sy0}px) scale(${k0})`;   // en tu hueco ya desde el primer cuadro
    return new Promise<void>(fin => {
        const cuadro = (ahora: number) => {
            const t = Math.min(1, (ahora - t0) / dura);
            if (robo) {
                const r = muestra(robado, t);
                R.set(r.x, r.y, r.rot, r.sx, r.sy, r.pose, ax, ay, r.onda);
                // Colgando de los dedos (abajo de la muñeca, que va boca abajo) desde que la agarra.
                const u = t < 0.46 ? 0 : 1;
                // (pellizcada por el borde de arriba: asoma entera bajo los dedos)
                const tx = u ? r.x - cx : sx0, ty = u ? r.y + g * 0.85 + desde.height * 0.4 - (top + obj.height / 2) : sy0;
                carta.style.transform = `translate(${tx}px, ${ty}px) rotate(${u ? (r.rot - 180) * 1.5 : 0}deg) scale(${k0})`;
                if (t < 1) requestAnimationFrame(cuadro); else fin();
                return;
            }
            const r = muestra(rv, t), y = muestra(yo, t);
            R.set(r.x, r.y, r.rot, r.sx, r.sy, r.pose, ax, ay, r.onda);
            Y!.set(y.x, y.y, y.rot, y.sx, y.sy, y.pose, bx, by, y.onda);
            // Carta: quieta hasta t .32, luego la lleva el ladrón y forcejean.
            const u = t < 0.32 ? 0 : t < 0.44 ? suave((t - 0.32) / 0.12) : 1;
            const tir = t > 0.44 ? (r.y - (top - g * 0.55)) * 0.6 + (y.y - (bot + g * 0.6)) * 0.4 : 0;
            const tx = sx0 * (1 - u), ty = sy0 * (1 - u) + tir, s = k0 + (1 - k0) * u, gir = t > 0.44 ? (r.rot - 180) * 0.8 : 0;
            carta.style.transform = `translate(${tx}px, ${ty}px) rotate(${gir}deg) scale(${s})`;
            if (t < 1) requestAnimationFrame(cuadro);
            else fin();
        };
        requestAnimationFrame(cuadro);
    }).then(async () => {
        if (final && Y) await desenlace(final);
        for (const e of [capa, carta]) e.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }).finished.finally(() => e.remove());
    });

    // ── Mientras dura la pelea, forcejean; al acabar, la que gana abofetea a la otra ──
    type Pos = ReturnType<typeof muestra>;
    function ponCarta(r: Pos, y: Pos) {
        const tir = (r.y - (top - g * 0.55)) * 0.6 + (y.y - (bot + g * 0.6)) * 0.4;
        carta.style.transform = `translate(0px, ${tir}px) rotate(${(r.rot - 180) * 0.8}deg) scale(1)`;
    }
    // (declaraciones de función: se usan desde el `then` de arriba, después del return)
    function ponR(p: Pos) { R.set(p.x, p.y, p.rot, p.sx, p.sy, p.pose, ax, ay, p.onda); }
    function ponY(p: Pos) { Y!.set(p.x, p.y, p.rot, p.sx, p.sy, p.pose, bx, by, p.onda); }
    function entre(a: Pos, b: Partial<Pos>, u: number): Pos {
        const l = (p: number, q: number | undefined) => q === undefined ? p : p + (q - p) * u;
        return { x: l(a.x, b.x), y: l(a.y, b.y), rot: l(a.rot, b.rot), sx: l(a.sx, b.sx), sy: l(a.sy, b.sy), onda: l(a.onda, b.onda), pose: u < 0.5 ? a.pose : (b.pose ?? a.pose) };
    }
    /** El golpe: una estrella de cómic donde da la mano, que salta y se apaga. */
    function estrella(x: number, y: number) {
        const n = 9, pts = Array.from({ length: n * 2 }, (_, i) => {
            const a = i * Math.PI / n, rr = (i % 2 ? 0.45 : 1) * tam * 0.55 * (0.85 + 0.3 * ((i * 7) % 3) / 2);
            return `${(Math.cos(a) * rr).toFixed(1)},${(Math.sin(a) * rr).toFixed(1)}`;
        }).join(' ');
        const e = el('polygon', { points: pts, fill: '#f4f1e6', stroke: TINTA, 'stroke-width': 4, 'stroke-linejoin': 'round' });
        capa.append(e);
        void tramo(220, u => e.setAttribute('transform', `translate(${x} ${y}) rotate(${u * 25}) scale(${0.3 + u * 1.1})`)).then(() =>
            e.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' }).finished.finally(() => e.remove()));
    }
    async function desenlace(final: Promise<Final | null>) {
        let res: Final | null = null, llego = false;
        void final.then(f => { res = f; llego = true; });
        const r0 = muestra(rv, 1), y0 = muestra(yo, 1);
        let r = r0, y = y0;
        const t1 = performance.now();
        await new Promise<void>(listo => {
            const cuadro = (ahora: number) => {
                const s = (ahora - t1) / 1000, w = Math.sin(s * Math.PI * 4.4), w2 = Math.sin(s * Math.PI * 6.2 + 1);
                r = { ...r0, y: r0.y - w * g * 0.16, rot: 180 + w2 * 6, sx: 1 + w * 0.08, sy: 1 - w * 0.08, onda: w * 40 };
                y = { ...y0, y: y0.y - w * g * 0.12, rot: -w2 * 5, sx: 1 - w * 0.08, sy: 1 + w * 0.1, onda: -w * 30 };
                ponR(r); ponY(y); ponCarta(r, y);
                if (llego) listo(); else requestAnimationFrame(cuadro);
            };
            requestAnimationFrame(cuadro);
        });
        if (!res) return;   // se cortó sin resultado: se van sin más
        const { gano, aturdido } = res;
        const cy0 = top + obj.height / 2;
        const golpea = gano ? y : r, recibe = gano ? r : y, ponG = gano ? ponY : ponR, ponV = gano ? ponR : ponY;
        const lado = gano ? 1 : -1;
        // Carga: la mano que gana suelta la carta y echa el brazo atrás
        const carga = { x: golpea.x + lado * tam * 0.9, y: golpea.y + (gano ? g * 0.5 : -g * 0.4), rot: (gano ? 0 : 180) - lado * 45, sx: 0.85, sy: 1.3, pose: 'abierta' as const, onda: lado * 50 };
        await tramo(200, u => { ponG(entre(golpea, carga, suave(u))); ponV(entre(recibe, { sy: 1.1 }, u)); });
        // ¡Zas!: de canto contra la otra mano
        const pega = { x: recibe.x - lado * tam * 0.15, y: recibe.y + (gano ? g * 0.1 : -g * 0.1), rot: (gano ? 0 : 180) + lado * 60, sx: 1.35, sy: 0.75, pose: 'abierta' as const, onda: -lado * 30 };
        const desdeG = entre(golpea, carga, 1);
        await tramo(80, u => ponG(entre(desdeG, pega, u)));
        estrella(recibe.x, recibe.y + (gano ? g * 0.35 : -g * 0.35));
        try { navigator.vibrate?.(gano ? 30 : [40, 30, 60]); } catch { /* */ }
        const tocada = { ...recibe, pose: 'tensa' as const };
        if (gano) {
            // El ladrón sale despedido a su franja dando vueltas; la carta cae en tu mano; tú, «like»
            const vuela = { x: ax, y: ay - g, rot: 180 + 220, sx: 0.7, sy: 1.4, pose: 'tensa' as const, onda: 80 };
            // «like»: puño de lado con el pulgar arriba (rot 90: los dedos a la derecha, la muñeca a la izquierda)
            const vuelve = { x: cx - tam * 0.75, y: bot + g * 0.75, rot: 90, sx: 1, sy: 1, pose: 'like' as const, onda: 0 };
            await tramo(380, u => {
                const q = suave(u);
                ponV(entre(tocada, vuela, q));
                ponG(entre(pega, vuelve, q));
                carta.style.transform = `translate(${sx0 * q}px, ${sy0 * q}px) rotate(${(1 - q) * 12}deg) scale(${1 + (k0 - 1) * q})`;
            });
            await tramo(160, u => ponG(entre(vuelve, { sx: 1 + 0.08 * Math.sin(u * Math.PI), sy: 1 + 0.08 * Math.sin(u * Math.PI) }, 1)));
            return;
        }
        // Pierdes: tu guante se pone rojo y se encoge abajo, latiendo de dolor mientras dura el aturdimiento
        Y!.rojo(true);
        const ret = { x: cx - tam * 0.2, y: H - g * 0.35, rot: 12, sx: 1, sy: 1, pose: 'tensa' as const, onda: 0 };
        const llevaR = { x: ax, y: ay - g, rot: 180, sx: 0.9, sy: 1.2, pose: 'agarra' as const, onda: -40 };
        await tramo(300, u => {
            const q = suave(u);
            ponV(entre(tocada, ret, q));
            ponG(entre(pega, llevaR, q));
            carta.style.transform = `translate(${(ax - cx) * q}px, ${(ay - g - cy0) * q}px) rotate(${q * -30}deg) scale(${1 + (k0 * 0.6 - 1) * q})`;
        });
        carta.style.opacity = '0';
        // Las rayitas del dolor, alrededor del guante, al ritmo del latido
        const rayas = el('path', { fill: 'none', stroke: TINTA, 'stroke-width': 4, 'stroke-linecap': 'round' });
        capa.append(rayas);
        const P = Math.PI;
        await tramo(Math.max(400, aturdido - 580), u => {
            const s = u * Math.max(400, aturdido - 580) / 1000, lat = Math.abs(Math.sin(s * P / 0.32));   // ~3 latidos por segundo
            const k = 1 + 0.16 * lat;
            ponV({ ...ret, sx: k, sy: k * (1 - 0.05 * lat), rot: 12 + Math.sin(s * 40) * 2 });   // tiembla
            const R0 = tam * 0.75 * k, R1 = R0 + tam * 0.22 * lat, mx = ret.x, my = ret.y - tam * 0.5;
            rayas.setAttribute('d', [-0.9, -0.3, 0.3, 0.9].map(a => `M${mx + Math.sin(a) * R0} ${my - Math.cos(a) * R0} L${mx + Math.sin(a) * R1} ${my - Math.cos(a) * R1}`).join(' '));
            rayas.setAttribute('opacity', String(0.3 + 0.7 * lat));
        });
    }
}