// La partida de fondo del menú (diseno/menu-mesa/README.md): cuatro personas jugando a
// cámara lenta en un canvas. La interfaz (mesa.js) la mueve con escena.ir(), escena.X…
// ── La partida de fondo: cuatro personas jugando a cámara lenta ─────────────────
// Todo sale de una línea de tiempo determinista (jugadas en `ACC`): el tiempo `t` avanza
// despacio solo y, al navegar, corre hacia delante (entrar) o hacia atrás (volver), así
// que la partida se rebobina de verdad. Cada menú tiene su cámara.
import { T } from './dic.js';
import { porId } from '../juego/estado.js';

type Pt = { x: number; z: number };
type P3 = { x: number; y: number; z: number };
type V3 = [number, number, number];
type Asiento = Pt & { a: number };
/** Cámara: yaw/pitch/roll en rad, distancia, centro en pantalla (cy, 0..1) y punto al que mira. */
type Cam = { yaw: number; pitch: number; dist: number; cy: number; roll: number; mx: number; mz: number; my: number };
type Pool = 'fun' | 'glory';
type Mesa = Pt & { ocup: boolean[]; desfase: number; jugando: boolean };
/** Una carta de una figura: en la mano, o volando al centro (u de 0 a 1, con su giro). */
type Carta = { mano?: boolean; vuela?: number; giro?: number };
/** Lo de cada menú dentro de la escena: lo escribe la interfaz (mesa.js). */
export interface MenuEnEscena {
    mosaico: { celdas: { x: number; z: number; c: boolean }[]; s: number; t0: number; huecos: boolean; salen?: number } | null;
    visor: { video: HTMLVideoElement | null; t0: number } | null;
    listos: boolean[]; ocupados: boolean[]; llegada: number[];
    nombres: string[] | null;
    elo: ({ v: number; pool: Pool; top3?: boolean } | null)[] | null;   // null: asiento sin Elo
    anclas: { x?: number; y?: number; s?: number; ok?: boolean }[];
    placa: { txt: string; ok: boolean } | null;
    burla: number;
    voto: { a: number; t0: number } | null;
    mesas: Mesa[] | null;
    cortado: boolean; apagon: number; tu: number; marca: number;
}

