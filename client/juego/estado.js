// ─── Estado ───────────────────────────────────────────────────────────────
// El rótulo de las cartas en pelea sale del CSS (::after): se lee de esta variable.
document.documentElement.style.setProperty('--t-peleada', JSON.stringify(t('card.fought')));
// Cambiar de idioma recarga la página (ver i18n.js): se recuerda la pantalla para volver a ella.
window.onBeforeLangChange = () => {
    try {
        const v = miNombre();
        if (v) localStorage.setItem('piles_nickname', v);
        sessionStorage.setItem('piles.afterLang', vistaActual);
    } catch { /* sin storage */ }
};
/** Tu nombre: el campo de la mesa (#nombre). La mesa lo guarda en piles_nickname al escribir. */
const miNombre = () => (document.getElementById('nombre')?.value ?? '').trim();
let ws = null;
let currentPlayerId = '';
let currentLobbyId = '';
let currentNickname = '';
let isReady = false;
let gameOver = false;

let allSets = [];          // Vec<Vec<CardInfo>> - todos los sets del jugador
let centerCards = [];      // Vec<CardInfo>
let currentSetIndex = 0;

// Estado de sets volteados
let myFlippedSets = Array(6).fill(false);
// Map<playerName, Map<setIndex, CardInfo|null>>
const opponentFlippedSets = new Map();
// Entraste con la partida ya empezada: miras, no juegas.
let soyEspectador = false;
// Cuánta gente está mirando. Llega en `game_update` y `lobby_update`.
let mirones = 0;

// Selección para intercambio

// Verificaciones en curso de otros jugadores: Map<playerName, HTMLElement>
const otherVerifications = new Map();

// Estado QTE
let qteActive = false;
let qteTimerInterval = null;
// Id de la carta del centro en disputa, para todos los clientes
// (participantes y espectadores) — pinta esa carta en rojo y las demás
// como "esperando", ya que el servidor bloquea todo intercambio mientras
// dura el QTE. Por id y no por posición: es lo que la identifica de verdad.
// Cartas en disputa AHORA MISMO, por id. Es un conjunto y no un id suelto
// porque puede haber dos peleas a la vez: con una sola variable, la segunda
// borraba a la primera y su carta se quedaba sin marcar.
const qteBlockedCards = new Set();

// Keep-alive, y de paso la medida del ping. lastRtt viaja con el ping
// siguiente: es la única forma de que el servidor sepa la latencia de cada
// uno, porque medirla desde su lado es imposible.
let pingInterval = null;
let pingSentAt = 0;
let lastPingAt = 0;
let lastRtt = null;

// Perro guardián de la conexión: si un ping lleva tanto sin su pong, el socket
// está muerto aunque el navegador no lo sepa (con la red caída tarda minutos en
// avisar) y se vuelve a conectar sin esperarle.
let pendingPongSince = 0;
const PONG_TIMEOUT_MS = 9000;

// Reconexión: el overlay ya traía un botón "Reconectar", pero había que
// encontrarlo y pulsarlo. La partida sigue viva en el servidor y volver es lo
// único que quiere el jugador, así que se reintenta solo. El botón se queda
// como "ahora mismo, sin esperar".
let reconnectAttempt = 0;
let reconnectTimer = null;
const RECONNECT_MAX_DELAY = 15000;

