// agapornis-ui · contador de diales.
//
//   agDial(el, { from, to, skin, label, onStep }) → Promise (se resuelve al asentarse)
//     skin:   'fun' (por defecto) | 'glory'
//     label:  texto encima; por defecto "For fun" / "For glory"
//     onStep: se llama cada vez que cambia el número entero mostrado (para un clac)
//   Con from === to se pinta quieto y sin pastilla.
//
// Cada dial es un tambor 3D con los 10 dígitos. Solo se anima UN valor; los
// tambores se derivan de él con el acarreo de un cuentakilómetros de verdad:
// cada tambor se mueve solo mientras el de su derecha pasa de 9 a 0.
// Acarreo tomado de tactile-odometer (MIT, Ciprian Titire):
// https://github.com/cipriantitire/tactile-odometer
//
// requestAnimationFrame no lo para el bloque de movimiento reducido de
// motion.css, así que se mira aquí: con movimiento reducido, valor final y ya.
(function () {
  const REDUCED = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const FACE_DEG = 36;

  /** Posición continua de cada tambor (unidades primero) para el valor v. */
  function drums(v, count) {
    const out = [];
    let below = ((v % 10) + 10) % 10;
    out.push(below);
    for (let k = 1; k < count; k++) {
      const digit = Math.floor(v / 10 ** k) % 10;
      below = digit + Math.min(1, Math.max(0, below - 9));
      out.push(below);
    }
    return out;
  }

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  // Sale rápido, asienta pasándose un pelo y vuelve: un muelle.
  const backOut = (t, s = 0.9) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;
  const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

  /** Curva de cada piel: progreso 0..1 → valor. */
  const SKINS = {
    fun: {
      label: 'For fun',
      duration: d => clamp(1100 + 25 * d, 1100, 2400),
      value: (p, from, to) => from + (to - from) * backOut(p),
    },
    // Le cuesta girar: un arranque casi quieto, luego a trinquete —cada punto
    // es un golpe que se acomoda— y cada vez más despacio, como una rueda de
    // piedra que se va frenando.
    glory: {
      label: 'For glory',
      duration: d => clamp(1800 + 45 * d, 1800, 3400),
      value: (p, from, to) => {
        const d = Math.abs(to - from);
        const dir = Math.sign(to - from);
        const ARRANQUE = 0.16;
        if (p < ARRANQUE) return from + dir * 0.08 * Math.sin((p / ARRANQUE) * Math.PI / 2);
        const q = 1 - (1 - (p - ARRANQUE) / (1 - ARRANQUE)) ** 2.2; // frenando
        const pasos = q * d;
        const hechos = Math.floor(pasos);
        const tramo = pasos - hechos;
        // Dentro de cada paso: quieto casi todo el tramo y un golpe al final.
        const golpe = tramo < 0.55 ? 0 : easeInOut((tramo - 0.55) / 0.45);
        return from + dir * Math.min(d, hechos + golpe);
      },
    },
  };

  function build(el, digits, skinName, label) {
    el.textContent = '';
    el.classList.add('ag-dial');
    el.dataset.skin = skinName;
    const lab = document.createElement('div');
    lab.className = 'ag-dial-label';
    lab.textContent = label;
    const frame = document.createElement('div');
    frame.className = 'ag-dial-frame';
    frame.setAttribute('aria-hidden', 'true');
    const cols = [];
    for (let i = 0; i < digits; i++) {
      const win = document.createElement('div');
      win.className = 'ag-dial-window';
      const drum = document.createElement('div');
      drum.className = 'ag-dial-drum';
      for (let n = 0; n < 10; n++) {
        const face = document.createElement('span');
        face.className = 'ag-dial-face';
        face.textContent = String(n);
        drum.appendChild(face);
      }
      win.appendChild(drum);
      frame.appendChild(win);
      cols.unshift(drum); // cols[0] = unidades
    }
    const delta = document.createElement('div');
    delta.className = 'ag-dial-delta';
    delta.setAttribute('aria-live', 'polite');
    el.append(lab, frame, delta);
    return { frame, cols, delta };
  }

  // El cilindro se proyecta en 2D: cada cara baja r·sen θ, se aplasta cos θ y
  // se apaga hacia los bordes. Con 3D de verdad (rotateX + preserve-3d) Chrome
  // dejaba de pintar la cara del 9 cuando asomaba encima del 0, y ni cambiar
  // el ángulo ni el orden lo arreglaba; en 2D no hay nada que ordenar.
  function paint(cols, v) {
    const pos = drums(v, cols.length);
    cols.forEach((drum, i) => {
      [...drum.children].forEach((face, k) => {
        let a = ((k - pos[i]) * FACE_DEG) % 360;
        if (a > 180) a -= 360;
        if (a <= -180) a += 360;
        if (Math.abs(a) >= 90) { face.style.visibility = 'hidden'; return; }
        const rad = (a * Math.PI) / 180;
        const c = Math.cos(rad);
        face.style.visibility = '';
        face.style.transform = `translateY(calc(var(--r) * ${Math.sin(rad).toFixed(4)})) scaleY(${c.toFixed(4)})`;
        face.style.opacity = (c ** 1.6).toFixed(3);
      });
    });
  }

  function showDelta(node, from, to) {
    const d = to - from;
    node.textContent = d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '±0';
    node.classList.toggle('is-up', d > 0);
    node.classList.toggle('is-down', d < 0);
    node.classList.add('is-shown');
  }

  // Golpe final de glory: sacude el marco y suelta chispas de bronce.
  function thud(frame) {
    frame.animate(
      [
        { transform: 'translate(0,0)' },
        { transform: 'translate(-3px,2px)' },
        { transform: 'translate(3px,-1px)' },
        { transform: 'translate(-2px,1px)' },
        { transform: 'translate(0,0)' },
      ],
      { duration: 380, easing: 'cubic-bezier(.36,.07,.19,.97)' },
    );
    const r = frame.getBoundingClientRect();
    for (let i = 0; i < 12; i++) {
      const s = document.createElement('i');
      s.className = 'ag-dial-spark';
      s.style.left = `${Math.random() * r.width}px`;
      s.style.top = `${r.height - 4}px`;
      frame.appendChild(s);
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const dist = 24 + Math.random() * 40;
      s.animate(
        [
          { transform: 'translate(0,0) scale(1)', opacity: 1 },
          { transform: `translate(${Math.cos(a) * dist}px, ${Math.sin(a) * dist}px) scale(.3)`, opacity: 0 },
        ],
        { duration: 520 + Math.random() * 260, easing: 'cubic-bezier(.2,.7,.3,1)' },
      ).onfinish = () => s.remove();
    }
  }

  // Asentado de fun: un anillo sage que se abre y se apaga.
  function glow(frame) {
    frame.animate(
      [
        { boxShadow: '0 0 0 0 rgb(169 182 137 / 55%)' },
        { boxShadow: '0 0 0 10px rgb(169 182 137 / 0%)' },
      ],
      { duration: 600, easing: 'cubic-bezier(.16,1,.3,1)' },
    );
  }

  window.agDial = function (el, { from = 0, to = from, skin = 'fun', label, onStep } = {}) {
    const s = SKINS[skin] ? skin : 'fun';
    const def = SKINS[s];
    from = Math.round(from);
    to = Math.round(to);
    const digits = Math.max(4, String(Math.max(Math.abs(from), Math.abs(to))).length);
    const { frame, cols, delta } = build(el, digits, s, label ?? def.label);
    const d = to - from;
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', `${label ?? def.label}: ${to}${d ? `, ${d > 0 ? '+' : '−'}${Math.abs(d)}` : ''}`);

    if (d === 0 || REDUCED?.matches) {
      paint(cols, to);
      if (d !== 0) showDelta(delta, from, to);
      return Promise.resolve();
    }

    paint(cols, from);
    const dur = def.duration(Math.abs(d));
    return new Promise(resolve => {
      let t0 = null;
      let last = from;
      const tick = now => {
        if (t0 === null) t0 = now;
        const p = Math.min(1, (now - t0) / dur);
        const v = p >= 1 ? to : def.value(p, from, to);
        paint(cols, v);
        const entero = Math.round(v);
        if (entero !== last) { last = entero; onStep?.(entero); }
        if (p < 1) return requestAnimationFrame(tick);
        showDelta(delta, from, to);
        (s === 'glory' ? thud : glow)(frame);
        resolve();
      };
      requestAnimationFrame(tick);
    });
  };
})();
