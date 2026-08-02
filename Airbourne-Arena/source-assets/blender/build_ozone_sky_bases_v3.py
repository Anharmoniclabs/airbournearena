"""Author the three Airbourne Arena ozone-layer faction bases, v3.

Concept reference: source-assets/concepts/sky-bases-ozone-concept-v1.png
Quality bar: the authored Vanguard interceptor / Kestrel pipeline — real
lofted silhouettes, tiled diffusion surfaces at fixed world texel density,
and readable deck-level detail where the pilot actually spawns.

Gameplay contract (src/game/18a-ozone-bases.js, do not break):
- deck top surface sits at local Z=+10 (runtime walk height is base.y+10)
- walkable flat region: |x|<=360, |y|<=105 for vanguard/inferno,
  radius<=300 for tempest — the deck must be flat and present there
- the +X half of every deck stays clear: the pilot spawns at +250 and the
  command island/citadel always lives on the -X half
- LOD0/LOD1/collision GLBs per faction; Three.js r128 loader, so JPEG/PNG
  images only, no emissive-strength extension, no webp, no draco

Outputs: ozone-sky-bases-authored-v3.blend plus nine GLBs in assets/.
"""
import bpy
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(GAME, "assets")

DECK_TILE = 96.0     # metres of deck per texture repeat
HULL_TILE = 120.0    # metres of hull armor per texture repeat

# ---------------------------------------------------------------- materials
def load_scaled(path, size):
    image = bpy.data.images.load(path, check_existing=True)
    if max(image.size) > size:
        image.scale(size, size)
    return image


TEXTURES = {
    "deck": load_scaled(os.path.join(OUT, "airbase-deck-diffusion-4k-v1.webp"), 2048),
    "vanguard": load_scaled(os.path.join(OUT, "vanguard-surface-diffusion-4k-v1.webp"), 1024),
    "tempest": load_scaled(os.path.join(OUT, "tempest-surface-diffusion-4k-v1.webp"), 1024),
    "inferno": load_scaled(os.path.join(OUT, "inferno-surface-diffusion-4k-v1.webp"), 1024),
}


