// El menú en la mesa (diseno/menu-mesa/README.md): la escena de fondo, el diccionario y la
// interfaz conectada al juego (client/juego/, por import y por el bus). Tras editar: pnpm build en tools/.
import { al } from '../juego/bus.js';
import { est } from '../juego/estado.js';
import { send } from '../juego/red.js';
import { lobbyIsPublic, setVisibility, createLobby, quickMatch, refreshLobbies, botDifficulty, setBotDifficulty, addBot, removeBot, cancelQuickMatchOffer, acceptBotsOffer, joinLobby, joinLinkFor, qrScanner, extractLobbyCode, toggleScanner, stopScanner, toggleReady, leaveLobby, sendChat, enCola, cambiarRol } from '../juego/sala.js';
import { sinEmoji } from '../juego/espectador.js';
import { ratingKey } from '../juego/tablero.js';
import { TAUNTS, getTaunt, playTaunt } from '../juego/burlas.js';
import { fetchElo, smCodeGuardado, setSmCode, clearSmCode, vistaActual, showScreen } from '../juego/cuenta.js';

import { escena } from './escena.js';
import { T, IDIOMAS } from './dic.js';



// ════════════════════════════════════════════════════════════════════════════════════
// La interfaz: cartas, piezas y gestos, conectados a lobby.html.
// lobby.html lleva la lógica (WebSocket, asiento, reconexión, Elo, votos) y no tiene
// pantallas propias salvo la partida. Aquí se llama a sus funciones (quickMatch,
// createLobby(n), joinLobby(código), toggleReady, addBot, sendChat(texto), setSmCode…)
// y se pinta con lo que llega del servidor (se envuelven handleMsg, showScreen y la
// cuenta atrás). `vistaActual` dice en cuál de sus vistas está lobby.html.
// ════════════════════════════════════════════════════════════════════════════════════
const tl = (k, v) => (typeof t === 'function' ? t(k, v) : k);   // el t() de lobby.html (i18n.js)
const X = escena.X;   // lo de cada menú dentro de la escena (asientos, diales, QR, placa…)

// Menús: cada opción es una carta. `ir` = la pantalla a la que lleva; `accion` = algo que hace.
// Pocas cartas por nivel: lo que no es «ir a otro sitio» vive en las piezas (ver `formas`).
const MENUS = {
    inicio: [
        { palo: 'i:rayo', nombre: 'Partida rápida', nota: 'Te sienta en una mesa ya', accion: 'rapida' },
        { palo: 'i:mas', nombre: 'Crear sala', nota: 'Tú eliges jugadores y quién entra', ir: 'crear' },
        { palo: 'i:entrar', nombre: 'Unirse', nota: 'Salas abiertas, código o QR', ir: 'unirse' },
    ],
    tutorial: [
        { palo: '1/3', nombre: 'Intercambia', nota: 'Cambia cartas hasta que cada una de tus PILAS tenga la misma prenda', accion: 'nada' },
        { palo: '2/3', nombre: 'Muestra', nota: 'Muestra una pila cuando creas que está completa. Todos lo ven', accion: 'nada' },
        { palo: '3/3', nombre: 'Verificamos', nota: 'Si fallas, revisa tus pilas. Toca para volver', accion: 'volver' },
    ],
    perfil: [
        { palo: 'i:enlace', nombre: 'Session Manager', nota: 'Lleva tu Elo a tu cuenta', ir: 'sm' },
        { palo: 'i:bocina', nombre: 'Mi burla', nota: '', ir: 'burla' },
    ],
    sm: [
        { palo: 'i:teclado', nombre: 'Pegar código', nota: 'El de tu cuenta de Session Manager', accion: 'smCodigo' },
        { palo: 'i:cruz', nombre: 'Desvincular', nota: 'Vuelves al Elo de este navegador', accion: 'smBorrar' },
    ],
    qr: [{ palo: 'i:copiar', nombre: 'Copiar enlace', nota: 'Para mandarlo por chat', accion: 'copiar' }],
    visor: [{ palo: 'i:cruz', nombre: 'Cerrar cámara', nota: 'Apunta al QR de otra pantalla', accion: 'volver' }],
    oferta: [
        { palo: 'i:bot', nombre: 'VS bots', nota: 'Tres bots se sientan ya', accion: 'ofertaBots' },
        { palo: 'i:reloj', nombre: 'Seguir buscando', nota: 'Esperar a personas', accion: 'seguir' },
    ],
    echar: [],    // se llena al tocar la carta de un jugador
    votar: [],    // se llena con la votación (kick_poll)
    burla: [],    // las de lobby.html (TAUNTS)
    crear: [{ palo: 'i:play', nombre: 'Abrir sala', nota: 'Con los jugadores y la privacidad de arriba', accion: 'abrir' }],
    unirse: [],   // las salas de verdad (lobby_list)
    sala: [],     // según seas jugador o espectador (menuSala)
    bots: [
        { palo: 'i:mas', nombre: 'Añadir bot', nota: 'Con la dificultad de arriba', accion: 'bot' },
        { palo: 'i:llenar', nombre: 'Llenar', nota: 'Todos los huecos', accion: 'llenar' },
        { palo: 'i:cruz', nombre: 'Quitar bot', nota: 'El último que entró', accion: 'quitarBot' },
    ],
    cuenta: [],
};
const EN_SALA = new Set(['sala', 'bots', 'qr', 'echar', 'votar', 'oferta', 'cuenta']);   // vista 'lobbyScreen'
// Qué vista de lobby.html corresponde a cada menú de aquí (y al revés)
const A_LOBBY = { inicio: 'homeScreen', perfil: 'profileScreen', sm: 'profileScreen', burla: 'profileScreen', tutorial: 'howToPlayScreen',
    crear: 'hostScreen', unirse: 'joinScreen', visor: 'joinScreen' };
const DE_LOBBY = { homeScreen: 'inicio', profileScreen: 'perfil', howToPlayScreen: 'tutorial', hostScreen: 'crear', joinScreen: 'unirse', lobbyScreen: 'sala' };
let crearJug = 4;   // jugadores de la sala nueva (el tambor de «Crear sala»)

const esc = document.getElementById('escenario');
const zona = document.getElementById('cartas');
const estado = document.getElementById('estado');
const nombre = document.getElementById('nombre');
const vibrar = ms => { try { navigator.vibrate?.(ms); } catch { /* */ } };
const W = () => innerWidth, H = () => innerHeight;
// La rejilla: todo se coloca con estos números (ver el comentario del CSS).
// M = margen, SEP = separación, FILA2 = cabecera y botones pequeños, ZONA = donde empiezan las piezas.
const M = 16, SEP = 8, FILA2 = 64, ZONA = 120, ESTADO_H = 56;
const ancho = () => W() >= 1024;   // columna del chat a la derecha; si no, todo apilado
function rejilla() {
    const w = W(), h = H(), es = h < 720 ? 0.8 : 1;   // mano más pequeña en pantallas bajas
    const manoTop = h - M - 176 * 1.08 * es;          // borde de arriba de la carta elegida
    return { w, h, es, manoTop, estadoAbajo: manoTop - SEP, libre: manoTop - SEP - ESTADO_H - SEP, cabw: Math.min(190, w - 202) };
}
let mano = [], sel = 0, pantalla = 'inicio', cabeceras = [];

