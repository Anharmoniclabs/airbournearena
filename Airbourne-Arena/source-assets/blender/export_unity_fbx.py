"""Export an authored Airbourne Arena .blend scene for Unity.

Usage:
  blender --background input.blend --python export_unity_fbx.py -- \
    --output /absolute/path/asset.fbx [--name-contains LOD1]
"""
import argparse
import os
import sys
import bpy


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--name-contains")
    parser.add_argument("--action")
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1:])


def main():
    args = arguments()
    bpy.ops.object.select_all(action="DESELECT")
    selected = []
    for obj in bpy.context.scene.objects:
        if obj.type not in {"MESH", "ARMATURE", "EMPTY"}:
            continue
        if args.name_contains and args.name_contains.lower() not in obj.name.lower():
            continue
        if not args.name_contains and obj.hide_render:
            continue
        obj.select_set(True)
        selected.append(obj)
    if not selected:
        raise RuntimeError("No exportable authored objects matched the selection")
    bpy.context.view_layer.objects.active = selected[0]
    if args.action:
        action = bpy.data.actions.get(f"{args.action}_Character")
        character = bpy.data.objects.get("Character")
        if not action or not character or character.type != "ARMATURE":
            raise RuntimeError(f"Character action not found: {args.action}")
        for obj in bpy.data.objects:
            if obj.type != "ARMATURE" or not obj.animation_data:
                continue
            obj.animation_data.action = None
            for track in obj.animation_data.nla_tracks:
                track.mute = True
        character.animation_data_create()
        character.animation_data.action = action
        bpy.context.scene.frame_start = int(action.frame_range[0])
        bpy.context.scene.frame_end = int(action.frame_range[1])
    output = os.path.abspath(args.output)
    os.makedirs(os.path.dirname(output), exist_ok=True)
    bpy.ops.export_scene.fbx(
        filepath=output,
        use_selection=True,
        apply_unit_scale=True,
        apply_scale_options="FBX_SCALE_UNITS",
        axis_forward="-Z",
        axis_up="Y",
        use_mesh_modifiers=True,
        mesh_smooth_type="FACE",
        add_leaf_bones=False,
        bake_anim=True,
        bake_anim_use_all_actions=not bool(args.action),
        bake_anim_use_nla_strips=not bool(args.action),
        bake_anim_simplify_factor=0.0,
        path_mode="COPY",
        embed_textures=True,
    )
    print(f"UNITY_FBX_EXPORT objects={len(selected)} output={output}")


if __name__ == "__main__":
    main()
