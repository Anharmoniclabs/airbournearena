/* ===================== gunnery solution =====================
   Rounds leave the nose at MUZZLE *plus* the aircraft's own velocity, so a
   range/speed estimate falls behind the target whenever either aircraft is
   manoeuvring. Solving against relative motion is the difference between a
   lead pip that works and one that quietly lies to you.

     bullet(t) = Ps + (d*MUZZLE + Vs)t      target(t) = Pt + Vt*t

   Equating the two and taking magnitudes gives a quadratic in t, with R the
   range vector and W the relative velocity:

     (MUZZLE^2 - |W|^2)t^2 - 2(R.W)t - |R|^2 = 0                            */
var _iR=new THREE.Vector3(),_iW=new THREE.Vector3(),_tv=new THREE.Vector3(),
    _tv2=new THREE.Vector3(),_aimV=new THREE.Vector3(),_pipV=new THREE.Vector3(),
    _hitV=new THREE.Vector3(),_camV=new THREE.Vector3(),
    _camR=new THREE.Vector3(),_camU=new THREE.Vector3(),
    _guideV=new THREE.Vector3(),_guideDir=new THREE.Vector3();
var tgtBox=document.getElementById('tgtBox'),
    tgtInfo=document.getElementById('tgtInfo'),
    tgtArrow=document.getElementById('tgtArrow');

function targetAlive(target){return !!target&&target.alive!==false;}
function targetVelocity(target,out){
  return target.vel?out.copy(target.vel):out.set(0,0,0);
}
/* Aircraft positions are their centres; fixed installations are planted at
   terrain height. Aim halfway up a building instead of magnetising rounds into
   the dirt at its origin. */
function targetPoint(target,out){
  out.copy(target.pos);
  if(!target.vel&&target.height)out.y+=target.height*.52;
  return out;
}
function interceptTime(shooter,target){
  targetPoint(target,_iR).sub(shooter.pos);
  targetVelocity(target,_iW).sub(shooter.vel);
  var range=_iR.length();
  var a=MUZZLE*MUZZLE-_iW.lengthSq();
  /* a<=0 means the target opens faster than the rounds close, so there is no
     solution at all — fall back to the straight estimate rather than nothing */
  if(a<=1e-6)return range/MUZZLE;
  var b=-2*_iR.dot(_iW),c=-range*range;
  var disc=b*b-4*a*c;
  if(disc<0)return range/MUZZLE;
  var t=(-b+Math.sqrt(disc))/(2*a);
  return (t>0&&isFinite(t))?Math.min(t,4):range/MUZZLE;
}
/* Direction the nose must point for rounds fired now to arrive at the same
   place, at the same time, as the target. */
function interceptAim(shooter,target,t,out){
  targetPoint(target,out).sub(shooter.pos).divideScalar(Math.max(t,.001))
     .add(targetVelocity(target,_tv2).sub(shooter.vel));
  return out.normalize();
}

/* ===================== target acquisition =====================
   Nearest-inside-a-cone picked the wrong bandit constantly: one at the edge of
   the cone would steal the solution from the one you were actually pointing
   at, and the pick flickered between them through every turn. Bearing
   dominates the score, range only breaks ties, and whatever is already locked
   carries a bonus so it holds until something is clearly better.

   A contact under the reticle has to remain there briefly before MAG LOCK
   arms. This prevents every pass over a crowded skyline from stealing shots,
   while a wider release cone and short grace period stop the lock flickering
   during ordinary corrections. */
var TGT_RANGE=1800,TGT_CONE=.9397,TGT_STICK=.20;
var SOFT_LOCK_CONE=.9848,SOFT_RELEASE_CONE=.9511;
var SOFT_LOCK_DWELL=.24,SOFT_LOCK_GRACE=.48;
var lockOn={target:null,manual:false,assisted:false,hover:null,hoverT:0,grace:0,
  cue:false,cueT:0};

function bearing(e,out){
  targetPoint(e,out).sub(player.pos);
  var d=out.length();
  if(d>1e-3)out.multiplyScalar(1/d);
  return d;
}
function targetCandidates(){
  var out=[];
  for(var i=0;i<fighters.length;i++){
    var e=fighters[i];
    if(e.alive&&e.team!==player.team)out.push(e);
  }
  for(var s=0;s<structs.length;s++){
    var sc=structs[s];
    if(sc.alive&&sc.team!==player.team)out.push(sc);
  }
  for(var d=0;d<drones.length;d++)if(drones[d].alive)out.push(drones[d]);
  for(var c=0;c<convoy.length;c++){
    var cv=convoy[c];
    if(cv.alive&&cv.hostile)out.push(cv);
  }
  for(var q=0;q<sites.length;q++){
    var site=sites[q];
    if(site.alive&&site.hostile&&!site.hold)out.push(site);
  }
  return out;
}
/* Acquisition follows the crosshair, not the nose. The nose only chases the
   reticle, so in any hard pull the two sit tens of degrees apart — scoring off
   the nose kept designating whoever happened to be centred in the airframe
   rather than whoever the player was pointing at, which is the one they are
   trying to shoot. aimDir is refreshed earlier in the same frame, in
   playerControl, so this is always reading the reticle the player can see. */
