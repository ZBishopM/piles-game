"""Guante de dibujo animado en 3D, prerenderizado a sprites (como las figuras del menú).
Metabolas: palma + dedos de tres falanges + pulgar, se funden como goma. Contorno negro
de casco invertido y sombreado toon en dos tonos.
    blender -b -P guantes.py -- <salida> [poses separadas por coma]
Salida: <salida>/g_<pose>.png (512×512) y anclas.json (muñeca y yemas en píxeles)."""
import json
import math
import os
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Euler, Matrix, Quaternion, Vector

args = sys.argv[sys.argv.index("--") + 1:]
SALIDA = args[0]
os.makedirs(SALIDA, exist_ok=True)
RES = 512

# Pose: por dedo (abre°, dobla° por falange, estira). Pulgar: (abre°, adelante°, dobla°, estira).
# abre: + hacia el meñique; dobla: hacia la palma (+Y); el pulgar «adelante» cruza la palma.
POSES = {
    "abierta":   {"i": (-6, 4, 1), "m": (0, 4, 1.02), "a": (6, 4, 0.97), "p": (-55, 10, 6, 1)},
    "tensa":     {"i": (-28, -12, 1.12), "m": (0, -12, 1.16), "a": (28, -12, 1.08), "p": (-95, -10, -10, 1.1)},
    # agarra: dedos en gancho (no puño) y el pulgar enfrentado, visible a un lado
    "agarra":    {"i": (-4, 40, 1.05), "m": (0, 42, 1.05), "a": (4, 40, 1.05), "p": (-48, 32, 12, 1.1)},
    "puno":      {"i": (0, 88, 1), "m": (0, 90, 1), "a": (0, 88, 1), "p": (5, 70, 30, 1)},
    "pistola":   {"i": (0, 0, 1.08), "m": (2, 88, 1), "a": (4, 88, 1), "p": (-75, -5, -5, 1.05)},
    # ok: el índice se enrosca hacia la palma y el pulgar sube a tocar su yema: el aro se ve de lado
    # (índice y pulgar se estiran como goma para que el aro quede abierto)
    "ok":        {"i": (-4, 55, 2.6), "m": (4, 6, 1), "a": (14, 10, 1), "p": (8, 72, 0, 2.0)},
    "puntilla1": {"i": (-10, 6, 1.05), "m": (10, 20, 0.95), "a": (8, 85, 1), "p": (10, 60, 25, 1)},
    "puntilla2": {"i": (-4, 20, 0.95), "m": (16, 4, 1.05), "a": (8, 85, 1), "p": (10, 60, 25, 1)},
}
SOLO = args[1].split(",") if len(args) > 1 else list(POSES)

bpy.ops.wm.read_factory_settings(use_empty=True)
esc = bpy.context.scene


def material(nombre, claro, oscuro, corte=0.5):
    m = bpy.data.materials.new(nombre)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    dif, rgb, rampa = (nt.nodes.new(t) for t in ("ShaderNodeBsdfDiffuse", "ShaderNodeShaderToRGB", "ShaderNodeValToRGB"))
    emi, sal = nt.nodes.new("ShaderNodeEmission"), nt.nodes.new("ShaderNodeOutputMaterial")
    rampa.color_ramp.interpolation = "CONSTANT"
    rampa.color_ramp.elements[0].color = (*oscuro, 1)
    rampa.color_ramp.elements[1].position = corte
    rampa.color_ramp.elements[1].color = (*claro, 1)
    for a, b in ((dif, rgb), (rgb, rampa), (rampa, emi), (emi, sal)):
        nt.links.new(a.outputs[0], b.inputs[0])
    return m


def lin(h):   # hex sRGB → lineal
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


BLANCO = material("guante", lin("#f4f1e6"), lin("#c9c2a8"))
COLOR_PUNO = os.environ.get("PUNO", "#e8402a")   # el color del jugador: una hoja por color
PUNO = material("puno", lin(COLOR_PUNO), tuple(v * 0.45 for v in lin(COLOR_PUNO)))
TINTA = bpy.data.materials.new("tinta")
TINTA.use_nodes = True
TINTA.node_tree.nodes.clear()
e = TINTA.node_tree.nodes.new("ShaderNodeEmission")
e.inputs[0].default_value = (*lin("#0b0c09"), 1)
TINTA.node_tree.links.new(e.outputs[0], TINTA.node_tree.nodes.new("ShaderNodeOutputMaterial").inputs[0])
TINTA.use_backface_culling = True
TINTA_LISA = TINTA.copy()   # para las costuras: sin descartar caras
TINTA_LISA.use_backface_culling = False

