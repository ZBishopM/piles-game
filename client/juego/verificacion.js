// ─── Verificación ────────────────────────────────────────────────────────
import { emitir } from './bus.js';
import { est, otherVerifications, qteBlockedCards } from './estado.js';
import { send } from './red.js';
import { sinEmoji } from './espectador.js';
import { applyCardSprite, cardName, REDUCED_MOTION, resetCombo } from './tablero.js';
import { playSfx } from './sonido.js';
import { stopMusic } from './musica.js';
import { qteNotifs } from './toques.js';
import { cerrarAvisoPelea } from './pelea.js';
import { claimSessionManagerResult } from './cuenta.js';


/** Enseñar los 6 sets ES pedir la verificación; no hay botón. */
export function checkAutoVerify() {
    if (est.verificationSent) return;
    if (est.myFlippedSets.length === 6 && est.myFlippedSets.every(f => f)) {
        est.verificationSent = true;
        send({ type: 'request_verification' });
    }
}

export function openVerifyOverlay(playerName) {
    if (playerName === est.currentNickname) {
        // Mi verificación → overlay completo
        const overlay = document.getElementById('verifyOverlay');
        document.getElementById('verifyTitle').textContent = t('verify.mine');
        document.getElementById('verifyFooter').textContent = '';
        document.getElementById('verifyFooter').className = 'verify-footer';
        document.getElementById('verifyCloseBtn').style.display = 'none';

        const setsDiv = document.getElementById('verifySets');
        setsDiv.innerHTML = '';
        for (let i = 0; i < 6; i++) {
            const row = document.createElement('div');
            row.className = 'verify-set-row';
            row.innerHTML = `
                <span class="verify-set-label">${esc(t('set.n', { n: i + 1 }))}</span>
                <div class="verify-cards" id="vcards-${i}"></div>
                <span class="verify-icon" id="vicon-${i}">⏳</span>
            `;
            setsDiv.appendChild(row);
        }
        overlay.classList.add('active');
    } else {
        // Verificación ajena → notificación pequeña en segundo plano
        const area = document.getElementById('verifyNotifications');
        // Tras fallar se puede reintentar: sin esto la notificación anterior
        // de ese jugador se quedaba huérfana en pantalla al reemplazarla en
        // el Map, y ya nadie la borraba.
        const previous = otherVerifications.get(playerName);
        if (previous) previous.remove();
        const notif = document.createElement('div');
        notif.className = 'verify-notif';
        notif.innerHTML = `
            <div class="vnotif-header"></div>
            <div class="vnotif-sets">
                ${Array.from({length:6}, (_, i) => `<span id="vnotif-${esc(playerName)}-${i}" title="${esc(t('set.n', { n: i + 1 }))}">⏳</span>`).join('')}
            </div>
        `;
        notif.querySelector('.vnotif-header').textContent = t('verify.other', { nick: playerName });
        area.appendChild(notif);
        otherVerifications.set(playerName, notif);
    }
    emitir('openVerifyOverlay', playerName);
}

export function revealVerifySet(playerName, setIndex, isValid, cards) {
    const symbol = isValid ? '✅' : '❌';

    if (playerName === est.currentNickname) {
        // Actualizar mi overlay
        const cardsDiv = document.getElementById(`vcards-${setIndex}`);
        const icon = document.getElementById(`vicon-${setIndex}`);
        if (cardsDiv) {
            cardsDiv.innerHTML = '';
            cards.forEach(card => {
                const mini = document.createElement('span');
                mini.className = 'verify-card-mini';
                applyCardSprite(mini, card);
                mini.title = cardName(card.clothing_type, card.name);
                cardsDiv.appendChild(mini);
            });
        }
        if (icon) icon.textContent = symbol;
    } else {
        // Actualizar notificación ajena
        const icon = document.getElementById(`vnotif-${playerName}-${setIndex}`);
        if (icon) icon.textContent = symbol;
    }
    emitir('revealVerifySet', playerName, setIndex, isValid, cards);
}

