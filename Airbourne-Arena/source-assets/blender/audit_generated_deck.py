"""Report where the walkable floor of a generated arena deck actually is.

The runtime cannot find this out for itself. The shipped GLBs are packed with
gltfpack, which quantizes positions to normalized shorts and moves the scale
onto the node; three.js r128 renders that correctly, because the GPU
denormalizes, but Mesh.raycast reads the raw attribute and so computes in
±32767 space. A downward ray against a packed deck therefore never hits.

So the deck height is measured here instead and baked into CQC_MAPS. This
histograms every near-horizontal face by area at the same scale the converter
produces, and prints the tallest bands — the main deck is the one holding most
of the walkable area, not necessarily the lowest surface.

  blender --background --factory-startup --python-exit-code 1 \
    --python audit_generated_deck.py -- \
    --input .../selected.fbx --target-size 190 --rotate 0,0,0
"""
import argparse
import os
import sys

import bpy

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from convert_generated_fbx import import_single_mesh, normalise  # noqa: E402


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--target-size", type=float, required=True)
    parser.add_argument("--rotate", default="0,0,0")
    parser.add_argument("--origin", default="floor")
    parser.add_argument("--band", type=float, default=2.0,
                        help="histogram bucket height in metres")
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1:])


def main():
    args = arguments()
    obj = import_single_mesh(args.input)
    normalise(obj, args.rotate, args.target_size, args.origin)

    mesh = obj.data
    mesh.calc_normals_split()
    bands = {}
    total = 0.0
    for poly in mesh.polygons:
        # Only surfaces you could stand on. 0.72 is about a 44-degree slope,
        # which is the point where a walkable ramp becomes a wall.
        if poly.normal.z < 0.72:
            continue
        height = (obj.matrix_world @ poly.center).z
        bucket = round(height / args.band) * args.band
        bands[bucket] = bands.get(bucket, 0.0) + poly.area
        total += poly.area

    if total <= 0:
        print(f"deck {os.path.basename(args.input)} NO HORIZONTAL SURFACE")
        return
    ranked = sorted(bands.items(), key=lambda kv: kv[1], reverse=True)[:5]
    summary = "  ".join(f"z={height:g} {area / total * 100:.0f}%" for height, area in ranked)

    # How far you can walk before running out of that floor. The movement clamp
    # in 34a is a square, so report the half-extent the same way — and take the
    # 92nd percentile rather than the maximum, so one stray gantry spur does not
    # licence walking off the edge of the deck.
    main = ranked[0][0]
    spread = []
    for poly in mesh.polygons:
        if poly.normal.z < 0.72:
            continue
        centre = obj.matrix_world @ poly.center
        if abs(centre.z - main) > args.band:
            continue
        spread.append(max(abs(centre.x), abs(centre.y)))
    spread.sort()
    reach = spread[int(len(spread) * 0.92)] if spread else 0.0

    print(f"deck {os.path.basename(os.path.dirname(args.input))} "
          f"height={obj.dimensions.z:.1f} main={main:g} reach={reach:.0f}  |  {summary}")


if __name__ == "__main__":
    main()
