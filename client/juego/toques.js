// ─── Toques ───────────────────────────────────────────────────────────────
// Por qué no un `onclick` en cada carta, que es lo que había:
//
// Un `click` solo existe si el dedo baja Y sube sobre el MISMO elemento. El
// centro se redibuja entero (`innerHTML = ''`) cada vez que otro jugador mueve
// una carta, así que si ese redibujado cae entre que apoyas el dedo y lo
// levantas —una ventana de milisegundos que con tres rivales pasa a todas
// horas— la carta que estabas pulsando deja de existir y el toque se pierde sin
// más. De ahí el "hay que darle dos veces" o "hay que apretar más fuerte". No
// era el servidor: era el cliente borrando el botón que tenías debajo del dedo.
//
// Aquí escucha el contenedor, que no se redibuja nunca, y la carta se apunta al
// bajar el dedo. Lo que haya pasado con el DOM mientras tanto da igual.
//
// Se dispara al BAJAR el dedo siempre que se pueda, que es lo que se siente
// instantáneo. La excepción es cuando el contenedor puede desplazarse CON EL
// DEDO: en móvil el centro tiene altura fija y scroll propio, y ahí disparar al
// bajar convertiría cada intento de deslizar en una carta cogida sin querer. Se
// mira en el momento, no una vez: el centro solo desborda cuando hay cartas de
// sobra, así que la mayor parte del tiempo responde al bajar el dedo.
//
// Dos cosas que no se miraban y costaban toques (medido el 2026-09-30):
// - Con RATÓN no hay gesto de scroll que confundir con un clic. Pero
//   `scrollHeight > clientHeight` daba verdadero SIEMPRE en escritorio: las
//   cartas giradas desbordan el contenedor unos 18 px aunque su overflow es
//   `visible`. Resultado: en escritorio el clic esperaba a soltar el botón y se
//   descartaba, en silencio, si te movías más de 12 px, tardabas más de 700 ms
//   o el puntero salía del contenedor. Ahora el ratón siempre dispara al bajar.
// - Desbordar no es poder desplazarse: hace falta además un `overflow-y` que
//   lo permita (`auto`/`scroll`).
//
// Y lo que se descarta ya no es mudo: queda anotado (`tap_ignored`) para poder
// saber, en la grabación, por qué un toque no llegó al servidor.
const TAP_SLOP_PX = 12;      // más que esto, era un arrastre
const TAP_MAX_MS = 700;      // más que esto, era mantener pulsado

// `alSoltar`: el toque cuenta al soltar, si no se movió más de TAP_SLOP_PX. Lo usan TUS
// cartas: sobre ellas ↓ / ↑ / ← → son gestos (revelar el set, cambiar de set, gestos.js)
// y, contando al bajar, cada gesto soltaba la carta donde empezaba. Las del centro siguen
// contando al bajar: ahí se pelea por milisegundos.
function bindTap(container, handler, target = '?', { alSoltar = false } = {}) {
    if (!container) {
        // Sin esto el juego se queda mudo y sin decir por qué.
        console.error('[piles] falta el contenedor de cartas: no habrá toques');
        return;
    }
    let start = null;

    // ¿Puede desplazarse AHORA MISMO este contenedor? Solo entonces un gesto
    // con el dedo puede ser un scroll y no un toque.
    const canScroll = () => {
        const oy = getComputedStyle(container).overflowY;
        return (oy === 'auto' || oy === 'scroll')
            && container.scrollHeight > container.clientHeight + 2;
    };

    const ignorado = (reason, s, extra = {}) => diag.note('tap_ignored', {
        reason, target, pointer: s.pointer, ms: Date.now() - s.t, ...extra,
    });

    container.addEventListener('pointerdown', (e) => {
        start = null;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const el = e.target.closest('[data-tap]');
        if (!el || !container.contains(el)) return;
        start = {
            tap: el.dataset.tap, x: e.clientX, y: e.clientY, t: Date.now(), el,
            fired: false, pointer: e.pointerType,
        };
        // Confirmación inmediata, sin esperar al servidor: el toque se ve
        // acusado aunque la respuesta tarde.
        el.classList.add('tapped');

        if (!alSoltar && (e.pointerType === 'mouse' || !canScroll())) {
            start.fired = true;
            handler(start.tap, el);
        }
    });

    const cancel = (e) => {
        if (start) {
            start.el.classList.remove('tapped');
            // Solo si aún no se había hecho: lo que ya se disparó al bajar no
            // se perdió.
            if (!start.fired) ignorado(e?.type === 'pointerleave' ? 'left' : 'cancel', start);
        }
        start = null;
    };
    container.addEventListener('pointercancel', cancel);
    container.addEventListener('pointerleave', cancel);

    container.addEventListener('pointerup', (e) => {
        if (!start) return;
        const s = start;
        start = null;
        s.el.classList.remove('tapped');
        if (s.fired) return;          // ya se hizo al bajar el dedo
        const dist = Math.round(Math.hypot(e.clientX - s.x, e.clientY - s.y));
        if (dist > TAP_SLOP_PX) return ignorado('moved', s, { dist });
        if (Date.now() - s.t > TAP_MAX_MS) return ignorado('slow', s, { dist });
        handler(s.tap, s.el);
    });
}

