"""Render concept-comparison beauty and mesh-overlay sheets for ozone bases v2."""
import bpy
import math
import mathutils
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "previews"))
os.makedirs(OUT, exist_ok=True)


def point_at(obj, target):
    direction = mathutils.Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


# Review only the production LOD0 meshes. Keep LOD1 and collisions authored but
# out of the render.
for obj in bpy.context.scene.objects:
    if "__lod1" in obj.name or "__collision" in obj.name:
        obj.hide_render = True

positions = {
    "vanguard_ozone_base_v2__lod0": (-930, 0, 0),
    "tempest_ozone_base_v2__lod0": (0, 105, 0),
    "inferno_ozone_base_v2__lod0": (930, 0, 0),
}
for name, position in positions.items():
    root = bpy.data.objects[name]
    root.location = position
    root.hide_render = False
    for child in root.children_recursive:
        child.hide_render = False
        child.color = (.035, .62, 1.0, 1.0)

world = bpy.context.scene.world or bpy.data.worlds.new("Ozone v2 review world")
bpy.context.scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (.005, .014, .045, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = .22

# A matte cloud datum makes the suspended structural depth legible.
bpy.ops.mesh.primitive_plane_add(size=5200, location=(0, 0, -205))
cloud = bpy.context.object
cloud.name = "Cloud datum"
cloud_mat = bpy.data.materials.new("Cloud ocean")
cloud_mat.diffuse_color = (.13, .27, .42, 1)
cloud_mat.use_nodes = True
cloud_mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (.07, .20, .36, 1)
cloud_mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = .94
cloud.data.materials.append(cloud_mat)

bpy.ops.object.light_add(type="SUN", location=(-900, -1100, 1450))
sun = bpy.context.object
sun.data.energy = 3.0
sun.rotation_euler = (math.radians(25), math.radians(-17), math.radians(-32))
bpy.ops.object.light_add(type="AREA", location=(0, -1100, 740))
fill = bpy.context.object
fill.data.energy = 2800
fill.data.shape = "RECTANGLE"
fill.data.size = 1250
fill.data.size_y = 620
point_at(fill, (0, 0, -20))

bpy.ops.object.camera_add(location=(0, -3200, 1850))
camera = bpy.context.object
bpy.context.scene.camera = camera
point_at(camera, (0, 25, -10))
camera.data.lens = 43
camera.data.clip_end = 7000

scene = bpy.context.scene
scene.render.engine = "BLENDER_WORKBENCH"
scene.display.shading.light = "STUDIO"
scene.display.shading.studio_light = "rim.sl"
scene.display.shading.color_type = "TEXTURE"
scene.display.shading.show_shadows = True
scene.display.shading.show_cavity = True
scene.display.shading.cavity_type = "BOTH"
scene.display.shading.curvature_ridge_factor = 1.8
scene.display.shading.curvature_valley_factor = 1.3
scene.render.resolution_x = 1920
scene.render.resolution_y = 1080
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False

scene.render.filepath = os.path.join(OUT, "ozone-sky-bases-v2-beauty-review.png")
bpy.ops.render.render(write_still=True)

# The second image is the requested 3D mesh overlay. It uses the exact same
# camera so silhouette, proportions, and topology can be compared directly.
scene.display.shading.color_type = "MATERIAL"
scene.display.shading.show_shadows = False
wire_mat = bpy.data.materials.new("Review cyan topology overlay")
wire_mat.diffuse_color = (0.0, .9, 1.0, 1.0)
for root_name in positions:
    for obj in bpy.data.objects[root_name].children_recursive:
        if obj.type == "MESH":
            obj.data.materials.append(wire_mat)
            wire = obj.modifiers.new("review topology overlay", "WIREFRAME")
            wire.thickness = .32
            wire.use_replace = False
            wire.material_offset = 1
scene.render.filepath = os.path.join(OUT, "ozone-sky-bases-v2-mesh-overlay-review.png")
bpy.ops.render.render(write_still=True)

print("Rendered", scene.render.filepath)
