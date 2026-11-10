// ─── Música de fondo ──────────────────────────────────────────────────────
//
// Dos arreglos de la misma pieza (client/musica/): el del MENÚ (calmado) y el de la
// PARTIDA (apurado, con huecos para los efectos). Tienen el mismo tempo, los mismos 28
// compases en 7/4 y la misma armonía, y duran lo mismo al fotograma. Por eso suenan A LA
// VEZ, en bucle y arrancados juntos, y lo único que cambia es cuál se oye: pasar de una
// a otra es un fundido de potencia constante (seno/coseno) y, como van sincronizadas, no
// hay salto de ritmo ni de acorde.
//
//   menú, sala, resultados   →  suena el menú
//   partida (de game_start a game_over)  →  suena la partida
//
// Se piden y decodifican una vez (≈ 30 MB en memoria cada una). Si el navegador no
// decodifica Ogg Vorbis (Safari anterior a 18.4) o falla la descarga, no suena música y
// el juego sigue como si nada. Sin música sintetizada: la racha ya suena en los efectos
// (`comboStep`).
import { emitir } from './bus.js';
import { est } from './estado.js';
import { audioCtx, unlockAudio, playSfx } from './sonido.js';

export type Pista = 'menu' | 'partida';
const PISTAS: Pista[] = ['menu', 'partida'];
const ARCHIVOS: Record<Pista, string> = { menu: '/musica/menu.ogg', partida: '/musica/partida.ogg' };
/** Volumen general: la música va por debajo de los efectos (que salen a 0,1–0,22). */
const NIVEL = 0.28;
const FUNDIDO_MS = 1400;

let maestra: GainNode | null = null;
const voces: Partial<Record<Pista, { gain: GainNode; src: AudioBufferSourceNode; dur: number }>> = {};
let arrancada = false;
let mezcla = 0;                  // 0 = solo el menú · 1 = solo la partida
let fundido: { desde: number; hacia: number; t0: number; ms: number } | null = null;
let reloj: ReturnType<typeof setInterval> | null = null;
let inicio = 0;                  // reloj del audio en que arrancaron las dos
let largoBucle = 0;

/** Pesos de cada pista para la mezcla actual: potencia constante (cos² + sen² = 1). */
function pesos(): Record<Pista, number> {
    if (voces.menu && !voces.partida) return { menu: 1, partida: 0 };
    if (voces.partida && !voces.menu) return { menu: 0, partida: 1 };
    return { menu: Math.cos(mezcla * Math.PI / 2), partida: Math.sin(mezcla * Math.PI / 2) };
}

function aplicar() {
    const ctx = audioCtx;
    if (!ctx) return;
    const w = pesos();
    // setTargetAtTime con una constante corta alisa los escalones del temporizador: sin chasquidos.
    for (const p of PISTAS) voces[p]?.gain.gain.setTargetAtTime(w[p], ctx.currentTime, 0.02);
}

function paso() {
    if (!fundido) { if (reloj) clearInterval(reloj); reloj = null; return; }
    const k = Math.min(1, (performance.now() - fundido.t0) / Math.max(fundido.ms, 1));
    const e = k * k * (3 - 2 * k);                       // sale y llega suave
    mezcla = fundido.desde + (fundido.hacia - fundido.desde) * e;
    if (k >= 1) {
        mezcla = fundido.hacia;
        fundido = null;
        if (reloj) clearInterval(reloj);
        reloj = null;
    }
    aplicar();
}

/** Qué pista tiene que oírse. Si aún no ha cargado nada, solo se recuerda; si ya suena, se funde. */
function ir(pista: Pista) {
    const hacia = pista === 'partida' ? 1 : 0;
    if (!voces.menu && !voces.partida) { mezcla = hacia; fundido = null; return; }
    if ((fundido ? fundido.hacia : mezcla) === hacia) return;
    fundido = { desde: mezcla, hacia, t0: performance.now(), ms: FUNDIDO_MS * Math.abs(hacia - mezcla) };
    reloj ??= setInterval(paso, 30);
}

