// ─── Bloqueo por perder ───────────────────────────────────────────────────
import { emitir } from './bus.js';
import { est, qteBlockedCards, porId, type Msg } from './estado.js';

/** Un aviso de pelea lleva sus temporizadores colgados (ver cerrarAvisoPelea). */
type Aviso = HTMLElement & { _timer?: ReturnType<typeof setInterval>; _failsafe?: ReturnType<typeof setTimeout> };
import { send } from './red.js';
import { renderCenterCards, renderYourCards, buildCard, cardRectAt } from './tablero.js';
import { playSfx } from './sonido.js';
import { tensarMusica } from './musica.js';
let misGolpes = 0;   // los de esta pelea: cada golpe suena un poco más agudo
import { clearPending, qteNotifs, FIGHT_RESULT_MS } from './toques.js';

export let stunnedUntil = 0;
let stunTimer: ReturnType<typeof setInterval> | null = null;

export function isStunned() { return Date.now() < stunnedUntil; }

/** El servidor manda la duración porque es quien la aplica de verdad; aquí
 *  solo se pinta. No hay texto: el tablero apagado es el mensaje. */
// ── Las manos toon de tu pelea (partida/manos.ts): forcejean hasta que se resuelve ──
/** Cómo acabó tu pelea, para las manos: quién gana y cuánto dura tu aturdimiento. null = se
 *  cortó sin resultado (fin de partida, salir…): las manos se van sin bofetada. */
type FinalManos = { gano: boolean; aturdido: number } | null;
let finalManos: ((f: FinalManos) => void) | null = null;
let esperaAturdido: ReturnType<typeof setTimeout> | null = null;
function resolverManos(f: FinalManos) {
    if (esperaAturdido) { clearTimeout(esperaAturdido); esperaAturdido = null; }
    finalManos?.(f);
    finalManos = null;
}

export function startStun(ms: number) {
    // Perdiste la pelea: el aturdimiento llega justo detrás del resultado y es lo que dura el
    // latido de tu mano roja.
    if (finalManos && esperaAturdido) resolverManos({ gano: false, aturdido: ms });
    stunnedUntil = Date.now() + ms;
    porId('gameScreen').classList.add('stunned');
    const bar = porId('stunBar');
    const fill = porId('stunBarFill');
    bar.classList.add('active');
    fill.style.width = '100%';

    if (stunTimer) clearInterval(stunTimer);
    stunTimer = setInterval(() => {
        const left = stunnedUntil - Date.now();
        if (left <= 0) {
            if (stunTimer) clearInterval(stunTimer);
            stunTimer = null;
            bar.classList.remove('active');
            porId('gameScreen').classList.remove('stunned');
            return;
        }
        fill.style.width = `${(left / ms) * 100}%`;
    }, 50);
}

export function clearStun() {
    stunnedUntil = 0;
    if (stunTimer) { clearInterval(stunTimer); stunTimer = null; }
    document.getElementById('stunBar')?.classList.remove('active');
    document.getElementById('gameScreen')?.classList.remove('stunned');
}

