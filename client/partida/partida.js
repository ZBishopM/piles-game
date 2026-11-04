// La partida con el estilo de la mesa (diseno/menu-mesa/README.md). lobby.html sigue mandando:
// aquí se envuelven sus funciones para cambiar texto por elementos que se entienden solos
// (iconos, destellos, montoncitos de set) y, en los pasos siguientes, los toques por gestos.
'use strict';
(() => {
    const ICONOS = {
        altavoz: 'M3 9v6h4l6 5V4L7 9zM16 9l2 3-2 3M19 6l3 6-3 6', mudo: 'M3 9v6h4l6 5V4L7 9zM16 9l6 6M22 9l-6 6',
        rayo: 'M13 2 5 14h6l-1 8 8-12h-6z', bandera: 'M5 22V3M5 4h13l-3 4.5 3 4.5H5', ojo: 'M2 12l5-5h10l5 5-5 5H7zM11 10h2v4h-2z',
        candado: 'M5 11h14v10H5zM8 11V7h8v4', hueco: 'M6 3h12v18H6zM10 10h4v4h-4z', cruz: 'M5 5l14 14M19 5 5 19',
        reloj: 'M6 3h12M6 21h12M7 3l10 18M17 3 7 21', escudo: 'M12 3l8 3v6l-8 9-8-9V6z', check: 'M4 12l5 5L20 6',
        enchufe: 'M9 3v5M15 3v5M6 8h12v4l-6 6-6-6zM12 18v4', fuera: 'M14 4H4v16h10M10 12h11M17 8l4 4-4 4',
    };
    const ico = n => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONOS[n]}"/></svg>`;
    /** Después de una función de lobby.html, esto (sin tocar lo que devuelve ni sus errores). */
    function envolver(nombre, despues) {
        const f = window[nombre];
        if (typeof f !== 'function') return;
        window[nombre] = function (...a) {
            const r = f.apply(this, a);
            try { despues(...a); } catch (e) { console.error('partida', nombre, e); }
            return r;
        };
    }
    const sinEmoji = s => String(s ?? '').replace(/\p{Extended_Pictographic}️?/gu, '').replace(/\s+/g, ' ').trim();

    // ── Un icono junto a lo que falló (en vez de «⚠️ …» en la franja) ──────────────
    function avisoIco(nombre, cerca, ambar = false) {
        const r = cerca?.getBoundingClientRect?.(); if (!r) return;
        const e = document.createElement('div');
        e.className = 'aviso-ico' + (ambar ? ' ambar' : '');
        e.innerHTML = ico(nombre);
        e.style.left = `${r.left + r.width / 2}px`; e.style.top = `${r.top + Math.min(r.height / 2, 60)}px`;
        document.body.append(e);
        setTimeout(() => e.remove(), 1200);
    }
    /** La franja del marcador de alguien destella: de quién vino (frenesí, la carta que te quitó). */
    function destello(nick) {
        const s = [...document.querySelectorAll('#hud .hud-stripe')].find(x => x.querySelector('.hud-name')?.dataset.nick === nick);
        if (!s) return;
        s.classList.remove('destello'); void s.offsetWidth; s.classList.add('destello');
    }

    // ── Tus sets: seis montoncitos; el revelado enseña su prenda ───────────────────
    envolver('updateSetNav', () => {
        const rev = misSetsRevelados();
        document.querySelectorAll('#setNav .set-btn').forEach((b, i) => {
            b.setAttribute('aria-label', t('set.n', { n: i + 1 }));
            if (!b.querySelector('.set-mini')) {
                b.textContent = '';
                const mini = document.createElement('i'); mini.className = 'set-mini';
                const ojo = document.createElement('span'); ojo.className = 'set-eye';   // updateSetNav escribe aquí
                b.append(mini, ojo);
            }
            const c = rev.get(i), mini = b.querySelector('.set-mini');
            if (c) applyCardSprite(mini, c); else mini.style.backgroundPosition = '';
        });
    });

    // ── Iconos en vez de emoji y de rótulos ───────────────────────────────────────
    const pintarMute = () => { const b = document.getElementById('muteBtn'); if (b) b.innerHTML = ico(sfxMuted ? 'mudo' : 'altavoz'); };
    envolver('toggleMute', pintarMute);
    envolver('onGameStart', pintarMute);
    pintarMute();
    const frenesi = document.getElementById('frenzyBtn');
    if (frenesi) { frenesi.removeAttribute('data-i18n'); frenesi.innerHTML = ico('rayo'); }
    const rendirse = document.getElementById('qteGiveUpBtn');
    if (rendirse) rendirse.innerHTML = `${ico('bandera')}<i></i>`;   // <i>: el relleno de mantener pulsado
    // En la pelea, tu contador lleva tu nombre a secas (en bermellón, por CSS), sin «⭐ … (Tú)».
    // La pelea de otros: nombres sin emoji, espadas y números (sin «0 clicks»).
    envolver('onSwapConflict', (players, cardId) => {
        if (players.includes(currentNickname)) {
            document.querySelectorAll('#qteScores .qte-name').forEach(n => (n.textContent = sinEmoji(n.closest('.is-me') ? currentNickname : n.textContent)));
            return;
        }
        const n = qteNotifs.get(cardId); if (!n) return;
        n.querySelectorAll('.qbn-player').forEach(p => (p.textContent = sinEmoji(p.textContent)));
        const vs = n.querySelector('.qbn-vs'); if (vs) vs.innerHTML = ico('cruz');
        n.querySelectorAll('.qbn-scores [data-nick]').forEach(s => (s.textContent = '0'));
    });
    envolver('onQteUpdate', clicks => {
        for (const n of qteNotifs.values()) n.querySelectorAll('.qbn-scores [data-nick]').forEach(s => { if (s.dataset.nick in clicks) s.textContent = clicks[s.dataset.nick]; });
    });
    // Marcador: nombres sin emoji (los bots llegan como «🤖 Bot 1»); quien mira, un ojo y el número
    envolver('renderPlayersProgress', () => {
        document.querySelectorAll('#hud .hud-name').forEach(n => { n.dataset.nick = n.textContent; n.textContent = sinEmoji(n.textContent); });
        const chip = document.querySelector('#hud .hud-stripe.mirones');
        if (chip) chip.innerHTML = `${ico('ojo')}${mirones}`;
    });
    // Los avisos de otros (se cayó, se fue, volvió): un icono en vez del emoji
    const pintarAvisoBase = window.pintarAviso;
    if (typeof pintarAvisoBase === 'function') window.pintarAviso = (nick, titulo, lineas) => {
        const icono = /🔌/.test(titulo) ? 'enchufe' : /🚪/.test(titulo) ? 'fuera' : /✅/.test(titulo) ? 'check' : null;
        const el = pintarAvisoBase(nick, sinEmoji(titulo) || nick, lineas);
        if (el && icono) el.querySelector('.qbn-title')?.insertAdjacentHTML('afterbegin', ico(icono) + ' ');
        return el;
    };

    // ── Lo que decía la franja de texto, ahora se ve ──────────────────────────────
    // Jugada rechazada por el servidor: un icono sobre la fila (candado: en pelea o verificando;
    // hueco: debes o no debes carta; cruz: se la llevaron). Te la quitaron: destella quién.
    const MOTIVO = { wait_fight: 'candado', card_fought: 'candado', verifying: 'candado', lost_card: 'candado',
        owe_card: 'hueco', empty_slot: 'hueco', no_debt: 'hueco', card_gone: 'cruz' };
    envolver('onSwapFailed', msg => {
        if ((msg.kind || 'rule') === 'gone') { if (msg.by) destello(msg.by); return; }
        if (!msg.reason || qtePlayers.includes(currentNickname) || isStunned()) return;
        const fila = ['owe_card', 'verifying'].includes(msg.code) ? 'yourCards' : 'centerCards';
        avisoIco(MOTIVO[msg.code] ?? 'cruz', document.getElementById(fila));
    });
    // Se acabó el tiempo de la deuda: la carta forzada entra con destello ámbar
    envolver('onDebtForced', () => {
        const fila = document.getElementById('yourCards');
        fila?.classList.remove('destello-ambar'); void fila?.offsetWidth; fila?.classList.add('destello-ambar');
        avisoIco('reloj', fila, true);
    });
    // Frenesí: destella quién lo soltó; si el tuyo lo paró, un escudo
    envolver('onFrenzyFired', msg => {
        destello(msg.player);
        if ((msg.countered || []).includes(currentNickname)) avisoIco('escudo', document.getElementById('comboBox'));
    });

    // ── Vivo aunque no juegues: fragmentos de fondo y barrido ─────────────────────
    const tablero = document.getElementById('gameScreen');
    for (const f of ['f1', 'f2', 'f3']) { const d = document.createElement('div'); d.className = `pfrag ${f}`; d.setAttribute('aria-hidden', 'true'); tablero.prepend(d); }
    const barrido = document.createElement('div'); barrido.className = 'pbarrido'; barrido.setAttribute('aria-hidden', 'true'); document.body.append(barrido);
    const barrer = () => { if (REDUCED_MOTION?.matches) return; barrido.classList.remove('pasa'); void barrido.offsetWidth; barrido.classList.add('pasa'); };
    envolver('switchSet', barrer);
    envolver('onGameStart', barrer);
    envolver('onFrenzyFired', barrer);
    // Frenesí cargado: el fondo se calienta (CSS #gameScreen.frenesi)
    envolver('updateFrenzyBtn', ready => tablero.classList.toggle('frenesi', !!ready));

    // ── Sin espacio muerto: las cartas del centro crecen hasta llenar la mesa ───────
    // Para n huecos, las columnas que dan la carta más grande que cabe en el alto y el ancho.
    const PROP = 10361 / 16000, HUECO = 12, MAX = 190;
    function encajarCentro() {
        const fila = document.getElementById('centerCards');
        if (!fila || !tablero.classList.contains('active')) return;
        const n = Math.max(1, fila.children.length), cs = getComputedStyle(fila);
        const ancho = fila.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const alto = fila.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
        if (ancho <= 0 || alto <= 0) return;
        let mejor = 0, cols = 1;
        for (let c = 1; c <= n; c++) {
            const r = Math.ceil(n / c);
            const w = Math.min((ancho - (c - 1) * HUECO) / c, ((alto - (r - 1) * HUECO) / r) * PROP);
            if (w > mejor) { mejor = w; cols = c; }
        }
        fila.style.setProperty('--cc', cols);
        fila.style.setProperty('--cw', `${Math.floor(Math.min(mejor * 0.9, MAX))}px`);   // 0,9: margen para el ángulo de cada carta
    }
    envolver('renderCenterCards', encajarCentro);
    envolver('onGameStart', () => requestAnimationFrame(encajarCentro));
    addEventListener('resize', encajarCentro);

    window.partida = { avisoIco, destello, ico, encajarCentro };
})();