export const escena = (() => {
    const cv = porId<HTMLCanvasElement>('juego'), g = cv.getContext('2d')!;
    // La carta que dos se disputan en «¡A JUGAR!» (entre los asientos 0 y 1)
    const DIS = { x: -0.86, z: 0.66 };   // cerca del borde, entre los dos: se alcanza sin estirar de más
    const CAMS0: Record<string, Omit<Cam, 'my'> & { my?: number }> = {   // yaw/pitch/roll en rad, distancia, centro en pantalla (0..1), punto al que mira (mx, mz)
        inicio:  { yaw: 0.35, pitch: 0.62, dist: 3.3, cy: 0.42, roll: -0.10, mx: 0, mz: 0 },
        crear:   { yaw: 1.60, pitch: 0.18, dist: 2.3, cy: 0.40, roll: 0.22, mx: 0.3, mz: 0 },
        unirse:  { yaw: -1.25, pitch: 1.12, dist: 2.4, cy: 0.40, roll: -0.32, mx: -0.2, mz: 0.2 },
        // La disputa, de cerca y algo desde arriba (se ven las dos manos sobre la carta). cy lo ajusta
        // la sala al hueco que dejan libre los jugadores y el chat (fijarCy).
        sala:    { yaw: 2.25, pitch: 0.52, dist: 1.45, cy: 0.42, roll: 0.10, mx: DIS.x, mz: DIS.z, my: 0.12 },
        bots:    { yaw: 2.0, pitch: 0.44, dist: 1.35, cy: 0.42, roll: -0.08, mx: DIS.x, mz: DIS.z, my: 0.12 },
        tutorial:   { yaw: -2.4, pitch: 0.90, dist: 2.2, cy: 0.42, roll: 0.25, mx: 0.3, mz: -0.3 },
        perfil:     { yaw: 2.9, pitch: 0.30, dist: 2.0, cy: 0.40, roll: -0.20, mx: 0, mz: -0.4 },
        burla:      { yaw: Math.PI - 0.25, pitch: 0.32, dist: 2.6, cy: 0.30, roll: 0.08, mx: 0.05, mz: 1.3, my: 0.2 },   // tu figura, de frente   // tu figura, de frente
        // Vista helicóptero: el QR (o la cuenta atrás) se forma con las cartas del centro
        qr:         { yaw: 0, pitch: 1.5, dist: 3.5, cy: 0.36, roll: 0, mx: 0, mz: 0, my: 0 },
        cuenta:     { yaw: 0, pitch: 1.5, dist: 2.3, cy: 0.36, roll: 0, mx: 0, mz: 0, my: 0 },
        visor:      { yaw: 0, pitch: 1.5, dist: 1.9, cy: 0.36, roll: 0, mx: 0, mz: 0, my: 0 },
        // Sillas vacías, a ras de mesa (nadie a la altura)
        vacias:     { yaw: 1.9, pitch: 0.10, dist: 2.6, cy: 0.46, roll: 0.08, mx: 0, mz: -0.2, my: 0.3 },
        // Tu Elo: la medalla de tu silla y el borde de la mesa delante de ti
        elo:        { yaw: Math.PI - 0.35, pitch: 0.32, dist: 2.6, cy: 0.30, roll: -0.06, mx: -0.15, mz: 1.3, my: 0.2 },
        // Session Manager: por detrás de tu silla, la placa del respaldo
        sm:         { yaw: 0.25, pitch: 0.12, dist: 0.95, cy: 0.33, roll: 0.05, mx: -0.05, mz: 1.88, my: 0.22 },
        // Mirar una partida: de pie, detrás de una silla
        mirar:      { yaw: 0, pitch: 0.55, dist: 3.0, cy: 0.42, roll: 0, mx: 0, mz: 0.3, my: 0.2 },
        idioma:     { yaw: -0.4, pitch: 1.30, dist: 2.6, cy: 0.40, roll: -0.40, mx: 0, mz: 0 },
        privacidad: { yaw: 2.0, pitch: 0.25, dist: 2.1, cy: 0.40, roll: -0.18, mx: -0.3, mz: 0 },
        codigo:     { yaw: -1.9, pitch: 0.45, dist: 1.7, cy: 0.40, roll: 0.28, mx: 0, mz: 0.2 },
        // Todos listos: quien gana la pelea alza la carta (antes de la cuenta atrás)
        ganador: { yaw: 2.6, pitch: 0.22, dist: 2.4, cy: 0.7, roll: 0.06, mx: -0.3, mz: 0.8, my: 0.75 },
        // Empieza la partida: contrapicado hacia quien ganó la carta (asiento 0), que la alza
        partida: { yaw: Math.PI, pitch: 0.10, dist: 2.5, cy: 0.52, roll: -0.12, mx: 0, mz: 0.6, my: 0.85 },
    };
    const CAMS: Record<string, Cam> = Object.fromEntries(Object.entries(CAMS0).map(([k, c]) => [k, { my: 0.2, ...c }]));   // my: altura del punto al que mira
    let cam: Cam = { ...CAMS.inicio }, meta: Cam = { ...CAMS.inicio }, actual = 'inicio';
    let t = 6, tMeta = 6, disputa = 0, disputaMeta = 0, reloj = 0;
    type Chispa = { x: number; y: number; vx: number; vy: number; vida: number; total: number; peso: number; ancho: number; color: string };
    type Anillo = { x: number; y: number; radio: number; vida: number; total: number };
    let gana = -1, chispas: Chispa[] = [], anillos: Anillo[] = [], estalló = false;
    let nuestras: (Pt & { rot: number; dorso: boolean })[] = [];   // cartas del menú soltadas en el centro de la mesa (las 6 últimas)   // la victoria: desde cuándo, y sus partículas
    // Segundos de partida por segundo real. En el inicio (con el nombre) todos juegan rápido,
    // recogiendo y lanzando; desde la primera opción elegida, tiempo bala.
    const RAPIDO = 1.5, BALA = 0.3;
    let vel = RAPIDO, velMeta = RAPIDO, tv = 0;   // tv: reloj de los gestos sueltos, al mismo ritmo
    // Dónde está el cuerpo: en la disputa, los dos se echan hacia la carta
    function base(a: Pt, p: number): Pt {
        const b = { x: a.x * 0.98, z: a.z * 0.98 };
        if (p > 1 || disputa < 0.01) return b;
        const dx = DIS.x - b.x, dz = DIS.z - b.z, n = Math.hypot(dx, dz);
        return { x: b.x + dx / n * 0.45 * disputa, z: b.z + dz / n * 0.45 * disputa };
    }

    let s = 1532;   // azar con semilla: la misma partida cada vez
    const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
    const ACC: { t: number; p: number; toma: boolean; giro: number }[] = [];
    for (let k = 0; k < 1600; k++) ACC.push({ t: 1 + k * 0.75 + rnd() * 0.3, p: Math.floor(rnd() * 4), toma: rnd() < 0.5, giro: rnd() * 0.6 - 0.3 });

    const ASIENTOS: Asiento[] = [0, 1, 2, 3].map(p => { const a = Math.PI / 2 + p * Math.PI / 2; return { x: Math.cos(a) * 1.95, z: Math.sin(a) * 1.45, a }; });
    // Medio ancho y medio alto de una carta: a escala de las manos de las figuras (6,3 × 8,8 cm)
    const CW_M = 0.05, CH_M = 0.07;
    const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
    const ROJO = '#e8402a';   // el acento (--acento): tú, lo que se juega y quién gana
    const suave = (a: number, b: number, x: number) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

    // Cámara que mira al centro de la mesa desde (yaw, pitch, dist)
    let C: number[] = [], R: number[] = [], U: number[] = [], F: number[] = [], foco = 1;
    function preparar() {
        const cp = Math.cos(cam.pitch), yaw = cam.yaw + 0.05 * Math.sin(reloj * 0.23);   // deriva lenta: la cámara respira
        C = [cam.mx + Math.sin(yaw) * cp * cam.dist, Math.sin(cam.pitch) * cam.dist + cam.my, cam.mz + Math.cos(yaw) * cp * cam.dist];
        const f = [cam.mx - C[0], cam.my - C[1], cam.mz - C[2]], n = Math.hypot(...f);
        F = f.map(v => v / n);
        R = [F[2], 0, -F[0]]; const nr = Math.hypot(...R); R = R.map(v => -v / nr);
        U = [R[1] * F[2] - R[2] * F[1], R[2] * F[0] - R[0] * F[2], R[0] * F[1] - R[1] * F[0]];
        foco = cv.height * 0.95;
    }
    let OX = 0, OZ = 0;   // desplazamiento de la mesa que se dibuja (las otras salas de «Unirse»)
    function proy(x: number, y: number, z: number): V3 {
        const v = [x + OX - C[0], y - C[1], z + OZ - C[2]];
        const d = v[0] * F[0] + v[1] * F[1] + v[2] * F[2];
        const px = v[0] * R[0] + v[1] * R[1] + v[2] * R[2], py = v[0] * U[0] + v[1] * U[1] + v[2] * U[2];
        const sx = px / d * foco, sy = py / d * foco, cr = Math.cos(cam.roll), sr = Math.sin(cam.roll);   // roll: plano holandés
        return [cv.width / 2 + sx * cr - sy * sr, cv.height * cam.cy - (sx * sr + sy * cr), d];
    }
    function quad(cx: number, y: number, cz: number, w: number, h: number, rot: number, relleno: string, borde: string | null) {   // una carta tumbada en la mesa
        const c = Math.cos(rot), sn = Math.sin(rot);
        const p = [[-w, -h], [w, -h], [w, h], [-w, h]].map(([a, b]) => proy(cx + a * c - b * sn, y, cz + a * sn + b * c));
        if (p.some(q => q[2] < 0.08)) return;   // detrás de la cámara
        g.beginPath(); p.forEach(([x, yy], i) => (i ? g.lineTo(x, yy) : g.moveTo(x, yy))); g.closePath();
        g.fillStyle = relleno; g.fill();
        if (borde) { g.strokeStyle = borde; g.lineWidth = 1.2 * devicePixelRatio; g.stroke(); }
    }

    function dibujar(dt: number) {
        // Estela: el cuadro anterior se borra a medias (cámara lenta). Se borra a transparente,
        // no se pinta de negro: los fragmentos del fondo quedan DETRÁS de la mesa, no encima.
        g.globalCompositeOperation = 'destination-out';
        g.fillStyle = `rgba(0, 0, 0, ${lerp(0.32, 0.8, suave(BALA, RAPIDO, vel))})`;   // más estela cuanto más lento
        g.fillRect(0, 0, cv.width, cv.height);
        g.globalCompositeOperation = 'source-over';
        preparar();
        const e = gana >= 0 ? reloj - gana : -1;   // segundos desde que alguien ganó la carta
        g.save();
        if (e > 0.15 && e < 0.7) {   // temblor al arrancarla
            const a = 18 * devicePixelRatio * (1 - suave(0.15, 0.7, e));
            g.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
        }
        // Las mesas, de la más lejana a la más cercana. Las otras (salas de «Unirse») viven en
        // otro punto de la misma línea de tiempo y no tienen nombres, disputa ni objetos de menú.
        const mesas = [{ x: 0, z: 0 } as Pt & Partial<Mesa>, ...(X.mesas ?? [])].map(m => ({ ...m, d: proy(m.x, 0, m.z)[2] })).sort((a, b) => b.d - a.d);
        for (const m of mesas) {
            if (m.d < 0.3) continue;
            if (m.ocup) {   // otra sala
                const guarda: [number, boolean[]] = [t, X.ocupados]; OX = m.x; OZ = m.z; t += m.desfase ?? 0; X.ocupados = m.ocup; principal = false; quietos = !m.jugando;
                unaMesa(-1);
                [t, X.ocupados] = guarda; OX = OZ = 0; principal = true; quietos = false;
            } else unaMesa(e);
        }
        particulas(dt);
        g.restore();
        if (e > 0.15 && e < 0.45) {   // destello al arrancarla
            g.fillStyle = `rgba(233, 230, 218, ${0.5 * (1 - suave(0.15, 0.45, e))})`;
            g.fillRect(0, 0, cv.width, cv.height);
        }
        // Sin conexión: la luz parpadea y se apaga, todo queda quieto y sin color
        X.apagon += ((X.cortado ? 1 : 0) - X.apagon) * Math.min(1, dt * 3);
        if (X.apagon > 0.01) {
            const parpadeo = X.cortado && Math.random() < 0.12 ? 0.35 : 0;
            g.fillStyle = `rgba(0, 0, 0, ${Math.min(0.85, 0.55 * X.apagon + parpadeo)})`;
            g.fillRect(0, 0, cv.width, cv.height);
        }
        cv.style.filter = X.apagon > 0.01 ? `grayscale(${X.apagon})` : '';
    }

    // ── Lo de cada menú, dentro de la escena ──────────────────────────────────────
    const X: MenuEnEscena = {
        mosaico: null,                        // cartas que forman una figura vista desde arriba (QR, 3-2-1)
        visor: null,                          // el visor del escáner de QR: { video, t0 }
        listos: [false, false, false, false], // lámpara encendida sobre quien está listo
        ocupados: [true, true, true, true],   // sillas con alguien; las vacías se ven vacías
        llegada: [-9, -9, -9, -9],            // cuándo se sentó (parpadea al llegar, como un bot)
        nombres: null,                        // los de la sala; sin sala, el top global
        elo: null,                            // por asiento: { v, pool, top3 }; sin sala, el top global
        anclas: [{}, {}, {}, {}],             // dónde va el dial de Elo de cada asiento (px CSS)
        placa: null,                          // la placa de Session Manager en tu respaldo: { txt, ok }
        burla: -9,                            // cuándo hizo tu figura el gesto de burla
        voto: null,                           // votación para echar: { a, t0 }
        mesas: null,                          // otras salas, en la misma sala oscura
        cortado: false, apagon: 1,            // sin conexión (empieza apagado: «Conectando…»)
        tu: -1,                               // tu asiento (contorno bermellón); -1 = no estás en la mesa
        marca: -1,                            // asiento señalado (a quién votas echar): también en bermellón
    };
    let principal = true, quietos = false;   // quietos: sala en espera, nadie lanza
    const RANGOS: Record<Pool, [string, string][]> = {
        fun: [['Cartón', '#b89a6e'], ['Juguete', '#ffd23f'], ['Latón', '#d9c35a'], ['Caucho', '#8a8a8a'], ['Plástico', '#4fe3d3'],
            ['Gominola', '#ff8ab8'], ['Dulce', '#ff6b7a'], ['Confeti', '#b794ff'], ['Payaso', '#ff7a70']],
        glory: [['Hierro oxidado', '#b06a38'], ['Bronce', '#d9914d'], ['Plata', '#cdd5df'], ['Oro', '#f2cb5c'], ['Platino', '#bfe3ff'],
            ['Diamante', '#8fc0ff'], ['Máster', '#ffe27a'], ['Gran máster', '#ffb8d2'], ['Top 3 global', '#ffe08a']],
    };
    const MINS: (number | null)[] = [null, 1001, 1100, 1200, 1300, 1400, 1500, 1600];   // los de agapornis-ui/rank.js
    function rango(v: number, pool: Pool, top3 = false) {
        let i = 0; for (let k = 1; k < MINS.length; k++) if (v >= MINS[k]!) i = k;
        if (top3 && v >= 1600) i = 8;
        return RANGOS[pool][i];
    }
    // ponytail: Elo de ejemplo del top global; en Piles vendrá del mismo endpoint que los nombres
    const ELO_TOP: { v: number; pool: Pool; top3?: boolean }[] = [{ v: 1724, pool: 'glory', top3: true }, { v: 1688, pool: 'glory', top3: true }, { v: 1651, pool: 'glory', top3: true }, { v: 1604, pool: 'glory' }];
    X.elo = ELO_TOP.map(e => ({ ...e }));

    // Polígono en 3D (lista de puntos), relleno y borde
    function poli(pts: number[][], relleno: string | null, borde: string | null, ancho = 1.2) {
        const p = pts.map(q => proy(q[0], q[1], q[2]));
        if (p.some(q => q[2] < 0.08)) return;
        g.beginPath(); p.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
        if (relleno) { g.fillStyle = relleno; g.fill(); }
        if (borde) { g.strokeStyle = borde; g.lineWidth = ancho * devicePixelRatio; g.stroke(); }
    }
    // Dibuja en un plano del mundo: origen o, ejes ex y ey (vectores 3D de largo ancho y alto);
    // fn pinta en coordenadas locales de ancho×alto px.
    function enPlano(o: V3, ex: number[], ey: number[], ancho: number, alto: number, fn: () => void) {
        const P = proy(...o), A = proy(o[0] + ex[0], o[1] + ex[1], o[2] + ex[2]), B = proy(o[0] + ey[0], o[1] + ey[1], o[2] + ey[2]);
        if (P[2] < 0.1 || A[2] < 0.1 || B[2] < 0.1) return;
        g.save();
        g.transform((A[0] - P[0]) / ancho, (A[1] - P[1]) / ancho, (B[0] - P[0]) / alto, (B[1] - P[1]) / alto, P[0], P[1]);
        fn();
        g.restore();
    }
    // Ejes de un asiento: fw hacia el centro, ld de lado (en el suelo)
    function ejes(a: Pt) { const n = Math.hypot(a.x, a.z), fw = [-a.x / n, -a.z / n]; return { fw, ld: [fw[1], -fw[0]] }; }

    // La silla, con las medidas de la de las figuras (siluetas.py, ×1,5): asiento a −0,45,
    // respaldo de −0,39 a 0,57, 0,43 por detrás del centro del cuerpo
    function silla(a: Pt, p: number, alfa = 1) {
        const cu = base(a, p), { fw, ld } = ejes(a);
        const P = (adelante: number, lado: number, y: number): V3 => [cu.x + fw[0] * adelante + ld[0] * lado, y, cu.z + fw[1] * adelante + ld[1] * lado];
        g.globalAlpha = alfa;
        for (const [f, l] of [[0.18, 0.3], [0.18, -0.3], [-0.42, 0.3], [-0.42, -0.3]]) poli([P(f, l, -1.18), P(f, l, -0.45), P(f + 0.02, l, -0.45), P(f + 0.02, l, -1.18)], '#141610', 'rgba(169,182,137,0.35)');
        poli([P(0.21, 0.35, -0.45), P(0.21, -0.35, -0.45), P(-0.45, -0.35, -0.45), P(-0.45, 0.35, -0.45)], '#1c1f16', 'rgba(169,182,137,0.6)');
        poli([P(-0.43, 0.32, -0.45), P(-0.43, -0.32, -0.45), P(-0.43, -0.32, 0.57), P(-0.43, 0.32, 0.57)], '#101209', 'rgba(169,182,137,0.6)');
        g.globalAlpha = 1;
    }
    // La placa de Session Manager, en la cara de atrás de tu respaldo
    function deLaSilla(a: Pt, p: number) {
        const cu = base(a, p), { fw, ld } = ejes(a);
        const P = (adelante: number, lado: number, y: number): V3 => [cu.x + fw[0] * adelante + ld[0] * lado, y, cu.z + fw[1] * adelante + ld[1] * lado];
        const placa = X.placa;
        if (p === 0 && placa) {   // placa en la cara de atrás de tu respaldo
            const o = P(-0.44, 0.2, 0.3), ex = [ld[0] * -0.4, 0, ld[1] * -0.4], ey = [0, -0.18, 0];
            enPlano(o, ex, ey, 400, 180, () => {
                const ok = placa.ok;
                g.fillStyle = ok ? '#a9b689' : '#1c1f16'; g.fillRect(0, 0, 400, 180);
                g.strokeStyle = '#a9b689'; g.lineWidth = 6; g.strokeRect(3, 3, 394, 174);
                for (const [x, y] of [[18, 18], [382, 18], [18, 162], [382, 162]]) { g.beginPath(); g.arc(x, y, 6, 0, 7); g.fillStyle = ok ? '#4b5320' : '#a9b689'; g.fill(); }
                g.fillStyle = ok ? '#0b0c09' : '#a9b689'; g.textAlign = 'center';
                g.font = '800 30px Geist, sans-serif'; g.fillText('SESSION MANAGER', 200, 54);
                g.font = '900 54px Geist, monospace'; g.fillText(placa.txt || '· · · · · ·', 200, 118);
                g.font = '700 24px Geist, sans-serif'; g.fillText(T(ok ? '✓ VINCULADO' : 'pega tu código'), 200, 158);
            });
        }
    }
    // Lámpara colgada sobre quien está listo, y su luz en la mesa
    function lampara(a: Pt, p: number) {
        if (!X.listos[p] || cam.pitch > 1.2) return;
        const { fw } = ejes(a), cu = base(a, p);
        const L = proy(cu.x + fw[0] * 0.5, 1.45, cu.z + fw[1] * 0.5), cuerda = proy(cu.x + fw[0] * 0.5, 3, cu.z + fw[1] * 0.5);
        const suelo = proy(cu.x + fw[0] * 0.75, 0, cu.z + fw[1] * 0.75);
        if (L[2] < 0.2 || suelo[2] < 0.2) return;
        g.save(); g.globalCompositeOperation = 'lighter';
        const rr = 1.1 * foco / suelo[2], lu = g.createRadialGradient(suelo[0], suelo[1], 0, suelo[0], suelo[1], rr);
        lu.addColorStop(0, 'rgba(233,230,190,0.14)'); lu.addColorStop(1, 'rgba(233,230,190,0)');
        g.fillStyle = lu; g.beginPath(); g.ellipse(suelo[0], suelo[1], rr, rr * 0.45, 0, 0, 7); g.fill();
        const rl = 0.22 * foco / L[2], gl = g.createRadialGradient(L[0], L[1], 0, L[0], L[1], rl);
        gl.addColorStop(0, 'rgba(255,250,220,0.95)'); gl.addColorStop(1, 'rgba(255,250,220,0)');
        g.fillStyle = gl; g.beginPath(); g.arc(L[0], L[1], rl, 0, 7); g.fill();
        g.restore();
        g.strokeStyle = 'rgba(169,182,137,0.5)'; g.lineWidth = 1.2 * devicePixelRatio;
        g.beginPath(); g.moveTo(cuerda[0], cuerda[1]); g.lineTo(L[0], L[1]); g.stroke();
        const sh = 0.09 * foco / L[2];
        g.fillStyle = '#0e0e0e'; g.strokeStyle = '#a9b689';
        g.beginPath(); g.moveTo(L[0] - sh, L[1] + sh * 0.3); g.lineTo(L[0] + sh, L[1] + sh * 0.3); g.lineTo(L[0] + sh * 0.3, L[1] - sh * 0.5); g.lineTo(L[0] - sh * 0.3, L[1] - sh * 0.5); g.closePath(); g.fill(); g.stroke();
    }
    // Mosaico: cartas que vuelan del centro y forman una figura vista desde arriba
    function mosaico() {
        const M = X.mosaico; if (!M) return;
        if (M.salen && reloj > M.salen + 0.5) { X.mosaico = null; return; }
        const s = M.s;
        for (const [i, k] of M.celdas.entries()) {
            const dl = Math.hypot(k.x, k.z) * 0.5 + (i % 7) * 0.012, u = suave(M.t0 + dl, M.t0 + dl + 0.55, reloj);
            if (u <= 0) continue;
            const sale = M.salen ? suave(M.salen, M.salen + 0.4, reloj) : 0;
            const x = lerp(0, k.x, u) * (1 + sale * 2), z = lerp(0, k.z, u) * (1 + sale * 2);
            const lado = !M.huecos && !k.c ? s * 0.52 : s * 0.47;   // QR: las claras se solapan, sin rendijas oscuras
            quad(x, 0.02 + Math.sin(u * Math.PI) * 0.3, z, lado, lado, (1 - u) * (3 + i % 5), M.huecos ? ROJO : k.c ? '#0e0e0e' : '#e9e6da', M.huecos ? '#0e0e0e' : null);   // la cuenta atrás, en bermellón
        }
    }
    // Visor del escáner: cuatro esquinas de cartas y lo que ve la cámara en el centro
    function visor() {
        const V = X.visor; if (!V) return;
        const h = 0.42;
        const P = [[-h, -h], [h, -h], [h, h], [-h, h]].map(([x, z]) => proy(x, 0.02, z));
        if (V.video && V.video.readyState >= 2) {
            const xs = P.map(q => q[0]), ys = P.map(q => q[1]);
            g.save(); g.beginPath(); P.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.clip();
            g.globalAlpha = 0.9; g.drawImage(V.video, Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
            g.restore();
        }
        for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {   // esquinas en L de tres cartas
            quad(sx * h, 0.03, sz * h, 0.05, 0.05, 0, '#a9b689', '#0e0e0e');
            quad(sx * (h - 0.1), 0.03, sz * h, 0.05, 0.03, 0, '#a9b689', '#0e0e0e');
            quad(sx * h, 0.03, sz * (h - 0.1), 0.03, 0.05, 0, '#a9b689', '#0e0e0e');
        }
        const zz = -h + ((reloj - V.t0) * 0.5 % 1) * 2 * h, a = proy(-h, 0.03, zz), b = proy(h, 0.03, zz);
        g.strokeStyle = 'rgba(169,182,137,0.9)'; g.lineWidth = 3 * devicePixelRatio; g.shadowColor = '#a9b689'; g.shadowBlur = 14;
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.shadowBlur = 0;
    }
    // Votos para echar: cada uno lanza una carta hacia el señalado
    function votos() {
        const V = X.voto; if (!V) return;
        const obj = ASIENTOS[V.a];
        ASIENTOS.forEach((a, p) => {
            if (p === V.a || !X.ocupados[p]) return;
            const u = suave(V.t0 + p * 0.35, V.t0 + p * 0.35 + 0.5, reloj);
            if (u <= 0) return;
            const x = lerp(a.x * 0.6, obj.x * 0.62 + p * 0.04, u), z = lerp(a.z * 0.6, obj.z * 0.62 - p * 0.03, u);
            quad(x, 0.03 + Math.sin(u * Math.PI) * 0.15, z, CW_M, CH_M, u * 6 + p, '#a9b689', '#0e0e0e');
        });
    }

    function unaMesa(e: number) {
        // Quien queda detrás del centro se dibuja antes que la mesa: la mesa le tapa las piernas
        const dc = proy(0, 0, 0)[2];
        const gente = ASIENTOS.map((a, p) => estadoDe(a, p)).sort((x, y) => y.d - x.d);
        for (const q of gente) if (q.d > dc) figura(q, e);
        // Mesa maciza: canto de 9 cm (de lado se ve que tiene grosor) y tablero opaco con luz de lámpara
        const c0 = proy(0, 0, 0), GR = 0.09;
        const aro = (y: number, i: number) => { const a = i / 64 * Math.PI * 2; return proy(Math.cos(a) * 1.7, y, Math.sin(a) * 1.2); };
        if (cam.pitch < 1.3) {
            g.beginPath();
            for (let i = 0; i <= 64; i++) { const [x, y] = aro(0, i); i ? g.lineTo(x, y) : g.moveTo(x, y); }
            for (let i = 64; i >= 0; i--) { const [x, y] = aro(-GR, i); g.lineTo(x, y); }
            g.fillStyle = '#070806'; g.fill();
            g.beginPath();
            for (let i = 0; i <= 64; i++) { const [x, y] = aro(-GR, i); i ? g.lineTo(x, y) : g.moveTo(x, y); }
            g.strokeStyle = 'rgba(0, 0, 0, 0.9)'; g.lineWidth = 3 * devicePixelRatio; g.stroke();
        }
        const grad = g.createRadialGradient(c0[0], c0[1], 0, c0[0], c0[1], cv.height * 0.5);
        grad.addColorStop(0, '#2b3121'); grad.addColorStop(0.6, '#181c13'); grad.addColorStop(1, '#10120d');
        g.beginPath();
        for (let i = 0; i <= 64; i++) { const [x, y] = aro(0, i); i ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.fillStyle = grad; g.fill();
        g.strokeStyle = 'rgba(169, 182, 137, 0.55)'; g.lineWidth = 2 * devicePixelRatio; g.stroke();

        // Centro: 4 a 6 cartas boca arriba, esparcidas (cuántas, según la altura de la partida)
        let n = 5;
        for (const a of ACC) { if (a.t > t) break; n += a.toma ? -1 : 1; n = Math.max(4, Math.min(6, n)); }
        for (let i = 0; i < n; i++) {
            const an = i / n * Math.PI * 2 + 0.4, r = i % 2 ? 0.36 : 0.24;
            quad(Math.cos(an) * r, 0.004, Math.sin(an) * r * 0.8, CW_M, CH_M, an * 1.7, '#e9e6da', '#4b5320');
        }
        // Y las nuestras: las cartas del menú que caen al centro, encima de las demás
        if (principal) for (const q of nuestras) quad(q.x, 0.012, q.z, CW_M, CH_M, q.rot, q.dorso ? '#4b5320' : '#0e0e0e', '#a9b689');
        // Delante de cada jugador, sus 6 sets de 4 cartas boca abajo; el que mira, en salvia
        // Una a una a propósito: juntarlas en un solo trazo (no convexo) era más lento en la GPU.
        for (const [p, a] of ASIENTOS.entries()) {
            const m = Math.hypot(a.x, a.z), tg = [-a.z / m, a.x / m];
            const actual = Math.floor(t / 7 + p * 2) % 6;
            for (let j = 0; j < 6; j++) {
                const o = (j - 2.5) * 0.19, x = a.x * 0.66 + tg[0] * o, z = a.z * 0.66 + tg[1] * o;
                for (let c = 0; c < 4; c++) quad(x, 0.004 + c * 0.008, z, 0.04, 0.056, a.a + Math.PI / 2 + (c - 1.5) * 0.06, j === actual && c === 3 ? '#a9b689' : '#4b5320', 'rgba(14,14,14,0.9)');
            }
        }

        if (principal) {
            // Dónde va el dial de Elo de cada uno: delante de su pecho, casi pegado a la mesa
            ASIENTOS.forEach((a, p) => {
                const cu = base(a, p), { fw } = ejes(a), q = proy(cu.x + fw[0] * 0.55, 0.12, cu.z + fw[1] * 0.55);
                X.anclas[p] = { x: q[0] / devicePixelRatio, y: q[1] / devicePixelRatio, s: Math.min(1.0, Math.max(0.35, 2.0 / q[2])),
                    ok: q[2] > 0.4 && cam.pitch < 1.2 && X.ocupados[p] && X.apagon < 0.5 };
            });
            mosaico(); visor(); votos();
        }
        ASIENTOS.forEach((a, p) => lampara(a, p));
        // Quien queda delante; luego las cartas en sus manos o en vuelo, encima de todo
        for (const q of gente) if (q.d <= dc) figura(q, e);
        for (const c of enMano) quad(c.x, c.y, c.z, CW_M, CH_M, c.rot, '#4b5320', '#a9b689');
        enMano.length = 0;
        if (principal && disputa > 0.01 && X.ocupados[1] && cam.pitch < 1.2) pelea(disputa, e);
    }

    // ¿Está jugando ahora? (la jugada más cercana de esta persona en la línea de tiempo)
    // Lanza la carta como una apuesta de póker. Columnas de la hoja: 0-5 la recoge junto al
    // pecho (lento), 6-11 golpe de muñeca (acelera hasta soltarla en ac.t), 20-23 vuelve directo
    // al reposo. La carta sale de entre sus dedos y vuela sola, girando, al centro.
    function estadoDe(a: Asiento, p: number) {
        let col = -1, carta: Carta | null = null;   // carta: { en mano } o { vuela: u, giro }
        if (!quietos && !(p < 2 && disputa > 0.05)) for (const ac of ACC) {   // en la disputa, los dos no lanzan
            if (ac.p !== p || t < ac.t - 0.9 || t > ac.t + 0.8) continue;
            if (t < ac.t) {
                const s = (t - (ac.t - 0.9)) / 0.9;
                col = s < 0.6 ? Math.round(5 * suave(0, 1, s / 0.6)) : 6 + Math.round(5 * ((s - 0.6) / 0.4) ** 2);
                carta = { mano: true };
            } else {
                const r = (t - ac.t) / 0.8;
                col = r < 0.12 ? 11 : 20 + Math.min(3, Math.floor((r - 0.12) / 0.88 * 4));
                if (t < ac.t + 0.6) carta = { vuela: suave(ac.t, ac.t + 0.6, t), giro: ac.giro };
            }
        }
        return { a, p, col, carta, d: proy(a.x, 0.6, a.z)[2] };
    }
    function figura(q: ReturnType<typeof estadoDe>, e: number) {
        // El 0 gana: alza la carta. El 1 se queda en reposo, echado hacia la carta.
        const victoria = q.p === 0 && e >= 0 ? suave(0.12, 0.8, e) : -1;
        // Vista desde arriba (QR, cuenta atrás): las figuras son recortes, se desvanecen
        const arriba = 1 - suave(1.0, 1.3, cam.pitch);
        if (arriba < 0.02) return;
        g.globalAlpha = arriba;
        if (!X.ocupados[q.p]) silla(q.a, q.p, arriba);
        else {
            // Recién sentado (bot): parpadea medio segundo
            if (reloj - X.llegada[q.p] < 0.6 && Math.random() < 0.5) { g.globalAlpha = 1; return; }
            silueta(q.a, q.p, q.col, victoria, q.carta);
            if (principal) deLaSilla(q.a, q.p);   // encima: la placa del respaldo y la medalla
        }
        g.globalAlpha = 1;
    }

    // Partículas en pantalla: chispas con estela, anillos de onda
    function particulas(dt: number) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.lineCap = 'round';
        chispas = chispas.filter(c => (c.vida -= dt) > 0);
        for (const c of chispas) {
            c.vy += 900 * devicePixelRatio * dt * c.peso;
            c.x += c.vx * dt; c.y += c.vy * dt;
            c.vx *= 1 - 1.8 * dt; c.vy *= 1 - 1.8 * dt;
            const k = c.vida / c.total;
            g.strokeStyle = c.color.replace('A', (0.9 * k).toFixed(2));
            g.lineWidth = c.ancho * (0.4 + k);
            g.beginPath(); g.moveTo(c.x, c.y); g.lineTo(c.x - c.vx * 0.045, c.y - c.vy * 0.045); g.stroke();
        }
        anillos = anillos.filter(r => (r.vida -= dt) > 0);
        for (const r of anillos) {
            const k = 1 - r.vida / r.total;
            g.strokeStyle = `rgba(169, 182, 137, ${(1 - k) * 0.9})`;
            g.lineWidth = (10 - 8 * k) * devicePixelRatio;
            g.beginPath(); g.ellipse(r.x, r.y, r.radio * k, r.radio * k * 0.55, 0, 0, Math.PI * 2); g.stroke();
        }
        g.restore();
    }
    function chispa(x: number, y: number, fuerza: number, peso = 1) {
        const an = Math.random() * Math.PI * 2, v = fuerza * (0.3 + Math.random()) * devicePixelRatio;
        const vida = 0.4 + Math.random() * 0.7;
        chispas.push({ x, y, vx: Math.cos(an) * v, vy: Math.sin(an) * v - fuerza * 0.4 * devicePixelRatio, vida, total: vida, peso,
            ancho: (1.5 + Math.random() * 3) * devicePixelRatio,
            color: Math.random() < 0.45 ? 'rgba(232, 64, 42, A)' : Math.random() < 0.6 ? 'rgba(169, 182, 137, A)' : 'rgba(233, 230, 218, A)' });
    }

    // «¡A JUGAR!»: dos manos agarran la misma carta y tiran, cada una hacia su lado.
    // Al empezar la partida (e ≥ 0) la del asiento 0 la arranca y la alza, estilo duelo.
    function pelea(k: number, e: number) {
        const A = ASIENTOS[0], B = ASIENTOS[1];
        const ab = [B.x - A.x, B.z - A.z], nab = Math.hypot(...ab);
        let tira = Math.sin(reloj * 2.6) * 0.7 + Math.sin(reloj * 7.3) * 0.3;   // -1..1: quién gana ahora
        if (e >= 0) tira = lerp(tira, -1.6, suave(0, 0.15, e));                // tirón final hacia el 0
        const mesa = { x: DIS.x + ab[0] / nab * tira * 0.05, z: DIS.z + ab[1] / nab * tira * 0.05 };
        const vuelo = e >= 0 ? suave(0.15, 0.85, e) : 0;
        if (vuelo === 0) quad(mesa.x, 0.03, mesa.z, CW_M, CH_M, 0.5 + tira * 0.12, '#a9b689', '#0e0e0e');
        else cartaAlzada(mesa, A, vuelo, e);
        for (const S of [A, B]) {
            if (S === A && e > 0.15) continue;   // su brazo ya lo lleva la figura, alzado
            if (S === B && e >= 0) k = disputa * (1 - suave(0.12, 0.3, e));
            // El brazo del lado de la carta: hombro, codo abierto hacia fuera, mano sobre su borde
            const m = Math.hypot(S.x, S.z), u = [S.x / m, S.z / m], perp = [-u[1], u[0]];
            const lado = Math.sign((mesa.x - S.x) * perp[0] + (mesa.z - S.z) * perp[1]) || 1;
            const cu = base(S, S === A ? 0 : 1);
            const hom = { x: cu.x - u[0] * 0.05 + perp[0] * 0.2 * lado, y: 0.42, z: cu.z - u[1] * 0.05 + perp[1] * 0.2 * lado };
            const reposo = { x: S.x * 0.8 + perp[0] * 0.15 * lado, y: 0.06, z: S.z * 0.8 + perp[1] * 0.15 * lado };
            const fin = { x: mesa.x + u[0] * 0.1, y: 0.05, z: mesa.z + u[1] * 0.1 };
            const kk = suave(0, 0.3, k);   // la mano llega antes que el cuerpo se incline
            const mano = { x: lerp(reposo.x, fin.x, kk), y: lerp(reposo.y, fin.y, kk) + Math.sin(kk * Math.PI) * 0.15, z: lerp(reposo.z, fin.z, kk) };
            const tirando = (S === A ? -tira : tira) > 0.2;
            brazo(hom, mano, kk < 0.85 ? 0 : tirando ? 2 : 1, [perp[0] * lado, perp[1] * lado]);
        }
    }

    // Brazo prerenderizado del mismo cuerpo MPFB (brazos.py), palma abajo y dedos estirados.
    // Hoja de 3 columnas (0 llega, 1 aprieta la carta, 2 aprieta y tira) × 16 vistas:
    // 8 azimuts cada 45° (0 = desde delante de la mano, 90 = desde fuera) a 20° y a 55° de alzada.
    // Por celda: hombro, agarre y un punto hacia fuera del hombro, en píxeles de la celda.
    const BRZ = new Image(), BC = 256, PX_M = BC / 1.1;   // ortho_scale 1.1
    const ANC = [[[136.65,74.05,137.9,149.55,101.75,74.05],[136.65,74.05,143.1,159.6,101.75,74.05],[136.65,74.05,143.55,162.8,101.75,74.05]],[[69.1,81.15,159.05,143.75,44.4,89.6],[69.1,81.15,161.1,152.75,44.4,89.6],[69.1,81.15,160.75,155.95,44.4,89.6]],[[36.05,102.55,162.0,134.5,36.05,114.45],[36.05,102.55,159.75,143.55,36.05,114.45],[36.05,102.55,158.75,146.95,36.05,114.45]],[[56.85,125.65,145.05,127.3,81.55,134.1],[56.85,125.65,139.75,137.4,81.55,134.1],[56.85,125.65,138.75,141.1,81.55,134.1]],[[119.35,136.95,118.1,126.3,154.25,136.95],[119.35,136.95,112.9,137.9,154.25,136.95],[119.35,136.95,112.45,141.75,154.25,136.95]],[[186.9,129.8,96.95,132.1,211.6,121.35],[186.9,129.8,94.9,144.7,211.6,121.35],[186.9,129.8,95.25,148.6,211.6,121.35]],[[219.95,108.45,94.0,141.3,219.95,96.5],[219.95,108.45,96.25,153.9,219.95,96.5],[219.95,108.45,97.25,157.6,219.95,96.5]],[[199.15,85.35,110.95,148.5,174.45,76.9],[199.15,85.35,116.25,160.05,174.45,76.9],[199.15,85.35,117.25,163.5,174.45,76.9]],[[136.65,38.9,137.9,161.9,101.75,38.9],[136.65,38.9,143.1,166.65,101.75,38.9],[136.65,38.9,143.55,168.0,101.75,38.9]],[[69.1,56.0,159.05,148.0,44.4,76.2],[69.1,56.0,161.1,150.3,44.4,76.2],[69.1,56.0,160.75,151.65,44.4,76.2]],[[36.05,107.2,162.0,125.95,36.05,135.8],[36.05,107.2,159.75,128.3,36.05,135.8],[36.05,107.2,158.75,130.1,36.05,135.8]],[[56.85,162.5,145.05,108.6,81.55,182.75],[56.85,162.5,139.75,113.55,81.55,182.75],[56.85,162.5,138.75,116.0,81.55,182.75]],[[119.35,189.6,118.1,106.2,154.25,189.6],[119.35,189.6,112.9,114.65,154.25,189.6],[119.35,189.6,112.45,117.65,154.25,189.6]],[[186.9,172.55,96.95,120.1,211.6,152.3],[186.9,172.55,94.9,131.0,211.6,152.3],[186.9,172.55,95.25,134.0,211.6,152.3]],[[219.95,121.35,94.0,142.15,219.95,92.75],[219.95,121.35,96.25,153.0,219.95,92.75],[219.95,121.35,97.25,155.55,219.95,92.75]],[[199.15,66.0,110.95,159.45,174.45,45.75],[199.15,66.0,116.25,167.75,174.45,45.75],[199.15,66.0,117.25,169.65,174.45,45.75]]];
    BRZ.src = '/mesa/brazos.webp';
    // fuera: dirección (x, z) del cuerpo hacia ese hombro. Con ella se elige la vista y,
    // si el brazo es el izquierdo, se dibuja en espejo.
    function brazo(H: P3, M: P3, col: number, fuera: number[]) {
        if (!BRZ.complete) return;
        const S = proy(H.x, H.y, H.z), P = proy(M.x, M.y, M.z);
        if (S[2] < 0.15 || P[2] < 0.15) return;
        let fx = M.x - H.x, fz = M.z - H.z; const nf = Math.hypot(fx, fz) || 1; fx /= nf; fz /= nf;
        const cx = C[0] - (H.x + M.x) / 2, cy = C[1] - (H.y + M.y) / 2, cz = C[2] - (H.z + M.z) / 2;
        const fc = cx * fx + cz * fz, oc = cx * fuera[0] + cz * fuera[1];
        const az = ((Math.round(Math.atan2(oc, fc) / (Math.PI / 4)) % 8) + 8) % 8;
        const fila = (Math.atan2(cy, Math.hypot(fc, oc)) > 0.65 ? 8 : 0) + az;
        const [hx, hy, ax, ay, ox, oy] = ANC[fila][col];
        const sx = ax - hx, sy = ay - hy, dx = P[0] - S[0], dy = P[1] - S[1];
        // ¿El codo cae del mismo lado en pantalla que en la celda? Si no, es el otro brazo: espejo
        const O = proy(H.x + fuera[0] * 0.15, H.y, H.z + fuera[1] * 0.15);
        const lado = (a: number, b: number, c: number, d: number) => Math.sign(a * d - b * c);
        const espejo = lado(dx, dy, O[0] - S[0], O[1] - S[1]) !== lado(sx, sy, ox - hx, oy - hy);
        const largo = Math.hypot(dx, dy) / (Math.hypot(sx, sy) || 1);
        const ancho = foco / ((S[2] + P[2]) / 2) / PX_M;
        g.save();
        g.translate(S[0], S[1]);
        g.rotate(Math.atan2(dy, dx));
        g.scale(largo, espejo ? -ancho : ancho);   // a lo largo llega a la mano; de ancho, perspectiva
        g.rotate(-Math.atan2(sy, sx));
        g.drawImage(BRZ, col * BC, fila * BC, BC, BC, -hx, -hy, BC, BC);
        g.restore();
    }

    // La carta ganada: sale de la mesa girando, crece y queda en alto brillando
    function cartaAlzada(mesa: Pt, A: Pt, u: number, e: number) {
        const n = Math.hypot(A.x, A.z), fw = [-A.x / n, -A.z / n];
        const alto = { x: A.x * 0.98 + fw[0] * 0.33, y: 1.3, z: A.z * 0.98 + fw[1] * 0.33 };
        const pos = proy(lerp(mesa.x, alto.x, u), lerp(0.03, alto.y, u) + Math.sin(u * Math.PI) * 0.45, lerp(mesa.z, alto.z, u));
        if (pos[2] < 0.1) return;
        if (!estalló) {   // el arranque: estallido y onda
            estalló = true;
            for (let i = 0; i < 90; i++) chispa(pos[0], pos[1], 700, 0.6);
            anillos.push({ x: pos[0], y: pos[1], radio: cv.width * 0.6, vida: 0.6, total: 0.6 });
        }
        const h = 0.26 * foco / pos[2] * (1 + 0.7 * Math.sin(u * Math.PI)), w = h * 0.7;
        if (u < 1) for (let i = 0; i < 3; i++) chispa(pos[0], pos[1], 120, 0.2);   // estela
        g.save();
        g.translate(pos[0], pos[1]);
        if (u >= 1) {   // en alto: rayos que giran detrás, como al robar la carta decisiva
            g.globalCompositeOperation = 'lighter';
            const pulso = 0.6 + 0.4 * Math.sin(reloj * 6);
            for (let i = 0; i < 14; i++) {
                const an = i / 14 * Math.PI * 2 + reloj * 0.8, l = h * (2.2 + (i % 3) * 0.6) * pulso;
                g.strokeStyle = `rgba(232, 64, 42, ${0.3 * pulso})`; g.lineWidth = h * 0.08;   // rayos bermellón: alguien ganó
                g.beginPath(); g.moveTo(Math.cos(an) * h * 0.6, Math.sin(an) * h * 0.6); g.lineTo(Math.cos(an) * l, Math.sin(an) * l); g.stroke();
            }
            if (Math.random() < 0.4) chispa(pos[0], pos[1], 260, 0.3);
            g.globalCompositeOperation = 'source-over';
        }
        g.rotate((1 - u) ** 2 * Math.PI * 5 - cam.roll);
        g.shadowColor = ROJO; g.shadowBlur = (10 + 40 * u) * devicePixelRatio;
        g.fillStyle = '#e9e6da';
        g.beginPath(); g.moveTo(-w / 2 + w * 0.04, -h / 2); g.lineTo(w / 2, -h / 2 - h * 0.01); g.lineTo(w / 2 - w * 0.04, h / 2); g.lineTo(-w / 2, h / 2 + h * 0.01); g.closePath();
        g.fill();
        g.shadowBlur = 0;
        g.strokeStyle = '#4b5320'; g.lineWidth = w * 0.06; g.stroke();
        g.restore();
    }

    // Figuras prerenderizadas en 3D (cuerpo MPFB alargado, en silla, sombreado en dos tonos):
    // 4 vistas × 20 columnas. Fila por el ángulo de la cámara respecto a hacia dónde mira la
    // persona. Columnas 0-11: cuánto estira el brazo (rebobinar la partida rebobina el gesto);
    // 12-19: gana la carta y la alza.
    const SIL = new Image(), CW = 240, CH = 384;
    const MANOS = [[[87.6,242.0],[89.7,232.2],[91.5,222.5],[93.0,213.0],[94.2,203.9],[95.2,195.4],[99.0,201.3],[101.0,221.0],[106.9,229.0],[110.7,233.7],[112.7,236.2],[113.4,237.0],[109.0,231.3],[100.5,131.9],[94.4,95.5],[91.1,85.7],[89.2,82.4],[88.2,81.3],[87.8,80.9],[87.8,80.9],[109.3,239.2],[98.5,244.6],[91.3,243.7],[87.6,242.0]],[[152.4,235.6],[150.3,225.4],[148.5,215.5],[147.0,205.9],[145.8,196.8],[144.8,188.4],[141.0,192.8],[139.0,211.2],[133.1,219.4],[129.3,224.5],[127.3,227.2],[126.6,228.2],[131.0,220.5],[139.5,124.3],[145.6,92.9],[148.9,85.9],[150.8,84.2],[151.8,83.8],[152.2,83.7],[152.2,83.7],[130.7,230.3],[141.5,236.0],[148.7,236.2],[152.4,235.6]],[[160.7,241.2],[162.7,231.1],[164.0,221.1],[164.5,211.4],[164.4,202.2],[163.7,193.7],[173.1,198.5],[181.7,217.4],[180.1,225.0],[177.7,229.6],[176.0,232.1],[175.7,232.9],[187.5,226.5],[167.1,129.4],[135.5,96.2],[118.0,88.1],[108.5,85.8],[103.8,85.1],[102.1,85.0],[101.8,84.9],[175.6,235.4],[173.8,241.8],[166.9,242.0],[160.7,241.2]],[[79.3,236.0],[77.3,226.2],[76.0,216.5],[75.5,207.1],[75.6,198.1],[76.3,189.7],[66.9,195.1],[58.3,214.4],[59.9,222.9],[62.3,228.2],[64.0,230.9],[64.3,231.9],[52.5,224.7],[72.9,126.3],[104.5,92.1],[122.0,83.5],[131.5,80.9],[136.2,80.1],[137.9,79.8],[138.2,79.8],[64.4,233.7],[66.2,238.4],[73.1,237.5],[79.3,236.0]]];   // [vista][columna]: la carta entre los dedos, px de celda (siluetas.py)
    const enMano: (P3 & { rot: number })[] = [];
    const ALTO = 3.15, CENTRO = 0.39;   // alto del cuadro y altura de su centro, en unidades de la mesa
    let borde: HTMLCanvasElement | null = null, bordeRojo: HTMLCanvasElement | null = null;   // la misma hoja teñida: borde de luz salvia, y bermellón para ti
    const tenir = (color: string) => {
        const c = document.createElement('canvas'); c.width = SIL.width; c.height = SIL.height;
        const b = c.getContext('2d')!; b.drawImage(SIL, 0, 0);
        b.globalCompositeOperation = 'source-in'; b.fillStyle = color; b.fillRect(0, 0, c.width, c.height);
        return c;
    };
    SIL.onload = () => { borde = tenir('#a9b689'); bordeRojo = tenir(ROJO); };
    SIL.src = '/mesa/siluetas.webp';
    // ponytail: nombres de ejemplo; en Piles vendrán del top global (aún no hay endpoint que lo liste)
    const TOP = ['Ana', 'Beto', 'Coca', 'Dani'];
    // Punto del mundo que cae en (X, Y) de pantalla a la profundidad d (inverso de proy)
    function desproy(X: number, Y: number, d: number): P3 {
        const ux = X - cv.width / 2, uy = cv.height * cam.cy - Y, cr = Math.cos(cam.roll), sr = Math.sin(cam.roll);
        const px = (ux * cr + uy * sr) * d / foco, py = (-ux * sr + uy * cr) * d / foco;
        return { x: C[0] + F[0] * d + R[0] * px + U[0] * py - OX, y: C[1] + F[1] * d + R[1] * px + U[1] * py, z: C[2] + F[2] * d + R[2] * px + U[2] * py - OZ };
    }
    function silueta(a: Asiento, p: number, col: number, victoria = -1, carta: Carta | null = null) {
        if (!borde) return;
        const n = Math.hypot(a.x, a.z), fw = [-a.x / n, -a.z / n], ld = [fw[1], -fw[0]];
        // El centro del cuadro está 0,3 por delante del cuerpo (hacia la mesa)
        const cu = base(a, p), px = cu.x + fw[0] * 0.3, pz = cu.z + fw[1] * 0.3;
        const tc = [C[0] - px, C[2] - pz], nc = Math.hypot(...tc);
        const fr = (tc[0] * fw[0] + tc[1] * fw[1]) / nc, sd = (tc[0] * ld[0] + tc[1] * ld[1]) / nc;
        const fila = Math.abs(fr) >= Math.abs(sd) ? (fr > 0 ? 0 : 1) : (sd < 0 ? 2 : 3);
        // Vivas aunque no jueguen: respiran, se mecen y a ratos acercan la mano a la mesa
        const vivo = tv + p * 1.7;
        const amago = 0.14 * Math.max(0, Math.sin(vivo * 0.7)) ** 3;
        if (victoria >= 0) col = 12 + Math.round(victoria * 7);
        else if (col < 0) col = Math.round(amago * 11);
        const alcance = col >= 0 && col < 12 ? col / 11 : 0;
        const c = proy(px, CENTRO, pz), hpx = ALTO * foco / c[2], wpx = hpx * CW / CH;
        if (c[2] < 0.5) return;   // pegada a la cámara: no se dibuja
        // De lado, el brazo tiene que estirarse hacia la mesa en pantalla
        const haciaMesa = Math.sign(proy(0, 0, 0)[0] - c[0]) || 1;
        const voltea = fila >= 2 && haciaMesa !== (fila === 3 ? -1 : 1);
        g.save();
        g.translate(c[0], c[1] + hpx / 2);
        g.globalAlpha *= Math.min(1, (c[2] - 0.5) / 0.5);
        // Burla: tu figura se sacude y da un salto
        const bu = p === 0 && principal ? Math.max(0, 1 - (reloj - X.burla) / 1.2) : 0;
        if (bu > 0) g.translate(0, -Math.abs(Math.sin(reloj * 14)) * hpx * 0.05 * bu);
        g.rotate(-cam.roll + 0.03 * Math.sin(vivo * 0.55) + 0.05 * alcance * haciaMesa + 0.18 * bu * Math.sin(reloj * 24));
        g.scale(voltea ? -1 : 1, 1 + 0.014 * Math.sin(vivo * 1.6));
        // Contorno: tú (o a quien se señala), en bermellón y más grueso; los demás, luz salvia
        // (pegada a la cámara se desvanece: ahí sin contorno, o el rojo se vería a través)
        const rojo = principal && (p === X.tu || p === X.marca) && c[2] > 1;
        const r = (rojo ? 3.5 : 1.5) * devicePixelRatio, alfa = g.globalAlpha;
        g.globalAlpha = (rojo ? 1 : 0.6) * alfa;
        g.drawImage(rojo ? bordeRojo ?? borde : borde, col * CW, fila * CH, CW, CH, -wpx / 2 - r, -hpx - r, wpx + 2 * r, hpx + 2 * r);
        g.globalAlpha = alfa;
        g.drawImage(SIL, col * CW, fila * CH, CW, CH, -wpx / 2, -hpx, wpx, hpx);
        g.restore();
        // La carta, entre sus dedos (el punto de la hoja que da brazos-siluetas): en la mano,
        // o desde donde la soltó (columna 11) volando al centro
        if (carta) {
            const ang = -cam.roll + 0.03 * Math.sin(vivo * 0.55) + 0.05 * alcance * haciaMesa;
            const sy = 1 + 0.014 * Math.sin(vivo * 1.6), ca = Math.cos(ang), sa = Math.sin(ang);
            const dedos = (k: number) => {
                const [hx, hy] = MANOS[fila][k];
                const lx = (-wpx / 2 + hx / CW * wpx) * (voltea ? -1 : 1), ly = (-hpx + hy / CH * hpx) * sy;
                return desproy(c[0] + lx * ca - ly * sa, c[1] + hpx / 2 + lx * sa + ly * ca, c[2]);
            };
            if (carta.mano) enMano.push({ ...dedos(col), rot: a.a + Math.PI / 2 });
            else {
                const u = carta.vuela ?? 0, giro = carta.giro ?? 0, s = dedos(11), dx = Math.sin(giro) * 0.15, dz = Math.cos(giro) * 0.1;
                enMano.push({ x: lerp(s.x, dx, u), y: lerp(s.y, 0.01, u) + Math.sin(u * Math.PI) * 0.1, z: lerp(s.z, dz, u),
                    rot: a.a + Math.PI / 2 + u * (3 + giro * 6) });
            }
        }
        // Nombre encima de la cabeza (solo en nuestra mesa)
        if (!principal) return;
        const tx = proy(cu.x, 1.1, cu.z);
        g.font = `800 ${Math.max(11 * devicePixelRatio, Math.min(16 * devicePixelRatio, hpx * 0.06))}px Geist, sans-serif`;
        g.textAlign = 'center';
        g.fillStyle = p === X.tu ? ROJO : 'rgba(169, 182, 137, 0.9)';
        g.fillText(X.nombres ? X.nombres[p].toUpperCase() : `#${p + 1} ${TOP[p].toUpperCase()}`, tx[0], tx[1]);
    }

    let antes = 0, asomo: { cam: Cam | null; p: number; dt: number } = { cam: null, p: 0, dt: 0 }, tAsomo = 0;
    function cuadro(ms: number) {
        const dt = Math.min(0.05, (ms - antes) / 1000 || 0); antes = ms;
        vel += (velMeta - vel) * Math.min(1, dt * 2.5);
        tv += dt * vel / RAPIDO;
        tMeta += dt * vel;
        t += (tMeta - t) * Math.min(1, dt * 1.6) + dt * vel * 0.2;
        // Mientras el dedo arrastra, la cámara va hacia la del menú siguiente en proporción (asomo.p)
        for (const k of ['yaw', 'pitch', 'dist', 'cy', 'roll', 'mx', 'mz', 'my'] as const) {
            const obj = asomo.cam ? lerp(meta[k], asomo.cam[k], asomo.p) : meta[k];
            cam[k] += (obj - cam[k]) * Math.min(1, dt * (asomo.cam ? 6 : 1.9));
        }
        const dA = ((asomo.cam ? asomo.p * asomo.dt : 0) - tAsomo) * Math.min(1, dt * 6);   // y la partida se adelanta (o rebobina) un poco
        tAsomo += dA; t += dA;
        disputa += (disputaMeta - disputa) * Math.min(1, dt * 1.2);
        reloj = ms / 1000;
        // En Piles, durante la partida la escena está oculta: no se dibuja (era ~20 % del hilo
        // principal sin que nadie lo viera). En la entrada a la partida sí, que se ve.
        const cl = document.body.classList;
        if (!cl.contains('en-partida') || cl.contains('entrando')) dibujar(dt);
        requestAnimationFrame(cuadro);
    }
    function medir() { cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; }
    addEventListener('resize', medir);
    medir();
    requestAnimationFrame(cuadro);
    let prof = 0;
    // De la mesa a la pantalla (px CSS) con la cámara a la que se va, no la de este instante:
    // las cartas del DOM vuelan a donde estará ese punto cuando lleguen.
    function aPantalla(x: number, z: number) {
        const ahora = cam; cam = meta; preparar();
        const [sx, sy, d] = proy(x, 0.012, z);
        const s = Math.min(1.3, Math.max(0.05, 2 * CW_M * foco / d / devicePixelRatio / 128));
        cam = ahora; preparar();
        return { x: sx / devicePixelRatio, y: sy / devicePixelRatio, s };
    }
    return {
        /** Dónde está el centro de la mesa en pantalla, y a qué escala se ve allí una carta. */
        centro: () => aPantalla(0, 0),
        /** Un hueco en el centro para soltar una carta: a dónde volar y cómo dejarla puesta. */
        soltar(dorso = false) {
            const an = Math.random() * Math.PI * 2, r = 0.1 + Math.random() * 0.35;
            const q = { x: Math.cos(an) * r, z: Math.sin(an) * r * 0.8, rot: Math.random() * Math.PI, dorso };
            return { ...aPantalla(q.x, q.z), poner() { nuestras.push(q); nuestras = nuestras.slice(-6); } };
        },
        X, ELO_TOP, RANGOS, MINS,
        /** Una figura con cartas, vista desde arriba: matriz de booleanos (oscuro = true). */
        mosaico(matriz: boolean[][] | null, s = 0, huecos = false) {   // null: las cartas se van   // huecos: los false no llevan carta (letras); si no, carta clara (QR)
            if (!matriz) { if (X.mosaico) X.mosaico.salen = reloj; return; }
            const n = matriz.length, m = matriz[0].length, celdas: { x: number; z: number; c: boolean }[] = [];
            for (let r = 0; r < n; r++) for (let c = 0; c < m; c++) if (!huecos || matriz[r][c]) celdas.push({ x: (c - (m - 1) / 2) * s, z: (r - (n - 1) / 2) * s, c: matriz[r][c] });
            if (!huecos) celdas.sort((a, b) => Number(a.c) - Number(b.c));   // QR: primero las claras, encima las oscuras
            X.mosaico = { celdas, s, t0: reloj, huecos };
        },
        /** Solo una cámara (sin cambiar de profundidad ni de partida). */
        camara(nombre: string) { actual = nombre; meta = { ...CAMS[nombre] }; if (nombre === 'cuenta' || nombre === 'qr' || nombre === 'visor') disputaMeta = 0; },
        /** De cerca a un asiento, desde el centro de la mesa (votar para echar). */
        aAsiento(p: number) {
            const a = ASIENTOS[p];
            meta = { yaw: Math.atan2(-a.x, -a.z), pitch: 0.3, dist: 1.9, cy: 0.42, roll: 0.12, mx: a.x * 0.85, mz: a.z * 0.85, my: 0.4 };
            disputaMeta = 0;
        },
        /** La cámara vuela a la mesa i de las otras salas (o a la nuestra con -1). */
        aMesa(i: number) {
            const m = X.mesas?.[i];
            meta = m ? { yaw: Math.atan2(-m.x, -m.z), pitch: 0.5, dist: 3.3, cy: 0.42, roll: 0.06 * (i - 1), mx: m.x, mz: m.z, my: 0.2 } : { ...CAMS.unirse };
        },
        congelar(si: boolean) { velMeta = si ? 0 : BALA; },
        /** Todos listos: uno de los dos de la disputa arranca la carta y la alza (antes de la cuenta atrás). */
        ganar() {
            if (disputa < 0.3) return;
            gana = reloj; estalló = false;
            // La cámara se aparta y sube hacia quien la ganó, que la tiene en alto
            actual = 'ganador'; meta = { ...CAMS.ganador };
            if (cv.width < cv.height) { meta.dist = 3.2; meta.yaw = 2.85; }   // en vertical, más lejos y de frente: la carta entra entera
        },
        /** Altura en pantalla (0..1) a la que se centra una cámara: la sala la ajusta al hueco libre. */
        fijarCy(nombre: string, cy: number) { if (!CAMS[nombre]) return; CAMS[nombre].cy = cy; if (actual === nombre) meta.cy = cy; },
        /** Asomarse a otro menú sin ir: p 0..1 (el dedo); sentido 1 = adelante, -1 = atrás. null = soltar. */
        asomar(pantalla: string | null, p = 0, sentido = 1) {
            asomo = pantalla ? { cam: CAMS[pantalla] ?? CAMS.sala, p, dt: sentido * 6.5 } : { cam: null, p: 0, dt: 0 };
        },
        /** Al confirmar: lo asomado ya cuenta como hecho (ir() pone la cámara y el tiempo). */
        confirmarAsomo() { asomo = { cam: null, p: 0, dt: 0 }; tAsomo = 0; },   // t ya va adelantado: sigue a tMeta sin salto
        ahora: () => reloj,
        /** Otro menú: su cámara, y la partida avanza (o se rebobina) según la profundidad. */
        ir(pantalla: string, profundidad: number) {
            actual = CAMS[pantalla] ? pantalla : 'sala'; meta = { ...CAMS[actual] };
            disputaMeta = ['sala', 'bots', 'partida'].includes(pantalla) ? 1 : 0;
            velMeta = pantalla === 'inicio' ? RAPIDO : BALA;
            // Quien ganó la disputa ya la alzó antes de la cuenta atrás (ganar()); la partida la mantiene
            if (pantalla === 'partida') { if (gana < 0) { gana = reloj; estalló = false; } } else gana = -1;
            tMeta += (profundidad - prof) * 6.5;
            prof = profundidad;
        },
    };
})();