export function onSwapConflict(players: string[], cardId: number, durationMs: number) {
    const isParticipant = players.includes(est.currentNickname);
    // Si la carta está en TU mano (la cogiste por adelantado, o ya era tuya y el rival la
    // pidió a tiempo según su ping), su guante te la arranca y empieza la pelea: vuelve al
    // centro, disputada. Sin esto parecía que «ya la tenía» y de pronto había pelea.
    const enMano = isParticipant ? (est.allSets[est.currentSetIndex] || []).findIndex(c => c?.id === cardId) : -1;
    if (enMano !== -1) {
        const mia = est.allSets[est.currentSetIndex][enMano]!;
        const desde = cardRectAt('yourCards', enMano);
        est.allSets[est.currentSetIndex][enMano] = null;
        if (!est.centerCards.some(c => c.id === cardId)) est.centerCards = [...est.centerCards, mia];
        renderYourCards();
        if (desde) {
            resolverManos(null);   // una pelea anterior que no se cerró
            const final = new Promise<FinalManos>(r => (finalManos = r));
            emitir('arrebato', desde, mia, players.find(p => p !== est.currentNickname) ?? null, final);
        }
    }
    // Por id, no por posición. El servidor ya identificaba la carta así; ahora
    // el cliente también, y de paso el hueco donde está ya no se mueve. La
    // carta se guarda aparte para el overlay: al acabar la pelea ya no estará
    // en el centro.
    const card = est.centerCards.find(c => c && c.id === cardId) || null;
    // El id viene en el mensaje: se marca aunque la carta ya no esté en nuestra
    // copia del centro, y `qte_resolved` lo desmarcará por ese mismo id.
    qteBlockedCards.add(cardId);
    // El estado de LA TUYA (jugadores, carta, hueco) solo lo escribe tu pelea.
    // Antes lo escribía cualquiera, así que una pelea ajena que empezara a
    // media tuya lo pisaba: el overlay propio dejaba de recibir su
    // `qte_update`/`qte_resolved` y se cerraba cuando se resolvía la ajena.
    if (isParticipant) {
        est.qtePlayers = players;
        est.qteMyCardId = cardId;
        est.qteContestedCard = card;
        // El hueco donde está, que es el que ocupa en pantalla: hace falta para
        // animar el vuelo si la ganas.
        est.qteContestedIndex = card ? est.centerSlots.indexOf(card.id) : null;
    }
    // Un movimiento propio a medias queda anulado por la pelea: ibas a coger
    // esa carta y ahora hay que ganársela. Para quien la estaba pidiendo, el
    // overlay que entra a continuación es la respuesta a su toque. Una pelea
    // por OTRA carta no toca lo tuyo.
    if (isParticipant || est.pendingTake?.card.id === cardId) {
        est.pendingDrop = null;
        est.pendingTake = null;
        est.volteoEnEspera = null;
        clearPending();
    }
    renderCenterCards();

    if (isParticipant) {
        // ── Overlay completo para participantes ──
        est.qteActive = true;
        misGolpes = 0;
        playSfx('fight');
        tensarMusica(true);

        const rival = players.find(p => p !== est.currentNickname) || '';
        porId('qteTitle').textContent = t('qte.title');
        const desc = porId('qteDesc');
        const rivalEl = document.createElement('strong');
        rivalEl.textContent = rival;
        desc.replaceChildren(t('qte.vs') + ' ', rivalEl);

        const cardSlot = porId('qteCard');
        cardSlot.innerHTML = '';
        if (est.qteContestedCard) cardSlot.appendChild(buildCard(est.qteContestedCard));

        const scoresDiv = porId('qteScores');
        scoresDiv.innerHTML = '';
        players.forEach(name => {
            const div = document.createElement('div');
            div.className = 'qte-player-score' + (name === est.currentNickname ? ' is-me' : '');
            div.id = `qte-score-${name}`;
            // El apodo como texto, nunca como HTML: el servidor no lo filtra.
            const nombre = document.createElement('div');
            nombre.className = 'qte-name';
            nombre.textContent = name === est.currentNickname ? t('qte.me', { nick: name }) : name;
            const cuenta = document.createElement('div');
            cuenta.className = 'qte-count';
            cuenta.id = `qte-n-${name}`;
            cuenta.textContent = '0';
            div.append(nombre, cuenta);
            scoresDiv.appendChild(div);
        });

        porId('qteClickBtn').style.display = 'block';
        // Solo para quien pelea: el que mira no tiene nada que ceder.
        cancelGiveUpHold();
        const rendirse = giveUpBtn();
        if (rendirse) rendirse.hidden = false;

        const fill = porId('qteTimerFill');
        fill.style.width = '100%';
        const start = Date.now();
        if (est.qteTimerInterval) clearInterval(est.qteTimerInterval);
        est.qteTimerInterval = setInterval(() => {
            const pct = Math.max(0, 100 - ((Date.now() - start) / durationMs) * 100);
            fill.style.width = pct + '%';
            if (pct <= 0) clearInterval(est.qteTimerInterval ?? undefined);
        }, 50);

        porId('qteOverlay').classList.add('active');

    } else {
        // ── Notificación pequeña para espectadores ──
        const area = porId('verifyNotifications');
        const notif: Aviso = document.createElement('div');
        notif.className = 'qte-battle-notif';
        const funEmojis = ['⚔️', '🥊', '💥', '🔥', '⚡'];
        const emoji = funEmojis[Math.floor(Math.random() * funEmojis.length)];
        // Apodos como texto (el servidor no los filtra) y sin ids: con dos
        // avisos a la vez se repetirían; todo se busca acotado al aviso.
        const el = (cls: string, txt?: string) => {
            const e = document.createElement('div');
            e.className = cls;
            if (txt !== undefined) e.textContent = txt;
            return e;
        };
        const span = (cls: string, txt: string) => {
            const e = document.createElement('span');
            if (cls) e.className = cls;
            e.textContent = txt;
            return e;
        };
        const versus = el('qbn-versus');
        versus.append(span('qbn-player', players[0]), span('qbn-vs', '⚔️'), span('qbn-player', players[1]));
        const scores = el('qbn-scores');
        players.slice(0, 2).forEach(name => {
            const s = span('', t('qte.clicks', { n: 0 }));
            s.dataset.nick = name;
            scores.append(s);
        });
        const bar = el('qbn-bar');
        bar.append(el('qbn-bar-fill'));
        notif.append(el('qbn-title', `${emoji} ${t('qte.fight')}`), versus, scores, bar);
        area.appendChild(notif);
        // Por carta: con dos peleas a la vez hay dos avisos, y cada uno tiene
        // que poder cerrarse por su cuenta.
        cerrarAvisoPelea(cardId);
        qteNotifs.set(cardId, notif);

        // Barra de tiempo. El temporizador vive en el propio aviso, no en una
        // variable compartida: si no, el segundo aviso paraba la barra del
        // primero y la dejaba congelada a media cuenta.
        const fill = notif.querySelector<HTMLElement>('.qbn-bar-fill')!;
        fill.style.width = '100%';
        const start = Date.now();
        notif._timer = setInterval(() => {
            const pct = Math.max(0, 100 - ((Date.now() - start) / durationMs) * 100);
            fill.style.width = pct + '%';
            if (pct <= 0) clearInterval(notif._timer);
        }, 50);

        // Red de seguridad: si por lo que sea no llegara la resolución, el
        // aviso no se queda ahí para el resto de la partida.
        notif._failsafe = setTimeout(() => cerrarAvisoPelea(cardId), durationMs + 4000);
    }
    emitir('onSwapConflict', players, cardId, durationMs);
}

