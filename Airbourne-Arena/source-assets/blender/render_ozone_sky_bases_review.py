import bpy
import math
import mathutils
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "previews"))
os.makedirs(OUT, exist_ok=True)

for o in bpy.context.scene.objects:
    if "__lod1" in o.name or "__collision" in o.name:
        o.hide_render = True

positions = {
    "vanguard_ozone_base__lod0": (-700, 0, 0),
    "tempest_ozone_base__lod0": (0, 80, 0),
    "inferno_ozone_base__lod0": (700, 0, 0),
}
for name, pos in positions.items():
    bpy.data.objects[name].location = pos

world = bpy.context.scene.world or bpy.data.worlds.new("Ozone review world")
bpy.context.scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (.008, .025, .075, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = .18

bpy.ops.object.light_add(type="SUN", location=(0, -700, 900))
sun = bpy.context.object
sun.data.energy = 4.0
sun.rotation_euler = (math.radians(25), math.radians(-18), math.radians(-28))
bpy.ops.object.light_add(type="AREA", location=(0, -600, 500))
fill = bpy.context.object
fill.data.energy = 2400
fill.data.shape = "DISK"
fill.data.size = 900

bpy.ops.mesh.primitive_plane_add(size=5000, location=(0, 0, -170))
cloud = bpy.context.object
cloud.name = "Cloud reference plane"
mat = bpy.data.materials.new("Cloud ocean")
mat.diffuse_color = (.35, .55, .72, 1)
mat.use_nodes = True
mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (.2, .42, .66, 1)
mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = .9
cloud.data.materials.append(mat)

bpy.ops.object.camera_add(location=(0, -2250, 1120))
cam = bpy.context.object
bpy.context.scene.camera = cam

def point(obj, target):
    direction = mathutils.Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

point(cam, (0, 50, -5))
cam.data.lens = 50
cam.data.clip_end = 5000
scene = bpy.context.scene
scene.render.engine = "BLENDER_WORKBENCH"
scene.display.shading.light = "STUDIO"
scene.display.shading.studio_light = "rim.sl"
scene.display.shading.color_type = "MATERIAL"
scene.display.shading.show_shadows = True
scene.display.shading.show_cavity = True
scene.render.resolution_x = 1600
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = os.path.join(OUT, "ozone-sky-bases-mesh-review-v1.png")
scene.render.film_transparent = False
bpy.ops.render.render(write_still=True)
print(scene.render.filepath)