/** Coger una carta se pinta YA, sin esperar al servidor.
 *
 *  El viaje de ida y vuelta se nota, y mientras dura no pasaba nada en pantalla.
 *  Así que la carta se mete en tu hueco en cuanto la tocas, en fantasma. Si el
 *  servidor la confirma, la sustituye la de verdad y no se ha visto ni un
 *  parpadeo. Si llegaste tarde, `rollbackGhost` la deshace.
 *
 *  Solo al coger: soltar no tiene con qué equivocarse —la carta es tuya— y la
 *  animación de vuelo ya la cubre. */
function showGhost(card) {
    const div = document.getElementById('yourCards');
    if (!div) return;
    const slot = (allSets[currentSetIndex] || []).findIndex(c => !c);
    if (slot === -1 || !div.children[slot]) return;
    const ghost = buildCard(card);
    ghost.classList.add('card-ghost');
    div.replaceChild(ghost, div.children[slot]);
}

/** Deshace la carta pintada por adelantado. */
function rollbackGhost() {
    const ghosts = document.querySelectorAll('.card-ghost');
    if (!ghosts.length) return;
    ghosts.forEach(el => el.classList.add('ghost-out'));
    setTimeout(() => {
        // Puede haber llegado ya un redibujado; `renderYourCards` deja el hueco
        // como toca de todas formas.
        renderYourCards();
    }, 160);
}

/** Carta pedida, esperando al servidor. El estilo `.card-pending` ya existía y
 *  ya se limpiaba al fallar, pero no lo ponía nadie: el hueco entre el toque y
 *  la respuesta se veía igual que no haber tocado. */
function markPending(el) {
    clearPending();
    if (el) el.classList.add('card-pending');
}

function clearPending() {
    document.querySelectorAll('.card-pending')
        .forEach(el => el.classList.remove('card-pending'));
}

/** La jugada no toca ahora. El toque SÍ se registró, y decirlo evita que se
 *  insista pensando que no ha entrado. */
function refuseTap(el) {
    if (!el) return;
    playSfx('refused');
    el.classList.remove('refused');
    void el.offsetWidth;          // reinicia la animación si se repite el toque
    el.classList.add('refused');
    setTimeout(() => el.classList.remove('refused'), 300);
}

// Un espectador no juega. El servidor ya lo ignora; esto es para que la
// interfaz no prometa algo que no va a pasar.
bindTap(document.getElementById('centerCards'),
        (v, el) => { if (!soyEspectador) onCenterCardClick(Number(v), el); }, 'center');
bindTap(document.getElementById('yourCards'),
        (v, el) => { if (!soyEspectador) onPlayerCardClick(Number(v), el); }, 'own', { alSoltar: true });

// ─── Intercambio de cartas ────────────────────────────────────────────────
// No hay intercambio 1↔1: tocar una carta tuya la suelta al centro, y tocar
// una del centro la coge. Nada que seleccionar, nada que confirmar.
/** Una jugada pedida cuenta como "en vuelo" este rato. Pasado esto se da por
 *  perdida y se deja volver a tocar: es el seguro por si el servidor no
 *  contesta (el mayor RTT visto fue 1,9 s). */
const PENDING_MAX_MS = 2500;
const enVuelo = p => !!p && Date.now() - p.t < PENDING_MAX_MS;

