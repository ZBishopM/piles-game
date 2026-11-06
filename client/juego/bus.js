// ─── Avisos entre partes del cliente ──────────────────────────────────────
// Una función del juego dice «pasó X» (`emitir('X', …datos)`) y quien quiera
// pintar algo más encima escucha (`al('X', (…datos) => …)`): el menú de la mesa
// (mesa/), el estilo de la partida (partida/). Antes cada uno sustituía la
// función ajena en `window`, y eso no sobrevive a los módulos.
//
// Los avisos con el nombre de una función se emiten al terminar ella, con sus
// mismos argumentos. Un error en quien escucha no rompe al que avisa: el
// navegador lo informa (window.onerror) y sigue con el resto.
// Quien escucha y devuelve `false` cancela: `emitir` devuelve entonces false
// (solo lo miran los avisos que lo dicen, como 'aterriza').
const bus = new EventTarget();
export function emitir(nombre, ...datos) {
    return bus.dispatchEvent(new CustomEvent(nombre, { detail: datos, cancelable: true }));
}
export function al(nombre, f) {
    bus.addEventListener(nombre, e => { if (f(...e.detail) === false) e.preventDefault(); });
}
