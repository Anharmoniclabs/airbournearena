"""Author the Vanguard Interceptor v4 primary-form Blender and runtime assets."""

import math
import os

import bpy
from mathutils import Vector


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SOURCE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BLEND_OUT = os.path.join(SOURCE_ROOT, "blender", "vanguard-interceptor-v4.blend")
GLB_OUT = os.path.join(ROOT, "assets", "vanguard-interceptor-v4.glb")
PUBLIC_GLB_OUT = os.path.join(ROOT, "source", "public", "assets", "vanguard-interceptor-v4.glb")
LOD1_OUT = os.path.join(ROOT, "assets", "vanguard-interceptor-v4-lod1.glb")
PUBLIC_LOD1_OUT = os.path.join(ROOT, "source", "public", "assets", "vanguard-interceptor-v4-lod1.glb")
COLLISION_OUT = os.path.join(ROOT, "assets", "vanguard-interceptor-v4-collision.glb")
PUBLIC_COLLISION_OUT = os.path.join(
    ROOT, "source", "public", "assets", "vanguard-interceptor-v4-collision.glb"
)
PREVIEW_OUT = os.path.join(SOURCE_ROOT, "previews", "vanguard-interceptor-v4-primary.png")
ALBEDO_PATH = os.path.join(ROOT, "assets", "vanguard-interceptor-v4-tileable-albedo.png")


def make_material(name, color, metallic, roughness, emission=None):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = (*color, 1.0)
    shader = material.node_tree.nodes["Principled BSDF"]
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    if emission:
        emission_input = shader.inputs.get("Emission Color") or shader.inputs.get("Emission")
        emission_input.default_value = (*emission, 1.0)
        shader.inputs["Emission Strength"].default_value = 4.5
    return material


def apply_uv_albedo(material, path):
    image = bpy.data.images.load(path, check_existing=True)
    image.colorspace_settings.name = "sRGB"
    nodes = material.node_tree.nodes
    texture = nodes.new("ShaderNodeTexImage")
    texture.name = "Vanguard tileable armor albedo"
    texture.image = image
    texture.extension = "REPEAT"
    mix = nodes.new("ShaderNodeMixRGB")
    mix.name = "Restrain generated surface to micro-detail"
    mix.blend_type = "MIX"
    mix.inputs[0].default_value = .62
    mix.inputs[2].default_value = (.44, .49, .54, 1.0)
    material.node_tree.links.new(texture.outputs["Color"], mix.inputs[1])
    material.node_tree.links.new(
        mix.outputs["Color"],
        nodes["Principled BSDF"].inputs["Base Color"],
    )


def finish(obj, bevel=.04, smooth=False):
    if bevel:
        modifier = obj.modifiers.new("Controlled manufactured edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
    if smooth:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def plan_prism(name, outline, thickness, material, z=0):
    count = len(outline)
    vertices = [(x, y, z - thickness / 2) for x, y in outline]
    vertices += [(x, y, z + thickness / 2) for x, y in outline]
    faces = [tuple(range(count - 1, -1, -1)), tuple(range(count, count * 2))]
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, count + following, count + index))
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    return finish(obj, min(.055, thickness * .18))


def tapered_plan_prism(name, outline, thickness, material, z=0, top_x=.76, top_y=.97):
    """Closed faceted shell with sloped sides for blended-wing primary forms."""
    count = len(outline)
    bottom = [(x, y, z - thickness / 2) for x, y in outline]
    top = [(x * top_x, y * top_y, z + thickness / 2) for x, y in outline]
    vertices = bottom + top
    faces = [tuple(range(count - 1, -1, -1)), tuple(range(count, count * 2))]
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, count + following, count + index))
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    return finish(obj, min(.065, thickness * .12))


def side_prism(name, outline, thickness, material, x=0):
    count = len(outline)
    vertices = [(x - thickness / 2, y, z) for y, z in outline]
    vertices += [(x + thickness / 2, y, z) for y, z in outline]
    faces = [tuple(range(count - 1, -1, -1)), tuple(range(count, count * 2))]
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, count + following, count + index))
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    return finish(obj, .035)


def box(name, location, scale, material, bevel=.06):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    return finish(obj, bevel)