function onPlayerCardClick(index, el) {
    // Solo te frena TU pelea. Que peleen otros dos no es motivo para dejarte
    // quieto: sigues jugando con tus cartas y con el resto del centro.
    // Debiendo una carta no se puede soltar otra: primero se tapa el hueco.
    if (qteActive || isStunned() || owesCard()) return refuseTap(el);
    // Ya soltaste una y el servidor aún no ha contestado: otro toque no añade
    // nada. Antes cada toque mandaba otro `drop_card`, el servidor rechazaba
    // los sobrantes ("Coge una carta del centro antes de soltar otra") y su
    // `swap_failed` borraba el estado pendiente de lo que SÍ estabas haciendo
    // (visto 4 veces en dos partidas, con 3 duplicados en el mismo milisegundo).
    if (enVuelo(pendingDrop)) return;
    const card = (allSets[currentSetIndex] || [])[index];
    if (!card) return;
    pendingDrop = { index, card, t: Date.now() };
    markPending(el);
    playSfx('drop', card.id);
    send({ type: 'drop_card', my_card_index: index });
}

function onCenterCardClick(cardId, el) {
    // Sin mensaje: la etiqueta PELEADA sobre la carta ya explica por qué no
    // pasa nada. La carta en disputa es la única intocable; las demás siguen
    // disponibles para quien no está peleando.
    //
    // Pero si DEBES una carta y se rechaza el toque, queda anotado con el
    // motivo: es justo el caso de "no me deja seleccionar", y hasta ahora no
    // dejaba rastro.
    const rechazo = (why) => {
        if (owesCard()) {
            diag.note('tap_refused', {
                why, qte: qteActive, stun_ms: Math.max(0, stunnedUntil - Date.now()),
                blocked: qteBlockedCards.size, p_take_ms: pendingTake ? Date.now() - pendingTake.t : null,
            });
        }
        return refuseTap(el);
    };
    if (qteActive) return rechazo('qte');
    if (isStunned()) return rechazo('stun');
    if (qteBlockedCards.has(cardId)) return rechazo('blocked');
    // Solo se coge para tapar un hueco: sin deuda no hay dónde meterla. Es el
    // "no pasa nada" más frecuente, así que conviene que se vea.
    if (!owesCard()) return refuseTap(el);
    // Ya pediste una (la misma o OTRA) y el servidor aún no ha contestado: el
    // segundo toque no añade nada. Antes solo se miraba la misma carta; pedir
    // otra mandaba otro `take_card`, el servidor lo rechazaba y su
    // `swap_failed` borraba la carta fantasma de la primera.
    if (enVuelo(pendingTake)) return;
    const card = centerCards.find(c => c.id === cardId);
    if (!card) return;
    // El hueco donde estaba, para animar el vuelo desde ahí.
    pendingTake = { centerIndex: centerSlots.indexOf(cardId), card, t: Date.now() };
    markPending(el);
    showGhost(card);
    // Por id: el centro se reordena en cuanto alguien coge o suelta, así que
    // una posición deja de referirse a la misma carta.
    send({ type: 'take_card', card_id: card.id });
}

/** Movimiento confirmado. La carta vuela de donde salió a donde ha llegado:
 *  al centro si la soltaste, a tu hueco si la cogiste o ganaste la pelea. */
function onSwapSuccess(msg) {
    const drop = pendingDrop;
    const take = pendingTake;
    const wonFight = !drop && !take && qteWonSlot !== null;

    // Medir el punto de partida antes de que el redibujado borre los nodos.
    const fromMine = drop ? cardRectAt('yourCards', drop.index) : null;
    const fromCenter = take ? cardRectAt('centerCards', take.centerIndex)
        : (wonFight ? cardRectAt('centerCards', qteWonSlot.index) : null);

    const oldSet = (allSets[msg.set_index] || []).slice();

    if (msg.your_new_set) allSets[msg.set_index] = msg.your_new_set;
    centerCards = msg.center_cards;
    renderYourCards();
    renderCenterCards();
    updateSetNav();

    if (wonFight) {
        // Pelea ganada: la carta sale del centro y aterriza en tu set. Ese
        // vuelo es todo el "has ganado" que hace falta.
        const slot = findChangedSlot(oldSet, msg.your_new_set);
        if (slot !== -1) {
            flyCard(qteWonSlot.card, fromCenter, 'yourCards', slot, true);
        }
        qteWonSlot = null;
    } else if (drop) {
        // Soltada: vuela de tu set al hueco del centro que le haya tocado. Ya
        // no es "la última": con los huecos fijos ocupa el primero libre, que
        // puede estar en medio de la mesa.
        const landed = centerSlots.indexOf(drop.card.id);
        if (landed !== -1) flyCard(drop.card, fromMine, 'centerCards', landed);
    } else if (take) {
        // Cogida: del centro al hueco que había quedado libre.
        const slot = findChangedSlot(oldSet, msg.your_new_set);
        if (slot !== -1) flyCard(take.card, fromCenter, 'yourCards', slot);
    }
    pendingDrop = null;
    pendingTake = null;
    clearPending();
    updateOwingUi();
}

