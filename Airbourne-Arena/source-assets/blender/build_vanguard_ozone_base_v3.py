"""Author the Vanguard ozone carrier as an independent hard-surface asset.

The generated sky-base concept is used as a camera/silhouette reference only.
All visible depth, hull structure, deck mass, island, bays and lift pylons are
closed mesh geometry.
"""
import bpy, math, os
from mathutils import Vector

HERE=os.path.dirname(os.path.abspath(__file__))
GAME=os.path.abspath(os.path.join(HERE,'..','..'))
OUT=os.path.join(GAME,'source-assets','previews')
ASSETS=os.path.join(GAME,'assets')
os.makedirs(OUT,exist_ok=True)

bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)

def mat(name,color,metal=.7,rough=.32,emission=None):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    b=m.node_tree.nodes['Principled BSDF'];b.inputs['Base Color'].default_value=(*color,1)
    b.inputs['Metallic'].default_value=metal;b.inputs['Roughness'].default_value=rough
    if emission:
        (b.inputs.get('Emission Color') or b.inputs.get('Emission')).default_value=(*emission,1)
        b.inputs['Emission Strength'].default_value=1
    return m

WHITE=mat('Vanguard ceramic naval armor',(0.62,.72,.79),.74,.29)
LIGHT=mat('Vanguard sunward armor',(0.84,.90,.93),.68,.25)
DARK=mat('Vanguard recessed structure',(.018,.032,.048),.82,.3)
GLASS=mat('Vanguard cyan bridge glazing',(.006,.07,.11),.42,.16,(.01,.38,.62))
CYAN=mat('Vanguard flight guidance',(.01,.42,.72),.35,.22,(.01,.42,.72))
DECK=mat('Vanguard flight deck',(.075,.09,.105),.77,.43)

ROOT=bpy.data.objects.new('VANGUARD_OZONE_CARRIER_V3',None);bpy.context.collection.objects.link(ROOT)

def mesh_obj(name,verts,faces,material,parent=ROOT,bevel=0):
    me=bpy.data.meshes.new(name+' mesh');me.from_pydata(verts,[],faces);me.update()
    ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob);ob.data.materials.append(material);ob.parent=parent
    if bevel:
        mod=ob.modifiers.new('manufactured edge','BEVEL');mod.width=bevel;mod.segments=2
    return ob

def loft(name,outline,sections,material,bevel=0):
    """Closed faceted hull from (z, xScale, yScale, xOffset, yOffset) sections."""
    n=len(outline);verts=[]
    for z,sx,sy,ox,oy in sections:verts += [(x*sx+ox,y*sy+oy,z) for x,y in outline]
    faces=[]
    faces.append(tuple(range(n-1,-1,-1)))
    for k in range(len(sections)-1):
        for i in range(n):
            j=(i+1)%n;a=k*n+i;b=k*n+j;c=(k+1)*n+j;d=(k+1)*n+i;faces.append((a,b,c,d))
    top=(len(sections)-1)*n;faces.append(tuple(top+i for i in range(n)))
    return mesh_obj(name,verts,faces,material,ROOT,bevel)

def box(name,loc,dims,material,bevel=0,rot=0):
    bpy.ops.mesh.primitive_cube_add(location=loc,rotation=(0,0,rot));o=bpy.context.object;o.name=name;o.dimensions=dims
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(material);o.parent=ROOT
    if bevel:
        m=o.modifiers.new('armored edge','BEVEL');m.width=bevel;m.segments=2
    return o

def cyl(name,loc,r,depth,material,verts=20,r2=None):
    bpy.ops.mesh.primitive_cone_add(vertices=verts,radius1=r,radius2=r if r2 is None else r2,depth=depth,location=loc)
    o=bpy.context.object;o.name=name;o.data.materials.append(material);o.parent=ROOT;return o

def torus(name,loc,major,minor,material):
    bpy.ops.mesh.primitive_torus_add(major_radius=major,minor_radius=minor,major_segments=32,minor_segments=6,location=loc)
    o=bpy.context.object;o.name=name;o.data.materials.append(material);o.parent=ROOT;return o

# Broad asymmetric carrier outline traced from the left concept base.
deck=[(-455,-76),(-420,-160),(-260,-214),(70,-228),(330,-188),(455,-112),(468,-48),
      (452,76),(342,154),(100,205),(-250,198),(-430,132)]
loft('Vanguard primary armored hull',deck,[(-196,.68,.58,20,0),(-126,.84,.76,5,0),(-60,.94,.9,0,0),(-12,1,1,0,0)],DARK,5)
loft('Vanguard white upper hull',deck,[(-45,.96,.93,0,0),(-8,1,1,0,0),(14,.985,.985,0,0)],WHITE,4)

# Flight deck is structural geometry, not an image card.
runway=[(-420,-72),(425,-72),(450,-42),(442,48),(382,72),(-420,72)]
loft('Vanguard inset flight runway',runway,[(14,1,1,0,0),(18,1,1,0,0)],DECK,1)
for y in (-43,0,43):
    box('Vanguard runway centerline',(-2,y,19),(760,2.2,.7),CYAN,.15)
