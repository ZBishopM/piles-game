// ─── Estado ───────────────────────────────────────────────────────────────
import type { CardInfo } from '../tipos/CardInfo';
import type { ServerMessage } from '../tipos/ServerMessage';

/** El mensaje del servidor de tipo `T` (client/tipos, generado de messages.rs). */
export type Msg<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>;
/** Un set: seis huecos, null = carta soltada sin tapar. */
export type Set6 = (CardInfo | null)[];
type Timer = ReturnType<typeof setTimeout>;

// El rótulo de las cartas en pelea sale del CSS (::after): se lee de esta variable.
document.documentElement.style.setProperty('--t-peleada', JSON.stringify(t('card.fought')));
/** Un elemento de lobby.html que tiene que estar: si falta, error claro aquí y no un
 *  «cannot read properties of null» lejos. Para los opcionales, getElementById y `?.`. */
export function porId<T extends HTMLElement = HTMLElement>(id: string): T {
    const el = document.getElementById(id);
    if (!el) throw new Error(`falta #${id} en lobby.html`);
    return el as T;
}

/** Tu nombre: el campo de la mesa (#nombre). La mesa lo guarda en piles_nickname al escribir. */
export const miNombre = () => (document.querySelector<HTMLInputElement>('#nombre')?.value ?? '').trim();

interface Estado {
    ws: WebSocket | null;
    currentPlayerId: string; currentLobbyId: string; currentNickname: string;
    isReady: boolean; gameOver: boolean;
    allSets: Set6[]; centerCards: CardInfo[]; currentSetIndex: number; myFlippedSets: boolean[];
    soyEspectador: boolean; mirones: number;
    pingInterval: Timer | null; pingSentAt: number; lastPingAt: number; lastRtt: number | null;
    pendingPongSince: number; reconnectAttempt: number; reconnectTimer: Timer | null;
    codigoPendiente: string; rejoinInFlight: boolean; seatToken: string | null;
    specState: Msg<'spectator_state'> | null; specOrden: string[]; specVista: string | null; specSet: number | null;
    centerSlots: (number | null)[];
    sfxMuted: boolean;
    /** Soltada y pintada ya en el centro (por adelantado); `set`: de qué set salió, para deshacerla. */
    pendingDrop: { index: number; set: number; card: CardInfo; t: number } | null;
    /** Cogida por adelantado: la carta ya está pintada en `set`/`slot` de tu mano. */
    pendingTake: { centerIndex: number; card: CardInfo; t: number; set: number; slot: number } | null;
    /** Revelado pedido con una cogida aún sin confirmar: sale al confirmarse (flipCurrentSet). */
    volteoEnEspera: number | null;
    qteActive: boolean; qteTimerInterval: Timer | null; qtePlayers: string[];
    qteContestedCard: CardInfo | null; qteMyCardId: number | null; qteContestedIndex: number | null;
    qteWonSlot: { card: CardInfo; index: number | null } | null; qteResultTimer: Timer | null;
    verificationSent: boolean;
}

/** Lo que cambian varios archivos: aquí y solo aquí, como `est.x`. */
export const est: Estado = {
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

    // Red (red.ts): el código del enlace ?join=, hasta entrar con él; volver a la sala.
    codigoPendiente: '',
    rejoinInFlight: false,
    seatToken: null,

    // Espectador (espectador.ts)
    specState: null,      // la última foto
    specOrden: [],        // los jugadores en el orden de la mesa
    specVista: null,      // a quién se mira: su apodo, o '*' = todos
    specSet: null,        // set elegido a mano; null = el que tiene abierto el jugador

    // Tablero (tablero.ts): ids de carta por hueco del centro, o null si está libre.
    centerSlots: [],
    // Sonido (sonido.ts)
    sfxMuted: false,

    // Toques (toques.ts): la carta soltada o cogida que espera respuesta del servidor.
    pendingDrop: null,
    pendingTake: null,
    volteoEnEspera: null,

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

    // Verificación (verificacion.ts)
    verificationSent: false,
};

// Map<playerName, Map<setIndex, CardInfo|null>>
export const opponentFlippedSets = new Map<string, Map<number, CardInfo | null>>();

// Verificaciones en curso de otros jugadores: Map<playerName, HTMLElement>
export const otherVerifications = new Map<string, HTMLElement>();

// Id de la carta del centro en disputa, para todos los clientes
// (participantes y espectadores) — pinta esa carta en rojo y las demás
// como "esperando", ya que el servidor bloquea todo intercambio mientras
// dura el QTE. Por id y no por posición: es lo que la identifica de verdad.
// Cartas en disputa AHORA MISMO, por id. Es un conjunto y no un id suelto
// porque puede haber dos peleas a la vez: con una sola variable, la segunda
// borraba a la primera y su carta se quedaba sin marcar.
export const qteBlockedCards = new Set<number>();

// Perro guardián de la conexión: si un ping lleva tanto sin su pong, el socket
// está muerto aunque el navegador no lo sepa (con la red caída tarda minutos en
// avisar) y se vuelve a conectar sin esperarle.
export const PONG_TIMEOUT_MS = 9000;

// Reconexión: el overlay ya traía un botón "Reconectar", pero había que
// encontrarlo y pulsarlo. La partida sigue viva en el servidor y volver es lo
// único que quiere el jugador, así que se reintenta solo. El botón se queda
// como "ahora mismo, sin esperar".
export const RECONNECT_MAX_DELAY = 15000;
