// i18n de Piles: es (base), en, zh (chino simplificado). Sin librerías.
//
// CÓMO SE USA
//   t('clave', { n: 3, nick })   texto del idioma activo; {x} se sustituye. Si falta en
//                                el idioma activo cae a español; si falta en todos
//                                devuelve la clave (y avisa por consola).
//   Plurales: el valor de un idioma puede ser { one, other } y se elige con vars.n.
//   HTML estático:  data-i18n="clave"            -> textContent
//                   data-i18n-html="clave"       -> innerHTML (SOLO textos del diccionario,
//                                                   jamás datos de usuario)
//                   data-i18n-attr="aria-label:clave;title:otra;placeholder:otra"
//   Textos con datos de usuario (apodos): se arma con t() y se inserta con textContent,
//   o se pasa por esc(); nunca se concatenan en innerHTML sin escapar.
//   <div data-lang-picker></div>   se rellena con los botones ES / EN / 中文.
//
// IDIOMA: localStorage 'piles.lang' -> navigator.language (zh*->zh, en*->en) -> es.
// Cambiarlo RECARGA la página: la sala se conserva sola (el asiento vive en
// localStorage y el cliente reentra con su secreto, igual que con F5).
//
// AÑADIR UN IDIOMA: añade su código a LANGS, su etiqueta a LANG_LABEL, su <html lang> a
// HTML_LANG y un campo con ese código en CADA clave del diccionario (hasta que esté
// completo, cae a español; tools/i18n-test.mjs avisa de lo que falte).
//
// GLOSARIO (respétalo en todo el diccionario; el chino es simplificado, nunca tradicional)
//   es                    en                     zh
//   set («Set N»)         set («Set N»)          牌组（第N组）
//   pila (el set, en el   pile                   牌堆
//     tutorial)
//   centro                center                 中央
//   coger / soltar        take / drop            拿 / 放下
//   revelar / ocultar     reveal / hide          亮出 / 盖住
//   ceder (la carta)      give up (the card)     让出
//   pelea (QTE)           fight                  对决
//   desempate, muerte     tie, sudden death      平局、加时
//     súbita
//   peleada (carta)       contested              争夺中
//   burla                 taunt                  嘲讽
//   racha / frenesí       combo / frenzy         连击 / 狂热
//   listo                 ready                  准备（好）
//   sala (y «lobby»)      room                   房间（大厅 solo en «Volver al Lobby»）
//   espectador / mirar    spectator / watch      观战者 / 观战
//   echar (votación)      kick                   踢出
//   verificar             check                  检查
//   caerse (conexión)     drop (connection)      掉线
//   rango / Elo / bot     rank / Elo / bot       段位 / Elo / 机器人
//   For fun / For glory   se quedan como están en los tres idiomas (nombres de clasificación)
(function () {
    'use strict';
    const LANGS = ['es', 'en', 'zh'];
    const LANG_LABEL = { es: 'ES', en: 'EN', zh: '中文' };
    const HTML_LANG = { es: 'es', en: 'en', zh: 'zh-CN' };
    const KEY = 'piles.lang';

    function detect() {
        try {
            const s = localStorage.getItem(KEY);
            if (LANGS.includes(s)) return s;
        } catch { /* modo privado */ }
        const n = String((typeof navigator !== 'undefined' && navigator.language) || '').toLowerCase();
        if (n.startsWith('zh')) return 'zh';
        if (n.startsWith('en')) return 'en';
        return 'es';
    }

    let lang = detect();
    if (typeof document !== 'undefined') document.documentElement.lang = HTML_LANG[lang];

    function pick(v, vars) {
        if (v && typeof v === 'object') {
            const n = vars && vars.n;
            if (n !== undefined && v[n] !== undefined) return v[n];
            return n === 1 ? (v.one ?? v.other) : (v.other ?? v.one);
        }
        return v;
    }

    function t(key, vars) {
        const e = D[key];
        let s;
        if (e) s = pick(e[lang], vars) ?? pick(e.es, vars);
        if (s === undefined || s === null) {
            if (typeof console !== 'undefined') console.warn('i18n: falta la clave', key);
            return key;
        }
        return String(s).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] !== undefined ? vars[k] : m));
    }

    /** Escapa para meterlo en innerHTML (apodos y demás datos de usuario). */
    function esc(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function apply(root) {
        root = root || document;
        root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
        root.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
        root.querySelectorAll('[data-i18n-attr]').forEach(el => {
            el.dataset.i18nAttr.split(';').forEach(par => {
                const i = par.indexOf(':');
                if (i > 0) el.setAttribute(par.slice(0, i).trim(), t(par.slice(i + 1).trim()));
            });
        });
        root.querySelectorAll('[data-lang-picker]').forEach(box => {
            if (box.children.length) { box.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang))); return; }
            box.setAttribute('role', 'group');
            box.setAttribute('aria-label', t('lang.label'));
            LANGS.forEach(l => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'lang-btn';
                b.dataset.lang = l;
                b.lang = HTML_LANG[l];
                b.textContent = LANG_LABEL[l];
                b.setAttribute('aria-pressed', String(l === lang));
                b.addEventListener('click', () => setLang(l));
                box.appendChild(b);
            });
        });
    }


    // Estilos compartidos (lobby.html y replay.html): selector de idioma y la pila
    // tipográfica del chino. Geist no trae CJK: se pone delante una fuente CJK del
    // sistema (nada que descargar) para que el chino caiga siempre en la misma.
    function injectStyle() {
        const s = document.createElement('style');
        s.textContent = `
html[lang="zh-CN"] { --font-sans: "Geist", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", "WenQuanYi Micro Hei", system-ui, sans-serif; }
.lang-pick { display: flex; gap: 6px; }
.lang-btn { min-width: 44px; min-height: 32px; padding: 4px 10px; border: 2px solid var(--border-strong); border-radius: 8px;
  background: var(--control, rgb(52 52 56 / 45%)); color: var(--text-muted); font: inherit; font-size: 0.8rem; cursor: pointer; }
.lang-btn:hover { border-color: var(--accent); color: var(--text); }
.lang-btn[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); font-weight: bold; }
`;
        document.head.appendChild(s);
    }
    if (typeof document !== 'undefined') injectStyle();
    function setLang(l) {
        if (!LANGS.includes(l) || l === lang) return;
        try { localStorage.setItem(KEY, l); } catch { /* modo privado */ }
        if (typeof window.onBeforeLangChange === 'function') window.onBeforeLangChange();
        location.reload();
    }

    window.t = t;
    window.esc = window.esc || esc;
    window.PilesI18n = { t, has: k => !!D[k], apply, setLang, esc, LANGS, HTML_LANG, get lang() { return lang; }, dict: () => D };

    // ═══════════════════════ DICCIONARIO ═══════════════════════
    // 'clave': { es, en, zh }   ({x} = variable; { one, other } = plural por n)
    const D = {
        'lang.label': { es: 'Idioma', en: 'Language', zh: '语言' },
        'common.back': { es: '← Atrás', en: '← Back', zh: '← 返回' },
        'common.close': { es: 'Cerrar', en: 'Close', zh: '关闭' },
        'home.profile': { es: 'Perfil', en: 'Profile', zh: '个人资料' },
        'home.name': { es: 'Tu nombre', en: 'Your name', zh: '你的昵称' },
        'home.nameph': { es: 'Ej: Jugador1', en: 'e.g. Player1', zh: '例如：玩家1' },
        'home.namehint': { es: 'Escribe tu nombre para poder jugar.', en: 'Enter your name to play.', zh: '请先输入昵称再开始。' },
        'home.how': { es: '❓ Cómo jugar', en: '❓ How to play', zh: '❓ 玩法' },
        'home.quick': { es: '⚡ Partida rápida', en: '⚡ Quick match', zh: '⚡ 快速匹配' },
        'home.create': { es: '🎲 Crear sala', en: '🎲 Create room', zh: '🎲 创建房间' },
        'home.join': { es: '🔗 Unirse', en: '🔗 Join', zh: '🔗 加入房间' },
        'conn.connecting': { es: '⏳ Conectando...', en: '⏳ Connecting...', zh: '⏳ 连接中…' },
        'conn.ok': { es: '✅ Conectado al servidor', en: '✅ Connected to the server', zh: '✅ 已连接服务器' },
        'conn.error': { es: '❌ Error de conexión. ¿Está el servidor corriendo?', en: '❌ Connection error. Is the server running?', zh: '❌ 连接出错，服务器在运行吗？' },
        'conn.closed': { es: '🔌 Desconectado.', en: '🔌 Disconnected.', zh: '🔌 已断开连接。' },
        'conn.noreply': { es: '🔌 Sin respuesta del servidor.', en: '🔌 The server is not responding.', zh: '🔌 服务器没有响应。' },
        'profile.title': { es: '👤 Perfil', en: '👤 Profile', zh: '👤 个人资料' },
        'profile.smlabel': { es: 'Vincular con Session Manager', en: 'Link with Session Manager', zh: '关联 Session Manager' },
        'profile.smph': { es: 'Pega aquí tu código', en: 'Paste your code here', zh: '在此粘贴你的代码' },
        'profile.smunlink': { es: 'Borrar código', en: 'Clear code', zh: '清除代码' },
        'profile.smhint': { es: 'Genera un código en tu perfil de Session Manager y pégalo aquí.', en: 'Generate a code in your Session Manager profile and paste it here.', zh: '在 Session Manager 的个人资料中生成代码，然后粘贴到这里。' },
        'profile.taunt': { es: 'Mi burla', en: 'My taunt', zh: '我的嘲讽' },
        'profile.tauntnote': { es: 'Le suena a quien pida una carta justo después de que tú la cojas.', en: 'Plays for whoever asks for a card right after you take it.', zh: '有人在你拿走一张牌后马上也要这张牌时，会对他播放。' },
        'profile.footnote': { es: 'Sin código se juega igual, con un Elo guardado en este navegador. Al vincular puedes pasarlo a tu cuenta.', en: 'You can play without a code, with an Elo saved in this browser. When you link, you can move it to your account.', zh: '没有代码也能玩，Elo 会保存在此浏览器中。关联后可以转到你的账号。' },
        'host.title': { es: '🎲 Nueva sala', en: '🎲 New room', zh: '🎲 新建房间' },
        'host.players': { es: '¿Cuántos jugadores?', en: 'How many players?', zh: '几位玩家？' },
        'host.who': { es: '¿Quién puede entrar?', en: 'Who can join?', zh: '谁可以加入？' },
        'host.public': { es: '🌍 Cualquiera', en: '🌍 Anyone', zh: '🌍 任何人' },
        'host.private': { es: '🔒 Solo con código', en: '🔒 Code only', zh: '🔒 仅限代码' },
        'host.pubhint': { es: 'Sale en la lista de salas abiertas.', en: 'Shows up in the list of open rooms.', zh: '会显示在公开房间列表中。' },
        'host.privhint': { es: 'No se anuncia: hay que pasar el código o el QR.', en: 'Not listed: share the code or the QR to let people in.', zh: '不会公开显示：需要把代码或二维码发给对方。' },
        'host.start': { es: 'Empezar', en: 'Start', zh: '开始' },
        'join.title': { es: '🔗 Unirse a sala', en: '🔗 Join a room', zh: '🔗 加入房间' },
        'join.code': { es: 'Código de la sala', en: 'Room code', zh: '房间代码' },
        'join.btn': { es: 'Unirse', en: 'Join', zh: '加入' },
        'join.or': { es: '— o —', en: '— or —', zh: '— 或 —' },
        'join.scan': { es: '📷 Escanear QR', en: '📷 Scan QR', zh: '📷 扫描二维码' },
        'join.rooms': { es: '— salas —', en: '— rooms —', zh: '— 房间 —' },
        'join.refresh': { es: '🔄 Actualizar', en: '🔄 Refresh', zh: '🔄 刷新' },
        'ca.hint': { es: 'Desmárcate para cancelar', en: 'Untick ready to cancel', zh: '取消“准备好”即可中止' },
        'lobby.leave': { es: '← Salir de la sala', en: '← Leave room', zh: '← 离开房间' },
        'lobby.code': { es: 'Código del lobby', en: 'Room code', zh: '房间代码' },
        'lobby.qralt': { es: 'QR para unirse a la sala', en: 'QR code to join the room', zh: '加入房间的二维码' },
        'lobby.copy': { es: '📋 Copiar enlace', en: '📋 Copy link', zh: '📋 复制链接' },
        'lobby.share': { es: 'Escanea el QR o comparte el enlace', en: 'Scan the QR or share the link', zh: '扫描二维码或分享链接' },
        'lobby.players': { es: 'Jugadores', en: 'Players', zh: '玩家' },
        'chat.aria': { es: 'Chat de la sala', en: 'Room chat', zh: '房间聊天' },
        'chat.empty': { es: 'Aún no hay mensajes. Escribe el primero.', en: 'No messages yet. Write the first one.', zh: '还没有消息，来发第一条吧。' },
        'chat.ph': { es: 'Escribe a la sala…', en: 'Message the room…', zh: '给房间发消息…' },
        'chat.msg': { es: 'Mensaje', en: 'Message', zh: '消息' },
        'chat.send': { es: 'Enviar', en: 'Send', zh: '发送' },
        'offer.alone': { es: 'Nadie más por aquí ahora mismo.', en: 'Nobody else is around right now.', zh: '现在没有其他人。' },
        'offer.bots': { es: '🤖 Jugar contra bots', en: '🤖 Play against bots', zh: '🤖 和机器人玩' },
        'offer.wait': { es: 'Seguir esperando', en: 'Keep waiting', zh: '继续等待' },
        'bots.head': { es: '🤖 Jugar con bots', en: '🤖 Play with bots', zh: '🤖 和机器人一起玩' },
        'bots.none': { es: 'Ninguno', en: 'None', zh: '无' },
        'bots.note': { es: 'Para jugar solo o rellenar mientras llega gente.', en: 'To play solo, or to fill in while people arrive.', zh: '一个人玩，或在其他人到来前先补位。' },
        'bots.add': { es: '🤖 Añadir bot', en: '🤖 Add bot', zh: '🤖 添加机器人' },
        'diff.easy': { es: 'Fácil', en: 'Easy', zh: '简单' },
        'diff.normal': { es: 'Normal', en: 'Normal', zh: '普通' },
        'diff.hard': { es: 'Difícil', en: 'Hard', zh: '困难' },
        'game.mute': { es: 'Silenciar', en: 'Mute', zh: '静音' },
        'game.unmute': { es: 'Activar sonido', en: 'Unmute', zh: '开启声音' },
        'game.swaphint': { es: 'Selecciona una carta de <strong>tu set</strong> o del <strong>centro</strong> para intercambiar', en: 'Select a card from <strong>your set</strong> or the <strong>center</strong> to swap', zh: '选择<strong>你的牌组</strong>或<strong>中央</strong>的一张牌来交换' },
        'game.center': { es: 'Cartas del Centro', en: 'Center cards', zh: '中央的牌' },
        'game.sets': { es: 'Tus Sets', en: 'Your sets', zh: '你的牌组' },
        'game.fliptitle': { es: 'Mostrar este set a los demás jugadores', en: 'Show this set to the other players', zh: '把这组牌亮给其他玩家' },
        'game.flip': { es: '👁 Revelar set', en: '👁 Reveal set', zh: '👁 亮出这组' },
        'qte.title': { es: '⚡ ¡CLICK!', en: '⚡ CLICK!', zh: '⚡ 点击！' },
        'qte.btn': { es: '¡ C L I C K !', en: 'C L I C K !', zh: '点 击 ！' },
        'qte.giveup': { es: 'Mantén pulsado para ceder la carta', en: 'Hold to give up the card', zh: '长按以让出这张牌' },
        'over.title': { es: '🏆 Fin del Juego', en: '🏆 Game over', zh: '🏆 游戏结束' },
        'over.back': { es: 'Volver al Lobby', en: 'Back to lobby', zh: '返回大厅' },
        'recon.title': { es: 'Conexión perdida', en: 'Connection lost', zh: '连接已断开' },
        'recon.msg': { es: 'La conexión con el servidor se interrumpió.', en: 'The connection to the server was interrupted.', zh: '与服务器的连接中断了。' },
        'recon.btn': { es: 'Reconectar', en: 'Reconnect', zh: '重新连接' },
        'recon.reload': { es: 'Recargar página', en: 'Reload page', zh: '刷新页面' },
        'profile.smlinked': { es: '✅ Vinculado — se suma el resultado de cada partida a tu perfil.', en: '✅ Linked — the result of every game is added to your profile.', zh: '✅ 已关联 — 每局的结果都会计入你的个人资料。' },
        'profile.smlinked_beta': { es: '✅ Vinculado — en beta solo se vincula el Elo; el resultado no suma en tu perfil.', en: '✅ Linked — on beta only the Elo is linked; results do not count toward your profile.', zh: '✅ 已关联 — 测试版只关联 Elo，成绩不会计入你的个人资料。' },
        'common.prev': { es: 'Atrás', en: 'Back', zh: '返回' },
        'yes': { es: 'Sí', en: 'Yes', zh: '是' },
        'no': { es: 'No', en: 'No', zh: '否' },
        'unit.s': { es: '{n} s', en: '{n} s', zh: '{n} 秒' },
        'recon.retry': { es: 'Se perdió la conexión. Reintentando… (intento {n})', en: 'Connection lost. Retrying… (attempt {n})', zh: '连接断开了，正在重试…（第 {n} 次）' },
        'recon.retry_room': { es: 'Se perdió la conexión. Reintentando para volver a la sala… (intento {n})', en: 'Connection lost. Retrying to get back to the room… (attempt {n})', zh: '连接断开了，正在重试并返回房间…（第 {n} 次）' },
        'err.rejoin': { es: 'No se pudo volver a la sala: {why}', en: 'Could not get back to the room: {why}', zh: '无法返回房间：{why}' },
        'room.waiting': { es: 'en espera', en: 'waiting', zh: '等待中' },
        'room.starting': { es: 'empezando', en: 'starting', zh: '即将开始' },
        'room.playing': { es: 'jugando', en: 'playing', zh: '游戏中' },
        'room.none': { es: 'No hay salas ahora mismo.', en: 'No rooms right now.', zh: '目前没有房间。' },
        'room.act_watch': { es: 'Entrarás a mirar', en: 'You will watch', zh: '将以观战者身份加入' },
        'room.act_play': { es: 'Entrarás a jugar', en: 'You will play', zh: '将以玩家身份加入' },
        'room.aria': { es: 'Sala {code}, {state}, {n} de {max} jugadores. {act}', en: 'Room {code}, {state}, {n} of {max} players. {act}', zh: '房间 {code}，{state}，{n}/{max} 位玩家。{act}' },
        'room.aria_spec': { es: 'Sala {code}, {state}, {n} de {max} jugadores, {spec} mirando. {act}', en: 'Room {code}, {state}, {n} of {max} players, {spec} watching. {act}', zh: '房间 {code}，{state}，{n}/{max} 位玩家，{spec} 位观战者。{act}' },
        'lobby.copied': { es: '✅ Enlace copiado', en: '✅ Link copied', zh: '✅ 链接已复制' },
        'tut.1': { es: '¡Intercambia cartas hasta que todas tus <strong>PILAS</strong> tengan la misma prenda!', en: 'Swap cards until every one of your <strong>PILES</strong> has the same garment!', zh: '交换卡牌，直到你的每个<strong>牌堆</strong>都是同一种服饰！' },
        'tut.2': { es: 'Muestra una pila cuando creas que está completa. Recuerda: <strong>todos ven</strong> cuándo se muestra una pila y qué prenda tiene.', en: 'Reveal a pile when you think it is complete. Remember: <strong>everyone sees</strong> when a pile is revealed and which garment it has.', zh: '觉得某个牌堆凑齐了，就把它亮出来。注意：<strong>所有人都看得到</strong>你亮出了哪个牌堆，以及是什么服饰。' },
        'tut.3': { es: 'Al terminar verificamos que todas tus pilas sean correctas. Si te equivocaste, revisa tus pilas — <strong>los demás pueden seguir jugando</strong>.', en: 'When you finish, we check that all your piles are right. If you got one wrong, go through your piles again — <strong>the others can keep playing</strong>.', zh: '完成后会检查你所有的牌堆是否正确。如果弄错了，请重新检查你的牌堆——<strong>其他人可以继续玩</strong>。' },
        'tut.cap_full': { es: '✅ Pila completa', en: '✅ Complete pile', zh: '✅ 已凑齐的牌堆' },
        'tut.cap_mixed': { es: '❌ Todavía mezclada', en: '❌ Still mixed', zh: '❌ 还是杂的' },
        'tut.cap_reveal': { es: '👁 Revelar este set a otros', en: '👁 Reveal this set to the others', zh: '👁 把这组亮给其他人' },
        'tut.cap_failed': { es: '❌ Verificación fallida', en: '❌ Check failed', zh: '❌ 检查未通过' },
        'tut.next': { es: 'Siguiente', en: 'Next', zh: '下一步' },
        'tut.start': { es: 'Empezar', en: 'Start', zh: '开始' },
        'scan.close': { es: '✕ Cerrar cámara', en: '✕ Close camera', zh: '✕ 关闭摄像头' },
        'scan.error': { es: 'No se pudo abrir la cámara. Escribe el código a mano.', en: 'Could not open the camera. Type the code by hand.', zh: '无法打开摄像头，请手动输入代码。' },
        'ready.on': { es: '✅ Listo', en: '✅ Ready', zh: '✅ 已准备' },
        'ready.off': { es: 'Estoy listo', en: "I'm ready", zh: '我准备好了' },
        'ready.aria_on': { es: 'Listo, toca para cancelar', en: 'Ready, tap to cancel', zh: '已准备，点按可取消' },
        'ready.aria_off': { es: 'Marcar como Listo', en: 'Mark as Ready', zh: '标记为已准备' },
        'ready.count': { es: '{r} de {n} listos', en: '{r} of {n} ready', zh: '{r}/{n} 人已准备' },
        'seat.title': { es: 'Partida abierta en otro sitio', en: 'Game open somewhere else', zh: '游戏已在别处打开' },
        'seat.msg': { es: 'Tu asiento lo ha tomado otra pestaña. Aquí te quedas fuera.', en: 'Another tab has taken your seat. You are out here.', zh: '你的座位被另一个标签页占用了，这里已退出。' },
        'ver.new': { es: 'Hay una versión nueva', en: 'New version available', zh: '有新版本' },
        'ver.reload': { es: 'Recarga la página (Ctrl+F5) para actualizar.', en: 'Reload the page (Ctrl+F5) to update.', zh: '请刷新页面（Ctrl+F5）以更新。' },
        'ver.new_short': { es: 'Versión nueva', en: 'New version', zh: '新版本' },
        'ver.updating': { es: 'Actualizando…', en: 'Updating…', zh: '正在更新…' },
        'role.to_spec': { es: '👁 Pasar a espectador', en: '👁 Switch to spectator', zh: '👁 改为观战' },
        'role.leave_queue': { es: 'Salir de la cola', en: 'Leave the queue', zh: '退出排队' },
        'role.to_play': { es: '🪑 Quiero jugar', en: '🪑 I want to play', zh: '🪑 我要参加' },
        'role.band_queue': { es: 'La sala está llena: te sentarás en cuanto haya un hueco. Si antes empieza otra partida, la verás desde el principio.', en: 'The room is full: you will sit down as soon as a seat frees up. If another game starts first, you will watch it from the beginning.', zh: '房间已满：一有空位你就会入座。如果在那之前又开了一局，你会从头观战。' },
        'role.band_watch': { es: 'Estás mirando. Pulsa «Quiero jugar» cuando quieras sentarte.', en: 'You are watching. Press “I want to play” when you want to sit down.', zh: '你正在观战。想入座时点“我要参加”。' },
        'role.next_on': { es: '✓ Jugarás la próxima', en: "✓ You'll play the next one", zh: '✓ 下一局你来玩' },
        'role.next_off': { es: 'Jugar la próxima', en: 'Play the next one', zh: '下一局我来玩' },
        'kick.done': { es: '{nick} fue expulsado', en: '{nick} was kicked out', zh: '{nick} 被踢出了房间' },
        'kick.no': { es: 'Alguien votó No: no se echa a nadie', en: 'Someone voted No: nobody is kicked', zh: '有人投了否：不踢人' },
        'kick.timeout': { es: 'Sin acuerdo a tiempo: no se echa a nadie', en: 'No agreement in time: nobody is kicked', zh: '时间内没有达成一致：不踢人' },
        'kick.left': { es: '{nick} se fue antes de acabar la votación', en: '{nick} left before the vote ended', zh: '{nick} 在投票结束前离开了' },
        'kick.cancelled': { es: 'Votación cancelada', en: 'Vote cancelled', zh: '投票已取消' },
        'kick.you_title': { es: 'Te echaron de la sala', en: 'You were kicked out of the room', zh: '你被踢出了房间' },
        'kick.you_msg': { es: 'Podrás volver a entrar en 5 minutos.', en: 'You can join again in 5 minutes.', zh: '5 分钟后才能再次加入。' },
        'kick.q_you': { es: 'Hay una votación para echarte', en: 'There is a vote to kick you out', zh: '正在投票决定是否踢你出去' },
        'kick.q': { es: '¿Echar a {nick}?', en: 'Kick {nick}?', zh: '踢出 {nick}？' },
        'kick.meta': { es: '{yes} de {total} a favor · lo abrió {who}', en: '{yes} of {total} in favor · started by {who}', zh: '{yes}/{total} 赞成 · 由 {who} 发起' },
        'kick.votes': { es: 'Votos', en: 'Votes', zh: '投票情况' },
        'kick.voted_yes': { es: '{nick} ✓ Sí', en: '{nick} ✓ Yes', zh: '{nick} ✓ 是' },
        'kick.aria_yes': { es: 'Votar sí: echar a {nick}', en: 'Vote yes: kick {nick}', zh: '投“是”：踢出 {nick}' },
        'kick.aria_no': { es: 'Votar no: echar a {nick}', en: 'Vote no: kick {nick}', zh: '投“否”：踢出 {nick}' },
        'kick.you_dont_vote': { es: ' · tú no votas', en: ' · you do not vote', zh: ' · 你不参与投票' },
        'kick.your_vote': { es: ' · tu voto: Sí', en: ' · your vote: Yes', zh: ' · 你的投票：是' },
        'kick.left_label': { es: 'Quedan', en: 'Time left:', zh: '剩余' },
        'kick.btn': { es: 'Echar', en: 'Kick', zh: '踢出' },
        'kick.btn_aria': { es: 'Votar para echar a {nick}', en: 'Start a vote to kick {nick}', zh: '发起投票踢出 {nick}' },
        'lobby.you': { es: '(Tú)', en: '(You)', zh: '（你）' },
        'pool.fun': { es: 'Elo de For fun · hay bots en la sala', en: 'For fun Elo · there are bots in the room', zh: 'For fun 的 Elo · 房间里有机器人' },
        'pool.glory': { es: 'Elo de For glory · solo personas', en: 'For glory Elo · humans only', zh: 'For glory 的 Elo · 仅限真人' },
        'bots.remove': { es: 'Quitar este bot', en: 'Remove this bot', zh: '移除这个机器人' },
        'bots.inroom': { es: '{n} en la sala', en: '{n} in the room', zh: '房间里有 {n} 个' },
        'ca.go': { es: '¡Ya!', en: 'Go!', zh: '开始！' },
        'ca.cancelled': { es: 'Cuenta atrás cancelada', en: 'Countdown cancelled', zh: '倒计时已取消' },
        'ca.left': { es: 'Alguien ha salido.', en: 'Someone left.', zh: '有人离开了。' },
        'ca.joined': { es: 'Ha entrado alguien.', en: 'Someone joined.', zh: '有人加入了。' },
        'ca.not_ready': { es: 'Alguien ya no está listo.', en: 'Someone is no longer ready.', zh: '有人取消了准备。' },
        'spec.watching': { es: '👁 estás mirando', en: '👁 you are watching', zh: '👁 你正在观战' },
        'spec.leave': { es: 'Salir de la sala', en: 'Leave room', zh: '离开房间' },
        'spec.gap': { es: 'Hueco: debe una carta', en: 'Gap: owes a card', zh: '空位：欠一张牌' },
        'spec.from': { es: 'mirando desde', en: 'watching from', zh: '观战视角' },
        'spec.all': { es: 'Todos', en: 'Everyone', zh: '全部' },
        'spec.sets_of': { es: 'Sets de {nick}', en: "{nick}'s sets", zh: '{nick} 的牌组' },
        'set.n': { es: 'Set {n}', en: 'Set {n}', zh: '第{n}组' },
        'spec.owes': { es: 'debe una carta (set {set}, hueco {slot})', en: 'owes a card (set {set}, slot {slot})', zh: '欠一张牌（第{set}组，第{slot}格）' },
        'spec.no_debt': { es: 'sin deuda', en: 'no debt', zh: '没有欠牌' },
        'spec.combo': { es: 'racha', en: 'combo', zh: '连击' },
        'spec.frenzy': { es: '🌈 frenesí cargado', en: '🌈 frenzy ready', zh: '🌈 狂热已蓄满' },
        'spec.verifying': { es: 'verificando', en: 'verifying', zh: '检查中' },
        'spec.finished': { es: 'terminó', en: 'finished', zh: '完成：' },
        'spec.finished_n': { es: 'terminó {pos}', en: 'finished {pos}', zh: '完成：{pos}' },
        'spec.theirs': { es: '(él tiene abierto el set {set})', en: '(they have set {set} open)', zh: '（对方当前打开的是第{set}组）' },
        'spec.owes_short': { es: 'debe una carta', en: 'owes a card', zh: '欠一张牌' },
        'spec.shown': { es: ' (enseñado)', en: ' (revealed)', zh: '（已亮出）' },
        'pos.ord': { es: '{n}º', en: { 1: '1st', 2: '2nd', 3: '3rd', other: '{n}th' }, zh: '第{n}名' },
        'card.generic': { es: 'carta', en: 'card', zh: '卡牌' },
        'card.gap': { es: 'Coge una carta del centro para tapar este hueco', en: 'Take a card from the center to fill this gap', zh: '从中央拿一张牌来补这个空位' },
        'hud.revealed': { es: 'Set {set}: {name}', en: 'Set {set}: {name}', zh: '第{set}组：{name}' },
        'hud.hidden': { es: 'Set {set}: sin revelar', en: 'Set {set}: not revealed', zh: '第{set}组：未亮出' },
        'hud.closed': { es: '{n} de 6 sets cerrados', en: '{n} of 6 sets completed', zh: '已完成 {n}/6 组' },
        'hud.watching': { es: { one: 'Una persona está mirando', other: '{n} personas están mirando' }, en: { one: 'One person is watching', other: '{n} people are watching' }, zh: '{n} 人正在观战' },
        'beta.title': { es: 'Entorno de pruebas — los resultados no cuentan', en: 'Test environment — results do not count', zh: '测试环境 — 成绩不计入' },
        'grace.down': { es: 'se cayó · {n}s', en: 'dropped · {n}s', zh: '掉线了 · {n} 秒' },
        'grace.gone': { es: 'no volvió', en: "didn't come back", zh: '没有回来' },
        'grace.out': { es: 'fuera: {list}', en: 'out: {list}', zh: '移出：{list}' },
        'grace.back': { es: 'volvió', en: 'is back', zh: '回来了' },
        'wait.q': { es: 'sigue sin volver · ¿seguimos esperando? {n}s', en: 'still not back · keep waiting? {n}s', zh: '还没回来 · 继续等吗？{n} 秒' },
        'wait.voted_wait': { es: 'Votaste esperar', en: 'You voted to wait', zh: '你投了等待' },
        'wait.voted_cancel': { es: 'Votaste cancelar', en: 'You voted to cancel', zh: '你投了取消' },
        'wait.wait': { es: 'Esperar', en: 'Wait', zh: '等待' },
        'wait.cancel': { es: 'Cancelar', en: 'Cancel', zh: '取消' },
        'debt.forced': { es: '⏱️ Se acabó el tiempo: te tocó {name}', en: "⏱️ Time's up: you got {name}", zh: '⏱️ 时间到：你拿到了{name}' },
        'num.dec': { es: ',', en: '.', zh: '.' },
        'frenzy.title': { es: 'Bloquea 2 s a quien no tenga el suyo · el próximo costará ×{cost}', en: 'Stuns anyone without their own for 2 s · the next one will cost ×{cost}', zh: '让没有狂热的人被眩晕 2 秒 · 下一次需要 ×{cost}' },
        'frenzy.countered': { es: '🛡️ Tu frenesí paró el suyo', en: '🛡️ Your frenzy stopped theirs', zh: '🛡️ 你的狂热挡下了对方的狂热' },
        'frenzy.by': { es: '⚡ Frenesí de {nick}', en: '⚡ {nick} used a frenzy', zh: '⚡ {nick} 释放了狂热' },
        'taunt.honk': { es: 'Honk de payaso', en: 'Clown honk', zh: '小丑喇叭' },
        'taunt.trombon': { es: 'Trombón triste', en: 'Sad trombone', zh: '悲伤长号' },
        'taunt.boing': { es: 'Boing', en: 'Boing', zh: '嘣' },
        'taunt.risa': { es: 'Risa cartoon', en: 'Cartoon laugh', zh: '卡通笑声' },
        'taunt.pedorreta': { es: 'Pedorreta', en: 'Raspberry', zh: '噗噗声' },
        'taunt.sirena': { es: 'Sirena cómica', en: 'Silly siren', zh: '搞笑警笛' },
        'taunt.silbido': { es: 'Silbido que cae', en: 'Falling whistle', zh: '下坠口哨' },
        'taunt.campanita': { es: 'Campanita burlona', en: 'Mocking bell', zh: '嘲讽小铃铛' },
        'taunt.gallo': { es: 'Gallo', en: 'Rooster', zh: '公鸡' },
        'taunt.pato': { es: 'Pato', en: 'Duck', zh: '鸭子' },
        'taunt.none': { es: 'Ninguna', en: 'None', zh: '无' },
        'taunt.yours': { es: 'Tu burla: {name}', en: 'Your taunt: {name}', zh: '你的嘲讽：{name}' },
        'taunt.no': { es: 'Sin burla', en: 'No taunt', zh: '没有嘲讽' },
        'taunt.listen': { es: 'Oír {name}', en: 'Listen to {name}', zh: '试听 {name}' },
        'taunt.muted': { es: 'Silencio activado', en: 'Sound is muted', zh: '已静音' },
        'taunt.stole': { es: '🤡 {nick} te la quitó', en: '🤡 {nick} beat you to it', zh: '🤡 {nick} 抢先拿走了' },
        'someone': { es: 'Alguien', en: 'Someone', zh: '有人' },
        'swap.hint': { es: 'Toca una carta tuya para soltarla al centro', en: 'Tap one of your cards to drop it in the center', zh: '点一张你的牌，把它放到中央' },
        'swap.owing': { es: 'Coge una carta del centro', en: 'Take a card from the center', zh: '从中央拿一张牌' },
        'game.hide': { es: '🙈 Ocultar set', en: '🙈 Hide set', zh: '🙈 盖住这组' },
        'game.hidetitle': { es: 'Dejar de mostrar este set a los demás jugadores', en: 'Stop showing this set to the other players', zh: '不再向其他玩家展示这组牌' },
        'qte.vs': { es: 'Tú vs', en: 'You vs', zh: '你 对阵' },
        'qte.me': { es: '⭐ {nick} (Tú)', en: '⭐ {nick} (You)', zh: '⭐ {nick}（你）' },
        'qte.clicks': { es: '{n} clicks', en: { one: '{n} click', other: '{n} clicks' }, zh: '{n} 次点击' },
        'qte.fight': { es: 'PELEA', en: 'FIGHT', zh: '对决' },
        'qte.tie_notif': { es: '🤝 ¡EMPATE! Muerte súbita', en: '🤝 TIE! Sudden death', zh: '🤝 平局！加时' },
        'qte.tie_notif_round': { es: '🤝 ¡EMPATE! Muerte súbita {round}', en: '🤝 TIE! Sudden death {round}', zh: '🤝 平局！加时 {round}' },
        'qte.tie_title': { es: '¡EMPATE! Muerte súbita', en: 'TIE! Sudden death', zh: '平局！加时' },
        'qte.tie_desc': { es: '{score} · ronda extra: ¡a por ella!', en: '{score} · extra round: go get it!', zh: '{score} · 加时赛：冲啊！' },
        'qte.tie_desc_round': { es: '{score} · ronda extra {round}: ¡a por ella!', en: '{score} · extra round {round}: go get it!', zh: '{score} · 加时赛 {round}：冲啊！' },
        'qte.random': { es: 'Desempate al azar', en: 'Decided at random', zh: '随机决出胜负' },
        'qte.sudden': { es: 'Desempate en muerte súbita', en: 'Settled in sudden death', zh: '加时赛分出胜负' },
        'verify.mine': { es: '🔍 Verificando tus sets...', en: '🔍 Checking your sets...', zh: '🔍 正在检查你的牌组…' },
        'verify.other': { es: '🔍 {nick} verificando...', en: '🔍 {nick} is being checked...', zh: '🔍 正在检查 {nick}…' },
        'verify.done_me': { es: '{medal} ¡Terminaste en el puesto {pos}!', en: '{medal} You finished in place {pos}!', zh: '{medal} 你获得第 {pos} 名！' },
        'verify.done_other': { es: '{medal} {nick}: Puesto {pos}', en: '{medal} {nick}: place {pos}', zh: '{medal} {nick}：第 {pos} 名' },
        'verify.fail_me': { es: '❌ Fallaste: {list}', en: '❌ You got these wrong: {list}', zh: '❌ 出错的牌组：{list}' },
        'verify.fail_other': { es: '❌ {nick} falló: {list}', en: '❌ {nick} got these wrong: {list}', zh: '❌ {nick} 出错：{list}' },
        'list.sep': { es: ', ', en: ', ', zh: '、' },
        'elo.games': { es: { one: '{n} partida', other: '{n} partidas' }, en: { one: '{n} game', other: '{n} games' }, zh: '{n} 局' },
        'elo.note_account': { es: 'Elo de tu cuenta de Session Manager.', en: 'Elo of your Session Manager account.', zh: '你的 Session Manager 账号的 Elo。' },
        'elo.note_browser': { es: 'Elo de este navegador. Vincula tu cuenta para llevarlo contigo.', en: 'Elo of this browser. Link your account to take it with you.', zh: '此浏览器的 Elo。关联账号即可带着它走。' },
        'elo.err_read': { es: 'No se pudo consultar el Elo. Prueba de nuevo.', en: 'Could not fetch the Elo. Try again.', zh: '无法获取 Elo，请重试。' },
        'elo.err_link': { es: 'No se pudo vincular el Elo. Prueba de nuevo.', en: 'Could not link the Elo. Try again.', zh: '无法关联 Elo，请重试。' },
        'elo.linked': { es: 'Elo vinculado a tu cuenta', en: 'Elo linked to your account', zh: 'Elo 已关联到你的账号' },
        'elo.move_q': { es: '¿Pasar tu Elo a la cuenta?', en: 'Move your Elo to the account?', zh: '把你的 Elo 转到账号上？' },
        'elo.move_text': { es: 'En este navegador tienes: {elo}.\nSi no lo pasas, se borra.', en: 'In this browser you have: {elo}.\nIf you do not move it, it is deleted.', zh: '此浏览器中的成绩：{elo}。\n不转移的话会被删除。' },
        'elo.move_yes': { es: 'Pasarlo', en: 'Move it', zh: '转移' },
        'elo.move_no': { es: 'No, borrarlo', en: 'No, delete it', zh: '不，删除' },
        'elo.keep_q': { es: '¿Qué Elo se queda?', en: 'Which Elo do you keep?', zh: '保留哪一个 Elo？' },
        'elo.keep_text': { es: 'Tu cuenta: {acc}.\nEste navegador: {br}.\nEl otro se borra.', en: 'Your account: {acc}.\nThis browser: {br}.\nThe other one is deleted.', zh: '你的账号：{acc}。\n此浏览器：{br}。\n另一个会被删除。' },
        'elo.keep_acc': { es: 'El de la cuenta', en: "The account's", zh: '账号的' },
        'elo.keep_br': { es: 'El de este navegador', en: "This browser's", zh: '此浏览器的' },
        'sm.ok': { es: '✅ Resultado sumado a tu perfil de Session Manager', en: '✅ Result added to your Session Manager profile', zh: '✅ 成绩已计入你的 Session Manager 个人资料' },
        'sm.stale': { es: '⚠️ Tu código de Session Manager ya no es válido (se reemplaza al generar uno nuevo). Copia el actual desde tu perfil y pégalo otra vez en 👤 Perfil.', en: '⚠️ Your Session Manager code is no longer valid (it is replaced when you generate a new one). Copy the current one from your profile and paste it again in 👤 Profile.', zh: '⚠️ 你的 Session Manager 代码已失效（生成新代码时旧的会被替换）。请从个人资料中复制当前代码，再粘贴到 👤 个人资料里。' },
        'sm.fail': { es: '⚠️ No se pudo vincular: {why}', en: '⚠️ Could not link: {why}', zh: '⚠️ 无法关联：{why}' },
        'sm.unknown': { es: 'error desconocido', en: 'unknown error', zh: '未知错误' },
        'sm.offline': { es: '⚠️ No se pudo conectar con Session Manager', en: '⚠️ Could not reach Session Manager', zh: '⚠️ 无法连接 Session Manager' },
        'cancel.title': { es: 'Partida cancelada', en: 'Game cancelled', zh: '游戏已取消' },
        'card.fought': { es: 'PELEADA', en: 'CONTESTED', zh: '争夺中' },
        'rank.hierro': { es: 'Hierro oxidado', en: 'Rusty iron', zh: '生锈铁' },
        'rank.bronce': { es: 'Bronce', en: 'Bronze', zh: '青铜' },
        'rank.plata': { es: 'Plata', en: 'Silver', zh: '白银' },
        'rank.oro': { es: 'Oro', en: 'Gold', zh: '黄金' },
        'rank.platino': { es: 'Platino', en: 'Platinum', zh: '铂金' },
        'rank.diamante': { es: 'Diamante', en: 'Diamond', zh: '钻石' },
        'rank.master': { es: 'Máster', en: 'Master', zh: '大师' },
        'rank.gran-master': { es: 'Gran máster', en: 'Grandmaster', zh: '宗师' },
        'rank.top3': { es: 'Top 3 global', en: 'Global top 3', zh: '全球前三' },
        'rank.carton': { es: 'Cartón', en: 'Cardboard', zh: '纸板' },
        'rank.juguete': { es: 'Juguete', en: 'Toy', zh: '玩具' },
        'rank.laton': { es: 'Latón', en: 'Brass', zh: '黄铜' },
        'rank.caucho': { es: 'Caucho', en: 'Rubber', zh: '橡胶' },
        'rank.plastico': { es: 'Plástico', en: 'Plastic', zh: '塑料' },
        'rank.gominola': { es: 'Gominola', en: 'Gummy', zh: '软糖' },
        'rank.dulce': { es: 'Dulce', en: 'Candy', zh: '糖果' },
        'rank.confeti': { es: 'Confeti', en: 'Confetti', zh: '彩纸' },
        'rank.payaso': { es: 'Payaso', en: 'Clown', zh: '小丑' },
        'rank.up': { es: '▲ Asciendes', en: '▲ Rank up', zh: '▲ 升段' },
        'rank.down': { es: '▼ Desciendes', en: '▼ Rank down', zh: '▼ 降段' },
        'toast.close': { es: 'Cerrar aviso', en: 'Dismiss', zh: '关闭提示' },
        'err.bad_message': { es: 'Mensaje inválido', en: 'Invalid message', zh: '消息无效' },
        'err.kicked_wait': { es: 'Te echaron de esta sala. Podrás volver en {min} min.', en: 'You were kicked from this room. You can come back in {min} min.', zh: '你被踢出了这个房间，{min} 分钟后才能回来。' },
        'err.no_bots_now': { es: 'No se pueden añadir bots ahora', en: 'Bots cannot be added right now', zh: '现在不能添加机器人' },
        'err.lobby_not_found': { es: 'Lobby no encontrado', en: 'Room not found', zh: '找不到房间' },
        'err.not_in_lobby': { es: 'No estás en un lobby', en: 'You are not in a room', zh: '你不在任何房间里' },
        'err.bad_set_index': { es: 'Índice de set inválido (debe ser 0-5)', en: 'Invalid set number', zh: '牌组编号无效' },
        'err.game_not_started': { es: 'El juego no ha iniciado', en: 'The game has not started', zh: '游戏还没开始' },
        'err.player_not_found': { es: 'Jugador no encontrado', en: 'Player not found', zh: '找不到玩家' },
        'err.not_in_game': { es: 'No estás en una partida', en: 'You are not in a game', zh: '你不在对局中' },
        'err.already_verifying': { es: 'Ya estás verificando', en: 'You are already being checked', zh: '你已经在检查中' },
        'err.already_finished': { es: 'Ya terminaste el juego', en: 'You have already finished', zh: '你已经完成了' },
        'err.no_frenzy': { es: 'No tienes frenesí', en: 'You have no frenzy', zh: '你没有狂热' },
        'err.chat_slow': { es: 'Más despacio: espera un momento antes de escribir otra vez.', en: 'Slow down: wait a moment before writing again.', zh: '慢一点：请稍等片刻再发言。' },
        'err.name_taken': { es: 'Ya hay alguien llamado «{nick}» en esta sala. Cambia tu nombre en el inicio y vuelve a intentarlo.', en: 'Someone called “{nick}” is already in this room. Change your name on the start screen and try again.', zh: '房间里已经有人叫“{nick}”了。请在首页换个昵称再试。' },
        'err.no_spectate_in_game': { es: 'No puedes pasarte a espectador con la partida en marcha', en: 'You cannot switch to spectator while a game is running', zh: '对局进行中不能改为观战' },
        'err.game_started': { es: 'La partida ya empezó', en: 'The game has already started', zh: '对局已经开始' },
        'err.kick_only_waiting': { es: 'Solo se puede votar en la sala de espera', en: 'You can only vote in the waiting room', zh: '只能在等待室里投票' },
        'err.kick_busy': { es: 'Ya hay una votación en marcha', en: 'A vote is already in progress', zh: '已经有一场投票在进行' },
        'err.kick_only_oldest': { es: 'Solo quien lleva más tiempo sentado puede abrir la votación', en: 'Only the person who has been seated the longest can start the vote', zh: '只有入座最久的人才能发起投票' },
        'err.kick_bad_target': { es: 'Solo se puede votar para echar a otra persona sentada', en: 'You can only vote to kick another seated person', zh: '只能投票踢出其他已入座的玩家' },
        'err.kick_cooldown': { es: 'Espera {secs} s para volver a votar a {nick}', en: 'Wait {secs} s before voting on {nick} again', zh: '请等待 {secs} 秒后再对 {nick} 发起投票' },
        'err.chat_in_game': { es: 'El chat es de la sala de espera: durante la partida no se puede escribir.', en: 'Chat is for the waiting room: you cannot write during a game.', zh: '聊天仅限等待室：对局中不能发言。' },
        'err.chat_not_in_room': { es: 'Solo quien está en la sala puede escribir.', en: 'Only people in the room can write.', zh: '只有房间里的人才能发言。' },
        'swapfail.wait_fight': { es: 'Espera a que acabe tu pelea', en: 'Wait for your fight to end', zh: '请等对决结束' },
        'swapfail.verifying': { es: 'Estás verificando tus pilas', en: 'You are checking your piles', zh: '你正在检查你的牌堆' },
        'swapfail.owe_card': { es: 'Coge una carta del centro antes de soltar otra', en: 'Take a card from the center before dropping another', zh: '先从中央拿一张牌，再放下另一张' },
        'swapfail.empty_slot': { es: 'Ese hueco ya está vacío', en: 'That slot is already empty', zh: '这个格子已经空了' },
        'swapfail.card_fought': { es: 'Esa carta se está peleando', en: 'That card is being fought over', zh: '这张牌正在被争夺' },
        'swapfail.card_gone': { es: 'Esa carta ya no está', en: 'That card is gone', zh: '这张牌已经不在了' },
        'swapfail.no_debt': { es: 'Suelta una carta antes de coger otra', en: 'Drop a card before taking another', zh: '先放下一张牌，再拿另一张' },
        'swapfail.lost_card': { es: 'Perdiste la carta', en: 'You lost the card', zh: '你输掉了这张牌' },
        'cancel.disconnected': { es: '{nick} se desconectó', en: '{nick} disconnected', zh: '{nick} 掉线了' },
        'cloth.0': { es: 'Calcetines cortos', en: 'Short socks', zh: '短袜' },
        'cloth.1': { es: 'Calcetines largos', en: 'Long socks', zh: '长袜' },
        'cloth.2': { es: 'Calzoncillos', en: 'Briefs', zh: '三角内裤' },
        'cloth.3': { es: 'Bóxers', en: 'Boxers', zh: '平角内裤' },
        'cloth.4': { es: 'Top deportivo', en: 'Sports top', zh: '运动上衣' },
        'cloth.5': { es: 'Camiseta de tirantes', en: 'Camisole', zh: '吊带衫' },
        'cloth.6': { es: 'Bermudas cargo', en: 'Cargo bermudas', zh: '工装短裤' },
        'cloth.7': { es: 'Shorts de baño', en: 'Swim shorts', zh: '泳裤' },
        'cloth.8': { es: 'Shorts deportivos', en: 'Sports shorts', zh: '运动短裤' },
        'cloth.9': { es: 'Shorts vaqueros', en: 'Denim shorts', zh: '牛仔短裤' },
        'cloth.10': { es: 'Falda plisada', en: 'Pleated skirt', zh: '百褶裙' },
        'cloth.11': { es: 'Pantalones chinos', en: 'Chinos', zh: '卡其裤' },
        'cloth.12': { es: 'Pantalón de chándal', en: 'Sweatpants', zh: '运动长裤' },
        'cloth.13': { es: 'Pantalones cargo', en: 'Cargo pants', zh: '工装裤' },
        'cloth.14': { es: 'Jeans rotos', en: 'Ripped jeans', zh: '破洞牛仔裤' },
        'cloth.15': { es: 'Leggings', en: 'Leggings', zh: '紧身裤' },
        'cloth.16': { es: 'Jumpsuit', en: 'Jumpsuit', zh: '连体裤' },
        'cloth.17': { es: 'Peto vaquero', en: 'Denim overalls', zh: '牛仔背带裤' },
        'cloth.18': { es: 'Camiseta manga corta', en: 'T-shirt', zh: '短袖T恤' },
        'cloth.19': { es: 'Polo', en: 'Polo shirt', zh: 'Polo衫' },
        'cloth.20': { es: 'Camisa hawaiana', en: 'Hawaiian shirt', zh: '夏威夷衬衫' },
        'cloth.21': { es: 'Blusa de tirantes', en: 'Strappy blouse', zh: '吊带衬衫' },
        'cloth.22': { es: 'Camisa de franela', en: 'Flannel shirt', zh: '法兰绒衬衫' },
        'cloth.23': { es: 'Camiseta sin mangas', en: 'Tank top', zh: '无袖T恤' },
        'cloth.24': { es: 'Camiseta de baloncesto', en: 'Basketball jersey', zh: '篮球球衣' },
        'cloth.25': { es: 'Camiseta de béisbol', en: 'Baseball jersey', zh: '棒球衫' },
        'cloth.26': { es: 'Sudadera sin capucha', en: 'Crewneck sweatshirt', zh: '无帽卫衣' },
        'cloth.27': { es: 'Suéter de punto', en: 'Knit sweater', zh: '针织毛衣' },
        'cloth.28': { es: 'Camisa formal', en: 'Dress shirt', zh: '正装衬衫' },
        'cloth.29': { es: 'Blusa abullonada', en: 'Puff-sleeve blouse', zh: '泡泡袖衬衫' },
        'cloth.30': { es: 'Mono corto', en: 'Romper', zh: '短款连体衣' },
        'cloth.31': { es: 'Túnica', en: 'Tunic', zh: '长衫' },
        'cloth.32': { es: 'Chaleco de rombos', en: 'Argyle vest', zh: '菱格背心' },
        'cloth.33': { es: 'Chaleco acolchado', en: 'Quilted vest', zh: '绗缝马甲' },
        'cloth.34': { es: 'Sudadera con capucha', en: 'Hoodie', zh: '连帽卫衣' },
        'cloth.35': { es: 'Chaqueta', en: 'Jacket', zh: '夹克' },
        'cloth.36': { es: 'Cárdigan', en: 'Cardigan', zh: '开衫' },
        'cloth.37': { es: 'Chaqueta universitaria', en: 'Varsity jacket', zh: '棒球夹克' },
        'cloth.38': { es: 'Plumífero', en: 'Puffer jacket', zh: '羽绒服' },
        'cloth.39': { es: 'Parka', en: 'Parka', zh: '派克大衣' },
        'cloth.40': { es: 'Gabardina', en: 'Trench coat', zh: '风衣' },
        'cloth.41': { es: 'Vestido de verano', en: 'Sundress', zh: '夏季连衣裙' },
        'cloth.42': { es: 'Sudadera con cremallera', en: 'Zip-up hoodie', zh: '拉链卫衣' },
        'cloth.43': { es: 'Body de bebé', en: 'Baby onesie', zh: '婴儿连体衣' },
        'cloth.44': { es: 'Bufanda', en: 'Scarf', zh: '围巾' },
        'cloth.45': { es: 'Guantes', en: 'Gloves', zh: '手套' },
        'cloth.46': { es: 'Gorro de lana', en: 'Beanie', zh: '毛线帽' },
        'cloth.47': { es: 'Bata', en: 'Robe', zh: '睡袍' },
        'cloth.48': { es: 'Bikini', en: 'Bikini', zh: '比基尼' },
        'cloth.49': { es: 'Bañador', en: 'Swimsuit', zh: '泳衣' },
        'replay.title': { es: '📼 Piles! · partidas terminadas', en: '📼 Piles! · finished games', zh: '📼 Piles! · 已结束的对局' },
        'replay.loading': { es: 'Cargando…', en: 'Loading…', zh: '加载中…' },
        'replay.http': { es: 'El servidor respondió {status}.', en: 'The server answered {status}.', zh: '服务器返回了 {status}。' },
        'replay.offline': { es: 'No se pudo conectar.', en: 'Could not connect.', zh: '无法连接。' },
        'replay.none': { es: 'Todavía no hay partidas grabadas.', en: 'No recorded games yet.', zh: '还没有录制的对局。' },
        'replay.when': { es: 'Cuándo', en: 'When', zh: '时间' },
        'replay.room': { es: 'Sala', en: 'Room', zh: '房间' },
        'replay.players': { es: 'Jugadores', en: 'Players', zh: '玩家' },
        'replay.lasted': { es: 'Duró', en: 'Length', zh: '时长' },
        'replay.size': { es: 'Tamaño', en: 'Size', zh: '大小' },
        'replay.missing': { es: 'No se encontró esa grabación.', en: 'That recording was not found.', zh: '找不到这份录像。' },
        'replay.nohead': { es: 'La grabación no tiene cabecera.', en: 'The recording has no header.', zh: '这份录像没有文件头。' },
        'replay.list': { es: '← lista', en: '← list', zh: '← 列表' },
        'replay.t_start': { es: 'desde el inicio', en: 'since the start', zh: '距开局' },
        'replay.t_clock': { es: 'reloj · para el vídeo', en: 'clock · for the video', zh: '时钟 · 对照视频' },
        'replay.t_video': { es: 'vídeo', en: 'video', zh: '视频' },
        'replay.mark_title': { es: 'Marca este instante como el 0:00 del vídeo del móvil', en: 'Mark this moment as 0:00 of the phone video', zh: '把此刻标记为手机视频的 0:00' },
        'replay.mark': { es: '⇥ 0:00 del vídeo', en: '⇥ video 0:00', zh: '⇥ 视频 0:00' },
        'replay.from': { es: 'mirando desde:', en: 'watching from:', zh: '观战视角：' },
        'replay.truth_title': { es: 'Enseña también lo que este jugador NO podía ver', en: 'Also shows what this player could NOT see', zh: '同时显示该玩家看不到的内容' },
        'replay.truth': { es: '👁 ver la verdad', en: '👁 show the truth', zh: '👁 显示真相' },
        'replay.his_sets': { es: 'Sus sets', en: 'Their sets', zh: '他的牌组' },
        'replay.undos': { es: 'vueltas atrás', en: 'undone moves', zh: '被撤销的操作' },
        'replay.ev_state': { es: '· estado', en: '· state', zh: '· 状态' },
        'replay.ev_head': { es: '· cabecera', en: '· header', zh: '· 文件头' },
        'replay.ev_end': { es: '· fin ({reason})', en: '· end ({reason})', zh: '· 结束（{reason}）' },
        'replay.late': { es: 'llegó tarde a la carta', en: 'was too late for the card', zh: '来晚了，牌已被拿走' },
        'replay.forced': { es: 'carta asignada por el plazo', en: 'card assigned by the deadline', zh: '超时后被分配了一张牌' },
        'replay.asked': { es: '(pidió {what})', en: '(had asked: {what})', zh: '（之前的操作：{what}）' },
        'replay.no_undos': { es: 'Ninguna.', en: 'None.', zh: '没有。' },
        'replay.event': { es: 'evento {n}/{total}', en: 'event {n}/{total}', zh: '事件 {n}/{total}' },
        'replay.nostate': { es: 'Todavía no hay estado: el primero llega más adelante.', en: 'No state yet: the first one comes later.', zh: '还没有状态：第一个状态稍后出现。' },
        'replay.watch_from': { es: 'Mirar la partida desde {nick}', en: 'Watch the game from {nick}', zh: '以 {nick} 的视角观看' },
        'replay.mult': { es: 'multiplicador', en: 'multiplier', zh: '倍率' },
        'replay.points': { es: 'puntos', en: 'points', zh: '分数' },
        'replay.hidden': { es: 'Lo que no veía: manos del resto', en: 'What they could not see: everyone else’s hands', zh: '他看不到的：其他人的手牌' },
        'frenzy.btn': { es: 'FRENZY', en: 'FRENZY', zh: '狂热' },
// ══ FIN ══
    };

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => apply());
        else apply();
    }
})();
