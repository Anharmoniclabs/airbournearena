"""Import Unity FBX outputs into a clean Blender scene and report integrity."""
import argparse
import json
import os
import sys
import bpy


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", required=True)
    parser.add_argument("assets", nargs="+")
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1:])


def audit(path):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.fbx(filepath=os.path.abspath(path))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    triangles = 0
    material_names = set()
    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
        material_names.update(slot.material.name for slot in obj.material_slots if slot.material)
    if not meshes or triangles == 0:
        raise RuntimeError(f"FBX contains no renderable mesh triangles: {path}")
    return {
        "asset": path.replace("\\", "/"),
        "bytes": os.path.getsize(path),
        "objects": len(bpy.context.scene.objects),
        "meshes": len(meshes),
        "triangles": triangles,
        "materials": sorted(material_names),
    }


def main():
    args = arguments()
    rows = [audit(path) for path in args.assets]
    report = os.path.abspath(args.report)
    os.makedirs(os.path.dirname(report), exist_ok=True)
    with open(report, "w", encoding="utf8") as handle:
        json.dump({"schemaVersion": 1, "assets": rows}, handle, indent=2)
        handle.write("\n")
    print("UNITY_FBX_AUDIT " + " ".join(
        f"{row['asset']}={row['triangles']}tri" for row in rows))


if __name__ == "__main__":
    main()
