"""Convert one AI-Toolkit generated FBX into a runtime GLB the web game loads.

The generated art all arrives in the same shape: a single mesh named
`tripo_node_<uuid>` carrying one `tripo_material_<uuid>`, with a Color and a
NormalGL PNG sitting beside it in a `.fbm` folder. None of that is usable as-is
— the names are unstable between regenerations, the meshes land at whatever
scale the generator picked, and the 4K PNGs are far larger than anything the
game should download.

So this normalises all three: it renames the material to a stable role name the
runtime calibration keys off, rescales the mesh to a real-world size given in
metres, and downsamples the maps before embedding them as WebP. WebP rather
than JPEG because the vendored GLTFLoader-r128 already handles
EXT_texture_webp, and a normal map through JPEG picks up blocking artefacts
that read as dents on flat armour panels.

Orientation is an explicit argument rather than something inferred. The
generator is not consistent about which axis is up or forward, and a wrong
guess is only visible in a render — so the caller states it, and
render_generated_review.py is what confirms it.

  blender --background --factory-startup --python-exit-code 1 \
    --python convert_generated_fbx.py -- \
    --input .../selected.fbx --output .../weapon-sniper-v1.glb \
    --material "weapon alloy" --target-size 1.35 --texture-size 1024
"""
import argparse
import math
import os
import shutil
import sys
import tempfile

import bpy
from mathutils import Vector


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--material", required=True,
                        help="stable material name the runtime calibration matches on")
    parser.add_argument("--object-name", help="defaults to the output basename")
    parser.add_argument("--target-size", type=float, required=True,
                        help="longest dimension in metres after scaling")
    parser.add_argument("--texture-size", type=int, default=1024)
    parser.add_argument("--rotate", default="0,0,0",
                        help="XYZ degrees applied before measuring, e.g. 90,0,0")
    parser.add_argument("--decimate", type=float, default=0.0,
                        help="collapse ratio for a LOD; 0 disables")
    parser.add_argument("--origin", choices=("floor", "centre"), default="floor",
                        help="floor sits the mesh on z=0; centre puts the middle at the origin")
    parser.add_argument("--no-normal-map", action="store_true")
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1:])


def import_single_mesh(path):
    """Import the FBX and return one joined mesh object."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=path)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"no mesh in {path}")
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    return bpy.context.view_layer.objects.active


def find_maps(fbx_path):
    """Locate the Color/NormalGL pair the generator drops in the .fbm folder."""
    stem = os.path.splitext(fbx_path)[0]
    colour = normal = None
    for folder in (stem + ".fbm", os.path.dirname(fbx_path)):
        if not os.path.isdir(folder):
            continue
        for name in sorted(os.listdir(folder)):
            full = os.path.join(folder, name)
            if not name.lower().endswith(".png"):
                continue
            if name.startswith("Color") and colour is None:
                colour = full
            elif name.startswith("NormalGL") and normal is None:
                normal = full
        if colour:
            break
    return colour, normal


def load_downsampled(path, size, scratch):
    """Load an image and shrink it, so the GLB embeds a game-sized texture.

    The save() is not optional. image.scale() only touches Blender's in-memory
    buffer, and the glTF exporter re-encodes from the image's source file
    whenever it still has one — so scaling alone is silently discarded and every
    asset ships the generator's full 2048 maps regardless of what the manifest
    asked for. Writing the scaled result out and repointing the image at it is
    what makes the setting real.
    """
    image = bpy.data.images.load(path, check_existing=False)
    width, height = image.size
    longest = max(width, height)
    if longest <= size:
        return image

    factor = size / longest
    image.scale(max(1, int(round(width * factor))),
                max(1, int(round(height * factor))))
    out = os.path.join(scratch, f"{len(bpy.data.images)}-{size}-{os.path.basename(path)}")
    image.filepath_raw = out
    image.file_format = "PNG"
    image.save()
    return image


def build_material(name, colour_path, normal_path, texture_size, scratch):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    tree = material.node_tree
    for node in list(tree.nodes):
        tree.nodes.remove(node)
    output = tree.nodes.new("ShaderNodeOutputMaterial")
    output.location = (520, 0)
    shader = tree.nodes.new("ShaderNodeBsdfPrincipled")
    shader.location = (140, 0)
    # Hard-surface default. The generated maps already carry their own shading
    # detail, so a high metalness here would double up and read as soot in a
    # scene that has no environment map to reflect.
    shader.inputs["Metallic"].default_value = 0.15
    shader.inputs["Roughness"].default_value = 0.62
    tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])

    if colour_path:
        tex = tree.nodes.new("ShaderNodeTexImage")
        tex.location = (-360, 140)
        tex.image = load_downsampled(colour_path, texture_size, scratch)
        tex.image.colorspace_settings.name = "sRGB"
        tree.links.new(tex.outputs["Color"], shader.inputs["Base Color"])

    if normal_path:
        tex = tree.nodes.new("ShaderNodeTexImage")
        tex.location = (-360, -220)
        tex.image = load_downsampled(normal_path, texture_size, scratch)
        tex.image.colorspace_settings.name = "Non-Color"
        mapper = tree.nodes.new("ShaderNodeNormalMap")
        mapper.location = (-80, -220)
        tree.links.new(tex.outputs["Color"], mapper.inputs["Color"])
        tree.links.new(mapper.outputs["Normal"], shader.inputs["Normal"])

    return material


def apply_transforms(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def normalise(obj, rotate, target_size, origin):
    obj.rotation_euler = [math.radians(float(v)) for v in rotate.split(",")]
    apply_transforms(obj)

    longest = max(obj.dimensions)
    if longest <= 0:
        raise RuntimeError("degenerate mesh: zero size")
    obj.scale = (target_size / longest,) * 3
    apply_transforms(obj)

    # Re-seat the mesh from its own bounds rather than trusting the generator's
    # origin, which is frequently nowhere near the geometry.
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    low = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    high = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    middle = (low + high) / 2
    obj.location -= Vector((middle.x, middle.y, middle.z if origin == "centre" else low.z))
    apply_transforms(obj)


def decimate(obj, ratio):
    modifier = obj.modifiers.new("lod", "DECIMATE")
    modifier.decimate_type = "COLLAPSE"
    modifier.ratio = ratio
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def main():
    args = arguments()
    obj = import_single_mesh(args.input)
    obj.name = args.object_name or os.path.splitext(os.path.basename(args.output))[0]
    if obj.data:
        obj.data.name = obj.name

    normalise(obj, args.rotate, args.target_size, args.origin)
    if args.decimate > 0:
        decimate(obj, args.decimate)

    colour, normal = find_maps(args.input)
    if args.no_normal_map:
        normal = None
    scratch = tempfile.mkdtemp(prefix="airbourne-art-")
    obj.data.materials.clear()
    obj.data.materials.append(
        build_material(args.material, colour, normal, args.texture_size, scratch))

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=args.output,
        export_format="GLB",
        export_image_format="WEBP",
        export_image_quality=82,
        export_apply=True,
        export_yup=True,
        use_selection=False,
        export_cameras=False,
        export_lights=False,
    )
    shutil.rmtree(scratch, ignore_errors=True)
    print(f"converted {os.path.basename(args.output)} "
          f"tris={len(obj.data.polygons)} "
          f"dims={tuple(round(v, 3) for v in obj.dimensions)}")


if __name__ == "__main__":
    main()
