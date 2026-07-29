"""Build the production Starter Coast world and reusable campaign asset kit.

The flight game uses X/Y-up/Z coordinates while Blender uses X/Y/Z-up. Blender's
glTF exporter performs that axis conversion. Every horizontal story coordinate
therefore remains (x, y) here and becomes (x, z) in Three.js.

Outputs:
  source-assets/blender/starter-coast-world-authored-v2.blend
  assets/starter-coast-world-authored-v2.glb
  assets/starter-coast-world-authored-v2-lod1.glb
  assets/starter-coast-story-kit-authored-v2.glb

Run:
  blender --background --python build_starter_coast_world_v2.py
"""

from __future__ import annotations

import math
import os
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector


HERE = Path(__file__).resolve().parent
PROJECT = HERE.parent.parent
ASSETS = PROJECT / "assets"
BLEND_OUT = HERE / "starter-coast-world-authored-v2.blend"
WORLD_OUT = ASSETS / "starter-coast-world-authored-v2.glb"
WORLD_LOD1_OUT = ASSETS / "starter-coast-world-authored-v2-lod1.glb"
STORY_OUT = ASSETS / "starter-coast-story-kit-authored-v2.glb"

WORLD_SIZE = 8000.0
WORLD_HALF = WORLD_SIZE / 2
SEA_LEVEL = 0.0
SEABED_LEVEL = -32.0
TERRAIN_TILE_METERS = 180.0

# Each occupied footprint gets an engineered level pad before the render mesh
# is sampled. Values are center X/Y, half-width, half-depth and the feather
# distance into the natural terrain. Keeping this list numeric lets the exact
# same contract live in the Three.js collision function.
CONSTRUCTION_PADS = (
    (0, 2100, 285, 220, 110),          # North sensor compound
    (-430, -410, 65, 52, 70),          # Civic Operations
    (430, -410, 62, 50, 70),           # League Offices
    (-430, 410, 62, 50, 70),           # Transit Authority
    (430, 410, 64, 52, 70),            # Emergency Control
    (-1560, 1300, 72, 55, 85),         # Residential West
    (-1360, 1380, 65, 51, 80),         # Residential East
    (1630, 1205, 190, 150, 120),        # Industrial / Black Wing terrace
    (-1520, -1303, 175, 125, 110),      # Ridgemouth civic terrace
    (2225, -525, 67, 54, 85),          # Covert Relay
    (0, -2150, 68, 53, 70),            # Harbor control
    (-280, -2070, 112, 67, 90),        # Harbor warehouse west
    (280, -2070, 112, 67, 90),         # Harbor warehouse east
)


def clamp(value, low, high):
    return low if value < low else high if value > high else value


def smooth(low, high, value):
    t = clamp((value - low) / (high - low), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def hash2(x, y):
    n = math.sin(x * 127.1 + y * 311.7) * 43758.5453123
    return n - math.floor(n)


def vnoise(x, y):
    xi, yi = math.floor(x), math.floor(y)
    xf, yf = x - xi, y - yi
    u, v = xf * xf * (3 - 2 * xf), yf * yf * (3 - 2 * yf)
    a = hash2(xi, yi)
    b = hash2(xi + 1, yi)
    c = hash2(xi, yi + 1)
    d = hash2(xi + 1, yi + 1)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v


def fbm(x, y, octaves=5):
    result, amplitude, frequency = 0.0, 0.5, 1.0
    for _ in range(octaves):
        result += amplitude * vnoise(x * frequency, y * frequency)
        frequency *= 2.03
        amplitude *= 0.5
    return result


# The archipelago follows the concept/masterplan while covering every grounded
# campaign coordinate. Irregular edge noise keeps it from reading as circles.
LAND_LOBES = (
    (0, 0, 1250, 1120, 1.00),        # Arena Core
    (-2760, 0, 900, 900, 0.82),      # Vanguard / Breakwater
    (2760, 0, 900, 900, 0.82),       # Inferno
    (0, 2100, 930, 760, 1.16),       # Sensor plateau
    (0, -2200, 1080, 830, 0.72),     # Harbor
    (-1500, 1300, 980, 820, 0.86),   # Residential
    (1550, 1300, 980, 820, 0.92),    # Industrial / cache
    (-1550, -1300, 1030, 860, 0.78), # City / Ridgemouth
    (1650, -1250, 1030, 850, 0.84),  # Relay
)

SITE_PLATEAUS = (
    (-2100, -1200, 260), (2100, -900, 260), (1200, 1800, 260),
    (-1400, 1600, 260), (-1800, -1600, 250), (1900, -1400, 250),
    (1700, 1500, 250), (-1600, 1700, 250), (1500, -400, 230),
    (-900, -1500, 230), (600, 1600, 230), (2225, -525, 240),
)


def island_mask(x, y):
    best = 0.0
    edge_noise = (fbm(x * 0.0016 + 18.1, y * 0.0016 + 3.7, 4) - 0.48) * 0.16
    for cx, cy, rx, ry, _ in LAND_LOBES:
        radial = math.hypot((x - cx) / rx, (y - cy) / ry)
        best = max(best, 1.0 - smooth(0.78 + edge_noise, 1.04 + edge_noise, radial))
    for cx, cy, radius in SITE_PLATEAUS:
        best = max(best, 1.0 - smooth(radius * 0.68, radius, math.hypot(x - cx, y - cy)))
    return clamp(best, 0.0, 1.0)


def terrain_base_height(x, y):
    mask = island_mask(x, y)
    if mask <= 0.001:
        return SEABED_LEVEL
    # Broad hills plus sharper ridgelines. Values are deliberately lower than
    # the previous repeating heightfield so roads and installations can sit on
    # believable engineered grades.
    base = math.pow(fbm(x * 0.00072, y * 0.00072, 5), 1.72)
    ridge = 1.0 - abs(vnoise(x * 0.0018 + 31.3, y * 0.0018 + 17.7) * 2.0 - 1.0)
    height = 18.0 + base * 210.0 + ridge * ridge * 105.0
    # Zone identity: northern plateau, low harbor and playable civic floor.
    for cx, cy, rx, ry, gain in LAND_LOBES:
        radial = math.hypot((x - cx) / rx, (y - cy) / ry)
        height += max(0.0, 1.0 - radial) * 34.0 * gain
    urban = 1.0 - smooth(650, 1050, math.hypot(x, y))
    height += (24.0 - height) * urban
    for bx in (-2760, 2760):
        field = 1.0 - smooth(250, 520, math.hypot(x - bx, y))
        height += (34.0 - height) * field
    harbor = 1.0 - smooth(360, 720, math.hypot(x, y + 2200))
    height += (16.0 - height) * harbor
    # Flat pads under grounded story sites.
    for cx, cy, radius in SITE_PLATEAUS:
        pad = 1.0 - smooth(radius * 0.55, radius, math.hypot(x - cx, y - cy))
        if pad > 0:
            target = 34.0 + hash2(cx * 0.01, cy * 0.01) * 24.0
            height += (target - height) * pad
    # A real submerged shelf keeps the water surface separated from the seabed.
    # The old -7 m floor sat almost coplanar with the review ocean and made the
    # sea look tiled, noisy and spatially disconnected from the islands.
    return SEABED_LEVEL + (height - SEABED_LEVEL) * smooth(0.02, 0.82, mask)


# Resolve pad elevations once from the unmodified landscape. Re-evaluating the
# center inside terrain_height would multiply the FBM work for every vertex.
CONSTRUCTION_PAD_TARGETS = tuple(
    (*pad, terrain_base_height(pad[0], pad[1])) for pad in CONSTRUCTION_PADS
)


def terrain_height(x, y):
    height = terrain_base_height(x, y)
    for cx, cy, half_x, half_y, feather, target in CONSTRUCTION_PAD_TARGETS:
        dx = max(abs(x - cx) - half_x, 0.0)
        dy = max(abs(y - cy) - half_y, 0.0)
        distance = math.hypot(dx, dy)
        weight = 1.0 - smooth(0.0, feather, distance)
        if weight > 0:
            height += (target - height) * weight
    return height


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in tuple(bpy.data.collections):
        bpy.data.collections.remove(collection)


def make_collection(name, parent=None):
    result = bpy.data.collections.new(name)
    (parent.children if parent else bpy.context.scene.collection.children).link(result)
    return result


def move_to(obj, owner):
    for current in tuple(obj.users_collection):
        current.objects.unlink(obj)
    owner.objects.link(obj)
    return obj


def make_material(name, color, metallic=0.0, roughness=0.6, emission=None):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1.0)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    if emission:
        (shader.inputs.get("Emission Color") or shader.inputs.get("Emission")).default_value = (
            *emission, 1.0
        )
        shader.inputs["Emission Strength"].default_value = 2.4
    material["runtime_surface_role"] = name
    return material