function hacerCarta(o, clase = '') {
    const c = document.createElement('button');
    c.type = 'button';
    c.className = 'carta ' + clase;
    c.innerHTML = `<span class="palo"></span><span class="nombre"></span><span class="nota"></span>`;
    for (const k of ['palo', 'nombre', 'nota']) ponTexto(c, k, o[k] ?? '');
    return c;
}
/** Texto de una carta: se guarda en español y se muestra traducido. */
function ponTexto(c, k, es) { c.dataset[k] = es; pintaTexto(c, k); }
// Un palo «i:nombre» es un icono; el resto, texto traducido
function pintaTexto(c, k) {
    const es = c.dataset[k], e = c.querySelector('.' + k);
    if (es.startsWith('i:')) e.innerHTML = ico(es.slice(2)); else e.textContent = T(es);
}
// Iconos propios (sin emoji): líneas rectas, esquinas en punta, del color del texto
const ICONOS = {
    rayo: 'M13 2 5 14h6l-1 8 8-12h-6z', mas: 'M12 4v16M4 12h16', menos: 'M4 12h16', entrar: 'M6 18 18 6M8 6h10v10',
    enlace: 'M9 15l6-6M8 11l-3 3 5 5 3-3M16 13l3-3-5-5-3 3', bocina: 'M3 9v6h4l6 5V4L7 9zM16 9l2 3-2 3M19 6l3 6-3 6',
    teclado: 'M2 6h20v12H2zM6 10h1M10 10h1M14 10h1M18 10h1M7 14h10', cruz: 'M5 5l14 14M19 5 5 19', flecha: 'M3 12h16M13 6l6 6-6 6',
    copiar: 'M8 8h12v12H8zM4 16V4h12', silla: 'M7 3v18M7 12h10v9', volver: 'M9 5 4 10l5 5M4 10h12v9h-4',
    bot: 'M5 8h14v11H5zM12 4v4M9 12v2M15 12v2M9 16h6', reloj: 'M6 3h12M6 21h12M7 3l10 18M17 3 7 21',
    nota: 'M9 18V4l9 3M9 18H5v-4h4', vacio: 'M6 6h12v12H6zM4 20 20 4', play: 'M7 4v16l12-8z', ojo: 'M2 12l5-5h10l5 5-5 5H7zM11 10h2v4h-2z',
    check: 'M4 12l5 5L20 6', cambio: 'M4 8h15M15 4l4 4-4 4M20 16H5M9 12l-4 4 4 4', llenar: 'M4 6h12M4 12h16M4 18h12M16 8l4 4-4 4',
    fuera: 'M14 4H4v16h10M10 12h11M17 8l4 4-4 4', persona: 'M8 4h8v8H8zM4 21v-5h16v5', camara: 'M3 7h4l2-3h6l2 3h4v13H3zM10 11h4v4h-4z',
    qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2M18 14h2v2M14 18h2v2M18 18v2h2',
    abajo: 'M12 3v16M6 13l6 6 6-6',
};
const ico = n => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONOS[n]}"/></svg>`;
const pon = (c, x, y, r = 0, s = 1) => { c.style.setProperty('--x', x + 'px'); c.style.setProperty('--y', y + 'px'); c.style.setProperty('--r', r + 'deg'); c.style.setProperty('--s', s); };
// El centro es el de la mesa de fondo: las cartas vuelan a donde se ve en pantalla.
const pilaX = () => escena.centro().x - 64, pilaY = () => escena.centro().y - 88;
/** La carta cae al centro esparcido y se queda en la mesa de fondo, con las otras. */
function alCentro(c, dorso = false, retraso = 0) {
    const h = escena.soltar(dorso);
    c.classList.remove('respira', 'elegida', 'cabecera', 'previa');
    c.style.transitionDelay = `${retraso}ms`;
    pon(c, h.x - 64, h.y - 88, Math.random() * 60 - 30, h.s);
    setTimeout(() => { h.poner(); c.style.transitionDelay = ''; c.style.opacity = '0'; }, 480 + retraso);
    setTimeout(() => c.remove(), 820 + retraso);
}

// La mano: en abanico horizontal; la elegida, centrada y levantada.
function colocarMano(rapido = false, desliz = 0) {   // desliz: px que sigue al dedo (sin animar)
    const R = rejilla(), s0 = 1.08 * R.es, yE = R.manoTop - 88 + 88 * s0;   // la elegida toca manoTop
    if (ini?.eje === 'h') mano.forEach(c => (c.style.transition = 'none'));
    mano.forEach((c, i) => {
        const k = i - sel;
        const x = W() / 2 - 64 + k * 112 * R.es + desliz;
        const y = k === 0 ? yE : yE + Math.min(12, 4 + Math.abs(k) * 4);   // las de al lado no bajan de la elegida
        c.classList.toggle('elegida', k === 0);
        c.setAttribute('aria-selected', k === 0);
        c.tabIndex = k === 0 ? 0 : -1;
        if (rapido) c.style.transition = 'none';
        pon(c, x, y, k * 5, k === 0 ? s0 : .9 * R.es);
        if (rapido) { void c.offsetWidth; c.style.transition = ''; }
    });
    colocarTextos();
    alElegirCarta();
}
/** Estado y campo, apilados sobre la mano. */
function colocarTextos() {
    const R = rejilla();
    estado.style.top = 'auto';
    estado.style.bottom = (R.h - R.estadoAbajo) + 'px';
    campo.style.bottom = (R.h - R.estadoAbajo) + 'px';
}
// Repartir = cambiar de set: la mano nueva entra de lado (dir 1: desde la derecha, al
// avanzar; -1: desde la izquierda, al volver). Sin dir (la primera vez) sale de la pila.
function repartir(opciones, dir = 0, elegida = 0) {
    mano.forEach(c => c.remove());
    mano = opciones.map((o, i) => {
        const c = hacerCarta(o);
        c.dataset.i = i;
        c.style.transition = 'none';
        if (dir) pon(c, W() / 2 - 64 + dir * (W() * 0.9 + i * 70), rejilla().manoTop, dir * 14, .9);
        else pon(c, pilaX(), pilaY(), -8, .7);
        zona.append(c);
        return c;
    });
    sel = Math.min(elegida, Math.max(0, mano.length - 1));
    requestAnimationFrame(() => requestAnimationFrame(() => mano.forEach((c, i) => {
        c.style.transition = '';
        c.style.transitionDelay = `${i * 55}ms`;
        setTimeout(() => { c.style.transitionDelay = ''; c.classList.add('respira'); c.style.animationDelay = `${i * -0.7}s`; }, 650 + i * 55);
    })));
    requestAnimationFrame(() => requestAnimationFrame(() => colocarMano()));
    estadoBots();
}
/** La mano de un menú que cambió solo (salas, roles): mismos textos en sitio, o se reparte de nuevo. */
function refrescarMano(p) {
    if (pantalla !== p) return;
    const nuevas = MENUS[p], mismas = nuevas.length === mano.length && nuevas.every((o, i) => o.clave === mano[i]?.dataset.clave);
    if (mismas) { nuevas.forEach((o, i) => { for (const k of ['palo', 'nombre', 'nota']) if (mano[i].dataset[k] !== (o[k] ?? '')) ponTexto(mano[i], k, o[k] ?? ''); }); return; }
    const antes = mano[sel]?.dataset.clave;
    repartir(nuevas, 1, Math.max(0, nuevas.findIndex(o => o.clave === antes)));
    mano.forEach((c, i) => (c.dataset.clave = nuevas[i].clave ?? ''));
}
/** Cabeceras: la de ahora en la fila 2; las dos de antes asoman detrás, más oscuras. */
function apilarCabeceras() {
    const n = cabeceras.length;
    cabeceras.forEach((h, i) => {
        const atras = n - 1 - i, k = Math.min(atras, 2);
        h.classList.toggle('previa', atras > 0);
        h.style.opacity = atras > 2 ? '0' : '';
        h.style.zIndex = 12 - k;
        pon(h, M - k * 5, FILA2 - k * 5, -k * 1.5, 1);
    });
}
/** La mano de ahora se tira al centro de la mesa (al cambiar de set). */
function retirarMano() {
    const viejas = mano; mano = [];
    viejas.forEach((x, i) => alCentro(x, false, i * 45));
}
function elegir(d) {
    const n = Math.max(0, Math.min(mano.length - 1, sel + d));
    if (n === sel) {   // en el borde: rebote
        mano[sel]?.animate([{ translate: '0 0' }, { translate: `${-d * 14}px 0` }, { translate: '0 0' }], { duration: 320, easing: 'cubic-bezier(.34,1.56,.64,1)' });
        return;
    }
    sel = n; vibrar(6); colocarMano();
}

// Jugar la carta elegida: si lleva a otro menú, vuela arriba en bermellón y queda como cabecera.
function jugar() {
    const c = mano[sel]; if (!c) return;
    if (c.disabled) { c.animate([{ translate: '0 0' }, { translate: '8px 0' }, { translate: '-6px 0' }, { translate: '0 0' }], { duration: 260 }); return; }   // apagada o esperando al servidor
    const o = MENUS[pantalla][sel];
    if (!o) return;
    if (o.accion !== undefined) { accion(o.accion, c, o); return; }
    vibrar(18);
    c.classList.remove('respira');
    c.style.transition = '';
    mano.splice(sel, 1);
    cambiar(o.ir, c, o);
}

/** Cambio de menú con carta jugada (o con un rótulo, ver irA). `lobby: false`: lo pidió lobby.html. */
function cambiar(destino, jugada, o = {}, lobby = true) {
    const b = document.getElementById('barrido');
    b.classList.remove('pasa'); void b.offsetWidth; b.classList.add('pasa');
    jugada.classList.remove('elegida', 'respira');
    jugada.classList.add('cabecera');
    jugada.disabled = true;
    cabeceras.push(jugada);
    apilarCabeceras();
    historial.push(pantalla);
    const antes = pantalla;
    pantalla = destino;
    esc.dataset.p = destino;
    preparaMenu(destino, o);
    estado.textContent = '';
    cerrarCampo();
    escena.ir(destino, historial.length);
    alCambiar(antes, destino, lobby);
    retirarMano();                       // el resto del set, al centro (con la cámara nueva)
    setTimeout(() => { repartir(MENUS[destino], 1); mano.forEach((c, i) => (c.dataset.clave = MENUS[destino][i]?.clave ?? '')); }, 160);
}
/** Ir a una pantalla sin carta jugada (la cabecera es un rótulo). */
function irA(destino, titulo, o = {}, lobby = true) {
    const t0 = hacerCarta({ nombre: titulo }); zona.append(t0); pon(t0, pilaX(), pilaY(), 0, .8);
    setTimeout(() => cambiar(destino, t0, o, lobby), 30);
}

