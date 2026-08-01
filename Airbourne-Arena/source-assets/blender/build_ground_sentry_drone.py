"""Author and export the lower-city hostile ground sentry rigid vehicle."""
import bpy, math, os

HERE=os.path.dirname(os.path.abspath(__file__))
GAME=os.path.abspath(os.path.join(HERE,"..",".."))
OUT=os.path.join(GAME,"assets")

def mat(name,color,metal=.65,rough=.32,emit=None):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value=(*color,1);p.inputs["Metallic"].default_value=metal;p.inputs["Roughness"].default_value=rough
    if emit:
        (p.inputs.get("Emission Color") or p.inputs.get("Emission")).default_value=(*emit,1)
        p.inputs["Emission Strength"].default_value=5
    return m

def root(name):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);return o

def cube(name,loc,scale,material,parent,bevel=.08,rot=(0,0,0)):
    bpy.ops.mesh.primitive_cube_add(location=loc,rotation=rot);o=bpy.context.object;o.name=name;o.dimensions=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(material);o.parent=parent
    if bevel:
        b=o.modifiers.new("machined edge","BEVEL");b.width=bevel;b.segments=2
    return o

def cyl(name,loc,radius,depth,material,parent,verts=16,rot=(0,0,0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=radius,depth=depth,location=loc,rotation=rot)
    o=bpy.context.object;o.name=name;o.data.materials.append(material);o.parent=parent;return o

def build(parent,lod,mats):
    shell,frame,optics,warning=mats;v=20 if lod==0 else 10
    # Low, broad armored silhouette with a protected central sensor crown.
    cyl("sentry armored core",(0,0,1.62),1.18,.95,shell,parent,v)
    cyl("sentry lower chassis",(0,0,.72),1.34,.55,frame,parent,v)
    cyl("sentry turret collar",(0,0,2.24),.72,.42,frame,parent,v)
    cyl("sentry sensor crown",(0,0,2.66),.52,.62,shell,parent,v)
    cube("sentry hostile optic",(0,-.515,2.70),(1.05,.09,.22),optics,parent,.035)
    # Four articulated-looking stabilizer housings keep the silhouette readable.
    for i in range(4):
        a=math.radians(45+i*90);x,y=math.cos(a)*1.22,math.sin(a)*1.22
        leg=cube("sentry outrigger",(x,y,.62),(1.0,.34,.32),frame,parent,.07,rot=(0,0,a))
        cyl("sentry foot",(math.cos(a)*1.62,math.sin(a)*1.62,.27),.30,.25,shell,parent,10 if lod==0 else 8)
    # Twin weapon pods and visible barrels; structural, not texture-only detail.
    for side in (-1,1):
        cube("sentry weapon pod",(side*.92,-.18,1.82),(.48,.9,.54),shell,parent,.07)
        cyl("sentry barrel",(side*.92,-.88,1.83),.095,1.05,frame,parent,12 if lod==0 else 8,rot=(math.pi/2,0,0))
        cube("sentry warning strip",(side*.92,-.645,1.56),(.34,.04,.09),warning,parent,.015)
    if lod==0:
        for side in (-1,1):
            cube("sentry armor cheek",(side*.73,.43,1.62),(.5,.55,.55),shell,parent,.06,rot=(0,0,side*.18))
        for a in (0,math.pi/2,math.pi,math.pi*1.5):
            cube("sentry chassis vent",(math.cos(a)*1.19,math.sin(a)*1.19,.86),(.32,.08,.19),warning,parent,.02,rot=(0,0,a))

def apply_join(parent):
    meshes=[o for o in parent.children_recursive if o.type=='MESH']
    for o in meshes:
        bpy.context.view_layer.objects.active=o
        for mod in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
    groups={}
    for o in meshes:
        key=o.data.materials[0].name;groups.setdefault(key,[]).append(o)
    for key,objects in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();objects[0].name=parent.name+'__'+key;objects[0].parent=parent

def export(parent,path):
    bpy.ops.object.select_all(action='DESELECT');parent.select_set(True)
    for o in parent.children_recursive:o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path,export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_materials='EXPORT')

bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
mats=(mat('Sentry weathered armor',(.09,.115,.13)),mat('Sentry dark mechanism',(.018,.024,.03),.88,.24),
      mat('Sentry hostile optics',(.22,.003,.002),.2,.16,(1,.015,.005)),mat('Sentry hazard marking',(.48,.12,.018),.45,.3,(1,.08,.01)))
roots=[]
for lod in (0,1):
    r=root('ground_sentry_drone__lod'+str(lod));build(r,lod,mats);apply_join(r);roots.append(r)
    export(r,os.path.join(OUT,'ground-sentry-drone-v1'+('-lod1' if lod else '')+'.glb'))
    r.hide_viewport=True;r.hide_render=True
col=root('ground_sentry_drone__collision')
cyl('ground_sentry_drone__collision',(0,0,1.35),1.42,2.7,mats[1],col,10)
export(col,os.path.join(OUT,'ground-sentry-drone-v1-collision.glb'));col.hide_viewport=True;col.hide_render=True
for r in roots:r.hide_viewport=False;r.hide_render=(r is roots[1])
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE,'ground-sentry-drone-authored-v1.blend'))
