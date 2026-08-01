/* ===================== skinned hangar characters =====================
   This is a real skinned GLB: one continuous character mesh, a Mixamo-style
   skeleton and embedded Idle/Walk/Run clips. Raster character concepts remain
   art direction only; they are never cut into fake body geometry. */
var playerAvatar=new THREE.Group(),maraAvatar=new THREE.Group();
var CAPTURE_FLIGHT=new URLSearchParams(location.search).has('captureFlight');
var playerMixer=null,maraMixer=null,playerActions={},maraActions={};
var playerAction='',RIGGED_CHARACTER_READY=false;
playerAvatar.position.set(0,0,26);playerAvatar.visible=false;hangarScene.add(playerAvatar);
maraAvatar.position.copy(MARA_POS);maraAvatar.visible=false;hangarScene.add(maraAvatar);
var pilotFill=new THREE.PointLight(0x9fc8e6,.62,11);
pilotFill.position.set(0,3.7,2.2);playerAvatar.add(pilotFill);
function characterActions(mixer,clips){
  var out={};
  clips.forEach(function(clip){out[clip.name]=mixer.clipAction(clip);});
  return out;
}
function setCharacterAction(name){
  if(!playerActions[name]||playerAction===name)return;
  var old=playerActions[playerAction],next=playerActions[name];
  if(old)old.fadeOut(.18);
  next.reset().fadeIn(.18).play();
  playerAction=name;
}
function prepareCharacter(root,accent){
  root.traverse(function(o){
    if(!o.isMesh)return;
    o.castShadow=true;o.receiveShadow=true;
    if(o.material){
      o.material=o.material.clone();
      var mn=o.material.name||'';
      if(o.material.color){
        if(mn.indexOf('Visor')>=0){
          o.material.color.setHex(0x80d9e7);
          if(o.material.emissive){o.material.emissive.setHex(0x123c4b);o.material.emissiveIntensity=.55;}
        }else if(mn.indexOf('Body')>=0){
          /* Preserve the GLB's authored multi-colour UV albedo: ceramic armour,
             textile, graphite equipment and identification stripes. */
          o.material.map=pilotAlbedoSkin;
          o.material.color.setHex(0xffffff);
          o.material.roughness=.66;o.material.metalness=.08;
          if(o.material.emissive){o.material.emissive.setHex(0x101a27);o.material.emissiveIntensity=.08;}
        }else{
          o.material.color.setHex(0x46515b);
          o.material.roughness=.5;o.material.metalness=.22;
        }
      }
      o.material.skinning=!!o.isSkinnedMesh;
      o.material.needsUpdate=true;
    }
  });
  root.scale.setScalar(1.72);
}
var characterLoader=makeGltfLoader();
characterLoader.load('assets/starter-coast-pilot-rig-v1.glb',function(gltf){
  playerAvatar.add(gltf.scene);prepareCharacter(gltf.scene,0x5d83b4);
  playerMixer=new THREE.AnimationMixer(gltf.scene);
  playerActions=characterActions(playerMixer,gltf.animations);
  RIGGED_CHARACTER_READY=!!(playerActions.Idle&&playerActions.Walk&&playerActions.Run);
  playerAvatar.visible=RIGGED_CHARACTER_READY&&!CAPTURE_FLIGHT;
  if(RIGGED_CHARACTER_READY)setCharacterAction('Idle');
  else console.error('Pilot GLB is missing Idle, Walk or Run.');
},undefined,function(err){console.error('Pilot GLB failed to load.',err);});
characterLoader.load('assets/starter-coast-pilot-rig-v1.glb',function(gltf){
  maraAvatar.add(gltf.scene);prepareCharacter(gltf.scene,0x6b3328);
  maraMixer=new THREE.AnimationMixer(gltf.scene);
  maraActions=characterActions(maraMixer,gltf.animations);
  if(maraActions.Idle)maraActions.Idle.play();
  maraAvatar.visible=!!maraActions.Idle&&!CAPTURE_FLIGHT;
},undefined,function(err){console.error('Mara GLB failed to load.',err);});