def material(name, color, metallic=.6, roughness=.4, emission=None, image=None):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        (bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")).default_value = (*emission, 1)
        # Strength stays 1.0 so the exporter never emits
        # KHR_materials_emissive_strength (unsupported by Three.js r128).
        bsdf.inputs["Emission Strength"].default_value = 1.0
    if image is not None:
        tex = m.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = image
        tex.extension = "REPEAT"
        m.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return m


def faction_materials(faction, accent, glass_glow, lod):
    """Textured LOD0 set; plain colour-matched LOD1 set (tiny files, far away)."""
    F = faction.title()
    tex = None if lod else TEXTURES[faction]
    deck_tex = None if lod else TEXTURES["deck"]
    base = {
        "vanguard": ((.62, .72, .79), (.82, .88, .92)),
        "tempest": ((.42, .55, .56), (.62, .74, .74)),
        "inferno": ((.16, .16, .17), (.34, .33, .33)),
    }[faction]
    suffix = " far" if lod else ""
    return {
        "deck": material(F + " deck surface" + suffix, (.42, .45, .5) if lod else (.88, .9, .94),
                         .55, .58, image=deck_tex),
        "hull": material(F + " hull plating" + suffix, base[0] if lod else (1, 1, 1),
                         .58, .38, image=tex),
        "light": material(F + " light armor" + suffix, base[1], .55, .3),
        "frame": material(F + " structural frame" + suffix, (.022, .033, .045), .82, .3),
        "accent": material(F + " emissive guidance" + suffix,
                           tuple(c * .22 for c in accent), .35, .25, emission=accent),
        "glass": material(F + " recessed glazing" + suffix, (.01, .05, .08), .3, .12,
                          emission=tuple(c * .55 for c in glass_glow)),
        "beam": material(F + " lift beam" + suffix, tuple(c * .25 for c in accent), .1, .4,
                         emission=tuple(min(1, c * 1.2 + .2) for c in accent)),
    }


# ---------------------------------------------------------------- geometry
ACTIVE = {"root": None, "uv_jobs": []}


def root(name):
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    ACTIVE["root"] = o
    return o


def register_uv(obj, tile):
    ACTIVE["uv_jobs"].append((obj, tile))


def mesh_obj(name, verts, faces, mat, bevel=0, tile=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(mat)
    ob.parent = ACTIVE["root"]
    if bevel:
        mod = ob.modifiers.new("manufactured edge", "BEVEL")
        mod.width = bevel
        mod.segments = 2
    if tile:
        register_uv(ob, tile)
    return ob


def loft(name, outline, sections, mat, bevel=0, tile=None):
    """Closed faceted volume from (z, xScale, yScale, xOff, yOff) sections."""
    n = len(outline)
    verts = []
    for z, sx, sy, ox, oy in sections:
        verts += [(x * sx + ox, y * sy + oy, z) for x, y in outline]
    faces = [tuple(range(n - 1, -1, -1))]
    for k in range(len(sections) - 1):
        for i in range(n):
            j = (i + 1) % n
            faces.append((k * n + i, k * n + j, (k + 1) * n + j, (k + 1) * n + i))
    top = (len(sections) - 1) * n
    faces.append(tuple(top + i for i in range(n)))
    return mesh_obj(name, verts, faces, mat, bevel, tile)


def box(name, loc, dims, mat, bevel=0, rot=0.0, tile=None):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=(0, 0, rot))
    o = bpy.context.object
    o.name = name
    o.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(mat)
    o.parent = ACTIVE["root"]
    if bevel:
        m = o.modifiers.new("armored edge", "BEVEL")
        m.width = bevel
        m.segments = 2
    if tile:
        register_uv(o, tile)
    return o


def cyl(name, loc, r, depth, mat, verts=20, r2=None, tile=None):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r,
                                    radius2=r if r2 is None else r2,
                                    depth=depth, location=loc)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(mat)
    o.parent = ACTIVE["root"]
    if tile:
        register_uv(o, tile)
    return o


def torus(name, loc, major, minor, mat, segments=32):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                     major_segments=segments, minor_segments=6,
                                     location=loc)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(mat)
    o.parent = ACTIVE["root"]
    return o


def ring_pts(r, n, start=0.0):
    return [(math.cos(start + i * math.tau / n) * r,
             math.sin(start + i * math.tau / n) * r) for i in range(n)]


# ------------------------------------------------------- shared assemblies
def lift_pylon(x, y, z_top, length, radius, mats, lod, beam_len=620):
    """Hanging orbital-lift spire with luminous field collars and beam."""
    cyl("Lift pylon", (x, y, z_top - length / 2), radius, length,
        mats["frame"], 14 if lod else 20, radius * .5)
    if not lod:
        for k in range(4):
            torus("Pylon field collar", (x, y, z_top - length * (.3 + k * .2)),
                  radius * .92, 1.9, mats["accent"], 24)
    cyl("Lift emitter", (x, y, z_top - length - 8), radius * .78, 16,
        mats["accent"], 14 if lod else 20, radius * .5)
    cyl("Lift beam", (x, y, z_top - length - beam_len / 2), radius * .3,
        beam_len, mats["beam"], 10, radius * .12)


def hanging_tower(x, y, z_top, width, length, mats, lod, tiers=3):
    """Inverted under-city block: progressive setbacks descending."""
    w = width
    z = z_top
    for t in range(tiers if not lod else 2):
        h = length * (.45 if t == 0 else .3)
        box("Under-city tier", (x, y, z - h / 2), (w, w * .82, h),
            mats["hull"] if t % 2 == 0 else mats["frame"], 1.6, tile=HULL_TILE)
        if not lod:
            for s in (-1, 1):
                box("Under-city window band", (x, y + s * w * .42, z - h * .55),
                    (w * .7, 1.2, 2.6), mats["glass"], .2)
        z -= h
        w *= .68
    cyl("Under-city keel light", (x, y, z - 7), w * .4, 14, mats["accent"], 12)


