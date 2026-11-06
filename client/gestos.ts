// Gestos de Piles (tareas #34 y #35): los botones se desbloquean deslizando, como el
// «slide to unlock» del iPhone antiguo, con rebote si se suelta antes de tiempo.
//
// CÓMO FUNCIONA
//   Cada <button> sigue siendo un botón (su onclick, su foco, su texto): este fichero solo
//   le pone un pomo y no deja pasar el clic de puntero. Lo dispara:
//     · arrastrar el pomo hasta el final (≥ 85 %),
//     · mantener pulsado MANTENER ms sin moverse (alternativa de WCAG 2.5.7),
//     · Enter / Espacio desde el teclado (el clic de teclado llega con detail 0).
//   Excepciones, con data-toque: el botón de pelea (se machaca a toques, #19).
//   Los botones que crea el código después también se convierten (MutationObserver).
//   La mesa (data-sin-gestos) tiene sus propios gestos; los de la partida (soltar, coger,
//   revelar, cambiar de set) están en partida/partida.ts.
//
// Con navigator.webdriver (Playwright) el clic de puntero sigue pasando: las pruebas de
// tools/browser pulsan botones para probar OTRA cosa; los gestos los prueba gestos.mjs.
export {};   // es un módulo (lo importa juego/index.ts antes que nada)
(() => {
    const MANTENER = 600;      // ms pulsado para confirmar sin arrastrar
    const UMBRAL = 0.85;       // fracción del recorrido que confirma
    const MUERTO = 8;          // px que no cuentan como movimiento
    // Bajo Playwright el clic pasa, salvo que la prueba pida los gestos (gestos.mjs).
    const pruebas = () => !!navigator.webdriver && localStorage.getItem('piles.gestos') !== '1';
    let permitido: HTMLButtonElement | null = null;      // el botón que el propio gesto está pulsando

    const pulsar = (b: HTMLButtonElement) => { permitido = b; try { b.click(); } finally { permitido = null; } };
    const vibrar = (ms: number) => { try { navigator.vibrate?.(ms); } catch { /* */ } };

    // Clic de puntero (detail > 0) sobre un botón deslizable: no pasa.
    document.addEventListener('click', e => {
        const b = (e.target as Element | null)?.closest?.<HTMLButtonElement>('button.desliza');
        if (!b || b === permitido || pruebas() || e.detail === 0) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        // El click nativo que llega tras soltar un gesto: se calla sin menear el pomo.
        if (Date.now() - (Number(b.dataset.gestoFin) || 0) < 500) return;
        b.classList.remove('desliza-pista');
        void b.offsetWidth;
        b.classList.add('desliza-pista');    // menea el pomo: «arrástrame»
    }, true);

    // ── Deslizar para desbloquear ───────────────────────────────────────────
    // Grupos de opciones: se elige deslizando por encima y soltando sobre una (o tocándola).
    const GRUPOS = '.seg-group, .lang-pick, #setNav, #specSetNav';
    // Botones de solo icono: no caben pomo y texto; se confirman manteniendo pulsado.
    const esMini = (b: HTMLButtonElement) => b.matches('.profile-btn, #muteBtn') || [...(b.textContent ?? '').trim()].length <= 2;

    function convertir(b: HTMLButtonElement) {
        if (b.classList.contains('desliza') || b.hasAttribute('data-toque') || b.closest('[data-sin-gestos]')) return;
        const grupo = b.closest<HTMLElement>(GRUPOS);
        if (grupo) { barrer(grupo); return; }
        // El pomo y el relleno son ::before / ::after (CSS, con --p): el código cambia el
        // textContent de varios botones y se llevaría por delante un hijo.
        b.classList.add('desliza');
        const mini = esMini(b);
        if (mini) b.classList.add('desliza-mini');
        let x0 = 0, y0 = 0, id: number | null = null, reloj: ReturnType<typeof setTimeout> | undefined, horizontal: boolean | null = null;

        const poner = (p: number) => b.style.setProperty('--p', p.toFixed(3));
        const recorrido = () => Math.max(1, b.clientWidth - 2.2 * parseFloat(getComputedStyle(b).fontSize));
        const soltar = (confirma: boolean) => {
            clearTimeout(reloj);
            b.classList.remove('desliza-arrastra', 'desliza-mantiene');
            if (confirma || horizontal) b.dataset.gestoFin = String(Date.now());
            if (confirma) {
                poner(1);
                b.classList.add('desliza-ok');
                vibrar(15);
                setTimeout(() => { b.classList.remove('desliza-ok'); poner(0); }, 260);
                pulsar(b);
            } else {
                b.classList.add('desliza-vuelve');    // rebote (transición con sobrepaso)
                poner(0);
                setTimeout(() => b.classList.remove('desliza-vuelve'), 450);
            }
        };

        b.addEventListener('pointerdown', e => {
            if (e.button !== 0 || b.disabled) return;
            id = e.pointerId; x0 = e.clientX; y0 = e.clientY; horizontal = null;
            b.setPointerCapture(id);
            b.classList.add('desliza-mantiene');
            reloj = setTimeout(() => { if (id !== null) { id = null; soltar(true); } }, MANTENER);
        });
        b.addEventListener('pointermove', e => {
            if (e.pointerId !== id) return;
            const dx = e.clientX - x0, dy = e.clientY - y0;
            if (horizontal === null && Math.hypot(dx, dy) > MUERTO) {
                horizontal = !mini && Math.abs(dx) >= Math.abs(dy);   // el mini solo se mantiene
                if (mini) { id = null; soltar(false); return; }
                clearTimeout(reloj);
                b.classList.remove('desliza-mantiene');
                if (!horizontal) { id = null; soltar(false); return; }   // era scroll
                b.classList.add('desliza-arrastra');
            }
            if (horizontal) poner(Math.min(1, Math.max(0, dx / recorrido())));
        });
        const fin = (e: PointerEvent) => {
            if (e.pointerId !== id) return;
            id = null;
            const p = parseFloat(b.style.getPropertyValue('--p') || '0');
            soltar(horizontal === true && p >= UMBRAL);
        };
        b.addEventListener('pointerup', fin);
        b.addEventListener('pointercancel', e => { if (e.pointerId === id) { id = null; soltar(false); } });
    }

    /** El grupo entero es un control: al soltar, se pulsa la opción que queda debajo. */
    function barrer(g: HTMLElement) {
        if (g.dataset.barre) return;
        g.dataset.barre = '1';
        g.classList.add('barre');
        let id: number | null = null, sobre: HTMLButtonElement | null = null;
        const debajo = (e: PointerEvent) => {
            const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('button');
            return el && g.contains(el) && !el.disabled ? el : null;
        };
        const marcar = (b: HTMLButtonElement | null) => {
            if (b === sobre) return;
            sobre?.classList.remove('barre-sobre');
            sobre = b;
            if (b) { b.classList.add('barre-sobre'); vibrar(5); }
        };
        g.addEventListener('pointerdown', e => {
            if (e.button !== 0) return;
            id = e.pointerId;
            g.setPointerCapture(id);
            marcar(debajo(e));
        });
        g.addEventListener('pointermove', e => { if (e.pointerId === id) marcar(debajo(e)); });
        g.addEventListener('pointerup', e => {
            if (e.pointerId !== id) return;
            id = null;
            const b = debajo(e) ?? sobre;
            marcar(null);
            if (b && !pruebas()) pulsar(b);   // (bajo Playwright lo hace su propio click)
        });
        g.addEventListener('pointercancel', () => { id = null; marcar(null); });
        // El click nativo que llega tras soltar ya está hecho por pulsar(): no repetir.
        g.addEventListener('click', e => {
            if (e.detail > 0 && !pruebas() && (e.target as Element).closest('button') !== permitido) {
                e.preventDefault(); e.stopImmediatePropagation();
            }
        }, true);
    }

    const convertirTodo = (raiz: ParentNode) => raiz.querySelectorAll?.('button').forEach(convertir);

    function iniciar() {
        convertirTodo(document);
        new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
            if (n.nodeType !== 1) return;
            if (n instanceof HTMLButtonElement) convertir(n); else convertirTodo(n as Element);
        }))).observe(document.body, { childList: true, subtree: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();