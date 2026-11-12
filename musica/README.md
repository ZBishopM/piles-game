# La música del juego

Aquí están los proyectos de LMMS de las dos pistas. Lo que suena en el juego
(`client/musica/*.ogg`) sale de ellos con una orden.

| archivo | qué es |
|---|---|
| `menu.mmp` | el menú, la sala y los resultados. En bucle entero. |
| `partida.mmp` | la partida. Sus **4 primeros compases** son la introducción (el piano): suenan una vez al empezar cada partida; el bucle es el resto. |

## El ciclo

```nu
nu tools/musica.nu abrir partida             # 1 · editar en LMMS y guardar (Ctrl+S)
nu tools/musica.nu render                    # 2 · oírla en local (servidor local + el juego)
nu tools/musica.nu publicar "más cuerdas"    # 3 · versión nueva (musica-vN) y a beta
nu tools/musica.nu promover                  # 4 · a producción (lo apruebas en GitHub)
```

Si no gusta:

```nu
nu tools/musica.nu versiones                 # qué versiones hay y cuál está en producción
nu tools/musica.nu volver musica-v3          # beta vuelve a sonar como la v3
nu tools/musica.nu promover                  # y producción también
```

`volver` trae de vuelta también los `.mmp` de esa versión: se puede seguir
editando desde ella. No borra nada: la vuelta atrás es una versión más.

## Al editar en LMMS

- **No hace falta exportar.** Se guarda el proyecto y `render` hace el resto:
  renderiza con LMMS, cose el bucle (la cola de la última nota se suma al
  principio, para que no haga clic), iguala el volumen de las dos pistas (el
  menú, 2,5 dB por debajo) y deja el pico bajo −1 dB.
- **El bucle acaba donde acaba el último patrón.** Un patrón que se alarga un
  compás alarga el bucle.
- **Tempo y compás** se leen del proyecto. Si cambias el tempo de la partida,
  la introducción sigue siendo sus 4 primeros compases.
- **Otra introducción:** `--intro-compases N` en `render` y `publicar` (0 = sin
  introducción). Queda escrito en `client/musica/musica.json`, que es de donde
  lo lee el juego.
- Los instrumentos usan el SoundFont
  `D:/MUSICA_LMMS/soundfonts/generaluser/GeneralUser-GS.sf2` (ruta absoluta en
  el proyecto).

## De dónde salieron

Los escribió un generador (`carrera.py`, en
`D:/MUSICA_LMMS/directorio_de_trabajo/projects/piles/generador/`). **No se
vuelve a ejecutar sobre estos archivos**: desde que están aquí, la fuente de
la música son estos `.mmp`, editados a mano.
