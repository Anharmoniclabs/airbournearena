"""Generate Kestrel Mk1 reduced render and collision GLBs from the v2 source."""

import os

import bpy


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ASSET_ROOT = os.path.join(ROOT, "assets")
PUBLIC_ROOT = os.path.join(ROOT, "source", "public", "assets")
BLEND_OUT = os.path.join(os.path.dirname(__file__), "kestrel-mk1-authored-v2.blend")


def clear_named(name):
    old = bpy.data.objects.get(name)
    if old:
        for child in list(old.children_recursive):
            bpy.data.objects.remove(child, do_unlink=True)
        bpy.data.objects.remove(old, do_unlink=True)


def export_hierarchy(root, filepath):
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for child in root.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
    )
    public_path = os.path.join(PUBLIC_ROOT, os.path.basename(filepath))
    with open(filepath, "rb") as source_file, open(public_path, "wb") as public_file:
        public_file.write(source_file.read())


def consolidate_by_material(root):
    groups = {}
    for obj in list(root.children_recursive):
        if obj.type != "MESH":
            continue
        material_name = obj.data.materials[0].name if obj.data.materials else "Unassigned"
        groups.setdefault(material_name, []).append(obj)
    for material_name, objects in groups.items():
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects) > 1:
            bpy.ops.object.join()
        batch = bpy.context.view_layer.objects.active
        batch.name = f"Kestrel LOD1 runtime — {material_name}"
        batch.parent = root


source_root = bpy.data.objects["Kestrel_Mk1"]

clear_named("Kestrel_Mk1_LOD1")
lod_root = bpy.data.objects.new("Kestrel_Mk1_LOD1", None)
bpy.context.collection.objects.link(lod_root)

for source in source_root.children_recursive:
    if source.type != "MESH":
        continue
    duplicate = source.copy()
    duplicate.data = source.data.copy()
    duplicate.animation_data_clear()
    duplicate.name = source.name + "__lod1"
    bpy.context.collection.objects.link(duplicate)
    duplicate.parent = lod_root
    duplicate.matrix_world = source.matrix_world
    if len(duplicate.data.polygons) > 24:
        modifier = duplicate.modifiers.new("LOD1 controlled reduction", "DECIMATE")
        modifier.ratio = 0.32
        modifier.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = duplicate
        duplicate.select_set(True)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        duplicate.select_set(False)

clear_named("Kestrel_Mk1_COLLISION")
collision_root = bpy.data.objects.new("Kestrel_Mk1_COLLISION", None)
bpy.context.collection.objects.link(collision_root)

collision_material = bpy.data.materials.get("Collision debug") or bpy.data.materials.new("Collision debug")
collision_material.diffuse_color = (0.9, 0.12, 0.03, 0.35)


def collision_box(name, location, scale):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(collision_material)
    obj.parent = collision_root
    return obj


collision_box("Kestrel collision fuselage", (0, -0.45, 0.0), (1.28, 5.65, 0.72))
collision_box("Kestrel collision wing", (0, 0.05, -0.04), (6.75, 2.25, 0.18))
collision_box("Kestrel collision tail", (0, 3.65, 0.08), (2.75, 1.05, 0.28))

os.makedirs(ASSET_ROOT, exist_ok=True)
os.makedirs(PUBLIC_ROOT, exist_ok=True)
consolidate_by_material(lod_root)
export_hierarchy(lod_root, os.path.join(ASSET_ROOT, "kestrel-mk1-authored-v2-lod1.glb"))
export_hierarchy(collision_root, os.path.join(ASSET_ROOT, "kestrel-mk1-authored-v2-collision.glb"))
bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)
print("Kestrel LOD1 and collision artifacts generated")
