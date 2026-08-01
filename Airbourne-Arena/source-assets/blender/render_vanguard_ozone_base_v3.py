import bpy, math, mathutils, os
HERE=os.path.dirname(os.path.abspath(__file__));OUT=os.path.abspath(os.path.join(HERE,'..','previews'));os.makedirs(OUT,exist_ok=True)
for o in bpy.context.scene.objects:
    if o.name.startswith('VANGUARD_COLLISION') or o.parent and o.parent.name.startswith('VANGUARD_COLLISION'):o.hide_render=True
world=bpy.context.scene.world or bpy.data.worlds.new('Vanguard concept review');bpy.context.scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.008,.025,.065,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.22
bpy.ops.mesh.primitive_plane_add(size=5000,location=(0,0,-520));cloud=bpy.context.object
cm=bpy.data.materials.new('Cloud datum');cm.diffuse_color=(.2,.38,.55,1);cloud.data.materials.append(cm)
bpy.ops.object.light_add(type='SUN',location=(-800,-1000,1400));sun=bpy.context.object;sun.data.energy=3.6;sun.rotation_euler=(math.radians(24),math.radians(-16),math.radians(-30))
bpy.ops.object.light_add(type='AREA',location=(100,-1000,750));fill=bpy.context.object;fill.data.energy=2600;fill.data.size=950
fill.rotation_euler=(mathutils.Vector((0,0,-40))-fill.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(790,-1280,720));cam=bpy.context.object;bpy.context.scene.camera=cam
cam.rotation_euler=(mathutils.Vector((0,0,-35))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=54;cam.data.clip_end=5000
s=bpy.context.scene;s.render.engine='BLENDER_WORKBENCH';s.display.shading.light='STUDIO';s.display.shading.studio_light='rim.sl';s.display.shading.color_type='MATERIAL';s.display.shading.show_shadows=True;s.display.shading.show_cavity=True
s.render.resolution_x=1600;s.render.resolution_y=1000;s.render.resolution_percentage=100;s.render.image_settings.file_format='PNG'
s.render.filepath=os.path.join(OUT,'vanguard-ozone-carrier-v3-beauty.png');bpy.ops.render.render(write_still=True)
wiremat=bpy.data.materials.new('Cyan topology');wiremat.diffuse_color=(0,.9,1,1)
root=bpy.data.objects['VANGUARD_OZONE_CARRIER_V3']
for o in root.children_recursive:
    if o.type=='MESH':
        o.data.materials.append(wiremat);m=o.modifiers.new('Topology overlay','WIREFRAME');m.thickness=.27;m.use_replace=False;m.material_offset=1
s.display.shading.show_shadows=False;s.render.filepath=os.path.join(OUT,'vanguard-ozone-carrier-v3-mesh-overlay.png');bpy.ops.render.render(write_still=True)
