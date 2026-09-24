"""
Texturas procedurais (numpy) e materiais PBR para a UTA e a casa de máquinas.

Tudo é gerado por código — sem fotos de terceiros, sem licenças — e sai
"tileável" (ruído com wrap-around), para repetir sem emenda visível.
As imagens são salvas em 3d/textures/ e embutidas no .glb pelo exportador.
"""
import os
import zlib
import numpy as np
import bpy

SIZE = 1024
_rng = np.random.default_rng(7)


# ---------------------------------------------------------------------------
# ruídos tileáveis
# ---------------------------------------------------------------------------
def _smooth(f):
    return f * f * (3 - 2 * f)


def value_noise(size, cx, cy=None, rng=None):
    """ruído de valor com wrap nas bordas: cx × cy células"""
    rng = rng or _rng
    cy = cy or cx
    g = rng.random((cy, cx))
    xs = np.arange(size) * cx / size
    ys = np.arange(size) * cy / size
    x0 = np.floor(xs).astype(int)
    y0 = np.floor(ys).astype(int)
    fx = _smooth(xs - x0)[None, :]
    fy = _smooth(ys - y0)[:, None]
    x1 = (x0 + 1) % cx
    y1 = (y0 + 1) % cy
    a = g[np.ix_(y0, x0)]
    b = g[np.ix_(y0, x1)]
    c = g[np.ix_(y1, x0)]
    d = g[np.ix_(y1, x1)]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(size, base, octaves=5, gain=0.5, aniso=1.0, rng=None):
    out = np.zeros((size, size))
    amp, total = 1.0, 0.0
    cells = base
    for _ in range(octaves):
        out += amp * value_noise(size, max(1, int(cells)), max(1, int(cells * aniso)), rng)
        total += amp
        amp *= gain
        cells *= 2
    return out / total


def voronoi_cells(size, n, rng=None):
    """valor aleatório por célula de Voronoi (distância periódica) — cristais do galvanizado"""
    rng = rng or _rng
    pts = rng.random((n, 2))
    vals = rng.random(n)
    u = (np.arange(size) + 0.5) / size
    X, Y = np.meshgrid(u, u)
    best = np.full((size, size), 9.0)
    out = np.zeros((size, size))
    for (px, py), v in zip(pts, vals):
        dx = np.abs(X - px)
        dy = np.abs(Y - py)
        d = np.minimum(dx, 1 - dx) ** 2 + np.minimum(dy, 1 - dy) ** 2
        m = d < best
        best[m] = d[m]
        out[m] = v
    return out


def specks(size, density, rng=None):
    rng = rng or _rng
    s = (rng.random((size, size)) < density).astype(float)
    return s