// ↓ = volver: la última cabecera vuelve a la pila y se reparte el menú anterior.
const historial = [];
function volver() {
    if (pantalla === 'cuenta') { if (est.isReady) toggleReady(); return; }   // desmarcarse cancela la cuenta (en el servidor)
    if (pantalla === 'oferta') { cancelQuickMatchOffer(); cerrarOferta(); return; }
    if (!historial.length) return;
    if (pantalla === 'sala') { conLobby(() => leaveLobby()); }   // salir de la sala de verdad
    deshacer();
}
/** El paso atrás en pantalla (sin efectos en lobby.html). */
function deshacer() {
    if (!historial.length) return;
    const antes = pantalla;
    const h = cabeceras.pop();
    h?.classList.remove('previa');
    apilarCabeceras();
    cerrarCampo();
    const b = document.getElementById('barrido');
    b.classList.remove('pasa'); void b.offsetWidth; b.classList.add('pasa');
    pantalla = historial.pop();
    esc.dataset.p = pantalla;
    estado.textContent = '';
    escena.ir(pantalla, historial.length);
    alCambiar(antes, pantalla, true);
    if (h) alCentro(h);
    retirarMano();
    setTimeout(() => { repartir(MENUS[pantalla], -1); mano.forEach((c, i) => (c.dataset.clave = MENUS[pantalla][i]?.clave ?? '')); }, 120);
}
/** lobby.html te lleva a otra pantalla por su cuenta (entraste en una sala, te echaron, se cayó
 *  el asiento, acabó la partida…): se rehace el camino hasta ella sin animar paso a paso. */
function saltarA(destino) {
    cancelarCuentaVisual();
    cabeceras.forEach(h => alCentro(h)); cabeceras = [];
    historial.length = 0;
    const antes = pantalla;
    pantalla = 'inicio'; esc.dataset.p = 'inicio';
    if (destino === 'inicio') {
        escena.ir('inicio', 0); alCambiar(antes, 'inicio', false);
        retirarMano(); setTimeout(() => repartir(MENUS.inicio, -1), 120);
        return;
    }
    const titulo = destino === 'sala' ? (est.currentLobbyId || 'Sala') : { perfil: 'Perfil', tutorial: 'Cómo jugar', crear: 'Crear sala', unirse: 'Unirse' }[destino] ?? destino;
    irA(destino, titulo, {}, false);
}

// ── Lo que viene de lobby.html ───────────────────────────────────────────────────────
// Mientras se llama a lobby.html desde aquí, sus cambios de pantalla no se repiten aquí.
let suprimir = 0;
const conLobby = f => { suprimir++; try { return f(); } finally { suprimir--; } };
/** Pone en lobby.html la vista que toca a la de aquí (la lista de salas se refresca sola si
 *  está «Unirse», por ejemplo). Dentro de la sala no se toca nada. */
function alinearLobby(p) {
    if (EN_SALA.has(p)) return;
    const id = A_LOBBY[p];
    if (id && vistaActual !== id) conLobby(() => showScreen(id));
}
al('showScreen', id => {
    document.body.classList.toggle('en-partida', id === 'gameScreen');
    if (suprimir || id === 'gameScreen') return;
    const destino = DE_LOBBY[id];
    if (!destino) return;
    const ya = destino === 'sala' ? EN_SALA.has(pantalla) : (A_LOBBY[pantalla] === id);
    if (ya) { if (destino === 'sala') sincronizarSala(); return; }
    // Entraste en una sala desde donde la pediste (inicio, crear, unirse): un paso más, sin perder
    // el camino. Desde cualquier otro sitio (F5, enlace, te echaron…), el camino se rehace.
    if (destino === 'sala' && ['inicio', 'crear', 'unirse', 'visor'].includes(pantalla)) { estado.textContent = ''; irA('sala', est.currentLobbyId, {}, false); }
    else saltarA(destino);
});
// Sin nombre no se entra en ninguna sala: el campo del nombre tiembla en rojo y se enfoca
al('sinNombre', () => { sacude(nombre); nombre.focus(); });
// Cada mensaje del servidor: primero el juego, luego se pinta aquí
al('handleMsg', alMensaje);
// La cuenta atrás del servidor (`countdown {seconds}`) la forman las cartas de la mesa
al('startCountdown', s => cuentaAtras(Number(s) || 3));
al('closeCountdown', () => { if (cuenta && !cuenta.repartiendo) cancelarCuentaVisual(true); });

// La oferta de bots de la partida rápida (el juego la abre al rato de estar solo)
al('ofertaBots', abierta => {
    if (abierta && pantalla === 'sala') ofrecerBots();
    else if (!abierta && pantalla === 'oferta') cerrarOferta();
});

