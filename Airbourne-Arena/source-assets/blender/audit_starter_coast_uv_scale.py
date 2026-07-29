"""Verify physical UV scale on every Starter Coast LOD0 material batch."""

import statistics

import bpy


def expected_tile(material_name):
    name = material_name.lower()
    if "terrain" in name:
        return 180.0
    if "road" in name or "runway" in name:
        return 12.0
    if "airbase deck" in name:
        return 16.0
    if "foliage" in name or "tree bark" in name:
        return 5.0
    if "glazing" in name or "identity" in name or "orange" in name:
        return 6.0
    if "hardware" in name or "graphite" in name:
        return 4.0
    return 8.0


failures = []
checked = 0
for obj in bpy.data.objects:
    if obj.type != "MESH" or "Starter_Coast_LOD0__" not in obj.name:
        continue
    if not obj.data.materials:
        failures.append(f"{obj.name}: no material")
        continue
    uv_layer = obj.data.uv_layers.get("UVMap")
    if uv_layer is None:
        failures.append(f"{obj.name}: UVMap missing")
        continue
    material_name = obj.data.materials[0].name
    expected = expected_tile(material_name)
    scales = []
    for polygon in obj.data.polygons:
        loops = list(polygon.loop_indices)
        for offset, loop_index in enumerate(loops):
            next_loop = loops[(offset + 1) % len(loops)]
            vertex = obj.data.vertices[obj.data.loops[loop_index].vertex_index].co
            next_vertex = obj.data.vertices[obj.data.loops[next_loop].vertex_index].co
            meters = (next_vertex - vertex).length
            uv = uv_layer.data[loop_index].uv
            next_uv = uv_layer.data[next_loop].uv
            uv_distance = (next_uv - uv).length
            if meters > 0.05 and uv_distance > 0.00001:
                scales.append(meters / uv_distance)
    if not scales:
        failures.append(f"{obj.name}: no measurable UV edges")
        continue
    median = statistics.median(scales)
    matching = sum(
        1 for scale in scales if abs(scale - expected) / expected <= 0.10
    )
    match_ratio = matching / len(scales)
    checked += 1
    print(
        f"UV {material_name}: median={median:.3f} m/tile "
        f"expected={expected:.3f} primary_match={match_ratio * 100:.1f}%"
    )
    # Primary box/cap/road faces must retain the intended scale. Small bevel
    # diagonals interpolate between projections and deliberately differ.
    if match_ratio < 0.18:
        failures.append(
            f"{material_name}: only {match_ratio * 100:.1f}% of measured "
            f"edges match {expected:.3f} m/tile"
        )

if failures:
    print("UV SCALE AUDIT FAIL")
    for failure in failures:
        print(" -", failure)
    raise SystemExit(1)

print(f"UV SCALE AUDIT PASS: {checked} LOD0 material batches")
