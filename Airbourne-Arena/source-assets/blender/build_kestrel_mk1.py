import bpy
import math
import os
from mathutils import Vector


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SOURCE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ASSET_OUT = os.path.join(ROOT, "assets", "kestrel-mk1-authored-v1.glb")
BLEND_OUT = os.path.join(SOURCE_ROOT, "blender", "kestrel-mk1-authored-v1.blend")
PREVIEW_OUT = os.path.join(SOURCE_ROOT, "previews", "kestrel-mk1-authored-v1.png")


def material(name, color, metallic=0.0, roughness=0.45, emission=None):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        emission_input = bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")
        emission_input.default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = 2.0
    return mat


def finish(obj, bevel=0.04, smooth=True):
    if bevel:
        mod = obj.modifiers.new("Manufactured edge radius", "BEVEL")
        mod.width = bevel
        mod.segments = 3
    if smooth and obj.type == "MESH":
        for poly in obj.data.polygons:
            poly.use_smooth = True
    return obj


def prism(name, outline, thickness, mat, z=0.0):
    count = len(outline)
    verts = [(x, y, z - thickness / 2) for x, y in outline]
    verts += [(x, y, z + thickness / 2) for x, y in outline]
    faces = [tuple(range(count - 1, -1, -1)), tuple(range(count, count * 2))]
    for i in range(count):
        j = (i + 1) % count
        faces.append((i, j, count + j, count + i))
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return finish(obj, min(0.06, thickness * 0.22), False)


def loft(name, stations, radial, mat):
    verts = []
    faces = []
    for y, rx, rz, zoff in stations:
        for ring in range(radial):
            a = ring / radial * math.tau
            verts.append((math.cos(a) * rx, y, math.sin(a) * rz + zoff))
    for s in range(len(stations) - 1):
        for r in range(radial):
            nr = (r + 1) % radial
            a = s * radial + r
            b = s * radial + nr
            c = (s + 1) * radial + nr
            d = (s + 1) * radial + r
            faces.append((a, b, c, d))
    faces.append(tuple(range(radial - 1, -1, -1)))
    tail = (len(stations) - 1) * radial
    faces.append(tuple(tail + i for i in range(radial)))
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return finish(obj, 0.025, True)


def cylinder(name, radius, depth, location, mat, vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=location,
        rotation=(math.pi / 2, 0, 0)
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return finish(obj, 0.035, True)


def cube(name, location, scale, mat, bevel=0.05):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    return finish(obj, bevel, False)


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

hull = material("Kestrel weathered ceramic", (0.58, 0.61, 0.60), 0.62, 0.28)
graphite = material("Graphite composite", (0.035, 0.045, 0.055), 0.28, 0.32)
metal = material("Heat stained engine metal", (0.17, 0.19, 0.21), 0.88, 0.23)
accent = material("Faction accent", (0.02, 0.38, 0.52), 0.5, 0.22, (0.0, 0.10, 0.16))
canopy = material("Cyan canopy", (0.025, 0.20, 0.28), 0.15, 0.08, (0.0, 0.08, 0.12))
panel = material("Ceramic service panels", (0.26, 0.30, 0.32), 0.48, 0.36)
sensor = material("Sensor glass", (0.015, 0.055, 0.070), 0.22, 0.10, (0.0, 0.05, 0.08))
warning = material("Maintenance warning", (0.72, 0.25, 0.035), 0.35, 0.38)
engine_inner = material("Engine internal ceramic", (0.018, 0.022, 0.026), 0.70, 0.24)
canopy.diffuse_color = (0.025, 0.20, 0.28, 0.72)
if hasattr(canopy, "surface_render_method"):
    canopy.surface_render_method = "DITHERED"
else:
    canopy.blend_method = "BLEND"

root = bpy.data.objects.new("Kestrel_Mk1", None)
bpy.context.collection.objects.link(root)

body = loft("Continuous fuselage", [
    (-6.3, .04, .04, 0.00), (-5.8, .34, .28, 0.00),
    (-4.8, .72, .50, 0.02), (-3.2, 1.06, .66, 0.08),
    (-1.0, 1.28, .69, 0.02), (1.2, 1.36, .62, -0.02),
    (3.2, 1.12, .54, -0.02), (4.5, .74, .44, -0.01),
    (5.05, .48, .38, 0.00)
], 40, hull)
body.parent = root

# A separate faceted radome and chin sensor prevent the nose from reading as
# one uninterrupted white cone at the hangar camera distance.
radome = loft("Graphite sensor radome", [
    (-6.34, .05, .05, 0.00), (-5.86, .35, .29, 0.00),
    (-5.35, .58, .42, 0.02)
], 32, graphite)
radome.scale = (1.012, 1.0, 1.012)
bpy.context.view_layer.objects.active = radome
radome.select_set(True)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
radome.select_set(False)
radome.parent = root
bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, location=(0, -5.20, -.38))
chin_sensor = bpy.context.object
chin_sensor.name = "Chin electro optical sensor"
chin_sensor.scale = (.24, .34, .18)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
chin_sensor.data.materials.append(sensor)
finish(chin_sensor, .012, True)
chin_sensor.parent = root

