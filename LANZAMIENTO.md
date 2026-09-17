# Plan para que Piles llegue a gente

Guía, no guion. **Aquí no hay ni un texto listo para copiar y pegar**: lo que se
publique tiene que estar escrito con tus palabras, porque en estos sitios se
nota inmediatamente cuando no lo está, y eso es justo lo que hace que te
entierren. Lo que hay aquí son las reglas de cada sitio, el orden en que
conviene hacer las cosas, y de dónde sale cada afirmación.

Cada punto lleva su fuente. Donde no he podido verificar algo de primera mano,
lo digo.

---

## 0. Antes de nada: esto cambia el juego, no solo su difusión

En `MEMORY.md` y en las decisiones de este repo está escrito que Piles es **un
juego entre amigos y que por eso no hay anti-trampas**. Varias decisiones se
tomaron encima de esa premisa.

Si el objetivo pasa a ser que entre gente desconocida, esa premisa deja de ser
cierta, y conviene decidirlo a propósito y no por accidente:

- El servidor es la única fuente de verdad para el estado del juego (eso está
  bien y es lo que impide lo peor), pero **no hay ningún límite de frecuencia**:
  nada impide que alguien automatice los clicks de una pelea y las gane todas.
  Entre amigos daba igual. En abierto, es el primer agujero que se nota.
- Los nombres los elige quien entra y no se validan contra nada.
- Las salas públicas son visibles para cualquiera.

**No hace falta resolverlo antes de enseñar el juego**, pero sí antes de
buscar volumen. Una racha de "esto está roto" en un hilo con tracción hace más
daño que no haber publicado.

---

## 1. Qué hay que tener listo antes de publicar en ningún sitio

Esto es lo que se repite en todas las fuentes, y lo que más barato sale
preparar.

**Que se pueda jugar en el navegador sin registrarse.** En itch.io está medido
que poder jugar en el navegador «importa MUCHÍSIMO» para que un juego se
descubra ([itch.io, hilo de desarrollo][itch-disc]). Y las reglas de Show HN
piden explícitamente quitar barreras como registros o pedir el correo
([Show HN, guía oficial][showhn]). Piles ya cumple las dos: se entra por enlace
y se juega. Es su mayor ventaja y conviene no perderla nunca.

**Que se entienda en cinco segundos sin leer.** Un GIF corto del tablero con una
pelea y el multiplicador subiendo dice más que cualquier descripción. En estos
sitios la gente decide con la imagen.

**Que aguante que entren a la vez.** Ahora mismo es un VPS de 2 núcleos
compartido con producción y con el correo (ver `DEPLOY.md`). Antes de mandar
gente hay que saber cuántas partidas simultáneas aguanta. Es una prueba que se
puede hacer con los mismos scripts de `tools/*-test.mjs` lanzando varias salas
a la vez.

**Cerrar las grabaciones y el modo espectador.** Las dos cosas están bien entre
amigos y mal en abierto, y hay que decidirlo antes de mandar a nadie:

- El servidor graba **todas** las partidas en `recordings/`, y esa grabación
  lleva la mano de cada jugador. `/api/recordings` no pide nada: quien tenga el
  enlace la abre. Antes de abrir el juego hay que pedir sesión en esos dos
  endpoints, o dejar de grabar las salas públicas.
- Cualquiera que tenga el código de una sala puede entrar a mirar una partida
  en curso. Se hizo así a propósito —entre amigos da igual que un espectador le
  sople cartas a alguien—, pero con desconocidos es una forma de hacer trampas
  que no cuesta nada. Lo mínimo sería que solo se pueda mirar en salas privadas,
  o que quien hospeda lo pueda apagar.

**Un sitio tuyo donde recoger a quien le guste.** La recomendación central de
Chris Zukowski (el analista de marketing indie más citado, que publica sobre
datos y no sobre intuiciones) es que el centro de todo sea algo que controles tú
—tu dominio, tu lista de correo—, y no una cuenta en una plataforma ajena
([How To Market A Game][htmag], [entrevista en Game Developer][gamedev]). Para
Piles, lo mínimo es tener a dónde volver: el propio dominio ya lo tienes.

---

## 2. Dónde publicar, y con qué reglas

### itch.io — el sitio más natural para esto

Es donde un juego de navegador gratis encaja sin fricción.

Lo que dice la documentación de itch.io:

- **Estar indexado no es automático.** Si tu página no está indexada sigue
  siendo pública y se puede compartir, pero **no aparece en su buscador ni en
  Browse** ([itch.io, Getting indexed][itch-index]).
- **Las etiquetas importan**, y hay que poner las que de verdad describen el
  juego ([itch.io, Getting indexed][itch-index]).
- **Los títulos de una sola palabra común perjudican** la búsqueda aunque estés
  indexado ([itch.io, Getting indexed][itch-index]). "Piles" es exactamente ese
  caso: conviene un título compuesto.
- **Los devlogs pueden influir en cómo se ordena tu página** y sirven para
  anunciar cambios ([itch.io, Getting indexed][itch-index]).

Eso último encaja con cómo trabajas ya: cada tanda de arreglos de estas es un
devlog natural. No hay que inventarse contenido, solo contar lo que ya pasó.

