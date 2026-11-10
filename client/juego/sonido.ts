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
// Si algún día se quieren muestras de verdad, el sitio por donde entrar es
// `playSfx`: misma llamada, otro reproductor.
import { est } from './estado.js';

export let audioCtx: AudioContext | null = null;
try { est.sfxMuted = localStorage.getItem('piles.mute') === '1'; } catch { /* modo privado */ }

/** El navegador no deja sonar nada hasta que el usuario toca algo. */
export function unlockAudio() {
    if (audioCtx) return;
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext!)();
    } catch { audioCtx = null; }
}
document.addEventListener('pointerdown', unlockAudio, { once: true });

/** Aviso a la música de que suena un efecto (`musica.ts` se apunta): se agacha mientras dura. */
let alEfecto: ((dur: number) => void) | null = null;
export function escucharEfectos(f: (dur: number) => void) { alEfecto = f; }

/** Una nota. `type` da el color, la envolvente da el golpe. */
export function tone({ freq, dur = 0.12, type = 'triangle', gain = 0.18, slideTo = null }:
    { freq: number; dur?: number; type?: OscillatorType; gain?: number; slideTo?: number | null }) {
    if (!audioCtx || est.sfxMuted) return;
    const t = audioCtx.currentTime;
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
    osc.connect(amp).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    alEfecto?.(dur);
}

/** Ruido corto, para lo que no es musical (soltar una carta, un choque). */
function noise({ dur = 0.08, gain = 0.12, hp = 800 }: { dur?: number; gain?: number; hp?: number }) {
    if (!audioCtx || est.sfxMuted) return;
    const t = audioCtx.currentTime;
    const n = Math.floor(audioCtx.sampleRate * dur);
    const buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const filt = audioCtx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = hp;
    const amp = audioCtx.createGain();
    amp.gain.value = gain;
    src.connect(filt).connect(amp).connect(audioCtx.destination);
    src.start(t);
    alEfecto?.(dur);
}

/** Escalón de la cadena: cada jugada encadenada suena más arriba.
 *  Es LA firma de Balatro y lo que convierte una racha en algo que se siente. */
export function comboStep(multX100: number) {
    const escalon = Math.max(0, Math.round((multX100 - 100) / 25));
    // Semitonos sobre un La: sube sin salirse de tono aunque la racha sea larga.
    tone({ freq: 440 * Math.pow(2, Math.min(escalon, 16) / 12), dur: 0.1, type: 'square', gain: 0.12 });
}

type Sfx = (cardId?: number) => void;
const SFX = {
    // Lanzar una carta: primero viaja, luego aterriza. Antes era un solo
    // chasquido de ruido, que sonaba a estática y no a una carta cayendo sobre
    // una mesa. El tono de salida varía un poco con el id de la carta —igual
    // que su inclinación en `thrownStyle`—, así que dos lanzamientos seguidos
    // no suenan calcados.
    drop: (cardId = 0) => {
        const h = ((cardId * 2654435761) >>> 0) % 60;
        tone({ freq: 420 + h, dur: 0.1, type: 'triangle', gain: 0.1, slideTo: 180 });
        setTimeout(() => noise({ dur: 0.06, gain: 0.11, hp: 400 }), 70);
    },
    take:  () => tone({ freq: 520, dur: 0.07, type: 'triangle', gain: 0.12 }),
    setDone: () => { tone({ freq: 660, dur: 0.16 }); setTimeout(() => tone({ freq: 990, dur: 0.22 }), 90); },
    fight: () => tone({ freq: 220, dur: 0.18, type: 'sawtooth', gain: 0.14, slideTo: 440 }),
    fightWon: () => { tone({ freq: 590, dur: 0.12 }); setTimeout(() => tone({ freq: 880, dur: 0.2 }), 80); },
    fightLost: () => tone({ freq: 300, dur: 0.3, type: 'sawtooth', gain: 0.13, slideTo: 110 }),
    tiebreak: () => { tone({ freq: 440, dur: 0.08, type: 'square', gain: 0.1 }); setTimeout(() => tone({ freq: 440, dur: 0.08, type: 'square', gain: 0.1 }), 110); },
    refused: () => tone({ freq: 180, dur: 0.09, type: 'square', gain: 0.09 }),
    // Cuenta atrás de la sala: un tic por número y un tono más alto al arrancar.
    countTick: () => tone({ freq: 660, dur: 0.09, type: 'triangle', gain: 0.14 }),
    countGo: () => tone({ freq: 990, dur: 0.22, type: 'triangle', gain: 0.16 }),
    // Cargado: arpegio corto hacia arriba. Soltado: barrido grande.
    frenzyReady: () => [0, 4, 7, 12].forEach((s, i) =>
        setTimeout(() => tone({ freq: 440 * Math.pow(2, s / 12), dur: 0.12 }), i * 70)),
    frenzyFire: () => tone({ freq: 180, dur: 0.5, type: 'sawtooth', gain: 0.2, slideTo: 1400 }),
    frenzyHit: () => tone({ freq: 900, dur: 0.4, type: 'square', gain: 0.16, slideTo: 90 }),
    frenzyCounter: () => { noise({ dur: 0.12, gain: 0.16, hp: 2000 }); tone({ freq: 1200, dur: 0.18, gain: 0.12 }); },
    // El contador de Elo, uno por punto. Fun: un clic ligero de rueda de
    // plástico. Glory: un golpe grave de piedra, con su polvo.
    dialFun: () => tone({ freq: 1800, dur: 0.03, type: 'square', gain: 0.035 }),
    dialGlory: () => { tone({ freq: 95, dur: 0.14, type: 'triangle', gain: 0.22, slideTo: 60 }); noise({ dur: 0.05, gain: 0.08, hp: 600 }); },
    // Cambio de rango en el contador. Subir: arpegio mayor que se abre y un
    // brillo al final. Bajar: golpe grave y un crujido, como algo que se parte.
    rankUp: () => {
        [0, 4, 7, 12, 16].forEach((s, i) =>
            setTimeout(() => tone({ freq: 523 * Math.pow(2, s / 12), dur: i === 4 ? 0.5 : 0.14, gain: i === 4 ? 0.16 : 0.13 }), i * 85));
        setTimeout(() => noise({ dur: 0.35, gain: 0.05, hp: 5000 }), 340);
    },
    rankDown: () => {
        tone({ freq: 150, dur: 0.45, type: 'sawtooth', gain: 0.2, slideTo: 48 });
        noise({ dur: 0.18, gain: 0.2, hp: 300 });
        setTimeout(() => noise({ dur: 0.1, gain: 0.12, hp: 1500 }), 140);
        setTimeout(() => noise({ dur: 0.08, gain: 0.09, hp: 2500 }), 260);
    },
} satisfies Record<string, Sfx>;
export type SfxName = keyof typeof SFX;

export function playSfx(name: SfxName, arg?: number) {
    if (est.sfxMuted || !audioCtx) return;
    try { (SFX[name] as Sfx | undefined)?.(arg); } catch { /* que no se caiga el juego por un pitido */ }
}

