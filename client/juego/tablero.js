// ─── Renderizado ──────────────────────────────────────────────────────────
import { emitir } from './bus.js';
import { est, opponentFlippedSets, qteBlockedCards } from './estado.js';
import { send } from './red.js';
import { comboStep, playSfx } from './sonido.js';
import { musicFromCombo } from './musica.js';
import { owesCard, updateOwingUi, resetSwapHintLater, updateSwapHint, switchSet, updateFlipBtn } from './toques.js';
import { checkAutoVerify } from './verificacion.js';

export function buildSetNav() {
    const nav = document.getElementById('setNav');
    nav.innerHTML = '';
    for (let i = 0; i < 6; i++) {
        const btn = document.createElement('button');
        btn.className = 'set-btn' + (i === 0 ? ' active' : '');
        btn.dataset.idx = i;
        btn.innerHTML = `${esc(t('set.n', { n: i + 1 }))}<span class="set-eye"></span>`;
        btn.onclick = () => switchSet(i);
        nav.appendChild(btn);
    }
}

export function updateSetNav() {
    const owing = owesCard();
    document.querySelectorAll('.set-btn').forEach((btn, i) => {
        const flipped = est.myFlippedSets[i];
        btn.className = 'set-btn'
            + (i === est.currentSetIndex ? ' active' : '')
            + (flipped ? ' flipped' : '');
        btn.querySelector('.set-eye').textContent = flipped ? '👁' : '';
        // Se repinta aquí y no solo en updateOwingUi porque esta función
        // reescribe className en cada render y las dos tienen que coincidir.
        btn.disabled = owing;
    });
    // El "Set 3 / 6" de la cabecera se fue: los propios botones de set ya
    // marcan cuál está abierto, y era una línea de texto más ocupando alto.
    updateFlipBtn();
    checkAutoVerify();
    emitir('updateSetNav');
}

// ─── El centro no se recoloca ─────────────────────────────────────────────
// El servidor guarda el centro en una lista: al coger una carta desaparece de
// en medio y TODAS las de detrás se corren un sitio. Estabas apuntando a una
// carta y se te movía debajo del dedo.
//
// Aquí cada carta se queda en su hueco. Cuando alguien se la lleva, el hueco
// se queda vacío en vez de cerrarse, y la siguiente carta soltada ocupa el
// primer hueco libre. Nada de lo que sigue en la mesa se mueve. Los huecos
// están en `est.centerSlots`.

function syncCenterSlots() {
    const present = new Set(est.centerCards.map(c => c.id));
    // Los que ya no están dejan su sitio libre.
    est.centerSlots = est.centerSlots.map(id => (id !== null && present.has(id)) ? id : null);
    // Las nuevas van al primer hueco libre; si no hay, al final.
    const placed = new Set(est.centerSlots.filter(id => id !== null));
    for (const card of est.centerCards) {
        if (placed.has(card.id)) continue;
        const free = est.centerSlots.indexOf(null);
        if (free === -1) est.centerSlots.push(card.id);
        else est.centerSlots[free] = card.id;
        placed.add(card.id);
    }
    // Recortar huecos del final: eso no mueve nada de lo que queda.
    while (est.centerSlots.length && est.centerSlots[est.centerSlots.length - 1] === null) {
        est.centerSlots.pop();
    }
}

/** Ángulo y desplazamiento fijos de una carta, sacados de su id.
 *  Deterministas a propósito: así la misma carta está igual de torcida en la
 *  pantalla de todos, y al ir en % escala con el tamaño que use cada
 *  dispositivo — misma imagen, cada uno a su escala. */
function thrownStyle(cardId) {
    // Hash pequeño y estable; los tres valores salen de bits distintos para que
    // no queden correlacionados.
    const h = (cardId * 2654435761) >>> 0;
    const angle = ((h % 241) / 240 - 0.5) * 24;        // ±12°
    // `>>>`, no `>>`: con signo, un hash ≥ 2³¹ daba negativo y el % también,
    // y la carta subía hasta un −11 % y tapaba el rótulo "Centro".
    const dx = (((h >>> 8) % 101) / 100 - 0.5) * 10;   // ±5 % del ancho
    const dy = (((h >>> 16) % 101) / 100 - 0.5) * 10;  // ±5 % del alto
    return { angle, dx, dy };
}

