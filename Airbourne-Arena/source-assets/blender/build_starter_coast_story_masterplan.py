"""Author the full Starter Coast story geography in Blender.

The masterplan concept establishes the island silhouette and district hierarchy.
The campaign in index.html establishes the playable coordinates. This source
combines both: structural geography is real mesh; mission locations and flight
routes are named guides with story metadata. Dynamic aircraft and objectives
remain runtime actors.

Run with Blender:
    blender --background --python build_starter_coast_story_masterplan.py
"""

import math
import os

import bpy
from mathutils import Vector


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SOURCE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BLEND_OUT = os.path.join(
    SOURCE_ROOT, "blender", "starter-coast-story-masterplan-authored-v1.blend"
)
GLB_OUT = os.path.join(ROOT, "assets", "starter-coast-story-masterplan-authored-v1.glb")


def collection(name, parent=None):
    c = bpy.data.collections.new(name)
    (parent.children if parent else bpy.context.scene.collection.children).link(c)
    return c


def material(name, color, metallic=0.0, roughness=0.55, emission=None):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1.0)
    m.use_nodes = True
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*color, 1.0)
    p.inputs["Metallic"].default_value = metallic
    p.inputs["Roughness"].default_value = roughness
    if emission:
        (p.inputs.get("Emission Color") or p.inputs.get("Emission")).default_value = (
            *emission,
            1.0,
        )
        p.inputs["Emission Strength"].default_value = 2.0
    m["runtime_surface_role"] = name
    return m


def move_to(obj, target):
    for owner in tuple(obj.users_collection):
        owner.objects.unlink(obj)
    target.objects.link(obj)
    return obj


def tag(obj, kind, chapter=None, missions=()):
    obj["story_kind"] = kind
    if chapter is not None:
        obj["story_chapter"] = chapter
    if missions:
        obj["story_missions"] = ",".join(missions)
    return obj


def cube(name, location, dimensions, mat, owner, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=location)
    o = move_to(bpy.context.object, owner)
    o.name = name
    o.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(mat)
    if bevel:
        mod = o.modifiers.new("Manufactured edge", "BEVEL")
        mod.width = bevel
        mod.segments = 2
    return o


def cylinder(name, location, radius, depth, mat, owner, vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=location
    )
    o = move_to(bpy.context.object, owner)
    o.name = name
    o.data.materials.append(mat)
    return o


def route(name, points, width, mat, owner, chapter=None, missions=()):
    curve = bpy.data.curves.new(name + "__curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = width / 2
    curve.bevel_resolution = 1
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, co in zip(spline.points, points):
        point.co = (*co, 1.0)
    obj = bpy.data.objects.new(name, curve)
    owner.objects.link(obj)
    obj.data.materials.append(mat)
    return tag(obj, "flight_or_ground_route", chapter, missions)


def story_anchor(name, location, chapter, missions, owner, radius=90.0):
    bpy.ops.object.empty_add(type="SPHERE", radius=radius, location=location)
    o = move_to(bpy.context.object, owner)
    o.name = name
    o.empty_display_size = radius
    return tag(o, "mission_anchor", chapter, missions)


def island(name, center, radius_xy, height, owner, missions=()):
    x, y = center
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=48,
        radius=1,
        depth=height,
        location=(x, y, height / 2 - 8),
    )
    o = move_to(bpy.context.object, owner)
    o.name = name + "__terrain__lod0"
    o.scale = (radius_xy[0], radius_xy[1], 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(terrain_mat)
    bevel = o.modifiers.new("Eroded cliff rim", "BEVEL")
    bevel.width = 24
    bevel.segments = 3
    tag(o, "structural_island", missions=missions)
    cylinder(
        name + "__collision",
        (x, y, max(4.0, height * 0.28)),
        min(radius_xy) * 0.88,
        max(8.0, height * 0.55),
        collision_mat,
        collision,
        20,
    )
    return o


def building(name, center, size, floors, owner, mat=None, accent=None):
    x, y = center
    w, d, h = size
    shell = cube(
        name + "__shell__lod0",
        (x, y, h / 2),
        (w, d, h),
        mat or concrete_mat,
        owner,
        1.2,
    )
    cube(
        name + "__roof__lod0",
        (x, y, h + 2.0),
        (w + 3, d + 3, 4),
        roof_mat,
        owner,
        0.5,
    )
    for floor in range(1, floors):
        z = floor * h / floors
        cube(
            name + f"__floor_band_{floor:02d}",
            (x, y - d / 2 - 0.35, z),
            (w * 0.82, 0.7, 1.8),
            glass_mat,
            owner,
        )
    cube(
        name + "__identity",
        (x, y - d / 2 - 0.8, h * 0.68),
        (w * 0.38, 1.0, 2.4),
        accent or teal_mat,
        owner,
        0.2,
    )
    shell["texel_density_px_per_meter"] = 128
    return shell


def mast(name, center, owner, chapter, missions):
    x, y = center
    base = cylinder(name + "__base", (x, y, 7), 20, 14, concrete_mat, owner, 16)
    cylinder(name + "__mast", (x, y, 82), 4, 150, steel_mat, owner, 12)
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=20, ring_count=10, location=(x, y, 164), scale=(26, 26, 13)
    )
    dish = move_to(bpy.context.object, owner)
    dish.name = name + "__dish"
    dish.data.materials.append(nav_mat)
    tag(base, "navigation_mast", chapter, missions)
    return base