/** El volumen general sigue al botón de silencio. Las pistas siguen sonando en silencio, para no perder la sincronía. */
function nivelMaestro() {
    if (!audioCtx || !maestra) return;
    maestra.gain.setTargetAtTime(est.sfxMuted ? 0 : NIVEL, audioCtx.currentTime, est.sfxMuted ? 0.05 : 0.5);
}

async function cargar(ctx: AudioContext) {
    const bufs: Partial<Record<Pista, AudioBuffer>> = {};
    await Promise.all(PISTAS.map(async p => {
        try {
            const r = await fetch(ARCHIVOS[p]);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const datos = await r.arrayBuffer();
            // Con callbacks: el Safari antiguo no devuelve promesa.
            bufs[p] = await new Promise<AudioBuffer>((ok, mal) => ctx.decodeAudioData(datos, ok, mal));
        } catch (e) { console.warn(`[música] ${p}: no se pudo cargar`, e); }
    }));
    const hay = PISTAS.filter(p => bufs[p]);
    if (!hay.length || !maestra) return;
    largoBucle = Math.min(...hay.map(p => bufs[p]!.duration));
    inicio = ctx.currentTime + 0.1;
    for (const p of hay) {
        const src = ctx.createBufferSource();
        src.buffer = bufs[p]!;
        src.loop = true;
        src.loopStart = 0;
        src.loopEnd = largoBucle;               // iguales: así no se desfasan nunca
        const gain = ctx.createGain();
        gain.gain.value = 0;
        src.connect(gain).connect(maestra);
        src.start(inicio);                      // las dos, en el mismo instante
        voces[p] = { gain, src, dur: bufs[p]!.duration };
    }
    aplicar();
    nivelMaestro();
}

/** Pide y arranca las dos pistas. Hay que llamarla desde un gesto del usuario (el navegador no deja sonar antes). */
export function arrancarMusica() {
    if (arrancada || est.sfxMuted) return;       // en silencio no se descarga nada: se arranca al activar el sonido
    unlockAudio();
    const ctx = audioCtx;
    if (!ctx) return;
    arrancada = true;
    if (ctx.state === 'suspended') void ctx.resume();
    maestra = ctx.createGain();
    maestra.gain.value = 0;
    maestra.connect(ctx.destination);
    void cargar(ctx);
}
// El primer gesto (un toque o una tecla: el menú se maneja con el teclado) abre el audio y arranca la música.
for (const ev of ['pointerdown', 'keydown'] as const) document.addEventListener(ev, arrancarMusica, { once: true });

/** Empieza la partida: se funde a la pista de la partida. */
export function startMusic() {
    arrancarMusica();
    ir('partida');
}

/** Acaba la partida (o no llegó a empezar): se funde a la del menú. */
export function stopMusic() {
    ir('menu');
}

/** Para las pruebas (tools/browser/musica.mjs): qué suena y cómo. */
export function estadoMusica() {
    const ctx = audioCtx;
    return {
        arrancada, cargadas: PISTAS.filter(p => voces[p]), mezcla, fundiendo: !!fundido,
        menu: voces.menu?.gain.gain.value ?? null, partida: voces.partida?.gain.gain.value ?? null, maestra: maestra?.gain.value ?? null,
        duraciones: { menu: voces.menu?.dur ?? null, partida: voces.partida?.dur ?? null }, largoBucle,
        fase: ctx && largoBucle ? (((ctx.currentTime - inicio) % largoBucle) + largoBucle) % largoBucle : null,
    };
}

export function toggleMute() {
    est.sfxMuted = !est.sfxMuted;
    try { localStorage.setItem('piles.mute', est.sfxMuted ? '1' : '0'); } catch { /* modo privado */ }
    const btn = document.getElementById('muteBtn');
    if (btn) {
        btn.textContent = est.sfxMuted ? '🔇' : '🔊';
        btn.title = t(est.sfxMuted ? 'game.unmute' : 'game.mute');
    }
    if (!est.sfxMuted) { unlockAudio(); playSfx('take'); arrancarMusica(); }
    nivelMaestro();
    emitir('toggleMute');
}
