"""Run inside Blender: blender --background asset.blend --python this_file.py"""
import bpy

issues = []
for obj in bpy.data.objects:
    if obj.type != "MESH":
        continue
    if min(abs(v) for v in obj.scale) < 1e-6:
        issues.append(f"{obj.name}: zero scale")
    if any(abs(v - 1.0) > 1e-4 for v in obj.scale):
        issues.append(f"{obj.name}: unapplied scale {tuple(round(v, 4) for v in obj.scale)}")
    mesh = obj.data
    if not mesh.polygons:
        issues.append(f"{obj.name}: empty mesh")
    if not mesh.uv_layers and any(slot.material for slot in obj.material_slots):
        issues.append(f"{obj.name}: material but no UV layer")
    if len(obj.material_slots) > 8:
        issues.append(f"{obj.name}: {len(obj.material_slots)} material slots")
    for poly in mesh.polygons:
        if poly.area <= 1e-12:
            issues.append(f"{obj.name}: zero-area face")
            break

for armature in (o for o in bpy.data.objects if o.type == "ARMATURE"):
    if not armature.data.bones:
        issues.append(f"{armature.name}: empty armature")

if issues:
    print("BLENDER PREFLIGHT FAILED")
    for issue in issues:
        print(" -", issue)
    raise SystemExit(1)
print("BLENDER PREFLIGHT PASSED")
