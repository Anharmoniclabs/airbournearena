/* Reusable mission visuals are loaded once and cloned into gameplay-owned
   collision hosts. Gameplay still uses its cheap cylinders and boxes for hit
   tests, while the player sees authored aircraft, towers, carrier modules and
   Warden hardware at exactly the same transform. */
var storyTemplates={},storyKitReady=false,storySiteHosts=[],storyCraftHosts=[],
    storySetpiece=null,storySetpieceMission=null;
function styleStoryAsset(root){
  root.traverse(function(o){
    if(!o.isMesh||!o.material)return;
    o.castShadow=!LOW;o.receiveShadow=true;o.material=o.material.clone();
    var n=(o.material.name||'').toLowerCase(),surface=aviationHardwareSkin;
    o.material.color.setHex(0xc5cbd0);
    if(n.indexOf('black wing')>=0){
      surface=blackWingSkin;o.material.color.setHex(0xd1d7df);
      o.material.metalness=.68;o.material.roughness=.3;
    }
    else if(n.indexOf('warden')>=0){
      surface=blackWingSkin;o.material.color.setHex(0x655578);
      o.material.emissive.setHex(0x3a087a);o.material.emissiveIntensity=.78;
    }else if(n.indexOf('navigation')>=0){
      surface=skywaySkin;o.material.color.setHex(0xf0f2ed);
    }else if(n.indexOf('bunker')>=0){
      surface=bunkerSkin;o.material.color.setHex(0xe0ddd2);
    }else if(n.indexOf('breakwater')>=0){
      surface=breakwaterSkin;o.material.color.setHex(0xd7f2ef);
    }
    else if(n.indexOf('safety orange')>=0){
      surface=aviationHardwareSkin;o.material.color.setHex(0xf08a35);
      o.material.emissive.setHex(0x7a1d00);
      o.material.emissiveIntensity=.82;
    }
    o.material.map=authoredScaledMap(surface);
    o.material.needsUpdate=true;
  });
}
function storyClone(key){
  var source=storyTemplates[key];
  if(!source)return null;
  var result=source.clone(true);result.visible=true;
  /* Mission objects are destroyed independently. Give each clone ownership of
     its disposable GPU resources so clearing one mission cannot invalidate the
     cached template or another aircraft already in the sky. */
  result.traverse(function(o){
    if(!o.isMesh)return;
    if(o.geometry)o.geometry=o.geometry.clone();
    if(o.material)o.material=Array.isArray(o.material)
      ?o.material.map(function(m){return m.clone();}):o.material.clone();
  });
  return result;
}
function siteTemplateKey(opts){
  var n=(opts.name||'').toUpperCase();
  if(n.indexOf('ENGINE')>=0)return 'Carrier_Engine';
  if(n.indexOf('DRONE BAY')>=0)return 'Drone_Bay';
  if(n.indexOf('COMMAND RELAY')>=0)return 'Command_Relay';
  if(n.indexOf('WARDEN CORE')>=0)return 'Warden_Core';
  if(n.indexOf('WRECK')>=0||n.indexOf('HULL')>=0)return 'Wreck_Field';
  if(n.indexOf('FOUNDRY')>=0)return 'Foundry';
  if(n.indexOf('DEFENCE PLATFORM')>=0)return 'Defence_Platform';
  if(n.indexOf('GUN')>=0||n.indexOf(' AA')>=0)return 'Defence_Platform';
  if(n.indexOf('WARDEN')>=0||n.indexOf('CACHE')>=0||n.indexOf('RELAY')>=0)
    return 'Warden_Node';
  if(opts.kind==='mast')return 'Nav_Mast';
  return 'Warden_Node';
}
function installStorySite(host,opts,h,r){
  if(host.userData.storyModel)return;
  if(!storyKitReady){storySiteHosts.push([host,opts,h,r]);return;}
  var model=storyClone(siteTemplateKey(opts));if(!model)return;
  host.add(model);model.updateMatrixWorld(true);
  var size=new THREE.Vector3();new THREE.Box3().setFromObject(model).getSize(size);
  var scale=Math.min(h/Math.max(size.y,1),r*2.25/Math.max(size.x,size.z,1));
  model.scale.setScalar(clamp(scale,.48,2.4));
  if(host.userData.legacyParts)
    for(var i=0;i<host.userData.legacyParts.length;i++)
      host.userData.legacyParts[i].visible=false;
  host.userData.storyModel=model;
}
function installStoryCraft(host,key,targetSpan){
  if(host.userData.storyModel)return;
  if(!storyKitReady){storyCraftHosts.push([host,key,targetSpan]);return;}
  var model=storyClone(key);if(!model)return;
  host.add(model);model.updateMatrixWorld(true);
  var size=new THREE.Vector3();new THREE.Box3().setFromObject(model).getSize(size);
  model.scale.setScalar(targetSpan/Math.max(size.x,size.z,1));
  if(host.userData.legacyParts)
    for(var i=0;i<host.userData.legacyParts.length;i++)
      host.userData.legacyParts[i].visible=false;
  host.userData.storyModel=model;
}
function clearStorySetpiece(){
  if(!storySetpiece)return;
  scene.remove(storySetpiece);disposeSubtree(storySetpiece);storySetpiece=null;
}
function syncStorySetpiece(id){
  storySetpieceMission=id||null;clearStorySetpiece();
  if(!storyKitReady||(id!=='ch6_m4'&&id!=='ch6_m5'))return;
  storySetpiece=storyClone('Warden_Carrier');
  if(!storySetpiece)return;
  storySetpiece.position.set(2850,900,0);scene.add(storySetpiece);
}
new THREE.GLTFLoader(loadManager).load(
  'assets/starter-coast-story-kit-authored-v2.glb',
  function(gltf){
    styleStoryAsset(gltf.scene);
    var keys=['Nav_Mast','Warden_Node','Defence_Platform','Carrier_Engine',
      'Drone_Bay','Command_Relay','Warden_Core','Cargo_Transport',
      'Blackwing_Fighter','Blackwing_Drone','Warden_Carrier','Wreck_Field','Foundry'];
    for(var i=0;i<keys.length;i++){
      var found=gltf.scene.getObjectByName('TEMPLATE__'+keys[i]);
      if(found)storyTemplates[keys[i]]=found;
    }
    storyKitReady=true;
    var pendingSites=storySiteHosts.splice(0),pendingCraft=storyCraftHosts.splice(0);
    for(var s=0;s<pendingSites.length;s++)
      installStorySite(pendingSites[s][0],pendingSites[s][1],pendingSites[s][2],pendingSites[s][3]);
    for(var c=0;c<pendingCraft.length;c++)
      installStoryCraft(pendingCraft[c][0],pendingCraft[c][1],pendingCraft[c][2]);
    syncStorySetpiece(storySetpieceMission);
  },undefined,function(err){console.error('Authored campaign story kit failed to load.',err);}
);