def deck_edge_rails(outline, z, mats, lod, inset=.965):
    """Continuous perimeter guidance rail traced from the deck plan."""
    n = len(outline)
    step = 2 if lod else 1
    for i in range(0, n, step):
        x0, y0 = outline[i]
        x1, y1 = outline[(i + 1) % n]
        mx, my = (x0 + x1) / 2 * inset, (y0 + y1) / 2 * inset
        seg = math.hypot(x1 - x0, y1 - y0) * inset
        ang = math.atan2(y1 - y0, x1 - x0)
        box("Deck edge light rail", (mx, my, z + .3), (seg * .92, 1.5, .5),
            mats["accent"], .12, ang)


def runway_markings(mats, lod, length=640, y=0.0, z=10.0, lanes=(-44, 0, 44)):
    for lane in lanes:
        box("Runway centerline", (0, y + lane, z + .22),
            (length, 2.4 if lane == 0 else 1.6, .4),
            mats["accent"] if lane == 0 else mats["light"], .1)
    if lod:
        return
    for x in range(-280, 281, 160):
        box("Arrestor marking", (x, y, z + .18), (2.2, 92, .3), mats["light"], .08)
    for i in range(3):
        box("Threshold chevron", (296 + i * 16, y, z + .24), (4, 64 - i * 14, .36),
            mats["accent"], .1)


# ------------------------------------------------------------- VANGUARD
VANGUARD_DECK = [
    (452, -46), (430, -96), (330, -132), (60, -140), (-220, -132),
    (-355, -118), (-408, -62), (-408, 62), (-355, 118), (-190, 133),
    (105, 140), (345, 128), (438, 62),
]


