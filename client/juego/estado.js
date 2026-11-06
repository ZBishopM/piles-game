// ─── Estado ───────────────────────────────────────────────────────────────
// El rótulo de las cartas en pelea sale del CSS (::after): se lee de esta variable.
document.documentElement.style.setProperty('--t-peleada', JSON.stringify(t('card.fought')));
/** Tu nombre: el campo de la mesa (#nombre). La mesa lo guarda en piles_nickname al escribir. */
export const miNombre = () => (document.getElementById('nombre')?.value ?? '').trim();

/** Lo que cambian varios archivos: aquí y solo aquí, como `est.x`. */
export const est = {
    ws: null,
    currentPlayerId: '',
    currentLobbyId: '',
    currentNickname: '',
    isReady: false,
    gameOver: false,

    allSets: [],          // Vec<Vec<CardInfo>> - todos los sets del jugador
    centerCards: [],      // Vec<CardInfo>
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
    codigoPendiente: '',
    rejoinInFlight: false,
    seatToken: null,

    // Espectador (espectador.js)
    specState: null,      // la última foto
    specOrden: [],        // los jugadores en el orden de la mesa
    specVista: null,      // a quién se mira: su apodo, o '*' = todos
    specSet: null,        // set elegido a mano; null = el que tiene abierto el jugador

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
    qtePlayers: [],         // Jugadores en la pelea actual
    qteContestedCard: null, // La carta por la que se pelea
    qteMyCardId: null,      // Su id, aunque la carta ya no esté en el centro: sin esto,
                            // mi pelea no se reconoce como mía si el centro cambió justo al empezar.
    qteContestedIndex: null, // En qué hueco del centro estaba
    qteWonSlot: null,       // Si ganaste: carta y hueco de origen, para el vuelo
    qteResultTimer: null,   // Temporizador del resultado — separado de qteTimerInterval,
                            // que lo comparten la cuenta atrás del participante y la del espectador.

    // Verificación (verificacion.js)
    verificationSent: false,
};

// Map<playerName, Map<setIndex, CardInfo|null>>
export const opponentFlippedSets = new Map();

// Verificaciones en curso de otros jugadores: Map<playerName, HTMLElement>
export const otherVerifications = new Map();

// Id de la carta del centro en disputa, para todos los clientes
// (participantes y espectadores) — pinta esa carta en rojo y las demás
// como "esperando", ya que el servidor bloquea todo intercambio mientras
// dura el QTE. Por id y no por posición: es lo que la identifica de verdad.
// Cartas en disputa AHORA MISMO, por id. Es un conjunto y no un id suelto
// porque puede haber dos peleas a la vez: con una sola variable, la segunda
// borraba a la primera y su carta se quedaba sin marcar.
export const qteBlockedCards = new Set();

// Perro guardián de la conexión: si un ping lleva tanto sin su pong, el socket
// está muerto aunque el navegador no lo sepa (con la red caída tarda minutos en
// avisar) y se vuelve a conectar sin esperarle.
export const PONG_TIMEOUT_MS = 9000;

// Reconexión: el overlay ya traía un botón "Reconectar", pero había que
// encontrarlo y pulsarlo. La partida sigue viva en el servidor y volver es lo
// único que quiere el jugador, así que se reintenta solo. El botón se queda
// como "ahora mismo, sin esperar".
export const RECONNECT_MAX_DELAY = 15000;
