// ─── Sonido ───────────────────────────────────────────────────────────────
//
// Sintetizado con WebAudio, sin un solo fichero. Se miraron los packs libres
// que hay (los de Kenney son CC0 y valdrían: kenney.nl/assets/interface-sounds),
// pero lo que hace que Balatro suene a Balatro no es el timbre: es que cada
// eslabón de la cadena suena MÁS AGUDO que el anterior. Eso pide un tono
// calculado, no un wav fijo — con muestras habría que grabar una por escalón.
// Además así no hay descargas, ni licencias que arrastrar, ni un mp3 de 200 kB
// bloqueando la primera partida.
//
// Tres reglas de mezcla (2026-11):
//  - AFINADO CON LA MÚSICA. La pieza está en re menor; todo lo que tiene tono sale de su
//    pentatónica (re fa sol la do). Antes había un si natural (990 Hz) que chocaba con el
//    si bemol de la música, y la racha subía por semitonos (cromática, fuera de tono).
//  - UN BUS. Todo pasa por un compresor (dos efectos a la vez no saturan) y una parte va a
//    una reverberación corta: los pitidos secos sonaban pegados encima de una música con sala.
//  - SOLO SE AGACHA LA MÚSICA CON LO QUE IMPORTA. Los tics (el contador de Elo, los golpes de
//    la pelea, moverse por el menú) no la agachan: a 10 por segundo la música «bombeaba».
//
// Si algún día se quieren muestras de verdad, el sitio por donde entrar es
// `playSfx`: misma llamada, otro reproductor.
import { est } from './estado.js';

export let audioCtx: AudioContext | null = null;
try { est.sfxMuted = localStorage.getItem('piles.mute') === '1'; } catch { /* modo privado */ }

/** El navegador no deja sonar nada hasta que el usuario toca algo. Crea el contexto y, si está
 *  parado, lo reanuda: Safari lo deja «suspended» si se creó fuera de un gesto que él acepte, y en
 *  iOS pasa a «interrupted» tras una llamada o al volver de segundo plano. Solo se reanuda dentro
 *  de un gesto, así que se intenta en cada uno (si ya suena, no hace nada). */
export function unlockAudio() {
    if (!audioCtx) {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext!)();
        } catch { audioCtx = null; }
    }
    if (audioCtx && audioCtx.state !== 'running') audioCtx.resume().catch(() => { /* fuera de un gesto: el siguiente lo logra */ });
}
// En iOS el inicio del toque (pointerdown/touchstart) NO cuenta como gesto para el audio: touchend y click sí.
for (const ev of ['pointerdown', 'touchend', 'click', 'keydown'] as const) document.addEventListener(ev, unlockAudio, { passive: true });

/** Aviso a la música de que suena un efecto (`musica.ts` se apunta): se agacha mientras dura. */
let alEfecto: ((dur: number) => void) | null = null;
export function escucharEfectos(f: (dur: number) => void) { alEfecto = f; }

// ── El bus: compresor + reverberación corta ──────────────────────────────────────
let bus: { seco: AudioNode; eco: AudioNode; ruido: AudioBuffer } | null = null;
function salida(ctx: AudioContext) {
    if (bus) return bus;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.14;
    // El compresor de WebAudio sube solo lo que comprime (≈ +7,7 dB con estos números): se
    // devuelve aquí, o todos los efectos saldrían el doble de fuertes que antes del bus.
    const nivel = ctx.createGain(); nivel.gain.value = 0.55;
    comp.connect(nivel).connect(ctx.destination);
    // Sala pequeña: ruido que se apaga en 0,7 s (dos canales distintos = ancho)
    const n = Math.floor(ctx.sampleRate * 0.7), ir = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6); }
    const sala = ctx.createConvolver(); sala.buffer = ir;
    const opaco = ctx.createBiquadFilter(); opaco.type = 'lowpass'; opaco.frequency.value = 4200;   // cola sin siseo
    const eco = ctx.createGain(); eco.gain.value = 0.55;
    eco.connect(sala).connect(opaco).connect(comp);
    // Un segundo de ruido blanco, para todos los golpes (antes se creaba un búfer por golpe)
    const ruido = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), r = ruido.getChannelData(0);
    for (let i = 0; i < r.length; i++) r[i] = Math.random() * 2 - 1;
    return (bus = { seco: comp, eco, ruido });
}