def airbase(name, center, faction_mat, owner, missions=()):
    x, y = center
    cylinder(name + "__deck", (x, y, 7), 245, 14, deck_mat, owner, 48)
    cube(name + "__runway", (x, y, 15), (390, 62, 2), runway_mat, owner, 1)
    for side in (-1, 1):
        building(
            name + f"__hangar_{'north' if side > 0 else 'south'}",
            (x - 70, y + side * 145),
            (105, 70, 42),
            2,
            owner,
            hangar_mat,
            faction_mat,
        )
    building(
        name + "__operations", (x + 95, y - 76), (58, 52, 66), 4, owner, concrete_mat, faction_mat
    )
    mast(name + "__field_mast", (x + 155, y + 90), owner, 5, missions)
    tag(
        story_anchor(name + "__story_anchor", (x, y, 80), 1, missions, guides, 180),
        "airbase_story_anchor",
        1,
        missions,
    )


def central_city():
    cylinder("Arena_Core__foundation", (0, 0, 14), 360, 28, concrete_mat, render, 64)
    bpy.ops.mesh.primitive_torus_add(
        major_radius=265, minor_radius=22, major_segments=64, minor_segments=10, location=(0, 0, 42)
    )
    ring = move_to(bpy.context.object, render)
    ring.name = "Arena_Core__civic_ring"
    ring.data.materials.append(steel_mat)
    for spoke in range(8):
        a = spoke * math.tau / 8
        x, y = math.cos(a) * 185, math.sin(a) * 185
        road = cube(
            f"Arena_Core__radial_bridge_{spoke + 1:02d}",
            (x, y, 35),
            (260, 34, 10),
            road_mat,
            render,
            1,
        )
        road.rotation_euler.z = a
    for i, (x, y, h) in enumerate(
        [(-120, -120, 72), (120, -120, 56), (-120, 120, 58), (120, 120, 78)]
    ):
        building(
            f"Arena_Core__operations_{i + 1:02d}",
            (x, y),
            (72, 58, h),
            4,
            render,
            concrete_mat,
            orange_mat if i in (1, 2) else teal_mat,
        )
    story_anchor(
        "Arena_Core__campaign_anchor",
        (0, 0, 620),
        1,
        ("ch1_m9", "ch1_m10", "ch6_m1"),
        guides,
        300,
    )


def harbor():
    building("South_Harbor__control", (0, -2200), (86, 64, 74), 5, render, steel_mat, orange_mat)
    for i, x in enumerate((-220, -75, 75, 220)):
        cube(
            f"South_Harbor__dock_{i + 1:02d}",
            (x, -2460, 8),
            (90, 430, 16),
            concrete_mat,
            render,
            1.5,
        )
    for x in (-320, 320):
        building(
            f"South_Harbor__warehouse_{'west' if x < 0 else 'east'}",
            (x, -2120),
            (170, 92, 42),
            2,
            render,
            hangar_mat,
            orange_mat,
        )


