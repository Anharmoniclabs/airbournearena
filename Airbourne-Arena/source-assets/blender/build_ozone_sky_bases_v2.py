"""Build concept-matched v2 ozone bases with real geometry and UV deck overlays.

The concept image guides visible silhouette and proportions. Existing deck
imagery is used only on horizontal surfaces and decals; it never substitutes
for closed structural volumes.
"""
import bpy
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(GAME, "assets")
# Runtime-safe PNG copies avoid EXT_texture_webp, which is newer than the
# project's pinned Three.js r128 GLTFLoader.
DECK_IMAGE = os.path.join(OUT, "airbase-deck-diffusion-4k-v1-runtime.jpg")
TEAM_IMAGE = os.path.join(OUT, "team-airbases-v2-runtime.jpg")


def material(name, color, metallic=.55, roughness=.4, emission=None, image_path=None):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        (bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")).default_value = (*emission, 1)
        # Keep strength at the core glTF value so Blender does not emit
        # KHR_materials_emissive_strength (unsupported by Three.js r128).
        bsdf.inputs["Emission Strength"].default_value = 1.0
    if image_path:
        image = bpy.data.images.load(image_path, check_existing=True)
        tex = nodes.new("ShaderNodeTexImage")
        tex.name = name + " image overlay"
        tex.image = image
        tex.interpolation = "Linear"
        links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def root(name):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    return obj


def cube(name, loc, dims, mat, parent, bevel=1.0, rot_z=0.0):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=(0, 0, rot_z))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    obj.parent = parent
    if bevel:
        mod = obj.modifiers.new("manufactured edge", "BEVEL")
        mod.width = bevel
        mod.segments = 2
    return obj


def cylinder(name, loc, radius, depth, mat, parent, vertices=20, radius_top=None):
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius,
        radius2=radius if radius_top is None else radius_top,
        depth=depth,
        location=loc,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    obj.parent = parent
    return obj


def torus(name, loc, major, minor, mat, parent, segments=48):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major,
        minor_radius=minor,
        major_segments=segments,
        minor_segments=6,
        location=loc,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    obj.parent = parent
    return obj


