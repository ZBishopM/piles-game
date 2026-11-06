// La partida con el estilo de la mesa (diseno/menu-mesa/README.md). La lógica es la de
// client/juego/: aquí se escuchan sus avisos (juego/bus.js) para cambiar texto por elementos
// que se entienden solos (iconos, destellos, montoncitos de set), y van los gestos.
import { al } from '../juego/bus.js';
import { est } from '../juego/estado.js';
import { send } from '../juego/red.js';
import { sinEmoji } from '../juego/espectador.js';
import { misSetsRevelados, applyCardSprite, markLanded, REDUCED_MOTION, fireFrenzy } from '../juego/tablero.js';
import { playSfx } from '../juego/sonido.js';
import { playTaunt } from '../juego/burlas.js';
import { onPlayerCardClick, onCenterCardClick, owesCard, switchSet, flipCurrentSet, qteNotifs } from '../juego/toques.js';
import { isStunned } from '../juego/pelea.js';

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
    al('updateSetNav', () => {
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
    const pintarMute = () => { const b = document.getElementById('muteBtn'); if (b) b.innerHTML = ico(est.sfxMuted ? 'mudo' : 'altavoz'); };
    al('toggleMute', pintarMute);
    al('onGameStart', pintarMute);
    pintarMute();
    const frenesi = document.getElementById('frenzyBtn');
    if (frenesi) { frenesi.removeAttribute('data-i18n'); frenesi.innerHTML = ico('rayo'); }
    const rendirse = document.getElementById('qteGiveUpBtn');
    if (rendirse) rendirse.innerHTML = `${ico('bandera')}<i></i>`;   // <i>: el relleno de mantener pulsado
    // En la pelea, tu contador lleva tu nombre a secas (en bermellón, por CSS), sin «⭐ … (Tú)».
    // La pelea de otros: nombres sin emoji, espadas y números (sin «0 clicks»).
    al('onSwapConflict', (players, cardId) => {
        if (players.includes(est.currentNickname)) {
            document.querySelectorAll('#qteScores .qte-name').forEach(n => (n.textContent = sinEmoji(n.closest('.is-me') ? est.currentNickname : n.textContent)));
            return;
        }
        const n = qteNotifs.get(cardId); if (!n) return;
        n.querySelectorAll('.qbn-player').forEach(p => (p.textContent = sinEmoji(p.textContent)));
        const vs = n.querySelector('.qbn-vs'); if (vs) vs.innerHTML = ico('cruz');
        n.querySelectorAll('.qbn-scores [data-nick]').forEach(s => (s.textContent = '0'));
    });
    al('onQteUpdate', clicks => {
        for (const n of qteNotifs.values()) n.querySelectorAll('.qbn-scores [data-nick]').forEach(s => { if (s.dataset.nick in clicks) s.textContent = clicks[s.dataset.nick]; });
    });
    // Marcador: nombres sin emoji (los bots llegan como «🤖 Bot 1»); quien mira, un ojo y el número
    al('renderPlayersProgress', () => {
        document.querySelectorAll('#hud .hud-name').forEach(n => { n.dataset.nick = n.textContent; n.textContent = sinEmoji(n.textContent); });
        const chip = document.querySelector('#hud .hud-stripe.mirones');
        if (chip) chip.innerHTML = `${ico('ojo')}${est.mirones}`;
    });
    // Los avisos de otros (se cayó, se fue, volvió): un icono en vez del emoji
    al('pintarAviso', (el, nick, titulo) => {
        const icono = /🔌/.test(titulo) ? 'enchufe' : /🚪/.test(titulo) ? 'fuera' : /✅/.test(titulo) ? 'check' : null;
        const tit = el?.querySelector('.qbn-title'); if (!tit) return;
        tit.textContent = sinEmoji(titulo) || nick;
        if (icono) tit.insertAdjacentHTML('afterbegin', ico(icono) + ' ');
    });

    // ── Lo que decía la franja de texto, ahora se ve ──────────────────────────────
    // Jugada rechazada por el servidor: un icono sobre la fila (candado: en pelea o verificando;
    // hueco: debes o no debes carta; cruz: se la llevaron). Te la quitaron: destella quién.
    const MOTIVO = { wait_fight: 'candado', card_fought: 'candado', verifying: 'candado', lost_card: 'candado',
        owe_card: 'hueco', empty_slot: 'hueco', no_debt: 'hueco', card_gone: 'cruz' };
    al('onSwapFailed', msg => {
        if ((msg.kind || 'rule') === 'gone') { if (msg.by) destello(msg.by); return; }
        if (!msg.reason || est.qtePlayers.includes(est.currentNickname) || isStunned()) return;
        const fila = ['owe_card', 'verifying'].includes(msg.code) ? 'yourCards' : 'centerCards';
        avisoIco(MOTIVO[msg.code] ?? 'cruz', document.getElementById(fila));
    });
    // Se acabó el tiempo de la deuda: la carta forzada entra con destello ámbar
    al('onDebtForced', () => {
        const fila = document.getElementById('yourCards');
        fila?.classList.remove('destello-ambar'); void fila?.offsetWidth; fila?.classList.add('destello-ambar');
        avisoIco('reloj', fila, true);
    });
    // Frenesí: destella quién lo soltó; si el tuyo lo paró, un escudo
    al('onFrenzyFired', msg => {
        destello(msg.player);
        if ((msg.countered || []).includes(est.currentNickname)) avisoIco('escudo', document.getElementById('comboBox'));
    });

    // ── Gestos que siguen al dedo y se deshacen hasta llegar ──────────────────────
    // Ceder: la carta en disputa, hasta la bandera blanca de abajo. Frenesí: el rayo, desde la
    // racha hasta arriba. Llegar lo manda; antes, soltar o volver la deja en su sitio. El recorrido
    // se mide al pulsar (lo que queda hasta la bandera o hasta el borde de arriba).
    const vuelve = (el, prop) => { const ida = el.style[prop]; el.style[prop] = ''; if (ida) el.animate([{ [prop]: ida }, { [prop]: '0 0' }], { duration: 260, easing: 'cubic-bezier(.3, 1.6, .5, 1)' }); };
    const qte = document.getElementById('qteOverlay'), bandera = document.getElementById('qteGiveUpBtn'), hueco = document.getElementById('qteCard');
    let cede = null;   // { id, x, y, d, hecho, copia }
    // La caja de la pelea va recortada (clip-path): lo que baja es una copia por fuera de ella
    const copiaCede = () => {
        const c = hueco.querySelector('.card'), r = c?.getBoundingClientRect();
        if (!r) return null;
        const e = c.cloneNode(true);
        e.classList.add('cede');
        Object.assign(e.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
        qte.append(e);
        hueco.style.visibility = 'hidden';
        return e;
    };
    const sinCopia = c => { c?.copia?.remove(); hueco.style.visibility = ''; };
    if (qte && bandera && hueco) {
        al('onSwapConflict', () => { sinCopia(cede); cede = null; bandera.classList.remove('cerca'); });
        al('closeQteOverlay', () => { sinCopia(cede); cede = null; qte.querySelectorAll('.card.cede').forEach(e => e.remove()); hueco.style.visibility = ''; });
        qte.addEventListener('pointerdown', e => {
            if (!est.qteActive || bandera.hidden || e.target.closest('#qteGiveUpBtn')) return;   // el toque cuenta igual (lobby.html)
            const f = bandera.getBoundingClientRect();
            cede = { id: e.pointerId, x: e.clientX, y: e.clientY, d: Math.max(120, f.top + f.height / 2 - e.clientY), hecho: false, copia: null };
            try { qte.setPointerCapture(e.pointerId); } catch { /* */ }
        });
        qte.addEventListener('pointermove', e => {
            const c = cede;
            if (!c || c.id !== e.pointerId || c.hecho) return;
            const dy = e.clientY - c.y;
            if (dy < 16 || dy < Math.abs(e.clientX - c.x)) { if (c.copia) c.copia.style.translate = ''; bandera.classList.remove('cerca'); return; }
            c.copia ??= copiaCede();
            if (!c.copia) return;
            const p = lim(dy / c.d, 0, 1);
            c.copia.style.translate = `0 ${dy}px`;
            bandera.classList.toggle('cerca', p > .6);
            if (p < 1) return;
            c.hecho = true;
            bandera.classList.remove('cerca');
            bandera.hidden = true;
            c.copia.animate([{ opacity: 1 }, { opacity: 0, scale: '.5' }], { duration: 240, fill: 'forwards' });
            playSfx('drop'); zumba(25);
            send({ type: 'give_up_card' });
        });
        const finCede = e => {
            const c = cede;
            if (!c || c.id !== e.pointerId) return;
            cede = null;
            bandera.classList.remove('cerca');
            if (c.hecho || !c.copia) return;
            const ida = c.copia.style.translate || '0 0';
            c.copia.animate([{ translate: ida }, { translate: '0 0' }], { duration: 260, easing: 'cubic-bezier(.3, 1.6, .5, 1)' }).finished.finally(() => sinCopia(c));
            c.copia.style.translate = '';
        };
        qte.addEventListener('pointerup', finCede);
        qte.addEventListener('pointercancel', finCede);
    }

    const racha = document.getElementById('comboBox'), rayo = document.getElementById('frenzyBtn');
    let sube = null;   // { id, x, y, d, hecho, movido }
    if (racha && rayo) {
        racha.addEventListener('pointerdown', e => {
            if (rayo.hidden || est.soyEspectador) return;
            sube = { id: e.pointerId, x: e.clientX, y: e.clientY, d: Math.max(40, e.clientY - 8), hecho: false, movido: false };
            try { racha.setPointerCapture(e.pointerId); } catch { /* */ }
            rayo.classList.add('sostenido');
        });
        racha.addEventListener('pointermove', e => {
            const s = sube;
            if (!s || s.id !== e.pointerId || s.hecho) return;
            const dy = s.y - e.clientY;
            if (dy > TOQUE_PX) s.movido = true;
            const p = lim(dy / s.d, 0, 1);
            rayo.style.translate = `0 ${-Math.max(0, dy)}px`;
            rayo.style.setProperty('--carga', p.toFixed(3));
            if (p < 1) return;
            s.hecho = true;
            zumba(30);
            fireFrenzy();
        });
        const finSube = e => {
            const s = sube;
            if (!s || s.id !== e.pointerId) return;
            sube = null;
            rayo.classList.remove('sostenido');
            rayo.style.removeProperty('--carga');
            if (s.hecho) { rayo.style.translate = ''; return; }
            vuelve(rayo, 'translate');
            // Un toque no lo suelta (se soltaba sin querer): el rayo da un saltito hacia arriba
            if (!s.movido && e.type === 'pointerup') rayo.animate([{ translate: '0 0' }, { translate: '0 -14px' }, { translate: '0 0' }], { duration: 380, easing: 'ease-out' });
        };
        racha.addEventListener('pointerup', finSube);
        racha.addEventListener('pointercancel', finSube);
        // El clic del ratón o del dedo ya no lo suelta; el del teclado (detail 0) sí
        racha.addEventListener('click', e => { if (e.detail > 0 && e.target.closest('#frenzyBtn')) { e.stopPropagation(); e.preventDefault(); } }, true);
    }

    // ── Vivo aunque no juegues: fragmentos de fondo y barrido ─────────────────────
    const tablero = document.getElementById('gameScreen');
    for (const f of ['f1', 'f2', 'f3']) { const d = document.createElement('div'); d.className = `pfrag ${f}`; d.setAttribute('aria-hidden', 'true'); tablero.prepend(d); }
    const barrido = document.createElement('div'); barrido.className = 'pbarrido'; barrido.setAttribute('aria-hidden', 'true'); document.body.append(barrido);
    const barrer = () => { if (REDUCED_MOTION?.matches) return; barrido.classList.remove('pasa'); void barrido.offsetWidth; barrido.classList.add('pasa'); };
    for (const l of ['lampara', 'neon', 'faros', 'velo']) { const d = document.createElement('div'); d.className = `pluz ${l}`; d.setAttribute('aria-hidden', 'true'); tablero.append(d); }
    // Cambiar de set: la mano nueva entra deslizando desde el lado del set elegido y rebota
    // un poco al llegar (antes la cortaba el barrido negro y se sentía brusco)
    al('switchSet', (i, antes) => {
        if (REDUCED_MOTION?.matches) return;
        const x = (i > antes ? 1 : -1) * Math.min(innerWidth * .5, 260);
        document.getElementById('yourCards')?.animate(
            [{ translate: `${x}px 0`, opacity: 0, easing: 'cubic-bezier(.3, .6, .4, 1)' }, { translate: `${-x * .07}px 0`, opacity: 1, offset: .65, easing: 'ease-in-out' }, { translate: '0 0' }],
            { duration: 440 });
    });
    al('onFrenzyFired', barrer);
    // Frenesí cargado: el fondo se calienta (CSS #gameScreen.frenesi)
    al('updateFrenzyBtn', ready => tablero.classList.toggle('frenesi', !!ready));

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
    al('renderCenterCards', () => { encajarCentro(); colocarCasillas(); });
    al('onGameStart', () => { casillas = 0; requestAnimationFrame(() => { encajarCentro(true); colocarCasillas(); }); });
    addEventListener('resize', () => { encajarCentro(true); colocarCasillas(); });

    // ── Gravedad: la carta que cae pesa; las demás saltan en su sitio, no se mueven ──
    // `markLanded` (juego/tablero.js) marca la carta y avisa `golpe` (antes sacudía las filas
    // enteras). Aquí el golpe es en la mesa: se hunde un poco, la carta se aplasta al caer y
    // las demás dan un saltito que se apaga con la distancia.
    // El golpe va al TOCAR la mesa (tras `CAIDA`), no al empezar a caer. Los golpes seguidos
    // se suman: `energia` crece con cada uno y se apaga en ~1 s, y las animaciones son
    // aditivas (composite: 'add'), así que un salto encima de otro sube más.
    const CAIDA = 360;
    let aterriza = null, sinAterrizar = new Set(), trasVuelo = new Set(), energia = 0, ultimo = 0;
    al('vuela', (cardData, from) => { if (cardData && from) trasVuelo.add(cardData.id); });
    al('aterriza', (rowId, index) => {
        const el = document.getElementById(rowId)?.children[index];
        const id = Number(el?.dataset.cardId);
        if (el && sinAterrizar.has(id)) return false;   // la que viene volando lo hará al llegar
        const volo = trasVuelo.delete(id);       // ya cayó volando: solo se estrella, golpe ya
        el?.classList.toggle('solo-aplasta', volo);
        aterriza = { rowId, el, retraso: volo ? 0 : CAIDA };
    });
    al('golpe', (fuerte = false) => {
        if (REDUCED_MOTION?.matches || !aterriza?.el) return;
        const { rowId, el, retraso } = aterriza; aterriza = null;
        setTimeout(() => golpe(rowId, el, fuerte), retraso);
    });
    const ADD = { composite: 'add' };
    function golpe(rowId, el, fuerte) {
        const fila = document.getElementById(rowId);
        if (!fila || !el.isConnected) return;
        const t = performance.now();
        energia = Math.min(3.5, energia * Math.exp(-(t - ultimo) / 900) + (fuerte ? 1.8 : 1)); ultimo = t;
        const E = energia, r0 = el.getBoundingClientRect(), w = r0.width;
        const cx = r0.left + w / 2, cy = r0.top + r0.height / 2;
        // La mesa se hunde y rebota; marcador y la otra fila notan el temblor
        fila.animate([{ translate: '0 0' }, { translate: `0 ${4 * E}px`, offset: .15 }, { translate: `0 ${-.9 * E}px`, offset: .45 }, { translate: '0 0' }],
            { duration: 420, easing: 'ease-out', ...ADD });
        if (rowId === 'centerCards') fila.animate([{ filter: 'brightness(1)' }, { filter: `brightness(${1 - .1 * E})`, offset: .2 }, { filter: 'brightness(1)' }],
            { duration: 460, pseudoElement: '::before' });
        for (const otro of ['hud', rowId === 'centerCards' ? 'yourCards' : 'centerCards'])
            document.getElementById(otro)?.animate([{ translate: '0 0' }, { translate: `0 ${2 * E}px`, offset: .3 }, { translate: '0 0' }], { duration: 320, delay: 50, ...ADD });
        // Las demás saltan en su sitio: la onda llega antes a las cercanas y les pega más
        for (const c of fila.children) {
            if (c === el || c.classList.contains('center-gap') || c.classList.contains('card-empty')) continue;
            const r = c.getBoundingClientRect(), d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy);
            const A = E * (fuerte ? 24 : 16) * Math.exp(-d / (w * 2.5));
            if (A < .6) continue;
            const g = (Math.random() < .5 ? -1 : 1) * A * .35;
            c.animate([
                { translate: '0 0', rotate: '0deg' },
                { translate: `0 ${-A}px`, rotate: `${g}deg`, offset: .3 },
                { translate: `0 ${A * .3}px`, rotate: `${-g * .4}deg`, offset: .6 },
                { translate: `0 ${-A * .1}px`, rotate: '0deg', offset: .8 },
                { translate: '0 0', rotate: '0deg' },
            ], { duration: 560, delay: d / 1.1, easing: 'ease-out', ...ADD });
        }
        // Onda y esquirlas desde el borde de abajo de la que cayó
        const fx = document.getElementById('fxLayer'); if (!fx) return;
        const onda = document.createElement('div');
        onda.className = 'onda' + (fuerte ? ' fuerte' : '');
        Object.assign(onda.style, { left: `${cx}px`, top: `${r0.bottom - 8}px`, width: `${w * 1.5}px` });
        fx.append(onda);
        onda.animate([{ scale: '.3', opacity: .9 }, { scale: `${1 + .5 * E} ${.7 + .3 * E}`, opacity: 0 }],
            { duration: 420 + 60 * E, easing: 'cubic-bezier(.2, .7, .3, 1)' }).finished.finally(() => onda.remove());
        for (let i = 0, n = Math.round(4 + 2 * E); i < n; i++) {
            const s = document.createElement('i');
            s.className = 'esquirla' + (fuerte || i % 3 === 0 ? ' roja' : '');
            Object.assign(s.style, { left: `${cx + (Math.random() - .5) * w}px`, top: `${r0.bottom - 6}px` });
            fx.append(s);
            const lado = Math.random() < .5 ? -1 : 1, vx = lado * (20 + Math.random() * 40) * (.7 + .3 * E), up = 16 + Math.random() * 26 * E;
            s.animate([
                { translate: '0 0', rotate: '0deg', opacity: 1 },
                { translate: `${vx * .6}px ${-up}px`, rotate: `${lado * 140}deg`, offset: .4 },
                { translate: `${vx}px ${up * .5}px`, rotate: `${lado * 280}deg`, opacity: 0 },
            ], { duration: 560, easing: 'cubic-bezier(.3, .6, .5, 1)' }).finished.finally(() => s.remove());
        }
    }

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
        const card = est.centerCards.find(c => c.id === m.card_id) ?? { id: m.card_id, clothing_type: 0 };
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
            const card = est.centerCards.find(c => c.id === m.card_id);
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
                if (i >= 0) { trasVuelo.add(m.card_id); markLanded('centerCards', i); }
            });
        });
    }
    // ── Las cartas, con el dedo o el ratón ────────────────────────────────────────
    // Sostener = dudar: la carta se levanta y sigue al dedo, sin mandar nada.
    // Se juega AL SOLTAR: tu carta, con más de la mitad dentro del recuadro del centro; una del
    // centro, con más de la mitad fuera. Mientras está donde contaría, se ilumina (.casi). Un toque corto
    // hace lo de siempre. Sobre tu set: ← → cambia de set; ↓ es el revelado de gestos.js.
    // Escucha en las filas, en captura, y no deja pasar el evento: bindTap (lobby.html) cogía
    // al bajar el dedo y gestosSet (gestos.js) leía el mismo gesto; aquí manda uno solo.
    const TOQUE_MS = 250, TOQUE_PX = 12, LADO = 50;
    let sostenida = null;   // { fila, el, valor, x, y, t, id, hecho, zona }
    // Más de la mitad de la carta dentro del recuadro = dentro. Con el rectángulo medido al pulsar
    // más lo arrastrado (sin leer el layout en cada movimiento).
    const enZona = (s, e) => {
        const r = s.r0, z = s.zona, dx = e.clientX - s.x, dy = e.clientY - s.y;
        const w = Math.max(0, Math.min(r.right + dx, z.right) - Math.max(r.left + dx, z.left));
        const h = Math.max(0, Math.min(r.bottom + dy, z.bottom) - Math.max(r.top + dy, z.top));
        return w * h > r.width * r.height / 2;
    };
    const cuenta = (s, e) => s.el && (s.fila === 'yourCards') === enZona(s, e);   // ¿soltarla aquí la juega?
    function aSuSitio(s, rebote = true) {
        s.el.classList.remove('sostenida', 'casi', 'soltada');
        document.getElementById(s.fila)?.classList.remove('arrastrando');
        const ida = s.el.style.translate;
        s.el.style.translate = '';
        if (rebote && ida) s.el.animate([{ translate: ida }, { translate: '0 0' }], { duration: 280, easing: 'cubic-bezier(.3, 1.6, .5, 1)' });
    }
    const jugar = (fila, valor, el) => {
        if (est.soyEspectador || valor == null) return;
        if (fila === 'yourCards') onPlayerCardClick(valor, el); else onCenterCardClick(valor, el);
    };
    // Soltada donde cuenta: se queda ahí hasta que contesta el servidor, y el vuelo sale de ahí
    // (lobby.html mide el origen con cardRectAt al llegar la respuesta, translate incluido; el
    // redibujado de la fila la sustituye). Si no se mandó (rechazada, otra en vuelo), vuelve.
    function dejarAlli(s) {
        s.el.classList.remove('sostenida', 'casi');
        s.el.classList.add('soltada');
        jugar(s.fila, s.valor, s.el);
        const mia = s.fila === 'yourCards' ? est.pendingDrop?.index === s.valor : est.pendingTake?.card.id === s.valor;
        if (!mia) return aSuSitio(s);
        setTimeout(() => { if (s.el.isConnected && s.el.classList.contains('soltada')) aSuSitio(s); }, 2500);   // sin respuesta
    }
    for (const fila of ['yourCards', 'centerCards']) {
        const row = document.getElementById(fila);
        if (!row) continue;
        row.addEventListener('pointerdown', e => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            e.stopPropagation();
            const el = e.target.closest('[data-tap]');
            const valida = el && row.contains(el) && !el.classList.contains('card-empty');
            // El recuadro del centro se mide una vez, al pulsar (no en cada movimiento)
            const zona = document.getElementById('centerCards').getBoundingClientRect();
            sostenida = { fila, el: valida ? el : null, valor: valida ? Number(el.dataset.tap) : null, x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, hecho: false, zona, r0: valida ? el.getBoundingClientRect() : null };
            try { row.setPointerCapture(e.pointerId); } catch { /* */ }
            if (valida && !est.soyEspectador) { el.classList.add('sostenida'); row.classList.add('arrastrando'); }
        }, true);
        row.addEventListener('pointermove', e => {
            const s = sostenida;
            if (!s || s.id !== e.pointerId || s.hecho || est.soyEspectador) return;
            const dx = e.clientX - s.x, dy = e.clientY - s.y;
            // ↓ sobre tu mano: la mano se hace tabla (el revelado). Se decide una vez, al moverse.
            if (!s.modo && Math.hypot(dx, dy) > TOQUE_PX) {
                s.modo = fila === 'yourCards' && dy > 0 && dy > Math.abs(dx) * 1.2 && est.allSets.length ? 'tabla' : 'carta';
                if (s.modo === 'tabla') { if (s.el) aSuSitio(s, false); abrirTablas(s); }
            }
            if (s.modo === 'tabla') return moverTablas(s, e);
            if (!s.el) return;
            s.el.style.translate = `${dx}px ${dy}px`;   // sigue al dedo, entera
            s.el.classList.toggle('casi', cuenta(s, e));
        }, true);
        const fin = e => {
            const s = sostenida;
            if (!s || s.id !== e.pointerId) return;
            e.stopPropagation();
            sostenida = null;
            if (s.modo === 'tabla') return soltarTablas(e.type === 'pointercancel');
            if (s.hecho) return;
            const dx = e.clientX - s.x, dy = e.clientY - s.y;
            const toque = Math.hypot(dx, dy) <= TOQUE_PX && performance.now() - s.t <= TOQUE_MS;
            if (e.type !== 'pointercancel' && !toque && cuenta(s, e)) return dejarAlli(s);
            if (s.el) aSuSitio(s);
            if (e.type === 'pointercancel') return;
            if (toque) return jugar(fila, s.valor, s.el);
            if (fila !== 'yourCards') return;
            if (Math.abs(dx) >= LADO && Math.abs(dx) > Math.abs(dy) * 1.3) {
                const i = est.currentSetIndex - Math.sign(dx);
                if (i >= 0 && i < est.allSets.length) switchSet(i);
            }
        };
        row.addEventListener('pointerup', fin, true);
        row.addEventListener('pointercancel', fin, true);
    }

    // ── Revelar: tu mano se hace tabla (como el selector de apps) ─────────────────
    // ↓ desde arriba de tu mano: se encoge a una tabla y asoman tus otros sets a los lados (← →
    // elige). Sigue bajando y la tabla gira sobre su eje horizontal con el dedo; de canto no se ve
    // nada. Hasta que da la vuelta entera se deshace subiendo o soltando; entera, manda flip_set.
    // Un set revelado se oculta igual, con otro ↓. Sin preserve-3d (la fila lleva filter, que lo
    // aplana): a 90° se cambia la cara y se sigue girando desde −90°.
    const SEP = 14, lim = (v, a, b) => Math.min(b, Math.max(a, v));
    const zumba = ms => { try { navigator.vibrate?.(ms); } catch { /* */ } };
    let tablas = null;   // { capa, els, rev, w, k0, cur, sel, e, f, ox, entra, giro, fija, hecho }
    function abrirTablas(s) {
        const mano = document.getElementById('yourCards'), r = mano.getBoundingClientRect();
        const w = Math.min(r.width * .72, 460), cw = (w - 20 - 18) / 4, h = cw / .6476 + 20;
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const capa = document.createElement('div');
        capa.id = 'tablas';
        const els = est.allSets.map(set => {
            const t = document.createElement('div');
            t.className = 'tabla';
            Object.assign(t.style, { left: `${cx - w / 2}px`, top: `${cy - h / 2}px`, width: `${w}px`, height: `${h}px` });
            for (const c of set || []) {
                const e = document.createElement('i');
                e.className = c ? 'tcarta' : 'tcarta vacia';
                if (c) applyCardSprite(e, c);
                t.append(e);
            }
            t.insertAdjacentHTML('beforeend', `<b class="tojo">${ico('ojo')}</b>`);
            capa.append(t);
            return t;
        });
        document.getElementById('gameScreen').append(capa);
        mano.classList.add('en-tabla');
        // El recorrido que queda hasta el borde de abajo: un tercio para hacerse tabla, el resto gira
        const queda = innerHeight - s.y - 12, entra = lim(queda * .3, 20, 60);
        tablas = { capa, els, rev: est.myFlippedSets.slice(), w, k0: r.width / w, cur: est.currentSetIndex, sel: est.currentSetIndex,
            e: 0, f: 0, ox: 0, entra, giro: Math.max(50, queda - entra), fija: owesCard(), hecho: false };
        zumba(8);
    }
    function pintarTablas(T) {
        const paso = T.w + SEP, k = 1 + (T.k0 - 1) * (1 - T.e);
        T.els.forEach((t, i) => {
            const yo = i === T.sel;
            let a = yo ? 180 * T.f : 0;
            const vuelta = a > 90;
            if (vuelta) a -= 180;
            t.classList.toggle('muestra', !!T.rev[i] !== vuelta);   // la cara revelada
            t.classList.toggle('sel', yo && T.e > .5);
            const x = (i - T.cur) * paso + T.ox, s = (i === T.cur ? k : 1) * (yo ? 1 : .88);
            t.style.transform = `translateX(${x}px) scale(${s}) perspective(${T.w * 2}px) rotateX(${a}deg)`;
            t.style.opacity = i === T.cur ? 1 : T.e * (Math.abs(i - T.sel) <= 2 ? 1 : 0);
            t.style.setProperty('--canto', Math.abs(Math.cos(a * Math.PI / 180)).toFixed(3));
        });
    }
    function moverTablas(s, e) {
        const T = tablas;
        if (!T || T.hecho) return;
        const dx = e.clientX - s.x, dy = e.clientY - s.y, n = T.els.length, paso = T.w + SEP;
        T.e = lim(dy / T.entra, 0, 1);
        T.f = lim((dy - T.entra) / T.giro, 0, 1);
        if (T.f === 0 && !T.fija) {   // girando, el set elegido ya no cambia
            T.ox = lim(dx, -(n - 1 - T.cur) * paso - 30, T.cur * paso + 30);
            const sel = lim(Math.round(T.cur - T.ox / paso), 0, n - 1);
            if (sel !== T.sel) { T.sel = sel; zumba(5); }
        }
        if (T.f >= 1) {
            T.hecho = true;
            flipCurrentSet(T.sel);
            zumba(25);
            T.els[T.sel].animate([{ scale: '1' }, { scale: '1.08' }, { scale: '1' }], { duration: 260, easing: 'ease-out', composite: 'add' });
        }
        pintarTablas(T);
    }
    function soltarTablas(cancelado) {
        const T = tablas;
        if (!T) return;
        tablas = null;
        // Soltar sobre otro set lo elige (como en el selector de apps)
        if (!cancelado && T.sel !== T.cur && !owesCard()) {
            switchSet(T.sel);
            T.ox += (T.sel - T.cur) * (T.w + SEP);
            T.cur = T.sel;
        }
        const desde = { e: T.e, f: T.f, ox: T.ox }, hasta = { e: 0, f: T.hecho ? 1 : 0, ox: 0 }, t0 = performance.now();
        const cuadro = now => {
            const p = Math.min(1, (now - t0) / 280), q = 1 - (1 - p) ** 3;
            for (const k in desde) T[k] = desde[k] + (hasta[k] - desde[k]) * q;
            pintarTablas(T);
            if (p < 1) return requestAnimationFrame(cuadro);
            T.capa.remove();
            document.getElementById('yourCards')?.classList.remove('en-tabla');
        };
        requestAnimationFrame(cuadro);
    }

    al('antesDeMensaje', msg => {
        const m = msg?.type === 'game_update' ? msg.moved : null;
        const otro = m && (m.by !== est.currentNickname || est.soyEspectador) ? m : null;   // lo tuyo ya vuela con flyCard
        // Te la quitan de la mano: la que sostenías en el centro se la lleva otro → su burla
        if (otro && otro.kind === 'take' && sostenida?.fila === 'centerCards' && sostenida.valor === otro.card_id) {
            sostenida.hecho = true; aSuSitio(sostenida, false);
            if (otro.taunt) playTaunt(otro.taunt);
        }
        if (otro && otro.kind !== 'drop') { try { seLaLleva(otro); } catch (e) { console.error('partida', e); } }   // antes de que desaparezca
        if (otro && otro.kind === 'drop') { try { laSuelta(otro); } catch (e) { console.error('partida', e); } }
    });

    // ── Del menú a la partida ──────────────────────────────────────────────────────
    // La cuenta atrás termina con la cámara de la mesa en picado sobre el centro. De ahí la
    // cámara se lanza hacia el centro, se tuerce y se quema en luz; el barrido corta y el
    // tablero cae en su sitio por partes (la mesa desde arriba, marcador y mano desde fuera).
    // Si venías del menú se mira ANTES de que showScreen cambie de pantalla.
    let venia = false;
    al('antesDePartida', () => { venia = document.body.classList.contains('mesa') && !document.body.classList.contains('en-partida'); });
    al('onGameStart', () => { if (venia && !REDUCED_MOTION?.matches) entrar(); else barrer(); });
    function entrar() {
        const esc = document.getElementById('escenario');
        if (!esc) return barrer();
        document.body.classList.add('entrando');
        const ojo = (rx, rz, s) => `perspective(900px) rotateX(${rx}deg) rotate(${rz}deg) scale(${s})`;
        esc.animate([
            { transform: ojo(0, 0, 1), filter: 'brightness(1) blur(0)' },
            { transform: ojo(34, -12, 3.6), filter: 'brightness(1.5) blur(2px)', opacity: 1, offset: .8 },
            { transform: ojo(44, -18, 5.5), filter: 'brightness(2.4) blur(8px)', opacity: 0 },
        ], { duration: 640, easing: 'cubic-bezier(.6, 0, .9, .45)' }).finished.finally(() => document.body.classList.remove('entrando'));
        setTimeout(barrer, 420);
        const cae = (id, kf, delay, duration = 520) => document.getElementById(id)?.animate(kf, { duration, delay, easing: 'cubic-bezier(.2, 1.35, .4, 1)', fill: 'backwards' });
        cae('gameScreen', [{ opacity: 0, transform: ojo(-22, 5, .88) }, { opacity: 1, transform: ojo(0, 0, 1) }], 500, 480);
        cae('centerCards', [{ scale: 1.6, rotate: '-7deg' }, { scale: 1, rotate: '0deg' }], 500, 600);
        cae('hud', [{ translate: '0 -90px', rotate: '-3deg' }, { translate: '0 0', rotate: '0deg' }], 640);
        cae('yourCards', [{ translate: '0 160px', rotate: '4deg' }, { translate: '0 0', rotate: '0deg' }], 700, 560);
    }

    // ── Verificación: una lista que se tacha a golpes, una columna por quien verifica ──
    // El servidor manda a todos verification_started / set_verification_result (uno por segundo)
    // / verification_success|failed. Aquí se guarda el progreso de cada uno; si estás en tu
    // pantalla de verificación y alguien más verifica, un rayo la parte y entra su columna.
    // lobby.html sigue pintando lo suyo (oculto por CSS); sus avisos pequeños se ocultan
    // mientras tu pantalla está abierta.
    const verifs = new Map();   // nick → { res: [null|{ok, cards}], fin: null | {pos} | {fallos} }
    const capa = document.getElementById('verifyOverlay');
    const caja = capa?.querySelector('.verify-box');
    const columnas = document.createElement('div'); columnas.className = 'vcols';
    caja?.insertBefore(columnas, document.getElementById('verifyFooter'));
    const abierta = () => capa?.classList.contains('active');
    const colDe = nick => [...columnas.children].find(c => c.dataset.nick === nick);
    const quieto = () => REDUCED_MOTION?.matches;

    function columna(nick) {
        const v = verifs.get(nick), mia = nick === est.currentNickname;
        const c = document.createElement('section');
        c.className = 'vcol' + (mia ? ' mia' : ''); c.dataset.nick = nick;
        const cab = document.createElement('h3'); cab.className = 'vcab'; cab.textContent = sinEmoji(nick);
        const lista = document.createElement('ol'); lista.className = 'vlista';
        for (let i = 0; i < 6; i++) {
            const li = document.createElement('li');
            li.innerHTML = `<b class="vnum">${i + 1}</b><span class="vcartas"></span><span class="vmarca"></span>`;
            lista.append(li);
        }
        const sello = document.createElement('div'); sello.className = 'vsello';
        c.append(cab, lista, sello);
        v.res.forEach((r, i) => r && marcar(c, i, r, false));
        mirando(c, v);
        if (v.fin) sellar(c, v.fin, false);
        return c;
    }
    /** La fila que el servidor está comprobando ahora: la primera sin resultado. */
    function mirando(c, v) {
        const i = v.fin ? -1 : v.res.findIndex(r => !r);
        c.querySelectorAll('.vlista li').forEach((li, j) => {
            li.classList.toggle('mira', j === i);
            // Mientras llega su resultado (1 s), cuatro dorsos se barajan donde caerán las cartas
            const cartas = li.querySelector('.vcartas');
            if (j === i && !cartas.children.length) for (let k = 0; k < 4; k++) { const d = document.createElement('i'); d.className = 'vmini dorso'; d.style.animationDelay = `${-k * 90}ms`; cartas.append(d); }
            if (j !== i) cartas.querySelectorAll('.dorso').forEach(d => d.remove());
        });
    }
    function marcar(c, i, r, anima = true) {
        const li = c.querySelectorAll('.vlista li')[i]; if (!li) return;
        const cartas = li.querySelector('.vcartas'); cartas.textContent = '';
        for (const card of r.cards || []) { const m = document.createElement('i'); m.className = 'vmini'; applyCardSprite(m, card); cartas.append(m); }
        li.classList.add(r.ok ? 'ok' : 'mal');
        li.querySelector('.vmarca').innerHTML = ico(r.ok ? 'check' : 'cruz');
        if (!anima || quieto()) return;
        [...cartas.children].forEach((m, k) => m.animate([{ translate: '0 -26px', rotate: `${k % 2 ? 9 : -9}deg`, opacity: 0 }, { translate: '0 0', rotate: '0deg', opacity: 1 }],
            { duration: 260, delay: k * 55, easing: 'cubic-bezier(.2, 1.4, .4, 1)', fill: 'backwards' }));
        li.querySelector('.vmarca').animate([{ scale: 3, rotate: '-25deg', opacity: 0 }, { scale: .85, rotate: '4deg', opacity: 1, offset: .6 }, { scale: 1, rotate: '0deg' }],
            { duration: 320, delay: 200, easing: 'ease-out', fill: 'backwards' });
        if (r.ok) li.animate([{ '--tacha': 0 }, { '--tacha': 1 }], { duration: 260, delay: 380, easing: 'cubic-bezier(.3, 1.5, .5, 1)', fill: 'backwards' });
        else li.animate([{ translate: '0 0' }, { translate: '-9px 0' }, { translate: '7px 0' }, { translate: '-4px 0' }, { translate: '0 0' }], { duration: 360, delay: 200 });
        setTimeout(() => chispas(li.querySelector('.vmarca'), r.ok ? 5 : 8, !r.ok), 330);
    }
    function sellar(c, fin, anima = true) {
        const s = c.querySelector('.vsello');
        c.classList.add(fin.pos ? 'gana' : 'falla');
        if (fin.pos) c.dataset.pos = fin.pos;
        s.textContent = fin.pos ? t('pos.ord', { n: fin.pos }) : '✕';
        mirando(c, { fin });
        if (!anima || quieto()) return;
        s.animate([{ scale: 4, rotate: '-30deg', opacity: 0 }, { scale: .9, rotate: '-8deg', opacity: 1, offset: .55 }, { scale: 1, rotate: '-10deg' }],
            { duration: 420, easing: 'ease-out' });
        c.animate([{ translate: '0 0' }, { translate: '0 10px', offset: .25 }, { translate: '0 -3px', offset: .6 }, { translate: '0 0' }], { duration: 420, delay: 160 });
        setTimeout(() => chispas(s, fin.pos === 1 ? 18 : 10, fin.pos === 1 || !fin.pos), 200);
    }
    function chispas(el, n, roja) {
        const fx = document.getElementById('fxLayer'), r = el?.getBoundingClientRect(); if (!fx || !r) return;
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        for (let i = 0; i < n; i++) {
            const s = document.createElement('i'); s.className = 'vfx esquirla' + (roja && i % 2 ? ' roja' : '');
            Object.assign(s.style, { left: `${cx}px`, top: `${cy}px` }); fx.append(s);
            const a = Math.PI * 2 * i / n + Math.random() * .6, d = 30 + Math.random() * 40;
            s.animate([{ translate: '0 0', rotate: '0deg', opacity: 1 }, { translate: `${Math.cos(a) * d}px ${Math.sin(a) * d}px`, rotate: `${a * 200}deg`, opacity: 0 }],
                { duration: 480, easing: 'cubic-bezier(.2, .7, .4, 1)' }).finished.finally(() => s.remove());
        }
    }
    /** Entra la columna de otro: el rayo cae donde se parte la pantalla. */
    function partir(nick) {
        const c = columna(nick);
        const antes = new Map([...columnas.children].map(x => [x, x.getBoundingClientRect()]));
        columnas.append(c); columnas.dataset.n = columnas.children.length;
        if (quieto()) return;
        // Las que ya estaban se apartan desde donde estaban (FLIP)
        for (const [x, r0] of antes) { const r1 = x.getBoundingClientRect(); x.animate([{ translate: `${r0.left - r1.left}px ${r0.top - r1.top}px` }, { translate: '0 0' }], { duration: 380, delay: 140, easing: 'cubic-bezier(.2, 1.3, .4, 1)', fill: 'backwards' }); }
        const r = c.getBoundingClientRect(), b = caja.getBoundingClientRect();
        const vertical = r.top > b.top + 20 && Math.abs(r.left - b.left) < 20;   // la columna nueva va debajo (móvil)
        const rayo = document.createElement('div'); rayo.className = 'vfx vrayo' +(vertical ? ' tumbado' : '');
        rayo.innerHTML = vertical
            ? '<svg viewBox="0 0 400 60" preserveAspectRatio="none"><path d="M0 34 120 18 128 40 260 12 266 36 400 22 240 50 234 28 112 52 106 30 0 44z"/></svg>'
            : '<svg viewBox="0 0 60 400" preserveAspectRatio="none"><path d="M34 0 18 120 40 128 12 260 36 266 22 400 50 240 28 234 52 112 30 106 44 0z"/></svg>';
        Object.assign(rayo.style, vertical
            ? { left: `${b.left}px`, top: `${r.top - 6}px`, width: `${b.width}px` }
            : { left: `${r.left - 6}px`, top: `${b.top - 20}px`, height: `${b.height + 40}px` });
        document.getElementById('fxLayer').append(rayo);
        rayo.animate([{ clipPath: vertical ? 'inset(0 100% 0 0)' : 'inset(0 0 100% 0)', opacity: 1 },{ clipPath: 'inset(0 0 0 0)', opacity: 1, offset: .25 }, { opacity: 1, offset: .7 }, { opacity: 0 }],
            { duration: 620, easing: 'linear' }).finished.finally(() => rayo.remove());
        capa.animate([{ backgroundColor: 'rgb(233 230 218 / 55%)' }, { backgroundColor: 'rgb(6 6 6 / 92%)' }], { duration: 300, delay: 120, fill: 'backwards' });
        caja.animate([{ translate: '0 0' }, { translate: '-8px 5px' }, { translate: '7px -4px' }, { translate: '-3px 2px' }, { translate: '0 0' }], { duration: 300, delay: 140 });
        c.animate([{ clipPath: vertical ? 'inset(0 0 100% 0)' : 'inset(0 0 0 100%)', opacity: .4 }, { clipPath: 'inset(0 0 0 0)', opacity: 1 }],
            { duration: 360, delay: 160, easing: 'cubic-bezier(.7, 0, .2, 1)', fill: 'backwards' });
        setTimeout(() => chispas(rayo, 14, true), 170);
    }

    al('openVerifyOverlay', nick => {
        verifs.set(nick, { res: Array(6).fill(null), fin: null });
        if (nick === est.currentNickname) {
            // Los que ya estaban verificando entran a la vez; los que terminaron, fuera
            for (const [n, v] of verifs) if (n !== nick && v.fin) verifs.delete(n);
            columnas.textContent = '';
            for (const n of [nick, ...[...verifs.keys()].filter(n => n !== nick)]) columnas.append(columna(n));
            columnas.dataset.n = columnas.children.length;
        } else if (abierta()) {
            colDe(nick)?.remove();
            partir(nick);
        }
    });
    al('revealVerifySet', (nick, i, ok, cards) => {
        const v = verifs.get(nick); if (!v) return;
        v.res[i] = { ok, cards };
        const c = abierta() && colDe(nick); if (!c) return;
        marcar(c, i, v.res[i]); mirando(c, v);
    });
    al('onVerificationSuccess', (nick, pos) => {
        const v = verifs.get(nick); if (!v) return;
        v.fin = { pos };
        const c = abierta() && colDe(nick); if (c) sellar(c, v.fin);
    });
    al('onVerificationFailed', (nick, fallos) => {
        const v = verifs.get(nick); if (!v) return;
        v.fin = { fallos };
        const c = abierta() && colDe(nick); if (c) sellar(c, v.fin);
    });
    al('clearMatchNotifications', () => { verifs.clear(); columnas.textContent = ''; });

    window.partida = { avisoIco, destello, ico, encajarCentro };
})();