def build_vanguard(mats, lod):
    deck = VANGUARD_DECK
    # deck plate: flat top exactly at +10 across the whole walkable plan
    loft("Vanguard deck plate", deck, [(3, 1, 1, 0, 0), (10, 1, 1, 0, 0)],
         mats["deck"], 1.2, tile=DECK_TILE)
    # armored hull tiers descending — white upper, recessed band, dark keel
    loft("Vanguard upper hull", deck, [(-42, .93, .9, 0, 0), (-8, 1, 1, 0, 0), (3, 1, 1, 0, 0)],
         mats["hull"], 4, tile=HULL_TILE)
    loft("Vanguard recessed band", deck, [(-62, .82, .78, 6, 0), (-40, .9, .87, 2, 0)],
         mats["frame"], 2)
    loft("Vanguard keel", deck, [(-150, .5, .38, 30, 0), (-118, .68, .55, 18, 0), (-58, .8, .75, 8, 0)],
         mats["hull"], 4, tile=HULL_TILE)

    runway_markings(mats, lod)
    deck_edge_rails(deck, 10, mats, lod)

    # command island: -X half, tiered with panoramic glazing (concept left base)
    island = [(-58, -40), (52, -44), (72, -18), (68, 32), (30, 46), (-52, 42), (-74, 12)]
    for name, z0, z1, s, ox, oy, m in (
            ("foundation", 10, 62, 1.0, -195, 96, "hull"),
            ("operations tier", 62, 108, .8, -207, 98, "light"),
            ("bridge tier", 108, 148, .62, -218, 96, "hull"),
            ("command crown", 148, 178, .45, -224, 97, "light")):
        st = s * .945
        # wall, recessed glazing band, cap: setback glazing reads from every
        # angle and can never detach from a sloped face like a floating bar
        loft("Vanguard island " + name, island,
             [(z0, s, s, ox, oy), (z1 - 10, st, st, ox - 3, oy)],
             mats[m], 2.5, tile=HULL_TILE if m == "hull" else None)
        if not lod:
            loft("Vanguard island glazing band", island,
                 [(z1 - 10, st * .93, st * .93, ox - 3, oy),
                  (z1 - 3, st * .93, st * .93, ox - 4, oy)], mats["glass"], .5)
        loft("Vanguard island cap", island,
             [(z1 - 3, st * .985, st * .985, ox - 4, oy),
              (z1, s * .93, s * .93, ox - 4, oy)], mats[m], 1.5)
    cyl("Vanguard mast", (-228, 97, 218), 5.5, 84, mats["frame"], 12, 3.4)
    torus("Vanguard radar ring", (-228, 97, 252), 22, 3, mats["accent"], 24)
    if not lod:
        for i in range(5):
            cyl("Vanguard antenna", (-252 + i * 12, 97, 268 + (i % 2) * 9),
                1.1, 34, mats["frame"], 8)

    # port/starboard launch galleries hung under the deck lip (visible bays)
    pod = [(-66, -22), (52, -27), (72, -10), (68, 15), (38, 25), (-60, 21), (-78, 5)]
    for side in (-1, 1):
        for i, x in enumerate((-265, -60, 150)):
            y = side * 148
            loft("Vanguard launch gallery", pod,
                 [(-58, .82, .8, x, y), (-20, 1, 1, x, y), (2, .92, .9, x, y)],
                 mats["hull"], 3, tile=HULL_TILE)
            box("Vanguard gallery aperture", (x + 4, y + side * 27, -30),
                (86, 3, 20), mats["glass"], .6)
            if not lod:
                box("Vanguard gallery guide", (x + 4, y + side * 29, -46),
                    (52, 2, 2.6), mats["accent"], .2)

    # deck furniture kept to the runway shoulders (outside |y|<100)
    if not lod:
        for x in (-320, -180, -40, 100, 240):
            box("Vanguard deck container", (x, -118, 14), (26, 12, 8),
                mats["light" if x % 80 else "frame"], .8)
        for x in (-260, 20, 300):
            cyl("Vanguard floodlight mast", (x, 122, 20), 1.4, 22, mats["frame"], 8)
            box("Vanguard floodlight head", (x, 122, 32), (6, 3, 2.4), mats["accent"], .3)
        box("Vanguard blast deflector", (372, 0, 13.5), (4, 120, 9), mats["frame"], 1.2)

    # under-city and lift columns — the concept's hanging mass and light
    for x, y, w, ln in ((-300, -55, 62, 200), (-260, 60, 74, 250),
                        (-90, -70, 56, 170), (30, 55, 48, 150)):
        hanging_tower(x, y, -140, w, ln, mats, lod)
    for x, y, r in ((-340, -90, 15), (-340, 90, 15), (-60, -110, 12),
                    (-60, 110, 12), (250, -85, 14), (250, 85, 14)):
        lift_pylon(x, y, -100, 190, r, mats, lod)