# Geometría del guante (unidades: palma ≈ 0,8 de ancho). Muñeca en el origen, dedos hacia +Z,
# dorso hacia la cámara (−Y), palma hacia +Y.
NUDILLO = {"i": Vector((-0.27, 0, 1.0)), "m": Vector((0, 0, 1.06)), "a": Vector((0.27, 0, 1.0))}
LARGO = {"i": 0.59, "m": 0.64, "a": 0.57, "p": 0.5}   # −30 % tras verlo: largos parecían patas
GROSOR = 0.24
FALANGE = (0.45, 0.32, 0.23)


def cadena(base, rot, dobla, L, eje_dobla):
    """Puntos de las tres falanges: parte de `base` con orientación `rot` (matriz 3×3, dedo = +Z)
    y dobla cada nudillo `dobla` grados alrededor de `eje_dobla` (local)."""
    pts, r = [base.copy()], rot.copy()
    p = base.copy()
    for f in FALANGE:
        r = r @ Matrix.Rotation(math.radians(-dobla), 3, eje_dobla)   # − : hacia la palma (+Y); también el nudillo
        p = p + r @ Vector((0, 0, L * f))
        pts.append(p.copy())
    return pts


def tubo(mb, pts, r0, r1, paso=0.035):
    """Un dedo liso: bolas muy juntas a lo largo de la línea de falanges (las cápsulas sueltas
    abultaban cada nudillo). El radio va de r0 en la base a r1 en la yema."""
    largo = sum((pts[j + 1] - pts[j]).length for j in range(len(pts) - 1))
    n = max(2, int(largo / paso))
    for s in range(n + 1):
        d = largo * s / n
        for j in range(len(pts) - 1):
            l = (pts[j + 1] - pts[j]).length
            if d <= l or j == len(pts) - 2:
                p = pts[j].lerp(pts[j + 1], min(1, d / l))
                break
            d -= l
        el = mb.elements.new(type="BALL")
        el.co = p
        el.radius = (r0 + (r1 - r0) * s / n) * 1.05   # visible ≈ 0,47 × radio con este umbral (medido)


def pieza(nombre):
    """Una familia de metabolas aparte (se funde por dentro, no con las otras piezas)."""
    mb = bpy.data.metaballs.new(nombre)
    mb.resolution = mb.render_resolution = 0.02
    mb.threshold = 0.6
    ob = bpy.data.objects.new(nombre, mb)
    esc.collection.objects.link(ob)
    return mb, ob


def a_malla(ob):
    """Metabolas → malla lisa con contorno de casco invertido."""
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.convert(target="MESH")
    me = bpy.context.view_layer.objects.active
    me.data.materials.clear()
    me.data.materials.append(BLANCO)
    me.data.materials.append(TINTA)
    lis = me.modifiers.new("liso", "CORRECTIVE_SMOOTH")   # plancha los bultos entre falanges
    lis.factor, lis.iterations, lis.smooth_type, lis.use_only_smooth = 0.8, 12, "LENGTH_WEIGHTED", True
    s = me.modifiers.new("contorno", "SOLIDIFY")
    s.thickness, s.offset, s.use_flip_normals, s.material_offset, s.use_rim = 0.035, 1, True, 1, False
    for p in me.data.polygons:
        p.use_smooth = True


