"""Bind the generated pilot mesh to the existing Mixamo rig and its animations.

The generated pilot arrived as a single unrigged mesh in a T-pose, which is
why it could only ever be a mannequin. This makes it a real character by
reusing the rig the game already ships: the skinned pilot in
starter-coast-pilot-unity-v1.blend carries a 49-bone Mixamo skeleton and the
Idle / Walk / Run clips the runtime already asks for by name.

Weights are transferred from the old mesh rather than generated from scratch.
Blender's automatic weights are unreliable on generator output — it is not
guaranteed manifold and has interior shells — whereas the old mesh is a
human in the same T-pose, so nearest-surface interpolation gives a clean
result and, more importantly, a deterministic one. Both meshes' rest poses are
the raw mesh data, since skinning is a modifier, so no posing is needed to line
them up.

Alignment is a uniform scale to match standing height plus a translation that
seats the feet and centres the body. Matching each axis independently would
distort the character: the generated pilot's arm span is wider relative to its
height than the old mesh's.

  blender --background --factory-startup --python-exit-code 1 \
    --python rig_generated_pilot.py -- \
    --rig starter-coast-pilot-unity-v1.blend \
    --mesh .../pilot-mesh-raw_Assets/selected.fbx \
    --output .../arena-pilot-rigged-v1.glb --texture-size 1024
"""
import argparse
import math
import os
import sys
import tempfile

import bpy
from mathutils import Matrix, Vector, kdtree

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from convert_generated_fbx import build_material, find_maps  # noqa: E402

SOURCE_MESH = "vanguard_Mesh"
ARMATURE = "Character"
# The clips the runtime looks up by name in characterActions(); anything else in
# the blend is a helper-object action and must not become a glTF animation.
CLIPS = ("Idle", "Walk", "Run")


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--rig", required=True, help=".blend holding the armature and clips")
    parser.add_argument("--mesh", required=True, help="generated pilot FBX")
    parser.add_argument("--output", required=True)
    parser.add_argument("--texture-size", type=int, default=1024)
    parser.add_argument("--rotate", default="0,0,90")
    parser.add_argument("--material", default="pilot flightsuit")
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1:])


def world_bounds(obj):
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    low = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    high = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    return low, high


def apply_transforms(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # bound_box is cached and is still the pre-apply box until the depsgraph
    # catches up. align_to() reads it immediately after this, so without the
    # update it scales from stale numbers and lands short.
    bpy.context.view_layer.update()


def import_generated_mesh(path, rotate):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.fbx(filepath=path)
    fresh = [o for o in bpy.context.scene.objects if o not in before]
    meshes = [o for o in fresh if o.type == "MESH"]
    for obj in fresh:
        if obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)
    if not meshes:
        raise RuntimeError(f"no mesh in {path}")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.rotation_euler = [math.radians(float(v)) for v in rotate.split(",")]
    apply_transforms(obj)
    return obj


def align_to(target, reference):
    """Uniform-scale and seat `target` so it stands where `reference` stands."""
    t_low, t_high = world_bounds(target)
    r_low, r_high = world_bounds(reference)
    height = t_high.z - t_low.z
    if height <= 0:
        raise RuntimeError("generated pilot has no height")
    target.scale = ((r_high.z - r_low.z) / height,) * 3
    apply_transforms(target)

    t_low, t_high = world_bounds(target)
    target.location += Vector((
        (r_low.x + r_high.x) / 2 - (t_low.x + t_high.x) / 2,
        (r_low.y + r_high.y) / 2 - (t_low.y + t_high.y) / 2,
        r_low.z - t_low.z,
    ))
    apply_transforms(target)


def transfer_weights(target, source, neighbours=4, floor=0.01):
    """Copy the Mixamo vertex groups across, weighted by proximity.

    Done by hand rather than through bpy.ops.object.data_transfer: the operator
    rejects its own documented `layers_select_src='ALL'` in this build, and this
    is a dozen lines that can be checked numerically afterwards. Each target
    vertex blends the groups of its nearest few source vertices by inverse
    distance, which fills the gaps between two meshes that share a pose but not
    a topology.
    """
    tree = kdtree.KDTree(len(source.data.vertices))
    for index, vertex in enumerate(source.data.vertices):
        tree.insert(source.matrix_world @ vertex.co, index)
    tree.balance()

    names = {group.index: group.name for group in source.vertex_groups}
    source_weights = [[(g.group, g.weight) for g in v.groups] for v in source.data.vertices]

    target.vertex_groups.clear()
    groups = {name: target.vertex_groups.new(name=name) for name in names.values()}

    for index, vertex in enumerate(target.data.vertices):
        blended = {}
        for _, source_index, distance in tree.find_n(target.matrix_world @ vertex.co, neighbours):
            influence = 1.0 / max(distance, 1e-4)
            for group_index, weight in source_weights[source_index]:
                blended[group_index] = blended.get(group_index, 0.0) + weight * influence
        total = sum(blended.values())
        if total <= 0:
            continue

        # WebGL's portable skinning path is four influences per vertex. The
        # glTF exporter can prune on its own, but doing it here makes the source
        # deterministic and lets us prove the normalized weights before export.
        shares = [(group_index, weight / total)
                  for group_index, weight in blended.items()
                  if weight / total >= floor]
        shares.sort(key=lambda pair: pair[1], reverse=True)
        shares = shares[:4]
        kept_total = sum(weight for _, weight in shares)
        if kept_total <= 0:
            # The nearest source vertex always has at least one influence, but
            # retain its strongest group if an unusually high floor is passed.
            strongest = max(blended.items(), key=lambda pair: pair[1])
            shares = [(strongest[0], 1.0)]
            kept_total = 1.0
        for group_index, weight in shares:
            groups[names[group_index]].add(
                [index], weight / kept_total, "REPLACE")

    unweighted = sum(1 for v in target.data.vertices if not v.groups)
    if unweighted:
        raise RuntimeError(f"{unweighted} vertices got no weights")