# -------------------------------------------------------------- TEMPEST
def build_tempest(mats, lod):
    n = 20 if lod else 36
    disc = ring_pts(318, n)
    loft("Tempest deck disc", disc, [(3, 1, 1, 0, 0), (10, 1, 1, 0, 0)],
         mats["deck"], 1.2, tile=DECK_TILE)
    loft("Tempest upper hull", disc, [(-44, .9, .9, 0, 0), (-6, 1, 1, 0, 0), (3, 1, 1, 0, 0)],
         mats["hull"], 4, tile=HULL_TILE)
    loft("Tempest recessed band", disc, [(-66, .78, .78, 0, 0), (-42, .87, .87, 0, 0)],
         mats["frame"], 2)
    loft("Tempest under cone", disc, [(-150, .24, .24, 0, 0), (-96, .52, .52, 0, 0), (-62, .74, .74, 0, 0)],
         mats["hull"], 3, tile=HULL_TILE)

    # raised parapet ring sits outside the walkable r<=300 circle. Built from
    # rim segments — a loft here would cap the ring and bury the deck face.
    rim = ring_pts(316, 24 if lod else 36)
    for i in range(len(rim)):
        x0, y0 = rim[i]
        x1, y1 = rim[(i + 1) % len(rim)]
        seg = math.hypot(x1 - x0, y1 - y0)
        box("Tempest parapet segment", ((x0 + x1) / 2, (y0 + y1) / 2, 12.5),
            (seg * .96, 9, 7), mats["light"], .8, math.atan2(y1 - y0, x1 - x0))
    deck_edge_rails(ring_pts(302, 24 if lod else 36), 10, mats, lod, inset=1)

    # guidance rings and approach chevrons on the deck face
    if not lod:
        for r in (120, 210):
            ring = ring_pts(r, 36)
            for i in range(36):
                x0, y0 = ring[i]
                x1, y1 = ring[(i + 1) % 36]
                seg = math.hypot(x1 - x0, y1 - y0)
                box("Tempest guidance ring", ((x0 + x1) / 2, (y0 + y1) / 2, 10.2),
                    (seg * .8, 2.0, .36), mats["accent"], .1,
                    math.atan2(y1 - y0, x1 - x0))
        for k in range(4):
            a = k * math.tau / 4 + math.tau / 8
            box("Tempest approach chevron", (math.cos(a) * 258, math.sin(a) * 258, 10.2),
                (44, 10, .38), mats["light"], .1, a)

    # central command spire — tiered, glazed crown, storm-vane mast
    core = ring_pts(1, 10)
    for z0, z1, r0, r1, m in ((10, 52, 62, 54, "hull"), (52, 104, 48, 42, "light"),
                              (104, 150, 38, 32, "hull"), (150, 178, 42, 36, "glass"),
                              (178, 208, 24, 14, "light")):
        loft("Tempest tower tier", core,
             [(z0, r0, r0, 0, 0), (z1, r1, r1, 0, 0)], mats[m],
             2 if m != "glass" else .8, tile=HULL_TILE if m == "hull" else None)
    cyl("Tempest storm mast", (0, 0, 242), 3.4, 72, mats["frame"], 12, 1.6)
    torus("Tempest radar crown", (0, 0, 272), 16, 2.4, mats["accent"], 24)
    if not lod:
        for k in range(3):
            torus("Tempest tower ring", (0, 0, 58 + k * 48), 56 - k * 7, 1.6,
                  mats["accent"], 24)
        for z, r in ((78, 45), (126, 35)):
            box("Tempest tower glazing", (0, 0, z), (r * 2 + 3, 14, 4), mats["glass"], .5)
            box("Tempest tower glazing", (0, 0, z), (14, r * 2 + 3, 4), mats["glass"], .5)

    # eight radial docking arms with vector turbines beneath
    arms = 8
    for i in range(arms):
        a = i * math.tau / arms
        x, y = math.cos(a) * 352, math.sin(a) * 352
        box("Tempest docking arm", (x, y, 2), (110, 30, 16), mats["hull"], 2, a,
            tile=HULL_TILE)
        box("Tempest arm pad", (math.cos(a) * 398, math.sin(a) * 398, 6),
            (44, 40, 8), mats["light"], 1.2, a)
        cyl("Tempest vector turbine", (math.cos(a) * 398, math.sin(a) * 398, -26),
            17, 52, mats["frame"], 10 if lod else 16)
        if not lod:
            box("Tempest arm guide", (math.cos(a) * 372, math.sin(a) * 372, 10.4),
                (58, 2.2, .4), mats["accent"], .1, a)

    # hanging storm-city: central spire cluster and beams
    for x, y, w, ln in ((0, 0, 84, 300), (-90, 60, 42, 150), (70, -80, 46, 170),
                        (90, 70, 36, 120)):
        hanging_tower(x, y, -140, w, ln, mats, lod)
    lift_pylon(0, 0, -430, 90, 22, mats, lod, beam_len=560)
    for i in range(4):
        a = i * math.tau / 4
        lift_pylon(math.cos(a) * 398, math.sin(a) * 398, -52, 150, 10, mats, lod,
                   beam_len=520)


