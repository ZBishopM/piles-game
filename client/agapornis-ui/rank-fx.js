// agapornis-ui · efectos de los rangos: partículas (solo For glory) y los
// golpes de ascenso y descenso. Los usa dial.js; no hace falta llamarlos a mano.
//
//   agRankFx.attach(frame, rank) → { setRank, burst, shatter, destroy } | null
//   agRankFx.flash(frame) · .ring(frame) · .crack(frame) · .deflate(frame, ms) · .crown(frame, animar)
//
// Partículas: un <canvas> por dial, dentro del marco y un poco más grande para
// que salgan afuera. Un solo bucle de requestAnimationFrame para todos los
// diales de la página; se detiene si ninguno se ve (IntersectionObserver) o si
// la pestaña está oculta, y suelta a los diales que ya no están en el documento.
// Tope de partículas por dial: MAX. Con movimiento reducido no se crea nada.
(function () {
  const REDUCED = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const M = 18;          // margen del canvas alrededor del marco (px)
  const MAX = 110;       // partículas vivas por dial, ambiente y ráfagas juntas
  const TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = list => list[(Math.random() * list.length) | 0];

  // Ambiente de cada rango de glory (índice = agRank(...).index): cuántas
  // partículas, de qué clase y de qué colores. Crece con el rango, de unos
  // pocos copos de óxido al torbellino del Top 3.
  const AMBIENT = [
    { n: 3,  kind: 'flake', colors: ['#9a4a1e', '#7a3a16', '#b8601f'], size: [2, 4.5] },
    { n: 6,  kind: 'ember', colors: ['#ffb066', '#e0823a', '#ffd9a8'], size: [1.2, 2.6] },
    { n: 10, kind: 'glint', colors: ['#ffffff', '#dfe8f5', '#b9c6d8'], size: [2, 5] },
    { n: 14, kind: 'glint', colors: ['#fff2b0', '#ffd76a', '#ffffff'], size: [2, 6] },
    { n: 18, kind: 'glint', colors: ['#e8f7ff', '#9fd8ff', '#ffffff'], size: [2, 6] },
    { n: 24, kind: 'prism', colors: ['#7fd0ff', '#ffffff', '#9aa8ff', '#7fffe0'], size: [2, 7] },
    { n: 30, kind: 'glint', colors: ['#fff6c0', '#ffe066', '#ffffff', '#ffc928'], size: [2.5, 7] },
    { n: 36, kind: 'glint', colors: ['#ffe39a', '#ff9ec7', '#ffffff', '#ffc2d9'], size: [2.5, 7.5] },
    { n: 44, orbit: 8, kind: 'glint', colors: ['#ffe066', '#ff7ac0', '#6dffa8', '#ffffff'], size: [2.5, 8] },
  ];

  // ── Dibujo ────────────────────────────────────────────────────────────
  function star(ctx, x, y, s) {
    const k = s * 0.18;
    ctx.beginPath();
    ctx.moveTo(x, y - s); ctx.lineTo(x + k, y - k); ctx.lineTo(x + s, y); ctx.lineTo(x + k, y + k);
    ctx.lineTo(x, y + s); ctx.lineTo(x - k, y + k); ctx.lineTo(x - s, y); ctx.lineTo(x - k, y - k);
    ctx.closePath();
    ctx.fill();
  }
  function poly(ctx, x, y, s, rot, pts) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const a = rot + pts[i][0], r = s * pts[i][1];
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  const SHARD = [[0, 1], [2.1, 0.7], [3.6, 1.1], [5.0, 0.6]];

  function draw(ctx, p, a) {
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    ctx.fillStyle = p.color;
    switch (p.kind) {
      case 'flake':
        ctx.globalCompositeOperation = 'source-over';
        poly(ctx, p.x, p.y, p.size, p.rot, SHARD); ctx.fill();
        break;
      case 'ember':
        ctx.globalCompositeOperation = 'lighter';
        ctx.shadowColor = p.color; ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
        ctx.shadowBlur = 0;
        break;
      case 'shard':
        ctx.globalCompositeOperation = 'source-over';
        poly(ctx, p.x, p.y, p.size, p.rot, SHARD); ctx.fill();
        ctx.globalAlpha *= 0.7; ctx.strokeStyle = '#120b06'; ctx.lineWidth = 1; ctx.stroke();
        break;
      default: {                       // glint, prism, orbit
        ctx.globalCompositeOperation = 'lighter';
        const s = p.size * (0.55 + 0.45 * a);
        star(ctx, p.x, p.y, s);
        ctx.globalAlpha *= 0.55;
        ctx.beginPath(); ctx.arc(p.x, p.y, s * 0.42, 0, TAU); ctx.fill();
        if (p.kind === 'prism' && a > 0.6) {          // un destello cruzado de otro color
          ctx.fillStyle = p.color2;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.PI / 4);
          star(ctx, 0, 0, s * 0.7);
          ctx.restore();
        }
      }
    }
  }

  // ── Sistema de un dial ────────────────────────────────────────────────
  const systems = new Set();
  let raf = 0;
  let last = 0;

  function loop(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    let any = false;
    for (const s of systems) {
      if (!s.canvas.isConnected) { s.destroy(); continue; }
      if (!s.visible) continue;
      s.step(dt);
      any = true;
    }
    if (any) raf = requestAnimationFrame(loop);
  }
  function wake() {
    if (raf || !systems.size || document.visibilityState !== 'visible') return;
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }
  document.addEventListener('visibilitychange', wake);

  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => {
        for (const e of entries) for (const s of systems) if (s.frame === e.target) s.visible = e.isIntersecting;
        wake();
      })
    : null;

  function attach(frame, rank) {
    if (REDUCED?.matches || !rank || !AMBIENT[rank.index] || rank.pool !== 'glory') return null;
    const canvas = document.createElement('canvas');
    canvas.className = 'ag-rank-fx';
    frame.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) { canvas.remove(); return null; }

    const s = { canvas, frame, visible: true, frameRect: { w: 0, h: 0 }, cfg: null, parts: [] };

    function sync() {
      const w = frame.offsetWidth, h = frame.offsetHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      s.frameRect = { w, h };
      canvas.style.left = `${-M - frame.clientLeft}px`;
      canvas.style.top = `${-M - frame.clientTop}px`;
      canvas.style.width = `${w + 2 * M}px`;
      canvas.style.height = `${h + 2 * M}px`;
      canvas.width = Math.round((w + 2 * M) * dpr);
      canvas.height = Math.round((h + 2 * M) * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const ro = 'ResizeObserver' in window ? new ResizeObserver(sync) : null;
    ro?.observe(frame);
    io?.observe(frame);
    sync();

    /** Perímetro del marco, t en 0..1, para los que giran alrededor. */
    function onPerimeter(t) {
      const { w, h } = s.frameRect;
      const total = 2 * (w + h);
      let d = (((t % 1) + 1) % 1) * total;
      if (d < w) return [M + d, M];
      d -= w; if (d < h) return [M + w, M + d];
      d -= h; if (d < w) return [M + w - d, M + h];
      d -= w; return [M, M + h - d];
    }

    function ambient(cfg, startAged) {
      const { w, h } = s.frameRect;
      const p = { kind: cfg.kind, amb: true, color: pick(cfg.colors), color2: pick(cfg.colors), size: rnd(...cfg.size), age: 0, rot: rnd(0, TAU), vr: rnd(-1.5, 1.5), ph: rnd(0, TAU) };
      switch (cfg.kind) {
        case 'flake':
          p.x = M + rnd(0.05, 0.95) * w; p.y = M + rnd(0.05, 0.55) * h;
          p.vx = rnd(-5, 5); p.vy = rnd(10, 22); p.life = rnd(2.6, 4.2);
          break;
        case 'ember':
          p.x = M + rnd(0.05, 0.95) * w; p.y = M + rnd(0.55, 1.0) * h;
          p.vx = 0; p.vy = -rnd(14, 30); p.life = rnd(1.6, 2.8);
          break;
        default:
          p.x = M + rnd(-0.03, 1.03) * w; p.y = M + rnd(-0.12, 1.12) * h;
          p.vx = rnd(-4, 4); p.vy = rnd(-4, 4); p.life = rnd(0.9, 2.0);
      }
      if (startAged) p.age = rnd(0, p.life);
      return p;
    }

    s.setRank = rank => {
      s.cfg = rank.pool === 'glory' ? AMBIENT[rank.index] : null;
      s.parts = s.parts.filter(p => !p.amb && !p.orbit);   // las ráfagas en vuelo se quedan
      if (!s.cfg) return;
      const n = s.cfg.n - (s.cfg.orbit || 0);
      for (let i = 0; i < n; i++) s.parts.push(ambient(s.cfg, true));
      for (let i = 0; i < (s.cfg.orbit || 0); i++) {
        s.parts.push({ kind: 'glint', orbit: true, t: i / s.cfg.orbit, sp: rnd(0.1, 0.17), color: pick(s.cfg.colors), size: rnd(...s.cfg.size), age: 0, life: 1, x: 0, y: 0 });
      }
    };

    /** Ráfaga de ascenso: destellos que salen del centro hacia los lados. */
    s.burst = rank => {
      const cfg = AMBIENT[rank.index];
      const { w, h } = s.frameRect;
      for (let i = 0; i < 36 && s.parts.length < MAX; i++) {
        const x = M + rnd(0.1, 0.9) * w, y = M + h / 2 + rnd(-6, 6);
        const ang = Math.atan2(y - (M + h / 2), x - (M + w / 2)) + rnd(-0.9, 0.9) - 0.35;
        const sp = rnd(70, 230);
        s.parts.push({ kind: 'glint', burst: true, x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 30, drag: 1.8, color: pick(cfg.colors), size: rnd(3, 8), age: 0, life: rnd(0.7, 1.3) });
      }
    };

    /** Esquirlas del descenso: caen desde la grieta con los colores del rango que se pierde. */
    s.shatter = rank => {
      const cfg = AMBIENT[rank.index];
      const { w, h } = s.frameRect;
      for (let i = 0; i < 16 && s.parts.length < MAX; i++) {
        s.parts.push({ kind: 'shard', burst: true, x: M + rnd(0.3, 0.7) * w, y: M + rnd(0.2, 0.8) * h, vx: rnd(-110, 110), vy: rnd(-90, 30), g: 560, color: pick(cfg.colors), size: rnd(2.5, 6), rot: rnd(0, TAU), vr: rnd(-8, 8), age: 0, life: rnd(1.1, 1.8) });
      }
    };

    s.step = dt => {
      const { w, h } = s.frameRect;
      ctx.clearRect(0, 0, w + 2 * M, h + 2 * M);
      let ambientAlive = 0;
      for (let i = s.parts.length - 1; i >= 0; i--) {
        const p = s.parts[i];
        p.age += dt;
        if (!p.orbit && p.age >= p.life) { s.parts[i] = s.parts[s.parts.length - 1]; s.parts.pop(); continue; }
        if (p.amb) ambientAlive++;
        let a;
        if (p.orbit) {
          p.t += p.sp * dt;
          // Estela: cuatro posiciones anteriores, cada vez más tenues.
          for (let k = 3; k >= 1; k--) {
            const [tx, ty] = onPerimeter(p.t - k * 0.006);
            draw(ctx, { ...p, x: tx, y: ty, size: p.size * (1 - k * 0.2) }, 0.5 - k * 0.1);
          }
          [p.x, p.y] = onPerimeter(p.t);
          a = 0.9;
        } else {
          if (p.drag) { p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt; }
          if (p.g) p.vy += p.g * dt;
          if (p.kind === 'ember') p.vx = Math.sin(p.age * 3 + p.ph) * 8;
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.vr) p.rot += p.vr * dt;
          const u = p.age / p.life;
          a = p.kind === 'flake' || p.kind === 'shard' ? 0.85 * (1 - u) ** 0.7
            : Math.sin(Math.PI * u) ** 1.4;   // brilla y se apaga
        }
        draw(ctx, p, a);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      // Reponer el ambiente que se apagó.
      if (s.cfg) {
        const want = s.cfg.n - (s.cfg.orbit || 0);
        for (let i = ambientAlive; i < want && s.parts.length < MAX; i++) s.parts.push(ambient(s.cfg, false));
      }
    };

    s.destroy = () => {
      systems.delete(s);
      ro?.disconnect();
      io?.unobserve(frame);
      canvas.remove();
    };

    s.setRank(rank);
    systems.add(s);
    wake();
    return {
      setRank: r => { s.setRank(r); wake(); },
      burst: r => { s.burst(r); wake(); },
      shatter: r => { s.shatter(r); wake(); },
      destroy: s.destroy,
      // Para pruebas: partículas vivas.
      get count() { return s.parts.length; },
    };
  }

  // ── Golpes de DOM (Web Animations) ────────────────────────────────────
  function overlay(frame, cls, tag = 'i') {
    const e = document.createElement(tag);
    e.className = cls;
    frame.appendChild(e);
    return e;
  }

  /** Destello blanco que tapa el cambio de material. */
  function flash(frame) {
    const e = overlay(frame, 'ag-rank-flash');
    e.animate([{ opacity: 0 }, { opacity: 0.95, offset: 0.25 }, { opacity: 0 }], { duration: 560, easing: 'ease-out' }).onfinish = () => e.remove();
  }

  /** Onda que sale del marco. */
  function ring(frame) {
    const e = overlay(frame, 'ag-rank-ring');
    e.animate(
      [{ opacity: 0.9, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.22, 1.7)' }],
      { duration: 800, easing: 'cubic-bezier(.16,1,.3,1)' },
    ).onfinish = () => e.remove();
  }

  /** Grieta que se dibuja de arriba abajo y se desvanece. */
  function crack(frame) {
    const w = frame.offsetWidth, h = frame.offsetHeight;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'ag-rank-crack');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    let x = w * rnd(0.35, 0.65), y = 0;
    let d = `M ${x.toFixed(1)} 0`;
    const steps = 7;
    for (let i = 1; i <= steps; i++) {
      x += rnd(-w * 0.07, w * 0.07); y = (h * i) / steps;
      d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
      if (i === 3) d += ` M ${x.toFixed(1)} ${y.toFixed(1)} l ${rnd(-w * 0.14, w * 0.14).toFixed(1)} ${rnd(h * 0.08, h * 0.2).toFixed(1)} M ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
    frame.appendChild(svg);
    const len = path.getTotalLength();
    path.style.strokeDasharray = `${len}`;
    path.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 340, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'both' });
    svg.animate([{ opacity: 1 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }], { duration: 1900, fill: 'both' }).onfinish = () => svg.remove();
  }

  /** Descenso en For fun: el dial se desinfla como un juguete. */
  function deflate(frame, ms = 700) {
    frame.animate(
      [
        { transform: 'scale(1,1)', filter: 'none' },
        { transform: 'scale(1.05,1.12)', offset: 0.18 },
        { transform: 'scale(.94,.74) translateY(12%)', filter: 'saturate(.3) brightness(.8)', offset: 0.45 },
        { transform: 'scale(1.02,.92) translateY(3%)', offset: 0.7 },
        { transform: 'scale(1,1)', filter: 'none' },
      ],
      { duration: ms, easing: 'cubic-bezier(.3,.7,.3,1)' },
    );
  }

  const CROWN_SVG = '<svg viewBox="0 0 48 34" width="48" height="34" aria-hidden="true">'
    + '<defs><linearGradient id="agcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3a8"/><stop offset=".55" stop-color="#ffc928"/><stop offset="1" stop-color="#c98a00"/></linearGradient></defs>'
    + '<path d="M4 28 L2 8 L14 18 L24 3 L34 18 L46 8 L44 28 Z" fill="url(#agcg)" stroke="#7a4f00" stroke-width="1.4" stroke-linejoin="round"/>'
    + '<rect x="4" y="27" width="40" height="5" rx="1.5" fill="#e0a010" stroke="#7a4f00" stroke-width="1.2"/>'
    + '<circle cx="24" cy="3.5" r="2.6" fill="#ff7ac0"/><circle cx="2" cy="8" r="2.2" fill="#6dffa8"/><circle cx="46" cy="8" r="2.2" fill="#6dffa8"/>'
    + '</svg>';

  /** La corona del Top 3: cae sobre el marco (o ya está puesta, sin animar). */
  function crown(frame, animar) {
    if (frame.querySelector('.ag-rank-crown')) return;
    const e = overlay(frame, 'ag-rank-crown', 'div');
    e.innerHTML = CROWN_SVG;
    if (animar && !REDUCED?.matches) {
      e.animate(
        [
          { transform: 'translateY(-46px) scale(1.7) rotate(-12deg)', opacity: 0 },
          { transform: 'translateY(0) scale(1) rotate(0)', opacity: 1, offset: 0.62 },
          { transform: 'translateY(-5px) scale(1.04)', offset: 0.8 },
          { transform: 'translateY(0) scale(1)', opacity: 1 },
        ],
        { duration: 760, easing: 'cubic-bezier(.3,.7,.3,1)' },
      );
    }
  }
  function uncrown(frame) {
    const e = frame.querySelector('.ag-rank-crown');
    if (!e) return;
    if (REDUCED?.matches) return e.remove();
    e.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(24px) rotate(25deg)', opacity: 0 }], { duration: 480, easing: 'ease-in' }).onfinish = () => e.remove();
  }

  window.agRankFx = { attach, flash, ring, crack, deflate, crown, uncrown, AMBIENT, MAX };
})();