for x in range(-350,381,73):
    box('Vanguard arrestor marking',(x,0,19.3),(3.0,116,.45),LIGHT,.1)

# Port/starboard launch galleries are tapered closed volumes.
pod_outline=[(-92,-28),(72,-36),(101,-15),(97,19),(55,34),(-84,28),(-108,8)]
for side in (-1,1):
    for i,x in enumerate((-280,-95,105,295)):
        y=side*(205+(i%2)*8)
        loft('Vanguard launch gallery',pod_outline,[(-84,.8,.78,x,y),(-35,1,1,x,y),(8,.95,.95,x,y)],WHITE,4)
        box('Vanguard hangar aperture',(x,y+side*35,-28),(104,3,28),GLASS,.5)
        box('Vanguard gallery guidance',(x,y+side*37,-48),(62,2,3),CYAN,.2)

# Large offset command island with progressive setbacks and real undercuts.
island_outline=[(-92,-58),(82,-58),(108,-30),(104,48),(52,68),(-78,62),(-112,24)]
for name,z0,z1,scale,ox,oy,material in (
    ('island armored foundation',18,95,1.0,-176,105,WHITE),
    ('island operations tier',96,164,.78,-194,108,LIGHT),
    ('island bridge tier',165,224,.60,-211,106,WHITE),
    ('island command crown',225,270,.45,-220,108,LIGHT)):
    loft('Vanguard '+name,island_outline,[(z0,scale,scale,ox,oy),(z1,scale*.92,scale*.92,ox-5,oy)],material,4)
    box('Vanguard panoramic glazing',(ox-3,oy-58*scale-1,z1-19),(112*scale,3,18),GLASS,.4)

# Cantilevered control decks visible in the concept silhouette.
box('Vanguard forward control wing',(-115,42,139),(238,48,24),WHITE,4)
box('Vanguard aft sensor wing',(-270,103,193),(105,180,22),LIGHT,4)
box('Vanguard bridge undercut',(-198,94,151),(92,88,20),DARK,3)

# Mast, radar crown and antenna cage.
cyl('Vanguard command mast',(-222,108,329),8,122,DARK,16,5)
torus('Vanguard radar array',(-222,108,376),31,4,CYAN)
cyl('Vanguard radar hub',(-222,108,376),9,16,LIGHT,16)
for i in range(7):cyl('Vanguard antenna',(-255+i*11,108,402+(i%2)*10),1.3,48,DARK,8)

# Deep lift pylons with armored shoulders, cores and luminous field emitters.
for x,y,heavy in ((-335,-128,1),(-335,128,1),(-45,-170,0),(-45,170,0),(275,-122,1),(275,122,1)):
    r=31 if heavy else 25;depth=330 if heavy else 280
    loft('Vanguard pylon shoulder',[(-42,-32),(42,-32),(54,0),(40,35),(-40,35),(-54,0)],
         [(-76,1,1,x,y),(-118,.76,.76,x,y)],WHITE,3)
    cyl('Vanguard orbital lift pylon',(x,y,-118-depth/2),r,depth,DARK,20,r*.58)
    for k in range(5):torus('Vanguard pylon field collar',(x,y,-170-k*48),r*.86,2.1,CYAN)
    cyl('Vanguard lift emitter',(x,y,-118-depth-10),r*.66,20,CYAN,20,r*.48)

# Secondary armor cassettes and readable bay rhythm.
for side in (-1,1):
    for x in range(-365,366,73):
        box('Vanguard perimeter armor cassette',(x,side*185,-73),(48,22,34),WHITE,3)
        box('Vanguard perimeter vent',(x,side*197,-71),(26,2.2,15),GLASS,.3)

# Separate collision deck, hidden from beauty renders.
COLL=bpy.data.objects.new('VANGUARD_COLLISION',None);bpy.context.collection.objects.link(COLL)
collision=loft('Vanguard deck collision',deck,[(12,1,1,0,0),(20,1,1,0,0)],DARK,0);collision.parent=COLL;collision.hide_render=True

# Reference image lives in the source scene for 1:1 camera/silhouette checks.
concept=os.path.join(GAME,'source-assets','concepts','sky-bases-ozone-concept-v1.png')
if os.path.exists(concept):
    img=bpy.data.images.load(concept,check_existing=True);img.pack()
    ref=bpy.data.objects.new('REFERENCE_sky_bases_generated_image',None);ref.empty_display_type='IMAGE';ref.data=img
    ref.empty_display_size=12;ref.hide_render=True;bpy.context.collection.objects.link(ref)

# Apply authored bevels and save the independent editable source.
for o in list(ROOT.children_recursive):
    if o.type=='MESH':
        bpy.context.view_layer.objects.active=o
        for mod in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)

blend=os.path.join(HERE,'vanguard-ozone-carrier-v3.blend');bpy.ops.wm.save_as_mainfile(filepath=blend)

bpy.ops.object.select_all(action='DESELECT');ROOT.select_set(True)
for o in ROOT.children_recursive:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(ASSETS,'vanguard-ozone-carrier-v3.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True)
print('Authored independent Vanguard carrier:',blend)
