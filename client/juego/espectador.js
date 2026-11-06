// ─── Espectador: la mano de todos ─────────────────────────────────────────
// El servidor manda la tabla de cartas (`spectator_cards`, una vez) y la mano
// de todos por ids (`spectator_state`, cada ~200 ms si algo cambió). Con eso se
// pinta el tablero de cualquier jugador con las mismas cartas del juego.
let specCards = {};        // id → { c: prenda, n: nombre }

/** Sin emoji, como en la mesa (los nombres de bot y algunos textos de i18n traen uno). */
function sinEmoji(s) {
    return String(s ?? '').replace(/\p{Extended_Pictographic}️?/gu, '').replace(/\s+/g, ' ').trim();
}

function resetEspectador() {
    specCards = {}; est.specState = null; est.specOrden = []; est.specVista = null; est.specSet = null;
    document.getElementById('specSeats')?.replaceChildren();
    document.getElementById('specCards')?.replaceChildren();
    document.getElementById('specSetNav')?.replaceChildren();
    document.getElementById('specAll')?.replaceChildren();
}

function onSpectatorCards(msg) {
    specCards = msg.cards || {};
    renderSpectator();
}

function onSpectatorState(msg) {
    est.specState = msg;
    renderSpectator();
}

/** Los jugadores en el orden de la mesa; si falta alguno del orden, al final. */
function specNicks() {
    const todos = Object.keys(est.specState?.players || {});
    const orden = est.specOrden.filter(n => todos.includes(n));
    return orden.concat(todos.filter(n => !orden.includes(n)));
}

/** Una carta por su id, con el sprite del juego. `null` = hueco (carta soltada). */
function specCard(id) {
    if (id === null || id === undefined) {
        const gap = document.createElement('div');
        gap.className = 'card card-empty';
        gap.title = t('spec.gap');
        return gap;
    }
    const info = specCards[id] || {};
    const el = buildCard({ id, clothing_type: info.c ?? 0, name: info.n ?? '' });
    el.title = `${cardName(info.c, info.n) || t('card.generic')} · #${id}`;
    return el;
}

function renderSpectator() {
    if (!est.soyEspectador || !est.specState) return;
    const board = document.getElementById('gameScreen');
    if (!board || !board.classList.contains('espectador')) return;
    const nicks = specNicks();
    if (!nicks.length) return;
    if (est.specVista !== '*' && !nicks.includes(est.specVista)) est.specVista = nicks[0];

    // ── Mirando desde ──
    const seats = document.getElementById('specSeats');
    seats.replaceChildren();
    const quien = document.createElement('span');
    quien.className = 'quien';
    quien.textContent = t('spec.from');
    seats.append(quien);
    const boton = (valor, texto) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'spec-seat' + (est.specVista === valor ? ' active' : '');
        b.dataset.nick = valor;
        b.dataset.toque = '';   // elegir a quién miras no necesita deslizar (gestos.js)
        b.textContent = sinEmoji(texto);
        b.onclick = () => { est.specVista = valor; est.specSet = null; renderSpectator(); };
        return b;
    };
    nicks.forEach(n => seats.append(boton(n, n)));
    seats.append(boton('*', t('spec.all')));

    const todos = est.specVista === '*';
    document.getElementById('specSingle').hidden = todos;
    document.getElementById('specAll').hidden = !todos;
    if (todos) renderSpectatorTodos(nicks); else renderSpectatorUno(est.specState.players[est.specVista]);

    // Las cartas peleadas del centro, que `renderCenterCards` ya marca por su cuenta.
}

/** El tablero de un jugador, como lo ve él: sus 6 sets, el abierto, su deuda. */
function renderSpectatorUno(p) {
    if (!p) return;
    document.getElementById('specLabel').textContent = t('spec.sets_of', { nick: est.specVista });
    const actual = est.specSet ?? p.cur;

    const nav = document.getElementById('specSetNav');
    nav.replaceChildren();
    for (let i = 0; i < 6; i++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'set-btn' + (i === actual ? ' active' : '') + (p.flip[i] ? ' flipped' : '');
        b.dataset.set = i;
        b.append(t('set.n', { n: i + 1 }));
        const ojo = document.createElement('span');
        ojo.className = 'set-eye';
        ojo.textContent = p.flip[i] ? '👁' : '';
        b.append(ojo);
        b.onclick = () => { est.specSet = i; renderSpectator(); };
        nav.append(b);
    }

    const fila = document.getElementById('specCards');
    fila.replaceChildren(...(p.sets[actual] || []).map(specCard));

    const estado = document.getElementById('specEstado');
    estado.replaceChildren();
    const dato = (texto, fuerte) => {
        const s = document.createElement('span');
        s.append(texto);
        if (fuerte !== undefined) { const b = document.createElement('b'); b.textContent = fuerte; s.append(b); }
        estado.append(s);
    };
    if (p.owed) dato(t('spec.owes', { set: p.owed[0] + 1, slot: p.owed[1] + 1 }));
    else dato(t('spec.no_debt'));
    dato(t('spec.combo') + ' ', `×${formatMult(p.mult ?? 100)}`);
    if (p.frenzy) dato(t('spec.frenzy'));
    if (p.verif) dato(t('spec.verifying'));
    if (p.fin) dato(t('spec.finished') + ' ', t('pos.ord', { n: p.fin }));
    if (est.specSet !== null && est.specSet !== p.cur) dato(t('spec.theirs', { set: p.cur + 1 }));
}

/** Los sets de cada jugador en miniatura, todos a la vez. */
function renderSpectatorTodos(nicks) {
    const cont = document.getElementById('specAll');
    cont.replaceChildren();
    nicks.forEach(n => {
        const p = est.specState.players[n];
        const bloque = document.createElement('div');
        bloque.className = 'spec-player';
        const cab = document.createElement('div');
        cab.className = 'spec-player-name';
        const nombre = document.createElement('b');
        nombre.textContent = sinEmoji(n);
        cab.append(nombre, `×${formatMult(p.mult ?? 100)}`);
        if (p.owed) cab.append(t('spec.owes_short'));
        if (p.verif) cab.append(t('spec.verifying'));
        if (p.fin) cab.append(t('spec.finished_n', { pos: t('pos.ord', { n: p.fin }) }));
        bloque.append(cab);

        const sets = document.createElement('div');
        sets.className = 'spec-sets';
        p.sets.forEach((set, i) => {
            const mini = document.createElement('div');
            mini.className = 'spec-mini-set' + (p.flip[i] ? ' flipped' : '') + (i === p.cur ? ' current' : '');
            mini.title = t('set.n', { n: i + 1 }) + (p.flip[i] ? t('spec.shown') : '');
            set.forEach(id => mini.append(specCard(id)));
            sets.append(mini);
        });
        bloque.append(sets);
        cont.append(bloque);
    });
}


