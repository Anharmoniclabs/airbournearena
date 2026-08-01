import bpy, math, mathutils, os
HERE=os.path.dirname(os.path.abspath(__file__));OUT=os.path.abspath(os.path.join(HERE,'..','previews'));os.makedirs(OUT,exist_ok=True)
for o in bpy.context.scene.objects:
    if '__lod1' in o.name or '__collision' in o.name:o.hide_render=True
world=bpy.context.scene.world or bpy.data.worlds.new('Sentry review world');bpy.context.scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.008,.012,.018,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.22
bpy.ops.mesh.primitive_plane_add(size=24,location=(0,0,0));floor=bpy.context.object
fm=bpy.data.materials.new('Ruined concrete');fm.diffuse_color=(.08,.09,.095,1);floor.data.materials.append(fm)
bpy.ops.object.light_add(type='AREA',location=(-4,-5,7));bpy.context.object.data.energy=900;bpy.context.object.data.size=5
bpy.ops.object.light_add(type='AREA',location=(5,1,3));bpy.context.object.data.energy=650;bpy.context.object.data.color=(1,.12,.04);bpy.context.object.data.size=3
bpy.ops.object.camera_add(location=(6,-8,4.5));cam=bpy.context.object;bpy.context.scene.camera=cam
cam.rotation_euler=(mathutils.Vector((0,0,1.45))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=58
s=bpy.context.scene;s.render.engine='BLENDER_WORKBENCH';s.display.shading.light='STUDIO';s.display.shading.studio_light='rim.sl';s.display.shading.color_type='MATERIAL';s.display.shading.show_shadows=True;s.display.shading.show_cavity=True
s.render.resolution_x=1200;s.render.resolution_y=900;s.render.resolution_percentage=100;s.render.image_settings.file_format='PNG';s.render.filepath=os.path.join(OUT,'ground-sentry-drone-mesh-review-v1.png');bpy.ops.render.render(write_still=True)
