// ─── Lobby ────────────────────────────────────────────────────────────────
import { emitir } from './bus.js';
import { miNombre, est, opponentFlippedSets } from './estado.js';
import { diag, rememberLobby, forgetLobby, dropSeatLocally, send } from './red.js';
import { sinEmoji, resetEspectador } from './espectador.js';
import { buildSetNav, renderCenterCards, renderYourCards, renderPlayersProgress, ratingKey, clearGraceNotices, clearDebtCountdown, resetCombo } from './tablero.js';
import { playSfx } from './sonido.js';
import { getTaunt } from './burlas.js';
import { startMusic, stopMusic } from './musica.js';
import { updateFlipBtn } from './toques.js';
import { clearStun, closeQteOverlay } from './pelea.js';
import { closeVerifyOverlay, clearMatchNotifications } from './verificacion.js';
import { vistaActual, showScreen } from './cuenta.js';


/** Devuelve el nombre o null. Sin nombre no se entra en ninguna sala: la mesa
 *  hace temblar su campo (aviso 'sinNombre'). */
export function requireNickname() {
    const nickname = miNombre();
    if (!nickname) { emitir('sinNombre'); return null; }
    localStorage.setItem('piles_nickname', nickname);
    est.currentNickname = nickname;
    return nickname;
}

// Pública por defecto, que es lo que quiere quien monta una sala para jugar
// ya; quien la monta para sus amigos la marca privada y solo se entra con el
// código o el QR.
export let lobbyIsPublic = true;

export function setVisibility(isPublic) {
    lobbyIsPublic = isPublic;
}

/** `maxPlayers`: lo elige el tambor de la mesa (2–8). */
export function createLobby(maxPlayers) {
    const nickname = requireNickname();
    if (!nickname) return;
    cancelQuickMatchOffer();
    send({ type: 'create_lobby', nickname, max_players: maxPlayers, is_public: lobbyIsPublic, rating_key: ratingKey(), taunt: getTaunt() || undefined });
}

/** Partida rápida: el servidor mete en la sala pública más llena, o abre una.
 *  Si pasado un rato sigues solo, se ofrece jugar contra bots — pero se
 *  pregunta, no se rellena por su cuenta. */
export function quickMatch() {
    const nickname = requireNickname();
    if (!nickname) return;
    cameFromQuickMatch = true;
    send({ type: 'quick_match', nickname, rating_key: ratingKey(), taunt: getTaunt() || undefined });
}

export let cameFromQuickMatch = false;

export function refreshLobbies() {
    send({ type: 'list_lobbies' });
}

// ─── Bots ─────────────────────────────────────────────────────────────────
export let botDifficulty = 'normal';

export function setBotDifficulty(d) {
    botDifficulty = d;
}

export function addBot() {
    send({ type: 'add_bot', difficulty: botDifficulty });
}

export function removeBot(playerId) {
    send({ type: 'remove_bot', player_id: playerId });
}

/** Tras entrar por partida rápida: si sigues solo, se ofrece jugar contra
 *  bots. Se pregunta en vez de rellenar solo, porque quien pide partida
 *  rápida normalmente quiere gente. */
let quickMatchOfferTimer = null;
/** Cuántos hay sentados, según el último `lobby_update`. */
export let jugadoresEnSala = 0;
let ofertaAbierta = false;
/** La mesa la enseña y la quita: aviso 'ofertaBots' (`true` = ofrecer bots). */
function ponerOferta(abierta) {
    if (abierta === ofertaAbierta) return;
    ofertaAbierta = abierta;
    emitir('ofertaBots', abierta);
}

function armQuickMatchOffer() {
    clearTimeout(quickMatchOfferTimer);
    quickMatchOfferTimer = setTimeout(() => { if (jugadoresEnSala <= 1) ponerOferta(true); }, 12000);
}

/** Oculta la oferta y para su temporizador. Salvo `seguirOfreciendo`, también
 *  olvida que vienes de partida rápida: descartarla o aceptarla la cierra, y
 *  los `lobby_update` con un jugador que siguen llegando no la reabren. */
