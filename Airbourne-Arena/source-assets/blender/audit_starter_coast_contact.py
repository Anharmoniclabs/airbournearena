"""Audit visible terrain contact under every occupied Starter Coast footprint.

Run after generating the source scene:
  blender --background starter-coast-world-authored-v2.blend \
    --python audit_starter_coast_contact.py
"""

from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


# name, center x/y, occupied width/depth. Dimensions intentionally describe
# the structure, not the larger feathered construction pad.
FOOTPRINTS = (
    ("North Sensor compound", 0, 2100, 520, 380),
    ("Civic Operations", -430, -410, 98, 72),
    ("League Offices", 430, -410, 92, 68),
    ("Transit Authority", -430, 410, 92, 68),
    ("Emergency Control", 430, 410, 96, 72),
    ("Residential West", -1560, 1300, 110, 76),
    ("Residential East", -1360, 1380, 96, 68),
    ("Industrial Plant", 1540, 1280, 150, 96),
    ("Black Wing cache", 1740, 1120, 112, 82),
    ("Ridgemouth Clinic", -1420, -1370, 90, 64),
    ("Ridgemouth Civic", -1610, -1240, 112, 72),
    ("Covert Relay", 2225, -525, 100, 74),
    ("Harbor control", 0, -2150, 100, 70),
    ("Harbor warehouse west", -280, -2070, 190, 100),
    ("Harbor warehouse east", 280, -2070, 190, 100),
)

terrain = next(
    (
        obj for obj in bpy.data.objects
        if obj.type == "MESH"
        and (
            "terrain__lod0" in obj.name.lower()
            or "lod0__terrain surface" in obj.name.lower()
        )
    ),
    None,
)
if terrain is None:
    raise SystemExit("CONTACT AUDIT FAIL: LOD0 terrain mesh not found")

bvh = BVHTree.FromObject(terrain, bpy.context.evaluated_depsgraph_get())
failures = []
for name, center_x, center_y, width, depth in FOOTPRINTS:
    heights = []
    for xi in range(7):
        x = center_x + (xi / 6 - 0.5) * width
        for yi in range(7):
            y = center_y + (yi / 6 - 0.5) * depth
            hit, _normal, _face, _distance = bvh.ray_cast(
                Vector((x, y, 1000)), Vector((0, 0, -1)), 2000
            )
            if hit is None:
                failures.append(f"{name}: terrain ray missed at {x:.1f}, {y:.1f}")
                continue
            heights.append(hit.z)
    if not heights:
        continue
    spread = max(heights) - min(heights)
    center = heights[len(heights) // 2]
    deviation = max(abs(value - center) for value in heights)
    print(
        f"CONTACT {name}: spread={spread:.3f} m "
        f"max_center_delta={deviation:.3f} m"
    )
    if spread > 1.0 or deviation > 0.65:
        failures.append(
            f"{name}: visible terrain varies {spread:.3f} m "
            f"({deviation:.3f} m from center)"
        )

if failures:
    print("CONTACT AUDIT FAIL")
    for failure in failures:
        print(" -", failure)
    raise SystemExit(1)

print(f"CONTACT AUDIT PASS: {len(FOOTPRINTS)} occupied footprints")
