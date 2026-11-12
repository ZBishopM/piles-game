// ─── Música de fondo ──────────────────────────────────────────────────────
//
// «Carrera de calcetines» (client/musica/), en dos versiones que NO son la misma con otros
// instrumentos, sino dos tempos y dos caracteres:
//
//   · MENÚ: a 92, de ascensor. Vibráfono y flauta, piano eléctrico, contrabajo y escobillas.
//     Suena en el menú, la sala y los resultados, en bucle.
//   · PARTIDA: a 184, el doble de rápida y dramática. Empieza SIEMPRE por el principio: un piano
//     solo la anuncia (4 compases), entran las cuerdas y un redoble, y de ahí la guitarra, la
//     batería de rock y la sección de cuerdas. Esa introducción no entra en el bucle
//     (`loopStart`): solo suena al empezar cada partida.
//
// El paso está marcado: al empezar la partida el menú se apaga en medio segundo y el piano
// entra a todo volumen; al acabar, la partida se funde (1,2 s) y vuelve el menú, que ha
// seguido corriendo en silencio.
//
// Cuando suena un efecto, la música se AGACHA (ducking, como hace la mezcla de casi cualquier
// juego): baja 6 dB en ~15 ms mientras dura el efecto y vuelve en ~0,5 s.
//
// Se piden y decodifican una vez (≈ 23 MB en memoria cada una). Si el navegador no
// decodifica Ogg Vorbis (Safari anterior a 18.4) o falla la descarga, no suena música y
// el juego sigue como si nada.
import { emitir } from './bus.js';
import { est } from './estado.js';
import { audioCtx, unlockAudio, playSfx, escucharEfectos } from './sonido.js';

export type Pista = 'menu' | 'partida';
const PISTAS: Pista[] = ['menu', 'partida'];
const ARCHIVOS: Record<Pista, string> = { menu: '/musica/menu.ogg', partida: '/musica/partida.ogg' };
/** Volumen general: la música va por debajo de los efectos. */
const NIVEL = 0.28;
/** La introducción de la partida, en segundos: el bucle empieza después. La dice /musica/musica.json, que se escribe
 *  al publicar la música (tools/musica.py); si no se puede leer, vale la de la pieza original (4 compases a 184). */
let INTRO_PARTIDA = 4 * 240 / 184;
const SALE_MENU = 0.5, SALE_PARTIDA = 1.2, VUELVE_MENU = 1.5;   // segundos de cada fundido
/** Cuánto se agacha la música bajo un efecto: −6 dB. */
const AGACHE = 0.5;

let maestra: GainNode | null = null;
let agache: GainNode | null = null;
let sordina: BiquadFilterNode | null = null;
const ABIERTA = 20000;           // Hz: el filtro abierto no quita nada
let agachadaHasta = 0;           // reloj del audio en que acaba el último efecto que suena
const bufs: Partial<Record<Pista, AudioBuffer>> = {};
let menu: { gain: GainNode; src: AudioBufferSourceNode } | null = null;      // corre siempre, en bucle
let partida: { gain: GainNode; src: AudioBufferSourceNode } | null = null;   // una por partida, desde el piano
let arrancada = false;
let quiere: Pista = 'menu';      // lo que tiene que oírse (aunque aún no haya cargado nada)
let fundeHasta = 0;              // reloj del audio en que acaba el fundido en curso
let inicio = 0;                  // reloj del audio en que arrancó el menú

/** Lleva una ganancia a `v` en `s` segundos, desde donde esté (un fundido cortado a medias no salta). */
function rampa(g: AudioParam, v: number, s: number, ctx: AudioContext, espera = 0) {
    const t = ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    if (espera) g.setValueAtTime(g.value, t + espera);
    g.linearRampToValueAtTime(v, t + espera + s);
    fundeHasta = Math.max(fundeHasta, t + espera + s);
}

function paraPartida() {
    const p = partida;
    if (!p) return;
    partida = null;
    try { p.src.stop(); } catch { /* ya parada */ }
    p.src.disconnect(); p.gain.disconnect();
}

/** Pone lo que `quiere`. Idempotente: se llama al cargar y en cada cambio. */
function aplicar() {
    const ctx = audioCtx;
    if (!ctx || !maestra) return;
    if (quiere === 'partida' && bufs.partida) {
        if (partida) { rampa(partida.gain.gain, 1, 0.15, ctx); }      // ya sonaba (o se estaba yendo): vuelve, sin reiniciar
        else {
            const src = ctx.createBufferSource();
            src.buffer = bufs.partida;
            src.loop = true;
            src.loopStart = Math.min(INTRO_PARTIDA, bufs.partida.duration - 1);   // la introducción solo suena la primera vez
            src.loopEnd = bufs.partida.duration;
            const gain = ctx.createGain();
            gain.gain.value = 1;                                       // entra de golpe: es el piano el que anuncia
            src.connect(gain).connect(maestra);
            src.start(ctx.currentTime + 0.05);
            partida = { gain, src };
        }
        if (menu) rampa(menu.gain.gain, 0, SALE_MENU, ctx);
    } else {
        // (sin la pista de la partida —no cargó—, en la partida sigue sonando el menú)
        if (partida) {
            const p = partida;
            rampa(p.gain.gain, 0, SALE_PARTIDA, ctx);
            setTimeout(() => { if (partida === p && quiere === 'menu') paraPartida(); }, SALE_PARTIDA * 1000 + 150);
        }
        if (menu) rampa(menu.gain.gain, 1, VUELVE_MENU, ctx, partida ? 0.3 : 0);
    }
}