main_wing = prism("Blended main wing", [
    (-.72, -2.82), (-7.25, .12), (-6.55, 1.62), (-1.38, 2.62),
    (1.38, 2.62), (6.55, 1.62), (7.25, .12), (.72, -2.82)
], .20, hull, -0.08)
main_wing.parent = root

for side in (-1, 1):
    control = prism(f"Graphite elevon {'L' if side < 0 else 'R'}", [
        (side * 6.32, 1.28), (side * 2.0, 2.35),
        (side * 1.55, 2.02), (side * 5.95, .98)
    ], .055, graphite, .05)
    control.parent = root
    root_panel = prism(f"Graphite wing root panel {'L' if side < 0 else 'R'}", [
        (side * .95, -1.95), (side * 2.55, -.98),
        (side * 2.30, -.20), (side * .92, -.52)
    ], .035, graphite, .045)
    root_panel.parent = root
    tip_mark = prism(f"Faction wing identification {'L' if side < 0 else 'R'}", [
        (side * 6.72, .25), (side * 6.36, .48),
        (side * 5.98, 1.28), (side * 6.42, 1.18)
    ], .04, accent, .05)
    tip_mark.parent = root
    # Raised armor panels and leading-edge caps hold highlights independently
    # from the main wing, giving the top surface readable construction.
    armor = prism(f"Wing service armor {'L' if side < 0 else 'R'}", [
        (side * 1.18, -1.40), (side * 3.20, -.54),
        (side * 2.76, .18), (side * 1.12, -.35)
    ], .045, panel, .075)
    armor.parent = root
    leading = prism(f"Heat resistant leading edge {'L' if side < 0 else 'R'}", [
        (side * .82, -2.67), (side * 7.18, .10),
        (side * 6.92, .28), (side * .96, -2.28)
    ], .048, metal, .045)
    leading.parent = root
    access = prism(f"Outboard access hatch {'L' if side < 0 else 'R'}", [
        (side * 3.72, .52), (side * 5.10, .86),
        (side * 4.78, 1.22), (side * 3.48, .91)
    ], .035, graphite, .065)
    access.parent = root
    caution = prism(f"Maintenance warning panel {'L' if side < 0 else 'R'}", [
        (side * 2.58, -.04), (side * 3.14, .18),
        (side * 2.98, .43), (side * 2.42, .20)
    ], .038, warning, .078)
    caution.parent = root

tailplane = prism("Tailplane", [
    (-.55, 3.18), (-3.0, 4.12), (-2.58, 4.72),
    (0, 4.05), (2.58, 4.72), (3.0, 4.12), (.55, 3.18)
], .14, hull, .02)
tailplane.parent = root

for side in (-1, 1):
    nacelle = cylinder(f"Engine nacelle {'L' if side < 0 else 'R'}", .58, 3.7,
                       (side * 1.72, 2.45, -.18), metal, 40)
    nacelle.parent = root
    exhaust = cylinder(f"Exhaust {'L' if side < 0 else 'R'}", .48, .86,
                       (side * 1.72, 4.50, -.18), metal, 40)
    exhaust.parent = root
    intake = cylinder(f"Intake lip {'L' if side < 0 else 'R'}", .67, .28,
                      (side * 1.72, .56, -.18), graphite, 40)
    intake.parent = root
    intake_dark = cylinder(f"Intake throat {'L' if side < 0 else 'R'}", .51, .18,
                           (side * 1.72, .74, -.18), engine_inner, 32)
    intake_dark.parent = root
    intake_cone = cylinder(f"Intake centerbody {'L' if side < 0 else 'R'}", .17, .42,
                           (side * 1.72, .66, -.18), metal, 24)
    intake_cone.parent = root
    nozzle_ring = cylinder(f"Exhaust ceramic ring {'L' if side < 0 else 'R'}", .54, .18,
                           (side * 1.72, 4.93, -.18), graphite, 40)
    nozzle_ring.parent = root
    nozzle_core = cylinder(f"Exhaust internal core {'L' if side < 0 else 'R'}", .37, .12,
                           (side * 1.72, 5.02, -.18), engine_inner, 32)
    nozzle_core.parent = root
    fin = prism(f"Canted fin {'L' if side < 0 else 'R'}", [
        (side * .82, 2.55), (side * 1.45, 4.42),
        (side * .84, 4.80), (side * .32, 3.02)
    ], .16, graphite, .72)
    fin.rotation_euler.y = side * math.radians(18)
    fin.parent = root

bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, location=(0, -2.62, .66))
cockpit = bpy.context.object
cockpit.name = "Framed canopy"
cockpit.scale = (.58, 1.42, .36)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
cockpit.data.materials.append(canopy)
finish(cockpit, 0.015, True)
cockpit.parent = root

for x in (-.46, .46):
    frame = cube("Canopy longitudinal frame", (x * .78, -2.58, .86), (.028, 1.02, .026), graphite, .012)
    frame.rotation_euler.y = math.radians(-5)
    frame.parent = root

