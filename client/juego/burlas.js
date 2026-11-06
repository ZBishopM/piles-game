// ─── Burlas ───────────────────────────────────────────────────────────────
//
// Lo que oye quien llega tarde a una carta que acabas de coger: el servidor
// manda `taunt` (el id de TU burla) en el `swap_failed` de quien la pidió menos
// de 500 ms después. Sintetizadas como todo lo demás. Los ids tienen que ser los
// de `server/src/taunts.rs`: el servidor descarta cualquier otro.
//
// Una a la vez (la nueva corta la anterior) y como mucho una cada 2 s en juego.
let tauntBus = null;
let tauntLastAt = -Infinity;

/** Una nota de burla. `at` en segundos desde ahora; `vib` es la profundidad (Hz). */
function tt(at, { freq, dur, type = 'square', gain = 0.1, slideTo = null, vib = 0, vibHz = 12 }) {
    const c = audioCtx, t = c.currentTime + at;
    const osc = c.createOscillator(), amp = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    if (vib) {
        const lfo = c.createOscillator(), depth = c.createGain();
        lfo.frequency.value = vibHz;
        depth.gain.value = vib;
        lfo.connect(depth).connect(osc.frequency);
        lfo.start(t); lfo.stop(t + dur + 0.02);
    }
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + 0.015);
    amp.gain.setValueAtTime(gain, t + Math.max(0.02, dur - 0.05));
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(amp).connect(tauntBus);
    osc.start(t); osc.stop(t + dur + 0.02);
}

const TAUNTS = [
    { id: 'honk', name: t('taunt.honk'), play: () => {
        tt(0,    { freq: 420, slideTo: 350, dur: 0.15, type: 'sawtooth', gain: 0.09 });
        tt(0,    { freq: 421, slideTo: 351, dur: 0.15, type: 'square', gain: 0.04 });
        tt(0.2,  { freq: 340, slideTo: 270, dur: 0.32, type: 'sawtooth', gain: 0.09 });
        tt(0.2,  { freq: 341, slideTo: 271, dur: 0.32, type: 'square', gain: 0.04 });
    } },
    { id: 'trombon', name: t('taunt.trombon'), play: () => {
        [[233, 0], [220, 0.2], [208, 0.4]].forEach(([f, at]) => tt(at, { freq: f, dur: 0.17, type: 'sawtooth', gain: 0.08 }));
        tt(0.62, { freq: 196, slideTo: 140, dur: 0.55, type: 'sawtooth', gain: 0.08, vib: 6, vibHz: 6 });
    } },
    { id: 'boing', name: t('taunt.boing'), play: () => {
        tt(0,    { freq: 180, slideTo: 720, dur: 0.12, type: 'triangle', gain: 0.16 });
        tt(0.12, { freq: 720, slideTo: 200, dur: 0.55, type: 'triangle', gain: 0.16, vib: 70, vibHz: 20 });
    } },
    { id: 'risa', name: t('taunt.risa'), play: () => {
        [600, 560, 520, 480].forEach((f, i) => tt(i * 0.17, { freq: f, slideTo: f * 0.75, dur: 0.12, type: 'square', gain: 0.07 }));
        tt(0.7, { freq: 440, slideTo: 330, dur: 0.18, type: 'square', gain: 0.06, vib: 15, vibHz: 14 });
    } },
    { id: 'pedorreta', name: t('taunt.pedorreta'), play: () => {
        tt(0, { freq: 95, slideTo: 48, dur: 0.7, type: 'sawtooth', gain: 0.22, vib: 28, vibHz: 28 });
        tt(0, { freq: 190, slideTo: 96, dur: 0.7, type: 'square', gain: 0.05, vib: 40, vibHz: 31 });
    } },
    { id: 'sirena', name: t('taunt.sirena'), play: () => {
        tt(0,    { freq: 500, slideTo: 900, dur: 0.35, type: 'triangle', gain: 0.13 });
        tt(0.35, { freq: 900, slideTo: 500, dur: 0.35, type: 'triangle', gain: 0.13 });
        tt(0.7,  { freq: 500, slideTo: 800, dur: 0.25, type: 'triangle', gain: 0.13 });
    } },
    { id: 'silbido', name: t('taunt.silbido'), play: () => {
        tt(0, { freq: 1900, slideTo: 280, dur: 0.85, type: 'sine', gain: 0.12, vib: 40, vibHz: 7 });
    } },
    { id: 'campanita', name: t('taunt.campanita'), play: () => {
        [0, 0.24].forEach(at => {
            tt(at, { freq: 1568, dur: 0.45, type: 'sine', gain: 0.1 });
            tt(at, { freq: 1568 * 2.76, dur: 0.2, type: 'sine', gain: 0.035 });
        });
    } },
    { id: 'gallo', name: t('taunt.gallo'), play: () => {
        tt(0,    { freq: 500, slideTo: 900, dur: 0.1, type: 'sawtooth', gain: 0.08 });
        tt(0.13, { freq: 700, slideTo: 1100, dur: 0.1, type: 'sawtooth', gain: 0.08 });
        tt(0.26, { freq: 900, slideTo: 1250, dur: 0.14, type: 'sawtooth', gain: 0.08 });
        tt(0.44, { freq: 1250, slideTo: 520, dur: 0.5, type: 'sawtooth', gain: 0.08, vib: 50, vibHz: 16 });
    } },
    { id: 'pato', name: t('taunt.pato'), play: () => {
        tt(0,    { freq: 460, slideTo: 250, dur: 0.13, type: 'sawtooth', gain: 0.09, vib: 40, vibHz: 55 });
        tt(0.2,  { freq: 430, slideTo: 230, dur: 0.17, type: 'sawtooth', gain: 0.09, vib: 40, vibHz: 55 });
    } },
];

function getTaunt() {
    try {
        const id = localStorage.getItem('piles.taunt') || '';
        return TAUNTS.some(t => t.id === id) ? id : '';
    } catch { return ''; }
}

/** Suena una burla. Devuelve si sonó. `preview` (el ▶ del perfil) se salta el
 *  límite de una cada 2 s; en juego no hay prisa por oírla dos veces seguidas. */
function playTaunt(id, preview = false) {
    const t = TAUNTS.find(x => x.id === id);
    if (!t || sfxMuted) return false;
    unlockAudio();
    if (!audioCtx) return false;
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    const now = performance.now();
    if (!preview && now - tauntLastAt < 2000) return false;
    tauntLastAt = now;
    try { tauntBus?.disconnect(); } catch { /* ya estaba suelto */ }
    tauntBus = audioCtx.createGain();
    tauntBus.connect(audioCtx.destination);
    try { t.play(); } catch { return false; }
    return true;
}


