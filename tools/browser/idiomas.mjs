// Idiomas (es / en / zh): que se vea TODO en el idioma elegido, sin español colado.
//
//   node browser/idiomas.mjs [--base=local|beta|<url>] [--ver] [--solo=en,zh]
//
// Por idioma (se fuerza con `localStorage['piles.lang']`, ~1 min cada uno): portada, perfil,
// cómo jugar, nueva sala, «Unirse» con una sala de la lista, sala de espera con bots y chat,
// cuenta atrás, partida, errores reales del servidor (`code` + `args`), las pantallas de la
// partida que no se pueden provocar a voluntad (pelea y desempate, caída y encuesta
// «¿seguimos esperando?», verificación, fin con rangos y Elo, partida cancelada) con
// mensajes inyectados como hace peleas.mjs, un espectador entrando a mirar, y la votación
// para echar a alguien con tres personas. En cada pantalla comprueba que lo visible (texto,
// aria-label, title, placeholder y el contenido de ::before/::after):
//   - no trae claves crudas ni `undefined`, y el cliente no avisó de claves que falten;
//   - en en y zh no trae español (acentos y palabras típicas; en zh, tampoco inglés suelto
//     que no sea un nombre propio);
//   - no desborda en 390x700 ni en 1280x800.
// Aparte: `<html lang>`, elegir idioma (por navigator.language, por el selector y que
// persiste), que cambiarlo en una sala vuelve a ella, el respaldo a español y la fuente CJK.
// Capturas en `$CAPTURAS` o en la carpeta temporal (`idiomas-<idioma>-*.png`): hay que mirarlas.
import { lanzar, ok, info, fin, wait, base } from './comun.mjs';
import { crear, cliente, send, esperar } from '../repro/comun.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const browser = await lanzar();
const capturas = process.env.CAPTURAS || path.join(os.tmpdir(), 'piles-idiomas');
fs.mkdirSync(capturas, { recursive: true });
const MOV = { width: 390, height: 700 }, DESK = { width: 1280, height: 800 };
const solo = process.argv.find(a => a.startsWith('--solo='))?.slice(7).split(',');
const IDIOMAS = ['es', 'en', 'zh'].filter(l => !solo || solo.includes(l));
const HTML_LANG = { es: 'es', en: 'en', zh: 'zh-CN' };