export function cancelQuickMatchOffer(seguirOfreciendo) {
    if (seguirOfreciendo !== true) cameFromQuickMatch = false;
    clearTimeout(quickMatchOfferTimer);
    ponerOferta(false);
}

export function acceptBotsOffer() {
    cancelQuickMatchOffer();
    // Hasta 3 rivales: suficiente para una partida movida sin esperar mucho.
    for (let i = 0; i < 3; i++) addBot();
}

// Mientras «Unirse» está abierto, la lista se refresca sola: una partida que
// empieza o acaba aparece sin tener que pedirla. Cada 2 s: la cuenta atrás dura
// 3, así que «empezando» llega a verse. La pinta la mesa (lobby_list).
setInterval(() => {
    if (vistaActual === 'joinScreen'
        && est.ws && est.ws.readyState === WebSocket.OPEN
        && document.visibilityState === 'visible') {
        refreshLobbies();
    }
}, 2000);

/** `spectate`: entrar a mirar aunque haya sitio (lo pide la lista; el código y
 *  el QR no lo mandan, y entran a jugar si hay hueco). */
export function joinLobby(code, spectate) {
    const nickname = requireNickname();
    if (!nickname) return;
    code = (code || '').trim().toUpperCase();
    if (!code) { showScreen('joinScreen'); return; }
    est.codigoPendiente = '';
    cancelQuickMatchOffer();
    send({ type: 'join_lobby', lobby_id: code, nickname, rating_key: ratingKey(), taunt: getTaunt() || undefined,
           spectate: spectate === true || undefined });
}

/** Host y jugador que se une llegan al lobby por mensajes distintos
 *  (`lobby_created` / `joined_lobby`); ambos pasan por aquí. */
export function onEnteredLobby(lobbyId) {
    est.rejoinInFlight = false;
    rememberLobby(lobbyId);
    // Mirando se ve la sala de espera igual (jugadores, chat y la carta para
    // jugar); si la partida ya está en marcha, el `game_start` que viene detrás
    // pinta el tablero encima.
    stopScanner();
    showScreen('lobbyScreen');
}

export function joinLinkFor(lobbyId) {
    return `${location.origin}/lobby.html?join=${lobbyId}`;
}

// ─── Unirse: escáner de QR ────────────────────────────────────────────────
// qr-scanner usa BarcodeDetector nativo donde existe y su propio worker en el
// resto (iOS y Firefox no lo tienen), así que no hace falta ramificar aquí. El
// vídeo (#scanVideo) no se ve: la mesa lo dibuja en el centro de la mesa.
export let qrScanner = null;

export function extractLobbyCode(raw) {
    let value = (raw || '').trim();
    // El QR del lobby lleva la URL de invitación completa; el manual, solo el código.
    try {
        const parsed = new URL(value);
        value = parsed.searchParams.get('join') || '';
    } catch { /* no era una URL: se usa tal cual */ }
    value = value.trim().toUpperCase();
    return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(value) ? value : null;
}

/** Enciende o apaga la cámara. Si no se puede, `qrScanner` queda en null (la mesa lo avisa). */
export async function toggleScanner() {
    if (qrScanner) { stopScanner(); return; }
    try {
        qrScanner = new QrScanner(
            document.getElementById('scanVideo'),
            result => {
                const code = extractLobbyCode(result.data);
                if (!code) return; // QR ajeno: seguir escaneando
                stopScanner();
                joinLobby(code);
            },
            { highlightScanRegion: true, preferredCamera: 'environment' },
        );
        await qrScanner.start();
        document.getElementById('scanWrap').classList.add('active');
    } catch (e) {
        stopScanner();
        console.error(e);
    }
}

/** Único punto de apagado. Si esto no corre, la luz de la cámara se queda
 *  encendida y consume batería — por eso lo llaman también onEnteredLobby(),
 *  la mesa al salir del visor y pagehide. */
