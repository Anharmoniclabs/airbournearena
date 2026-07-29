#!/usr/bin/env python3
"""Dependency-free structural audit for .gltf and binary .glb assets."""
import argparse
import json
import struct
import sys
from pathlib import Path


def load_asset(path: Path):
    raw = path.read_bytes()
    if path.suffix.lower() == ".gltf":
        return json.loads(raw.decode("utf-8"))
    if raw[:4] != b"glTF" or len(raw) < 20:
        raise ValueError("not a valid GLB header")
    magic, version, total = struct.unpack_from("<4sII", raw, 0)
    if version != 2 or total != len(raw):
        raise ValueError(f"unsupported/corrupt GLB: version={version}, declared={total}, actual={len(raw)}")
    chunk_len, chunk_type = struct.unpack_from("<II", raw, 12)
    if chunk_type != 0x4E4F534A:
        raise ValueError("first GLB chunk is not JSON")
    return json.loads(raw[20:20 + chunk_len].decode("utf-8").rstrip(" \t\r\n\0"))


def accessor_count(doc, primitive, key):
    index = primitive.get("attributes", {}).get(key)
    if index is None:
        return 0
    return doc.get("accessors", [])[index].get("count", 0)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("asset", type=Path)
    parser.add_argument("--require-animation", action="append", default=[])
    parser.add_argument("--max-materials", type=int)
    args = parser.parse_args()
    doc = load_asset(args.asset)
    meshes = doc.get("meshes", [])
    primitives = [p for mesh in meshes for p in mesh.get("primitives", [])]
    triangles = 0
    warnings = []
    for primitive in primitives:
        mode = primitive.get("mode", 4)
        if mode != 4:
            warnings.append(f"primitive mode {mode} is not TRIANGLES")
            continue
        idx = primitive.get("indices")
        count = doc.get("accessors", [])[idx].get("count", 0) if idx is not None else accessor_count(doc, primitive, "POSITION")
        triangles += count // 3
        attrs = primitive.get("attributes", {})
        if "POSITION" not in attrs:
            warnings.append("primitive has no POSITION attribute")
        if primitive.get("material") is not None and "TEXCOORD_0" not in attrs:
            warnings.append("materialed primitive has no TEXCOORD_0")
    animations = [a.get("name", f"animation_{i}") for i, a in enumerate(doc.get("animations", []))]
    missing = [name for name in args.require_animation if name not in animations]
    if missing:
        warnings.append("missing required animations: " + ", ".join(missing))
    materials = len(doc.get("materials", []))
    if args.max_materials is not None and materials > args.max_materials:
        warnings.append(f"{materials} materials exceed budget {args.max_materials}")
    report = {
        "asset": str(args.asset),
        "bytes": args.asset.stat().st_size,
        "nodes": len(doc.get("nodes", [])),
        "meshes": len(meshes),
        "primitives": len(primitives),
        "triangles": triangles,
        "materials": materials,
        "textures": len(doc.get("textures", [])),
        "images": len(doc.get("images", [])),
        "skins": len(doc.get("skins", [])),
        "animations": animations,
        "warnings": warnings,
    }
    print(json.dumps(report, indent=2))
    return 1 if warnings else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError, IndexError, KeyError) as exc:
        print(f"audit failed: {exc}", file=sys.stderr)
        raise SystemExit(2)