/** Quita el aviso de una pelea concreta, con sus temporizadores. */
export function cerrarAvisoPelea(cardId: number) {
    const notif: Aviso | undefined = qteNotifs.get(cardId);
    if (!notif) return;
    clearInterval(notif._timer);
    clearTimeout(notif._failsafe);
    notif.remove();
    qteNotifs.delete(cardId);
}

/** ¿Habla esto de la pelea que estoy mirando?
 *
 *  Puede haber dos peleas a la vez, y `qte_update` y `qte_resolved` se difunden
 *  a toda la sala. Sin comparar la carta, el marcador de una pelea se pintaba en
 *  la otra y la resolución de cualquiera cerraba el overlay de todos.
 *
 *  Los mensajes viejos no traen `card_id`: en ese caso se acepta, que es como se
 *  comportaba antes. */
export function esMiPelea(cardId: number | null | undefined) {
    if (cardId === undefined || cardId === null) return true;
    // Peleando yo, solo cuenta la mía: las ajenas ya no la pisan.
    if (est.qteMyCardId !== null) return est.qteMyCardId === cardId;
    return qteBlockedCards.has(cardId);
}

export function onQteUpdate(clicks: Record<string, number>, cardId?: number | null) {
    // Sin card_id (mensajes viejos) se tocan todos los avisos.
    const notifs = cardId == null ? [...qteNotifs.values()] : [qteNotifs.get(cardId)];
    Object.entries(clicks).forEach(([name, count]) => {
        // Participantes: actualizar overlay
        const overlayEl = document.getElementById(`qte-n-${name}`);
        if (overlayEl) overlayEl.textContent = String(count);
        // Espectadores: actualizar el aviso de ESA pelea
        notifs.forEach(n => {
            const s = n && [...n.querySelectorAll<HTMLElement>('[data-nick]')].find(e => e.dataset.nick === name);
            if (s) s.textContent = t('qte.clicks', { n: count });
        });
    });
    emitir('onQteUpdate', clicks, cardId);
}

/** La pelea terminó. En vez de cerrar de golpe, el overlay se queda un
 *  momento con la carta y los dos marcadores: el del ganador se ilumina y el
 *  del perdedor se apaga. Sin una sola frase — quién ganó se ve, no se lee. */
