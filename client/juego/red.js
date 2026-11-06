// ─── Caja negra del cliente ───────────────────────────────────────────────
// Lo que el cliente descarta o rechaza no lo ve nadie más: un toque ignorado,
// una caída, un error de JavaScript. En la sesión del 2026-09-30 hubo tres
// plazos de 3 s agotados sin ningún intento de coger y no se pudo saber por
// qué. Esto manda esas observaciones al servidor (`client_note`), que las graba
// con la partida. Sin apodos ni secretos: tipo, tiempos, distancias y banderas.
//
// - Mientras no hay asiento (sin conexión, o recién reconectado y todavía no
//   vuelto a la sala) se guardan en una cola y salen al volver, con cuánto
//   hace que pasaron: así queda lo que ocurrió DURANTE la caída.
// - Límites: una por tipo cada 400 ms, 400 por partida, 60 en cola.
const diag = (() => {
    const POR_TIPO_MS = 400, POR_PARTIDA = 400, COLA_MAX = 60, DETALLE_MAX = 560;
    const cola = [];
    const ultimaPorTipo = new Map();
    let enPartida = 0;
    let listo = false;            // ¿hay asiento en el servidor para recibirlas?

    function enviar(kind, detail, hace) {
        if (!ws || ws.readyState !== WebSocket.OPEN) return false;
        if (hace > 1500) detail = { ...detail, hace_ms: hace };
        let texto = JSON.stringify(detail);
        if (texto.length > DETALLE_MAX) detail = { recortada: true, kind };
        ws.send(JSON.stringify({ type: 'client_note', kind, detail }));
        return true;
    }

    return {
        note(kind, detail = {}) {
            if (!currentLobbyId) return;               // sin sala no hay grabación
            const ahora = Date.now();
            // El límite es por tipo Y evento: `ws:open` y `ws:rejoin_ok` ocurren
            // con milisegundos de diferencia y son cosas distintas.
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
        notReady() { listo = false; },
        newGame() { enPartida = 0; },
        /** Te vas de la sala: lo que esperaba ya no pertenece a ninguna. */
        clear() { cola.length = 0; },
    };
})();

window.addEventListener('error', e => diag.note('err', {
    msg: String(e.message || '').slice(0, 160),
    at: `${String(e.filename || '').split('/').pop()}:${e.lineno || 0}`,
}));
window.addEventListener('unhandledrejection', e => diag.note('err', {
    msg: String(e.reason?.message ?? e.reason ?? '').slice(0, 160), promise: true,
}));
document.addEventListener('visibilitychange', () => diag.note('vis', { hidden: document.hidden }));

/** El tablero tal y como cree tenerlo este cliente, para compararlo con el del
 *  servidor (nota `state`, cada 5 s en partida). La mano va aplanada, 6 sets × 4
 *  huecos, con `null` donde cree que hay un hueco. */
function clientStateSample() {
    const hand = [];
    for (let s = 0; s < 6; s++) {
        const set = allSets[s] || [];
        for (let i = 0; i < 4; i++) hand.push(set[i] ? set[i].id : null);
    }
    const ahora = Date.now();
    return {
        hand,
        center: centerCards.map(c => c.id),
        owes: owesCard(),
        qte: qteActive,
        stun_ms: Math.max(0, stunnedUntil - ahora),
        p_drop_ms: pendingDrop ? ahora - pendingDrop.t : null,
        p_take_ms: pendingTake ? ahora - pendingTake.t : null,
        blocked: qteBlockedCards.size,
        vis: !document.hidden,
        ws: ws ? ws.readyState : -1,
    };
}
setInterval(() => {
    if (document.getElementById('gameScreen')?.classList.contains('active') && !gameOver) {
        diag.note('state', clientStateSample());
    }
}, 5000);

// ─── WebSocket ────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    traducirVendored();
    initCardTilt();

    applyBetaMode();
    handleJoinDeepLink();
    // Tras cambiar de idioma: de vuelta a la pantalla en la que estabas.
    try {
        const volver = sessionStorage.getItem('piles.afterLang');
        sessionStorage.removeItem('piles.afterLang');
        if (volver && !pendingAutoJoin && ['homeScreen', 'profileScreen', 'joinScreen'].includes(volver)) showScreen(volver);
    } catch { /* sin storage */ }

    // Tras un F5 (o al volver a abrir el navegador) estando en una sala, volver
    // a ella. Un enlace ?join= manda sobre esto: es una intención más reciente
    // que la sala anterior.
    if (!pendingAutoJoin) {
        const seat = readSeat();
        if (seat && localStorage.getItem('piles_nickname')) {
            if (Date.now() - (seat.seen || 0) < SEAT_FRESH_MS) {
                pendingRejoinCode = seat.lobby;
                seatToken = seat.token || null;
            } else {
                writeSeat(null);   // demasiado viejo: ese asiento ya no existe
            }
        }
    }

    connectWs();
});