export function stopScanner() {
    if (qrScanner) {
        qrScanner.stop();
        qrScanner.destroy();
        qrScanner = null;
    }
    document.getElementById('scanWrap').classList.remove('active');
}

window.addEventListener('pagehide', stopScanner);

export function toggleReady() {
    est.isReady = !est.isReady;
    send({ type: 'set_ready', ready: est.isReady });
}

export function leaveLobby() {
    // Avisar al servidor. Antes solo se cambiaba de pantalla: el asiento
    // seguía, la sala seguía en la lista y el apodo seguía ocupado, así que
    // volver a entrar con el mismo nombre daba "Ya hay alguien llamado…".
    if (est.ws && est.ws.readyState === WebSocket.OPEN) send({ type: 'leave_lobby' });
    showScreen('homeScreen');
    forgetLobby();
    cancelQuickMatchOffer();
    est.isReady = false;
    // Si mirabas (o esperabas plaza), ya no.
    est.soyEspectador = false;
    enCola = false;
    rolPedido = 0;
    aplicarModoEspectador();
}

/** Otra pestaña ha tomado tu asiento (o lo has recuperado tú tras un corte
 *  desde otro sitio). Esta ya no es la buena: se vuelve al inicio sin
 *  reintentar, que es lo que evita que dos pestañas se lo quiten sin parar. */
export function onSeatReplaced() {
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
    document.getElementById('gameOverOverlay').classList.remove('active');
    document.getElementById('fxLayer').innerHTML = '';
    agToast({
        kind: 'warning',
        title: t('seat.title'),
        message: t('seat.msg'),
        duration: 8000,
    });
    showScreen('homeScreen');
}

// ─── Versión del servidor ─────────────────────────────────────────────────
// El servidor manda su versión (el commit) nada más conectar. La primera que ve
// esta página es la suya: el HTML y el servidor se despliegan a la vez, y la
// página se pide sin caché (ver el `Cache-Control` de nginx y del `ServeDir`).
// Si en una reconexión llega OTRA, el servidor se desplegó con esta pestaña
// abierta: se reinició —las salas y partidas viven en memoria, no hay ninguna
// que perder— y esta página es de la versión vieja, así que se recarga sola.
//
// No se recarga más de una vez cada 30 s, por si algo raro (dos servidores de
// versiones distintas detrás del mismo sitio) hiciera cambiar la versión en
// cada conexión: en ese caso solo se avisa.
export let versionDelServidor = null;
const RELOAD_KEY = 'piles_reloaded_at';

export function onHello(version) {
    if (!version || version === 'dev') return;     // en local no hay despliegues
    if (versionDelServidor === null) { versionDelServidor = version; return; }
    if (version === versionDelServidor) return;
    versionDelServidor = version;
    let hace = Infinity;
    try { hace = Date.now() - Number(sessionStorage.getItem(RELOAD_KEY) || 0); } catch { /* sin storage */ }
    if (hace < 30000) {
        agToast({ kind: 'warning', title: t('ver.new'), message: t('ver.reload'), duration: 15000 });
        return;
    }
    try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { /* sin storage */ }
    agToast({ kind: 'info', title: t('ver.new_short'), message: t('ver.updating'), duration: 2000 });
    setTimeout(() => location.reload(), 1200);
}

// ─── Chat de la sala de espera ────────────────────────────────────────────
// La verdad está en el servidor (dura lo que dure la sala); lo pinta la mesa.
export function sendChat(text) {
    text = (text || '').trim();
    if (!text || !est.ws || est.ws.readyState !== WebSocket.OPEN) return;
    send({ type: 'chat', text });
}

// ─── Jugar o mirar ───────────────────────────────────────────────────────
// `enCola`: miras y te sentarás solo en cuanto haya hueco (llegaste con la mesa
// llena o la partida en marcha, o lo pediste). Mirar por gusto no es cola.
export let enCola = false, rolPedido = 0;

/** El botón de la franja de espectador en el tablero: esperar plaza o no. */
function pintarRol() {
    const b = document.getElementById('rolPartidaBtn');
    if (b) {
        b.textContent = t(enCola ? 'role.next_on' : 'role.next_off');
        b.setAttribute('aria-pressed', String(enCola));
    }
}

