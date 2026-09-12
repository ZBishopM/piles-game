// Prueba de lo único que importa aquí: que un toque sobreviva a que el centro
// se redibuje entre que bajas el dedo y lo levantas. Es exactamente lo que
// rompía los toques, así que es lo que hay que fijar.
//
// `bindTap` se saca del propio lobby.html para no tener una copia que se quede
// vieja: si alguien cambia la función, esta prueba prueba la nueva.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const html = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'lobby.html'), 'utf8');
const src = html.match(/function bindTap\(container, handler\) \{[\s\S]*?\n\}/);
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
const bindTap = eval(`(${src[0].replace(/^function bindTap/, 'function')})`);

function scenario(name, run, { scrollable = false } = {}) {
    const container = new El('div');
    // Con scroll disponible se responde al soltar; sin él, al bajar el dedo.
    container.scrollHeight = scrollable ? 500 : 100;
    container.clientHeight = 100;
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

console.log(all ? 'TODO OK' : 'HAY FALLOS');
process.exit(all ? 0 : 1);