/** agapornis-ui es una copia vendored en español. Aquí se traduce sin tocar su
 *  lógica: los nombres de rango, mutados in situ por id (rank.js los lee de
 *  `agRank.RANKS` en cada llamada); el aviso de cerrar de los toasts, que se pone
 *  al crearlos; y la pastilla de ascenso/descenso del dial, que lee `agText`
 *  (único gancho añadido al vendored, ver dial.js). */
function traducirVendored() {
    if (typeof agRank === 'function') {
        for (const lista of Object.values(agRank.RANKS)) for (const par of lista) par[1] = t(`rank.${par[0]}`);
    }
    window.agText = { up: t('rank.up'), down: t('rank.down') };
    if (typeof window.agToast === 'function') {
        const crear = window.agToast;
        window.agToast = (opts) => {
            const el = crear(opts);
            el?.querySelector('.ag-toast-close')?.setAttribute('aria-label', t('toast.close'));
            return el;
        };
    }
}

/** Enlace de invitación (`?join=ABC123`), que es lo que codifica el QR del
 *  lobby. Así la cámara nativa del teléfono ya sirve para entrar, sin
 *  escanear desde dentro de la app. */
function handleJoinDeepLink() {
    const code = extractLobbyCode(new URLSearchParams(location.search).get('join'));
    if (!code) return;

    // Limpiar la URL para que un F5 no reintente unirse a una sala vieja.
    history.replaceState({}, '', location.pathname);

    codigoPendiente = code;
    showScreen('joinScreen');

    // Con nombre ya guardado no hay nada que preguntar: entrar directo en
    // cuanto el WebSocket esté listo.
    if (localStorage.getItem('piles_nickname')) pendingAutoJoin = true;
}
let pendingAutoJoin = false;
/** El código del enlace ?join=, hasta entrar con él. */
let codigoPendiente = '';

// ─── Volver a la sala tras una desconexión ────────────────────────────────
// Al reconectar se abre un WebSocket nuevo, y el servidor le asigna otro
// player_id: para él es un desconocido que no está en ninguna sala. Antes
// solo se reabría el socket, así que el overlay prometía "reconecta para
// volver a la sala" y luego no se podía ni marcar Listo. Hay que volver a
// entrar explícitamente.
//
// Y hay que demostrar quién eres, y no con el apodo (que lo escribe
// cualquiera): el servidor da a cada asiento un SECRETO (`seat_token`) y con él
// se recupera el asiento y la mano al instante, aunque la conexión vieja
// siga pareciendo viva. Antes se volvía por apodo y solo si el servidor ya
// había notado la caída; tras un corte de red eso tardó ~100 s (2026-09-30) y
// cada reintento chocaba con "Ya hay alguien llamado…".
let pendingRejoinCode = null;
let rejoinInFlight = false;
let seatToken = null;