type Tono = {
    freq: number; dur?: number; type?: OscillatorType; gain?: number; slideTo?: number | null;
    /** Segundos desde ahora (con el reloj del audio: un arpegio no depende de setTimeout). */
    at?: number;
    /** Cuánto va a la reverberación (0–1). */
    eco?: number;
    /** Paso bajo: quita el filo a cuadradas y sierras. */
    lp?: number;
    /** Agacha la música. Por omisión, solo lo que suena fuerte. */
    duck?: boolean;
};
/** Una nota. `type` da el color, la envolvente da el golpe. */
export function tone({ freq, dur = 0.12, type = 'triangle', gain = 0.18, slideTo = null, at = 0, eco = 0.2, lp = 0, duck }: Tono) {
    if (!audioCtx || est.sfxMuted) return;
    const B = salida(audioCtx), t = audioCtx.currentTime + at;
    const osc = audioCtx.createOscillator();
    const amp = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    // Ataque muy corto y caída exponencial: es lo que se oye como un golpe y
    // no como un pitido.
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let fuente: AudioNode = osc;
    if (lp) { const f = audioCtx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; osc.connect(f); fuente = f; }
    fuente.connect(amp);
    amp.connect(B.seco);
    if (eco > 0) { const e = audioCtx.createGain(); e.gain.value = eco; amp.connect(e).connect(B.eco); }
    osc.start(t);
    osc.stop(t + dur + 0.02);
    if (duck ?? gain >= 0.08) alEfecto?.(at + dur);
}

/** Ruido corto, para lo que no es musical (una carta que roza, un golpe en la mesa).
 *  `hp`/`lp` lo acotan: agudo = papel, grave = golpe. */
function noise({ dur = 0.08, gain = 0.12, hp = 800, lp = 0, at = 0, eco = 0.15, duck }:
    { dur?: number; gain?: number; hp?: number; lp?: number; at?: number; eco?: number; duck?: boolean }) {
    if (!audioCtx || est.sfxMuted) return;
    const B = salida(audioCtx), t = audioCtx.currentTime + at;
    const src = audioCtx.createBufferSource();
    src.buffer = B.ruido;
    const filt = audioCtx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = hp;
    let fuente: AudioNode = src.connect(filt);
    if (lp) { const f = audioCtx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; fuente.connect(f); fuente = f; }
    const amp = audioCtx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    fuente.connect(amp);
    amp.connect(B.seco);
    if (eco > 0) { const e = audioCtx.createGain(); e.gain.value = eco; amp.connect(e).connect(B.eco); }
    src.start(t, Math.random() * 0.5, dur + 0.02);   // otro trozo cada vez: dos golpes no suenan calcados
    if (duck ?? gain >= 0.08) alEfecto?.(at + dur);
}

/** Pentatónica de re menor (re fa sol la do), la de la música. Grado 0 = re4. */
const PENTA = [0, 3, 5, 7, 10];
export const nota = (grado: number) => 293.66 * Math.pow(2, Math.floor(grado / 5) + PENTA[((grado % 5) + 5) % 5] / 12);
const RE4 = nota(0), FA4 = nota(1), LA4 = nota(3), DO5 = nota(4), RE5 = nota(5), FA5 = nota(6), LA5 = nota(8), DO6 = nota(9), RE6 = nota(10), FA6 = nota(11), LA6 = nota(13);

/** Escalón de la cadena: cada jugada encadenada suena más arriba.
 *  Es LA firma de Balatro y lo que convierte una racha en algo que se siente.
 *  Sube por la pentatónica de la música: cada escalón suena «bien» sobre cualquier acorde. */
export function comboStep(multX100: number) {
    const escalon = Math.min(10, Math.max(0, Math.round((multX100 - 100) / 25)));
    const f = nota(3 + escalon);   // desde la4
    tone({ freq: f, dur: 0.14, type: 'triangle', gain: 0.14, eco: 0.3 });
    tone({ freq: f * 2, dur: 0.07, type: 'square', gain: 0.035, lp: 5000, duck: false });   // el brillo de moneda
    noise({ dur: 0.025, gain: 0.05, hp: 3500, duck: false });
}

type Sfx = (n?: number) => void;
/** Una carta que roza al salir (papel) y cae en la mesa (golpe sordo). */
const cartaCae = (h = 0, at = 0) => {
    noise({ dur: 0.07, gain: 0.07, hp: 2200 + h * 20, at, eco: 0.1, duck: false });
    noise({ dur: 0.07, gain: 0.16, hp: 120, lp: 900, at: at + 0.07, eco: 0.25 });
    tone({ freq: 150 + h, slideTo: 85, dur: 0.07, type: 'sine', gain: 0.14, at: at + 0.07, eco: 0.1 });
};
/** El golpe de algo que CAE, con su peso. `E` es la energía de la caída que pinta la partida
 *  («Gravedad», partida/partida.ts): 1 = una carta, crece si caen seguidas (hasta 3,5). Más
 *  energía = más grave, más largo, más fuerte y con esquirlas, igual que la animación hunde más
 *  la mesa. Afinado en re (re3 → re2), la tónica de la música. */
