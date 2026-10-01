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

  function build(el, digits, skinName, label, reserveRank, crownRoom) {
    el.textContent = '';
    el.classList.add('ag-dial');
    el.classList.toggle('has-rank-change', reserveRank);
    el.classList.toggle('has-crown-room', crownRoom);
    el.dataset.skin = skinName;
    const lab = document.createElement('div');
    lab.className = 'ag-dial-label';
    const labText = document.createElement('span');
    labText.textContent = label;
    const rankName = document.createElement('span');
    rankName.className = 'ag-dial-rankname';
    lab.append(labText, rankName);
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
    const pill = document.createElement('div');
    pill.className = 'ag-dial-rank';
    pill.setAttribute('aria-live', 'polite');
    el.append(lab, frame, delta, pill);
    return { frame, cols, delta, pill, rankName };
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

  const fxDe = new WeakMap();   // el → efectos de partículas de su último dial

  // skin y pool son lo mismo (las clasificaciones se llaman igual que las pieles).
  window.agDial = function (el, { from = 0, to = from, skin, pool, label, top3Before = false, top3After = top3Before, onStep, onRank } = {}) {
    const s = SKINS[skin ?? pool] ? (skin ?? pool) : 'fun';
    const def = SKINS[s];
    from = Math.round(from);
    to = Math.round(to);
    const digits = Math.max(4, String(Math.max(Math.abs(from), Math.abs(to))).length);
    const d = to - from;

    // Los rangos son opcionales: sin rank.js el dial se ve y se mueve como antes.
    const FX = window.agRankFx;
    const rankAt = (v, t3) => window.agRank?.(v, { pool: s, top3: t3 }) ?? null;
    let rank = rankAt(from, top3Before);
    const rankEnd = rankAt(to, top3After);
    const cambia = !!rank && rank.index !== rankEnd.index;

    fxDe.get(el)?.destroy();
    const { frame, cols, delta, pill, rankName } = build(el, digits, s, label ?? def.label, cambia,
      s === 'glory' && !!rank && (rank.top3 || rankEnd.top3));
    const nombreRango = r => (r ? ` · ${r.name}` : '');
    el.setAttribute('role', 'img');
    const aria = r => `${label ?? def.label}${nombreRango(r)}: ${to}${d ? `, ${d > 0 ? '+' : '−'}${Math.abs(d)}` : ''}`;
    el.setAttribute('aria-label', aria(rank));

    let fx = null;
    // La corona es de glory; el Payaso de fun lleva su nariz roja (rank.css).
    const corona = r => s === 'glory' && r.top3;
    function applyRank(next) {
      rank = next;
      el.dataset.rank = next.id;
      rankName.textContent = nombreRango(next);
      fx?.setRank(next);
    }
    if (rank) {
      applyRank(rank);
      fx = FX?.attach(frame, rank) ?? null;
      if (fx) fxDe.set(el, fx);
      if (corona(rank)) FX?.crown(frame, false);
    }

    /** Cambio de rango (hacia arriba o abajo): pastilla, aviso a quien escucha y el golpe visual. */
    function rankChanged(next) {
      const prev = rank;
      const up = next.index > prev.index;
      rank = next;   // el rango "de verdad" cambia ya; lo visual (applyRank) llega en unos ms
      pill.textContent = `${up ? '▲ Asciendes' : '▼ Desciendes'} · ${next.name}`;
      pill.className = `ag-dial-rank is-shown ${up ? 'is-up' : 'is-down'}`;
      el.setAttribute('aria-label', aria(next));
      onRank?.({ dir: up ? 'up' : 'down', from: prev, to: next, skin: s });
      if (REDUCED?.matches || !FX) {
        applyRank(next);
        if (corona(next)) FX?.crown(frame, false); else FX?.uncrown(frame);
        return;
      }
      if (up) {
        FX.flash(frame);
        FX.ring(frame);
        setTimeout(() => applyRank(next), 110);   // el material cambia bajo el destello
        fx?.burst(next);
        if (corona(next)) FX.crown(frame, true);
      } else {
        if (prev.top3) FX.uncrown(frame);
        if (s === 'glory') {
          FX.crack(frame);
          frame.animate(
            [{ filter: 'none' }, { filter: 'saturate(.25) brightness(.65)', offset: 0.3 }, { filter: 'saturate(.25) brightness(.65)', offset: 0.55 }, { filter: 'none' }],
            { duration: 1200 },
          );
          setTimeout(() => { applyRank(next); fx?.shatter(prev); }, 380);
        } else {
          FX.deflate(frame, 800);
          setTimeout(() => applyRank(next), 320);
        }
      }
    }

    if (d === 0 || REDUCED?.matches) {
      paint(cols, to);
      if (d !== 0) showDelta(delta, from, to);
      if (rank && rankEnd.index !== rank.index) rankChanged(rankEnd);
      return Promise.resolve();
    }

    paint(cols, from);
    const dur = def.duration(Math.abs(d));
    const lo = Math.min(from, to), hi = Math.max(from, to);
    return new Promise(resolve => {
      let t0 = null;
      let last = from;
      const tick = now => {
        if (t0 === null) t0 = now;
        const p = Math.min(1, (now - t0) / dur);
        const v = p >= 1 ? to : def.value(p, from, to);
        paint(cols, v);
        const entero = Math.round(v);
        if (entero !== last) {
          last = entero;
          onStep?.(entero);
          // Cruzar un umbral durante el giro. El valor se acota a [from, to] para que
          // el pasarse un pelo del muelle de fun no cuente como subir y volver a bajar.
          if (rank) {
            const cur = rankAt(Math.min(hi, Math.max(lo, entero)), top3Before);
            if (cur.index !== rank.index) rankChanged(cur);
          }
        }
        if (p < 1) return requestAnimationFrame(tick);
        showDelta(delta, from, to);
        (s === 'glory' ? thud : glow)(frame);
        // El Top 3 se decide por posición, no por valor: se nota al asentarse.
        if (rank && rankEnd.index !== rank.index) rankChanged(rankEnd);
        resolve();
      };
      requestAnimationFrame(tick);
    });
  };
})();