def faceted_loft(name, stations, sides, material, x_center=0):
    vertices = []
    faces = []
    for y, width, height, z_center in stations:
        for segment in range(sides):
            angle = segment / sides * math.tau
            vertices.append((
                x_center + math.cos(angle) * width,
                y,
                z_center + math.sin(angle) * height,
            ))
    for station in range(len(stations) - 1):
        for segment in range(sides):
            following = (segment + 1) % sides
            a = station * sides + segment
            b = station * sides + following
            c = (station + 1) * sides + following
            d = (station + 1) * sides + segment
            faces.append((a, b, c, d))
    faces.append(tuple(range(sides - 1, -1, -1)))
    tail = (len(stations) - 1) * sides
    faces.append(tuple(tail + index for index in range(sides)))
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    return finish(obj, .025, True)


def cylinder_y(name, radius, length, location, material, vertices=24):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=length,
        location=location,
        rotation=(math.pi / 2, 0, 0),
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    return finish(obj, .025, True)


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

white = make_material("Vanguard ceramic armor", (.62, .66, .68), .58, .28)
apply_uv_albedo(white, ALBEDO_PATH)
white_clean = make_material("Vanguard clean ceramic armor", (.48, .53, .58), .64, .24)
graphite = make_material("Graphite mechanical structure", (.018, .026, .036), .72, .24)
blue = make_material("Vanguard cobalt armor", (.025, .12, .32), .62, .22)
glass = make_material("Smoked cockpit glass", (.008, .022, .035), .28, .06)
metal = make_material("Heat shield metal", (.10, .12, .15), .90, .20)
emissive = make_material("Vanguard energy channel", (.005, .22, .58), .36, .15, (.01, .34, 1.0))
engine_dark = make_material("Engine interior", (.006, .008, .012), .76, .16)

root = bpy.data.objects.new("Vanguard_Interceptor_V4", None)
bpy.context.collection.objects.link(root)

wing = plan_prism("Vanguard__blended_delta__lod0", [
    (0, -5.15), (-1.00, -4.75), (-8.20, -.10), (-8.55, 1.10),
    (-5.55, 3.55), (-2.65, 3.05), (-1.65, 4.55), (0, 5.15),
    (1.65, 4.55), (2.65, 3.05), (5.55, 3.55), (8.55, 1.10),
    (8.20, -.10), (1.00, -4.75),
], .26, white, -.23)
wing.parent = root

keel = tapered_plan_prism("Vanguard__ventral_keel__lod0", [
    (0, -7.25), (-.68, -6.35), (-1.25, -3.65), (-1.38, 2.20),
    (-.92, 4.85), (0, 5.45), (.92, 4.85), (1.38, 2.20),
    (1.25, -3.65), (.68, -6.35),
], .72, graphite, -.02, .82, .985)
keel.parent = root

dorsal = tapered_plan_prism("Vanguard__dorsal_spine__lod0", [
    (0, -6.60), (-.48, -5.80), (-.92, -3.20), (-1.02, 1.75),
    (-.72, 4.25), (0, 4.75), (.72, 4.25), (1.02, 1.75),
    (.92, -3.20), (.48, -5.80),
], .82, white_clean, .34, .70, .975)
dorsal.parent = root

# The planform shells establish the top silhouette; this longitudinal core
# establishes the equally important side silhouette. It is a closed faceted
# volume, not a profile card, and blends the wedge nose into the cockpit crown
# and engine deck.
core = side_prism("Vanguard__aerodynamic_core__lod0", [
    (-7.24, -.26), (-6.78, .04), (-5.65, .46), (-4.38, .78),
    (-3.10, 1.02), (-1.15, 1.05), (1.10, .94), (3.15, .74),
    (4.72, .42), (5.42, .04), (4.92, -.20), (1.15, -.30),
    (-3.10, -.38), (-6.30, -.42),
], 1.28, white_clean, 0)
core.parent = root

# Bridge the lifting body into the propulsion modules so the engines read as
# integrated aircraft volume instead of boxes attached to a flat wing.
aft_deck = tapered_plan_prism("Vanguard__aft_engine_deck__lod0", [
    (-1.16, -.15), (-2.64, .42), (-2.96, 3.72), (-2.32, 4.88),
    (-.82, 4.50), (0, 4.72), (.82, 4.50), (2.32, 4.88),
    (2.96, 3.72), (2.64, .42), (1.16, -.15),
], .48, white_clean, .30, .90, .96)
aft_deck.parent = root