const impacto = (E = 1, at = 0) => {
    const k = (Math.min(3.5, Math.max(0.6, E)) - 0.6) / 2.9;          // 0 = ligera · 1 = todo el peso
    noise({ dur: 0.03, gain: 0.05 + 0.03 * k, hp: 2500, at, eco: 0.05, duck: false });                           // el papel contra la mesa
    tone({ freq: 146.8 - 40 * k, slideTo: 73.4 - 30 * k, dur: 0.1 + 0.14 * k, type: 'sine', gain: 0.16 + 0.09 * k, at, eco: 0.1 + 0.15 * k });   // el cuerpo
    noise({ dur: 0.07 + 0.09 * k, gain: 0.15 + 0.08 * k, hp: 60, lp: 500 + 500 * k, at, eco: 0.2 + 0.2 * k });   // la mesa que se hunde
    if (k > 0.35) [0.06, 0.1, 0.15].forEach((d, i) => noise({ dur: 0.02, gain: 0.035 - i * 0.008, hp: 4200, at: at + d, eco: 0.3, duck: false }));   // esquirlas
};
const SFX = {
    // Lanzar una carta: SOLO el viaje (un roce de aire que baja). El golpe suena cuando aterriza
    // de verdad, 360 ms después, desde la animación (`impacto`): antes sonaba a los 70 ms, con
    // la carta aún en el aire. El tono varía un poco con el id de la carta, como su inclinación.
    drop: (cardId = 0) => {
        const h = ((cardId * 2654435761) >>> 0) % 60;
        noise({ dur: 0.13, gain: 0.045, hp: 1800, eco: 0.1, duck: false });
        tone({ freq: 420 + h, slideTo: 200, dur: 0.1, type: 'triangle', gain: 0.035, duck: false });
    },
    impacto: (E = 1) => impacto(E),
    // La carta ganada en una pelea: cae con todo y suena a premio (re · la)
    impactoFuerte: (E = 1) => {
        impacto(Math.max(2.6, E));
        tone({ freq: RE5, dur: 0.45, gain: 0.07, eco: 0.5, duck: false }); tone({ freq: LA5, dur: 0.5, gain: 0.07, at: 0.03, eco: 0.5, duck: false });
        noise({ dur: 0.3, gain: 0.03, hp: 5500, at: 0.04, eco: 0.5, duck: false });
    },
    // Una carta que se posa sin fuerza (el menú recoge la mano, las miniaturas de la verificación)
    posar: () => noise({ dur: 0.045, gain: 0.2, hp: 200, lp: 2400, eco: 0.1, duck: false }),
    // El tablero entra: la mesa cae desde arriba (pesada), el marcador (ligero) y tu mano
    tablero: () => {
        noise({ dur: 0.3, gain: 0.05, hp: 900, eco: 0.2, duck: false });            // el barrido
        impacto(3.2, 0.4); tone({ freq: 73.4, slideTo: 36.7, dur: 0.4, type: 'sine', gain: 0.15, at: 0.4, eco: 0.3 });
        impacto(0.7, 0.53); impacto(1.5, 0.62);
    },
    // Verificación: el sello cae sobre cada pila (bien / mal) y el sello grande al final
    sello: () => { impacto(1.3); tone({ freq: LA5, dur: 0.12, gain: 0.07, at: 0.01, eco: 0.4, duck: false }); },
    selloMal: () => { impacto(1.8); tone({ freq: FA4 / 2, slideTo: RE4 / 2, dur: 0.16, type: 'square', gain: 0.08, lp: 800, at: 0.01 }); },
    selloFin: (bien = 1) => {
        impacto(3.2);
        if (bien) [RE5, LA5, RE6].forEach((f, i) => tone({ freq: f, dur: 0.45, gain: 0.08, at: 0.02 + i * 0.05, eco: 0.5, duck: false }));
        else tone({ freq: LA4 / 2, slideTo: RE4 / 2, dur: 0.4, type: 'sawtooth', gain: 0.1, lp: 900, at: 0.02 });
    },
    take: () => { noise({ dur: 0.04, gain: 0.07, hp: 2800, duck: false }); tone({ freq: LA4, slideTo: RE5, dur: 0.07, type: 'triangle', gain: 0.11 }); },
    // Pila completa: la5 → re6 → fa6 y un brillo
    setDone: () => {
        [LA5, RE6, FA6].forEach((f, i) => tone({ freq: f, dur: i === 2 ? 0.4 : 0.14, gain: 0.1, at: i * 0.075, eco: 0.45 }));
        noise({ dur: 0.3, gain: 0.035, hp: 6000, at: 0.15, eco: 0.5, duck: false });
    },
    // Pelea: un golpe en la mesa y una sierra que sube una quinta (re → la)
    fight: () => {
        noise({ dur: 0.12, gain: 0.13, hp: 80, lp: 700, eco: 0.3 });
        tone({ freq: 73.4, slideTo: 55, dur: 0.2, type: 'sine', gain: 0.14 });
        tone({ freq: RE4 / 2, slideTo: LA4 / 2, dur: 0.22, type: 'sawtooth', gain: 0.1, lp: 1800, eco: 0.3 });
    },
    fightWon: () => { tone({ freq: RE5, dur: 0.1, gain: 0.14 }); tone({ freq: LA5, dur: 0.3, gain: 0.15, at: 0.08, eco: 0.5 }); tone({ freq: RE6, dur: 0.3, gain: 0.06, at: 0.08, eco: 0.5 }); },
    fightLost: () => { tone({ freq: LA4 / 2, slideTo: RE4 / 2, dur: 0.35, type: 'sawtooth', gain: 0.13, lp: 1100 }); noise({ dur: 0.1, gain: 0.14, hp: 80, lp: 500 }); },
    tiebreak: () => [0, 0.11].forEach(at => tone({ freq: LA4, dur: 0.08, type: 'square', gain: 0.1, lp: 3000, at })),
    refused: () => { tone({ freq: FA4 / 2, slideTo: RE4 / 2, dur: 0.1, type: 'square', gain: 0.09, lp: 900 }); noise({ dur: 0.04, gain: 0.06, hp: 150, lp: 600, duck: false }); },
    // Cuenta atrás de la sala: un golpe de madera por número (re5) y el acorde abierto al arrancar.
    countTick: () => { tone({ freq: RE5, dur: 0.09, type: 'sine', gain: 0.16 }); tone({ freq: RE5 * 2.76, dur: 0.03, type: 'sine', gain: 0.05, duck: false }); },
    countGo: () => { [RE5, LA5, RE6].forEach(f => tone({ freq: f, dur: 0.5, gain: 0.085, eco: 0.5 })); noise({ dur: 0.25, gain: 0.05, hp: 5000, eco: 0.4, duck: false }); },
    // Cargado: arpegio corto hacia arriba. Soltado: barrido grande.
    frenzyReady: () => [RE5, FA5, LA5, RE6].forEach((f, i) => tone({ freq: f, dur: 0.14, at: i * 0.07, eco: 0.4 })),
    frenzyFire: () => { tone({ freq: RE4 / 2, dur: 0.5, type: 'sawtooth', gain: 0.18, slideTo: RE6, lp: 6000, eco: 0.4 }); noise({ dur: 0.5, gain: 0.07, hp: 1500, eco: 0.4 }); },
    frenzyHit: () => tone({ freq: LA5, dur: 0.4, type: 'square', gain: 0.15, slideTo: 98, lp: 2600, eco: 0.3 }),
    frenzyCounter: () => { noise({ dur: 0.12, gain: 0.16, hp: 2000 }); tone({ freq: LA6, dur: 0.2, gain: 0.11, eco: 0.5 }); },
    // El contador de Elo, uno por punto. Fun: un clic ligero de rueda de
    // plástico. Glory: un golpe grave de piedra, con su polvo.
    dialFun: () => tone({ freq: 1800, dur: 0.03, type: 'square', gain: 0.035, eco: 0 }),
    dialGlory: () => { tone({ freq: 95, dur: 0.14, type: 'triangle', gain: 0.13, slideTo: 60, eco: 0.1, duck: false }); noise({ dur: 0.05, gain: 0.07, hp: 600, duck: false }); },
    // Cambio de rango en el contador. Subir: el relativo mayor (fa la do) abriéndose, con brillo
    // al final. Bajar: golpe grave y un crujido, como algo que se parte.
    rankUp: () => {
        [FA5, LA5, DO6, FA6, LA6].forEach((f, i) => tone({ freq: f, dur: i === 4 ? 0.6 : 0.16, gain: i === 4 ? 0.15 : 0.12, at: i * 0.085, eco: 0.5 }));
        noise({ dur: 0.4, gain: 0.05, hp: 5000, at: 0.34, eco: 0.5, duck: false });
    },
    rankDown: () => {
        tone({ freq: 150, dur: 0.45, type: 'sawtooth', gain: 0.14, slideTo: 48, lp: 1400 });
        noise({ dur: 0.18, gain: 0.12, hp: 300 });
        noise({ dur: 0.1, gain: 0.12, hp: 1500, at: 0.14 });
        noise({ dur: 0.08, gain: 0.09, hp: 2500, at: 0.26 });
    },
    // ── El menú es una mano de cartas: suena a cartas ──
    menuMove: () => noise({ dur: 0.035, gain: 0.05, hp: 3200, eco: 0.05 }),
    menuOk: () => { cartaCae(8); tone({ freq: RE5, dur: 0.09, gain: 0.07, at: 0.07, eco: 0.4, duck: false }); },
    menuBack: () => { noise({ dur: 0.06, gain: 0.07, hp: 1800, duck: false }); tone({ freq: LA4, slideTo: RE4, dur: 0.09, type: 'triangle', gain: 0.07, eco: 0.3, duck: false }); },
    toggle: () => tone({ freq: DO5, dur: 0.04, type: 'sine', gain: 0.07, eco: 0.1, duck: false }),
    // ── La sala ──
    // (se llama cuando la carta del que llega golpea su asiento)
    join: () => { impacto(1.2); tone({ freq: FA5, dur: 0.1, type: 'sine', gain: 0.09, at: 0.04, eco: 0.5 }); tone({ freq: LA5, dur: 0.22, type: 'sine', gain: 0.09, at: 0.13, eco: 0.5 }); },
    leave: () => { tone({ freq: LA4, dur: 0.1, type: 'sine', gain: 0.07, eco: 0.4, duck: false }); tone({ freq: FA4, dur: 0.2, type: 'sine', gain: 0.07, at: 0.09, eco: 0.4, duck: false }); },
    chat: () => tone({ freq: DO6, dur: 0.06, type: 'sine', gain: 0.05, eco: 0.3, duck: false }),
    ready: () => { tone({ freq: RE5, dur: 0.07, gain: 0.12 }); tone({ freq: LA5, dur: 0.2, gain: 0.12, at: 0.06, eco: 0.4 }); },
    unready: () => { tone({ freq: LA4, dur: 0.07, gain: 0.08, duck: false }); tone({ freq: FA4, dur: 0.14, gain: 0.08, at: 0.06, duck: false }); },
    // Reparto: tres cartas seguidas sobre la mesa
    deal: () => [0, 0.1, 0.2].forEach((at, i) => impacto(0.8 + i * 0.2, at)),
    // ── Pelea: cada golpe tuyo, más agudo según machacas (n = los que llevas) ──
    tap: (n = 0) => {
        noise({ dur: 0.03, gain: 0.09, hp: 500, lp: 3000, eco: 0.05, duck: false });
        tone({ freq: nota(Math.min(12, Math.floor(n / 3))), dur: 0.05, type: 'triangle', gain: 0.07, eco: 0.1, duck: false });
    },
    // ── Fin de la partida ──
    win: () => {
        [FA5, LA5, DO6, FA6].forEach((f, i) => tone({ freq: f, dur: 0.16, gain: 0.13, at: i * 0.1, eco: 0.5 }));
        [FA5, LA5, DO6, FA6].forEach(f => tone({ freq: f, dur: 1.1, gain: 0.07, at: 0.42, eco: 0.6 }));
        noise({ dur: 0.7, gain: 0.05, hp: 5500, at: 0.42, eco: 0.6, duck: false });
    },
    lose: () => [LA4, FA4, RE4].forEach((f, i) => tone({ freq: f, dur: i === 2 ? 0.7 : 0.22, type: 'triangle', gain: 0.11, at: i * 0.2, eco: 0.5 })),
} satisfies Record<string, Sfx>;
export type SfxName = keyof typeof SFX;
/** Para las pruebas (tools/browser/efectos.mjs). */
export const sfxNombres = () => Object.keys(SFX) as SfxName[];

export function playSfx(name: SfxName, arg?: number) {
    if (est.sfxMuted || !audioCtx) return;
    try { (SFX[name] as Sfx | undefined)?.(arg); } catch { /* que no se caiga el juego por un pitido */ }
}