export function onQteTiebreak(cardId: number, round: number, duracion?: number) {
    const ms = duracion || 1000;
    const bar = (fill: HTMLElement) => {
        const start = Date.now();
        return setInterval(() => {
            fill.style.width = Math.max(0, 100 - ((Date.now() - start) / ms) * 100) + '%';
        }, 50);
    };
    // Espectador: el mismo aviso, reducido.
    const notif: Aviso | undefined = qteNotifs.get(cardId);
    if (notif) {
        clearInterval(notif._timer);
        clearTimeout(notif._failsafe);
        notif.querySelector('.qbn-title')!.textContent = round > 1
            ? t('qte.tie_notif_round', { round }) : t('qte.tie_notif');
        notif.querySelectorAll('.qbn-scores span').forEach(s => { s.textContent = t('qte.clicks', { n: 0 }); });
        const fill = notif.querySelector<HTMLElement>('.qbn-bar-fill')!;
        fill.style.width = '100%';
        notif._timer = bar(fill);
        notif._failsafe = setTimeout(() => cerrarAvisoPelea(cardId), ms + 4000);
        return;
    }
    // Participante.
    if (!est.qteActive || est.qteMyCardId !== cardId) return;
    const marcador = est.qtePlayers
        .map(n => document.getElementById(`qte-n-${n}`)?.textContent ?? '0').join(' – ');
    const titulo = porId('qteTitle');
    misGolpes = 0;
    titulo.textContent = t('qte.tie_title');
    titulo.classList.add('tie');
    porId('qteBox').classList.add('tie');
    porId('qteDesc').textContent =
        t(round > 1 ? 'qte.tie_desc_round' : 'qte.tie_desc', { score: marcador, round });
    est.qtePlayers.forEach(n => {
        const el = document.getElementById(`qte-n-${n}`);
        if (el) el.textContent = '0';
    });
    playSfx('tiebreak');
    const fill = porId('qteTimerFill');
    fill.style.width = '100%';
    if (est.qteTimerInterval) clearInterval(est.qteTimerInterval);
    est.qteTimerInterval = bar(fill);
    if (qteTieLabelTimer) clearTimeout(qteTieLabelTimer);
    qteTieLabelTimer = setTimeout(() => {
        titulo.classList.remove('tie');
        titulo.textContent = t('qte.title');
    }, ms);
}
let qteTieLabelTimer: ReturnType<typeof setTimeout> | null = null;

export function onQteResolved(winnerName: string, info?: Partial<Msg<'qte_resolved'>>) {
    const wasParticipant = est.qtePlayers.includes(est.currentNickname);
    if (qteTieLabelTimer) clearTimeout(qteTieLabelTimer);

    if (!wasParticipant) {
        // Espectador: su avisito ya muestra los clicks finales, se cierra sin más.
        closeQteOverlay();
        return;
    }

    const iWon = winnerName === est.currentNickname;
    playSfx(iWon ? 'fightWon' : 'fightLost');
    // Las manos: si ganas, ya; si pierdes, al llegar tu aturdimiento (startStun). Si no llega
    // (cediste: sin bloqueo), bofetada sin latido.
    if (iWon) resolverManos({ gano: true, aturdido: 0 });
    else if (finalManos) esperaAturdido = setTimeout(() => resolverManos({ gano: false, aturdido: 0 }), 400);
    // Si ganaste, el swap_success que viene detrás animará la carta desde el
    // centro hasta tu set. Se guarda de dónde sale antes de que el tablero
    // cambie debajo.
    est.qteWonSlot = iWon && est.qteContestedCard
        ? { card: est.qteContestedCard, index: est.qteContestedIndex }
        : null;

    porId('qteClickBtn').style.display = 'none';
    // Se acabó la pelea: ya no hay nada que ceder.
    cancelGiveUpHold();
    const rendirse = giveUpBtn();
    if (rendirse) rendirse.hidden = true;
    if (est.qteTimerInterval) { clearInterval(est.qteTimerInterval); est.qteTimerInterval = null; }

    est.qtePlayers.forEach(name => {
        const box = document.getElementById(`qte-score-${name}`);
        if (box) box.classList.add(name === winnerName ? 'won' : 'lost');
        // Clicks finales de cada uno (los manda el servidor; viejo = se queda el último marcador).
        const n = info?.clicks?.[name];
        const el = document.getElementById(`qte-n-${name}`);
        if (el && n !== undefined) el.textContent = String(n);
    });
    const titulo = porId('qteTitle');
    titulo.classList.remove('tie');
    titulo.textContent = t('qte.title');
    if (info?.random) {
        porId('qteDesc').textContent = t('qte.random');
    } else if (info?.tiebreaks) {
        porId('qteDesc').textContent = t('qte.sudden');
    }

    est.qteActive = false;   // no se admiten más clicks mientras se ve el resultado
    if (est.qteResultTimer) clearTimeout(est.qteResultTimer);
    est.qteResultTimer = setTimeout(() => {
        est.qteResultTimer = null;
        closeQteOverlay();
    }, info?.random ? FIGHT_RESULT_MS + 900 : FIGHT_RESULT_MS);
}