// ── La sala, con los datos del servidor ───────────────────────────────────────────
// Filas de 4 centradas desde ZONA (escala .56 = 72×99 px; cada 80 px de lado y 107 de alto).
let ultimaSala = null;          // el último lobby_update
const cartasJug = new Map();    // id del jugador → su carta
const huecos = [];              // cartas vacías: los asientos libres
const filasSala = () => Math.ceil((ultimaSala?.max_players ?? 4) / 4);
function posJugador(i, max) {
    const fila = Math.floor(i / 4), enFila = Math.min(4, max - fila * 4), k = i % 4;
    return [W() / 2 - 64 + (k - (enFila - 1) / 2) * 80, ZONA - 39 + 4 + fila * 107];   // +4: el giro de ±3° no toca la fila 2
}
// Nada de emoji en la mesa: los nombres de los bots llegan con uno («🤖 Bot 1»)
/** Tú primero (asiento 0 de la mesa), luego los demás en el orden del servidor. */
const ordenSala = () => {
    const js = (ultimaSala?.players ?? []).map(p => ({ ...p, nickname: sinEmoji(p.nickname), nick: p.nickname }));
    return [...js.filter(p => p.id === est.currentPlayerId), ...js.filter(p => p.id !== est.currentPlayerId)];
};
function sincronizarSala(llega = false) {
    const m = ultimaSala, dentro = !!m && !!est.currentLobbyId;
    X.tu = dentro && !est.soyEspectador ? 0 : -1;
    if (!dentro) {
        ultimaSala = null;
        cartasJug.forEach(c => { pon(c, pilaX(), -260, 20, 1); setTimeout(() => c.remove(), 600); });
        cartasJug.clear();
        huecos.splice(0).forEach(v => v.remove());
        X.ocupados = [true, true, true, true]; X.listos = [false, false, false, false]; X.nombres = null;
        X.elo = escena.ELO_TOP.map(e => ({ ...e }));
        return;
    }
    // Llegó la respuesta: vuelve lo que se fue, salvo los bots que aún no han llegado todos
    if (esperaBots && m.players.length === esperaBots.n) esperaBots = null;
    // (fuera de la sala, la que se fue es la de entrar: se va con el menú al cambiar)
    if (EN_SALA.has(pantalla)) mano.forEach(c => { if (c.classList.contains('ida') && c !== esperaBots?.c) vuelve(c); });
    const gente = ordenSala(), vistos = new Set();
    gente.forEach((p, i) => {
        vistos.add(p.id);
        let c = cartasJug.get(p.id);
        const tuyo = p.id === est.currentPlayerId;
        const [x, y] = posJugador(i, m.max_players);
        if (!c) {
            c = hacerCarta({}, tuyo ? 'jugador tuya' : 'jugador');
            c.disabled = true; c.style.transition = 'none';
            pon(c, x + (Math.random() - .5) * 200, -220, (Math.random() - .5) * 60, 1.2);
            zona.prepend(c); cartasJug.set(p.id, c);
            requestAnimationFrame(() => requestAnimationFrame(() => { c.style.transition = ''; pon(c, x, y, (i % 2 ? 1 : -1) * 3, .56); }));
            if (llega && !tuyo) {
                decir('', T('{n} entró', { n: p.nickname }), true); vibrar(8);
                // Al caer en su asiento, un golpe: se ve que ya está, no solo que llega algo
                c.animate([{ scale: 1 }, { scale: 1.35 }, { scale: 1 }], { duration: 420, delay: 480, easing: 'cubic-bezier(.34,1.56,.64,1)' });
            }
        } else pon(c, x, y, (i % 2 ? 1 : -1) * 3, .56);
        // Nada que leer: listo = carta salvia con ✓; bot = su icono; tú = «TÚ» en bermellón
        ponTexto(c, 'palo', tuyo ? (est.soyEspectador ? 'i:ojo' : 'TÚ') : p.is_ready ? 'i:check' : p.is_bot ? 'i:bot' : '');
        c.dataset.nombre = p.nickname; c.querySelector('.nombre').textContent = p.nickname;   // los apodos no se traducen
        ponTexto(c, 'nota', '');
        c.classList.toggle('listo', !!p.is_ready);
        c.dataset.id = p.id;
    });
    for (const [id, c] of cartasJug) if (!vistos.has(id)) {
        decir('', T('{n} salió', { n: c.dataset.nombre }), true);
        pon(c, W() + 200, -200, 40, 1); setTimeout(() => c.remove(), 600);
        cartasJug.delete(id);
    }
    // La mesa tiene 4 asientos dibujados: tú y los tres primeros (es para enseñar cómo se juega)
    for (let s = 0; s < 4; s++) {
        const p = gente[s];
        if (p && !X.ocupados[s] && llega) X.llegada[s] = escena.ahora();
        X.ocupados[s] = !!p; X.listos[s] = !!p?.is_ready;
    }
    X.nombres = [0, 1, 2, 3].map(s => gente[s]?.nickname ?? '');
    X.elo = [0, 1, 2, 3].map(s => gente[s]?.elo != null ? { v: gente[s].elo, pool: m.pool === 'fun' ? 'fun' : 'glory', top3: !!gente[s].top3 } : null);
    // Los asientos libres, como cartas vacías: cuántos sois y cuántos caben se ve sin leerlo
    while (huecos.length > m.max_players - gente.length) { const v = huecos.pop(); v.style.opacity = '0'; setTimeout(() => v.remove(), 300); }
    while (huecos.length < m.max_players - gente.length) {
        const v = hacerCarta({}, 'jugador vacia'); v.disabled = true; v.setAttribute('aria-hidden', 'true');
        v.style.opacity = '0'; zona.prepend(v); huecos.push(v);
    }
    huecos.forEach((v, k) => { const i = gente.length + k, [x, y] = posJugador(i, m.max_players); pon(v, x, y, (i % 2 ? 1 : -1) * 3, .56); requestAnimationFrame(() => (v.style.opacity = '')); });
    if (EN_SALA.has(pantalla) && !['cuenta', 'oferta', 'votar'].includes(pantalla) && !aviso.t) estado.textContent = '';
    menuSala(); refrescarMano('sala'); estadoBots();
    formas();
}
/** Las cartas de la sala: jugador (listo, bots si cabe alguien, mirar) o espectador (jugar / cola). */
function menuSala() {
    const m = ultimaSala, cabe = m && m.players.length < m.max_players;
    MENUS.sala = est.soyEspectador
        ? [{ clave: 'rol', palo: 'i:silla', nombre: enCola ? 'Salir de la cola' : 'Quiero jugar', nota: enCola ? 'Te sentarás cuando haya hueco' : 'Pides sitio en la mesa', accion: 'rol' }]
        : [
            { clave: 'listo', palo: 'i:check', nombre: est.isReady ? 'Listo ✓' : 'Estoy listo', nota: 'Cuando estén todos, se reparte', accion: 'listo' },
            ...(cabe ? [{ clave: 'bots', palo: 'i:bot', nombre: 'VS bots', nota: 'Rellenar con bots', ir: 'bots' }] : []),
            { clave: 'mirar', palo: 'i:cambio', nombre: 'Mirar', nota: 'Pasar a espectador', accion: 'rol' },
        ];
}
// ── Campo de texto: sale cuando hace falta escribir ─────────────────────────────
const campo = document.getElementById('campo');
let alEnviar = null, alEscribir = null;
function pedir(ph, max, enviar, escribir = null) {
    campo.value = ''; campo.placeholder = ph; campo.maxLength = max;
    colocarTextos();
    campo.style.textTransform = max <= 12 ? 'uppercase' : '';
    alEnviar = enviar; alEscribir = escribir;
    campo.classList.add('abierto'); esc.classList.add('escribiendo');
    campo.focus();
}
function cerrarCampo() { campo.classList.remove('abierto'); esc.classList.remove('escribiendo'); campo.blur(); alEnviar = alEscribir = null; }
campo.addEventListener('input', () => alEscribir?.(campo.value.trim().toUpperCase()));
campo.addEventListener('keydown', e => {
    if (e.key === 'Enter' && campo.value.trim()) { const f = alEnviar; const v = campo.value.trim(); cerrarCampo(); f?.(v); }
    else if (e.key === 'Escape') cerrarCampo();
    e.stopPropagation();
});
// Un aviso corto encima de la mano. En la sala va al chat, como línea gris: ahí no tapa nada
// y queda escrito.
const aviso = (txt, ms = 1600) => {
    if (est.currentLobbyId && ['sala', 'bots', 'qr', 'echar', 'votar'].includes(pantalla)) { decir('', txt, true); return; }
    estado.textContent = txt; clearTimeout(aviso.t);
    aviso.t = setTimeout(() => { aviso.t = 0; estado.textContent = ''; }, ms);
};
// En vez de una frase: lo que falla tiembla en rojo; lo que espera al servidor late
const sacude = el => { el?.classList.remove('mal'); void el?.offsetWidth; el?.classList.add('mal'); vibrar([20, 40, 20]); setTimeout(() => el?.classList.remove('mal'), 700); };
// Carta de acción jugada: se va (sube y se desvanece) y no se puede volver a jugar hasta que
// contesta el servidor. Devolverla a la mano al instante parecía que no se había elegido.
// Si cambia el menú, se va con él; si no hay respuesta en 6 s, vuelve.
const seVa = c => {
    if (!c) return;
    c.classList.add('ida'); c.disabled = true;
    clearTimeout(c._vuelve); c._vuelve = setTimeout(() => vuelve(c), 6000);
};
function vuelve(c) {
    if (!c) return;
    clearTimeout(c._vuelve);
    if (!mano.includes(c)) return;   // el menú cambió: se fue con él
    c.classList.remove('ida'); c.disabled = false;
    estadoBots();
}
// Bots: la carta vuelve cuando la sala llega al número de jugadores pedido (lobby_update)
let esperaBots = null;   // { c, n }
const pideBots = (c, n) => { seVa(c); vibrar(15); esperaBots = { c, n }; };
/** En el menú de bots: añadir y llenar, apagadas con la mesa llena; quitar, sin bots. */
function estadoBots() {
    const m = ultimaSala;
    if (pantalla !== 'bots' || !m) return;
    const llena = m.players.length >= m.max_players, sinBots = !m.players.some(p => p.is_bot);
    mano.forEach((c, i) => {
        if (c.classList.contains('ida')) return;
        const a = MENUS.bots[i]?.accion;
        c.disabled = a === 'bot' || a === 'llenar' ? llena : a === 'quitarBot' ? sinBots : false;
    });
}
const salta = c => c?.animate([{ translate: '0 0' }, { translate: '0 -40px' }, { translate: '0 0' }], { duration: 420, easing: 'cubic-bezier(.34,1.56,.64,1)' });

// ── Partida rápida sin nadie: «No hay oponentes dignos…» y la cámara por las sillas vacías ──
function ofrecerBots() {
    if (pantalla !== 'sala') return;
    historial.push(pantalla); pantalla = 'oferta'; esc.dataset.p = 'oferta';
    escena.camara('vacias');
    decir('', T('No hay oponentes dignos...'), true); formas();   // la frase va al chat
    retirarMano(); setTimeout(() => repartir(MENUS.oferta, 1), 160);
}
function cerrarOferta() {
    if (pantalla !== 'oferta') return;
    pantalla = historial.pop() ?? 'sala'; esc.dataset.p = pantalla;
    escena.ir(pantalla, historial.length);
    retirarMano(); setTimeout(() => { menuSala(); repartir(MENUS.sala, -1); mano.forEach((c, i) => (c.dataset.clave = MENUS.sala[i]?.clave ?? '')); }, 160);
    sincronizarSala();
}

// ── Cuenta atrás: primero uno gana la pelea por la carta y la alza; luego 3, 2, 1 con cartas ──
const LETRAS = {   // 5×7
    3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
    2: ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
    1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
};
const matrizDe = ch => LETRAS[ch].map(f => [...f].map(b => b === '1'));
let cuenta = null;   // { timers, repartiendo }
/** `segundos` lo manda el servidor (5): todo va hacia atrás desde el reparto. La victoria ocupa
 *  lo que sobra de los 3 s de números; con 3 s no hay victoria y no se rompe nada. */
function cuentaAtras(segundos) {
    cancelarCuentaVisual();
    if (!EN_SALA.has(pantalla)) return;
    if (pantalla !== 'sala') { while (EN_SALA.has(historial.at(-1)) && pantalla !== 'sala') deshacerSinAnimar(); }
    const GANA = Math.max(0, segundos - 3) * 1000;
    cuenta = { timers: [], repartiendo: false };
    historial.push(pantalla); pantalla = 'cuenta';
    escena.ganar(); vibrar(25);
    if (!ancho()) formas();   // en el móvil el chat se pliega: taparía la carta alzada
    mano.forEach(x => pon(x, W() / 2 - 64, H() + 80, 0, .8));
    estado.innerHTML = `${ico('abajo')}${ico('cruz')}`; estado.setAttribute('aria-label', T('Desmárcate (↓) para cancelar')); colocarTextos();   // ↓ = cancelar, sin frase
    const tras = (ms, f) => cuenta.timers.push(setTimeout(f, ms));
    tras(GANA, () => { esc.dataset.p = 'cuenta'; escena.camara('cuenta'); formas(); });
    ['3', '2', '1'].forEach((k, i) => tras(GANA + i * 1000, () => { escena.mosaico(matrizDe(k), 0.13, true); vibrar(30); }));
    tras(GANA + 3000, () => { cuenta.repartiendo = true; escena.mosaico(null); estado.textContent = ''; });
}
/** Se cortó (alguien se desmarcó, entró o salió): de vuelta a la sala tal cual estaba. */
function cancelarCuentaVisual(volverASala = false) {
    if (!cuenta) return;
    cuenta.timers.forEach(clearTimeout); cuenta = null;
    escena.mosaico(null);
    if (pantalla === 'cuenta' && volverASala) {
        pantalla = historial.pop() ?? 'sala'; esc.dataset.p = pantalla;
        escena.ir(pantalla, historial.length);
        menuSala(); repartir(MENUS[pantalla], -1); mano.forEach((c, i) => (c.dataset.clave = MENUS[pantalla][i]?.clave ?? ''));
        sincronizarSala();
    } else if (pantalla === 'cuenta') { pantalla = historial.pop() ?? 'sala'; esc.dataset.p = pantalla; }
}
function deshacerSinAnimar() {
    const h = cabeceras.pop(); if (h) alCentro(h);
    apilarCabeceras();
    pantalla = historial.pop(); esc.dataset.p = pantalla;
}

