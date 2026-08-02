"""Create a reproducible Blender authoring source from an accepted runtime GLB.

Usage:
  blender --background --factory-startup --python import_runtime_glb.py -- \
    --input /absolute/input.glb --output /absolute/output.blend
"""
import argparse
import os
import sys
import bpy


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1:])


def main():
    args = arguments()
    source = os.path.abspath(args.input)
    output = os.path.abspath(args.output)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=source)
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"Runtime GLB has no render meshes: {source}")
    for obj in meshes:
        obj.data.calc_loop_triangles()
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0
    os.makedirs(os.path.dirname(output), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=output)
    triangles = sum(len(obj.data.loop_triangles) for obj in meshes)
    print(
        f"RUNTIME_GLB_SOURCE input={source} output={output} "
        f"meshes={len(meshes)} triangles={triangles}"
    )


if __name__ == "__main__":
    main()