/* The two display airframes use the same physical, textured model as flight.
   buildPlane initially parents into the match scene; adding it here transfers
   it to this scene without maintaining a divergent showroom-only model. */
var hangarPlanes={};
['blue','red'].forEach(function(tm){
  var g=buildPlane(tm,tm===PILOT.team);
  hangarScene.add(g);
  var b=hangarBays[tm];
  g.position.set(b.x,1.9,b.z);
  g.rotation.set(-0.04,Math.PI,0);
  if(g.userData.beacon)g.userData.beacon.visible=false;
  (g.userData.exhausts||[]).forEach(function(ex){ex.visible=false;});
  /* parked aircraft need something to stand on, or they read as hovering */
  var strut=new THREE.MeshPhongMaterial({map:aviationHardwareSkin,
    color:0x59616a,shininess:20,flatShading:true});
  [[0,-3.4],[-3.2,1.2],[3.2,1.2]].forEach(function(o){
    var leg=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,1.9,6),strut);
    leg.position.set(o[0],-1.0,o[1]); g.add(leg);
    var wheel=new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,.3,10),strut);
    wheel.rotation.z=Math.PI/2; wheel.position.set(o[0],-1.9,o[1]); g.add(wheel);
  });
  hangarPlanes[tm]=g;
});
function paintHangarPlane(){
  var g=hangarPlanes[PILOT.team];
  if(!g)return;
  ['blue','red'].forEach(function(tm){
    var o=hangarPlanes[tm];
    if(!o)return;
    var active=tm===PILOT.team;
    if(o.userData.hull){
      o.userData.hull.map=active?kestrelSkin:o.userData.factionSurface;
      o.userData.hull.color.setHex(active?livery(PILOT.livery).hull:0xe9edf0);
      o.userData.hull.needsUpdate=true;
    }
    if(o.userData.trim){
      o.userData.trim.map=active?kestrelSkin:o.userData.factionSurface;
      o.userData.trim.color.setHex(active?ACCENTS[PILOT.accent]:TEAM_COL[tm]);
      o.userData.trim.needsUpdate=true;
    }
  });
}

/* ---------- walking ---------- */
var walk={x:0,z:26,yaw:0,pitch:0,bob:0,gait:0,face:0,moving:0,run:0};
var hangarNear=null;
var hEl={};['hangarUI','hangarPrompt','hangarTeam','hangarCall',
  'fitCard','fitCall','fitLivery','fitAccent','fitTrim','fitTrimOut','fitBlue','fitRed','fitTempest','fitTeamNote',
  'fitDone','fitLaunch','fitEngine','fitWings','fitArmor','fitPrimary','fitTrade'
  ].forEach(function(id){hEl[id]=document.getElementById(id);});

function hangarForward(){return {x:-Math.sin(walk.yaw),z:-Math.cos(walk.yaw)};}
function nearestBay(){
  var best=null,bd=13;
  ['blue','red'].forEach(function(tm){
    var b=hangarBays[tm],d=Math.hypot(walk.x-b.x,walk.z-b.z);
    if(d<bd){bd=d;best=tm;}
  });
  return best;
}
/* The thumbstick, filled by the hangar touch block further down. Keeping it up
   here means hangarStep never has to know which input device it came from. */
