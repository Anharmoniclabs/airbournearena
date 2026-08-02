/* ===================== 4v4 CQC decks =====================
   Four close-quarters arenas fought on foot, using the same arsenal as the
   ground war (34d) and the same walk/look controls as the salvage run (34a).
   Three hang beside their faction's ozone base so they inherit an established,
   lit, reachable position in the world; the bunker is cut into the island
   plateau because an underground CQB map floating at 15 km reads as a mistake.

   Deck height is a measured constant, not a raycast, and that is not laziness.
   The shipped decks are packed by gltfpack, which quantizes positions to
   normalized shorts and moves the scale onto the node. three.js r128 draws that
   correctly because the GPU denormalizes the attribute — but Mesh.raycast reads
   it raw, computes in ±32767 space, and a downward ray never hits anything. So
   the floor and the walkable half-extent of each deck are measured off the
   unpacked source by audit_generated_deck.py in the Blender source folder, and
   recorded below. Re-run it whenever a deck is regenerated.

   The cost is that cover is walked around rather than climbed. That is the
   right trade here: the audit shows each of these four decks is one dominant
   floor carrying most of its walkable area. arenaDeckAt() is what 18a's
   worldSurfaceAt() consults once a match is up, so everything that already asks
   the world how high the ground is keeps working unchanged.

   Bots load the rigged pilot one GLB at a time rather than cloning it. That is
   not a preference: THREE.Object3D.clone does not rebind a skinned mesh to a
   new skeleton, so a cloned pilot animates from whichever instance loaded
   first. 34-hangar-characters.js already loads it twice for the same reason.
   The bytes come from the HTTP cache after the first, so this costs parse time
   at match start, not bandwidth. */
/* deck and reach are audit output, held back about an eighth from the measured
   edge so the player stands on the deck rather than on its lip. */
var CQC_MAPS=[
  {id:'vanguard',name:'VANGUARD SKY',asset:'assets/cqc-vanguard-sky-v1.glb',
   blurb:'Floating platform, defensive cover shields and a command terminal.',
   anchor:'vanguard',deck:70,reach:80},
  {id:'tempest',name:'TEMPEST STORM',asset:'assets/cqc-tempest-storm-v1.glb',
   blurb:'Rain-slicked facility deck, wind turbines and industrial ducting.',
   anchor:'tempest',deck:6,reach:70},
  {id:'inferno',name:'INFERNO VOLCANIC',asset:'assets/cqc-inferno-volcanic-v1.glb',
   blurb:'Volcanic fortress, molten vents and heavy tactical cover.',
   anchor:'inferno',deck:8,reach:57},
  {id:'bunker',name:'CQB BUNKER',asset:'assets/cqc-bunker-cqb-v1.glb',
   blurb:'Underground concrete works, modular barricades and tight sightlines.',
   anchor:'island',deck:0,reach:26}
];
var arenaMatch={active:false,map:null,mesh:null,origin:new THREE.Vector3(),
                bots:[],score:{blue:0,red:0},target:25,loading:false,over:false,
                respawn:0,ready:0};
var CQC_TARGET=25,CQC_RESPAWN=5;

function cqcOrigin(map){
  if(map.anchor==='island'){
    /* The engineered plateau at 1900,-1400 is already flat in both the runtime
       terrain and the Blender source, so the bunker sits level on it. */
    return new THREE.Vector3(1900,ground(1900,-1400),-1400);
  }
  return SKYBASE_POS[map.anchor].clone().add(new THREE.Vector3(880,-40,0));
}
/* ---------- deck surface ----------
   Null when no match is up, which is what tells worldSurfaceAt to fall through
   to the sky-base decks and then to the island. It has to answer safely before
   this part has run at all, because the parts that call it are assembled
   above this one. */
