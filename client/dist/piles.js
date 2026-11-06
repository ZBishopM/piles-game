"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // ../client/juego/bus.ts
  var bus_exports = {};
  __export(bus_exports, {
    al: () => al,
    emitir: () => emitir
  });
  var bus = new EventTarget();
  function emitir(nombre, ...datos) {
    return bus.dispatchEvent(new CustomEvent(nombre, { detail: datos, cancelable: true }));
  }
  function al(nombre, f) {
    bus.addEventListener(nombre, (e) => {
      if (f(...e.detail) === false) e.preventDefault();
    });
  }

  // ../client/juego/estado.ts
  var estado_exports = {};
  __export(estado_exports, {
    PONG_TIMEOUT_MS: () => PONG_TIMEOUT_MS,
    RECONNECT_MAX_DELAY: () => RECONNECT_MAX_DELAY,
    est: () => est,
    miNombre: () => miNombre,
    opponentFlippedSets: () => opponentFlippedSets,
    otherVerifications: () => otherVerifications,
    porId: () => porId,
    qteBlockedCards: () => qteBlockedCards
  });
  document.documentElement.style.setProperty("--t-peleada", JSON.stringify(t("card.fought")));
  function porId(id) {
    const el = document.getElementById(id);
    if (!el) throw new Error(`falta #${id} en lobby.html`);
    return el;
  }
  var miNombre = () => (document.querySelector("#nombre")?.value ?? "").trim();
  var est = {
    ws: null,
    currentPlayerId: "",
    currentLobbyId: "",
    currentNickname: "",
    isReady: false,
    gameOver: false,
    allSets: [],
    // Vec<Vec<CardInfo>> - todos los sets del jugador
    centerCards: [],
    // Vec<CardInfo>
    currentSetIndex: 0,
    myFlippedSets: Array(6).fill(false),
    // Entraste con la partida ya empezada: miras, no juegas.
    soyEspectador: false,
    // Cuánta gente está mirando. Llega en `game_update` y `lobby_update`.
    mirones: 0,
    // Keep-alive, y de paso la medida del ping. lastRtt viaja con el ping
    // siguiente: es la única forma de que el servidor sepa la latencia de cada
    // uno, porque medirla desde su lado es imposible.
    pingInterval: null,
    pingSentAt: 0,
    lastPingAt: 0,
    lastRtt: null,
    // Perro guardián: desde cuándo espera su pong el último ping (ver PONG_TIMEOUT_MS).
    pendingPongSince: 0,
    // Reconexión automática (ver RECONNECT_MAX_DELAY).
    reconnectAttempt: 0,
    reconnectTimer: null,
    // Red (red.js): el código del enlace ?join=, hasta entrar con él; volver a la sala.
    codigoPendiente: "",
    rejoinInFlight: false,
    seatToken: null,
    // Espectador (espectador.js)
    specState: null,
    // la última foto
    specOrden: [],
    // los jugadores en el orden de la mesa
    specVista: null,
    // a quién se mira: su apodo, o '*' = todos
    specSet: null,
    // set elegido a mano; null = el que tiene abierto el jugador
    // Tablero (tablero.js): ids de carta por hueco del centro, o null si está libre.
    centerSlots: [],
    // Sonido (sonido.js)
    sfxMuted: false,
    // Toques (toques.js): la carta soltada o cogida que espera respuesta del servidor.
    pendingDrop: null,
    pendingTake: null,
    // Pelea (QTE)
    qteActive: false,
    qteTimerInterval: null,
    qtePlayers: [],
    // Jugadores en la pelea actual
    qteContestedCard: null,
    // La carta por la que se pelea
    qteMyCardId: null,
    // Su id, aunque la carta ya no esté en el centro: sin esto,
    // mi pelea no se reconoce como mía si el centro cambió justo al empezar.
    qteContestedIndex: null,
    // En qué hueco del centro estaba
    qteWonSlot: null,
    // Si ganaste: carta y hueco de origen, para el vuelo
    qteResultTimer: null,
    // Temporizador del resultado — separado de qteTimerInterval,
    // que lo comparten la cuenta atrás del participante y la del espectador.
    // Verificación (verificacion.js)
    verificationSent: false
  };
  var opponentFlippedSets = /* @__PURE__ */ new Map();
  var otherVerifications = /* @__PURE__ */ new Map();
  var qteBlockedCards = /* @__PURE__ */ new Set();
  var PONG_TIMEOUT_MS = 9e3;
  var RECONNECT_MAX_DELAY = 15e3;

  // ../client/juego/red.ts
  var red_exports = {};
  __export(red_exports, {
    diag: () => diag,
    dropSeatLocally: () => dropSeatLocally,
    forgetLobby: () => forgetLobby,
    handleMsg: () => handleMsg,
    reconnect: () => reconnect,
    rememberLobby: () => rememberLobby,
    send: () => send,
    srvText: () => srvText
  });

  // ../client/juego/sala.ts
  var sala_exports = {};
  __export(sala_exports, {
    acceptBotsOffer: () => acceptBotsOffer,
    addBot: () => addBot,
    botDifficulty: () => botDifficulty,
    cambiarRol: () => cambiarRol,
    cameFromQuickMatch: () => cameFromQuickMatch,
    cancelQuickMatchOffer: () => cancelQuickMatchOffer,
    closeCountdown: () => closeCountdown,
    createLobby: () => createLobby,
    enCola: () => enCola,
    extractLobbyCode: () => extractLobbyCode,
    joinLinkFor: () => joinLinkFor,
    joinLobby: () => joinLobby,
    jugadoresEnSala: () => jugadoresEnSala,
    leaveLobby: () => leaveLobby,
    lobbyIsPublic: () => lobbyIsPublic,
    onCountdownCancelled: () => onCountdownCancelled,
    onEnteredLobby: () => onEnteredLobby,
    onGameStart: () => onGameStart,
    onHello: () => onHello,
    onKicked: () => onKicked,
    onLobbyUpdate: () => onLobbyUpdate,
    onSeatReplaced: () => onSeatReplaced,
    qrScanner: () => qrScanner,
    quickMatch: () => quickMatch,
    refreshLobbies: () => refreshLobbies,
    removeBot: () => removeBot,
    requireNickname: () => requireNickname,
    rolPedido: () => rolPedido,
    sendChat: () => sendChat,
    setBotDifficulty: () => setBotDifficulty,
    setVisibility: () => setVisibility,
    startCountdown: () => startCountdown,
    stopScanner: () => stopScanner,
    toggleReady: () => toggleReady,
    toggleScanner: () => toggleScanner,
    versionDelServidor: () => versionDelServidor
  });

  // ../client/juego/espectador.ts
  var espectador_exports = {};
  __export(espectador_exports, {
    onSpectatorCards: () => onSpectatorCards,
    onSpectatorState: () => onSpectatorState,
    resetEspectador: () => resetEspectador,
    sinEmoji: () => sinEmoji
  });

  // ../client/juego/tablero.js
  var tablero_exports = {};
  __export(tablero_exports, {
    IS_BETA: () => IS_BETA,
    REDUCED_MOTION: () => REDUCED_MOTION,
    applyBetaMode: () => applyBetaMode,
    applyCardSprite: () => applyCardSprite,
    buildCard: () => buildCard,
    buildSetNav: () => buildSetNav,
    cardName: () => cardName,
    cardRectAt: () => cardRectAt,
    clearDebtCountdown: () => clearDebtCountdown,
    clearGraceNotices: () => clearGraceNotices,
    fireFrenzy: () => fireFrenzy,
    flashCenter: () => flashCenter,
    flyCard: () => flyCard,
    formatMult: () => formatMult,
    initCardTilt: () => initCardTilt,
    markLanded: () => markLanded,
    misSetsRevelados: () => misSetsRevelados,
    onDebtForced: () => onDebtForced,
    onFrenzyFired: () => onFrenzyFired,
    onPlayerDisconnected: () => onPlayerDisconnected,
    onPlayerLeft: () => onPlayerLeft,
    onWaitPoll: () => onWaitPoll,
    onWaitPollClosed: () => onWaitPollClosed,
    pintarAviso: () => pintarAviso,
    ratingKey: () => ratingKey,
    renderCenterCards: () => renderCenterCards,
    renderCombo: () => renderCombo,
    renderPlayersProgress: () => renderPlayersProgress,
    renderYourCards: () => renderYourCards,
    resetCombo: () => resetCombo,
    startDebtCountdown: () => startDebtCountdown,
    updateFrenzyBtn: () => updateFrenzyBtn,
    updateSetNav: () => updateSetNav
  });

  // ../client/juego/sonido.ts
  var sonido_exports = {};
  __export(sonido_exports, {
    audioCtx: () => audioCtx,
    comboStep: () => comboStep,
    playSfx: () => playSfx,
    tone: () => tone,
    unlockAudio: () => unlockAudio
  });
  var audioCtx = null;
  try {
    est.sfxMuted = localStorage.getItem("piles.mute") === "1";
  } catch {
  }
  function unlockAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      audioCtx = null;
    }
  }
  document.addEventListener("pointerdown", unlockAudio, { once: true });
  function tone({ freq, dur = 0.12, type = "triangle", gain = 0.18, slideTo = null }) {
    if (!audioCtx || est.sfxMuted) return;
    const t2 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const amp = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t2);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t2 + dur);
    amp.gain.setValueAtTime(1e-4, t2);
    amp.gain.exponentialRampToValueAtTime(gain, t2 + 8e-3);
    amp.gain.exponentialRampToValueAtTime(1e-4, t2 + dur);
    osc.connect(amp).connect(audioCtx.destination);
    osc.start(t2);
    osc.stop(t2 + dur + 0.02);
  }
  function noise({ dur = 0.08, gain = 0.12, hp = 800 }) {
    if (!audioCtx || est.sfxMuted) return;
    const t2 = audioCtx.currentTime;
    const n = Math.floor(audioCtx.sampleRate * dur);
    const buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const filt = audioCtx.createBiquadFilter();
    filt.type = "highpass";
    filt.frequency.value = hp;
    const amp = audioCtx.createGain();
    amp.gain.value = gain;
    src.connect(filt).connect(amp).connect(audioCtx.destination);
    src.start(t2);
  }
  function comboStep(multX100) {
    const escalon = Math.max(0, Math.round((multX100 - 100) / 25));
    tone({ freq: 440 * Math.pow(2, Math.min(escalon, 16) / 12), dur: 0.1, type: "square", gain: 0.12 });
  }
  var SFX = {
    // Lanzar una carta: primero viaja, luego aterriza. Antes era un solo
    // chasquido de ruido, que sonaba a estática y no a una carta cayendo sobre
    // una mesa. El tono de salida varía un poco con el id de la carta —igual
    // que su inclinación en `thrownStyle`—, así que dos lanzamientos seguidos
    // no suenan calcados.
    drop: (cardId = 0) => {
      const h = (cardId * 2654435761 >>> 0) % 60;
      tone({ freq: 420 + h, dur: 0.1, type: "triangle", gain: 0.1, slideTo: 180 });
      setTimeout(() => noise({ dur: 0.06, gain: 0.11, hp: 400 }), 70);
    },
    take: () => tone({ freq: 520, dur: 0.07, type: "triangle", gain: 0.12 }),
    setDone: () => {
      tone({ freq: 660, dur: 0.16 });
      setTimeout(() => tone({ freq: 990, dur: 0.22 }), 90);
    },
    fight: () => tone({ freq: 220, dur: 0.18, type: "sawtooth", gain: 0.14, slideTo: 440 }),
    fightWon: () => {
      tone({ freq: 590, dur: 0.12 });
      setTimeout(() => tone({ freq: 880, dur: 0.2 }), 80);
    },
    fightLost: () => tone({ freq: 300, dur: 0.3, type: "sawtooth", gain: 0.13, slideTo: 110 }),
    tiebreak: () => {
      tone({ freq: 440, dur: 0.08, type: "square", gain: 0.1 });
      setTimeout(() => tone({ freq: 440, dur: 0.08, type: "square", gain: 0.1 }), 110);
    },
    refused: () => tone({ freq: 180, dur: 0.09, type: "square", gain: 0.09 }),
    // Cuenta atrás de la sala: un tic por número y un tono más alto al arrancar.
    countTick: () => tone({ freq: 660, dur: 0.09, type: "triangle", gain: 0.14 }),
    countGo: () => tone({ freq: 990, dur: 0.22, type: "triangle", gain: 0.16 }),
    // Cargado: arpegio corto hacia arriba. Soltado: barrido grande.
    frenzyReady: () => [0, 4, 7, 12].forEach((s, i) => setTimeout(() => tone({ freq: 440 * Math.pow(2, s / 12), dur: 0.12 }), i * 70)),
    frenzyFire: () => tone({ freq: 180, dur: 0.5, type: "sawtooth", gain: 0.2, slideTo: 1400 }),
    frenzyHit: () => tone({ freq: 900, dur: 0.4, type: "square", gain: 0.16, slideTo: 90 }),
    frenzyCounter: () => {
      noise({ dur: 0.12, gain: 0.16, hp: 2e3 });
      tone({ freq: 1200, dur: 0.18, gain: 0.12 });
    },
    // El contador de Elo, uno por punto. Fun: un clic ligero de rueda de
    // plástico. Glory: un golpe grave de piedra, con su polvo.
    dialFun: () => tone({ freq: 1800, dur: 0.03, type: "square", gain: 0.035 }),
    dialGlory: () => {
      tone({ freq: 95, dur: 0.14, type: "triangle", gain: 0.22, slideTo: 60 });
      noise({ dur: 0.05, gain: 0.08, hp: 600 });
    },
    // Cambio de rango en el contador. Subir: arpegio mayor que se abre y un
    // brillo al final. Bajar: golpe grave y un crujido, como algo que se parte.
    rankUp: () => {
      [0, 4, 7, 12, 16].forEach((s, i) => setTimeout(() => tone({ freq: 523 * Math.pow(2, s / 12), dur: i === 4 ? 0.5 : 0.14, gain: i === 4 ? 0.16 : 0.13 }), i * 85));
      setTimeout(() => noise({ dur: 0.35, gain: 0.05, hp: 5e3 }), 340);
    },
    rankDown: () => {
      tone({ freq: 150, dur: 0.45, type: "sawtooth", gain: 0.2, slideTo: 48 });
      noise({ dur: 0.18, gain: 0.2, hp: 300 });
      setTimeout(() => noise({ dur: 0.1, gain: 0.12, hp: 1500 }), 140);
      setTimeout(() => noise({ dur: 0.08, gain: 0.09, hp: 2500 }), 260);
    }
  };
  function playSfx(name, arg) {
    if (est.sfxMuted || !audioCtx) return;
    try {
      SFX[name]?.(arg);
    } catch {
    }
  }

  // ../client/juego/musica.ts
  var musica_exports = {};
  __export(musica_exports, {
    musicFromCombo: () => musicFromCombo,
    startMusic: () => startMusic,
    stopMusic: () => stopMusic,
    toggleMute: () => toggleMute
  });
  var MUSIC_SCALE = [0, 3, 5, 7, 10];
  var MUSIC_BASS = [0, 0, 7, 5];
  var musicTimer = null;
  var musicStep = 0;
  var musicLevel = 0;
  var musicFrenzy = false;
  var midi = (semis, oct = 0) => 220 * Math.pow(2, (semis + oct * 12) / 12);
  function musicBeatMs() {
    return [420, 380, 320, 260][musicLevel] ?? 420;
  }
  function musicTick() {
    if (est.sfxMuted || !audioCtx) return;
    const paso = musicStep++;
    const compas = paso % 4;
    tone({
      freq: midi(MUSIC_BASS[compas], -1),
      dur: 0.18,
      type: "triangle",
      gain: 0.05 + musicLevel * 0.012
    });
    if (musicLevel >= 1) {
      const n = MUSIC_SCALE[paso * 2 % MUSIC_SCALE.length];
      tone({ freq: midi(n, 1), dur: 0.12, type: "square", gain: 0.03 });
    }
    if (musicLevel >= 2 && compas % 2 === 1) {
      const n = MUSIC_SCALE[(paso * 3 + 2) % MUSIC_SCALE.length];
      setTimeout(() => tone({ freq: midi(n, 2), dur: 0.08, type: "square", gain: 0.022 }), musicBeatMs() / 2);
    }
    if (musicLevel >= 3 && compas === 0) {
      tone({ freq: midi(MUSIC_SCALE[0], 2), dur: 0.3, type: "sine", gain: 0.03 });
    }
    if (musicFrenzy && compas === 2) {
      tone({ freq: midi(MUSIC_SCALE[4], 2), dur: 0.5, type: "sine", gain: 0.035 });
    }
    musicTimer = setTimeout(musicTick, musicBeatMs());
  }
  function startMusic() {
    if (musicTimer || est.sfxMuted) return;
    unlockAudio();
    if (!audioCtx) return;
    musicStep = 0;
    musicTick();
  }
  function stopMusic() {
    if (musicTimer) clearTimeout(musicTimer);
    musicTimer = null;
    musicLevel = 0;
    musicFrenzy = false;
  }
  function musicFromCombo(multX100, frenzyReady) {
    musicFrenzy = !!frenzyReady;
    musicLevel = multX100 >= 400 ? 3 : multX100 >= 250 ? 2 : multX100 >= 150 ? 1 : 0;
  }
  function toggleMute() {
    est.sfxMuted = !est.sfxMuted;
    try {
      localStorage.setItem("piles.mute", est.sfxMuted ? "1" : "0");
    } catch {
    }
    const btn = document.getElementById("muteBtn");
    if (btn) {
      btn.textContent = est.sfxMuted ? "\u{1F507}" : "\u{1F50A}";
      btn.title = t(est.sfxMuted ? "game.unmute" : "game.mute");
    }
    if (est.sfxMuted) {
      stopMusic();
    } else {
      unlockAudio();
      playSfx("take");
      if (document.getElementById("gameScreen")?.classList.contains("active")) startMusic();
    }
    emitir("toggleMute");
  }

  // ../client/juego/toques.js
  var toques_exports = {};
  __export(toques_exports, {
    FIGHT_RESULT_MS: () => FIGHT_RESULT_MS,
    clearPending: () => clearPending,
    clearSelection: () => clearSelection,
    flipCurrentSet: () => flipCurrentSet,
    onCenterCardClick: () => onCenterCardClick,
    onPlayerCardClick: () => onPlayerCardClick,
    onSetFlipped: () => onSetFlipped,
    onSwapFailed: () => onSwapFailed,
    onSwapSuccess: () => onSwapSuccess,
    owesCard: () => owesCard,
    qteNotifs: () => qteNotifs,
    resetSwapHintLater: () => resetSwapHintLater,
    switchSet: () => switchSet,
    updateFlipBtn: () => updateFlipBtn,
    updateOwingUi: () => updateOwingUi,
    updateSwapHint: () => updateSwapHint
  });

  // ../client/juego/burlas.ts
  var burlas_exports = {};
  __export(burlas_exports, {
    TAUNTS: () => TAUNTS,
    getTaunt: () => getTaunt,
    playTaunt: () => playTaunt,
    tauntLastAt: () => tauntLastAt
  });
  var tauntBus = null;
  var tauntLastAt = -Infinity;
  function tt(at, { freq, dur, type = "square", gain = 0.1, slideTo = null, vib = 0, vibHz = 12 }) {
    const c = audioCtx, t2 = c.currentTime + at;
    const osc = c.createOscillator(), amp = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t2);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t2 + dur);
    if (vib) {
      const lfo = c.createOscillator(), depth = c.createGain();
      lfo.frequency.value = vibHz;
      depth.gain.value = vib;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t2);
      lfo.stop(t2 + dur + 0.02);
    }
    amp.gain.setValueAtTime(1e-4, t2);
    amp.gain.exponentialRampToValueAtTime(gain, t2 + 0.015);
    amp.gain.setValueAtTime(gain, t2 + Math.max(0.02, dur - 0.05));
    amp.gain.exponentialRampToValueAtTime(1e-4, t2 + dur);
    osc.connect(amp).connect(tauntBus);
    osc.start(t2);
    osc.stop(t2 + dur + 0.02);
  }
  var TAUNTS = [
    { id: "honk", name: t("taunt.honk"), play: () => {
      tt(0, { freq: 420, slideTo: 350, dur: 0.15, type: "sawtooth", gain: 0.09 });
      tt(0, { freq: 421, slideTo: 351, dur: 0.15, type: "square", gain: 0.04 });
      tt(0.2, { freq: 340, slideTo: 270, dur: 0.32, type: "sawtooth", gain: 0.09 });
      tt(0.2, { freq: 341, slideTo: 271, dur: 0.32, type: "square", gain: 0.04 });
    } },
    { id: "trombon", name: t("taunt.trombon"), play: () => {
      [[233, 0], [220, 0.2], [208, 0.4]].forEach(([f, at]) => tt(at, { freq: f, dur: 0.17, type: "sawtooth", gain: 0.08 }));
      tt(0.62, { freq: 196, slideTo: 140, dur: 0.55, type: "sawtooth", gain: 0.08, vib: 6, vibHz: 6 });
    } },
    { id: "boing", name: t("taunt.boing"), play: () => {
      tt(0, { freq: 180, slideTo: 720, dur: 0.12, type: "triangle", gain: 0.16 });
      tt(0.12, { freq: 720, slideTo: 200, dur: 0.55, type: "triangle", gain: 0.16, vib: 70, vibHz: 20 });
    } },
    { id: "risa", name: t("taunt.risa"), play: () => {
      [600, 560, 520, 480].forEach((f, i) => tt(i * 0.17, { freq: f, slideTo: f * 0.75, dur: 0.12, type: "square", gain: 0.07 }));
      tt(0.7, { freq: 440, slideTo: 330, dur: 0.18, type: "square", gain: 0.06, vib: 15, vibHz: 14 });
    } },
    { id: "pedorreta", name: t("taunt.pedorreta"), play: () => {
      tt(0, { freq: 95, slideTo: 48, dur: 0.7, type: "sawtooth", gain: 0.22, vib: 28, vibHz: 28 });
      tt(0, { freq: 190, slideTo: 96, dur: 0.7, type: "square", gain: 0.05, vib: 40, vibHz: 31 });
    } },
    { id: "sirena", name: t("taunt.sirena"), play: () => {
      tt(0, { freq: 500, slideTo: 900, dur: 0.35, type: "triangle", gain: 0.13 });
      tt(0.35, { freq: 900, slideTo: 500, dur: 0.35, type: "triangle", gain: 0.13 });
      tt(0.7, { freq: 500, slideTo: 800, dur: 0.25, type: "triangle", gain: 0.13 });
    } },
    { id: "silbido", name: t("taunt.silbido"), play: () => {
      tt(0, { freq: 1900, slideTo: 280, dur: 0.85, type: "sine", gain: 0.12, vib: 40, vibHz: 7 });
    } },
    { id: "campanita", name: t("taunt.campanita"), play: () => {
      [0, 0.24].forEach((at) => {
        tt(at, { freq: 1568, dur: 0.45, type: "sine", gain: 0.1 });
        tt(at, { freq: 1568 * 2.76, dur: 0.2, type: "sine", gain: 0.035 });
      });
    } },
    { id: "gallo", name: t("taunt.gallo"), play: () => {
      tt(0, { freq: 500, slideTo: 900, dur: 0.1, type: "sawtooth", gain: 0.08 });
      tt(0.13, { freq: 700, slideTo: 1100, dur: 0.1, type: "sawtooth", gain: 0.08 });
      tt(0.26, { freq: 900, slideTo: 1250, dur: 0.14, type: "sawtooth", gain: 0.08 });
      tt(0.44, { freq: 1250, slideTo: 520, dur: 0.5, type: "sawtooth", gain: 0.08, vib: 50, vibHz: 16 });
    } },
    { id: "pato", name: t("taunt.pato"), play: () => {
      tt(0, { freq: 460, slideTo: 250, dur: 0.13, type: "sawtooth", gain: 0.09, vib: 40, vibHz: 55 });
      tt(0.2, { freq: 430, slideTo: 230, dur: 0.17, type: "sawtooth", gain: 0.09, vib: 40, vibHz: 55 });
    } }
  ];
  function getTaunt() {
    try {
      const id = localStorage.getItem("piles.taunt") || "";
      return TAUNTS.some((t2) => t2.id === id) ? id : "";
    } catch {
      return "";
    }
  }
  function playTaunt(id, preview = false) {
    const t2 = TAUNTS.find((x) => x.id === id);
    if (!t2 || est.sfxMuted) return false;
    unlockAudio();
    if (!audioCtx) return false;
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {
    });
    const now = performance.now();
    if (!preview && now - tauntLastAt < 2e3) return false;
    tauntLastAt = now;
    try {
      tauntBus?.disconnect();
    } catch {
    }
    tauntBus = audioCtx.createGain();
    tauntBus.connect(audioCtx.destination);
    try {
      t2.play();
    } catch {
      return false;
    }
    return true;
  }

  // ../client/juego/pelea.js
  var pelea_exports = {};
  __export(pelea_exports, {
    cerrarAvisoPelea: () => cerrarAvisoPelea,
    clearStun: () => clearStun,
    closeQteOverlay: () => closeQteOverlay,
    esMiPelea: () => esMiPelea,
    isStunned: () => isStunned,
    onQteResolved: () => onQteResolved,
    onQteTiebreak: () => onQteTiebreak,
    onQteUpdate: () => onQteUpdate,
    onSwapConflict: () => onSwapConflict,
    startStun: () => startStun,
    stunnedUntil: () => stunnedUntil
  });
  var stunnedUntil = 0;
  var stunTimer = null;
  function isStunned() {
    return Date.now() < stunnedUntil;
  }
  function startStun(ms) {
    stunnedUntil = Date.now() + ms;
    document.getElementById("gameScreen").classList.add("stunned");
    const bar = document.getElementById("stunBar");
    const fill = document.getElementById("stunBarFill");
    bar.classList.add("active");
    fill.style.width = "100%";
    if (stunTimer) clearInterval(stunTimer);
    stunTimer = setInterval(() => {
      const left = stunnedUntil - Date.now();
      if (left <= 0) {
        clearInterval(stunTimer);
        stunTimer = null;
        bar.classList.remove("active");
        document.getElementById("gameScreen").classList.remove("stunned");
        return;
      }
      fill.style.width = `${left / ms * 100}%`;
    }, 50);
  }
  function clearStun() {
    stunnedUntil = 0;
    if (stunTimer) {
      clearInterval(stunTimer);
      stunTimer = null;
    }
    document.getElementById("stunBar")?.classList.remove("active");
    document.getElementById("gameScreen")?.classList.remove("stunned");
  }
  function onSwapConflict(players, cardId, durationMs) {
    const isParticipant = players.includes(est.currentNickname);
    const card = est.centerCards.find((c) => c && c.id === cardId) || null;
    qteBlockedCards.add(cardId);
    if (isParticipant) {
      est.qtePlayers = players;
      est.qteMyCardId = cardId;
      est.qteContestedCard = card;
      est.qteContestedIndex = card ? est.centerSlots.indexOf(card.id) : null;
    }
    if (isParticipant || est.pendingTake?.card.id === cardId) {
      est.pendingDrop = null;
      est.pendingTake = null;
      clearPending();
    }
    renderCenterCards();
    if (isParticipant) {
      est.qteActive = true;
      playSfx("fight");
      const rival = players.find((p) => p !== est.currentNickname) || "";
      document.getElementById("qteTitle").textContent = t("qte.title");
      const desc = document.getElementById("qteDesc");
      const rivalEl = document.createElement("strong");
      rivalEl.textContent = rival;
      desc.replaceChildren(t("qte.vs") + " ", rivalEl);
      const cardSlot = document.getElementById("qteCard");
      cardSlot.innerHTML = "";
      if (est.qteContestedCard) cardSlot.appendChild(buildCard(est.qteContestedCard));
      const scoresDiv = document.getElementById("qteScores");
      scoresDiv.innerHTML = "";
      players.forEach((name) => {
        const div = document.createElement("div");
        div.className = "qte-player-score" + (name === est.currentNickname ? " is-me" : "");
        div.id = `qte-score-${name}`;
        const nombre = document.createElement("div");
        nombre.className = "qte-name";
        nombre.textContent = name === est.currentNickname ? t("qte.me", { nick: name }) : name;
        const cuenta = document.createElement("div");
        cuenta.className = "qte-count";
        cuenta.id = `qte-n-${name}`;
        cuenta.textContent = "0";
        div.append(nombre, cuenta);
        scoresDiv.appendChild(div);
      });
      document.getElementById("qteClickBtn").style.display = "block";
      cancelGiveUpHold();
      const rendirse = giveUpBtn();
      if (rendirse) rendirse.hidden = false;
      const fill = document.getElementById("qteTimerFill");
      fill.style.width = "100%";
      const start = Date.now();
      if (est.qteTimerInterval) clearInterval(est.qteTimerInterval);
      est.qteTimerInterval = setInterval(() => {
        const pct = Math.max(0, 100 - (Date.now() - start) / durationMs * 100);
        fill.style.width = pct + "%";
        if (pct <= 0) clearInterval(est.qteTimerInterval);
      }, 50);
      document.getElementById("qteOverlay").classList.add("active");
    } else {
      const area = document.getElementById("verifyNotifications");
      const notif = document.createElement("div");
      notif.className = "qte-battle-notif";
      const funEmojis = ["\u2694\uFE0F", "\u{1F94A}", "\u{1F4A5}", "\u{1F525}", "\u26A1"];
      const emoji = funEmojis[Math.floor(Math.random() * funEmojis.length)];
      const el = (cls, txt) => {
        const e = document.createElement("div");
        e.className = cls;
        if (txt !== void 0) e.textContent = txt;
        return e;
      };
      const span = (cls, txt) => {
        const e = document.createElement("span");
        if (cls) e.className = cls;
        e.textContent = txt;
        return e;
      };
      const versus = el("qbn-versus");
      versus.append(span("qbn-player", players[0]), span("qbn-vs", "\u2694\uFE0F"), span("qbn-player", players[1]));
      const scores = el("qbn-scores");
      players.slice(0, 2).forEach((name) => {
        const s = span("", t("qte.clicks", { n: 0 }));
        s.dataset.nick = name;
        scores.append(s);
      });
      const bar = el("qbn-bar");
      bar.append(el("qbn-bar-fill"));
      notif.append(el("qbn-title", `${emoji} ${t("qte.fight")}`), versus, scores, bar);
      area.appendChild(notif);
      cerrarAvisoPelea(cardId);
      qteNotifs.set(cardId, notif);
      const fill = notif.querySelector(".qbn-bar-fill");
      fill.style.width = "100%";
      const start = Date.now();
      notif._timer = setInterval(() => {
        const pct = Math.max(0, 100 - (Date.now() - start) / durationMs * 100);
        fill.style.width = pct + "%";
        if (pct <= 0) clearInterval(notif._timer);
      }, 50);
      notif._failsafe = setTimeout(() => cerrarAvisoPelea(cardId), durationMs + 4e3);
    }
    emitir("onSwapConflict", players, cardId, durationMs);
  }
  function cerrarAvisoPelea(cardId) {
    const notif = qteNotifs.get(cardId);
    if (!notif) return;
    clearInterval(notif._timer);
    clearTimeout(notif._failsafe);
    notif.remove();
    qteNotifs.delete(cardId);
  }
  function esMiPelea(cardId) {
    if (cardId === void 0 || cardId === null) return true;
    if (est.qteMyCardId !== null) return est.qteMyCardId === cardId;
    return qteBlockedCards.has(cardId);
  }
  function onQteUpdate(clicks, cardId) {
    const notifs = cardId == null ? [...qteNotifs.values()] : [qteNotifs.get(cardId)];
    Object.entries(clicks).forEach(([name, count]) => {
      const overlayEl = document.getElementById(`qte-n-${name}`);
      if (overlayEl) overlayEl.textContent = count;
      notifs.forEach((n) => {
        const s = n && [...n.querySelectorAll("[data-nick]")].find((e) => e.dataset.nick === name);
        if (s) s.textContent = t("qte.clicks", { n: count });
      });
    });
    emitir("onQteUpdate", clicks, cardId);
  }
  function onQteTiebreak(cardId, round, ms) {
    ms = ms || 1e3;
    const bar = (fill2) => {
      const start = Date.now();
      return setInterval(() => {
        fill2.style.width = Math.max(0, 100 - (Date.now() - start) / ms * 100) + "%";
      }, 50);
    };
    const notif = qteNotifs.get(cardId);
    if (notif) {
      clearInterval(notif._timer);
      clearTimeout(notif._failsafe);
      notif.querySelector(".qbn-title").textContent = round > 1 ? t("qte.tie_notif_round", { round }) : t("qte.tie_notif");
      notif.querySelectorAll(".qbn-scores span").forEach((s) => {
        s.textContent = t("qte.clicks", { n: 0 });
      });
      const fill2 = notif.querySelector(".qbn-bar-fill");
      fill2.style.width = "100%";
      notif._timer = bar(fill2);
      notif._failsafe = setTimeout(() => cerrarAvisoPelea(cardId), ms + 4e3);
      return;
    }
    if (!est.qteActive || est.qteMyCardId !== cardId) return;
    const marcador = est.qtePlayers.map((n) => document.getElementById(`qte-n-${n}`)?.textContent ?? "0").join(" \u2013 ");
    const titulo = document.getElementById("qteTitle");
    titulo.textContent = t("qte.tie_title");
    titulo.classList.add("tie");
    document.getElementById("qteBox").classList.add("tie");
    document.getElementById("qteDesc").textContent = t(round > 1 ? "qte.tie_desc_round" : "qte.tie_desc", { score: marcador, round });
    est.qtePlayers.forEach((n) => {
      const el = document.getElementById(`qte-n-${n}`);
      if (el) el.textContent = "0";
    });
    playSfx("tiebreak");
    const fill = document.getElementById("qteTimerFill");
    fill.style.width = "100%";
    if (est.qteTimerInterval) clearInterval(est.qteTimerInterval);
    est.qteTimerInterval = bar(fill);
    clearTimeout(qteTieLabelTimer);
    qteTieLabelTimer = setTimeout(() => {
      titulo.classList.remove("tie");
      titulo.textContent = t("qte.title");
    }, ms);
  }
  var qteTieLabelTimer = null;
  function onQteResolved(winnerName, info) {
    const wasParticipant = est.qtePlayers.includes(est.currentNickname);
    clearTimeout(qteTieLabelTimer);
    if (!wasParticipant) {
      closeQteOverlay();
      return;
    }
    const iWon = winnerName === est.currentNickname;
    playSfx(iWon ? "fightWon" : "fightLost");
    est.qteWonSlot = iWon && est.qteContestedCard ? { card: est.qteContestedCard, index: est.qteContestedIndex } : null;
    document.getElementById("qteClickBtn").style.display = "none";
    cancelGiveUpHold();
    const rendirse = giveUpBtn();
    if (rendirse) rendirse.hidden = true;
    if (est.qteTimerInterval) {
      clearInterval(est.qteTimerInterval);
      est.qteTimerInterval = null;
    }
    est.qtePlayers.forEach((name) => {
      const box = document.getElementById(`qte-score-${name}`);
      if (box) box.classList.add(name === winnerName ? "won" : "lost");
      const n = info?.clicks?.[name];
      const el = document.getElementById(`qte-n-${name}`);
      if (el && n !== void 0) el.textContent = n;
    });
    const titulo = document.getElementById("qteTitle");
    titulo.classList.remove("tie");
    titulo.textContent = t("qte.title");
    if (info?.random) {
      document.getElementById("qteDesc").textContent = t("qte.random");
    } else if (info?.tiebreaks) {
      document.getElementById("qteDesc").textContent = t("qte.sudden");
    }
    est.qteActive = false;
    if (est.qteResultTimer) clearTimeout(est.qteResultTimer);
    est.qteResultTimer = setTimeout(() => {
      est.qteResultTimer = null;
      closeQteOverlay();
    }, info?.random ? FIGHT_RESULT_MS + 900 : FIGHT_RESULT_MS);
  }
  function closeQteOverlay() {
    est.qteActive = false;
    cancelGiveUpHold();
    const rendirse = giveUpBtn();
    if (rendirse) rendirse.hidden = true;
    if (est.qteContestedCard) qteBlockedCards.delete(est.qteContestedCard.id);
    renderCenterCards();
    if (est.qteTimerInterval) {
      clearInterval(est.qteTimerInterval);
      est.qteTimerInterval = null;
    }
    if (est.qteResultTimer) {
      clearTimeout(est.qteResultTimer);
      est.qteResultTimer = null;
    }
    const overlay = document.getElementById("qteOverlay");
    overlay.classList.remove("active");
    document.getElementById("qteClickBtn").disabled = false;
    document.getElementById("qteCard").innerHTML = "";
    document.querySelectorAll(".qte-player-score").forEach((el) => el.classList.remove("won", "lost"));
    document.getElementById("qteBox").classList.remove("tie");
    document.getElementById("qteTitle").classList.remove("tie");
    if (est.qteContestedCard) cerrarAvisoPelea(est.qteContestedCard.id);
    est.qtePlayers = [];
    est.qteContestedCard = null;
    est.qteContestedIndex = null;
    est.qteMyCardId = null;
    emitir("closeQteOverlay");
  }
  function sendQteClick() {
    if (est.qteActive) send({ type: "qte_click" });
  }
  var GIVEUP_HOLD_MS = 700;
  var giveUpTimer = null;
  function giveUpBtn() {
    return document.getElementById("qteGiveUpBtn");
  }
  function cancelGiveUpHold() {
    clearTimeout(giveUpTimer);
    giveUpTimer = null;
    giveUpBtn()?.classList.remove("holding");
  }
  (() => {
    const btn = giveUpBtn();
    if (!btn) return;
    btn.style.setProperty("--giveup-ms", GIVEUP_HOLD_MS + "ms");
    btn.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (!est.qteActive) return;
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {
      }
      btn.classList.add("holding");
      giveUpTimer = setTimeout(() => {
        giveUpTimer = null;
        btn.classList.remove("holding");
        btn.hidden = true;
        playSfx("drop");
        send({ type: "give_up_card" });
      }, GIVEUP_HOLD_MS);
    });
    for (const ev of ["pointerup", "pointercancel"]) {
      btn.addEventListener(ev, (e) => {
        e.stopPropagation();
        cancelGiveUpHold();
      });
    }
  })();
  document.getElementById("qteOverlay").addEventListener("pointerdown", (e) => {
    if (!est.qteActive) return;
    e.preventDefault();
    sendQteClick();
    const overlay = e.currentTarget;
    overlay.classList.add("hit");
    setTimeout(() => overlay.classList.remove("hit"), 60);
  });
  document.addEventListener("keydown", (e) => {
    if (est.qteActive && (e.code === "Space" || e.code === "Enter") && e.target.tagName !== "INPUT") {
      e.preventDefault();
      sendQteClick();
    }
  });

  // ../client/juego/toques.js
  var TAP_SLOP_PX = 12;
  var TAP_MAX_MS = 700;
  function bindTap(container, handler, target = "?", { alSoltar = false } = {}) {
    if (!container) {
      console.error("[piles] falta el contenedor de cartas: no habr\xE1 toques");
      return;
    }
    let start = null;
    const canScroll = () => {
      const oy = getComputedStyle(container).overflowY;
      return (oy === "auto" || oy === "scroll") && container.scrollHeight > container.clientHeight + 2;
    };
    const ignorado = (reason, s, extra = {}) => diag.note("tap_ignored", {
      reason,
      target,
      pointer: s.pointer,
      ms: Date.now() - s.t,
      ...extra
    });
    container.addEventListener("pointerdown", (e) => {
      start = null;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const el = e.target.closest("[data-tap]");
      if (!el || !container.contains(el)) return;
      start = {
        tap: el.dataset.tap,
        x: e.clientX,
        y: e.clientY,
        t: Date.now(),
        el,
        fired: false,
        pointer: e.pointerType
      };
      el.classList.add("tapped");
      if (!alSoltar && (e.pointerType === "mouse" || !canScroll())) {
        start.fired = true;
        handler(start.tap, el);
      }
    });
    const cancel = (e) => {
      if (start) {
        start.el.classList.remove("tapped");
        if (!start.fired) ignorado(e?.type === "pointerleave" ? "left" : "cancel", start);
      }
      start = null;
    };
    container.addEventListener("pointercancel", cancel);
    container.addEventListener("pointerleave", cancel);
    container.addEventListener("pointerup", (e) => {
      if (!start) return;
      const s = start;
      start = null;
      s.el.classList.remove("tapped");
      if (s.fired) return;
      const dist = Math.round(Math.hypot(e.clientX - s.x, e.clientY - s.y));
      if (dist > TAP_SLOP_PX) return ignorado("moved", s, { dist });
      if (Date.now() - s.t > TAP_MAX_MS) return ignorado("slow", s, { dist });
      handler(s.tap, s.el);
    });
  }
  function showGhost(card) {
    const div = document.getElementById("yourCards");
    if (!div) return;
    const slot = (est.allSets[est.currentSetIndex] || []).findIndex((c) => !c);
    if (slot === -1 || !div.children[slot]) return;
    const ghost = buildCard(card);
    ghost.classList.add("card-ghost");
    div.replaceChild(ghost, div.children[slot]);
  }
  function rollbackGhost() {
    const ghosts = document.querySelectorAll(".card-ghost");
    if (!ghosts.length) return;
    ghosts.forEach((el) => el.classList.add("ghost-out"));
    setTimeout(() => {
      renderYourCards();
    }, 160);
  }
  function markPending(el) {
    clearPending();
    if (el) el.classList.add("card-pending");
  }
  function clearPending() {
    document.querySelectorAll(".card-pending").forEach((el) => el.classList.remove("card-pending"));
  }
  function refuseTap(el) {
    if (!el) return;
    playSfx("refused");
    el.classList.remove("refused");
    void el.offsetWidth;
    el.classList.add("refused");
    setTimeout(() => el.classList.remove("refused"), 300);
  }
  bindTap(
    document.getElementById("centerCards"),
    (v, el) => {
      if (!est.soyEspectador) onCenterCardClick(Number(v), el);
    },
    "center"
  );
  bindTap(
    document.getElementById("yourCards"),
    (v, el) => {
      if (!est.soyEspectador) onPlayerCardClick(Number(v), el);
    },
    "own",
    { alSoltar: true }
  );
  var PENDING_MAX_MS = 2500;
  var enVuelo = (p) => !!p && Date.now() - p.t < PENDING_MAX_MS;
  function onPlayerCardClick(index, el) {
    if (est.qteActive || isStunned() || owesCard()) return refuseTap(el);
    if (enVuelo(est.pendingDrop)) return;
    const card = (est.allSets[est.currentSetIndex] || [])[index];
    if (!card) return;
    est.pendingDrop = { index, card, t: Date.now() };
    markPending(el);
    playSfx("drop", card.id);
    send({ type: "drop_card", my_card_index: index });
  }
  function onCenterCardClick(cardId, el) {
    const rechazo = (why) => {
      if (owesCard()) {
        diag.note("tap_refused", {
          why,
          qte: est.qteActive,
          stun_ms: Math.max(0, stunnedUntil - Date.now()),
          blocked: qteBlockedCards.size,
          p_take_ms: est.pendingTake ? Date.now() - est.pendingTake.t : null
        });
      }
      return refuseTap(el);
    };
    if (est.qteActive) return rechazo("qte");
    if (isStunned()) return rechazo("stun");
    if (qteBlockedCards.has(cardId)) return rechazo("blocked");
    if (!owesCard()) return refuseTap(el);
    if (enVuelo(est.pendingTake)) return;
    const card = est.centerCards.find((c) => c.id === cardId);
    if (!card) return;
    est.pendingTake = { centerIndex: est.centerSlots.indexOf(cardId), card, t: Date.now() };
    markPending(el);
    showGhost(card);
    send({ type: "take_card", card_id: card.id });
  }
  function onSwapSuccess(msg) {
    const drop = est.pendingDrop;
    const take = est.pendingTake;
    const wonFight = !drop && !take && est.qteWonSlot !== null;
    const fromMine = drop ? cardRectAt("yourCards", drop.index) : null;
    const fromCenter = take ? cardRectAt("centerCards", take.centerIndex) : wonFight ? cardRectAt("centerCards", est.qteWonSlot.index) : null;
    const oldSet = (est.allSets[msg.set_index] || []).slice();
    if (msg.your_new_set) est.allSets[msg.set_index] = msg.your_new_set;
    est.centerCards = msg.center_cards;
    renderYourCards();
    renderCenterCards();
    updateSetNav();
    if (wonFight) {
      const slot = findChangedSlot(oldSet, msg.your_new_set);
      if (slot !== -1) {
        flyCard(est.qteWonSlot.card, fromCenter, "yourCards", slot, true);
      }
      est.qteWonSlot = null;
    } else if (drop) {
      const landed = est.centerSlots.indexOf(drop.card.id);
      if (landed !== -1) flyCard(drop.card, fromMine, "centerCards", landed);
    } else if (take) {
      const slot = findChangedSlot(oldSet, msg.your_new_set);
      if (slot !== -1) flyCard(take.card, fromCenter, "yourCards", slot);
    }
    est.pendingDrop = null;
    est.pendingTake = null;
    clearPending();
    updateOwingUi();
  }
  function onSwapFailed(msg) {
    est.pendingDrop = null;
    est.pendingTake = null;
    rollbackGhost();
    clearPending();
    emitir("onSwapFailed", msg);
    if (est.qtePlayers.includes(est.currentNickname) || isStunned()) return;
    const kind = msg.kind || "rule";
    if (kind === "gone") {
      renderYourCards();
      renderCenterCards();
      if (msg.taunt && !est.soyEspectador) playTaunt(msg.taunt);
      return;
    }
    if (!msg.reason) return;
    renderYourCards();
    renderCenterCards();
    updateSwapHint(`\u26A0\uFE0F ${srvText(msg, "swapfail")}`);
    resetSwapHintLater(2500);
  }
  function findChangedSlot(oldCards, newCards) {
    if (!newCards) return -1;
    for (let i = 0; i < newCards.length; i++) {
      if (!oldCards[i] || oldCards[i].id !== newCards[i].id) return i;
    }
    return -1;
  }
  function owesCard() {
    return est.allSets.some((set) => (set || []).some((card) => !card));
  }
  function updateOwingUi() {
    const owing = owesCard();
    document.getElementById("gameScreen")?.classList.toggle("owing", owing);
    const hint = document.getElementById("swapHint");
    if (hint) hint.textContent = owing ? OWING_HINT : DEFAULT_SWAP_HINT;
    const flip = document.getElementById("flipBtn");
    if (flip) flip.disabled = owing;
    document.querySelectorAll(".set-btn").forEach((b) => {
      b.disabled = owing;
    });
    if (!owing) clearDebtCountdown();
  }
  var DEFAULT_SWAP_HINT = t("swap.hint");
  var OWING_HINT = t("swap.owing");
  function clearSelection() {
    updateSwapHint(owesCard() ? OWING_HINT : DEFAULT_SWAP_HINT);
  }
  var swapHintResetTimer = null;
  function resetSwapHintLater(delayMs) {
    if (swapHintResetTimer) clearTimeout(swapHintResetTimer);
    swapHintResetTimer = setTimeout(() => {
      swapHintResetTimer = null;
      updateSwapHint(owesCard() ? OWING_HINT : DEFAULT_SWAP_HINT);
    }, delayMs);
  }
  function updateSwapHint(texto) {
    const el = document.getElementById("swapHint");
    el.textContent = texto;
    el.classList.toggle("selected", owesCard());
  }
  function switchSet(index) {
    if (index === est.currentSetIndex) return;
    if (owesCard()) return;
    const antes = est.currentSetIndex;
    est.currentSetIndex = index;
    clearSelection();
    send({ type: "switch_set", set_index: index });
    document.querySelectorAll('#fxLayer .card[data-row="yourCards"]').forEach((c) => c.finishFlight(false));
    renderYourCards();
    emitir("switchSet", index, antes);
  }
  function flipCurrentSet(i = est.currentSetIndex) {
    send({ type: "flip_set", set_index: i });
  }
  function updateFlipBtn() {
    const btn = document.getElementById("flipBtn");
    if (!btn) return;
    const flipped = est.myFlippedSets[est.currentSetIndex];
    btn.textContent = t(flipped ? "game.hide" : "game.flip");
    btn.title = t(flipped ? "game.hidetitle" : "game.fliptitle");
    btn.classList.toggle("is-flipped", flipped);
  }
  function onSetFlipped(playerName, setIndex, cards) {
    const isFlipped = cards.length > 0;
    if (playerName === est.currentNickname) {
      est.myFlippedSets[setIndex] = isFlipped;
      updateSetNav();
    } else {
      if (!opponentFlippedSets.has(playerName)) {
        opponentFlippedSets.set(playerName, /* @__PURE__ */ new Map());
      }
      const playerMap = opponentFlippedSets.get(playerName);
      if (isFlipped) {
        playerMap.set(setIndex, cards[0]);
      } else {
        playerMap.delete(setIndex);
      }
      renderPlayersProgress(null);
    }
  }
  var qteNotifs = /* @__PURE__ */ new Map();
  var FIGHT_RESULT_MS = 800;

  // ../client/juego/verificacion.ts
  var verificacion_exports = {};
  __export(verificacion_exports, {
    checkAutoVerify: () => checkAutoVerify,
    clearMatchNotifications: () => clearMatchNotifications,
    closeVerifyOverlay: () => closeVerifyOverlay,
    onGameOver: () => onGameOver,
    onVerificationFailed: () => onVerificationFailed,
    onVerificationSuccess: () => onVerificationSuccess,
    openVerifyOverlay: () => openVerifyOverlay,
    revealVerifySet: () => revealVerifySet
  });

  // ../client/juego/cuenta.ts
  var cuenta_exports = {};
  __export(cuenta_exports, {
    claimSessionManagerResult: () => claimSessionManagerResult,
    clearSmCode: () => clearSmCode,
    fetchElo: () => fetchElo,
    onGameCancelled: () => onGameCancelled,
    returnToLobby: () => returnToLobby,
    setSmCode: () => setSmCode,
    showScreen: () => showScreen,
    smCodeGuardado: () => smCodeGuardado,
    vistaActual: () => vistaActual
  });
  var SM_BASE = "https://gamesessions.danassistantassistant.website";
  async function fetchElo(key) {
    const res = await fetch(`/api/elo/${encodeURIComponent(key)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  var played = (rec) => !!rec && (!!rec.fun || !!rec.glory);
  var eloLine = (rec) => ["fun", "glory"].filter((p) => rec?.[p]).map((p) => `${p === "fun" ? "For fun" : "For glory"} ${rec[p].r} (${t("elo.games", { n: rec[p].n })})`).join(" \xB7 ");
  var smCodeGuardado = () => (localStorage.getItem("piles_sm_code") || "").trim();
  function setSmCode(code) {
    const v = (code || "").trim().toUpperCase();
    if (!v) {
      clearSmCode();
      return;
    }
    localStorage.setItem("piles_sm_code", v);
    if (/^[A-Z2-9]{6,12}$/.test(v)) linkAccountElo(v);
  }
  function clearSmCode() {
    localStorage.removeItem("piles_sm_code");
    unlinkAccountElo();
  }
  function askEloChoice({ title, text, a, b }) {
    const box = porId("eloChoice");
    porId("eloChoiceTitle").textContent = title;
    porId("eloChoiceText").textContent = text;
    const btnA = porId("eloChoiceA");
    const btnB = porId("eloChoiceB");
    btnA.textContent = a;
    btnB.textContent = b;
    box.hidden = false;
    return new Promise((resolve) => {
      const done = (choice) => {
        box.hidden = true;
        btnA.onclick = btnB.onclick = null;
        resolve(choice);
      };
      btnA.onclick = () => done("a");
      btnB.onclick = () => done("b");
    });
  }
  async function linkAccountElo(code) {
    if (!/^[A-Z2-9]{6,12}$/.test(code)) return;
    let player;
    try {
      const url = `${SM_BASE}/api/collections/piles_claims/records?perPage=1&filter=${encodeURIComponent(`code='${code}'`)}`;
      const res = await fetch(url);
      player = (await res.json()).items?.[0]?.player;
    } catch {
    }
    if (!player) return;
    const account = `sm:${player}`;
    if (localStorage.getItem("piles_rating_key") === account) return;
    const anonId = localStorage.getItem("piles_anon_id");
    const anon = anonId ? `anon:${anonId}` : null;
    let del_navegador = null, de_la_cuenta = null;
    try {
      [del_navegador, de_la_cuenta] = await Promise.all([anon ? fetchElo(anon) : null, fetchElo(account)]);
    } catch {
      agToast({ kind: "error", title: "Elo", message: t("elo.err_read") });
      return;
    }
    let keep = "account";
    if (played(del_navegador) && !played(de_la_cuenta)) {
      const r = await askEloChoice({
        title: t("elo.move_q"),
        text: t("elo.move_text", { elo: eloLine(del_navegador) }),
        a: t("elo.move_yes"),
        b: t("elo.move_no")
      });
      keep = r === "a" ? "anon" : "account";
    } else if (played(del_navegador) && played(de_la_cuenta)) {
      const r = await askEloChoice({
        title: t("elo.keep_q"),
        text: t("elo.keep_text", { acc: eloLine(de_la_cuenta), br: eloLine(del_navegador) }),
        a: t("elo.keep_acc"),
        b: t("elo.keep_br")
      });
      keep = r === "a" ? "account" : "anon";
    }
    if (anon) {
      const res = await fetch("/api/elo/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ anon, account, keep })
      }).catch(() => null);
      if (!res?.ok) {
        agToast({ kind: "error", title: "Elo", message: t("elo.err_link") });
        return;
      }
    }
    localStorage.setItem("piles_rating_key", account);
    localStorage.removeItem("piles_anon_id");
    agToast({ kind: "success", message: t("elo.linked") });
  }
  function unlinkAccountElo() {
    localStorage.removeItem("piles_rating_key");
    localStorage.removeItem("piles_anon_id");
  }
  function claimSessionManagerResult(rankings) {
    if (IS_BETA) return;
    const code = (localStorage.getItem("piles_sm_code") || "").trim().toUpperCase();
    if (!code) return;
    const myNickname = localStorage.getItem("piles_nickname");
    const mine = rankings.find((r) => r.nickname === myNickname);
    if (!mine) return;
    fetch("https://gamesessions.danassistantassistant.website/api/piles/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, placement: mine.position, points: mine.points })
    }).then((res) => res.json().then((body) => ({ ok: res.ok, body }))).then(({ ok, body }) => {
      const footer = document.getElementById("smClaimStatus");
      if (!footer) return;
      if (ok) {
        footer.textContent = t("sm.ok");
        return;
      }
      if (body.error === "unknown code") {
        localStorage.removeItem("piles_sm_code");
        footer.textContent = t("sm.stale");
        return;
      }
      footer.textContent = t("sm.fail", { why: body.error || t("sm.unknown") });
    }).catch(() => {
      const footer = document.getElementById("smClaimStatus");
      if (footer) footer.textContent = t("sm.offline");
    });
  }
  function onGameCancelled(msg) {
    stopMusic();
    closeVerifyOverlay();
    closeQteOverlay();
    clearStun();
    clearMatchNotifications();
    resetCombo();
    agToast({ kind: "warning", title: t("cancel.title"), message: srvText(msg, "cancel") });
    returnToLobby();
  }
  function returnToLobby() {
    cancelQuickMatchOffer();
    stopMusic();
    est.gameOver = false;
    est.isReady = false;
    porId("gameOverOverlay").classList.remove("active");
    document.getElementById("confetiLayer")?.remove();
    est.allSets = [];
    est.centerCards = [];
    est.verificationSent = false;
    est.myFlippedSets = Array(6).fill(false);
    opponentFlippedSets.clear();
    est.pendingDrop = null;
    est.pendingTake = null;
    clearStun();
    document.getElementById("gameScreen")?.classList.remove("owing");
    porId("fxLayer").innerHTML = "";
    clearMatchNotifications();
    est.specState = null;
    est.specVista = null;
    est.specSet = null;
    showScreen("lobbyScreen");
  }
  var vistaActual = "homeScreen";
  function showScreen(id) {
    vistaActual = id;
    porId("gameScreen").classList.toggle("active", id === "gameScreen");
    if (id !== "lobbyScreen") closeCountdown();
    emitir("showScreen", id);
  }
  window.onBeforeLangChange = () => {
    try {
      const v = miNombre();
      if (v) localStorage.setItem("piles_nickname", v);
      sessionStorage.setItem("piles.afterLang", vistaActual);
    } catch {
    }
  };

  // ../client/juego/verificacion.ts
  function checkAutoVerify() {
    if (est.verificationSent) return;
    if (est.myFlippedSets.length === 6 && est.myFlippedSets.every((f) => f)) {
      est.verificationSent = true;
      send({ type: "request_verification" });
    }
  }
  function openVerifyOverlay(playerName) {
    if (playerName === est.currentNickname) {
      const overlay = porId("verifyOverlay");
      porId("verifyTitle").textContent = t("verify.mine");
      porId("verifyFooter").textContent = "";
      porId("verifyFooter").className = "verify-footer";
      porId("verifyCloseBtn").style.display = "none";
      const setsDiv = porId("verifySets");
      setsDiv.innerHTML = "";
      for (let i = 0; i < 6; i++) {
        const row = document.createElement("div");
        row.className = "verify-set-row";
        row.innerHTML = `
                <span class="verify-set-label">${esc(t("set.n", { n: i + 1 }))}</span>
                <div class="verify-cards" id="vcards-${i}"></div>
                <span class="verify-icon" id="vicon-${i}">\u23F3</span>
            `;
        setsDiv.appendChild(row);
      }
      overlay.classList.add("active");
    } else {
      const area = porId("verifyNotifications");
      const previous = otherVerifications.get(playerName);
      if (previous) previous.remove();
      const notif = document.createElement("div");
      notif.className = "verify-notif";
      notif.innerHTML = `
            <div class="vnotif-header"></div>
            <div class="vnotif-sets">
                ${Array.from({ length: 6 }, (_, i) => `<span id="vnotif-${esc(playerName)}-${i}" title="${esc(t("set.n", { n: i + 1 }))}">\u23F3</span>`).join("")}
            </div>
        `;
      notif.querySelector(".vnotif-header").textContent = t("verify.other", { nick: playerName });
      area.appendChild(notif);
      otherVerifications.set(playerName, notif);
    }
    emitir("openVerifyOverlay", playerName);
  }
  function revealVerifySet(playerName, setIndex, isValid, cards) {
    const symbol = isValid ? "\u2705" : "\u274C";
    if (playerName === est.currentNickname) {
      const cardsDiv = document.getElementById(`vcards-${setIndex}`);
      const icon = document.getElementById(`vicon-${setIndex}`);
      if (cardsDiv) {
        cardsDiv.innerHTML = "";
        cards.forEach((card) => {
          const mini = document.createElement("span");
          mini.className = "verify-card-mini";
          applyCardSprite(mini, card);
          mini.title = cardName(card.clothing_type, card.name);
          cardsDiv.appendChild(mini);
        });
      }
      if (icon) icon.textContent = symbol;
    } else {
      const icon = document.getElementById(`vnotif-${playerName}-${setIndex}`);
      if (icon) icon.textContent = symbol;
    }
    emitir("revealVerifySet", playerName, setIndex, isValid, cards);
  }
  function onVerificationSuccess(playerName, position) {
    const medals = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];
    const medal = medals[position - 1] || t("pos.ord", { n: position });
    if (playerName === est.currentNickname) {
      const footer = porId("verifyFooter");
      footer.textContent = t("verify.done_me", { medal, pos: position });
      footer.className = "verify-footer success";
      porId("verifyCloseBtn").style.display = "block";
    } else {
      const notif = otherVerifications.get(playerName);
      if (notif) {
        notif.classList.add("success");
        notif.querySelector(".vnotif-header").textContent = t("verify.done_other", { medal, nick: playerName, pos: position });
        dismissVerifyNotif(playerName, notif, 5e3);
      }
    }
    emitir("onVerificationSuccess", playerName, position);
  }
  function onVerificationFailed(playerName, failedSets) {
    const failedNames = failedSets.map((i) => t("set.n", { n: i + 1 })).join(t("list.sep"));
    if (playerName === est.currentNickname) {
      est.verificationSent = false;
      const footer = porId("verifyFooter");
      footer.textContent = t("verify.fail_me", { list: failedNames });
      footer.className = "verify-footer failure";
      porId("verifyCloseBtn").style.display = "block";
    } else {
      const notif = otherVerifications.get(playerName);
      if (notif) {
        notif.classList.add("failure");
        notif.querySelector(".vnotif-header").textContent = t("verify.fail_other", { nick: playerName, list: failedNames });
        dismissVerifyNotif(playerName, notif, 4e3);
      }
    }
    emitir("onVerificationFailed", playerName, failedSets);
  }
  function closeVerifyOverlay() {
    porId("verifyOverlay").classList.remove("active");
  }
  function dismissVerifyNotif(playerName, notif, delayMs) {
    setTimeout(() => {
      notif.remove();
      if (otherVerifications.get(playerName) === notif) {
        otherVerifications.delete(playerName);
      }
    }, delayMs);
  }
  function clearMatchNotifications() {
    porId("verifyNotifications").innerHTML = "";
    otherVerifications.clear();
    for (const id of [...qteNotifs.keys()]) cerrarAvisoPelea(id);
    qteBlockedCards.clear();
    est.qteMyCardId = null;
    emitir("clearMatchNotifications");
  }
  function lanzarConfeti() {
    if (REDUCED_MOTION?.matches || document.getElementById("confetiLayer")) return;
    const layer = document.createElement("div");
    layer.id = "confetiLayer";
    layer.setAttribute("aria-hidden", "true");
    const colores = ["#a9b689", "#f7d51d", "#d6208f", "#ffffff"];
    const r = (a, b) => a + Math.random() * (b - a);
    const vw = window.innerWidth, vh = window.innerHeight;
    for (let i = 0; i < 48; i++) {
      const c = document.createElement("i");
      const color = colores[i % colores.length];
      const carta = i % 12 === 0;
      c.className = "confeti" + (carta ? " carta" : "");
      c.style.width = (carta ? 11 : r(6, 10)) + "px";
      c.style.height = (carta ? 16 : r(9, 15)) + "px";
      c.style.background = color;
      c.style.setProperty("--c", color);
      c.style.setProperty("--dx", r(-0.5, 0.5) * vw + "px");
      c.style.setProperty("--up", -r(0.12, 0.35) * vh + "px");
      c.style.setProperty("--fall", vh * 0.6 + r(0, 0.2) * vh + "px");
      c.style.setProperty("--r", r(-900, 900) + "deg");
      c.style.setProperty("--t", r(2.6, 3.5) + "s");
      c.style.setProperty("--d", r(0, 0.3) + "s");
      layer.appendChild(c);
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 4200);
  }
  function onGameOver(rankings, elo = []) {
    const yaMostrado = porId("gameOverOverlay").classList.contains("active");
    est.gameOver = true;
    stopMusic();
    closeVerifyOverlay();
    clearMatchNotifications();
    resetCombo();
    const list = porId("rankingList");
    list.innerHTML = "";
    const titulo = document.querySelector("#gameOverOverlay h2");
    if (titulo) titulo.textContent = sinEmoji(t("over.title"));
    rankings.forEach((entry) => {
      const div = document.createElement("div");
      div.className = "ranking-entry";
      const e = elo.find((c) => c.nickname === entry.nickname);
      const d = e ? e.after - e.before : null;
      const pos = document.createElement("span");
      pos.className = "rank-pos";
      pos.textContent = String(entry.position);
      const nombre = document.createElement("span");
      nombre.className = "rank-name";
      nombre.textContent = sinEmoji(entry.nickname);
      div.append(pos, nombre);
      if (d !== null) {
        const eloTag = document.createElement("span");
        eloTag.className = "rank-elo " + (d > 0 ? "up" : d < 0 ? "down" : "");
        eloTag.textContent = `${d > 0 ? "+" : d < 0 ? "\u2212" : "\xB1"}${Math.abs(d)}`;
        div.append(eloTag);
      }
      list.appendChild(div);
    });
    porId("gameOverOverlay").classList.add("active");
    showMyElo(elo);
    claimSessionManagerResult(rankings);
    if (!yaMostrado && rankings.length > 1 && rankings.some((e) => e.position === 1 && e.nickname === est.currentNickname)) lanzarConfeti();
  }
  function showMyElo(elo) {
    const box = porId("eloDial");
    const mio = elo.find((c) => c.nickname === est.currentNickname);
    if (!mio || typeof agDial !== "function") {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const glory = mio.pool === "glory";
    setTimeout(() => agDial(box, {
      from: mio.before,
      to: mio.after,
      skin: glory ? "glory" : "fun",
      // El Top 3 lo decide el servidor (los 3 mejores con 10 partidas y más de 1000).
      top3Before: !!mio.top3_before,
      top3After: !!mio.top3_after,
      onStep: () => playSfx(glory ? "dialGlory" : "dialFun"),
      onRank: (e) => playSfx(e.dir === "up" ? "rankUp" : "rankDown")
    }), 450);
  }

  // ../client/juego/tablero.js
  function buildSetNav() {
    const nav = document.getElementById("setNav");
    nav.innerHTML = "";
    for (let i = 0; i < 6; i++) {
      const btn = document.createElement("button");
      btn.className = "set-btn" + (i === 0 ? " active" : "");
      btn.dataset.idx = i;
      btn.innerHTML = `${esc(t("set.n", { n: i + 1 }))}<span class="set-eye"></span>`;
      btn.onclick = () => switchSet(i);
      nav.appendChild(btn);
    }
  }
  function updateSetNav() {
    const owing = owesCard();
    document.querySelectorAll(".set-btn").forEach((btn, i) => {
      const flipped = est.myFlippedSets[i];
      btn.className = "set-btn" + (i === est.currentSetIndex ? " active" : "") + (flipped ? " flipped" : "");
      btn.querySelector(".set-eye").textContent = flipped ? "\u{1F441}" : "";
      btn.disabled = owing;
    });
    updateFlipBtn();
    checkAutoVerify();
    emitir("updateSetNav");
  }
  function syncCenterSlots() {
    const present = new Set(est.centerCards.map((c) => c.id));
    est.centerSlots = est.centerSlots.map((id) => id !== null && present.has(id) ? id : null);
    const placed = new Set(est.centerSlots.filter((id) => id !== null));
    for (const card of est.centerCards) {
      if (placed.has(card.id)) continue;
      const free = est.centerSlots.indexOf(null);
      if (free === -1) est.centerSlots.push(card.id);
      else est.centerSlots[free] = card.id;
      placed.add(card.id);
    }
    while (est.centerSlots.length && est.centerSlots[est.centerSlots.length - 1] === null) {
      est.centerSlots.pop();
    }
  }
  function thrownStyle(cardId) {
    const h = cardId * 2654435761 >>> 0;
    const angle = (h % 241 / 240 - 0.5) * 24;
    const dx = ((h >>> 8) % 101 / 100 - 0.5) * 10;
    const dy = ((h >>> 16) % 101 / 100 - 0.5) * 10;
    return { angle, dx, dy };
  }
  function renderCenterCards() {
    const div = document.getElementById("centerCards");
    if (!div) return;
    syncCenterSlots();
    div.innerHTML = "";
    for (const id of est.centerSlots) {
      if (id === null) {
        const gap = document.createElement("div");
        gap.className = "card center-gap";
        div.appendChild(gap);
        continue;
      }
      const card = est.centerCards.find((c) => c.id === id);
      if (!card) continue;
      const el = buildCard(card);
      const { angle, dx, dy } = thrownStyle(card.id);
      el.style.setProperty("--throw-rot", `${angle}deg`);
      el.style.setProperty("--throw-x", `${dx}%`);
      el.style.setProperty("--throw-y", `${dy}%`);
      el.classList.add("thrown");
      if (est.pendingTake?.card.id === card.id) el.classList.add("card-pending");
      if (qteBlockedCards.size) {
        if (qteBlockedCards.has(card.id)) {
          el.classList.add(est.qteActive ? "qte-locked" : "qte-contested");
        } else if (est.qteActive) {
          el.classList.add("qte-waiting");
        }
      }
      el.dataset.tap = card.id;
      div.appendChild(el);
    }
    emitir("renderCenterCards");
  }
  function renderYourCards() {
    const div = document.getElementById("yourCards");
    div.innerHTML = "";
    const set = est.allSets[est.currentSetIndex] || [];
    set.forEach((card, i) => {
      if (!card) {
        const gap = document.createElement("div");
        gap.className = "card card-empty";
        gap.title = t("card.gap");
        div.appendChild(gap);
        return;
      }
      const el = buildCard(card);
      el.dataset.tap = i;
      div.appendChild(el);
    });
    updateSetNav();
    updateOwingUi();
  }
  var lastProgress = [];
  function renderPlayersProgress(progress) {
    if (progress) lastProgress = progress;
    const hud = document.getElementById("hud");
    if (!hud) return;
    hud.innerHTML = "";
    lastProgress.slice(0, 8).forEach((p) => {
      const esMio = p.nickname === est.currentNickname;
      const stripe = document.createElement("div");
      stripe.className = "hud-stripe" + (esMio ? " is-me" : "") + (p.finished ? " finished" : "") + (p.on_fire ? " on-fire" : "");
      const name = document.createElement("span");
      name.className = "hud-name";
      name.textContent = p.nickname;
      name.title = p.nickname;
      stripe.appendChild(name);
      const slots = document.createElement("span");
      slots.className = "hud-slots";
      const revelados = esMio ? misSetsRevelados() : opponentFlippedSets.get(p.nickname) || /* @__PURE__ */ new Map();
      for (let i = 0; i < 6; i++) {
        const dot = document.createElement("i");
        const card = revelados.get(i);
        if (card) {
          dot.className = "hud-dot revealed";
          applyCardSprite(dot, card);
          dot.title = t("hud.revealed", { set: i + 1, name: cardName(card.clothing_type, card.name) });
        } else {
          dot.className = "hud-dot";
          dot.title = t("hud.hidden", { set: i + 1 });
        }
        slots.appendChild(dot);
      }
      stripe.appendChild(slots);
      const count = document.createElement("span");
      count.className = "hud-count";
      count.textContent = p.completed_sets;
      count.title = t("hud.closed", { n: p.completed_sets });
      stripe.appendChild(count);
      hud.appendChild(stripe);
    });
    if (est.mirones > 0) {
      const chip = document.createElement("div");
      chip.className = "hud-stripe mirones";
      chip.textContent = `\u{1F441} ${est.mirones}`;
      chip.title = t("hud.watching", { n: est.mirones });
      hud.appendChild(chip);
    }
    emitir("renderPlayersProgress", progress);
  }
  function misSetsRevelados() {
    const m = /* @__PURE__ */ new Map();
    for (let i = 0; i < 6; i++) {
      if (!est.myFlippedSets[i]) continue;
      const set = est.allSets[i] || [];
      const card = set.find((c) => c);
      if (card) m.set(i, card);
    }
    return m;
  }
  var IS_BETA = location.hostname.startsWith("beta.");
  function ratingKey() {
    try {
      const cuenta = localStorage.getItem("piles_rating_key");
      if (cuenta) return cuenta;
      let anon = localStorage.getItem("piles_anon_id");
      if (!anon) {
        anon = crypto.randomUUID();
        localStorage.setItem("piles_anon_id", anon);
      }
      return `anon:${anon}`;
    } catch {
      return void 0;
    }
  }
  function applyBetaMode() {
    if (!IS_BETA) return;
    const badge = document.createElement("div");
    badge.textContent = "BETA";
    badge.title = t("beta.title");
    badge.style.cssText = "position:fixed;top:0;left:0;z-index:400;background:var(--warning);color:var(--bg);font-weight:bold;font-size:0.7rem;letter-spacing:0.1em;padding:2px 10px;border-bottom-right-radius:8px;pointer-events:none;";
    document.body.appendChild(badge);
  }
  var SPRITE_COLS = 16;
  var SPRITE_ROWS = 13;
  function applyCardSprite(el, card) {
    const type = card.clothing_type ?? 0;
    const variant = (card.id ?? 0) % 4;
    const col = type % 4 * 4 + variant;
    const row = Math.floor(type / 4);
    el.style.backgroundPosition = `${col / (SPRITE_COLS - 1) * 100}% ${row / (SPRITE_ROWS - 1) * 100}%`;
  }
  var flyingCards = /* @__PURE__ */ new Set();
  function cardName(type, fallback) {
    const k = `cloth.${type}`;
    return PilesI18n.has(k) ? t(k) : fallback || "";
  }
  function buildCard(card) {
    const el = document.createElement("div");
    el.className = "card";
    el.dataset.cardId = card.id;
    applyCardSprite(el, card);
    if (flyingCards.has(card.id)) el.style.visibility = "hidden";
    return el;
  }
  function cardRectAt(rowId, index) {
    const el = document.getElementById(rowId)?.children[index];
    return el ? el.getBoundingClientRect() : null;
  }
  function flyCard(cardData, from, rowId, index, won = false) {
    emitir("vuela", cardData, from);
    const dest = document.getElementById(rowId)?.children[index];
    const to = dest ? dest.getBoundingClientRect() : null;
    if (!cardData || !from || !to) {
      if (dest) markLanded(rowId, index, won);
      return;
    }
    const el = buildCard(cardData);
    el.style.left = `${from.left}px`;
    el.style.top = `${from.top}px`;
    el.style.width = `${from.width}px`;
    el.style.height = `${from.height}px`;
    document.getElementById("fxLayer").appendChild(el);
    dest.style.visibility = "hidden";
    flyingCards.add(cardData.id);
    let done = false;
    const finish = (land = true) => {
      if (done) return;
      done = true;
      el.remove();
      flyingCards.delete(cardData.id);
      const row = document.getElementById(rowId);
      row?.querySelectorAll(".card").forEach((c) => {
        if (c.dataset.cardId == cardData.id) c.style.visibility = "";
      });
      if (land) markLanded(rowId, index, won);
    };
    el.dataset.row = rowId;
    el.finishFlight = finish;
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    requestAnimationFrame(() => {
      el.style.transform = `translate(${dx}px, ${dy}px) scale(${to.width / from.width})`;
    });
    el.addEventListener("transitionend", finish, { once: true });
    setTimeout(finish, 900);
  }
  function markLanded(rowId, index, won = false) {
    if (!emitir("aterriza", rowId, index, won)) return;
    const el = document.getElementById(rowId)?.children[index];
    if (!el) return;
    const cls = won ? "card-won" : "card-landed";
    el.classList.remove("card-landed", "card-won");
    void el.offsetWidth;
    el.classList.add(cls);
    shakeBoard(won);
    if (won) sparkBurst(el.getBoundingClientRect());
  }
  var REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  function shakeBoard(hard = false) {
    emitir("golpe", hard);
  }
  function sparkBurst(rect, count = 10) {
    if (REDUCED_MOTION?.matches) return;
    const layer = document.getElementById("fxLayer");
    if (!layer) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    for (let i = 0; i < count; i++) {
      const angle = Math.PI * 2 * i / count + Math.random() * 0.4;
      const dist = 50 + Math.random() * 60;
      const s = document.createElement("div");
      s.className = "spark";
      s.style.left = `${cx}px`;
      s.style.top = `${cy}px`;
      s.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
      s.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
      layer.appendChild(s);
      s.addEventListener("animationend", () => s.remove(), { once: true });
      setTimeout(() => s.remove(), 1200);
    }
  }
  var graceTimers = /* @__PURE__ */ new Map();
  function graceNotif(nickname) {
    const area = document.getElementById("verifyNotifications");
    if (!area) return null;
    let el = area.querySelector(`[data-grace="${CSS.escape(nickname)}"]`);
    if (!el) {
      el = document.createElement("div");
      el.className = "qte-battle-notif";
      el.dataset.grace = nickname;
      area.appendChild(el);
    }
    return el;
  }
  function clearGrace(nickname) {
    const t2 = graceTimers.get(nickname);
    if (t2) {
      clearInterval(t2);
      graceTimers.delete(nickname);
    }
    document.querySelector(`[data-grace="${CSS.escape(nickname)}"]`)?.remove();
  }
  function pintarAviso(nickname, titulo, lineas) {
    const el = graceNotif(nickname);
    if (!el) return null;
    el.classList.remove("wait-poll");
    const t2 = document.createElement("div");
    t2.className = "qbn-title";
    t2.textContent = titulo;
    el.replaceChildren(t2, ...lineas.map(([texto, estilo]) => {
      const d = document.createElement("div");
      d.style.cssText = estilo || "text-align:center";
      d.textContent = texto;
      return d;
    }));
    emitir("pintarAviso", el, nickname, titulo);
    return el;
  }
  function onPlayerDisconnected(nickname, seconds) {
    if (!graceNotif(nickname)) return;
    clearInterval(graceTimers.get(nickname));
    let left = seconds;
    const paint = () => pintarAviso(nickname, `\u{1F50C} ${nickname}`, [[t("grace.down", { n: left })]]);
    paint();
    graceTimers.set(nickname, setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearInterval(graceTimers.get(nickname));
        return;
      }
      paint();
    }, 1e3));
  }
  function onPlayerLeft(nickname, retired, types) {
    clearGrace(nickname);
    const lineas = [[t("grace.gone")]];
    const fuera = types && types.length ? types.map((ty) => cardName(ty, "")) : retired;
    if (fuera && fuera.length) {
      lineas.push([t("grace.out", { list: fuera.join(t("list.sep")) }), "font-size:0.72rem;opacity:0.8;margin-top:4px"]);
    }
    pintarAviso(nickname, `\u{1F6AA} ${nickname}`, lineas);
    setTimeout(() => clearGrace(nickname), 6e3);
  }
  function onWaitPoll(nickname, seconds) {
    clearInterval(graceTimers.get(nickname));
    let left = seconds;
    let voto = null;
    const paint = () => {
      const lineas = [[t("wait.q", { n: left })]];
      if (voto !== null) lineas.push([t(voto ? "wait.voted_wait" : "wait.voted_cancel"), "text-align:center;opacity:0.8;margin-top:4px"]);
      const el = pintarAviso(nickname, `\u{1F50C} ${nickname}`, lineas);
      if (!el) return;
      el.classList.add("wait-poll");
      if (est.soyEspectador || voto !== null) return;
      const botones = document.createElement("div");
      botones.className = "wait-poll-btns";
      for (const [texto, seguir] of [[t("wait.wait"), true], [t("wait.cancel"), false]]) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = texto;
        b.className = seguir ? "wp-si" : "wp-no";
        b.addEventListener("click", () => {
          voto = seguir;
          send({ type: "wait_poll_vote", nickname, keep_waiting: seguir });
          paint();
        });
        botones.appendChild(b);
      }
      el.appendChild(botones);
    };
    paint();
    graceTimers.set(nickname, setInterval(() => {
      left = Math.max(0, left - 1);
      paint();
    }, 1e3));
  }
  function onWaitPollClosed(nickname, result) {
    clearInterval(graceTimers.get(nickname));
    graceTimers.delete(nickname);
    if (result === "volvio") {
      pintarAviso(nickname, `\u2705 ${nickname}`, [[t("grace.back")]]);
      setTimeout(() => clearGrace(nickname), 4e3);
    } else if (result !== "seguir") {
      clearGrace(nickname);
    }
  }
  function clearGraceNotices() {
    for (const n of [...graceTimers.keys()]) clearGrace(n);
    document.querySelectorAll("[data-grace]").forEach((el) => el.remove());
  }
  var debtTimer = null;
  function startDebtCountdown(ms) {
    const bar = document.getElementById("debtBar");
    const fill = document.getElementById("debtBarFill");
    if (!bar || !fill) return;
    clearTimeout(debtTimer);
    bar.classList.add("active");
    fill.style.transition = "none";
    fill.style.width = "100%";
    void fill.offsetWidth;
    fill.style.transition = `width ${ms}ms linear`;
    fill.style.width = "0%";
    debtTimer = setTimeout(() => bar.classList.remove("active"), ms);
  }
  function clearDebtCountdown() {
    clearTimeout(debtTimer);
    document.getElementById("debtBar")?.classList.remove("active");
  }
  function onDebtForced(card) {
    clearDebtCountdown();
    updateSwapHint(t("debt.forced", { name: cardName(card.clothing_type, card.name) }));
    resetSwapHintLater(2500);
    emitir("onDebtForced", card);
  }
  var comboHideTimer = null;
  function formatMult(x100) {
    return x100 % 100 === 0 ? String(x100 / 100) : (x100 / 100).toFixed(2).replace(".", t("num.dec"));
  }
  function renderCombo(msg) {
    const box = document.getElementById("comboBox");
    const mult = document.getElementById("comboMult");
    const fill = document.getElementById("comboBarFill");
    if (!box) return;
    clearTimeout(comboHideTimer);
    const board = document.getElementById("gameScreen");
    updateFrenzyBtn(msg.frenzy_ready, msg.frenzy_cost_x100);
    musicFromCombo(msg.window_ms ? msg.multiplier_x100 ?? 100 : 100, msg.frenzy_ready);
    if (msg.window_ms && msg.points) {
      comboStep(msg.multiplier_x100 ?? 100);
      if (msg.points >= 20) playSfx("setDone");
    }
    if (!msg.window_ms || msg.combo === 0) {
      box.classList.remove("active");
      delete board.dataset.comboTier;
      return;
    }
    box.classList.add("active");
    const x100 = msg.multiplier_x100 ?? 100;
    board.dataset.comboTier = String(Math.floor(x100 / 100));
    mult.textContent = `\xD7${formatMult(x100)}`;
    mult.classList.remove("bump");
    void mult.offsetWidth;
    mult.classList.add("bump");
    fill.style.transition = "none";
    fill.style.width = "100%";
    void fill.offsetWidth;
    fill.style.transition = `width ${msg.window_ms}ms linear`;
    fill.style.width = "0%";
    comboHideTimer = setTimeout(() => box.classList.remove("active"), msg.window_ms);
  }
  function resetCombo() {
    clearTimeout(comboHideTimer);
    musicFromCombo(100, false);
    document.getElementById("comboBox")?.classList.remove("active");
    const board = document.getElementById("gameScreen");
    if (board) delete board.dataset.comboTier;
    updateFrenzyBtn(false);
  }
  function updateFrenzyBtn(ready, coste) {
    const btn = document.getElementById("frenzyBtn");
    if (!btn) return;
    if (coste) {
      btn.title = t("frenzy.title", { cost: formatMult(coste) });
      btn.setAttribute("aria-label", btn.title);
    }
    const antes = !btn.hidden;
    btn.hidden = !ready;
    if (ready && !antes) {
      btn.classList.remove("pop");
      void btn.offsetWidth;
      btn.classList.add("pop");
      playSfx("frenzyReady");
    }
    if (ready) document.getElementById("comboBox")?.classList.add("active");
    emitir("updateFrenzyBtn", ready, coste);
  }
  function fireFrenzy() {
    const btn = document.getElementById("frenzyBtn");
    if (!btn || btn.hidden) return;
    btn.hidden = true;
    playSfx("frenzyFire");
    send({ type: "frenzy" });
  }
  function onFrenzyFired(msg) {
    const yoPar\u00E9 = (msg.countered || []).includes(est.currentNickname);
    const yoLoSolt\u00E9 = msg.player === est.currentNickname;
    playSfx(yoPar\u00E9 ? "frenzyCounter" : "frenzyHit");
    const board = document.getElementById("gameScreen");
    if (board && !REDUCED_MOTION?.matches) {
      board.classList.remove("frenzy-flash");
      void board.offsetWidth;
      board.classList.add("frenzy-flash");
      setTimeout(() => board.classList.remove("frenzy-flash"), 700);
    }
    if (yoPar\u00E9) {
      updateSwapHint(t("frenzy.countered"));
      resetSwapHintLater(2200);
    } else if (!yoLoSolt\u00E9 && (msg.stunned || []).includes(est.currentNickname)) {
      updateSwapHint(t("frenzy.by", { nick: msg.player }));
      resetSwapHintLater(2200);
    }
    emitir("onFrenzyFired", msg);
  }
  function flashCenter() {
    if (REDUCED_MOTION?.matches) return;
    const row = document.getElementById("centerCards");
    if (!row) return;
    row.classList.remove("flash");
    void row.offsetWidth;
    row.classList.add("flash");
    row.addEventListener("animationend", () => row.classList.remove("flash"), { once: true });
  }
  function initCardTilt() {
    if (!window.matchMedia?.("(hover: hover)").matches) return;
    const MAX = 9;
    for (const rowId of ["centerCards", "yourCards"]) {
      const row = document.getElementById(rowId);
      if (!row) continue;
      row.addEventListener("pointermove", (e) => {
        if (REDUCED_MOTION?.matches) return;
        const card = e.target.closest(".card");
        if (!card || !row.contains(card)) return;
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        card.style.setProperty("--tilt-y", `${px * MAX * 2}deg`);
        card.style.setProperty("--tilt-x", `${-py * MAX * 2}deg`);
      });
      row.addEventListener("pointerout", (e) => {
        const card = e.target.closest(".card");
        if (!card) return;
        card.style.setProperty("--tilt-x", "0deg");
        card.style.setProperty("--tilt-y", "0deg");
      });
    }
  }

  // ../client/juego/espectador.ts
  var specCards = {};
  function sinEmoji(s) {
    return String(s ?? "").replace(/\p{Extended_Pictographic}️?/gu, "").replace(/\s+/g, " ").trim();
  }
  function resetEspectador() {
    specCards = {};
    est.specState = null;
    est.specOrden = [];
    est.specVista = null;
    est.specSet = null;
    document.getElementById("specSeats")?.replaceChildren();
    document.getElementById("specCards")?.replaceChildren();
    document.getElementById("specSetNav")?.replaceChildren();
    document.getElementById("specAll")?.replaceChildren();
  }
  function onSpectatorCards(msg) {
    specCards = msg.cards || {};
    renderSpectator();
  }
  function onSpectatorState(msg) {
    est.specState = msg;
    renderSpectator();
  }
  function specNicks() {
    const todos = Object.keys(est.specState?.players || {});
    const orden = est.specOrden.filter((n) => todos.includes(n));
    return orden.concat(todos.filter((n) => !orden.includes(n)));
  }
  function specCard(id) {
    if (id === null || id === void 0) {
      const gap = document.createElement("div");
      gap.className = "card card-empty";
      gap.title = t("spec.gap");
      return gap;
    }
    const info = specCards[id] || {};
    const el = buildCard({ id, clothing_type: info.c ?? 0, name: info.n ?? "" });
    el.title = `${cardName(info.c, info.n) || t("card.generic")} \xB7 #${id}`;
    return el;
  }
  function renderSpectator() {
    if (!est.soyEspectador || !est.specState) return;
    const board = document.getElementById("gameScreen");
    if (!board || !board.classList.contains("espectador")) return;
    const nicks = specNicks();
    if (!nicks.length) return;
    if (est.specVista !== "*" && !nicks.includes(est.specVista)) est.specVista = nicks[0];
    const vista = est.specVista;
    const seats = porId("specSeats");
    seats.replaceChildren();
    const quien = document.createElement("span");
    quien.className = "quien";
    quien.textContent = t("spec.from");
    seats.append(quien);
    const boton = (valor, texto) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "spec-seat" + (est.specVista === valor ? " active" : "");
      b.dataset.nick = valor;
      b.dataset.toque = "";
      b.textContent = sinEmoji(texto);
      b.onclick = () => {
        est.specVista = valor;
        est.specSet = null;
        renderSpectator();
      };
      return b;
    };
    nicks.forEach((n) => seats.append(boton(n, n)));
    seats.append(boton("*", t("spec.all")));
    const todos = vista === "*";
    porId("specSingle").hidden = todos;
    porId("specAll").hidden = !todos;
    if (todos) renderSpectatorTodos(nicks);
    else renderSpectatorUno(est.specState.players[vista]);
  }
  function renderSpectatorUno(p) {
    if (!p) return;
    porId("specLabel").textContent = t("spec.sets_of", { nick: est.specVista });
    const actual = est.specSet ?? p.cur;
    const nav = porId("specSetNav");
    nav.replaceChildren();
    for (let i = 0; i < 6; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "set-btn" + (i === actual ? " active" : "") + (p.flip[i] ? " flipped" : "");
      b.dataset.set = String(i);
      b.append(t("set.n", { n: i + 1 }));
      const ojo = document.createElement("span");
      ojo.className = "set-eye";
      ojo.textContent = p.flip[i] ? "\u{1F441}" : "";
      b.append(ojo);
      b.onclick = () => {
        est.specSet = i;
        renderSpectator();
      };
      nav.append(b);
    }
    const fila = porId("specCards");
    fila.replaceChildren(...(p.sets[actual] || []).map(specCard));
    const estado = porId("specEstado");
    estado.replaceChildren();
    const dato = (texto, fuerte) => {
      const s = document.createElement("span");
      s.append(texto);
      if (fuerte !== void 0) {
        const b = document.createElement("b");
        b.textContent = fuerte;
        s.append(b);
      }
      estado.append(s);
    };
    if (p.owed) dato(t("spec.owes", { set: p.owed[0] + 1, slot: p.owed[1] + 1 }));
    else dato(t("spec.no_debt"));
    dato(t("spec.combo") + " ", `\xD7${formatMult(p.mult ?? 100)}`);
    if (p.frenzy) dato(t("spec.frenzy"));
    if (p.verif) dato(t("spec.verifying"));
    if (p.fin) dato(t("spec.finished") + " ", t("pos.ord", { n: p.fin }));
    if (est.specSet !== null && est.specSet !== p.cur) dato(t("spec.theirs", { set: p.cur + 1 }));
  }
  function renderSpectatorTodos(nicks) {
    const cont = porId("specAll");
    const players = est.specState.players;
    cont.replaceChildren();
    nicks.forEach((n) => {
      const p = players[n];
      const bloque = document.createElement("div");
      bloque.className = "spec-player";
      const cab = document.createElement("div");
      cab.className = "spec-player-name";
      const nombre = document.createElement("b");
      nombre.textContent = sinEmoji(n);
      cab.append(nombre, `\xD7${formatMult(p.mult ?? 100)}`);
      if (p.owed) cab.append(t("spec.owes_short"));
      if (p.verif) cab.append(t("spec.verifying"));
      if (p.fin) cab.append(t("spec.finished_n", { pos: t("pos.ord", { n: p.fin }) }));
      bloque.append(cab);
      const sets = document.createElement("div");
      sets.className = "spec-sets";
      p.sets.forEach((set, i) => {
        const mini = document.createElement("div");
        mini.className = "spec-mini-set" + (p.flip[i] ? " flipped" : "") + (i === p.cur ? " current" : "");
        mini.title = t("set.n", { n: i + 1 }) + (p.flip[i] ? t("spec.shown") : "");
        set.forEach((id) => mini.append(specCard(id)));
        sets.append(mini);
      });
      bloque.append(sets);
      cont.append(bloque);
    });
  }

  // ../client/juego/sala.ts
  function requireNickname() {
    const nickname = miNombre();
    if (!nickname) {
      emitir("sinNombre");
      return null;
    }
    localStorage.setItem("piles_nickname", nickname);
    est.currentNickname = nickname;
    return nickname;
  }
  var lobbyIsPublic = true;
  function setVisibility(isPublic) {
    lobbyIsPublic = isPublic;
  }
  function createLobby(maxPlayers) {
    const nickname = requireNickname();
    if (!nickname) return;
    cancelQuickMatchOffer();
    send({ type: "create_lobby", nickname, max_players: maxPlayers, is_public: lobbyIsPublic, rating_key: ratingKey(), taunt: getTaunt() || void 0 });
  }
  function quickMatch() {
    const nickname = requireNickname();
    if (!nickname) return;
    cameFromQuickMatch = true;
    send({ type: "quick_match", nickname, rating_key: ratingKey(), taunt: getTaunt() || void 0 });
  }
  var cameFromQuickMatch = false;
  function refreshLobbies() {
    send({ type: "list_lobbies" });
  }
  var botDifficulty = "normal";
  function setBotDifficulty(d) {
    botDifficulty = d;
  }
  function addBot() {
    send({ type: "add_bot", difficulty: botDifficulty });
  }
  function removeBot(playerId) {
    send({ type: "remove_bot", player_id: playerId });
  }
  var quickMatchOfferTimer;
  var jugadoresEnSala = 0;
  var ofertaAbierta = false;
  function ponerOferta(abierta) {
    if (abierta === ofertaAbierta) return;
    ofertaAbierta = abierta;
    emitir("ofertaBots", abierta);
  }
  function armQuickMatchOffer() {
    clearTimeout(quickMatchOfferTimer);
    quickMatchOfferTimer = setTimeout(() => {
      if (jugadoresEnSala <= 1) ponerOferta(true);
    }, 12e3);
  }
  function cancelQuickMatchOffer(seguirOfreciendo = false) {
    if (!seguirOfreciendo) cameFromQuickMatch = false;
    clearTimeout(quickMatchOfferTimer);
    ponerOferta(false);
  }
  function acceptBotsOffer() {
    cancelQuickMatchOffer();
    for (let i = 0; i < 3; i++) addBot();
  }
  setInterval(() => {
    if (vistaActual === "joinScreen" && est.ws && est.ws.readyState === WebSocket.OPEN && document.visibilityState === "visible") {
      refreshLobbies();
    }
  }, 2e3);
  function joinLobby(code, spectate = false) {
    const nickname = requireNickname();
    if (!nickname) return;
    const lobby = (code || "").trim().toUpperCase();
    if (!lobby) {
      showScreen("joinScreen");
      return;
    }
    est.codigoPendiente = "";
    cancelQuickMatchOffer();
    send({
      type: "join_lobby",
      lobby_id: lobby,
      nickname,
      rating_key: ratingKey(),
      taunt: getTaunt() || void 0,
      spectate: spectate || void 0
    });
  }
  function onEnteredLobby(lobbyId) {
    est.rejoinInFlight = false;
    rememberLobby(lobbyId);
    stopScanner();
    showScreen("lobbyScreen");
  }
  function joinLinkFor(lobbyId) {
    return `${location.origin}/lobby.html?join=${lobbyId}`;
  }
  var qrScanner = null;
  function extractLobbyCode(raw) {
    let value = (raw || "").trim();
    try {
      const parsed = new URL(value);
      value = parsed.searchParams.get("join") || "";
    } catch {
    }
    value = value.trim().toUpperCase();
    return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(value) ? value : null;
  }
  async function toggleScanner() {
    if (qrScanner) {
      stopScanner();
      return;
    }
    try {
      qrScanner = new QrScanner(
        porId("scanVideo"),
        (result) => {
          const code = extractLobbyCode(result.data);
          if (!code) return;
          stopScanner();
          joinLobby(code);
        },
        { highlightScanRegion: true, preferredCamera: "environment" }
      );
      await qrScanner.start();
      porId("scanWrap").classList.add("active");
    } catch (e) {
      stopScanner();
      console.error(e);
    }
  }
  function stopScanner() {
    if (qrScanner) {
      qrScanner.stop();
      qrScanner.destroy();
      qrScanner = null;
    }
    porId("scanWrap").classList.remove("active");
  }
  window.addEventListener("pagehide", stopScanner);
  function toggleReady() {
    est.isReady = !est.isReady;
    send({ type: "set_ready", ready: est.isReady });
  }
  function leaveLobby() {
    if (est.ws && est.ws.readyState === WebSocket.OPEN) send({ type: "leave_lobby" });
    showScreen("homeScreen");
    forgetLobby();
    cancelQuickMatchOffer();
    est.isReady = false;
    est.soyEspectador = false;
    enCola = false;
    rolPedido = 0;
    aplicarModoEspectador();
  }
  function onSeatReplaced() {
    cancelQuickMatchOffer();
    dropSeatLocally();
    stopMusic();
    closeVerifyOverlay();
    closeQteOverlay();
    clearStun();
    clearMatchNotifications();
    resetCombo();
    est.gameOver = false;
    est.isReady = false;
    porId("gameOverOverlay").classList.remove("active");
    porId("fxLayer").innerHTML = "";
    agToast({
      kind: "warning",
      title: t("seat.title"),
      message: t("seat.msg"),
      duration: 8e3
    });
    showScreen("homeScreen");
  }
  var versionDelServidor = null;
  var RELOAD_KEY = "piles_reloaded_at";
  function onHello(version) {
    if (!version || version === "dev") return;
    if (versionDelServidor === null) {
      versionDelServidor = version;
      return;
    }
    if (version === versionDelServidor) return;
    versionDelServidor = version;
    let hace = Infinity;
    try {
      hace = Date.now() - Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    } catch {
    }
    if (hace < 3e4) {
      agToast({ kind: "warning", title: t("ver.new"), message: t("ver.reload"), duration: 15e3 });
      return;
    }
    try {
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {
    }
    agToast({ kind: "info", title: t("ver.new_short"), message: t("ver.updating"), duration: 2e3 });
    setTimeout(() => location.reload(), 1200);
  }
  function sendChat(texto) {
    const text = (texto || "").trim();
    if (!text || !est.ws || est.ws.readyState !== WebSocket.OPEN) return;
    send({ type: "chat", text });
  }
  var enCola = false;
  var rolPedido = 0;
  function pintarRol() {
    const b = document.getElementById("rolPartidaBtn");
    if (b) {
      b.textContent = t(enCola ? "role.next_on" : "role.next_off");
      b.setAttribute("aria-pressed", String(enCola));
    }
  }
  function cambiarRol() {
    const mirar = !est.soyEspectador || enCola;
    if (!est.soyEspectador) {
      rolPedido = Date.now();
      est.isReady = false;
    }
    send({ type: "set_spectator", spectate: mirar });
  }
  function onKicked() {
    forgetLobby();
    est.isReady = false;
    est.soyEspectador = false;
    aplicarModoEspectador();
    agToast({ kind: "warning", title: t("kick.you_title"), message: t("kick.you_msg"), duration: 8e3 });
    showScreen("joinScreen");
    refreshLobbies();
  }
  function onLobbyUpdate(msg) {
    est.mirones = msg.spectators ?? 0;
    jugadoresEnSala = msg.players.length;
    const sentado = msg.players.some((p) => p.id === est.currentPlayerId);
    if (est.soyEspectador && sentado) {
      est.soyEspectador = false;
      est.isReady = false;
      aplicarModoEspectador();
      onEnteredLobby(est.currentLobbyId);
    } else if (!est.soyEspectador && !sentado && msg.status !== "playing" && Date.now() - rolPedido < 5e3) {
      rolPedido = 0;
      est.soyEspectador = true;
      est.isReady = false;
      est.seatToken = null;
      aplicarModoEspectador();
    }
    enCola = est.soyEspectador && (msg.queue || []).includes(est.currentPlayerId);
    pintarRol();
    if (msg.players.length > 1) cancelQuickMatchOffer(true);
    else if (cameFromQuickMatch) armQuickMatchOffer();
    if (!est.gameOver && vistaActual !== "gameScreen" && vistaActual !== "lobbyScreen") showScreen("lobbyScreen");
  }
  var cuentaFin = 0;
  var cuentaTimer = null;
  var cuentaN = -1;
  function startCountdown(seconds) {
    closeCountdown();
    cuentaFin = Date.now() + Math.max(1, Number(seconds) || 3) * 1e3;
    cuentaTick();
    cuentaTimer = setInterval(cuentaTick, 100);
    emitir("startCountdown", seconds);
  }
  function cuentaTick() {
    const n = Math.ceil((cuentaFin - Date.now()) / 1e3);
    if (n === cuentaN) return;
    cuentaN = n;
    porId("cuentaAnuncio").textContent = n > 0 ? String(n) : t("ca.go");
    if (!document.hidden) playSfx(n > 0 ? "countTick" : "countGo");
    if (n <= -2) closeCountdown();
  }
  function closeCountdown() {
    if (cuentaTimer) clearInterval(cuentaTimer);
    cuentaTimer = null;
    cuentaN = -1;
    const a = document.getElementById("cuentaAnuncio");
    if (a) a.textContent = "";
    emitir("closeCountdown");
  }
  function onCountdownCancelled(reason) {
    if (cuentaTimer === null) return;
    closeCountdown();
    const porque = t(reason === "left" ? "ca.left" : reason === "joined" ? "ca.joined" : "ca.not_ready");
    agToast({ kind: "info", title: t("ca.cancelled"), message: porque });
  }
  function onGameStart(msg) {
    emitir("antesDePartida", msg);
    est.allSets = msg.your_sets;
    est.centerCards = msg.center_cards;
    est.currentSetIndex = msg.current_set ?? 0;
    est.pendingDrop = null;
    est.pendingTake = null;
    diag.newGame();
    est.centerSlots = [];
    clearStun();
    clearDebtCountdown();
    resetCombo();
    clearGraceNotices();
    est.myFlippedSets = Array(6).fill(false);
    opponentFlippedSets.clear();
    est.verificationSent = false;
    msg.players.filter((n) => n !== est.currentNickname).forEach((name) => opponentFlippedSets.set(name, /* @__PURE__ */ new Map()));
    est.specOrden = msg.players.slice();
    est.specState = null;
    est.specVista = null;
    est.specSet = null;
    buildSetNav();
    renderCenterCards();
    renderYourCards();
    updateFlipBtn();
    renderPlayersProgress(msg.players.map((n) => ({ nickname: n, completed_sets: 0, finished: false, on_fire: false })));
    startMusic();
    const mb = document.getElementById("muteBtn");
    if (mb) {
      mb.textContent = est.sfxMuted ? "\u{1F507}" : "\u{1F50A}";
    }
    aplicarModoEspectador();
    showScreen("gameScreen");
    emitir("onGameStart", msg);
  }
  function aplicarModoEspectador() {
    const board = porId("gameScreen");
    board.classList.toggle("espectador", est.soyEspectador);
    let banda = document.getElementById("espectadorBanda");
    if (est.soyEspectador && !banda) {
      banda = document.createElement("div");
      banda.id = "espectadorBanda";
      const texto = document.createElement("span");
      texto.textContent = sinEmoji(t("spec.watching"));
      const salir = document.createElement("button");
      salir.type = "button";
      salir.textContent = t("spec.leave");
      salir.onclick = () => {
        stopMusic();
        leaveLobby();
      };
      const jugar = document.createElement("button");
      jugar.type = "button";
      jugar.id = "rolPartidaBtn";
      jugar.onclick = () => send({ type: "set_spectator", spectate: enCola });
      banda.append(texto, jugar, salir);
      board.prepend(banda);
      pintarRol();
    } else if (!est.soyEspectador && banda) {
      banda.remove();
    }
    if (!est.soyEspectador) resetEspectador();
  }

  // ../client/juego/red.ts
  var diag = /* @__PURE__ */ (() => {
    const POR_TIPO_MS = 400, POR_PARTIDA = 400, COLA_MAX = 60, DETALLE_MAX = 560;
    const cola = [];
    const ultimaPorTipo = /* @__PURE__ */ new Map();
    let enPartida = 0;
    let listo = false;
    function enviar(kind, detail, hace) {
      if (!est.ws || est.ws.readyState !== WebSocket.OPEN) return false;
      if (hace > 1500) detail = { ...detail, hace_ms: hace };
      let texto = JSON.stringify(detail);
      if (texto.length > DETALLE_MAX) detail = { recortada: true, kind };
      est.ws.send(JSON.stringify({ type: "client_note", kind, detail }));
      return true;
    }
    return {
      note(kind, detail = {}) {
        if (!est.currentLobbyId) return;
        const ahora = Date.now();
        const clave = detail.ev ? `${kind}:${detail.ev}` : kind;
        if (ahora - (ultimaPorTipo.get(clave) || 0) < POR_TIPO_MS) return;
        if (enPartida >= POR_PARTIDA) return;
        ultimaPorTipo.set(clave, ahora);
        enPartida++;
        if (listo && enviar(kind, detail, 0)) return;
        if (cola.length >= COLA_MAX) cola.shift();
        cola.push({ kind, detail, t: ahora });
      },
      /** Hay asiento: vaciar la cola, en orden. */
      ready() {
        listo = true;
        const ahora = Date.now();
        while (cola.length) {
          const n = cola[0];
          if (!enviar(n.kind, n.detail, ahora - n.t)) break;
          cola.shift();
        }
      },
      /** Sin conexión: lo que se anote espera. */
      notReady() {
        listo = false;
      },
      newGame() {
        enPartida = 0;
      },
      /** Te vas de la sala: lo que esperaba ya no pertenece a ninguna. */
      clear() {
        cola.length = 0;
      }
    };
  })();
  window.addEventListener("error", (e) => diag.note("err", {
    msg: String(e.message || "").slice(0, 160),
    at: `${String(e.filename || "").split("/").pop()}:${e.lineno || 0}`
  }));
  window.addEventListener("unhandledrejection", (e) => diag.note("err", {
    msg: String(e.reason?.message ?? e.reason ?? "").slice(0, 160),
    promise: true
  }));
  document.addEventListener("visibilitychange", () => diag.note("vis", { hidden: document.hidden }));
  function clientStateSample() {
    const hand = [];
    for (let s = 0; s < 6; s++) {
      const set = est.allSets[s] || [];
      for (let i = 0; i < 4; i++) hand.push(set[i]?.id ?? null);
    }
    const ahora = Date.now();
    return {
      hand,
      center: est.centerCards.map((c) => c.id),
      owes: owesCard(),
      qte: est.qteActive,
      stun_ms: Math.max(0, stunnedUntil - ahora),
      p_drop_ms: est.pendingDrop ? ahora - est.pendingDrop.t : null,
      p_take_ms: est.pendingTake ? ahora - est.pendingTake.t : null,
      blocked: qteBlockedCards.size,
      vis: !document.hidden,
      ws: est.ws ? est.ws.readyState : -1
    };
  }
  setInterval(() => {
    if (document.getElementById("gameScreen")?.classList.contains("active") && !est.gameOver) {
      diag.note("state", clientStateSample());
    }
  }, 5e3);
  window.addEventListener("DOMContentLoaded", () => {
    traducirVendored();
    initCardTilt();
    applyBetaMode();
    handleJoinDeepLink();
    try {
      const volver = sessionStorage.getItem("piles.afterLang");
      sessionStorage.removeItem("piles.afterLang");
      if (volver && !pendingAutoJoin && ["homeScreen", "profileScreen", "joinScreen"].includes(volver)) showScreen(volver);
    } catch {
    }
    if (!pendingAutoJoin) {
      const seat = readSeat();
      if (seat && localStorage.getItem("piles_nickname")) {
        if (Date.now() - (seat.seen || 0) < SEAT_FRESH_MS) {
          pendingRejoinCode = seat.lobby;
          est.seatToken = seat.token || null;
        } else {
          writeSeat(null);
        }
      }
    }
    connectWs();
  });
  function traducirVendored() {
    if (typeof agRank === "function") {
      for (const lista of Object.values(agRank.RANKS)) for (const par of lista) par[1] = t(`rank.${par[0]}`);
    }
    window.agText = { up: t("rank.up"), down: t("rank.down") };
    if (typeof window.agToast === "function") {
      const crear = window.agToast;
      window.agToast = (opts) => {
        const el = crear(opts);
        el?.querySelector(".ag-toast-close")?.setAttribute("aria-label", t("toast.close"));
        return el;
      };
    }
  }
  function handleJoinDeepLink() {
    const code = extractLobbyCode(new URLSearchParams(location.search).get("join"));
    if (!code) return;
    history.replaceState({}, "", location.pathname);
    est.codigoPendiente = code;
    showScreen("joinScreen");
    if (localStorage.getItem("piles_nickname")) pendingAutoJoin = true;
  }
  var pendingAutoJoin = false;
  var pendingRejoinCode = null;
  var SEAT_KEY = "piles_seat";
  var SEAT_FRESH_MS = 9e4;
  function readSeat() {
    try {
      return JSON.parse(localStorage.getItem(SEAT_KEY) || "null");
    } catch {
      return null;
    }
  }
  function writeSeat(seat) {
    try {
      if (seat) localStorage.setItem(SEAT_KEY, JSON.stringify(seat));
      else localStorage.removeItem(SEAT_KEY);
    } catch {
    }
  }
  function rememberLobby(lobbyId) {
    pendingRejoinCode = lobbyId;
    const prev = readSeat();
    if (prev && prev.lobby !== lobbyId) est.seatToken = null;
    else if (prev && !est.seatToken) est.seatToken = prev.token || null;
    writeSeat({ lobby: lobbyId, token: est.seatToken, seen: Date.now() });
  }
  function forgetLobby() {
    pendingRejoinCode = null;
    est.currentLobbyId = "";
    est.seatToken = null;
    writeSeat(null);
    diag.clear();
  }
  function dropSeatLocally() {
    pendingRejoinCode = null;
    est.currentLobbyId = "";
    est.seatToken = null;
    est.rejoinInFlight = false;
    diag.clear();
  }
  function attemptRejoin() {
    const nickname = (localStorage.getItem("piles_nickname") || "").trim();
    if (!pendingRejoinCode || !nickname) {
      forgetLobby();
      return;
    }
    est.currentNickname = nickname;
    est.rejoinInFlight = true;
    send({
      type: "join_lobby",
      lobby_id: pendingRejoinCode,
      nickname,
      rating_key: ratingKey(),
      seat_token: est.seatToken ?? void 0,
      taunt: getTaunt() || void 0,
      spectate: est.soyEspectador && !enCola || void 0
    });
  }
  function connectWs() {
    const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
    est.ws = new WebSocket(`${wsProto}//${window.location.host}/ws`);
    est.ws.onopen = () => {
      clearTimeout(est.reconnectTimer ?? void 0);
      diag.notReady();
      diag.note("ws", { ev: "open", attempt: est.reconnectAttempt });
      est.reconnectAttempt = 0;
      est.pendingPongSince = 0;
      porId("reconnectOverlay").style.display = "none";
      clearInterval(est.pingInterval ?? void 0);
      est.pingInterval = setInterval(() => {
        if (!est.ws || est.ws.readyState !== WebSocket.OPEN) return;
        if (est.pendingPongSince && Date.now() - est.pendingPongSince > PONG_TIMEOUT_MS) {
          diag.note("pong_timeout", { sin_pong_ms: Date.now() - est.pendingPongSince });
          abandonDeadSocket();
          return;
        }
        if (est.seatToken && est.currentLobbyId) {
          writeSeat({ lobby: est.currentLobbyId, token: est.seatToken, seen: Date.now() });
        }
        const enPartida = document.getElementById("gameScreen")?.classList.contains("active");
        if (!enPartida && Date.now() - est.lastPingAt < 25e3) return;
        est.lastPingAt = Date.now();
        est.pingSentAt = performance.now();
        if (!est.pendingPongSince) est.pendingPongSince = Date.now();
        est.ws.send(JSON.stringify({ type: "ping", rtt_ms: est.lastRtt }));
      }, 3e3);
      if (pendingAutoJoin) {
        pendingAutoJoin = false;
        joinLobby(est.codigoPendiente);
      } else if (pendingRejoinCode) {
        attemptRejoin();
      }
    };
    est.ws.onerror = () => {
      diag.note("ws", { ev: "error" });
    };
    est.ws.onclose = (e) => {
      clearInterval(est.pingInterval ?? void 0);
      est.pendingPongSince = 0;
      diag.notReady();
      diag.note("ws", { ev: "close", code: e.code, clean: e.wasClean });
      porId("reconnectOverlay").style.display = "flex";
      scheduleReconnect();
    };
    est.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      console.log("\u{1F4E8}", msg.type, msg);
      handleMsg(msg);
    };
  }
  function abandonDeadSocket() {
    const vieja = est.ws;
    clearInterval(est.pingInterval ?? void 0);
    est.pendingPongSince = 0;
    diag.notReady();
    if (vieja) {
      vieja.onopen = vieja.onmessage = vieja.onerror = vieja.onclose = null;
      try {
        vieja.close();
      } catch {
      }
    }
    porId("reconnectOverlay").style.display = "flex";
    scheduleReconnect();
  }
  function scheduleReconnect() {
    clearTimeout(est.reconnectTimer ?? void 0);
    est.reconnectAttempt++;
    const delay = Math.min(1e3 * Math.pow(2, est.reconnectAttempt - 1), RECONNECT_MAX_DELAY);
    porId("reconnectMsg").textContent = t(est.currentLobbyId ? "recon.retry_room" : "recon.retry", { n: est.reconnectAttempt });
    est.reconnectTimer = setTimeout(connectWs, delay);
  }
  function reconnect() {
    clearTimeout(est.reconnectTimer ?? void 0);
    est.reconnectAttempt = 0;
    connectWs();
  }
  function send(obj) {
    est.ws.send(JSON.stringify(obj));
  }
  function handleMsg(msg) {
    emitir("antesDeMensaje", msg);
    switch (msg.type) {
      case "lobby_created":
        est.currentLobbyId = msg.lobby_id;
        est.currentPlayerId = msg.player_id;
        onEnteredLobby(msg.lobby_id);
        break;
      case "joined_lobby":
        est.currentLobbyId = msg.lobby_id;
        est.currentPlayerId = msg.player_id;
        est.soyEspectador = !!msg.spectator;
        if (est.rejoinInFlight) diag.note("ws", { ev: "rejoin_ok", espectador: est.soyEspectador });
        onEnteredLobby(msg.lobby_id);
        break;
      case "seat_token":
        est.seatToken = msg.token;
        writeSeat({ lobby: msg.lobby_id, token: msg.token, seen: Date.now() });
        diag.ready();
        break;
      case "seat_replaced":
        onSeatReplaced();
        break;
      case "lobby_update":
        onLobbyUpdate(msg);
        break;
      case "hello":
        onHello(msg.version);
        break;
      case "kicked":
        onKicked();
        break;
      case "spectator_cards":
        onSpectatorCards(msg);
        break;
      case "spectator_state":
        onSpectatorState(msg);
        break;
      case "game_start":
        onGameStart(msg);
        break;
      case "countdown":
        startCountdown(msg.seconds);
        break;
      case "countdown_cancelled":
        onCountdownCancelled(msg.reason);
        break;
      case "set_switched":
        est.allSets[msg.set_index] = msg.cards;
        break;
      case "swap_success":
        onSwapSuccess(msg);
        break;
      case "swap_failed":
        onSwapFailed(msg);
        break;
      case "swap_conflict":
        onSwapConflict(msg.players, msg.card_id, msg.qte_duration);
        break;
      // Las dos llegan a toda la sala y puede haber más de una pelea a la vez,
      // así que solo cuentan las de LA carta que tienes delante. Sin esto, al
      // resolverse la pelea de otros dos se te cerraba la tuya a media pelea.
      case "qte_update":
        if (esMiPelea(msg.card_id)) onQteUpdate(msg.clicks, msg.card_id);
        break;
      case "qte_resolved":
        qteBlockedCards.delete(msg.card_id);
        cerrarAvisoPelea(msg.card_id);
        renderCenterCards();
        if (esMiPelea(msg.card_id)) onQteResolved(msg.winner, msg);
        break;
      // Empate al acabar el tiempo: ronda extra de muerte súbita.
      case "qte_tiebreak":
        onQteTiebreak(msg.card_id, msg.round, msg.duration);
        break;
      case "stunned":
        startStun(msg.ms);
        if (est.pendingTake || est.pendingDrop) onSwapFailed({ kind: "gone" });
        break;
      case "combo_update":
        renderCombo(msg);
        break;
      case "frenzy_fired":
        onFrenzyFired(msg);
        break;
      case "debt_started":
        startDebtCountdown(msg.ms);
        break;
      case "debt_forced":
        onDebtForced(msg.card);
        break;
      case "player_disconnected":
        onPlayerDisconnected(msg.nickname, msg.seconds);
        break;
      case "player_left":
        onPlayerLeft(msg.nickname, msg.retired, msg.retired_types);
        break;
      case "wait_poll":
        onWaitPoll(msg.nickname, msg.seconds);
        break;
      case "wait_poll_closed":
        onWaitPollClosed(msg.nickname, msg.result);
        break;
      case "sets_resynced":
        est.allSets = msg.your_sets;
        est.centerCards = msg.center_cards;
        renderYourCards();
        renderCenterCards();
        updateSetNav();
        updateOwingUi();
        break;
      case "game_update": {
        const drawn = new Set(est.centerSlots.filter((id) => id !== null));
        const arrived = msg.center_cards.find((c) => !drawn.has(c.id));
        est.centerCards = msg.center_cards;
        est.mirones = msg.spectators ?? 0;
        renderPlayersProgress(msg.players_progress);
        if (!arrived && drawn.size === msg.center_cards.length) break;
        renderCenterCards();
        if (arrived && qteBlockedCards.size === 0) {
          const slot = est.centerSlots.indexOf(arrived.id);
          if (slot !== -1) markLanded("centerCards", slot);
          flashCenter();
        }
        break;
      }
      case "set_flipped":
        onSetFlipped(msg.player, msg.set_index, msg.cards);
        break;
      case "verification_started":
        openVerifyOverlay(msg.player);
        break;
      case "set_verification_result":
        revealVerifySet(msg.player, msg.set_index, msg.is_valid, msg.cards);
        break;
      case "verification_success":
        onVerificationSuccess(msg.player, msg.position);
        break;
      case "verification_failed":
        onVerificationFailed(msg.player, msg.failed_sets);
        break;
      case "game_over":
        onGameOver(msg.rankings, msg.elo || []);
        break;
      case "game_cancelled":
        onGameCancelled(msg);
        break;
      case "pong":
        est.pendingPongSince = 0;
        if (est.pingSentAt) est.lastRtt = Math.round(performance.now() - est.pingSentAt);
        break;
      case "error":
        console.warn("Error del servidor:", msg.message);
        if (est.rejoinInFlight) {
          diag.note("ws", { ev: "rejoin_fail", msg: String(msg.message).slice(0, 80) });
          est.rejoinInFlight = false;
          forgetLobby();
          showScreen("homeScreen");
          agToast({ kind: "warning", message: t("err.rejoin", { why: srvText(msg, "err") }) });
          break;
        }
        agToast({ kind: "error", message: srvText(msg, "err") });
        clearSelection();
        break;
    }
    emitir("handleMsg", msg);
  }
  function srvText(msg, ns) {
    const fallback = msg.message ?? msg.reason ?? "";
    if (!msg.code) return fallback;
    const key = `${ns}.${msg.code}`;
    return PilesI18n.has(key) ? t(key, msg.args || {}) : fallback;
  }

  // ../client/mesa/mesa.js
  (() => {
    const escena = (() => {
      const cv = document.getElementById("juego"), g = cv.getContext("2d");
      const DIS = { x: -0.86, z: 0.66 };
      const CAMS = {
        // yaw/pitch/roll en rad, distancia, centro en pantalla (0..1), punto al que mira (mx, mz)
        inicio: { yaw: 0.35, pitch: 0.62, dist: 3.3, cy: 0.42, roll: -0.1, mx: 0, mz: 0 },
        crear: { yaw: 1.6, pitch: 0.18, dist: 2.3, cy: 0.4, roll: 0.22, mx: 0.3, mz: 0 },
        unirse: { yaw: -1.25, pitch: 1.12, dist: 2.4, cy: 0.4, roll: -0.32, mx: -0.2, mz: 0.2 },
        // La disputa, de cerca y algo desde arriba (se ven las dos manos sobre la carta). cy lo ajusta
        // la sala al hueco que dejan libre los jugadores y el chat (fijarCy).
        sala: { yaw: 2.25, pitch: 0.52, dist: 1.45, cy: 0.42, roll: 0.1, mx: DIS.x, mz: DIS.z, my: 0.12 },
        bots: { yaw: 2, pitch: 0.44, dist: 1.35, cy: 0.42, roll: -0.08, mx: DIS.x, mz: DIS.z, my: 0.12 },
        tutorial: { yaw: -2.4, pitch: 0.9, dist: 2.2, cy: 0.42, roll: 0.25, mx: 0.3, mz: -0.3 },
        perfil: { yaw: 2.9, pitch: 0.3, dist: 2, cy: 0.4, roll: -0.2, mx: 0, mz: -0.4 },
        burla: { yaw: Math.PI - 0.25, pitch: 0.32, dist: 2.6, cy: 0.3, roll: 0.08, mx: 0.05, mz: 1.3, my: 0.2 },
        // tu figura, de frente   // tu figura, de frente
        // Vista helicóptero: el QR (o la cuenta atrás) se forma con las cartas del centro
        qr: { yaw: 0, pitch: 1.5, dist: 3.5, cy: 0.36, roll: 0, mx: 0, mz: 0, my: 0 },
        cuenta: { yaw: 0, pitch: 1.5, dist: 2.3, cy: 0.36, roll: 0, mx: 0, mz: 0, my: 0 },
        visor: { yaw: 0, pitch: 1.5, dist: 1.9, cy: 0.36, roll: 0, mx: 0, mz: 0, my: 0 },
        // Sillas vacías, a ras de mesa (nadie a la altura)
        vacias: { yaw: 1.9, pitch: 0.1, dist: 2.6, cy: 0.46, roll: 0.08, mx: 0, mz: -0.2, my: 0.3 },
        // Tu Elo: la medalla de tu silla y el borde de la mesa delante de ti
        elo: { yaw: Math.PI - 0.35, pitch: 0.32, dist: 2.6, cy: 0.3, roll: -0.06, mx: -0.15, mz: 1.3, my: 0.2 },
        // Session Manager: por detrás de tu silla, la placa del respaldo
        sm: { yaw: 0.25, pitch: 0.12, dist: 0.95, cy: 0.33, roll: 0.05, mx: -0.05, mz: 1.88, my: 0.22 },
        // Mirar una partida: de pie, detrás de una silla
        mirar: { yaw: 0, pitch: 0.55, dist: 3, cy: 0.42, roll: 0, mx: 0, mz: 0.3, my: 0.2 },
        idioma: { yaw: -0.4, pitch: 1.3, dist: 2.6, cy: 0.4, roll: -0.4, mx: 0, mz: 0 },
        privacidad: { yaw: 2, pitch: 0.25, dist: 2.1, cy: 0.4, roll: -0.18, mx: -0.3, mz: 0 },
        codigo: { yaw: -1.9, pitch: 0.45, dist: 1.7, cy: 0.4, roll: 0.28, mx: 0, mz: 0.2 },
        // Todos listos: quien gana la pelea alza la carta (antes de la cuenta atrás)
        ganador: { yaw: 2.6, pitch: 0.22, dist: 2.4, cy: 0.7, roll: 0.06, mx: -0.3, mz: 0.8, my: 0.75 },
        // Empieza la partida: contrapicado hacia quien ganó la carta (asiento 0), que la alza
        partida: { yaw: Math.PI, pitch: 0.1, dist: 2.5, cy: 0.52, roll: -0.12, mx: 0, mz: 0.6, my: 0.85 }
      };
      for (const c of Object.values(CAMS)) c.my ??= 0.2;
      let cam = { ...CAMS.inicio }, meta = { ...CAMS.inicio }, actual = "inicio";
      let t2 = 6, tMeta = 6, disputa = 0, disputaMeta = 0, reloj = 0;
      let gana = -1, chispas = [], anillos = [], estall\u00F3 = false;
      let nuestras = [];
      const RAPIDO = 1.5, BALA = 0.3;
      let vel = RAPIDO, velMeta = RAPIDO, tv = 0;
      function base(a, p) {
        const b = { x: a.x * 0.98, z: a.z * 0.98 };
        if (p > 1 || disputa < 0.01) return b;
        const dx = DIS.x - b.x, dz = DIS.z - b.z, n = Math.hypot(dx, dz);
        return { x: b.x + dx / n * 0.45 * disputa, z: b.z + dz / n * 0.45 * disputa };
      }
      let s = 1532;
      const rnd = () => {
        s = (s * 1664525 + 1013904223) % 4294967296;
        return s / 4294967296;
      };
      const ACC = [];
      for (let k = 0; k < 1600; k++) ACC.push({ t: 1 + k * 0.75 + rnd() * 0.3, p: Math.floor(rnd() * 4), toma: rnd() < 0.5, giro: rnd() * 0.6 - 0.3 });
      const ASIENTOS = [0, 1, 2, 3].map((p) => {
        const a = Math.PI / 2 + p * Math.PI / 2;
        return { x: Math.cos(a) * 1.95, z: Math.sin(a) * 1.45, a };
      });
      const CW_M = 0.05, CH_M = 0.07;
      const lerp = (a, b, k) => a + (b - a) * k;
      const ROJO = "#e8402a";
      const suave = (a, b, x) => {
        const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
        return k * k * (3 - 2 * k);
      };
      let C, R, U, F, foco;
      function preparar() {
        const cp = Math.cos(cam.pitch), yaw = cam.yaw + 0.05 * Math.sin(reloj * 0.23);
        C = [cam.mx + Math.sin(yaw) * cp * cam.dist, Math.sin(cam.pitch) * cam.dist + cam.my, cam.mz + Math.cos(yaw) * cp * cam.dist];
        const f = [cam.mx - C[0], cam.my - C[1], cam.mz - C[2]], n = Math.hypot(...f);
        F = f.map((v) => v / n);
        R = [F[2], 0, -F[0]];
        const nr = Math.hypot(...R);
        R = R.map((v) => -v / nr);
        U = [R[1] * F[2] - R[2] * F[1], R[2] * F[0] - R[0] * F[2], R[0] * F[1] - R[1] * F[0]];
        foco = cv.height * 0.95;
      }
      let OX = 0, OZ = 0;
      function proy(x, y, z) {
        const v = [x + OX - C[0], y - C[1], z + OZ - C[2]];
        const d = v[0] * F[0] + v[1] * F[1] + v[2] * F[2];
        const px = v[0] * R[0] + v[1] * R[1] + v[2] * R[2], py = v[0] * U[0] + v[1] * U[1] + v[2] * U[2];
        const sx = px / d * foco, sy = py / d * foco, cr = Math.cos(cam.roll), sr = Math.sin(cam.roll);
        return [cv.width / 2 + sx * cr - sy * sr, cv.height * cam.cy - (sx * sr + sy * cr), d];
      }
      function quad(cx, y, cz, w, h, rot, relleno, borde2) {
        const c = Math.cos(rot), sn = Math.sin(rot);
        const p = [[-w, -h], [w, -h], [w, h], [-w, h]].map(([a, b]) => proy(cx + a * c - b * sn, y, cz + a * sn + b * c));
        if (p.some((q) => q[2] < 0.08)) return;
        g.beginPath();
        p.forEach(([x, yy], i) => i ? g.lineTo(x, yy) : g.moveTo(x, yy));
        g.closePath();
        g.fillStyle = relleno;
        g.fill();
        if (borde2) {
          g.strokeStyle = borde2;
          g.lineWidth = 1.2 * devicePixelRatio;
          g.stroke();
        }
      }
      function dibujar(dt) {
        g.globalCompositeOperation = "destination-out";
        g.fillStyle = `rgba(0, 0, 0, ${lerp(0.32, 0.8, suave(BALA, RAPIDO, vel))})`;
        g.fillRect(0, 0, cv.width, cv.height);
        g.globalCompositeOperation = "source-over";
        preparar();
        const e = gana >= 0 ? reloj - gana : -1;
        g.save();
        if (e > 0.15 && e < 0.7) {
          const a = 18 * devicePixelRatio * (1 - suave(0.15, 0.7, e));
          g.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
        }
        const mesas = [{ x: 0, z: 0 }, ...X2.mesas ?? []].map((m) => ({ ...m, d: proy(m.x, 0, m.z)[2] })).sort((a, b) => b.d - a.d);
        for (const m of mesas) {
          if (m.d < 0.3) continue;
          if (m.ocup) {
            const guarda = [t2, X2.ocupados];
            OX = m.x;
            OZ = m.z;
            t2 += m.desfase;
            X2.ocupados = m.ocup;
            principal = false;
            quietos = !m.jugando;
            unaMesa(-1);
            [t2, X2.ocupados] = guarda;
            OX = OZ = 0;
            principal = true;
            quietos = false;
          } else unaMesa(e);
        }
        particulas(dt);
        g.restore();
        if (e > 0.15 && e < 0.45) {
          g.fillStyle = `rgba(233, 230, 218, ${0.5 * (1 - suave(0.15, 0.45, e))})`;
          g.fillRect(0, 0, cv.width, cv.height);
        }
        X2.apagon += ((X2.cortado ? 1 : 0) - X2.apagon) * Math.min(1, dt * 3);
        if (X2.apagon > 0.01) {
          const parpadeo = X2.cortado && Math.random() < 0.12 ? 0.35 : 0;
          g.fillStyle = `rgba(0, 0, 0, ${Math.min(0.85, 0.55 * X2.apagon + parpadeo)})`;
          g.fillRect(0, 0, cv.width, cv.height);
        }
        cv.style.filter = X2.apagon > 0.01 ? `grayscale(${X2.apagon})` : "";
      }
      const X2 = {
        mosaico: null,
        // cartas que forman una figura vista desde arriba (QR, 3-2-1)
        visor: null,
        // el visor del escáner de QR: { video, t0 }
        listos: [false, false, false, false],
        // lámpara encendida sobre quien está listo
        ocupados: [true, true, true, true],
        // sillas con alguien; las vacías se ven vacías
        llegada: [-9, -9, -9, -9],
        // cuándo se sentó (parpadea al llegar, como un bot)
        nombres: null,
        // los de la sala; sin sala, el top global
        elo: null,
        // por asiento: { v, pool, top3 }; sin sala, el top global
        anclas: [{}, {}, {}, {}],
        // dónde va el dial de Elo de cada asiento (px CSS)
        placa: null,
        // la placa de Session Manager en tu respaldo: { txt, ok }
        burla: -9,
        // cuándo hizo tu figura el gesto de burla
        voto: null,
        // votación para echar: { a, t0 }
        mesas: null,
        // otras salas, en la misma sala oscura
        cortado: false,
        apagon: 1,
        // sin conexión (empieza apagado: «Conectando…»)
        tu: -1,
        // tu asiento (contorno bermellón); -1 = no estás en la mesa
        marca: -1
        // asiento señalado (a quién votas echar): también en bermellón
      };
      let principal = true, quietos = false;
      const RANGOS = {
        fun: [
          ["Cart\xF3n", "#b89a6e"],
          ["Juguete", "#ffd23f"],
          ["Lat\xF3n", "#d9c35a"],
          ["Caucho", "#8a8a8a"],
          ["Pl\xE1stico", "#4fe3d3"],
          ["Gominola", "#ff8ab8"],
          ["Dulce", "#ff6b7a"],
          ["Confeti", "#b794ff"],
          ["Payaso", "#ff7a70"]
        ],
        glory: [
          ["Hierro oxidado", "#b06a38"],
          ["Bronce", "#d9914d"],
          ["Plata", "#cdd5df"],
          ["Oro", "#f2cb5c"],
          ["Platino", "#bfe3ff"],
          ["Diamante", "#8fc0ff"],
          ["M\xE1ster", "#ffe27a"],
          ["Gran m\xE1ster", "#ffb8d2"],
          ["Top 3 global", "#ffe08a"]
        ]
      };
      const MINS = [null, 1001, 1100, 1200, 1300, 1400, 1500, 1600];
      function rango(v, pool, top3 = false) {
        let i = 0;
        for (let k = 1; k < MINS.length; k++) if (v >= MINS[k]) i = k;
        if (top3 && v >= 1600) i = 8;
        return RANGOS[pool][i];
      }
      const ELO_TOP = [{ v: 1724, pool: "glory", top3: true }, { v: 1688, pool: "glory", top3: true }, { v: 1651, pool: "glory", top3: true }, { v: 1604, pool: "glory" }];
      X2.elo = ELO_TOP.map((e) => ({ ...e }));
      function poli(pts, relleno, borde2, ancho2 = 1.2) {
        const p = pts.map((q) => proy(q[0], q[1], q[2]));
        if (p.some((q) => q[2] < 0.08)) return;
        g.beginPath();
        p.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
        g.closePath();
        if (relleno) {
          g.fillStyle = relleno;
          g.fill();
        }
        if (borde2) {
          g.strokeStyle = borde2;
          g.lineWidth = ancho2 * devicePixelRatio;
          g.stroke();
        }
      }
      function enPlano(o, ex, ey, ancho2, alto, fn) {
        const P = proy(...o), A = proy(o[0] + ex[0], o[1] + ex[1], o[2] + ex[2]), B = proy(o[0] + ey[0], o[1] + ey[1], o[2] + ey[2]);
        if (P[2] < 0.1 || A[2] < 0.1 || B[2] < 0.1) return;
        g.save();
        g.transform((A[0] - P[0]) / ancho2, (A[1] - P[1]) / ancho2, (B[0] - P[0]) / alto, (B[1] - P[1]) / alto, P[0], P[1]);
        fn();
        g.restore();
      }
      function ejes(a) {
        const n = Math.hypot(a.x, a.z), fw = [-a.x / n, -a.z / n];
        return { fw, ld: [fw[1], -fw[0]] };
      }
      function silla(a, p, alfa = 1) {
        const cu = base(a, p), { fw, ld } = ejes(a);
        const P = (adelante, lado, y) => [cu.x + fw[0] * adelante + ld[0] * lado, y, cu.z + fw[1] * adelante + ld[1] * lado];
        g.globalAlpha = alfa;
        for (const [f, l] of [[0.18, 0.3], [0.18, -0.3], [-0.42, 0.3], [-0.42, -0.3]]) poli([P(f, l, -1.18), P(f, l, -0.45), P(f + 0.02, l, -0.45), P(f + 0.02, l, -1.18)], "#141610", "rgba(169,182,137,0.35)");
        poli([P(0.21, 0.35, -0.45), P(0.21, -0.35, -0.45), P(-0.45, -0.35, -0.45), P(-0.45, 0.35, -0.45)], "#1c1f16", "rgba(169,182,137,0.6)");
        poli([P(-0.43, 0.32, -0.45), P(-0.43, -0.32, -0.45), P(-0.43, -0.32, 0.57), P(-0.43, 0.32, 0.57)], "#101209", "rgba(169,182,137,0.6)");
        g.globalAlpha = 1;
      }
      function deLaSilla(a, p) {
        const cu = base(a, p), { fw, ld } = ejes(a);
        const P = (adelante, lado, y) => [cu.x + fw[0] * adelante + ld[0] * lado, y, cu.z + fw[1] * adelante + ld[1] * lado];
        if (p === 0 && X2.placa) {
          const o = P(-0.44, 0.2, 0.3), ex = [ld[0] * -0.4, 0, ld[1] * -0.4], ey = [0, -0.18, 0];
          enPlano(o, ex, ey, 400, 180, () => {
            const ok = X2.placa.ok;
            g.fillStyle = ok ? "#a9b689" : "#1c1f16";
            g.fillRect(0, 0, 400, 180);
            g.strokeStyle = "#a9b689";
            g.lineWidth = 6;
            g.strokeRect(3, 3, 394, 174);
            for (const [x, y] of [[18, 18], [382, 18], [18, 162], [382, 162]]) {
              g.beginPath();
              g.arc(x, y, 6, 0, 7);
              g.fillStyle = ok ? "#4b5320" : "#a9b689";
              g.fill();
            }
            g.fillStyle = ok ? "#0b0c09" : "#a9b689";
            g.textAlign = "center";
            g.font = "800 30px Geist, sans-serif";
            g.fillText("SESSION MANAGER", 200, 54);
            g.font = "900 54px Geist, monospace";
            g.fillText(X2.placa.txt || "\xB7 \xB7 \xB7 \xB7 \xB7 \xB7", 200, 118);
            g.font = "700 24px Geist, sans-serif";
            g.fillText(T(ok ? "\u2713 VINCULADO" : "pega tu c\xF3digo"), 200, 158);
          });
        }
      }
      function lampara(a, p) {
        if (!X2.listos[p] || cam.pitch > 1.2) return;
        const { fw } = ejes(a), cu = base(a, p);
        const L = proy(cu.x + fw[0] * 0.5, 1.45, cu.z + fw[1] * 0.5), cuerda = proy(cu.x + fw[0] * 0.5, 3, cu.z + fw[1] * 0.5);
        const suelo = proy(cu.x + fw[0] * 0.75, 0, cu.z + fw[1] * 0.75);
        if (L[2] < 0.2 || suelo[2] < 0.2) return;
        g.save();
        g.globalCompositeOperation = "lighter";
        const rr = 1.1 * foco / suelo[2], lu = g.createRadialGradient(suelo[0], suelo[1], 0, suelo[0], suelo[1], rr);
        lu.addColorStop(0, "rgba(233,230,190,0.14)");
        lu.addColorStop(1, "rgba(233,230,190,0)");
        g.fillStyle = lu;
        g.beginPath();
        g.ellipse(suelo[0], suelo[1], rr, rr * 0.45, 0, 0, 7);
        g.fill();
        const rl = 0.22 * foco / L[2], gl = g.createRadialGradient(L[0], L[1], 0, L[0], L[1], rl);
        gl.addColorStop(0, "rgba(255,250,220,0.95)");
        gl.addColorStop(1, "rgba(255,250,220,0)");
        g.fillStyle = gl;
        g.beginPath();
        g.arc(L[0], L[1], rl, 0, 7);
        g.fill();
        g.restore();
        g.strokeStyle = "rgba(169,182,137,0.5)";
        g.lineWidth = 1.2 * devicePixelRatio;
        g.beginPath();
        g.moveTo(cuerda[0], cuerda[1]);
        g.lineTo(L[0], L[1]);
        g.stroke();
        const sh = 0.09 * foco / L[2];
        g.fillStyle = "#0e0e0e";
        g.strokeStyle = "#a9b689";
        g.beginPath();
        g.moveTo(L[0] - sh, L[1] + sh * 0.3);
        g.lineTo(L[0] + sh, L[1] + sh * 0.3);
        g.lineTo(L[0] + sh * 0.3, L[1] - sh * 0.5);
        g.lineTo(L[0] - sh * 0.3, L[1] - sh * 0.5);
        g.closePath();
        g.fill();
        g.stroke();
      }
      function mosaico() {
        const M2 = X2.mosaico;
        if (!M2) return;
        if (M2.salen && reloj > M2.salen + 0.5) {
          X2.mosaico = null;
          return;
        }
        const s2 = M2.s;
        for (const [i, k] of M2.celdas.entries()) {
          const dl = Math.hypot(k.x, k.z) * 0.5 + i % 7 * 0.012, u = suave(M2.t0 + dl, M2.t0 + dl + 0.55, reloj);
          if (u <= 0) continue;
          const sale = M2.salen ? suave(M2.salen, M2.salen + 0.4, reloj) : 0;
          const x = lerp(0, k.x, u) * (1 + sale * 2), z = lerp(0, k.z, u) * (1 + sale * 2);
          const lado = !M2.huecos && !k.c ? s2 * 0.52 : s2 * 0.47;
          quad(x, 0.02 + Math.sin(u * Math.PI) * 0.3, z, lado, lado, (1 - u) * (3 + i % 5), M2.huecos ? ROJO : k.c ? "#0e0e0e" : "#e9e6da", M2.huecos ? "#0e0e0e" : null);
        }
      }
      function visor() {
        const V = X2.visor;
        if (!V) return;
        const h = 0.42;
        const P = [[-h, -h], [h, -h], [h, h], [-h, h]].map(([x, z]) => proy(x, 0.02, z));
        if (V.video?.readyState >= 2) {
          const xs = P.map((q) => q[0]), ys = P.map((q) => q[1]);
          g.save();
          g.beginPath();
          P.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
          g.clip();
          g.globalAlpha = 0.9;
          g.drawImage(V.video, Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
          g.restore();
        }
        for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          quad(sx * h, 0.03, sz * h, 0.05, 0.05, 0, "#a9b689", "#0e0e0e");
          quad(sx * (h - 0.1), 0.03, sz * h, 0.05, 0.03, 0, "#a9b689", "#0e0e0e");
          quad(sx * h, 0.03, sz * (h - 0.1), 0.03, 0.05, 0, "#a9b689", "#0e0e0e");
        }
        const zz = -h + (reloj - V.t0) * 0.5 % 1 * 2 * h, a = proy(-h, 0.03, zz), b = proy(h, 0.03, zz);
        g.strokeStyle = "rgba(169,182,137,0.9)";
        g.lineWidth = 3 * devicePixelRatio;
        g.shadowColor = "#a9b689";
        g.shadowBlur = 14;
        g.beginPath();
        g.moveTo(a[0], a[1]);
        g.lineTo(b[0], b[1]);
        g.stroke();
        g.shadowBlur = 0;
      }
      function votos() {
        const V = X2.voto;
        if (!V) return;
        const obj = ASIENTOS[V.a];
        ASIENTOS.forEach((a, p) => {
          if (p === V.a || !X2.ocupados[p]) return;
          const u = suave(V.t0 + p * 0.35, V.t0 + p * 0.35 + 0.5, reloj);
          if (u <= 0) return;
          const x = lerp(a.x * 0.6, obj.x * 0.62 + p * 0.04, u), z = lerp(a.z * 0.6, obj.z * 0.62 - p * 0.03, u);
          quad(x, 0.03 + Math.sin(u * Math.PI) * 0.15, z, CW_M, CH_M, u * 6 + p, "#a9b689", "#0e0e0e");
        });
      }
      function unaMesa(e) {
        const dc = proy(0, 0, 0)[2];
        const gente = ASIENTOS.map((a, p) => estadoDe(a, p)).sort((x, y) => y.d - x.d);
        for (const q of gente) if (q.d > dc) figura(q, e);
        const c0 = proy(0, 0, 0), GR = 0.09;
        const aro = (y, i) => {
          const a = i / 64 * Math.PI * 2;
          return proy(Math.cos(a) * 1.7, y, Math.sin(a) * 1.2);
        };
        if (cam.pitch < 1.3) {
          g.beginPath();
          for (let i = 0; i <= 64; i++) {
            const [x, y] = aro(0, i);
            i ? g.lineTo(x, y) : g.moveTo(x, y);
          }
          for (let i = 64; i >= 0; i--) {
            const [x, y] = aro(-GR, i);
            g.lineTo(x, y);
          }
          g.fillStyle = "#070806";
          g.fill();
          g.beginPath();
          for (let i = 0; i <= 64; i++) {
            const [x, y] = aro(-GR, i);
            i ? g.lineTo(x, y) : g.moveTo(x, y);
          }
          g.strokeStyle = "rgba(0, 0, 0, 0.9)";
          g.lineWidth = 3 * devicePixelRatio;
          g.stroke();
        }
        const grad = g.createRadialGradient(c0[0], c0[1], 0, c0[0], c0[1], cv.height * 0.5);
        grad.addColorStop(0, "#2b3121");
        grad.addColorStop(0.6, "#181c13");
        grad.addColorStop(1, "#10120d");
        g.beginPath();
        for (let i = 0; i <= 64; i++) {
          const [x, y] = aro(0, i);
          i ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.fillStyle = grad;
        g.fill();
        g.strokeStyle = "rgba(169, 182, 137, 0.55)";
        g.lineWidth = 2 * devicePixelRatio;
        g.stroke();
        let n = 5;
        for (const a of ACC) {
          if (a.t > t2) break;
          n += a.toma ? -1 : 1;
          n = Math.max(4, Math.min(6, n));
        }
        for (let i = 0; i < n; i++) {
          const an = i / n * Math.PI * 2 + 0.4, r = i % 2 ? 0.36 : 0.24;
          quad(Math.cos(an) * r, 4e-3, Math.sin(an) * r * 0.8, CW_M, CH_M, an * 1.7, "#e9e6da", "#4b5320");
        }
        if (principal) for (const q of nuestras) quad(q.x, 0.012, q.z, CW_M, CH_M, q.rot, q.dorso ? "#4b5320" : "#0e0e0e", "#a9b689");
        for (const [p, a] of ASIENTOS.entries()) {
          const m = Math.hypot(a.x, a.z), tg = [-a.z / m, a.x / m];
          const actual2 = Math.floor(t2 / 7 + p * 2) % 6;
          for (let j = 0; j < 6; j++) {
            const o = (j - 2.5) * 0.19, x = a.x * 0.66 + tg[0] * o, z = a.z * 0.66 + tg[1] * o;
            for (let c = 0; c < 4; c++) quad(x, 4e-3 + c * 8e-3, z, 0.04, 0.056, a.a + Math.PI / 2 + (c - 1.5) * 0.06, j === actual2 && c === 3 ? "#a9b689" : "#4b5320", "rgba(14,14,14,0.9)");
          }
        }
        if (principal) {
          ASIENTOS.forEach((a, p) => {
            const cu = base(a, p), { fw } = ejes(a), q = proy(cu.x + fw[0] * 0.55, 0.12, cu.z + fw[1] * 0.55);
            X2.anclas[p] = {
              x: q[0] / devicePixelRatio,
              y: q[1] / devicePixelRatio,
              s: Math.min(1, Math.max(0.35, 2 / q[2])),
              ok: q[2] > 0.4 && cam.pitch < 1.2 && X2.ocupados[p] && X2.apagon < 0.5
            };
          });
          mosaico();
          visor();
          votos();
        }
        ASIENTOS.forEach((a, p) => lampara(a, p));
        for (const q of gente) if (q.d <= dc) figura(q, e);
        for (const c of enMano) quad(c.x, c.y, c.z, CW_M, CH_M, c.rot, "#4b5320", "#a9b689");
        enMano.length = 0;
        if (principal && disputa > 0.01 && X2.ocupados[1] && cam.pitch < 1.2) pelea(disputa, e);
      }
      function estadoDe(a, p) {
        let col = -1, carta = null;
        if (!quietos && !(p < 2 && disputa > 0.05)) for (const ac of ACC) {
          if (ac.p !== p || t2 < ac.t - 0.9 || t2 > ac.t + 0.8) continue;
          if (t2 < ac.t) {
            const s2 = (t2 - (ac.t - 0.9)) / 0.9;
            col = s2 < 0.6 ? Math.round(5 * suave(0, 1, s2 / 0.6)) : 6 + Math.round(5 * ((s2 - 0.6) / 0.4) ** 2);
            carta = { mano: true };
          } else {
            const r = (t2 - ac.t) / 0.8;
            col = r < 0.12 ? 11 : 20 + Math.min(3, Math.floor((r - 0.12) / 0.88 * 4));
            if (t2 < ac.t + 0.6) carta = { vuela: suave(ac.t, ac.t + 0.6, t2), giro: ac.giro };
          }
        }
        return { a, p, col, carta, d: proy(a.x, 0.6, a.z)[2] };
      }
      function figura(q, e) {
        const victoria = q.p === 0 && e >= 0 ? suave(0.12, 0.8, e) : -1;
        const arriba = 1 - suave(1, 1.3, cam.pitch);
        if (arriba < 0.02) return;
        g.globalAlpha = arriba;
        if (!X2.ocupados[q.p]) silla(q.a, q.p, arriba);
        else {
          if (reloj - X2.llegada[q.p] < 0.6 && Math.random() < 0.5) {
            g.globalAlpha = 1;
            return;
          }
          silueta(q.a, q.p, q.col, victoria, q.carta);
          if (principal) deLaSilla(q.a, q.p);
        }
        g.globalAlpha = 1;
      }
      function particulas(dt) {
        g.save();
        g.globalCompositeOperation = "lighter";
        g.lineCap = "round";
        chispas = chispas.filter((c) => (c.vida -= dt) > 0);
        for (const c of chispas) {
          c.vy += 900 * devicePixelRatio * dt * c.peso;
          c.x += c.vx * dt;
          c.y += c.vy * dt;
          c.vx *= 1 - 1.8 * dt;
          c.vy *= 1 - 1.8 * dt;
          const k = c.vida / c.total;
          g.strokeStyle = c.color.replace("A", (0.9 * k).toFixed(2));
          g.lineWidth = c.ancho * (0.4 + k);
          g.beginPath();
          g.moveTo(c.x, c.y);
          g.lineTo(c.x - c.vx * 0.045, c.y - c.vy * 0.045);
          g.stroke();
        }
        anillos = anillos.filter((r) => (r.vida -= dt) > 0);
        for (const r of anillos) {
          const k = 1 - r.vida / r.total;
          g.strokeStyle = `rgba(169, 182, 137, ${(1 - k) * 0.9})`;
          g.lineWidth = (10 - 8 * k) * devicePixelRatio;
          g.beginPath();
          g.ellipse(r.x, r.y, r.radio * k, r.radio * k * 0.55, 0, 0, Math.PI * 2);
          g.stroke();
        }
        g.restore();
      }
      function chispa(x, y, fuerza, peso = 1) {
        const an = Math.random() * Math.PI * 2, v = fuerza * (0.3 + Math.random()) * devicePixelRatio;
        const vida = 0.4 + Math.random() * 0.7;
        chispas.push({
          x,
          y,
          vx: Math.cos(an) * v,
          vy: Math.sin(an) * v - fuerza * 0.4 * devicePixelRatio,
          vida,
          total: vida,
          peso,
          ancho: (1.5 + Math.random() * 3) * devicePixelRatio,
          color: Math.random() < 0.45 ? "rgba(232, 64, 42, A)" : Math.random() < 0.6 ? "rgba(169, 182, 137, A)" : "rgba(233, 230, 218, A)"
        });
      }
      function pelea(k, e) {
        const A = ASIENTOS[0], B = ASIENTOS[1];
        const ab = [B.x - A.x, B.z - A.z], nab = Math.hypot(...ab);
        let tira = Math.sin(reloj * 2.6) * 0.7 + Math.sin(reloj * 7.3) * 0.3;
        if (e >= 0) tira = lerp(tira, -1.6, suave(0, 0.15, e));
        const mesa = { x: DIS.x + ab[0] / nab * tira * 0.05, z: DIS.z + ab[1] / nab * tira * 0.05 };
        const vuelo = e >= 0 ? suave(0.15, 0.85, e) : 0;
        if (vuelo === 0) quad(mesa.x, 0.03, mesa.z, CW_M, CH_M, 0.5 + tira * 0.12, "#a9b689", "#0e0e0e");
        else cartaAlzada(mesa, A, vuelo, e);
        for (const S of [A, B]) {
          if (S === A && e > 0.15) continue;
          if (S === B && e >= 0) k = disputa * (1 - suave(0.12, 0.3, e));
          const m = Math.hypot(S.x, S.z), u = [S.x / m, S.z / m], perp = [-u[1], u[0]];
          const lado = Math.sign((mesa.x - S.x) * perp[0] + (mesa.z - S.z) * perp[1]) || 1;
          const cu = base(S, S === A ? 0 : 1);
          const hom = { x: cu.x - u[0] * 0.05 + perp[0] * 0.2 * lado, y: 0.42, z: cu.z - u[1] * 0.05 + perp[1] * 0.2 * lado };
          const reposo = { x: S.x * 0.8 + perp[0] * 0.15 * lado, y: 0.06, z: S.z * 0.8 + perp[1] * 0.15 * lado };
          const fin = { x: mesa.x + u[0] * 0.1, y: 0.05, z: mesa.z + u[1] * 0.1 };
          const kk = suave(0, 0.3, k);
          const mano2 = { x: lerp(reposo.x, fin.x, kk), y: lerp(reposo.y, fin.y, kk) + Math.sin(kk * Math.PI) * 0.15, z: lerp(reposo.z, fin.z, kk) };
          const tirando = (S === A ? -tira : tira) > 0.2;
          brazo(hom, mano2, kk < 0.85 ? 0 : tirando ? 2 : 1, [perp[0] * lado, perp[1] * lado]);
        }
      }
      const BRZ = new Image(), BC = 256, PX_M = BC / 1.1;
      const ANC = [[[136.65, 74.05, 137.9, 149.55, 101.75, 74.05], [136.65, 74.05, 143.1, 159.6, 101.75, 74.05], [136.65, 74.05, 143.55, 162.8, 101.75, 74.05]], [[69.1, 81.15, 159.05, 143.75, 44.4, 89.6], [69.1, 81.15, 161.1, 152.75, 44.4, 89.6], [69.1, 81.15, 160.75, 155.95, 44.4, 89.6]], [[36.05, 102.55, 162, 134.5, 36.05, 114.45], [36.05, 102.55, 159.75, 143.55, 36.05, 114.45], [36.05, 102.55, 158.75, 146.95, 36.05, 114.45]], [[56.85, 125.65, 145.05, 127.3, 81.55, 134.1], [56.85, 125.65, 139.75, 137.4, 81.55, 134.1], [56.85, 125.65, 138.75, 141.1, 81.55, 134.1]], [[119.35, 136.95, 118.1, 126.3, 154.25, 136.95], [119.35, 136.95, 112.9, 137.9, 154.25, 136.95], [119.35, 136.95, 112.45, 141.75, 154.25, 136.95]], [[186.9, 129.8, 96.95, 132.1, 211.6, 121.35], [186.9, 129.8, 94.9, 144.7, 211.6, 121.35], [186.9, 129.8, 95.25, 148.6, 211.6, 121.35]], [[219.95, 108.45, 94, 141.3, 219.95, 96.5], [219.95, 108.45, 96.25, 153.9, 219.95, 96.5], [219.95, 108.45, 97.25, 157.6, 219.95, 96.5]], [[199.15, 85.35, 110.95, 148.5, 174.45, 76.9], [199.15, 85.35, 116.25, 160.05, 174.45, 76.9], [199.15, 85.35, 117.25, 163.5, 174.45, 76.9]], [[136.65, 38.9, 137.9, 161.9, 101.75, 38.9], [136.65, 38.9, 143.1, 166.65, 101.75, 38.9], [136.65, 38.9, 143.55, 168, 101.75, 38.9]], [[69.1, 56, 159.05, 148, 44.4, 76.2], [69.1, 56, 161.1, 150.3, 44.4, 76.2], [69.1, 56, 160.75, 151.65, 44.4, 76.2]], [[36.05, 107.2, 162, 125.95, 36.05, 135.8], [36.05, 107.2, 159.75, 128.3, 36.05, 135.8], [36.05, 107.2, 158.75, 130.1, 36.05, 135.8]], [[56.85, 162.5, 145.05, 108.6, 81.55, 182.75], [56.85, 162.5, 139.75, 113.55, 81.55, 182.75], [56.85, 162.5, 138.75, 116, 81.55, 182.75]], [[119.35, 189.6, 118.1, 106.2, 154.25, 189.6], [119.35, 189.6, 112.9, 114.65, 154.25, 189.6], [119.35, 189.6, 112.45, 117.65, 154.25, 189.6]], [[186.9, 172.55, 96.95, 120.1, 211.6, 152.3], [186.9, 172.55, 94.9, 131, 211.6, 152.3], [186.9, 172.55, 95.25, 134, 211.6, 152.3]], [[219.95, 121.35, 94, 142.15, 219.95, 92.75], [219.95, 121.35, 96.25, 153, 219.95, 92.75], [219.95, 121.35, 97.25, 155.55, 219.95, 92.75]], [[199.15, 66, 110.95, 159.45, 174.45, 45.75], [199.15, 66, 116.25, 167.75, 174.45, 45.75], [199.15, 66, 117.25, 169.65, 174.45, 45.75]]];
      BRZ.src = "/mesa/brazos.webp";
      function brazo(H2, M2, col, fuera) {
        if (!BRZ.complete) return;
        const S = proy(H2.x, H2.y, H2.z), P = proy(M2.x, M2.y, M2.z);
        if (S[2] < 0.15 || P[2] < 0.15) return;
        let fx = M2.x - H2.x, fz = M2.z - H2.z;
        const nf = Math.hypot(fx, fz) || 1;
        fx /= nf;
        fz /= nf;
        const cx = C[0] - (H2.x + M2.x) / 2, cy = C[1] - (H2.y + M2.y) / 2, cz = C[2] - (H2.z + M2.z) / 2;
        const fc = cx * fx + cz * fz, oc = cx * fuera[0] + cz * fuera[1];
        const az = (Math.round(Math.atan2(oc, fc) / (Math.PI / 4)) % 8 + 8) % 8;
        const fila = (Math.atan2(cy, Math.hypot(fc, oc)) > 0.65 ? 8 : 0) + az;
        const [hx, hy, ax, ay, ox, oy] = ANC[fila][col];
        const sx = ax - hx, sy = ay - hy, dx = P[0] - S[0], dy = P[1] - S[1];
        const O = proy(H2.x + fuera[0] * 0.15, H2.y, H2.z + fuera[1] * 0.15);
        const lado = (a, b, c, d) => Math.sign(a * d - b * c);
        const espejo = lado(dx, dy, O[0] - S[0], O[1] - S[1]) !== lado(sx, sy, ox - hx, oy - hy);
        const largo = Math.hypot(dx, dy) / (Math.hypot(sx, sy) || 1);
        const ancho2 = foco / ((S[2] + P[2]) / 2) / PX_M;
        g.save();
        g.translate(S[0], S[1]);
        g.rotate(Math.atan2(dy, dx));
        g.scale(largo, espejo ? -ancho2 : ancho2);
        g.rotate(-Math.atan2(sy, sx));
        g.drawImage(BRZ, col * BC, fila * BC, BC, BC, -hx, -hy, BC, BC);
        g.restore();
      }
      function cartaAlzada(mesa, A, u, e) {
        const n = Math.hypot(A.x, A.z), fw = [-A.x / n, -A.z / n];
        const alto = { x: A.x * 0.98 + fw[0] * 0.33, y: 1.3, z: A.z * 0.98 + fw[1] * 0.33 };
        const pos = proy(lerp(mesa.x, alto.x, u), lerp(0.03, alto.y, u) + Math.sin(u * Math.PI) * 0.45, lerp(mesa.z, alto.z, u));
        if (pos[2] < 0.1) return;
        if (!estall\u00F3) {
          estall\u00F3 = true;
          for (let i = 0; i < 90; i++) chispa(pos[0], pos[1], 700, 0.6);
          anillos.push({ x: pos[0], y: pos[1], radio: cv.width * 0.6, vida: 0.6, total: 0.6 });
        }
        const h = 0.26 * foco / pos[2] * (1 + 0.7 * Math.sin(u * Math.PI)), w = h * 0.7;
        if (u < 1) for (let i = 0; i < 3; i++) chispa(pos[0], pos[1], 120, 0.2);
        g.save();
        g.translate(pos[0], pos[1]);
        if (u >= 1) {
          g.globalCompositeOperation = "lighter";
          const pulso = 0.6 + 0.4 * Math.sin(reloj * 6);
          for (let i = 0; i < 14; i++) {
            const an = i / 14 * Math.PI * 2 + reloj * 0.8, l = h * (2.2 + i % 3 * 0.6) * pulso;
            g.strokeStyle = `rgba(232, 64, 42, ${0.3 * pulso})`;
            g.lineWidth = h * 0.08;
            g.beginPath();
            g.moveTo(Math.cos(an) * h * 0.6, Math.sin(an) * h * 0.6);
            g.lineTo(Math.cos(an) * l, Math.sin(an) * l);
            g.stroke();
          }
          if (Math.random() < 0.4) chispa(pos[0], pos[1], 260, 0.3);
          g.globalCompositeOperation = "source-over";
        }
        g.rotate((1 - u) ** 2 * Math.PI * 5 - cam.roll);
        g.shadowColor = ROJO;
        g.shadowBlur = (10 + 40 * u) * devicePixelRatio;
        g.fillStyle = "#e9e6da";
        g.beginPath();
        g.moveTo(-w / 2 + w * 0.04, -h / 2);
        g.lineTo(w / 2, -h / 2 - h * 0.01);
        g.lineTo(w / 2 - w * 0.04, h / 2);
        g.lineTo(-w / 2, h / 2 + h * 0.01);
        g.closePath();
        g.fill();
        g.shadowBlur = 0;
        g.strokeStyle = "#4b5320";
        g.lineWidth = w * 0.06;
        g.stroke();
        g.restore();
      }
      const SIL = new Image(), CW = 240, CH = 384;
      const MANOS = [[[87.6, 242], [89.7, 232.2], [91.5, 222.5], [93, 213], [94.2, 203.9], [95.2, 195.4], [99, 201.3], [101, 221], [106.9, 229], [110.7, 233.7], [112.7, 236.2], [113.4, 237], [109, 231.3], [100.5, 131.9], [94.4, 95.5], [91.1, 85.7], [89.2, 82.4], [88.2, 81.3], [87.8, 80.9], [87.8, 80.9], [109.3, 239.2], [98.5, 244.6], [91.3, 243.7], [87.6, 242]], [[152.4, 235.6], [150.3, 225.4], [148.5, 215.5], [147, 205.9], [145.8, 196.8], [144.8, 188.4], [141, 192.8], [139, 211.2], [133.1, 219.4], [129.3, 224.5], [127.3, 227.2], [126.6, 228.2], [131, 220.5], [139.5, 124.3], [145.6, 92.9], [148.9, 85.9], [150.8, 84.2], [151.8, 83.8], [152.2, 83.7], [152.2, 83.7], [130.7, 230.3], [141.5, 236], [148.7, 236.2], [152.4, 235.6]], [[160.7, 241.2], [162.7, 231.1], [164, 221.1], [164.5, 211.4], [164.4, 202.2], [163.7, 193.7], [173.1, 198.5], [181.7, 217.4], [180.1, 225], [177.7, 229.6], [176, 232.1], [175.7, 232.9], [187.5, 226.5], [167.1, 129.4], [135.5, 96.2], [118, 88.1], [108.5, 85.8], [103.8, 85.1], [102.1, 85], [101.8, 84.9], [175.6, 235.4], [173.8, 241.8], [166.9, 242], [160.7, 241.2]], [[79.3, 236], [77.3, 226.2], [76, 216.5], [75.5, 207.1], [75.6, 198.1], [76.3, 189.7], [66.9, 195.1], [58.3, 214.4], [59.9, 222.9], [62.3, 228.2], [64, 230.9], [64.3, 231.9], [52.5, 224.7], [72.9, 126.3], [104.5, 92.1], [122, 83.5], [131.5, 80.9], [136.2, 80.1], [137.9, 79.8], [138.2, 79.8], [64.4, 233.7], [66.2, 238.4], [73.1, 237.5], [79.3, 236]]];
      const enMano = [];
      const ALTO = 3.15, CENTRO = 0.39;
      let borde = null, bordeRojo = null;
      const tenir = (color) => {
        const c = document.createElement("canvas");
        c.width = SIL.width;
        c.height = SIL.height;
        const b = c.getContext("2d");
        b.drawImage(SIL, 0, 0);
        b.globalCompositeOperation = "source-in";
        b.fillStyle = color;
        b.fillRect(0, 0, c.width, c.height);
        return c;
      };
      SIL.onload = () => {
        borde = tenir("#a9b689");
        bordeRojo = tenir(ROJO);
      };
      SIL.src = "/mesa/siluetas.webp";
      const TOP = ["Ana", "Beto", "Coca", "Dani"];
      function desproy(X3, Y, d) {
        const ux = X3 - cv.width / 2, uy = cv.height * cam.cy - Y, cr = Math.cos(cam.roll), sr = Math.sin(cam.roll);
        const px = (ux * cr + uy * sr) * d / foco, py = (-ux * sr + uy * cr) * d / foco;
        return { x: C[0] + F[0] * d + R[0] * px + U[0] * py - OX, y: C[1] + F[1] * d + R[1] * px + U[1] * py, z: C[2] + F[2] * d + R[2] * px + U[2] * py - OZ };
      }
      function silueta(a, p, col, victoria = -1, carta = null) {
        if (!borde) return;
        const n = Math.hypot(a.x, a.z), fw = [-a.x / n, -a.z / n], ld = [fw[1], -fw[0]];
        const cu = base(a, p), px = cu.x + fw[0] * 0.3, pz = cu.z + fw[1] * 0.3;
        const tc = [C[0] - px, C[2] - pz], nc = Math.hypot(...tc);
        const fr = (tc[0] * fw[0] + tc[1] * fw[1]) / nc, sd = (tc[0] * ld[0] + tc[1] * ld[1]) / nc;
        const fila = Math.abs(fr) >= Math.abs(sd) ? fr > 0 ? 0 : 1 : sd < 0 ? 2 : 3;
        const vivo = tv + p * 1.7;
        const amago = 0.14 * Math.max(0, Math.sin(vivo * 0.7)) ** 3;
        if (victoria >= 0) col = 12 + Math.round(victoria * 7);
        else if (col < 0) col = Math.round(amago * 11);
        const alcance = col >= 0 && col < 12 ? col / 11 : 0;
        const c = proy(px, CENTRO, pz), hpx = ALTO * foco / c[2], wpx = hpx * CW / CH;
        if (c[2] < 0.5) return;
        const haciaMesa = Math.sign(proy(0, 0, 0)[0] - c[0]) || 1;
        const voltea = fila >= 2 && haciaMesa !== (fila === 3 ? -1 : 1);
        g.save();
        g.translate(c[0], c[1] + hpx / 2);
        g.globalAlpha *= Math.min(1, (c[2] - 0.5) / 0.5);
        const bu = p === 0 && principal ? Math.max(0, 1 - (reloj - X2.burla) / 1.2) : 0;
        if (bu > 0) g.translate(0, -Math.abs(Math.sin(reloj * 14)) * hpx * 0.05 * bu);
        g.rotate(-cam.roll + 0.03 * Math.sin(vivo * 0.55) + 0.05 * alcance * haciaMesa + 0.18 * bu * Math.sin(reloj * 24));
        g.scale(voltea ? -1 : 1, 1 + 0.014 * Math.sin(vivo * 1.6));
        const rojo = principal && (p === X2.tu || p === X2.marca) && c[2] > 1;
        const r = (rojo ? 3.5 : 1.5) * devicePixelRatio, alfa = g.globalAlpha;
        g.globalAlpha = (rojo ? 1 : 0.6) * alfa;
        g.drawImage(rojo ? bordeRojo : borde, col * CW, fila * CH, CW, CH, -wpx / 2 - r, -hpx - r, wpx + 2 * r, hpx + 2 * r);
        g.globalAlpha = alfa;
        g.drawImage(SIL, col * CW, fila * CH, CW, CH, -wpx / 2, -hpx, wpx, hpx);
        g.restore();
        if (carta) {
          const ang = -cam.roll + 0.03 * Math.sin(vivo * 0.55) + 0.05 * alcance * haciaMesa;
          const sy = 1 + 0.014 * Math.sin(vivo * 1.6), ca = Math.cos(ang), sa = Math.sin(ang);
          const dedos = (k) => {
            const [hx, hy] = MANOS[fila][k];
            const lx = (-wpx / 2 + hx / CW * wpx) * (voltea ? -1 : 1), ly = (-hpx + hy / CH * hpx) * sy;
            return desproy(c[0] + lx * ca - ly * sa, c[1] + hpx / 2 + lx * sa + ly * ca, c[2]);
          };
          if (carta.mano) enMano.push({ ...dedos(col), rot: a.a + Math.PI / 2 });
          else {
            const u = carta.vuela, s2 = dedos(11), dx = Math.sin(carta.giro) * 0.15, dz = Math.cos(carta.giro) * 0.1;
            enMano.push({
              x: lerp(s2.x, dx, u),
              y: lerp(s2.y, 0.01, u) + Math.sin(u * Math.PI) * 0.1,
              z: lerp(s2.z, dz, u),
              rot: a.a + Math.PI / 2 + u * (3 + carta.giro * 6)
            });
          }
        }
        if (!principal) return;
        const tx = proy(cu.x, 1.1, cu.z);
        g.font = `800 ${Math.max(11 * devicePixelRatio, Math.min(16 * devicePixelRatio, hpx * 0.06))}px Geist, sans-serif`;
        g.textAlign = "center";
        g.fillStyle = p === X2.tu ? ROJO : "rgba(169, 182, 137, 0.9)";
        g.fillText(X2.nombres ? X2.nombres[p].toUpperCase() : `#${p + 1} ${TOP[p].toUpperCase()}`, tx[0], tx[1]);
      }
      let antes = 0, asomo = { cam: null, p: 0, dt: 0 }, tAsomo = 0;
      function cuadro(ms) {
        const dt = Math.min(0.05, (ms - antes) / 1e3 || 0);
        antes = ms;
        vel += (velMeta - vel) * Math.min(1, dt * 2.5);
        tv += dt * vel / RAPIDO;
        tMeta += dt * vel;
        t2 += (tMeta - t2) * Math.min(1, dt * 1.6) + dt * vel * 0.2;
        for (const k of ["yaw", "pitch", "dist", "cy", "roll", "mx", "mz", "my"]) {
          const obj = asomo.cam ? lerp(meta[k], asomo.cam[k], asomo.p) : meta[k];
          cam[k] += (obj - cam[k]) * Math.min(1, dt * (asomo.cam ? 6 : 1.9));
        }
        const dA = ((asomo.cam ? asomo.p * asomo.dt : 0) - tAsomo) * Math.min(1, dt * 6);
        tAsomo += dA;
        t2 += dA;
        disputa += (disputaMeta - disputa) * Math.min(1, dt * 1.2);
        reloj = ms / 1e3;
        const cl = document.body.classList;
        if (!cl.contains("en-partida") || cl.contains("entrando")) dibujar(dt);
        requestAnimationFrame(cuadro);
      }
      function medir() {
        cv.width = innerWidth * devicePixelRatio;
        cv.height = innerHeight * devicePixelRatio;
      }
      addEventListener("resize", medir);
      medir();
      requestAnimationFrame(cuadro);
      let prof = 0;
      function aPantalla(x, z) {
        const ahora = cam;
        cam = meta;
        preparar();
        const [sx, sy, d] = proy(x, 0.012, z);
        const s2 = Math.min(1.3, Math.max(0.05, 2 * CW_M * foco / d / devicePixelRatio / 128));
        cam = ahora;
        preparar();
        return { x: sx / devicePixelRatio, y: sy / devicePixelRatio, s: s2 };
      }
      return {
        /** Dónde está el centro de la mesa en pantalla, y a qué escala se ve allí una carta. */
        centro: () => aPantalla(0, 0),
        /** Un hueco en el centro para soltar una carta: a dónde volar y cómo dejarla puesta. */
        soltar(dorso = false) {
          const an = Math.random() * Math.PI * 2, r = 0.1 + Math.random() * 0.35;
          const q = { x: Math.cos(an) * r, z: Math.sin(an) * r * 0.8, rot: Math.random() * Math.PI, dorso };
          return { ...aPantalla(q.x, q.z), poner() {
            nuestras.push(q);
            nuestras = nuestras.slice(-6);
          } };
        },
        X: X2,
        ELO_TOP,
        RANGOS,
        MINS,
        /** Una figura con cartas, vista desde arriba: matriz de booleanos (oscuro = true). */
        mosaico(matriz, s2, huecos2 = false) {
          if (!matriz) {
            if (X2.mosaico) X2.mosaico.salen = reloj;
            return;
          }
          const n = matriz.length, m = matriz[0].length, celdas = [];
          for (let r = 0; r < n; r++) for (let c = 0; c < m; c++) if (!huecos2 || matriz[r][c]) celdas.push({ x: (c - (m - 1) / 2) * s2, z: (r - (n - 1) / 2) * s2, c: matriz[r][c] });
          if (!huecos2) celdas.sort((a, b) => a.c - b.c);
          X2.mosaico = { celdas, s: s2, t0: reloj, huecos: huecos2 };
        },
        /** Solo una cámara (sin cambiar de profundidad ni de partida). */
        camara(nombre2) {
          actual = nombre2;
          meta = { ...CAMS[nombre2] };
          if (nombre2 === "cuenta" || nombre2 === "qr" || nombre2 === "visor") disputaMeta = 0;
        },
        /** De cerca a un asiento, desde el centro de la mesa (votar para echar). */
        aAsiento(p) {
          const a = ASIENTOS[p];
          meta = { yaw: Math.atan2(-a.x, -a.z), pitch: 0.3, dist: 1.9, cy: 0.42, roll: 0.12, mx: a.x * 0.85, mz: a.z * 0.85, my: 0.4 };
          disputaMeta = 0;
        },
        /** La cámara vuela a la mesa i de las otras salas (o a la nuestra con -1). */
        aMesa(i) {
          const m = X2.mesas?.[i];
          meta = m ? { yaw: Math.atan2(-m.x, -m.z), pitch: 0.5, dist: 3.3, cy: 0.42, roll: 0.06 * (i - 1), mx: m.x, mz: m.z, my: 0.2 } : { ...CAMS.unirse };
        },
        congelar(si) {
          velMeta = si ? 0 : BALA;
        },
        /** Todos listos: uno de los dos de la disputa arranca la carta y la alza (antes de la cuenta atrás). */
        ganar() {
          if (disputa < 0.3) return;
          gana = reloj;
          estall\u00F3 = false;
          actual = "ganador";
          meta = { ...CAMS.ganador };
          if (cv.width < cv.height) {
            meta.dist = 3.2;
            meta.yaw = 2.85;
          }
        },
        /** Altura en pantalla (0..1) a la que se centra una cámara: la sala la ajusta al hueco libre. */
        fijarCy(nombre2, cy) {
          if (!CAMS[nombre2]) return;
          CAMS[nombre2].cy = cy;
          if (actual === nombre2) meta.cy = cy;
        },
        /** Asomarse a otro menú sin ir: p 0..1 (el dedo); sentido 1 = adelante, -1 = atrás. null = soltar. */
        asomar(pantalla2, p = 0, sentido = 1) {
          asomo = pantalla2 ? { cam: CAMS[pantalla2] ?? CAMS.sala, p, dt: sentido * 6.5 } : { cam: null, p: 0, dt: 0 };
        },
        /** Al confirmar: lo asomado ya cuenta como hecho (ir() pone la cámara y el tiempo). */
        confirmarAsomo() {
          asomo = { cam: null, p: 0, dt: 0 };
          tAsomo = 0;
        },
        // t ya va adelantado: sigue a tMeta sin salto
        ahora: () => reloj,
        /** Otro menú: su cámara, y la partida avanza (o se rebobina) según la profundidad. */
        ir(pantalla2, profundidad) {
          actual = CAMS[pantalla2] ? pantalla2 : "sala";
          meta = { ...CAMS[actual] };
          disputaMeta = ["sala", "bots", "partida"].includes(pantalla2) ? 1 : 0;
          velMeta = pantalla2 === "inicio" ? RAPIDO : BALA;
          if (pantalla2 === "partida") {
            if (gana < 0) {
              gana = reloj;
              estall\u00F3 = false;
            }
          } else gana = -1;
          tMeta += (profundidad - prof) * 6.5;
          prof = profundidad;
        }
      };
    })();
    const tl = (k, v) => typeof t === "function" ? t(k, v) : k;
    const X = escena.X;
    const MENUS = {
      inicio: [
        { palo: "i:rayo", nombre: "Partida r\xE1pida", nota: "Te sienta en una mesa ya", accion: "rapida" },
        { palo: "i:mas", nombre: "Crear sala", nota: "T\xFA eliges jugadores y qui\xE9n entra", ir: "crear" },
        { palo: "i:entrar", nombre: "Unirse", nota: "Salas abiertas, c\xF3digo o QR", ir: "unirse" }
      ],
      tutorial: [
        { palo: "1/3", nombre: "Intercambia", nota: "Cambia cartas hasta que cada una de tus PILAS tenga la misma prenda", accion: "nada" },
        { palo: "2/3", nombre: "Muestra", nota: "Muestra una pila cuando creas que est\xE1 completa. Todos lo ven", accion: "nada" },
        { palo: "3/3", nombre: "Verificamos", nota: "Si fallas, revisa tus pilas. Toca para volver", accion: "volver" }
      ],
      perfil: [
        { palo: "i:enlace", nombre: "Session Manager", nota: "Lleva tu Elo a tu cuenta", ir: "sm" },
        { palo: "i:bocina", nombre: "Mi burla", nota: "", ir: "burla" }
      ],
      sm: [
        { palo: "i:teclado", nombre: "Pegar c\xF3digo", nota: "El de tu cuenta de Session Manager", accion: "smCodigo" },
        { palo: "i:cruz", nombre: "Desvincular", nota: "Vuelves al Elo de este navegador", accion: "smBorrar" }
      ],
      qr: [{ palo: "i:copiar", nombre: "Copiar enlace", nota: "Para mandarlo por chat", accion: "copiar" }],
      visor: [{ palo: "i:cruz", nombre: "Cerrar c\xE1mara", nota: "Apunta al QR de otra pantalla", accion: "volver" }],
      oferta: [
        { palo: "i:bot", nombre: "VS bots", nota: "Tres bots se sientan ya", accion: "ofertaBots" },
        { palo: "i:reloj", nombre: "Seguir buscando", nota: "Esperar a personas", accion: "seguir" }
      ],
      echar: [],
      // se llena al tocar la carta de un jugador
      votar: [],
      // se llena con la votación (kick_poll)
      burla: [],
      // las de lobby.html (TAUNTS)
      crear: [{ palo: "i:play", nombre: "Abrir sala", nota: "Con los jugadores y la privacidad de arriba", accion: "abrir" }],
      unirse: [],
      // las salas de verdad (lobby_list)
      sala: [],
      // según seas jugador o espectador (menuSala)
      bots: [
        { palo: "i:mas", nombre: "A\xF1adir bot", nota: "Con la dificultad de arriba", accion: "bot" },
        { palo: "i:llenar", nombre: "Llenar", nota: "Todos los huecos", accion: "llenar" },
        { palo: "i:cruz", nombre: "Quitar bot", nota: "El \xFAltimo que entr\xF3", accion: "quitarBot" }
      ],
      cuenta: []
    };
    const EN_SALA = /* @__PURE__ */ new Set(["sala", "bots", "qr", "echar", "votar", "oferta", "cuenta"]);
    const A_LOBBY = {
      inicio: "homeScreen",
      perfil: "profileScreen",
      sm: "profileScreen",
      burla: "profileScreen",
      tutorial: "howToPlayScreen",
      crear: "hostScreen",
      unirse: "joinScreen",
      visor: "joinScreen"
    };
    const DE_LOBBY = { homeScreen: "inicio", profileScreen: "perfil", howToPlayScreen: "tutorial", hostScreen: "crear", joinScreen: "unirse", lobbyScreen: "sala" };
    let crearJug = 4;
    const esc2 = document.getElementById("escenario");
    const zona = document.getElementById("cartas");
    const estado = document.getElementById("estado");
    const nombre = document.getElementById("nombre");
    const vibrar = (ms) => {
      try {
        navigator.vibrate?.(ms);
      } catch {
      }
    };
    const W = () => innerWidth, H = () => innerHeight;
    const M = 16, SEP = 8, FILA2 = 64, ZONA = 120, ESTADO_H = 56;
    const ancho = () => W() >= 1024;
    function rejilla() {
      const w = W(), h = H(), es = h < 720 ? 0.8 : 1;
      const manoTop = h - M - 176 * 1.08 * es;
      return { w, h, es, manoTop, estadoAbajo: manoTop - SEP, libre: manoTop - SEP - ESTADO_H - SEP, cabw: Math.min(190, w - 202) };
    }
    let mano = [], sel = 0, pantalla = "inicio", cabeceras = [];
    function hacerCarta(o, clase = "") {
      const c = document.createElement("button");
      c.type = "button";
      c.className = "carta " + clase;
      c.innerHTML = `<span class="palo"></span><span class="nombre"></span><span class="nota"></span>`;
      for (const k of ["palo", "nombre", "nota"]) ponTexto(c, k, o[k] ?? "");
      return c;
    }
    function ponTexto(c, k, es) {
      c.dataset[k] = es;
      pintaTexto(c, k);
    }
    function pintaTexto(c, k) {
      const es = c.dataset[k], e = c.querySelector("." + k);
      if (es.startsWith("i:")) e.innerHTML = ico(es.slice(2));
      else e.textContent = T(es);
    }
    const ICONOS = {
      rayo: "M13 2 5 14h6l-1 8 8-12h-6z",
      mas: "M12 4v16M4 12h16",
      menos: "M4 12h16",
      entrar: "M6 18 18 6M8 6h10v10",
      enlace: "M9 15l6-6M8 11l-3 3 5 5 3-3M16 13l3-3-5-5-3 3",
      bocina: "M3 9v6h4l6 5V4L7 9zM16 9l2 3-2 3M19 6l3 6-3 6",
      teclado: "M2 6h20v12H2zM6 10h1M10 10h1M14 10h1M18 10h1M7 14h10",
      cruz: "M5 5l14 14M19 5 5 19",
      flecha: "M3 12h16M13 6l6 6-6 6",
      copiar: "M8 8h12v12H8zM4 16V4h12",
      silla: "M7 3v18M7 12h10v9",
      volver: "M9 5 4 10l5 5M4 10h12v9h-4",
      bot: "M5 8h14v11H5zM12 4v4M9 12v2M15 12v2M9 16h6",
      reloj: "M6 3h12M6 21h12M7 3l10 18M17 3 7 21",
      nota: "M9 18V4l9 3M9 18H5v-4h4",
      vacio: "M6 6h12v12H6zM4 20 20 4",
      play: "M7 4v16l12-8z",
      ojo: "M2 12l5-5h10l5 5-5 5H7zM11 10h2v4h-2z",
      check: "M4 12l5 5L20 6",
      cambio: "M4 8h15M15 4l4 4-4 4M20 16H5M9 12l-4 4 4 4",
      llenar: "M4 6h12M4 12h16M4 18h12M16 8l4 4-4 4",
      fuera: "M14 4H4v16h10M10 12h11M17 8l4 4-4 4",
      persona: "M8 4h8v8H8zM4 21v-5h16v5",
      camara: "M3 7h4l2-3h6l2 3h4v13H3zM10 11h4v4h-4z",
      qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2M18 14h2v2M14 18h2v2M18 18v2h2",
      abajo: "M12 3v16M6 13l6 6 6-6"
    };
    const ico = (n) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONOS[n]}"/></svg>`;
    const pon = (c, x, y, r = 0, s = 1) => {
      c.style.setProperty("--x", x + "px");
      c.style.setProperty("--y", y + "px");
      c.style.setProperty("--r", r + "deg");
      c.style.setProperty("--s", s);
    };
    const pilaX = () => escena.centro().x - 64, pilaY = () => escena.centro().y - 88;
    function alCentro(c, dorso = false, retraso = 0) {
      const h = escena.soltar(dorso);
      c.classList.remove("respira", "elegida", "cabecera", "previa");
      c.style.transitionDelay = `${retraso}ms`;
      pon(c, h.x - 64, h.y - 88, Math.random() * 60 - 30, h.s);
      setTimeout(() => {
        h.poner();
        c.style.transitionDelay = "";
        c.style.opacity = "0";
      }, 480 + retraso);
      setTimeout(() => c.remove(), 820 + retraso);
    }
    function colocarMano(rapido = false, desliz = 0) {
      const R = rejilla(), s0 = 1.08 * R.es, yE = R.manoTop - 88 + 88 * s0;
      if (ini?.eje === "h") mano.forEach((c) => c.style.transition = "none");
      mano.forEach((c, i) => {
        const k = i - sel;
        const x = W() / 2 - 64 + k * 112 * R.es + desliz;
        const y = k === 0 ? yE : yE + Math.min(12, 4 + Math.abs(k) * 4);
        c.classList.toggle("elegida", k === 0);
        c.setAttribute("aria-selected", k === 0);
        c.tabIndex = k === 0 ? 0 : -1;
        if (rapido) c.style.transition = "none";
        pon(c, x, y, k * 5, k === 0 ? s0 : 0.9 * R.es);
        if (rapido) {
          void c.offsetWidth;
          c.style.transition = "";
        }
      });
      colocarTextos();
      alElegirCarta();
    }
    function colocarTextos() {
      const R = rejilla();
      estado.style.top = "auto";
      estado.style.bottom = R.h - R.estadoAbajo + "px";
      campo.style.bottom = R.h - R.estadoAbajo + "px";
    }
    function repartir(opciones, dir = 0, elegida = 0) {
      mano.forEach((c) => c.remove());
      mano = opciones.map((o, i) => {
        const c = hacerCarta(o);
        c.dataset.i = i;
        c.style.transition = "none";
        if (dir) pon(c, W() / 2 - 64 + dir * (W() * 0.9 + i * 70), rejilla().manoTop, dir * 14, 0.9);
        else pon(c, pilaX(), pilaY(), -8, 0.7);
        zona.append(c);
        return c;
      });
      sel = Math.min(elegida, Math.max(0, mano.length - 1));
      requestAnimationFrame(() => requestAnimationFrame(() => mano.forEach((c, i) => {
        c.style.transition = "";
        c.style.transitionDelay = `${i * 55}ms`;
        setTimeout(() => {
          c.style.transitionDelay = "";
          c.classList.add("respira");
          c.style.animationDelay = `${i * -0.7}s`;
        }, 650 + i * 55);
      })));
      requestAnimationFrame(() => requestAnimationFrame(() => colocarMano()));
      estadoBots();
    }
    function refrescarMano(p) {
      if (pantalla !== p) return;
      const nuevas = MENUS[p], mismas = nuevas.length === mano.length && nuevas.every((o, i) => o.clave === mano[i]?.dataset.clave);
      if (mismas) {
        nuevas.forEach((o, i) => {
          for (const k of ["palo", "nombre", "nota"]) if (mano[i].dataset[k] !== (o[k] ?? "")) ponTexto(mano[i], k, o[k] ?? "");
        });
        return;
      }
      const antes = mano[sel]?.dataset.clave;
      repartir(nuevas, 1, Math.max(0, nuevas.findIndex((o) => o.clave === antes)));
      mano.forEach((c, i) => c.dataset.clave = nuevas[i].clave ?? "");
    }
    function apilarCabeceras() {
      const n = cabeceras.length;
      cabeceras.forEach((h, i) => {
        const atras = n - 1 - i, k = Math.min(atras, 2);
        h.classList.toggle("previa", atras > 0);
        h.style.opacity = atras > 2 ? "0" : "";
        h.style.zIndex = 12 - k;
        pon(h, M - k * 5, FILA2 - k * 5, -k * 1.5, 1);
      });
    }
    function retirarMano() {
      const viejas = mano;
      mano = [];
      viejas.forEach((x, i) => alCentro(x, false, i * 45));
    }
    function elegir(d) {
      const n = Math.max(0, Math.min(mano.length - 1, sel + d));
      if (n === sel) {
        mano[sel]?.animate([{ translate: "0 0" }, { translate: `${-d * 14}px 0` }, { translate: "0 0" }], { duration: 320, easing: "cubic-bezier(.34,1.56,.64,1)" });
        return;
      }
      sel = n;
      vibrar(6);
      colocarMano();
    }
    function jugar() {
      const c = mano[sel];
      if (!c) return;
      if (c.disabled) {
        c.animate([{ translate: "0 0" }, { translate: "8px 0" }, { translate: "-6px 0" }, { translate: "0 0" }], { duration: 260 });
        return;
      }
      const o = MENUS[pantalla][sel];
      if (!o) return;
      if (o.accion !== void 0) {
        accion(o.accion, c, o);
        return;
      }
      vibrar(18);
      c.classList.remove("respira");
      c.style.transition = "";
      mano.splice(sel, 1);
      cambiar(o.ir, c, o);
    }
    function cambiar(destino, jugada, o = {}, lobby = true) {
      const b = document.getElementById("barrido");
      b.classList.remove("pasa");
      void b.offsetWidth;
      b.classList.add("pasa");
      jugada.classList.remove("elegida", "respira");
      jugada.classList.add("cabecera");
      jugada.disabled = true;
      cabeceras.push(jugada);
      apilarCabeceras();
      historial.push(pantalla);
      const antes = pantalla;
      pantalla = destino;
      esc2.dataset.p = destino;
      preparaMenu(destino, o);
      estado.textContent = "";
      cerrarCampo();
      escena.ir(destino, historial.length);
      alCambiar(antes, destino, lobby);
      retirarMano();
      setTimeout(() => {
        repartir(MENUS[destino], 1);
        mano.forEach((c, i) => c.dataset.clave = MENUS[destino][i]?.clave ?? "");
      }, 160);
    }
    function irA(destino, titulo, o = {}, lobby = true) {
      const t0 = hacerCarta({ nombre: titulo });
      zona.append(t0);
      pon(t0, pilaX(), pilaY(), 0, 0.8);
      setTimeout(() => cambiar(destino, t0, o, lobby), 30);
    }
    const historial = [];
    function volver() {
      if (pantalla === "cuenta") {
        if (est.isReady) toggleReady();
        return;
      }
      if (pantalla === "oferta") {
        cancelQuickMatchOffer();
        cerrarOferta();
        return;
      }
      if (!historial.length) return;
      if (pantalla === "sala") {
        conLobby(() => leaveLobby());
      }
      deshacer();
    }
    function deshacer() {
      if (!historial.length) return;
      const antes = pantalla;
      const h = cabeceras.pop();
      h?.classList.remove("previa");
      apilarCabeceras();
      cerrarCampo();
      const b = document.getElementById("barrido");
      b.classList.remove("pasa");
      void b.offsetWidth;
      b.classList.add("pasa");
      pantalla = historial.pop();
      esc2.dataset.p = pantalla;
      estado.textContent = "";
      escena.ir(pantalla, historial.length);
      alCambiar(antes, pantalla, true);
      if (h) alCentro(h);
      retirarMano();
      setTimeout(() => {
        repartir(MENUS[pantalla], -1);
        mano.forEach((c, i) => c.dataset.clave = MENUS[pantalla][i]?.clave ?? "");
      }, 120);
    }
    function saltarA(destino) {
      cancelarCuentaVisual();
      cabeceras.forEach((h) => alCentro(h));
      cabeceras = [];
      historial.length = 0;
      const antes = pantalla;
      pantalla = "inicio";
      esc2.dataset.p = "inicio";
      if (destino === "inicio") {
        escena.ir("inicio", 0);
        alCambiar(antes, "inicio", false);
        retirarMano();
        setTimeout(() => repartir(MENUS.inicio, -1), 120);
        return;
      }
      const titulo = destino === "sala" ? est.currentLobbyId || "Sala" : { perfil: "Perfil", tutorial: "C\xF3mo jugar", crear: "Crear sala", unirse: "Unirse" }[destino] ?? destino;
      irA(destino, titulo, {}, false);
    }
    let suprimir = 0;
    const conLobby = (f) => {
      suprimir++;
      try {
        return f();
      } finally {
        suprimir--;
      }
    };
    function alinearLobby(p) {
      if (EN_SALA.has(p)) return;
      const id = A_LOBBY[p];
      if (id && vistaActual !== id) conLobby(() => showScreen(id));
    }
    al("showScreen", (id) => {
      document.body.classList.toggle("en-partida", id === "gameScreen");
      if (suprimir || id === "gameScreen") return;
      const destino = DE_LOBBY[id];
      if (!destino) return;
      const ya = destino === "sala" ? EN_SALA.has(pantalla) : A_LOBBY[pantalla] === id;
      if (ya) {
        if (destino === "sala") sincronizarSala();
        return;
      }
      if (destino === "sala" && ["inicio", "crear", "unirse", "visor"].includes(pantalla)) {
        estado.textContent = "";
        irA("sala", est.currentLobbyId, {}, false);
      } else saltarA(destino);
    });
    al("sinNombre", () => {
      sacude(nombre);
      nombre.focus();
    });
    al("handleMsg", alMensaje);
    al("startCountdown", (s) => cuentaAtras(Number(s) || 3));
    al("closeCountdown", () => {
      if (cuenta && !cuenta.repartiendo) cancelarCuentaVisual(true);
    });
    al("ofertaBots", (abierta) => {
      if (abierta && pantalla === "sala") ofrecerBots();
      else if (!abierta && pantalla === "oferta") cerrarOferta();
    });
    let ultimaSala = null;
    const cartasJug = /* @__PURE__ */ new Map();
    const huecos = [];
    const filasSala = () => Math.ceil((ultimaSala?.max_players ?? 4) / 4);
    function posJugador(i, max) {
      const fila = Math.floor(i / 4), enFila = Math.min(4, max - fila * 4), k = i % 4;
      return [W() / 2 - 64 + (k - (enFila - 1) / 2) * 80, ZONA - 39 + 4 + fila * 107];
    }
    const sinEmoji2 = (s) => String(s ?? "").replace(/\p{Extended_Pictographic}️?/gu, "").replace(/\s+/g, " ").trim();
    const ordenSala = () => {
      const js = (ultimaSala?.players ?? []).map((p) => ({ ...p, nickname: sinEmoji2(p.nickname), nick: p.nickname }));
      return [...js.filter((p) => p.id === est.currentPlayerId), ...js.filter((p) => p.id !== est.currentPlayerId)];
    };
    function sincronizarSala(llega = false) {
      const m = ultimaSala, dentro = !!m && !!est.currentLobbyId;
      X.tu = dentro && !est.soyEspectador ? 0 : -1;
      if (!dentro) {
        ultimaSala = null;
        cartasJug.forEach((c) => {
          pon(c, pilaX(), -260, 20, 1);
          setTimeout(() => c.remove(), 600);
        });
        cartasJug.clear();
        huecos.splice(0).forEach((v) => v.remove());
        X.ocupados = [true, true, true, true];
        X.listos = [false, false, false, false];
        X.nombres = null;
        X.elo = escena.ELO_TOP.map((e) => ({ ...e }));
        return;
      }
      if (esperaBots && m.players.length === esperaBots.n) esperaBots = null;
      if (EN_SALA.has(pantalla)) mano.forEach((c) => {
        if (c.classList.contains("ida") && c !== esperaBots?.c) vuelve(c);
      });
      const gente = ordenSala(), vistos = /* @__PURE__ */ new Set();
      gente.forEach((p, i) => {
        vistos.add(p.id);
        let c = cartasJug.get(p.id);
        const tuyo = p.id === est.currentPlayerId;
        const [x, y] = posJugador(i, m.max_players);
        if (!c) {
          c = hacerCarta({}, tuyo ? "jugador tuya" : "jugador");
          c.disabled = true;
          c.style.transition = "none";
          pon(c, x + (Math.random() - 0.5) * 200, -220, (Math.random() - 0.5) * 60, 1.2);
          zona.prepend(c);
          cartasJug.set(p.id, c);
          requestAnimationFrame(() => requestAnimationFrame(() => {
            c.style.transition = "";
            pon(c, x, y, (i % 2 ? 1 : -1) * 3, 0.56);
          }));
          if (llega && !tuyo) {
            decir("", T("{n} entr\xF3", { n: p.nickname }), true);
            vibrar(8);
            c.animate([{ scale: 1 }, { scale: 1.35 }, { scale: 1 }], { duration: 420, delay: 480, easing: "cubic-bezier(.34,1.56,.64,1)" });
          }
        } else pon(c, x, y, (i % 2 ? 1 : -1) * 3, 0.56);
        ponTexto(c, "palo", tuyo ? est.soyEspectador ? "i:ojo" : "T\xDA" : p.is_ready ? "i:check" : p.is_bot ? "i:bot" : "");
        c.dataset.nombre = p.nickname;
        c.querySelector(".nombre").textContent = p.nickname;
        ponTexto(c, "nota", "");
        c.classList.toggle("listo", !!p.is_ready);
        c.dataset.id = p.id;
      });
      for (const [id, c] of cartasJug) if (!vistos.has(id)) {
        decir("", T("{n} sali\xF3", { n: c.dataset.nombre }), true);
        pon(c, W() + 200, -200, 40, 1);
        setTimeout(() => c.remove(), 600);
        cartasJug.delete(id);
      }
      for (let s = 0; s < 4; s++) {
        const p = gente[s];
        if (p && !X.ocupados[s] && llega) X.llegada[s] = escena.ahora();
        X.ocupados[s] = !!p;
        X.listos[s] = !!p?.is_ready;
      }
      X.nombres = [0, 1, 2, 3].map((s) => gente[s]?.nickname ?? "");
      X.elo = [0, 1, 2, 3].map((s) => gente[s]?.elo != null ? { v: gente[s].elo, pool: m.pool === "fun" ? "fun" : "glory", top3: !!gente[s].top3 } : null);
      while (huecos.length > m.max_players - gente.length) {
        const v = huecos.pop();
        v.style.opacity = "0";
        setTimeout(() => v.remove(), 300);
      }
      while (huecos.length < m.max_players - gente.length) {
        const v = hacerCarta({}, "jugador vacia");
        v.disabled = true;
        v.setAttribute("aria-hidden", "true");
        v.style.opacity = "0";
        zona.prepend(v);
        huecos.push(v);
      }
      huecos.forEach((v, k) => {
        const i = gente.length + k, [x, y] = posJugador(i, m.max_players);
        pon(v, x, y, (i % 2 ? 1 : -1) * 3, 0.56);
        requestAnimationFrame(() => v.style.opacity = "");
      });
      if (EN_SALA.has(pantalla) && !["cuenta", "oferta", "votar"].includes(pantalla) && !aviso.t) estado.textContent = "";
      menuSala();
      refrescarMano("sala");
      estadoBots();
      formas();
    }
    function menuSala() {
      const m = ultimaSala, cabe = m && m.players.length < m.max_players;
      MENUS.sala = est.soyEspectador ? [{ clave: "rol", palo: "i:silla", nombre: enCola ? "Salir de la cola" : "Quiero jugar", nota: enCola ? "Te sentar\xE1s cuando haya hueco" : "Pides sitio en la mesa", accion: "rol" }] : [
        { clave: "listo", palo: "i:check", nombre: est.isReady ? "Listo \u2713" : "Estoy listo", nota: "Cuando est\xE9n todos, se reparte", accion: "listo" },
        ...cabe ? [{ clave: "bots", palo: "i:bot", nombre: "VS bots", nota: "Rellenar con bots", ir: "bots" }] : [],
        { clave: "mirar", palo: "i:cambio", nombre: "Mirar", nota: "Pasar a espectador", accion: "rol" }
      ];
    }
    const campo = document.getElementById("campo");
    let alEnviar = null, alEscribir = null;
    function pedir(ph, max, enviar, escribir = null) {
      campo.value = "";
      campo.placeholder = ph;
      campo.maxLength = max;
      colocarTextos();
      campo.style.textTransform = max <= 12 ? "uppercase" : "";
      alEnviar = enviar;
      alEscribir = escribir;
      campo.classList.add("abierto");
      esc2.classList.add("escribiendo");
      campo.focus();
    }
    function cerrarCampo() {
      campo.classList.remove("abierto");
      esc2.classList.remove("escribiendo");
      campo.blur();
      alEnviar = alEscribir = null;
    }
    campo.addEventListener("input", () => alEscribir?.(campo.value.trim().toUpperCase()));
    campo.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && campo.value.trim()) {
        const f = alEnviar;
        const v = campo.value.trim();
        cerrarCampo();
        f?.(v);
      } else if (e.key === "Escape") cerrarCampo();
      e.stopPropagation();
    });
    const aviso = (txt, ms = 1600) => {
      if (est.currentLobbyId && ["sala", "bots", "qr", "echar", "votar"].includes(pantalla)) {
        decir("", txt, true);
        return;
      }
      estado.textContent = txt;
      clearTimeout(aviso.t);
      aviso.t = setTimeout(() => {
        aviso.t = 0;
        estado.textContent = "";
      }, ms);
    };
    const sacude = (el) => {
      el?.classList.remove("mal");
      void el?.offsetWidth;
      el?.classList.add("mal");
      vibrar([20, 40, 20]);
      setTimeout(() => el?.classList.remove("mal"), 700);
    };
    const seVa = (c) => {
      if (!c) return;
      c.classList.add("ida");
      c.disabled = true;
      clearTimeout(c._vuelve);
      c._vuelve = setTimeout(() => vuelve(c), 6e3);
    };
    function vuelve(c) {
      if (!c) return;
      clearTimeout(c._vuelve);
      if (!mano.includes(c)) return;
      c.classList.remove("ida");
      c.disabled = false;
      estadoBots();
    }
    let esperaBots = null;
    const pideBots = (c, n) => {
      seVa(c);
      vibrar(15);
      esperaBots = { c, n };
    };
    function estadoBots() {
      const m = ultimaSala;
      if (pantalla !== "bots" || !m) return;
      const llena = m.players.length >= m.max_players, sinBots = !m.players.some((p) => p.is_bot);
      mano.forEach((c, i) => {
        if (c.classList.contains("ida")) return;
        const a = MENUS.bots[i]?.accion;
        c.disabled = a === "bot" || a === "llenar" ? llena : a === "quitarBot" ? sinBots : false;
      });
    }
    const salta = (c) => c?.animate([{ translate: "0 0" }, { translate: "0 -40px" }, { translate: "0 0" }], { duration: 420, easing: "cubic-bezier(.34,1.56,.64,1)" });
    function ofrecerBots() {
      if (pantalla !== "sala") return;
      historial.push(pantalla);
      pantalla = "oferta";
      esc2.dataset.p = "oferta";
      escena.camara("vacias");
      decir("", T("No hay oponentes dignos..."), true);
      formas();
      retirarMano();
      setTimeout(() => repartir(MENUS.oferta, 1), 160);
    }
    function cerrarOferta() {
      if (pantalla !== "oferta") return;
      pantalla = historial.pop() ?? "sala";
      esc2.dataset.p = pantalla;
      escena.ir(pantalla, historial.length);
      retirarMano();
      setTimeout(() => {
        menuSala();
        repartir(MENUS.sala, -1);
        mano.forEach((c, i) => c.dataset.clave = MENUS.sala[i]?.clave ?? "");
      }, 160);
      sincronizarSala();
    }
    const LETRAS = {
      // 5×7
      3: ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
      2: ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
      1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"]
    };
    const matrizDe = (ch) => LETRAS[ch].map((f) => [...f].map((b) => b === "1"));
    let cuenta = null;
    function cuentaAtras(segundos) {
      cancelarCuentaVisual();
      if (!EN_SALA.has(pantalla)) return;
      if (pantalla !== "sala") {
        while (EN_SALA.has(historial.at(-1)) && pantalla !== "sala") deshacerSinAnimar();
      }
      const GANA = Math.max(0, segundos - 3) * 1e3;
      cuenta = { timers: [], repartiendo: false };
      historial.push(pantalla);
      pantalla = "cuenta";
      escena.ganar();
      vibrar(25);
      if (!ancho()) formas();
      mano.forEach((x) => pon(x, W() / 2 - 64, H() + 80, 0, 0.8));
      estado.innerHTML = `${ico("abajo")}${ico("cruz")}`;
      estado.setAttribute("aria-label", T("Desm\xE1rcate (\u2193) para cancelar"));
      colocarTextos();
      const tras = (ms, f) => cuenta.timers.push(setTimeout(f, ms));
      tras(GANA, () => {
        esc2.dataset.p = "cuenta";
        escena.camara("cuenta");
        formas();
      });
      ["3", "2", "1"].forEach((k, i) => tras(GANA + i * 1e3, () => {
        escena.mosaico(matrizDe(k), 0.13, true);
        vibrar(30);
      }));
      tras(GANA + 3e3, () => {
        cuenta.repartiendo = true;
        escena.mosaico(null);
        estado.textContent = "";
      });
    }
    function cancelarCuentaVisual(volverASala = false) {
      if (!cuenta) return;
      cuenta.timers.forEach(clearTimeout);
      cuenta = null;
      escena.mosaico(null);
      if (pantalla === "cuenta" && volverASala) {
        pantalla = historial.pop() ?? "sala";
        esc2.dataset.p = pantalla;
        escena.ir(pantalla, historial.length);
        menuSala();
        repartir(MENUS[pantalla], -1);
        mano.forEach((c, i) => c.dataset.clave = MENUS[pantalla][i]?.clave ?? "");
        sincronizarSala();
      } else if (pantalla === "cuenta") {
        pantalla = historial.pop() ?? "sala";
        esc2.dataset.p = pantalla;
      }
    }
    function deshacerSinAnimar() {
      const h = cabeceras.pop();
      if (h) alCentro(h);
      apilarCabeceras();
      pantalla = historial.pop();
      esc2.dataset.p = pantalla;
    }
    const PERFIL = /* @__PURE__ */ new Set(["perfil", "sm", "burla"]);
    function preparaMenu(destino, o = {}) {
      if (destino === "echar") marcaVoto = o.idx >= 0 && o.idx < 4 ? o.idx : -1;
      if (destino === "echar") MENUS.echar = [
        { palo: "i:fuera", nombre: T("Echar a {n}", { n: o.nick }), nota: "Votan todos: si alguien dice no, se queda", accion: "echar", id: o.id, idx: o.idx },
        { palo: "i:volver", nombre: "Mejor no", nota: "Volver a la sala", accion: "volver" }
      ];
      if (destino === "burla") MENUS.burla = [...TAUNTS, { id: "", name: tl("taunt.none") }].map((b) => ({ palo: b.id ? "i:nota" : "i:vacio", nombre: b.name, nota: "Suena a quien llegue tarde a tu carta", accion: "burla", id: b.id }));
      if (destino === "perfil") MENUS.perfil[1].nota = TAUNTS.find((b) => b.id === getTaunt())?.name ?? tl("taunt.none");
    }
    function alCambiar(antes, ahora, lobby) {
      if (PERFIL.has(ahora) && !est.currentLobbyId) {
        X.nombres = [nombre.value.trim() || T("T\xFA"), "Beto", "Coca", "Dani"];
        X.tu = 0;
      } else if (!EN_SALA.has(ahora) || ahora === "sala") sincronizarSala();
      X.marca = ahora === "echar" || ahora === "votar" ? marcaVoto : -1;
      formas(ahora);
      if (lobby) alinearLobby(ahora);
      if (ahora === "unirse") {
        if (est.ws?.readyState === WebSocket.OPEN) refreshLobbies();
        pintarMesas();
      } else if (ahora !== "visor") X.mesas = null;
      if (antes === "sm") X.placa = null;
      if (ahora === "sm") X.placa = { txt: smCodeGuardado(), ok: !!smCodeGuardado() };
      if (antes === "qr") escena.mosaico(null);
      if (ahora === "qr") mostrarQR();
      if (antes === "visor") pararVisor();
      if (ahora === "visor") abrirVisor();
      if (ahora === "perfil") cargarElo();
    }
    function alElegirCarta() {
      const o = MENUS[pantalla]?.[sel];
      if (!o) return;
      if (pantalla === "unirse") escena.aMesa(Math.min(sel, 2));
      if ((pantalla === "echar" || pantalla === "votar") && marcaVoto > 0) escena.aAsiento(marcaVoto);
      if (pantalla === "burla" && o.id) {
        X.burla = escena.ahora();
        playTaunt(o.id, true);
      }
    }
    async function mostrarQR() {
      if (!est.currentLobbyId) return;
      escena.camara("qr");
      try {
        const r = await fetch(`/api/qr/${encodeURIComponent(est.currentLobbyId)}/matriz`);
        if (!r.ok) throw new Error(r.status);
        const { n, m } = await r.json(), borde = 2, filas = [];
        if (pantalla !== "qr") return;
        for (let y = -borde; y < n + borde; y++) {
          const f = [];
          for (let x = -borde; x < n + borde; x++) f.push(y >= 0 && x >= 0 && y < n && x < n && m[y * n + x] === "1");
          filas.push(f);
        }
        escena.mosaico(filas, 1.5 / (n + 2 * borde));
      } catch {
        aviso(T("No se pudo cargar el QR"), 2400);
      }
    }
    async function abrirVisor() {
      X.visor = { t0: escena.ahora(), video: null };
      await conLobby(() => toggleScanner());
      if (!qrScanner) {
        aviso(T("No se pudo abrir la c\xE1mara. Escribe el c\xF3digo a mano."), 3e3);
        return;
      }
      if (X.visor) X.visor.video = document.getElementById("scanVideo");
    }
    function pararVisor() {
      stopScanner();
      X.visor = null;
    }
    let miElo = { fun: 1e3, glory: 1e3, top3: {} };
    async function cargarElo() {
      try {
        const rec = await fetchElo(ratingKey());
        miElo = { fun: rec?.fun?.r ?? 1e3, glory: rec?.glory?.r ?? 1e3, top3: rec?.top3 ?? {} };
      } catch {
      }
      X.elo[0] = { v: miElo.glory, pool: "glory", top3: !!miElo.top3.glory };
      if (pantalla === "perfil") {
        PZ[0].dataset.k = "";
        formas();
      }
    }
    let salas = [], firmaSalas = "";
    function alListaSalas(lobbies) {
      const ESTADO = { waiting: "En espera", starting: "Empezando", playing: "Jugando" };
      salas = [...lobbies].sort((a, b) => (a.status === "waiting" ? 0 : 1) - (b.status === "waiting" ? 0 : 1) || b.player_count - a.player_count);
      const firma = salas.map((l) => `${l.id}${l.player_count}${l.status}${l.spectators}`).join("|");
      MENUS.unirse = salas.length ? salas.map((l) => {
        const mirar = l.status !== "waiting" || l.player_count >= l.max_players;
        return {
          clave: l.id,
          palo: `${l.player_count}/${l.max_players}`,
          nombre: l.id,
          nota: `${T(ESTADO[l.status] ?? "En espera")}${l.spectators ? " \xB7 " + T("{n} mirando", { n: l.spectators }) : ""} \xB7 ${T(mirar ? "Entrar\xE1s a mirar" : "Entrar\xE1s a jugar")}`,
          accion: "entrarSala",
          id: l.id,
          mirar
        };
      }) : [{ clave: "nada", palo: "i:vacio", nombre: "No hay salas", nota: "Crea una o escribe un c\xF3digo", accion: "nada" }];
      if (firma === firmaSalas && mano.length) return;
      firmaSalas = firma;
      if (pantalla === "unirse") {
        refrescarMano("unirse");
        pintarMesas();
      }
    }
    function pintarMesas() {
      X.mesas = salas.slice(0, 3).map((s, i) => ({
        x: [-5.2, 0, 5.2][i],
        z: [-4, -7.5, -4][i],
        desfase: 40 + i * 23,
        jugando: s.status === "playing",
        ocup: [0, 1, 2, 3].map((p) => p < s.player_count)
      }));
    }
    let marcaVoto = -1;
    function alMensaje(msg) {
      switch (msg.type) {
        case "lobby_list":
          alListaSalas(msg.lobbies ?? []);
          break;
        case "lobby_update": {
          const llega = !!ultimaSala && ultimaSala.players.length < msg.players.length;
          ultimaSala = msg;
          sincronizarSala(llega);
          break;
        }
        case "chat":
          decir(sinEmoji2(msg.from), msg.text, false, msg.from === est.currentNickname);
          break;
        case "chat_history":
          chatLog.length = 0;
          (msg.messages ?? []).forEach((l) => chatLog.push({ quien: sinEmoji2(l.from), txt: l.text, sistema: false, tuyo: l.from === est.currentNickname }));
          pintarChat();
          break;
        case "kick_poll":
          alVoto(msg);
          break;
        case "kick_poll_ended":
          alFinVoto(msg);
          break;
        case "kicked":
          ultimaSala = null;
          break;
        case "game_start":
          cancelarCuentaVisual();
          break;
      }
    }
    function alVoto(msg) {
      const gente = ordenSala(), i = gente.findIndex((p) => p.nick === msg.nickname), quien = sinEmoji2(msg.nickname);
      marcaVoto = i >= 0 && i < 4 ? i : -1;
      X.marca = marcaVoto;
      if (msg.yes?.length) X.voto = { a: Math.max(0, marcaVoto), t0: escena.ahora() };
      const puedo = !est.soyEspectador && msg.voters.includes(est.currentNickname) && !msg.yes.includes(est.currentNickname);
      MENUS.votar = puedo ? [
        { clave: "si", palo: "i:fuera", nombre: T("S\xED, fuera {n}", { n: quien }), nota: T("{y} de {t} a favor", { y: msg.yes.length, t: msg.voters.length }), accion: "votoSi" },
        { clave: "no", palo: "i:volver", nombre: "Que se quede", nota: "Con un no, se queda", accion: "votoNo" }
      ] : [{ clave: "espera", palo: "i:reloj", nombre: msg.nickname === est.currentNickname ? "\xBFTe echan?" : "Votando\u2026", nota: T("{y} de {t} a favor", { y: msg.yes.length, t: msg.voters.length }), accion: "nada" }];
      if (pantalla === "votar") refrescarMano("votar");
      else if (EN_SALA.has(pantalla) && pantalla !== "cuenta") {
        while (pantalla !== "sala" && EN_SALA.has(historial.at(-1))) deshacerSinAnimar();
        irA("votar", T("\xBFEchar a {n}?", { n: quien }), {}, false);
      }
    }
    function alFinVoto(msg) {
      marcaVoto = -1;
      X.marca = -1;
      X.voto = null;
      if (pantalla === "votar") deshacer();
      const textos = { expulsado: "kick.done", rechazado: "kick.no", tiempo: "kick.timeout", salio: "kick.left", cancelada: "kick.cancelled" };
      if (textos[msg.result]) aviso(tl(textos[msg.result], { nick: sinEmoji2(msg.nickname) }), 2600);
    }
    const DIC = {
      "Partida r\xE1pida": ["Quick match", "\u5FEB\u901F\u5339\u914D"],
      "Te sienta en una mesa ya": ["Seats you at a table now", "\u9A6C\u4E0A\u7ED9\u4F60\u5B89\u6392\u4E00\u5F20\u684C\u5B50"],
      "Crear sala": ["Create room", "\u521B\u5EFA\u623F\u95F4"],
      "T\xFA eliges jugadores y qui\xE9n entra": ["You choose players and who gets in", "\u4F60\u51B3\u5B9A\u4EBA\u6570\u548C\u8C01\u80FD\u8FDB"],
      "Unirse": ["Join", "\u52A0\u5165\u623F\u95F4"],
      "Salas abiertas, c\xF3digo o QR": ["Open rooms, code or QR", "\u516C\u5F00\u623F\u95F4\u3001\u4EE3\u7801\u6216\u4E8C\u7EF4\u7801"],
      "Intercambia": ["Swap", "\u4EA4\u6362"],
      "Cambia cartas hasta que cada una de tus PILAS tenga la misma prenda": ["Swap cards until each of your PILES has the same garment", "\u4EA4\u6362\u5361\u724C\uFF0C\u76F4\u5230\u4F60\u7684\u6BCF\u4E2A\u724C\u5806\u90FD\u662F\u540C\u4E00\u79CD\u8863\u7269"],
      "Muestra": ["Reveal", "\u4EAE\u51FA"],
      "Muestra una pila cuando creas que est\xE1 completa. Todos lo ven": ["Reveal a pile when you think it is complete. Everyone sees it", "\u89C9\u5F97\u724C\u5806\u51D1\u9F50\u4E86\u5C31\u4EAE\u51FA\u6765\uFF0C\u6240\u6709\u4EBA\u90FD\u80FD\u770B\u5230"],
      "Verificamos": ["We check", "\u68C0\u67E5"],
      "Si fallas, revisa tus pilas. Toca para volver": ["If the check fails, look at your piles again. Tap to go back", "\u68C0\u67E5\u672A\u901A\u8FC7\u5C31\u518D\u770B\u770B\u4F60\u7684\u724C\u5806\u3002\u70B9\u4E00\u4E0B\u8FD4\u56DE"],
      "Lleva tu Elo a tu cuenta": ["Take your Elo to your account", "\u628A\u4F60\u7684 Elo \u5E26\u5230\u8D26\u53F7\u91CC"],
      "Mi burla": ["My taunt", "\u6211\u7684\u5632\u8BBD"],
      "Pegar c\xF3digo": ["Paste code", "\u7C98\u8D34\u4EE3\u7801"],
      "El de tu cuenta de Session Manager": ["The one from your Session Manager account", "\u4F60 Session Manager \u8D26\u53F7\u91CC\u7684\u4EE3\u7801"],
      "Desvincular": ["Unlink", "\u53D6\u6D88\u5173\u8054"],
      "Vuelves al Elo de este navegador": ["Back to this browser's Elo", "\u56DE\u5230\u8FD9\u4E2A\u6D4F\u89C8\u5668\u7684 Elo"],
      "Pasarlo": ["Move it", "\u8F6C\u8FC7\u53BB"],
      "Tu Elo de aqu\xED pasa a la cuenta": ["Your Elo here moves to the account", "\u628A\u8FD9\u91CC\u7684 Elo \u8F6C\u5230\u8D26\u53F7"],
      "No, borrarlo": ["No, delete it", "\u4E0D\uFF0C\u5220\u6389"],
      "Empiezas con el de la cuenta": ["You start with the account's", "\u4F7F\u7528\u8D26\u53F7\u91CC\u7684 Elo"],
      "Copiar enlace": ["Copy link", "\u590D\u5236\u94FE\u63A5"],
      "Para mandarlo por chat": ["To send it in a chat", "\u53D1\u5230\u804A\u5929\u91CC"],
      "Cerrar c\xE1mara": ["Close camera", "\u5173\u95ED\u6444\u50CF\u5934"],
      "Apunta al QR de otra pantalla": ["Point at the QR on another screen", "\u5BF9\u51C6\u53E6\u4E00\u5757\u5C4F\u5E55\u4E0A\u7684\u4E8C\u7EF4\u7801"],
      "Jugar la pr\xF3xima": ["Play the next one", "\u4E0B\u4E00\u5C40\u4E0A\u573A"],
      "Te sientas al acabar": ["You sit down when it ends", "\u8FD9\u5C40\u7ED3\u675F\u540E\u5165\u5EA7"],
      "Salir": ["Leave", "\u79BB\u5F00"],
      "Dejar de mirar": ["Stop watching", "\u505C\u6B62\u89C2\u6218"],
      "VS bots": ["VS bots", "\u5BF9\u6218\u673A\u5668\u4EBA"],
      "Tres bots se sientan ya": ["Three bots sit down now", "\u9A6C\u4E0A\u5750\u4E0B\u4E09\u4E2A\u673A\u5668\u4EBA"],
      "Seguir buscando": ["Keep searching", "\u7EE7\u7EED\u5BFB\u627E"],
      "Esperar a personas": ["Wait for people", "\u7B49\u771F\u4EBA\u73A9\u5BB6"],
      "Honk de payaso": ["Clown honk", "\u5C0F\u4E11\u5587\u53ED"],
      "Tromb\xF3n triste": ["Sad trombone", "\u60B2\u4F24\u957F\u53F7"],
      "Boing": ["Boing", "\u5623"],
      "Risa cartoon": ["Cartoon laugh", "\u5361\u901A\u7B11\u58F0"],
      "Pedorreta": ["Raspberry", "\u5657\u5657\u58F0"],
      "Sirena c\xF3mica": ["Silly siren", "\u641E\u7B11\u8B66\u7B1B"],
      "Silbido que cae": ["Falling whistle", "\u4E0B\u5760\u53E3\u54E8"],
      "Campanita burlona": ["Mocking bell", "\u5632\u8BBD\u5C0F\u94C3\u94DB"],
      "Gallo": ["Rooster", "\u516C\u9E21"],
      "Pato": ["Duck", "\u9E2D\u5B50"],
      "Ninguna": ["None", "\u65E0"],
      "Suena a quien llegue tarde a tu carta": ["Plays for whoever is late to your card", "\u8C01\u665A\u4E00\u6B65\u62A2\u4F60\u7684\u724C\uFF0C\u5C31\u5BF9\u8C01\u54CD\u8D77"],
      "Abrir sala": ["Open room", "\u5F00\u623F\u95F4"],
      "Con los jugadores y la privacidad de arriba": ["With the players and privacy above", "\u6309\u4E0A\u9762\u7684\u4EBA\u6570\u548C\u9690\u79C1\u8BBE\u7F6E"],
      "En espera \xB7 Entrar\xE1s a jugar": ["Waiting \xB7 You will play", "\u7B49\u5F85\u4E2D \xB7 \u5C06\u4EE5\u73A9\u5BB6\u8EAB\u4EFD\u52A0\u5165"],
      "Jugando \xB7 Entrar\xE1s a mirar": ["Playing \xB7 You will watch", "\u6E38\u620F\u4E2D \xB7 \u5C06\u4EE5\u89C2\u6218\u8005\u8EAB\u4EFD\u52A0\u5165"],
      "Estoy listo": ["I'm ready", "\u6211\u51C6\u5907\u597D\u4E86"],
      "Cuando est\xE9n todos, se reparte": ["When everyone is in, cards are dealt", "\u4EBA\u9F50\u4E86\u5C31\u53D1\u724C"],
      "Rellenar con bots": ["Fill with bots", "\u7528\u673A\u5668\u4EBA\u8865\u4F4D"],
      "Mirar": ["Watch", "\u89C2\u6218"],
      "Pasar a espectador": ["Become a spectator", "\u6539\u4E3A\u89C2\u6218"],
      "A\xF1adir bot": ["Add bot", "\u6DFB\u52A0\u673A\u5668\u4EBA"],
      "Con la dificultad de arriba": ["With the difficulty above", "\u6309\u4E0A\u9762\u7684\u96BE\u5EA6"],
      "Llenar": ["Fill", "\u8865\u6EE1"],
      "Todos los huecos": ["Every empty seat", "\u6240\u6709\u7A7A\u4F4D"],
      "Quitar bot": ["Remove bot", "\u79FB\u9664\u673A\u5668\u4EBA"],
      "El \xFAltimo que entr\xF3": ["The last one in", "\u6700\u540E\u52A0\u5165\u7684\u90A3\u4E2A"],
      "Echar a {n}": ["Kick {n}", "\u8E22\u51FA {n}"],
      "Votan todos: si alguien dice no, se queda": ["Everyone votes: one no and they stay", "\u6240\u6709\u4EBA\u6295\u7968\uFF1A\u53EA\u8981\u6709\u4EBA\u53CD\u5BF9\u5C31\u7559\u4E0B"],
      "Mejor no": ["Never mind", "\u7B97\u4E86"],
      "Volver a la sala": ["Back to the room", "\u56DE\u5230\u623F\u95F4"],
      // Rótulos de nivel
      "Juega": ["Play", "\u5F00\u73A9"],
      "Tu mesa": ["Your table", "\u4F60\u7684\u684C\u5B50"],
      "Elige mesa": ["Pick a table", "\u9009\u684C\u5B50"],
      "Escanea": ["Scan", "\u626B\u7801"],
      "Mirando": ["Watching", "\u89C2\u6218\u4E2D"],
      "Esperando": ["Waiting", "\u7B49\u5F85\u4E2D"],
      "Rivales": ["Rivals", "\u5BF9\u624B"],
      "Invita": ["Invite", "\u9080\u8BF7"],
      "\xBFEchar?": ["Kick?", "\u8E22\u51FA\uFF1F"],
      "\xBFBots?": ["Bots?", "\u673A\u5668\u4EBA\uFF1F"],
      "\xA1Ya!": ["Go!", "\u5F00\u59CB\uFF01"],
      "T\xFA": ["You", "\u4F60"],
      "Vincular": ["Link", "\u5173\u8054"],
      "Tu Elo": ["Your Elo", "\u4F60\u7684 Elo"],
      "Burla": ["Taunt", "\u5632\u8BBD"],
      "Aprende": ["Learn", "\u5B66\u73A9\u6CD5"],
      "\xA1A jugar!": ["Let's play!", "\u5F00\u5C40\uFF01"],
      // Cabeceras
      "Perfil": ["Profile", "\u4E2A\u4EBA\u8D44\u6599"],
      "C\xF3mo jugar": ["How to play", "\u73A9\u6CD5"],
      "Escanear QR": ["Scan QR", "\u626B\u63CF\u4E8C\u7EF4\u7801"],
      "Invitar": ["Invite", "\u9080\u8BF7"],
      "\xBFPasar tu Elo a la cuenta?": ["Move your Elo to the account?", "\u628A\u4F60\u7684 Elo \u8F6C\u5230\u8D26\u53F7\u5417\uFF1F"],
      "Echar": ["Kick", "\u8E22\u51FA"],
      // Piezas
      "? Reglas": ["? Rules", "? \u89C4\u5219"],
      "Jugadores": ["Players", "\u73A9\u5BB6"],
      "P\xFAblica": ["Public", "\u516C\u5F00"],
      "Privada": ["Private", "\u79C1\u5BC6"],
      "C\xF3digo \xB7 entra al escribir la 6.\xAA letra": ["Code \xB7 joins at the 6th letter", "\u4EE3\u7801 \xB7 \u8F93\u5165\u7B2C 6 \u4F4D\u5373\u8FDB\u5165"],
      "Jugando \xB7 1 mirando \xB7 Entrar\xE1s a mirar": ["Playing \xB7 1 watching \xB7 You will watch", "\u5BF9\u5C40\u4E2D \xB7 1 \u4EBA\u89C2\u6218 \xB7 \u4F60\u5C06\u89C2\u6218"],
      "Chat de la sala": ["Room chat", "\u623F\u95F4\u804A\u5929"],
      "Escribe aqu\xED :D": ["Type here :D", "\u5728\u8FD9\u91CC\u8F93\u5165 :D"],
      "F\xE1cil": ["Easy", "\u7B80\u5355"],
      "Normal": ["Normal", "\u666E\u901A"],
      "Dif\xEDcil": ["Hard", "\u56F0\u96BE"],
      // Avisos y estado
      "Entraste en {c}": ["You joined {c}", "\u4F60\u52A0\u5165\u4E86 {c}"],
      "{n} entr\xF3": ["{n} joined", "{n} \u52A0\u5165\u4E86"],
      "{n} sali\xF3": ["{n} left", "{n} \u79BB\u5F00\u4E86"],
      "Bot {i} ({d}) se sent\xF3": ["Bot {i} ({d}) sat down", "\u673A\u5668\u4EBA {i}\uFF08{d}\uFF09\u5750\u4E0B\u4E86"],
      "{n}/{max} en la sala \xB7 {r} de {n} listos \xB7 {pool}": ["{n}/{max} in the room \xB7 {r} of {n} ready \xB7 {pool}", "\u623F\u95F4\u91CC {n}/{max} \xB7 {r}/{n} \u5DF2\u51C6\u5907 \xB7 {pool}"],
      "For fun \xB7 con bots": ["For fun \xB7 with bots", "For fun \xB7 \u6709\u673A\u5668\u4EBA"],
      "For glory \xB7 solo personas": ["For glory \xB7 people only", "For glory \xB7 \u53EA\u6709\u771F\u4EBA"],
      "No hay oponentes dignos...": ["No worthy opponents...", "\u6CA1\u6709\u50CF\u6837\u7684\u5BF9\u624B\u2026\u2026"],
      "Desm\xE1rcate (\u2193) para cancelar": ["Unready (\u2193) to cancel", "\u53D6\u6D88\u51C6\u5907\uFF08\u2193\uFF09\u5373\u53EF\u53D6\u6D88\u5012\u8BA1\u65F6"],
      "Cuenta atr\xE1s cancelada \xB7 {m}": ["Countdown cancelled \xB7 {m}", "\u5012\u8BA1\u65F6\u5DF2\u53D6\u6D88 \xB7 {m}"],
      "Alguien ya no est\xE1 listo": ["Someone is no longer ready", "\u6709\u4EBA\u53D6\u6D88\u4E86\u51C6\u5907"],
      "Est\xE1s mirando \xB7 {c}": ["You are watching \xB7 {c}", "\u4F60\u6B63\u5728\u89C2\u6218 \xB7 {c}"],
      "Est\xE1s mirando": ["You are watching", "\u4F60\u6B63\u5728\u89C2\u6218"],
      "No se pudo cargar el generador de QR": ["Could not load the QR generator", "\u65E0\u6CD5\u52A0\u8F7D\u4E8C\u7EF4\u7801\u751F\u6210\u5668"],
      "Este navegador no lee QR: escribe el c\xF3digo": ["This browser can't read QR codes: type the code", "\u8FD9\u4E2A\u6D4F\u89C8\u5668\u8BFB\u4E0D\u4E86\u4E8C\u7EF4\u7801\uFF1A\u8BF7\u624B\u52A8\u8F93\u5165\u4EE3\u7801"],
      "No se pudo abrir la c\xE1mara. Escribe el c\xF3digo a mano.": ["Could not open the camera. Type the code by hand.", "\u65E0\u6CD5\u6253\u5F00\u6444\u50CF\u5934\uFF0C\u8BF7\u624B\u52A8\u8F93\u5165\u4EE3\u7801\u3002"],
      "Se perdi\xF3 la conexi\xF3n. Reintentando\u2026 (intento {n})": ["Connection lost. Retrying\u2026 (attempt {n})", "\u8FDE\u63A5\u5DF2\u65AD\u5F00\uFF0C\u6B63\u5728\u91CD\u8BD5\u2026\u2026\uFF08\u7B2C {n} \u6B21\uFF09"],
      "Conectado al servidor": ["Connected to the server", "\u5DF2\u8FDE\u63A5\u670D\u52A1\u5668"],
      "Conectando...": ["Connecting...", "\u8FDE\u63A5\u4E2D\u2026\u2026"],
      "No se anuncia: pasa el c\xF3digo o el QR": ["Not listed: share the code or the QR", "\u4E0D\u516C\u5F00\uFF1A\u8BF7\u5206\u4EAB\u4EE3\u7801\u6216\u4E8C\u7EF4\u7801"],
      "Cualquiera puede entrar": ["Anyone can join", "\u4EFB\u4F55\u4EBA\u90FD\u80FD\u52A0\u5165"],
      "Tu burla: {n}": ["Your taunt: {n}", "\u4F60\u7684\u5632\u8BBD\uFF1A{n}"],
      "Sin burla": ["No taunt", "\u6CA1\u6709\u5632\u8BBD"],
      "Pega aqu\xED tu c\xF3digo": ["Paste your code here", "\u5728\u8FD9\u91CC\u7C98\u8D34\u4EE3\u7801"],
      "\u2713 Vinculado": ["\u2713 Linked", "\u2713 \u5DF2\u5173\u8054"],
      "Elo de este navegador": ["This browser's Elo", "\u8FD9\u4E2A\u6D4F\u89C8\u5668\u7684 Elo"],
      "Elo vinculado a tu cuenta": ["Elo linked to your account", "Elo \u5DF2\u5173\u8054\u5230\u4F60\u7684\u8D26\u53F7"],
      "Empiezas con el Elo de la cuenta": ["You start with the account's Elo", "\u4F7F\u7528\u8D26\u53F7\u91CC\u7684 Elo"],
      "\u2713 Jugar\xE1s la pr\xF3xima": ["\u2713 You play the next one", "\u2713 \u4E0B\u4E00\u5C40\u4E0A\u573A"],
      "Te sentar\xE1s al acabar esta": ["You will sit down when this one ends", "\u8FD9\u5C40\u7ED3\u675F\u540E\u4F60\u4F1A\u5165\u5EA7"],
      "No hay bots": ["No bots", "\u6CA1\u6709\u673A\u5668\u4EBA"],
      "\xBFEchar a {n}? \xB7 {y} de {t} a favor": ["Kick {n}? \xB7 {y} of {t} in favor", "\u8E22\u51FA {n}\uFF1F\xB7 {y}/{t} \u8D5E\u6210"],
      "{n} fue expulsado": ["{n} was kicked out", "{n} \u88AB\u8E22\u51FA\u4E86\u623F\u95F4"],
      "La sala est\xE1 llena": ["The room is full", "\u623F\u95F4\u5DF2\u6EE1"],
      "Jugar": ["Play", "\u4E0A\u573A"],
      "Volver a la mesa": ["Back to the table", "\u56DE\u5230\u724C\u684C"],
      "Miras la partida": ["You watch the game", "\u4F60\u5728\u89C2\u6218"],
      "Juegas": ["You play", "\u4F60\u4E0A\u573A"],
      "{c} \xB7 enlace copiado": ["{c} \xB7 link copied", "{c} \xB7 \u94FE\u63A5\u5DF2\u590D\u5236"],
      "Listo \u2713": ["Ready \u2713", "\u5DF2\u51C6\u5907 \u2713"],
      "Todos listos \xB7 \xA1se reparte!": ["All ready \xB7 dealing!", "\u5168\u5458\u51C6\u5907 \xB7 \u53D1\u724C\uFF01"],
      "T\xDA": ["YOU", "\u4F60"],
      "Conectado": ["Connected", "\u5DF2\u8FDE\u63A5"],
      "pega tu c\xF3digo": ["paste your code", "\u7C98\u8D34\u4EE3\u7801"],
      "\u2713 VINCULADO": ["\u2713 LINKED", "\u2713 \u5DF2\u5173\u8054"],
      "toca o \u2190 \u2192 elegir \xB7 toca de nuevo o \u2191 al centro \xB7 \u2193 volver": ["tap or \u2190 \u2192 choose \xB7 tap again or \u2191 to the center \xB7 \u2193 back", "\u70B9\u51FB\u6216 \u2190 \u2192 \u9009\u62E9 \xB7 \u518D\u70B9\u6216 \u2191 \u6253\u5230\u4E2D\u592E \xB7 \u2193 \u8FD4\u56DE"],
      // Rangos (rank.* de i18n.js)
      "Hierro oxidado": ["Rusty iron", "\u751F\u9508\u94C1"],
      "Bronce": ["Bronze", "\u9752\u94DC"],
      "Plata": ["Silver", "\u767D\u94F6"],
      "Oro": ["Gold", "\u9EC4\u91D1"],
      "Platino": ["Platinum", "\u94C2\u91D1"],
      "Diamante": ["Diamond", "\u94BB\u77F3"],
      "M\xE1ster": ["Master", "\u5927\u5E08"],
      "Gran m\xE1ster": ["Grandmaster", "\u5B97\u5E08"],
      "Top 3 global": ["Global top 3", "\u5168\u7403\u524D\u4E09"],
      "\u25B2 Asciendes": ["\u25B2 Rank up", "\u25B2 \u5347\u6BB5"],
      "\u25BC Desciendes": ["\u25BC Rank down", "\u25BC \u964D\u6BB5"],
      "Cart\xF3n": ["Cardboard", "\u7EB8\u677F"],
      "Juguete": ["Toy", "\u73A9\u5177"],
      "Lat\xF3n": ["Brass", "\u9EC4\u94DC"],
      "Caucho": ["Rubber", "\u6A61\u80F6"],
      "Pl\xE1stico": ["Plastic", "\u5851\u6599"],
      "Gominola": ["Gummy", "\u8F6F\u7CD6"],
      "Dulce": ["Candy", "\u7CD6\u679C"],
      "Confeti": ["Confetti", "\u5F69\u7EB8"],
      "Payaso": ["Clown", "\u5C0F\u4E11"],
      "Elige un nombre primero": ["Pick a name first", "\u5148\u8D77\u4E2A\u540D\u5B57"],
      "Buscando mesa\u2026": ["Looking for a table\u2026", "\u6B63\u5728\u627E\u684C\u5B50\u2026\u2026"],
      "Abriendo sala\u2026": ["Opening the room\u2026", "\u6B63\u5728\u5F00\u623F\u95F4\u2026\u2026"],
      "Entrando\u2026": ["Joining\u2026", "\u6B63\u5728\u52A0\u5165\u2026\u2026"],
      "No se pudo cargar el QR": ["Could not load the QR", "\u65E0\u6CD5\u52A0\u8F7D\u4E8C\u7EF4\u7801"],
      "C\xF3digo no v\xE1lido": ["Invalid code", "\u4EE3\u7801\u65E0\u6548"],
      "Salir de la cola": ["Leave the queue", "\u9000\u51FA\u6392\u961F"],
      "Quiero jugar": ["I want to play", "\u6211\u8981\u4E0A\u573A"],
      "Te sentar\xE1s cuando haya hueco": ["You will sit when a seat frees up", "\u6709\u7A7A\u4F4D\u5C31\u5165\u5EA7"],
      "Pides sitio en la mesa": ["Ask for a seat at the table", "\u7533\u8BF7\u5165\u5EA7"],
      "S\xED, fuera {n}": ["Yes, kick {n}", "\u5BF9\uFF0C\u8E22\u51FA {n}"],
      "{y} de {t} a favor": ["{y} of {t} in favor", "{y}/{t} \u8D5E\u6210"],
      "Que se quede": ["Let them stay", "\u8BA9\u4ED6\u7559\u4E0B"],
      "Con un no, se queda": ["One no and they stay", "\u6709\u4EBA\u53CD\u5BF9\u5C31\u7559\u4E0B"],
      "\xBFTe echan?": ["Kicking you?", "\u8981\u8E22\u4F60\uFF1F"],
      "Votando\u2026": ["Voting\u2026", "\u6295\u7968\u4E2D\u2026\u2026"],
      "\xBFEchar a {n}?": ["Kick {n}?", "\u8E22\u51FA {n}\uFF1F"],
      "No hay salas": ["No rooms", "\u6CA1\u6709\u623F\u95F4"],
      "Crea una o escribe un c\xF3digo": ["Create one or type a code", "\u521B\u5EFA\u4E00\u4E2A\u6216\u8F93\u5165\u4EE3\u7801"],
      "En espera": ["Waiting", "\u7B49\u5F85\u4E2D"],
      "Empezando": ["Starting", "\u5373\u5C06\u5F00\u59CB"],
      "Jugando": ["Playing", "\u6E38\u620F\u4E2D"],
      "{n} mirando": ["{n} watching", "{n} \u4EBA\u89C2\u6218"],
      "Entrar\xE1s a mirar": ["You will watch", "\u4F60\u5C06\u89C2\u6218"],
      "Entrar\xE1s a jugar": ["You will play", "\u4F60\u5C06\u4E0A\u573A"],
      "Sala": ["Room", "\u623F\u95F4"],
      "C\xF3digo": ["Code", "\u4EE3\u7801"],
      "Enlace copiado": ["Link copied", "\u94FE\u63A5\u5DF2\u590D\u5236"]
    };
    const LENGUA = { es: -1, en: 0, zh: 1 }[window.PilesI18n?.lang] ?? -1;
    function T(s, v = {}) {
      const r = LENGUA < 0 ? s : DIC[s]?.[LENGUA] ?? s;
      return String(r).replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");
    }
    const IDIOMAS = { ES: "es", EN: "en", "\u4E2D\u6587": "zh" };
    const PZ = ["p1", "p2", "p3"].map((id) => document.getElementById(id));
    const DIFS = { F\u00E1cil: "easy", Normal: "normal", Dif\u00EDcil: "hard" };
    function caja(el, x, y, w, h, html, clave) {
      el.classList.remove("oculta");
      Object.assign(el.style, { left: x + "px", top: y + "px", width: w + "px", height: h + "px" });
      if (el.dataset.k !== clave) {
        el.dataset.k = clave;
        el.innerHTML = `<div class="dentro">${html}</div>`;
        return true;
      }
      return false;
    }
    function plegar(el) {
      el.classList.add("oculta");
      el.dataset.k = "";
    }
    const seg = (act, valores, actual) => `<div class="fila segs" style="--n:${valores.length};--i:${Math.max(0, valores.indexOf(actual))}">` + valores.map((v) => `<button class="seg${v === actual ? " si" : ""}" data-act="${act}" data-v="${v}">${T(v)}</button>`).join("") + '<i class="resalte"></i></div>';
    const tambor = (act, min, max, v) => `<span class="tambor" data-tambor="${act}" data-min="${min}" data-max="${max}" style="--v:${v};--min:${min}" role="spinbutton" aria-valuenow="${v}" aria-valuemin="${min}" aria-valuemax="${max}"><span class="rodillo">` + Array.from({ length: max - min + 1 }, (_, k) => `<span${k + min === v ? ' class="ya"' : ""}>${k + min}</span>`).join("") + "</span></span>";
    function girarTambor(el, v) {
      const min = +el.dataset.min, max = +el.dataset.max;
      v = Math.max(min, Math.min(max, v));
      el.style.setProperty("--v", v);
      el.setAttribute("aria-valuenow", v);
      el.querySelectorAll(".rodillo span").forEach((s, k) => s.classList.toggle("ya", k + min === v));
      return v;
    }
    const AL_GIRAR = { jug: (v) => {
      if (v !== crearJug) vibrar(6);
      crearJug = v;
    } };
    let arrastre = null;
    document.addEventListener("pointerdown", (e) => {
      const t0 = e.target.closest("#escenario .tambor");
      if (!t0) return;
      arrastre = { t: t0, y: e.clientY, v: +t0.style.getPropertyValue("--v") };
      t0.setPointerCapture(e.pointerId);
    });
    document.addEventListener("pointermove", (e) => {
      if (!arrastre) return;
      const { t: t0, y, v } = arrastre;
      AL_GIRAR[t0.dataset.tambor]?.(girarTambor(t0, v + Math.round((y - e.clientY) / 24)));
    });
    document.addEventListener("pointerup", () => {
      arrastre = null;
    });
    document.addEventListener("wheel", (e) => {
      const t0 = e.target.closest("#escenario .tambor");
      if (!t0) return;
      e.preventDefault();
      AL_GIRAR[t0.dataset.tambor]?.(girarTambor(t0, +t0.style.getPropertyValue("--v") + (e.deltaY < 0 ? 1 : -1)));
    }, { passive: false });
    function formas(p = pantalla) {
      const R = rejilla(), w = R.w, an = ancho(), enSala = EN_SALA.has(p) && p !== "cuenta";
      const col = Math.min(320, w - 2 * M), der = w - M - col;
      const usadas = /* @__PURE__ */ new Set();
      const pon3 = (i, ...a) => {
        usadas.add(i);
        return caja(PZ[i], ...a);
      };
      if (p === "inicio") {
        pon3(0, M + R.cabw + SEP, FILA2, 44, 40, `<button class="grande" data-act="perfil" aria-label="${T("Perfil")}">${ico("persona")}</button>`, "perfil");
        pon3(1, w - M - 110, FILA2, 110, 40, `<button class="grande" data-act="ayuda" style="font-size:.8rem">${T("? Reglas")}</button>`, "ayuda");
      }
      if (p === "crear") {
        pon3(0, M, ZONA, col, 126, `<span class="rotulo">${T("Jugadores")}</span><div class="fila"><button data-act="menos" aria-label="\u2212">${ico("menos")}</button>${tambor("jug", 2, 8, crearJug)}<button data-act="mas" aria-label="+">${ico("mas")}</button></div>`, "jug");
        pon3(1, M, ZONA + 126 + SEP, col, 44, seg("privacidad", ["P\xFAblica", "Privada"], lobbyIsPublic ? "P\xFAblica" : "Privada"), "priv");
      }
      if (p === "unirse") {
        pon3(0, M, ZONA, col, 72, `<span class="rotulo">${T("C\xF3digo")}</span><button class="grande" data-act="codigo"><span class="num">______</span></button>`, "cod");
        pon3(1, M, ZONA + 72 + SEP, col, 44, `<button class="grande" data-act="escanear">${ico("camara")} ${T("Escanear QR")}</button>`, "esc");
      }
      if (enSala && est.currentLobbyId && !(p === "qr" && !an)) {
        const bajoJug = ZONA + filasSala() * 107 + SEP, fondo = R.estadoAbajo, PELEA = 120;
        const ch = an ? Math.max(88, Math.min(420, fondo - ZONA)) : Math.max(88, Math.min(300, fondo - bajoJug - PELEA - (p === "bots" ? 52 : 0)));
        const y = an ? ZONA : fondo - ch;
        if (p === "bots") pon3(2, M, an ? ZONA : y - 44 - SEP, col, 44, seg("dif", ["F\xE1cil", "Normal", "Dif\xEDcil"], Object.keys(DIFS).find((k) => DIFS[k] === botDifficulty) ?? "Normal"), "dif");
        const finHueco = an ? fondo : (p === "bots" ? y - 44 - SEP : y) - SEP;
        const cyPelea = (bajoJug + finHueco) / 2 / R.h;
        escena.fijarCy("sala", cyPelea);
        escena.fijarCy("bots", cyPelea);
        const cx = an ? der : M, cw = an ? col : w - 2 * M;
        if (pon3(
          0,
          cx,
          y,
          cw,
          ch,
          `<span class="rotulo">${T("Chat de la sala")}</span><div class="log" aria-live="polite"></div><button class="escribe" data-act="chat">${T("Escribe aqu\xED :D")}</button>`,
          "chat"
        )) pintarChat();
        const qw = an ? col : Math.min(162, w - 2 * M - R.cabw - SEP), pool = ultimaSala?.pool === "fun" ? "fun" : "glory";
        if (pon3(1, w - M - qw, FILA2, qw, 40, `<button class="grande" data-act="qr" aria-label="QR"><span class="pool" data-pool="${pool}" title="${T(pool === "fun" ? "For fun \xB7 con bots" : "For glory \xB7 solo personas")}">${pool === "fun" ? "FUN" : "GLORY"}</span><span class="cod"></span>${ico("qr")}</button>`, `codsala:${est.currentLobbyId}:${pool}`))
          PZ[1].querySelector(".cod").textContent = est.currentLobbyId;
      }
      if (p === "perfil") {
        const ALTO_ELO = 272;
        const nuevo = pon3(0, M, ZONA, col, ALTO_ELO, `<span class="rotulo">${T("Tu Elo")}</span><div class="diales"><div data-dial="fun"></div><div data-dial="glory"></div></div>`, "diales");
        if (nuevo && typeof agDial === "function") {
          agDial(PZ[0].querySelector('[data-dial="fun"]'), { from: miElo.fun, to: miElo.fun, skin: "fun", top3Before: !!miElo.top3.fun });
          agDial(PZ[0].querySelector('[data-dial="glory"]'), { from: miElo.glory, to: miElo.glory, skin: "glory", top3Before: !!miElo.top3.glory });
        }
        const actual = Object.keys(IDIOMAS).find((k) => IDIOMAS[k] === window.PilesI18n?.lang) ?? "ES";
        pon3(1, M, ZONA + ALTO_ELO + SEP, col, 44, seg("idioma", Object.keys(IDIOMAS), actual), "idioma");
      }
      PZ.forEach((el, i) => {
        if (!usadas.has(i)) plegar(el);
      });
    }
    function actuar(act, b) {
      const marca = () => {
        const fila = b.parentElement, segs = [...fila.querySelectorAll(".seg")];
        segs.forEach((s) => s.classList.toggle("si", s === b));
        fila.style.setProperty("--i", segs.indexOf(b));
      };
      vibrar(8);
      if (act === "perfil") irA("perfil", "Perfil");
      else if (act === "ayuda") irA("tutorial", "C\xF3mo jugar");
      else if (act === "menos" || act === "mas") AL_GIRAR.jug(girarTambor(b.parentElement.querySelector(".tambor"), crearJug + (act === "mas" ? 1 : -1)));
      else if (act === "privacidad") {
        const pub = b.dataset.v === "P\xFAblica";
        conLobby(() => setVisibility(pub));
        marca();
      } else if (act === "dif") {
        setBotDifficulty(DIFS[b.dataset.v] ?? "normal");
        marca();
      } else if (act === "idioma") {
        marca();
        setTimeout(() => window.PilesI18n?.setLang(IDIOMAS[b.dataset.v]), 300);
      } else if (act === "escanear") irA("visor", "Escanear QR");
      else if (act === "qr" && est.currentLobbyId && pantalla !== "qr") irA("qr", "Invitar");
      else if (act === "codigo") pedir("ABC123", 6, (v) => entrarCodigo(v), (txt) => {
        b.querySelector(".num").textContent = txt.padEnd(6, "_");
        if (txt.length === 6) {
          cerrarCampo();
          entrarCodigo(txt);
        }
      });
      else if (act === "chat" && est.currentLobbyId) pedir(T("Escribe aqu\xED :D"), 300, (txt) => sendChat(txt));
    }
    document.addEventListener("click", (e) => {
      const b = e.target.closest("#escenario .pieza [data-act]");
      if (b) actuar(b.dataset.act, b);
    });
    function entrarCodigo(cod) {
      const code = extractLobbyCode(cod);
      if (!code) {
        sacude(PZ[0]);
        return;
      }
      joinLobby(code);
    }
    const chatLog = [];
    function decir(quien, txt, sistema = false, tuyo = false) {
      chatLog.push({ quien, txt, sistema, tuyo });
      if (chatLog.length > 60) chatLog.shift();
      pintarChat();
    }
    function pintarChat() {
      const log = document.querySelector("#escenario .pieza .log");
      if (!log) return;
      log.textContent = "";
      for (const m of chatLog.slice(-14)) {
        const d = document.createElement("div");
        if (m.sistema) {
          d.className = "sis";
          d.textContent = m.txt;
        } else {
          const b = document.createElement("b");
          b.textContent = m.quien + " ";
          if (m.tuyo) b.className = "tuyo";
          d.append(b, m.txt);
        }
        log.append(d);
      }
    }
    const dialesMesa = [...document.querySelectorAll(".dialMesa")], claveDial = ["", "", "", ""];
    const OCUPA = "#escenario .pieza:not(.oculta), #cartas > .carta, #estado, #titulo, #nombre, #campo.abierto";
    function chocaDial(b, ocupado) {
      if (b.left < SEP || b.top < SEP || b.right > W() - SEP || b.bottom > H() - SEP) return true;
      return ocupado.some((o) => b.left < o.right + SEP && b.right > o.left - SEP && b.top < o.bottom + SEP && b.bottom > o.top - SEP);
    }
    function moverDiales() {
      requestAnimationFrame(moverDiales);
      if (document.body.classList.contains("en-partida") || typeof agDial !== "function") return;
      const ocupado = [...document.querySelectorAll(OCUPA)].filter((e) => e.offsetParent !== null && +getComputedStyle(e).opacity > 0.3).map((e) => e.getBoundingClientRect());
      const tam = dialesMesa.map((el) => [el.offsetWidth, el.offsetHeight]);
      X.anclas.forEach((a, p) => {
        const el = dialesMesa[p], e = X.elo?.[p];
        const ok = a.ok && e;
        if (!ok) {
          el.style.opacity = 0;
          return;
        }
        const quien = X.nombres?.[p] ?? `top${p}`, k = `${quien}|${e.v}|${e.pool}|${!!e.top3}`;
        if (claveDial[p] !== k) {
          const [antesQuien, antesV] = claveDial[p].split("|");
          const antes = antesQuien === quien ? Number(antesV) : e.v;
          claveDial[p] = k;
          agDial(el, { from: antes, to: e.v, skin: e.pool, top3Before: !!e.top3 });
        }
        const s = a.s * (W() < 760 ? 0.75 : 1);
        el.style.transform = `translate(${a.x}px, ${a.y}px) translate(-50%, -100%) scale(${s})`;
        const [w, h] = tam[p];
        el.style.opacity = chocaDial({ left: a.x - w * s / 2, right: a.x + w * s / 2, top: a.y - h * s, bottom: a.y }, ocupado) ? 0 : 1;
        el.classList.toggle("tuyo", p === X.tu);
      });
    }
    requestAnimationFrame(moverDiales);
    function accion(a, c, o = {}) {
      if (a === "nada") {
        salta(c);
        return;
      }
      if (a === "volver") {
        volver();
        return;
      }
      if (a === "rapida") {
        seVa(c);
        quickMatch();
        return;
      }
      if (a === "abrir") {
        seVa(c);
        createLobby(crearJug);
        return;
      }
      if (a === "entrarSala") {
        seVa(c);
        joinLobby(o.id, o.mirar);
        return;
      }
      if (a === "burla") {
        try {
          localStorage.setItem("piles.taunt", o.id);
        } catch {
        }
        salta(c);
        setTimeout(volver, 380);
        return;
      }
      if (a === "smCodigo") {
        pedir(T("Pega aqu\xED tu c\xF3digo"), 12, (v) => {
          setSmCode(v);
          X.placa = { txt: smCodeGuardado(), ok: true };
          vibrar(30);
        }, (txt) => {
          X.placa = { txt, ok: false };
        });
        return;
      }
      if (a === "smBorrar") {
        clearSmCode();
        X.placa = { txt: "", ok: false };
        salta(c);
        return;
      }
      if (!est.currentLobbyId) return;
      if (a === "listo") {
        toggleReady();
        vibrar(20);
        menuSala();
        refrescarMano("sala");
        return;
      }
      if (a === "rol") {
        cambiarRol();
        seVa(c);
        return;
      }
      if (a === "ofertaBots") {
        acceptBotsOffer();
        cerrarOferta();
        return;
      }
      if (a === "seguir") {
        cancelQuickMatchOffer(true);
        cerrarOferta();
        return;
      }
      const m = ultimaSala, n = m?.players.length ?? 0;
      if (a === "bot") {
        if (n < m.max_players) {
          addBot();
          pideBots(c, n + 1);
        }
        return;
      }
      if (a === "llenar") {
        for (let k = n; k < m.max_players; k++) addBot();
        if (n < m.max_players) pideBots(c, m.max_players);
        return;
      }
      if (a === "quitarBot") {
        const bot = [...m?.players ?? []].reverse().find((p) => p.is_bot);
        if (bot) {
          removeBot(bot.id);
          pideBots(c, n - 1);
        } else aviso(T("No hay bots"));
        return;
      }
      if (a === "echar") {
        send({ type: "start_kick", target: o.id });
        salta(c);
        deshacer();
        return;
      }
      if (a === "votoSi" || a === "votoNo") {
        send({ type: "kick_vote", yes: a === "votoSi" });
        seVa(c);
        return;
      }
      if (a === "copiar") {
        const link = joinLinkFor(est.currentLobbyId);
        navigator.clipboard?.writeText(link).then(() => aviso(T("Enlace copiado")), () => aviso(link, 4e3));
        salta(c);
        return;
      }
    }
    const RECORRIDO = 190;
    let ini = null;
    const sinTransicion = (els) => els.forEach((c) => {
      if (c) c.style.transition = "none";
    });
    function arrastrarV(dy) {
      const sube = dy < 0, p = Math.min(1, Math.abs(dy) / RECORRIDO);
      const c = mano[sel], o = MENUS[pantalla]?.[sel], h = cabeceras.at(-1), prev = cabeceras.at(-2);
      if (sube && c) {
        const destino = o?.ir, q = destino ? p : Math.min(p, 0.3);
        if (!destino) c.classList.toggle("arma", p >= 0.45 && !c.disabled);
        sinTransicion(mano);
        sinTransicion([h]);
        const { x, y, s } = ini.base;
        pon(c, x + (M - x) * q * 0.55, y + (FILA2 - y) * q, -6 * q, s + (0.62 - s) * q);
        mano.forEach((x2, i) => {
          if (i !== sel) {
            const k = i - sel;
            pon(x2, W() / 2 - 64 + k * 112 * rejilla().es + Math.sign(k) * 60 * q, ini.base.y + 30 + 90 * q, k * 5 + Math.sign(k) * 10 * q, 0.9 * rejilla().es);
            x2.style.opacity = 1 - 0.7 * q;
          }
        });
        if (h) h.style.filter = `brightness(${1 - 0.58 * q})`;
        escena.asomar(destino ?? null, q, 1);
        ini.p = p;
        ini.sentido = 1;
      } else if (!sube && h && historial.length && pantalla !== "cuenta") {
        sinTransicion([h]);
        sinTransicion(mano);
        h.style.zIndex = 20;
        pon(h, M + (W() / 2 - 64 - M) * p * 0.6, FILA2 + (rejilla().manoTop - FILA2) * p * 0.8, 6 * p, 1 + 0.2 * p);
        if (prev) prev.style.filter = `brightness(${0.42 + 0.58 * p})`;
        mano.forEach((x2, i) => {
          const k = i - sel;
          pon(x2, W() / 2 - 64 + k * 112 * rejilla().es + W() * 0.6 * p, ini.base.y + (k ? 12 : 0), k * 5 + 12 * p, 0.9 * rejilla().es);
          x2.style.opacity = 1 - 0.6 * p;
        });
        escena.asomar(historial.at(-1), p, -1);
        ini.p = p;
        ini.sentido = -1;
      } else {
        ini.p = 0;
        escena.asomar(null);
      }
    }
    function soltarTodo() {
      [...mano, ...cabeceras].forEach((c) => {
        c.style.transition = "";
        c.style.filter = "";
        c.classList.remove("arma");
        if (mano.includes(c)) c.style.opacity = "";
      });
    }
    esc2.addEventListener("pointerdown", (e) => {
      if (e.target === nombre || e.target === campo || e.target.closest(".pieza")) return;
      const c = mano[sel], R = rejilla(), s0 = 1.08 * R.es;
      ini = {
        x: e.clientX,
        y: e.clientY,
        t: Date.now(),
        sel,
        eje: null,
        p: 0,
        sentido: 0,
        base: { x: W() / 2 - 64, y: R.manoTop - 88 + 88 * s0, s: s0 }
      };
      if (c && !c.disabled) {
        c.style.transition = "transform 140ms ease-out";
        pon(c, ini.base.x, ini.base.y - 8, 0, s0 * 1.04);
      }
      esc2.setPointerCapture(e.pointerId);
    });
    esc2.addEventListener("pointermove", (e) => {
      if (!ini) return;
      const dx = e.clientX - ini.x, dy = e.clientY - ini.y;
      if (!ini.eje && Math.hypot(dx, dy) > 8) ini.eje = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      if (ini.eje === "h" && mano.length) {
        const n = Math.max(0, Math.min(mano.length - 1, ini.sel + Math.round(-dx / 90)));
        if (n !== sel) {
          sel = n;
          vibrar(5);
        }
        const usado = -(sel - ini.sel) * 90, resto = dx - usado, borde = sel === 0 && resto > 0 || sel === mano.length - 1 && resto < 0;
        colocarMano(false, resto * (borde ? 0.3 : 112 / 90));
      } else if (ini.eje === "v") arrastrarV(dy);
    });
    const cancelarArrastre = () => {
      if (!ini) return;
      ini = null;
      soltarTodo();
      escena.asomar(null);
      colocarMano();
      apilarCabeceras();
    };
    esc2.addEventListener("pointercancel", cancelarArrastre);
    esc2.addEventListener("pointerup", (e) => {
      if (!ini) return;
      const dx = e.clientX - ini.x, dy = e.clientY - ini.y, t0 = Date.now() - ini.t;
      const { eje, p, sentido } = ini;
      ini = null;
      soltarTodo();
      const rapido = Math.abs(dy) > 40 && Math.abs(dy) / t0 > 0.6;
      if (eje === "v" && sentido && (p >= 0.45 || rapido)) {
        escena.confirmarAsomo();
        const esAccion = MENUS[pantalla]?.[sel]?.accion !== void 0, antes = pantalla;
        if (sentido > 0) jugar();
        else volver();
        if (esAccion && pantalla === antes) colocarMano();
        return;
      }
      escena.asomar(null);
      if (eje) {
        colocarMano();
        apilarCabeceras();
        return;
      }
      colocarMano();
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && t0 < 350) {
        const bajo = document.elementFromPoint(e.clientX, e.clientY);
        const jug = bajo?.closest(".carta.jugador"), id = jug?.dataset.id;
        const p2 = ultimaSala?.players.find((x) => x.id === id);
        if (pantalla === "sala" && p2 && id !== est.currentPlayerId) {
          if (!p2.is_bot && ultimaSala.oldest === est.currentPlayerId && !est.soyEspectador && ultimaSala.status === "waiting")
            irA("echar", "Echar", { id, nick: sinEmoji2(p2.nickname), idx: ordenSala().findIndex((x) => x.id === id) });
          else salta(jug);
          return;
        }
        const c = bajo?.closest("#cartas .carta:not([disabled])");
        const i = mano.indexOf(c);
        if (i >= 0 && i !== sel) {
          sel = i;
          vibrar(6);
          colocarMano();
        } else if (i === sel) jugar();
      }
    });
    addEventListener("keydown", (e) => {
      if (document.body.classList.contains("en-partida")) return;
      if (e.target === nombre || e.target === campo || e.target.closest?.(".elo-choice, #reconnectOverlay")) return;
      if (!document.getElementById("eloChoice")?.hidden) return;
      if (e.key === "ArrowLeft") elegir(-1);
      else if (e.key === "ArrowRight") elegir(1);
      else if (e.key === "ArrowUp" || e.key === "Enter") jugar();
      else if (e.key === "ArrowDown" || e.key === "Escape" || e.key === "Backspace") volver();
      else return;
      e.preventDefault();
    });
    addEventListener("resize", () => {
      colocarMano(true);
      PZ.forEach(plegar);
      formas();
    });
    try {
      nombre.value = localStorage.getItem("piles_nickname") || "";
    } catch {
    }
    nombre.placeholder = tl("home.nameph");
    nombre.addEventListener("input", () => {
      const v = nombre.value.trim();
      try {
        if (v) localStorage.setItem("piles_nickname", v);
      } catch {
      }
    });
    nombre.addEventListener("keydown", (e) => e.stopPropagation());
    let conectado = null;
    setInterval(() => {
      const ok = !!est.ws && est.ws.readyState === WebSocket.OPEN;
      if (ok === conectado) return;
      conectado = ok;
      X.cortado = !ok;
      escena.congelar(!ok);
    }, 400);
    document.body.classList.add("mesa");
    MENUS.perfil[1].nota = TAUNTS.find((b) => b.id === getTaunt())?.name ?? tl("taunt.none");
    window.agText = window.agText ?? { up: tl("rank.up"), down: tl("rank.down") };
    repartir(MENUS.inicio);
    formas("inicio");
    if (vistaActual !== "homeScreen" && DE_LOBBY[vistaActual]) saltarA(DE_LOBBY[vistaActual]);
    window.mesa = { escena, X, get pantalla() {
      return pantalla;
    }, get mano() {
      return mano;
    }, jugar, volver, elegir, irA };
  })();

  // ../client/partida/partida.js
  (() => {
    const ICONOS = {
      altavoz: "M3 9v6h4l6 5V4L7 9zM16 9l2 3-2 3M19 6l3 6-3 6",
      mudo: "M3 9v6h4l6 5V4L7 9zM16 9l6 6M22 9l-6 6",
      rayo: "M13 2 5 14h6l-1 8 8-12h-6z",
      bandera: "M5 22V3M5 4h13l-3 4.5 3 4.5H5",
      ojo: "M2 12l5-5h10l5 5-5 5H7zM11 10h2v4h-2z",
      candado: "M5 11h14v10H5zM8 11V7h8v4",
      hueco: "M6 3h12v18H6zM10 10h4v4h-4z",
      cruz: "M5 5l14 14M19 5 5 19",
      reloj: "M6 3h12M6 21h12M7 3l10 18M17 3 7 21",
      escudo: "M12 3l8 3v6l-8 9-8-9V6z",
      check: "M4 12l5 5L20 6",
      enchufe: "M9 3v5M15 3v5M6 8h12v4l-6 6-6-6zM12 18v4",
      fuera: "M14 4H4v16h10M10 12h11M17 8l4 4-4 4"
    };
    const ico = (n) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONOS[n]}"/></svg>`;
    const sinEmoji2 = (s) => String(s ?? "").replace(/\p{Extended_Pictographic}️?/gu, "").replace(/\s+/g, " ").trim();
    function avisoIco(nombre, cerca, ambar = false) {
      const r = cerca?.getBoundingClientRect?.();
      if (!r) return;
      const e = document.createElement("div");
      e.className = "aviso-ico" + (ambar ? " ambar" : "");
      e.innerHTML = ico(nombre);
      e.style.left = `${r.left + r.width / 2}px`;
      e.style.top = `${r.top + Math.min(r.height / 2, 60)}px`;
      document.body.append(e);
      setTimeout(() => e.remove(), 1200);
    }
    function destello(nick) {
      const s = [...document.querySelectorAll("#hud .hud-stripe")].find((x) => x.querySelector(".hud-name")?.dataset.nick === nick);
      if (!s) return;
      s.classList.remove("destello");
      void s.offsetWidth;
      s.classList.add("destello");
    }
    al("updateSetNav", () => {
      const rev = misSetsRevelados();
      document.querySelectorAll("#setNav .set-btn").forEach((b, i) => {
        b.setAttribute("aria-label", t("set.n", { n: i + 1 }));
        if (!b.querySelector(".set-mini")) {
          b.textContent = "";
          const mini2 = document.createElement("i");
          mini2.className = "set-mini";
          const ojo = document.createElement("span");
          ojo.className = "set-eye";
          b.append(mini2, ojo);
        }
        const c = rev.get(i), mini = b.querySelector(".set-mini");
        if (c) applyCardSprite(mini, c);
        else mini.style.backgroundPosition = "";
      });
    });
    const pintarMute = () => {
      const b = document.getElementById("muteBtn");
      if (b) b.innerHTML = ico(est.sfxMuted ? "mudo" : "altavoz");
    };
    al("toggleMute", pintarMute);
    al("onGameStart", pintarMute);
    pintarMute();
    const frenesi = document.getElementById("frenzyBtn");
    if (frenesi) {
      frenesi.removeAttribute("data-i18n");
      frenesi.innerHTML = ico("rayo");
    }
    const rendirse = document.getElementById("qteGiveUpBtn");
    if (rendirse) rendirse.innerHTML = `${ico("bandera")}<i></i>`;
    al("onSwapConflict", (players, cardId) => {
      if (players.includes(est.currentNickname)) {
        document.querySelectorAll("#qteScores .qte-name").forEach((n2) => n2.textContent = sinEmoji2(n2.closest(".is-me") ? est.currentNickname : n2.textContent));
        return;
      }
      const n = qteNotifs.get(cardId);
      if (!n) return;
      n.querySelectorAll(".qbn-player").forEach((p) => p.textContent = sinEmoji2(p.textContent));
      const vs = n.querySelector(".qbn-vs");
      if (vs) vs.innerHTML = ico("cruz");
      n.querySelectorAll(".qbn-scores [data-nick]").forEach((s) => s.textContent = "0");
    });
    al("onQteUpdate", (clicks) => {
      for (const n of qteNotifs.values()) n.querySelectorAll(".qbn-scores [data-nick]").forEach((s) => {
        if (s.dataset.nick in clicks) s.textContent = clicks[s.dataset.nick];
      });
    });
    al("renderPlayersProgress", () => {
      document.querySelectorAll("#hud .hud-name").forEach((n) => {
        n.dataset.nick = n.textContent;
        n.textContent = sinEmoji2(n.textContent);
      });
      const chip = document.querySelector("#hud .hud-stripe.mirones");
      if (chip) chip.innerHTML = `${ico("ojo")}${est.mirones}`;
    });
    al("pintarAviso", (el, nick, titulo) => {
      const icono = /🔌/.test(titulo) ? "enchufe" : /🚪/.test(titulo) ? "fuera" : /✅/.test(titulo) ? "check" : null;
      const tit = el?.querySelector(".qbn-title");
      if (!tit) return;
      tit.textContent = sinEmoji2(titulo) || nick;
      if (icono) tit.insertAdjacentHTML("afterbegin", ico(icono) + " ");
    });
    const MOTIVO = {
      wait_fight: "candado",
      card_fought: "candado",
      verifying: "candado",
      lost_card: "candado",
      owe_card: "hueco",
      empty_slot: "hueco",
      no_debt: "hueco",
      card_gone: "cruz"
    };
    al("onSwapFailed", (msg) => {
      if ((msg.kind || "rule") === "gone") {
        if (msg.by) destello(msg.by);
        return;
      }
      if (!msg.reason || est.qtePlayers.includes(est.currentNickname) || isStunned()) return;
      const fila = ["owe_card", "verifying"].includes(msg.code) ? "yourCards" : "centerCards";
      avisoIco(MOTIVO[msg.code] ?? "cruz", document.getElementById(fila));
    });
    al("onDebtForced", () => {
      const fila = document.getElementById("yourCards");
      fila?.classList.remove("destello-ambar");
      void fila?.offsetWidth;
      fila?.classList.add("destello-ambar");
      avisoIco("reloj", fila, true);
    });
    al("onFrenzyFired", (msg) => {
      destello(msg.player);
      if ((msg.countered || []).includes(est.currentNickname)) avisoIco("escudo", document.getElementById("comboBox"));
    });
    const vuelve = (el, prop) => {
      const ida = el.style[prop];
      el.style[prop] = "";
      if (ida) el.animate([{ [prop]: ida }, { [prop]: "0 0" }], { duration: 260, easing: "cubic-bezier(.3, 1.6, .5, 1)" });
    };
    const qte = document.getElementById("qteOverlay"), bandera = document.getElementById("qteGiveUpBtn"), hueco = document.getElementById("qteCard");
    let cede = null;
    const copiaCede = () => {
      const c = hueco.querySelector(".card"), r = c?.getBoundingClientRect();
      if (!r) return null;
      const e = c.cloneNode(true);
      e.classList.add("cede");
      Object.assign(e.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
      qte.append(e);
      hueco.style.visibility = "hidden";
      return e;
    };
    const sinCopia = (c) => {
      c?.copia?.remove();
      hueco.style.visibility = "";
    };
    if (qte && bandera && hueco) {
      al("onSwapConflict", () => {
        sinCopia(cede);
        cede = null;
        bandera.classList.remove("cerca");
      });
      al("closeQteOverlay", () => {
        sinCopia(cede);
        cede = null;
        qte.querySelectorAll(".card.cede").forEach((e) => e.remove());
        hueco.style.visibility = "";
      });
      qte.addEventListener("pointerdown", (e) => {
        if (!est.qteActive || bandera.hidden || e.target.closest("#qteGiveUpBtn")) return;
        const f = bandera.getBoundingClientRect();
        cede = { id: e.pointerId, x: e.clientX, y: e.clientY, d: Math.max(120, f.top + f.height / 2 - e.clientY), hecho: false, copia: null };
        try {
          qte.setPointerCapture(e.pointerId);
        } catch {
        }
      });
      qte.addEventListener("pointermove", (e) => {
        const c = cede;
        if (!c || c.id !== e.pointerId || c.hecho) return;
        const dy = e.clientY - c.y;
        if (dy < 16 || dy < Math.abs(e.clientX - c.x)) {
          if (c.copia) c.copia.style.translate = "";
          bandera.classList.remove("cerca");
          return;
        }
        c.copia ??= copiaCede();
        if (!c.copia) return;
        const p = lim(dy / c.d, 0, 1);
        c.copia.style.translate = `0 ${dy}px`;
        bandera.classList.toggle("cerca", p > 0.6);
        if (p < 1) return;
        c.hecho = true;
        bandera.classList.remove("cerca");
        bandera.hidden = true;
        c.copia.animate([{ opacity: 1 }, { opacity: 0, scale: ".5" }], { duration: 240, fill: "forwards" });
        playSfx("drop");
        zumba(25);
        send({ type: "give_up_card" });
      });
      const finCede = (e) => {
        const c = cede;
        if (!c || c.id !== e.pointerId) return;
        cede = null;
        bandera.classList.remove("cerca");
        if (c.hecho || !c.copia) return;
        const ida = c.copia.style.translate || "0 0";
        c.copia.animate([{ translate: ida }, { translate: "0 0" }], { duration: 260, easing: "cubic-bezier(.3, 1.6, .5, 1)" }).finished.finally(() => sinCopia(c));
        c.copia.style.translate = "";
      };
      qte.addEventListener("pointerup", finCede);
      qte.addEventListener("pointercancel", finCede);
    }
    const racha = document.getElementById("comboBox"), rayo = document.getElementById("frenzyBtn");
    let sube = null;
    if (racha && rayo) {
      racha.addEventListener("pointerdown", (e) => {
        if (rayo.hidden || est.soyEspectador) return;
        sube = { id: e.pointerId, x: e.clientX, y: e.clientY, d: Math.max(40, e.clientY - 8), hecho: false, movido: false };
        try {
          racha.setPointerCapture(e.pointerId);
        } catch {
        }
        rayo.classList.add("sostenido");
      });
      racha.addEventListener("pointermove", (e) => {
        const s = sube;
        if (!s || s.id !== e.pointerId || s.hecho) return;
        const dy = s.y - e.clientY;
        if (dy > TOQUE_PX) s.movido = true;
        const p = lim(dy / s.d, 0, 1);
        rayo.style.translate = `0 ${-Math.max(0, dy)}px`;
        rayo.style.setProperty("--carga", p.toFixed(3));
        if (p < 1) return;
        s.hecho = true;
        zumba(30);
        fireFrenzy();
      });
      const finSube = (e) => {
        const s = sube;
        if (!s || s.id !== e.pointerId) return;
        sube = null;
        rayo.classList.remove("sostenido");
        rayo.style.removeProperty("--carga");
        if (s.hecho) {
          rayo.style.translate = "";
          return;
        }
        vuelve(rayo, "translate");
        if (!s.movido && e.type === "pointerup") rayo.animate([{ translate: "0 0" }, { translate: "0 -14px" }, { translate: "0 0" }], { duration: 380, easing: "ease-out" });
      };
      racha.addEventListener("pointerup", finSube);
      racha.addEventListener("pointercancel", finSube);
      racha.addEventListener("click", (e) => {
        if (e.detail > 0 && e.target.closest("#frenzyBtn")) {
          e.stopPropagation();
          e.preventDefault();
        }
      }, true);
    }
    const tablero = document.getElementById("gameScreen");
    for (const f of ["f1", "f2", "f3"]) {
      const d = document.createElement("div");
      d.className = `pfrag ${f}`;
      d.setAttribute("aria-hidden", "true");
      tablero.prepend(d);
    }
    const barrido = document.createElement("div");
    barrido.className = "pbarrido";
    barrido.setAttribute("aria-hidden", "true");
    document.body.append(barrido);
    const barrer = () => {
      if (REDUCED_MOTION?.matches) return;
      barrido.classList.remove("pasa");
      void barrido.offsetWidth;
      barrido.classList.add("pasa");
    };
    for (const l of ["lampara", "neon", "faros", "velo"]) {
      const d = document.createElement("div");
      d.className = `pluz ${l}`;
      d.setAttribute("aria-hidden", "true");
      tablero.append(d);
    }
    al("switchSet", (i, antes) => {
      if (REDUCED_MOTION?.matches) return;
      const x = (i > antes ? 1 : -1) * Math.min(innerWidth * 0.5, 260);
      document.getElementById("yourCards")?.animate(
        [{ translate: `${x}px 0`, opacity: 0, easing: "cubic-bezier(.3, .6, .4, 1)" }, { translate: `${-x * 0.07}px 0`, opacity: 1, offset: 0.65, easing: "ease-in-out" }, { translate: "0 0" }],
        { duration: 440 }
      );
    });
    al("onFrenzyFired", barrer);
    al("updateFrenzyBtn", (ready) => tablero.classList.toggle("frenesi", !!ready));
    const PROP = 10361 / 16e3, HUECO = 12, MAX = 190;
    let casillas = 0, medida = "";
    function encajarCentro(forzar = false) {
      const fila = document.getElementById("centerCards");
      if (!fila || !tablero.classList.contains("active")) return;
      const n = Math.max(1, fila.children.length), cs = getComputedStyle(fila);
      const ancho = fila.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const alto = fila.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if (ancho <= 0 || alto <= 0) return;
      const ahora = `${ancho}x${alto}`;
      if (!forzar && ahora === medida && n <= casillas) return;
      medida = ahora;
      const objetivo = n + 2;
      let mejor = 0, cols = 1;
      for (let c = 1; c <= objetivo; c++) {
        const r = Math.ceil(objetivo / c);
        const w2 = Math.min((ancho - (c - 1) * HUECO) / c, (alto - (r - 1) * HUECO) / r * PROP);
        if (w2 > mejor) {
          mejor = w2;
          cols = c;
        }
      }
      const w = Math.floor(Math.min(mejor * 0.9, MAX));
      const filas = Math.max(Math.ceil(n / cols), Math.floor((alto + HUECO) / (w / PROP + HUECO)));
      casillas = cols * filas;
      fila.style.setProperty("--cc", cols);
      fila.style.setProperty("--cf", filas);
      fila.style.setProperty("--cw", `${w}px`);
    }
    function colocarCasillas() {
      const fila = document.getElementById("centerCards");
      const cols = +fila?.style.getPropertyValue("--cc") || 0, filas = +fila?.style.getPropertyValue("--cf") || 0;
      if (!cols || !filas) return;
      const cx = (cols - 1) / 2, cy = (filas - 1) / 2, orden = [];
      for (let r = 0; r < filas; r++) for (let c = 0; c < cols; c++) orden.push([r, c, Math.hypot((c - cx) * 1.15, r - cy) + (r * cols + c) * 1e-3]);
      orden.sort((a, b) => a[2] - b[2]);
      [...fila.children].forEach((e, i) => {
        const o = orden[i];
        e.style.gridArea = o ? `${o[0] + 1} / ${o[1] + 1}` : "";
      });
    }
    al("renderCenterCards", () => {
      encajarCentro();
      colocarCasillas();
    });
    al("onGameStart", () => {
      casillas = 0;
      requestAnimationFrame(() => {
        encajarCentro(true);
        colocarCasillas();
      });
    });
    addEventListener("resize", () => {
      encajarCentro(true);
      colocarCasillas();
    });
    const CAIDA = 360;
    let aterriza = null, sinAterrizar = /* @__PURE__ */ new Set(), trasVuelo = /* @__PURE__ */ new Set(), energia = 0, ultimo = 0;
    al("vuela", (cardData, from) => {
      if (cardData && from) trasVuelo.add(cardData.id);
    });
    al("aterriza", (rowId, index) => {
      const el = document.getElementById(rowId)?.children[index];
      const id = Number(el?.dataset.cardId);
      if (el && sinAterrizar.has(id)) return false;
      const volo = trasVuelo.delete(id);
      el?.classList.toggle("solo-aplasta", volo);
      aterriza = { rowId, el, retraso: volo ? 0 : CAIDA };
    });
    al("golpe", (fuerte = false) => {
      if (REDUCED_MOTION?.matches || !aterriza?.el) return;
      const { rowId, el, retraso } = aterriza;
      aterriza = null;
      setTimeout(() => golpe(rowId, el, fuerte), retraso);
    });
    const ADD = { composite: "add" };
    function golpe(rowId, el, fuerte) {
      const fila = document.getElementById(rowId);
      if (!fila || !el.isConnected) return;
      const t2 = performance.now();
      energia = Math.min(3.5, energia * Math.exp(-(t2 - ultimo) / 900) + (fuerte ? 1.8 : 1));
      ultimo = t2;
      const E = energia, r0 = el.getBoundingClientRect(), w = r0.width;
      const cx = r0.left + w / 2, cy = r0.top + r0.height / 2;
      fila.animate(
        [{ translate: "0 0" }, { translate: `0 ${4 * E}px`, offset: 0.15 }, { translate: `0 ${-0.9 * E}px`, offset: 0.45 }, { translate: "0 0" }],
        { duration: 420, easing: "ease-out", ...ADD }
      );
      if (rowId === "centerCards") fila.animate(
        [{ filter: "brightness(1)" }, { filter: `brightness(${1 - 0.1 * E})`, offset: 0.2 }, { filter: "brightness(1)" }],
        { duration: 460, pseudoElement: "::before" }
      );
      for (const otro of ["hud", rowId === "centerCards" ? "yourCards" : "centerCards"])
        document.getElementById(otro)?.animate([{ translate: "0 0" }, { translate: `0 ${2 * E}px`, offset: 0.3 }, { translate: "0 0" }], { duration: 320, delay: 50, ...ADD });
      for (const c of fila.children) {
        if (c === el || c.classList.contains("center-gap") || c.classList.contains("card-empty")) continue;
        const r = c.getBoundingClientRect(), d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy);
        const A = E * (fuerte ? 24 : 16) * Math.exp(-d / (w * 2.5));
        if (A < 0.6) continue;
        const g = (Math.random() < 0.5 ? -1 : 1) * A * 0.35;
        c.animate([
          { translate: "0 0", rotate: "0deg" },
          { translate: `0 ${-A}px`, rotate: `${g}deg`, offset: 0.3 },
          { translate: `0 ${A * 0.3}px`, rotate: `${-g * 0.4}deg`, offset: 0.6 },
          { translate: `0 ${-A * 0.1}px`, rotate: "0deg", offset: 0.8 },
          { translate: "0 0", rotate: "0deg" }
        ], { duration: 560, delay: d / 1.1, easing: "ease-out", ...ADD });
      }
      const fx = document.getElementById("fxLayer");
      if (!fx) return;
      const onda = document.createElement("div");
      onda.className = "onda" + (fuerte ? " fuerte" : "");
      Object.assign(onda.style, { left: `${cx}px`, top: `${r0.bottom - 8}px`, width: `${w * 1.5}px` });
      fx.append(onda);
      onda.animate(
        [{ scale: ".3", opacity: 0.9 }, { scale: `${1 + 0.5 * E} ${0.7 + 0.3 * E}`, opacity: 0 }],
        { duration: 420 + 60 * E, easing: "cubic-bezier(.2, .7, .3, 1)" }
      ).finished.finally(() => onda.remove());
      for (let i = 0, n = Math.round(4 + 2 * E); i < n; i++) {
        const s = document.createElement("i");
        s.className = "esquirla" + (fuerte || i % 3 === 0 ? " roja" : "");
        Object.assign(s.style, { left: `${cx + (Math.random() - 0.5) * w}px`, top: `${r0.bottom - 6}px` });
        fx.append(s);
        const lado = Math.random() < 0.5 ? -1 : 1, vx = lado * (20 + Math.random() * 40) * (0.7 + 0.3 * E), up = 16 + Math.random() * 26 * E;
        s.animate([
          { translate: "0 0", rotate: "0deg", opacity: 1 },
          { translate: `${vx * 0.6}px ${-up}px`, rotate: `${lado * 140}deg`, offset: 0.4 },
          { translate: `${vx}px ${up * 0.5}px`, rotate: `${lado * 280}deg`, opacity: 0 }
        ], { duration: 560, easing: "cubic-bezier(.3, .6, .5, 1)" }).finished.finally(() => s.remove());
      }
    }
    const franja = (nick) => [...document.querySelectorAll("#hud .hud-stripe")].find((x) => x.querySelector(".hud-name")?.dataset.nick === nick);
    function copia(card, r) {
      const e = document.createElement("div");
      e.className = "card vuela";
      applyCardSprite(e, card);
      Object.assign(e.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
      document.getElementById("fxLayer").append(e);
      return e;
    }
    function seLaLleva(m) {
      const el = document.querySelector(`#centerCards .card[data-card-id="${m.card_id}"]`), dest = franja(m.by);
      if (!el || !dest) {
        destello(m.by);
        return;
      }
      const card = est.centerCards.find((c) => c.id === m.card_id) ?? { id: m.card_id, clothing_type: 0 };
      const a = el.getBoundingClientRect(), b = dest.getBoundingClientRect();
      const e = copia(card, a), s = Math.max(0.15, b.height / a.height);
      const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
      e.animate([
        { transform: "translate(0, 0) rotate(0) scale(1)" },
        { transform: `translate(${dx * 0.35}px, ${dy * 0.35 + 18}px) rotate(-8deg) scale(1.12)`, offset: 0.3 },
        // la arranca: sube un poco y se tuerce
        { transform: `translate(${dx}px, ${dy}px) rotate(14deg) scale(${s})`, opacity: 0.3 }
      ], { duration: 480, easing: "cubic-bezier(.5, 0, .25, 1)" }).finished.finally(() => {
        e.remove();
        destello(m.by);
      });
    }
    function laSuelta(m) {
      const orig = franja(m.by)?.getBoundingClientRect();
      if (!orig) return;
      sinAterrizar.add(m.card_id);
      requestAnimationFrame(() => {
        const el = document.querySelector(`#centerCards .card[data-card-id="${m.card_id}"]`);
        const card = est.centerCards.find((c) => c.id === m.card_id);
        if (!el || !card) {
          sinAterrizar.delete(m.card_id);
          return;
        }
        const b = el.getBoundingClientRect(), a = { left: orig.left + orig.width / 2 - b.width * 0.2, top: orig.top, width: b.width * 0.4, height: b.height * 0.4 };
        const e = copia(card, b);
        el.style.visibility = "hidden";
        const dx = a.left + a.width / 2 - (b.left + b.width / 2), dy = a.top + a.height / 2 - (b.top + b.height / 2);
        e.animate([
          { transform: `translate(${dx}px, ${dy}px) rotate(-20deg) scale(.4)`, opacity: 0.4 },
          { transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 50}px) rotate(-6deg) scale(1.25)`, opacity: 1, offset: 0.45 },
          // la lanza: sube
          { transform: "translate(0, 0) rotate(0) scale(1)" }
          // y cae a plomo
        ], { duration: 520, easing: "cubic-bezier(.55, 0, .85, .35)" }).finished.finally(() => {
          e.remove();
          sinAterrizar.delete(m.card_id);
          const ya = document.querySelector(`#centerCards .card[data-card-id="${m.card_id}"]`);
          if (!ya) return;
          ya.style.visibility = "";
          const i = [...ya.parentElement.children].indexOf(ya);
          if (i >= 0) {
            trasVuelo.add(m.card_id);
            markLanded("centerCards", i);
          }
        });
      });
    }
    const TOQUE_MS = 250, TOQUE_PX = 12, LADO = 50;
    let sostenida = null;
    const enZona = (s, e) => {
      const r = s.r0, z = s.zona, dx = e.clientX - s.x, dy = e.clientY - s.y;
      const w = Math.max(0, Math.min(r.right + dx, z.right) - Math.max(r.left + dx, z.left));
      const h = Math.max(0, Math.min(r.bottom + dy, z.bottom) - Math.max(r.top + dy, z.top));
      return w * h > r.width * r.height / 2;
    };
    const cuenta = (s, e) => s.el && s.fila === "yourCards" === enZona(s, e);
    function aSuSitio(s, rebote = true) {
      s.el.classList.remove("sostenida", "casi", "soltada");
      document.getElementById(s.fila)?.classList.remove("arrastrando");
      const ida = s.el.style.translate;
      s.el.style.translate = "";
      if (rebote && ida) s.el.animate([{ translate: ida }, { translate: "0 0" }], { duration: 280, easing: "cubic-bezier(.3, 1.6, .5, 1)" });
    }
    const jugar = (fila, valor, el) => {
      if (est.soyEspectador || valor == null) return;
      if (fila === "yourCards") onPlayerCardClick(valor, el);
      else onCenterCardClick(valor, el);
    };
    function dejarAlli(s) {
      s.el.classList.remove("sostenida", "casi");
      s.el.classList.add("soltada");
      jugar(s.fila, s.valor, s.el);
      const mia = s.fila === "yourCards" ? est.pendingDrop?.index === s.valor : est.pendingTake?.card.id === s.valor;
      if (!mia) return aSuSitio(s);
      setTimeout(() => {
        if (s.el.isConnected && s.el.classList.contains("soltada")) aSuSitio(s);
      }, 2500);
    }
    for (const fila of ["yourCards", "centerCards"]) {
      const row = document.getElementById(fila);
      if (!row) continue;
      row.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.stopPropagation();
        const el = e.target.closest("[data-tap]");
        const valida = el && row.contains(el) && !el.classList.contains("card-empty");
        const zona = document.getElementById("centerCards").getBoundingClientRect();
        sostenida = { fila, el: valida ? el : null, valor: valida ? Number(el.dataset.tap) : null, x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, hecho: false, zona, r0: valida ? el.getBoundingClientRect() : null };
        try {
          row.setPointerCapture(e.pointerId);
        } catch {
        }
        if (valida && !est.soyEspectador) {
          el.classList.add("sostenida");
          row.classList.add("arrastrando");
        }
      }, true);
      row.addEventListener("pointermove", (e) => {
        const s = sostenida;
        if (!s || s.id !== e.pointerId || s.hecho || est.soyEspectador) return;
        const dx = e.clientX - s.x, dy = e.clientY - s.y;
        if (!s.modo && Math.hypot(dx, dy) > TOQUE_PX) {
          s.modo = fila === "yourCards" && dy > 0 && dy > Math.abs(dx) * 1.2 && est.allSets.length ? "tabla" : "carta";
          if (s.modo === "tabla") {
            if (s.el) aSuSitio(s, false);
            abrirTablas(s);
          }
        }
        if (s.modo === "tabla") return moverTablas(s, e);
        if (!s.el) return;
        s.el.style.translate = `${dx}px ${dy}px`;
        s.el.classList.toggle("casi", cuenta(s, e));
      }, true);
      const fin = (e) => {
        const s = sostenida;
        if (!s || s.id !== e.pointerId) return;
        e.stopPropagation();
        sostenida = null;
        if (s.modo === "tabla") return soltarTablas(e.type === "pointercancel");
        if (s.hecho) return;
        const dx = e.clientX - s.x, dy = e.clientY - s.y;
        const toque = Math.hypot(dx, dy) <= TOQUE_PX && performance.now() - s.t <= TOQUE_MS;
        if (e.type !== "pointercancel" && !toque && cuenta(s, e)) return dejarAlli(s);
        if (s.el) aSuSitio(s);
        if (e.type === "pointercancel") return;
        if (toque) return jugar(fila, s.valor, s.el);
        if (fila !== "yourCards") return;
        if (Math.abs(dx) >= LADO && Math.abs(dx) > Math.abs(dy) * 1.3) {
          const i = est.currentSetIndex - Math.sign(dx);
          if (i >= 0 && i < est.allSets.length) switchSet(i);
        }
      };
      row.addEventListener("pointerup", fin, true);
      row.addEventListener("pointercancel", fin, true);
    }
    const SEP = 14, lim = (v, a, b) => Math.min(b, Math.max(a, v));
    const zumba = (ms) => {
      try {
        navigator.vibrate?.(ms);
      } catch {
      }
    };
    let tablas = null;
    function abrirTablas(s) {
      const mano = document.getElementById("yourCards"), r = mano.getBoundingClientRect();
      const w = Math.min(r.width * 0.72, 460), cw = (w - 20 - 18) / 4, h = cw / 0.6476 + 20;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const capa2 = document.createElement("div");
      capa2.id = "tablas";
      const els = est.allSets.map((set) => {
        const t2 = document.createElement("div");
        t2.className = "tabla";
        Object.assign(t2.style, { left: `${cx - w / 2}px`, top: `${cy - h / 2}px`, width: `${w}px`, height: `${h}px` });
        for (const c of set || []) {
          const e = document.createElement("i");
          e.className = c ? "tcarta" : "tcarta vacia";
          if (c) applyCardSprite(e, c);
          t2.append(e);
        }
        t2.insertAdjacentHTML("beforeend", `<b class="tojo">${ico("ojo")}</b>`);
        capa2.append(t2);
        return t2;
      });
      document.getElementById("gameScreen").append(capa2);
      mano.classList.add("en-tabla");
      const queda = innerHeight - s.y - 12, entra = lim(queda * 0.3, 20, 60);
      tablas = {
        capa: capa2,
        els,
        rev: est.myFlippedSets.slice(),
        w,
        k0: r.width / w,
        cur: est.currentSetIndex,
        sel: est.currentSetIndex,
        e: 0,
        f: 0,
        ox: 0,
        entra,
        giro: Math.max(50, queda - entra),
        fija: owesCard(),
        hecho: false
      };
      zumba(8);
    }
    function pintarTablas(T) {
      const paso = T.w + SEP, k = 1 + (T.k0 - 1) * (1 - T.e);
      T.els.forEach((t2, i) => {
        const yo = i === T.sel;
        let a = yo ? 180 * T.f : 0;
        const vuelta = a > 90;
        if (vuelta) a -= 180;
        t2.classList.toggle("muestra", !!T.rev[i] !== vuelta);
        t2.classList.toggle("sel", yo && T.e > 0.5);
        const x = (i - T.cur) * paso + T.ox, s = (i === T.cur ? k : 1) * (yo ? 1 : 0.88);
        t2.style.transform = `translateX(${x}px) scale(${s}) perspective(${T.w * 2}px) rotateX(${a}deg)`;
        t2.style.opacity = i === T.cur ? 1 : T.e * (Math.abs(i - T.sel) <= 2 ? 1 : 0);
        t2.style.setProperty("--canto", Math.abs(Math.cos(a * Math.PI / 180)).toFixed(3));
      });
    }
    function moverTablas(s, e) {
      const T = tablas;
      if (!T || T.hecho) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y, n = T.els.length, paso = T.w + SEP;
      T.e = lim(dy / T.entra, 0, 1);
      T.f = lim((dy - T.entra) / T.giro, 0, 1);
      if (T.f === 0 && !T.fija) {
        T.ox = lim(dx, -(n - 1 - T.cur) * paso - 30, T.cur * paso + 30);
        const sel = lim(Math.round(T.cur - T.ox / paso), 0, n - 1);
        if (sel !== T.sel) {
          T.sel = sel;
          zumba(5);
        }
      }
      if (T.f >= 1) {
        T.hecho = true;
        flipCurrentSet(T.sel);
        zumba(25);
        T.els[T.sel].animate([{ scale: "1" }, { scale: "1.08" }, { scale: "1" }], { duration: 260, easing: "ease-out", composite: "add" });
      }
      pintarTablas(T);
    }
    function soltarTablas(cancelado) {
      const T = tablas;
      if (!T) return;
      tablas = null;
      if (!cancelado && T.sel !== T.cur && !owesCard()) {
        switchSet(T.sel);
        T.ox += (T.sel - T.cur) * (T.w + SEP);
        T.cur = T.sel;
      }
      const desde = { e: T.e, f: T.f, ox: T.ox }, hasta = { e: 0, f: T.hecho ? 1 : 0, ox: 0 }, t0 = performance.now();
      const cuadro = (now) => {
        const p = Math.min(1, (now - t0) / 280), q = 1 - (1 - p) ** 3;
        for (const k in desde) T[k] = desde[k] + (hasta[k] - desde[k]) * q;
        pintarTablas(T);
        if (p < 1) return requestAnimationFrame(cuadro);
        T.capa.remove();
        document.getElementById("yourCards")?.classList.remove("en-tabla");
      };
      requestAnimationFrame(cuadro);
    }
    al("antesDeMensaje", (msg) => {
      const m = msg?.type === "game_update" ? msg.moved : null;
      const otro = m && (m.by !== est.currentNickname || est.soyEspectador) ? m : null;
      if (otro && otro.kind === "take" && sostenida?.fila === "centerCards" && sostenida.valor === otro.card_id) {
        sostenida.hecho = true;
        aSuSitio(sostenida, false);
        if (otro.taunt) playTaunt(otro.taunt);
      }
      if (otro && otro.kind !== "drop") {
        try {
          seLaLleva(otro);
        } catch (e) {
          console.error("partida", e);
        }
      }
      if (otro && otro.kind === "drop") {
        try {
          laSuelta(otro);
        } catch (e) {
          console.error("partida", e);
        }
      }
    });
    let venia = false;
    al("antesDePartida", () => {
      venia = document.body.classList.contains("mesa") && !document.body.classList.contains("en-partida");
    });
    al("onGameStart", () => {
      if (venia && !REDUCED_MOTION?.matches) entrar();
      else barrer();
    });
    function entrar() {
      const esc2 = document.getElementById("escenario");
      if (!esc2) return barrer();
      document.body.classList.add("entrando");
      const ojo = (rx, rz, s) => `perspective(900px) rotateX(${rx}deg) rotate(${rz}deg) scale(${s})`;
      esc2.animate([
        { transform: ojo(0, 0, 1), filter: "brightness(1) blur(0)" },
        { transform: ojo(34, -12, 3.6), filter: "brightness(1.5) blur(2px)", opacity: 1, offset: 0.8 },
        { transform: ojo(44, -18, 5.5), filter: "brightness(2.4) blur(8px)", opacity: 0 }
      ], { duration: 640, easing: "cubic-bezier(.6, 0, .9, .45)" }).finished.finally(() => document.body.classList.remove("entrando"));
      setTimeout(barrer, 420);
      const cae = (id, kf, delay, duration = 520) => document.getElementById(id)?.animate(kf, { duration, delay, easing: "cubic-bezier(.2, 1.35, .4, 1)", fill: "backwards" });
      cae("gameScreen", [{ opacity: 0, transform: ojo(-22, 5, 0.88) }, { opacity: 1, transform: ojo(0, 0, 1) }], 500, 480);
      cae("centerCards", [{ scale: 1.6, rotate: "-7deg" }, { scale: 1, rotate: "0deg" }], 500, 600);
      cae("hud", [{ translate: "0 -90px", rotate: "-3deg" }, { translate: "0 0", rotate: "0deg" }], 640);
      cae("yourCards", [{ translate: "0 160px", rotate: "4deg" }, { translate: "0 0", rotate: "0deg" }], 700, 560);
    }
    const verifs = /* @__PURE__ */ new Map();
    const capa = document.getElementById("verifyOverlay");
    const caja = capa?.querySelector(".verify-box");
    const columnas = document.createElement("div");
    columnas.className = "vcols";
    caja?.insertBefore(columnas, document.getElementById("verifyFooter"));
    const abierta = () => capa?.classList.contains("active");
    const colDe = (nick) => [...columnas.children].find((c) => c.dataset.nick === nick);
    const quieto = () => REDUCED_MOTION?.matches;
    function columna(nick) {
      const v = verifs.get(nick), mia = nick === est.currentNickname;
      const c = document.createElement("section");
      c.className = "vcol" + (mia ? " mia" : "");
      c.dataset.nick = nick;
      const cab = document.createElement("h3");
      cab.className = "vcab";
      cab.textContent = sinEmoji2(nick);
      const lista = document.createElement("ol");
      lista.className = "vlista";
      for (let i = 0; i < 6; i++) {
        const li = document.createElement("li");
        li.innerHTML = `<b class="vnum">${i + 1}</b><span class="vcartas"></span><span class="vmarca"></span>`;
        lista.append(li);
      }
      const sello = document.createElement("div");
      sello.className = "vsello";
      c.append(cab, lista, sello);
      v.res.forEach((r, i) => r && marcar(c, i, r, false));
      mirando(c, v);
      if (v.fin) sellar(c, v.fin, false);
      return c;
    }
    function mirando(c, v) {
      const i = v.fin ? -1 : v.res.findIndex((r) => !r);
      c.querySelectorAll(".vlista li").forEach((li, j) => {
        li.classList.toggle("mira", j === i);
        const cartas = li.querySelector(".vcartas");
        if (j === i && !cartas.children.length) for (let k = 0; k < 4; k++) {
          const d = document.createElement("i");
          d.className = "vmini dorso";
          d.style.animationDelay = `${-k * 90}ms`;
          cartas.append(d);
        }
        if (j !== i) cartas.querySelectorAll(".dorso").forEach((d) => d.remove());
      });
    }
    function marcar(c, i, r, anima = true) {
      const li = c.querySelectorAll(".vlista li")[i];
      if (!li) return;
      const cartas = li.querySelector(".vcartas");
      cartas.textContent = "";
      for (const card of r.cards || []) {
        const m = document.createElement("i");
        m.className = "vmini";
        applyCardSprite(m, card);
        cartas.append(m);
      }
      li.classList.add(r.ok ? "ok" : "mal");
      li.querySelector(".vmarca").innerHTML = ico(r.ok ? "check" : "cruz");
      if (!anima || quieto()) return;
      [...cartas.children].forEach((m, k) => m.animate(
        [{ translate: "0 -26px", rotate: `${k % 2 ? 9 : -9}deg`, opacity: 0 }, { translate: "0 0", rotate: "0deg", opacity: 1 }],
        { duration: 260, delay: k * 55, easing: "cubic-bezier(.2, 1.4, .4, 1)", fill: "backwards" }
      ));
      li.querySelector(".vmarca").animate(
        [{ scale: 3, rotate: "-25deg", opacity: 0 }, { scale: 0.85, rotate: "4deg", opacity: 1, offset: 0.6 }, { scale: 1, rotate: "0deg" }],
        { duration: 320, delay: 200, easing: "ease-out", fill: "backwards" }
      );
      if (r.ok) li.animate([{ "--tacha": 0 }, { "--tacha": 1 }], { duration: 260, delay: 380, easing: "cubic-bezier(.3, 1.5, .5, 1)", fill: "backwards" });
      else li.animate([{ translate: "0 0" }, { translate: "-9px 0" }, { translate: "7px 0" }, { translate: "-4px 0" }, { translate: "0 0" }], { duration: 360, delay: 200 });
      setTimeout(() => chispas(li.querySelector(".vmarca"), r.ok ? 5 : 8, !r.ok), 330);
    }
    function sellar(c, fin, anima = true) {
      const s = c.querySelector(".vsello");
      c.classList.add(fin.pos ? "gana" : "falla");
      if (fin.pos) c.dataset.pos = fin.pos;
      s.textContent = fin.pos ? t("pos.ord", { n: fin.pos }) : "\u2715";
      mirando(c, { fin });
      if (!anima || quieto()) return;
      s.animate(
        [{ scale: 4, rotate: "-30deg", opacity: 0 }, { scale: 0.9, rotate: "-8deg", opacity: 1, offset: 0.55 }, { scale: 1, rotate: "-10deg" }],
        { duration: 420, easing: "ease-out" }
      );
      c.animate([{ translate: "0 0" }, { translate: "0 10px", offset: 0.25 }, { translate: "0 -3px", offset: 0.6 }, { translate: "0 0" }], { duration: 420, delay: 160 });
      setTimeout(() => chispas(s, fin.pos === 1 ? 18 : 10, fin.pos === 1 || !fin.pos), 200);
    }
    function chispas(el, n, roja) {
      const fx = document.getElementById("fxLayer"), r = el?.getBoundingClientRect();
      if (!fx || !r) return;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      for (let i = 0; i < n; i++) {
        const s = document.createElement("i");
        s.className = "vfx esquirla" + (roja && i % 2 ? " roja" : "");
        Object.assign(s.style, { left: `${cx}px`, top: `${cy}px` });
        fx.append(s);
        const a = Math.PI * 2 * i / n + Math.random() * 0.6, d = 30 + Math.random() * 40;
        s.animate(
          [{ translate: "0 0", rotate: "0deg", opacity: 1 }, { translate: `${Math.cos(a) * d}px ${Math.sin(a) * d}px`, rotate: `${a * 200}deg`, opacity: 0 }],
          { duration: 480, easing: "cubic-bezier(.2, .7, .4, 1)" }
        ).finished.finally(() => s.remove());
      }
    }
    function partir(nick) {
      const c = columna(nick);
      const antes = new Map([...columnas.children].map((x) => [x, x.getBoundingClientRect()]));
      columnas.append(c);
      columnas.dataset.n = columnas.children.length;
      if (quieto()) return;
      for (const [x, r0] of antes) {
        const r1 = x.getBoundingClientRect();
        x.animate([{ translate: `${r0.left - r1.left}px ${r0.top - r1.top}px` }, { translate: "0 0" }], { duration: 380, delay: 140, easing: "cubic-bezier(.2, 1.3, .4, 1)", fill: "backwards" });
      }
      const r = c.getBoundingClientRect(), b = caja.getBoundingClientRect();
      const vertical = r.top > b.top + 20 && Math.abs(r.left - b.left) < 20;
      const rayo2 = document.createElement("div");
      rayo2.className = "vfx vrayo" + (vertical ? " tumbado" : "");
      rayo2.innerHTML = vertical ? '<svg viewBox="0 0 400 60" preserveAspectRatio="none"><path d="M0 34 120 18 128 40 260 12 266 36 400 22 240 50 234 28 112 52 106 30 0 44z"/></svg>' : '<svg viewBox="0 0 60 400" preserveAspectRatio="none"><path d="M34 0 18 120 40 128 12 260 36 266 22 400 50 240 28 234 52 112 30 106 44 0z"/></svg>';
      Object.assign(rayo2.style, vertical ? { left: `${b.left}px`, top: `${r.top - 6}px`, width: `${b.width}px` } : { left: `${r.left - 6}px`, top: `${b.top - 20}px`, height: `${b.height + 40}px` });
      document.getElementById("fxLayer").append(rayo2);
      rayo2.animate(
        [{ clipPath: vertical ? "inset(0 100% 0 0)" : "inset(0 0 100% 0)", opacity: 1 }, { clipPath: "inset(0 0 0 0)", opacity: 1, offset: 0.25 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }],
        { duration: 620, easing: "linear" }
      ).finished.finally(() => rayo2.remove());
      capa.animate([{ backgroundColor: "rgb(233 230 218 / 55%)" }, { backgroundColor: "rgb(6 6 6 / 92%)" }], { duration: 300, delay: 120, fill: "backwards" });
      caja.animate([{ translate: "0 0" }, { translate: "-8px 5px" }, { translate: "7px -4px" }, { translate: "-3px 2px" }, { translate: "0 0" }], { duration: 300, delay: 140 });
      c.animate(
        [{ clipPath: vertical ? "inset(0 0 100% 0)" : "inset(0 0 0 100%)", opacity: 0.4 }, { clipPath: "inset(0 0 0 0)", opacity: 1 }],
        { duration: 360, delay: 160, easing: "cubic-bezier(.7, 0, .2, 1)", fill: "backwards" }
      );
      setTimeout(() => chispas(rayo2, 14, true), 170);
    }
    al("openVerifyOverlay", (nick) => {
      verifs.set(nick, { res: Array(6).fill(null), fin: null });
      if (nick === est.currentNickname) {
        for (const [n, v] of verifs) if (n !== nick && v.fin) verifs.delete(n);
        columnas.textContent = "";
        for (const n of [nick, ...[...verifs.keys()].filter((n2) => n2 !== nick)]) columnas.append(columna(n));
        columnas.dataset.n = columnas.children.length;
      } else if (abierta()) {
        colDe(nick)?.remove();
        partir(nick);
      }
    });
    al("revealVerifySet", (nick, i, ok, cards) => {
      const v = verifs.get(nick);
      if (!v) return;
      v.res[i] = { ok, cards };
      const c = abierta() && colDe(nick);
      if (!c) return;
      marcar(c, i, v.res[i]);
      mirando(c, v);
    });
    al("onVerificationSuccess", (nick, pos) => {
      const v = verifs.get(nick);
      if (!v) return;
      v.fin = { pos };
      const c = abierta() && colDe(nick);
      if (c) sellar(c, v.fin);
    });
    al("onVerificationFailed", (nick, fallos) => {
      const v = verifs.get(nick);
      if (!v) return;
      v.fin = { fallos };
      const c = abierta() && colDe(nick);
      if (c) sellar(c, v.fin);
    });
    al("clearMatchNotifications", () => {
      verifs.clear();
      columnas.textContent = "";
    });
    window.partida = { avisoIco, destello, ico, encajarCentro };
  })();

  // ../client/juego/index.ts
  var acciones = {
    toggleMute,
    fireFrenzy,
    flipCurrentSet: () => flipCurrentSet(),
    closeVerifyOverlay,
    returnToLobby,
    reconnect,
    recargar: () => location.reload()
  };
  for (const b of document.querySelectorAll("[data-accion]")) {
    b.addEventListener("click", () => acciones[b.dataset.accion]());
  }
  var modulos = [bus_exports, estado_exports, red_exports, sala_exports, espectador_exports, tablero_exports, sonido_exports, burlas_exports, musica_exports, toques_exports, pelea_exports, verificacion_exports, cuenta_exports];
  window.juego = new Proxy({}, {
    get: (_, k) => modulos.find((m) => k in m)?.[k],
    has: (_, k) => modulos.some((m) => k in m)
  });
})();