var hWalk={x:0,y:0,active:false};
function hangarStep(dt){
  /* Speeds match a 3.5-unit-tall human. The old first-person values crossed
     several body lengths per step, which no leg animation could visually plant
     against. Touch and keyboard both land in mx/mz so the collision, gait and
     turn-to-face below are one path — a phone used to get an automatic camera
     orbit here, which looked exactly like the pilot walking on their own. */
  var f=hangarForward();
  var rt={x:-f.z,z:f.x};
  var mx=0,mz=0,running=false;
  if(hWalk.active){
    /* stick up is negative y, and up is forward */
    mx=f.x*-hWalk.y+rt.x*hWalk.x;
    mz=f.z*-hWalk.y+rt.z*hWalk.x;
    running=Math.hypot(hWalk.x,hWalk.y)>.82;
  }
  if(keys.KeyW){mx+=f.x;mz+=f.z;}
  if(keys.KeyS){mx-=f.x;mz-=f.z;}
  if(keys.KeyD){mx+=rt.x;mz+=rt.z;}
  if(keys.KeyA){mx-=rt.x;mz-=rt.z;}
  if(keys.ShiftLeft||keys.ShiftRight)running=true;
  var ml=Math.hypot(mx,mz);
  var sp=(running?5.2:2.8)*Math.min(1,ml);
  if(ml>1e-4){
    walk.x+=mx/ml*sp*dt; walk.z+=mz/ml*sp*dt;
    walk.gait+=dt*(running?9.2:6.15);
    walk.bob=walk.gait;
    var desired=Math.atan2(-mx/ml,-mz/ml);
    var da=Math.atan2(Math.sin(desired-walk.face),Math.cos(desired-walk.face));
    walk.face+=da*Math.min(1,dt*12);
  }
  walk.moving+=( (ml>1e-4?1:0)-walk.moving)*Math.min(1,dt*14);
  walk.run+=( (ml>1e-4&&running?1:0)-walk.run)*Math.min(1,dt*10);
  /* walls, then the aircraft themselves, so you cannot stand inside a wing */
  walk.x=clamp(walk.x,-HW+2.4,HW-2.4);
  walk.z=clamp(walk.z,-HD+2.4,HD-3);
  ['blue','red'].forEach(function(tm){
    var b=hangarBays[tm],dx=walk.x-b.x,dz=walk.z-b.z,d=Math.hypot(dx,dz);
    if(d<8.4&&d>1e-3){walk.x=b.x+dx/d*8.4; walk.z=b.z+dz/d*8.4;}
  });
  /* Third-person free roam. `walk` remains the collision body; the camera
     trails it, so aircraft and walls still block the character rather than an
     invisible first-person eye. Clamp the camera as well to keep it indoors. */
  var view=hangarForward(),camBack=4.6;
  var stride=walk.moving*(1+walk.run*.22);
  if(RIGGED_CHARACTER_READY){
    playerAvatar.position.set(walk.x,0,walk.z);
    playerAvatar.rotation.y=walk.face;
    setCharacterAction(walk.moving<.12?'Idle':(walk.run>.45?'Run':'Walk'));
    if(playerActions.Walk)playerActions.Walk.timeScale=.92;
    if(playerActions.Run)playerActions.Run.timeScale=.88;
    if(playerMixer)playerMixer.update(dt);
    var mdx=walk.x-MARA_POS.x,mdz=walk.z-MARA_POS.z;
    maraAvatar.rotation.y=Math.atan2(-mdx,-mdz);
    if(maraMixer)maraMixer.update(dt);
    hangarCam.position.set(
      clamp(walk.x-view.x*camBack,-HW+.8,HW-.8),
      3.35+Math.sin(walk.bob)*.035,
      clamp(walk.z-view.z*camBack,-HD+.8,HD-.8));
  }else{
    hangarCam.position.set(walk.x,1.72+Math.sin(walk.bob)*.035,walk.z);
  }
  hangarCam.rotation.set(walk.pitch,walk.yaw,0,'YXZ');

  /* A phone can walk the floor now, so it gets the same proximity prompts the
     desktop does; the prompt itself is the tap target there. */
  hangarNear=nearestBay();
  var board=Math.hypot(walk.x-BOARD_POS.x,walk.z-BOARD_POS.z)<11;
  var mara=RIGGED_CHARACTER_READY&&
    Math.hypot(walk.x-MARA_POS.x,walk.z-MARA_POS.z)<5.5;
  var K=IS_TOUCH?'TAP  ':'[E]  ';
  var msg='';
  if(hangarNear)msg=K+(hangarNear===PILOT.team&&PILOT.signed?'FIT OUT KESTREL — ':'JOIN ')+
    factionName(hangarNear)+(hangarNear===PILOT.team&&PILOT.signed?' TRIAL FLIGHT':' FOR THIS TRIAL');
  else if(mara)msg=K+'TALK TO MARA "SWITCH" VOSS';
  else if(board){
    var nx=nextPlayableMission();
    msg=nx?(K+(SAVE.completed.length?'CONTINUE — ':'BEGIN — ')+MISSIONS[nx].title)
          :(K+'FLY A FREE CORE RUN');
  }
  hEl.hangarPrompt.textContent=msg;
  hEl.hangarPrompt.classList.toggle('on',!!msg);
}
function hangarInteract(){
  if(hangarNear){
    if(!PILOT.signed||PILOT.team!==hangarNear){
      setFaction(hangarNear==='blue'?'vanguard':'inferno');
      savePilot(); syncFit(); paintHangarPlane(); updateSignPanel();
      toast('TRIAL ASSIGNMENT — '+factionName(hangarNear),2.2);
    }
    openFit();
    return;
  }
  if(RIGGED_CHARACTER_READY&&Math.hypot(walk.x-MARA_POS.x,walk.z-MARA_POS.z)<5.5){
    toast('SWITCH: YOUR KESTREL IS READY. LET’S SEE WHAT YOU CAN DO.',3.4);
    startCampaign();
    return;
  }
  if(Math.hypot(walk.x-BOARD_POS.x,walk.z-BOARD_POS.z)<11){
    /* The board is the campaign, so it opens the campaign. Walking up to it
       and being thrown straight into whatever mission was next gave the player
       no way to see the six chapters they were in the middle of. */
    if(nextPlayableMission())openMissions(); else startCampaign();
  }
}
function updateSignPanel(){
  /* A Tempest pilot launches with the west flight, so naming the arena colour
     here printed VANGUARD over their own callsign. */
  hEl.hangarTeam.textContent=PILOT.signed?factionName(factionKey()):'INDEPENDENT';
  hEl.hangarTeam.className=PILOT.signed?(PILOT.faction==='tempest'?'tempest':PILOT.team):'';
  hEl.hangarCall.textContent=PILOT.signed?PILOT.callsign:'';
  /* mission progress only moves while you are out flying, so refreshing the
     touch label whenever the hangar re-renders its sign is enough */
  var go=document.getElementById('hGo');
  /* enterHangar() runs before the save block is initialized. Treat that first
     paint as a clean profile; updateSignPanel() is called again after progress
     changes, once SAVE exists. */
  var saved=(typeof SAVE!=='undefined'&&SAVE&&SAVE.completed)?SAVE:null;
  var nx=saved?nextPlayableMission():null;
  if(go)go.textContent=!saved?'BEGIN':(nx?(saved.completed.length?'CONTINUE':'BEGIN'):'FREE RUN');
  var fit=document.getElementById('hFit');
  if(fit)fit.textContent=PILOT.signed?'FIT OUT':'PICK FLIGHT';
  var chp=document.getElementById('hangarChapter');
  if(chp&&saved){
    var ch=CHAPTERS[clamp(saved.chapter,1,CHAPTERS.length)-1];
    chp.textContent=nx?('CHAPTER '+saved.chapter+' — '+ch.name+'  ·  '+MISSIONS[nx].title)
                      :'CAMPAIGN COMPLETE — THE ARENA IS OPEN';
  }
}
/* ---------- hangar UI ----------
   Walking up to a bay and pressing [E] is a discovery, not a control scheme,
   and a phone has neither the walk nor the key. Every route out of the hangar
   — fit out, the campaign list, settings, launch — is a button on the bar now,
   on every device. Walking to a bay still works and still does the same thing;
   it is no longer the only way. */