export function cambiarRol() {
    // Sentado: pasar a mirar. Mirando: pedir sitio; en cola: dejar la cola.
    const mirar = !est.soyEspectador || enCola;
    if (!est.soyEspectador) { rolPedido = Date.now(); est.isReady = false; }
    send({ type: 'set_spectator', spectate: mirar });
}

// ─── Te echaron ───────────────────────────────────────────────────────────
// La votación (kick_poll / kick_poll_ended) la pinta la mesa.
/** Te han echado: de vuelta a la lista de salas, con el aviso. */
export function onKicked() {
    forgetLobby();
    est.isReady = false;
    est.soyEspectador = false;
    aplicarModoEspectador();
    agToast({ kind: 'warning', title: t('kick.you_title'), message: t('kick.you_msg'), duration: 8000 });
    showScreen('joinScreen');
    refreshLobbies();
}

export function onLobbyUpdate(msg) {
    est.mirones = msg.spectators ?? 0;
    jugadoresEnSala = msg.players.length;
    // Al acabar la partida el servidor sienta a los mirones: dejas de serlo sin
    // haber hecho nada.
    const sentado = msg.players.some(p => p.id === est.currentPlayerId);
    if (est.soyEspectador && sentado) {
        est.soyEspectador = false;
        est.isReady = false;
        aplicarModoEspectador();
        onEnteredLobby(est.currentLobbyId);
    } else if (!est.soyEspectador && !sentado && msg.status !== 'playing' && Date.now() - rolPedido < 5000) {
        // Acabas de pasarte a espectador: el servidor te sacó de la mesa.
        rolPedido = 0;
        est.soyEspectador = true;
        est.isReady = false;
        est.seatToken = null;
        aplicarModoEspectador();
    }
    enCola = est.soyEspectador && (msg.queue || []).includes(est.currentPlayerId);
    pintarRol();

    // Llegó alguien: ya no hace falta ofrecer bots.
    if (msg.players.length > 1) cancelQuickMatchOffer(true);
    else if (cameFromQuickMatch) armQuickMatchOffer();

    // Estar en el tablero manda: un `lobby_update` NUNCA puede sacarte de una
    // partida. Antes daba igual porque durante una partida no llegaba ninguno;
    // en cuanto entrar o salir un espectador empezó a difundir uno, esto echaba
    // del tablero a los cuatro jugadores a la vez. La vuelta a la sala al
    // terminar la hace `returnToLobby`, no esto.
    if (!est.gameOver && vistaActual !== 'gameScreen' && vistaActual !== 'lobbyScreen') showScreen('lobbyScreen');
}

// ─── Cuenta atrás ─────────────────────────────────────────────────────────
// El servidor avisa de que todos están listos (`countdown`) y reparte solo al
// acabar. La forman las cartas de la mesa; aquí suenan los números y se anuncian
// al lector de pantalla. El reloj va contra una hora de fin y no contando ticks:
// con la pestaña oculta los temporizadores se frenan y el número saldría
// atrasado; así se corrige solo al volver.
let cuentaFin = 0, cuentaTimer = null, cuentaN = -1;

export function startCountdown(seconds) {
    closeCountdown();
    cuentaFin = Date.now() + Math.max(1, Number(seconds) || 3) * 1000;
    cuentaTick();
    cuentaTimer = setInterval(cuentaTick, 100);
    emitir('startCountdown', seconds);
}

function cuentaTick() {
    const n = Math.ceil((cuentaFin - Date.now()) / 1000);
    if (n === cuentaN) return;
    cuentaN = n;
    document.getElementById('cuentaAnuncio').textContent = n > 0 ? String(n) : t('ca.go');
    if (!document.hidden) playSfx(n > 0 ? 'countTick' : 'countGo');
    // Si el reparto no llega (se perdió el mensaje), no se queda el 0 colgado.
    if (n <= -2) closeCountdown();
}