function pickTarget(){
  axes(player);
  var list=targetCandidates(),best=null,bestScore=0;
  for(var i=0;i<list.length;i++){
    var dist=bearing(list[i],_tv);
    if(dist>TGT_RANGE)continue;
    var dot=_tv.dot(aimDir);
    if(dot<TGT_CONE)continue;
    var aimS=(dot-TGT_CONE)/(1-TGT_CONE);
    /* Squared so the bandit actually under the crosshair wins outright. Left
       linear, something closer but well off to one side beat a dead-on target
       on the distance term alone, which is the opposite of taking a shot. */
    var s=aimS*aimS+(1-dist/TGT_RANGE)*0.18;
    /* Hold the current designation only while the crosshair is still broadly
       on it, so a deliberate move onto someone else is not fought by the
       stickiness that exists to stop flicker. */
    if(list[i]===lockOn.target&&aimS>0.25)s+=TGT_STICK;
    if(s>bestScore){bestScore=s;best=list[i];}
  }
  return best;
}
/* Manual lock walks everything in front of you in bearing order, so pressing
   it repeatedly steps through the fight instead of re-picking the same bandit. */
function cycleTarget(){
  axes(player);
  var list=targetCandidates();
  if(!list.length)return;
  for(var i=0;i<list.length;i++){
    bearing(list[i],_tv); list[i]._bear=_tv.dot(_f);
  }
  list.sort(function(a,b){return b._bear-a._bear;});
  var idx=list.indexOf(lockOn.target);
  lockOn.target=list[(idx+1)%list.length];
  lockOn.manual=true;
  lockOn.assisted=true;
  lockOn.hover=lockOn.target; lockOn.hoverT=SOFT_LOCK_DWELL;
  toast('LOCKED — '+lockOn.target.name,1.4);
  tone(1180,.10,.16,'square',1480);
}
function releaseLock(){
  if(!lockOn.manual)return;
  lockOn.manual=false;
  lockOn.assisted=false; lockOn.hover=null; lockOn.hoverT=0; lockOn.grace=0;
  toast('LOCK RELEASED',1.1);
  tone(620,.12,.13,'square',420);
}
function stepLock(dt){
  lockOn.cueT-=dt;
  if(!player.alive||st.over){
    lockOn.target=null;lockOn.manual=false;lockOn.assisted=false;
    lockOn.hover=null;lockOn.hoverT=0;return;
  }
  if(lockOn.target&&!targetAlive(lockOn.target)){
    lockOn.target=null;lockOn.manual=false;lockOn.assisted=false;
    lockOn.hover=null;lockOn.hoverT=0;
  }
  /* A deliberate designation is a decision, not a proximity test: it holds
     right across the arena until the bandit dies or the player drops it. That
     is what makes the off-screen arrow worth having — it is how you go and
     find someone, not just how you shoot at what is already in front of you. */
  if(lockOn.manual&&lockOn.target)return;
  var candidate=pickTarget(),candidateDot=-1;
  if(candidate){
    bearing(candidate,_tv);
    candidateDot=_tv.dot(aimDir);
  }

  /* Dwell directly over a target to arm assistance. Until then the amber box
     is only tracking information and rounds remain completely ballistic. */
  if(candidate&&candidateDot>=SOFT_LOCK_CONE){
    if(candidate===lockOn.hover)lockOn.hoverT+=dt;
    else {lockOn.hover=candidate;lockOn.hoverT=0;}
    if(!lockOn.assisted)lockOn.target=candidate;
    if(lockOn.hoverT>=SOFT_LOCK_DWELL){
      var fresh=!lockOn.assisted||lockOn.target!==candidate;
      lockOn.target=candidate;lockOn.assisted=true;lockOn.grace=SOFT_LOCK_GRACE;
      if(fresh){
        toast('MAG LOCK — '+candidate.name,1.0);
        tone(980,.07,.10,'square',1320);
      }
    }
    return;
  }

  lockOn.hover=null;lockOn.hoverT=0;
  if(lockOn.assisted&&lockOn.target&&targetAlive(lockOn.target)){
    var heldRange=bearing(lockOn.target,_tv),heldDot=_tv.dot(aimDir);
    if(heldRange<TGT_RANGE*1.12&&heldDot>=SOFT_RELEASE_CONE){
      lockOn.grace=SOFT_LOCK_GRACE;return;
    }
    lockOn.grace-=dt;
    if(lockOn.grace>0)return;
  }
  lockOn.assisted=false;lockOn.grace=0;lockOn.target=candidate;
}

/* ===================== ground proximity =====================
   Terrain contact is instantly fatal, so the aircraft has to say so before it
   happens rather than after. Warning cadence tightens as the ground closes. */
var gpws={t:0,on:false,warned:false};
function gpwsCheck(dt){
  gpws.t-=dt;
  if(!player.alive||st.over||!st.started){gpws.on=false;return;}
  var agl=player.pos.y-ground(player.pos.x,player.pos.z);
  /* sample where the aircraft will be, not what is directly underneath it —
     flying level at a rising ridge is the case that actually kills people */
  var ahead=tmpV.copy(player.pos).addScaledVector(player.vel,2.4);
  var aheadAgl=ahead.y-ground(ahead.x,ahead.z);
  var worst=Math.min(agl,aheadAgl);
  gpws.on=worst<300&&(player.vel.y<2||aheadAgl<agl);
  if(!gpws.on){
    /* only clear the banner if it was ours — the out-of-bounds warning uses
       the same line and runs earlier in the frame */
    if(gpws.warned){gpws.warned=false; if(player.boundT<=0)el.warn.style.opacity=0;}
    return;
  }
  gpws.warned=true;
  el.warn.textContent='PULL UP';
  el.warn.style.opacity=1;
  var urgency=clamp(1-worst/300,0,1);
  if(gpws.t<=0){
    gpws.t=0.62-urgency*0.44;
    tone(880,.12,.20+urgency*.12,'square');
  }
}