(function hangarUI(){
  /* The fit-out card carries the flight choice itself, so an unsigned pilot
     picks a side in there rather than needing a bay to walk up to. */
  bindBtn('hFit',function(){openFit();});
  bindBtn('hGo',function(){startCampaign();});
  bindBtn('hMissions',function(){openMissions();});
  bindBtn('hSet',function(){setOpen(true);});

  /* Walk stick (left) and look drag (right). Both place their origin wherever
     the thumb lands rather than at a fixed spot, so neither has to be hunted
     for on a landscape phone. */
  var zone=document.getElementById('hStickZone'),
      base=document.getElementById('hStickBase'),
      knob=document.getElementById('hStickKnob'),
      look=document.getElementById('hLookZone');
  if(zone&&base&&knob){
    var R=54,sid=null,ox=0,oy=0;
    zone.addEventListener('pointerdown',function(e){
      if(sid!==null)return;
      e.preventDefault();
      sid=e.pointerId; ox=e.clientX; oy=e.clientY;
      hWalk.active=true; hWalk.x=0; hWalk.y=0;
      base.style.left=e.clientX+'px'; base.style.top=e.clientY+'px';
      base.classList.add('on'); knob.style.transform='translate(0px,0px)';
      try{zone.setPointerCapture(e.pointerId);}catch(err){}
    });
    zone.addEventListener('pointermove',function(e){
      if(e.pointerId!==sid)return;
      e.preventDefault();
      var dx=e.clientX-ox,dy=e.clientY-oy,r=Math.hypot(dx,dy);
      if(r>R){dx*=R/r;dy*=R/r;}
      hWalk.x=dx/R; hWalk.y=dy/R;
      knob.style.transform='translate('+dx.toFixed(1)+'px,'+dy.toFixed(1)+'px)';
    });
    var sup=function(e){
      if(e.pointerId!==sid)return;
      sid=null; hWalk.active=false; hWalk.x=0; hWalk.y=0;
      base.classList.remove('on'); knob.style.transform='translate(0px,0px)';
    };
    zone.addEventListener('pointerup',sup);
    zone.addEventListener('pointercancel',sup);
  }
  if(look){
    var lid=null,lx=0,ly=0;
    look.addEventListener('pointerdown',function(e){
      if(lid!==null)return;
      e.preventDefault();
      lid=e.pointerId; lx=e.clientX; ly=e.clientY;
      try{look.setPointerCapture(e.pointerId);}catch(err){}
    });
    look.addEventListener('pointermove',function(e){
      if(e.pointerId!==lid)return;
      e.preventDefault();
      /* the same sensitivity slider the mouse look uses, so one setting covers
         both devices */
      var s=clamp(cfg.sens,20,120)/16000;
      walk.yaw-=(e.clientX-lx)*s*2.6;
      walk.pitch=clamp(walk.pitch-(e.clientY-ly)*s*2.6,-1.05,1.05);
      lx=e.clientX; ly=e.clientY;
    });
    var lup=function(e){ if(e.pointerId===lid)lid=null; };
    look.addEventListener('pointerup',lup);
    look.addEventListener('pointercancel',lup);
  }

  /* [E] has no key on a phone, so the prompt doubles as the interact button */
  bindBtn('hangarPrompt',function(){ if(IS_TOUCH)hangarInteract(); });
})();

