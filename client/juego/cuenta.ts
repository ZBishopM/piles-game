// ─── Elo en el perfil y vincular la cuenta ────────────────────────────────
import { emitir } from './bus.js';
import { miNombre, est, opponentFlippedSets, porId, type Msg } from './estado.js';
import type { RankingEntry } from '../tipos/RankingEntry';
import { srvText } from './red.js';
import { cancelQuickMatchOffer, closeCountdown } from './sala.js';
import { IS_BETA, resetCombo } from './tablero.js';
import { stopMusic } from './musica.js';
import { clearStun, closeQteOverlay } from './pelea.js';
import { closeVerifyOverlay, clearMatchNotifications } from './verificacion.js';

const SM_BASE = 'https://gamesessions.danassistantassistant.website';

/** Lo que da /api/elo/:key: rating y partidas por clasificación. */
type EloRec = Partial<Record<'fun' | 'glory', { r: number; n: number }>> & { top3?: { fun?: boolean; glory?: boolean } };

export async function fetchElo(key: string): Promise<EloRec | null> {
    const res = await fetch(`/api/elo/${encodeURIComponent(key)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

const played = (rec: EloRec | null) => !!rec && (!!rec.fun || !!rec.glory);
const eloLine = (rec: EloRec | null) => (['fun', 'glory'] as const)
    .filter(p => rec?.[p])
    .map(p => `${p === 'fun' ? 'For fun' : 'For glory'} ${rec![p]!.r} (${t('elo.games', { n: rec![p]!.n })})`)
    .join(' · ');

// ─── Código de Session Manager ───────────────────────────────────────────
// Queda guardado (piles_sm_code) y se usa en cada partida hasta que lo
// cambies o lo borres. Lo escribe la mesa (Perfil → Session Manager).
export const smCodeGuardado = () => (localStorage.getItem('piles_sm_code') || '').trim();
/** Guarda el código y, si tiene forma de código, vincula también el Elo. */
export function setSmCode(code: string | null | undefined) {
    const v = (code || '').trim().toUpperCase();
    if (!v) { clearSmCode(); return; }
    localStorage.setItem('piles_sm_code', v);
    if (/^[A-Z2-9]{6,12}$/.test(v)) linkAccountElo(v);
}
export function clearSmCode() {
    localStorage.removeItem('piles_sm_code');
    unlinkAccountElo();
}

/** Pregunta con el diálogo de Elo. Resuelve con 'a' o 'b'. */
function askEloChoice({ title, text, a, b }: { title: string; text: string; a: string; b: string }): Promise<'a' | 'b'> {
    const box = porId('eloChoice');
    porId('eloChoiceTitle').textContent = title;
    porId('eloChoiceText').textContent = text;
    const btnA = porId('eloChoiceA');
    const btnB = porId('eloChoiceB');
    btnA.textContent = a;
    btnB.textContent = b;
    box.hidden = false;
    return new Promise(resolve => {
        const done = (choice: 'a' | 'b') => { box.hidden = true; btnA.onclick = btnB.onclick = null; resolve(choice); };
        btnA.onclick = () => done('a');
        btnB.onclick = () => done('b');
    });
}

/** Al pegar un código de Session Manager: pasa el Elo de este navegador a la
 *  cuenta, o se queda el de la cuenta, según lo que haya y lo que elijas. */
async function linkAccountElo(code: string) {
    if (!/^[A-Z2-9]{6,12}$/.test(code)) return;
    let player;
    try {
        const url = `${SM_BASE}/api/collections/piles_claims/records?perPage=1&filter=${encodeURIComponent(`code='${code}'`)}`;
        const res = await fetch(url);
        player = (await res.json()).items?.[0]?.player;
    } catch { /* abajo */ }
    if (!player) return;   // código que no existe: el aviso del claim ya lo dirá

    const account = `sm:${player}`;
    if (localStorage.getItem('piles_rating_key') === account) return;   // ya vinculado
    const anonId = localStorage.getItem('piles_anon_id');
    const anon = anonId ? `anon:${anonId}` : null;

    let del_navegador: EloRec | null = null, de_la_cuenta: EloRec | null = null;
    try {
        [del_navegador, de_la_cuenta] = await Promise.all([anon ? fetchElo(anon) : null, fetchElo(account)]);
    } catch {
        agToast({ kind: 'error', title: 'Elo', message: t('elo.err_read') });
        return;
    }

    let keep = 'account';
    if (played(del_navegador) && !played(de_la_cuenta)) {
        const r = await askEloChoice({
            title: t('elo.move_q'),
            text: t('elo.move_text', { elo: eloLine(del_navegador) }),
            a: t('elo.move_yes'), b: t('elo.move_no'),
        });
        keep = r === 'a' ? 'anon' : 'account';
    } else if (played(del_navegador) && played(de_la_cuenta)) {
        const r = await askEloChoice({
            title: t('elo.keep_q'),
            text: t('elo.keep_text', { acc: eloLine(de_la_cuenta), br: eloLine(del_navegador) }),
            a: t('elo.keep_acc'), b: t('elo.keep_br'),
        });
        keep = r === 'a' ? 'account' : 'anon';
    }

    if (anon) {
        const res = await fetch('/api/elo/link', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ anon, account, keep }),
        }).catch(() => null);
        if (!res?.ok) {
            agToast({ kind: 'error', title: 'Elo', message: t('elo.err_link') });
            return;
        }
    }
    localStorage.setItem('piles_rating_key', account);
    localStorage.removeItem('piles_anon_id');
    agToast({ kind: 'success', message: t('elo.linked') });
}

/** Desvincular: se vuelve a jugar como este navegador, con un Elo nuevo. */
function unlinkAccountElo() {
    localStorage.removeItem('piles_rating_key');
    localStorage.removeItem('piles_anon_id');
}

// Optional, purely additive: if the player entered a Session Manager code
// before the round started, send their own real result (position/points,
// already computed here) so it counts toward their session-manager
// profile. No effect on anonymous play — nothing is sent without a code.
// See pb_hooks/piles_claim.pb.js in the session-manager repo.
export function claimSessionManagerResult(rankings: RankingEntry[]) {
    // En beta no se reclama nada: no hace falta cuenta de Session Manager y
    // las partidas de prueba no deben sumar en perfiles reales.
    if (IS_BETA) return;
    // Desde localStorage, no del input: el campo vive en la pantalla de
    // perfil y aquí solo importa el valor guardado.
    const code = (localStorage.getItem('piles_sm_code') || '').trim().toUpperCase();
    if (!code) return;

    const myNickname = localStorage.getItem('piles_nickname');
    const mine = rankings.find(r => r.nickname === myNickname);
    if (!mine) return;

    fetch('https://gamesessions.danassistantassistant.website/api/piles/claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, placement: mine.position, points: mine.points }),
    })
        .then(res => res.json().then(body => ({ ok: res.ok, body })))
        .then(({ ok, body }) => {
            const footer = document.getElementById('smClaimStatus');
            if (!footer) return;
            if (ok) {
                footer.textContent = t('sm.ok');
                return;
            }
            if (body.error === 'unknown code') {
                // El código guardado ya no existe — pasa al generar uno nuevo
                // en el perfil, que borra el anterior. Se descarta aquí; si no,
                // cada partida volvería a fallar igual y sin explicar nada.
                localStorage.removeItem('piles_sm_code');
                footer.textContent = t('sm.stale');
                return;
            }
            footer.textContent = t('sm.fail', { why: body.error || t('sm.unknown') });
        })
        .catch(() => {
            const footer = document.getElementById('smClaimStatus');
            if (footer) footer.textContent = t('sm.offline');
        });
}

export function onGameCancelled(msg: Msg<'game_cancelled'>) {
    stopMusic();
    // Cerrar overlays activos del juego
    closeVerifyOverlay();
    closeQteOverlay();
    clearStun();
    clearMatchNotifications();
    resetCombo();
    // Aviso y de vuelta a la sala. El aviso sobrevive al cambio de pantalla,
    // así que no hace falta dejar a nadie 3 s mirando un cartel. (El motivo
    // lleva un nickname: textContent en toast.js, nunca innerHTML.)
    agToast({ kind: 'warning', title: t('cancel.title'), message: srvText(msg, 'cancel') });
    returnToLobby();
}

export function returnToLobby() {
    cancelQuickMatchOffer();
    stopMusic();
    est.gameOver = false;
    est.isReady = false;
    porId('gameOverOverlay').classList.remove('active');
    document.getElementById('confetiLayer')?.remove();
    // Resetear estado de juego
    est.allSets = [];
    est.centerCards = [];
    est.verificationSent = false;
    est.myFlippedSets = Array(6).fill(false);
    opponentFlippedSets.clear();
    est.pendingDrop = null;
    est.pendingTake = null;
    clearStun();
    document.getElementById('gameScreen')?.classList.remove('owing');
    porId('fxLayer').innerHTML = '';
    // Red de seguridad: si algo quedó de la partida anterior, no debe
    // aparecer flotando encima de la siguiente.
    clearMatchNotifications();
    est.specState = null; est.specVista = null; est.specSet = null;
    showScreen('lobbyScreen');
}

// ─── Vista ────────────────────────────────────────────────────────────────
/** Dónde está el jugador: 'homeScreen', 'profileScreen', 'joinScreen', 'lobbyScreen'
 *  o 'gameScreen'. Solo la partida es una pantalla del DOM; el resto lo pinta la
 *  mesa, que escucha `showScreen` para ir a su menú. */
export let vistaActual = 'homeScreen';
export function showScreen(id: string) {
    vistaActual = id;
    porId('gameScreen').classList.toggle('active', id === 'gameScreen');
    if (id !== 'lobbyScreen') closeCountdown();   // la partida (o salir) cierra la cuenta atrás
    emitir('showScreen', id);
}

// Cambiar de idioma recarga la página (ver i18n.js): se recuerda la pantalla para volver a ella.
window.onBeforeLangChange = () => {
    try {
        const v = miNombre();
        if (v) localStorage.setItem('piles_nickname', v);
        sessionStorage.setItem('piles.afterLang', vistaActual);
    } catch { /* sin storage */ }
};