export function closeQteOverlay() {
    if (finalManos && !esperaAturdido) resolverManos(null);   // se cerró sin resultado
    est.qteActive = false;
    tensarMusica(false);
    cancelGiveUpHold();
    const rendirse = giveUpBtn();
    if (rendirse) rendirse.hidden = true;
    // Solo la carta de ESTA pelea: si se vaciara el conjunto entero, cerrar la
    // tuya desmarcaría la carta de la pelea que siguen teniendo otros dos.
    if (est.qteContestedCard) qteBlockedCards.delete(est.qteContestedCard.id);
    renderCenterCards();
    if (est.qteTimerInterval) { clearInterval(est.qteTimerInterval); est.qteTimerInterval = null; }
    if (est.qteResultTimer) { clearTimeout(est.qteResultTimer); est.qteResultTimer = null; }

    // Cerrar overlay de participante
    const overlay = porId('qteOverlay');
    overlay.classList.remove('active');
    porId<HTMLButtonElement>('qteClickBtn').disabled = false;
    porId('qteCard').innerHTML = '';
    document.querySelectorAll('.qte-player-score').forEach(el => el.classList.remove('won', 'lost'));
    porId('qteBox').classList.remove('tie');
    porId('qteTitle').classList.remove('tie');

    // El aviso de espectador se cierra por carta desde `qte_resolved`, que
    // llega siempre. Aquí solo se limpia el de la tuya por si acaso.
    if (est.qteContestedCard) cerrarAvisoPelea(est.qteContestedCard.id);

    est.qtePlayers = [];
    est.qteContestedCard = null;
    est.qteContestedIndex = null;
    est.qteMyCardId = null;
    emitir('closeQteOverlay');
}

function sendQteClick() {
    if (est.qteActive) send({ type: 'qte_click' });
}

// ─── Ceder la carta que se está peleando ─────────────────────────────────
//
// Mantener pulsado, no tocar. Durante una pelea toda la pantalla es el botón de
// pulsar y además dispara al BAJAR el dedo, así que un botón que se activara con
// un toque se dispararía solo a los dos segundos de machacar. Un dedo que se
// queda quieto 700 ms no pasa por accidente mientras machacas.
const GIVEUP_HOLD_MS = 700;
let giveUpTimer: ReturnType<typeof setTimeout> | null = null;

function giveUpBtn() { return document.getElementById('qteGiveUpBtn'); }

function cancelGiveUpHold() {
    if (giveUpTimer) clearTimeout(giveUpTimer);
    giveUpTimer = null;
    giveUpBtn()?.classList.remove('holding');
}

(() => {
    const btn = giveUpBtn();
    if (!btn) return;
    btn.style.setProperty('--giveup-ms', GIVEUP_HOLD_MS + 'ms');

    btn.addEventListener('pointerdown', (e) => {
        // Lo importante de toda esta función: sin esto el mismo gesto sería a
        // la vez "me rindo" y un click de la pelea, que es contradictorio.
        e.stopPropagation();
        e.preventDefault();
        if (!est.qteActive) return;
        // Capturar el puntero: el círculo mide 52 px y un pulgar apoyado 700 ms
        // se mueve. Sin esto el primer temblor salía del botón, saltaba
        // `pointerleave` y se cortaba la cuenta sin que se notara por qué.
        try { btn.setPointerCapture(e.pointerId); } catch { /* da igual */ }
        btn.classList.add('holding');
        giveUpTimer = setTimeout(() => {
            giveUpTimer = null;
            btn.classList.remove('holding');
            btn.hidden = true;          // ya está pedido; no se pide dos veces
            playSfx('drop');
            send({ type: 'give_up_card' });
        }, GIVEUP_HOLD_MS);
    });

    // `pointerleave` ya NO cancela: con el puntero capturado los eventos siguen
    // llegando al botón aunque el dedo se salga, que es lo que se quiere.
    // Levantar el dedo sí cancela, y `pointercancel` queda de red por si el
    // sistema se lleva el gesto de todas formas.
    for (const ev of ['pointerup', 'pointercancel']) {
        btn.addEventListener(ev, (e) => { e.stopPropagation(); cancelGiveUpHold(); });
    }
})();

// Toda la pantalla cuenta como el botón. `pointerdown` y no `click`: en una
// pelea a golpes de dedo, esperar al `click` completo (que exige soltar) pierde
// pulsaciones y llega tarde.
porId('qteOverlay').addEventListener('pointerdown', (e) => {
    if (!est.qteActive) return;
    e.preventDefault();
    sendQteClick();
    playSfx('tap', misGolpes++);
    const overlay = e.currentTarget as HTMLElement;
    overlay.classList.add('hit');
    setTimeout(() => overlay.classList.remove('hit'), 60);
});

// Spacebar como atajo durante QTE
document.addEventListener('keydown', (e) => {
    if (est.qteActive && (e.code === 'Space' || e.code === 'Enter') && (e.target as Element | null)?.tagName !== 'INPUT') {
        e.preventDefault();
        sendQteClick();
    }
});