export function closeCountdown() {
    clearInterval(cuentaTimer);
    cuentaTimer = null;
    cuentaN = -1;
    const a = document.getElementById('cuentaAnuncio');
    if (a) a.textContent = '';
    emitir('closeCountdown');
}

export function onCountdownCancelled(reason) {
    if (cuentaTimer === null) return;
    closeCountdown();
    const porque = t(reason === 'left' ? 'ca.left' : reason === 'joined' ? 'ca.joined' : 'ca.not_ready');
    agToast({ kind: 'info', title: t('ca.cancelled'), message: porque });
}

// ─── Inicio de juego ──────────────────────────────────────────────────────
export function onGameStart(msg) {
    emitir('antesDePartida', msg);   // aún con la pantalla de antes
    est.allSets = msg.your_sets;       // 6 sets
    est.centerCards = msg.center_cards;
    // El que vuelve a media partida recibe el set en el que estaba. Ponerlo a 0
    // a secas dejaba al cliente mirando el set 0 mientras el servidor te tenía
    // en otro: soltabas del set que él creía, no del que veías.
    est.currentSetIndex = msg.current_set ?? 0;
    // Una partida nueva no arrastra bloqueos ni movimientos a medias.
    est.pendingDrop = null;
    est.pendingTake = null;
    diag.newGame();
    est.centerSlots = [];        // una partida nueva reparte la mesa de cero
    clearStun();
    clearDebtCountdown();
    resetCombo();
    clearGraceNotices();
    est.myFlippedSets = Array(6).fill(false);
    opponentFlippedSets.clear();
    est.verificationSent = false;

    // Registrar oponentes
    msg.players.filter(n => n !== est.currentNickname)
               .forEach(name => opponentFlippedSets.set(name, new Map()));

    // Quien mira: el orden de la mesa para «Mirando desde». La foto y la tabla de
    // cartas llegan en sus propios mensajes, justo detrás de este.
    est.specOrden = msg.players.slice();
    est.specState = null;
    est.specVista = null;
    est.specSet = null;

    buildSetNav();
    renderCenterCards();
    renderYourCards();
    updateFlipBtn();
    renderPlayersProgress(msg.players.map(n => ({ nickname: n, completed_sets: 0, finished: false, on_fire: false })));

    startMusic();
    // El silencio se recuerda entre partidas.
    const mb = document.getElementById('muteBtn');
    if (mb) { mb.textContent = est.sfxMuted ? '🔇' : '🔊'; }

    aplicarModoEspectador();
    showScreen('gameScreen');
    emitir('onGameStart', msg);
}

/** Un espectador no tiene sets ni botones: ve el centro y el marcador.
 *
 *  El servidor ya ignora todo lo que mande (hay un guardia en
 *  `handle_client_message`); esto es para que la interfaz no prometa algo que
 *  no va a pasar. */
function aplicarModoEspectador() {
    const board = document.getElementById('gameScreen');
    if (board) board.classList.toggle('espectador', est.soyEspectador);
    let banda = document.getElementById('espectadorBanda');
    if (est.soyEspectador && !banda) {
        banda = document.createElement('div');
        banda.id = 'espectadorBanda';
        const texto = document.createElement('span');
        texto.textContent = sinEmoji(t('spec.watching'));
        // Mirando no hay «Salir de la sala» en ninguna otra parte del tablero.
        const salir = document.createElement('button');
        salir.type = 'button';
        salir.textContent = t('spec.leave');
        salir.onclick = () => { stopMusic(); leaveLobby(); };
        // Alterna esperar plaza para la próxima partida (`enCola`).
        const jugar = document.createElement('button');
        jugar.type = 'button';
        jugar.id = 'rolPartidaBtn';
        jugar.onclick = () => send({ type: 'set_spectator', spectate: enCola });
        banda.append(texto, jugar, salir);
        board.prepend(banda);
        pintarRol();
    } else if (!est.soyEspectador && banda) {
        banda.remove();
    }
    if (!est.soyEspectador) resetEspectador();
}

