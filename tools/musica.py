"""Convierte los proyectos de LMMS de musica/ (menu.mmp y partida.mmp) en las pistas del juego (client/musica/).

    python -I tools/musica.py [--intro-compases 4]

Lo llama `nu tools/musica.nu render` (y `publicar`). Por cada proyecto:
  1. LMMS lo renderiza tal como está guardado (lo que editaste a mano es lo que suena; aquí no se genera ninguna nota).
  2. Bucle sin clic: la cola de la última nota (lo que suena pasado el final) se suma al principio del bucle.
     La partida empieza con una introducción que NO se repite (por omisión, sus 4 primeros compases): su bucle va del
     final de la introducción al final del proyecto.
  3. Volumen: las dos al mismo RMS (el menú, 2,5 dB por debajo: es música de ascensor) y con el pico bajo −1 dB.
  4. Ogg Vorbis con ffmpeg, y client/musica/musica.json con lo que el juego necesita saber (dónde empieza el bucle).
"""
import json
import os
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET

import numpy as np

LMMS = "C:/Program Files/LMMS/lmms.exe"
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUENTE, SALIDA = os.path.join(RAIZ, "musica"), os.path.join(RAIZ, "client", "musica")
SR = 44100
PICO = 10 ** (-1 / 20)
MENU_DB = -2.5


def leer_wav(ruta):
    """Un wav de LMMS (float 32 o entero 16) -> matriz (muestras, canales) en float."""
    with open(ruta, "rb") as f:
        d = f.read()
    i, can, fmt = 12, 2, 1
    while i < len(d) - 8:
        cid, n = d[i:i + 4], int.from_bytes(d[i + 4:i + 8], "little")
        if cid == b"fmt ":
            fmt, can = int.from_bytes(d[i + 8:i + 10], "little"), int.from_bytes(d[i + 10:i + 12], "little")
        if cid == b"data":
            crudo = d[i + 8:i + 8 + n]
            x = np.frombuffer(crudo, "<f4") if fmt == 3 else np.frombuffer(crudo, "<i2") / 32768.0
            return x.reshape(-1, can).astype(np.float64)
        i += 8 + n + (n & 1)
    raise ValueError("sin datos: " + ruta)


def escribir_wav(ruta, x):
    x = np.asarray(x, "<f4")
    can, datos = x.shape[1], x.tobytes()
    fmt = (3).to_bytes(2, "little") + can.to_bytes(2, "little") + SR.to_bytes(4, "little") + (SR * 4 * can).to_bytes(4, "little") + \
        (4 * can).to_bytes(2, "little") + (32).to_bytes(2, "little")
    with open(ruta, "wb") as f:
        f.write(b"RIFF" + (36 + len(datos)).to_bytes(4, "little") + b"WAVE" + b"fmt " + (16).to_bytes(4, "little") + fmt +
                b"data" + len(datos).to_bytes(4, "little") + datos)


def lmms(mmp, wav, bucle):
    r = subprocess.run([LMMS, "render", mmp, "-o", wav, "-f", "wav", "--float"] + (["--loop"] if bucle else []), capture_output=True)
    if r.returncode or not os.path.exists(wav):
        sys.exit("LMMS no pudo renderizar %s:\n%s" % (mmp, r.stderr.decode(errors="replace")[-600:]))
    return leer_wav(wav)


def db(v):
    return 20 * np.log10(v + 1e-12)


def main():
    intro_compases = int(sys.argv[sys.argv.index("--intro-compases") + 1]) if "--intro-compases" in sys.argv else 4
    tmp = tempfile.mkdtemp(prefix="piles-musica-")
    pistas = {}
    for v in ("menu", "partida"):
        mmp = os.path.join(FUENTE, v + ".mmp")
        if not os.path.exists(mmp):
            sys.exit("falta " + mmp)
        cab = ET.parse(mmp).getroot().find("head")
        bpm = float(cab.find("bpm").get("value") if cab.find("bpm") is not None else cab.get("bpm"))
        num, den = int(cab.get("timesig_numerator", 4)), int(cab.get("timesig_denominator", 4))
        compas = 240.0 / bpm * num / den                        # segundos por compás
        n = len(lmms(mmp, os.path.join(tmp, v + "_bucle.wav"), True))
        entero = lmms(mmp, os.path.join(tmp, v + "_entero.wav"), False)
        intro = intro_compases * compas if v == "partida" else 0.0
        ni = int(round(intro * SR))
        if ni >= n:
            sys.exit("%s: la introducción (%d compases) es más larga que la canción" % (v, intro_compases))
        x = entero[:n].copy()
        cola = entero[n:n + (n - ni)]                            # lo que sigue sonando pasado el final
        x[ni:ni + len(cola)] += cola
        cuerpo = x[ni:]
        pistas[v] = dict(x=x, bpm=bpm, compases=n / SR / compas, intro=intro, dur=n / SR, pico=float(np.max(np.abs(x))),
                         rms=float(np.sqrt(np.mean(cuerpo ** 2))), salto=float(np.max(np.abs(x[-1] - x[ni]))))
    # Mismo RMS (el menú, algo por debajo) sin que ninguna pase de −1 dB de pico
    quiere = {v: 10 ** ((MENU_DB if v == "menu" else 0.0) / 20) for v in pistas}
    objetivo = min(PICO * p["rms"] / p["pico"] / quiere[v] for v, p in pistas.items())
    os.makedirs(SALIDA, exist_ok=True)
    for v, p in pistas.items():
        g = objetivo * quiere[v] / p["rms"]
        wav = os.path.join(tmp, v + ".wav")
        escribir_wav(wav, p["x"] * g)
        ogg = os.path.join(SALIDA, v + ".ogg")
        r = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-c:a", "libvorbis", "-q:a", "5", ogg], capture_output=True)
        if r.returncode:
            sys.exit("ffmpeg: " + r.stderr.decode(errors="replace")[-400:])
        print("%-8s %5.1f bpm · %5.1f compases · %7.3f s%s · RMS %.1f dBFS · pico %.1f dBFS · costura %.3f · %.2f MB" % (
            v, p["bpm"], p["compases"], p["dur"], (" (introducción %.3f s)" % p["intro"]) if p["intro"] else "",
            db(p["rms"] * g), db(p["pico"] * g), p["salto"] * g, os.path.getsize(ogg) / 1e6))
    with open(os.path.join(SALIDA, "musica.json"), "w", encoding="utf-8") as f:
        json.dump({"introPartida": round(pistas["partida"]["intro"], 5),
                   "duracion": {v: round(p["dur"], 5) for v, p in pistas.items()},
                   "bpm": {v: p["bpm"] for v, p in pistas.items()}}, f, indent=1)
        f.write("\n")


if __name__ == "__main__":
    main()