/** El volumen general sigue al botón de silencio. El menú sigue corriendo en silencio. */
function nivelMaestro() {
    if (!audioCtx || !maestra) return;
    maestra.gain.setTargetAtTime(est.sfxMuted ? 0 : NIVEL, audioCtx.currentTime, est.sfxMuted ? 0.05 : 0.5);
}

/** Un efecto empieza ahora y dura `dur` s: baja rápido y vuelve cuando acaba el último de los que se solapan. */
function agachar(dur: number) {
    const ctx = audioCtx;
    if (!ctx || !agache) return;
    const t = ctx.currentTime;
    const g = agache.gain;
    agachadaHasta = Math.max(agachadaHasta, t + dur);
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.setTargetAtTime(AGACHE, t, 0.005);                    // ~15 ms hasta abajo
    g.setTargetAtTime(1, agachadaHasta + 0.04, 0.15);      // ~0,5 s de vuelta
}
escucharEfectos(agachar);

/** En una pelea la música se queda «detrás de una puerta» (paso bajo a 600 Hz): solo quedan el
 *  bajo y el pulso, y se oyen tus golpes. Al acabar, se abre en ~0,6 s. */
export function tensarMusica(si: boolean) {
    const ctx = audioCtx;
    if (!ctx || !sordina) return;
    const f = sordina.frequency, t = ctx.currentTime;
    f.cancelScheduledValues(t);
    f.setValueAtTime(f.value, t);
    f.setTargetAtTime(si ? 600 : ABIERTA, t, si ? 0.05 : 0.2);
}

async function cargar(ctx: AudioContext) {
    try {
        const j = await (await fetch('/musica/musica.json')).json();
        if (typeof j.introPartida === 'number' && j.introPartida >= 0) INTRO_PARTIDA = j.introPartida;
    } catch { /* se queda la de la pieza original */ }
    await Promise.all(PISTAS.map(async p => {
        try {
            const r = await fetch(ARCHIVOS[p]);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const datos = await r.arrayBuffer();
            // Con callbacks: el Safari antiguo no devuelve promesa.
            bufs[p] = await new Promise<AudioBuffer>((ok, mal) => ctx.decodeAudioData(datos, ok, mal));
        } catch (e) { console.warn(`[música] ${p}: no se pudo cargar`, e); }
    }));
    if (!maestra) return;
    if (bufs.menu) {
        const src = ctx.createBufferSource();
        src.buffer = bufs.menu;
        src.loop = true;
        const gain = ctx.createGain();
        gain.gain.value = quiere === 'menu' ? 1 : 0;
        src.connect(gain).connect(maestra);
        inicio = ctx.currentTime + 0.1;
        src.start(inicio);
        menu = { gain, src };
    }
    aplicar();
    nivelMaestro();
}

/** Pide y arranca la música. Hay que llamarla desde un gesto del usuario (el navegador no deja sonar antes). */
export function arrancarMusica() {
    if (arrancada || est.sfxMuted) return;       // en silencio no se descarga nada: se arranca al activar el sonido
    unlockAudio();
    const ctx = audioCtx;
    if (!ctx) return;
    arrancada = true;
    if (ctx.state === 'suspended') void ctx.resume();
    maestra = ctx.createGain();
    maestra.gain.value = 0;
    agache = ctx.createGain();
    sordina = ctx.createBiquadFilter();
    sordina.type = 'lowpass';
    sordina.frequency.value = ABIERTA;
    maestra.connect(agache).connect(sordina).connect(ctx.destination);
    void cargar(ctx);
}
// El primer gesto (un toque o una tecla: el menú se maneja con el teclado) abre el audio y arranca la música.
for (const ev of ['pointerdown', 'keydown'] as const) document.addEventListener(ev, arrancarMusica, { once: true });

/** Empieza la partida: calla el menú y entra la partida por su piano. */
export function startMusic() {
    arrancarMusica();
    quiere = 'partida';
    aplicar();
}

/** Acaba la partida (o no llegó a empezar): se funde y vuelve el menú. */
export function stopMusic() {
    quiere = 'menu';
    aplicar();
}

/** Para las pruebas (tools/browser/musica.mjs): qué suena y cómo. */
export function estadoMusica() {
    const ctx = audioCtx, largo = bufs.menu?.duration ?? 0;
    return {
        arrancada, cargadas: PISTAS.filter(p => bufs[p]), mezcla: quiere === 'partida' ? 1 : 0, fundiendo: !!ctx && ctx.currentTime < fundeHasta,
        menu: menu?.gain.gain.value ?? null, partida: partida ? partida.gain.gain.value : (bufs.partida ? 0 : null),
        partidaSonando: !!partida, introPartida: INTRO_PARTIDA,
        maestra: maestra?.gain.value ?? null, agache: agache?.gain.value ?? null,
        duraciones: { menu: bufs.menu?.duration ?? null, partida: bufs.partida?.duration ?? null }, largoBucle: largo,
        fase: ctx && largo ? (((ctx.currentTime - inicio) % largo) + largo) % largo : null,
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