/** La jugada no salió. Se deshace lo que se había pintado por adelantado.
 *
 *  Llegar tarde a una carta es lo más normal del mundo con cuatro jugadores, y
 *  no es culpa de nadie: un cartelito de "esa carta ya no está" cada vez que
 *  alguien se te adelanta es ruido y encima se lee como un error tuyo. Se
 *  deshace el movimiento y se sigue.
 *
 *  Solo se dice algo cuando el jugador puede hacer algo al respecto —debes una
 *  carta, estás verificando—, y eso lo marca el servidor con `kind`, no el
 *  texto: decidir comparando el texto ya rompió esto una vez. */
function onSwapFailed(msg) {
    pendingDrop = null;
    pendingTake = null;
    rollbackGhost();
    clearPending();

    if (qtePlayers.includes(currentNickname) || isStunned()) return;

    // Los mensajes viejos no traen `kind`; se tratan como antes.
    const kind = msg.kind || 'rule';
    if (kind === 'gone') {
        renderYourCards();
        renderCenterCards();
        // Burla del que se la llevó (solo si estás jugando; en pelea o aturdido ya
        // se salió arriba).
        // Sin texto: suena su burla y destella su franja del marcador (partida/partida.js).
        if (msg.taunt && !soyEspectador) playTaunt(msg.taunt);
        return;
    }
    if (!msg.reason) return;
    renderYourCards();
    renderCenterCards();
    updateSwapHint(`⚠️ ${srvText(msg, 'swapfail')}`);
    resetSwapHintLater(2500);
}

/** Primer hueco cuya carta cambió, comparando por id. El servidor manda los
 *  arrays enteros y nunca dice qué se movió, así que hay que deducirlo. */
function findChangedSlot(oldCards, newCards) {
    if (!newCards) return -1;
    for (let i = 0; i < newCards.length; i++) {
        if (!oldCards[i] || oldCards[i].id !== newCards[i].id) return i;
    }
    return -1;
}

// ─── Soltar y coger ───────────────────────────────────────────────────────
// Soltar deja un hueco en tu set y añade la carta al centro, donde cualquiera
// puede cogerla. Hasta taparlo no se puede soltar otra, ni intercambiar, ni
// mostrar sets — el servidor lo comprueba igualmente.
let pendingDrop = null;
let pendingTake = null;

/** ¿Hay algún hueco sin tapar en alguno de mis sets? */
function owesCard() {
    return allSets.some(set => (set || []).some(card => !card));
}

/** Refleja en el tablero si debes una carta: tus cartas se apagan y el centro
 *  se resalta como lo único con lo que puedes actuar. */
function updateOwingUi() {
    const owing = owesCard();
    document.getElementById('gameScreen')?.classList.toggle('owing', owing);
    const hint = document.getElementById('swapHint');
    if (hint) hint.textContent = owing ? OWING_HINT : DEFAULT_SWAP_HINT;
    const flip = document.getElementById('flipBtn');
    if (flip) flip.disabled = owing;
    // Los botones de set se apagan mientras debes, para que se vea que no es
    // que no respondan: es que ahora solo se puede coger del centro.
    document.querySelectorAll('.set-btn').forEach(b => { b.disabled = owing; });
    // Deuda saldada: fuera la cuenta atrás, la hayas tapado tú o te la hayan
    // tapado. Se hace aquí porque es el único sitio por el que pasan todos los
    // caminos que cambian el estado de deuda.
    if (!owing) clearDebtCountdown();
}

const DEFAULT_SWAP_HINT = t('swap.hint');
const OWING_HINT = t('swap.owing');

