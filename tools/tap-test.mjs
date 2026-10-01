// Prueba de lo único que importa aquí: que un toque sobreviva a que el centro
// se redibuje entre que bajas el dedo y lo levantas. Es exactamente lo que
// rompía los toques, así que es lo que hay que fijar.
//
// `bindTap` se saca del propio lobby.html para no tener una copia que se quede
// vieja: si alguien cambia la función, esta prueba prueba la nueva.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const html = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'client', 'lobby.html'), 'utf8');
const src = html.match(/function bindTap\(container, handler(?:, target = '\?')?\) \{[\s\S]*?\n\}/);
if (!src) { console.log('FALLO: no se encontró bindTap'); process.exit(1); }

// ── DOM mínimo, solo lo que bindTap usa ──
class El {
    constructor(tag) {
        this.tag = tag;
        this.dataset = {};
        this.parent = null;
        this.children = [];
        this.classes = new Set();
        this.listeners = {};
        this.classList = {
            add: (c) => this.classes.add(c),
            remove: (c) => this.classes.delete(c),
        };
    }
    append(child) { child.parent = this; this.children.push(child); }
    clear() { this.children.forEach(c => c.parent = null); this.children = []; }
    closest(sel) {
        // Solo se usa con '[data-tap]'.
        let n = this;
        while (n) { if (n.dataset.tap !== undefined) return n; n = n.parent; }
        return null;
    }
    contains(node) {
        let n = node;
        while (n) { if (n === this) return true; n = n.parent; }
        return false;
    }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    fire(type, ev) { (this.listeners[type] || []).forEach(fn => fn(ev)); }
}

const TAP_SLOP_PX = 12, TAP_MAX_MS = 700;
// Lo que bindTap toma de fuera: el estilo calculado y la caja negra del cliente.
const notas = [];
globalThis.getComputedStyle = (el) => ({ overflowY: el.overflowY ?? 'visible' });
globalThis.diag = { note: (kind, detail) => notas.push({ kind, ...detail }) };
const bindTap = eval(`(${src[0].replace(/^function bindTap/, 'function')})`);

function scenario(name, run, { scrollable = false, desborda = scrollable, overflowY = scrollable ? 'auto' : 'visible' } = {}) {
    const container = new El('div');
    // Con scroll REAL (overflow auto y contenido de sobra) se responde al soltar
    // con el dedo; sin él, al bajar. Desbordar con `overflow: visible` no cuenta.
    container.scrollHeight = desborda ? 500 : 100;
    container.clientHeight = 100;
    container.overflowY = overflowY;
    notas.length = 0;
    let got = null;
    bindTap(container, (v) => { got = v; });
    const card = new El('div');
    card.dataset.tap = '42';
    container.append(card);
    const result = run(container, card, () => got);
    const ok = result === true;
    console.log(`${ok ? 'OK  ' : 'FALLO'} ${name}`);
    return ok;
}

const ev = (target, x, y) => ({ target, clientX: x, clientY: y, pointerType: 'touch', button: 0 });

let all = true;

// El caso que rompía: el centro se redibuja con el dedo apoyado.
all &= scenario('con scroll, el toque sobrevive a un redibujado a media pulsación', (c, card, got) => {
    c.fire('pointerdown', ev(card, 100, 100));
    c.clear();                       // llega un game_update: fuera todas las cartas
    const nueva = new El('div');
    nueva.dataset.tap = '99';        // y entra otra distinta en su sitio
    c.append(nueva);
    c.fire('pointerup', ev(nueva, 101, 101));
    return got() === '42';           // vale la que se tocó, no la que quedó debajo
}, { scrollable: true });

// Sin nada que desplazar no hay gesto de scroll posible, así que se responde al
// bajar el dedo: es lo que se siente inmediato.
all &= scenario('sin scroll, responde al bajar el dedo', (c, card, got) => {
    c.fire('pointerdown', ev(card, 100, 100));
    return got() === '42';                     // sin haber levantado el dedo
});

all &= scenario('sin scroll, no cuenta dos veces al levantar', (c, card, got) => {
    let veces = 0;
    c.listeners = {};                          // se reengancha contando
    bindTap(c, () => { veces++; });
    c.fire('pointerdown', ev(card, 100, 100));
    c.fire('pointerup', ev(card, 100, 100));
    return veces === 1;
});

