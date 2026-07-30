/* ===================== targeting HUD =====================
   Two marks, one solution. The pipper is where this burst will actually be at
   the moment it reaches the target — velocity inheritance and all — and the
   lead circle is where the target will be at that same moment. Put one on the
   other and the rounds connect; that is the whole aiming model, made visible
   instead of left for the player to guess at. */
function targetHud(alive){
  axes(player);
  var tgt=lockOn.target;
  if(!alive||!tgt){
    el.lead.style.opacity=0;
    tgtBox.style.opacity=0; tgtInfo.style.opacity=0; tgtArrow.style.opacity=0;
    el.pip.classList.remove('hot');
    el.aimRet.classList.remove('assist');
    tgtBox.classList.remove('assist','solved');
    /* no target: park the pipper at boresight so it stays a stable reference */
    place(el.pip,project(_pipV.copy(player.pos).addScaledVector(_f,700)),alive);
    lockOn.cue=false;
    return;
  }

  var range=bearing(tgt,_tv);                 /* _tv is now the unit line of sight */
  var t=interceptTime(player,tgt);

  /* where the target will be, and where this burst will be, at the same t */
  var hitPt=targetPoint(tgt,_hitV).addScaledVector(targetVelocity(tgt,_tv2),t);
  _pipV.copy(_f).multiplyScalar(MUZZLE).add(player.vel).multiplyScalar(t).add(player.pos);

  place(el.lead,project(hitPt),true);
  place(el.pip,project(_pipV),true);

  /* target box, sized by range so it reads as distance at a glance */
  var bp=project(targetPoint(tgt,_camV));
  var size=clamp(4200/Math.max(range,1),20,150);
  if(bp.vis){
    tgtBox.style.opacity=1;
    tgtBox.style.left=bp.x+'px'; tgtBox.style.top=bp.y+'px';
    tgtBox.style.width=size+'px'; tgtBox.style.height=size+'px';
    tgtArrow.style.opacity=0;
    tgtInfo.style.opacity=1;
    tgtInfo.style.left=bp.x+'px';
    tgtInfo.style.top=(bp.y+size/2+9)+'px';
  } else {
    /* behind or off the edge: point at it from the middle of the screen */
    tgtBox.style.opacity=0; tgtInfo.style.opacity=0;
    /* the arrow lives on the screen, so the angle has to come from the camera
       basis rather than the airframe's — they differ most in a hard bank */
    targetPoint(tgt,_camV).sub(camera.position).normalize();
    _camR.set(1,0,0).applyQuaternion(camera.quaternion);
    _camU.set(0,1,0).applyQuaternion(camera.quaternion);
    var ang=Math.atan2(_camV.dot(_camR),_camV.dot(_camU))*180/Math.PI;
    tgtArrow.style.opacity=1;
    tgtArrow.style.transform='rotate('+ang.toFixed(1)+'deg)';
  }

  /* closure is the part of relative motion along the line of sight */
  var closure=-(targetVelocity(tgt,_aimV).sub(player.vel).dot(_tv));
  var lockLabel=lockOn.manual?'HARD LOCK':(lockOn.assisted?'MAG LOCK':'TRACKING');
  tgtInfo.innerHTML=tgt.name+
    ' <b>'+(range/1000).toFixed(2)+'km</b> '+
    (closure>=0?'+':'')+Math.round(closure*1.1)+'kt · '+lockLabel;

  /* Firing cue: is the required aim direction inside the cone the gun can
     actually cover at this range? */
  interceptAim(player,tgt,t,_aimV);
  var err=Math.acos(clamp(_aimV.dot(_f),-1,1));
  var solved=range<1050&&err<(HIT_RADIUS/Math.max(range,1))+0.008;
  el.pip.classList.toggle('hot',solved);
  tgtBox.classList.toggle('solved',solved);
  tgtBox.classList.toggle('assist',lockOn.assisted||lockOn.manual);
  el.aimRet.classList.toggle('assist',lockOn.assisted||lockOn.manual);
  if(solved&&!lockOn.cue&&lockOn.cueT<=0){lockOn.cueT=0.6;tone(1650,.05,.10,'square');}
  lockOn.cue=solved;
}