def prism(name, points, z_top, depth, mat, parent, bevel=1.0):
    """Closed vertical extrusion of a plan-view polygon."""
    count = len(points)
    verts = [(x, y, z_top) for x, y in points] + [(x, y, z_top - depth) for x, y in points]
    faces = [tuple(range(count)), tuple(range(count * 2 - 1, count - 1, -1))]
    for i in range(count):
        j = (i + 1) % count
        faces.append((i, j, count + j, count + i))
    mesh = bpy.data.meshes.new(name + " mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    obj.parent = parent
    if bevel:
        mod = obj.modifiers.new("armored edge", "BEVEL")
        mod.width = bevel
        mod.segments = 2
    return obj


def panel(name, loc, dims, mat, parent, uv=(0, 0, 1, 1), rot_z=0.0):
    """Horizontal UV-mapped rectangle. UVs may exceed 1 for intentional tiling."""
    hx, hy = dims[0] * .5, dims[1] * .5
    verts = [(-hx, -hy, 0), (hx, -hy, 0), (hx, hy, 0), (-hx, hy, 0)]
    mesh = bpy.data.meshes.new(name + " mesh")
    mesh.from_pydata(verts, [], [(0, 1, 2, 3)])
    layer = mesh.uv_layers.new(name="UVMap")
    u0, v0, u1, v1 = uv
    for loop, co in zip(mesh.polygons[0].loop_indices, ((u0, v0), (u1, v0), (u1, v1), (u0, v1))):
        layer.data[loop].uv = co
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    obj.rotation_euler.z = rot_z
    obj.data.materials.append(mat)
    obj.parent = parent
    return obj


def disc_panel(name, loc, radius, mat, parent, atlas=(0, 0, 1, 1), segments=64):
    verts = [(0, 0, 0)] + [
        (math.cos(i * math.tau / segments) * radius,
         math.sin(i * math.tau / segments) * radius, 0)
        for i in range(segments)
    ]
    faces = []
    for i in range(segments):
        faces.append((0, i + 1, (i + 1) % segments + 1))
    mesh = bpy.data.meshes.new(name + " mesh")
    mesh.from_pydata(verts, [], faces)
    uv_layer = mesh.uv_layers.new(name="UVMap")
    u0, v0, u1, v1 = atlas
    for poly in mesh.polygons:
        for loop_index in poly.loop_indices:
            co = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            uv_layer.data[loop_index].uv = (
                u0 + (co.x / radius + 1) * .5 * (u1 - u0),
                v0 + (co.y / radius + 1) * .5 * (v1 - v0),
            )
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    obj.data.materials.append(mat)
    obj.parent = parent
    return obj


def window_band(parent, prefix, start_x, count, spacing, y, z, mat, rot_z=0):
    for i in range(count):
        cube(prefix + " window", (start_x + i * spacing, y, z), (9, 1.2, 3.2), mat, parent, .2, rot_z)


def landing_guides(parent, length, y, z, accent, sparse=False):
    count = 6 if sparse else 15
    for i in range(count):
        x = -length * .42 + i * length * .84 / max(1, count - 1)
        cube("recessed runway beacon", (x, y, z), (10, 1.0, .35), accent, parent, .15)


def carrier_edge_modules(parent, prefix, xs, y, z, shell, frame, glass, accent, lod):
    """Layered side bays that produce the dense carrier silhouette in concept."""
    for i, x in enumerate(xs):
        cube(prefix + " armored edge bay", (x, y, z), (72, 46, 44), shell, parent, 5)
        cube(prefix + " recessed edge aperture", (x, y + (-24 if y < 0 else 24), z + 2),
             (47, 2.4, 19), glass, parent, .4)
        cube(prefix + " lower armor jaw", (x + 5, y, z - 31), (61, 37, 18), frame, parent, 3)
        if lod == 0:
            cube(prefix + " service light", (x, y + (-25.5 if y < 0 else 25.5), z - 17),
                 (28, 1.1, 2.0), accent, parent, .15)


def tower_terrace(parent, prefix, loc, dims, shell, frame, glass, accent, lod):
    """A readable command-deck tier with glazing, undercut and corner nodes."""
    x, y, z = loc
    cube(prefix + " command terrace", loc, dims, shell, parent, 6)
    cube(prefix + " terrace undercut", (x, y, z - dims[2] * .48),
         (dims[0] * .82, dims[1] * .8, 11), frame, parent, 2)
    cube(prefix + " panoramic bridge band", (x, y - dims[1] * .51, z + 2),
         (dims[0] * .78, 2.2, max(7, dims[2] * .24)), glass, parent, .35)
    if lod == 0:
        for side in (-1, 1):
            cylinder(prefix + " terrace sensor", (x + side * dims[0] * .38, y, z + dims[2] * .58),
                     4.2, 13, accent, parent, 12)


def lift_pylon(parent, x, y, top_z, frame, accent, lod, heavy=False):
    depth = 285 if heavy else 225
    r = 28 if heavy else 21
    cylinder("orbital lift pylon", (x, y, top_z - depth * .5), r, depth, frame, parent, 20 if lod == 0 else 10, r * .72)
    cylinder("lift field emitter", (x, y, top_z - depth - 7), r * .72, 12, accent, parent, 20 if lod == 0 else 10, r * .5)
    if lod == 0:
        for k in range(5):
            torus("pylon service collar", (x, y, top_z - 38 - k * 45), r * .86, 1.5, accent, parent, 18)


def build_vanguard(parent, lod, mats):
    shell, frame, accent, glass, deck, blue_overlay = mats
    detail = lod == 0
    outline = [(-410, -72), (-372, -128), (-120, -158), (245, -145), (410, -92),
               (410, 92), (245, 145), (-120, 158), (-372, 128), (-410, 72)]
    prism("Vanguard armored flight deck", outline, 10, 24, shell, parent, 5)
    lower = [(x * .93, y * .82) for x, y in outline]
    prism("Vanguard deep carrier hull", lower, -12, 68, frame, parent, 9)
    keel = [(-290, -62), (270, -72), (350, -42), (350, 42), (270, 72), (-290, 62)]
    prism("Vanguard central keel", keel, -74, 82, frame, parent, 8)
    panel("Vanguard tiled runway", (35, 0, 10.8), (650, 92), deck, parent, (0, 0, 8, 1.8))
    panel("Vanguard port deck plating", (40, -112, 10.9), (590, 55), deck, parent, (0, 0, 7, 1.15))
    panel("Vanguard starboard deck plating", (40, 112, 10.9), (590, 55), deck, parent, (0, 0, 7, 1.15))
    disc_panel("Vanguard blue tactical deck overlay", (-205, 0, 11.1), 62, blue_overlay, parent, (0, .25, .5, .75), 48 if detail else 24)
    for side in (-1, 1):
        cube("Vanguard side launch gallery", (18, side * 150, -8), (290, 54, 44), shell, parent, 5)
        cube("Vanguard recessed hangar mouth", (82, side * 178, -2), (132, 3, 24), glass, parent, .5)
        cube("Vanguard forward sensor sponson", (-275, side * 137, 5), (118, 48, 34), shell, parent, 5, side * .05)
        if detail:
            for j in range(4):
                cube("Vanguard side armor cassette", (175 + j * 46, side * 156, -24), (35, 18, 20), frame, parent, 2)
        carrier_edge_modules(parent, "Vanguard", (-286, -180, -70, 58, 185, 306), side * 164,
                             -7, shell, frame, glass, accent, lod)
    # Asymmetric naval command island, stacked like the concept reference.
    tower_terrace(parent, "Vanguard lower", (-120, 88, 48), (188, 106, 82), shell, frame, glass, accent, lod)
    tower_terrace(parent, "Vanguard middle", (-150, 84, 116), (128, 82, 74), shell, frame, glass, accent, lod)
    tower_terrace(parent, "Vanguard upper", (-172, 82, 177), (96, 69, 48), shell, frame, glass, accent, lod)
    cube("Vanguard flight control balcony", (-108, 38, 112), (138, 28, 16), frame, parent, 3)
    cube("Vanguard port command wing", (-145, 20, 164), (188, 42, 22), shell, parent, 4)
    cube("Vanguard aft command wing", (-245, 84, 146), (96, 142, 25), shell, parent, 5)
    cube("Vanguard rear operations block", (-246, 100, 78), (72, 92, 106), shell, parent, 7)
    cylinder("Vanguard command mast", (-172, 82, 246), 6, 96, frame, parent, 12)
    cylinder("Vanguard radar crown", (-172, 82, 294), 19, 8, accent, parent, 16)
    cylinder("Vanguard upper sensor tower", (-172, 82, 338), 12, 78, shell, parent, 14, 8)
    torus("Vanguard upper sensor ring", (-172, 82, 366), 26, 3, accent, parent, 24)
    if detail:
        for i in range(6):
            cylinder("Vanguard antenna", (-202 + i * 12, 82, 371 + (i % 2) * 13), 1.1, 48, frame, parent, 8)
        window_band(parent, "Vanguard", -205, 7, 12, 46, 177, glass)
    landing_guides(parent, 650, -38, 11.4, accent, not detail)
    landing_guides(parent, 650, 38, 11.4, accent, not detail)
    for x, y in ((-300, -96), (-300, 96), (75, -112), (75, 112), (315, -74), (315, 74)):
        lift_pylon(parent, x, y, -44, frame, accent, lod, heavy=x < -250)


def build_tempest(parent, lod, mats):
    shell, frame, accent, glass, deck, blue_overlay = mats
    detail = lod == 0
    cylinder("Tempest outer ring hull", (0, 0, -8), 330, 46, shell, parent, 64 if detail else 28, 318)
    cylinder("Tempest armored under-ring", (0, 0, -48), 278, 56, frame, parent, 56 if detail else 24, 246)
    disc_panel("Tempest circular deck overlay", (0, 0, 15.2), 302, blue_overlay, parent, (0, .25, .5, .75), 72 if detail else 32)
    torus("Tempest cyan inner guide", (0, 0, 16), 173, 3.2, accent, parent, 64 if detail else 28)
    torus("Tempest cyan outer guide", (0, 0, 16), 284, 2.6, accent, parent, 64 if detail else 28)
    arms = 8 if detail else 4
    for i in range(arms):
        a = i * math.tau / arms
        x, y = math.cos(a) * 345, math.sin(a) * 345
        arm = cube("Tempest radial docking arm", (x, y, -4), (165, 48, 36), shell, parent, 5, a)
        arm.name += " %02d" % i
        cylinder("Tempest vector turbine", (math.cos(a) * 408, math.sin(a) * 408, -42), 24, 80, frame, parent, 18 if detail else 10, 17)
        cube("Tempest arm guidance", (math.cos(a) * 325, math.sin(a) * 325, 16.2), (90, 3, .5), accent, parent, .2, a)
        cube("Tempest docking head", (math.cos(a) * 421, math.sin(a) * 421, 2), (92, 74, 48), shell, parent, 7, a)
        cube("Tempest docking aperture", (math.cos(a) * 445, math.sin(a) * 445, 4),
             (44, 3, 19), glass, parent, .5, a)
    # Stacked central tower and cantilevered control decks.
    cylinder("Tempest central lift core", (0, 0, -100), 34, 210, frame, parent, 24 if detail else 12, 25)
    cylinder("Tempest tower base", (0, 0, 50), 94, 74, frame, parent, 28 if detail else 14, 72)
    cylinder("Tempest command tower", (0, 0, 129), 58, 104, shell, parent, 24 if detail else 12, 42)
    torus("Tempest command balcony", (0, 0, 178), 73, 8, shell, parent, 32 if detail else 16)
    cylinder("Tempest bridge crown", (0, 0, 194), 70, 24, glass, parent, 24 if detail else 12)
    cylinder("Tempest upper operations", (0, 0, 229), 43, 48, shell, parent, 20 if detail else 10, 31)
    torus("Tempest upper flight-control ring", (0, 0, 264), 61, 7, shell, parent, 28 if detail else 14)
    cylinder("Tempest sensor spire", (0, 0, 334), 7, 132, frame, parent, 12)
    cylinder("Tempest sensor crown", (0, 0, 397), 22, 9, accent, parent, 18)
    for i in range(4 if detail else 2):
        a = i * math.pi / 2
        cube("Tempest elevated control cantilever", (math.cos(a) * 102, math.sin(a) * 102, 103), (125, 34, 24), shell, parent, 4, a)
    if detail:
        for i in range(16):
            a = i * math.tau / 16
            cube("Tempest perimeter service bay", (math.cos(a) * 304, math.sin(a) * 304, -20), (30, 20, 18), frame, parent, 2, a)
            cube("Tempest perimeter armor fin", (math.cos(a) * 340, math.sin(a) * 340, -15),
                 (38, 23, 52), shell, parent, 3, a)
    for x, y in ((0, 0), (-190, -190), (-190, 190), (190, -190), (190, 190)):
        lift_pylon(parent, x, y, -64, frame, accent, lod, heavy=x == 0 and y == 0)


def build_inferno(parent, lod, mats):
    shell, frame, accent, glass, deck, red_overlay = mats
    detail = lod == 0
    outline = [(-430, -80), (-370, -154), (100, -182), (405, -125), (450, -68),
               (450, 68), (405, 125), (100, 182), (-370, 154), (-430, 80)]
    prism("Inferno assault flight deck", outline, 12, 30, shell, parent, 6)
    middle = [(x * .95, y * .9) for x, y in outline]
    prism("Inferno stepped armor hull", middle, -16, 74, frame, parent, 11)
    lower = [(x * .8, y * .72) for x, y in outline]
    prism("Inferno furnace keel", lower, -82, 96, frame, parent, 12)
    panel("Inferno tiled runway", (42, 0, 13.0), (690, 104), deck, parent, (0, 0, 8.5, 2.0))
    panel("Inferno port deck plating", (38, -124, 13.1), (640, 63), deck, parent, (0, 0, 7.5, 1.25))
    panel("Inferno starboard deck plating", (38, 124, 13.1), (640, 63), deck, parent, (0, 0, 7.5, 1.25))
    disc_panel("Inferno red tactical deck overlay", (-220, 0, 13.3), 66, red_overlay, parent, (.5, .25, 1, .75), 48 if detail else 24)
    for side in (-1, 1):
        cube("Inferno armored side terrace", (10, side * 170, -18), (420, 54, 62), shell, parent, 7)
        cube("Inferno furnace hangar mouth", (100, side * 199, -5), (160, 3, 30), glass, parent, .5)
        cube("Inferno forward weapons blister", (-300, side * 145, 8), (105, 70, 48), shell, parent, 7)
        if detail:
            for j in range(6):
                cube("Inferno ablative armor block", (80 + j * 48, side * 184, -52), (38, 21, 24), shell, parent, 2)
        carrier_edge_modules(parent, "Inferno", (-310, -202, -86, 44, 180, 320), side * 188,
                             -18, shell, frame, glass, accent, lod)
    tower_terrace(parent, "Inferno lower", (-122, 86, 53), (224, 126, 98), shell, frame, glass, accent, lod)
    tower_terrace(parent, "Inferno middle", (-164, 82, 132), (152, 101, 92), frame, shell, glass, accent, lod)
    tower_terrace(parent, "Inferno upper", (-188, 82, 204), (116, 84, 53), shell, frame, glass, accent, lod)
    cube("Inferno rear reactor fortress", (-274, 99, 89), (82, 110, 132), shell, parent, 9)
    cube("Inferno armored command blade", (-194, 82, 282), (82, 72, 118), shell, parent, 7)
    cube("Inferno command blade glazing", (-194, 45, 292), (62, 3, 38), glass, parent, .4)
    cylinder("Inferno command spire", (-194, 82, 375), 8, 96, frame, parent, 12, 5)
    torus("Inferno command sensor crown", (-194, 82, 421), 24, 3, accent, parent, 20)
    stacks = 8 if detail else 4
    for i in range(stacks):
        x = -250 + (i % 4) * 48
        y = 33 + (i // 4) * 116
        cylinder("Inferno thermal stack", (x, y, 286), 11, 174, frame, parent, 14 if detail else 8, 7)
        torus("Inferno stack heat collar", (x, y, 327), 11, 1.8, accent, parent, 14)
    if detail:
        window_band(parent, "Inferno", -214, 9, 13, 33, 116, glass)
    landing_guides(parent, 690, -44, 13.6, accent, not detail)
    landing_guides(parent, 690, 44, 13.6, accent, not detail)
    for x, y in ((-320, -112), (-320, 112), (20, -138), (20, 138), (330, -95), (330, 95)):
        lift_pylon(parent, x, y, -62, frame, accent, lod, heavy=True)


def apply_and_batch(parent):
    meshes = [o for o in parent.children_recursive if o.type == "MESH"]
    for obj in meshes:
        bpy.context.view_layer.objects.active = obj
        for mod in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=mod.name)
    groups = {}
    for obj in meshes:
        key = obj.data.materials[0].name if obj.data.materials else "none"
        groups.setdefault(key, []).append(obj)
    for mat_name, objects in groups.items():
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        objects[0].name = parent.name + "__" + mat_name
        objects[0].parent = parent


def export(parent, path):
    bpy.ops.object.select_all(action="DESELECT")
    parent.select_set(True)
    for obj in parent.children_recursive:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
    )


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.images):
    pass

