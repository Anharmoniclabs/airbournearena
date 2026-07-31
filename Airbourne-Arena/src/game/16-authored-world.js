/* Blender-authored hero architecture occupies the deliberately reserved
   downtown blocks. The generated 4K atlases are reassigned by material role,
   so they wrap real beveled shells, glazing, piers and rooftop hardware rather
   than being displayed as flat scenery cards. */
var architecturalTextureCache={};
function authoredScaledMap(source){
  if(!source)return null;
  if(architecturalTextureCache[source.uuid])return architecturalTextureCache[source.uuid];
  if(!source.image)return source;
  /* One calibrated clone per source family—not per mesh—keeps authored UV
     transforms isolated from the procedural materials without multiplying
     uploads across buildings and set pieces. */
  /* Blender exports meter-scaled box/cylindrical/terrain UVs. Preserve that
     physical density here instead of multiplying every surface by a shared
     2x transform that made a rooftop unit and a warehouse look identical. */
  var t=source.clone();t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(1,1);
  if('colorSpace' in t)t.colorSpace=THREE.SRGBColorSpace;
  if('encoding' in t)t.encoding=THREE.sRGBEncoding;
  t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  t.needsUpdate=true;architecturalTextureCache[source.uuid]=t;return t;
}
function calibrateAuthoredEnvironment(root,inside){
  root.traverse(function(o){
    if(!o.isMesh||!o.material)return;
    o.castShadow=!LOW;o.receiveShadow=true;o.material=o.material.clone();
    var n=o.material.name||'',on=(o.name||'').toLowerCase(),surface=null;
    /* Each authored module gets an independent texture transform. Reusing one
       Texture object made a hangar beam, an 80 m office and an HVAC box share
       the same repeat, producing either blur or postage-stamp noise. */
    function scaledMap(source){return authoredScaledMap(source);}
    if(o.geometry){
      o.geometry.computeBoundingBox();
      var bb=o.geometry.boundingBox,bs=new THREE.Vector3();
      if(bb)bb.getSize(bs);
      var sx=Math.max(bs.x,bs.z,4),sy=Math.max(bs.y,4);
      if(on.indexOf('repair factory')>=0)surface=factorySkin;
      else if(on.indexOf('barracks')>=0)surface=residentialSkin;
      else if(on.indexOf('bunker')>=0)surface=bunkerSkin;
      else if(on.indexOf('hvac')>=0||on.indexOf('parapet')>=0)surface=rooftopSkin;
      else if(on.indexOf('operations')>=0||on.indexOf('offices')>=0||
              on.indexOf('harbor')>=0||on.indexOf('radar')>=0)surface=cityFacadeSkin;
      if(surface)o.material.map=scaledMap(surface,sx,sy);
    }
    if(n.indexOf('galvanized')>=0){
      if(!surface)o.material.map=scaledMap(inside?breakwaterSkin:factorySkin,18,12);
      o.material.color.setHex(0xd0d5d3);o.material.metalness=.42;o.material.roughness=.48;
    }else if(n.indexOf('Graphite')>=0){
      o.material.map=scaledMap(aviationHardwareSkin,12,8);o.material.color.setHex(0x77838d);
      o.material.metalness=.58;o.material.roughness=.38;
    }else if(n.indexOf('concrete')>=0){
      if(!surface)o.material.map=scaledMap(inside?hangarFloorSkin:bunkerSkin,22,14);
      o.material.color.setHex(0xe0ddd1);
      o.material.metalness=.04;o.material.roughness=.74;
    }else if(n.indexOf('teal')>=0){
      o.material.map=scaledMap(breakwaterSkin,15,10);o.material.color.setHex(0x9dd3d0);
    }else if(n.indexOf('glazing')>=0){
      o.material.color.setHex(0x193849);o.material.emissive.setHex(0x071925);
      o.material.emissiveIntensity=.7;o.material.metalness=.12;o.material.roughness=.18;
    }else if(n.indexOf('light')>=0){
      o.material.emissive.setHex(0xffba61);o.material.emissiveIntensity=2.2;
    }
    if(o.material.map){o.material.map.colorSpace=THREE.SRGBColorSpace;}
    o.material.needsUpdate=true;
  });
}
/* Blender-authored island masterplan. The moving procedural terrain remains a
   loading/failure fallback only; the lightweight procedural city and forest
   stay as distance dressing around the hero architecture. */
var authoredWorld=null;
function calibrateAuthoredWorld(root){
  root.traverse(function(o){
    if(!o.isMesh||!o.material)return;
    /* The world is batched by material in Blender. Casting a shadow from a
       kilometer-wide batch exceeds the useful precision of the flight shadow
       map and produced black triangular scars across hills. Receive dynamic
       aircraft/set-piece shadows, but do not cast from the world batches. */
    o.castShadow=false;o.receiveShadow=true;o.material=o.material.clone();
    var n=(o.material.name||'').toLowerCase(),surface=null;
    if(n.indexOf('terrain')>=0)surface=terrainSkin;
    else if(n.indexOf('road')>=0)surface=roadSkin;
    else if(n.indexOf('airbase deck')>=0)surface=airbaseDeckSkin;
    else if(n.indexOf('runway')>=0)surface=roadSkin;
    else if(n.indexOf('bunker concrete')>=0)surface=bunkerSkin;
    else if(n.indexOf('aviation hardware')>=0)surface=aviationHardwareSkin;
    else if(n.indexOf('graphite')>=0)surface=aviationHardwareSkin;
    else if(n.indexOf('city roof')>=0)surface=cityRoofSkin;
    else if(n.indexOf('hangar')>=0)surface=hangarSkin;
    else if(n.indexOf('breakwater')>=0)surface=breakwaterSkin;
    else if(n.indexOf('inferno')>=0)surface=infernoSkin;
    else if(n.indexOf('navigation')>=0)surface=skywaySkin;
    else if(n.indexOf('tree bark')>=0)surface=aviationHardwareSkin;
    else if(n.indexOf('foliage')>=0)surface=foliageSkin;
    if(surface)o.material.map=authoredScaledMap(surface);
    if(n.indexOf('glazing')>=0){
      o.material.color.setHex(0x142b39);o.material.emissive.setHex(0x061a27);
      o.material.emissiveIntensity=.72;o.material.metalness=.18;o.material.roughness=.2;
    }
    if(n.indexOf('safety orange')>=0){
      o.material.map=authoredScaledMap(aviationHardwareSkin);
      o.material.color.setHex(0xe56c22);o.material.emissive.setHex(0x381000);
      o.material.emissiveIntensity=.46;
    }
    if(o.material.map){
      if('colorSpace' in o.material.map)o.material.map.colorSpace=THREE.SRGBColorSpace;
      if('encoding' in o.material.map)o.material.map.encoding=THREE.sRGBEncoding;
    }
    o.material.needsUpdate=true;
  });
}
makeGltfLoader().load(
  LOW?'assets/starter-coast-world-authored-v2-lod1.glb':
      'assets/starter-coast-world-authored-v2.glb',
  function(gltf){
    calibrateAuthoredWorld(gltf.scene);
    authoredWorld=gltf.scene;scene.add(authoredWorld);
    terrain.visible=false;proceduralRoads.visible=false;proceduralCity.visible=false;
  },undefined,function(err){console.error('Authored Starter Coast world failed to load.',err);}
);