// ── Cada pantalla, su toma ─────────────────────────────────────────────────────────
const PERFIL = new Set(['perfil', 'sm', 'burla']);
/** Los menús que dependen de algo: a quién echar, las burlas, las salas. */
function preparaMenu(destino, o = {}) {
    if (destino === 'echar') marcaVoto = o.idx >= 0 && o.idx < 4 ? o.idx : -1;
    if (destino === 'echar') MENUS.echar = [
        { palo: 'i:fuera', nombre: T('Echar a {n}', { n: o.nick }), nota: 'Votan todos: si alguien dice no, se queda', accion: 'echar', id: o.id, idx: o.idx },
        { palo: 'i:volver', nombre: 'Mejor no', nota: 'Volver a la sala', accion: 'volver' },
    ];
    if (destino === 'burla') MENUS.burla = [...TAUNTS, { id: '', name: tl('taunt.none') }].map(b =>
        ({ palo: b.id ? 'i:nota' : 'i:vacio', nombre: b.name, nota: 'Suena a quien llegue tarde a tu carta', accion: 'burla', id: b.id }));
    if (destino === 'perfil') MENUS.perfil[1].nota = TAUNTS.find(b => b.id === getTaunt())?.name ?? tl('taunt.none');
}
function alCambiar(antes, ahora, lobby) {
    if (PERFIL.has(ahora) && !est.currentLobbyId) {
        X.nombres = [nombre.value.trim() || T('Tú'), 'Beto', 'Coca', 'Dani']; X.tu = 0;
    } else if (!EN_SALA.has(ahora) || ahora === 'sala') sincronizarSala();
    X.marca = ahora === 'echar' || ahora === 'votar' ? marcaVoto : -1;   // a quién se vota echar, en bermellón
    formas(ahora);
    if (lobby) alinearLobby(ahora);
    if (ahora === 'unirse') { if (est.ws?.readyState === WebSocket.OPEN) refreshLobbies(); pintarMesas(); }
    else if (ahora !== 'visor') X.mesas = null;
    if (antes === 'sm') X.placa = null;
    if (ahora === 'sm') X.placa = { txt: smCodeGuardado(), ok: !!smCodeGuardado() };
    if (antes === 'qr') escena.mosaico(null);
    if (ahora === 'qr') mostrarQR();
    if (antes === 'visor') pararVisor();
    if (ahora === 'visor') abrirVisor();
    if (ahora === 'perfil') cargarElo();
}
/** Al pasar por una carta (sin jugarla): la cámara o la figura reaccionan. */
function alElegirCarta() {
    const o = MENUS[pantalla]?.[sel]; if (!o) return;
    if (pantalla === 'unirse') escena.aMesa(Math.min(sel, 2));
    if ((pantalla === 'echar' || pantalla === 'votar') && marcaVoto > 0) escena.aAsiento(marcaVoto);
    if (pantalla === 'burla' && o.id) { X.burla = escena.ahora(); playTaunt(o.id, true); }
}

// QR de la sala: lo forman las cartas del centro, vistas desde arriba (se puede escanear).
// La matriz la da el servidor (/api/qr/:sala/matriz), el mismo QR que el SVG de siempre.
async function mostrarQR() {
    if (!est.currentLobbyId) return;
    escena.camara('qr');
    try {
        const r = await fetch(`/api/qr/${encodeURIComponent(est.currentLobbyId)}/matriz`);
        if (!r.ok) throw new Error(r.status);
        const { n, m } = await r.json(), borde = 2, filas = [];
        if (pantalla !== 'qr') return;
        for (let y = -borde; y < n + borde; y++) { const f = []; for (let x = -borde; x < n + borde; x++) f.push(y >= 0 && x >= 0 && y < n && x < n && m[y * n + x] === '1'); filas.push(f); }
        escena.mosaico(filas, 1.5 / (n + 2 * borde));
    } catch { aviso(T('No se pudo cargar el QR'), 2400); }
}
// Escáner: el de lobby.html (qr-scanner) con su <video> (#scanWrap, invisible: mesa.css),
// que se dibuja en el centro de la mesa.
async function abrirVisor() {
    X.visor = { t0: escena.ahora(), video: null };
    await conLobby(() => toggleScanner());
    if (!qrScanner) { aviso(T('No se pudo abrir la cámara. Escribe el código a mano.'), 3000); return; }
    if (X.visor) X.visor.video = document.getElementById('scanVideo');
}
function pararVisor() { stopScanner(); X.visor = null; }
// Tu Elo de verdad (el del perfil): /api/elo/:clave
let miElo = { fun: 1000, glory: 1000, top3: {} };
async function cargarElo() {
    try { const rec = await fetchElo(ratingKey()); miElo = { fun: rec?.fun?.r ?? 1000, glory: rec?.glory?.r ?? 1000, top3: rec?.top3 ?? {} }; } catch { /* sin conexión: el inicial */ }
    X.elo[0] = { v: miElo.glory, pool: 'glory', top3: !!miElo.top3.glory };
    if (pantalla === 'perfil') { PZ[0].dataset.k = ''; formas(); }
}

// ── Las salas abiertas (Unirse): cartas, y cada una una mesa en la misma sala oscura ──
let salas = [], firmaSalas = '';
function alListaSalas(lobbies) {
    const ESTADO = { waiting: 'En espera', starting: 'Empezando', playing: 'Jugando' };
    salas = [...lobbies].sort((a, b) => (a.status === 'waiting' ? 0 : 1) - (b.status === 'waiting' ? 0 : 1) || b.player_count - a.player_count);
    const firma = salas.map(l => `${l.id}${l.player_count}${l.status}${l.spectators}`).join('|');
    MENUS.unirse = salas.length ? salas.map(l => {
        const mirar = l.status !== 'waiting' || l.player_count >= l.max_players;
        return { clave: l.id, palo: `${l.player_count}/${l.max_players}`, nombre: l.id,
            nota: `${T(ESTADO[l.status] ?? 'En espera')}${l.spectators ? ' · ' + T('{n} mirando', { n: l.spectators }) : ''} · ${T(mirar ? 'Entrarás a mirar' : 'Entrarás a jugar')}`,
            accion: 'entrarSala', id: l.id, mirar };
    }) : [{ clave: 'nada', palo: 'i:vacio', nombre: 'No hay salas', nota: 'Crea una o escribe un código', accion: 'nada' }];
    if (firma === firmaSalas && mano.length) return;
    firmaSalas = firma;
    if (pantalla === 'unirse') { refrescarMano('unirse'); pintarMesas(); }
}
function pintarMesas() {
    X.mesas = salas.slice(0, 3).map((s, i) => ({
        x: [-5.2, 0, 5.2][i], z: [-4, -7.5, -4][i], desfase: 40 + i * 23, jugando: s.status === 'playing',
        ocup: [0, 1, 2, 3].map(p => p < s.player_count),
    }));
}

// ── Mensajes del servidor que se pintan aquí ───────────────────────────────────────
let marcaVoto = -1;
function alMensaje(msg) {
    switch (msg.type) {
        case 'lobby_list': alListaSalas(msg.lobbies ?? []); break;
        case 'lobby_update': {
            const llega = !!ultimaSala && ultimaSala.players.length < msg.players.length;
            ultimaSala = msg;
            sincronizarSala(llega);
            break;
        }
        case 'chat': decir(sinEmoji(msg.from), msg.text, false, msg.from === est.currentNickname); break;
        case 'chat_history': chatLog.length = 0; (msg.messages ?? []).forEach(l => chatLog.push({ quien: sinEmoji(l.from), txt: l.text, sistema: false, tuyo: l.from === est.currentNickname })); pintarChat(); break;
        case 'kick_poll': alVoto(msg); break;
        case 'kick_poll_ended': alFinVoto(msg); break;
        case 'kicked': ultimaSala = null; break;
        case 'game_start': cancelarCuentaVisual(); break;
    }
}
/** Votación para echar: quien vota tiene «Sí, fuera» / «No»; el votado y los demás, el estado. */
function alVoto(msg) {
    const gente = ordenSala(), i = gente.findIndex(p => p.nick === msg.nickname), quien = sinEmoji(msg.nickname);
    marcaVoto = i >= 0 && i < 4 ? i : -1;
    X.marca = marcaVoto;
    if (msg.yes?.length) X.voto = { a: Math.max(0, marcaVoto), t0: escena.ahora() };
    const puedo = !est.soyEspectador && msg.voters.includes(est.currentNickname) && !msg.yes.includes(est.currentNickname);
    MENUS.votar = puedo
        ? [{ clave: 'si', palo: 'i:fuera', nombre: T('Sí, fuera {n}', { n: quien }), nota: T('{y} de {t} a favor', { y: msg.yes.length, t: msg.voters.length }), accion: 'votoSi' },
           { clave: 'no', palo: 'i:volver', nombre: 'Que se quede', nota: 'Con un no, se queda', accion: 'votoNo' }]
        : [{ clave: 'espera', palo: 'i:reloj', nombre: msg.nickname === est.currentNickname ? '¿Te echan?' : 'Votando…', nota: T('{y} de {t} a favor', { y: msg.yes.length, t: msg.voters.length }), accion: 'nada' }];
    if (pantalla === 'votar') refrescarMano('votar');
    else if (EN_SALA.has(pantalla) && pantalla !== 'cuenta') {
        while (pantalla !== 'sala' && EN_SALA.has(historial.at(-1))) deshacerSinAnimar();
        irA('votar', T('¿Echar a {n}?', { n: quien }), {}, false);
    }
}
function alFinVoto(msg) {
    marcaVoto = -1; X.marca = -1; X.voto = null;
    if (pantalla === 'votar') deshacer();
    const textos = { expulsado: 'kick.done', rechazado: 'kick.no', tiempo: 'kick.timeout', salio: 'kick.left', cancelada: 'kick.cancelled' };
    if (textos[msg.result]) aviso(tl(textos[msg.result], { nick: sinEmoji(msg.nickname) }), 2600);
}