export function onVerificationSuccess(playerName, position) {
    const medals = ['🥇', '🥈', '🥉'];
    const medal = medals[position - 1] || t('pos.ord', { n: position });

    if (playerName === est.currentNickname) {
        const footer = document.getElementById('verifyFooter');
        footer.textContent = t('verify.done_me', { medal, pos: position });
        footer.className = 'verify-footer success';
        document.getElementById('verifyCloseBtn').style.display = 'block';
    } else {
        const notif = otherVerifications.get(playerName);
        if (notif) {
            notif.classList.add('success');
            notif.querySelector('.vnotif-header').textContent = t('verify.done_other', { medal, nick: playerName, pos: position });
            dismissVerifyNotif(playerName, notif, 5000);
        }
    }
    emitir('onVerificationSuccess', playerName, position);
}

export function onVerificationFailed(playerName, failedSets) {
    const failedNames = failedSets.map(i => t('set.n', { n: i + 1 })).join(t('list.sep'));

    if (playerName === est.currentNickname) {
        est.verificationSent = false;  // Permitir un nuevo intento cuando los sets estén completos
        const footer = document.getElementById('verifyFooter');
        footer.textContent = t('verify.fail_me', { list: failedNames });
        footer.className = 'verify-footer failure';
        document.getElementById('verifyCloseBtn').style.display = 'block';
    } else {
        const notif = otherVerifications.get(playerName);
        if (notif) {
            notif.classList.add('failure');
            notif.querySelector('.vnotif-header').textContent = t('verify.fail_other', { nick: playerName, list: failedNames });
            dismissVerifyNotif(playerName, notif, 4000);
        }
    }
    emitir('onVerificationFailed', playerName, failedSets);
}

export function closeVerifyOverlay() {
    document.getElementById('verifyOverlay').classList.remove('active');
}

/** Programa el borrado de una notificación de verificación ajena.
 *
 * Solo saca del Map la notificación que realmente programó: si ese jugador
 * volvió a verificar mientras corría el temporizador, el `delete` a secas
 * borraba la entrada NUEVA y dejaba su notificación flotando para siempre.
 */
function dismissVerifyNotif(playerName, notif, delayMs) {
    setTimeout(() => {
        notif.remove();
        if (otherVerifications.get(playerName) === notif) {
            otherVerifications.delete(playerName);
        }
    }, delayMs);
}

/** Las notificaciones de verificación solo se borraban al llegar el
 *  resultado de ESA verificación. Si la partida terminaba antes (alguien
 *  completó el podio mientras otro seguía verificando) el resultado no
 *  llegaba nunca y la notificación se quedaba en pantalla — incluso en la
 *  siguiente ronda. Al cerrar la partida se limpian todas. */
export function clearMatchNotifications() {
    document.getElementById('verifyNotifications').innerHTML = '';
    otherVerifications.clear();
    for (const id of [...qteNotifs.keys()]) cerrarAvisoPelea(id);
    qteBlockedCards.clear();
    est.qteMyCardId = null;
    emitir('clearMatchNotifications');
}

/** Lluvia breve de confeti (~4 s): ráfaga hacia arriba y caída suave. Se
 *  retira sola; `returnToLobby` la quita antes si hace falta. */
