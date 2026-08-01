"""Build the three Airbourne Arena ozone-layer faction bases.

Concept reference: source-assets/concepts/sky-bases-ozone-concept-v1.png
Outputs: one editable .blend plus LOD0, LOD1 and collision GLBs per faction.
"""
import bpy
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(GAME, "assets")


def material(name, color, metallic=.65, roughness=.35, emission=None):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Metallic"].default_value = metallic
    p.inputs["Roughness"].default_value = roughness
    if emission:
        (p.inputs.get("Emission Color") or p.inputs.get("Emission")).default_value = (*emission, 1)
        p.inputs["Emission Strength"].default_value = 2.8
    return m


def cube(name, loc, dims, mat, parent, bevel=1.2):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    o = bpy.context.object
    o.name = name
    o.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(mat)
    o.parent = parent
    if bevel:
        mod = o.modifiers.new("Manufactured edge", "BEVEL")
        mod.width = bevel
        mod.segments = 2
    return o


def cylinder(name, loc, radius, depth, mat, parent, vertices=24, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                       location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(mat)
    o.parent = parent
    return o


def root(name):
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    return o


def deck_markings(parent, length, width, z, accent, sparse=False):
    count = 5 if sparse else 11
    for i in range(count):
        x = -length * .38 + i * length * .76 / max(1, count - 1)
        cube("Runway center marking", (x, 0, z), (length * .035, 2.2, .22), accent, parent, .12)
    for y in (-width * .37, width * .37):
        cube("Deck edge light rail", (0, y, z), (length * .82, 1.4, .34), accent, parent, .15)


def support_cluster(parent, xs, z, frame, accent, lod):
    for x in xs:
        cylinder("Atmospheric lift nacelle", (x, 0, z - 65), 18 if lod == 0 else 22,
                 120, frame, parent, 20 if lod == 0 else 12)
        cylinder("Lift emitter", (x, 0, z - 128), 12, 7, accent, parent, 20 if lod == 0 else 12)


def vanguard(parent, lod, mats):
    shell, frame, accent, glass = mats
    cube("Vanguard carrier deck", (0, 0, 0), (760, 210, 20), shell, parent, 8)
    cube("Vanguard armored keel", (-40, 0, -42), (520, 118, 70), frame, parent, 12)
    cube("Vanguard command island", (-150, 50, 58), (120, 68, 118), shell, parent, 7)
    cube("Vanguard bridge glazing", (-176, 16, 82), (58, 4, 18), glass, parent, 1)
    for side in (-1, 1):
        cube("Vanguard lateral hangar", (-30, side * 126, 4), (300, 64, 48), shell, parent, 5)
        cube("Vanguard hangar aperture", (70, side * 159, 3), (116, 3, 24), glass, parent, .8)
    if lod == 0:
        for i in range(5):
            cylinder("Vanguard sensor mast", (-190 + i * 28, 50, 132 + i * 4), 2.2, 38, frame, parent, 12)
    deck_markings(parent, 760, 210, 11, accent, lod > 0)
    support_cluster(parent, (-230, 0, 230), -35, frame, accent, lod)


def tempest(parent, lod, mats):
    shell, frame, accent, glass = mats
    cylinder("Tempest broken ring deck", (0, 0, 0), 300, 18, shell, parent, 48 if lod == 0 else 24)
    cylinder("Tempest recessed flight well", (0, 0, 10), 190, 8, frame, parent, 48 if lod == 0 else 24)
    cube("Tempest launch spine", (215, 0, 10), (360, 86, 18), shell, parent, 6)
    cylinder("Tempest command tower", (0, 0, 82), 44, 150, frame, parent, 24 if lod == 0 else 14)
    cylinder("Tempest bridge crown", (0, 0, 158), 58, 16, glass, parent, 24 if lod == 0 else 14)
    arms = 8 if lod == 0 else 4
    for i in range(arms):
        a = i * math.tau / arms
        x, y = math.cos(a) * 330, math.sin(a) * 330
        arm = cube("Tempest docking spine", (x, y, -8), (150, 34, 26), shell, parent, 4)
        arm.rotation_euler.z = a
        cylinder("Tempest vector turbine", (math.cos(a) * 395, math.sin(a) * 395, -26),
                 20, 58, frame, parent, 16 if lod == 0 else 10)
    for r in (205, 285):
        cylinder("Tempest navigation ring", (0, 0, 20 + (r - 205) * .03), r, 2.2, accent,
                 parent, 48 if lod == 0 else 24)
    support_cluster(parent, (0,), -35, frame, accent, lod)


def inferno(parent, lod, mats):
    shell, frame, accent, glass = mats
    cube("Inferno assault deck", (30, 0, 0), (700, 250, 24), shell, parent, 7)
    cube("Inferno forge hull", (-70, 0, -52), (490, 190, 92), frame, parent, 14)
    for side in (-1, 1):
        cube("Inferno armored hangar", (-40, side * 144, 4), (330, 72, 62), shell, parent, 7)
        cube("Inferno furnace aperture", (15, side * 181, 0), (120, 4, 28), glass, parent, 1)
    cube("Inferno command citadel", (-180, 40, 70), (136, 92, 140), shell, parent, 9)
    stacks = 6 if lod == 0 else 3
    for i in range(stacks):
        x = -235 + (i % 3) * 54
        y = -62 + (i // 3) * 120
        cylinder("Inferno thermal stack", (x, y, 152), 9, 110, frame, parent, 14 if lod == 0 else 10)
        cylinder("Inferno stack heat band", (x, y, 187), 10.5, 4, accent, parent, 14 if lod == 0 else 10)
    deck_markings(parent, 700, 250, 13, accent, lod > 0)
    support_cluster(parent, (-210, 0, 210), -45, frame, accent, lod)


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
        for o in objects: o.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        objects[0].name = parent.name + "__" + name
        objects[0].parent = parent


def export(parent, path):
    bpy.ops.object.select_all(action="DESELECT")
    parent.select_set(True)
    for o in parent.children_recursive: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True,
                              export_apply=True, export_yup=True, export_materials="EXPORT")


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

palettes = {
    "vanguard": ((.63, .72, .78), (.055, .08, .13), (.04, .58, .9), (.018, .11, .18)),
    "tempest": ((.18, .25, .27), (.035, .06, .075), (.02, .75, .68), (.01, .14, .16)),
    "inferno": ((.12, .13, .14), (.025, .03, .035), (1.0, .24, .035), (.22, .035, .01)),
}
builders = {"vanguard": vanguard, "tempest": tempest, "inferno": inferno}
roots = []
for faction, build in builders.items():
    colors = palettes[faction]
    mats = (
        material(faction.title() + " aerospace shell", colors[0]),
        material(faction.title() + " structural frame", colors[1], .82, .28),
        material(faction.title() + " emissive guidance", colors[2], .35, .22, colors[2]),
        material(faction.title() + " recessed glazing", colors[3], .25, .12, colors[3]),
    )
    for lod in (0, 1):
        r = root(f"{faction}_ozone_base__lod{lod}")
        build(r, lod, mats)
        apply_and_batch(r)
        roots.append(r)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "ozone-sky-bases-authored-v1.blend"))
for faction in builders:
    for lod in (0, 1):
        r = bpy.data.objects[f"{faction}_ozone_base__lod{lod}"]
        export(r, os.path.join(OUT, f"{faction}-ozone-base-v1{'-lod1' if lod else ''}.glb"))
    collision = root(f"{faction}_ozone_base__collision")
    cube(f"{faction}_deck_collision", (0, 0, 0),
         (760, 230, 20) if faction != "tempest" else (650, 650, 20),
         bpy.data.materials[faction.title() + " structural frame"], collision, 0)
    export(collision, os.path.join(OUT, f"{faction}-ozone-base-v1-collision.glb"))

print("Built ozone sky bases in", OUT)
