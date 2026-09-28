// agapornis-ui · avisos. agToast({ kind, title, message, duration })
//   kind: 'info' | 'success' | 'warning' | 'error'   (por defecto 'info')
//   duration: ms; por defecto 4500 (6500 para 'error'); 0 = hasta que se cierre.
// Clic en el aviso lo cierra. El texto se pone con textContent: los mensajes
// traen nombres de jugadores y respuestas del servidor, nunca HTML.
(function () {
  const ICONS = {
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    success: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.5 2.5L16 9.5"/>',
    warning: '<path d="M12 4 2.8 19.5h18.4Z"/><path d="M12 10v4M12 17h.01"/>',
    error: '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>',
  };

  function stack() {
    let el = document.querySelector('.ag-toasts');
    if (!el) {
      el = document.createElement('div');
      el.className = 'ag-toasts';
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    return el;
  }

  function close(toast) {
    if (toast.classList.contains('is-leaving')) return;
    toast.classList.add('is-leaving');
    const done = () => toast.remove();
    toast.addEventListener('animationend', done, { once: true });
    setTimeout(done, 400); // por si reduced-motion o la animación no dispara
  }

  window.agToast = function ({ kind = 'info', title = '', message = '', duration } = {}) {
    if (!ICONS[kind]) kind = 'info';
    const toast = document.createElement('div');
    toast.className = 'ag-toast';
    toast.dataset.kind = kind;
    if (kind === 'error' || kind === 'warning') toast.setAttribute('role', 'alert');

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '2');
    icon.setAttribute('stroke-linecap', 'round');
    icon.setAttribute('stroke-linejoin', 'round');
    icon.setAttribute('aria-hidden', 'true');
    icon.classList.add('ag-toast-icon');
    icon.innerHTML = ICONS[kind];
    toast.appendChild(icon);

    if (title) {
      const t = document.createElement('div');
      t.className = 'ag-toast-title';
      t.textContent = title;
      toast.appendChild(t);
    }
    const x = document.createElement('button');
    x.className = 'ag-toast-close';
    x.type = 'button';
    x.setAttribute('aria-label', 'Cerrar aviso');
    x.textContent = '×';
    toast.appendChild(x);
    if (message) {
      const m = document.createElement('div');
      m.className = 'ag-toast-msg';
      m.textContent = message;
      toast.appendChild(m);
    }

    toast.addEventListener('click', () => close(toast));
    const box = stack();
    box.appendChild(toast);
    // No acumular: como mucho 3 a la vista, se va el más viejo.
    const vivos = [...box.querySelectorAll('.ag-toast:not(.is-leaving)')];
    if (vivos.length > 3) close(vivos[0]);

    const ms = duration ?? (kind === 'error' ? 6500 : 4500);
    if (ms > 0) setTimeout(() => close(toast), ms);
    return toast;
  };
})();