def carrier_story_geometry():
    carrier = collection("STORY_CARRIER", story)
    cube("Warden_Carrier__spine", (2850, 0, 900), (720, 150, 90), blackwing_mat, carrier, 8)
    for side in (-1, 1):
        cube(
            f"Warden_Carrier__flight_deck_{side:+d}",
            (2800, side * 180, 900),
            (510, 180, 28),
            blackwing_mat,
            carrier,
            5,
        )
        cylinder(
            f"Warden_Carrier__engine_{side:+d}",
            (2600, side * 260, 890),
            62,
            170,
            steel_mat,
            carrier,
            24,
        ).rotation_euler.y = math.pi / 2
    relay_base = cylinder(
        "Warden_Carrier__command_relay_base",
        (3150, 0, 930),
        24,
        60,
        blackwing_mat,
        carrier,
        16,
    )
    cylinder(
        "Warden_Carrier__command_relay_mast",
        (3150, 0, 1030),
        6,
        160,
        steel_mat,
        carrier,
        12,
    )
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=20, ring_count=10, location=(3150, 0, 1122), scale=(32, 32, 16)
    )
    relay_dish = move_to(bpy.context.object, carrier)
    relay_dish.name = "Warden_Carrier__command_relay_dish"
    relay_dish.data.materials.append(nav_mat)
    tag(relay_base, "carrier_command_relay", 6, ("ch6_m4", "ch6_m5"))
    tag(carrier.objects["Warden_Carrier__spine"], "flying_story_carrier", 6, ("ch6_m4", "ch6_m5"))


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for child in tuple(bpy.context.scene.collection.children):
    bpy.context.scene.collection.children.unlink(child)

story = collection("STARTER_COAST_STORY_MASTERPLAN")
render = collection("RENDER", story)
collision = collection("COLLISION", story)
guides = collection("STORY_GUIDES", story)
routes = collection("ROUTES", story)

terrain_mat = material("Terrain diffusion surface", (0.28, 0.34, 0.23), 0.0, 0.88)
road_mat = material("Road diffusion surface", (0.12, 0.14, 0.14), 0.05, 0.72)
deck_mat = material("Airbase deck diffusion surface", (0.25, 0.27, 0.28), 0.18, 0.58)
runway_mat = material("Airstrip unique surface", (0.08, 0.10, 0.11), 0.05, 0.68)
concrete_mat = material("Bunker concrete diffusion surface", (0.46, 0.47, 0.43), 0.04, 0.76)
steel_mat = material("Aviation hardware diffusion surface", (0.25, 0.29, 0.31), 0.68, 0.38)
roof_mat = material("City roof diffusion surface", (0.20, 0.23, 0.24), 0.32, 0.62)
hangar_mat = material("Hangar metal diffusion surface", (0.32, 0.35, 0.35), 0.58, 0.46)
glass_mat = material("Recessed glazing", (0.02, 0.08, 0.11), 0.12, 0.16, (0.0, 0.02, 0.03))
teal_mat = material("Breakwater teal identity", (0.02, 0.38, 0.40), 0.32, 0.42)
orange_mat = material("Safety orange identity", (0.66, 0.24, 0.03), 0.28, 0.42)
vanguard_mat = material("Vanguard identity", (0.06, 0.36, 0.60), 0.35, 0.38)
inferno_mat = material("Inferno identity", (0.62, 0.10, 0.055), 0.35, 0.38)
nav_mat = material("Skyway navigation diffusion surface", (0.42, 0.45, 0.43), 0.5, 0.42)
blackwing_mat = material("Black Wing surface", (0.035, 0.04, 0.06), 0.65, 0.28)
collision_mat = material("Collision debug", (0.8, 0.1, 0.8), 0.0, 1.0)