/* ---------- fit out panel ---------- */
function openFit(){hEl.fitCard.classList.add('on'); if(document.exitPointerLock)document.exitPointerLock();}
function closeFit(){hEl.fitCard.classList.remove('on');}
LIVERIES.forEach(function(lv){
  var b=document.createElement('button');
  b.className='seg'; b.dataset.livery=lv.id; b.textContent=lv.name;
  bindBtn(b,function(){PILOT.livery=lv.id;commitFit();});
  hEl.fitLivery.appendChild(b);
});
ACCENTS.forEach(function(col,i){
  var b=document.createElement('button');
  b.className='swatch'; b.dataset.accent=i;
  b.style.background='#'+('00000'+col.toString(16)).slice(-6);
  bindBtn(b,function(){PILOT.accent=i;commitFit();});
  hEl.fitAccent.appendChild(b);
});
function syncFit(){
  var fk=PILOT.faction;
  hEl.fitBlue.classList.toggle('on',fk==='vanguard');
  hEl.fitTempest.classList.toggle('on',fk==='tempest');
  hEl.fitRed.classList.toggle('on',fk==='inferno');
  if(hEl.fitTeamNote)hEl.fitTeamNote.textContent=
    !fk?'Pick who you fly for. It sets your aircraft, your ability and who talks to you.'
    :fk==='tempest'
      ? 'TEMPEST — Velocity Burst. Tempest field no Arena card of their own, so '+
        'you launch with the west flight in league matches.'
      :(fk==='vanguard'
        ? 'VANGUARD — Guardian Field. You launch with the west flight.'
        : 'INFERNO — Weapons Overdrive. You launch with the east flight.');
  if(document.activeElement!==hEl.fitCall)hEl.fitCall.value=PILOT.callsign;
  [].forEach.call(hEl.fitLivery.children,function(b){
    b.classList.toggle('on',b.dataset.livery===PILOT.livery);});
  [].forEach.call(hEl.fitAccent.children,function(b){
    b.classList.toggle('on',+b.dataset.accent===PILOT.accent);});
  hEl.fitTrim.value=PILOT.trim;
  hEl.fitTrimOut.textContent=PILOT.trim===0?'EVEN':
    (PILOT.trim>0?'+'+Math.round(PILOT.trim*10)+' SPEED':Math.round(-PILOT.trim*10)+' TURN');
  syncSlots();
}
/* ---------- loadout slots (STORY-BIBLE 13.2) ---------- */
var SLOT_EL={engine:'fitEngine',wings:'fitWings',armor:'fitArmor',primary:'fitPrimary'};
function buildSlots(){
  Object.keys(SLOT_EL).forEach(function(slot){
    var host=hEl[SLOT_EL[slot]];
    if(!host)return;
    host.innerHTML='';
    PARTS[slot].forEach(function(pt){
      var b=document.createElement('button');
      b.className='seg'; b.dataset.pid=pt.id; b.textContent=pt.name.split(' ')[0];
      b.title=pt.name;
      bindBtn(b,function(){
        SAVE.loadout[slot]=pt.id; saveGame(); applyLoadout(); syncFit();
      });
      host.appendChild(b);
    });
  });
}
/* Section 13.3: the hangar must show the trade, not just the benefit. */
function syncSlots(){
  /* enterHangar() runs during module load, before the campaign block below has
     initialised SAVE. Nothing to sync yet, and reading it here would throw. */
  if(typeof SAVE==='undefined'||!SAVE)return;
  Object.keys(SLOT_EL).forEach(function(slot){
    var host=hEl[SLOT_EL[slot]];
    if(!host)return;
    [].forEach.call(host.children,function(b){
      b.classList.toggle('on',b.dataset.pid===SAVE.loadout[slot]);});
  });
  if(!hEl.fitTrade||!player)return;
  applyLoadout();
  var pct=function(v){return (v>=1?'+':'')+Math.round((v-1)*100)+'%';};
  hEl.fitTrade.textContent=
    'THRUST '+pct(player.trimThrust)+'  ·  AGILITY '+pct(player.trimAgile)+
    '  ·  ARMOR '+pct(player.armorMul)+'  ·  GUN '+pct(player.gunDmg)+
    ' at '+pct(player.gunRate)+' rate';
}
/* One place where a change becomes real: the profile, the parked airframe, the
   aircraft you will actually fly, and the disk. */