for side in (-1, 1):
    cheek = plan_prism(f"Vanguard__forward_cheek_{side:+d}__lod0", [
        (side * .48, -5.75), (side * 1.00, -4.70), (side * 2.35, -2.35),
        (side * 2.05, -.55), (side * 1.02, -.95), (side * .78, -4.25),
    ], .28, white_clean, .25)
    cheek.parent = root
    shoulder = plan_prism(f"Vanguard__engine_shoulder_{side:+d}__lod0", [
        (side * 1.08, -1.18), (side * 2.58, -.62), (side * 2.76, 2.72),
        (side * 2.28, 4.35), (side * 1.18, 3.72),
    ], .34, white_clean, .22)
    shoulder.parent = root
    engine = faceted_loft(
        f"Vanguard__integrated_engine_{side:+d}__lod0",
        [
            (-1.18, .54, .34, .12),
            (-.58, .72, .48, .18),
            (.55, .78, .55, .18),
            (2.55, .74, .53, .17),
            (4.25, .66, .48, .14),
            (5.12, .50, .39, .10),
        ],
        12,
        metal,
        side * 1.78,
    )
    engine.parent = root
    intake = box(
        f"Vanguard__intake_{side:+d}__lod0",
        (side * 1.78, -.82, .10), (.47, .34, .24), engine_dark, .16
    )
    intake.parent = root
    intake_lip = box(
        f"Vanguard__intake_lip_{side:+d}__lod0",
        (side * 1.78, -1.16, .10), (.58, .08, .30), blue, .06
    )
    intake_lip.parent = root
    nozzle = cylinder_y(
        f"Vanguard__plasma_nozzle_{side:+d}__lod0",
        .43, .42, (side * 1.78, 5.18, .10), metal, 32
    )
    nozzle.parent = root
    core = cylinder_y(
        f"Vanguard__emissive_core_{side:+d}__lod0",
        .31, .10, (side * 1.78, 5.44, .10), emissive, 32
    )
    core.parent = root
    rail = plan_prism(f"Vanguard__dorsal_rail_{side:+d}__lod0", [
        (side * 1.04, -.92), (side * 1.30, -.58), (side * 1.39, 4.18),
        (side * 1.14, 4.34),
    ], .09, blue, .72)
    rail.parent = root
    channel = box(
        f"Vanguard__energy_channel_{side:+d}__lod0",
        (side * 1.25, 1.86, .80), (.028, 1.90, .022), emissive, .010
    )
    channel.parent = root
    fin = side_prism(f"Vanguard__canted_fin_{side:+d}__lod0", [
        (2.18, .36), (3.18, 1.76), (4.20, 1.64), (3.82, .34)
    ], .15, blue, side * 2.34)
    fin.rotation_euler.y = side * math.radians(24)
    fin.parent = root
    tip = plan_prism(f"Vanguard__wingtip_{side:+d}__lod0", [
        (side * 8.18, -.08), (side * 8.50, .18), (side * 8.52, 1.26),
        (side * 8.30, 1.52),
    ], .28, blue, -.02)
    tip.parent = root

canopy = faceted_loft("Vanguard__recessed_canopy__lod0", [
    (-5.30, .04, .02, .55), (-4.78, .26, .13, .66),
    (-3.96, .47, .25, .82), (-3.10, .52, .28, .88),
    (-2.34, .38, .18, .80), (-1.88, .06, .03, .65),
], 12, glass)
canopy.parent = root

for side in (-1, 1):
    for index, y in enumerate((-.05, .42, .89, 1.36)):
        vent = box(
            f"Vanguard__heat_vent_{side:+d}_{index + 1:02d}__lod0",
            (side * 2.02, y, .79), (.18, .11, .025), engine_dark, .022
        )
        vent.rotation_euler.z = side * math.radians(9)
        vent.parent = root