function arenaDeckAt(x,z){
  if(typeof arenaMatch==='undefined'||!arenaMatch||!arenaMatch.active)return null;
  return arenaMatch.origin.y+arenaMatch.map.deck;
}
/* ---------- combatants ---------- */
function cqcSpawnPoint(team,i){
  var map=arenaMatch.map,a=(team==='blue'?Math.PI:0)+(i-1.5)*.42,r=map.reach*.74;
  return {x:arenaMatch.origin.x+Math.cos(a)*r,z:arenaMatch.origin.z+Math.sin(a)*r};
}
function makeArenaBot(index,team){
  var bot={index:index,team:team,alive:false,hp:100,x:0,z:0,y:0,
           radius:1.5,height:2.4,cd:.8+index*.17,stun:0,down:0,
           mesh:new THREE.Group(),mixer:null,actions:{},action:'',face:0,ready:false};
  bot.mesh.visible=false;scene.add(bot.mesh);
  bot.onKill=function(){
    var scorer=team==='blue'?'red':'blue';
    arenaMatch.score[scorer]++;bot.down=CQC_RESPAWN;
    if(team!=='blue'){
      feed('<span style="color:#7fe0b0">HOSTILE DOWN · '+arenaMatch.score.blue+'</span>');
      tone(560,.1,.06,'triangle',340);
    }
    checkArenaMatchOver();
  };
  characterLoader.load('assets/starter-coast-pilot-rig-v1.glb',function(gltf){
    bot.mesh.add(gltf.scene);
    prepareCharacter(gltf.scene,0);
    /* prepareCharacter paints the authored albedo on, so team read has to come
       from a tint over it rather than a flat colour that would erase the art. */
    gltf.scene.traverse(function(o){
      if(!o.isMesh||!o.material||!o.material.color)return;
      if((o.material.name||'').indexOf('Visor')>=0)return;
      o.material=o.material.clone();
      o.material.color.setHex(team==='blue'?0x9fc4ef:0xf0a08c);
      o.material.needsUpdate=true;
    });
    bot.mixer=new THREE.AnimationMixer(gltf.scene);
    bot.actions=characterActions(bot.mixer,gltf.animations);
    bot.ready=true;arenaMatch.ready++;
  },undefined,function(err){console.error('Arena bot failed to load.',err);});
  return bot;
}
/* Seven rigged pilots are the slowest part of getting onto a deck, and they are
   the same seven whichever deck is chosen. Building them when the map list
   opens spends that time while the player is reading the four descriptions
   instead of after they have committed. Idempotent — the second call is free,
   which is what makes it safe to call from both places. */
