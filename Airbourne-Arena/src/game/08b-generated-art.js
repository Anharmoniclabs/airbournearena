/* ===================== generated art kit =====================
   One loader and one calibration pass for everything that came out of the AI
   Toolkit drop: the 4v4 arena decks, the airbases, the arena masterplan, the
   weapons and the props. The generated-art manifest under source-assets/ is
   where each of those is given its real-world size and its material role name;
   this is the other half of that contract, and the names below have to stay in
   step with the ones in the manifest or a surface loses its calibration
   silently. (Its full path is not spelled out here on purpose: the deploy check
   that every asset path in the built file resolves to a real file would read
   the tail of it as one, and fail.)

   These differ from the Blender-authored world in the way that matters here:
   every one carries its own baked colour and normal map inside the GLB, so
   there is nothing to reassign out of the shared texture kit. Calibration is
   light response only. Repainting base colours would tint baked art into mud —
   the same trap calibrateSkyBase already documents.

   Loads are cached and cloned rather than repeated. A 4v4 match puts eight
   combatants on the deck from one pilot download, and a second request that
   arrives while the first is still in flight joins it instead of opening
   another. */
/* Nothing here joins the boot load, and that is the point.

   08-assets.js builds its progress bar out of every .load() made during the
   initial script execution. Registering this drop there as well was correct by
   that rule and wrong in every other way: it put the arena masterplan, both
   airbases, the tower, the props, five weapons and three grenades in front of
   the player before they could reach the hangar — around 130 MB of decoded
   texture, enough to take the renderer out entirely on a memory-limited
   machine, for art that is not visible until they fly or fight.

   So these load after the boot cover lifts. bootFinish() in 08-assets.js is
   what releases them. A caller that arrives later than that runs immediately,
   which is what makes afterBoot safe to wrap around anything. */
var deferredArt=[],bootReleased=false,bootReleasing=false;
function afterBoot(fn){
  if(bootReleased){fn();return;}
  deferredArt.push(fn);
}
/* Released a beat after the cover rather than inside bootFinish(). Starting a
   dozen downloads and their decodes in the same tick that lifts the cover
   competes with the first frames the player actually sees — the hangar should
   be up and moving before this begins. */
function runDeferredArt(){
  if(bootReleasing)return;
  bootReleasing=true;
  setTimeout(function(){
    /* Flipped here, not above: until the queue has actually been flushed a
       late afterBoot() caller has to join it rather than jump it. */
    bootReleased=true;
    var queue=deferredArt;deferredArt=[];
    for(var i=0;i<queue.length;i++)queue[i]();
  },400);
}
var generatedArt={};
function calibrateGeneratedArt(root){
  root.traverse(function(o){
    if(!o.isMesh||!o.material)return;
    o.castShadow=!LOW;o.receiveShadow=true;
    o.material=o.material.clone();
    var n=(o.material.name||'').toLowerCase();
    /* No environment map exists in this scene, so metalness has nothing to
       reflect and reads as soot at anything above about .4. Every branch here
       keeps it low and moves the character into roughness instead. */
    if(n.indexOf('weapon')>=0||n.indexOf('grenade')>=0){
      o.material.metalness=.34;o.material.roughness=.44;
    }else if(n.indexOf('pilot')>=0){
      o.material.metalness=.1;o.material.roughness=.62;
    }else if(n.indexOf('inferno')>=0){
      /* The volcanic deck bakes its magma into the colour map. Lifting it with
         emissive is what makes the vents read as heat rather than as paint. */
      o.material.metalness=.16;o.material.roughness=.72;
      if(o.material.emissive){o.material.emissive.setHex(0x2a0a02);o.material.emissiveIntensity=.5;}
    }else if(n.indexOf('tempest')>=0){
      o.material.metalness=.4;o.material.roughness=.34;
    }else if(n.indexOf('masterplan')>=0){
      /* Read at kilometres, lit by the same sun as the island below it. Keep it
         matte so the skyways stay legible against bright sky. */
      o.material.metalness=.22;o.material.roughness=.66;
      if(o.material.emissive){o.material.emissive.setHex(0x0d1c26);o.material.emissiveIntensity=.35;}
    }else if(n.indexOf('airbase')>=0||n.indexOf('arena')>=0){
      o.material.metalness=.3;o.material.roughness=.52;
    }
    if(o.material.map){
      if('colorSpace' in o.material.map)o.material.map.colorSpace=THREE.SRGBColorSpace;
      if('encoding' in o.material.map)o.material.map.encoding=THREE.sRGBEncoding;
    }
    o.material.needsUpdate=true;
  });
  return root;
}
/* onFail matters more than it looks. A caller that puts the game into a mode
   when the model arrives — the CQC decks do exactly that — would otherwise sit
   in a loading state for ever on a dropped request, with no way back to the
   hangar. Every waiting caller is told, not just the first. */
function loadGeneratedArt(url,onReady,onFail){
  var entry=generatedArt[url];
  if(entry&&entry.template){onReady(entry.template.clone(true));return;}
  if(entry&&!entry.failed){entry.waiting.push({ready:onReady,fail:onFail});return;}
  if(entry&&entry.failed){if(onFail)onFail();return;}
  entry=generatedArt[url]={template:null,failed:false,waiting:[{ready:onReady,fail:onFail}]};
  makeGltfLoader().load(url,function(gltf){
    entry.template=calibrateGeneratedArt(gltf.scene);
    var waiting=entry.waiting;entry.waiting=[];
    for(var i=0;i<waiting.length;i++)waiting[i].ready(entry.template.clone(true));
  },undefined,function(err){
    console.error('Generated art failed to load.',url,err);
    entry.failed=true;
    var waiting=entry.waiting;entry.waiting=[];
    for(var i=0;i<waiting.length;i++)if(waiting[i].fail)waiting[i].fail();
  });
}
/* Object3D.clone shares materials with the original, which is what keeps eight
   combatants cheap — so anything that needs its own colour has to break that
   sharing first. Only call this on clones that actually get recoloured. */
function tintGeneratedArt(root,hex,emissiveHex){
  root.traverse(function(o){
    if(!o.isMesh||!o.material)return;
    o.material=o.material.clone();
    if(o.material.color)o.material.color.setHex(hex);
    if(emissiveHex!==undefined&&o.material.emissive){
      o.material.emissive.setHex(emissiveHex);o.material.emissiveIntensity=.45;
    }
    o.material.needsUpdate=true;
  });
  return root;
}