def validate_skin(target, armature):
    """Fail before export if the runtime skin contract is not satisfied."""
    bone_names = {bone.name for bone in armature.data.bones}
    group_names = {group.index: group.name for group in target.vertex_groups}
    maximum = 0
    for vertex in target.data.vertices:
        weights = [(group_names[g.group], g.weight)
                   for g in vertex.groups if g.weight > 1e-6]
        maximum = max(maximum, len(weights))
        if not weights:
            raise RuntimeError(f"vertex {vertex.index} has no skin weights")
        if len(weights) > 4:
            raise RuntimeError(
                f"vertex {vertex.index} has {len(weights)} influences; WebGL limit is four")
        if any(name not in bone_names for name, _ in weights):
            raise RuntimeError(f"vertex {vertex.index} references a non-bone group")
        total = sum(weight for _, weight in weights)
        if abs(total - 1.0) > 1e-4:
            raise RuntimeError(
                f"vertex {vertex.index} weights total {total:.6f}, not one")
    print(f"skin validated vertices={len(target.data.vertices)} "
          f"bones={len(armature.data.bones)} max_influences={maximum}")


def normalise_armature_units(armature):
    """Bake the FBX centimetre scale into bones and animated translations.

    Leaving the imported .01 scale on the armature works for its original
    centimetre mesh, but an aligned generated mesh is already in metres. glTF
    then applies .01 to it again. A unit-scale armature with metre-space bones
    is unambiguous in Blender, three.js and Unity.
    """
    unit = sum(armature.scale) / 3
    if max(abs(axis - unit) for axis in armature.scale) > 1e-6:
        raise RuntimeError(f"armature scale is not uniform: {tuple(armature.scale)}")
    if abs(unit - 1.0) < 1e-6:
        return
    armature.data.transform(Matrix.Scale(unit, 4))
    for action in bpy.data.actions:
        for curve in action.fcurves:
            if not curve.data_path.endswith(".location"):
                continue
            for key in curve.keyframe_points:
                key.co[1] *= unit
                key.handle_left[1] *= unit
                key.handle_right[1] *= unit
    armature.scale = (1.0, 1.0, 1.0)
    bpy.context.view_layer.update()


def bind(target, armature):
    # Convert the metre-space mesh into the normalized armature's local axes.
    # The exported mesh and skeleton then share one unit system and need no
    # matrix_parent_inverse that another runtime could interpret differently.
    target.data.transform(armature.matrix_world.inverted() @ target.matrix_world)
    target.matrix_world = armature.matrix_world
    modifier = target.modifiers.new("Armature", "ARMATURE")
    modifier.object = armature
    modifier.use_vertex_groups = True
    target.parent = armature
    target.matrix_parent_inverse = Matrix.Identity(4)
    target.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    local_low = tuple(round(min(v.co[i] for v in target.data.vertices), 3)
                      for i in range(3))
    local_high = tuple(round(max(v.co[i] for v in target.data.vertices), 3)
                       for i in range(3))
    print(f"bind local_bounds={local_low}..{local_high} "
          f"armature_scale={tuple(round(v, 3) for v in armature.scale)}")


def keep_only_runtime_clips():
    """Drop the helper-object actions so the GLB carries three clean clips.

    The blend holds a `<Clip>_Character` action plus one per stray finger empty.
    Exported as-is they become extra glTF animations with names the runtime does
    not recognise, and one of them would sort ahead of the real clip.
    """
    for action in list(bpy.data.actions):
        base = action.name.rsplit("_", 1)[0] if "_" in action.name else action.name
        if not action.name.endswith("_Character") or base not in CLIPS:
            bpy.data.actions.remove(action)
        else:
            action.name = base


def main():
    args = arguments()
    bpy.ops.wm.open_mainfile(filepath=args.rig)

    armature = bpy.data.objects.get(ARMATURE)
    source = bpy.data.objects.get(SOURCE_MESH)
    if not armature or not source:
        raise RuntimeError(f"{args.rig} is missing {ARMATURE} or {SOURCE_MESH}")

    target = import_generated_mesh(args.mesh, args.rotate)
    target.name = os.path.splitext(os.path.basename(args.output))[0]
    if target.data:
        target.data.name = target.name

    align_to(target, source)
    transfer_weights(target, source)
    normalise_armature_units(armature)
    bind(target, armature)
    validate_skin(target, armature)

    colour, normal = find_maps(args.mesh)
    scratch = tempfile.mkdtemp(prefix="airbourne-pilot-")
    target.data.materials.clear()
    target.data.materials.append(
        build_material(args.material, colour, normal, args.texture_size, scratch))

    # Everything that is not the armature or the new body goes: the old mesh,
    # its visor, the stray primitive, and the finger empties that only existed
    # to carry their own actions.
    for obj in list(bpy.data.objects):
        if obj is armature or obj is target:
            continue
        bpy.data.objects.remove(obj, do_unlink=True)
    keep_only_runtime_clips()

    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    target.select_set(True)
    bpy.context.view_layer.objects.active = armature

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=args.output,
        export_format="GLB",
        export_image_format="WEBP",
        export_image_quality=82,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_skins=True,
        export_yup=True,
        use_selection=True,
    )
    print(f"rigged {os.path.basename(args.output)} "
          f"tris={len(target.data.polygons)} "
          f"groups={len(target.vertex_groups)} "
          f"clips={sorted(a.name for a in bpy.data.actions)} "
          f"height={round(world_bounds(target)[1].z - world_bounds(target)[0].z, 3)}")


if __name__ == "__main__":
    main()
