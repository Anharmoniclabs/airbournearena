"""Render mandatory multi-angle Kestrel silhouette review frames."""

import os

import bpy
from mathutils import Vector


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "previews")
os.makedirs(OUT, exist_ok=True)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1400
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.world.color = (0.008, 0.012, 0.018)

camera = scene.camera
camera.data.lens = 62
camera.data.clip_start = .1
camera.data.clip_end = 1000


def point(target=(0, 0, 0)):
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()


def render(name, location, target=(0, 0, 0)):
    camera.location = location
    point(target)
    scene.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)


views = {
    "profile": ((18, 0, 2.8), (0, -.3, .1)),
    "front": ((0, -19, 2.4), (0, -.8, .1)),
    "rear": ((0, 19, 3.2), (0, .6, .1)),
    "gameplay": ((8.2, 11.5, 6.3), (0, .4, .1)),
}
only = os.environ.get("KESTREL_REVIEW_VIEW")
for view_name, (location, target) in views.items():
    if only and view_name != only:
        continue
    render(f"kestrel-mk1-authored-v3-{view_name}.png", location, target)
print("Kestrel v3 multi-angle review rendered")