// El asiento vive en el NAVEGADOR (localStorage), no en la pestaña: sobrevive
// a cerrar la pestaña o el navegador y volver dentro del plazo. Coste: una
// pestaña nueva se lleva el asiento de la que ya lo tenía, que lo avisa
// (`seat_replaced`) en vez de pelearse por él.
const SEAT_KEY = 'piles_seat';
/** 30 s de gracia del servidor más margen. Más viejo que esto, el asiento ya
 *  no existe y no merece la pena intentarlo. */
const SEAT_FRESH_MS = 90000;

function readSeat() {
    try { return JSON.parse(localStorage.getItem(SEAT_KEY) || 'null'); } catch { return null; }
}
function writeSeat(seat) {
    try {
        if (seat) localStorage.setItem(SEAT_KEY, JSON.stringify(seat));
        else localStorage.removeItem(SEAT_KEY);
    } catch { /* modo privado */ }
}

function rememberLobby(lobbyId) {
    pendingRejoinCode = lobbyId;
    // El secreto llega en un mensaje aparte justo después (`seat_token`); si
    // ya había uno de esta misma sala, se conserva.
    const prev = readSeat();
    if (prev && prev.lobby !== lobbyId) seatToken = null;   // el de otra sala no vale
    else if (prev && !seatToken) seatToken = prev.token || null;
    writeSeat({ lobby: lobbyId, token: seatToken, seen: Date.now() });
}

/** Te vas de verdad (o la sala ya no existe): se olvida aquí y en el navegador. */
function forgetLobby() {
    pendingRejoinCode = null;
    currentLobbyId = '';
    seatToken = null;
    writeSeat(null);
    diag.clear();
}

/** Lo ha tomado otra pestaña: solo se limpia esta pestaña. Lo guardado en el
 *  navegador ya es de la otra. */
function dropSeatLocally() {
    pendingRejoinCode = null;
    currentLobbyId = '';
    seatToken = null;
    rejoinInFlight = false;
    diag.clear();
}

function attemptRejoin() {
    const nickname = (localStorage.getItem('piles_nickname') || '').trim();
    if (!pendingRejoinCode || !nickname) { forgetLobby(); return; }
    currentNickname = nickname;
    rejoinInFlight = true;
    send({ type: 'join_lobby', lobby_id: pendingRejoinCode, nickname,
           rating_key: ratingKey(), seat_token: seatToken, taunt: getTaunt() || undefined,
           spectate: (soyEspectador && !enCola) || undefined });
}