# -------------------------------------------------------------- INFERNO
INFERNO_DECK = [
    (418, -34), (395, -98), (330, -146), (-150, -152), (-295, -128),
    (-382, -66), (-382, 66), (-295, 128), (-140, 154), (340, 146), (402, 88),
]


def build_inferno(mats, lod):
    deck = INFERNO_DECK
    loft("Inferno deck plate", deck, [(3, 1, 1, 0, 0), (10, 1, 1, 0, 0)],
         mats["deck"], 1.2, tile=DECK_TILE)
    loft("Inferno upper hull", deck, [(-48, .92, .88, 0, 0), (-8, 1, 1, 0, 0), (3, 1, 1, 0, 0)],
         mats["hull"], 4, tile=HULL_TILE)
    # luminous furnace band splits the armored tiers — the forge signature
    loft("Inferno furnace band", deck, [(-64, .8, .76, 6, 0), (-46, .88, .84, 3, 0)],
         mats["accent"], 1.5)
    loft("Inferno lower hull", deck, [(-168, .46, .36, 26, 0), (-120, .68, .58, 14, 0), (-62, .82, .78, 6, 0)],
         mats["hull"], 4, tile=HULL_TILE)

    runway_markings(mats, lod, length=600, lanes=(-52, 0, 52))
    deck_edge_rails(deck, 10, mats, lod)

    # forge citadel: stacked black bastions on the -X half, orange-lit
    for name, loc, dims in (("bastion", (-255, 62, 46), (170, 130, 72)),
                            ("mid keep", (-275, 72, 105), (120, 92, 52)),
                            ("command keep", (-292, 66, 152), (78, 60, 44))):
        box("Inferno citadel " + name, loc, dims, mats["hull"], 3, tile=HULL_TILE)
    if not lod:
        for z, w in ((52, 150), (108, 100), (152, 62)):
            box("Inferno citadel furnace slit", (-262 - (52 - z) * .3, 62 - w * .48, z),
                (w, 2.2, 4.2), mats["accent"], .3)
    # thermal stack farm behind the citadel
    stacks = ((-330, 20), (-330, 65), (-330, 110), (-292, -8), (-255, -30)) if not lod \
        else ((-330, 40), (-300, -10))
    for i, (sx, sy) in enumerate(stacks):
        h = 120 + (i % 3) * 26
        cyl("Inferno thermal stack", (sx, sy, 46 + h / 2), 8.5, h, mats["frame"],
            10 if lod else 14)
        torus("Inferno heat band", (sx, sy, 46 + h * .78), 9.6, 1.8, mats["accent"], 16)
        cyl("Inferno stack mouth", (sx, sy, 50 + h), 7, 7, mats["accent"], 10)

    # armored lateral bays with furnace apertures
    for side in (-1, 1):
        for x in (-180, 40, 240):
            y = side * 158
            box("Inferno armored bay", (x, y, -18), (150, 46, 44), mats["hull"], 3,
                tile=HULL_TILE)
            box("Inferno bay aperture", (x, y + side * 24, -24), (70, 3, 11),
                mats["glass"], .6)
            if not lod:
                box("Inferno bay heat guide", (x, y + side * 26, -40),
                    (58, 2, 2.6), mats["accent"], .2)

    # shoulder cranes on the maintenance apron edges — clear of the runway
    if not lod:
        for gx, side in ((-60, 1), (-210, -1), (140, 1)):
            y = side * 128
            box("Inferno crane base", (gx, y, 16), (18, 14, 12), mats["frame"], .8)
            box("Inferno crane tower", (gx, y, 34), (9, 8, 26), mats["frame"], .8)
            box("Inferno crane jib", (gx, y - side * 26, 46), (7, 62, 5), mats["frame"], .6)
            box("Inferno crane counter", (gx, y + side * 18, 46), (10, 16, 7),
                mats["light"], .6)

    # hanging forge-city and lift columns
    for x, y, w, ln in ((-280, -60, 70, 230), (-160, 70, 78, 260),
                        (-20, -80, 58, 180), (120, 60, 50, 150)):
        hanging_tower(x, y, -160, w, ln, mats, lod)
    for x, y, r in ((-320, -95, 15), (-320, 95, 15), (-40, -115, 13),
                    (-40, 115, 13), (240, -90, 14), (240, 90, 14)):
        lift_pylon(x, y, -110, 200, r, mats, lod)