# One selectable index anchor per campaign mission. Coordinates come from the
# mission's start, primary site, route midpoint, or shared persistent district.
# Detailed sites/routes below carry the same mission IDs on physical objects.
MISSION_ANCHORS = [
    (1, "ch1_m1", "FIRST_FLIGHT", (-1400, 0, 700)),
    (1, "ch1_m2", "DISTRESS_CALL", (400, 300, 760)),
    (1, "ch1_m3", "RECOGNITION", (-2800, 0, 120)),
    (1, "ch1_m4", "VANGUARD_TRIAL", (0, 0, 660)),
    (1, "ch1_m5", "TEMPEST_TRIAL", (0, 900, 520)),
    (1, "ch1_m6", "INFERNO_TRIAL", (1400, 0, 780)),
    (1, "ch1_m7", "CHOOSE_YOUR_WINGS", (-2800, 0, 120)),
    (1, "ch1_m8", "BUILT_NOT_GIVEN", (-2800, 0, 120)),
    (1, "ch1_m9", "FIRST_ARENA_CORE_MATCH", (0, 0, 620)),
    (1, "ch1_m10", "BLACKOUT", (0, 0, 980)),
    (2, "ch2_m1", "TOWER_RAID", (400, -100, 720)),
    (2, "ch2_m2", "CONTRACT_RUN", (1300, -1100, 700)),
    (2, "ch2_m3", "FALSE_COLOURS", (200, 300, 120)),
    (2, "ch2_m4", "SHADE", (0, 300, 760)),
    (2, "ch2_m5", "THE_FRAGMENT", (1550, 760, 180)),
    (3, "ch3_m1", "HOLD_WITH_ARAS", (-300, 0, 700)),
    (3, "ch3_m2", "RUN_WITH_MERCER", (-100, 700, 520)),
    (3, "ch3_m3", "BURN_WITH_SERRANO", (2000, 700, 180)),
    (3, "ch3_m4", "ACE_HUNT", (-400, 900, 760)),
    (4, "ch4_m1", "FALSE_FLAG", (-1900, 0, 180)),
    (4, "ch4_m2", "THE_SHIPMENT", (2225, -525, 180)),
    (4, "ch4_m3", "WITNESS", (600, 500, 720)),
    (4, "ch4_m4", "THE_LEDGER", (0, 0, 840)),
    (5, "ch5_m1", "RECLAIM", (-2200, 0, 180)),
    (5, "ch5_m2", "DOWNED_WINGS", (0, 0, 680)),
    (5, "ch5_m3", "WARDEN_NODES", (0, 0, 840)),
    (5, "ch5_m4", "TASK_FORCE", (1600, 0, 940)),
    (6, "ch6_m1", "THE_CITY", (0, 0, 920)),
    (6, "ch6_m2", "LIGHTS_ON", (0, 0, 860)),
    (6, "ch6_m3", "THE_CORRIDOR", (900, -1900, 760)),
    (6, "ch6_m4", "THE_CARRIER", (2850, 0, 1000)),
    (6, "ch6_m5", "THE_WARDEN_CORE", (3300, 0, 1040)),
]
mission_index = collection("MISSION_INDEX", guides)
for chapter, mission_id, title, location in MISSION_ANCHORS:
    anchor = story_anchor(
        f"{mission_id}__{title}",
        location,
        chapter,
        (mission_id,),
        mission_index,
        72,
    )
    anchor["mission_title"] = title.replace("_", " ")

# Masterplan island silhouette: central ring, paired airbases, northern sensor
# plateau, southern harbor and four linking district islands.
island("Central_Civic_Island", (0, 0), (980, 920), 86, render, ("ch1_m9", "ch6_m1"))
island("Vanguard_Airfield_Island", (-2800, 0), (760, 820), 72, render, ("ch4_m1", "ch5_m1"))
island("Inferno_Airfield_Island", (2800, 0), (760, 820), 72, render, ("ch1_m6",))
island("North_Sensor_Island", (0, 2100), (820, 620), 190, render, ("ch2_m1", "ch6_m2"))
island("South_Harbor_Island", (0, -2200), (980, 760), 64, render, ("ch2_m2", "ch4_m2"))
island("Northwest_Residential_Island", (-1500, 1250), (780, 650), 98, render, ("ch3_m1",))
island("Northeast_Industrial_Island", (1550, 1250), (780, 650), 110, render, ("ch2_m5",))
island("Southwest_City_Island", (-1450, -1300), (850, 720), 82, render, ("ch2_m2", "ch3_m2"))
island("Southeast_Relay_Island", (1650, -1250), (790, 680), 92, render, ("ch4_m2",))

central_city()
airbase(
    "Breakwater_Field",
    (-2800, 0),
    vanguard_mat,
    render,
    ("ch1_m1", "ch1_m7", "ch1_m8", "ch5_m1"),
)
airbase("Inferno_Field", (2800, 0), inferno_mat, render, ("ch1_m6", "ch4_m1"))
harbor()

for index, center in enumerate(((-900, -1500), (600, 1600), (1500, -400)), 1):
    mast(
        f"Skyway_Mast_{index:02d}",
        center,
        render,
        2,
        ("ch2_m1", "ch6_m2"),
    )