for y, width in ((-3.42, .54), (-2.58, .62), (-1.78, .52)):
    cross = cube("Canopy transverse frame", (0, y, .84), (width, .024, .025), graphite, .012)
    cross.parent = root

# Dorsal service spine, avionics hatches and a recessed refuelling port. These
# pieces are deliberately shallow: they catch light without changing the
# aircraft's aerodynamic silhouette.
for y, sx, sy in ((-1.02, .42, .52), (.08, .50, .38), (1.02, .45, .34), (1.90, .38, .30)):
    hatch = cube("Dorsal avionics access panel", (0, y, .735), (sx, sy, .022), panel, .025)
    hatch.parent = root
spine = cube("Dorsal systems spine", (0, 2.70, .58), (.24, 1.05, .16), graphite, .06)
spine.parent = root
bpy.ops.mesh.primitive_torus_add(major_radius=.18, minor_radius=.035,
                                 major_segments=24, minor_segments=8,
                                 location=(-.46, .18, .77))
fuel_port = bpy.context.object
fuel_port.name = "Recessed refuelling port"
fuel_port.data.materials.append(warning)
fuel_port.parent = root

for side in (-1, 1):
    for y in (-.15, 1.05):
        store = cylinder("Underwing hardpoint", .16, 1.7, (side * 3.35, y, -.46), metal, 24)
        store.parent = root
    # Navigation lamp housings are geometry, not camera-facing sprites.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8,
                                        location=(side * 6.73, .76, .10))
    lamp = bpy.context.object
    lamp.name = f"Navigation lamp {'L' if side < 0 else 'R'}"
    lamp.scale = (.12, .18, .09)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    lamp.data.materials.append(accent)
    finish(lamp, .008, True)
    lamp.parent = root

for y in (-2.9, -1.6, -.2, 1.35, 2.8):
    seam = cube("Dorsal panel seam", (0, y, .79), (.64, .018, .012), graphite, .004)
    seam.parent = root

for side in (-1, 1):
    for y in (-1.35, -.55, .38, 1.25):
        seam = cube(f"Wing panel joint {'L' if side < 0 else 'R'}",
                    (side * (1.65 + (y + 1.35) * .55), y, .085),
                    (.012, .44, .013), graphite, .003)
        seam.rotation_euler.z = side * math.radians(24)
        seam.parent = root

for obj in bpy.context.scene.objects:
    if obj.type == "MESH":
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        try:
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
        except RuntimeError:
            pass
        finally:
            if obj.mode == "EDIT":
                bpy.ops.object.mode_set(mode="OBJECT")
        obj.select_set(False)

root.rotation_euler.z = 0

# Preview rig.
bpy.ops.object.camera_add(location=(12.6, -14.2, 9.0))
camera = bpy.context.object
camera.data.lens = 58
camera.data.sensor_width = 36
bpy.context.scene.camera = camera

def track(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

track(camera, (0, 0, 0))
bpy.ops.object.light_add(type="AREA", location=(4, -7, 12))
bpy.context.object.data.energy = 1500
bpy.context.object.data.shape = "DISK"
bpy.context.object.data.size = 8
bpy.ops.object.light_add(type="AREA", location=(-8, 2, 6))
bpy.context.object.data.energy = 1000
bpy.context.object.data.size = 7
track(bpy.context.object, (0, 0, 0))
bpy.ops.object.light_add(type="AREA", location=(2, 8, 3))
bpy.context.object.data.energy = 900
bpy.context.object.data.size = 5
track(bpy.context.object, (0, 1, 0))

scene = bpy.context.scene
try:
    scene.render.engine = "BLENDER_EEVEE_NEXT"
except TypeError:
    scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = PREVIEW_OUT
scene.world.color = (0.008, 0.012, 0.018)
scene.render.film_transparent = False

bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)

# Keep the .blend modular for later art passes, but batch the runtime copy by
# material so every cloned aircraft does not multiply dozens of draw calls.
def consolidate_runtime_meshes(asset_root):
    material_groups = {}
    for obj in list(asset_root.children_recursive):
        if obj.type != "MESH":
            continue
        material_name = obj.data.materials[0].name if obj.data.materials else "Unassigned"
        material_groups.setdefault(material_name, []).append(obj)

    for material_name, objects in material_groups.items():
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects) > 1:
            bpy.ops.object.join()
        batch = bpy.context.view_layer.objects.active
        batch.name = f"Kestrel runtime — {material_name}"
        batch.parent = asset_root

consolidate_runtime_meshes(root)

# Only the authored aircraft hierarchy belongs in the runtime export.
bpy.ops.object.select_all(action="DESELECT")
root.select_set(True)
for child in root.children_recursive:
    child.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=ASSET_OUT,
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_yup=True
)
if os.environ.get("BLENDER_RENDER_PREVIEW") == "1":
    bpy.ops.render.render(write_still=True)
print(f"BLEND={BLEND_OUT}")
print(f"GLB={ASSET_OUT}")
print(f"PREVIEW={PREVIEW_OUT}")