function ensureArenaBots(){
  if(arenaMatch.bots.length)return;
  var per=LOW?3:4;
  for(var b=0;b<per;b++)arenaMatch.bots.push(makeArenaBot(b,'red'));
  for(var a=0;a<per-1;a++)arenaMatch.bots.push(makeArenaBot(a,'blue'));
}
function setBotAction(bot,name){
  if(!bot.actions[name]||bot.action===name)return;
  if(bot.actions[bot.action])bot.actions[bot.action].fadeOut(.16);
  bot.actions[name].reset().fadeIn(.16).play();bot.action=name;
}
function reviveBot(bot){
  var spot=cqcSpawnPoint(bot.team,bot.index%4);
  bot.x=spot.x;bot.z=spot.z;bot.hp=100;bot.alive=true;bot.stun=0;bot.down=0;
  bot.mesh.visible=true;
}
/* ---------- match ---------- */
function startArenaMatch(id){
  var map=null;
  for(var i=0;i<CQC_MAPS.length;i++)if(CQC_MAPS[i].id===id)map=CQC_MAPS[i];
  if(!map||arenaMatch.loading)return;
  closeArenaMaps();
  if(typeof abandonMission==='function')abandonMission();
  endGroundEncounter();
  arenaMatch.loading=true;arenaMatch.map=map;arenaMatch.origin.copy(cqcOrigin(map));
  arenaMatch.score.blue=0;arenaMatch.score.red=0;arenaMatch.over=false;
  arenaMatch.respawn=0;arenaMatch.ready=0;
  /* Held until the deck arrives rather than timed out after a couple of
     seconds: on a cold cache this is a multi-second wait, and a blank hangar
     with no explanation reads as a hang. Both the success and the failure
     banner below replace it. */
  banner('DEPLOYING · '+map.name,60);

  loadGeneratedArt(map.asset,function(deck){
    deck.position.copy(arenaMatch.origin);
    scene.add(deck);arenaMatch.mesh=deck;
    arenaMatch.loading=false;arenaMatch.active=true;
    st.mode='cqc';st.phase='ground';st.started=true;st.over=false;
    worldFlow.active=false;parkArena(true);
    document.body.classList.add('playing','ground');
    el.brief.classList.add('gone');el.hud.classList.add('live');

    /* The player is put on the deck directly rather than through
       enterGroundMode(), which requires a landed aircraft — there is no
       aircraft on a CQC deck, and the parked one must stay where it is. */
    salvage.on=true;salvage.landed=false;salvage.surface='cqc';
    var spot=cqcSpawnPoint('blue',0);
    salvage.x=spot.x;salvage.z=spot.z;salvage.yaw=0;salvage.lookPitch=0;
    salvage.shield=50;player.hp=player.maxHp=100;player.alive=true;
    groundAvatar.visible=!!groundActions.Idle;
    camLookReady=false;
    if(!IS_TOUCH)lock();
    audioInit();audioResume();
    emit('match_start',{mode:'cqc',map:map.id});
    banner(map.name+' · FIRST TO '+CQC_TARGET+' · 1-5 WEAPONS · B GRENADE',3.4);
  },function(){
    /* Without this the mode is stuck: loading stays true, so every later
       attempt returns early and the deck can never be entered again. */
    arenaMatch.loading=false;arenaMatch.map=null;
    banner('DECK UNAVAILABLE · '+map.name+' FAILED TO LOAD',3);
  });

  ensureArenaBots();
  for(var r=0;r<arenaMatch.bots.length;r++)reviveBot(arenaMatch.bots[r]);
}
function endArenaMatch(won){
  if(!arenaMatch.active)return;
  arenaMatch.active=false;arenaMatch.over=true;
  if(arenaMatch.mesh){scene.remove(arenaMatch.mesh);arenaMatch.mesh=null;}
  for(var i=0;i<arenaMatch.bots.length;i++){
    arenaMatch.bots[i].alive=false;arenaMatch.bots[i].mesh.visible=false;
  }
  salvage.on=false;salvage.surface=null;groundAvatar.visible=false;
  document.body.classList.remove('ground');
  armsHolster();
  st.mode='arena';st.phase='flight';
  banner(won?'DECK SECURED · '+arenaMatch.score.blue+' — '+arenaMatch.score.red
            :'DECK LOST · '+arenaMatch.score.blue+' — '+arenaMatch.score.red,4);
  emit('match_end',{mode:'cqc',won:!!won});
  enterHangar();
}
/* Walking out is not a loss. The deck is a drop-in mode reached from the hangar
   bar, so leaving it reports the score as it stands rather than a defeat. */