# Secondary armor is a genuine shallow mesh layer that follows the wing and
# central spine. It breaks up broad primary forms without becoming floating
# decoration; fine seams and fasteners remain in the UV surface.
for side in (-1, 1):
    armor_specs = (
        ([
            (side * 1.45, -3.20), (side * 3.45, -1.95),
            (side * 3.10, -.82), (side * 1.34, -1.55),
        ], white_clean, "forward"),
        ([
            (side * 3.15, -.72), (side * 6.28, .12),
            (side * 5.58, .96), (side * 3.25, .58),
        ], white_clean, "mid"),
        ([
            (side * 2.92, 1.02), (side * 5.42, 1.62),
            (side * 4.72, 2.66), (side * 2.62, 2.26),
        ], white_clean, "aft"),
    )
    for outline, armor_material, label in armor_specs:
        plate = plan_prism(
            f"Vanguard__wing_armor_{label}_{side:+d}__lod0",
            outline, .045, armor_material, -.075
        )
        plate.parent = root
    shoulder_cap = plan_prism(
        f"Vanguard__engine_armor_cap_{side:+d}__lod0",
        [
            (side * 1.28, .02), (side * 2.20, .18),
            (side * 2.44, 3.72), (side * 1.62, 4.08),
        ], .075, white_clean, .745
    )
    shoulder_cap.parent = root
    wing_inlay = plan_prism(
        f"Vanguard__wing_cobalt_inlay_{side:+d}__lod0",
        [
            (side * 3.52, -.42), (side * 5.82, .16),
            (side * 5.34, .48), (side * 3.48, .12),
        ], .035, blue, -.038
    )
    wing_inlay.parent = root

for index, (y0, y1, half_width) in enumerate((
    (-5.55, -4.42, .42), (-4.26, -3.14, .58),
    (-2.96, -1.72, .72), (-1.48, -.12, .80),
    (.10, 1.55, .82), (1.76, 3.18, .72),
)):
    spine_plate = plan_prism(
        f"Vanguard__spine_armor_{index + 1:02d}__lod0",
        [
            (-half_width, y0), (-half_width * .92, y1),
            (half_width * .92, y1), (half_width, y0),
        ], .045, white_clean if index % 3 else blue, .775
    )
    spine_plate.parent = root

# Runtime distance LOD. It preserves the arrowhead, cockpit, twin-engine, and
# emissive-read silhouettes while intentionally omitting the close-range armor
# segmentation and generated texture.
lod1_root = bpy.data.objects.new("Vanguard_Interceptor_V4__lod1", None)
bpy.context.collection.objects.link(lod1_root)
lod1_wing = plan_prism("Vanguard__blended_delta__lod1", [
    (0, -5.15), (-1.00, -4.72), (-8.42, .10), (-8.48, 1.12),
    (-5.52, 3.48), (-2.58, 3.02), (-1.55, 4.62), (0, 5.12),
    (1.55, 4.62), (2.58, 3.02), (5.52, 3.48), (8.48, 1.12),
    (8.42, .10), (1.00, -4.72),
], .28, white_clean, -.20)
lod1_wing.parent = lod1_root
lod1_core = tapered_plan_prism("Vanguard__lifting_body__lod1", [
    (0, -7.18), (-.72, -6.20), (-1.18, -2.15), (-2.42, -.30),
    (-2.58, 3.78), (-.82, 4.62), (0, 4.78), (.82, 4.62),
    (2.58, 3.78), (2.42, -.30), (1.18, -2.15), (.72, -6.20),
], .72, white_clean, .18, .82, .98)
lod1_core.parent = lod1_root
lod1_canopy = faceted_loft("Vanguard__canopy__lod1", [
    (-5.25, .05, .02, .53), (-4.15, .46, .23, .80),
    (-3.05, .50, .26, .85), (-2.00, .06, .03, .64),
], 8, glass)
lod1_canopy.parent = lod1_root
for side in (-1, 1):
    lod1_engine = faceted_loft(
        f"Vanguard__engine_{side:+d}__lod1",
        [
            (-1.15, .50, .32, .10), (-.45, .70, .46, .17),
            (2.70, .68, .48, .16), (4.55, .56, .41, .12),
            (5.18, .42, .34, .10),
        ],
        8,
        metal,
        side * 1.78,
    )
    lod1_engine.parent = lod1_root
    lod1_nozzle = cylinder_y(
        f"Vanguard__nozzle_{side:+d}__lod1",
        .31, .08, (side * 1.78, 5.43, .10), emissive, 16
    )
    lod1_nozzle.parent = lod1_root
    lod1_fin = side_prism(f"Vanguard__fin_{side:+d}__lod1", [
        (2.18, .34), (3.18, 1.70), (4.16, 1.58), (3.80, .32)
    ], .13, blue, side * 2.34)
    lod1_fin.rotation_euler.y = side * math.radians(24)
    lod1_fin.parent = lod1_root