def normal_from_height(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    n = np.dstack([-dx, -dy, np.ones_like(h)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n * 0.5 + 0.5


def hex_rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])


# ---------------------------------------------------------------------------
# gravação
# ---------------------------------------------------------------------------
TEX_DIR = None


def save(name, arr, non_color=False):
    """arr: HxW (cinza) ou HxWx3, valores 0..1 (albedo já em sRGB)"""
    arr = np.clip(arr, 0, 1)
    if arr.ndim == 2:
        arr = np.dstack([arr, arr, arr])
    h, w, _ = arr.shape
    rgba = np.dstack([arr, np.ones((h, w))]).astype(np.float32)
    img = bpy.data.images.new(name, w, h, alpha=False)
    img.pixels.foreach_set(rgba.ravel())
    path = os.path.join(TEX_DIR, f"{name}.jpg")
    img.filepath_raw = path
    img.file_format = "JPEG"
    img.save()
    img.colorspace_settings.name = "Non-Color" if non_color else "sRGB"
    return img


# ---------------------------------------------------------------------------
# conjuntos de textura (albedo, rugosidade, normal)
# ---------------------------------------------------------------------------
def paint(name, color, rough=0.42, peel=0.9, grime=0.05, size=SIZE, rng=None):
    """pintura eletrostática: casca de laranja fina, leve sujeira e pontinhos"""
    rng = rng or np.random.default_rng(zlib.crc32(name.encode()))
    base = hex_rgb(color)
    mott = fbm(size, 6, 5, rng=rng)
    dirt = fbm(size, 3, 4, rng=rng)
    peel_h = fbm(size, 90, 3, 0.6, rng=rng)
    sp = specks(size, 0.0007, rng)
    shade = 1 - grime * (dirt - 0.5) * 2 - 0.02 * (mott - 0.5) - 0.25 * sp
    albedo = base[None, None, :] * shade[..., None]
    r = rough + 0.1 * (dirt - 0.5) + 0.06 * (peel_h - 0.5)
    return save(f"{name}_albedo", albedo), save(f"{name}_rough", r, True), \
        save(f"{name}_normal", normal_from_height(peel_h, peel), True)


def brushed(name, color, rough=0.28, size=SIZE, rng=None):
    rng = rng or np.random.default_rng(zlib.crc32(name.encode()))
    base = hex_rgb(color)
    streak = fbm(size, 2, 6, 0.6, aniso=64, rng=rng)
    fine = fbm(size, 4, 3, 0.5, aniso=128, rng=rng)
    albedo = base[None, None, :] * (0.9 + 0.12 * streak[..., None] + 0.04 * fine[..., None])
    r = rough + 0.14 * (streak - 0.5) + 0.05 * fine
    return save(f"{name}_albedo", albedo), save(f"{name}_rough", r, True), \
        save(f"{name}_normal", normal_from_height(fine, 1.2), True)


def galvanized(name, size=SIZE, rng=None):
    rng = rng or np.random.default_rng(11)
    cells = voronoi_cells(size, 140, rng)
    mott = fbm(size, 5, 5, rng=rng)
    base = hex_rgb("#aab1b8")
    albedo = base[None, None, :] * (0.92 + 0.08 * cells[..., None] + 0.05 * (mott[..., None] - 0.5))
    r = 0.32 + 0.14 * cells + 0.08 * (mott - 0.5)
    return save(f"{name}_albedo", albedo), save(f"{name}_rough", r, True), \
        save(f"{name}_normal", normal_from_height(cells * 0.3 + mott * 0.2, 1.5), True)


def metal(name, color, rough=0.32, patina="#4e7a62", patina_amt=0.15, size=SIZE, rng=None):
    """cobre / latão com oxidação em manchas"""
    rng = rng or np.random.default_rng(zlib.crc32(name.encode()))
    base = hex_rgb(color)
    pat = hex_rgb(patina)
    blot = np.clip((fbm(size, 4, 5, rng=rng) - 0.55) * 4, 0, 1) * patina_amt
    fine = fbm(size, 30, 3, rng=rng)
    albedo = base[None, None, :] * (0.92 + 0.12 * fine[..., None])
    albedo = albedo * (1 - blot[..., None]) + pat[None, None, :] * blot[..., None]
    r = rough + 0.4 * blot + 0.06 * (fine - 0.5)
    return save(f"{name}_albedo", albedo), save(f"{name}_rough", r, True), \
        save(f"{name}_normal", normal_from_height(fine, 0.8), True)


def rubber(name, color="#1b1e22", size=SIZE, rng=None):
    rng = rng or np.random.default_rng(5)
    base = hex_rgb(color)
    grain = fbm(size, 120, 3, 0.6, rng=rng)
    dust = fbm(size, 4, 4, rng=rng)
    albedo = base[None, None, :] * (0.9 + 0.2 * grain[..., None]) + 0.05 * np.clip(dust - 0.6, 0, 1)[..., None]
    return save(f"{name}_albedo", albedo), save(f"{name}_rough", 0.78 + 0.1 * grain, True), \
        save(f"{name}_normal", normal_from_height(grain, 1.6), True)


def fabric(name, color="#2a2d31", size=SIZE, rng=None):
    rng = rng or np.random.default_rng(9)
    u = np.arange(size) / size
    weave = (np.sin(u * 2 * np.pi * 160)[None, :] * np.sin(u * 2 * np.pi * 160)[:, None]) * 0.5 + 0.5
    mott = fbm(size, 6, 4, rng=rng)
    albedo = hex_rgb(color)[None, None, :] * (0.85 + 0.2 * weave[..., None] + 0.1 * (mott[..., None] - 0.5))
    return save(f"{name}_albedo", albedo), save(f"{name}_rough", 0.85 + 0.05 * weave, True), \
        save(f"{name}_normal", normal_from_height(weave, 0.8), True)


def filter_media(name, size=SIZE, rng=None):
    rng = rng or np.random.default_rng(13)
    fib = fbm(size, 60, 4, 0.7, rng=rng)
    dirt = fbm(size, 3, 4, rng=rng)
    albedo = hex_rgb("#efe7d2")[None, None, :] * (0.88 + 0.14 * fib[..., None] - 0.1 * np.clip(dirt - 0.5, 0, 1)[..., None])
    return save(f"{name}_albedo", albedo), save(f"{name}_rough", 0.9 + 0.05 * fib, True), \
        save(f"{name}_normal", normal_from_height(fib, 1.2), True)


def epoxy_floor(name, size=2048, rng=None):
    """piso de concreto com epóxi cinza: manchas, arranhões de uso e poros"""
    rng = rng or np.random.default_rng(21)
    base = hex_rgb("#9ea4a3")
    mott = fbm(size, 5, 6, rng=rng)
    blotch = fbm(size, 2, 4, rng=rng)
    scuff = np.clip((fbm(size, 3, 6, 0.6, aniso=10, rng=rng) - 0.62) * 5, 0, 1)
    pores = specks(size, 0.0015, rng)
    shade = 0.9 + 0.12 * (mott - 0.5) + 0.08 * (blotch - 0.5) - 0.12 * scuff - 0.3 * pores
    albedo = base[None, None, :] * shade[..., None]
    r = 0.32 + 0.25 * scuff + 0.1 * (mott - 0.5)
    h = mott * 0.2 + pores * -0.4
    return save(f"{name}_albedo", albedo), save(f"{name}_rough", r, True), \
        save(f"{name}_normal", normal_from_height(h, 2.0), True)


def concrete(name, color="#b9b6ae", size=SIZE, rng=None):
    rng = rng or np.random.default_rng(23)
    mott = fbm(size, 6, 6, rng=rng)
    pores = specks(size, 0.004, rng)
    albedo = hex_rgb(color)[None, None, :] * (0.86 + 0.18 * mott[..., None] - 0.35 * pores[..., None])
    return save(f"{name}_albedo", albedo), save(f"{name}_rough", 0.82 + 0.1 * mott, True), \
        save(f"{name}_normal", normal_from_height(mott * 0.5 - pores, 2.5), True)


def block_wall(name, color="#d8d8d3", size=SIZE, rng=None):
    """bloco de concreto pintado: tile de 1,6 m = 4 × 8 blocos de 40 × 20 cm"""
    rng = rng or np.random.default_rng(31)
    u = (np.arange(size) + 0.5) / size
    X, Y = np.meshgrid(u, u)
    rows = 8
    row = np.floor(Y * rows)
    xo = (X * 4 + 0.5 * (row % 2)) % 1.0
    yo = (Y * rows) % 1.0
    # distância até a junta em metros (bloco 0,40 × 0,20; argamassa de ~1 cm)
    d = np.minimum(np.minimum(xo, 1 - xo) * 0.4, np.minimum(yo, 1 - yo) * 0.2)
    joint = np.clip(1 - (d - 0.004) / 0.004, 0, 1)
    mott = fbm(size, 8, 5, rng=rng)
    pores = specks(size, 0.002, rng)
    shade = 0.93 + 0.07 * (mott - 0.5) - 0.12 * joint - 0.15 * pores
    albedo = hex_rgb(color)[None, None, :] * shade[..., None]
    h = -joint * 0.6 + mott * 0.15 - pores * 0.3
    return save(f"{name}_albedo", albedo), save(f"{name}_rough", 0.7 + 0.1 * mott, True), \
        save(f"{name}_normal", normal_from_height(h, 3.0), True)


def safety_paint(name, size=SIZE, rng=None):
    """faixa amarela de segurança com desgaste mostrando o piso"""
    rng = rng or np.random.default_rng(41)
    wear = np.clip((fbm(size, 6, 6, rng=rng) - 0.6) * 4, 0, 1)
    y = hex_rgb("#e7b416")
    g = hex_rgb("#9ea4a3")
    albedo = y[None, None, :] * (1 - wear[..., None]) + g[None, None, :] * wear[..., None]
    return save(f"{name}_albedo", albedo), save(f"{name}_rough", 0.45 + 0.3 * wear, True), \
        save(f"{name}_normal", normal_from_height(wear * 0.3, 1.0), True)


# ---------------------------------------------------------------------------
# material PBR com texturas (exporta para glTF com KHR_texture_transform)
# ---------------------------------------------------------------------------
def pbr(name, maps, metallic=0.0, repeat=1.0, normal_strength=1.0, emission=None, strength=0.0):
    albedo, rough, normal = maps
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Metallic"].default_value = metallic
    uv = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (repeat, repeat, 1)
    nt.links.new(uv.outputs["UV"], mp.inputs["Vector"])

    def tex(img):
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = img
        nt.links.new(mp.outputs["Vector"], n.inputs["Vector"])
        return n

    nt.links.new(tex(albedo).outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tex(rough).outputs["Color"], bsdf.inputs["Roughness"])
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.inputs["Strength"].default_value = normal_strength
    nt.links.new(tex(normal).outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    if emission:
        bsdf.inputs["Emission Color"].default_value = emission
        bsdf.inputs["Emission Strength"].default_value = strength
    return m


# ---------------------------------------------------------------------------
# pinturas que compartilham o mesmo relevo/rugosidade (economiza texturas)
# ---------------------------------------------------------------------------
def paint_detail(seed="paint", size=SIZE):
    rng = np.random.default_rng(zlib.crc32(seed.encode()))
    return {
        "mott": fbm(size, 6, 5, rng=rng),
        "dirt": fbm(size, 3, 4, rng=rng),
        "peel": fbm(size, 90, 3, 0.6, rng=rng),
        "sp": specks(size, 0.0007, rng),
    }


def paint_albedo(name, color, d, grime=0.05):
    shade = 1 - grime * (d["dirt"] - 0.5) * 2 - 0.02 * (d["mott"] - 0.5) - 0.25 * d["sp"]
    return save(f"{name}_albedo", hex_rgb(color)[None, None, :] * shade[..., None])


def paint_maps(name, d, rough=0.42, peel=0.9):
    r = rough + 0.1 * (d["dirt"] - 0.5) + 0.06 * (d["peel"] - 0.5)
    return save(f"{name}_rough", r, True), save(f"{name}_normal", normal_from_height(d["peel"], peel), True)
