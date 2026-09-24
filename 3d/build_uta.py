"""
HR Automation — UTA 3D realista + casa de máquinas

    blender -b --python 3d/build_uta.py            (tudo)
    blender -b --python 3d/build_uta.py -- --fast  (sem bake/render, para testar modelagem)

Saídas:
    models/uta.glb        → carregado pelo site (js/uta3d.js)
    models/room_env.hdr   → panorama 360° da sala, usado nos reflexos do site
    3d/uta.blend          → arquivo editável (abre no Blender com as texturas de 3d/textures)
    3d/render.png         → render fotorrealista de conferência (Cycles)

Eixos (Blender, Z para cima): X = sentido do ar (entrada em x=0, descarga em x=4.2),
Y = profundidade (frente da máquina em y=-0.6), Z = altura. Unidades em metros.
O topo da base de concreto está em z=0; o piso da sala em z=-0.1.

Peças com nome fixo são animadas no site — não renomeie sem ajustar js/uta3d.js:
    Fan_Impeller (gira em X), Damper_Blade_1..6 (giram em Y), Valve_Indicator (gira em Z),
    Coil_Fins (material CoilFins), Heater_Coils, Pipe_Water, Casing_Glass, Panel_Light,
    Panel_Display. Objetos Env_* têm a iluminação "assada" (bake) na textura.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import texgen as T  # noqa: E402
import export_web as EW  # noqa: E402

FAST = "--fast" in sys.argv
T.TEX_DIR = os.path.join(HERE, "textures")
os.makedirs(T.TEX_DIR, exist_ok=True)
os.makedirs(os.path.join(ROOT, "models"), exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
col_uta = bpy.data.collections.new("UTA")
col_env = bpy.data.collections.new("Ambiente")
scene.collection.children.link(col_uta)
scene.collection.children.link(col_env)


# ---------------------------------------------------------------------------
# materiais
# ---------------------------------------------------------------------------
def plain(name, hex_color, metallic=0.0, rough=0.5, emission=None, strength=0.0):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    rgb = [c ** 2.2 for c in T.hex_rgb(hex_color)]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = rough
    if emission:
        e = [c ** 2.2 for c in T.hex_rgb(emission)]
        bsdf.inputs["Emission Color"].default_value = (*e, 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    return m


print("· gerando texturas…")
PD = T.paint_detail("paint")
paint_rn = T.paint_maps("paint", PD)
paint_rn_gloss = T.paint_maps("paint_gloss", PD, rough=0.3, peel=0.6)


def painted(name, color, metallic=0.15, gloss=False, repeat=1.0):
    a = T.paint_albedo(name.lower(), color, PD)
    r, n = paint_rn_gloss if gloss else paint_rn
    return T.pbr(name, (a, r, n), metallic=metallic, repeat=repeat)


alu = T.brushed("alu", "#b9c0c8")
steel = T.brushed("steel", "#8e979f", rough=0.34)
galv = T.galvanized("galv")
copper = T.metal("copper", "#b8733b", rough=0.3, patina="#5a7f68", patina_amt=0.18)
brass = T.metal("brass", "#c29a45", rough=0.28, patina="#6a6a3a", patina_amt=0.1)
rubber = T.rubber("rubber")
canvas = T.fabric("canvas")
filt = T.filter_media("filter")
epoxy = T.epoxy_floor("epoxy")
conc = T.concrete("concrete")
wall = T.block_wall("wall")
wall_band = T.block_wall("wallband", color="#5f676e")
ceiling = T.concrete("ceiling", color="#e4e3de")
safety = T.safety_paint("safety")

M = {
    "panel": painted("Panel", "#e2e5e9"),
    "panel_dark": painted("PanelDark", "#c7ccd2"),
    "frame": T.pbr("Aluminium", alu, metallic=0.9, repeat=1.5),
    "base": painted("BaseSteel", "#30353b", metallic=0.4),
    "glass": plain("Glass", "#eef4f8", 0.0, 0.03),
    "filter": T.pbr("FilterMedia", filt, repeat=2.0),
    "filter_frame": painted("FilterFrame", "#4d535a", metallic=0.4),
    "fins": T.pbr("CoilFins", alu, metallic=0.85, repeat=3.0),
    "copper": T.pbr("Copper", copper, metallic=1.0, repeat=2.0),
    "insul": T.pbr("Insulation", rubber, repeat=2.0),
    "brass": T.pbr("Brass", brass, metallic=1.0, repeat=3.0),
    "actuator": painted("Actuator", "#3a4047", metallic=0.1, gloss=True),
    "label": plain("Label", "#f1f3f5", 0.0, 0.5),
    "indicator": plain("Indicator", "#ff8a1f", 0.0, 0.4, "#ff8a1f", 0.4),
    "heater": T.pbr("HeaterRod", steel, metallic=0.85, repeat=4.0),
    "fan": painted("FanWheel", "#1e5fa3", metallic=0.2, gloss=True),
    "motor": painted("Motor", "#2a2f35", metallic=0.3),
    "steel": T.pbr("Steel", steel, metallic=0.9, repeat=2.0),
    "sensor": painted("SensorHousing", "#f2f4f6", metallic=0.0, gloss=True),
    "ral7035": painted("RAL7035", "#d0d5cf", metallic=0.05),
    "display": plain("Display", "#6bbfee", 0.0, 0.25, "#6bbfee", 0.6),
    "light": plain("StatusLight", "#1fbf5a", 0.0, 0.3, "#1fbf5a", 1.5),
    "drain": T.pbr("DrainPan", steel, metallic=0.9, repeat=2.0),
    "galv": T.pbr("Galvanized", galv, metallic=0.9, repeat=4.0),
    "canvas": T.pbr("Canvas", canvas, repeat=3.0),
    "pvc": plain("PVC", "#f2f2ef", 0.0, 0.35),
    "gauge_face": plain("GaugeFace", "#fbfbf8", 0.0, 0.2),
    "black": plain("TextBlack", "#15181b", 0.0, 0.5),
    "rubber_pad": T.pbr("RubberPad", rubber, repeat=4.0),
    "pump": painted("PumpBlue", "#1f4f9c", metallic=0.2, gloss=True),
    "motor_green": painted("MotorGreen", "#2f6b4a", metallic=0.2, gloss=True),
    "guard": painted("GuardOrange", "#e5761e", metallic=0.1, gloss=True),
    "red": painted("ExtinguisherRed", "#c2231d", metallic=0.1, gloss=True),
    "sign_white": plain("SignWhite", "#f4f5f2", 0.0, 0.4),
    "sign_blue": plain("SignBlue", "#0a4f9c", 0.0, 0.4),
    "sign_yellow": plain("SignYellow", "#f2c21b", 0.0, 0.4),
    "led": plain("LedPanel", "#ffffff", 0.0, 0.3, "#fff6ea", 12.0),
    # ambiente (recebem bake)
    "epoxy": T.pbr("Env_Epoxy", epoxy, repeat=0.5),
    "concrete": T.pbr("Env_Concrete", conc, repeat=1.0),
    "wall": T.pbr("Env_Wall", wall, repeat=1 / 1.6),
    "wall_band": T.pbr("Env_WallBand", wall_band, repeat=1 / 1.6),
    "ceiling": T.pbr("Env_Ceiling", ceiling, repeat=0.5),
    "safety": T.pbr("Env_Safety", safety, repeat=1.0),
    "env_steel": T.pbr("Env_Steel", steel, metallic=0.8, repeat=4.0),
}


_gb = M["glass"].node_tree.nodes.get("Principled BSDF")
for key in ("Transmission Weight", "Transmission"):
    if key in _gb.inputs:
        _gb.inputs[key].default_value = 1.0
        break
_gb.inputs["IOR"].default_value = 1.5


# ---------------------------------------------------------------------------
# construtor de malhas (bmesh) com UV em projeção de caixa (1 unidade = 1 m)
# ---------------------------------------------------------------------------
AXIS = {
    "Z": Matrix.Identity(4),
    "X": Matrix.Rotation(math.pi / 2, 4, "Y"),
    "Y": Matrix.Rotation(math.pi / 2, 4, "X"),
}


class Builder:
    def __init__(self):
        self.bm = bmesh.new()
        self.mats = []

    def _slot(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def _tag(self, before, mat, smooth_axis=None):
        idx = self._slot(mat)
        self.bm.normal_update()
        for f in set(self.bm.faces) - before:
            f.material_index = idx
            if smooth_axis is not None and abs(f.normal.dot(smooth_axis)) < 0.2:
                f.smooth = True

    def box(self, x0, x1, y0, y1, z0, z1, mat, matrix=None):
        before = set(self.bm.faces)
        m = Matrix.Translation(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)) @ Matrix.Diagonal(
            (x1 - x0, y1 - y0, z1 - z0, 1.0))
        if matrix is not None:
            m = matrix @ m
        bmesh.ops.create_cube(self.bm, size=1.0, matrix=m)
        self._tag(before, mat)

    def cyl(self, center, r, length, axis, mat, seg=20, r2=None, caps=True, matrix=None):
        before = set(self.bm.faces)
        m = Matrix.Translation(center) @ AXIS[axis]
        if matrix is not None:
            m = matrix @ m
        bmesh.ops.create_cone(self.bm, cap_ends=caps, cap_tris=False, segments=seg,
                              radius1=r, radius2=r if r2 is None else r2, depth=length, matrix=m)
        base = matrix if matrix is not None else Matrix.Identity(4)
        axis_vec = (base @ AXIS[axis] @ Vector((0, 0, 1, 0))).to_3d().normalized()
        self._tag(before, mat, smooth_axis=axis_vec)

    def ring(self, center, r_in, r_out, thickness, axis, mat, seg=40):
        before = set(self.bm.faces)
        rot = AXIS[axis]
        t = thickness / 2
        rings = []
        for z in (-t, t):
            for r in (r_in, r_out):
                vs = []
                for i in range(seg):
                    a = 2 * math.pi * i / seg
                    p = rot @ Vector((r * math.cos(a), r * math.sin(a), z, 1))
                    vs.append(self.bm.verts.new(Vector(center) + p.to_3d()))
                rings.append(vs)
        inner0, outer0, inner1, outer1 = rings
        for i in range(seg):
            j = (i + 1) % seg
            for a, b in ((outer0, inner0), (inner1, outer1), (inner0, inner1), (outer1, outer0)):
                self.bm.faces.new((a[i], a[j], b[j], b[i]))
        bmesh.ops.recalc_face_normals(self.bm, faces=list(set(self.bm.faces) - before))
        self._tag(before, mat)

    def arc_tube(self, center, R, r, a0, a1, plane, mat, seg=10, ring=10):
        """tubo curvo (curva em U / cotovelo) no plano 'XY', 'XZ' ou 'YZ'"""
        before = set(self.bm.faces)
        c = Vector(center)
        ax = {"XY": (0, 1, 2), "XZ": (0, 2, 1), "YZ": (1, 2, 0)}[plane]
        loops = []
        for i in range(seg + 1):
            a = a0 + (a1 - a0) * i / seg
            radial = Vector((0, 0, 0))
            radial[ax[0]] = math.cos(a)
            radial[ax[1]] = math.sin(a)
            normal = Vector((0, 0, 0))
            normal[ax[2]] = 1
            loop = []
            for k in range(ring):
                b = 2 * math.pi * k / ring
                p = c + radial * (R + r * math.cos(b)) + normal * (r * math.sin(b))
                loop.append(self.bm.verts.new(p))
            loops.append(loop)
        for i in range(seg):
            for k in range(ring):
                kk = (k + 1) % ring
                f = self.bm.faces.new((loops[i][k], loops[i + 1][k], loops[i + 1][kk], loops[i][kk]))
                f.smooth = True
        bmesh.ops.recalc_face_normals(self.bm, faces=list(set(self.bm.faces) - before))
        self._tag(before, mat)
        for f in set(self.bm.faces) - before:
            f.smooth = True

    def blade(self, cx, cy, cz, base, mat, r0=0.16, r1=0.385, sweep=0.95, xa=2.88, xb=3.19, th=0.007, steps=10):
        """pá curvada para trás do rotor plug fan (eixo X)"""
        before = set(self.bm.faces)
        v = []
        for i in range(steps + 1):
            t = i / steps
            r = r0 + (r1 - r0) * t
            a = base + sweep * t ** 1.4
            row = []
            for s in (-th / 2, th / 2):
                aa = a + s / r
                y = cy + r * math.cos(aa)
                z = cz + r * math.sin(aa)
                row.append([self.bm.verts.new((xa, y, z)), self.bm.verts.new((xb, y, z))])
            v.append(row)
        for i in range(steps):
            for s in (0, 1):
                self.bm.faces.new((v[i][s][0], v[i + 1][s][0], v[i + 1][s][1], v[i][s][1]))
            for e in (0, 1):
                self.bm.faces.new((v[i][0][e], v[i + 1][0][e], v[i + 1][1][e], v[i][1][e]))
        for i in (0, steps):
            self.bm.faces.new((v[i][0][0], v[i][1][0], v[i][1][1], v[i][0][1]))
        bmesh.ops.recalc_face_normals(self.bm, faces=list(set(self.bm.faces) - before))
        self._tag(before, mat)

    def quad(self, p0, p1, p2, p3, mat):
        """face única (a normal segue a regra da mão direita p0→p1→p3)"""
        before = set(self.bm.faces)
        self.bm.faces.new([self.bm.verts.new(p) for p in (p0, p1, p2, p3)])
        self._tag(before, mat)

    def cull(self, pred):
        """remove faces que a câmera nunca vê (economiza resolução no bake)"""
        self.bm.normal_update()
        dead = [f for f in self.bm.faces if pred(f.calc_center_median(), f.normal)]
        bmesh.ops.delete(self.bm, geom=dead, context="FACES")

    def _uv(self):
        uv = self.bm.loops.layers.uv.new("UVMap")
        self.bm.normal_update()
        for f in self.bm.faces:
            n = f.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            for loop in f.loops:
                co = loop.vert.co
                loop[uv].uv = (co.y, co.z) if ax == 0 else (co.x, co.z) if ax == 1 else (co.x, co.y)

    def build(self, name, origin=None, collection=None, bevel=0.0):
        self._uv()
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        obj = bpy.data.objects.new(name, me)
        (collection or col_uta).objects.link(obj)
        if origin is not None:
            me.transform(Matrix.Translation(-Vector(origin)))
            obj.location = origin
        if bevel:
            mod = obj.modifiers.new("Bevel", "BEVEL")
            mod.width = bevel
            mod.segments = 2
            mod.limit_method = "ANGLE"
            mod.angle_limit = math.radians(40)
        return obj


def text_mesh(name, body, size, location, rot_x=90, extrude=0.0008, mat=None, align="CENTER", collection=None):
    """texto em malha (placas de identificação)"""
    cu = bpy.data.curves.new(name + "_font", "FONT")
    cu.body = body
    cu.size = size
    cu.extrude = extrude
    cu.align_x = align
    cu.align_y = "CENTER"
    tmp = bpy.data.objects.new(name + "_tmp", cu)
    scene.collection.objects.link(tmp)
    tmp.rotation_euler = (math.radians(rot_x), 0, 0)
    tmp.location = location
    bpy.context.view_layer.update()
    ev = tmp.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = bpy.data.meshes.new_from_object(ev)
    me.transform(tmp.matrix_world)
    bpy.data.objects.remove(tmp)
    bpy.data.curves.remove(cu)
    obj = bpy.data.objects.new(name, me)
    (collection or col_uta).objects.link(obj)
    me.materials.append(mat or M["black"])
    return obj


# ---------------------------------------------------------------------------
# UTA
# ---------------------------------------------------------------------------
print("· modelando a UTA…")
L = 4.2
YF, YB = -0.6, 0.6
ZB, ZT = 0.15, 1.55
SECTIONS = [0.0, 0.7, 1.25, 2.05, 2.55, 3.6, L]
GLASS_SECTIONS = {1, 2, 3, 4}
P = 0.03
G = 0.006

b = Builder()
for y in (-0.52, 0.52):
    b.box(-0.06, L + 0.06, y - 0.05, y + 0.05, 0.02, ZB, M["base"])
for x in (0.05, 1.05, 2.1, 3.1, L - 0.05):
    b.box(x - 0.04, x + 0.04, -0.52, 0.52, 0.04, 0.13, M["base"])
for x in (0.1, 2.1, L - 0.1):                                        # coxins antivibração
    for y in (-0.52, 0.52):
        b.box(x - 0.07, x + 0.07, y - 0.06, y + 0.06, 0.0, 0.02, M["rubber_pad"])
b.build("Base", bevel=0.004)

f = Builder()
S = 0.035
for x in SECTIONS:
    for y in (YF, YB):
        f.box(x - S / 2, x + S / 2, y - S / 2, y + S / 2, ZB, ZT, M["frame"])
    f.box(x - S / 2, x + S / 2, YF, YB, ZT - S / 2, ZT + S / 2, M["frame"])
for y in (YF, YB):
    for z in (ZB, ZT):
        f.box(0, L, y - S / 2, y + S / 2, z - S / 2, z + S / 2, M["frame"])
# cantoneiras de canto
for x in (0, L):
    for y in (YF, YB):
        for z in (ZB, ZT):
            f.box(x - 0.028, x + 0.028, y - 0.028, y + 0.028, z - 0.028, z + 0.028, M["base"])
f.build("Frame", bevel=0.003)

c = Builder()
g = Builder()
screws = Builder()


def screw_row(x0, x1, y, z, n):
    for k in range(n):
        x = x0 + (x1 - x0) * (k + 0.5) / n
        screws.cyl((x, y - 0.002, z), 0.0055, 0.004, "Y", M["steel"], seg=10)


for i in range(len(SECTIONS) - 1):
    x0, x1 = SECTIONS[i] + G, SECTIONS[i + 1] - G
    c.box(x0, x1, YF, YB, ZT - P, ZT, M["panel"])
    c.box(x0, x1, YB - P, YB, ZB, ZT, M["panel_dark"])
    c.box(x0, x1, YF, YB, ZB, ZB + P, M["panel_dark"])
    n = max(2, int((x1 - x0) / 0.22))
    for zz in (ZT - 0.03, ZB + 0.04):
        screw_row(x0 + 0.02, x1 - 0.02, YF, zz, n)
    if i in GLASS_SECTIONS:
        g.box(x0, x1, YF, YF + 0.01, ZB + P, ZT - P, M["glass"])
    else:
        c.box(x0, x1, YF, YF + P, ZB, ZT, M["panel"])
        c.box(x0 + 0.08, x1 - 0.08, YF - 0.008, YF, ZB + 0.12, ZT - 0.12, M["panel_dark"])
        # borracha de vedação da porta
        for zz in (ZB + 0.11, ZT - 0.11):
            c.box(x0 + 0.07, x1 - 0.07, YF - 0.005, YF, zz - 0.006, zz + 0.006, M["rubber_pad"])
        for zz in (ZB + 0.3, ZT - 0.3):
            c.box(x0 + 0.055, x0 + 0.1, YF - 0.035, YF, zz - 0.06, zz + 0.06, M["steel"])
            c.cyl((x0 + 0.077, YF - 0.035, zz), 0.008, 0.14, "Z", M["steel"], seg=10)
        # fecho de 1/4 de volta
        zc = (ZB + ZT) / 2
        c.box(x1 - 0.17, x1 - 0.11, YF - 0.02, YF, zc - 0.1, zc + 0.1, M["motor"])
        c.box(x1 - 0.158, x1 - 0.122, YF - 0.06, YF - 0.02, zc - 0.08, zc + 0.02, M["motor"])
# tampas das extremidades com as aberturas de ar
for x0, x1, (oy, oz0, oz1) in ((0.0, P, (0.5, 0.3, 1.4)), (L - P, L, (0.45, 0.4, 1.3))):
    c.box(x0, x1, YF, YB, ZB, oz0, M["panel"])
    c.box(x0, x1, YF, YB, oz1, ZT, M["panel"])
    c.box(x0, x1, YF, -oy, oz0, oz1, M["panel"])
    c.box(x0, x1, oy, YB, oz0, oz1, M["panel"])
c.box(1.3, 2.0, -0.55, 0.55, ZB + P, ZB + P + 0.05, M["drain"])
c.build("Casing", bevel=0.004)
g.build("Casing_Glass")
screws.build("Screws")

# placa de identificação HR na primeira porta
pl = Builder()
pl.box(0.2, 0.52, YF - 0.012, YF - 0.008, 1.12, 1.26, M["frame"])
pl.box(0.2, 0.52, YF - 0.0125, YF - 0.012, 1.215, 1.26, M["sign_blue"])
pl.build("Nameplate", bevel=0.002)
text_mesh("Nameplate_Text_1", "HR AUTOMATION", 0.026, (0.36, YF - 0.0128, 1.238), mat=M["sign_white"])
text_mesh("Nameplate_Text_2", "UTA-01  ·  3.400 m³/h", 0.018, (0.36, YF - 0.0128, 1.17), mat=M["black"])

# damper de entrada
d = Builder()
d.box(-0.05, 0.0, -0.52, 0.52, 0.28, 0.31, M["frame"])
d.box(-0.05, 0.0, -0.52, 0.52, 1.39, 1.42, M["frame"])
d.box(-0.05, 0.0, -0.53, -0.5, 0.28, 1.42, M["frame"])
d.box(-0.05, 0.0, 0.5, 0.53, 0.28, 1.42, M["frame"])
d.box(-0.14, -0.04, -0.5, -0.38, 0.55, 0.7, M["actuator"])
d.box(-0.141, -0.139, -0.49, -0.39, 0.6, 0.66, M["label"])
d.build("Damper_Frame", bevel=0.003)
for k in range(6):
    zc = 0.39 + k * 0.184
    blade = Builder()
    blade.box(-0.035, -0.02, -0.49, 0.49, zc - 0.085, zc + 0.085, M["frame"])
    blade.cyl((-0.027, 0.0, zc), 0.008, 1.0, "Y", M["steel"], seg=8)
    blade.build(f"Damper_Blade_{k + 1}", origin=(-0.027, 0.0, zc))

# filtro plissado
fl = Builder()
fl.box(0.9, 1.02, -0.52, 0.52, 0.22, 0.26, M["filter_frame"])
fl.box(0.9, 1.02, -0.52, 0.52, 1.44, 1.48, M["filter_frame"])
fl.box(0.9, 1.02, -0.52, -0.48, 0.22, 1.48, M["filter_frame"])
fl.box(0.9, 1.02, 0.48, 0.52, 0.22, 1.48, M["filter_frame"])
fl.box(0.955, 0.965, -0.52, 0.52, 0.8, 0.9, M["filter_frame"])
for k in range(30):
    y = -0.47 + k * 0.0325
    tilt = Matrix.Translation((0.96, y, 0.85)) @ Matrix.Rotation(math.radians(28 if k % 2 else -28), 4, "Z") @ Matrix.Translation((-0.96, -y, -0.85))
    fl.box(0.93, 0.99, y - 0.003, y + 0.003, 0.26, 1.44, M["filter"], matrix=tilt)
fl.build("Filter")

# serpentina: aletas, tubos, curvas em U e coletores
cf = Builder()
for k in range(42):
    y = -0.51 + k * 0.0249
    cf.box(1.45, 1.77, y - 0.0015, y + 0.0015, 0.26, 1.44, M["fins"])
cf.box(1.44, 1.78, -0.53, -0.51, 0.24, 1.46, M["steel"])
cf.box(1.44, 1.78, 0.51, 0.53, 0.24, 1.46, M["steel"])
cf.build("Coil_Fins")

ct = Builder()
for row in range(10):
    z = 0.32 + row * 0.12
    for x in (1.52, 1.7):
        ct.cyl((x, 0.0, z), 0.011, 1.1, "Y", M["copper"], seg=12)
    for yy, a0, a1 in ((0.55, 0.0, math.pi), (-0.55, math.pi, 2 * math.pi)):
        ct.arc_tube((1.61, yy, z), 0.09, 0.011, a0, a1, "XY", M["copper"], seg=10, ring=8)
for x in (1.52, 1.7):
    ct.cyl((x, -0.57, 0.86), 0.028, 1.12, "Z", M["copper"], seg=16)
    for z in (0.3, 1.42):
        ct.cyl((x, -0.57, z), 0.028, 0.02, "Z", M["copper"], seg=16)
ct.build("Coil_Tubes")

# água gelada: alimentação desce ao piso (com válvula), retorno sobe ao teto
pw = Builder()
pw.cyl((1.52, -0.72, 0.36), 0.026, 0.3, "Y", M["copper"], seg=18)
pw.cyl((1.52, -0.93, 0.36), 0.026, 0.1, "Y", M["copper"], seg=18)
pw.arc_tube((1.52, -0.93, 0.26), 0.1, 0.026, 0.0, math.pi / 2, "YZ", M["copper"], seg=8, ring=14)
pw.cyl((1.52, -1.03, 0.13), 0.026, 0.26, "Z", M["copper"], seg=18)
pw.cyl((1.7, -0.78, 1.36), 0.026, 0.42, "Y", M["copper"], seg=18)
pw.cyl((1.7, -0.99, 1.62), 0.026, 0.54, "Z", M["copper"], seg=18)
pw.build("Pipe_Water")

ins = Builder()
ins.cyl((1.52, -1.03, 0.07), 0.046, 0.14, "Z", M["insul"], seg=20)
ins.cyl((1.7, -0.99, 2.8), 0.046, 2.4, "Z", M["insul"], seg=20)
ins.cyl((1.7, -0.84, 1.36), 0.046, 0.22, "Y", M["insul"], seg=20)
for z in (2.2, 3.3):                                                   # faixas de identificação
    ins.cyl((1.7, -0.99, z), 0.048, 0.08, "Z", M["motor_green"], seg=20)
ins.build("Pipe_Insulation")

v = Builder()
v.cyl((1.52, -0.84, 0.36), 0.045, 0.1, "Y", M["brass"], seg=22)
for y in (-0.895, -0.785):
    v.cyl((1.52, y, 0.36), 0.052, 0.018, "Y", M["brass"], seg=6)
v.cyl((1.52, -0.84, 0.44), 0.012, 0.08, "Z", M["steel"], seg=10)
v.build("Valve_Body", bevel=0.002)

act = Builder()
act.box(1.45, 1.59, -0.9, -0.78, 0.47, 0.6, M["actuator"])
act.box(1.46, 1.58, -0.905, -0.9, 0.49, 0.56, M["label"])
act.cyl((1.59, -0.84, 0.52), 0.012, 0.03, "X", M["black"], seg=10)
act.build("Valve_Actuator", bevel=0.004)

ind = Builder()
ind.cyl((1.52, -0.84, 0.607), 0.034, 0.014, "Z", M["indicator"], seg=24)
ind.box(1.52, 1.555, -0.845, -0.835, 0.612, 0.618, M["motor"])
ind.build("Valve_Indicator", origin=(1.52, -0.84, 0.607))

# manômetros nas linhas de água gelada
gauges = Builder()
for (x, z) in ((1.52, 0.2), (1.7, 1.12)):
    y = -1.03 if z < 1 else -0.99
    gauges.cyl((x, y - 0.06, z), 0.008, 0.08, "Y", M["brass"], seg=10)
    gauges.cyl((x, y - 0.11, z), 0.042, 0.03, "Y", M["steel"], seg=24)
    gauges.cyl((x, y - 0.126, z), 0.036, 0.002, "Y", M["gauge_face"], seg=24)
    gauges.box(x - 0.002, x + 0.028, y - 0.129, y - 0.127, z - 0.002, z + 0.002, M["black"])
gauges.build("Gauges")

# dreno de condensado (PVC com sifão) até o ralo
dr = Builder()
dr.cyl((1.9, -0.68, 0.215), 0.016, 0.16, "Y", M["pvc"], seg=12)
dr.cyl((1.9, -0.76, 0.12), 0.016, 0.19, "Z", M["pvc"], seg=12)
dr.cyl((1.9, -0.84, 0.03), 0.016, 0.16, "Y", M["pvc"], seg=12)
dr.cyl((1.9, -0.92, 0.1), 0.016, 0.14, "Z", M["pvc"], seg=12)
dr.cyl((1.9, -1.2, 0.0), 0.016, 0.56, "Y", M["pvc"], seg=12)
dr.build("Condensate_Drain")

# resistência elétrica
hf = Builder()
hf.box(2.24, 2.36, -0.52, 0.52, 0.3, 0.33, M["steel"])
hf.box(2.24, 2.36, -0.52, 0.52, 1.37, 1.4, M["steel"])
hf.box(2.24, 2.36, -0.52, -0.49, 0.3, 1.4, M["steel"])
hf.box(2.24, 2.36, 0.49, 0.52, 0.3, 1.4, M["steel"])
hf.box(2.2, 2.4, -0.62, -0.6, 0.62, 0.98, M["actuator"])
hf.build("Heater_Frame", bevel=0.003)
hr = Builder()
for k in range(7):
    z = 0.4 + k * 0.15
    for x in (2.27, 2.33):
        hr.cyl((x, 0.0, z), 0.011, 0.98, "Y", M["heater"], seg=12)
    hr.arc_tube((2.3, 0.49, z), 0.03, 0.011, 0, math.pi, "XY", M["heater"], seg=6, ring=8)
hr.build("Heater_Coils")

# ventilador plug EC
FC = Vector((3.02, 0.0, 0.86))
fp = Builder()
fp.box(2.7, 2.73, -0.57, 0.57, ZB + P, 0.42, M["panel_dark"])
fp.box(2.7, 2.73, -0.57, 0.57, 1.3, ZT - P, M["panel_dark"])
fp.box(2.7, 2.73, -0.57, -0.44, 0.42, 1.3, M["panel_dark"])
fp.box(2.7, 2.73, 0.44, 0.57, 0.42, 1.3, M["panel_dark"])
fp.cyl((2.77, 0, FC.z), 0.34, 0.1, "X", M["steel"], seg=48, r2=0.29, caps=False)
fp.box(3.3, 3.42, -0.08, 0.08, ZB + P, FC.z - 0.12, M["base"])
fp.box(3.2, 3.5, -0.3, 0.3, ZB + P, ZB + P + 0.04, M["base"])
fp.build("Fan_Inlet", bevel=0.003)

mot = Builder()
mot.cyl((3.36, 0, FC.z), 0.15, 0.2, "X", M["motor"], seg=32)
for k in range(16):
    a = k * math.pi / 8
    rot = Matrix.Translation((3.36, 0, FC.z)) @ Matrix.Rotation(a, 4, "X")
    mot.box(-0.09, 0.09, -0.005, 0.005, 0.14, 0.172, M["motor"], matrix=rot)
mot.box(3.3, 3.42, 0.13, 0.22, FC.z - 0.05, FC.z + 0.06, M["actuator"])
mot.build("Fan_Motor", bevel=0.002)

imp = Builder()
imp.cyl((3.2, 0, FC.z), 0.4, 0.02, "X", M["fan"], seg=56)
imp.ring((2.86, 0, FC.z), 0.3, 0.4, 0.018, "X", M["fan"], seg=56)
imp.cyl((2.84, 0, FC.z), 0.3, 0.05, "X", M["fan"], seg=56, r2=0.33, caps=False)
imp.cyl((3.19, 0, FC.z), 0.07, 0.06, "X", M["steel"], seg=24)
for k in range(9):
    imp.blade(3.03, 0.0, FC.z, 2 * math.pi * k / 9, M["fan"])
imp.build("Fan_Impeller", origin=(3.03, 0.0, FC.z))

# junta flexível (lona) + duto de insuflamento galvanizado subindo ao teto
fx = Builder()
for i in range(4):
    x = L + 0.015 + i * 0.03
    fx.box(x, x + 0.03, -0.5 - 0.008 * (i % 2), 0.5 + 0.008 * (i % 2), 0.37 - 0.008 * (i % 2), 1.33 + 0.008 * (i % 2), M["canvas"])
fx.build("Duct_Flex")

du = Builder()
DY0, DY1, DZ0, DZ1 = -0.48, 0.48, 0.38, 1.32
XR0, XR1 = 5.1, 6.02
t = 0.012
du.box(L + 0.13, XR0, DY0, DY1, DZ1 - t, DZ1, M["galv"])
du.box(L + 0.13, XR1, DY0, DY1, DZ0, DZ0 + t, M["galv"])
du.box(L + 0.13, XR1, DY0, DY0 + t, DZ0, DZ1, M["galv"])
du.box(L + 0.13, XR1, DY1 - t, DY1, DZ0, DZ1, M["galv"])
du.box(XR1 - t, XR1, DY0, DY1, DZ0, 4.0, M["galv"])
du.box(XR0, XR0 + t, DY0, DY1, DZ1 - t, 4.0, M["galv"])
du.box(XR0, XR1, DY0, DY0 + t, DZ1, 4.0, M["galv"])
du.box(XR0, XR1, DY1 - t, DY1, DZ1, 4.0, M["galv"])
for x in (L + 0.14, 4.9):                                         # flanges TDC
    du.box(x, x + 0.035, DY0 - 0.03, DY1 + 0.03, DZ0 - 0.03, DZ0, M["galv"])
    du.box(x, x + 0.035, DY0 - 0.03, DY1 + 0.03, DZ1, DZ1 + 0.03, M["galv"])
    du.box(x, x + 0.035, DY0 - 0.03, DY0, DZ0, DZ1, M["galv"])
    du.box(x, x + 0.035, DY1, DY1 + 0.03, DZ0, DZ1, M["galv"])
for z in (2.2, 3.3):
    du.box(XR0 - 0.03, XR1 + 0.03, DY0 - 0.03, DY1 + 0.03, z, z + 0.035, M["galv"])
du.build("Duct_Supply", bevel=0.003)
du2 = Builder()
du2.box(4.6, 4.63, -0.5, 0.5, -0.1, DZ0, M["steel"])            # suporte do duto
du2.box(4.55, 4.68, -0.55, 0.55, -0.1, -0.08, M["steel"])
du2.build("Duct_Support", bevel=0.002)

# sensores
def sensor(name, x, y, z, stem_len=0.24):
    s = Builder()
    s.box(x - 0.08, x + 0.08, y - 0.06, y + 0.06, z, z + 0.1, M["sensor"])
    s.box(x - 0.07, x + 0.07, y - 0.05, y + 0.05, z + 0.1, z + 0.112, M["label"])
    s.cyl((x + 0.095, y, z + 0.05), 0.016, 0.03, "X", M["actuator"], seg=12)
    s.cyl((x - 0.03, y - 0.061, z + 0.07), 0.008, 0.004, "Y", M["light"], seg=10)
    s.cyl((x, y, z - stem_len / 2), 0.009, stem_len, "Z", M["steel"], seg=10)
    return s.build(name, bevel=0.004)


sensor("Sensor_Return", 0.35, -0.3, ZT)
sensor("Sensor_Supply", L + 0.55, 0.0, DZ1)
ps = Builder()
ps.box(2.72, 2.86, YF - 0.06, YF - 0.005, 1.22, 1.36, M["sensor"])
ps.box(2.74, 2.84, YF - 0.065, YF - 0.06, 1.25, 1.33, M["actuator"])
for x in (2.76, 2.82):
    ps.cyl((x, YF - 0.03, 1.19), 0.005, 0.07, "Z", M["pvc"], seg=8)
ps.build("Sensor_Pressure", bevel=0.003)

# painel de comando com IHM + eletroduto até a eletrocalha
pn = Builder()
pn.box(3.72, 4.14, YF - 0.2, YF - 0.005, 0.5, 1.22, M["ral7035"])
pn.box(3.74, 4.12, YF - 0.215, YF - 0.2, 0.52, 1.2, M["ral7035"])
pn.box(4.07, 4.1, YF - 0.24, YF - 0.215, 0.78, 0.94, M["motor"])
pn.box(3.83, 4.03, YF - 0.225, YF - 0.215, 0.97, 1.1, M["motor"])
pn.box(3.78, 3.86, YF - 0.218, YF - 0.215, 0.58, 0.64, M["sign_yellow"])
pn.cyl((3.93, YF - 0.1, 2.23), 0.016, 2.02, "Z", M["pvc"], seg=12)
pn.cyl((3.93, 0.95, 3.24), 0.016, 3.1, "Y", M["pvc"], seg=12)
pn.build("Control_Panel", bevel=0.004)
dp = Builder()
dp.box(3.855, 4.005, YF - 0.229, YF - 0.224, 0.995, 1.075, M["display"])
dp.build("Panel_Display")
lt = Builder()
lt.cyl((3.93, YF - 0.23, 0.88), 0.018, 0.02, "Y", M["light"], seg=16)
lt.build("Panel_Light")


# ---------------------------------------------------------------------------
# casa de máquinas
# ---------------------------------------------------------------------------
print("· montando a casa de máquinas…")
RX0, RX1 = -3.5, 9.0
RY0, RY1 = -9.0, 2.8
FZ, CZ = -0.1, 4.0

EPS = 0.002


def hidden(c, n):
    """face encostada num limite da sala e virada para fora dele"""
    return ((c.x <= RX0 + EPS and n.x < -0.5) or (c.x >= RX1 - EPS and n.x > 0.5)
            or (c.y >= RY1 - EPS and n.y > 0.5) or (c.z >= CZ - EPS and n.z > 0.5)
            or (c.z <= FZ + EPS and n.z < -0.5))


fl_ = Builder()
fl_.quad((RX0, RY0, FZ), (RX1, RY0, FZ), (RX1, RY1, FZ), (RX0, RY1, FZ), M["epoxy"])
fl_.box(-0.35, L + 0.35, -0.85, 0.85, FZ, 0.0, M["concrete"])              # base de concreto da UTA
for px in (5.65, 7.05):                                                    # bases das bombas
    fl_.box(px, px + 1.2, 1.2, 2.1, FZ, -0.02, M["concrete"])
# faixa amarela de segurança em volta da UTA
W = 0.08
x0, x1, y0, y1 = -0.95, L + 0.95, -1.45, 1.45
z = FZ + 0.002
for (a, b_, c_, d_) in ((x0, x1, y0, y0 + W), (x0, x1, y1 - W, y1), (x0, x0 + W, y0, y1), (x1 - W, x1, y0, y1)):
    fl_.quad((a, c_, z), (b_, c_, z), (b_, d_, z), (a, d_, z), M["safety"])
fl_.quad((1.8, -1.55, FZ + 0.003), (2.0, -1.55, FZ + 0.003), (2.0, -1.35, FZ + 0.003), (1.8, -1.35, FZ + 0.003), M["env_steel"])  # ralo
fl_.cull(hidden)
floor = fl_.build("Env_Floor", collection=col_env)

BAND = 1.1
wl = Builder()
for (za, zb, mat) in ((FZ, BAND, M["wall_band"]), (BAND, CZ, M["wall"])):
    wl.quad((RX0, RY1, za), (RX1, RY1, za), (RX1, RY1, zb), (RX0, RY1, zb), mat)            # fundo
    wl.quad((RX0, RY0, za), (RX0, RY1, za), (RX0, RY1, zb), (RX0, RY0, zb), mat)            # esquerda
    wl.quad((RX1, RY1, za), (RX1, RY0, za), (RX1, RY0, zb), (RX1, RY1, zb), mat)            # direita
wl.quad((RX0, RY0, CZ), (RX0, RY1, CZ), (RX1, RY1, CZ), (RX1, RY0, CZ), M["ceiling"])       # teto
for x in (0.0, 3.0, 6.0):                                                                   # vigas
    wl.box(x - 0.1, x + 0.1, RY0, RY1, CZ - 0.35, CZ, M["ceiling"])
# rodapé de borracha escura
for (a, b_, c_, d_) in ((RX0, RX1, RY1 - 0.01, RY1),):
    wl.box(a, b_, c_, d_, FZ, FZ + 0.1, M["rubber_pad"])
wl.cull(hidden)
walls = wl.build("Env_Walls", collection=col_env)

# luminárias LED (visíveis) + luzes de área (iluminação do bake/render)
lm = Builder()
LIGHTS = [(x, y) for x in (-1.5, 1.5, 4.5, 7.5) for y in (-3.2, -0.2)]
for (x, y) in LIGHTS:
    lm.box(x - 0.62, x + 0.62, y - 0.08, y + 0.08, CZ - 0.43, CZ - 0.37, M["steel"])
    lm.box(x - 0.6, x + 0.6, y - 0.06, y + 0.06, CZ - 0.44, CZ - 0.43, M["led"])
    for dx in (-0.5, 0.5):
        lm.cyl((x + dx, y, CZ - 0.2), 0.003, 0.34, "Z", M["steel"], seg=6)
lm.build("Prop_Luminaires", collection=col_env)
for i, (x, y) in enumerate(LIGHTS):
    ld = bpy.data.lights.new(f"Area_{i}", "AREA")
    ld.shape = "RECTANGLE"
    ld.size = 1.2
    ld.size_y = 0.12
    ld.energy = 120
    ld.color = (1.0, 0.96, 0.9)
    lo = bpy.data.objects.new(f"Area_{i}", ld)
    lo.location = (x, y, CZ - 0.45)
    col_env.objects.link(lo)

# eletrocalha no fundo
tr = Builder()
tr.box(RX0, RX1, 2.35, 2.65, 3.2, 3.21, M["galv"])
tr.box(RX0, RX1, 2.35, 2.36, 3.2, 3.28, M["galv"])
tr.box(RX0, RX1, 2.64, 2.65, 3.2, 3.28, M["galv"])
for x in range(-3, 9):
    tr.box(x, x + 0.03, 2.65, RY1, 3.17, 3.2, M["steel"])
tr.build("Prop_CableTray", collection=col_env)

# bombas de água gelada (motor WEG verde, voluta azul)
def pump(name, x0):
    p = Builder()
    y = 1.65
    p.box(x0 + 0.05, x0 + 1.15, y - 0.24, y + 0.24, -0.02, 0.08, M["base"])
    p.cyl((x0 + 0.42, y, 0.34), 0.17, 0.46, "X", M["motor_green"], seg=32)
    for k in range(16):
        a = k * math.pi / 8
        rot = Matrix.Translation((x0 + 0.42, y, 0.34)) @ Matrix.Rotation(a, 4, "X")
        p.box(-0.2, 0.2, -0.005, 0.005, 0.16, 0.19, M["motor_green"], matrix=rot)
    p.cyl((x0 + 0.13, y, 0.34), 0.175, 0.1, "X", M["steel"], seg=32)       # tampa do ventilador
    p.box(x0 + 0.24, x0 + 0.62, y - 0.14, y + 0.14, 0.08, 0.17, M["motor_green"])
    p.box(x0 + 0.62, x0 + 0.78, y - 0.09, y + 0.09, 0.2, 0.46, M["guard"])  # protetor do acoplamento
    p.cyl((x0 + 0.86, y, 0.36), 0.22, 0.14, "X", M["pump"], seg=36)        # voluta
    p.box(x0 + 0.78, x0 + 0.94, y - 0.12, y + 0.12, 0.08, 0.2, M["pump"])
    p.cyl((x0 + 1.0, y, 0.36), 0.075, 0.16, "X", M["pump"], seg=24)        # sucção
    p.cyl((x0 + 1.09, y, 0.36), 0.11, 0.02, "X", M["pump"], seg=24)
    p.cyl((x0 + 0.86, y, 0.66), 0.065, 0.16, "Z", M["pump"], seg=24)       # recalque
    p.cyl((x0 + 0.86, y, 0.75), 0.1, 0.02, "Z", M["pump"], seg=24)
    p.cyl((x0 + 0.86, y, 2.4), 0.1, 3.3, "Z", M["insul"], seg=24)
    p.cyl((x0 + 1.25, y, 0.36), 0.1, 0.3, "X", M["insul"], seg=24)
    p.cyl((x0 + 1.4, y, 2.2), 0.1, 3.7, "Z", M["insul"], seg=24)
    for z in (1.6, 2.9):
        p.cyl((x0 + 0.86, y, z), 0.103, 0.1, "Z", M["motor_green"], seg=24)
        p.cyl((x0 + 1.4, y, z), 0.103, 0.1, "Z", M["motor_green"], seg=24)
    p.build(name, collection=col_env, bevel=0.003)


pump("Prop_Pump_1", 5.7)
pump("Prop_Pump_2", 7.1)

# QGBT na parede direita
qg = Builder()
qg.box(RX1 - 0.42, RX1, -3.2, -1.8, 0.0, 2.1, M["ral7035"])
qg.box(RX1 - 0.425, RX1 - 0.42, -3.18, -2.51, 0.03, 2.07, M["ral7035"])
qg.box(RX1 - 0.425, RX1 - 0.42, -2.49, -1.82, 0.03, 2.07, M["ral7035"])
for yy in (-2.56, -2.44):
    qg.box(RX1 - 0.45, RX1 - 0.425, yy - 0.015, yy + 0.015, 0.95, 1.15, M["motor"])
qg.box(RX1 - 0.422, RX1 - 0.42, -3.0, -2.72, 1.7, 1.9, M["sign_yellow"])
for k, col in enumerate(("light", "red", "sign_yellow")):
    qg.cyl((RX1 - 0.43, -2.2 + k * 0.08, 1.8), 0.015, 0.02, "X", M[col], seg=12)
qg.build("Prop_QGBT", collection=col_env, bevel=0.004)

# extintor + placa
ex = Builder()
ex.cyl((-2.6, RY1 - 0.12, 0.45), 0.085, 0.5, "Z", M["red"], seg=24)
ex.cyl((-2.6, RY1 - 0.12, 0.74), 0.03, 0.08, "Z", M["black"], seg=12)
ex.box(-2.64, -2.52, RY1 - 0.18, RY1 - 0.15, 0.78, 0.8, M["black"])
ex.box(-2.8, -2.4, RY1 - 0.01, RY1, 1.2, 1.6, M["red"])
ex.build("Prop_Extinguisher", collection=col_env, bevel=0.003)

# placa "CASA DE MÁQUINAS"
sg = Builder()
sg.box(0.9, 3.1, RY1 - 0.012, RY1, 2.55, 3.05, M["sign_white"])
sg.box(0.9, 3.1, RY1 - 0.013, RY1 - 0.012, 2.9, 3.05, M["sign_blue"])
sg.build("Prop_Sign", collection=col_env)
text_mesh("Prop_Sign_Text_1", "CASA DE MÁQUINAS", 0.1, (2.0, RY1 - 0.014, 2.74), rot_x=90, mat=M["black"], collection=col_env)
text_mesh("Prop_Sign_Text_2", "ACESSO RESTRITO", 0.07, (2.0, RY1 - 0.014, 2.975), rot_x=90, mat=M["sign_white"], collection=col_env)


# ---------------------------------------------------------------------------
# Cycles (GPU), bake da iluminação, panorama HDR e render final
# ---------------------------------------------------------------------------
def use_gpu():
    scene.render.engine = "CYCLES"
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for t in ("OPTIX", "CUDA"):
            try:
                prefs.compute_device_type = t
                prefs.refresh_devices()
                gpus = [d for d in prefs.devices if d.type != "CPU"]
                if gpus:
                    for d in prefs.devices:
                        d.use = d.type != "CPU"
                    scene.cycles.device = "GPU"
                    print(f"· Cycles na GPU ({t})")
                    return
            except Exception:
                continue
    except Exception:
        pass
    print("· Cycles na CPU")


world = bpy.data.worlds.new("World")
scene.world = world
try:
    world.use_nodes = True
except Exception:
    pass
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.08, 0.085, 0.09, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.4
scene.view_settings.view_transform = "Standard"


def select_only(objs):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def bake_lightmap(obj, res, samples):
    """gera UV de lightmap, assa a iluminação completa (COMBINED) e troca o material por um único mapa"""
    me = obj.data
    # (referências a camadas de UV ficam inválidas quando outra camada é criada: sempre buscar pelo nome)
    me.uv_layers.new(name="Lightmap")
    me.uv_layers.active = me.uv_layers["Lightmap"]
    me.uv_layers["UVMap"].active_render = True
    select_only([obj])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")

    img = bpy.data.images.new(f"bake_{obj.name}", res, res, alpha=False)
    nodes = []
    for m in me.materials:
        n = m.node_tree.nodes.new("ShaderNodeTexImage")
        n.image = img
        m.node_tree.nodes.active = n
        nodes.append((m, n))
    scene.cycles.samples = samples
    scene.render.bake.margin = 8
    scene.render.bake.use_clear = True
    bpy.ops.object.bake(type="COMBINED", margin=8, use_clear=True)
    img.filepath_raw = os.path.join(T.TEX_DIR, f"bake_{obj.name}.jpg")
    img.file_format = "JPEG"
    img.save()
    for m, n in nodes:
        m.node_tree.nodes.remove(n)

    baked = bpy.data.materials.new(f"Baked_{obj.name}")
    try:
        baked.use_nodes = True
    except Exception:
        pass
    nt = baked.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = 1.0
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    me.materials.clear()
    me.materials.append(baked)
    for p in me.polygons:
        p.material_index = 0
    me.uv_layers.remove(me.uv_layers["UVMap"])
    me.uv_layers["Lightmap"].name = "UVMap"
    me.uv_layers[0].active = True
    me.uv_layers[0].active_render = True


def apply_modifiers():
    for o in list(bpy.data.objects):
        if o.type == "MESH" and o.modifiers:
            select_only([o])
            for mod in list(o.modifiers):
                bpy.ops.object.modifier_apply(modifier=mod.name)


def render_still(path):
    cam_data = bpy.data.cameras.new("Hero")
    cam_data.lens = 30
    cam = bpy.data.objects.new("Hero", cam_data)
    scene.collection.objects.link(cam)
    cam.location = (-1.4, -6.4, 2.35)
    target = Vector((2.3, 0.0, 0.85))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.cycles.samples = 256
    scene.cycles.use_denoising = True
    scene.view_settings.view_transform = "AgX"
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = path
    bpy.data.objects["Casing_Glass"].hide_render = False
    bpy.ops.render.render(write_still=True)
    scene.view_settings.view_transform = "Standard"
    bpy.data.objects.remove(cam)


use_gpu()
if not FAST:
    print("· renderizando a cena final (Cycles)…")
    render_still(os.path.join(HERE, "render.png"))
    print("· assando iluminação do piso e das paredes…")
    bake_lightmap(floor, 2048, 384)
    bake_lightmap(walls, 2048, 256)
    print("· panorama HDR para reflexos…")
    EW.render_env_hdr()

# as luzes de área não vão para o site (a iluminação do ambiente já está no bake e no HDR)
bpy.ops.file.make_paths_relative()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "uta.blend"))

EW.export_glb()

faces = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == "MESH")
print(f"UTA_OK objects={len(bpy.data.objects)} faces={faces}")
