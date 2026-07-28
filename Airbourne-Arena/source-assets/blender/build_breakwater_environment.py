import bpy
import math
import os


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SOURCE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ASSET_ROOT = os.path.join(ROOT, "assets")


def mat(name, color, metallic=0.0, roughness=0.55, emission=None):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Metallic"].default_value = metallic
    p.inputs["Roughness"].default_value = roughness
    if emission:
        (p.inputs.get("Emission Color") or p.inputs.get("Emission")).default_value = (*emission, 1)
        p.inputs["Emission Strength"].default_value = 2.5
    return m


def cube(name, loc, scale, material, parent, bevel=.08):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(material)
    if bevel:
        b = o.modifiers.new("Manufactured edge", "BEVEL")
        b.width = bevel
        b.segments = 2
    o.parent = parent
    return o


def cyl(name, loc, radius, depth, material, parent, rot=(0, 0, 0), vertices=20):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                       location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(material)
    o.parent = parent
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def root(name):
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    return o


def export(root_obj, filename):
    bpy.ops.object.select_all(action="DESELECT")
    root_obj.select_set(True)
    for child in root_obj.children_recursive:
        child.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(ASSET_ROOT, filename),
                              export_format="GLB", use_selection=True,
                              export_apply=True, export_yup=True)


def window_grid(parent, center, width, depth, height, rows, cols, material):
    x0, y0, z0 = center
    for side in (-1, 1):
        for row in range(rows):
            z = z0 - height / 2 + (row + .65) * height / rows
            cube("Recessed glazing band", (x0, y0 + side * (depth / 2 + .035), z),
                 (width / 2, .045, height / rows * .22), material, parent, .015)


def detailed_building(parent, name, loc, size, floors, shell, frame, glass, roof, kind=0):
    x, y, z = loc
    w, d, h = size
    base = cube(name + " structural shell", (x, y, z + h / 2), (w / 2, d / 2, h / 2),
                shell, parent, .35)
    window_grid(parent, (x, y, z + h / 2), w * .88, d, h * .82,
                max(2, floors), max(3, int(w / 6)), glass)
    for side in (-1, 1):
        cube(name + " corner pier", (x + side * (w / 2 + .12), y, z + h / 2),
             (.28, d / 2 + .12, h / 2 + .12), frame, parent, .05)
    cube(name + " roof parapet", (x, y, z + h + .35), (w / 2 + .25, d / 2 + .25, .35),
         roof, parent, .12)
    for unit in range(2 + kind):
        ux = x + (unit - (1 + kind) / 2) * 3.2
        cube(name + " rooftop HVAC", (ux, y, z + h + 1.15), (1.15, 1.5, .7),
             frame, parent, .12)
    if kind == 1:
        cyl(name + " exhaust stack", (x + w * .28, y, z + h + 3.1), .48, 5.5,
             frame, parent)
    if kind == 2:
        cube(name + " armored entry", (x, y - d / 2 - .9, z + 2.0), (2.5, 1.0, 2.0),
             frame, parent, .12)
    return base


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

steel = mat("Weathered galvanized steel", (.34, .38, .39), .62, .38)
dark = mat("Graphite structural steel", (.055, .070, .082), .72, .31)
concrete = mat("Salt stained concrete", (.43, .44, .41), .05, .78)
teal = mat("Faded teal identification", (.035, .25, .27), .38, .43)
orange = mat("Safety orange", (.55, .20, .035), .4, .38)
glass = mat("Recessed industrial glazing", (.025, .075, .095), .2, .16, (.005, .025, .035))
light = mat("Hangar work light", (.8, .72, .55), .1, .2, (1.0, .65, .24))

# Hangar detail overlay. The existing room shell remains the collision body.
hangar = root("Breakwater_Hangar_Authored_Detail")
for x in (-44.8, 44.8):
    for y in range(-27, 28, 9):
        cube("Wall structural rib", (x, y, 7.5), (.42, .42, 7.5), dark, hangar, .08)
for y in range(-27, 28, 9):
    cube("Roof crossbeam", (0, y, 14.2), (45, .34, .34), dark, hangar, .07)
    for side in (-1, 1):
        brace = cube("Diagonal roof brace", (side * 23, y, 11.7), (25, .17, .17),
                     steel, hangar, .04)
        brace.rotation_euler.y = side * math.radians(11)
for side in (-1, 1):
    cube("Maintenance catwalk", (side * 42.8, -3, 8.1), (1.4, 24, .14), steel, hangar, .04)
    for y in range(-27, 23, 5):
        cube("Catwalk rail post", (side * 41.5, y, 9.1), (.06, .06, 1.0), orange, hangar, .02)
    cyl("Service main", (side * 43.6, 0, 11.1), .24, 57, orange, hangar,
         (math.pi / 2, 0, 0), 24)
for bay_x in (-17, 17):
    cube("Bay overhead luminaire", (bay_x, -9, 13.65), (3.4, 1.0, .14), light, hangar, .05)

# A coherent authored central district matching the masterplan.
district = root("Starter_Coast_Authored_District")
detailed_building(district, "Operations block", (-520, -420, 0), (88, 66, 82), 5,
                  concrete, dark, glass, steel, 0)
detailed_building(district, "Repair factory", (-350, -420, 0), (120, 78, 48), 3,
                  steel, dark, glass, concrete, 1)
detailed_building(district, "Barracks A", (-520, 420, 0), (82, 58, 66), 4,
                  concrete, teal, glass, steel, 0)
detailed_building(district, "Barracks B", (-365, 420, 0), (82, 58, 58), 4,
                  concrete, teal, glass, steel, 0)
detailed_building(district, "Hardened bunker", (430, -420, 0), (92, 72, 30), 2,
                  concrete, dark, glass, steel, 2)
detailed_building(district, "Radar utility", (500, 420, 0), (72, 58, 56), 3,
                  steel, dark, glass, concrete, 1)
detailed_building(district, "League offices", (335, 420, 0), (78, 60, 78), 5,
                  concrete, teal, glass, steel, 0)
detailed_building(district, "Harbor control", (0, 720, 0), (96, 64, 72), 4,
                  steel, dark, glass, concrete, 0)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SOURCE_ROOT, "blender",
                                                  "breakwater-environment-authored-v1.blend"))
export(hangar, "breakwater-hangar-detail-authored-v1.glb")
export(district, "starter-coast-district-authored-v1.glb")
print("Authored Breakwater environment GLBs exported")