// ── Piezas: tres figuras que se transforman en lo que la pantalla necesita ─────────
//   inicio: tu perfil (junto a tu nombre) · las reglas
//   crear:  cuántos jugadores · pública o privada
//   unirse: escribir un código · escanear un QR
//   sala:   el chat (siempre) · el código (toca: QR) · en bots, la dificultad
//   perfil: tus dos diales de Elo · el idioma
const PZ = ['p1', 'p2', 'p3'].map(id => document.getElementById(id));
const DIFS = { Fácil: 'easy', Normal: 'normal', Difícil: 'hard' };
function caja(el, x, y, w, h, html, clave) {
    el.classList.remove('oculta');
    Object.assign(el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    if (el.dataset.k !== clave) { el.dataset.k = clave; el.innerHTML = `<div class="dentro">${html}</div>`; return true; }
    return false;
}
function plegar(el) { el.classList.add('oculta'); el.dataset.k = ''; }
// Opciones contiguas: una fila con un resalte que se desliza (--i = la elegida, --n = cuántas)
const seg = (act, valores, actual) => `<div class="fila segs" style="--n:${valores.length};--i:${Math.max(0, valores.indexOf(actual))}">` +
    valores.map(v => `<button class="seg${v === actual ? ' si' : ''}" data-act="${act}" data-v="${v}">${T(v)}</button>`).join('') + '<i class="resalte"></i></div>';
// Tambor de números: arrastra arriba/abajo, rueda del ratón, o − / +
const tambor = (act, min, max, v) => `<span class="tambor" data-tambor="${act}" data-min="${min}" data-max="${max}" style="--v:${v};--min:${min}" role="spinbutton" aria-valuenow="${v}" aria-valuemin="${min}" aria-valuemax="${max}"><span class="rodillo">` +
    Array.from({ length: max - min + 1 }, (_, k) => `<span${k + min === v ? ' class="ya"' : ''}>${k + min}</span>`).join('') + '</span></span>';
function girarTambor(el, v) {
    const min = +el.dataset.min, max = +el.dataset.max; v = Math.max(min, Math.min(max, v));
    el.style.setProperty('--v', v); el.setAttribute('aria-valuenow', v);
    el.querySelectorAll('.rodillo span').forEach((s, k) => s.classList.toggle('ya', k + min === v));
    return v;
}
// Jugadores de la sala nueva: se pasan a createLobby(crearJug) al abrirla
const AL_GIRAR = { jug: v => { if (v !== crearJug) vibrar(6); crearJug = v; } };
let arrastre = null;
document.addEventListener('pointerdown', e => { const t0 = e.target.closest('#escenario .tambor'); if (!t0) return; arrastre = { t: t0, y: e.clientY, v: +t0.style.getPropertyValue('--v') }; t0.setPointerCapture(e.pointerId); });
document.addEventListener('pointermove', e => { if (!arrastre) return; const { t: t0, y, v } = arrastre; AL_GIRAR[t0.dataset.tambor]?.(girarTambor(t0, v + Math.round((y - e.clientY) / 24))); });
document.addEventListener('pointerup', () => { arrastre = null; });
document.addEventListener('wheel', e => { const t0 = e.target.closest('#escenario .tambor'); if (!t0) return; e.preventDefault(); AL_GIRAR[t0.dataset.tambor]?.(girarTambor(t0, +t0.style.getPropertyValue('--v') + (e.deltaY < 0 ? 1 : -1))); }, { passive: false });
function formas(p = pantalla) {
    const R = rejilla(), w = R.w, an = ancho(), enSala = EN_SALA.has(p) && p !== 'cuenta';
    const col = Math.min(320, w - 2 * M), der = w - M - col;
    const usadas = new Set();
    const pon3 = (i, ...a) => { usadas.add(i); return caja(PZ[i], ...a); };
    if (p === 'inicio') {
        pon3(0, M + R.cabw + SEP, FILA2, 44, 40, `<button class="grande" data-act="perfil" aria-label="${T('Perfil')}">${ico('persona')}</button>`, 'perfil');
        pon3(1, w - M - 110, FILA2, 110, 40, `<button class="grande" data-act="ayuda" style="font-size:.8rem">${T('? Reglas')}</button>`, 'ayuda');
    }
    if (p === 'crear') {
        pon3(0, M, ZONA, col, 126, `<span class="rotulo">${T('Jugadores')}</span><div class="fila"><button data-act="menos" aria-label="−">${ico('menos')}</button>${tambor('jug', 2, 8, crearJug)}<button data-act="mas" aria-label="+">${ico('mas')}</button></div>`, 'jug');
        pon3(1, M, ZONA + 126 + SEP, col, 44, seg('privacidad', ['Pública', 'Privada'], lobbyIsPublic ? 'Pública' : 'Privada'), 'priv');
    }
    if (p === 'unirse') {
        pon3(0, M, ZONA, col, 72, `<span class="rotulo">${T('Código')}</span><button class="grande" data-act="codigo"><span class="num">______</span></button>`, 'cod');
        pon3(1, M, ZONA + 72 + SEP, col, 44, `<button class="grande" data-act="escanear">${ico('camara')} ${T('Escanear QR')}</button>`, 'esc');
    }
    if (enSala && est.currentLobbyId && !(p === 'qr' && !an)) {
        // En la sala no hay franja de estado (se ve en las cartas y en el chip): el chat llega hasta
        // la mano. Entre los jugadores y el chat queda el hueco donde se ve la pelea por la carta (al
        // menos 120 px): la cámara de la sala se centra en él.
        const bajoJug = ZONA + filasSala() * 107 + SEP, fondo = R.estadoAbajo, PELEA = 120;
        const ch = an ? Math.max(88, Math.min(420, fondo - ZONA)) : Math.max(88, Math.min(300, fondo - bajoJug - PELEA - (p === 'bots' ? 52 : 0)));
        const y = an ? ZONA : fondo - ch;
        if (p === 'bots') pon3(2, M, an ? ZONA : y - 44 - SEP, col, 44, seg('dif', ['Fácil', 'Normal', 'Difícil'], Object.keys(DIFS).find(k => DIFS[k] === botDifficulty) ?? 'Normal'), 'dif');
        const finHueco = an ? fondo : (p === 'bots' ? y - 44 - SEP : y) - SEP;
        const cyPelea = (bajoJug + finHueco) / 2 / R.h;
        escena.fijarCy('sala', cyPelea); escena.fijarCy('bots', cyPelea);
        const cx = an ? der : M, cw = an ? col : w - 2 * M;
        if (pon3(0, cx, y, cw, ch,
            `<span class="rotulo">${T('Chat de la sala')}</span><div class="log" aria-live="polite"></div><button class="escribe" data-act="chat">${T('Escribe aquí :D')}</button>`, 'chat')) pintarChat();
        // El chip de la sala: su clasificación (FUN = con bots, GLORY = solo personas), el código y el QR
        const qw = an ? col : Math.min(162, w - 2 * M - R.cabw - SEP), pool = ultimaSala?.pool === 'fun' ? 'fun' : 'glory';
        if (pon3(1, w - M - qw, FILA2, qw, 40, `<button class="grande" data-act="qr" aria-label="QR"><span class="pool" data-pool="${pool}" title="${T(pool === 'fun' ? 'For fun · con bots' : 'For glory · solo personas')}">${pool === 'fun' ? 'FUN' : 'GLORY'}</span><span class="cod"></span>${ico('qr')}</button>`, `codsala:${est.currentLobbyId}:${pool}`))
            PZ[1].querySelector('.cod').textContent = est.currentLobbyId;
    }
    if (p === 'perfil') {
        // Los dos Elos uno encima del otro, en la columna de las piezas (como crear o unirse)
        const ALTO_ELO = 272;
        const nuevo = pon3(0, M, ZONA, col, ALTO_ELO, `<span class="rotulo">${T('Tu Elo')}</span><div class="diales"><div data-dial="fun"></div><div data-dial="glory"></div></div>`, 'diales');
        if (nuevo && typeof agDial === 'function') {
            agDial(PZ[0].querySelector('[data-dial="fun"]'), { from: miElo.fun, to: miElo.fun, skin: 'fun', top3Before: !!miElo.top3.fun });
            agDial(PZ[0].querySelector('[data-dial="glory"]'), { from: miElo.glory, to: miElo.glory, skin: 'glory', top3Before: !!miElo.top3.glory });
        }
        const actual = Object.keys(IDIOMAS).find(k => IDIOMAS[k] === window.PilesI18n?.lang) ?? 'ES';
        pon3(1, M, ZONA + ALTO_ELO + SEP, col, 44, seg('idioma', Object.keys(IDIOMAS), actual), 'idioma');
    }
    PZ.forEach((el, i) => { if (!usadas.has(i)) plegar(el); });
}
function actuar(act, b) {
    const marca = () => {   // el resalte se desliza hasta la nueva
        const fila = b.parentElement, segs = [...fila.querySelectorAll('.seg')];
        segs.forEach(s => s.classList.toggle('si', s === b));
        fila.style.setProperty('--i', segs.indexOf(b));
    };
    vibrar(8);
    if (act === 'perfil') irA('perfil', 'Perfil');
    else if (act === 'ayuda') irA('tutorial', 'Cómo jugar');
    else if (act === 'menos' || act === 'mas') AL_GIRAR.jug(girarTambor(b.parentElement.querySelector('.tambor'), crearJug + (act === 'mas' ? 1 : -1)));
    else if (act === 'privacidad') { const pub = b.dataset.v === 'Pública'; conLobby(() => setVisibility(pub)); marca(); }
    else if (act === 'dif') { setBotDifficulty(DIFS[b.dataset.v] ?? 'normal'); marca(); }
    else if (act === 'idioma') { marca(); setTimeout(() => window.PilesI18n?.setLang(IDIOMAS[b.dataset.v]), 300); }
    else if (act === 'escanear') irA('visor', 'Escanear QR');
    else if (act === 'qr' && est.currentLobbyId && pantalla !== 'qr') irA('qr', 'Invitar');
    else if (act === 'codigo') pedir('ABC123', 6, v => entrarCodigo(v), txt => {
        b.querySelector('.num').textContent = txt.padEnd(6, '_');
        if (txt.length === 6) { cerrarCampo(); entrarCodigo(txt); }
    });
    else if (act === 'chat' && est.currentLobbyId) pedir(T('Escribe aquí :D'), 300, txt => sendChat(txt));
}
document.addEventListener('click', e => { const b = e.target.closest('#escenario .pieza [data-act]'); if (b) actuar(b.dataset.act, b); });
function entrarCodigo(cod) {
    const code = extractLobbyCode(cod);
    if (!code) { sacude(PZ[0]); return; }   // el recuadro del código tiembla
    joinLobby(code);
}
// El chat de la sala (lo guarda el servidor mientras dura la sala, nunca en las grabaciones)
const chatLog = [];
function decir(quien, txt, sistema = false, tuyo = false) {
    chatLog.push({ quien, txt, sistema, tuyo });
    if (chatLog.length > 60) chatLog.shift();
    pintarChat();
}
function pintarChat() {
    const log = document.querySelector('#escenario .pieza .log'); if (!log) return;
    log.textContent = '';
    for (const m of chatLog.slice(-14)) {
        const d = document.createElement('div');
        if (m.sistema) { d.className = 'sis'; d.textContent = m.txt; }
        else { const b = document.createElement('b'); b.textContent = m.quien + ' '; if (m.tuyo) b.className = 'tuyo'; d.append(b, m.txt); }
        log.append(d);
    }
}
// Los diales de Elo de cada jugador, flotando delante de su pecho, casi pegados a la mesa.
// Si su Elo cambia (la misma persona), el tambor gira hasta él.
const dialesMesa = [...document.querySelectorAll('.dialMesa')], claveDial = ['', '', '', ''];
// Un dial que tocaría algo del menú, o se saldría de la pantalla, se esconde: la interfaz manda.
const OCUPA = '#escenario .pieza:not(.oculta), #cartas > .carta, #estado, #titulo, #nombre, #campo.abierto';
function chocaDial(b, ocupado) {
    if (b.left < SEP || b.top < SEP || b.right > W() - SEP || b.bottom > H() - SEP) return true;
    return ocupado.some(o => b.left < o.right + SEP && b.right > o.left - SEP && b.top < o.bottom + SEP && b.bottom > o.top - SEP);
}
function moverDiales() {
    requestAnimationFrame(moverDiales);
    if (document.body.classList.contains('en-partida') || typeof agDial !== 'function') return;
    const ocupado = [...document.querySelectorAll(OCUPA)]
        .filter(e => e.offsetParent !== null && +getComputedStyle(e).opacity > 0.3)
        .map(e => e.getBoundingClientRect());
    const tam = dialesMesa.map(el => [el.offsetWidth, el.offsetHeight]);   // todas las lecturas antes de escribir
    X.anclas.forEach((a, p) => {
        const el = dialesMesa[p], e = X.elo?.[p];
        const ok = a.ok && e;
        if (!ok) { el.style.opacity = 0; return; }
        const quien = X.nombres?.[p] ?? `top${p}`, k = `${quien}|${e.v}|${e.pool}|${!!e.top3}`;
        if (claveDial[p] !== k) {
            const [antesQuien, antesV] = claveDial[p].split('|');
            const antes = antesQuien === quien ? Number(antesV) : e.v;
            claveDial[p] = k;
            agDial(el, { from: antes, to: e.v, skin: e.pool, top3Before: !!e.top3 });
        }
        const s = a.s * (W() < 760 ? 0.75 : 1);
        el.style.transform = `translate(${a.x}px, ${a.y}px) translate(-50%, -100%) scale(${s})`;
        // Su caja, calculada (origen abajo al centro): leer getBoundingClientRect justo después de
        // escribir el transform forzaba a recalcular estilos 4 veces por cuadro.
        const [w, h] = tam[p];
        el.style.opacity = chocaDial({ left: a.x - w * s / 2, right: a.x + w * s / 2, top: a.y - h * s, bottom: a.y }, ocupado) ? 0 : 1;
        el.classList.toggle('tuyo', p === X.tu);
    });
}
requestAnimationFrame(moverDiales);

function accion(a, c, o = {}) {
    if (a === 'nada') { salta(c); return; }
    if (a === 'volver') { volver(); return; }
    if (a === 'rapida') { seVa(c); quickMatch(); return; }
    if (a === 'abrir') { seVa(c); createLobby(crearJug); return; }
    if (a === 'entrarSala') { seVa(c); joinLobby(o.id, o.mirar); return; }
    if (a === 'burla') {   // elegir (la guarda lobby.html) y volver al perfil
        try { localStorage.setItem('piles.taunt', o.id); } catch { /* modo privado */ }
        salta(c); setTimeout(volver, 380);
        return;
    }
    if (a === 'smCodigo') {   // lo que escribes aparece en la placa; al confirmar, lobby.html lo guarda y vincula
        pedir(T('Pega aquí tu código'), 12, v => {
            setSmCode(v);
            X.placa = { txt: smCodeGuardado(), ok: true }; vibrar(30);
        }, txt => { X.placa = { txt, ok: false }; });
        return;
    }
    if (a === 'smBorrar') { clearSmCode(); X.placa = { txt: '', ok: false }; salta(c); return; }
    if (!est.currentLobbyId) return;
    if (a === 'listo') { toggleReady(); vibrar(20); menuSala(); refrescarMano('sala'); return; }
    if (a === 'rol') { cambiarRol(); seVa(c); return; }
    if (a === 'ofertaBots') { acceptBotsOffer(); cerrarOferta(); return; }
    if (a === 'seguir') { cancelQuickMatchOffer(true); cerrarOferta(); return; }
    // Bots: la carta se va hasta que la sala llega a los jugadores pedidos (sincronizarSala)
    const m = ultimaSala, n = m?.players.length ?? 0;
    if (a === 'bot') { if (n < m.max_players) { addBot(); pideBots(c, n + 1); } return; }
    if (a === 'llenar') { for (let k = n; k < m.max_players; k++) addBot(); if (n < m.max_players) pideBots(c, m.max_players); return; }
    if (a === 'quitarBot') {
        const bot = [...(m?.players ?? [])].reverse().find(p => p.is_bot);
        if (bot) { removeBot(bot.id); pideBots(c, n - 1); } else aviso(T('No hay bots'));
        return;
    }
    if (a === 'echar') { send({ type: 'start_kick', target: o.id }); salta(c); deshacer(); return; }   // llega kick_poll: a votar
    if (a === 'votoSi' || a === 'votoNo') { send({ type: 'kick_vote', yes: a === 'votoSi' }); seVa(c); return; }
    if (a === 'copiar') {
        const link = joinLinkFor(est.currentLobbyId);
        navigator.clipboard?.writeText(link).then(() => aviso(T('Enlace copiado')), () => aviso(link, 4000));
        salta(c); return;
    }
}

// ── Entrada: deslizar de lado elige, ↑ lanza, ↓ vuelve; teclado igual ────────
// Todo sigue al dedo desde que toca: de lado, la mano se desliza con él; hacia arriba, la carta
// elegida sube, el resto se aparta y la cámara se asoma al menú siguiente; hacia abajo, la cabecera
// baja y se asoma el menú anterior. Hasta soltar no pasa nada: si vuelves atrás, todo vuelve.
const RECORRIDO = 190;   // px de arrastre para el cambio completo
let ini = null;
const sinTransicion = els => els.forEach(c => { if (c) c.style.transition = 'none'; });
function arrastrarV(dy) {
    const sube = dy < 0, p = Math.min(1, Math.abs(dy) / RECORRIDO);
    const c = mano[sel], o = MENUS[pantalla]?.[sel], h = cabeceras.at(-1), prev = cabeceras.at(-2);
    if (sube && c) {
        // Una acción solo amaga (no cambia de menú), pero cuenta igual: ini.p es el recorrido real,
        // no el amago. Antes se guardaba el amago (≤ 0,3 < 0,45) y una acción deslizada sin prisa
        // no se hacía nunca. Pasado el punto, la carta se enciende: soltar ya la juega.
        const destino = o?.ir, q = destino ? p : Math.min(p, 0.3);
        if (!destino) c.classList.toggle('arma', p >= 0.45 && !c.disabled);
        sinTransicion(mano); sinTransicion([h]);
        const { x, y, s } = ini.base;
        pon(c, x + (M - x) * q * 0.55, y + (FILA2 - y) * q, -6 * q, s + (0.62 - s) * q);
        mano.forEach((x2, i) => { if (i !== sel) { const k = i - sel; pon(x2, W() / 2 - 64 + k * 112 * rejilla().es + Math.sign(k) * 60 * q, ini.base.y + 30 + 90 * q, k * 5 + Math.sign(k) * 10 * q, .9 * rejilla().es); x2.style.opacity = 1 - 0.7 * q; } });
        if (h) h.style.filter = `brightness(${1 - 0.58 * q})`;
        escena.asomar(destino ?? null, q, 1);
        ini.p = p; ini.sentido = 1;
    } else if (!sube && h && historial.length && pantalla !== 'cuenta') {
        sinTransicion([h]); sinTransicion(mano);
        h.style.zIndex = 20;   // la cabecera que baja va por encima de las piezas
        pon(h, M + (W() / 2 - 64 - M) * p * 0.6, FILA2 + (rejilla().manoTop - FILA2) * p * 0.8, 6 * p, 1 + 0.2 * p);
        if (prev) prev.style.filter = `brightness(${0.42 + 0.58 * p})`;
        mano.forEach((x2, i) => { const k = i - sel; pon(x2, W() / 2 - 64 + k * 112 * rejilla().es + W() * 0.6 * p, ini.base.y + (k ? 12 : 0), k * 5 + 12 * p, .9 * rejilla().es); x2.style.opacity = 1 - 0.6 * p; });
        escena.asomar(historial.at(-1), p, -1);
        ini.p = p; ini.sentido = -1;
    } else { ini.p = 0; escena.asomar(null); }
}
function soltarTodo() {   // quita lo fijado al dedo; lo siguiente que se coloque vuelve a animarse
    [...mano, ...cabeceras].forEach(c => { c.style.transition = ''; c.style.filter = ''; c.classList.remove('arma'); if (mano.includes(c)) c.style.opacity = ''; });
}
esc.addEventListener('pointerdown', e => {
    if (e.target === nombre || e.target === campo || e.target.closest('.pieza')) return;
    const c = mano[sel], R = rejilla(), s0 = 1.08 * R.es;
    ini = { x: e.clientX, y: e.clientY, t: Date.now(), sel, eje: null, p: 0, sentido: 0,
        base: { x: W() / 2 - 64, y: R.manoTop - 88 + 88 * s0, s: s0 } };
    if (c && !c.disabled) { c.style.transition = 'transform 140ms ease-out'; pon(c, ini.base.x, ini.base.y - 8, 0, s0 * 1.04); }   // al tocar, la carta ya responde
    esc.setPointerCapture(e.pointerId);
});
esc.addEventListener('pointermove', e => {
    if (!ini) return;
    const dx = e.clientX - ini.x, dy = e.clientY - ini.y;
    if (!ini.eje && Math.hypot(dx, dy) > 8) ini.eje = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    if (ini.eje === 'h' && mano.length) {
        const n = Math.max(0, Math.min(mano.length - 1, ini.sel + Math.round(-dx / 90)));   // cada 90 px, una carta
        if (n !== sel) { sel = n; vibrar(5); }
        const usado = -(sel - ini.sel) * 90, resto = dx - usado, borde = (sel === 0 && resto > 0) || (sel === mano.length - 1 && resto < 0);
        colocarMano(false, resto * (borde ? 0.3 : 112 / 90));
    } else if (ini.eje === 'v') arrastrarV(dy);
});
const cancelarArrastre = () => { if (!ini) return; ini = null; soltarTodo(); escena.asomar(null); colocarMano(); apilarCabeceras(); };
esc.addEventListener('pointercancel', cancelarArrastre);
esc.addEventListener('pointerup', e => {
    if (!ini) return;
    const dx = e.clientX - ini.x, dy = e.clientY - ini.y, t0 = Date.now() - ini.t;
    const { eje, p, sentido } = ini;
    ini = null;
    soltarTodo();
    const rapido = Math.abs(dy) > 40 && Math.abs(dy) / t0 > 0.6;   // un golpe corto y rápido también cuenta
    if (eje === 'v' && sentido && (p >= 0.45 || rapido)) {
        escena.confirmarAsomo();
        const esAccion = MENUS[pantalla]?.[sel]?.accion !== undefined, antes = pantalla;
        if (sentido > 0) jugar(); else volver();
        if (esAccion && pantalla === antes) colocarMano();   // una acción no cambia de menú: la carta vuelve
        return;
    }
    escena.asomar(null);
    if (eje) { colocarMano(); apilarCabeceras(); return; }   // no llegó: todo vuelve a su sitio
    colocarMano();
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && t0 < 350) {
        // Toque: en otra carta, la mano se desliza hasta ella; en la elegida, se juega
        const bajo = document.elementFromPoint(e.clientX, e.clientY);
        // La carta de otra persona en la sala: proponer echarla (solo quien lleva más tiempo sentado)
        const jug = bajo?.closest('.carta.jugador'), id = jug?.dataset.id;
        const p2 = ultimaSala?.players.find(x => x.id === id);
        if (pantalla === 'sala' && p2 && id !== est.currentPlayerId) {
            if (!p2.is_bot && ultimaSala.oldest === est.currentPlayerId && !est.soyEspectador && ultimaSala.status === 'waiting')
                irA('echar', 'Echar', { id, nick: sinEmoji(p2.nickname), idx: ordenSala().findIndex(x => x.id === id) });
            else salta(jug);
            return;
        }
        const c = bajo?.closest('#cartas .carta:not([disabled])');
        const i = mano.indexOf(c);
        if (i >= 0 && i !== sel) { sel = i; vibrar(6); colocarMano(); }
        else if (i === sel) jugar();
    }
});
addEventListener('keydown', e => {
    if (document.body.classList.contains('en-partida')) return;
    if (e.target === nombre || e.target === campo || e.target.closest?.('.elo-choice, #reconnectOverlay')) return;
    if (!document.getElementById('eloChoice')?.hidden) return;
    if (e.key === 'ArrowLeft') elegir(-1);
    else if (e.key === 'ArrowRight') elegir(1);
    else if (e.key === 'ArrowUp' || e.key === 'Enter') jugar();
    else if (e.key === 'ArrowDown' || e.key === 'Escape' || e.key === 'Backspace') volver();
    else return;
    e.preventDefault();
});
addEventListener('resize', () => { colocarMano(true); PZ.forEach(plegar); formas(); });

