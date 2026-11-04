"""Brazo derecho del cuerpo MPFB (el de las siluetas), aislado, para la pelea por la carta.
Mismo sombreado en dos tonos. Columnas: 0 mano abierta, 1 a medio cerrar, 2 agarra, 3 agarra y tira.
    blender -b --python brazos.py -- <salida> [prueba]
Salida: <salida>/brazo_<col>.png y anclas.json (píxeles de hombro y de agarre por columna)."""
import json
import math
import os
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
SALIDA = args[0]
PRUEBA = len(args) > 1
GLB = "D:/2026-projects/chasqui/chasqui-godot/assets/personajes/mpfb/chasqui.glb"
os.makedirs(SALIDA, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
arm.scale = (0.92, 0.92, 1.14)
arm.location.z = -0.52
esc = bpy.context.scene
DEDOS = ("index", "middle", "ring", "pinky")
BRAZO = {"upperarm_r", "lowerarm_r", "hand_r"} | {f"{d}_0{i}_r" for d in DEDOS + ("thumb",) for i in (1, 2, 3)}

# Solo el brazo: máscara por un grupo con los vértices que mueven sus huesos
for o in list(bpy.data.objects):
    if o.type != "MESH":
        continue
    if o.name not in ("chasqui",):
        o.hide_render = True
        continue
    idx = {g.index for g in o.vertex_groups if g.name in BRAZO}
    grupo = o.vertex_groups.new(name="brazo")
    for v in o.data.vertices:
        w = sum(g.weight for g in v.groups if g.group in idx)
        if w > 0.5:
            grupo.add([v.index], 1.0, "REPLACE")
    m = o.modifiers.new("solo_brazo", "MASK")
    m.vertex_group = "brazo"


def vacio(nombre, pos):
    e = bpy.data.objects.new(nombre, None)
    e.location = pos
    esc.collection.objects.link(e)
    return e


# Mano sobre la mesa, delante; codo bajo y abierto hacia fuera (no hacia arriba)
meta = vacio("meta", (-0.10, -0.62, 0.72))
c = arm.pose.bones["lowerarm_r"].constraints.new("IK")
c.target = meta
c.pole_target = vacio("polo", (-0.75, -0.2, 0.55))
c.pole_angle = math.radians(-90)
c.chain_count = 2
mano = arm.pose.bones["hand_r"]
for b in arm.pose.bones:
    b.rotation_mode = "XYZ"

mat = bpy.data.materials.new("toon")
mat.use_nodes = True
nt = mat.node_tree
nt.nodes.clear()
dif, rgb, rampa = (nt.nodes.new(t) for t in ("ShaderNodeBsdfDiffuse", "ShaderNodeShaderToRGB", "ShaderNodeValToRGB"))
emi, sal = nt.nodes.new("ShaderNodeEmission"), nt.nodes.new("ShaderNodeOutputMaterial")
rampa.color_ramp.interpolation = "CONSTANT"
rampa.color_ramp.elements[0].color = (0.004, 0.005, 0.003, 1)
rampa.color_ramp.elements[1].position = 0.55
rampa.color_ramp.elements[1].color = (0.40, 0.47, 0.25, 1)
for a, b in ((dif, rgb), (rgb, rampa), (rampa, emi), (emi, sal)):
    nt.links.new(a.outputs[0], b.inputs[0])
cuerpo = bpy.data.objects["chasqui"]
cuerpo.data.materials.clear()
cuerpo.data.materials.append(mat)

sol = bpy.data.objects.new("sol", bpy.data.lights.new("sol", "SUN"))
sol.data.energy = 4
sol.data.use_shadow = False
sol.rotation_euler = (math.radians(30), 0, math.radians(-60))
esc.collection.objects.link(sol)

esc.render.engine = "BLENDER_EEVEE_NEXT"
esc.eevee.taa_render_samples = 8
esc.view_settings.view_transform = "Standard"
esc.render.film_transparent = True
esc.render.resolution_x = 512
esc.render.resolution_y = 512
esc.render.image_settings.file_format = "PNG"
esc.render.image_settings.color_mode = "RGBA"

# Cámara desde fuera y arriba del brazo (vista de la cámara de la pelea), ortográfica
mira = vacio("mira", (-0.17, -0.30, 0.88))
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
esc.collection.objects.link(cam)
cam.data.type = "ORTHO"
cam.data.ortho_scale = 1.1
cam.location = mira.location + Vector((-1.6, 0.2, 1.3))
t = cam.constraints.new("TRACK_TO")
t.target = mira
t.track_axis = "TRACK_NEGATIVE_Z"
t.up_axis = "UP_Y"
esc.camera = cam


GIRO = float(os.environ.get("GIRO", "-38"))      # pronación de la mano (palma abajo)
MUNECA = float(os.environ.get("MUNECA", "0"))  # dobla la muñeca para que los dedos queden planos


def pose(col):
    """Dedos estirados, palma abajo, apretando la carta contra la mesa.
    0 = llega (mano un poco alzada, dedos abiertos), 1 = aprieta, 2 = aprieta y tira hacia sí."""
    abre = (1.4, 0.5, 0.0)[col]
    for d in DEDOS:
        sep = {"index": -6, "middle": -2, "ring": 2, "pinky": 6}[d] * abre
        for i in (1, 2, 3):
            b = arm.pose.bones[f"{d}_0{i}_r"]
            b.rotation_euler = (0, math.radians(sep), math.radians(-6)) if i == 1 else (0, 0, math.radians(-2))
    for i in (1, 2, 3):
        arm.pose.bones[f"thumb_0{i}_r"].rotation_euler = (0, 0, math.radians(-10 * abre))
    mano.rotation_euler = (math.radians(MUNECA - 12 * (col == 0)), math.radians(GIRO), 0)
    meta.location = Vector((-0.10, -0.62, 0.72 + 0.06 * (col == 0))) + Vector((0, 0.06, 0)) * (col == 2)


def ver(azimut, alzada):
    """Cámara alrededor del brazo: azimut 0 = delante de la mano mirando al hombro; 90 = por fuera."""
    a, e = math.radians(azimut), math.radians(alzada)
    d = Vector((-math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))   # delante = -Y, fuera = -X
    cam.location = mira.location + d * 3


pb = arm.pose.bones
px = lambda p: [round(v, 1) for v in (world_to_camera_view(esc, cam, p).x * 512, (1 - world_to_camera_view(esc, cam, p).y) * 512)]
AZIMUTS, ALZADAS = range(0, 360, 45), (20, 55)
if PRUEBA:
    AZIMUTS, ALZADAS = (90, 270), (55, 80)
anclas = []
for al in ALZADAS:
    for az in AZIMUTS:
        ver(az, al)
        fila = []
        for col in range(3):
            pose(col)
            bpy.context.view_layer.update()
            hombro = arm.matrix_world @ pb["upperarm_r"].head
            agarre = arm.matrix_world @ ((pb["middle_01_r"].head + pb["middle_02_r"].head) / 2)
            fila.append({"h": px(hombro), "a": px(agarre), "f": px(hombro + Vector((-0.15, 0, 0)))})
            esc.render.filepath = os.path.join(SALIDA, f"b_{al}_{az:03d}_{col}.png")
            bpy.ops.render.render(write_still=True)
        anclas.append(fila)
with open(os.path.join(SALIDA, "anclas.json"), "w") as f:
    json.dump(anclas, f)
print("ANCLAS", len(anclas))