function clearSelection() {
    updateSwapHint(owesCard() ? OWING_HINT : DEFAULT_SWAP_HINT);
}

let swapHintResetTimer = null;

/** Devuelve el hint a su texto por defecto tras un aviso temporal. */
function resetSwapHintLater(delayMs) {
    if (swapHintResetTimer) clearTimeout(swapHintResetTimer);
    swapHintResetTimer = setTimeout(() => {
        swapHintResetTimer = null;
        updateSwapHint(owesCard() ? OWING_HINT : DEFAULT_SWAP_HINT);
    }, delayMs);
}

// Siempre como texto: algunos avisos llevan apodos de otros jugadores.
function updateSwapHint(texto) {
    const el = document.getElementById('swapHint');
    el.textContent = texto;
    el.classList.toggle('selected', owesCard());
}

// ─── Cambio de set ────────────────────────────────────────────────────────
function switchSet(index) {
    if (index === currentSetIndex) return;
    // Debiendo una carta no se cambia de set: el hueco se quedaría en un set
    // que no estás viendo. El servidor también lo rechaza.
    if (owesCard()) return;
    currentSetIndex = index;
    clearSelection();
    send({ type: 'switch_set', set_index: index });
    // Una carta que aún vuela hacia tu mano iba al hueco del set de antes:
    // seguía volando encima del nuevo y rebotaba sobre una carta ajena.
    document.querySelectorAll('#fxLayer .card[data-row="yourCards"]').forEach(c => c.finishFlight(false));
    renderYourCards();
}

// ─── Voltear sets ─────────────────────────────────────────────────────────
// `i`: el set fijado al empezar el gesto. El revelado espera 1 s; si en ese rato
// cambiabas de set, se volteaba el nuevo en vez del que pediste.
function flipCurrentSet(i = currentSetIndex) {
    send({ type: 'flip_set', set_index: i });
}

function updateFlipBtn() {
    const btn = document.getElementById('flipBtn');
    if (!btn) return;
    const flipped = myFlippedSets[currentSetIndex];
    // Texto corto: ahora comparte línea con el título de la sección. La
    // explicación completa va en el title, para no romper el layout.
    btn.textContent = t(flipped ? 'game.hide' : 'game.flip');
    btn.title = t(flipped ? 'game.hidetitle' : 'game.fliptitle');
    btn.classList.toggle('is-flipped', flipped);
}

function onSetFlipped(playerName, setIndex, cards) {
    const isFlipped = cards.length > 0;

    if (playerName === currentNickname) {
        myFlippedSets[setIndex] = isFlipped;
        updateSetNav();
    } else {
        if (!opponentFlippedSets.has(playerName)) {
            opponentFlippedSets.set(playerName, new Map());
        }
        const playerMap = opponentFlippedSets.get(playerName);
        if (isFlipped) {
            playerMap.set(setIndex, cards[0]);
        } else {
            playerMap.delete(setIndex);
        }
        // Los sets revelados viven en el marcador de arriba: repintarlo es todo
        // lo que hay que hacer cuando alguien enseña uno.
        renderPlayersProgress(null);
    }
}

// ─── QTE ─────────────────────────────────────────────────────────────────
// Avisos de pelea para quien mira, por carta en disputa.
//
// Era una sola variable, y con dos peleas a la vez la segunda pisaba a la
// primera: el aviso de la primera se quedaba colgado en pantalla para siempre,
// porque ya no quedaba nada que lo apuntara para poder borrarlo.
const qteNotifs = new Map();
let qtePlayers = [];        // Jugadores en la pelea actual
let qteContestedCard = null;   // La carta por la que se pelea
let qteMyCardId = null;        // Su id, aunque la carta ya no esté en el centro:
                               // sin esto, mi pelea no se reconoce como mía si
                               // el centro cambió justo al empezar.
let qteContestedIndex = null;  // En qué hueco del centro estaba
let qteWonSlot = null;         // Si ganaste: carta y hueco de origen, para el vuelo
let qteResultTimer = null;     // Temporizador del resultado — separado de
                               // qteTimerInterval, que lo comparten la cuenta
                               // atrás del participante y la del espectador.

/** Cuánto dura el resultado en pantalla antes de volver al tablero. */
const FIGHT_RESULT_MS = 800;