// Tu nombre: este campo es el único (lobby.html lo lee con miNombre()); se guarda en piles_nickname
try { nombre.value = localStorage.getItem('piles_nickname') || ''; } catch { /* sin storage */ }
nombre.placeholder = tl('home.nameph');
nombre.addEventListener('input', () => {
    const v = nombre.value.trim();
    try { if (v) localStorage.setItem('piles_nickname', v); } catch { /* */ }
});
nombre.addEventListener('keydown', e => e.stopPropagation());

// Conexión: la lámpara parpadea y todo se congela sin color mientras no hay WebSocket
let conectado = null;
setInterval(() => {
    const ok = !!est.ws && est.ws.readyState === WebSocket.OPEN;
    if (ok === conectado) return;
    conectado = ok;
    X.cortado = !ok; escena.congelar(!ok);
    // Sin texto: la escena apagada y la lámpara que parpadea ya dicen «sin conexión»
}, 400);

// Arranque: el menú de inicio (o la pantalla en la que deja lobby.html: enlace ?join=, vuelta
// tras cambiar de idioma, sala recuperada tras F5…)
document.body.classList.add('mesa');
MENUS.perfil[1].nota = TAUNTS.find(b => b.id === getTaunt())?.name ?? tl('taunt.none');
window.agText = window.agText ?? { up: tl('rank.up'), down: tl('rank.down') };
repartir(MENUS.inicio);
formas('inicio');
if (vistaActual !== 'homeScreen' && DE_LOBBY[vistaActual]) saltarA(DE_LOBBY[vistaActual]);

// Para depurar y para las pruebas con navegador
window.mesa = { escena, X, get pantalla() { return pantalla; }, get mano() { return mano; }, jugar, volver, elegir, irA };