def guante(pose):
    for o in list(bpy.data.objects):
        if o.type in ("META", "MESH", "CURVE"):
            bpy.data.objects.remove(o)
    for m in list(bpy.data.metaballs):
        bpy.data.metaballs.remove(m)
    # Cada dedo y el pulgar son piezas aparte: su base se hunde en la palma (ahí no hay raya),
    # y entre dedos vecinos sí sale el contorno, como la raya de los guantes de época.
    mb, ob = pieza("palma")
    piezas = [ob]
    # Palma: un óvalo abombado (más grueso en el dorso) y la muñeca
    pal = mb.elements.new(type="ELLIPSOID")
    # (lo visible de una metabola es ≈ 0,55 × radio × tamaño con este umbral: medido en el render)
    pal.co = (0, 0.02, 0.6)
    pal.size_x, pal.size_y, pal.size_z = 1.0, 0.5, 1.0
    pal.radius = 0.76
    mun = mb.elements.new(type="ELLIPSOID")
    mun.co = (0, 0.02, 0.2)
    mun.size_x, mun.size_y, mun.size_z = 0.8, 0.45, 0.6
    mun.radius = 0.55
    yemas = {}
    FONDO = {"i": 0.0, "m": -0.035, "a": 0.02}   # el medio un pelo adelante: se ve la raya entre dedos
    for k in ("i", "m", "a"):
        abre, dobla, est = pose[k]
        dm, do = pieza(f"dedo{k}")
        piezas.append(do)
        rot = Matrix.Rotation(math.radians(abre), 3, "Y")
        nud = NUDILLO[k] + Vector((0, FONDO[k], 0))
        pts = cadena(nud + Vector((0, 0, -0.12)), rot, dobla, LARGO[k] * est, "X")
        pts[0] = nud + Vector((0, 0.04, -0.3))   # el dedo nace dentro de la palma
        tubo(dm, pts, GROSOR, GROSOR * 1.12)   # salchicha: engorda hacia la yema
        yemas[k] = pts[-1]
    # Pulgar: sale del lado del índice, abajo; «adelante» lo gira hacia la palma (+Y)
    abre, adel, dobla, est = pose["p"]
    pm, po = pieza("pulgar")
    piezas.append(po)
    base = Vector((-0.36, 0.09, 0.42))   # un poco por detrás del dorso: la palma le dibuja la raya
    rot = Matrix.Rotation(math.radians(abre), 3, "Y") @ Matrix.Rotation(math.radians(-adel), 3, "X")
    pts = cadena(base, rot, dobla, LARGO["p"] * est, "X")
    pts[0] = base + Vector((0.16, 0.04, -0.08))
    tubo(pm, pts, GROSOR * 1.02, GROSOR * 1.25)   # pulgar en paleta
    yemas["p"] = pts[-1]
    for o in piezas:
        a_malla(o)
    # Las tres costuras del dorso
    for x in (-0.13, 0, 0.13):
        cu = bpy.data.curves.new("costura", "CURVE")
        cu.dimensions, cu.bevel_depth, cu.bevel_resolution = "3D", 0.014, 2
        sp = cu.splines.new("POLY")
        sp.points.add(2)
        for i, z in enumerate((0.5, 0.62, 0.74)):
            sp.points[i].co = (x, -0.2 - 0.03 * math.cos((z - 0.62) * 4), z, 1)
        co = bpy.data.objects.new("costura", cu)
        cu.materials.append(TINTA_LISA)
        esc.collection.objects.link(co)
    # Puño: un aro acampanado, aparte (otro color)
    bpy.ops.mesh.primitive_cone_add(vertices=48, radius1=0.42, radius2=0.36, depth=0.3, location=(0, 0.02, 0.02))
    pu = bpy.context.view_layer.objects.active
    pu.scale = (1, 0.62, 1)
    bm = pu.modifiers.new("bisel", "BEVEL")
    bm.width, bm.segments = 0.05, 3
    pu.data.materials.append(PUNO)
    pu.data.materials.append(TINTA)
    s2 = pu.modifiers.new("contorno", "SOLIDIFY")
    s2.thickness, s2.offset, s2.use_flip_normals, s2.material_offset, s2.use_rim = 0.035, 1, True, 1, False
    for p in pu.data.polygons:
        p.use_smooth = True
    return yemas


sol = bpy.data.objects.new("sol", bpy.data.lights.new("sol", "SUN"))
sol.data.energy = 4
sol.data.use_shadow = False
sol.rotation_euler = (math.radians(60), 0, math.radians(-35))   # de arriba a la izquierda, por delante
esc.collection.objects.link(sol)

esc.render.engine = "BLENDER_EEVEE_NEXT"
esc.eevee.taa_render_samples = 8
esc.view_settings.view_transform = "Standard"
esc.render.film_transparent = True
esc.render.resolution_x = esc.render.resolution_y = RES
esc.render.image_settings.file_format = "PNG"
esc.render.image_settings.color_mode = "RGBA"

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
esc.collection.objects.link(cam)
cam.data.type = "ORTHO"
cam.data.ortho_scale = 2.9   # cabe el aro del «ok», que sale hacia un lado
cam.location = (0, -6, 0.95)
cam.rotation_euler = (math.radians(90), 0, 0)   # mira a +Y: ve el dorso
esc.camera = cam

px = lambda p: [round(world_to_camera_view(esc, cam, p).x * RES, 1), round((1 - world_to_camera_view(esc, cam, p).y) * RES, 1)]
anclas = {}
VISTA = {"ok": -75}   # giro de cámara (°, alrededor del guante) por pose; «pose@giro» lo fuerza


def mirar(az):
    a = math.radians(az)
    cam.location = (6 * math.sin(a), -6 * math.cos(a), 0.85)
    cam.rotation_euler = (math.radians(90), 0, a)
    sol.rotation_euler = (math.radians(60), 0, a + math.radians(-35))   # la luz gira con la cámara


for nombre in SOLO:
    nombre, _, az = nombre.partition("@")
    mirar(float(az) if az else VISTA.get(nombre, 0))
    yemas = guante(POSES[nombre])
    bpy.context.view_layer.update()
    clave = f"{nombre}@{az}" if az else nombre
    anclas[clave] = {"muneca": px(Vector((0, 0, 0))), **{k: px(v) for k, v in yemas.items()}}
    esc.render.filepath = os.path.join(SALIDA, f"g_{clave}.png")
    bpy.ops.render.render(write_still=True)
with open(os.path.join(SALIDA, "anclas.json"), "w") as f:
    json.dump(anclas, f, indent=1)
print("LISTO", len(anclas))