for index, center in enumerate(((-1800, -1600), (1900, -1400), (1700, 1500), (-1600, 1700)), 1):
    building(
        f"Warden_Node_{index:02d}", center, (76, 64, 88), 3, render, blackwing_mat, orange_mat
    )
    story_anchor(
        f"Warden_Node_{index:02d}__anchor",
        (*center, 120),
        5,
        ("ch5_m3",),
        guides,
        150,
    )

for index, center in enumerate(((-2100, -1200), (0, -2000), (2100, -900), (1200, 1800), (-1400, 1600)), 1):
    mast(
        f"Independent_Mast_{index:02d}",
        center,
        render,
        6,
        ("ch6_m2",),
    )

story_anchor("Ridgemouth_Settlement", (1300, -1100, 80), 2, ("ch2_m2",), guides, 220)
building("Ridgemouth__clinic", (1300, -1100), (82, 58, 42), 3, render, concrete_mat, teal_mat)
story_anchor("Black_Wing_Cache", (1550, 760, 100), 2, ("ch2_m5",), guides, 220)
building("Black_Wing_Cache__vault", (1550, 760), (120, 84, 70), 3, render, blackwing_mat, orange_mat)
story_anchor("Covert_Relay", (2225, -525, 110), 4, ("ch4_m2",), guides, 180)
building("Covert_Relay__operations", (2225, -525), (92, 68, 82), 4, render, blackwing_mat, orange_mat)

route(
    "Masterplan__east_west_spine",
    [(-2800, 0, 48), (-980, 0, 48), (0, 0, 48), (980, 0, 48), (2800, 0, 48)],
    34,
    road_mat,
    routes,
)
route(
    "Masterplan__north_south_spine",
    [(0, -2200, 48), (0, -920, 48), (0, 0, 48), (0, 920, 48), (0, 2100, 150)],
    34,
    road_mat,
    routes,
)
route(
    "Ridgemouth_supply_corridor",
    [(-1400, -700, 640), (-500, -1200, 700), (500, -1500, 760), (1300, -1100, 700)],
    12,
    teal_mat,
    routes,
    2,
    ("ch2_m2",),
)
route(
    "Tempest_canyon_line",
    [(-1500, 1100, 540), (-800, 900, 480), (-100, 700, 440), (600, 300, 470),
     (900, -300, 520), (300, -900, 560), (-600, -1100, 600), (-1500, -500, 660)],
    10,
    teal_mat,
    routes,
    3,
    ("ch1_m5", "ch3_m2"),
)
route(
    "Civilian_evacuation_corridor",
    [(2200, 900, 700), (600, 500, 720), (-900, 200, 680), (-2800, 0, 620)],
    12,
    vanguard_mat,
    routes,
    4,
    ("ch3_m1", "ch4_m3"),
)
route(
    "Final_storm_corridor",
    [(-1800, -1600, 700), (-1000, -1900, 620), (0, -2100, 560),
     (900, -1900, 600), (1600, -1500, 680), (2100, -900, 760), (2850, 0, 900)],
    16,
    orange_mat,
    routes,
    6,
    ("ch6_m3", "ch6_m4", "ch6_m5"),
)

for index, center in enumerate(((2300, -1200), (2500, -500), (2300, 300)), 1):
    story_anchor(
        f"Carrier_Defence_Platform_{index:02d}",
        (*center, 900),
        6,
        ("ch6_m3",),
        guides,
        120,
    )
carrier_story_geometry()

story["source_reference"] = "starter-coast-masterplan-v1.png"
story["story_chapters"] = 6
story["coordinate_source"] = "Airbourne-Arena/index.html mission table"
story["runtime_dynamic_actors_excluded"] = True

bpy.context.scene.unit_settings.system = "METRIC"
bpy.context.scene.unit_settings.scale_length = 1.0
bpy.context.scene["asset_contract"] = "starter-coast-asset-contract.json"
bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)

bpy.ops.object.select_all(action="DESELECT")
for obj in story.all_objects:
    if collision not in obj.users_collection and obj.type in {"MESH", "CURVE", "EMPTY"}:
        obj.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT,
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_yup=True,
    export_extras=True,
)
print("Starter Coast full story masterplan source and GLB exported")