function lanzarConfeti() {
    if (REDUCED_MOTION?.matches || document.getElementById('confetiLayer')) return;
    const layer = document.createElement('div');
    layer.id = 'confetiLayer';
    layer.setAttribute('aria-hidden', 'true');
    const colores = ['#a9b689', '#f7d51d', '#d6208f', '#ffffff'];
    const r = (a, b) => a + Math.random() * (b - a);
    const vw = window.innerWidth, vh = window.innerHeight;
    for (let i = 0; i < 48; i++) {
        const c = document.createElement('i');
        const color = colores[i % colores.length];
        const carta = i % 12 === 0;
        c.className = 'confeti' + (carta ? ' carta' : '');
        c.style.width = (carta ? 11 : r(6, 10)) + 'px';
        c.style.height = (carta ? 16 : r(9, 15)) + 'px';
        c.style.background = color;
        c.style.setProperty('--c', color);
        c.style.setProperty('--dx', r(-0.5, 0.5) * vw + 'px');
        c.style.setProperty('--up', -r(0.12, 0.35) * vh + 'px');
        c.style.setProperty('--fall', vh * 0.6 + r(0, 0.2) * vh + 'px');
        c.style.setProperty('--r', r(-900, 900) + 'deg');
        c.style.setProperty('--t', r(2.6, 3.5) + 's');
        c.style.setProperty('--d', r(0, 0.3) + 's');
        layer.appendChild(c);
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 4200);
}

export function onGameOver(rankings, elo = []) {
    const yaMostrado = document.getElementById('gameOverOverlay').classList.contains('active');
    est.gameOver = true;
    stopMusic();
    closeVerifyOverlay();
    clearMatchNotifications();
    resetCombo();
    const list = document.getElementById('rankingList');
    list.innerHTML = '';
    const titulo = document.querySelector('#gameOverOverlay h2');
    if (titulo) titulo.textContent = sinEmoji(t('over.title'));
    rankings.forEach(entry => {
        const div = document.createElement('div');
        div.className = 'ranking-entry';
        // Puesto, nombre y lo que se mueve el Elo. Los puntos y el combo ya no
        // se enseñan (el servidor los sigue calculando y mandando: se siguen
        // sumando a Session Manager en `claimSessionManagerResult`).
        const e = elo.find(c => c.nickname === entry.nickname);
        const d = e ? e.after - e.before : null;

        const pos = document.createElement('span');
        pos.className = 'rank-pos';
        pos.textContent = String(entry.position);   // sin medallas: el primero va en bermellón (partida.css)
        // textContent, no innerHTML: el apodo lo escribe cualquiera.
        const nombre = document.createElement('span');
        nombre.className = 'rank-name';
        nombre.textContent = sinEmoji(entry.nickname);
        div.append(pos, nombre);
        if (d !== null) {
            const eloTag = document.createElement('span');
            eloTag.className = 'rank-elo ' + (d > 0 ? 'up' : d < 0 ? 'down' : '');
            eloTag.textContent = `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d)}`;
            div.append(eloTag);
        }
        list.appendChild(div);
    });
    document.getElementById('gameOverOverlay').classList.add('active');
    showMyElo(elo);
    claimSessionManagerResult(rankings);
    // Solo si ganas una partida con rivales; un mensaje repetido no relanza.
    if (!yaMostrado && rankings.length > 1 && rankings.some(e => e.position === 1 && e.nickname === est.currentNickname)) lanzarConfeti();
}

/** Tu Elo en el overlay final: gira desde el que tenías hasta el nuevo. */
function showMyElo(elo) {
    const box = document.getElementById('eloDial');
    const mio = elo.find(c => c.nickname === est.currentNickname);
    if (!mio || typeof agDial !== 'function') {
        box.hidden = true;
        return;
    }
    box.hidden = false;
    const glory = mio.pool === 'glory';
    // Un instante para que el overlay se vea antes de que empiece a girar.
    setTimeout(() => agDial(box, {
        from: mio.before,
        to: mio.after,
        skin: glory ? 'glory' : 'fun',
        // El Top 3 lo decide el servidor (los 3 mejores con 10 partidas y más de 1000).
        top3Before: !!mio.top3_before,
        top3After: !!mio.top3_after,
        onStep: () => playSfx(glory ? 'dialGlory' : 'dialFun'),
        onRank: e => playSfx(e.dir === 'up' ? 'rankUp' : 'rankDown'),
    }), 450);
}

