"""Build the three authored lower-city exploration districts and runtime LODs."""
import bpy, math, os
from pathlib import Path

HERE=Path(__file__).resolve().parent;PROJECT=HERE.parent.parent;OUT=PROJECT/'assets'
POSITIONS={'crashyard':(-1120,-760),'civic':(80,1180),'floodworks':(1180,-620)}

def material(name,color,metal=.1,rough=.65,emission=None):
    m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    if emission:
        (p.inputs.get('Emission Color') or p.inputs.get('Emission')).default_value=(*emission,1);p.inputs['Emission Strength'].default_value=3.2
    return m

def root(name,position):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=(position[0],position[1],0);return o

def cube(parent,name,loc,dims,mat,rot=(0,0,0),bevel=.35):
    bpy.ops.mesh.primitive_cube_add(location=loc,rotation=rot);o=bpy.context.object;o.name=name;o.dimensions=dims
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat);o.parent=parent
    if bevel:
        b=o.modifiers.new('structural edge','BEVEL');b.width=bevel;b.segments=2
    return o

def cylinder(parent,name,loc,radius,depth,mat,verts=16,rot=(0,0,0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=radius,depth=depth,location=loc,rotation=rot)
    o=bpy.context.object;o.name=name;o.data.materials.append(mat);o.parent=parent;return o

def crashyard(parent,lod,m):
    concrete,metal,accent,glass=m;detail=lod==0;v=20 if detail else 10
    cylinder(parent,'transport fuselage',(0,0,7),7,58,metal,v,(0,math.pi/2,0))
    cylinder(parent,'crushed nose',(-31,0,7),7,10,metal,v,(0,math.pi/2,0))
    cube(parent,'port wing',(-2,-14,6),(36,34,1.6),metal,(0,.08,-.08),.6)
    cube(parent,'severed starboard wing',(12,17,4),(25,25,1.4),metal,(0,-.12,.16),.5)
    cube(parent,'tail spar',(28,0,13),(8,4,19),metal,(0,.18,0),.5)
    cube(parent,'recovery gantry',(-18,-26,12),(4,4,25),concrete,(0,0,-.08),.45)
    cube(parent,'recovery gantry',(18,-26,12),(4,4,25),concrete,(0,0,.08),.45)
    cube(parent,'gantry bridge',(0,-26,25),(42,5,4),concrete,(0,0,.02),.45)
    for i in range(4 if detail else 2):
        x=-24+i*16;y=28+(i%2)*9;cube(parent,'salvage container',(x,y,3),(13,6,6),accent,(0,0,(i-1)*.04),.25)
    if detail:
        for i in range(9):
            a=i*.79;r=42+(i%3)*9;cube(parent,'wreck fragment',(math.cos(a)*r,math.sin(a)*r,1.2),(5+i%4,3,2.2),metal,(i*.04,i*.07,a),.18)

def civic(parent,lod,m):
    concrete,metal,accent,glass=m;detail=lod==0
    cube(parent,'civic tower left',(-22,0,17),(9,13,34),concrete,(0,-.04,-.05),.55)
    cube(parent,'civic tower right',(22,0,17),(9,13,34),concrete,(0,.04,.05),.55)
    cube(parent,'fractured arch',(0,0,36),(53,13,8),concrete,(0,.02,.06),.65)
    cube(parent,'fallen hall slab',(5,-23,4),(38,24,6),concrete,(0,.12,.13),.55)
    cube(parent,'memorial plinth',(0,20,3),(46,28,6),concrete,(0,0,0),.45)
    cube(parent,'recessed civic glass',(0,-6,19),(32,2,12),glass,(0,0,.02),.12)
    for i in range(6 if detail else 3):
        cube(parent,'memorial rib',(-15+i*6,18,14),(2.2,3,22),metal,(0,(i-2.5)*.025,0),.18)
    if detail:
        for i in range(8):
            cube(parent,'collapse rubble',(-32+i*9,-35+(i%3)*7,1.4),(6+i%3,4,2.8),concrete,(i*.03,i*.06,(i-4)*.07),.2)

def floodworks(parent,lod,m):
    concrete,metal,accent,glass=m;detail=lod==0;v=18 if detail else 10
    cube(parent,'pump hall',(0,24,10),(54,30,20),concrete,(0,0,-.03),.55)
    cube(parent,'pump hall glazing',(0,8.8,13),(34,1.2,7),glass,(0,0,-.03),.08)
    for i in range(3 if detail else 2):
        x=(i-1)*29;cylinder(parent,'pressure tank',(x,-10+(i%2)*8,15),11,30,metal,v)
        cylinder(parent,'tank cap',(x,-10+(i%2)*8,31),8,2.5,accent,v)
    cube(parent,'pipe bridge',(0,-26,29),(70,5,5),metal,(0,0,.02),.3)
    cube(parent,'pipe bridge support',(-31,-26,14),(4,5,27),metal,(0,0,-.03),.28)
    cube(parent,'pipe bridge support',(31,-26,14),(4,5,27),metal,(0,0,.03),.28)
    if detail:
        for i in range(5):cylinder(parent,'distribution pipe',(-24+i*12,35,5+i%2*2),1.3,38,accent,12,(math.pi/2,0,0))
        for i in range(7):cube(parent,'flood barrier',(-36+i*12,-45,2.2),(9,3,4.4),concrete,(0,0,(i-3)*.02),.22)

def apply_and_join(parent):
    meshes=[o for o in parent.children_recursive if o.type=='MESH']
    for o in meshes:
        bpy.context.view_layer.objects.active=o
        for mod in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
    groups={}
    for o in meshes:groups.setdefault(o.data.materials[0].name,[]).append(o)
    for name,objects in groups.items():
        if len(objects)==1:objects[0].name=parent.name+'__'+name;continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();objects[0].name=parent.name+'__'+name;objects[0].parent=parent

def export(roots,path):
    bpy.ops.object.select_all(action='DESELECT')
    for r in roots:
        r.select_set(True)
        for o in r.children_recursive:o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_materials='EXPORT')

bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
mats=(material('Bunker concrete',(.31,.33,.32),.03,.78),material('Aviation hardware',(.11,.15,.18),.72,.32),
      material('Safety orange',(.62,.13,.025),.38,.4,(.8,.04,.005)),material('Recessed glazing',(.01,.07,.11),.18,.16,(.01,.12,.18)))
builders={'crashyard':crashyard,'civic':civic,'floodworks':floodworks};all_roots=[]
for lod in (0,1):
    roots=[]
    for key,build in builders.items():
        r=root('DISTRICT_'+key+'__lod'+str(lod),POSITIONS[key]);build(r,lod,mats);apply_and_join(r);roots.append(r);all_roots.append(r)
    export(roots,OUT/('lower-city-districts-authored-v1'+('-lod1' if lod else '')+'.glb'))
    for r in roots:r.hide_render=True;r.hide_viewport=True
collision=[]
for key,pos in POSITIONS.items():
    r=root('DISTRICT_'+key+'__collision',pos);collision.append(r)
    radius={'crashyard':42,'civic':38,'floodworks':46}[key];height={'crashyard':32,'civic':43,'floodworks':38}[key]
    cylinder(r,key+' collision',(0,0,height/2),radius,height,mats[0],10)
export(collision,OUT/'lower-city-districts-authored-v1-collision.glb')
for r in collision:r.hide_render=True;r.hide_viewport=True
for r in all_roots:
    if '__lod0' in r.name:r.hide_render=False;r.hide_viewport=False
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'lower-city-districts-authored-v1.blend'))
