"""Static validation for the Starter Coast generated-art/mesh contract.

This does not replace Blender, GLB, or rendered-camera validation. It prevents
an image from silently losing its declared purpose or being assigned to two
incompatible structural roles while the full island is being authored.
"""

import json
from pathlib import Path


HERE = Path(__file__).resolve().parent
PROJECT = HERE.parent.parent
ASSETS = PROJECT / "assets"
CONTRACT = HERE / "starter-coast-asset-contract.json"


def declared_images(data):
    found = {}

    def add(name, role):
        found.setdefault(name, []).append(role)

    for mesh in data["runtime_meshes"]:
        for image in mesh.get("approved_surface_inputs", []):
            add(image, f"mesh:{mesh['asset']}")
    for family in data["surface_families"]:
        for image in family["images"]:
            add(image, f"surface:{family['family']}")
    for group in data["non_mesh_assets"]:
        for image in group["images"]:
            add(image, f"non_mesh:{group['class']}")
    return found


def main():
    data = json.loads(CONTRACT.read_text())
    failures = []
    roles = declared_images(data)

    for mesh in data["runtime_meshes"]:
        path = ASSETS / mesh["asset"]
        if not path.is_file():
            failures.append(f"missing runtime mesh: {path}")

    for image, image_roles in sorted(roles.items()):
        path = ASSETS / image
        if not path.is_file():
            failures.append(f"missing declared image: {path}")
        structural = any(role.startswith(("mesh:", "surface:")) for role in image_roles)
        non_mesh = any(role.startswith("non_mesh:") for role in image_roles)
        if structural and non_mesh:
            failures.append(
                f"incompatible structural/non-mesh declaration: {image}: "
                + ", ".join(image_roles)
            )

    diffusion_images = {path.name for path in ASSETS.glob("*diffusion*")}
    undeclared_diffusion = sorted(diffusion_images - set(roles))
    for image in undeclared_diffusion:
        failures.append(f"undeclared diffusion image: {ASSETS / image}")

    if failures:
        raise SystemExit("\n".join(failures))

    print(
        f"Starter Coast asset contract valid: "
        f"{len(data['runtime_meshes'])} meshes, {len(roles)} declared images"
    )


if __name__ == "__main__":
    main()