def material_tile_size(material):
    """Return a physical texture repeat size in meters."""
    name = material.name.lower()
    if "terrain" in name:
        return TERRAIN_TILE_METERS
    if "road" in name or "runway" in name:
        return 12.0
    if "airbase deck" in name:
        return 16.0
    if "foliage" in name or "tree bark" in name:
        return 5.0
    if "glazing" in name or "identity" in name or "orange" in name:
        return 6.0
    if "hardware" in name or "graphite" in name:
        return 4.0
    return 8.0


def box_project_uv(obj, tile_meters):
    """Project each box face at a stable meter scale before objects are joined."""
    mesh = obj.data
    uv_layer = mesh.uv_layers.get("UVMap") or mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        normal = polygon.normal
        axis = max(range(3), key=lambda index: abs(normal[index]))
        for loop_index in polygon.loop_indices:
            co = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            if axis == 0:
                uv = (co.y / tile_meters, co.z / tile_meters)
            elif axis == 1:
                uv = (co.x / tile_meters, co.z / tile_meters)
            else:
                uv = (co.x / tile_meters, co.y / tile_meters)
            uv_layer.data[loop_index].uv = uv


def cylindrical_project_uv(obj, tile_meters):
    """Give tank/tower sides and caps the same physical texel density."""
    mesh = obj.data
    uv_layer = mesh.uv_layers.get("UVMap") or mesh.uv_layers.new(name="UVMap")
    radius = max(obj.dimensions.x, obj.dimensions.y) * 0.5
    circumference = max(math.tau * radius, tile_meters)
    for polygon in mesh.polygons:
        if abs(polygon.normal.z) > 0.72:
            for loop_index in polygon.loop_indices:
                co = mesh.vertices[mesh.loops[loop_index].vertex_index].co
                uv_layer.data[loop_index].uv = (
                    co.x / tile_meters, co.y / tile_meters
                )
            continue
        values = []
        for loop_index in polygon.loop_indices:
            co = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            values.append((math.atan2(co.y, co.x) / math.tau) % 1.0)
        if values and max(values) - min(values) > 0.5:
            values = [value + 1.0 if value < 0.5 else value for value in values]
        for loop_index, angle in zip(polygon.loop_indices, values):
            co = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            uv_layer.data[loop_index].uv = (
                angle * circumference / tile_meters, co.z / tile_meters
            )


def cube(name, location, dimensions, material, owner, bevel=0.0, parent=None):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = move_to(bpy.context.object, owner)
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    box_project_uv(obj, material_tile_size(material))
    obj["uv_policy"] = f"box projected {material_tile_size(material):g} meter tiles"
    if bevel:
        modifier = obj.modifiers.new("Edge bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    if parent:
        obj.parent = parent
    return obj


def cylinder(name, location, radius, depth, material, owner, vertices=16, parent=None):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=location
    )
    obj = move_to(bpy.context.object, owner)
    obj.name = name
    obj.data.materials.append(material)
    cylindrical_project_uv(obj, material_tile_size(material))
    obj["uv_policy"] = f"cylindrical {material_tile_size(material):g} meter tiles"
    if parent:
        obj.parent = parent
    return obj