# Simplified, stable physics representation. It is authored independently from
# visual detail so armor seams, vents, and nacelle facets never affect flight
# collision behavior.
collision_root = bpy.data.objects.new("Vanguard_Interceptor_V4__collision", None)
bpy.context.collection.objects.link(collision_root)
collision_wing = plan_prism("Vanguard__collision_wing", [
    (0, -5.25), (-1.05, -4.65), (-8.35, .20), (-8.30, 1.10),
    (-5.40, 3.35), (-2.50, 3.02), (0, 5.10),
    (2.50, 3.02), (5.40, 3.35), (8.30, 1.10),
    (8.35, .20), (1.05, -4.65),
], .42, graphite, -.10)
collision_wing.parent = collision_root
collision_body = tapered_plan_prism("Vanguard__collision_body", [
    (0, -7.18), (-.92, -5.82), (-1.40, -1.25), (-2.45, .20),
    (-2.52, 4.20), (0, 5.20), (2.52, 4.20), (2.45, .20),
    (1.40, -1.25), (.92, -5.82),
], .92, graphite, .16, .80, .98)
collision_body.parent = collision_root

for asset_root in (root, lod1_root, collision_root):
    for obj in asset_root.children_recursive:
        if obj.type != "MESH":
            continue
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(62), island_margin=.025)
        bpy.ops.object.mode_set(mode="OBJECT")
        uv_layer = obj.data.uv_layers.active
        if uv_layer and asset_root == root:
            for uv_loop in uv_layer.data:
                uv_loop.uv.x *= 3.0
                uv_loop.uv.y *= 3.0
        obj.select_set(False)

def move_tree_to_collection(tree_root, target_collection):
    for obj in (tree_root, *tree_root.children_recursive):
        if obj.name not in target_collection.objects:
            target_collection.objects.link(obj)
        for existing_collection in list(obj.users_collection):
            if existing_collection != target_collection:
                existing_collection.objects.unlink(obj)


render_collection = bpy.data.collections.new("RENDER")
lod_collection = bpy.data.collections.new("LOD")
collision_collection = bpy.data.collections.new("COLLISION")
bpy.context.scene.collection.children.link(render_collection)
bpy.context.scene.collection.children.link(lod_collection)
bpy.context.scene.collection.children.link(collision_collection)
move_tree_to_collection(root, render_collection)
move_tree_to_collection(lod1_root, lod_collection)
move_tree_to_collection(collision_root, collision_collection)
for obj in (lod1_root, *lod1_root.children_recursive, collision_root, *collision_root.children_recursive):
    obj.hide_render = True

# Authoring review rig.
bpy.ops.object.camera_add(location=(12.8, -15.5, 9.2))
camera = bpy.context.object
camera.data.lens = 58
camera.data.clip_end = 1000
bpy.context.scene.camera = camera


def point(obj, target=(0, 0, 0)):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


point(camera, (0, -.2, .1))
for kind, location, energy, size in (
    ("AREA", (4, -8, 13), 1750, 8),
    ("AREA", (-9, 2, 7), 1200, 7),
    ("AREA", (3, 10, 4), 1000, 6),
):
    bpy.ops.object.light_add(type=kind, location=location)
    light = bpy.context.object
    light.data.energy = energy
    light.data.shape = "DISK"
    light.data.size = size
    point(light, (0, 0, 0))

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1280
scene.render.resolution_y = 810
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = PREVIEW_OUT
scene.world.color = (.006, .009, .016)
if hasattr(scene, "eevee"):
    scene.eevee.taa_render_samples = 32

bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)

def export_tree(tree_root, filepath):
    bpy.ops.object.select_all(action="DESELECT")
    tree_root.select_set(True)
    for child in tree_root.children_recursive:
        child.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
    )


# Export render, distance, and physics assets independently; review lights and
# camera stay exclusively in the .blend source.
export_tree(root, GLB_OUT)
export_tree(lod1_root, LOD1_OUT)
export_tree(collision_root, COLLISION_OUT)
for source_path, public_path in (
    (GLB_OUT, PUBLIC_GLB_OUT),
    (LOD1_OUT, PUBLIC_LOD1_OUT),
    (COLLISION_OUT, PUBLIC_COLLISION_OUT),
):
    with open(source_path, "rb") as source, open(public_path, "wb") as public:
        public.write(source.read())

if os.environ.get("BLENDER_RENDER_PREVIEW") == "1":
    bpy.ops.render.render(write_still=True)
print(f"BLEND={BLEND_OUT}")
print(f"GLB={GLB_OUT}")
print(f"LOD1={LOD1_OUT}")
print(f"COLLISION={COLLISION_OUT}")
print(f"PREVIEW={PREVIEW_OUT}")
