// ─── Música de fondo ──────────────────────────────────────────────────────
//
// Sintetizada, como todo lo demás: ni un fichero que descargar antes de la
// primera partida. Es pentatónica a propósito — en esa escala no hay dos notas
// que choquen, así que puede correr mucho sin sonar mal. "Frenética pero
// amable" es exactamente eso: ritmo rápido, notas que no pueden desafinar.
//
// Responde a la racha, que es lo que la hace valer la pena: la partida se oye
// distinta cuando vas encadenando, sin tener que mirar el multiplicador.
const MUSIC_SCALE = [0, 3, 5, 7, 10];     // pentatónica menor, sobre La
const MUSIC_BASS = [0, 0, 7, 5];          // 4 tiempos
let musicTimer = null;
let musicStep = 0;
let musicLevel = 0;      // 0 sin racha · 1 arpegio · 2 contramelodía · 3 a tope
let musicFrenzy = false;

const midi = (semis, oct = 0) => 220 * Math.pow(2, (semis + oct * 12) / 12);

function musicBeatMs() {
    // Cuanto más alta la racha, más rápido. Nunca tanto como para volverse
    // ruido: 260 ms es rápido, no frenético de verdad.
    return [420, 380, 320, 260][musicLevel] ?? 420;
}

function musicTick() {
    if (sfxMuted || !audioCtx) return;
    const paso = musicStep++;
    const compas = paso % 4;

    // El bajo siempre: es lo que sostiene el fondo cuando no pasa nada.
    tone({
        freq: midi(MUSIC_BASS[compas], -1),
        dur: 0.18,
        type: 'triangle',
        gain: 0.05 + musicLevel * 0.012,
    });

    // Arpegio: entra con la racha viva.
    if (musicLevel >= 1) {
        const n = MUSIC_SCALE[(paso * 2) % MUSIC_SCALE.length];
        tone({ freq: midi(n, 1), dur: 0.12, type: 'square', gain: 0.03 });
    }
    // Contramelodía a contratiempo: es lo que da la sensación de que corre.
    if (musicLevel >= 2 && compas % 2 === 1) {
        const n = MUSIC_SCALE[(paso * 3 + 2) % MUSIC_SCALE.length];
        setTimeout(() => tone({ freq: midi(n, 2), dur: 0.08, type: 'square', gain: 0.022 }), musicBeatMs() / 2);
    }
    // Brillo arriba del todo cuando vas lanzado.
    if (musicLevel >= 3 && compas === 0) {
        tone({ freq: midi(MUSIC_SCALE[0], 2), dur: 0.3, type: 'sine', gain: 0.03 });
    }
    // Frenesí cargado: una nota tenida que no está en ningún otro momento, para
    // que se oiga que lo tienes sin mirar la pantalla.
    if (musicFrenzy && compas === 2) {
        tone({ freq: midi(MUSIC_SCALE[4], 2), dur: 0.5, type: 'sine', gain: 0.035 });
    }

    // El tempo cambia con la racha, así que el temporizador se reprograma en
    // cada golpe en vez de usar un intervalo fijo.
    musicTimer = setTimeout(musicTick, musicBeatMs());
}

function startMusic() {
    if (musicTimer || sfxMuted) return;
    unlockAudio();
    if (!audioCtx) return;
    musicStep = 0;
    musicTick();
}

function stopMusic() {
    clearTimeout(musicTimer);
    musicTimer = null;
    musicLevel = 0;
    musicFrenzy = false;
}

/** La racha manda sobre la música. Lo llama `renderCombo`, que ya recibe todo
 *  lo que hace falta: ni estado nuevo ni sondeos. */
function musicFromCombo(multX100, frenzyReady) {
    musicFrenzy = !!frenzyReady;
    musicLevel = multX100 >= 400 ? 3
        : multX100 >= 250 ? 2
        : multX100 >= 150 ? 1
        : 0;
}

function toggleMute() {
    sfxMuted = !sfxMuted;
    try { localStorage.setItem('piles.mute', sfxMuted ? '1' : '0'); } catch { /* modo privado */ }
    const btn = document.getElementById('muteBtn');
    if (btn) {
        btn.textContent = sfxMuted ? '🔇' : '🔊';
        btn.title = t(sfxMuted ? 'game.unmute' : 'game.mute');
    }
    if (sfxMuted) { stopMusic(); }
    else { unlockAudio(); playSfx('take'); if (document.getElementById('gameScreen')?.classList.contains('active')) startMusic(); }
    emitir('toggleMute');
}