def cone(name, location, radius1, radius2, depth, material, owner, vertices=16, parent=None):
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices, radius1=radius1, radius2=radius2,
        depth=depth, location=location
    )
    obj = move_to(bpy.context.object, owner)
    obj.name = name
    obj.data.materials.append(material)
    cylindrical_project_uv(obj, material_tile_size(material))
    obj["uv_policy"] = f"conical {material_tile_size(material):g} meter tiles"
    if parent:
        obj.parent = parent
    return obj


def empty(name, owner, location=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    owner.objects.link(obj)
    obj.location = location
    return obj


def terrain_mesh(name, resolution, owner, material):
    vertices, faces, uvs, colors = [], [], [], []
    step = WORLD_SIZE / (resolution - 1)
    for row in range(resolution):
        y = -WORLD_HALF + row * step
        for col in range(resolution):
            x = -WORLD_HALF + col * step
            z = terrain_height(x, y)
            vertices.append((x, y, z))
            uvs.append((x / TERRAIN_TILE_METERS, y / TERRAIN_TILE_METERS))
            mask = island_mask(x, y)
            urban = 1.0 - smooth(650, 1900, math.hypot(x, y))
            if mask < 0.08:
                color = (0.22, 0.25, 0.23, 1.0)
            elif z < 12:
                color = (0.78, 0.69, 0.49, 1.0)
            elif z < 85:
                color = (0.40, 0.52, 0.27, 1.0)
            elif z < 185:
                color = (0.31, 0.39, 0.23, 1.0)
            else:
                color = (0.52, 0.49, 0.42, 1.0)
            if urban > 0:
                color = tuple(color[i] * (1 - urban * 0.32) + (0.42, 0.43, 0.41, 1)[i] * urban * 0.32 for i in range(4))
            colors.append(color)
    for row in range(resolution - 1):
        for col in range(resolution - 1):
            a = row * resolution + col
            faces.append((a, a + 1, a + resolution + 1, a + resolution))
    mesh = bpy.data.meshes.new(name + "__mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    color_layer = mesh.color_attributes.new(name="COLOR_0", type="BYTE_COLOR", domain="CORNER")
    for poly in mesh.polygons:
        for loop_index in poly.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            uv_layer.data[loop_index].uv = uvs[vertex_index]
            color_layer.data[loop_index].color = colors[vertex_index]
        poly.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    owner.objects.link(obj)
    obj.data.materials.append(material)
    obj["collision_policy"] = "runtime deterministic height function"
    obj["uv_policy"] = f"world tiled {TERRAIN_TILE_METERS:g} meters"
    return obj


def sample_polyline(points, step=55.0, closed=False):
    source = list(points)
    if closed and source[0] != source[-1]:
        source.append(source[0])
    result = [source[0]]
    for a, b in zip(source, source[1:]):
        length = math.hypot(b[0] - a[0], b[1] - a[1])
        count = max(1, math.ceil(length / step))
        for index in range(1, count + 1):
            t = index / count
            result.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return result


def road_ribbon(
    name, points, width, owner, material, bridge_owner=None, closed=False,
    lift=1.45, bridge_level=14.0
):
    sampled = sample_polyline(points, 48.0, closed)
    vertices, faces, uvs = [], [], []
    water_flags = [island_mask(*point) < 0.14 for point in sampled]
    ground_decks = [terrain_height(*point) + lift for point in sampled]
    deck_heights = list(ground_decks)
    # Grade only the six samples immediately beside a water crossing. The old
    # whole-route forward/backward pass propagated a high island vertex for
    # kilometers and turned ordinary roads into huge floating black viaducts.
    # Land now remains terrain-conforming; bridge transitions are local.
    index = 0
    while index < len(sampled):
        if not water_flags[index]:
            index += 1
            continue
        start = index
        while index + 1 < len(sampled) and water_flags[index + 1]:
            index += 1
        end = index
        for bridge_index in range(start, end + 1):
            deck_heights[bridge_index] = bridge_level
        approach = 6
        left = max(0, start - approach)
        if left < start:
            anchor = ground_decks[left]
            for approach_index in range(left, start):
                t = (approach_index - left) / (start - left)
                desired = anchor + (bridge_level - anchor) * smooth(0.0, 1.0, t)
                deck_heights[approach_index] = max(
                    ground_decks[approach_index], desired
                )
        right = min(len(sampled) - 1, end + approach)
        if right > end:
            anchor = ground_decks[right]
            for approach_index in range(end + 1, right + 1):
                t = (approach_index - end) / (right - end)
                desired = bridge_level + (anchor - bridge_level) * smooth(
                    0.0, 1.0, t
                )
                deck_heights[approach_index] = max(
                    ground_decks[approach_index], desired
                )
        index += 1
    distance = 0.0
    water_run = 0
    for index, point in enumerate(sampled):
        previous = sampled[max(0, index - 1)]
        following = sampled[min(len(sampled) - 1, index + 1)]
        dx, dy = following[0] - previous[0], following[1] - previous[1]
        length = max(0.001, math.hypot(dx, dy))
        nx, ny = -dy / length, dx / length
        if index:
            distance += math.hypot(point[0] - sampled[index - 1][0], point[1] - sampled[index - 1][1])
        is_water = water_flags[index]
        deck_z = deck_heights[index]
        if is_water:
            water_run += 1
            if bridge_owner and water_run % 4 == 0:
                pier_top = deck_z - 0.8
                pier_bottom = SEABED_LEVEL - 1.5
                cylinder(
                    name + "__bridge_pier",
                    (point[0], point[1], (pier_top + pier_bottom) / 2),
                    2.4, pier_top - pier_bottom, concrete_mat, bridge_owner, 10
                )
        else:
            water_run = 0
        vertices.extend((
            (point[0] + nx * width / 2, point[1] + ny * width / 2, deck_z),
            (point[0] - nx * width / 2, point[1] - ny * width / 2, deck_z),
        ))
        uvs.extend((
            (-width / 24.0, distance / 12.0),
            (width / 24.0, distance / 12.0),
        ))
        if index < len(sampled) - 1:
            base = index * 2
            faces.append((base, base + 2, base + 3, base + 1))
    mesh = bpy.data.meshes.new(name + "__mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for poly in mesh.polygons:
        for loop_index in poly.loop_indices:
            uv_layer.data[loop_index].uv = uvs[mesh.loops[loop_index].vertex_index]
    obj = bpy.data.objects.new(name, mesh)
    owner.objects.link(obj)
    obj.data.materials.append(material)
    obj["uv_policy"] = "physical 12 meter road tiles"
    return obj


def detailed_building(name, x, y, width, depth, height, floors, owner, identity):
    z = terrain_height(x, y)
    lower_height = height * 0.66
    upper_height = height - lower_height
    upper_width = width * 0.72
    upper_depth = depth * 0.70
    shell = cube(
        name + "__lower_shell", (x, y, z + lower_height / 2),
        (width, depth, lower_height), concrete_mat, owner, 1.2
    )
    cube(
        name + "__upper_shell",
        (x, y, z + lower_height + upper_height / 2),
        (upper_width, upper_depth, upper_height),
        concrete_mat, owner, 1.0
    )
    cube(
        name + "__plinth", (x, y, z - 1.9),
        (width + 5, depth + 5, 6.2), dark_mat, owner, 0.4
    )
    cube(
        name + "__roof", (x, y, z + height + 1.8),
        (upper_width + 3, upper_depth + 3, 3.6), roof_mat, owner, 0.6
    )
    cube(
        name + "__setback_canopy",
        (x, y - depth / 2 - 1.2, z + lower_height + 1.0),
        (width * 0.76, 5.0, 2.0), dark_mat, owner, 0.35
    )
    for floor in range(1, floors):
        band_z = z + floor * height / floors
        upper = band_z > z + lower_height
        band_width = upper_width * 0.74 if upper else width * 0.76
        band_depth = upper_depth if upper else depth
        for side in (-1, 1):
            cube(
                name + "__glazing",
                (x, y + side * (band_depth / 2 + 0.35), band_z),
                (band_width, 0.7, 2.1), glass_mat, owner, 0.08
            )
    for side in (-1, 1):
        cube(
            name + "__lower_corner_pier",
            (x + side * (width / 2 + 0.45), y, z + lower_height / 2),
            (0.9, depth + 1.0, lower_height + 1.0), dark_mat, owner, 0.1
        )
        cube(
            name + "__upper_fin",
            (
                x + side * (upper_width / 2 + 0.45), y,
                z + lower_height + upper_height / 2
            ),
            (0.9, upper_depth + 1.0, upper_height + 1.0),
            identity, owner, 0.1
        )
    cube(
        name + "__identity", (x, y - depth / 2 - 0.55, z + height * 0.66),
        (width * 0.42, 1.0, 2.8), identity, owner, 0.15
    )
    for unit in (-0.24, 0.24):
        cube(
            name + "__roof_hvac",
            (x + unit * upper_width, y, z + height + 4.5),
            (8, 5, 5.5), hardware_mat, owner, 0.5
        )
    shell["texel_density_px_per_meter"] = 96
    return shell


def airfield(name, x, identity, owner, simplified=False):
    z = terrain_height(x, 0)
    cylinder(name + "__deck", (x, 0, z + 5), 330, 10, deck_mat, owner, 48 if not simplified else 24)
    cube(name + "__runway", (x, 0, z + 10.8), (510, 78, 2.2), runway_mat, owner, 2.0)
    if simplified:
        for side in (-1, 1):
            cube(name + "__hangar_lod1", (x - 80, side * 150, z + 25), (140, 80, 50), hangar_mat, owner, 2)
        return
    for side in (-1, 1):
        detailed_building(
            name + ("__north_hangar" if side > 0 else "__south_hangar"),
            x - 82, side * 155, 142, 84, 48, 2, owner, identity
        )
    detailed_building(name + "__operations", x + 125, -95, 72, 58, 76, 5, owner, identity)
    cylinder(name + "__fuel_tank", (x + 160, 105, z + 14), 15, 28, hardware_mat, owner, 20)
    cylinder(name + "__control_tower", (x + 205, 35, z + 44), 10, 72, concrete_mat, owner, 14)
    cylinder(name + "__control_cap", (x + 205, 35, z + 82), 17, 9, glass_mat, owner, 14)


def harbor(owner, simplified=False):
    if simplified:
        detailed_building("South_Harbor__control_lod1", 0, -2200, 96, 64, 62, 3, owner, orange_mat)
        return
    z = terrain_height(0, -2200)
    for index, x in enumerate((-270, -90, 90, 270), 1):
        cube(
            f"South_Harbor__dock_{index:02d}", (x, -2500, 6),
            (118, 480, 12), concrete_mat, owner, 1.6
        )
        for pier_y in (-2660, -2500, -2340):
            cylinder(
                f"South_Harbor__dock_pier_{index:02d}", (x, pier_y, -16),
                5.5, 32, hardware_mat, owner, 12
            )
        for crane in (-80, 70):
            cube(
                f"South_Harbor__crane_{index:02d}", (x, -2500 + crane, 32),
                (8, 8, 52), orange_mat, owner, 0.4
            )
    detailed_building("South_Harbor__control", 0, -2150, 100, 70, 82, 5, owner, orange_mat)
    detailed_building("South_Harbor__warehouse_west", -280, -2070, 190, 100, 46, 2, owner, orange_mat)
    detailed_building("South_Harbor__warehouse_east", 280, -2070, 190, 100, 46, 2, owner, orange_mat)
    cylinder("South_Harbor__tank_west", (-440, -2200, z + 24), 28, 48, hardware_mat, owner, 24)
    cylinder("South_Harbor__tank_east", (440, -2200, z + 24), 28, 48, hardware_mat, owner, 24)


def forest(owner, count=170):
    placed = 0
    index = 0
    while placed < count and index < count * 12:
        index += 1
        x = -3350 + hash2(index * 2.7, 8.1) * 6700
        y = -2850 + hash2(index * 4.1, 1.9) * 5700
        if island_mask(x, y) < 0.72:
            continue
        if math.hypot(x, y) < 1250 or min(abs(x - 2760), abs(x + 2760)) < 420:
            continue
        z = terrain_height(x, y)
        height = 18 + hash2(x * 0.013, y * 0.017) * 26
        cylinder(f"Tree_{placed:03d}__trunk", (x, y, z + height * 0.26), 1.5, height * 0.52, trunk_mat, owner, 7)
        cone(f"Tree_{placed:03d}__crown_low", (x, y, z + height * 0.50), height * 0.19, 1.2, height * 0.48, foliage_mat, owner, 9)
        cone(f"Tree_{placed:03d}__crown_high", (x, y, z + height * 0.76), height * 0.14, 0.6, height * 0.38, foliage_mat, owner, 9)
        placed += 1


def apply_modifiers_and_batch(owner, prefix):
    meshes = [obj for obj in owner.all_objects if obj.type == "MESH"]
    for obj in meshes:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        for modifier in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.select_set(False)
    groups = {}
    for obj in meshes:
        material_name = obj.data.materials[0].name if obj.data.materials else "Unmaterialed"
        groups.setdefault(material_name, []).append(obj)
    for material_name, objects in groups.items():
        if len(objects) == 1:
            objects[0].name = f"{prefix}__{material_name}__batch"
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        active = objects[0]
        bpy.context.view_layer.objects.active = active
        bpy.ops.object.join()
        active.name = f"{prefix}__{material_name}__batch"
    # Blender's selection join can retain degenerate cap faces where beveled
    # cylinders and boxes were combined. They are invisible but the 4.0 glTF
    # exporter marks the entire mesh invalid, so remove them deterministically.
    for obj in [item for item in owner.all_objects if item.type == "MESH"]:
        if "Terrain surface" in obj.name:
            # Reassert the world projection after Blender's collection/batch
            # operations. Blender 4 can preserve the UV layer name while
            # normalizing generated grid faces back to 0..1 per cell.
            uv_layer = obj.data.uv_layers.get("UVMap") or obj.data.uv_layers.new(
                name="UVMap"
            )
            for polygon in obj.data.polygons:
                for loop_index in polygon.loop_indices:
                    co = obj.data.vertices[
                        obj.data.loops[loop_index].vertex_index
                    ].co
                    uv_layer.data[loop_index].uv = (
                        co.x / TERRAIN_TILE_METERS,
                        co.y / TERRAIN_TILE_METERS,
                    )
            continue
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.dissolve_degenerate(bm, dist=0.00001, edges=list(bm.edges))
        if bm.faces:
            bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.validate(clean_customdata=False)
        obj.data.update()


def build_world(owner, resolution, detailed):
    terrain_mesh(
        "Starter_Coast__terrain__lod0" if detailed else "Starter_Coast__terrain__lod1",
        resolution, owner, terrain_mat
    )
    bridges = make_collection(("WORLD_BRIDGE_PIERS" if detailed else "WORLD_LOD1_PIERS"), owner)
    roads = (
        ("East_West_Spine", [(-2760, 0), (0, 0), (2760, 0)], 22),
        ("North_South_Spine", [(0, -2200), (0, 0), (0, 2100)], 22),
        ("Northwest_Link", [(-2760, 0), (-1500, 1300), (0, 2100)], 16),
        ("Northeast_Link", [(2760, 0), (1550, 1300), (0, 2100)], 16),
        ("Southwest_Link", [(-2760, 0), (-1550, -1300), (0, -2200)], 16),
        ("Southeast_Link", [(2760, 0), (1650, -1250), (0, -2200)], 16),
    )
    for road_name, points, width in roads:
        road_ribbon(
            road_name + "__shoulder", points, width + 5, owner,
            road_shoulder_mat, None, lift=1.15, bridge_level=13.7
        )
        road_ribbon(
            road_name, points, width, owner, road_mat, bridges,
            lift=1.5, bridge_level=14.0
        )
    ring = [(math.cos(index / 64 * math.tau) * 900, math.sin(index / 64 * math.tau) * 900) for index in range(64)]
    road_ribbon(
        "Arena_Core__civic_ring__shoulder", ring, 23, owner,
        road_shoulder_mat, None, True, 1.15, 13.7
    )
    road_ribbon(
        "Arena_Core__civic_ring", ring, 18, owner, road_mat,
        bridges, True, 1.5, 14.0
    )
    for bx in (-2760, 2760):
        loop = [(bx + math.cos(index / 40 * math.tau) * 410, math.sin(index / 40 * math.tau) * 340) for index in range(40)]
        perimeter = ("Vanguard" if bx < 0 else "Inferno") + "__perimeter"
        road_ribbon(
            perimeter + "__shoulder", loop, 19, owner,
            road_shoulder_mat, None, True, 1.15, 13.7
        )
        road_ribbon(
            perimeter, loop, 14, owner, road_mat,
            bridges, True, 1.5, 14.0
        )
    airfield("Breakwater_Field", -2760, teal_mat, owner, not detailed)
    airfield("Inferno_Field", 2760, red_mat, owner, not detailed)
    harbor(owner, not detailed)
    if not detailed:
        cylinder("Arena_Core__platform_lod1", (0, 0, 31), 330, 18, concrete_mat, owner, 32)
        for x, y in ((-460, -420), (460, -420), (-460, 420), (460, 420)):
            base = terrain_height(x, y)
            cube(
                "District__podium_lod1", (x, y, base + 28),
                (120, 90, 56), concrete_mat, owner, 2
            )
            cube(
                "District__tower_lod1", (x, y, base + 73),
                (82, 62, 44), roof_mat, owner, 1.6
            )
        apply_modifiers_and_batch(owner, "Starter_Coast_LOD1")
        return
    # Arena Core is a constructed circular precinct with water courts and
    # physical radial approaches.
    cylinder("Arena_Core__foundation", (0, 0, 28), 345, 20, concrete_mat, owner, 64)
    for index in range(8):
        angle = index * math.pi / 4
        bridge = cube(
            f"Arena_Core__radial_{index:02d}",
            (math.cos(angle) * 520, math.sin(angle) * 520, 35),
            (390, 18, 6), dark_mat, owner, 1.0
        )
        bridge.rotation_euler.z = angle
    city_specs = (
        ("Civic_Operations", -430, -410, 98, 72, 105, 6, teal_mat),
        ("League_Offices", 430, -410, 92, 68, 92, 5, orange_mat),
        ("Transit_Authority", -430, 410, 92, 68, 84, 5, teal_mat),
        ("Emergency_Control", 430, 410, 96, 72, 112, 6, orange_mat),
        ("Residential_West", -1560, 1300, 110, 76, 72, 4, teal_mat),
        ("Residential_East", -1360, 1380, 96, 68, 58, 4, teal_mat),
        ("Industrial_Plant", 1540, 1280, 150, 96, 62, 3, orange_mat),
        ("Black_Wing_Cache_Precinct", 1740, 1120, 112, 82, 78, 4, red_mat),
        ("Ridgemouth_Clinic", -1420, -1370, 90, 64, 50, 3, teal_mat),
        ("Ridgemouth_Civic", -1610, -1240, 112, 72, 64, 4, orange_mat),
        ("Covert_Relay_Operations", 2225, -525, 100, 74, 88, 5, red_mat),
    )
    for args in city_specs:
        detailed_building(*args[:-1], owner, args[-1])
    # Northern compound.
    plateau_z = terrain_height(0, 2100)
    detailed_building("North_Sensor__operations", 0, 2100, 116, 78, 72, 4, owner, teal_mat)
    for x in (-210, 210):
        cylinder("North_Sensor__radome", (x, 2130, plateau_z + 34), 34, 24, nav_mat, owner, 24)
        cylinder("North_Sensor__radome_base", (x, 2130, plateau_z + 11), 18, 22, hardware_mat, owner, 16)
    forest(owner)
    apply_modifiers_and_batch(owner, "Starter_Coast_LOD0")


def template_root(name, owner):
    return empty("TEMPLATE__" + name, owner)


def build_nav_mast(owner):
    root = template_root("Nav_Mast", owner)
    cylinder("Nav_Mast__foundation", (0, 0, 4), 18, 8, concrete_mat, owner, 16, root)
    cone("Nav_Mast__tower", (0, 0, 58), 8, 2.8, 108, hardware_mat, owner, 12, root)
    for z in (28, 54, 80):
        cylinder("Nav_Mast__service_ring", (0, 0, z), 6.5, 1.4, orange_mat, owner, 16, root)
    cylinder("Nav_Mast__dish_spine", (0, 0, 121), 2.6, 22, dark_mat, owner, 12, root)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, location=(0, 0, 137), scale=(24, 24, 8))
    dish = move_to(bpy.context.object, owner)
    dish.name = "Nav_Mast__radar_dish"
    dish.data.materials.append(nav_mat)
    dish.parent = root
    cube("Nav_Mast__control_room", (0, 0, 16), (24, 18, 14), concrete_mat, owner, 1.0, root)


def build_warden_node(owner):
    root = template_root("Warden_Node", owner)
    cylinder("Warden_Node__foundation", (0, 0, 5), 27, 10, dark_mat, owner, 12, root)
    cone("Warden_Node__armored_core", (0, 0, 44), 22, 14, 70, blackwing_mat, owner, 10, root)
    cylinder("Warden_Node__energy_core", (0, 0, 54), 7, 46, violet_mat, owner, 16, root)
    for index in range(6):
        angle = index * math.tau / 6
        fin = cube(
            f"Warden_Node__fin_{index}", (math.cos(angle) * 23, math.sin(angle) * 23, 48),
            (6, 24, 52), blackwing_mat, owner, 0.8, root
        )
        fin.rotation_euler.z = angle
    cylinder("Warden_Node__antenna", (0, 0, 98), 2.2, 38, hardware_mat, owner, 10, root)


def build_defence_platform(owner):
    root = template_root("Defence_Platform", owner)
    cylinder("Defence_Platform__central_hull", (0, 0, 0), 35, 22, blackwing_mat, owner, 12, root)
    for index in range(4):
        angle = index * math.pi / 2
        arm = cube(
            f"Defence_Platform__arm_{index}", (math.cos(angle) * 46, math.sin(angle) * 46, 0),
            (72, 18, 14), blackwing_mat, owner, 1.5, root
        )
        arm.rotation_euler.z = angle
        cylinder(
            f"Defence_Platform__turret_{index}",
            (math.cos(angle) * 72, math.sin(angle) * 72, 12),
            10, 20, hardware_mat, owner, 12, root
        )
        cone(
            f"Defence_Platform__thruster_{index}",
            (math.cos(angle) * 52, math.sin(angle) * 52, -18),
            8, 4, 24, violet_mat, owner, 12, root
        )
    cylinder("Defence_Platform__reactor", (0, 0, 18), 14, 26, violet_mat, owner, 16, root)


def build_carrier_modules(owner):
    for template, dimensions, accent in (
        ("Carrier_Engine", (84, 64, 70), orange_mat),
        ("Drone_Bay", (96, 72, 54), violet_mat),
        ("Command_Relay", (58, 58, 118), violet_mat),
        ("Warden_Core", (64, 64, 130), violet_mat),
    ):
        root = template_root(template, owner)
        width, depth, height = dimensions
        cube(template + "__armor", (0, 0, height / 2), dimensions, blackwing_mat, owner, 4.0, root)
        cube(template + "__recess", (0, -depth / 2 - 1, height * 0.55), (width * 0.54, 2, height * 0.38), dark_mat, owner, 0.4, root)
        cylinder(template + "__energy", (0, 0, height * 0.58), min(width, depth) * 0.18, height * 0.44, accent, owner, 16, root)
        for side in (-1, 1):
            cube(template + "__armor_fin", (side * width * 0.48, 0, height * 0.52), (8, depth * 0.82, height * 0.66), blackwing_mat, owner, 1.2, root)


def build_story_ground_sites(owner):
    wreck = template_root("Wreck_Field", owner)
    for index, (x, y, angle, scale) in enumerate((
        (-19, -8, -0.25, 1.0), (13, 4, 0.42, 0.82), (-2, 16, 1.0, 0.62)
    )):
        shard = cube(
            f"Wreck_Field__hull_shard_{index}", (x, y, 3.4 * scale),
            (30 * scale, 9 * scale, 6.8 * scale), blackwing_mat, owner, 1.1, wreck
        )
        shard.rotation_euler.z = angle
        cube(
            f"Wreck_Field__exposed_frame_{index}", (x + 3, y - 1, 7.2 * scale),
            (17 * scale, 2 * scale, 2.2 * scale), hardware_mat, owner, 0.25, wreck
        ).rotation_euler.z = angle
    cylinder("Wreck_Field__power_cell", (2, -3, 4), 3.6, 8, violet_mat, owner, 12, wreck)

    foundry = template_root("Foundry", owner)
    cube("Foundry__main_hall", (0, 0, 22), (70, 54, 44), concrete_mat, owner, 2.5, foundry)
    cube("Foundry__furnace_block", (-25, 0, 45), (26, 34, 42), dark_mat, owner, 2.0, foundry)
    for side in (-1, 1):
        cylinder(
            f"Foundry__stack_{side}", (side * 22, 8, 62), 6, 72,
            hardware_mat, owner, 14, foundry
        )
        cylinder(
            f"Foundry__molten_tank_{side}", (side * 25, -24, 17), 11, 34,
            orange_mat, owner, 14, foundry
        )
    cube("Foundry__loading_apron", (0, -38, 2), (82, 28, 4), road_mat, owner, 0.8, foundry)


def custom_wing_mesh(name, vertices, faces, material, owner, parent):
    mesh = bpy.data.meshes.new(name + "__mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    xs = [vertex[0] for vertex in vertices]
    ys = [vertex[1] for vertex in vertices]
    x_min, x_span = min(xs), max(max(xs) - min(xs), 0.001)
    y_min, y_span = min(ys), max(max(ys) - min(ys), 0.001)
    for poly in mesh.polygons:
        for loop_index in poly.loop_indices:
            co = vertices[mesh.loops[loop_index].vertex_index]
            uv_layer.data[loop_index].uv = ((co[0] - x_min) / x_span, (co[1] - y_min) / y_span)
    obj = bpy.data.objects.new(name, mesh)
    owner.objects.link(obj)
    obj.data.materials.append(material)
    obj.parent = parent
    return obj


def build_story_aircraft(owner):
    cargo = template_root("Cargo_Transport", owner)
    cylinder("Cargo__fuselage", (0, 0, 0), 5.2, 42, hardware_mat, owner, 16, cargo).rotation_euler.x = math.pi / 2
    cube("Cargo__wing", (0, 3, 0), (58, 12, 2.4), concrete_mat, owner, 0.8, cargo)
    cube("Cargo__tail", (0, 19, 5), (24, 8, 1.8), concrete_mat, owner, 0.6, cargo)
    for side in (-1, 1):
        cylinder("Cargo__engine", (side * 16, 2, -2), 4.4, 15, dark_mat, owner, 14, cargo).rotation_euler.x = math.pi / 2
        cylinder("Cargo__engine_glow", (side * 16, 10, -2), 3.1, 1.4, teal_mat, owner, 14, cargo).rotation_euler.x = math.pi / 2

    fighter = template_root("Blackwing_Fighter", owner)
    verts = [
        (0, -18, 1), (-4, -5, 3), (-24, 12, 0), (-7, 8, 1),
        (0, 18, 2), (7, 8, 1), (24, 12, 0), (4, -5, 3),
        (0, -8, -3), (-7, 9, -2), (0, 14, -3), (7, 9, -2),
    ]
    faces = [
        (0, 1, 7), (1, 2, 3), (1, 3, 4, 5, 7), (7, 5, 6),
        (0, 8, 9, 1), (1, 9, 3), (3, 9, 10, 4), (4, 10, 11, 5),
        (5, 11, 8, 7), (7, 8, 0), (8, 11, 10, 9),
    ]
    custom_wing_mesh("Blackwing_Fighter__hull", verts, faces, blackwing_mat, owner, fighter)
    for side in (-1, 1):
        cylinder("Blackwing_Fighter__engine", (side * 5, 9, 0), 2.8, 12, dark_mat, owner, 12, fighter).rotation_euler.x = math.pi / 2
        cylinder("Blackwing_Fighter__glow", (side * 5, 15.5, 0), 1.9, 1.2, violet_mat, owner, 12, fighter).rotation_euler.x = math.pi / 2

    drone = template_root("Blackwing_Drone", owner)
    custom_wing_mesh(
        "Blackwing_Drone__hull",
        [(0, -8, 1), (-9, 5, 0), (0, 8, 2), (9, 5, 0), (0, 1, -3)],
        [(0, 1, 2), (0, 2, 3), (0, 4, 1), (1, 4, 2), (2, 4, 3), (3, 4, 0)],
        blackwing_mat, owner, drone
    )
    cylinder("Blackwing_Drone__eye", (0, -4, 0), 1.6, 1.2, violet_mat, owner, 12, drone).rotation_euler.x = math.pi / 2


def build_carrier(owner):
    root = template_root("Warden_Carrier", owner)
    cube("Carrier__spine", (0, 0, 0), (720, 128, 76), blackwing_mat, owner, 10, root)
    for side in (-1, 1):
        cube("Carrier__flight_deck", (-40, side * 155, 10), (540, 175, 24), blackwing_mat, owner, 7, root)
        cylinder("Carrier__main_engine", (-280, side * 112, 0), 46, 140, hardware_mat, owner, 20, root).rotation_euler.y = math.pi / 2
        cylinder("Carrier__main_glow", (-352, side * 112, 0), 34, 3, orange_mat, owner, 20, root).rotation_euler.y = math.pi / 2
    cube("Carrier__command_deck", (190, 0, 65), (170, 92, 58), dark_mat, owner, 6, root)
    cylinder("Carrier__core_tower", (260, 0, 125), 24, 110, violet_mat, owner, 16, root)
    for index in range(6):
        x = -180 + index * 70
        cube("Carrier__armor_module", (x, 0, 53), (48, 148, 28), hardware_mat, owner, 2.0, root)


def export_collection(owner, filepath):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in owner.all_objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(filepath), export_format="GLB", use_selection=True,
        export_apply=True, export_yup=True, export_extras=True,
        export_texcoords=True, export_normals=True, export_colors=True,
    )


def unload_collection_objects(owner):
    """Release exported world geometry before the story-kit export.

    Blender 4's glTF exporter can retain evaluated copies between sequential
    exports. Unlinking the already-saved world meshes keeps the final story-kit
    export below the Codespace memory ceiling without changing the .blend.
    """
    for obj in list(owner.all_objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)


reset_scene()
print("world-v2: scene reset", flush=True)
bpy.context.scene.unit_settings.system = "METRIC"
bpy.context.scene.unit_settings.scale_length = 1.0

terrain_mat = make_material("Terrain surface", (0.48, 0.54, 0.34), 0.0, 0.9)
road_mat = make_material("Road surface", (0.10, 0.12, 0.13), 0.08, 0.76)
road_shoulder_mat = make_material("Road shoulder", (0.24, 0.25, 0.23), 0.02, 0.88)
deck_mat = make_material("Airbase deck", (0.25, 0.27, 0.28), 0.16, 0.58)
runway_mat = make_material("Runway surface", (0.075, 0.09, 0.10), 0.06, 0.68)
concrete_mat = make_material("Bunker concrete", (0.47, 0.47, 0.43), 0.04, 0.78)
hardware_mat = make_material("Aviation hardware", (0.30, 0.34, 0.36), 0.68, 0.35)
dark_mat = make_material("Graphite structure", (0.045, 0.055, 0.07), 0.72, 0.31)
roof_mat = make_material("City roof", (0.20, 0.23, 0.24), 0.32, 0.62)
hangar_mat = make_material("Hangar metal", (0.31, 0.34, 0.34), 0.58, 0.46)
glass_mat = make_material("Recessed glazing", (0.02, 0.07, 0.10), 0.12, 0.17, (0.0, 0.025, 0.04))
teal_mat = make_material("Breakwater identity", (0.02, 0.42, 0.42), 0.34, 0.39, (0.0, 0.12, 0.13))
orange_mat = make_material("Safety orange", (0.68, 0.23, 0.025), 0.28, 0.42, (0.12, 0.025, 0.0))
red_mat = make_material("Inferno identity", (0.58, 0.06, 0.035), 0.36, 0.38, (0.12, 0.004, 0.0))
nav_mat = make_material("Navigation ceramic", (0.62, 0.65, 0.62), 0.42, 0.42)
blackwing_mat = make_material("Black Wing armor", (0.025, 0.03, 0.05), 0.70, 0.25)
violet_mat = make_material("Warden energy", (0.20, 0.04, 0.34), 0.22, 0.18, (0.52, 0.05, 1.0))
foliage_mat = make_material("Conifer foliage", (0.22, 0.34, 0.13), 0.0, 0.95)
trunk_mat = make_material("Tree bark", (0.22, 0.14, 0.08), 0.0, 0.96)

source = make_collection("STARTER_COAST_WORLD_V2")
lod0 = make_collection("WORLD_LOD0", source)
lod1 = make_collection("WORLD_LOD1", source)
story = make_collection("STORY_TEMPLATES", source)
guides = make_collection("AUTHORING_GUIDES", source)

print("world-v2: building LOD0", flush=True)
build_world(lod0, 225, True)
print("world-v2: building LOD1", flush=True)
build_world(lod1, 113, False)
print("world-v2: building story templates", flush=True)
build_nav_mast(story)
build_warden_node(story)
build_defence_platform(story)
build_carrier_modules(story)
build_story_ground_sites(story)
build_story_aircraft(story)
build_carrier(story)
print("world-v2: story templates complete", flush=True)

for chapter in range(1, 7):
    marker = empty(f"Chapter_{chapter}__coverage_anchor", guides)
    marker["story_chapter"] = chapter
source["asset_contract"] = "starter-coast-asset-contract.json"
source["world_layout"] = "Starter Coast concept masterplan v1"
source["story_mission_coverage"] = 32
source["runtime_axes"] = "Three.js Y-up; Blender glTF conversion"

print("world-v2: saving blend", flush=True)
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_OUT))
print("world-v2: exporting LOD0", flush=True)
export_collection(lod0, WORLD_OUT)
print("world-v2: exporting LOD1", flush=True)
export_collection(lod1, WORLD_LOD1_OUT)
unload_collection_objects(lod0)
unload_collection_objects(lod1)
print("world-v2: exporting story kit", flush=True)
export_collection(story, STORY_OUT)
print("Starter Coast world v2, LOD1 and story kit exported")
