"""Render a contact sheet tile for one converted runtime GLB.

Orientation and scale are the two things convert_generated_fbx.py cannot check
for itself — a rifle exported barrel-backwards loads without error and is only
wrong to look at. WebGL capture is not a usable check in this container (the
SwiftShader path wedges), so this renders in Blender instead: three-quarter,
front and side views on a neutral backdrop, with a 1 m reference cube so a
mis-scaled asset is obvious rather than merely plausible.

  blender --background --factory-startup --python-exit-code 1 \
    --python render_generated_review.py -- \
    --input assets/weapon-sniper-v1.glb --output docs/renders/weapon-sniper.png
"""
import argparse
import math
import os
import sys

import bpy
from mathutils import Vector


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--samples", type=int, default=24)
    parser.add_argument("--resolution", type=int, default=520)
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1:])


def scene_bounds():
    low = Vector((1e9, 1e9, 1e9))
    high = Vector((-1e9, -1e9, -1e9))
    found = False
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        found = True
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                low[axis] = min(low[axis], world[axis])
                high[axis] = max(high[axis], world[axis])
    if not found:
        raise RuntimeError("imported GLB contains no mesh")
    return low, high


def add_backdrop(radius, floor_z):
    bpy.ops.mesh.primitive_plane_add(size=radius * 24, location=(0, 0, floor_z))
    plane = bpy.context.active_object
    material = bpy.data.materials.new("backdrop")
    material.use_nodes = True
    material.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.16, 0.18, 0.21, 1)
    material.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9
    plane.data.materials.append(material)


def add_reference_cube(floor_z, offset):
    """A 1 m cube beside the asset: the only cheap way to read scale in a render."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(offset, offset, floor_z + 0.5))
    cube = bpy.context.active_object
    material = bpy.data.materials.new("reference metre")
    material.use_nodes = True
    material.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.85, 0.35, 0.1, 1)
    cube.data.materials.append(material)


def add_lighting(radius):
    bpy.ops.object.light_add(type="SUN", location=(radius * 2, -radius * 2, radius * 3))
    key = bpy.context.active_object
    key.data.energy = 4.0
    key.rotation_euler = (math.radians(52), 0, math.radians(38))
    bpy.ops.object.light_add(type="AREA", location=(-radius * 2.4, radius * 1.6, radius * 1.8))
    fill = bpy.context.active_object
    fill.data.energy = radius * radius * 26
    fill.data.size = radius * 2
    fill.rotation_euler = (math.radians(-48), 0, math.radians(-140))
    world = bpy.data.worlds.new("review")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.05, 0.06, 0.08, 1)
    bpy.context.scene.world = world


def place_camera(centre, radius, angle_deg, elevation_deg):
    bpy.ops.object.camera_add()
    camera = bpy.context.active_object
    angle = math.radians(angle_deg)
    elevation = math.radians(elevation_deg)
    distance = radius * 3.1
    camera.location = (
        centre.x + math.cos(angle) * math.cos(elevation) * distance,
        centre.y + math.sin(angle) * math.cos(elevation) * distance,
        centre.z + math.sin(elevation) * distance,
    )
    direction = centre - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    # Blender's 1000 m default far plane clips the whole asset away on anything
    # arena-sized, which renders as an empty backdrop rather than as an error.
    camera.data.clip_start = max(radius / 500, 0.001)
    camera.data.clip_end = radius * 40
    bpy.context.scene.camera = camera
    return camera


def main():
    args = arguments()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=args.input)

    low, high = scene_bounds()
    centre = (low + high) / 2
    radius = max((high - low).length / 2, 0.05)

    add_backdrop(radius, low.z)
    add_reference_cube(low.z, radius * 1.5)
    add_lighting(radius)

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = args.samples
    scene.render.resolution_x = args.resolution
    scene.render.resolution_y = args.resolution
    scene.render.film_transparent = False
    os.makedirs(os.path.dirname(args.output), exist_ok=True)

    # -Y is the glTF viewer's "front", so this reads the same way the game will.
    views = (("34", -60, 22), ("front", -90, 4), ("side", 0, 4))
    stem, extension = os.path.splitext(args.output)
    for name, angle, elevation in views:
        camera = place_camera(centre, radius, angle, elevation)
        scene.render.filepath = f"{stem}-{name}{extension}"
        bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(camera, do_unlink=True)

    print(f"reviewed {os.path.basename(args.input)} "
          f"size={tuple(round(v, 2) for v in (high - low))} "
          f"floor_z={round(low.z, 3)}")


if __name__ == "__main__":
    main()