function connectWs() {
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${wsProto}//${window.location.host}/ws`);

    ws.onopen = () => {
        clearTimeout(reconnectTimer);
        diag.notReady();   // hasta que se recupere el asiento
        diag.note('ws', { ev: 'open', attempt: reconnectAttempt });
        reconnectAttempt = 0;
        pendingPongSince = 0;
        document.getElementById('reconnectOverlay').style.display = 'none';
        // Ping para mantener viva la conexión y, de paso, para medir la ida y
        // vuelta. El servidor no puede medirla: solo el cliente sabe cuándo
        // salió su mensaje, así que manda la medida ANTERIOR pegada al ping
        // siguiente.
        //
        // Cada 3 s jugando y cada 25 s fuera: con 25 s no se puede responder a
        // "¿esto fue lag?", que es justo para lo que se guarda.
        clearInterval(pingInterval);
        pingInterval = setInterval(() => {
            if (!ws || ws.readyState !== WebSocket.OPEN) return;
            // Perro guardián: un ping sin su pong tanto rato es un socket
            // muerto, aunque el navegador no lo sepa. Se mira en cada tic, no
            // solo cuando toca mandar otro ping.
            if (pendingPongSince && Date.now() - pendingPongSince > PONG_TIMEOUT_MS) {
                diag.note('pong_timeout', { sin_pong_ms: Date.now() - pendingPongSince });
                abandonDeadSocket();
                return;
            }
            // "Visto hace poco": es lo que dice, al volver a abrir, si el
            // asiento guardado aún puede existir. Solo la pestaña que lo tiene.
            if (seatToken && currentLobbyId) {
                writeSeat({ lobby: currentLobbyId, token: seatToken, seen: Date.now() });
            }
            const enPartida = document.getElementById('gameScreen')?.classList.contains('active');
            if (!enPartida && Date.now() - lastPingAt < 25000) return;
            lastPingAt = Date.now();
            pingSentAt = performance.now();
            if (!pendingPongSince) pendingPongSince = Date.now();
            ws.send(JSON.stringify({ type: 'ping', rtt_ms: lastRtt }));
        }, 3000);

        if (pendingAutoJoin) {
            // Sala abierta desde un enlace/QR con nombre ya guardado.
            pendingAutoJoin = false;
            joinLobby(codigoPendiente);
        } else if (pendingRejoinCode) {
            // Reconexión (o F5) estando en una sala: volver a entrar.
            attemptRejoin();
        }
    };

    ws.onerror = () => {
        diag.note('ws', { ev: 'error' });
    };

    ws.onclose = (e) => {
        clearInterval(pingInterval);
        pendingPongSince = 0;
        diag.notReady();
        diag.note('ws', { ev: 'close', code: e.code, clean: e.wasClean });
        document.getElementById('reconnectOverlay').style.display = 'flex';
        scheduleReconnect();
    };

    ws.onmessage = e => {
        const msg = JSON.parse(e.data);
        console.log('📨', msg.type, msg);
        handleMsg(msg);
    };
}

/** El socket no contesta: se deja y se abre otro, sin esperar a que el
 *  navegador se entere (con la red muerta tarda minutos). Al volver, el secreto
 *  del asiento le quita la sala al servidor aunque este aún vea viva la
 *  conexión vieja. */
function abandonDeadSocket() {
    const vieja = ws;
    clearInterval(pingInterval);
    pendingPongSince = 0;
    diag.notReady();
    if (vieja) {
        // Sin manejadores: su `onclose` tardío no puede programar otra reconexión.
        vieja.onopen = vieja.onmessage = vieja.onerror = vieja.onclose = null;
        try { vieja.close(); } catch { /* ya estaba rota */ }
    }
    document.getElementById('reconnectOverlay').style.display = 'flex';
    scheduleReconnect();
}

/** Backoff 1s, 2s, 4s, 8s y luego cada 15s, sin límite de intentos: mientras
 *  la sala exista merece la pena seguir probando, y el servidor recicla las
 *  vacías a los 30 min de todas formas. */
function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectAttempt++;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempt - 1), RECONNECT_MAX_DELAY);
    document.getElementById('reconnectMsg').textContent =
        t(currentLobbyId ? 'recon.retry_room' : 'recon.retry', { n: reconnectAttempt });
    reconnectTimer = setTimeout(connectWs, delay);
}

/** El botón del overlay: reintentar ya, sin esperar al backoff. */
function reconnect() {
    clearTimeout(reconnectTimer);
    reconnectAttempt = 0;
    connectWs();
}

function send(obj) { ws.send(JSON.stringify(obj)); }

