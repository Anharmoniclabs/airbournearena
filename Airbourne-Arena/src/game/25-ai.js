/* ===================== AI ===================== */
function nearestFoe(f,range){
  var best=null,bd=range;
  for(var i=0;i<fighters.length;i++){
    var o=fighters[i];
    if(!o.alive||o.team===f.team)continue;
    var d=o.pos.distanceTo(f.pos);
    if(d<bd){bd=d;best=o;}
  }
  return best;
}
function nearestStruct(f,kind,team){
  var best=null,bd=1e9;
  for(var i=0;i<structs.length;i++){
    var s=structs[i];
    if(!s.alive||s.kind!==kind||s.team!==team)continue;
    var d=s.pos.distanceTo(f.pos);
    if(d<bd){bd=d;best=s;}
  }
  return best;
}
function aiFor(f,dt){
  f.aiJink-=dt;
  var sk=aiSkill(f); f.spread=sk.spread;
  var holder=core.carrier, goal=null, engage=null;

  if(holder===f){
    goal=GOALS[f.team].clone();
    var chase=nearestFoe(f,240);
    if(chase){
      var mates=[];
      for(var i=0;i<fighters.length;i++){
        var m=fighters[i];
        if(m.team===f.team&&m!==f&&m.alive)mates.push(m);
      }
      var best=null,bs=.35;
      axes(f);
      for(var j=0;j<mates.length;j++){
        var to=tmpV.copy(mates[j].pos).sub(f.pos);
        var dist=to.length(); to.normalize();
        var adv=(f.team==='blue'?mates[j].pos.x-f.pos.x:f.pos.x-mates[j].pos.x)/600;
        var s2=to.dot(_f)*1.2+adv-dist/900;
        if(s2>bs){bs=s2;best=mates[j];}
      }
      if(best&&Math.random()<dt*1.5*sk.aggro)passCore(f);
    }
  } else if(holder&&holder.team===f.team){
    var back=tmpV2.set(0,0,1).applyQuaternion(holder.quat);
    goal=holder.pos.clone().addScaledVector(back,200);
    goal.y+=40; engage=nearestFoe(f,900);
  } else if(holder){
    goal=holder.pos.clone(); engage=holder;
  } else {
    goal=core.pos.clone(); engage=nearestFoe(f,760);
  }
  /* One pilot a side works the ground war. Without this the masts only ever
     die to the player and the radar rule is one-sided.

     The commitment has to be sticky. Tasking on "is the case loose right now"
     read fine and did nothing: possession flips every few seconds, so the
     assignment dropped long before anyone covered the two or three thousand
     units to the target. A strike package launches once and stays launched —
     it releases when the mast falls or the clock on the run runs out. */
  f.strike=null;
  if(f.slot===3){
    var foeTeam=(f.team==='blue'?'red':'blue');
    f.strikeT-=dt;
    if(f.strikeTarget&&(!f.strikeTarget.alive||f.strikeT<=0))f.strikeTarget=null;
    if(!f.strikeTarget&&!holder&&teamHasRadar(foeTeam)){
      f.strikeTarget=nearestStruct(f,'radar',foeTeam);
      if(f.strikeTarget)f.strikeT=30;
    }
    if(f.strikeTarget){
      f.strike=f.strikeTarget;
      goal=f.strike.pos.clone().setY(f.strike.pos.y+150);
      engage=null;
    }
  }
  if(!engage&&!f.strike)engage=nearestFoe(f,620);
  /* An unmarked aircraft shooting at the arena is everyone's problem. Without
     this the league pilots fly through the raid as if it were weather, and a
     drone nobody engages is a drone only the player can answer. */
  if(raid.on){
    var nearD=null,nearDD=760;
    for(var di=0;di<drones.length;di++){
      var dq=drones[di];
      if(!dq.alive)continue;
      var dqd=dq.pos.distanceTo(f.pos);
      if(dqd<nearDD){nearDD=dqd;nearD=dq;}
    }
    if(nearD&&(!engage||nearDD<f.pos.distanceTo(engage.pos))){engage=nearD;f.strike=null;}
  }

  var aimPt=goal;
  if(engage&&holder!==f){
    /* the same intercept the player's lead pip uses, then degraded by skill —
       under-leading is exactly what makes a rookie's tracking look rookie */
    var tof=interceptTime(f,engage);
    aimPt=engage.pos.clone().addScaledVector(engage.vel,tof*sk.lead);
  }

  /* survival overrides: rocks, floor, arena edge, stall recovery */
  axes(f);
  var ahead=tmpV3.copy(f.pos).addScaledVector(_f,360);
  var gh=ground(ahead.x,ahead.z);
  /* a strike run is allowed much closer to the rocks than a dogfight is */
  if(ahead.y<gh+(f.strike?55:120))
    aimPt=f.pos.clone().addScaledVector(_f,420).setY(gh+(f.strike?200:340));
  /* the hard deck exists so bots do not mow the lawn chasing each other; a
     pilot on a strike run needs to get under it to reach a mast */
  var deck=f.strike?170:260;
  if(f.pos.y<deck)aimPt=aimPt.clone().setY(Math.max(aimPt.y,f.strike?420:600));
  if(arenaDistance(f.pos.x,f.pos.z)>ARENA_RADIUS-320)aimPt=new THREE.Vector3(0,650,0);
  /* never point a bot at air it cannot hold — the extend logic climbs, and
     without this it would climb into the bleed and sit there */
  if(aimPt.y>CEIL_HARD-300)aimPt=aimPt.clone().setY(CEIL_HARD-300);

  var dir=aimPt.clone().sub(f.pos);
  var dist2=dir.length(); dir.normalize();
  var ctl=steerTo(f,dir,1.7);
  if(f.stalled){ctl.pitch=clamp(ctl.pitch,-1,0.15);}       /* unload to recover */
  /* break the moment somebody settles in behind us */
  if(f.roll.t<=0&&f.roll.cd<=0){
    var threat=nearestFoe(f,430);
    if(threat){
      var tf=tmpV.set(0,0,-1).applyQuaternion(threat.quat);
      var toMe=tmpV2.copy(f.pos).sub(threat.pos).normalize();
      if(toMe.dot(tf)>0.972&&Math.random()<dt*1.7*sk.react)startRoll(f,Math.random()<0.5?1:-1);
    }
  }
  ctl=applyRoll(f,ctl,dt);
  if(f.aiJink>0&&f.roll.t<=0)ctl.roll=clamp(ctl.roll+Math.sin(performance.now()*.006)*.85,-1,1);
  /* Extend instead of forcing a slow merge when the opponent owns the energy
     advantage. Difficulty still changes reaction/aim, never aircraft stats. */
  var ownE=f.pos.y+f.speed*f.speed/(2*G);
  var foeE=engage?engage.pos.y+engage.speed*engage.speed/(2*G):ownE;
  ctl.throttle=1;
  if(engage&&foeE>ownE+420&&holder!==f){
    var away=f.pos.clone().sub(engage.pos).normalize();
    aimPt=f.pos.clone().addScaledVector(away,700); aimPt.y+=260;
    ctl=steerTo(f,aimPt.sub(f.pos).normalize(),1.35);
    ctl.throttle=1;
  }
  if(engage&&dist2<230&&holder!==f)ctl.throttle=.7;
  stepFlight(f,ctl,dt);

  f.cannonCd-=dt;
  if(engage&&engage.alive&&f.invuln<=0){
    axes(f);
    var toE=tmpV.copy(engage.pos).sub(f.pos);
    var dE=toE.length(); toE.normalize();
    /* a rolling target is hard to track; a sharper pilot stays on it longer.
       Drones have no evade of their own, hence the guards — an undefined here
       made `need` NaN and silently stopped the pilot ever firing. */
    var evade=engage.evade||0;
    var need=0.952+evade*0.016-(sk.aggro-1)*0.010;
    if(dE<800&&toE.dot(_f)>need&&Math.random()>evade*0.45)fire(f);
    if(dE<300&&Math.random()<dt*.4*sk.react)f.aiJink=1.2;
  }
  /* a mast does not manoeuvre, so the gate is tighter and the range shorter */
  if(f.strike&&f.strike.alive&&f.invuln<=0){
    axes(f);
    var toS=tmpV.copy(f.strike.pos).sub(f.pos); toS.y+=130;
    var dS=toS.length(); toS.normalize();
    if(dS<700&&toS.dot(_f)>0.982)fire(f);
  }
}