function commitFit(){
  PILOT.signed=true;
  savePilot(); syncFit(); paintHangarPlane(); updateSignPanel(); rebuildTeams();
}
bindBtn(hEl.fitBlue,function(){setFaction('vanguard');commitFit();});
bindBtn(hEl.fitTempest,function(){setFaction('tempest');commitFit();});
bindBtn(hEl.fitRed,function(){setFaction('inferno');commitFit();});
hEl.fitCall.addEventListener('input',function(){
  PILOT.callsign=(hEl.fitCall.value||'').toUpperCase().replace(/[^A-Z0-9 \-]/g,'').slice(0,10)||'YOU';
  savePilot(); applyPilot(); updateSignPanel();
});
hEl.fitTrim.addEventListener('input',function(){PILOT.trim=+hEl.fitTrim.value;commitFit();});
bindBtn(hEl.fitDone,closeFit);
bindBtn(hEl.fitLaunch,function(){closeFit();leaveHangar();});

/* Switching sides means the player changes team, so the eight aircraft have to
   be rebuilt around the new allegiance rather than patched in place. */
function rebuildTeams(){
  if(player.team===PILOT.team){applyPilot();return;}
  for(var i=0;i<fighters.length;i++)scene.remove(fighters[i].mesh);
  fighters.length=0;
  claimLeadName();
  player=makeFighter(PILOT.team,0,true);
  for(var qi=1;qi<4;qi++)makeFighter(PILOT.team,qi,false);
  for(var qj=0;qj<4;qj++)makeFighter(foeOf(PILOT.team),qj,false);
  applyPilot();
}