// ── Detectores ──────────────────────────────────────────────────────────────
const PALABRAS_ES = /\b(el|la|los|las|del|que|con|para|por|una|unos|tu|tus|sala|salas|jugador|jugadores|partida|carta|cartas|atrás|salir|crear|unirse|listo|listos|nombre|perfil|burla|esperando|espera|empezar|siguiente|cerrar|enviar|mensaje|fácil|difícil|echar|votación|votó|quedan|tiempo|mirando|hueco|centro|pila|pilas|prenda|volvió|cayó|falló|puesto|terminaste|fuera|ninguno|ninguna|cancelada|cancelar|esperar|conexión|perdida|reconectar|recargar|página)\b/i;
const ACENTOS = /[áéíóúñ¿¡]/i;
const CLAVE_CRUDA = /\b(app|lang|common|home|conn|profile|host|join|ca|lobby|chat|offer|bots|diff|game|qte|over|recon|room|tut|scan|ready|seat|ver|role|kick|pool|spec|set|hud|beta|grace|wait|debt|num|frenzy|taunt|swap|verify|list|elo|sm|cancel|err|swapfail|cloth|rank|toast|replay|unit|pos|card)\.[a-z0-9_-]+(\.[a-z0-9_-]+)?\b/;
const SUELTOS = /\b(undefined|null|NaN)\b|\[object/;
// Nombres propios y términos que se quedan tal cual en chino.
const LATIN_OK = new Set(['piles', 'elo', 'session', 'manager', 'for', 'fun', 'glory', 'qr', 'ana', 'beto', 'caro', 'dani', 'zoe', 'bot', 'nick', 'polo', 'abc123', 'ctrl', 'html']);

async function textoVisible(p) {
  return p.evaluate(() => {
    const out = [];
    const vis = el => el.checkVisibility ? el.checkVisibility({ checkVisibilityCSS: true }) : !!el.offsetParent;
    for (const el of document.body.querySelectorAll('*')) {
      if (['SCRIPT', 'STYLE', 'VIDEO', 'CANVAS'].includes(el.tagName) || !vis(el)) continue;
      if (el.closest('.piles-titulo, #fxLayer')) continue;
      for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) out.push(n.textContent.trim());
      for (const a of ['aria-label', 'title', 'placeholder', 'alt']) { const v = el.getAttribute(a); if (v) out.push(v); }
      for (const ps of ['::before', '::after']) {
        const c = getComputedStyle(el, ps).content;
        if (c && !['none', 'normal', '""', "''"].includes(c)) out.push(c.replace(/^["']|["']$/g, ''));
      }
    }
    out.push(document.documentElement.lang);
    return out;
  });
}

const fallosPorPagina = new WeakMap();
async function revisar(p, idioma, donde) {
  const textos = (await textoVisible(p)).filter(Boolean);
  const malos = [];
  for (const t of textos) {
    if (CLAVE_CRUDA.test(t) || SUELTOS.test(t)) malos.push(`clave/valor crudo: «${t}»`);
    if (idioma !== 'es') {
      if (ACENTOS.test(t)) malos.push(`acento español: «${t}»`);
      else if (PALABRAS_ES.test(t)) malos.push(`palabra española: «${t}»`);
    }
    if (idioma === 'zh') {
      if (/^\s*\d+\s+\d\d:\d\d\.\d{3}\s/.test(t)) continue;   // el registro de eventos del visor: tipos de mensaje, técnicos
      const sueltos = (t.match(/\b[A-Za-z][a-z']{2,}\b/g) || []).filter(w => !LATIN_OK.has(w.toLowerCase()));   // los códigos de sala (MAYÚSCULAS y cifras) no cuentan
      if (sueltos.length) malos.push(`inglés suelto en chino: «${t}» (${sueltos.join(', ')})`);
    }
  }
  const avisos = (p.avisos || []).splice(0);
  for (const a of avisos) malos.push(`el cliente avisó: ${a}`);
  ok(malos.length === 0, `[${idioma}] ${donde}: ${textos.length} textos visibles, sin español colado ni claves crudas`);
  for (const m of [...new Set(malos)].slice(0, 8)) info(`  ↳ ${m}`);
}

async function sinDesborde(p, idioma, donde) {
  const r = await p.evaluate(() => {
    const w = innerWidth, mal = [];
    if (document.documentElement.scrollWidth > w + 1) mal.push(`la página mide ${document.documentElement.scrollWidth} > ${w}`);
    const activos = '.screen.active *, #qteOverlay.active *, #gameOverOverlay.active *, #verifyOverlay.active *, #cuentaAtras.on *, .ag-toast, #verifyNotifications *, #reconnectOverlay *';
    for (const el of document.querySelectorAll(activos)) {
      if (el.closest('.piles-titulo, #fxLayer, #setNav, #hud, .card') || !el.checkVisibility?.({ checkVisibilityCSS: true })) continue;
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      const txt = (el.textContent || '').trim().slice(0, 24);
      if (b.right > w + 1 || b.left < -1) mal.push(`${el.tagName.toLowerCase()}.${el.className || el.id} se sale (${Math.round(b.left)}..${Math.round(b.right)}) «${txt}»`);
      const cs = getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 1 && ['hidden', 'clip'].includes(cs.overflowX) && cs.textOverflow !== 'ellipsis' && el.children.length === 0 && txt) {
        mal.push(`${el.tagName.toLowerCase()}.${el.className || el.id} corta el texto (${el.scrollWidth} > ${el.clientWidth}) «${txt}»`);
      }
    }
    return mal;
  });
  ok(r.length === 0, `[${idioma}] ${donde}: sin desbordes en ${p.viewportSize().width}x${p.viewportSize().height}`);
  for (const m of r.slice(0, 6)) info(`  ↳ ${m}`);
}

async function foto(p, idioma, nombre, vp, completa = false) {
  await p.screenshot({ path: path.join(capturas, `idiomas-${idioma}-${nombre}-${vp.width}x${vp.height}.png`), fullPage: completa });
}

async function pestana(idioma, viewport, nick = null, extra = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, ...extra });
  await ctx.addInitScript(([l, n]) => {
    try { localStorage.setItem('piles.lang', l); if (n) localStorage.setItem('piles_nickname', n); } catch { /* */ }
  }, [idioma, nick]);
  const p = await ctx.newPage();
  p.errores = []; p.avisos = [];
  p.on('pageerror', e => p.errores.push(e.message));
  p.on('console', m => { if (m.type() === 'warning' && m.text().includes('i18n:')) p.avisos.push(m.text()); });
  return p;
}
const abrir = async (p, url = '/lobby.html') => { await p.goto(base + url, { waitUntil: 'networkidle' }); };
const inyectar = (p, m) => p.evaluate(m => handleMsg(m), m);
const ENTRAR_SALA = async (p, nick) => {
  await p.locator('#nickname').fill(nick);
  await p.locator('button[onclick="showScreen(\'hostScreen\')"]').click();
  await p.locator('button[onclick="createLobby()"]').click();
  await p.locator('#lobbyScreen.active').waitFor({ timeout: 6000 });
  return (await p.locator('#lobbyCodeDisplay').textContent()).trim();
};

// ═══ Por idioma ═════════════════════════════════════════════════════════════
for (const L of IDIOMAS) {
  console.log(`\n══ ${L} ══`);
  for (const vp of [MOV, DESK]) {
    const movil = vp === MOV;
    const p = await pestana(L, vp);
    await abrir(p);
    ok(await p.evaluate(() => document.documentElement.lang) === HTML_LANG[L], `[${L}] <html lang> = ${HTML_LANG[L]}`);
    ok(await p.locator(`#homeScreen .lang-btn[data-lang="${L}"][aria-pressed="true"]`).count() === 1, `[${L}] el selector marca ${L}`);
    await wait(500);
    await revisar(p, L, `portada ${vp.width}`); await sinDesborde(p, L, 'portada'); await foto(p, L, 'portada', vp);

    // Un servidor de pruebas con una sala pública para ver la lista de «Unirse».
    const zoe = await crear('Zoe');
    await p.locator('.profile-btn').click();
    await p.locator('#tauntList .taunt-row').first().waitFor();
    await wait(1200);
    await revisar(p, L, `perfil ${vp.width}`); await sinDesborde(p, L, 'perfil'); await foto(p, L, 'perfil', vp);
    await p.locator('#tauntList input[value="honk"]').check();
    await revisar(p, L, 'perfil con burla elegida');
    await p.locator('#profileScreen .back-btn').click();

    if (movil) {
      await p.locator('button[onclick="openTutorial()"]').click();
      for (let i = 0; i < 3; i++) {
        await revisar(p, L, `cómo jugar, paso ${i + 1}`);
        if (i === 0) { await sinDesborde(p, L, 'cómo jugar'); await foto(p, L, 'tutorial', vp); }
        if (i < 2) await p.locator('#tutNext').click();
      }
      await p.locator('#tutNext').click();           // «Empezar» vuelve a la portada
      await p.locator('button[onclick="showScreen(\'hostScreen\')"]').click();
      await revisar(p, L, 'nueva sala'); await sinDesborde(p, L, 'nueva sala'); await foto(p, L, 'nueva-sala', vp);
      await p.locator('#visibilityGroup .seg-btn[data-public="0"]').click();
      await revisar(p, L, 'nueva sala privada');
      await p.locator('#hostScreen .back-btn').click();
    }

    await p.locator('button[onclick="openJoinScreen()"]').click();
    await p.locator('#lobbyList .lobby-row').first().waitFor({ timeout: 5000 });
    await revisar(p, L, `unirse con lista ${vp.width}`); await sinDesborde(p, L, 'unirse'); await foto(p, L, 'unirse', vp);
    zoe.ws.close();
    await p.context().close();
  }

  // ── Sala de espera con bots, chat, cuenta atrás y partida ──────────────────
  const A = await pestana(L, MOV);
  await abrir(A);
  const codigo = await ENTRAR_SALA(A, 'Ana');
  await A.locator('button[onclick="addBot()"]').click();
  await A.locator('#playerList li').nth(1).waitFor();
  await A.locator('#chatInput').fill('<b>ok</b> 👍');
  await A.locator('#chatInput').press('Enter');
  await A.locator('#chatLog .chat-line').first().waitFor();
  await wait(400);
  await revisar(A, L, 'sala de espera'); await sinDesborde(A, L, 'sala de espera'); await foto(A, L, 'sala', MOV);
  await A.setViewportSize(DESK); await wait(300);
  await sinDesborde(A, L, 'sala de espera'); await foto(A, L, 'sala', DESK);
  await A.setViewportSize(MOV);

  // Errores reales del servidor, con su código y sus datos.
  const D = await pestana(L, MOV);
  await abrir(D);
  await D.locator('#nickname').fill('Ana');
  await D.locator('button[onclick="openJoinScreen()"]').click();
  await D.locator('#lobbyCode').fill(codigo);
  await D.locator('button[onclick="joinLobby()"]').click();
  const toast = await D.locator('.ag-toast-msg').first().waitFor({ timeout: 4000 }).then(() => D.locator('.ag-toast-msg').first().textContent());
  const esperado = await D.evaluate(() => t('err.name_taken', { nick: 'Ana' }));
  ok(toast === esperado && (L === 'es' || !/Ya hay alguien/.test(toast)), `[${L}] el error real «nombre ocupado» sale traducido y con el apodo: «${toast}»`);
  await revisar(D, L, 'error de nombre ocupado'); await foto(D, L, 'error', MOV);
  await D.context().close();

  // Cuenta atrás (3-2-1) y partida
  await A.locator('#readyBtn').click();
  await A.locator('#cuentaAtras.on').waitFor({ timeout: 4000 });
  await revisar(A, L, 'cuenta atrás'); await foto(A, L, 'cuenta', MOV);
  await A.locator('#gameScreen.active').waitFor({ timeout: 10000 });
  await wait(900);
  await revisar(A, L, 'tablero'); await sinDesborde(A, L, 'tablero'); await foto(A, L, 'partida', MOV);
  await A.setViewportSize(DESK); await wait(300);
  await revisar(A, L, 'tablero escritorio'); await sinDesborde(A, L, 'tablero escritorio'); await foto(A, L, 'partida', DESK);
  await A.setViewportSize(MOV);

  // Un espectador entra a mirar la partida en marcha.
  const E = await pestana(L, MOV, 'Eva');
  await abrir(E, `/lobby.html?join=${codigo}`);
  await E.locator('#gameScreen.active').waitFor({ timeout: 8000 });
  await E.locator('#specSeats .spec-seat').first().waitFor({ timeout: 4000 });
  await wait(500);
  await revisar(E, L, 'espectador mirando a uno'); await sinDesborde(E, L, 'espectador'); await foto(E, L, 'espectador', MOV);
  await E.locator('#specSeats .spec-seat[data-nick="*"]').click();
  await revisar(E, L, 'espectador mirando a todos');
  await E.context().close();

  // Jugadas rechazadas con su código: el aviso del tablero sale traducido.
  await A.evaluate(() => {
    window.__m = [];
    const o = ws.onmessage;
    ws.onmessage = e => { try { const m = JSON.parse(e.data); if (m.type === 'swap_failed' || m.type === 'error') __m.push(m); } catch { /* */ } o(e); };
  });
  await A.evaluate(() => send({ type: 'take_card', card_id: centerCards[0].id }));
  await A.waitForFunction(() => __m.some(m => m.type === 'swap_failed'), null, { timeout: 3000 });
  const sf = await A.evaluate(() => { const m = __m.find(m => m.type === 'swap_failed'); return { code: m.code, texto: srvText(m, 'swapfail'), esperado: t('swapfail.no_debt') }; });
  ok(sf.code === 'no_debt' && sf.texto === sf.esperado && (L === 'es' || !/Suelta/.test(sf.texto)), `[${L}] swap_failed real (coger sin deber) llega con su code y sale traducido: «${sf.texto}»`);
  await A.evaluate(() => send({ type: 'switch_set', set_index: 9 }));
  await A.waitForFunction(() => __m.some(m => m.type === 'error'), null, { timeout: 3000 });
  const er = await A.evaluate(() => { const m = __m.find(m => m.type === 'error'); return { code: m.code, texto: srvText(m, 'err'), esperado: t('err.bad_set_index') }; });
  ok(er.code === 'bad_set_index' && er.texto === er.esperado, `[${L}] error real del servidor (set inválido) llega con su code y sale traducido: «${er.texto}»`);
  await A.locator('.ag-toast-msg').filter({ hasText: er.texto }).first().waitFor({ timeout: 3000 });
  await revisar(A, L, 'toast de error');

  // Pelea y desempate (lo que no se puede provocar a voluntad), inyectados.
  await A.evaluate(() => { document.querySelectorAll('.ag-toast').forEach(e => e.remove()); });
  const carta = await A.evaluate(() => centerCards[0].id);
  await inyectar(A, { type: 'swap_conflict', players: ['Ana', '🤖 Bot 1'], card_id: carta, qte_duration: 6000 });
  await inyectar(A, { type: 'qte_update', card_id: carta, clicks: { 'Ana': 3, '🤖 Bot 1': 2 } });
  await revisar(A, L, 'pelea (overlay)'); await sinDesborde(A, L, 'pelea'); await foto(A, L, 'pelea', MOV);
  await inyectar(A, { type: 'qte_tiebreak', card_id: carta, round: 2, duration: 4000 });
  await revisar(A, L, 'desempate'); await sinDesborde(A, L, 'desempate'); await foto(A, L, 'desempate', MOV);
  await inyectar(A, { type: 'qte_resolved', card_id: carta, winner: 'Ana', clicks: { 'Ana': 4, '🤖 Bot 1': 4 }, tiebreaks: 3, random: true });
  await revisar(A, L, 'pelea resuelta al azar');
  await wait(2000);
  await inyectar(A, { type: 'swap_conflict', players: ['Beto', 'Caro'], card_id: 9999, qte_duration: 6000 });
  await inyectar(A, { type: 'qte_update', card_id: 9999, clicks: { Beto: 5, Caro: 4 } });
  await inyectar(A, { type: 'qte_tiebreak', card_id: 9999, round: 1, duration: 3000 });
  await wait(500);   // los avisos entran deslizándose: se mide ya asentados
  await revisar(A, L, 'aviso de pelea ajena'); await sinDesborde(A, L, 'aviso de pelea ajena');
  await inyectar(A, { type: 'qte_resolved', card_id: 9999, winner: 'Beto' });

  // Caída, encuesta, regreso, abandono
  await inyectar(A, { type: 'player_disconnected', nickname: 'Beto', seconds: 30 });
  await wait(500);
  await revisar(A, L, 'jugador caído'); await foto(A, L, 'caida', MOV);
  await inyectar(A, { type: 'wait_poll', nickname: 'Beto', seconds: 15 });
  await wait(500);
  await revisar(A, L, 'encuesta «¿seguimos esperando?»'); await sinDesborde(A, L, 'encuesta'); await foto(A, L, 'encuesta', MOV);
  await A.locator('.wait-poll-btns .wp-si').click();
  await revisar(A, L, 'encuesta votada');
  await inyectar(A, { type: 'wait_poll_closed', nickname: 'Beto', result: 'volvio' });
  await revisar(A, L, 'jugador vuelve');
  await inyectar(A, { type: 'player_left', nickname: 'Beto', retired: ['Bufanda', 'Guantes'], retired_types: [44, 45] });
  await revisar(A, L, 'jugador se va y se retiran prendas');
  ok((await A.locator('#verifyNotifications').textContent()).includes(await A.evaluate(() => t('grace.out', { list: t('cloth.44') + t('list.sep') + t('cloth.45') }))),
    `[${L}] las prendas retiradas se nombran en el idioma de la pestaña`);

  // Bloqueo, deuda forzada, racha y frenesí
  await inyectar(A, { type: 'combo_update', combo: 3, multiplier_x100: 150, window_ms: 4000, points: 10, frenzy_ready: true, frenzy_cost_x100: 150 });
  await inyectar(A, { type: 'debt_forced', card: { id: 176, clothing_type: 44, name: 'Bufanda' } });
  await revisar(A, L, 'carta asignada por el plazo, racha y frenesí'); await foto(A, L, 'racha', MOV);
  await inyectar(A, { type: 'frenzy_fired', player: 'Beto', countered: [], stunned: ['Ana'] });
  await revisar(A, L, 'frenesí ajeno');
  await inyectar(A, { type: 'frenzy_fired', player: 'Beto', countered: ['Ana'], stunned: [] });
  await revisar(A, L, 'frenesí parado');

  // Verificación propia (fallida y luego correcta) y ajena
  await inyectar(A, { type: 'verification_started', player: 'Beto' });
  await inyectar(A, { type: 'verification_started', player: 'Ana' });
  const cuatro = (t) => [0, 1, 2, 3].map(v => ({ id: t * 4 + v, clothing_type: t, name: 'x' }));
  for (let i = 0; i < 6; i++) await inyectar(A, { type: 'set_verification_result', player: 'Ana', set_index: i, is_valid: i % 2 === 0, cards: cuatro(10 + i) });
  await inyectar(A, { type: 'verification_failed', player: 'Ana', failed_sets: [1, 3, 5] });
  await inyectar(A, { type: 'verification_failed', player: 'Beto', failed_sets: [2] });
  await wait(500);
  await revisar(A, L, 'verificación fallida'); await sinDesborde(A, L, 'verificación'); await foto(A, L, 'verificacion', MOV);
  await inyectar(A, { type: 'verification_success', player: 'Ana', position: 2 });
  await inyectar(A, { type: 'verification_started', player: 'Caro' });
  await inyectar(A, { type: 'verification_success', player: 'Caro', position: 1 });
  await revisar(A, L, 'verificación correcta');
  await A.locator('#verifyCloseBtn').click();

  // Cuenta atrás cancelada, expulsión y fin
  await A.evaluate(() => startCountdown(3));
  await inyectar(A, { type: 'countdown_cancelled', reason: 'joined' });
  await revisar(A, L, 'cuenta atrás cancelada');
  await inyectar(A, { type: 'game_over',
    rankings: [
      { position: 1, nickname: 'Ana', points: 120, combo_points: 20, best_combo: 4, best_mult_x100: 175 },
      { position: 2, nickname: '🤖 Bot 1', points: 80, combo_points: 0, best_combo: 1, best_mult_x100: 100 },
    ],
    elo: [{ nickname: 'Ana', pool: 'fun', before: 1090, after: 1112, top3_before: false, top3_after: false }] });
  await wait(2800);
  await revisar(A, L, 'fin de partida con rango'); await sinDesborde(A, L, 'fin de partida'); await foto(A, L, 'fin', MOV);
  await A.setViewportSize(DESK); await wait(300);
  await sinDesborde(A, L, 'fin de partida'); await foto(A, L, 'fin', DESK);
  await A.setViewportSize(MOV);
  await A.locator('button[onclick="returnToLobby()"]').click();
  await inyectar(A, { type: 'game_cancelled', reason: 'Beto se desconectó', code: 'disconnected', args: { nick: 'Beto' } });
  const cancelado = await A.evaluate(() => t('cancel.disconnected', { nick: 'Beto' }));
  await A.locator('.ag-toast-msg').filter({ hasText: cancelado }).first().waitFor({ timeout: 3000 });
  ok(true, `[${L}] «partida cancelada» traducida con el apodo`);
  await revisar(A, L, 'partida cancelada');
  // Un código que esta versión del cliente no conoce: se enseña el texto del servidor, sin romper.
  await inyectar(A, { type: 'error', message: 'Texto de respaldo del servidor', code: 'codigo_que_no_existe' });
  ok((await A.locator('.ag-toast-msg').allTextContents()).includes('Texto de respaldo del servidor'), `[${L}] un código desconocido cae al texto del servidor`);
  await inyectar(A, { type: 'error', message: 'Mensaje sin código (servidor viejo)' });
  ok((await A.locator('.ag-toast-msg').allTextContents()).includes('Mensaje sin código (servidor viejo)'), `[${L}] un error sin código se enseña tal cual`);
  ok(A.errores.length === 0, `[${L}] sin errores de JavaScript${A.errores.length ? ': ' + A.errores.join(' | ') : ''}`);

  // ── Votación para echar, con tres personas ─────────────────────────────────
  {
    const a = await pestana(L, DESK); await abrir(a);
    const cod = await ENTRAR_SALA(a, 'Ana');
    const b = await pestana(L, MOV, 'Beto'); await abrir(b, `/lobby.html?join=${cod}`);
    const c = await pestana(L, MOV, 'Caro'); await abrir(c, `/lobby.html?join=${cod}`);
    await b.locator('#lobbyScreen.active').waitFor({ timeout: 6000 });
    await a.waitForFunction(() => document.querySelectorAll('#playerList li').length === 3);
    await a.locator('#playerList li', { has: a.locator('.player-name', { hasText: 'Caro' }) }).locator('.kick-human').click();
    await b.locator('.kick-poll').waitFor({ timeout: 4000 });
    await wait(400);
    await revisar(b, L, 'votación para echar (votante)'); await sinDesborde(b, L, 'votación'); await foto(b, L, 'votacion', MOV, true);
    await revisar(c, L, 'votación para echar (votado)');
    await revisar(a, L, 'votación para echar (quien la abrió)'); await foto(a, L, 'votacion', DESK, true);
    await b.locator('.kick-btns .btn-secondary').click();           // «No»: se cancela
    await a.waitForFunction(() => document.querySelector('.kick-q'), null, { timeout: 4000 });
    await revisar(a, L, 'resultado de la votación');
    await wait(4400);
    // Cooldown: repetir el mismo par enseña el error con los segundos y el apodo.
    await a.locator('#playerList li', { has: a.locator('.player-name', { hasText: 'Caro' }) }).locator('.kick-human').click();
    const cd = await a.locator('.ag-toast-msg').first().waitFor({ timeout: 3000 }).then(() => a.locator('.ag-toast-msg').first().textContent());
    ok(/\d/.test(cd) && cd.includes('Caro') && (L === 'es' || !/Espera/.test(cd)), `[${L}] error real «espera para volver a votar» con segundos y apodo: «${cd}»`);
    await revisar(a, L, 'error de enfriamiento');
    // Y el expulsado (Beto vota Sí contra Caro con otro par: Ana abre contra Beto, Caro vota Sí).
    await a.locator('#playerList li', { has: a.locator('.player-name', { hasText: 'Beto' }) }).locator('.kick-human').click();
    await c.locator('.kick-btns .btn-primary').click();
    await b.locator('#joinScreen.active').waitFor({ timeout: 5000 });
    await b.locator('.ag-toast').first().waitFor();
    await revisar(b, L, 'expulsado'); await foto(b, L, 'expulsado', MOV);
    await a.locator('.ag-toast').filter({ hasText: /Beto/ }).first().waitFor({ timeout: 3000 });
    await revisar(a, L, 'aviso «fue expulsado»');
    // Beto no puede volver: el error trae los minutos.
    await b.evaluate(code => { document.getElementById('lobbyCode').value = code; joinLobby(); }, cod);
    const vuelta = await b.evaluate(() => t('err.kicked_wait', { min: 5 }));
    await b.waitForFunction(s => [...document.querySelectorAll('.ag-toast-msg')].some(e => e.textContent === s), vuelta, { timeout: 4000 });
    await revisar(b, L, 'no puede volver tras la expulsión');
    for (const [n, p] of [['Ana', a], ['Beto', b], ['Caro', c]]) ok(p.errores.length === 0, `[${L}] ${n}: sin errores de JavaScript${p.errores.length ? ': ' + p.errores.join(' | ') : ''}`);
    for (const p of [a, b, c]) await p.context().close();
  }
  await A.context().close();
}

// ═══ Elegir idioma, persistir, respaldo, fuente ═════════════════════════════
console.log('\n══ elegir idioma ══');
{
  // Sin nada guardado: manda navigator.language (zh* → zh, en* → en, lo demás → es).
  for (const [locale, esperado] of [['en-US', 'en'], ['en-GB', 'en'], ['zh-CN', 'zh'], ['zh-TW', 'zh'], ['fr-FR', 'es'], ['es-PE', 'es'], ['pt-BR', 'es']]) {
    const ctx = await browser.newContext({ locale, viewport: MOV });
    const p = await ctx.newPage();
    await p.goto(base + '/lobby.html', { waitUntil: 'networkidle' });
    const r = await p.evaluate(() => [PilesI18n.lang, document.documentElement.lang, localStorage.getItem('piles.lang')]);
    ok(r[0] === esperado && r[1] === HTML_LANG[esperado] && r[2] === null, `navigator.language ${locale} → ${esperado} (<html lang="${r[1]}">, sin guardar nada)`);
    await ctx.close();
  }

  // El selector de la portada y el del perfil: cambian, persisten tras recargar y conservan la pantalla.
  const ctx = await browser.newContext({ locale: 'es-ES', viewport: MOV });
  const p = await ctx.newPage();
  p.errores = []; p.on('pageerror', e => p.errores.push(e.message));
  await p.goto(base + '/lobby.html', { waitUntil: 'networkidle' });
  ok(await p.locator('.home-actions button').first().textContent() === '❓ Cómo jugar', 'arranca en español');
  await p.locator('#homeScreen .lang-btn[data-lang="zh"]').click();
  await p.waitForFunction(() => document.documentElement.lang === 'zh-CN');
  ok(await p.evaluate(() => localStorage.getItem('piles.lang')) === 'zh', 'el botón 中文 guarda piles.lang = zh y recarga');
  ok(await p.locator('.home-actions button').first().textContent() === '❓ 玩法', 'la portada pasa a chino');
  await p.reload({ waitUntil: 'networkidle' });
  ok(await p.evaluate(() => [document.documentElement.lang, PilesI18n.lang].join()) === 'zh-CN,zh', 'tras recargar sigue en chino (persiste)');
  const fuente = await p.evaluate(() => getComputedStyle(document.body).fontFamily);
  ok(/Microsoft YaHei|PingFang SC|Noto Sans CJK SC/.test(fuente) && /Geist/.test(fuente), `la pila tipográfica del chino lleva una fuente CJK del sistema detrás de Geist (${fuente.slice(0, 70)}…)`);
  await p.locator('.profile-btn').click();
  await p.locator('#profileScreen .lang-btn[data-lang="en"]').click();
  await p.waitForFunction(() => document.documentElement.lang === 'en');
  ok(await p.locator('#profileScreen.active').count() === 1 && /Profile/.test(await p.locator('#profileScreen h2').textContent()), 'cambiar desde el perfil recarga y vuelve al perfil, ya en inglés');
  ok(await p.evaluate(() => localStorage.getItem('piles.lang')) === 'en', 'persiste: en');
  await p.locator('#profileScreen .lang-btn[data-lang="es"]').click();
  await p.waitForFunction(() => document.documentElement.lang === 'es');
  ok(/Perfil/.test(await p.locator('#profileScreen h2').textContent()), 'y de vuelta a español');

  // Cambiar de idioma estando en una sala la conserva (el asiento vive en localStorage).
  await p.locator('#profileScreen .back-btn').click();
  const cod = await ENTRAR_SALA(p, 'Ana');
  await p.evaluate(() => PilesI18n.setLang('en'));
  await p.waitForFunction(() => document.documentElement.lang === 'en');
  await p.locator('#lobbyScreen.active').waitFor({ timeout: 8000 });
  await p.waitForFunction(c => document.getElementById('lobbyCodeDisplay').textContent.trim() === c, cod, { timeout: 6000 });
  ok(/Leave room/.test(await p.locator('#lobbyScreen .back-btn').textContent()) && (await p.locator('#playerList li').count()) === 1,
    `cambiar de idioma dentro de la sala ${cod}: recarga y vuelve a ella, ya en inglés`);
  await p.evaluate(() => PilesI18n.setLang('es'));
  await p.waitForFunction(() => document.documentElement.lang === 'es');
  await ctx.close();

  // Respaldo: si falta una clave en el idioma activo cae a español; si falta en todos, la clave y un aviso.
  const z = await pestana('zh', MOV); z.avisos = [];
  await abrir(z);
  const r = await z.evaluate(() => {
    const D = PilesI18n.dict();
    const sin = D['home.name'].zh; delete D['home.name'].zh;
    const caeAEs = t('home.name');
    D['home.name'].zh = sin;
    const cruda = t('clave.que.no.existe');
    return { caeAEs, cruda, plural1: t('hud.watching', { n: 1 }), plural3: t('hud.watching', { n: 3 }), interp: t('kick.q', { nick: 'Ana' }), sinVar: t('kick.q') };
  });
  ok(r.caeAEs === 'Tu nombre', 'falta en zh → cae a español, sin romper');
  ok(r.cruda === 'clave.que.no.existe' && z.avisos.some(a => a.includes('clave.que.no.existe')), 'falta en todos → devuelve la clave y avisa por consola');
  ok(r.interp === '踢出 Ana？' && /\{nick\}/.test(r.sinVar), `interpolación (${r.interp}) y variable sin dar (${r.sinVar}) no revienta`);
  ok(r.plural3 === '3 人正在观战', `plural en zh (${r.plural3})`);
  await z.context().close();
  const en = await pestana('en', MOV);
  await abrir(en);
  const pl = await en.evaluate(() => [t('hud.watching', { n: 1 }), t('hud.watching', { n: 3 }), t('pos.ord', { n: 1 }), t('pos.ord', { n: 2 }), t('pos.ord', { n: 4 })]);
  ok(pl.join('|') === 'One person is watching|3 people are watching|1st|2nd|4th', `plurales y ordinales en inglés (${pl.join(' | ')})`);
  await en.context().close();
  ok(p.errores.length === 0, `sin errores de JavaScript${p.errores.length ? ': ' + p.errores.join(' | ') : ''}`);
}

// ═══ replay.html ════════════════════════════════════════════════════════════
console.log('\n══ replay.html ══');
for (const L of IDIOMAS) {
  const p = await pestana(L, DESK);
  await p.goto(base + '/replay.html', { waitUntil: 'networkidle' });
  ok(await p.evaluate(() => document.documentElement.lang) === HTML_LANG[L], `[${L}] replay: <html lang>`);
  await revisar(p, L, 'lista de grabaciones');
  const filas = await p.locator('tbody tr').count();
  if (filas) {
    await p.locator('tbody tr').first().click();
    await p.locator('.barra').first().waitFor({ timeout: 5000 });
    await p.locator('#scrub').evaluate(e => { e.value = e.max; e.dispatchEvent(new Event('input')); });
    await revisar(p, L, 'visor de una grabación'); await sinDesborde(p, L, 'visor');
    await foto(p, L, 'replay', DESK);
  } else info(`[${L}] no hay grabaciones que abrir en el visor`);
  ok(p.errores.length === 0, `[${L}] replay: sin errores de JavaScript`);
  await p.context().close();
}

info(`capturas en ${capturas}`);
await browser.close();
fin();
