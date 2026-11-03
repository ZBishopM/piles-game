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
//
//   Gestos sin botón:
//     · desde el borde izquierdo hacia la derecha = el «← Atrás» / «← Salir» visible;
//     · Inicio: un pomo con tres destinos (→ Partida rápida, ↑ Crear sala, ← Unirse);
//     · en las cartas de tu set: ↓ saca la barra de revelar, ↓ sobre ella voltea y hay
//       REVELA_MS de «revelando» en los que ↑ lo cancela (el set ya revelado: ↑ ↑ lo
//       oculta); ← → cambian de set.
//
// Con navigator.webdriver (Playwright) el clic de puntero sigue pasando: las pruebas de
// tools/browser pulsan botones para probar OTRA cosa; los gestos los prueba gestos.mjs.
(() => {
    const MANTENER = 600;      // ms pulsado para confirmar sin arrastrar
    const UMBRAL = 0.85;       // fracción del recorrido que confirma
    const MUERTO = 8;          // px que no cuentan como movimiento
    const BORDE = 24;          // px del borde izquierdo donde empieza «atrás»
    const ATRAS_PX = 90;       // px de arrastre que hacen «atrás»
    const SWIPE = 50;          // px de un deslizamiento sobre las cartas
    const REVELA_MS = 1000;    // ms de «revelando» que se pueden cancelar
    // Bajo Playwright el clic pasa, salvo que la prueba pida los gestos (gestos.mjs).
    const pruebas = () => !!navigator.webdriver && localStorage.getItem('piles.gestos') !== '1';
    let permitido = null;      // el botón que el propio gesto está pulsando

    const pulsar = b => { permitido = b; try { b.click(); } finally { permitido = null; } };
    const vibrar = ms => { try { navigator.vibrate?.(ms); } catch { /* */ } };

    // Clic de puntero (detail > 0) sobre un botón deslizable: no pasa.
    document.addEventListener('click', e => {
        const b = e.target.closest?.('button.desliza');
        if (!b || b === permitido || pruebas() || e.detail === 0) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        // El click nativo que llega tras soltar un gesto: se calla sin menear el pomo.
        if (Date.now() - (+b.dataset.gestoFin || 0) < 500) return;
        b.classList.remove('desliza-pista');
        void b.offsetWidth;
        b.classList.add('desliza-pista');    // menea el pomo: «arrástrame»
    }, true);

    // ── Deslizar para desbloquear ───────────────────────────────────────────
    // Grupos de opciones: se elige deslizando por encima y soltando sobre una (o tocándola).
    const GRUPOS = '.seg-group, .lang-pick, #setNav, #specSetNav';
    // Botones de solo icono: no caben pomo y texto; se confirman manteniendo pulsado.
    const esMini = b => b.matches('.profile-btn, #muteBtn') || [...b.textContent.trim()].length <= 2;

    function convertir(b) {
        if (b.classList.contains('desliza') || b.hasAttribute('data-toque') || b.closest('[data-sin-gestos]')) return;
        const grupo = b.closest(GRUPOS);
        if (grupo) { barrer(grupo); return; }
        // El pomo y el relleno son ::before / ::after (CSS, con --p): el código cambia el
        // textContent de varios botones y se llevaría por delante un hijo.
        b.classList.add('desliza');
        const mini = esMini(b);
        if (mini) b.classList.add('desliza-mini');
        let x0 = 0, y0 = 0, id = null, reloj = 0, horizontal = null;

        const poner = p => b.style.setProperty('--p', p.toFixed(3));
        const recorrido = () => Math.max(1, b.clientWidth - 2.2 * parseFloat(getComputedStyle(b).fontSize));
        const soltar = confirma => {
            clearTimeout(reloj);
            b.classList.remove('desliza-arrastra', 'desliza-mantiene');
            if (confirma || horizontal) b.dataset.gestoFin = Date.now();
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
        const fin = e => {
            if (e.pointerId !== id) return;
            id = null;
            const p = parseFloat(b.style.getPropertyValue('--p') || '0');
            soltar(horizontal === true && p >= UMBRAL);
        };
        b.addEventListener('pointerup', fin);
        b.addEventListener('pointercancel', e => { if (e.pointerId === id) { id = null; soltar(false); } });
    }

    /** El grupo entero es un control: al soltar, se pulsa la opción que queda debajo. */
    function barrer(g) {
        if (g.dataset.barre) return;
        g.dataset.barre = '1';
        g.classList.add('barre');
        let id = null, sobre = null;
        const debajo = e => {
            const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('button');
            return el && g.contains(el) && !el.disabled ? el : null;
        };
        const marcar = b => {
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
            if (e.detail > 0 && !pruebas() && e.target.closest('button') !== permitido) {
                e.preventDefault(); e.stopImmediatePropagation();
            }
        }, true);
    }

    const convertirTodo = raiz => raiz.querySelectorAll?.('button').forEach(convertir);

    // ── Borde izquierdo = atrás ─────────────────────────────────────────────
    function atras() {
        const b = document.querySelector('.screen.active .back-btn');
        if (b) { vibrar(10); pulsar(b); }
        return !!b;
    }
    // Una franja propia con touch-action: none (si no, el navegador se queda el arrastre
    // horizontal y manda pointercancel). Solo existe mientras hay un «Atrás» a la vista.
    let borde = null;
    const franja = document.createElement('div');
    franja.id = 'gestoBorde';
    franja.setAttribute('aria-hidden', 'true');
    franja.hidden = true;
    const flecha = document.createElement('div');
    flecha.id = 'gestoAtras';
    flecha.setAttribute('aria-hidden', 'true');
    flecha.textContent = '‹';
    const actualizarBorde = () => { franja.hidden = !document.querySelector('.screen.active .back-btn'); };
    franja.addEventListener('pointerdown', e => {
        borde = { id: e.pointerId, x: e.clientX, y: e.clientY };
        franja.setPointerCapture(e.pointerId);
    });
    franja.addEventListener('pointermove', e => {
        if (!borde || e.pointerId !== borde.id) return;
        if (Math.abs(e.clientY - borde.y) > 80) { borde = null; flecha.style.setProperty('--d', 0); return; }
        flecha.style.setProperty('--d', Math.min(1, Math.max(0, (e.clientX - borde.x) / ATRAS_PX)).toFixed(3));
    });
    franja.addEventListener('pointerup', e => {
        if (!borde || e.pointerId !== borde.id) return;
        const listo = e.clientX - borde.x >= ATRAS_PX;
        borde = null;
        flecha.style.setProperty('--d', 0);
        if (listo) atras();
    });
    franja.addEventListener('pointercancel', () => { borde = null; flecha.style.setProperty('--d', 0); });

    // ── Inicio: un pomo, tres destinos ──────────────────────────────────────
    function pomoInicio() {
        const acciones = document.querySelector('#homeScreen .home-actions');
        if (!acciones || document.getElementById('pomo3')) return;
        const boton = sel => acciones.querySelector(`button[onclick^="${sel}"]`);
        const destinos = { der: boton('quickMatch'), arr: boton("showScreen('hostScreen')"), izq: boton('openJoinScreen') };
        if (!destinos.der || !destinos.arr || !destinos.izq) return;
        Object.values(destinos).forEach(b => b.classList.add('solo-teclado'));   // siguen para el teclado
        const zona = document.createElement('div');
        zona.id = 'pomo3';
        zona.setAttribute('data-sin-gestos', '');
        const rotulo = (b, clase) => {
            const s = document.createElement('span');
            s.className = 'pomo3-rotulo ' + clase;
            s.textContent = b.textContent.trim();
            return s;
        };
        const centro = document.createElement('span');
        centro.className = 'pomo3-centro';
        centro.textContent = '⦿';
        zona.append(rotulo(destinos.arr, 'arr'), rotulo(destinos.izq, 'izq'), centro, rotulo(destinos.der, 'der'));
        acciones.prepend(zona);
        // Los rótulos siguen al idioma: se rehacen si cambia el texto de los botones.
        // (Se vigilan los botones, no `acciones`: los rótulos están dentro y se dispararía solo.)
        const rotular = new MutationObserver(() => {
            for (const k of ['der', 'arr', 'izq']) zona.querySelector('.' + k).textContent = destinos[k].textContent.trim();
        });
        Object.values(destinos).forEach(b => rotular.observe(b, { subtree: true, characterData: true, childList: true }));

        let ini = null;
        const LEJOS = 70;
        zona.addEventListener('pointerdown', e => {
            ini = { id: e.pointerId, x: e.clientX, y: e.clientY };
            zona.setPointerCapture(e.pointerId);
            zona.classList.add('activo');
        });
        zona.addEventListener('pointermove', e => {
            if (!ini || e.pointerId !== ini.id) return;
            let dx = e.clientX - ini.x, dy = e.clientY - ini.y;
            if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0;          // un solo eje
            dy = Math.min(0, dy);                                            // hacia abajo no hay nada
            const m = Math.min(LEJOS, Math.hypot(dx, dy));
            const k = m / (Math.hypot(dx, dy) || 1);
            centro.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
            zona.dataset.hacia = m < LEJOS * 0.4 ? '' : dx > 0 ? 'der' : dx < 0 ? 'izq' : 'arr';
            zona.classList.toggle('listo', m >= LEJOS);
        });
        const soltar = e => {
            if (!ini || e.pointerId !== ini.id) return;
            ini = null;
            const hacia = zona.classList.contains('listo') ? zona.dataset.hacia : '';
            zona.classList.remove('activo', 'listo');
            zona.dataset.hacia = '';
            centro.classList.add('vuelve');
            centro.style.transform = '';
            setTimeout(() => centro.classList.remove('vuelve'), 450);
            if (hacia) { vibrar(15); pulsar(destinos[hacia]); }
        };
        zona.addEventListener('pointerup', soltar);
        zona.addEventListener('pointercancel', soltar);
    }

    // ── Tus cartas: revelar / ocultar el set y cambiar de set ───────────────
    function gestosSet() {
        const cartas = document.getElementById('yourCards');
        if (!cartas || cartas.dataset.gestos) return;
        cartas.dataset.gestos = '1';
        const barra = document.createElement('div');
        barra.id = 'revelaBarra';
        barra.setAttribute('role', 'status');
        barra.setAttribute('aria-live', 'polite');
        cartas.after(barra);
        let paso = 0, sentido = 0, plazo = 0, cerrar = 0;   // paso 1: barra fuera; 2: revelando

        const estado = (clase, texto) => {
            barra.className = clase;
            barra.textContent = texto;
        };
        const recoger = () => {
            clearTimeout(cerrar); clearTimeout(plazo);
            paso = 0;
            cartas.classList.remove('volteando');
            estado('', '');
        };
        const flipped = () => typeof myFlippedSets !== 'undefined' && !!myFlippedSets[currentSetIndex];

        function gesto(dir) {               // dir: 1 abajo, -1 arriba
            if (paso === 2) {                // revelando: ↑ cancela
                if (dir === -1) { recoger(); estado('fuera cancelado', t('gest.cancelled')); cerrar = setTimeout(recoger, 900); }
                return;
            }
            const quiere = flipped() ? -1 : 1;   // revelar con ↓, ocultar con ↑
            if (dir !== quiere) { if (paso === 1) recoger(); return; }
            if (paso === 0) {
                paso = 1; sentido = dir;
                estado('fuera', t(dir === 1 ? 'gest.reveal1' : 'gest.hide1'));
                vibrar(8);
                cerrar = setTimeout(recoger, 3000);
                return;
            }
            clearTimeout(cerrar);
            if (sentido === -1) {            // ocultar: sin espera
                recoger();
                flipCurrentSet();
                return;
            }
            paso = 2;
            cartas.classList.add('volteando');
            estado('fuera revelando', t('gest.revealing'));
            vibrar(20);
            plazo = setTimeout(() => { recoger(); flipCurrentSet(); }, REVELA_MS);
        }

        let ini = null;
        // Con captura: el gesto acaba fuera de las cartas y el pointerup tiene que llegar aquí.
        cartas.addEventListener('pointerdown', e => {
            ini = { id: e.pointerId, x: e.clientX, y: e.clientY };
            try { cartas.setPointerCapture(e.pointerId); } catch { /* */ }
        });
        const fin = e => {
            if (!ini || e.pointerId !== ini.id) return;
            const dx = e.clientX - ini.x, dy = e.clientY - ini.y;
            ini = null;
            if (Math.abs(dy) >= SWIPE && Math.abs(dy) > Math.abs(dx) * 1.3) gesto(Math.sign(dy));
            else if (Math.abs(dx) >= SWIPE && Math.abs(dx) > Math.abs(dy) * 1.3 && typeof switchSet === 'function') {
                const n = typeof allSets !== 'undefined' ? allSets.length : 0;
                const i = currentSetIndex - Math.sign(dx);
                if (i >= 0 && i < n) { recoger(); switchSet(i); vibrar(8); }
            }
        };
        cartas.addEventListener('pointerup', fin);
        cartas.addEventListener('pointercancel', () => { ini = null; });
        // La barra también recibe el segundo ↓ / ↑.
        let ib = null;
        barra.addEventListener('pointerdown', e => {
            ib = { id: e.pointerId, y: e.clientY };
            try { barra.setPointerCapture(e.pointerId); } catch { /* */ }
        });
        barra.addEventListener('pointerup', e => {
            if (!ib || e.pointerId !== ib.id) return;
            const dy = e.clientY - ib.y;
            ib = null;
            if (Math.abs(dy) >= SWIPE * 0.6) gesto(Math.sign(dy));
        });
    }

    function iniciar() {
        document.body.append(franja, flecha);
        pomoInicio();
        gestosSet();
        convertirTodo(document);
        actualizarBorde();
        new MutationObserver(ms => ms.forEach(m => {
            if (m.type === 'attributes') { if (m.target.classList?.contains('screen')) actualizarBorde(); return; }
            m.addedNodes.forEach(n => {
                if (n.nodeType !== 1) return;
                if (n.tagName === 'BUTTON') convertir(n); else convertirTodo(n);
            });
        })).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();
