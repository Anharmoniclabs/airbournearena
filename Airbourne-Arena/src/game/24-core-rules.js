/* ===================== core ===================== */
function dropCore(f){
  core.carrier=null; f.carrying=false;
  core.pos.copy(f.pos); core.vel.copy(f.vel).multiplyScalar(.35);
  core.lockout=f; core.lockT=1.0;
  feed('<span style="color:#ffb347">CORE DROPPED</span>');
  tone(330,.26,.14,'triangle',210);
  emit('case_drop',{pilot:f.name});
  netEmitEvent(NET_EV.CORE_DROP,f);
}
function passCore(f){
  if(core.carrier!==f)return;
  core.carrier=null; f.carrying=false;
  var fwd=new THREE.Vector3(0,0,-1).applyQuaternion(f.quat);
  core.pos.copy(f.pos).addScaledVector(fwd,14);
  core.vel.copy(f.vel).addScaledVector(fwd,230);
  core.lockout=f; core.lockT=1.1;
  if(f.isPlayer)banner('CORE AWAY',0.9);
  feed(tag(f)+' passed the core');
  if(f.isPlayer)sortie.passes++;
  tone(660,.18,f.isPlayer?.2:earGain(f.pos)*.12,'triangle',880);
  emit('case_pass',{pilot:f.name});
  netEmitEvent(NET_EV.CORE_PASS,f);
}
function grabCore(f){
  core.carrier=f; f.carrying=true; core.vel.set(0,0,0);
  feed(tag(f)+' has the core');
  /* which way home is depends on the side you signed with */
  if(f.isPlayer){banner('CORE SECURED — RUN IT '+(GOALS[f.team].x>0?'EAST':'WEST'),1.4);
    sortie.grabs++;stingSfx([523,659,784],.19);}
  else tone(440,.2,earGain(f.pos)*.12,'triangle',560);
  emit('case_grab',{pilot:f.name});
  netEmitEvent(NET_EV.CORE_GRAB,f);
}
function scoreCap(f){
  /* Online the scoreboard is the server's. The local increment still happens so
     the HUD reacts on the same frame as the capture, but the SCORE message that
     follows overwrites it — and the server, not this client, is what decides the
     match is over. */
  if(f.team==='blue')st.scoreB++; else st.scoreR++;
  netEmitEvent(NET_EV.CORE_SCORE,f);
  f.caps++; core.carrier=null; f.carrying=false;
  core.pos.set(0,600,rnd(-260,260)); core.vel.set(0,0,0); core.lockout=null; core.charge=100;
  boom(GOALS[f.team],280);
  feed(tag(f)+' <span style="color:#ffb347">SCORED</span>');
  if(f.isPlayer)sortie.scores++;
  emit('case_score',{pilot:f.name,team:f.team});
  banner(factionName(f.team)+' SCORES',1.8);
  if(f.team===player.team)stingSfx([523,659,784,1046],.22); else stingSfx([392,330,262],.20);
  if(!net.on&&(st.scoreB>=TARGET_SCORE||st.scoreR>=TARGET_SCORE))endMatch();
}
/* Online, the Core is simulated only by the arena host; every other client
   receives its position and carrier in the host's state packets and runs the
   presentation half alone. Splitting the two is what lets one function serve
   both cases without the offline game paying for any of it. */
function stepCore(dt){
  if(netOwnsCore())stepCoreSim(dt);
  stepCoreVisual(dt);
}

function stepCoreSim(dt){
  if(core.lockT>0){core.lockT-=dt; if(core.lockT<=0)core.lockout=null;}
  if(core.carrier){
    var c=core.carrier;
    if(!c.alive)core.carrier=null;
    else{
      core.charge=Math.max(0,core.charge-dt*2);
      if(core.charge<=0){
        banner('CORE DISCHARGED — DROPPED',1.2);
        dropCore(c);
        core.charge=35;
        return;
      }
      /* The generated case is a small hover pickup: carry it above the
         aircraft's local spine instead of towing a full-size box behind it. */
      var above=tmpV.set(0,1,0).applyQuaternion(c.quat);
      core.pos.copy(c.pos).addScaledVector(above,5.4);
      var g=GOALS[c.team];
      axes(c);
      var bank=Math.abs(Math.atan2(-_r.y,_u.y));
      if(Math.hypot(core.pos.x-g.x,core.pos.z-g.z)<goalR&&
         Math.abs(core.pos.y-g.y)<260&&c.speed<290&&bank<.78)scoreCap(c);
    }
  } else {
    core.charge=Math.min(100,core.charge+dt*8);
    core.pos.addScaledVector(core.vel,dt);
    core.vel.multiplyScalar(1-Math.min(1,dt*1.3));
    core.vel.y-=24*dt;
    /* magnet: a loose case pulls toward the closest aircraft, so you don't
       have to thread a needle at 200 units per second */
    var near=null,nd=420;
    for(var mi=0;mi<fighters.length;mi++){
      var mf=fighters[mi];
      if(!mf.alive||mf===core.lockout)continue;
      var md=mf.pos.distanceTo(core.pos);
      if(md<nd){nd=md;near=mf;}
    }
    if(near)core.pos.addScaledVector(tmpV.copy(near.pos).sub(core.pos).normalize(),
      Math.min(120,(1-nd/420)*190)*dt);
    var gh=ground(core.pos.x,core.pos.z)+130;
    if(core.pos.y<gh){core.pos.y+=(gh-core.pos.y)*Math.min(1,dt*2.2);core.vel.y*=.4;}
    if(core.pos.y>1600)core.pos.y=1600;
    for(var i=0;i<fighters.length;i++){
      var f=fighters[i];
      if(!f.alive||f===core.lockout)continue;
      if(f.pos.distanceTo(core.pos)<CASE_GRAB){grabCore(f);break;}
    }
  }
}

function stepCoreVisual(dt){
  coreGroup.position.copy(core.pos);
  coreMesh.rotation.y+=dt*.9;
  coreMesh.rotation.z=Math.sin(performance.now()*.0016)*.16;
  coreMesh.position.y=Math.sin(performance.now()*.0022)*1.8;
  var pulse=1+Math.sin(performance.now()*.006)*.12;
  var carried=!!core.carrier,caseW=carried?7.2:11.5,glowSize=carried?18:48;
  coreCaseSprite.scale.set(caseW,caseW*.5,1);
  coreCaseSprite.material.rotation=Math.sin(performance.now()*.0016)*.035;
  coreCaseSprite.position.y=Math.sin(performance.now()*.0022)*(carried?.35:.8);
  coreGlow.scale.set(glowSize*pulse,glowSize*pulse,1);
  coreGlow.material.opacity=carried?.34:.78;
  /* The destination itself reacts to possession: the correct ring flares and
     breathes as the carrier closes, so the objective is readable in the world
     rather than through another instruction panel. */
  for(var gi=0;gi<goalVisuals.length;gi++){
    var active=core.carrier&&gi===(core.carrier.team==='blue'?0:1);
    var gs=active?1.08+Math.sin(performance.now()*.007)*.09:1;
    goalVisuals[gi].scale.set(gs,gs,gs);
    goalVisuals[gi].material.opacity=active?.98:.58;
  }
  coreBeam.visible=!core.carrier;
}