function enterHangar(){
  if(typeof worldFlow!=='undefined')worldFlow.active=false;
  st.phase='hangar';
  document.body.classList.add('hangar');
  walk.x=0; walk.z=26; walk.yaw=0; walk.pitch=0;
  syncFit(); paintHangarPlane(); updateSignPanel(); applyPilot();
}
function leaveHangar(){
  st.phase='brief';
  if(typeof salvage!=='undefined'){salvage.on=false;salvage.landed=false;}
  document.body.classList.remove('ground');
  document.body.classList.remove('hangar');
  /* hangarStep owns this class and stops running here, so it has to be dropped
     on the way out rather than left in whatever state the last frame saw */
  if(hEl.hangarPrompt)hEl.hangarPrompt.classList.remove('on');
  hWalk.active=false; hWalk.x=0; hWalk.y=0;
  if(document.exitPointerLock)document.exitPointerLock();
  /* Missions 7 and 8 are fought on foot. Walking out of the hangar during one
     puts the player straight back in the air rather than at the brief card. */
  if(mission.running){
    st.started=true;
    el.brief.classList.add('gone'); el.hud.classList.add('live');
    document.body.classList.add('playing');
    audioInit(); audioResume(); applyLoadout();
    if(!IS_TOUCH)lock();
  }
}
enterHangar();

/* Opt-in runtime inspection for automated visual approval. It is absent in
   normal play and exposes no mutation path unless the explicit capture query
   is present. */
