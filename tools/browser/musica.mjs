// La música (client/juego/musica.ts): las dos pistas (menú y partida) suenan a la vez y sincronizadas, y se funden según dónde
// estés. Sin oído: se miran el estado del audio (ganancias, reloj, duraciones) y se muestrea el fundido.
//   node browser/musica.mjs [--base=local|beta]
import { lanzar, base } from './comun.mjs';

const espera = ms => new Promise(r => setTimeout(r, ms));
let fallos = 0;
const ok = (c, m) => { console.log((c ? 'OK    ' : 'FALLO ') + m); if (!c) fallos++; };

const b = await lanzar();
const errores = [];
async function pagina(contexto = {}) {
  const ctx = await b.newContext(contexto);
  const p = await ctx.newPage();
  p.on('pageerror', e => errores.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
  await p.goto(base + '/');
  await espera(1200);
  return p;
}
const estado = p => p.evaluate(() => juego.estadoMusica());

/** Muestrea el estado cada `cada` ms durante `ms`: [{t, menu, partida}]. */
async function muestrea(p, ms, cada = 50) {
  return p.evaluate(async ([ms, cada]) => {
    const t0 = performance.now(), out = [];
    while (performance.now() - t0 < ms) {
      const e = juego.estadoMusica();
      out.push({ t: performance.now() - t0, menu: e.menu, partida: e.partida });
      await new Promise(r => setTimeout(r, cada));
    }
    return out;
  }, [ms, cada]);
}
/** Que el fundido sea limpio: de a a b, sin saltos, de potencia constante. */
function revisa(nombre, m, desde, hasta) {
  const salto = Math.max(...m.slice(1).map((x, i) => Math.max(Math.abs(x.menu - m[i].menu), Math.abs(x.partida - m[i].partida))));
  const pot = m.map(x => x.menu ** 2 + x.partida ** 2);
  const fin = m.at(-1);
  ok(Math.abs(m[0].partida - (desde === 'menu' ? 0 : 1)) < 0.05, `${nombre}: empieza en ${desde}`);
  ok(Math.abs(fin.partida - (hasta === 'partida' ? 1 : 0)) < 0.05 && Math.abs(fin.menu - (hasta === 'menu' ? 1 : 0)) < 0.05, `${nombre}: acaba en ${hasta}`);
  ok(salto < 0.2, `${nombre}: sin saltos (el mayor escalón entre muestras de 50 ms: ${salto.toFixed(3)})`);
  ok(Math.min(...pot) > 0.8 && Math.max(...pot) < 1.2, `${nombre}: potencia constante (cos²+sen² entre ${Math.min(...pot).toFixed(2)} y ${Math.max(...pot).toFixed(2)})`);
  const ini = m.find(x => Math.abs(x.partida - (desde === 'menu' ? 0 : 1)) > 0.05)?.t, fin2 = m.find(x => Math.abs(x.partida - (hasta === 'partida' ? 1 : 0)) < 0.05 && x.t > (ini ?? 0))?.t;
  ok(ini !== undefined && fin2 !== undefined && fin2 - ini > 700 && fin2 - ini < 2200, `${nombre}: dura ~1,4 s (${Math.round(fin2 - ini)} ms)`);
}

// 1 · Los ficheros se sirven bien
{
  const p = await pagina();
  for (const f of ['menu', 'partida']) {
    const r = await p.evaluate(async f => { const x = await fetch(`/musica/${f}.ogg`); return { s: x.status, t: x.headers.get('content-type'), n: (await x.arrayBuffer()).byteLength }; }, f);
    ok(r.s === 200 && /audio\/ogg|application\/ogg/.test(r.t ?? '') && r.n > 500_000, `/musica/${f}.ogg: ${r.s} ${r.t} ${(r.n / 1e6).toFixed(2)} MB`);
  }
  // 2 · Sin gesto no suena nada; con el primer gesto arrancan las dos
  let e = await estado(p);
  ok(!e.arrancada, 'antes del primer gesto no arranca (el navegador no lo permitiría)');
  await p.mouse.click(200, 200);
  await p.waitForFunction(() => juego.estadoMusica().cargadas.length === 2, null, { timeout: 30000 }).catch(() => {});
  await espera(2500);
  e = await estado(p);
  ok(e.arrancada && e.cargadas.length === 2, `arrancan las dos pistas (${e.cargadas.join(' + ')})`);
  // El menú va a 92 (24 compases = 62,6 s); la partida a 184, con 4 compases de piano delante de su bucle de 48
  ok(Math.abs(e.largoBucle - 62.607) < 0.05 && Math.abs(e.duraciones.partida - 67.825) < 0.05 && Math.abs(e.introPartida - 5.2174) < 0.001,
     `menú ${e.duraciones.menu.toFixed(3)} s en bucle; partida ${e.duraciones.partida.toFixed(3)} s con ${e.introPartida.toFixed(3)} s de introducción`);
  ok(e.fase > 1.5 && e.fase < 5, `el menú corre (fase del bucle ${e.fase.toFixed(2)} s tras ~3 s)`);
  ok(e.menu > 0.95 && !e.partidaSonando, `en el menú suena el menú (${e.menu.toFixed(2)}) y la partida no está sonando`);
  ok(e.maestra > 0.2 && e.maestra < 0.3, `volumen general ${e.maestra.toFixed(3)} (entra poco a poco hacia 0,28)`);

  const escalon = (m, k) => Math.max(...m.slice(1).map((x, i) => Math.abs(x[k] - m[i][k])));
  // 3 · Empieza la partida: el menú se apaga (~0,5 s, sin saltos) y la partida entra DE GOLPE por su piano; acaba: de vuelta
  await p.evaluate(() => juego.startMusic());
  let m = await muestrea(p, 1500);
  e = await estado(p);
  ok(m[0].partida > 0.95 && e.partidaSonando, `la partida entra a todo volumen desde el principio (${m[0].partida.toFixed(2)})`);
  ok(m.at(-1).menu < 0.05 && escalon(m, 'menu') < 0.2, `el menú se apaga sin saltos (escalón máximo ${escalon(m, 'menu').toFixed(3)})`);
  const tMenu = m.find(x => x.menu < 0.05)?.t;
  ok(tMenu > 250 && tMenu < 1100, `…en ~0,5 s (${Math.round(tMenu)} ms)`);
  ok(e.mezcla === 1 && !e.fundiendo, 'el cambio termina y se queda quieto');
  await p.evaluate(() => juego.stopMusic());
  m = await muestrea(p, 3200);
  e = await estado(p);
  ok(m.at(-1).menu > 0.95 && m.at(-1).partida < 0.05 && !e.partidaSonando, `al acabar vuelve el menú (${m.at(-1).menu.toFixed(2)}) y la partida se para`);
  ok(escalon(m, 'menu') < 0.2 && escalon(m, 'partida') < 0.2, `partida → menú sin saltos (escalones ${escalon(m, 'partida').toFixed(3)} y ${escalon(m, 'menu').toFixed(3)})`);

  // 4 · Otra partida: vuelve a empezar por el piano. Y un cambio cortado a medias no salta
  await p.evaluate(() => juego.startMusic());
  await espera(500);
  ok((await estado(p)).partidaSonando, 'la siguiente partida arranca otra vez su pista');
  await p.evaluate(() => juego.stopMusic());
  m = await muestrea(p, 3200);
  ok(escalon(m, 'menu') < 0.2 && escalon(m, 'partida') < 0.2 && m.at(-1).menu > 0.95, `cambio cortado a medias: vuelve sin saltos (escalón máximo ${Math.max(escalon(m, 'menu'), escalon(m, 'partida')).toFixed(3)})`);

  // 4b · Un efecto agacha la música (−6 dB) mientras suena y la devuelve suave
  {
    const r = await p.evaluate(async () => {
      const lee = () => juego.estadoMusica().agache;
      const out = { antes: lee() };
      juego.playSfx('fightLost');                         // 0,3 s
      await new Promise(r => setTimeout(r, 120)); out.durante = lee();
      await new Promise(r => setTimeout(r, 1300)); out.despues = lee();
      juego.playSfx('take');                              // seguidos: no salta, se queda abajo
      await new Promise(r => setTimeout(r, 40));
      juego.playSfx('take');
      await new Promise(r => setTimeout(r, 40)); out.seguidos = lee();
      return out;
    });
    ok(r.antes > 0.98, `sin efectos la música va entera (${r.antes.toFixed(2)})`);
    ok(r.durante > 0.45 && r.durante < 0.56, `con un efecto baja a ~0,5 = −6 dB (${r.durante.toFixed(2)})`);
    ok(r.despues > 0.95, `al acabar el efecto vuelve (${r.despues.toFixed(2)})`);
    ok(r.seguidos < 0.6, `efectos seguidos: se queda agachada (${r.seguidos.toFixed(2)})`);
  }

  // 4c · Si el navegador suspende el audio (Safari: creado fuera de un gesto válido, o «interrupted» en iOS), el siguiente
  //      toque lo reanuda. Antes solo se creaba una vez y nadie lo volvía a arrancar: ni efectos ni música para siempre.
  {
    await p.evaluate(() => juego.audioCtx.suspend());
    await espera(200);
    const parado = await p.evaluate(() => juego.audioCtx.state);
    await p.mouse.click(300, 300);
    await espera(400);
    const tras = await p.evaluate(() => juego.audioCtx.state);
    ok(parado === 'suspended' && tras === 'running', `audio suspendido → un clic lo reanuda (${parado} → ${tras})`);
  }

  // 5 · Silencio: el volumen general baja a 0, las pistas siguen corriendo (sin perder la sincronía), y vuelve
  const antes = (await estado(p)).fase;
  await p.evaluate(() => juego.toggleMute());
  await espera(1200);
  e = await estado(p);
  ok(e.maestra < 0.01 && e.fase > antes, `en silencio: volumen ${e.maestra.toFixed(3)} y el reloj sigue (fase ${antes.toFixed(1)} → ${e.fase.toFixed(1)} s)`);
  await p.evaluate(() => juego.toggleMute());
  await espera(3500);
  e = await estado(p);
  ok(e.maestra > 0.25, `al activar el sonido vuelve a ${e.maestra.toFixed(3)}`);
  await p.context().close();
}

// 6 · Quien entra con el sonido ya silenciado no descarga nada hasta activarlo
{
  const ctx = await b.newContext();
  await ctx.addInitScript(() => localStorage.setItem('piles.mute', '1'));
  const p = await ctx.newPage();
  p.on('pageerror', e => errores.push(e.message));
  await p.goto(base + '/');
  await espera(1200);
  await p.mouse.click(200, 200);
  await espera(800);
  let e = await estado(p);
  ok(!e.arrancada, 'con el sonido silenciado no se descarga ni arranca nada');
  await p.evaluate(() => juego.toggleMute());
  await p.waitForFunction(() => juego.estadoMusica().cargadas.length === 2, null, { timeout: 30000 }).catch(() => {});
  e = await estado(p);
  ok(e.arrancada && e.cargadas.length === 2, 'al activar el sonido arrancan las dos');
  await ctx.close();
}

ok(errores.length === 0, `sin errores en la página (${errores.slice(0, 3).join(' | ')})`);
await b.close();
console.log(fallos ? `\n${fallos} fallos` : '\ntodo bien');
process.exit(fallos ? 1 : 0);
