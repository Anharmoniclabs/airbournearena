"""Render fast multi-angle review frames for Vanguard Interceptor v4."""

import os

import bpy
from mathutils import Vector


SOURCE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(SOURCE_ROOT, "previews")
os.makedirs(OUT, exist_ok=True)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1120
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.world.color = (.006, .009, .016)
if hasattr(scene, "eevee"):
    scene.eevee.taa_render_samples = 16

camera = scene.camera
camera.data.lens = 62
camera.data.clip_start = .1
camera.data.clip_end = 1000


def render(name, location, target):
    camera.location = location
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)


views = {
    "top": ((0, 0, 35), (0, 0, 0)),
    "profile": ((30, 0, 4.2), (0, -.3, .15)),
    "front": ((0, -31, 4.0), (0, -1.0, .10)),
    "rear": ((0, 31, 5.0), (0, 1.0, .15)),
    "gameplay": ((11.5, 17.5, 10.0), (0, .5, .10)),
}
only = os.environ.get("VANGUARD_REVIEW_VIEW")
for view_name, (location, target) in views.items():
    if only and view_name != only:
        continue
    render(f"vanguard-interceptor-v4-{view_name}.png", location, target)
print("Vanguard Interceptor v4 review rendered")