if(new URLSearchParams(location.search).has('capture')){
  Object.defineProperty(window,'__AIRBOURNE_CAPTURE__',{value:{
    renderer:renderer,scene:scene,camera:camera,st:st,hangarPlanes:hangarPlanes,
    getPlayer:function(){return player;},
    getWorld:function(){return authoredWorld;},
    getPhase:function(){return st.phase;},
    getWalk:function(){return {x:walk.x,z:walk.z,yaw:walk.yaw,pitch:walk.pitch};},
    getBulletCount:function(){return bullets.length;},
    getPad:function(){return {on:pad.on,index:pad.index,id:pad.id};},
    setEnvironment:function(hours,key){
      st.hours=((hours%24)+24)%24;
      if(WX[key]){
        wxKey=key;wxTimer=400;
        for(var weatherKey in wx)wx[weatherKey]=WX[key][weatherKey];
      }
      env(.016);
    },
    tickController:function(dt){
      padTick(dt);
      if(st.phase==='hangar')hangarStep(dt);
      else if(st.started&&!st.paused)playerControl(dt);
    },
    getStoryTemplateCount:function(){return Object.keys(storyTemplates||{}).length;},
    /* startMission is declared further down the file, so this object literal —
       which is built at load time — would capture `undefined` if the reference
       were direct. Reading the name inside a wrapper defers the lookup to call
       time. That also makes this the one place in the file whose behaviour
       depends on declaration order rather than on hoisting, which matters
       because src/ is assembled in manifest order. */
    leaveHangar:leaveHangar,launch:launch,
    startOpenWorld:function(){return startOpenWorld();},
    getSkyBases:function(){return skyBaseHosts;},
    getWorldFlow:function(){return worldFlow;},
    getWorldDistricts:function(){return WORLD_DISTRICTS;},
    getAuthoredDistrictReady:function(){return authoredDistrictReady;},
    tickWorldFlow:function(dt){stepWorldFlow(dt);stepWorldDistricts(dt);},
    enterGround:function(){return enterGroundMode();},
    leaveGround:function(){return leaveGroundMode();},
    tickGround:function(dt){return groundControl(dt);},
    getSalvage:function(){return salvage;},
    placeGroundReview:function(kind){
      startOpenWorld();worldFlow.activity=kind||'groundwar';
      /* Flat approach south of Civic Collapse: the review camera faces the
         authored district instead of spawning beneath the central road mesh. */
      var x=80,z=1100,y=ground(x,z);
      player.pos.set(x,y+3.2,z);player.vel.set(0,0,0);player.speed=0;player.throttle=0;
      salvage.landed=true;salvage.surface='ground';enterGroundMode();
      salvage.yaw=Math.PI;stepWorldDistricts(.016);groundControl(.016);
      return {x:x,y:y,z:z};
    },
    getGroundEnemies:function(){return groundCombat.enemies;},
    startMission:function(id){return startMission(id);},
    /* The net layer is declared in parts below this one, so every accessor here
       is a wrapper: reading the name inside the function defers the lookup to
       call time, exactly as startMission above does. Read-only — the socket is
       opened through the lobby like any player would. */
    getNet:function(){
      return {status:net.status,on:net.on,room:net.room,slot:net.slot,
        hostSlot:net.hostSlot,isHost:net.isHost,ai:net.ai.slice(),
        roster:JSON.parse(JSON.stringify(net.roster))};
    },
    getNetOwnership:function(){
      var out=[];
      for(var i=0;i<fighters.length;i++){
        var f=fighters[i];
        out.push({slot:netSlotForFighter(f),name:f.name,
          owned:netOwns(f),remote:netIsRemote(f),isPlayer:!!f.isPlayer});
      }
      return {fighters:out,core:netOwnsCore(),ownerless:netOwnsEntity(null)};
    },
    netCodecRoundTrip:function(sample){
      var buffer=netEncodeState(NET_KIND_STATE,sample.time,sample.aircraft,sample.core||null);
      return netDecodeState(buffer);
    },
    settleFlightCamera:function(){
      camera.position.copy(player.pos);
      camLookReady=false;
      camWork(1);
    }
  }});
}

addEventListener('keydown',function(e){
  if(st.phase!=='hangar')return;
  if(hEl.fitCard.classList.contains('on')){
    if(e.code==='Escape'){closeFit();e.preventDefault();}
    return;
  }
  if(e.code==='KeyE'){hangarInteract();e.preventDefault();}
  if(e.code==='KeyF'){openFit();e.preventDefault();}
  if(e.code==='Enter'){leaveHangar();e.preventDefault();}
});