export function renderCenterCards() {
    const div = document.getElementById('centerCards');
    if (!div) return;
    syncCenterSlots();
    div.innerHTML = '';

    for (const id of est.centerSlots) {
        if (id === null) {
            // Hueco vacío: ocupa sitio para que no se mueva nada, y no se puede
            // tocar.
            const gap = document.createElement('div');
            gap.className = 'card center-gap';
            div.appendChild(gap);
            continue;
        }
        const card = est.centerCards.find(c => c.id === id);
        if (!card) continue;

        const el = buildCard(card);
        const { angle, dx, dy } = thrownStyle(card.id);
        el.style.setProperty('--throw-rot', `${angle}deg`);
        el.style.setProperty('--throw-x', `${dx}%`);
        el.style.setProperty('--throw-y', `${dy}%`);
        el.classList.add('thrown');
        // La que estás cogiendo sigue marcada aunque el centro se redibuje
        // mientras llega la respuesta (300 ms de ventana de pelea + la red).
        if (est.pendingTake?.card.id === card.id) el.classList.add('card-pending');
        // Peleando: se apaga todo, porque no puedes hacer otra cosa.
        // Mirando: el tablero se queda como estaba. Apagarlo entero mientras
        // pelean otros dos distraía y encima no hacía falta — puedes seguir
        // jugando. Lo único intocable es la carta en disputa.
        if (qteBlockedCards.size) {
            if (qteBlockedCards.has(card.id)) {
                el.classList.add(est.qteActive ? 'qte-locked' : 'qte-contested');
            } else if (est.qteActive) {
                el.classList.add('qte-waiting');
            }
        }
        // El id va en el elemento, no en un closure: quien escucha es el
        // contenedor, que sobrevive a los redibujados. Ver `bindTap`.
        el.dataset.tap = card.id;
        div.appendChild(el);
    }
    emitir('renderCenterCards');
}