# --------------------------------------------------------------- pipeline
def apply_world_uvs():
    """Box-project every registered surface at fixed metres-per-tile."""
    for obj, tile in ACTIVE["uv_jobs"]:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.cube_project(cube_size=tile, correct_aspect=True,
                                scale_to_bounds=False)
        bpy.ops.object.mode_set(mode="OBJECT")
    ACTIVE["uv_jobs"].clear()


def apply_and_batch(parent):
    meshes = [o for o in parent.children_recursive if o.type == "MESH"]
    for o in meshes:
        bpy.context.view_layer.objects.active = o
        for mod in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=mod.name)
    groups = {}
    for o in meshes:
        m = o.data.materials[0] if o.data.materials else None
        groups.setdefault(m.name if m else "none", []).append(o)
    for name, objects in groups.items():
        bpy.ops.object.select_all(action="DESELECT")
        for o in objects:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        objects[0].name = parent.name + "__" + name
        objects[0].parent = parent


def export(parent, path):
    bpy.ops.object.select_all(action="DESELECT")
    parent.select_set(True)
    for o in parent.children_recursive:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB",
                              use_selection=True, export_apply=True,
                              export_yup=True, export_materials="EXPORT",
                              export_image_format="JPEG")


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for block in (bpy.data.meshes, bpy.data.materials):
    for item in list(block):
        if item.users == 0:
            block.remove(item)

PALETTES = {
    "vanguard": ((.02, .52, .88), (.01, .3, .5)),
    "tempest": ((.02, .78, .7), (.01, .34, .3)),
    "inferno": ((1.0, .32, .05), (.5, .12, .02)),
}
BUILDERS = {"vanguard": build_vanguard, "tempest": build_tempest,
            "inferno": build_inferno}

for faction, build in BUILDERS.items():
    accent, glow = PALETTES[faction]
    for lod in (0, 1):
        r = root(f"{faction}_ozone_base__lod{lod}")
        build(faction_materials(faction, accent, glow, lod), lod)
        apply_world_uvs()
        apply_and_batch(r)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "ozone-sky-bases-authored-v3.blend"))

for faction in BUILDERS:
    for lod in (0, 1):
        r = bpy.data.objects[f"{faction}_ozone_base__lod{lod}"]
        export(r, os.path.join(OUT, f"{faction}-ozone-base-v3{'-lod1' if lod else ''}.glb"))
    coll_root = root(f"{faction}_ozone_base__collision")
    frame = bpy.data.materials[faction.title() + " structural frame"]
    if faction == "tempest":
        cyl(f"{faction}_deck_collision", (0, 0, 0), 318, 20, frame, 24)
    else:
        box(f"{faction}_deck_collision", (0, 0, 0), (760, 300, 20), frame, 0)
    export(coll_root, os.path.join(OUT, f"{faction}-ozone-base-v3-collision.glb"))

print("Built v3 ozone sky bases in", OUT)
