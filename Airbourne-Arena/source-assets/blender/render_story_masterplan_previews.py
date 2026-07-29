"""Render visual-review frames from the generated Starter Coast masterplan."""

import math
import os

import bpy
from mathutils import Vector


SOURCE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PREVIEW_ROOT = os.path.join(SOURCE_ROOT, "previews")
os.makedirs(PREVIEW_ROOT, exist_ok=True)


def point_camera(camera, target):
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()


def render(name, location, target, lens):
    camera.location = location
    camera.data.lens = lens
    point_camera(camera, target)
    scene.render.filepath = os.path.join(PREVIEW_ROOT, name)
    bpy.ops.render.render(write_still=True)


scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1600
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.world.color = (0.025, 0.055, 0.085)

collision = bpy.data.collections.get("COLLISION")
if collision:
    collision.hide_render = True

bpy.ops.object.camera_add()
camera = bpy.context.object
camera.name = "Review_Camera"
camera.data.clip_start = 1.0
camera.data.clip_end = 30000.0
scene.camera = camera

bpy.ops.object.light_add(type="SUN", location=(-2400, -3200, 5200))
sun = bpy.context.object
sun.name = "Review_Sun"
sun.data.energy = 2.4
sun.rotation_euler = (math.radians(28), math.radians(-18), math.radians(-35))

bpy.ops.object.light_add(type="AREA", location=(0, -1200, 3600))
fill = bpy.context.object
fill.name = "Review_Sky_Fill"
fill.data.energy = 1800
fill.data.shape = "DISK"
fill.data.size = 4200
point_camera(fill, (0, 0, 0))

ocean_mat = bpy.data.materials.new("Review ocean")
ocean_mat.diffuse_color = (0.015, 0.12, 0.20, 1.0)
ocean_mat.metallic = 0.22
ocean_mat.roughness = 0.28
bpy.ops.mesh.primitive_plane_add(size=18000, location=(0, 0, -12))
ocean = bpy.context.object
ocean.name = "Review_Ocean"
ocean.data.materials.append(ocean_mat)

render(
    "starter-coast-story-masterplan-top-v1.png",
    (0, 0, 10500),
    (0, 0, 0),
    58,
)
render(
    "starter-coast-story-masterplan-oblique-v1.png",
    (-5700, -6500, 4300),
    (150, -150, 240),
    48,
)
render(
    "starter-coast-story-masterplan-flight-v1.png",
    (-1850, -2400, 980),
    (300, 0, 180),
    54,
)

print("Starter Coast masterplan review frames rendered")
