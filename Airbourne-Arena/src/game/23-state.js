/* ===================== state ===================== */
var st={scoreB:0,scoreR:0,time:MATCH_TIME,over:false,hours:9.4,timeSpeed:1,
  camMode:0,flash:0,hitmark:0,dmgFlash:0,mapBig:false,invertY:cfg.invert?-1:1,
  started:false,locked:false,mouseSeen:false,padSeen:false,paused:false,ringWarned:false,
  /* 'arena' is a free Core Run; 'campaign' hands pacing to the mission runtime */
  phase:'hangar',mode:'arena'};
var keys={},mouseDown=false,mouseRight=false;
var WORLD_UP=new THREE.Vector3(0,1,0);
var tmpV=new THREE.Vector3(),tmpV2=new THREE.Vector3(),tmpV3=new THREE.Vector3();
var sortie={startedAt:0,kills:0,deaths:0,shots:0,hits:0,grabs:0,passes:0,scores:0,
  stalls:0,events:[],stalling:false};
function emit(type,data){
  var e={type:type,t:+((performance.now()-(sortie.startedAt||performance.now()))/1000).toFixed(2)};
  if(data)for(var k in data)e[k]=data[k];
  sortie.events.push(e);
  if(sortie.events.length>180)sortie.events.shift();
  try{localStorage.setItem('airbourne:lastSortie',JSON.stringify({stats:sortie,score:[st.scoreB,st.scoreR]}));}catch(err){}
}

/* mouse-aim reticle, in normalised screen space */
var aim={x:0,y:0}, AIM_R=0.55;
/* how long the current turn input has been held, and which way — reversing the
   turn restarts the ramp so a reversal is as crisp as the first input */
var turnHold=0, turnDir=0;
/* Gain scales with the field of view. Zooming without this makes the reticle
   travel the same angle over a third of the screen, which is the classic
   "zoom makes it worse" feel; tying the two together is what makes a zoomed
   pass steady. */
function zoomGain(){return typeof zoom!=='undefined'?(1-zoom.k*0.62):1;}
function mouseSens(){return (cfg.sens/100000)*zoomGain();}
var aimDir=new THREE.Vector3(0,0,-1);

/* The side you signed with is yours; the other one flies against you. */
claimLeadName();
player=makeFighter(PILOT.team,0,true);
for(var qi=1;qi<4;qi++)makeFighter(PILOT.team,qi,false);
for(var qj=0;qj<4;qj++)makeFighter(foeOf(PILOT.team),qj,false);

/* Paint and trim only ever touch the player's own airframe. Trim is a small
   trade — a tenth either way — so a livery choice never becomes the reason a
   match was won. */
function applyPilot(){
  claimLeadName();
  player.name=PILOT.callsign;
  var ud=player.mesh.userData;
  if(ud.hull)ud.hull.color.setHex(livery(PILOT.livery).hull);
  if(ud.trim)ud.trim.color.setHex(ACCENTS[PILOT.accent]);
  player.trimThrust=1+PILOT.trim*0.10;
  player.trimAgile=1-PILOT.trim*0.10;
  renderRoster();
}

/* ===================== damage ===================== */
function feed(msg){
  var d=document.createElement('div'); d.innerHTML=msg;
  var e=document.getElementById('feed'); e.appendChild(d);
  while(e.children.length>5)e.removeChild(e.firstChild);
  setTimeout(function(){if(d.parentNode)d.parentNode.removeChild(d);},6000);
}
function tag(f){return '<span style="color:'+teamHex(f.team)+'">'+f.name+'</span>';}
/* Which system a round takes out is decided at the moment of the hit rather
   than tracked through separate hitboxes — the cheap way to buy a fight that
   degrades instead of one that just counts down. Each failure comes in two
   stages, so a long burst is worse than a glancing one. */
function systemHit(f,by){
  var engine=Math.random()<0.5;
  if(engine){
    if(f.dmgEng>=1)return;
    f.dmgEng=Math.min(1,f.dmgEng+0.5);
  } else {
    if(f.dmgAil>=1)return;
    /* which way it hangs is fixed on the first hit, so the pilot can learn to
       trim against a constant rather than a coin flip every frame */
    if(f.dmgAil<=0)f.ailSign=Math.random()<0.5?1:-1;
    f.dmgAil=Math.min(1,f.dmgAil+0.5);
  }
  if(f.isPlayer){
    banner(engine?(f.dmgEng>=1?'ENGINE OUT':'ENGINE HIT')
                 :(f.dmgAil>=1?'AILERON GONE':'AILERON HIT'),1.1);
    tone(120,.45,.20,'sawtooth',56);
  } else if(Math.random()<0.34)feed(tag(f)+(engine?' is trailing smoke':' is flying wing-low'));
}
function hurt(f,dmg,by){
  if(!f.alive||f.invuln>0)return;
  /* the armour slot is a divisor on everything that reaches you */
  if(f.armorMul&&f.armorMul!==1)dmg/=f.armorMul;
  f.hp-=dmg;
  /* `by` is null for the out-of-bounds bleed; only aimed fire breaks things */
  if(by&&f.hp>0&&Math.random()<0.26)systemHit(f,by);
  if(f.isPlayer){
    st.dmgFlash=Math.max(st.dmgFlash,.55);shake=Math.min(1,shake+.25);
    /* `by` is null for the out-of-bounds bleed, which ticks every frame —
       only real incoming fire earns a direction marker and a hit sound */
    if(by){dmgFrom(by.pos);tone(160,.15,.22,'square',72);}
  }
  if(f.hp<=0)kill(f,by);
}
function kill(f,by){
  if(!f.alive)return;
  f.alive=false; f.hp=0; f.respawnT=RESPAWN; f.mesh.visible=false;
  boom(f.pos,150);
  if(f.carrying)dropCore(f);
  if(by&&by!==f){by.kills++;feed(tag(by)+' &rarr; '+tag(f));}
  else feed(tag(f)+' went in');
  if(by===player){sortie.kills++;emit('kill',{target:f.name});stingSfx([784,1046],.16);}
  if(f.isPlayer){st.dmgFlash=1;shake=1;sortie.deaths++;emit('death',{by:by?by.name:'terrain'});
    tone(220,1.1,.24,'sawtooth',48);}
}