// ─── Mensajes del servidor ────────────────────────────────────────────────
function handleMsg(msg) {
    switch (msg.type) {
        case 'lobby_created':
            currentLobbyId = msg.lobby_id;
            currentPlayerId = msg.player_id;
            onEnteredLobby(msg.lobby_id);
            break;

        case 'joined_lobby':
            currentLobbyId = msg.lobby_id;
            currentPlayerId = msg.player_id;
            soyEspectador = !!msg.spectator;
            if (rejoinInFlight) diag.note('ws', { ev: 'rejoin_ok', espectador: soyEspectador });
            onEnteredLobby(msg.lobby_id);
            break;

        case 'seat_token':
            // El secreto del asiento, solo para ti. Con él se vuelve a la sala.
            seatToken = msg.token;
            writeSeat({ lobby: msg.lobby_id, token: msg.token, seen: Date.now() });
            // Ya hay asiento: las notas que esperaban (lo ocurrido durante la
            // caída) pueden salir y quedar grabadas con la partida.
            diag.ready();
            break;

        case 'seat_replaced':
            onSeatReplaced();
            break;

        case 'lobby_update':
            onLobbyUpdate(msg);
            break;

        case 'hello':
            onHello(msg.version);
            break;

        case 'kicked':
            onKicked();
            break;

        case 'spectator_cards':
            onSpectatorCards(msg);
            break;

        case 'spectator_state':
            onSpectatorState(msg);
            break;

        case 'game_start':
            onGameStart(msg);
            break;

        case 'countdown':
            startCountdown(msg.seconds);
            break;

        case 'countdown_cancelled':
            onCountdownCancelled(msg.reason);
            break;

        case 'set_switched':
            // Solo sincronizar datos; la vista ya se actualizó optimistamente en switchSet()
            allSets[msg.set_index] = msg.cards;
            break;

        case 'swap_success':
            onSwapSuccess(msg);
            break;

        case 'swap_failed':
            onSwapFailed(msg);
            break;

        case 'swap_conflict':
            onSwapConflict(msg.players, msg.card_id, msg.qte_duration);
            break;

        // Las dos llegan a toda la sala y puede haber más de una pelea a la vez,
        // así que solo cuentan las de LA carta que tienes delante. Sin esto, al
        // resolverse la pelea de otros dos se te cerraba la tuya a media pelea.
        case 'qte_update':
            if (esMiPelea(msg.card_id)) onQteUpdate(msg.clicks, msg.card_id);
            break;

        case 'qte_resolved':
            // La limpieza por carta va SIEMPRE, sea tu pelea o la de otros dos.
            // Colgarla de `esMiPelea` fue justo lo que dejaba avisos pegados en
            // pantalla: con dos peleas, la que no era la tuya no se limpiaba
            // nunca.
            qteBlockedCards.delete(msg.card_id);
            cerrarAvisoPelea(msg.card_id);
            renderCenterCards();
            if (esMiPelea(msg.card_id)) onQteResolved(msg.winner, msg);
            break;

        // Empate al acabar el tiempo: ronda extra de muerte súbita.
        case 'qte_tiebreak':
            onQteTiebreak(msg.card_id, msg.round, msg.duration);
            break;

        case 'stunned':
            startStun(msg.ms);
            // Si era la respuesta a coger o soltar, esa jugada no se hizo: sin
            // esto se quedaba la carta en fantasma y pedida para siempre.
            if (pendingTake || pendingDrop) onSwapFailed({ kind: 'gone' });
            break;

        case 'combo_update':
            renderCombo(msg);
            break;

        case 'frenzy_fired':
            onFrenzyFired(msg);
            break;

        case 'debt_started':
            startDebtCountdown(msg.ms);
            break;

        case 'debt_forced':
            // El SwapSuccess que viene detrás coloca la carta; esto solo dice
            // por qué apareció sola.
            onDebtForced(msg.card);
            break;

        case 'player_disconnected':
            onPlayerDisconnected(msg.nickname, msg.seconds);
            break;

        case 'player_left':
            onPlayerLeft(msg.nickname, msg.retired, msg.retired_types);
            break;

        case 'wait_poll':
            onWaitPoll(msg.nickname, msg.seconds);
            break;

        case 'wait_poll_closed':
            onWaitPollClosed(msg.nickname, msg.result);
            break;

        case 'sets_resynced':
            // Mismo estado, reenviado: NO se toca la racha ni los sets
            // volteados. Un hueco por una prenda retirada no es culpa tuya.
            allSets = msg.your_sets;
            centerCards = msg.center_cards;
            renderYourCards();
            renderCenterCards();
            updateSetNav();
            updateOwingUi();
            break;

        case 'game_update': {
            // Intercambio de otro jugador. No vimos de dónde salía su carta,
            // así que nada de vuelos: solo se resalta el hueco que cambió.
            // Qué carta es nueva se mira ANTES de sustituir centerCards.
            // Se compara con lo PINTADO, no con `centerCards`.
            const drawn = new Set(centerSlots.filter(id => id !== null));
            const arrived = msg.center_cards.find(c => !drawn.has(c.id));
            centerCards = msg.center_cards;
            mirones = msg.spectators ?? 0;
            renderPlayersProgress(msg.players_progress);
            // El servidor manda este broadcast también a quien hizo el
            // intercambio, justo detrás de su swap_success. Redibujar otra vez
            // borraría el resaltado que acaba de ponerse, así que si el centro
            // ya está como toca no se toca nada.
            // Pero "como toca" es que no falte NI sobre nada. Antes solo se
            // miraba si había llegado alguna: cuando otro COGÍA una carta, la
            // suya seguía pintada. Tocarla no hacía nada ("no me deja
            // cogerla"), y si volvía a caer otra igual se veía dos veces.
            // Medido en beta el 2026-09-28: 70 % del tiempo había alguna.
            if (!arrived && drawn.size === msg.center_cards.length) break;
            renderCenterCards();
            if (arrived && qteBlockedCards.size === 0) {
                // Por hueco, que es lo que se dibuja: el índice dentro de
                // centerCards ya no coincide con lo que hay en pantalla.
                const slot = centerSlots.indexOf(arrived.id);
                if (slot !== -1) markLanded('centerCards', slot);
                flashCenter();   // el centro cambió por alguien que no eres tú
            }
            break;
        }

        case 'set_flipped':
            onSetFlipped(msg.player, msg.set_index, msg.cards);
            break;

        case 'verification_started':
            openVerifyOverlay(msg.player);
            break;

        case 'set_verification_result':
            revealVerifySet(msg.player, msg.set_index, msg.is_valid, msg.cards);
            break;

        case 'verification_success':
            onVerificationSuccess(msg.player, msg.position);
            break;

        case 'verification_failed':
            onVerificationFailed(msg.player, msg.failed_sets);
            break;

        case 'game_over':
            onGameOver(msg.rankings, msg.elo || []);
            break;

        case 'game_cancelled':
            onGameCancelled(msg);
            break;

        case 'pong':
            // Keep-alive confirmado, y la medida de la ida y vuelta.
            pendingPongSince = 0;
            if (pingSentAt) lastRtt = Math.round(performance.now() - pingSentAt);
            break;

        case 'error':
            console.warn('Error del servidor:', msg.message);
            if (rejoinInFlight) {
                diag.note('ws', { ev: 'rejoin_fail', msg: String(msg.message).slice(0, 80) });
                // La sala ya no existe (o el nombre está ocupado). Sin esto
                // el jugador se quedaba mirando una sala fantasma.
                rejoinInFlight = false;
                forgetLobby();
                showScreen('homeScreen');
                agToast({ kind: 'warning', message: t('err.rejoin', { why: srvText(msg, 'err') }) });
                break;
            }
            // Aviso en vez de alert(): no bloquea la pantalla ni la partida.
            agToast({ kind: 'error', message: srvText(msg, 'err') });
            clearSelection();
            break;
    }
}

/** El texto de un aviso del servidor en el idioma de esta pestaña. El servidor
 *  manda `code` (+ `args`, los datos) y siempre el texto en español como
 *  respaldo: sin `code` (servidor o mensaje viejo) o con un código que esta
 *  versión del cliente no conoce, se enseña ese texto. Nunca se analiza. */
function srvText(msg, ns) {
    const fallback = msg.message ?? msg.reason ?? '';
    if (!msg.code) return fallback;
    const key = `${ns}.${msg.code}`;
    return PilesI18n.has(key) ? t(key, msg.args || {}) : fallback;
}

