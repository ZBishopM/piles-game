# El estilo musical de Piles

Qué aprendimos estudiando las cinco piezas más escuchadas de la banda sonora de
Undertale (Toby Fox) y cómo lo usamos. **Se estudian las técnicas; no se copia
ninguna melodía, progresión reconocible ni sonido.**

## De dónde sale cada dato

| marca | fuente |
|---|---|
| **[H]** | Hooktheory (análisis publicado): tonalidad, tempo, compás, progresiones, índices de complejidad. Leído el 2026-11-17. |
| **[V]** | El vídeo de Ludofonía «¿Por qué todos aman la música de Undertale?» (subtítulos). |
| **[C]** | Conocimiento general de las piezas. **No verificado con partitura**: úsese como hipótesis. |

Lo que **no** se pudo hacer: leer partituras oficiales (están tras tiendas de
pago o inicio de sesión) y separar la batería y el bajo del audio (no hay
archivos de audio). Todo lo que se dice de **percusión** es [C].

Las cinco, por reproducciones en Spotify (kworb.net, 2026-11-13): MEGALOVANIA
237,6 M · Fallen Down 220,8 M · Death by Glamour 129,5 M · Finale 99,7 M ·
Hopes and Dreams 94,4 M.

## Las cinco piezas

**MEGALOVANIA** — re menor, 120 (se siente al doble), 4/4 [H].
- Un riff de dos compases que se repite **igual** mientras el bajo baja por
  grados: i – VII – ♯vi – VI [H]. La melodía no cambia; cambia lo que significa.
- Melodía muy compleja (94/100) y con mucha tensión contra el acorde (79) [H]:
  notas de paso cromáticas, síncopas de semicorchea [C].
- Las capas entran de una en una: riff solo, luego bajo y batería, luego
  armonía, luego contramelodía [C].

**Fallen Down** — re mayor, 110, **3/4** [H].
- I – V/ii – IV – **iv** [H]: el cuarto grado menor prestado es lo que la hace
  agridulce.
- Acompañamiento en arpegio que no para; melodía de notas largas; sin batería [C].
- Su melodía es un leitmotiv que vuelve en otras piezas con otro tempo y
  compás [V][C].

**Death by Glamour** — mi dórico → mi menor → **si mayor**, 148, 4/4 [H].
- La estrofa casi no cambia de acorde (novedad 11/100); el pre-estribillo
  estalla (complejidad 90) y el estribillo **modula a la dominante mayor** [H]:
  quietud, tensión, fiesta.
- Bombo a negras, bajo en octavas, palmas [C]. Cita motivos anteriores del
  personaje [C].

**Finale** — fa menor, 190, 4/4 [H].
- iv – III⁶ – v – VI – ♯vi [H]: empieza en la subdominante y **nunca descansa
  en la tónica**; otra vez el bajo sube cromático al sexto grado elevado.
- Tensión melodía-acorde 91, novedad de progresión 87 [H].

**Hopes and Dreams** — si♭ mayor → si mayor, 171, 4/4 [H].
- Acordes simplísimos (complejidad 11/100) pero tensión 90 [H]: la emoción la
  pone la melodía apoyándose en notas que no son del acorde.
- Bajo que **sube por grados** (ii – iii – IV – V – vi) [H] y todo sube un
  semitono al final [H].
- Está hecha de leitmotivs de piezas anteriores, acelerados [V][C].

## Lo que se repite: diez reglas

1. **El bajo es una melodía.** Se mueve por grados, a menudo cromático (el ♯vi
   aparece en dos de cinco). No salta de fundamental en fundamental.
2. **Mismo motivo, otro suelo.** La melodía se repite idéntica y el bajo la
   reinterpreta. Da variedad sin gastar ideas.
3. **No descansar.** Las frases empiezan lejos de la tónica (IV, iv, ii) y
   acaban antes de resolver: por eso aguantan en bucle.
4. **Acordes simples, melodía con tensión.** Tríadas; la melodía cae en tiempo
   fuerte sobre notas ajenas al acorde y resuelve por grado.
5. **Mezcla de modos como emoción.** Un solo acorde prestado (iv en mayor, IV
   en menor = dórico) cambia el color sin modular.
6. **Modular es un acontecimiento.** A la dominante mayor o un semitono arriba,
   una vez, en el momento cumbre.
7. **Capas que entran de una en una**, cada 4 u 8 compases, y la batería que
   calla y vuelve.
8. **Economía de leitmotiv.** Una célula de 4–6 notas reconocible por su ritmo
   y su contorno, transformada: tempo (mitad/doble), compás (3/4 ↔ 4/4), modo
   (mayor ↔ menor), instrumento.
9. **Ritmo con firma.** Agrupar en 3+3+2 sobre un pulso de 4, anticipar la
   nota, ligar sobre la barra.
10. **Timbre humilde con intención** [V]: ondas básicas de 8 bits mezcladas con
    muestras de 16 bits y producción moderna; cada voz en su registro.

Lo que dice el vídeo y aquí se confirma: el timbre retro (regla 10) y el
leitmotiv como lo que une todo (regla 8). El vídeo no entra en armonía ni en
ritmo; eso sale de [H].

## Cómo lo traduce Piles

- **Un leitmotiv propio, «la pila»**: tres notas que suben por terceras y bajan
  por grados, en ritmo 3+3+2. Suena en el menú y en la partida, transformado
  (regla 8), y en el tráiler si se rehace.
- **Menú y partida son la misma idea en dos estados**, como ya hacíamos (menú
  lento, partida rápida con una introducción que la anuncia), pero ahora la
  transformación es de **compás o de modo**, no solo de tempo.
- **Centro en re.** Los efectos están afinados en la pentatónica de re menor:
  las tres opciones giran alrededor de re (menor, dórico o mayor).
- **Bucles de 45–60 s** que no resuelven al final (regla 3).
- **Onda cuadrada y triángulo de 8 bits** (instrumento NES de LMMS) junto al
  SoundFont que ya usamos (regla 10).
- **Que no suene a máquina**: cada nota lleva una intensidad algo distinta y
  las voces que cantan no caen exactas en la rejilla (± unos milisegundos); la
  batería tiene notas fantasma.

## Descartado

- **Cambiar de tonalidad al final del bucle** (como el semitono de Hopes and
  Dreams): al volver al principio, el bucle caería de golpe. La modulación va
  dentro (opción B), con vuelta preparada.
- **Compases irregulares** (7/4): ya se probó en la versión anterior y el
  usuario pidió algo más directo.
- **Citar melodías de Undertale**: no; solo técnicas.

## Las tres opciones

Cada una en `opciones/<letra>/` con su `NOTAS.md` (por qué cada decisión).

| | A · Una sola pila | B · Dos manos | C · Escalera |
|---|---|---|---|
| idea | un motivo, cuatro suelos | dos motivos que acaban sonando a la vez | el bajo sube sin parar |
| regla principal | 2 (mismo motivo, otro suelo) | 6 y 8 (modular; dos leitmotivs) | 1 y 9 (bajo-melodía; 3+3+2) |
| menú | **3/4**, re mayor con iv prestado, 104 | re dórico, 74, vibráfono | re menor, 88, arpa en 3+3+2 |
| partida | 4/4, re menor, 168 | re dórico → la mayor, 148 | 4/4, re menor, 176 |
| percusión | rock; entra por capas | bombo a negras, palmas; **3 contra 4** en el puente | entra tarde; **3 contra 4** en el puente |
