"""Render required visual-review frames for Starter Coast world v2."""

import math
from pathlib import Path

import bpy
from mathutils import Vector


HERE = Path(__file__).resolve().parent
PREVIEWS = HERE.parent / "previews"
PREVIEWS.mkdir(parents=True, exist_ok=True)


def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def render(name, location, target, lens=50):
    camera.location = location
    camera.data.lens = lens
    point_at(camera, target)
    scene.render.filepath = str(PREVIEWS / name)
    bpy.ops.render.render(write_still=True)


scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1440
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.render.image_settings.color_mode = "RGBA"
scene.world.color = (0.035, 0.075, 0.12)

for name in ("WORLD_LOD1", "STORY_TEMPLATES", "AUTHORING_GUIDES"):
    collection = bpy.data.collections.get(name)
    if collection:
        collection.hide_render = True

bpy.ops.mesh.primitive_plane_add(size=18000, location=(0, 0, -7.5))
ocean = bpy.context.object
ocean.name = "Review_Ocean"
ocean_material = bpy.data.materials.new("Review ocean")
ocean_material.diffuse_color = (0.015, 0.16, 0.24, 1)
ocean_material.metallic = 0.28
ocean_material.roughness = 0.24
ocean.data.materials.append(ocean_material)

bpy.ops.object.camera_add()
camera = bpy.context.object
camera.name = "Review_Camera"
camera.data.clip_start = 1.0
camera.data.clip_end = 30000
scene.camera = camera

bpy.ops.object.light_add(type="SUN", location=(-4200, -5200, 6200))
sun = bpy.context.object
sun.name = "Review_Sun"
sun.data.energy = 3.2
sun.rotation_euler = (math.radians(24), math.radians(-18), math.radians(-38))

bpy.ops.object.light_add(type="AREA", location=(0, -1800, 4200))
fill = bpy.context.object
fill.name = "Review_Sky_Fill"
fill.data.energy = 1650
fill.data.shape = "DISK"
fill.data.size = 5200
point_at(fill, (0, 0, 0))

render("starter-coast-world-v2-top.png", (0, 0, 9200), (0, 0, 0), 58)
render("starter-coast-world-v2-oblique.png", (-6100, -6500, 4000), (100, -80, 120), 50)
render("starter-coast-world-v2-flight.png", (-2450, -2250, 860), (200, 0, 180), 55)

# Reuse the same source to review every story template without exporting a
# separate staged scene. Templates are moved only in this render process.
world = bpy.data.collections.get("WORLD_LOD0")
story = bpy.data.collections.get("STORY_TEMPLATES")
if world:
    world.hide_render = True
if story:
    story.hide_render = False
ocean.hide_render = True
roots = [obj for obj in story.objects if obj.type == "EMPTY" and obj.name.startswith("TEMPLATE")]
for index, root in enumerate(sorted(roots, key=lambda item: item.name)):
    root.location = ((index % 4 - 1.5) * 250, (index // 4 - 1.0) * 260, 0)
render("starter-coast-story-kit-v2.png", (0, -1250, 780), (0, 0, 70), 58)

print("Starter Coast world v2 review frames rendered")