### Reddit — el sitio con más alcance y más formas de que te echen

**Aviso de verificación:** no he podido abrir las páginas oficiales de Reddit
desde aquí (bloquean el acceso automático), así que lo de abajo viene de fuentes
secundarias y hay que **confirmarlo leyendo las reglas de cada comunidad antes
de publicar**. Es rápido y es lo que marca la diferencia.

- La regla que todo el mundo cita —«nueve aportaciones normales por cada
  autopromoción»— es **una convención de la comunidad, no una regla
  automática**. El espíritu que sí es oficial: participa donde de verdad te
  interesa el tema, y no manipules ([resumen de la política de contenidos de
  Reddit][reddit-rules], sin verificar en origen).
- **Cada subreddit manda sobre el suyo.** El mismo mensaje puede ser bienvenido
  en uno y borrado en otro.

Comunidades que encajan con un juego de navegador (**leer el sidebar de cada
una antes**, estas normas cambian):

| Dónde | Lo que hay que saber |
|---|---|
| r/playmygame | Está hecha para esto |
| r/WebGames | Suele pedir que ya seas parte de la comunidad antes de publicar lo tuyo |
| r/incremental_games | Autopromoción solo en su hilo de los viernes |

(Fuente: [recopilación sobre subreddits de juegos de navegador][subs]. Es una
fuente secundaria — un blog —, así que trátala como punto de partida y confirma
en cada sidebar.)

Lo que de verdad funciona aquí no es el enlace: es **participar de antemano**.
Una cuenta que lleva semanas comentando en r/WebGames publica en otra liga que
una cuenta creada ayer.

### Hacker News — una sola bala, y hay reglas claras

Show HN encaja bien con Piles porque piden justo lo que tienes: algo con lo que
se pueda jugar ya. De su guía oficial ([Show HN][showhn]):

- Vale «algo que hayas hecho y con lo que otros puedan jugar». **No** valen
  entradas de blog, páginas de registro ni listas de espera.
- Tienes que haberlo hecho tú y **estar disponible para responder** en el hilo.
- **Quita barreras**: nada de registros ni correo obligatorio.
- **No pidas votos ni comentarios a conocidos.** Esto es motivo de sanción.
- El título empieza por `Show HN:`.

Lo importante: es efectivamente **una sola oportunidad**. Publícalo cuando el
juego aguante a desconocidos, no antes.

### X / Twitter

Sirve sobre todo para el vídeo corto y para que lo vean otros que hacen juegos.
Un clip de una pelea con el frenesí disparándose funciona mejor que cualquier
explicación. No esperes que traiga jugadores por sí solo; sí sirve como archivo
de lo que vas haciendo.

---

## 3. En qué orden

1. **Cerrar el bucle con quien ya juega.** Tus partidas de beta son el mejor
   dato que tienes. Una partida de 4 que termina y deja a la gente queriendo
   otra es el requisito de todo lo demás.
2. **Arreglar lo del punto 0** hasta donde decidas.
3. **Página de itch.io**, indexada, con etiquetas de verdad y un título que no
   sea una palabra suelta.
4. **Empezar a existir en las comunidades** donde vayas a publicar. Semanas,
   no horas.
5. **Publicar en las que lo permiten**, una cada vez y espaciadas. Si algo sale
   mal, quieres enterarte con una comunidad, no con cuatro.
6. **Show HN** cuando el juego aguante un pico de gente a la vez.
7. **Devlogs** con cada tanda. Esto no se acaba: es lo que mantiene viva la
   página.

---

## 4. Cómo saber si funciona

Métete un contador de partidas empezadas y terminadas antes de publicar nada. Si
no, no vas a poder distinguir «vino gente» de «vino gente y se quedó», que es la
única diferencia que importa.

La tasa que hay que mirar: **de cada diez que entran, cuántos terminan una
partida**. Si esa cifra es mala, más difusión solo sirve para que más gente vea
lo que no funciona.

---

## Fuentes

- [itch.io — Getting indexed on Search & Browse][itch-index] (documentación
  oficial)
- [Show HN — guía oficial de Hacker News][showhn]
- [itch.io — hilo sobre cómo se descubren los juegos][itch-disc] (foro, fuente
  secundaria)
- [How To Market A Game — Chris Zukowski][htmag] y [entrevista en Game
  Developer][gamedev]
- [Resumen de las reglas de autopromoción de Reddit][reddit-rules] — **sin
  verificar en origen**: Reddit bloquea el acceso automático a sus páginas
- [Recopilación de subreddits de juegos de navegador][subs] — blog, fuente
  secundaria

[itch-index]: https://itch.io/docs/creators/getting-indexed
[itch-disc]: https://itch.io/t/6222308/how-do-players-actually-discover-your-itchio-game-after-launch
[showhn]: https://news.ycombinator.com/showhn.html
[htmag]: https://howtomarketagame.com/
[gamedev]: https://www.gamedeveloper.com/marketing/game-developer-podcast-36-indie-marketing-advice-from-chris-zukowski
[reddit-rules]: https://www.conbersa.ai/learn/reddit-self-promotion-rules
[subs]: https://dinogame.gg/blog/best-browser-game-subreddits/
