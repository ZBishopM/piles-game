"""Figuras de cuerpo entero, sentadas a la mesa, estilo anime alargado y sombreado en dos
tonos (negro + salvia), prerenderizadas para el menú de Piles.
Cuerpo MPFB del chasqui estirado (más alto, cabeza más pequeña), en silla.
Columnas 0-11: estira la derecha hacia el centro (0 = reposo, 11 = brazo estirado).
Columnas 12-19: gana la carta y la levanta por encima de la cabeza, exagerado.
    blender -b --python siluetas.py -- <salida> [prueba]
Salida: <salida>/<vista>_<col>.png (RGBA)."""
import math
import os
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
SALIDA = args[0]
PRUEBA = len(args) > 1
GLB = "D:/2026-projects/chasqui/chasqui-godot/assets/personajes/mpfb/chasqui.glb"
os.makedirs(SALIDA, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
for o in bpy.data.objects:
    if o.name.startswith("Icosphere"):
        o.hide_render = True
# Mira a -Y; su derecha es -X. Proporciones de anime: alto y estrecho, cabeza pequeña.
arm.scale = (0.92, 0.92, 1.14)
arm.location.z = -0.52            # sentado: la pelvis queda a ~0,46 m
esc = bpy.context.scene


def vacio(nombre, pos):
    e = bpy.data.objects.new(nombre, None)
    e.location = pos
    esc.collection.objects.link(e)
    return e


def ik(hueso, meta, polo):
    c = arm.pose.bones[hueso].constraints.new("IK")
    c.target = meta
    c.pole_target = vacio("polo_" + hueso, polo)
    c.pole_angle = math.radians(-90)
    c.chain_count = 2


REPOSO_D, ESTIRA_D = Vector((-0.20, -0.30, 0.76)), Vector((-0.04, -0.72, 0.74))
ARRIBA_D = Vector((-0.22, -0.22, 1.85))
AMAGA_D, LANZA_D = Vector((-0.12, -0.34, 0.90)), Vector((-0.08, -0.54, 0.82))
MUNECA_ATRAS = float(os.environ.get("ATRAS", "-45"))
MUNECA_DELANTE = float(os.environ.get("DELANTE", "35"))
lerp_ = lambda a, b, k: a + (b - a) * k
der = vacio("der", REPOSO_D)
izq = vacio("izq", (0.12, -0.28, 0.82))
ik("lowerarm_r", der, (-0.7, 0.2, 0.5))
ik("lowerarm_l", izq, (0.7, 0.2, 0.5))
ik("calf_r", vacio("pie_r", (-0.12, -0.40, 0.07)), (-0.1, -1.5, 0.5))
ik("calf_l", vacio("pie_l", (0.12, -0.40, 0.07)), (0.1, -1.5, 0.5))
espalda, cuello, cabeza = (arm.pose.bones[n] for n in ("spine_02", "neck_01", "Head"))
for b in (espalda, cuello, cabeza):
    b.rotation_mode = "XYZ"
cabeza.scale = (0.86, 0.86, 0.86)
cuello.scale = (1, 1.25, 1)

# Silla
def caja(nombre, pos, tam):
    bpy.ops.mesh.primitive_cube_add(location=pos)
    o = bpy.context.object
    o.name = nombre
    o.scale = tam
    return o


caja("asiento", (0, 0.08, 0.42), (0.23, 0.22, 0.025))
caja("respaldo", (0, 0.29, 0.78), (0.21, 0.02, 0.32))
for x in (-0.2, 0.2):
    for y in (-0.1, 0.27):
        caja("pata", (x, y, 0.2), (0.018, 0.018, 0.2))

# Sombreado en dos tonos: lo que da a la lámpara de la mesa, salvia; el resto, casi negro
mat = bpy.data.materials.new("toon")
mat.use_nodes = True
nt = mat.node_tree
nt.nodes.clear()
dif = nt.nodes.new("ShaderNodeBsdfDiffuse")
rgb = nt.nodes.new("ShaderNodeShaderToRGB")
rampa = nt.nodes.new("ShaderNodeValToRGB")
emi = nt.nodes.new("ShaderNodeEmission")
sal = nt.nodes.new("ShaderNodeOutputMaterial")
rampa.color_ramp.interpolation = "CONSTANT"
rampa.color_ramp.elements[0].color = (0.004, 0.005, 0.003, 1)
rampa.color_ramp.elements[1].position = 0.62
rampa.color_ramp.elements[1].color = (0.40, 0.47, 0.25, 1)    # salvia (lineal)
nt.links.new(dif.outputs[0], rgb.inputs[0])
nt.links.new(rgb.outputs[0], rampa.inputs[0])
nt.links.new(rampa.outputs[0], emi.inputs[0])
nt.links.new(emi.outputs[0], sal.inputs[0])
for o in bpy.data.objects:
    if o.type == "MESH":
        o.data.materials.clear()
        o.data.materials.append(mat)

sol = bpy.data.objects.new("sol", bpy.data.lights.new("sol", "SUN"))
sol.data.energy = 4
sol.data.use_shadow = False   # sin sombras propias: toon limpio, sin grano
sol.rotation_euler = (math.radians(35), 0, math.radians(-50))   # desde arriba, de lado: media cara en luz
esc.collection.objects.link(sol)

esc.render.engine = "BLENDER_EEVEE_NEXT"
esc.eevee.taa_render_samples = 8
esc.view_settings.view_transform = "Standard"
esc.render.film_transparent = True
esc.render.resolution_x = 480
esc.render.resolution_y = 768
esc.render.image_settings.file_format = "PNG"
esc.render.image_settings.color_mode = "RGBA"

mira = vacio("mira", (0, -0.2, 0.98))
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
esc.collection.objects.link(cam)
cam.data.type = "ORTHO"
cam.data.ortho_scale = 2.1
t = cam.constraints.new("TRACK_TO")
t.target = mira
t.track_axis = "TRACK_NEGATIVE_Z"
t.up_axis = "UP_Y"
esc.camera = cam


def pose(col):
    if col < 12:   # lanza la carta como una apuesta: la recoge junto al pecho y la suelta de muñeca
        a = col / 11
        mano_d = arm.pose.bones["hand_r"]
        mano_d.rotation_mode = "XYZ"
        if a < 0.5:
            u = a / 0.5
            der.location = REPOSO_D.lerp(AMAGA_D, u)
            mano_d.rotation_euler = (0, 0, math.radians(MUNECA_ATRAS * u))
        else:
            u = (a - 0.5) / 0.5
            u = 1 - (1 - u) ** 2
            der.location = AMAGA_D.lerp(LANZA_D, u)
            mano_d.rotation_euler = (0, 0, math.radians(lerp_(MUNECA_ATRAS, MUNECA_DELANTE, u)))
        espalda.rotation_euler = (math.radians(10 + 8 * a), 0, 0)
        cabeza.rotation_euler = (math.radians(18 + 6 * a), 0, 0)
    elif col >= 20:   # vuelta: de la muñeca suelta al reposo, directo, sin repetir el amago
        u = (col - 19) / 4
        u = u * u * (3 - 2 * u)
        der.location = LANZA_D.lerp(REPOSO_D, u)
        arm.pose.bones["hand_r"].rotation_euler = (0, 0, math.radians(MUNECA_DELANTE * (1 - u)))
        espalda.rotation_euler = (math.radians(18 - 8 * u), 0, 0)
        cabeza.rotation_euler = (math.radians(24 - 6 * u), 0, 0)
    else:   # victoria: de la mesa a lo alto, con el cuerpo echado atrás
        arm.pose.bones["hand_r"].rotation_euler = (0, 0, 0)
        w = (col - 12) / 7
        e = 1 - (1 - w) ** 3
        der.location = ESTIRA_D.lerp(ARRIBA_D, e) + Vector((0, 0, 0.25 * math.sin(e * math.pi)))
        espalda.rotation_euler = (math.radians(24 - 40 * e), 0, math.radians(-12 * e))
        cabeza.rotation_euler = (math.radians(22 - 45 * e), 0, 0)


import json
from bpy_extras.object_utils import world_to_camera_view

VISTAS = {"frente": (0, -4, 1.3), "espalda": (0, 4, 1.3), "izq": (-4, -0.2, 1.3), "der": (4, -0.2, 1.3)}
manos = []   # por vista y columna: dónde está la carta entre los dedos, en píxeles de la celda a media escala
for vista, pos in VISTAS.items():
    cam.location = pos
    fila = []
    for col in range(24):
        pose(col)
        bpy.context.view_layer.update()
        p = arm.matrix_world @ arm.pose.bones["middle_02_r"].head
        v = world_to_camera_view(esc, cam, p)
        fila.append([round(v.x * 240, 1), round((1 - v.y) * 384, 1)])
        if PRUEBA and (vista not in ("frente", "der") or col not in (11, 20, 22)):
            continue
        esc.render.filepath = os.path.join(SALIDA, f"{vista}_{col:02d}.png")
        bpy.ops.render.render(write_still=True)
    manos.append(fila)
with open(os.path.join(SALIDA, "manos.json"), "w") as f:
    json.dump(manos, f)
print("listo")