// Con scroll disponible hay que esperar: deslizar para mover el centro no puede
// llevarse una carta por delante.
all &= scenario('con scroll, arrastrar no cuenta como toque', (c, card, got) => {
    c.fire('pointerdown', ev(card, 100, 100));
    c.fire('pointerup', ev(card, 100, 160));   // scroll con el dedo
    return got() === null;
}, { scrollable: true });

all &= scenario('con scroll, no dispara hasta levantar', (c, card, got) => {
    c.fire('pointerdown', ev(card, 100, 100));
    return got() === null;
}, { scrollable: true });

all &= scenario('sin scroll, un toque normal cuenta', (c, card, got) => {
    c.fire('pointerdown', ev(card, 100, 100));
    c.fire('pointerup', ev(card, 102, 101));
    return got() === '42';
});

all &= scenario('tocar el hueco vacío no hace nada', (c, card, got) => {
    const hueco = new El('div');               // sin data-tap
    c.append(hueco);
    c.fire('pointerdown', ev(hueco, 200, 100));
    c.fire('pointerup', ev(hueco, 200, 100));
    return got() === null;
});

all &= scenario('con scroll, pointercancel anula el toque', (c, card, got) => {
    c.fire('pointerdown', ev(card, 100, 100));
    c.fire('pointercancel', ev(card, 100, 100));
    c.fire('pointerup', ev(card, 100, 100));
    return got() === null;
}, { scrollable: true });

// ── Lo del 2026-09-30: en escritorio el centro desborda ~18 px con overflow visible ──
const raton = (target, x, y) => ({ target, clientX: x, clientY: y, pointerType: 'mouse', button: 0 });

all &= scenario('ratón: el clic cuenta al bajar aunque el centro desborde', (c, card, got) => {
    c.fire('pointerdown', raton(card, 100, 100));
    return got() === '42';
}, { desborda: true, overflowY: 'visible' });

all &= scenario('ratón: aunque el contenedor tenga scroll real, dispara al bajar', (c, card, got) => {
    c.fire('pointerdown', raton(card, 100, 100));
    return got() === '42';
}, { scrollable: true });

all &= scenario('ratón: moverse 40 px antes de soltar no lo pierde ni lo cuenta dos veces', (c, card, got) => {
    let veces = 0;
    c.listeners = {};
    bindTap(c, () => { veces++; });
    c.fire('pointerdown', raton(card, 100, 100));
    c.fire('pointerup', raton(card, 140, 130));
    return veces === 1;
}, { desborda: true, overflowY: 'visible' });

all &= scenario('táctil: desbordar con overflow visible no es poder desplazarse (dispara al bajar)', (c, card, got) => {
    c.fire('pointerdown', ev(card, 100, 100));
    return got() === '42';
}, { desborda: true, overflowY: 'visible' });

all &= scenario('un clic con el botón derecho no cuenta', (c, card, got) => {
    c.fire('pointerdown', { ...raton(card, 100, 100), button: 2 });
    return got() === null;
});

// Lo descartado ya no es mudo: queda anotado para la grabación.
all &= scenario('arrastrar con scroll real anota tap_ignored: moved', (c, card, got) => {
    c.fire('pointerdown', ev(card, 100, 100));
    c.fire('pointerup', ev(card, 100, 160));
    return got() === null && notas.some(n => n.kind === 'tap_ignored' && n.reason === 'moved' && n.dist === 60);
}, { scrollable: true });

all &= scenario('pointercancel con scroll real anota tap_ignored: cancel', (c, card, got) => {
    c.fire('pointerdown', ev(card, 100, 100));
    c.fire('pointercancel', { type: 'pointercancel' });
    return got() === null && notas.some(n => n.kind === 'tap_ignored' && n.reason === 'cancel');
}, { scrollable: true });

all &= scenario('lo que sí se disparó al bajar no se anota como ignorado', (c, card, got) => {
    c.fire('pointerdown', ev(card, 100, 100));
    c.fire('pointercancel', { type: 'pointercancel' });
    return got() === '42' && notas.length === 0;
});

console.log(all ? 'TODO OK' : 'HAY FALLOS');
process.exit(all ? 0 : 1);
