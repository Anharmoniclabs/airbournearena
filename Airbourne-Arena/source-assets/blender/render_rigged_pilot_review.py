"""Render the rigged pilot mid-clip, to prove the transferred weights deform.

A bad skin binds and exports without complaint — it only looks wrong once a
bone moves, and the shapes it makes (a collapsed shoulder, a limb dragged to
the origin) are obvious in a picture and invisible in any numeric check. So
this poses the character at several frames of each clip and renders them.

Run it on the GLB *before* meshopt packing; Blender's importer rejects
EXT_meshopt_compression.

  blender --background --factory-startup --python-exit-code 1 \
    --python render_rigged_pilot_review.py -- \
    --input assets/arena-pilot-rigged-v1.glb --output docs/renders/pilot.png
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
    parser.add_argument("--resolution", type=int, default=460)
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1:])


def mesh_bounds():
    low = Vector((1e9, 1e9, 1e9))
    high = Vector((-1e9, -1e9, -1e9))
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                low[axis] = min(low[axis], world[axis])
                high[axis] = max(high[axis], world[axis])
    return low, high


def main():
    args = arguments()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=args.input)

    armature = next((o for o in bpy.context.scene.objects if o.type == "ARMATURE"), None)
    if not armature:
        raise RuntimeError("no armature in the rigged GLB")
    clips = sorted(a.name for a in bpy.data.actions)
    print(f"clips={clips} bones={len(armature.data.bones)}")

    low, high = mesh_bounds()
    centre = (low + high) / 2
    radius = max((high - low).length / 2, 0.2)

    bpy.ops.mesh.primitive_plane_add(size=radius * 20, location=(0, 0, low.z))
    floor = bpy.context.active_object
    floor_mat = bpy.data.materials.new("floor")
    floor_mat.use_nodes = True
    floor_mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (.17, .19, .22, 1)
    floor.data.materials.append(floor_mat)

    bpy.ops.object.light_add(type="SUN", location=(radius * 3, -radius * 3, radius * 5))
    bpy.context.active_object.data.energy = 4.5
    bpy.context.active_object.rotation_euler = (math.radians(54), 0, math.radians(36))
    world = bpy.data.worlds.new("review")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (.05, .06, .08, 1)
    bpy.context.scene.world = world

    bpy.ops.object.camera_add()
    camera = bpy.context.active_object
    camera.location = (centre.x + radius * 2.2, centre.y - radius * 2.6, centre.z + radius * .7)
    camera.rotation_euler = (centre - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.clip_end = radius * 60
    bpy.context.scene.camera = camera

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 24
    scene.render.resolution_x = args.resolution
    scene.render.resolution_y = args.resolution
    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    stem, extension = os.path.splitext(args.output)

    if not armature.animation_data:
        armature.animation_data_create()
    for name in clips:
        action = bpy.data.actions[name]
        armature.animation_data.action = action
        start, end = action.frame_range
        # Quarter and three-quarter of the clip: for a walk that is each leg
        # fully forward, which is where a bad shoulder or hip weight shows.
        for label, fraction in (("a", .25), ("b", .75)):
            scene.frame_set(int(start + (end - start) * fraction))
            bpy.context.view_layer.update()
            scene.render.filepath = f"{stem}-{name.lower()}-{label}{extension}"
            bpy.ops.render.render(write_still=True)
    print(f"posed {os.path.basename(args.input)} across {len(clips)} clips")


if __name__ == "__main__":
    main()
