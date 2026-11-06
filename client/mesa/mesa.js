// El menú en la mesa (diseno/menu-mesa/README.md). Generado por juntar.nu: se edita ui.part.js
// (la interfaz) o diseno/menu-mesa/mesa.html (la escena), no este archivo.
'use strict';
(() => {
// ── La partida de fondo: cuatro personas jugando a cámara lenta ─────────────────
// Todo sale de una línea de tiempo determinista (jugadas en `ACC`): el tiempo `t` avanza
// despacio solo y, al navegar, corre hacia delante (entrar) o hacia atrás (volver), así
// que la partida se rebobina de verdad. Cada menú tiene su cámara.
const escena = (() => {
    const cv = document.getElementById('juego'), g = cv.getContext('2d');
    // La carta que dos se disputan en «¡A JUGAR!» (entre los asientos 0 y 1)
    const DIS = { x: -0.86, z: 0.66 };   // cerca del borde, entre los dos: se alcanza sin estirar de más
    const CAMS = {   // yaw/pitch/roll en rad, distancia, centro en pantalla (0..1), punto al que mira (mx, mz)
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
    for (const c of Object.values(CAMS)) c.my ??= 0.2;   // altura del punto al que mira
    let cam = { ...CAMS.inicio }, meta = { ...CAMS.inicio }, actual = 'inicio';
    let t = 6, tMeta = 6, disputa = 0, disputaMeta = 0, reloj = 0;
    let gana = -1, chispas = [], anillos = [], estalló = false;
    let nuestras = [];   // cartas del menú soltadas en el centro de la mesa (las 6 últimas)   // la victoria: desde cuándo, y sus partículas
    // Segundos de partida por segundo real. En el inicio (con el nombre) todos juegan rápido,
    // recogiendo y lanzando; desde la primera opción elegida, tiempo bala.
    const RAPIDO = 1.5, BALA = 0.3;
    let vel = RAPIDO, velMeta = RAPIDO, tv = 0;   // tv: reloj de los gestos sueltos, al mismo ritmo
    // Dónde está el cuerpo: en la disputa, los dos se echan hacia la carta
    function base(a, p) {
        const b = { x: a.x * 0.98, z: a.z * 0.98 };
        if (p > 1 || disputa < 0.01) return b;
        const dx = DIS.x - b.x, dz = DIS.z - b.z, n = Math.hypot(dx, dz);
        return { x: b.x + dx / n * 0.45 * disputa, z: b.z + dz / n * 0.45 * disputa };
    }

    let s = 1532;   // azar con semilla: la misma partida cada vez
    const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
    const ACC = [];
    for (let k = 0; k < 1600; k++) ACC.push({ t: 1 + k * 0.75 + rnd() * 0.3, p: Math.floor(rnd() * 4), toma: rnd() < 0.5, giro: rnd() * 0.6 - 0.3 });

    const ASIENTOS = [0, 1, 2, 3].map(p => { const a = Math.PI / 2 + p * Math.PI / 2; return { x: Math.cos(a) * 1.95, z: Math.sin(a) * 1.45, a }; });
    // Medio ancho y medio alto de una carta: a escala de las manos de las figuras (6,3 × 8,8 cm)
    const CW_M = 0.05, CH_M = 0.07;
    const lerp = (a, b, k) => a + (b - a) * k;
    const ROJO = '#e8402a';   // el acento (--acento): tú, lo que se juega y quién gana
    const suave = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

    // Cámara que mira al centro de la mesa desde (yaw, pitch, dist)
    let C, R, U, F, foco;
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
    function proy(x, y, z) {
        const v = [x + OX - C[0], y - C[1], z + OZ - C[2]];
        const d = v[0] * F[0] + v[1] * F[1] + v[2] * F[2];
        const px = v[0] * R[0] + v[1] * R[1] + v[2] * R[2], py = v[0] * U[0] + v[1] * U[1] + v[2] * U[2];
        const sx = px / d * foco, sy = py / d * foco, cr = Math.cos(cam.roll), sr = Math.sin(cam.roll);   // roll: plano holandés
        return [cv.width / 2 + sx * cr - sy * sr, cv.height * cam.cy - (sx * sr + sy * cr), d];
    }
    function quad(cx, y, cz, w, h, rot, relleno, borde) {   // una carta tumbada en la mesa
        const c = Math.cos(rot), sn = Math.sin(rot);
        const p = [[-w, -h], [w, -h], [w, h], [-w, h]].map(([a, b]) => proy(cx + a * c - b * sn, y, cz + a * sn + b * c));
        if (p.some(q => q[2] < 0.08)) return;   // detrás de la cámara
        g.beginPath(); p.forEach(([x, yy], i) => (i ? g.lineTo(x, yy) : g.moveTo(x, yy))); g.closePath();
        g.fillStyle = relleno; g.fill();
        if (borde) { g.strokeStyle = borde; g.lineWidth = 1.2 * devicePixelRatio; g.stroke(); }
    }

    function dibujar(dt) {
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
        const mesas = [{ x: 0, z: 0 }, ...(X.mesas ?? [])].map(m => ({ ...m, d: proy(m.x, 0, m.z)[2] })).sort((a, b) => b.d - a.d);
        for (const m of mesas) {
            if (m.d < 0.3) continue;
            if (m.ocup) {   // otra sala
                const guarda = [t, X.ocupados]; OX = m.x; OZ = m.z; t += m.desfase; X.ocupados = m.ocup; principal = false; quietos = !m.jugando;
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
    const X = {
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
    const RANGOS = {
        fun: [['Cartón', '#b89a6e'], ['Juguete', '#ffd23f'], ['Latón', '#d9c35a'], ['Caucho', '#8a8a8a'], ['Plástico', '#4fe3d3'],
            ['Gominola', '#ff8ab8'], ['Dulce', '#ff6b7a'], ['Confeti', '#b794ff'], ['Payaso', '#ff7a70']],
        glory: [['Hierro oxidado', '#b06a38'], ['Bronce', '#d9914d'], ['Plata', '#cdd5df'], ['Oro', '#f2cb5c'], ['Platino', '#bfe3ff'],
            ['Diamante', '#8fc0ff'], ['Máster', '#ffe27a'], ['Gran máster', '#ffb8d2'], ['Top 3 global', '#ffe08a']],
    };
    const MINS = [null, 1001, 1100, 1200, 1300, 1400, 1500, 1600];   // los de agapornis-ui/rank.js
    function rango(v, pool, top3 = false) {
        let i = 0; for (let k = 1; k < MINS.length; k++) if (v >= MINS[k]) i = k;
        if (top3 && v >= 1600) i = 8;
        return RANGOS[pool][i];
    }
    // ponytail: Elo de ejemplo del top global; en Piles vendrá del mismo endpoint que los nombres
    const ELO_TOP = [{ v: 1724, pool: 'glory', top3: true }, { v: 1688, pool: 'glory', top3: true }, { v: 1651, pool: 'glory', top3: true }, { v: 1604, pool: 'glory' }];
    X.elo = ELO_TOP.map(e => ({ ...e }));

    // Polígono en 3D (lista de puntos), relleno y borde
    function poli(pts, relleno, borde, ancho = 1.2) {
        const p = pts.map(q => proy(q[0], q[1], q[2]));
        if (p.some(q => q[2] < 0.08)) return;
        g.beginPath(); p.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
        if (relleno) { g.fillStyle = relleno; g.fill(); }
        if (borde) { g.strokeStyle = borde; g.lineWidth = ancho * devicePixelRatio; g.stroke(); }
    }
    // Dibuja en un plano del mundo: origen o, ejes ex y ey (vectores 3D de largo ancho y alto);
    // fn pinta en coordenadas locales de ancho×alto px.
    function enPlano(o, ex, ey, ancho, alto, fn) {
        const P = proy(...o), A = proy(o[0] + ex[0], o[1] + ex[1], o[2] + ex[2]), B = proy(o[0] + ey[0], o[1] + ey[1], o[2] + ey[2]);
        if (P[2] < 0.1 || A[2] < 0.1 || B[2] < 0.1) return;
        g.save();
        g.transform((A[0] - P[0]) / ancho, (A[1] - P[1]) / ancho, (B[0] - P[0]) / alto, (B[1] - P[1]) / alto, P[0], P[1]);
        fn();
        g.restore();
    }
    // Ejes de un asiento: fw hacia el centro, ld de lado (en el suelo)
    function ejes(a) { const n = Math.hypot(a.x, a.z), fw = [-a.x / n, -a.z / n]; return { fw, ld: [fw[1], -fw[0]] }; }

    // La silla, con las medidas de la de las figuras (siluetas.py, ×1,5): asiento a −0,45,
    // respaldo de −0,39 a 0,57, 0,43 por detrás del centro del cuerpo
    function silla(a, p, alfa = 1) {
        const cu = base(a, p), { fw, ld } = ejes(a);
        const P = (adelante, lado, y) => [cu.x + fw[0] * adelante + ld[0] * lado, y, cu.z + fw[1] * adelante + ld[1] * lado];
        g.globalAlpha = alfa;
        for (const [f, l] of [[0.18, 0.3], [0.18, -0.3], [-0.42, 0.3], [-0.42, -0.3]]) poli([P(f, l, -1.18), P(f, l, -0.45), P(f + 0.02, l, -0.45), P(f + 0.02, l, -1.18)], '#141610', 'rgba(169,182,137,0.35)');
        poli([P(0.21, 0.35, -0.45), P(0.21, -0.35, -0.45), P(-0.45, -0.35, -0.45), P(-0.45, 0.35, -0.45)], '#1c1f16', 'rgba(169,182,137,0.6)');
        poli([P(-0.43, 0.32, -0.45), P(-0.43, -0.32, -0.45), P(-0.43, -0.32, 0.57), P(-0.43, 0.32, 0.57)], '#101209', 'rgba(169,182,137,0.6)');
        g.globalAlpha = 1;
    }
    // La placa de Session Manager, en la cara de atrás de tu respaldo
    function deLaSilla(a, p) {
        const cu = base(a, p), { fw, ld } = ejes(a);
        const P = (adelante, lado, y) => [cu.x + fw[0] * adelante + ld[0] * lado, y, cu.z + fw[1] * adelante + ld[1] * lado];
        if (p === 0 && X.placa) {   // placa en la cara de atrás de tu respaldo
            const o = P(-0.44, 0.2, 0.3), ex = [ld[0] * -0.4, 0, ld[1] * -0.4], ey = [0, -0.18, 0];
            enPlano(o, ex, ey, 400, 180, () => {
                const ok = X.placa.ok;
                g.fillStyle = ok ? '#a9b689' : '#1c1f16'; g.fillRect(0, 0, 400, 180);
                g.strokeStyle = '#a9b689'; g.lineWidth = 6; g.strokeRect(3, 3, 394, 174);
                for (const [x, y] of [[18, 18], [382, 18], [18, 162], [382, 162]]) { g.beginPath(); g.arc(x, y, 6, 0, 7); g.fillStyle = ok ? '#4b5320' : '#a9b689'; g.fill(); }
                g.fillStyle = ok ? '#0b0c09' : '#a9b689'; g.textAlign = 'center';
                g.font = '800 30px Geist, sans-serif'; g.fillText('SESSION MANAGER', 200, 54);
                g.font = '900 54px Geist, monospace'; g.fillText(X.placa.txt || '· · · · · ·', 200, 118);
                g.font = '700 24px Geist, sans-serif'; g.fillText(T(ok ? '✓ VINCULADO' : 'pega tu código'), 200, 158);
            });
        }
    }
    // Lámpara colgada sobre quien está listo, y su luz en la mesa
    function lampara(a, p) {
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
        if (V.video?.readyState >= 2) {
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

    function unaMesa(e) {
        // Quien queda detrás del centro se dibuja antes que la mesa: la mesa le tapa las piernas
        const dc = proy(0, 0, 0)[2];
        const gente = ASIENTOS.map((a, p) => estadoDe(a, p)).sort((x, y) => y.d - x.d);
        for (const q of gente) if (q.d > dc) figura(q, e);
        // Mesa maciza: canto de 9 cm (de lado se ve que tiene grosor) y tablero opaco con luz de lámpara
        const c0 = proy(0, 0, 0), GR = 0.09;
        const aro = (y, i) => { const a = i / 64 * Math.PI * 2; return proy(Math.cos(a) * 1.7, y, Math.sin(a) * 1.2); };
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
    function estadoDe(a, p) {
        let col = -1, carta = null;   // carta: { en mano } o { vuela: u, giro }
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
    function figura(q, e) {
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
    function particulas(dt) {
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
    function chispa(x, y, fuerza, peso = 1) {
        const an = Math.random() * Math.PI * 2, v = fuerza * (0.3 + Math.random()) * devicePixelRatio;
        const vida = 0.4 + Math.random() * 0.7;
        chispas.push({ x, y, vx: Math.cos(an) * v, vy: Math.sin(an) * v - fuerza * 0.4 * devicePixelRatio, vida, total: vida, peso,
            ancho: (1.5 + Math.random() * 3) * devicePixelRatio,
            color: Math.random() < 0.45 ? 'rgba(232, 64, 42, A)' : Math.random() < 0.6 ? 'rgba(169, 182, 137, A)' : 'rgba(233, 230, 218, A)' });
    }

    // «¡A JUGAR!»: dos manos agarran la misma carta y tiran, cada una hacia su lado.
    // Al empezar la partida (e ≥ 0) la del asiento 0 la arranca y la alza, estilo duelo.
    function pelea(k, e) {
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
    function brazo(H, M, col, fuera) {
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
        const lado = (a, b, c, d) => Math.sign(a * d - b * c);
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
    function cartaAlzada(mesa, A, u, e) {
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
    const enMano = [];
    const ALTO = 3.15, CENTRO = 0.39;   // alto del cuadro y altura de su centro, en unidades de la mesa
    let borde = null, bordeRojo = null;   // la misma hoja teñida: borde de luz salvia, y bermellón para ti
    const tenir = color => {
        const c = document.createElement('canvas'); c.width = SIL.width; c.height = SIL.height;
        const b = c.getContext('2d'); b.drawImage(SIL, 0, 0);
        b.globalCompositeOperation = 'source-in'; b.fillStyle = color; b.fillRect(0, 0, c.width, c.height);
        return c;
    };
    SIL.onload = () => { borde = tenir('#a9b689'); bordeRojo = tenir(ROJO); };
    SIL.src = '/mesa/siluetas.webp';
    // ponytail: nombres de ejemplo; en Piles vendrán del top global (aún no hay endpoint que lo liste)
    const TOP = ['Ana', 'Beto', 'Coca', 'Dani'];
    // Punto del mundo que cae en (X, Y) de pantalla a la profundidad d (inverso de proy)
    function desproy(X, Y, d) {
        const ux = X - cv.width / 2, uy = cv.height * cam.cy - Y, cr = Math.cos(cam.roll), sr = Math.sin(cam.roll);
        const px = (ux * cr + uy * sr) * d / foco, py = (-ux * sr + uy * cr) * d / foco;
        return { x: C[0] + F[0] * d + R[0] * px + U[0] * py - OX, y: C[1] + F[1] * d + R[1] * px + U[1] * py, z: C[2] + F[2] * d + R[2] * px + U[2] * py - OZ };
    }
    function silueta(a, p, col, victoria = -1, carta = null) {
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
        g.drawImage(rojo ? bordeRojo : borde, col * CW, fila * CH, CW, CH, -wpx / 2 - r, -hpx - r, wpx + 2 * r, hpx + 2 * r);
        g.globalAlpha = alfa;
        g.drawImage(SIL, col * CW, fila * CH, CW, CH, -wpx / 2, -hpx, wpx, hpx);
        g.restore();
        // La carta, entre sus dedos (el punto de la hoja que da brazos-siluetas): en la mano,
        // o desde donde la soltó (columna 11) volando al centro
        if (carta) {
            const ang = -cam.roll + 0.03 * Math.sin(vivo * 0.55) + 0.05 * alcance * haciaMesa;
            const sy = 1 + 0.014 * Math.sin(vivo * 1.6), ca = Math.cos(ang), sa = Math.sin(ang);
            const dedos = k => {
                const [hx, hy] = MANOS[fila][k];
                const lx = (-wpx / 2 + hx / CW * wpx) * (voltea ? -1 : 1), ly = (-hpx + hy / CH * hpx) * sy;
                return desproy(c[0] + lx * ca - ly * sa, c[1] + hpx / 2 + lx * sa + ly * ca, c[2]);
            };
            if (carta.mano) enMano.push({ ...dedos(col), rot: a.a + Math.PI / 2 });
            else {
                const u = carta.vuela, s = dedos(11), dx = Math.sin(carta.giro) * 0.15, dz = Math.cos(carta.giro) * 0.1;
                enMano.push({ x: lerp(s.x, dx, u), y: lerp(s.y, 0.01, u) + Math.sin(u * Math.PI) * 0.1, z: lerp(s.z, dz, u),
                    rot: a.a + Math.PI / 2 + u * (3 + carta.giro * 6) });
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

    let antes = 0, asomo = { cam: null, p: 0, dt: 0 }, tAsomo = 0;
    function cuadro(ms) {
        const dt = Math.min(0.05, (ms - antes) / 1000 || 0); antes = ms;
        vel += (velMeta - vel) * Math.min(1, dt * 2.5);
        tv += dt * vel / RAPIDO;
        tMeta += dt * vel;
        t += (tMeta - t) * Math.min(1, dt * 1.6) + dt * vel * 0.2;
        // Mientras el dedo arrastra, la cámara va hacia la del menú siguiente en proporción (asomo.p)
        for (const k of ['yaw', 'pitch', 'dist', 'cy', 'roll', 'mx', 'mz', 'my']) {
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
    function aPantalla(x, z) {
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
        mosaico(matriz, s, huecos = false) {   // huecos: los false no llevan carta (letras); si no, carta clara (QR)
            if (!matriz) { if (X.mosaico) X.mosaico.salen = reloj; return; }
            const n = matriz.length, m = matriz[0].length, celdas = [];
            for (let r = 0; r < n; r++) for (let c = 0; c < m; c++) if (!huecos || matriz[r][c]) celdas.push({ x: (c - (m - 1) / 2) * s, z: (r - (n - 1) / 2) * s, c: matriz[r][c] });
            if (!huecos) celdas.sort((a, b) => a.c - b.c);   // QR: primero las claras, encima las oscuras
            X.mosaico = { celdas, s, t0: reloj, huecos };
        },
        /** Solo una cámara (sin cambiar de profundidad ni de partida). */
        camara(nombre) { actual = nombre; meta = { ...CAMS[nombre] }; if (nombre === 'cuenta' || nombre === 'qr' || nombre === 'visor') disputaMeta = 0; },
        /** De cerca a un asiento, desde el centro de la mesa (votar para echar). */
        aAsiento(p) {
            const a = ASIENTOS[p];
            meta = { yaw: Math.atan2(-a.x, -a.z), pitch: 0.3, dist: 1.9, cy: 0.42, roll: 0.12, mx: a.x * 0.85, mz: a.z * 0.85, my: 0.4 };
            disputaMeta = 0;
        },
        /** La cámara vuela a la mesa i de las otras salas (o a la nuestra con -1). */
        aMesa(i) {
            const m = X.mesas?.[i];
            meta = m ? { yaw: Math.atan2(-m.x, -m.z), pitch: 0.5, dist: 3.3, cy: 0.42, roll: 0.06 * (i - 1), mx: m.x, mz: m.z, my: 0.2 } : { ...CAMS.unirse };
        },
        congelar(si) { velMeta = si ? 0 : BALA; },
        /** Todos listos: uno de los dos de la disputa arranca la carta y la alza (antes de la cuenta atrás). */
        ganar() {
            if (disputa < 0.3) return;
            gana = reloj; estalló = false;
            // La cámara se aparta y sube hacia quien la ganó, que la tiene en alto
            actual = 'ganador'; meta = { ...CAMS.ganador };
            if (cv.width < cv.height) { meta.dist = 3.2; meta.yaw = 2.85; }   // en vertical, más lejos y de frente: la carta entra entera
        },
        /** Altura en pantalla (0..1) a la que se centra una cámara: la sala la ajusta al hueco libre. */
        fijarCy(nombre, cy) { if (!CAMS[nombre]) return; CAMS[nombre].cy = cy; if (actual === nombre) meta.cy = cy; },
        /** Asomarse a otro menú sin ir: p 0..1 (el dedo); sentido 1 = adelante, -1 = atrás. null = soltar. */
        asomar(pantalla, p = 0, sentido = 1) {
            asomo = pantalla ? { cam: CAMS[pantalla] ?? CAMS.sala, p, dt: sentido * 6.5 } : { cam: null, p: 0, dt: 0 };
        },
        /** Al confirmar: lo asomado ya cuenta como hecho (ir() pone la cámara y el tiempo). */
        confirmarAsomo() { asomo = { cam: null, p: 0, dt: 0 }; tAsomo = 0; },   // t ya va adelantado: sigue a tMeta sin salto
        ahora: () => reloj,
        /** Otro menú: su cámara, y la partida avanza (o se rebobina) según la profundidad. */
        ir(pantalla, profundidad) {
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


// ════════════════════════════════════════════════════════════════════════════════════
// La interfaz: cartas, piezas y gestos, conectados a lobby.html.
// lobby.html lleva la lógica (WebSocket, asiento, reconexión, Elo, votos) y no tiene
// pantallas propias salvo la partida. Aquí se llama a sus funciones (quickMatch,
// createLobby(n), joinLobby(código), toggleReady, addBot, sendChat(texto), setSmCode…)
// y se pinta con lo que llega del servidor (se envuelven handleMsg, showScreen y la
// cuenta atrás). `vistaActual` dice en cuál de sus vistas está lobby.html.
// ════════════════════════════════════════════════════════════════════════════════════
const tl = (k, v) => (typeof t === 'function' ? t(k, v) : k);   // el t() de lobby.html (i18n.js)
const X = escena.X;   // lo de cada menú dentro de la escena (asientos, diales, QR, placa…)

// Menús: cada opción es una carta. `ir` = la pantalla a la que lleva; `accion` = algo que hace.
// Pocas cartas por nivel: lo que no es «ir a otro sitio» vive en las piezas (ver `formas`).
const MENUS = {
    inicio: [
        { palo: 'i:rayo', nombre: 'Partida rápida', nota: 'Te sienta en una mesa ya', accion: 'rapida' },
        { palo: 'i:mas', nombre: 'Crear sala', nota: 'Tú eliges jugadores y quién entra', ir: 'crear' },
        { palo: 'i:entrar', nombre: 'Unirse', nota: 'Salas abiertas, código o QR', ir: 'unirse' },
    ],
    tutorial: [
        { palo: '1/3', nombre: 'Intercambia', nota: 'Cambia cartas hasta que cada una de tus PILAS tenga la misma prenda', accion: 'nada' },
        { palo: '2/3', nombre: 'Muestra', nota: 'Muestra una pila cuando creas que está completa. Todos lo ven', accion: 'nada' },
        { palo: '3/3', nombre: 'Verificamos', nota: 'Si fallas, revisa tus pilas. Toca para volver', accion: 'volver' },
    ],
    perfil: [
        { palo: 'i:enlace', nombre: 'Session Manager', nota: 'Lleva tu Elo a tu cuenta', ir: 'sm' },
        { palo: 'i:bocina', nombre: 'Mi burla', nota: '', ir: 'burla' },
    ],
    sm: [
        { palo: 'i:teclado', nombre: 'Pegar código', nota: 'El de tu cuenta de Session Manager', accion: 'smCodigo' },
        { palo: 'i:cruz', nombre: 'Desvincular', nota: 'Vuelves al Elo de este navegador', accion: 'smBorrar' },
    ],
    qr: [{ palo: 'i:copiar', nombre: 'Copiar enlace', nota: 'Para mandarlo por chat', accion: 'copiar' }],
    visor: [{ palo: 'i:cruz', nombre: 'Cerrar cámara', nota: 'Apunta al QR de otra pantalla', accion: 'volver' }],
    oferta: [
        { palo: 'i:bot', nombre: 'VS bots', nota: 'Tres bots se sientan ya', accion: 'ofertaBots' },
        { palo: 'i:reloj', nombre: 'Seguir buscando', nota: 'Esperar a personas', accion: 'seguir' },
    ],
    echar: [],    // se llena al tocar la carta de un jugador
    votar: [],    // se llena con la votación (kick_poll)
    burla: [],    // las de lobby.html (TAUNTS)
    crear: [{ palo: 'i:play', nombre: 'Abrir sala', nota: 'Con los jugadores y la privacidad de arriba', accion: 'abrir' }],
    unirse: [],   // las salas de verdad (lobby_list)
    sala: [],     // según seas jugador o espectador (menuSala)
    bots: [
        { palo: 'i:mas', nombre: 'Añadir bot', nota: 'Con la dificultad de arriba', accion: 'bot' },
        { palo: 'i:llenar', nombre: 'Llenar', nota: 'Todos los huecos', accion: 'llenar' },
        { palo: 'i:cruz', nombre: 'Quitar bot', nota: 'El último que entró', accion: 'quitarBot' },
    ],
    cuenta: [],
};
const EN_SALA = new Set(['sala', 'bots', 'qr', 'echar', 'votar', 'oferta', 'cuenta']);   // vista 'lobbyScreen'
// Qué vista de lobby.html corresponde a cada menú de aquí (y al revés)
const A_LOBBY = { inicio: 'homeScreen', perfil: 'profileScreen', sm: 'profileScreen', burla: 'profileScreen', tutorial: 'howToPlayScreen',
    crear: 'hostScreen', unirse: 'joinScreen', visor: 'joinScreen' };
const DE_LOBBY = { homeScreen: 'inicio', profileScreen: 'perfil', howToPlayScreen: 'tutorial', hostScreen: 'crear', joinScreen: 'unirse', lobbyScreen: 'sala' };
let crearJug = 4;   // jugadores de la sala nueva (el tambor de «Crear sala»)

const esc = document.getElementById('escenario');
const zona = document.getElementById('cartas');
const estado = document.getElementById('estado');
const nombre = document.getElementById('nombre');
const vibrar = ms => { try { navigator.vibrate?.(ms); } catch { /* */ } };
const W = () => innerWidth, H = () => innerHeight;
// La rejilla: todo se coloca con estos números (ver el comentario del CSS).
// M = margen, SEP = separación, FILA2 = cabecera y botones pequeños, ZONA = donde empiezan las piezas.
const M = 16, SEP = 8, FILA2 = 64, ZONA = 120, ESTADO_H = 56;
const ancho = () => W() >= 1024;   // columna del chat a la derecha; si no, todo apilado
function rejilla() {
    const w = W(), h = H(), es = h < 720 ? 0.8 : 1;   // mano más pequeña en pantallas bajas
    const manoTop = h - M - 176 * 1.08 * es;          // borde de arriba de la carta elegida
    return { w, h, es, manoTop, estadoAbajo: manoTop - SEP, libre: manoTop - SEP - ESTADO_H - SEP, cabw: Math.min(190, w - 202) };
}
let mano = [], sel = 0, pantalla = 'inicio', cabeceras = [];

function hacerCarta(o, clase = '') {
    const c = document.createElement('button');
    c.type = 'button';
    c.className = 'carta ' + clase;
    c.innerHTML = `<span class="palo"></span><span class="nombre"></span><span class="nota"></span>`;
    for (const k of ['palo', 'nombre', 'nota']) ponTexto(c, k, o[k] ?? '');
    return c;
}
/** Texto de una carta: se guarda en español y se muestra traducido. */
function ponTexto(c, k, es) { c.dataset[k] = es; pintaTexto(c, k); }
// Un palo «i:nombre» es un icono; el resto, texto traducido
function pintaTexto(c, k) {
    const es = c.dataset[k], e = c.querySelector('.' + k);
    if (es.startsWith('i:')) e.innerHTML = ico(es.slice(2)); else e.textContent = T(es);
}
// Iconos propios (sin emoji): líneas rectas, esquinas en punta, del color del texto
const ICONOS = {
    rayo: 'M13 2 5 14h6l-1 8 8-12h-6z', mas: 'M12 4v16M4 12h16', menos: 'M4 12h16', entrar: 'M6 18 18 6M8 6h10v10',
    enlace: 'M9 15l6-6M8 11l-3 3 5 5 3-3M16 13l3-3-5-5-3 3', bocina: 'M3 9v6h4l6 5V4L7 9zM16 9l2 3-2 3M19 6l3 6-3 6',
    teclado: 'M2 6h20v12H2zM6 10h1M10 10h1M14 10h1M18 10h1M7 14h10', cruz: 'M5 5l14 14M19 5 5 19', flecha: 'M3 12h16M13 6l6 6-6 6',
    copiar: 'M8 8h12v12H8zM4 16V4h12', silla: 'M7 3v18M7 12h10v9', volver: 'M9 5 4 10l5 5M4 10h12v9h-4',
    bot: 'M5 8h14v11H5zM12 4v4M9 12v2M15 12v2M9 16h6', reloj: 'M6 3h12M6 21h12M7 3l10 18M17 3 7 21',
    nota: 'M9 18V4l9 3M9 18H5v-4h4', vacio: 'M6 6h12v12H6zM4 20 20 4', play: 'M7 4v16l12-8z', ojo: 'M2 12l5-5h10l5 5-5 5H7zM11 10h2v4h-2z',
    check: 'M4 12l5 5L20 6', cambio: 'M4 8h15M15 4l4 4-4 4M20 16H5M9 12l-4 4 4 4', llenar: 'M4 6h12M4 12h16M4 18h12M16 8l4 4-4 4',
    fuera: 'M14 4H4v16h10M10 12h11M17 8l4 4-4 4', persona: 'M8 4h8v8H8zM4 21v-5h16v5', camara: 'M3 7h4l2-3h6l2 3h4v13H3zM10 11h4v4h-4z',
    qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2M18 14h2v2M14 18h2v2M18 18v2h2',
    abajo: 'M12 3v16M6 13l6 6 6-6',
};
const ico = n => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONOS[n]}"/></svg>`;
const pon = (c, x, y, r = 0, s = 1) => { c.style.setProperty('--x', x + 'px'); c.style.setProperty('--y', y + 'px'); c.style.setProperty('--r', r + 'deg'); c.style.setProperty('--s', s); };
// El centro es el de la mesa de fondo: las cartas vuelan a donde se ve en pantalla.
const pilaX = () => escena.centro().x - 64, pilaY = () => escena.centro().y - 88;
/** La carta cae al centro esparcido y se queda en la mesa de fondo, con las otras. */
function alCentro(c, dorso = false, retraso = 0) {
    const h = escena.soltar(dorso);
    c.classList.remove('respira', 'elegida', 'cabecera', 'previa');
    c.style.transitionDelay = `${retraso}ms`;
    pon(c, h.x - 64, h.y - 88, Math.random() * 60 - 30, h.s);
    setTimeout(() => { h.poner(); c.style.transitionDelay = ''; c.style.opacity = '0'; }, 480 + retraso);
    setTimeout(() => c.remove(), 820 + retraso);
}

// La mano: en abanico horizontal; la elegida, centrada y levantada.
function colocarMano(rapido = false, desliz = 0) {   // desliz: px que sigue al dedo (sin animar)
    const R = rejilla(), s0 = 1.08 * R.es, yE = R.manoTop - 88 + 88 * s0;   // la elegida toca manoTop
    if (ini?.eje === 'h') mano.forEach(c => (c.style.transition = 'none'));
    mano.forEach((c, i) => {
        const k = i - sel;
        const x = W() / 2 - 64 + k * 112 * R.es + desliz;
        const y = k === 0 ? yE : yE + Math.min(12, 4 + Math.abs(k) * 4);   // las de al lado no bajan de la elegida
        c.classList.toggle('elegida', k === 0);
        c.setAttribute('aria-selected', k === 0);
        c.tabIndex = k === 0 ? 0 : -1;
        if (rapido) c.style.transition = 'none';
        pon(c, x, y, k * 5, k === 0 ? s0 : .9 * R.es);
        if (rapido) { void c.offsetWidth; c.style.transition = ''; }
    });
    colocarTextos();
    alElegirCarta();
}
/** Estado y campo, apilados sobre la mano. */
function colocarTextos() {
    const R = rejilla();
    estado.style.top = 'auto';
    estado.style.bottom = (R.h - R.estadoAbajo) + 'px';
    campo.style.bottom = (R.h - R.estadoAbajo) + 'px';
}
// Repartir = cambiar de set: la mano nueva entra de lado (dir 1: desde la derecha, al
// avanzar; -1: desde la izquierda, al volver). Sin dir (la primera vez) sale de la pila.
function repartir(opciones, dir = 0, elegida = 0) {
    mano.forEach(c => c.remove());
    mano = opciones.map((o, i) => {
        const c = hacerCarta(o);
        c.dataset.i = i;
        c.style.transition = 'none';
        if (dir) pon(c, W() / 2 - 64 + dir * (W() * 0.9 + i * 70), rejilla().manoTop, dir * 14, .9);
        else pon(c, pilaX(), pilaY(), -8, .7);
        zona.append(c);
        return c;
    });
    sel = Math.min(elegida, Math.max(0, mano.length - 1));
    requestAnimationFrame(() => requestAnimationFrame(() => mano.forEach((c, i) => {
        c.style.transition = '';
        c.style.transitionDelay = `${i * 55}ms`;
        setTimeout(() => { c.style.transitionDelay = ''; c.classList.add('respira'); c.style.animationDelay = `${i * -0.7}s`; }, 650 + i * 55);
    })));
    requestAnimationFrame(() => requestAnimationFrame(() => colocarMano()));
    estadoBots();
}
/** La mano de un menú que cambió solo (salas, roles): mismos textos en sitio, o se reparte de nuevo. */
function refrescarMano(p) {
    if (pantalla !== p) return;
    const nuevas = MENUS[p], mismas = nuevas.length === mano.length && nuevas.every((o, i) => o.clave === mano[i]?.dataset.clave);
    if (mismas) { nuevas.forEach((o, i) => { for (const k of ['palo', 'nombre', 'nota']) if (mano[i].dataset[k] !== (o[k] ?? '')) ponTexto(mano[i], k, o[k] ?? ''); }); return; }
    const antes = mano[sel]?.dataset.clave;
    repartir(nuevas, 1, Math.max(0, nuevas.findIndex(o => o.clave === antes)));
    mano.forEach((c, i) => (c.dataset.clave = nuevas[i].clave ?? ''));
}
/** Cabeceras: la de ahora en la fila 2; las dos de antes asoman detrás, más oscuras. */
function apilarCabeceras() {
    const n = cabeceras.length;
    cabeceras.forEach((h, i) => {
        const atras = n - 1 - i, k = Math.min(atras, 2);
        h.classList.toggle('previa', atras > 0);
        h.style.opacity = atras > 2 ? '0' : '';
        h.style.zIndex = 12 - k;
        pon(h, M - k * 5, FILA2 - k * 5, -k * 1.5, 1);
    });
}
/** La mano de ahora se tira al centro de la mesa (al cambiar de set). */
function retirarMano() {
    const viejas = mano; mano = [];
    viejas.forEach((x, i) => alCentro(x, false, i * 45));
}
function elegir(d) {
    const n = Math.max(0, Math.min(mano.length - 1, sel + d));
    if (n === sel) {   // en el borde: rebote
        mano[sel]?.animate([{ translate: '0 0' }, { translate: `${-d * 14}px 0` }, { translate: '0 0' }], { duration: 320, easing: 'cubic-bezier(.34,1.56,.64,1)' });
        return;
    }
    sel = n; vibrar(6); colocarMano();
}

// Jugar la carta elegida: si lleva a otro menú, vuela arriba en bermellón y queda como cabecera.
function jugar() {
    const c = mano[sel]; if (!c) return;
    if (c.disabled) { c.animate([{ translate: '0 0' }, { translate: '8px 0' }, { translate: '-6px 0' }, { translate: '0 0' }], { duration: 260 }); return; }   // apagada o esperando al servidor
    const o = MENUS[pantalla][sel];
    if (!o) return;
    if (o.accion !== undefined) { accion(o.accion, c, o); return; }
    vibrar(18);
    c.classList.remove('respira');
    c.style.transition = '';
    mano.splice(sel, 1);
    cambiar(o.ir, c, o);
}

/** Cambio de menú con carta jugada (o con un rótulo, ver irA). `lobby: false`: lo pidió lobby.html. */
function cambiar(destino, jugada, o = {}, lobby = true) {
    const b = document.getElementById('barrido');
    b.classList.remove('pasa'); void b.offsetWidth; b.classList.add('pasa');
    jugada.classList.remove('elegida', 'respira');
    jugada.classList.add('cabecera');
    jugada.disabled = true;
    cabeceras.push(jugada);
    apilarCabeceras();
    historial.push(pantalla);
    const antes = pantalla;
    pantalla = destino;
    esc.dataset.p = destino;
    preparaMenu(destino, o);
    estado.textContent = '';
    cerrarCampo();
    escena.ir(destino, historial.length);
    alCambiar(antes, destino, lobby);
    retirarMano();                       // el resto del set, al centro (con la cámara nueva)
    setTimeout(() => { repartir(MENUS[destino], 1); mano.forEach((c, i) => (c.dataset.clave = MENUS[destino][i]?.clave ?? '')); }, 160);
}
/** Ir a una pantalla sin carta jugada (la cabecera es un rótulo). */
function irA(destino, titulo, o = {}, lobby = true) {
    const t0 = hacerCarta({ nombre: titulo }); zona.append(t0); pon(t0, pilaX(), pilaY(), 0, .8);
    setTimeout(() => cambiar(destino, t0, o, lobby), 30);
}

// ↓ = volver: la última cabecera vuelve a la pila y se reparte el menú anterior.
const historial = [];
function volver() {
    if (pantalla === 'cuenta') { if (isReady) toggleReady(); return; }   // desmarcarse cancela la cuenta (en el servidor)
    if (pantalla === 'oferta') { cancelQuickMatchOffer(); cerrarOferta(); return; }
    if (!historial.length) return;
    if (pantalla === 'sala') { conLobby(() => leaveLobby()); }   // salir de la sala de verdad
    deshacer();
}
/** El paso atrás en pantalla (sin efectos en lobby.html). */
function deshacer() {
    if (!historial.length) return;
    const antes = pantalla;
    const h = cabeceras.pop();
    h?.classList.remove('previa');
    apilarCabeceras();
    cerrarCampo();
    const b = document.getElementById('barrido');
    b.classList.remove('pasa'); void b.offsetWidth; b.classList.add('pasa');
    pantalla = historial.pop();
    esc.dataset.p = pantalla;
    estado.textContent = '';
    escena.ir(pantalla, historial.length);
    alCambiar(antes, pantalla, true);
    if (h) alCentro(h);
    retirarMano();
    setTimeout(() => { repartir(MENUS[pantalla], -1); mano.forEach((c, i) => (c.dataset.clave = MENUS[pantalla][i]?.clave ?? '')); }, 120);
}
/** lobby.html te lleva a otra pantalla por su cuenta (entraste en una sala, te echaron, se cayó
 *  el asiento, acabó la partida…): se rehace el camino hasta ella sin animar paso a paso. */
function saltarA(destino) {
    cancelarCuentaVisual();
    cabeceras.forEach(h => alCentro(h)); cabeceras = [];
    historial.length = 0;
    const antes = pantalla;
    pantalla = 'inicio'; esc.dataset.p = 'inicio';
    if (destino === 'inicio') {
        escena.ir('inicio', 0); alCambiar(antes, 'inicio', false);
        retirarMano(); setTimeout(() => repartir(MENUS.inicio, -1), 120);
        return;
    }
    const titulo = destino === 'sala' ? (currentLobbyId || 'Sala') : { perfil: 'Perfil', tutorial: 'Cómo jugar', crear: 'Crear sala', unirse: 'Unirse' }[destino] ?? destino;
    irA(destino, titulo, {}, false);
}

// ── Lo que viene de lobby.html ───────────────────────────────────────────────────────
// Mientras se llama a lobby.html desde aquí, sus cambios de pantalla no se repiten aquí.
let suprimir = 0;
const conLobby = f => { suprimir++; try { return f(); } finally { suprimir--; } };
/** Pone en lobby.html la vista que toca a la de aquí (la lista de salas se refresca sola si
 *  está «Unirse», por ejemplo). Dentro de la sala no se toca nada. */
function alinearLobby(p) {
    if (EN_SALA.has(p)) return;
    const id = A_LOBBY[p];
    if (id && vistaActual !== id) conLobby(() => showScreen(id));
}
const _showScreen = window.showScreen;
window.showScreen = id => {
    _showScreen(id);
    document.body.classList.toggle('en-partida', id === 'gameScreen');
    if (suprimir || id === 'gameScreen') return;
    const destino = DE_LOBBY[id];
    if (!destino) return;
    const ya = destino === 'sala' ? EN_SALA.has(pantalla) : (A_LOBBY[pantalla] === id);
    if (ya) { if (destino === 'sala') sincronizarSala(); return; }
    // Entraste en una sala desde donde la pediste (inicio, crear, unirse): un paso más, sin perder
    // el camino. Desde cualquier otro sitio (F5, enlace, te echaron…), el camino se rehace.
    if (destino === 'sala' && ['inicio', 'crear', 'unirse', 'visor'].includes(pantalla)) { estado.textContent = ''; irA('sala', currentLobbyId, {}, false); }
    else saltarA(destino);
};
// Sin nombre no se entra en ninguna sala: lobby.html vuelve al inicio; aquí, aviso y al campo.
const _requireNickname = window.requireNickname;
window.requireNickname = () => {
    const n = conLobby(_requireNickname);
    if (!n) { sacude(nombre); nombre.focus(); }   // sin texto: el campo del nombre tiembla en rojo
    return n;
};
// Cada mensaje del servidor: primero lobby.html, luego se pinta aquí
const _handleMsg = window.handleMsg;
window.handleMsg = msg => {
    _handleMsg(msg);
    try { alMensaje(msg); } catch (e) { console.error('mesa', e); }
};
// La cuenta atrás del servidor (`countdown {seconds}`) la forman las cartas de la mesa
const _startCountdown = window.startCountdown, _closeCountdown = window.closeCountdown;
window.startCountdown = s => { _startCountdown(s); cuentaAtras(Number(s) || 3); };
window.closeCountdown = () => { _closeCountdown(); if (cuenta && !cuenta.repartiendo) cancelarCuentaVisual(true); };

// La oferta de bots de la partida rápida (lobby.html la abre al rato de estar solo)
alOfertaBots = abierta => {
    if (abierta && pantalla === 'sala') ofrecerBots();
    else if (!abierta && pantalla === 'oferta') cerrarOferta();
};

// ── La sala, con los datos del servidor ───────────────────────────────────────────
// Filas de 4 centradas desde ZONA (escala .56 = 72×99 px; cada 80 px de lado y 107 de alto).
let ultimaSala = null;          // el último lobby_update
const cartasJug = new Map();    // id del jugador → su carta
const huecos = [];              // cartas vacías: los asientos libres
const filasSala = () => Math.ceil((ultimaSala?.max_players ?? 4) / 4);
function posJugador(i, max) {
    const fila = Math.floor(i / 4), enFila = Math.min(4, max - fila * 4), k = i % 4;
    return [W() / 2 - 64 + (k - (enFila - 1) / 2) * 80, ZONA - 39 + 4 + fila * 107];   // +4: el giro de ±3° no toca la fila 2
}
// Nada de emoji en la mesa: los nombres de los bots llegan con uno («🤖 Bot 1»)
const sinEmoji = s => String(s ?? '').replace(/\p{Extended_Pictographic}️?/gu, '').replace(/\s+/g, ' ').trim();
/** Tú primero (asiento 0 de la mesa), luego los demás en el orden del servidor. */
const ordenSala = () => {
    const js = (ultimaSala?.players ?? []).map(p => ({ ...p, nickname: sinEmoji(p.nickname), nick: p.nickname }));
    return [...js.filter(p => p.id === currentPlayerId), ...js.filter(p => p.id !== currentPlayerId)];
};
function sincronizarSala(llega = false) {
    const m = ultimaSala, dentro = !!m && !!currentLobbyId;
    X.tu = dentro && !soyEspectador ? 0 : -1;
    if (!dentro) {
        ultimaSala = null;
        cartasJug.forEach(c => { pon(c, pilaX(), -260, 20, 1); setTimeout(() => c.remove(), 600); });
        cartasJug.clear();
        huecos.splice(0).forEach(v => v.remove());
        X.ocupados = [true, true, true, true]; X.listos = [false, false, false, false]; X.nombres = null;
        X.elo = escena.ELO_TOP.map(e => ({ ...e }));
        return;
    }
    // Llegó la respuesta: vuelve lo que se fue, salvo los bots que aún no han llegado todos
    if (esperaBots && m.players.length === esperaBots.n) esperaBots = null;
    // (fuera de la sala, la que se fue es la de entrar: se va con el menú al cambiar)
    if (EN_SALA.has(pantalla)) mano.forEach(c => { if (c.classList.contains('ida') && c !== esperaBots?.c) vuelve(c); });
    const gente = ordenSala(), vistos = new Set();
    gente.forEach((p, i) => {
        vistos.add(p.id);
        let c = cartasJug.get(p.id);
        const tuyo = p.id === currentPlayerId;
        const [x, y] = posJugador(i, m.max_players);
        if (!c) {
            c = hacerCarta({}, tuyo ? 'jugador tuya' : 'jugador');
            c.disabled = true; c.style.transition = 'none';
            pon(c, x + (Math.random() - .5) * 200, -220, (Math.random() - .5) * 60, 1.2);
            zona.prepend(c); cartasJug.set(p.id, c);
            requestAnimationFrame(() => requestAnimationFrame(() => { c.style.transition = ''; pon(c, x, y, (i % 2 ? 1 : -1) * 3, .56); }));
            if (llega && !tuyo) {
                decir('', T('{n} entró', { n: p.nickname }), true); vibrar(8);
                // Al caer en su asiento, un golpe: se ve que ya está, no solo que llega algo
                c.animate([{ scale: 1 }, { scale: 1.35 }, { scale: 1 }], { duration: 420, delay: 480, easing: 'cubic-bezier(.34,1.56,.64,1)' });
            }
        } else pon(c, x, y, (i % 2 ? 1 : -1) * 3, .56);
        // Nada que leer: listo = carta salvia con ✓; bot = su icono; tú = «TÚ» en bermellón
        ponTexto(c, 'palo', tuyo ? (soyEspectador ? 'i:ojo' : 'TÚ') : p.is_ready ? 'i:check' : p.is_bot ? 'i:bot' : '');
        c.dataset.nombre = p.nickname; c.querySelector('.nombre').textContent = p.nickname;   // los apodos no se traducen
        ponTexto(c, 'nota', '');
        c.classList.toggle('listo', !!p.is_ready);
        c.dataset.id = p.id;
    });
    for (const [id, c] of cartasJug) if (!vistos.has(id)) {
        decir('', T('{n} salió', { n: c.dataset.nombre }), true);
        pon(c, W() + 200, -200, 40, 1); setTimeout(() => c.remove(), 600);
        cartasJug.delete(id);
    }
    // La mesa tiene 4 asientos dibujados: tú y los tres primeros (es para enseñar cómo se juega)
    for (let s = 0; s < 4; s++) {
        const p = gente[s];
        if (p && !X.ocupados[s] && llega) X.llegada[s] = escena.ahora();
        X.ocupados[s] = !!p; X.listos[s] = !!p?.is_ready;
    }
    X.nombres = [0, 1, 2, 3].map(s => gente[s]?.nickname ?? '');
    X.elo = [0, 1, 2, 3].map(s => gente[s]?.elo != null ? { v: gente[s].elo, pool: m.pool === 'fun' ? 'fun' : 'glory', top3: !!gente[s].top3 } : null);
    // Los asientos libres, como cartas vacías: cuántos sois y cuántos caben se ve sin leerlo
    while (huecos.length > m.max_players - gente.length) { const v = huecos.pop(); v.style.opacity = '0'; setTimeout(() => v.remove(), 300); }
    while (huecos.length < m.max_players - gente.length) {
        const v = hacerCarta({}, 'jugador vacia'); v.disabled = true; v.setAttribute('aria-hidden', 'true');
        v.style.opacity = '0'; zona.prepend(v); huecos.push(v);
    }
    huecos.forEach((v, k) => { const i = gente.length + k, [x, y] = posJugador(i, m.max_players); pon(v, x, y, (i % 2 ? 1 : -1) * 3, .56); requestAnimationFrame(() => (v.style.opacity = '')); });
    if (EN_SALA.has(pantalla) && !['cuenta', 'oferta', 'votar'].includes(pantalla) && !aviso.t) estado.textContent = '';
    menuSala(); refrescarMano('sala'); estadoBots();
    formas();
}
/** Las cartas de la sala: jugador (listo, bots si cabe alguien, mirar) o espectador (jugar / cola). */
function menuSala() {
    const m = ultimaSala, cabe = m && m.players.length < m.max_players;
    MENUS.sala = soyEspectador
        ? [{ clave: 'rol', palo: 'i:silla', nombre: enCola ? 'Salir de la cola' : 'Quiero jugar', nota: enCola ? 'Te sentarás cuando haya hueco' : 'Pides sitio en la mesa', accion: 'rol' }]
        : [
            { clave: 'listo', palo: 'i:check', nombre: isReady ? 'Listo ✓' : 'Estoy listo', nota: 'Cuando estén todos, se reparte', accion: 'listo' },
            ...(cabe ? [{ clave: 'bots', palo: 'i:bot', nombre: 'VS bots', nota: 'Rellenar con bots', ir: 'bots' }] : []),
            { clave: 'mirar', palo: 'i:cambio', nombre: 'Mirar', nota: 'Pasar a espectador', accion: 'rol' },
        ];
}
// ── Campo de texto: sale cuando hace falta escribir ─────────────────────────────
const campo = document.getElementById('campo');
let alEnviar = null, alEscribir = null;
function pedir(ph, max, enviar, escribir = null) {
    campo.value = ''; campo.placeholder = ph; campo.maxLength = max;
    colocarTextos();
    campo.style.textTransform = max <= 12 ? 'uppercase' : '';
    alEnviar = enviar; alEscribir = escribir;
    campo.classList.add('abierto'); esc.classList.add('escribiendo');
    campo.focus();
}
function cerrarCampo() { campo.classList.remove('abierto'); esc.classList.remove('escribiendo'); campo.blur(); alEnviar = alEscribir = null; }
campo.addEventListener('input', () => alEscribir?.(campo.value.trim().toUpperCase()));
campo.addEventListener('keydown', e => {
    if (e.key === 'Enter' && campo.value.trim()) { const f = alEnviar; const v = campo.value.trim(); cerrarCampo(); f?.(v); }
    else if (e.key === 'Escape') cerrarCampo();
    e.stopPropagation();
});
// Un aviso corto encima de la mano. En la sala va al chat, como línea gris: ahí no tapa nada
// y queda escrito.
const aviso = (txt, ms = 1600) => {
    if (currentLobbyId && ['sala', 'bots', 'qr', 'echar', 'votar'].includes(pantalla)) { decir('', txt, true); return; }
    estado.textContent = txt; clearTimeout(aviso.t);
    aviso.t = setTimeout(() => { aviso.t = 0; estado.textContent = ''; }, ms);
};
// En vez de una frase: lo que falla tiembla en rojo; lo que espera al servidor late
const sacude = el => { el?.classList.remove('mal'); void el?.offsetWidth; el?.classList.add('mal'); vibrar([20, 40, 20]); setTimeout(() => el?.classList.remove('mal'), 700); };
// Carta de acción jugada: se va (sube y se desvanece) y no se puede volver a jugar hasta que
// contesta el servidor. Devolverla a la mano al instante parecía que no se había elegido.
// Si cambia el menú, se va con él; si no hay respuesta en 6 s, vuelve.
const seVa = c => {
    if (!c) return;
    c.classList.add('ida'); c.disabled = true;
    clearTimeout(c._vuelve); c._vuelve = setTimeout(() => vuelve(c), 6000);
};
function vuelve(c) {
    if (!c) return;
    clearTimeout(c._vuelve);
    if (!mano.includes(c)) return;   // el menú cambió: se fue con él
    c.classList.remove('ida'); c.disabled = false;
    estadoBots();
}
// Bots: la carta vuelve cuando la sala llega al número de jugadores pedido (lobby_update)
let esperaBots = null;   // { c, n }
const pideBots = (c, n) => { seVa(c); vibrar(15); esperaBots = { c, n }; };
/** En el menú de bots: añadir y llenar, apagadas con la mesa llena; quitar, sin bots. */
function estadoBots() {
    const m = ultimaSala;
    if (pantalla !== 'bots' || !m) return;
    const llena = m.players.length >= m.max_players, sinBots = !m.players.some(p => p.is_bot);
    mano.forEach((c, i) => {
        if (c.classList.contains('ida')) return;
        const a = MENUS.bots[i]?.accion;
        c.disabled = a === 'bot' || a === 'llenar' ? llena : a === 'quitarBot' ? sinBots : false;
    });
}
const salta = c => c?.animate([{ translate: '0 0' }, { translate: '0 -40px' }, { translate: '0 0' }], { duration: 420, easing: 'cubic-bezier(.34,1.56,.64,1)' });

// ── Partida rápida sin nadie: «No hay oponentes dignos…» y la cámara por las sillas vacías ──
function ofrecerBots() {
    if (pantalla !== 'sala') return;
    historial.push(pantalla); pantalla = 'oferta'; esc.dataset.p = 'oferta';
    escena.camara('vacias');
    decir('', T('No hay oponentes dignos...'), true); formas();   // la frase va al chat
    retirarMano(); setTimeout(() => repartir(MENUS.oferta, 1), 160);
}
function cerrarOferta() {
    if (pantalla !== 'oferta') return;
    pantalla = historial.pop() ?? 'sala'; esc.dataset.p = pantalla;
    escena.ir(pantalla, historial.length);
    retirarMano(); setTimeout(() => { menuSala(); repartir(MENUS.sala, -1); mano.forEach((c, i) => (c.dataset.clave = MENUS.sala[i]?.clave ?? '')); }, 160);
    sincronizarSala();
}

// ── Cuenta atrás: primero uno gana la pelea por la carta y la alza; luego 3, 2, 1 con cartas ──
const LETRAS = {   // 5×7
    3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
    2: ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
    1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
};
const matrizDe = ch => LETRAS[ch].map(f => [...f].map(b => b === '1'));
let cuenta = null;   // { timers, repartiendo }
/** `segundos` lo manda el servidor (5): todo va hacia atrás desde el reparto. La victoria ocupa
 *  lo que sobra de los 3 s de números; con 3 s no hay victoria y no se rompe nada. */
function cuentaAtras(segundos) {
    cancelarCuentaVisual();
    if (!EN_SALA.has(pantalla)) return;
    if (pantalla !== 'sala') { while (EN_SALA.has(historial.at(-1)) && pantalla !== 'sala') deshacerSinAnimar(); }
    const GANA = Math.max(0, segundos - 3) * 1000;
    cuenta = { timers: [], repartiendo: false };
    historial.push(pantalla); pantalla = 'cuenta';
    escena.ganar(); vibrar(25);
    if (!ancho()) formas();   // en el móvil el chat se pliega: taparía la carta alzada
    mano.forEach(x => pon(x, W() / 2 - 64, H() + 80, 0, .8));
    estado.innerHTML = `${ico('abajo')}${ico('cruz')}`; estado.setAttribute('aria-label', T('Desmárcate (↓) para cancelar')); colocarTextos();   // ↓ = cancelar, sin frase
    const tras = (ms, f) => cuenta.timers.push(setTimeout(f, ms));
    tras(GANA, () => { esc.dataset.p = 'cuenta'; escena.camara('cuenta'); formas(); });
    ['3', '2', '1'].forEach((k, i) => tras(GANA + i * 1000, () => { escena.mosaico(matrizDe(k), 0.13, true); vibrar(30); }));
    tras(GANA + 3000, () => { cuenta.repartiendo = true; escena.mosaico(null); estado.textContent = ''; });
}
/** Se cortó (alguien se desmarcó, entró o salió): de vuelta a la sala tal cual estaba. */
function cancelarCuentaVisual(volverASala = false) {
    if (!cuenta) return;
    cuenta.timers.forEach(clearTimeout); cuenta = null;
    escena.mosaico(null);
    if (pantalla === 'cuenta' && volverASala) {
        pantalla = historial.pop() ?? 'sala'; esc.dataset.p = pantalla;
        escena.ir(pantalla, historial.length);
        menuSala(); repartir(MENUS[pantalla], -1); mano.forEach((c, i) => (c.dataset.clave = MENUS[pantalla][i]?.clave ?? ''));
        sincronizarSala();
    } else if (pantalla === 'cuenta') { pantalla = historial.pop() ?? 'sala'; esc.dataset.p = pantalla; }
}
function deshacerSinAnimar() {
    const h = cabeceras.pop(); if (h) alCentro(h);
    apilarCabeceras();
    pantalla = historial.pop(); esc.dataset.p = pantalla;
}

// ── Cada pantalla, su toma ─────────────────────────────────────────────────────────
const PERFIL = new Set(['perfil', 'sm', 'burla']);
/** Los menús que dependen de algo: a quién echar, las burlas, las salas. */
function preparaMenu(destino, o = {}) {
    if (destino === 'echar') marcaVoto = o.idx >= 0 && o.idx < 4 ? o.idx : -1;
    if (destino === 'echar') MENUS.echar = [
        { palo: 'i:fuera', nombre: T('Echar a {n}', { n: o.nick }), nota: 'Votan todos: si alguien dice no, se queda', accion: 'echar', id: o.id, idx: o.idx },
        { palo: 'i:volver', nombre: 'Mejor no', nota: 'Volver a la sala', accion: 'volver' },
    ];
    if (destino === 'burla') MENUS.burla = [...TAUNTS, { id: '', name: tl('taunt.none') }].map(b =>
        ({ palo: b.id ? 'i:nota' : 'i:vacio', nombre: b.name, nota: 'Suena a quien llegue tarde a tu carta', accion: 'burla', id: b.id }));
    if (destino === 'perfil') MENUS.perfil[1].nota = TAUNTS.find(b => b.id === getTaunt())?.name ?? tl('taunt.none');
}
function alCambiar(antes, ahora, lobby) {
    if (PERFIL.has(ahora) && !currentLobbyId) {
        X.nombres = [nombre.value.trim() || T('Tú'), 'Beto', 'Coca', 'Dani']; X.tu = 0;
    } else if (!EN_SALA.has(ahora) || ahora === 'sala') sincronizarSala();
    X.marca = ahora === 'echar' || ahora === 'votar' ? marcaVoto : -1;   // a quién se vota echar, en bermellón
    formas(ahora);
    if (lobby) alinearLobby(ahora);
    if (ahora === 'unirse') { if (ws?.readyState === WebSocket.OPEN) refreshLobbies(); pintarMesas(); }
    else if (ahora !== 'visor') X.mesas = null;
    if (antes === 'sm') X.placa = null;
    if (ahora === 'sm') X.placa = { txt: smCodeGuardado(), ok: !!smCodeGuardado() };
    if (antes === 'qr') escena.mosaico(null);
    if (ahora === 'qr') mostrarQR();
    if (antes === 'visor') pararVisor();
    if (ahora === 'visor') abrirVisor();
    if (ahora === 'perfil') cargarElo();
}
/** Al pasar por una carta (sin jugarla): la cámara o la figura reaccionan. */
function alElegirCarta() {
    const o = MENUS[pantalla]?.[sel]; if (!o) return;
    if (pantalla === 'unirse') escena.aMesa(Math.min(sel, 2));
    if ((pantalla === 'echar' || pantalla === 'votar') && marcaVoto > 0) escena.aAsiento(marcaVoto);
    if (pantalla === 'burla' && o.id) { X.burla = escena.ahora(); playTaunt(o.id, true); }
}

// QR de la sala: lo forman las cartas del centro, vistas desde arriba (se puede escanear).
// La matriz la da el servidor (/api/qr/:sala/matriz), el mismo QR que el SVG de siempre.
async function mostrarQR() {
    if (!currentLobbyId) return;
    escena.camara('qr');
    try {
        const r = await fetch(`/api/qr/${encodeURIComponent(currentLobbyId)}/matriz`);
        if (!r.ok) throw new Error(r.status);
        const { n, m } = await r.json(), borde = 2, filas = [];
        if (pantalla !== 'qr') return;
        for (let y = -borde; y < n + borde; y++) { const f = []; for (let x = -borde; x < n + borde; x++) f.push(y >= 0 && x >= 0 && y < n && x < n && m[y * n + x] === '1'); filas.push(f); }
        escena.mosaico(filas, 1.5 / (n + 2 * borde));
    } catch { aviso(T('No se pudo cargar el QR'), 2400); }
}
// Escáner: el de lobby.html (qr-scanner) con su <video> (#scanWrap, invisible: mesa.css),
// que se dibuja en el centro de la mesa.
async function abrirVisor() {
    X.visor = { t0: escena.ahora(), video: null };
    await conLobby(() => toggleScanner());
    if (!qrScanner) { aviso(T('No se pudo abrir la cámara. Escribe el código a mano.'), 3000); return; }
    if (X.visor) X.visor.video = document.getElementById('scanVideo');
}
function pararVisor() { stopScanner(); X.visor = null; }
// Tu Elo de verdad (el del perfil): /api/elo/:clave
let miElo = { fun: 1000, glory: 1000, top3: {} };
async function cargarElo() {
    try { const rec = await fetchElo(ratingKey()); miElo = { fun: rec?.fun?.r ?? 1000, glory: rec?.glory?.r ?? 1000, top3: rec?.top3 ?? {} }; } catch { /* sin conexión: el inicial */ }
    X.elo[0] = { v: miElo.glory, pool: 'glory', top3: !!miElo.top3.glory };
    if (pantalla === 'perfil') { PZ[0].dataset.k = ''; formas(); }
}

// ── Las salas abiertas (Unirse): cartas, y cada una una mesa en la misma sala oscura ──
let salas = [], firmaSalas = '';
function alListaSalas(lobbies) {
    const ESTADO = { waiting: 'En espera', starting: 'Empezando', playing: 'Jugando' };
    salas = [...lobbies].sort((a, b) => (a.status === 'waiting' ? 0 : 1) - (b.status === 'waiting' ? 0 : 1) || b.player_count - a.player_count);
    const firma = salas.map(l => `${l.id}${l.player_count}${l.status}${l.spectators}`).join('|');
    MENUS.unirse = salas.length ? salas.map(l => {
        const mirar = l.status !== 'waiting' || l.player_count >= l.max_players;
        return { clave: l.id, palo: `${l.player_count}/${l.max_players}`, nombre: l.id,
            nota: `${T(ESTADO[l.status] ?? 'En espera')}${l.spectators ? ' · ' + T('{n} mirando', { n: l.spectators }) : ''} · ${T(mirar ? 'Entrarás a mirar' : 'Entrarás a jugar')}`,
            accion: 'entrarSala', id: l.id, mirar };
    }) : [{ clave: 'nada', palo: 'i:vacio', nombre: 'No hay salas', nota: 'Crea una o escribe un código', accion: 'nada' }];
    if (firma === firmaSalas && mano.length) return;
    firmaSalas = firma;
    if (pantalla === 'unirse') { refrescarMano('unirse'); pintarMesas(); }
}
function pintarMesas() {
    X.mesas = salas.slice(0, 3).map((s, i) => ({
        x: [-5.2, 0, 5.2][i], z: [-4, -7.5, -4][i], desfase: 40 + i * 23, jugando: s.status === 'playing',
        ocup: [0, 1, 2, 3].map(p => p < s.player_count),
    }));
}

// ── Mensajes del servidor que se pintan aquí ───────────────────────────────────────
let marcaVoto = -1;
function alMensaje(msg) {
    switch (msg.type) {
        case 'lobby_list': alListaSalas(msg.lobbies ?? []); break;
        case 'lobby_update': {
            const llega = !!ultimaSala && ultimaSala.players.length < msg.players.length;
            ultimaSala = msg;
            sincronizarSala(llega);
            break;
        }
        case 'chat': decir(sinEmoji(msg.from), msg.text, false, msg.from === currentNickname); break;
        case 'chat_history': chatLog.length = 0; (msg.messages ?? []).forEach(l => chatLog.push({ quien: sinEmoji(l.from), txt: l.text, sistema: false, tuyo: l.from === currentNickname })); pintarChat(); break;
        case 'kick_poll': alVoto(msg); break;
        case 'kick_poll_ended': alFinVoto(msg); break;
        case 'kicked': ultimaSala = null; break;
        case 'game_start': cancelarCuentaVisual(); break;
    }
}
/** Votación para echar: quien vota tiene «Sí, fuera» / «No»; el votado y los demás, el estado. */
function alVoto(msg) {
    const gente = ordenSala(), i = gente.findIndex(p => p.nick === msg.nickname), quien = sinEmoji(msg.nickname);
    marcaVoto = i >= 0 && i < 4 ? i : -1;
    X.marca = marcaVoto;
    if (msg.yes?.length) X.voto = { a: Math.max(0, marcaVoto), t0: escena.ahora() };
    const puedo = !soyEspectador && msg.voters.includes(currentNickname) && !msg.yes.includes(currentNickname);
    MENUS.votar = puedo
        ? [{ clave: 'si', palo: 'i:fuera', nombre: T('Sí, fuera {n}', { n: quien }), nota: T('{y} de {t} a favor', { y: msg.yes.length, t: msg.voters.length }), accion: 'votoSi' },
           { clave: 'no', palo: 'i:volver', nombre: 'Que se quede', nota: 'Con un no, se queda', accion: 'votoNo' }]
        : [{ clave: 'espera', palo: 'i:reloj', nombre: msg.nickname === currentNickname ? '¿Te echan?' : 'Votando…', nota: T('{y} de {t} a favor', { y: msg.yes.length, t: msg.voters.length }), accion: 'nada' }];
    if (pantalla === 'votar') refrescarMano('votar');
    else if (EN_SALA.has(pantalla) && pantalla !== 'cuenta') {
        while (pantalla !== 'sala' && EN_SALA.has(historial.at(-1))) deshacerSinAnimar();
        irA('votar', T('¿Echar a {n}?', { n: quien }), {}, false);
    }
}
function alFinVoto(msg) {
    marcaVoto = -1; X.marca = -1; X.voto = null;
    if (pantalla === 'votar') deshacer();
    const textos = { expulsado: 'kick.done', rechazado: 'kick.no', tiempo: 'kick.timeout', salio: 'kick.left', cancelada: 'kick.cancelled' };
    if (textos[msg.result]) aviso(tl(textos[msg.result], { nick: sinEmoji(msg.nickname) }), 2600);
}

// ── Idioma: el de lobby.html (cambiarlo recarga la página, como siempre) ─────────────
// Los textos de aquí: clave = el texto en español, [inglés, chino]; {x} se sustituye.
const DIC = {
    'Partida rápida': ['Quick match', '快速匹配'], 'Te sienta en una mesa ya': ['Seats you at a table now', '马上给你安排一张桌子'],
    'Crear sala': ['Create room', '创建房间'], 'Tú eliges jugadores y quién entra': ['You choose players and who gets in', '你决定人数和谁能进'],
    'Unirse': ['Join', '加入房间'], 'Salas abiertas, código o QR': ['Open rooms, code or QR', '公开房间、代码或二维码'],
    'Intercambia': ['Swap', '交换'], 'Cambia cartas hasta que cada una de tus PILAS tenga la misma prenda': ['Swap cards until each of your PILES has the same garment', '交换卡牌，直到你的每个牌堆都是同一种衣物'],
    'Muestra': ['Reveal', '亮出'], 'Muestra una pila cuando creas que está completa. Todos lo ven': ['Reveal a pile when you think it is complete. Everyone sees it', '觉得牌堆凑齐了就亮出来，所有人都能看到'],
    'Verificamos': ['We check', '检查'], 'Si fallas, revisa tus pilas. Toca para volver': ['If the check fails, look at your piles again. Tap to go back', '检查未通过就再看看你的牌堆。点一下返回'],
    'Lleva tu Elo a tu cuenta': ['Take your Elo to your account', '把你的 Elo 带到账号里'], 'Mi burla': ['My taunt', '我的嘲讽'],
    'Pegar código': ['Paste code', '粘贴代码'], 'El de tu cuenta de Session Manager': ['The one from your Session Manager account', '你 Session Manager 账号里的代码'],
    'Desvincular': ['Unlink', '取消关联'], 'Vuelves al Elo de este navegador': ["Back to this browser's Elo", '回到这个浏览器的 Elo'],
    'Pasarlo': ['Move it', '转过去'], 'Tu Elo de aquí pasa a la cuenta': ['Your Elo here moves to the account', '把这里的 Elo 转到账号'],
    'No, borrarlo': ['No, delete it', '不，删掉'], 'Empiezas con el de la cuenta': ["You start with the account's", '使用账号里的 Elo'],
    'Copiar enlace': ['Copy link', '复制链接'], 'Para mandarlo por chat': ['To send it in a chat', '发到聊天里'],
    'Cerrar cámara': ['Close camera', '关闭摄像头'], 'Apunta al QR de otra pantalla': ['Point at the QR on another screen', '对准另一块屏幕上的二维码'],
    'Jugar la próxima': ['Play the next one', '下一局上场'], 'Te sientas al acabar': ['You sit down when it ends', '这局结束后入座'],
    'Salir': ['Leave', '离开'], 'Dejar de mirar': ['Stop watching', '停止观战'],
    'VS bots': ['VS bots', '对战机器人'], 'Tres bots se sientan ya': ['Three bots sit down now', '马上坐下三个机器人'],
    'Seguir buscando': ['Keep searching', '继续寻找'], 'Esperar a personas': ['Wait for people', '等真人玩家'],
    'Honk de payaso': ['Clown honk', '小丑喇叭'], 'Trombón triste': ['Sad trombone', '悲伤长号'], 'Boing': ['Boing', '嘣'],
    'Risa cartoon': ['Cartoon laugh', '卡通笑声'], 'Pedorreta': ['Raspberry', '噗噗声'], 'Sirena cómica': ['Silly siren', '搞笑警笛'],
    'Silbido que cae': ['Falling whistle', '下坠口哨'], 'Campanita burlona': ['Mocking bell', '嘲讽小铃铛'], 'Gallo': ['Rooster', '公鸡'],
    'Pato': ['Duck', '鸭子'], 'Ninguna': ['None', '无'], 'Suena a quien llegue tarde a tu carta': ['Plays for whoever is late to your card', '谁晚一步抢你的牌，就对谁响起'],
    'Abrir sala': ['Open room', '开房间'], 'Con los jugadores y la privacidad de arriba': ['With the players and privacy above', '按上面的人数和隐私设置'],
    'En espera · Entrarás a jugar': ['Waiting · You will play', '等待中 · 将以玩家身份加入'], 'Jugando · Entrarás a mirar': ['Playing · You will watch', '游戏中 · 将以观战者身份加入'],
    'Estoy listo': ["I'm ready", '我准备好了'], 'Cuando estén todos, se reparte': ['When everyone is in, cards are dealt', '人齐了就发牌'],
    'Rellenar con bots': ['Fill with bots', '用机器人补位'], 'Mirar': ['Watch', '观战'], 'Pasar a espectador': ['Become a spectator', '改为观战'],
    'Añadir bot': ['Add bot', '添加机器人'], 'Con la dificultad de arriba': ['With the difficulty above', '按上面的难度'],
    'Llenar': ['Fill', '补满'], 'Todos los huecos': ['Every empty seat', '所有空位'], 'Quitar bot': ['Remove bot', '移除机器人'], 'El último que entró': ['The last one in', '最后加入的那个'],
    'Echar a {n}': ['Kick {n}', '踢出 {n}'], 'Votan todos: si alguien dice no, se queda': ['Everyone votes: one no and they stay', '所有人投票：只要有人反对就留下'],
    'Mejor no': ['Never mind', '算了'], 'Volver a la sala': ['Back to the room', '回到房间'],
    // Rótulos de nivel
    'Juega': ['Play', '开玩'], 'Tu mesa': ['Your table', '你的桌子'], 'Elige mesa': ['Pick a table', '选桌子'], 'Escanea': ['Scan', '扫码'],
    'Mirando': ['Watching', '观战中'], 'Esperando': ['Waiting', '等待中'], 'Rivales': ['Rivals', '对手'], 'Invita': ['Invite', '邀请'],
    '¿Echar?': ['Kick?', '踢出？'], '¿Bots?': ['Bots?', '机器人？'], '¡Ya!': ['Go!', '开始！'], 'Tú': ['You', '你'], 'Vincular': ['Link', '关联'],
    'Tu Elo': ['Your Elo', '你的 Elo'], 'Burla': ['Taunt', '嘲讽'], 'Aprende': ['Learn', '学玩法'], '¡A jugar!': ["Let's play!", '开局！'],
    // Cabeceras
    'Perfil': ['Profile', '个人资料'], 'Cómo jugar': ['How to play', '玩法'], 'Escanear QR': ['Scan QR', '扫描二维码'], 'Invitar': ['Invite', '邀请'],
    '¿Pasar tu Elo a la cuenta?': ['Move your Elo to the account?', '把你的 Elo 转到账号吗？'], 'Echar': ['Kick', '踢出'],
    // Piezas
    '? Reglas': ['? Rules', '? 规则'], 'Jugadores': ['Players', '玩家'], 'Pública': ['Public', '公开'], 'Privada': ['Private', '私密'],
    'Código · entra al escribir la 6.ª letra': ['Code · joins at the 6th letter', '代码 · 输入第 6 位即进入'], 'Escanear QR': ['Scan QR', '扫描二维码'], 'Jugando · 1 mirando · Entrarás a mirar': ['Playing · 1 watching · You will watch', '对局中 · 1 人观战 · 你将观战'],
    'Chat de la sala': ['Room chat', '房间聊天'], 'Escribe aquí :D': ['Type here :D', '在这里输入 :D'],
    'Fácil': ['Easy', '简单'], 'Normal': ['Normal', '普通'], 'Difícil': ['Hard', '困难'],
    // Avisos y estado
    'Entraste en {c}': ['You joined {c}', '你加入了 {c}'], '{n} entró': ['{n} joined', '{n} 加入了'], '{n} salió': ['{n} left', '{n} 离开了'],
    'Bot {i} ({d}) se sentó': ['Bot {i} ({d}) sat down', '机器人 {i}（{d}）坐下了'],
    '{n}/{max} en la sala · {r} de {n} listos · {pool}': ['{n}/{max} in the room · {r} of {n} ready · {pool}', '房间里 {n}/{max} · {r}/{n} 已准备 · {pool}'],
    'For fun · con bots': ['For fun · with bots', 'For fun · 有机器人'], 'For glory · solo personas': ['For glory · people only', 'For glory · 只有真人'],
    'No hay oponentes dignos...': ['No worthy opponents...', '没有像样的对手……'], 'Desmárcate (↓) para cancelar': ['Unready (↓) to cancel', '取消准备（↓）即可取消倒计时'],
    'Cuenta atrás cancelada · {m}': ['Countdown cancelled · {m}', '倒计时已取消 · {m}'], 'Alguien ya no está listo': ['Someone is no longer ready', '有人取消了准备'],
    'Estás mirando · {c}': ['You are watching · {c}', '你正在观战 · {c}'], 'Estás mirando': ['You are watching', '你正在观战'],
    'No se pudo cargar el generador de QR': ['Could not load the QR generator', '无法加载二维码生成器'],
    'Este navegador no lee QR: escribe el código': ["This browser can't read QR codes: type the code", '这个浏览器读不了二维码：请手动输入代码'],
    'No se pudo abrir la cámara. Escribe el código a mano.': ['Could not open the camera. Type the code by hand.', '无法打开摄像头，请手动输入代码。'],
    'Se perdió la conexión. Reintentando… (intento {n})': ['Connection lost. Retrying… (attempt {n})', '连接已断开，正在重试……（第 {n} 次）'],
    'Conectado al servidor': ['Connected to the server', '已连接服务器'], 'Conectando...': ['Connecting...', '连接中……'],
    'No se anuncia: pasa el código o el QR': ['Not listed: share the code or the QR', '不公开：请分享代码或二维码'], 'Cualquiera puede entrar': ['Anyone can join', '任何人都能加入'],
    'Tu burla: {n}': ['Your taunt: {n}', '你的嘲讽：{n}'], 'Sin burla': ['No taunt', '没有嘲讽'], 'Pega aquí tu código': ['Paste your code here', '在这里粘贴代码'],
    '✓ Vinculado': ['✓ Linked', '✓ 已关联'], 'Elo de este navegador': ["This browser's Elo", '这个浏览器的 Elo'],
    'Elo vinculado a tu cuenta': ['Elo linked to your account', 'Elo 已关联到你的账号'], 'Empiezas con el Elo de la cuenta': ["You start with the account's Elo", '使用账号里的 Elo'],
    '✓ Jugarás la próxima': ['✓ You play the next one', '✓ 下一局上场'], 'Te sentarás al acabar esta': ['You will sit down when this one ends', '这局结束后你会入座'],
    'No hay bots': ['No bots', '没有机器人'], '¿Echar a {n}? · {y} de {t} a favor': ['Kick {n}? · {y} of {t} in favor', '踢出 {n}？· {y}/{t} 赞成'],
    '{n} fue expulsado': ['{n} was kicked out', '{n} 被踢出了房间'], 'La sala está llena': ['The room is full', '房间已满'],
    'Jugar': ['Play', '上场'], 'Volver a la mesa': ['Back to the table', '回到牌桌'], 'Miras la partida': ['You watch the game', '你在观战'], 'Juegas': ['You play', '你上场'],
    '{c} · enlace copiado': ['{c} · link copied', '{c} · 链接已复制'], 'Listo ✓': ['Ready ✓', '已准备 ✓'], 'Todos listos · ¡se reparte!': ['All ready · dealing!', '全员准备 · 发牌！'],
    'TÚ': ['YOU', '你'], 'Conectado': ['Connected', '已连接'], 'pega tu código': ['paste your code', '粘贴代码'], '✓ VINCULADO': ['✓ LINKED', '✓ 已关联'],
    'toca o ← → elegir · toca de nuevo o ↑ al centro · ↓ volver': ['tap or ← → choose · tap again or ↑ to the center · ↓ back', '点击或 ← → 选择 · 再点或 ↑ 打到中央 · ↓ 返回'],
    // Rangos (rank.* de i18n.js)
    'Hierro oxidado': ['Rusty iron', '生锈铁'], 'Bronce': ['Bronze', '青铜'], 'Plata': ['Silver', '白银'], 'Oro': ['Gold', '黄金'], 'Platino': ['Platinum', '铂金'],
    'Diamante': ['Diamond', '钻石'], 'Máster': ['Master', '大师'], 'Gran máster': ['Grandmaster', '宗师'], 'Top 3 global': ['Global top 3', '全球前三'],
    '▲ Asciendes': ['▲ Rank up', '▲ 升段'], '▼ Desciendes': ['▼ Rank down', '▼ 降段'],
    'Cartón': ['Cardboard', '纸板'], 'Juguete': ['Toy', '玩具'], 'Latón': ['Brass', '黄铜'], 'Caucho': ['Rubber', '橡胶'], 'Plástico': ['Plastic', '塑料'],
    'Gominola': ['Gummy', '软糖'], 'Dulce': ['Candy', '糖果'], 'Confeti': ['Confetti', '彩纸'], 'Payaso': ['Clown', '小丑'],
    'Elige un nombre primero': ['Pick a name first', '先起个名字'], 'Buscando mesa…': ['Looking for a table…', '正在找桌子……'],
    'Abriendo sala…': ['Opening the room…', '正在开房间……'], 'Entrando…': ['Joining…', '正在加入……'],
    'No se pudo cargar el QR': ['Could not load the QR', '无法加载二维码'], 'Código no válido': ['Invalid code', '代码无效'],
    'Salir de la cola': ['Leave the queue', '退出排队'], 'Quiero jugar': ['I want to play', '我要上场'],
    'Te sentarás cuando haya hueco': ['You will sit when a seat frees up', '有空位就入座'], 'Pides sitio en la mesa': ['Ask for a seat at the table', '申请入座'],
    'Sí, fuera {n}': ['Yes, kick {n}', '对，踢出 {n}'], '{y} de {t} a favor': ['{y} of {t} in favor', '{y}/{t} 赞成'],
    'Que se quede': ['Let them stay', '让他留下'], 'Con un no, se queda': ['One no and they stay', '有人反对就留下'],
    '¿Te echan?': ['Kicking you?', '要踢你？'], 'Votando…': ['Voting…', '投票中……'], '¿Echar a {n}?': ['Kick {n}?', '踢出 {n}？'],
    'No hay salas': ['No rooms', '没有房间'], 'Crea una o escribe un código': ['Create one or type a code', '创建一个或输入代码'],
    'En espera': ['Waiting', '等待中'], 'Empezando': ['Starting', '即将开始'], 'Jugando': ['Playing', '游戏中'], '{n} mirando': ['{n} watching', '{n} 人观战'],
    'Entrarás a mirar': ['You will watch', '你将观战'], 'Entrarás a jugar': ['You will play', '你将上场'], 'Sala': ['Room', '房间'],
    'Código': ['Code', '代码'], 'Enlace copiado': ['Link copied', '链接已复制'],
};
const LENGUA = { es: -1, en: 0, zh: 1 }[window.PilesI18n?.lang] ?? -1;
function T(s, v = {}) {
    const r = LENGUA < 0 ? s : (DIC[s]?.[LENGUA] ?? s);
    return String(r).replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
}
const IDIOMAS = { ES: 'es', EN: 'en', '中文': 'zh' };

// ── Piezas: tres figuras que se transforman en lo que la pantalla necesita ─────────
//   inicio: tu perfil (junto a tu nombre) · las reglas
//   crear:  cuántos jugadores · pública o privada
//   unirse: escribir un código · escanear un QR
//   sala:   el chat (siempre) · el código (toca: QR) · en bots, la dificultad
//   perfil: tus dos diales de Elo · el idioma
const PZ = ['p1', 'p2', 'p3'].map(id => document.getElementById(id));
const DIFS = { Fácil: 'easy', Normal: 'normal', Difícil: 'hard' };
function caja(el, x, y, w, h, html, clave) {
    el.classList.remove('oculta');
    Object.assign(el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    if (el.dataset.k !== clave) { el.dataset.k = clave; el.innerHTML = `<div class="dentro">${html}</div>`; return true; }
    return false;
}
function plegar(el) { el.classList.add('oculta'); el.dataset.k = ''; }
// Opciones contiguas: una fila con un resalte que se desliza (--i = la elegida, --n = cuántas)
const seg = (act, valores, actual) => `<div class="fila segs" style="--n:${valores.length};--i:${Math.max(0, valores.indexOf(actual))}">` +
    valores.map(v => `<button class="seg${v === actual ? ' si' : ''}" data-act="${act}" data-v="${v}">${T(v)}</button>`).join('') + '<i class="resalte"></i></div>';
// Tambor de números: arrastra arriba/abajo, rueda del ratón, o − / +
const tambor = (act, min, max, v) => `<span class="tambor" data-tambor="${act}" data-min="${min}" data-max="${max}" style="--v:${v};--min:${min}" role="spinbutton" aria-valuenow="${v}" aria-valuemin="${min}" aria-valuemax="${max}"><span class="rodillo">` +
    Array.from({ length: max - min + 1 }, (_, k) => `<span${k + min === v ? ' class="ya"' : ''}>${k + min}</span>`).join('') + '</span></span>';
function girarTambor(el, v) {
    const min = +el.dataset.min, max = +el.dataset.max; v = Math.max(min, Math.min(max, v));
    el.style.setProperty('--v', v); el.setAttribute('aria-valuenow', v);
    el.querySelectorAll('.rodillo span').forEach((s, k) => s.classList.toggle('ya', k + min === v));
    return v;
}
// Jugadores de la sala nueva: se pasan a createLobby(crearJug) al abrirla
const AL_GIRAR = { jug: v => { if (v !== crearJug) vibrar(6); crearJug = v; } };
let arrastre = null;
document.addEventListener('pointerdown', e => { const t0 = e.target.closest('#escenario .tambor'); if (!t0) return; arrastre = { t: t0, y: e.clientY, v: +t0.style.getPropertyValue('--v') }; t0.setPointerCapture(e.pointerId); });
document.addEventListener('pointermove', e => { if (!arrastre) return; const { t: t0, y, v } = arrastre; AL_GIRAR[t0.dataset.tambor]?.(girarTambor(t0, v + Math.round((y - e.clientY) / 24))); });
document.addEventListener('pointerup', () => { arrastre = null; });
document.addEventListener('wheel', e => { const t0 = e.target.closest('#escenario .tambor'); if (!t0) return; e.preventDefault(); AL_GIRAR[t0.dataset.tambor]?.(girarTambor(t0, +t0.style.getPropertyValue('--v') + (e.deltaY < 0 ? 1 : -1))); }, { passive: false });
function formas(p = pantalla) {
    const R = rejilla(), w = R.w, an = ancho(), enSala = EN_SALA.has(p) && p !== 'cuenta';
    const col = Math.min(320, w - 2 * M), der = w - M - col;
    const usadas = new Set();
    const pon3 = (i, ...a) => { usadas.add(i); return caja(PZ[i], ...a); };
    if (p === 'inicio') {
        pon3(0, M + R.cabw + SEP, FILA2, 44, 40, `<button class="grande" data-act="perfil" aria-label="${T('Perfil')}">${ico('persona')}</button>`, 'perfil');
        pon3(1, w - M - 110, FILA2, 110, 40, `<button class="grande" data-act="ayuda" style="font-size:.8rem">${T('? Reglas')}</button>`, 'ayuda');
    }
    if (p === 'crear') {
        pon3(0, M, ZONA, col, 126, `<span class="rotulo">${T('Jugadores')}</span><div class="fila"><button data-act="menos" aria-label="−">${ico('menos')}</button>${tambor('jug', 2, 8, crearJug)}<button data-act="mas" aria-label="+">${ico('mas')}</button></div>`, 'jug');
        pon3(1, M, ZONA + 126 + SEP, col, 44, seg('privacidad', ['Pública', 'Privada'], lobbyIsPublic ? 'Pública' : 'Privada'), 'priv');
    }
    if (p === 'unirse') {
        pon3(0, M, ZONA, col, 72, `<span class="rotulo">${T('Código')}</span><button class="grande" data-act="codigo"><span class="num">______</span></button>`, 'cod');
        pon3(1, M, ZONA + 72 + SEP, col, 44, `<button class="grande" data-act="escanear">${ico('camara')} ${T('Escanear QR')}</button>`, 'esc');
    }
    if (enSala && currentLobbyId && !(p === 'qr' && !an)) {
        // En la sala no hay franja de estado (se ve en las cartas y en el chip): el chat llega hasta
        // la mano. Entre los jugadores y el chat queda el hueco donde se ve la pelea por la carta (al
        // menos 120 px): la cámara de la sala se centra en él.
        const bajoJug = ZONA + filasSala() * 107 + SEP, fondo = R.estadoAbajo, PELEA = 120;
        const ch = an ? Math.max(88, Math.min(420, fondo - ZONA)) : Math.max(88, Math.min(300, fondo - bajoJug - PELEA - (p === 'bots' ? 52 : 0)));
        const y = an ? ZONA : fondo - ch;
        if (p === 'bots') pon3(2, M, an ? ZONA : y - 44 - SEP, col, 44, seg('dif', ['Fácil', 'Normal', 'Difícil'], Object.keys(DIFS).find(k => DIFS[k] === botDifficulty) ?? 'Normal'), 'dif');
        const finHueco = an ? fondo : (p === 'bots' ? y - 44 - SEP : y) - SEP;
        const cyPelea = (bajoJug + finHueco) / 2 / R.h;
        escena.fijarCy('sala', cyPelea); escena.fijarCy('bots', cyPelea);
        const cx = an ? der : M, cw = an ? col : w - 2 * M;
        if (pon3(0, cx, y, cw, ch,
            `<span class="rotulo">${T('Chat de la sala')}</span><div class="log" aria-live="polite"></div><button class="escribe" data-act="chat">${T('Escribe aquí :D')}</button>`, 'chat')) pintarChat();
        // El chip de la sala: su clasificación (FUN = con bots, GLORY = solo personas), el código y el QR
        const qw = an ? col : Math.min(162, w - 2 * M - R.cabw - SEP), pool = ultimaSala?.pool === 'fun' ? 'fun' : 'glory';
        if (pon3(1, w - M - qw, FILA2, qw, 40, `<button class="grande" data-act="qr" aria-label="QR"><span class="pool" data-pool="${pool}" title="${T(pool === 'fun' ? 'For fun · con bots' : 'For glory · solo personas')}">${pool === 'fun' ? 'FUN' : 'GLORY'}</span><span class="cod"></span>${ico('qr')}</button>`, `codsala:${currentLobbyId}:${pool}`))
            PZ[1].querySelector('.cod').textContent = currentLobbyId;
    }
    if (p === 'perfil') {
        // Los dos Elos uno encima del otro, en la columna de las piezas (como crear o unirse)
        const ALTO_ELO = 272;
        const nuevo = pon3(0, M, ZONA, col, ALTO_ELO, `<span class="rotulo">${T('Tu Elo')}</span><div class="diales"><div data-dial="fun"></div><div data-dial="glory"></div></div>`, 'diales');
        if (nuevo && typeof agDial === 'function') {
            agDial(PZ[0].querySelector('[data-dial="fun"]'), { from: miElo.fun, to: miElo.fun, skin: 'fun', top3Before: !!miElo.top3.fun });
            agDial(PZ[0].querySelector('[data-dial="glory"]'), { from: miElo.glory, to: miElo.glory, skin: 'glory', top3Before: !!miElo.top3.glory });
        }
        const actual = Object.keys(IDIOMAS).find(k => IDIOMAS[k] === window.PilesI18n?.lang) ?? 'ES';
        pon3(1, M, ZONA + ALTO_ELO + SEP, col, 44, seg('idioma', Object.keys(IDIOMAS), actual), 'idioma');
    }
    PZ.forEach((el, i) => { if (!usadas.has(i)) plegar(el); });
}
function actuar(act, b) {
    const marca = () => {   // el resalte se desliza hasta la nueva
        const fila = b.parentElement, segs = [...fila.querySelectorAll('.seg')];
        segs.forEach(s => s.classList.toggle('si', s === b));
        fila.style.setProperty('--i', segs.indexOf(b));
    };
    vibrar(8);
    if (act === 'perfil') irA('perfil', 'Perfil');
    else if (act === 'ayuda') irA('tutorial', 'Cómo jugar');
    else if (act === 'menos' || act === 'mas') AL_GIRAR.jug(girarTambor(b.parentElement.querySelector('.tambor'), crearJug + (act === 'mas' ? 1 : -1)));
    else if (act === 'privacidad') { const pub = b.dataset.v === 'Pública'; conLobby(() => setVisibility(pub)); marca(); }
    else if (act === 'dif') { setBotDifficulty(DIFS[b.dataset.v] ?? 'normal'); marca(); }
    else if (act === 'idioma') { marca(); setTimeout(() => window.PilesI18n?.setLang(IDIOMAS[b.dataset.v]), 300); }
    else if (act === 'escanear') irA('visor', 'Escanear QR');
    else if (act === 'qr' && currentLobbyId && pantalla !== 'qr') irA('qr', 'Invitar');
    else if (act === 'codigo') pedir('ABC123', 6, v => entrarCodigo(v), txt => {
        b.querySelector('.num').textContent = txt.padEnd(6, '_');
        if (txt.length === 6) { cerrarCampo(); entrarCodigo(txt); }
    });
    else if (act === 'chat' && currentLobbyId) pedir(T('Escribe aquí :D'), 300, txt => sendChat(txt));
}
document.addEventListener('click', e => { const b = e.target.closest('#escenario .pieza [data-act]'); if (b) actuar(b.dataset.act, b); });
function entrarCodigo(cod) {
    const code = extractLobbyCode(cod);
    if (!code) { sacude(PZ[0]); return; }   // el recuadro del código tiembla
    joinLobby(code);
}
// El chat de la sala (lo guarda el servidor mientras dura la sala, nunca en las grabaciones)
const chatLog = [];
function decir(quien, txt, sistema = false, tuyo = false) {
    chatLog.push({ quien, txt, sistema, tuyo });
    if (chatLog.length > 60) chatLog.shift();
    pintarChat();
}
function pintarChat() {
    const log = document.querySelector('#escenario .pieza .log'); if (!log) return;
    log.textContent = '';
    for (const m of chatLog.slice(-14)) {
        const d = document.createElement('div');
        if (m.sistema) { d.className = 'sis'; d.textContent = m.txt; }
        else { const b = document.createElement('b'); b.textContent = m.quien + ' '; if (m.tuyo) b.className = 'tuyo'; d.append(b, m.txt); }
        log.append(d);
    }
}
// Los diales de Elo de cada jugador, flotando delante de su pecho, casi pegados a la mesa.
// Si su Elo cambia (la misma persona), el tambor gira hasta él.
const dialesMesa = [...document.querySelectorAll('.dialMesa')], claveDial = ['', '', '', ''];
// Un dial que tocaría algo del menú, o se saldría de la pantalla, se esconde: la interfaz manda.
const OCUPA = '#escenario .pieza:not(.oculta), #cartas > .carta, #estado, #titulo, #nombre, #campo.abierto';
function chocaDial(b, ocupado) {
    if (b.left < SEP || b.top < SEP || b.right > W() - SEP || b.bottom > H() - SEP) return true;
    return ocupado.some(o => b.left < o.right + SEP && b.right > o.left - SEP && b.top < o.bottom + SEP && b.bottom > o.top - SEP);
}
function moverDiales() {
    requestAnimationFrame(moverDiales);
    if (document.body.classList.contains('en-partida') || typeof agDial !== 'function') return;
    const ocupado = [...document.querySelectorAll(OCUPA)]
        .filter(e => e.offsetParent !== null && +getComputedStyle(e).opacity > 0.3)
        .map(e => e.getBoundingClientRect());
    const tam = dialesMesa.map(el => [el.offsetWidth, el.offsetHeight]);   // todas las lecturas antes de escribir
    X.anclas.forEach((a, p) => {
        const el = dialesMesa[p], e = X.elo?.[p];
        const ok = a.ok && e;
        if (!ok) { el.style.opacity = 0; return; }
        const quien = X.nombres?.[p] ?? `top${p}`, k = `${quien}|${e.v}|${e.pool}|${!!e.top3}`;
        if (claveDial[p] !== k) {
            const [antesQuien, antesV] = claveDial[p].split('|');
            const antes = antesQuien === quien ? Number(antesV) : e.v;
            claveDial[p] = k;
            agDial(el, { from: antes, to: e.v, skin: e.pool, top3Before: !!e.top3 });
        }
        const s = a.s * (W() < 760 ? 0.75 : 1);
        el.style.transform = `translate(${a.x}px, ${a.y}px) translate(-50%, -100%) scale(${s})`;
        // Su caja, calculada (origen abajo al centro): leer getBoundingClientRect justo después de
        // escribir el transform forzaba a recalcular estilos 4 veces por cuadro.
        const [w, h] = tam[p];
        el.style.opacity = chocaDial({ left: a.x - w * s / 2, right: a.x + w * s / 2, top: a.y - h * s, bottom: a.y }, ocupado) ? 0 : 1;
        el.classList.toggle('tuyo', p === X.tu);
    });
}
requestAnimationFrame(moverDiales);

function accion(a, c, o = {}) {
    if (a === 'nada') { salta(c); return; }
    if (a === 'volver') { volver(); return; }
    if (a === 'rapida') { seVa(c); quickMatch(); return; }
    if (a === 'abrir') { seVa(c); createLobby(crearJug); return; }
    if (a === 'entrarSala') { seVa(c); joinLobby(o.id, o.mirar); return; }
    if (a === 'burla') {   // elegir (la guarda lobby.html) y volver al perfil
        try { localStorage.setItem('piles.taunt', o.id); } catch { /* modo privado */ }
        salta(c); setTimeout(volver, 380);
        return;
    }
    if (a === 'smCodigo') {   // lo que escribes aparece en la placa; al confirmar, lobby.html lo guarda y vincula
        pedir(T('Pega aquí tu código'), 12, v => {
            setSmCode(v);
            X.placa = { txt: smCodeGuardado(), ok: true }; vibrar(30);
        }, txt => { X.placa = { txt, ok: false }; });
        return;
    }
    if (a === 'smBorrar') { clearSmCode(); X.placa = { txt: '', ok: false }; salta(c); return; }
    if (!currentLobbyId) return;
    if (a === 'listo') { toggleReady(); vibrar(20); menuSala(); refrescarMano('sala'); return; }
    if (a === 'rol') { cambiarRol(); seVa(c); return; }
    if (a === 'ofertaBots') { acceptBotsOffer(); cerrarOferta(); return; }
    if (a === 'seguir') { cancelQuickMatchOffer(true); cerrarOferta(); return; }
    // Bots: la carta se va hasta que la sala llega a los jugadores pedidos (sincronizarSala)
    const m = ultimaSala, n = m?.players.length ?? 0;
    if (a === 'bot') { if (n < m.max_players) { addBot(); pideBots(c, n + 1); } return; }
    if (a === 'llenar') { for (let k = n; k < m.max_players; k++) addBot(); if (n < m.max_players) pideBots(c, m.max_players); return; }
    if (a === 'quitarBot') {
        const bot = [...(m?.players ?? [])].reverse().find(p => p.is_bot);
        if (bot) { removeBot(bot.id); pideBots(c, n - 1); } else aviso(T('No hay bots'));
        return;
    }
    if (a === 'echar') { send({ type: 'start_kick', target: o.id }); salta(c); deshacer(); return; }   // llega kick_poll: a votar
    if (a === 'votoSi' || a === 'votoNo') { send({ type: 'kick_vote', yes: a === 'votoSi' }); seVa(c); return; }
    if (a === 'copiar') {
        const link = joinLinkFor(currentLobbyId);
        navigator.clipboard?.writeText(link).then(() => aviso(T('Enlace copiado')), () => aviso(link, 4000));
        salta(c); return;
    }
}

// ── Entrada: deslizar de lado elige, ↑ lanza, ↓ vuelve; teclado igual ────────
// Todo sigue al dedo desde que toca: de lado, la mano se desliza con él; hacia arriba, la carta
// elegida sube, el resto se aparta y la cámara se asoma al menú siguiente; hacia abajo, la cabecera
// baja y se asoma el menú anterior. Hasta soltar no pasa nada: si vuelves atrás, todo vuelve.
const RECORRIDO = 190;   // px de arrastre para el cambio completo
let ini = null;
const sinTransicion = els => els.forEach(c => { if (c) c.style.transition = 'none'; });
function arrastrarV(dy) {
    const sube = dy < 0, p = Math.min(1, Math.abs(dy) / RECORRIDO);
    const c = mano[sel], o = MENUS[pantalla]?.[sel], h = cabeceras.at(-1), prev = cabeceras.at(-2);
    if (sube && c) {
        // Una acción solo amaga (no cambia de menú), pero cuenta igual: ini.p es el recorrido real,
        // no el amago. Antes se guardaba el amago (≤ 0,3 < 0,45) y una acción deslizada sin prisa
        // no se hacía nunca. Pasado el punto, la carta se enciende: soltar ya la juega.
        const destino = o?.ir, q = destino ? p : Math.min(p, 0.3);
        if (!destino) c.classList.toggle('arma', p >= 0.45 && !c.disabled);
        sinTransicion(mano); sinTransicion([h]);
        const { x, y, s } = ini.base;
        pon(c, x + (M - x) * q * 0.55, y + (FILA2 - y) * q, -6 * q, s + (0.62 - s) * q);
        mano.forEach((x2, i) => { if (i !== sel) { const k = i - sel; pon(x2, W() / 2 - 64 + k * 112 * rejilla().es + Math.sign(k) * 60 * q, ini.base.y + 30 + 90 * q, k * 5 + Math.sign(k) * 10 * q, .9 * rejilla().es); x2.style.opacity = 1 - 0.7 * q; } });
        if (h) h.style.filter = `brightness(${1 - 0.58 * q})`;
        escena.asomar(destino ?? null, q, 1);
        ini.p = p; ini.sentido = 1;
    } else if (!sube && h && historial.length && pantalla !== 'cuenta') {
        sinTransicion([h]); sinTransicion(mano);
        h.style.zIndex = 20;   // la cabecera que baja va por encima de las piezas
        pon(h, M + (W() / 2 - 64 - M) * p * 0.6, FILA2 + (rejilla().manoTop - FILA2) * p * 0.8, 6 * p, 1 + 0.2 * p);
        if (prev) prev.style.filter = `brightness(${0.42 + 0.58 * p})`;
        mano.forEach((x2, i) => { const k = i - sel; pon(x2, W() / 2 - 64 + k * 112 * rejilla().es + W() * 0.6 * p, ini.base.y + (k ? 12 : 0), k * 5 + 12 * p, .9 * rejilla().es); x2.style.opacity = 1 - 0.6 * p; });
        escena.asomar(historial.at(-1), p, -1);
        ini.p = p; ini.sentido = -1;
    } else { ini.p = 0; escena.asomar(null); }
}
function soltarTodo() {   // quita lo fijado al dedo; lo siguiente que se coloque vuelve a animarse
    [...mano, ...cabeceras].forEach(c => { c.style.transition = ''; c.style.filter = ''; c.classList.remove('arma'); if (mano.includes(c)) c.style.opacity = ''; });
}
esc.addEventListener('pointerdown', e => {
    if (e.target === nombre || e.target === campo || e.target.closest('.pieza')) return;
    const c = mano[sel], R = rejilla(), s0 = 1.08 * R.es;
    ini = { x: e.clientX, y: e.clientY, t: Date.now(), sel, eje: null, p: 0, sentido: 0,
        base: { x: W() / 2 - 64, y: R.manoTop - 88 + 88 * s0, s: s0 } };
    if (c && !c.disabled) { c.style.transition = 'transform 140ms ease-out'; pon(c, ini.base.x, ini.base.y - 8, 0, s0 * 1.04); }   // al tocar, la carta ya responde
    esc.setPointerCapture(e.pointerId);
});
esc.addEventListener('pointermove', e => {
    if (!ini) return;
    const dx = e.clientX - ini.x, dy = e.clientY - ini.y;
    if (!ini.eje && Math.hypot(dx, dy) > 8) ini.eje = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    if (ini.eje === 'h' && mano.length) {
        const n = Math.max(0, Math.min(mano.length - 1, ini.sel + Math.round(-dx / 90)));   // cada 90 px, una carta
        if (n !== sel) { sel = n; vibrar(5); }
        const usado = -(sel - ini.sel) * 90, resto = dx - usado, borde = (sel === 0 && resto > 0) || (sel === mano.length - 1 && resto < 0);
        colocarMano(false, resto * (borde ? 0.3 : 112 / 90));
    } else if (ini.eje === 'v') arrastrarV(dy);
});
const cancelarArrastre = () => { if (!ini) return; ini = null; soltarTodo(); escena.asomar(null); colocarMano(); apilarCabeceras(); };
esc.addEventListener('pointercancel', cancelarArrastre);
esc.addEventListener('pointerup', e => {
    if (!ini) return;
    const dx = e.clientX - ini.x, dy = e.clientY - ini.y, t0 = Date.now() - ini.t;
    const { eje, p, sentido } = ini;
    ini = null;
    soltarTodo();
    const rapido = Math.abs(dy) > 40 && Math.abs(dy) / t0 > 0.6;   // un golpe corto y rápido también cuenta
    if (eje === 'v' && sentido && (p >= 0.45 || rapido)) {
        escena.confirmarAsomo();
        const esAccion = MENUS[pantalla]?.[sel]?.accion !== undefined, antes = pantalla;
        if (sentido > 0) jugar(); else volver();
        if (esAccion && pantalla === antes) colocarMano();   // una acción no cambia de menú: la carta vuelve
        return;
    }
    escena.asomar(null);
    if (eje) { colocarMano(); apilarCabeceras(); return; }   // no llegó: todo vuelve a su sitio
    colocarMano();
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && t0 < 350) {
        // Toque: en otra carta, la mano se desliza hasta ella; en la elegida, se juega
        const bajo = document.elementFromPoint(e.clientX, e.clientY);
        // La carta de otra persona en la sala: proponer echarla (solo quien lleva más tiempo sentado)
        const jug = bajo?.closest('.carta.jugador'), id = jug?.dataset.id;
        const p2 = ultimaSala?.players.find(x => x.id === id);
        if (pantalla === 'sala' && p2 && id !== currentPlayerId) {
            if (!p2.is_bot && ultimaSala.oldest === currentPlayerId && !soyEspectador && ultimaSala.status === 'waiting')
                irA('echar', 'Echar', { id, nick: sinEmoji(p2.nickname), idx: ordenSala().findIndex(x => x.id === id) });
            else salta(jug);
            return;
        }
        const c = bajo?.closest('#cartas .carta:not([disabled])');
        const i = mano.indexOf(c);
        if (i >= 0 && i !== sel) { sel = i; vibrar(6); colocarMano(); }
        else if (i === sel) jugar();
    }
});
addEventListener('keydown', e => {
    if (document.body.classList.contains('en-partida')) return;
    if (e.target === nombre || e.target === campo || e.target.closest?.('.elo-choice, #reconnectOverlay')) return;
    if (!document.getElementById('eloChoice')?.hidden) return;
    if (e.key === 'ArrowLeft') elegir(-1);
    else if (e.key === 'ArrowRight') elegir(1);
    else if (e.key === 'ArrowUp' || e.key === 'Enter') jugar();
    else if (e.key === 'ArrowDown' || e.key === 'Escape' || e.key === 'Backspace') volver();
    else return;
    e.preventDefault();
});
addEventListener('resize', () => { colocarMano(true); PZ.forEach(plegar); formas(); });

// Tu nombre: este campo es el único (lobby.html lo lee con miNombre()); se guarda en piles_nickname
try { nombre.value = localStorage.getItem('piles_nickname') || ''; } catch { /* sin storage */ }
nombre.placeholder = tl('home.nameph');
nombre.addEventListener('input', () => {
    const v = nombre.value.trim();
    try { if (v) localStorage.setItem('piles_nickname', v); } catch { /* */ }
});
nombre.addEventListener('keydown', e => e.stopPropagation());

// Conexión: la lámpara parpadea y todo se congela sin color mientras no hay WebSocket
let conectado = null;
setInterval(() => {
    const ok = !!ws && ws.readyState === WebSocket.OPEN;
    if (ok === conectado) return;
    conectado = ok;
    X.cortado = !ok; escena.congelar(!ok);
    // Sin texto: la escena apagada y la lámpara que parpadea ya dicen «sin conexión»
}, 400);

// Arranque: el menú de inicio (o la pantalla en la que deja lobby.html: enlace ?join=, vuelta
// tras cambiar de idioma, sala recuperada tras F5…)
document.body.classList.add('mesa');
MENUS.perfil[1].nota = TAUNTS.find(b => b.id === getTaunt())?.name ?? tl('taunt.none');
window.agText = window.agText ?? { up: tl('rank.up'), down: tl('rank.down') };
repartir(MENUS.inicio);
formas('inicio');
if (vistaActual !== 'homeScreen' && DE_LOBBY[vistaActual]) saltarA(DE_LOBBY[vistaActual]);

// Para depurar y para las pruebas con navegador
window.mesa = { escena, X, get pantalla() { return pantalla; }, get mano() { return mano; }, jugar, volver, elegir, irA };

})();
