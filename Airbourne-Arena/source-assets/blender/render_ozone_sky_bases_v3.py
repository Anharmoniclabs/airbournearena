"""Render review shots of the v3 ozone bases: aerial beauty + spawn-deck view.

Run against ozone-sky-bases-authored-v3.blend. Approximates the runtime's
bright ozone sky so materials are judged in the light they will ship in.
"""
import bpy
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
PREVIEWS = os.path.abspath(os.path.join(HERE, "..", "previews"))
os.makedirs(PREVIEWS, exist_ok=True)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.eevee.taa_render_samples = 24
scene.render.resolution_x = 1600
scene.render.resolution_y = 900
scene.render.image_settings.file_format = "PNG"

world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (.45, .62, .82, 1)   # runtime ozone sky
bg.inputs[1].default_value = 1.0

sun = bpy.data.objects.get("REVIEW_SUN")
if not sun:
    sun_data = bpy.data.lights.new("REVIEW_SUN", "SUN")
    sun = bpy.data.objects.new("REVIEW_SUN", sun_data)
    bpy.context.collection.objects.link(sun)
sun.data.energy = 4.0
sun.rotation_euler = (math.radians(50), math.radians(15), math.radians(35))

cam_data = bpy.data.cameras.new("REVIEW_CAM")
cam = bpy.data.objects.new("REVIEW_CAM", cam_data)
bpy.context.collection.objects.link(cam)
scene.camera = cam
cam_data.clip_end = 6000


def look_at(cam_obj, target):
    direction = (target - cam_obj.location).normalized()
    cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def isolate(faction, lod):
    for o in bpy.data.objects:
        if "__lod" in o.name or "ozone_base__" in (o.parent.name if o.parent else ""):
            wanted = o.name.startswith(f"{faction}_ozone_base__lod{lod}") or (
                o.parent and o.parent.name == f"{faction}_ozone_base__lod{lod}")
            o.hide_render = not wanted
            o.hide_set(not wanted)


from mathutils import Vector

SHOTS = {
    "aerial": (Vector((820, -700, 420)), Vector((-60, 0, -40))),
    "spawn": (Vector((285, -40, 16)), Vector((-180, 60, 60))),
    "under": (Vector((650, 620, -420)), Vector((-80, 0, -160))),
}

for faction in ("vanguard", "tempest", "inferno"):
    isolate(faction, 0)
    for shot, (loc, target) in SHOTS.items():
        cam.location = loc
        look_at(cam, target)
        scene.render.filepath = os.path.join(
            PREVIEWS, f"ozone-sky-bases-v3-{faction}-{shot}.png")
        bpy.ops.render.render(write_still=True)

print("Review renders in", PREVIEWS)
