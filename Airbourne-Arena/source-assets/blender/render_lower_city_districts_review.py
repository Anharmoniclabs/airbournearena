import bpy, math, mathutils, os
from pathlib import Path
HERE=Path(__file__).resolve().parent;OUT=HERE.parent/'previews';OUT.mkdir(exist_ok=True)
review={'DISTRICT_crashyard__lod0':(-120,0,0),'DISTRICT_civic__lod0':(0,15,0),'DISTRICT_floodworks__lod0':(120,0,0)}
for o in bpy.context.scene.objects:
    o.hide_render=True
for name,pos in review.items():
    r=bpy.data.objects.get(name);r.hide_render=False;r.location=pos
    for o in r.children_recursive:o.hide_render=False
bpy.ops.mesh.primitive_plane_add(size=520,location=(0,0,-.3));floor=bpy.context.object;floor.hide_render=False
fm=bpy.data.materials.new('Review ground');fm.diffuse_color=(.045,.055,.06,1);floor.data.materials.append(fm)
world=bpy.context.scene.world or bpy.data.worlds.new('Lower city review');bpy.context.scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.012,.022,.035,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.3
bpy.ops.object.light_add(type='SUN',location=(-80,-120,180));sun=bpy.context.object;sun.hide_render=False;sun.data.energy=3.2;sun.rotation_euler=(math.radians(24),math.radians(-18),math.radians(-32))
bpy.ops.object.light_add(type='AREA',location=(0,-100,90));fill=bpy.context.object;fill.hide_render=False;fill.data.energy=1700;fill.data.size=140
bpy.ops.object.camera_add(location=(0,-360,155));cam=bpy.context.object;cam.hide_render=False;bpy.context.scene.camera=cam
cam.rotation_euler=(mathutils.Vector((0,8,14))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=42
s=bpy.context.scene;s.render.engine='BLENDER_WORKBENCH';s.display.shading.light='STUDIO';s.display.shading.studio_light='rim.sl';s.display.shading.color_type='MATERIAL';s.display.shading.show_shadows=True;s.display.shading.show_cavity=True
s.render.resolution_x=1600;s.render.resolution_y=900;s.render.resolution_percentage=100;s.render.image_settings.file_format='PNG';s.render.filepath=str(OUT/'lower-city-districts-mesh-review-v1.png');bpy.ops.render.render(write_still=True)