export function renderYourCards() {
    const div = document.getElementById('yourCards');
    div.innerHTML = '';
    const set = est.allSets[est.currentSetIndex] || [];
    set.forEach((card, i) => {
        // Un hueco vacío es una carta soltada que aún no se ha repuesto.
        if (!card) {
            const gap = document.createElement('div');
            gap.className = 'card card-empty';
            gap.title = t('card.gap');
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

// Último progreso recibido. El marcador también se repinta cuando alguien
// revela un set, y ese mensaje no trae el progreso.
let lastProgress = [];

/** El marcador entero: una franja por jugador, hasta 8, en rejilla.
 *
 *  Cada franja dice lo mismo de un vistazo: quién es, cuántos sets lleva
 *  cerrados y cuáles ha enseñado. Antes eso vivía en dos sitios —una tira de
 *  etiquetas arriba y un panel al final del tablero—, y el de abajo crecía
 *  según la gente iba revelando hasta empujar las cartas fuera de la pantalla. */
export function renderPlayersProgress(progress) {
    if (progress) lastProgress = progress;
    const hud = document.getElementById('hud');
    if (!hud) return;
    hud.innerHTML = '';

    lastProgress.slice(0, 8).forEach(p => {
        const esMio = p.nickname === est.currentNickname;
        const stripe = document.createElement('div');
        stripe.className = 'hud-stripe'
            + (esMio ? ' is-me' : '')
            + (p.finished ? ' finished' : '')
            // on_fire se difunde a todos a propósito: ver quién está encadenando
            // es lo que da ganas de ir a quitarle una carta.
            + (p.on_fire ? ' on-fire' : '');

        const name = document.createElement('span');
        name.className = 'hud-name';
        name.textContent = p.nickname;
        name.title = p.nickname;
        stripe.appendChild(name);

        const slots = document.createElement('span');
        slots.className = 'hud-slots';
        const revelados = esMio ? misSetsRevelados() : (opponentFlippedSets.get(p.nickname) || new Map());
        for (let i = 0; i < 6; i++) {
            const dot = document.createElement('i');
            const card = revelados.get(i);
            if (card) {
                dot.className = 'hud-dot revealed';
                applyCardSprite(dot, card);
                dot.title = t('hud.revealed', { set: i + 1, name: cardName(card.clothing_type, card.name) });
            } else {
                dot.className = 'hud-dot';
                dot.title = t('hud.hidden', { set: i + 1 });
            }
            slots.appendChild(dot);
        }
        stripe.appendChild(slots);

        const count = document.createElement('span');
        count.className = 'hud-count';
        count.textContent = p.completed_sets;
        count.title = t('hud.closed', { n: p.completed_sets });
        stripe.appendChild(count);

        hud.appendChild(stripe);
    });

    // Saber que te ven es la mitad de que haya espectadores, así que la cuenta
    // se enseña a todos. Con cero —el caso normal— no se enseña nada.
    if (est.mirones > 0) {
        const chip = document.createElement('div');
        chip.className = 'hud-stripe mirones';
        chip.textContent = `👁 ${est.mirones}`;
        chip.title = t('hud.watching', { n: est.mirones });
        hud.appendChild(chip);
    }
    emitir('renderPlayersProgress', progress);
}

/** Mis propios sets revelados, en el mismo formato que los de los rivales. */
export function misSetsRevelados() {
    const m = new Map();
    for (let i = 0; i < 6; i++) {
        if (!est.myFlippedSets[i]) continue;
        const set = est.allSets[i] || [];
        const card = set.find(c => c);
        if (card) m.set(i, card);
    }
    return m;
}


// ─── Entorno de pruebas ───────────────────────────────────────────────────
// El despliegue beta corre en su propio host, proceso y checkout, así que
// romper algo ahí no toca a quien está jugando en producción. Además no se
// vincula con Session Manager: los testers no necesitan cuenta, y sus
// partidas de prueba no ensucian perfiles reales.
export const IS_BETA = location.hostname.startsWith('beta.');

// ─── De quién es el Elo ───────────────────────────────────────────────────
// Por defecto, de este navegador (`anon:<uuid>`). Si se vincula una cuenta de
// Session Manager, de la cuenta (`sm:<id>`). El servidor lo guarda por clave;
// ver server/src/ratings.rs.
export function ratingKey() {
    try {
        const cuenta = localStorage.getItem('piles_rating_key');
        if (cuenta) return cuenta;
        let anon = localStorage.getItem('piles_anon_id');
        if (!anon) {
            anon = crypto.randomUUID();
            localStorage.setItem('piles_anon_id', anon);
        }
        return `anon:${anon}`;
    } catch {
        return null;   // sin almacenamiento: se juega sin Elo
    }
}

export function applyBetaMode() {
    if (!IS_BETA) return;
    // El perfil se queda: ahí está el Elo, que en beta hay que poder probar.
    // Lo que no se hace en beta es sumar resultados a Session Manager (ver
    // claimSessionManagerResult).
    const badge = document.createElement('div');
    badge.textContent = 'BETA';
    badge.title = t('beta.title');
    badge.style.cssText = 'position:fixed;top:0;left:0;z-index:400;background:var(--warning);'
        + 'color:var(--bg);font-weight:bold;font-size:0.7rem;letter-spacing:0.1em;'
        + 'padding:2px 10px;border-bottom-right-radius:8px;pointer-events:none;';
    document.body.appendChild(badge);
}

// ─── Hoja de sprites ──────────────────────────────────────────────────────
// client/cards.webp: 16 columnas × 13 filas. Cada fila lleva 4 prendas y
// cada prenda 4 variantes de color seguidas, así que:
//   fila    = clothing_type / 4
//   columna = (clothing_type % 4) * 4 + variante
// La variante sale de `id % 4`: el servidor reparte los ids de 4 en 4 dentro
// de cada set, así que las 4 cartas iguales salen en 4 colores distintos.
// (La celda 8 de la última fila es el reverso; no se usa por ahora.)
const SPRITE_COLS = 16;
const SPRITE_ROWS = 13;

export function applyCardSprite(el, card) {
    const type = card.clothing_type ?? 0;
    const variant = (card.id ?? 0) % 4;
    const col = (type % 4) * 4 + variant;
    const row = Math.floor(type / 4);
    // Posición en % : índice / (total - 1). Encaja la celda exacta sin
    // depender de píxeles, así la carta escala con su contenedor.
    el.style.backgroundPosition =
        `${(col / (SPRITE_COLS - 1)) * 100}% ${(row / (SPRITE_ROWS - 1)) * 100}%`;
}

// Cartas en vuelo (ver flyCard): los redibujados las pintan escondidas.
// Esconder solo el nodo no basta, porque un redibujado a mitad de vuelo pone
// uno nuevo.
const flyingCards = new Set();

/** Nombre de una prenda en el idioma de la pestaña, por su tipo. El servidor
 *  manda el nombre en español (`name`), que queda de respaldo. */
export function cardName(type, fallback) {
    const k = `cloth.${type}`;
    return PilesI18n.has(k) ? t(k) : (fallback || '');
}

export function buildCard(card) {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.cardId = card.id;
    applyCardSprite(el, card);
    if (flyingCards.has(card.id)) el.style.visibility = 'hidden';
    return el;
}

// ─── Movimiento de cartas ─────────────────────────────────────────────────
// renderCenterCards/renderYourCards hacen innerHTML='' y reconstruyen todo,
// así que los nodos originales desaparecen en cada actualización. Por eso no
// se anima el nodo real: se mide antes, se deja que el tablero se redibuje, y
// se lanza una copia por encima que va del sitio viejo al nuevo.

export function cardRectAt(rowId, index) {
    const el = document.getElementById(rowId)?.children[index];
    return el ? el.getBoundingClientRect() : null;
}

/** Lanza una copia de la carta de `from` a `to`. Se borra sola al terminar. */
/** Vuela una copia de `cardData` desde `from` hasta el hueco `index` de
 *  `rowId`.
 *
 *  El tablero ya está redibujado cuando esto arranca, así que la carta de
 *  destino existe y se ve: si además volara una copia encima, se verían las
 *  dos a la vez (que es exactamente lo que pasaba). Por eso la de destino se
 *  esconde mientras dura el vuelo y se descubre justo cuando la copia llega.
 */
export function flyCard(cardData, from, rowId, index, won = false) {
    emitir('vuela', cardData, from);
    const dest = document.getElementById(rowId)?.children[index];
    const to = dest ? dest.getBoundingClientRect() : null;
    if (!cardData || !from || !to) { if (dest) markLanded(rowId, index, won); return; }

    const el = buildCard(cardData);
    el.style.left = `${from.left}px`;
    el.style.top = `${from.top}px`;
    el.style.width = `${from.width}px`;
    el.style.height = `${from.height}px`;
    document.getElementById('fxLayer').appendChild(el);
    dest.style.visibility = 'hidden';
    flyingCards.add(cardData.id);

    let done = false;
    // `land` es false al cortar el vuelo (cambio de set): el hueco `index`
    // ya es de otro set y el rebote caería sobre una carta que no se movió.
    const finish = (land = true) => {
        if (done) return;
        done = true;
        el.remove();
        flyingCards.delete(cardData.id);
        // Descubrir SIEMPRE, pase lo que pase con la transición: una carta
        // invisible para siempre sería mucho peor que ver la copia de más.
        // El nodo de ahora, que puede no ser `dest` si hubo redibujado.
        const row = document.getElementById(rowId);
        row?.querySelectorAll('.card').forEach(c => { if (c.dataset.cardId == cardData.id) c.style.visibility = ''; });
        if (land) markLanded(rowId, index, won);
    };
    el.dataset.row = rowId;
    el.finishFlight = finish;

    // De centro a centro: la escala va desde el centro de la copia, así que
    // mover la esquina la dejaba desplazada la mitad de la diferencia de
    // tamaño (29 y 46 px en escritorio, donde tu mano es mucho mayor que el
    // centro; en móvil casi no se notaba).
    const dx = (to.left + to.width / 2) - (from.left + from.width / 2);
    const dy = (to.top + to.height / 2) - (from.top + from.height / 2);
    requestAnimationFrame(() => {
        el.style.transform = `translate(${dx}px, ${dy}px) scale(${to.width / from.width})`;
    });
    el.addEventListener('transitionend', finish, { once: true });
    // Red de seguridad por si la transición no llega a dispararse (pestaña en
    // segundo plano, por ejemplo).
    setTimeout(finish, 900);
}

/** Marca una carta recién llegada para que se vea qué ha cambiado.
 *  `won` la pinta en dorado y con más fuerza: es el premio de una pelea. */
export function markLanded(rowId, index, won = false) {
    // 'aterriza' puede cancelarlo: la partida espera a que llegue la carta que viene volando
    if (!emitir('aterriza', rowId, index, won)) return;
    const el = document.getElementById(rowId)?.children[index];
    if (!el) return;
    const cls = won ? 'card-won' : 'card-landed';
    el.classList.remove('card-landed', 'card-won');
    void el.offsetWidth;   // reinicia la animación si ya la tenía
    el.classList.add(cls);
    shakeBoard(won);
    if (won) sparkBurst(el.getBoundingClientRect());
}

// ─── Impacto ──────────────────────────────────────────────────────────────
// La partida va rápida y las cartas se mueven solas; sin un golpe visible es
// fácil no enterarse de que algo pasó. Nada de esto cambia el estado del
// juego: si falla, se pierde el adorno y no la partida.

export const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)');

/** El golpe de la carta al caer en la mesa. `hard` para las peleas ganadas.
 *  Lo pinta la partida (partida/partida.js, «Gravedad»). */
function shakeBoard(hard = false) {
    emitir('golpe', hard);
}

/** Chispas saliendo del centro de una carta. Van en #fxLayer porque .card
 *  recorta a sus hijos y ahí dentro no se verían. */
function sparkBurst(rect, count = 10) {
    if (REDUCED_MOTION?.matches) return;
    const layer = document.getElementById('fxLayer');
    if (!layer) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
        const dist = 50 + Math.random() * 60;
        const s = document.createElement('div');
        s.className = 'spark';
        s.style.left = `${cx}px`;
        s.style.top = `${cy}px`;
        s.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
        s.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
        layer.appendChild(s);
        s.addEventListener('animationend', () => s.remove(), { once: true });
        // Por si la animación no llega a dispararse (pestaña en segundo
        // plano): mismo motivo que la red de seguridad de flyCard.
        setTimeout(() => s.remove(), 1200);
    }
}

// ─── Alguien se cae ───────────────────────────────────────────────────────
// Antes esto cancelaba la partida de todos. Ahora se le espera y los demás
// siguen jugando, así que hay que decir qué está pasando: un aviso con cuenta
// atrás mientras se le espera, y otro si al final no vuelve.

let graceTimers = new Map();   // nickname -> intervalo de la cuenta atrás

function graceNotif(nickname) {
    const area = document.getElementById('verifyNotifications');
    if (!area) return null;
    let el = area.querySelector(`[data-grace="${CSS.escape(nickname)}"]`);
    if (!el) {
        el = document.createElement('div');
        el.className = 'qte-battle-notif';
        el.dataset.grace = nickname;
        area.appendChild(el);
    }
    return el;
}

function clearGrace(nickname) {
    const t = graceTimers.get(nickname);
    if (t) { clearInterval(t); graceTimers.delete(nickname); }
    document.querySelector(`[data-grace="${CSS.escape(nickname)}"]`)?.remove();
}

/** El aviso de `nickname` con un título y unas líneas de texto. Como texto, nunca
 *  como HTML: el servidor no filtra los apodos. Devuelve el aviso. */
export function pintarAviso(nickname, titulo, lineas) {
    const el = graceNotif(nickname);
    if (!el) return null;
    el.classList.remove('wait-poll');
    const t = document.createElement('div');
    t.className = 'qbn-title';
    t.textContent = titulo;
    el.replaceChildren(t, ...lineas.map(([texto, estilo]) => {
        const d = document.createElement('div');
        d.style.cssText = estilo || 'text-align:center';
        d.textContent = texto;
        return d;
    }));
    emitir('pintarAviso', el, nickname, titulo);
    return el;
}

export function onPlayerDisconnected(nickname, seconds) {
    if (!graceNotif(nickname)) return;
    clearInterval(graceTimers.get(nickname));

    let left = seconds;
    const paint = () => pintarAviso(nickname, `🔌 ${nickname}`, [[t('grace.down', { n: left })]]);
    paint();
    graceTimers.set(nickname, setInterval(() => {
        left -= 1;
        // Al acabar la cuenta el aviso se queda: llega la encuesta (o se va solo
        // si el servidor es de antes de ella).
        if (left <= 0) { clearInterval(graceTimers.get(nickname)); return; }
        paint();
    }, 1000));
}

export function onPlayerLeft(nickname, retired, types) {
    clearGrace(nickname);
    // Las prendas retiradas se nombran a propósito: explica por qué de pronto
    // hay cartas que ya no están, y lo convierte en mecánica y no en un fallo.
    const lineas = [[t('grace.gone')]];
    // `types` (ids de prenda) llega en servidores nuevos y se traduce; sin él,
    // los nombres en español que manda el servidor.
    const fuera = types && types.length ? types.map(ty => cardName(ty, '')) : retired;
    if (fuera && fuera.length) {
        lineas.push([t('grace.out', { list: fuera.join(t('list.sep')) }), 'font-size:0.72rem;opacity:0.8;margin-top:4px']);
    }
    pintarAviso(nickname, `🚪 ${nickname}`, lineas);
    setTimeout(() => clearGrace(nickname), 6000);
}

// ─── ¿Seguimos esperando? ─────────────────────────────────────────────────
// Si quien se cayó no vuelve en 30 s, el servidor pregunta a las personas que
// siguen: Sí = otros 30 s de espera, No = se cancela la partida (basta uno).
// Quien no contesta en el plazo cuenta como Sí. Quien mira solo lo ve.

export function onWaitPoll(nickname, seconds) {
    clearInterval(graceTimers.get(nickname));
    let left = seconds;
    let voto = null;
    const paint = () => {
        const lineas = [[t('wait.q', { n: left })]];
        if (voto !== null) lineas.push([t(voto ? 'wait.voted_wait' : 'wait.voted_cancel'), 'text-align:center;opacity:0.8;margin-top:4px']);
        const el = pintarAviso(nickname, `🔌 ${nickname}`, lineas);
        if (!el) return;
        el.classList.add('wait-poll');
        if (est.soyEspectador || voto !== null) return;
        const botones = document.createElement('div');
        botones.className = 'wait-poll-btns';
        for (const [texto, seguir] of [[t('wait.wait'), true], [t('wait.cancel'), false]]) {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = texto;
            b.className = seguir ? 'wp-si' : 'wp-no';
            b.addEventListener('click', () => {
                voto = seguir;
                send({ type: 'wait_poll_vote', nickname, keep_waiting: seguir });
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
    }, 1000));
}

export function onWaitPollClosed(nickname, result) {
    clearInterval(graceTimers.get(nickname));
    graceTimers.delete(nickname);
    if (result === 'volvio') {
        pintarAviso(nickname, `✅ ${nickname}`, [[t('grace.back')]]);
        setTimeout(() => clearGrace(nickname), 4000);
    } else if (result !== 'seguir') {
        // `seguir`: llega enseguida un `player_disconnected` con la nueva espera.
        // `cancelar`: llega `game_cancelled`, que limpia los avisos.
        clearGrace(nickname);
    }
}

/** Una partida nueva no arrastra avisos de la anterior. */
export function clearGraceNotices() {
    for (const n of [...graceTimers.keys()]) clearGrace(n);
    document.querySelectorAll('[data-grace]').forEach(el => el.remove());
}

// ─── Plazo para tapar el hueco ────────────────────────────────────────────
// Soltar una carta y no coger otra sale gratis mientras no haya plazo, y con
// varios jugadores el centro se queda fijo en 7 u 8 cartas. El servidor da 3 s
// y luego asigna una al azar; aquí solo se pinta la cuenta atrás, con la
// duración que él manda — igual que la barra del bloqueo.

let debtTimer = null;

export function startDebtCountdown(ms) {
    const bar = document.getElementById('debtBar');
    const fill = document.getElementById('debtBarFill');
    if (!bar || !fill) return;
    clearTimeout(debtTimer);

    bar.classList.add('active');
    fill.style.transition = 'none';
    fill.style.width = '100%';
    void fill.offsetWidth;   // sin reflow el navegador agrupa los dos cambios
    fill.style.transition = `width ${ms}ms linear`;
    fill.style.width = '0%';

    debtTimer = setTimeout(() => bar.classList.remove('active'), ms);
}

export function clearDebtCountdown() {
    clearTimeout(debtTimer);
    document.getElementById('debtBar')?.classList.remove('active');
}

export function onDebtForced(card) {
    clearDebtCountdown();
    updateSwapHint(t('debt.forced', { name: cardName(card.clothing_type, card.name) }));
    resetSwapHintLater(2500);
    emitir('onDebtForced', card);
}

// ─── Racha ────────────────────────────────────────────────────────────────
// El servidor es quien la calcula; aquí solo se pinta. La barra se vacía sola
// con la ventana que él manda, igual que la del bloqueo — así el cliente nunca
// puede enseñar un multiplicador que el servidor no reconoce.

let comboHideTimer = null;

/** Centésimas → "2" o "1,25". Sin decimales de relleno: x2 se lee mejor que
 *  x2,00, pero x1,25 necesita los suyos. Un solo sitio, porque el visor de
 *  grabaciones enseñaba x2,00 donde el juego enseña x2 y comparar los dos
 *  obligaba a traducir de cabeza. */
export function formatMult(x100) {
    return x100 % 100 === 0 ? String(x100 / 100)
                            : (x100 / 100).toFixed(2).replace('.', t('num.dec'));
}

export function renderCombo(msg) {
    const box = document.getElementById('comboBox');
    const mult = document.getElementById('comboMult');
    const fill = document.getElementById('comboBarFill');
    if (!box) return;

    clearTimeout(comboHideTimer);
    const board = document.getElementById('gameScreen');

    // El frenesí sobrevive a la racha, así que se pinta antes de cualquier
    // vuelta atrás: se gana llegando al precio y se guarda hasta gastarlo.
    updateFrenzyBtn(msg.frenzy_ready, msg.frenzy_cost_x100);
    // La música sigue a la racha. Aquí y en ningún otro sitio: este mensaje ya
    // llega en cada cambio, así que no hace falta vigilar nada aparte.
    musicFromCombo(msg.window_ms ? (msg.multiplier_x100 ?? 100) : 100, msg.frenzy_ready);
    // El escalón suena en cada jugada encadenada, y sube con la racha. Cerrar
    // un set salta +1,00 de golpe, así que se le da su propio remate.
    if (msg.window_ms && msg.points) {
        comboStep(msg.multiplier_x100 ?? 100);
        if (msg.points >= 20) playSfx('setDone');
    }

    // window_ms = 0 significa racha cortada.
    if (!msg.window_ms || msg.combo === 0) {
        box.classList.remove('active');
        delete board.dataset.comboTier;
        return;
    }

    box.classList.add('active');
    // Llega en centésimas (125 = x1,25) para que no viaje un decimal por el
    // cable ni cada cliente redondee a su manera.
    const x100 = msg.multiplier_x100 ?? 100;
    // En el tablero y no en el cartel: así el color del tramo lo heredan
    // también las cartas y el anillo de aterrizaje sube de temperatura.
    board.dataset.comboTier = String(Math.floor(x100 / 100));
    mult.textContent = `×${formatMult(x100)}`;

    mult.classList.remove('bump');
    void mult.offsetWidth;   // reinicia la animación si ya la tenía
    mult.classList.add('bump');

    // Reiniciar la barra al 100% sin transición y luego vaciarla en la
    // ventana real. Sin el reflow intermedio el navegador agrupa los dos
    // cambios y la barra no se movería.
    fill.style.transition = 'none';
    fill.style.width = '100%';
    void fill.offsetWidth;
    fill.style.transition = `width ${msg.window_ms}ms linear`;
    fill.style.width = '0%';

    // Cuando la ventana vence, el servidor no manda nada (expira de forma
    // perezosa en su siguiente acción), así que el cartel se esconde solo.
    comboHideTimer = setTimeout(() => box.classList.remove('active'), msg.window_ms);
}

/** Al empezar o terminar una partida no debe quedar racha de la anterior. */
export function resetCombo() {
    clearTimeout(comboHideTimer);
    musicFromCombo(100, false);
    document.getElementById('comboBox')?.classList.remove('active');
    const board = document.getElementById('gameScreen');
    if (board) delete board.dataset.comboTier;
    updateFrenzyBtn(false);
}

/** El botón de frenesí solo existe cuando hay uno cargado.
 *
 *  `coste` es lo que costará el SIGUIENTE, que sube medio punto cada vez que
 *  gastas uno. Se enseña en el título porque si no, la segunda vez el
 *  multiplicador parece atascarse antes de llegar arriba sin explicación. */
export function updateFrenzyBtn(ready, coste) {
    const btn = document.getElementById('frenzyBtn');
    if (!btn) return;
    if (coste) {
        btn.title = t('frenzy.title', { cost: formatMult(coste) });
        btn.setAttribute('aria-label', btn.title);
    }
    const antes = !btn.hidden;
    btn.hidden = !ready;
    // Al aparecer se anuncia con el mismo golpe que el multiplicador: es el
    // premio de haber llegado arriba, no un botón más.
    if (ready && !antes) {
        btn.classList.remove('pop');
        void btn.offsetWidth;
        btn.classList.add('pop');
        playSfx('frenzyReady');
    }
    // El cartel de la racha tiene que verse aunque la racha esté cortada, o el
    // botón se iría con ella.
    if (ready) document.getElementById('comboBox')?.classList.add('active');
    emitir('updateFrenzyBtn', ready, coste);
}

export function fireFrenzy() {
    const btn = document.getElementById('frenzyBtn');
    if (!btn || btn.hidden) return;
    btn.hidden = true;          // sin doble envío mientras contesta el servidor
    playSfx('frenzyFire');
    send({ type: 'frenzy' });
}

/** Alguien soltó un frenesí. Quien lo paró se entera de que le ha servido. */
export function onFrenzyFired(msg) {
    const yoParé = (msg.countered || []).includes(est.currentNickname);
    const yoLoSolté = msg.player === est.currentNickname;
    playSfx(yoParé ? 'frenzyCounter' : 'frenzyHit');

    const board = document.getElementById('gameScreen');
    if (board && !REDUCED_MOTION?.matches) {
        board.classList.remove('frenzy-flash');
        void board.offsetWidth;
        board.classList.add('frenzy-flash');
        setTimeout(() => board.classList.remove('frenzy-flash'), 700);
    }

    if (yoParé) {
        updateSwapHint(t('frenzy.countered'));
        resetSwapHintLater(2200);
    } else if (!yoLoSolté && (msg.stunned || []).includes(est.currentNickname)) {
        // El bloqueo ya se anuncia con su propia barra; aquí solo se dice de
        // quién vino, que es lo que no se sabría.
        updateSwapHint(t('frenzy.by', { nick: msg.player }));
        resetSwapHintLater(2200);
    }
    emitir('onFrenzyFired', msg);
}

/** Destello del centro: alguien más ha movido algo ahí. */
export function flashCenter() {
    if (REDUCED_MOTION?.matches) return;
    const row = document.getElementById('centerCards');
    if (!row) return;
    row.classList.remove('flash');
    void row.offsetWidth;
    row.classList.add('flash');
    row.addEventListener('animationend', () => row.classList.remove('flash'), { once: true });
}

/** La carta se inclina hacia el puntero. Es el gesto que más "peso" da, y
 *  sale gratis: se escuchan los eventos en las filas (no en cada carta, que
 *  se reconstruyen constantemente) y solo se tocan dos variables CSS.
 *  Sin puntero de verdad no se activa: en táctil no hay hacia dónde apuntar. */
export function initCardTilt() {
    if (!window.matchMedia?.('(hover: hover)').matches) return;
    const MAX = 9;   // grados; más que esto y las cartas se deforman

    for (const rowId of ['centerCards', 'yourCards']) {
        const row = document.getElementById(rowId);
        if (!row) continue;

        row.addEventListener('pointermove', (e) => {
            if (REDUCED_MOTION?.matches) return;
            const card = e.target.closest('.card');
            if (!card || !row.contains(card)) return;
            const r = card.getBoundingClientRect();
            const px = (e.clientX - r.left) / r.width - 0.5;   // -0.5 … 0.5
            const py = (e.clientY - r.top) / r.height - 0.5;
            card.style.setProperty('--tilt-y', `${px * MAX * 2}deg`);
            card.style.setProperty('--tilt-x', `${-py * MAX * 2}deg`);
        });

        // pointerout cubre salir de la fila y saltar entre cartas; sin esto la
        // carta se queda torcida al alejarse.
        row.addEventListener('pointerout', (e) => {
            const card = e.target.closest('.card');
            if (!card) return;
            card.style.setProperty('--tilt-x', '0deg');
            card.style.setProperty('--tilt-y', '0deg');
        });
    }
}