function leaveArenaDeck(){
  if(!arenaMatch.active)return;
  endArenaMatch(arenaMatch.score.blue>=arenaMatch.score.red);
}
function checkArenaMatchOver(){
  if(arenaMatch.score.blue>=CQC_TARGET)endArenaMatch(true);
  else if(arenaMatch.score.red>=CQC_TARGET)endArenaMatch(false);
}
function stepArenaMatch(dt){
  if(!arenaMatch.active)return;
  var deck=arenaMatch.origin.y+arenaMatch.map.deck;
  for(var i=0;i<arenaMatch.bots.length;i++){
    var bot=arenaMatch.bots[i];
    if(bot.mixer)bot.mixer.update(dt);
    if(!bot.alive){
      if(bot.down>0&&(bot.down-=dt)<=0)reviveBot(bot);
      continue;
    }
    if(bot.stun>0){bot.stun-=dt;setBotAction(bot,'Idle');bot.mesh.position.set(bot.x,deck,bot.z);continue;}
    /* Nearest enemy, with the player standing in as a blue combatant. */
    var tx=0,tz=0,best=1e9,found=false;
    if(bot.team==='red'){tx=salvage.x;tz=salvage.z;best=Math.hypot(tx-bot.x,tz-bot.z);found=true;}
    for(var o=0;o<arenaMatch.bots.length;o++){
      var other=arenaMatch.bots[o];
      if(!other.alive||other.team===bot.team)continue;
      var d=Math.hypot(other.x-bot.x,other.z-bot.z);
      if(d<best){best=d;tx=other.x;tz=other.z;found=true;}
    }
    if(!found){setBotAction(bot,'Idle');continue;}
    var dx=tx-bot.x,dz=tz-bot.z,dist=Math.max(.01,Math.hypot(dx,dz));
    /* Close to a working range, then hold and shoot. Walking into contact is
       what makes them readable; charging to zero makes them a melee blob. */
    var want=22,move=dist>want?1:(dist<12?-1:0);
    if(move){
      var speed=(dist>46?7.2:4.6)*move;
      bot.x+=dx/dist*speed*dt;bot.z+=dz/dist*speed*dt;
      var reach=arenaMatch.map.reach;
      bot.x=clamp(bot.x,arenaMatch.origin.x-reach,arenaMatch.origin.x+reach);
      bot.z=clamp(bot.z,arenaMatch.origin.z-reach,arenaMatch.origin.z+reach);
      setBotAction(bot,dist>46?'Run':'Walk');
    }else setBotAction(bot,'Idle');
    bot.y=deck;
    bot.face=Math.atan2(dx,dz);
    bot.mesh.position.set(bot.x,deck,bot.z);bot.mesh.rotation.y=bot.face;
    bot.cd-=dt;
    if(bot.cd>0||dist>90)continue;
    bot.cd=.75+hash(i,Math.floor(arenaMatch.score.red))*.85;
    if(bot.team==='red'){
      /* Bots shoot the player; allied bots trade with the red side. */
      if(dist<62)damageGroundPlayer(dist<24?11:7);
    }else{
      for(var e=0;e<arenaMatch.bots.length;e++){
        var foe=arenaMatch.bots[e];
        if(!foe.alive||foe.team==='blue')continue;
        if(Math.hypot(foe.x-bot.x,foe.z-bot.z)<62){arenaHitTarget(foe,26);break;}
      }
    }
  }
  if(player.hp<=0&&arenaMatch.respawn<=0){
    arenaMatch.respawn=CQC_RESPAWN;arenaMatch.score.red++;
    banner('YOU ARE DOWN · RESPAWNING',2);checkArenaMatchOver();
  }
  if(arenaMatch.respawn>0&&(arenaMatch.respawn-=dt)<=0){
    var spot=cqcSpawnPoint('blue',0);
    salvage.x=spot.x;salvage.z=spot.z;player.hp=player.maxHp;salvage.shield=50;
  }
  updateSalvageHud('DECK '+arenaMatch.map.name+' · '+arenaMatch.score.blue+' — '+
    arenaMatch.score.red+' TO '+CQC_TARGET+(arenaMatch.respawn>0?
    ' · RESPAWN '+Math.ceil(arenaMatch.respawn):' · [H] LEAVE DECK'));
}
/* ---------- map select ---------- */
function openArenaMaps(){
  var card=document.getElementById('cqcCard');if(!card)return;
  ensureArenaBots();
  var list=document.getElementById('cqcGrid');
  if(list&&!list.childElementCount){
    CQC_MAPS.forEach(function(map){
      var b=document.createElement('button');
      b.className='actionBtn';
      b.innerHTML='<b></b><span></span>';
      b.querySelector('b').textContent=map.name;
      b.querySelector('span').textContent=map.blurb;
      bindBtn(b,function(){startArenaMatch(map.id);});
      list.appendChild(b);
    });
  }
  card.classList.add('on');
  if(document.exitPointerLock)document.exitPointerLock();
}
function closeArenaMaps(){
  var card=document.getElementById('cqcCard');if(card)card.classList.remove('on');
}
bindBtn('cqcClose',function(){
  closeArenaMaps();
  if(!IS_TOUCH&&st.started&&!st.paused&&st.phase!=='hangar')lock();
});