palettes = {
    "vanguard": ((.56, .64, .70), (.035, .055, .08), (.02, .56, 1.0), (.01, .10, .18)),
    "tempest": ((.10, .22, .23), (.025, .05, .065), (.01, .85, .74), (.005, .17, .19)),
    "inferno": ((.055, .06, .07), (.015, .018, .022), (1.0, .18, .025), (.22, .025, .008)),
}
builders = {"vanguard": build_vanguard, "tempest": build_tempest, "inferno": build_inferno}
roots = []
for faction, builder in builders.items():
    colors = palettes[faction]
    deck_mat = material(faction.title() + " tiled flight deck", (.28, .30, .32), .72, .5, image_path=DECK_IMAGE)
    overlay_mat = material(faction.title() + " tactical mesh overlay", (.3, .3, .3), .72, .38, image_path=TEAM_IMAGE)
    mats = (
        material(faction.title() + " orbital armor", colors[0], .7, .32),
        material(faction.title() + " structural shadow", colors[1], .84, .3),
        material(faction.title() + " emissive guidance", colors[2], .38, .24, colors[2]),
        material(faction.title() + " recessed glazing", colors[3], .42, .16, colors[3]),
        deck_mat,
        overlay_mat,
    )
    for lod in (0, 1):
        asset_root = root(f"{faction}_ozone_base_v2__lod{lod}")
        builder(asset_root, lod, mats)
        apply_and_batch(asset_root)
        roots.append(asset_root)

for faction in builders:
    for lod in (0, 1):
        asset_root = bpy.data.objects[f"{faction}_ozone_base_v2__lod{lod}"]
        suffix = "-lod1" if lod else ""
        export(asset_root, os.path.join(OUT, f"{faction}-ozone-base-v2{suffix}.glb"))
    collision = root(f"{faction}_ozone_base_v2__collision")
    if faction == "tempest":
        cylinder(f"{faction}_deck_collision", (0, 0, 0), 330, 24,
                 bpy.data.materials[faction.title() + " structural shadow"], collision, 20)
    else:
        dims = (860, 340, 28) if faction == "vanguard" else (900, 380, 32)
        cube(f"{faction}_deck_collision", (0, 0, 0), dims,
             bpy.data.materials[faction.title() + " structural shadow"], collision, 0)
    export(collision, os.path.join(OUT, f"{faction}-ozone-base-v2-collision.glb"))

# Keep the authored collision proxies in the editable source file as well as in
# the exported runtime artifacts.
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "ozone-sky-bases-authored-v2.blend"))

print("Built concept-matched ozone sky bases v2 in", OUT)
