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
    // Pero una carta que entra NO recoloca a las demás: la mesa reserva sus casillas
    // (columnas × las filas que caben) y solo se vuelve a repartir si ya no caben, o si
    // cambia el tamaño de la pantalla. Cada hueco del centro es fijo (syncCenterSlots).
    const PROP = 10361 / 16000, HUECO = 12, MAX = 190;
    let casillas = 0, medida = '';
    function encajarCentro(forzar = false) {
        const fila = document.getElementById('centerCards');
        if (!fila || !tablero.classList.contains('active')) return;
        const n = Math.max(1, fila.children.length), cs = getComputedStyle(fila);
        const ancho = fila.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const alto = fila.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
        if (ancho <= 0 || alto <= 0) return;
        const ahora = `${ancho}x${alto}`;
        if (!forzar && ahora === medida && n <= casillas) return;   // cabe: nada se mueve
        medida = ahora;
        const objetivo = n + 2;   // holgura: las dos siguientes caen sin repartir de nuevo
        let mejor = 0, cols = 1;
        for (let c = 1; c <= objetivo; c++) {
            const r = Math.ceil(objetivo / c);
            const w = Math.min((ancho - (c - 1) * HUECO) / c, ((alto - (r - 1) * HUECO) / r) * PROP);
            if (w > mejor) { mejor = w; cols = c; }
        }
        const w = Math.floor(Math.min(mejor * 0.9, MAX));   // 0,9: margen para el ángulo de cada carta
        // Filas reservadas: la rejilla tiene siempre las mismas, así que no se recentra al
        // aparecer o vaciarse una (antes subía todo 80 px de golpe)
        const filas = Math.max(Math.ceil(n / cols), Math.floor((alto + HUECO) / (w / PROP + HUECO)));
        casillas = cols * filas;
        fila.style.setProperty('--cc', cols);
        fila.style.setProperty('--cf', filas);
        fila.style.setProperty('--cw', `${w}px`);
    }
    // Cada hueco del centro (fijo, ver syncCenterSlots) va a una casilla fija, de la mitad de la
    // mesa hacia fuera: las primeras cartas quedan en medio, no amontonadas en una esquina.
    function colocarCasillas() {
        const fila = document.getElementById('centerCards');
        const cols = +fila?.style.getPropertyValue('--cc') || 0, filas = +fila?.style.getPropertyValue('--cf') || 0;
        if (!cols || !filas) return;
        const cx = (cols - 1) / 2, cy = (filas - 1) / 2, orden = [];
        for (let r = 0; r < filas; r++) for (let c = 0; c < cols; c++) orden.push([r, c, Math.hypot((c - cx) * 1.15, r - cy) + (r * cols + c) * 1e-3]);
        orden.sort((a, b) => a[2] - b[2]);
        [...fila.children].forEach((e, i) => { const o = orden[i]; e.style.gridArea = o ? `${o[0] + 1} / ${o[1] + 1}` : ''; });
    }
    envolver('renderCenterCards', () => { encajarCentro(); colocarCasillas(); });
    envolver('onGameStart', () => { casillas = 0; requestAnimationFrame(() => { encajarCentro(true); colocarCasillas(); }); });
    addEventListener('resize', () => { encajarCentro(true); colocarCasillas(); });

    // ── Gravedad: la carta que cae pesa; las demás saltan en su sitio, no se mueven ──
    // `markLanded` (lobby.html) marca la carta y llama a `shakeBoard`, que sacudía las filas
    // enteras. Aquí el golpe es en la mesa: se hunde un poco, la carta se aplasta al caer y
    // las demás dan un saltito que se apaga con la distancia.
    let aterriza = null, sinAterrizar = new Set();
    const markLandedBase = window.markLanded;
    window.markLanded = (rowId, index, won = false) => {
        const el = document.getElementById(rowId)?.children[index];
        if (el && sinAterrizar.has(Number(el.dataset.cardId))) return;   // la que viene volando lo hará al llegar
        aterriza = { rowId, el, won };
        return markLandedBase(rowId, index, won);
    };
    window.shakeBoard = (fuerte = false) => {
        if (REDUCED_MOTION?.matches || !aterriza?.el) return;
        const { rowId, el } = aterriza; aterriza = null;
        const fila = document.getElementById(rowId); if (!fila) return;
        const r0 = el.getBoundingClientRect(), c0 = [r0.left + r0.width / 2, r0.top + r0.height / 2];
        fila.classList.remove('golpe', 'golpe-fuerte'); void fila.offsetWidth; fila.classList.add(fuerte ? 'golpe-fuerte' : 'golpe');
        setTimeout(() => fila.classList.remove('golpe', 'golpe-fuerte'), 500);
        for (const c of fila.children) {
            if (c === el || c.classList.contains('center-gap') || c.classList.contains('card-empty')) continue;
            const r = c.getBoundingClientRect(), d = Math.hypot(r.left + r.width / 2 - c0[0], r.top + r.height / 2 - c0[1]);
            c.style.setProperty('--brinco', `${Math.max(1, (fuerte ? 9 : 6) - d / 60).toFixed(1)}px`);
            c.style.setProperty('--retraso', `${Math.round(d / 4)}ms`);
            c.classList.remove('brinca'); void c.offsetWidth; c.classList.add('brinca');
            setTimeout(() => c.classList.remove('brinca'), 600);
        }
    };

    // ── Quién se lleva cada carta y de quién viene la que cae ─────────────────────
    // `game_update` trae `moved {kind, card_id, by, taunt}`. Si lo hizo otro: la que se lleva
    // vuela de la mesa a su franja del marcador; la que suelta sale de su franja y cae en la
    // mesa con todo su peso. Lo tuyo ya tiene sus vuelos (flyCard).
    const franja = nick => [...document.querySelectorAll('#hud .hud-stripe')].find(x => x.querySelector('.hud-name')?.dataset.nick === nick);
    function copia(card, r) {
        const e = document.createElement('div');
        e.className = 'card vuela'; applyCardSprite(e, card);
        Object.assign(e.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
        document.getElementById('fxLayer').append(e);
        return e;
    }
    function seLaLleva(m) {
        const el = document.querySelector(`#centerCards .card[data-card-id="${m.card_id}"]`), dest = franja(m.by);
        if (!el || !dest) { destello(m.by); return; }
        const card = centerCards.find(c => c.id === m.card_id) ?? { id: m.card_id, clothing_type: 0 };
        const a = el.getBoundingClientRect(), b = dest.getBoundingClientRect();
        const e = copia(card, a), s = Math.max(.15, b.height / a.height);
        const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
        e.animate([
            { transform: 'translate(0, 0) rotate(0) scale(1)' },
            { transform: `translate(${dx * .35}px, ${dy * .35 + 18}px) rotate(-8deg) scale(1.12)`, offset: .3 },   // la arranca: sube un poco y se tuerce
            { transform: `translate(${dx}px, ${dy}px) rotate(14deg) scale(${s})`, opacity: .3 },
        ], { duration: 480, easing: 'cubic-bezier(.5, 0, .25, 1)' }).finished.finally(() => { e.remove(); destello(m.by); });
    }
    function laSuelta(m) {
        const orig = franja(m.by)?.getBoundingClientRect();
        if (!orig) return;
        sinAterrizar.add(m.card_id);
        requestAnimationFrame(() => {   // ya redibujado el centro: la carta nueva tiene su hueco
            const el = document.querySelector(`#centerCards .card[data-card-id="${m.card_id}"]`);
            const card = centerCards.find(c => c.id === m.card_id);
            if (!el || !card) { sinAterrizar.delete(m.card_id); return; }
            const b = el.getBoundingClientRect(), a = { left: orig.left + orig.width / 2 - b.width * .2, top: orig.top, width: b.width * .4, height: b.height * .4 };
            const e = copia(card, b);
            el.style.visibility = 'hidden';
            const dx = a.left + a.width / 2 - (b.left + b.width / 2), dy = a.top + a.height / 2 - (b.top + b.height / 2);
            e.animate([
                { transform: `translate(${dx}px, ${dy}px) rotate(-20deg) scale(.4)`, opacity: .4 },
                { transform: `translate(${dx * .4}px, ${dy * .4 - 50}px) rotate(-6deg) scale(1.25)`, opacity: 1, offset: .45 },   // la lanza: sube
                { transform: 'translate(0, 0) rotate(0) scale(1)' },   // y cae a plomo
            ], { duration: 520, easing: 'cubic-bezier(.55, 0, .85, .35)' }).finished.finally(() => {
                e.remove(); sinAterrizar.delete(m.card_id);
                // El centro puede haberse redibujado durante el vuelo: el nodo de ahora
                const ya = document.querySelector(`#centerCards .card[data-card-id="${m.card_id}"]`);
                if (!ya) return;
                ya.style.visibility = '';
                const i = [...ya.parentElement.children].indexOf(ya);
                if (i >= 0) window.markLanded('centerCards', i);
            });
        });
    }
    const handleMsgPartida = window.handleMsg;
    window.handleMsg = msg => {
        const m = msg?.type === 'game_update' ? msg.moved : null;
        const otro = m && (m.by !== currentNickname || soyEspectador) ? m : null;   // lo tuyo ya vuela con flyCard
        if (otro && otro.kind !== 'drop') { try { seLaLleva(otro); } catch (e) { console.error('partida', e); } }   // antes de que desaparezca
        if (otro && otro.kind === 'drop') { try { laSuelta(otro); } catch (e) { console.error('partida', e); } }
        return handleMsgPartida(msg);
    };

    window.partida = { avisoIco, destello, ico, encajarCentro };
})();
