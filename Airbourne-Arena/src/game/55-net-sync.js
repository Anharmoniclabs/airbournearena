/* ===================== net sync =====================
   Sending what we own, and drawing what we do not.

   Aircraft under someone else's control are never simulated here. They are
   played back from a short buffer of states, rendered NET_INTERP_DELAY_MS
   behind the newest packet so that the ordinary jitter of a socket lands inside
   the delay instead of on the screen. */

var _netP0=new THREE.Vector3(),_netP1=new THREE.Vector3(),
    _netQ0=new THREE.Quaternion(),_netQ1=new THREE.Quaternion(),
    _netV=new THREE.Vector3();
var netSendInterval=1/NET_STATE_HZ;

/* Our clock against the server's. Sampled on every snapshot and smoothed
   heavily: the estimate includes one-way latency, so it is biased late by a few
   tens of milliseconds — harmless, because everything is rendered behind it
   anyway, and stable, which matters far more than being exactly right. */
function netNoteSkew(serverTime){
  var sample=serverTime-Date.now();
  net.clockSkew=net.clockSkew?net.clockSkew+(sample-net.clockSkew)*0.05:sample;
}
function netServerNow(){return Date.now()+net.clockSkew;}
function netRenderTime(){return netServerNow()-NET_INTERP_DELAY_MS;}

/* ---------- outbound ---------- */
function netAircraftRecord(f){
  var flags=0;
  if(f.alive)flags|=NET_FLAG_ALIVE;
  if(f.carrying)flags|=NET_FLAG_CARRYING;
  if(f.stalled)flags|=NET_FLAG_STALLED;
  /* Gun state travels as a flag rather than a message per round. A remote
     client spawns its own tracers from it at the aircraft's own rate, which
     costs nothing and puts visible fire in the air; those rounds are cosmetic
     everywhere except on the shooter's machine. */
  if(f.cannonCd>0)flags|=NET_FLAG_FIRING;
  if(f.isPlayer&&typeof burner!=='undefined'&&burner.lit)flags|=NET_FLAG_BURNER;
  return {slot:netSlotForFighter(f),flags:flags,hp:f.hp,throttle:f.throttle,
    px:f.pos.x,py:f.pos.y,pz:f.pos.z,
    qx:f.quat.x,qy:f.quat.y,qz:f.quat.z,qw:f.quat.w,
    vx:f.vel.x,vy:f.vel.y,vz:f.vel.z};
}

function netCoreRecord(){
  return {carrier:core.carrier?netSlotForFighter(core.carrier):null,
    charge:core.charge,
    px:core.pos.x,py:core.pos.y,pz:core.pos.z,
    vx:core.vel.x,vy:core.vel.y,vz:core.vel.z};
}

function netSendState(){
  var owned=[];
  for(var i=0;i<fighters.length;i++){
    var f=fighters[i];
    if(netOwns(f))owned.push(netAircraftRecord(f));
  }
  if(!owned.length&&!net.isHost)return;
  netSendHot(netEncodeState(NET_KIND_STATE,Date.now(),owned,
    net.isHost?netCoreRecord():null));
}

/* ---------- inbound ---------- */
function netOnSnapshot(buffer){
  var msg=netDecodeState(buffer);
  if(!msg||msg.kind!==NET_KIND_SNAPSHOT)return;
  netNoteSkew(msg.time);
  for(var i=0;i<msg.aircraft.length;i++){
    var a=msg.aircraft[i];
    if(a.slot===net.slot)continue;      /* never let the wire move our own aircraft */
    var buf=net.remotes[a.slot];
    if(!buf)buf=net.remotes[a.slot]={samples:[],lastAlive:true,firing:false};
    /* Snapshots can overtake each other. A sample older than the newest one
       already held would drag the interpolation backwards, so it is dropped
       rather than sorted in — by the time it arrived its moment had passed. */
    var newest=buf.samples[buf.samples.length-1];
    if(newest&&msg.time<=newest.t)continue;
    buf.samples.push({t:msg.time,
      px:a.px,py:a.py,pz:a.pz,qx:a.qx,qy:a.qy,qz:a.qz,qw:a.qw,
      vx:a.vx,vy:a.vy,vz:a.vz,hp:a.hp,flags:a.flags,throttle:a.throttle});
    var cutoff=msg.time-1000;
    while(buf.samples.length>2&&buf.samples[0].t<cutoff)buf.samples.shift();
  }
  if(msg.core&&!net.isHost)netApplyCore(msg.core);
}

function netApplyCore(rec){
  core.pos.set(rec.px,rec.py,rec.pz);
  core.vel.set(rec.vx,rec.vy,rec.vz);
  core.charge=rec.charge;
  var carrier=rec.carrier===null?null:netFighterForSlot(rec.carrier);
  if(core.carrier!==carrier){
    if(core.carrier)core.carrier.carrying=false;
    core.carrier=carrier;
    if(carrier)carrier.carrying=true;
  }
}

/* ---------- playback ---------- */
function netApplyRemote(f,dt){
  var slot=netSlotForFighter(f), buf=net.remotes[slot];
  if(!buf||!buf.samples.length)return;
  var at=netRenderTime(), s=buf.samples, n=s.length;

  if(at<=s[0].t){netWriteSample(f,s[0]);}
  else if(at>=s[n-1].t){
    /* Ahead of the newest packet. Coast on the last known velocity for a short
       while — long enough to cover a dropped frame, short enough that a real
       dropout stops rather than flies the aircraft into a hillside. */
    var ahead=at-s[n-1].t;
    netWriteSample(f,s[n-1]);
    if(ahead<NET_EXTRAPOLATE_MAX_MS){
      var k=ahead/1000;
      f.pos.x+=s[n-1].vx*k; f.pos.y+=s[n-1].vy*k; f.pos.z+=s[n-1].vz*k;
    }
  } else {
    var hi=1;
    while(hi<n&&s[hi].t<at)hi++;
    var a=s[hi-1], b=s[hi];
    var span=b.t-a.t;
    var u=span>0?(at-a.t)/span:0;
    _netP0.set(a.px,a.py,a.pz); _netP1.set(b.px,b.py,b.pz);
    f.pos.copy(_netP0.lerp(_netP1,u));
    _netQ0.set(a.qx,a.qy,a.qz,a.qw); _netQ1.set(b.qx,b.qy,b.qz,b.qw);
    _netQ0.slerp(_netQ1,u); f.quat.copy(_netQ0);
    _netP0.set(a.vx,a.vy,a.vz); _netP1.set(b.vx,b.vy,b.vz);
    f.vel.copy(_netP0.lerp(_netP1,u));
    netWriteMeta(f,b);
  }

  f.speed=f.vel.length();
  f.throttle=buf.samples[n-1].throttle;
  netRemoteTransitions(f,buf);
  /* The gunnery solver and the AI both read alpha, so a remote needs one. It is
     derived here rather than shipped, using the same expression stepFlight uses
     — the angle between where the nose points and where the aircraft is
     actually going is recoverable from the attitude and velocity we already
     received, so putting it on the wire would be paying for it twice. */
  if(f.speed>0.5){
    axes(f);
    _netV.copy(f.vel).multiplyScalar(1/f.speed);
    f.alpha=Math.asin(clamp(-_netV.dot(_u),-1,1));
  } else f.alpha=0;
}

function netWriteSample(f,s){
  f.pos.set(s.px,s.py,s.pz);
  f.quat.set(s.qx,s.qy,s.qz,s.qw);
  f.vel.set(s.vx,s.vy,s.vz);
  netWriteMeta(f,s);
}
function netWriteMeta(f,s){
  f.hp=s.hp;
  f.stalled=!!(s.flags&NET_FLAG_STALLED);
  var carrying=!!(s.flags&NET_FLAG_CARRYING);
  if(!net.isHost)f.carrying=carrying;
}

/* Death, respawn and gunfire are edges, not levels — they have to be spotted in
   the flag stream rather than reapplied every frame, or a dead aircraft would
   explode twenty times a second. */
function netRemoteTransitions(f,buf){
  var latest=buf.samples[buf.samples.length-1];
  var alive=!!(latest.flags&NET_FLAG_ALIVE);
  if(alive!==buf.lastAlive){
    buf.lastAlive=alive;
    if(!alive){
      f.alive=false; f.mesh.visible=false; boom(f.pos,150);
      disposeRollTips(f);
    } else {
      f.alive=true; f.mesh.visible=true; f.hp=latest.hp;
      f.dmgEng=0; f.dmgAil=0; f.invuln=2;
    }
  }
  f.alive=alive;
  f.mesh.visible=alive;
  var firing=!!(latest.flags&NET_FLAG_FIRING);
  buf.firing=firing;
  if(firing&&alive)fire(f);
}

/* ---------- damage ----------
   A round only ever does damage on the machine that fired it. That client tells
   the target's owner, and the owner is the one that subtracts health and
   decides whether the aircraft is dead. Any other arrangement has every client
   applying the same hit independently. */
function netClaimHit(f,dmg,by){
  /* `by` is a fighter for gunfire and an AA emplacement or drone for everything
     else, and only a fighter has a slot to name. */
  netSend({t:NET_C.HIT,slot:netSlotForFighter(f),dmg:dmg,
    by:by&&fighters.indexOf(by)>=0?netSlotForFighter(by):null});
}

function netOnRemoteHit(msg){
  var f=netFighterForSlot(msg.slot);
  if(!f||!netOwns(f))return;
  var by=msg.by===undefined||msg.by===null?null:netFighterForSlot(msg.by);
  hurt(f,msg.dmg,by);
}

/* ---------- events ---------- */
var NET_CORE_EVENTS=[NET_EV.CORE_GRAB,NET_EV.CORE_PASS,NET_EV.CORE_DROP,NET_EV.CORE_SCORE];
function netEmitEvent(ev,f,data){
  if(!net.on)return;
  /* Only the arena host speaks for the Core. A carrier that dies runs dropCore
     locally on its own machine — correct for what it draws, but the host has
     already worked the same thing out from the carrier being dead, and two
     announcements of one drop is one too many. */
  if(NET_CORE_EVENTS.indexOf(ev)>=0&&!netOwnsCore())return;
  netSend({t:NET_C.EVENT,ev:ev,slot:f?netSlotForFighter(f):null,d:data||null});
}

/* Deaths are announced by the machine that owns the aircraft, and only for real
   fighters — hurt()/kill() also run for drones and structures, which have no
   slot on the wire. */
function netEmitKill(f,by){
  if(!net.on||fighters.indexOf(f)<0||!netOwns(f))return;
  netSend({t:NET_C.EVENT,ev:NET_EV.KILL,slot:netSlotForFighter(f),
    d:{by:by&&fighters.indexOf(by)>=0?netSlotForFighter(by):null}});
}

function netOnRemoteEvent(msg){
  var f=msg.slot===null||msg.slot===undefined?null:netFighterForSlot(msg.slot);
  var by=msg.by===undefined||msg.by===null?null:netFighterForSlot(msg.by);
  if(msg.ev===NET_EV.KILL){
    /* The victim's owner already ran kill() and is not echoed this message, so
       everything here is the bookkeeping the other clients would otherwise
       miss: who gets the credit, and what the feed says. */
    var killer=msg.d&&msg.d.by!==null&&msg.d.by!==undefined?netFighterForSlot(msg.d.by):null;
    if(killer&&f&&killer!==f){killer.kills++;feed(tag(killer)+' &rarr; '+tag(f));}
    else if(f)feed(tag(f)+' went in');
    if(killer===player){sortie.kills++;emit('kill',{target:f?f.name:'?'});stingSfx([784,1046],.16);}
    return;
  }
  if(msg.ev===NET_EV.CORE_GRAB&&f){
    feed(tag(f)+' has the core');
    tone(440,.2,earGain(f.pos)*.12,'triangle',560);
    return;
  }
  if(msg.ev===NET_EV.CORE_PASS&&f){
    feed(tag(f)+' passed the core');
    tone(660,.18,earGain(f.pos)*.12,'triangle',880);
    return;
  }
  if(msg.ev===NET_EV.CORE_DROP){
    feed('<span style="color:#ffb347">CORE DROPPED</span>');
    tone(330,.26,.14,'triangle',210);
    return;
  }
  if(msg.ev===NET_EV.CORE_SCORE&&f){
    /* Presentation only. The numbers arrive separately, from the server. */
    boom(GOALS[f.team],280);
    feed(tag(f)+' <span style="color:#ffb347">SCORED</span>');
    banner(factionName(f.team)+' SCORES',1.8);
    if(player&&f.team===player.team)stingSfx([523,659,784,1046],.22);
    else stingSfx([392,330,262],.20);
    return;
  }
  if(msg.ev===NET_EV.RESPAWN&&f&&!netOwns(f)){
    f.alive=true; f.mesh.visible=true;
    return;
  }
  if(msg.ev===NET_EV.REMATCH){
    /* Nobody reset locally when the button was pressed, so this is where every
       client in the room — including whoever asked — starts the next match. */
    abandonMission(); st.mode='arena'; parkArena(false);
    net.remotes={};
    resetMatch();
    banner('REMATCH',1.6);
  }
}

function netRequestRematch(){
  if(!net.on)return;
  netSend({t:NET_C.EVENT,ev:NET_EV.REMATCH,slot:net.slot,d:null});
  banner('REMATCH CALLED',1.2);
}

/* ---------- per-frame ---------- */
function netStep(dt){
  if(net.status===NET_LOST&&net.on){
    net.retryT-=dt;
    if(net.retryT<=0){
      net.retries++;
      if(net.retries>6){netFail('lost the connection to '+net.server);return;}
      netConnect(net.server,net.room);
    }
    return;
  }
  if(!net.on||net.status!==NET_LIVE)return;
  net.sendAcc+=dt;
  if(net.sendAcc>=netSendInterval){
    net.sendAcc=0;
    netSendState();
  }
}

/* Called from step()'s per-fighter loop in place of the AI, for every aircraft
   this client does not own. */
function netStepRemote(f,dt){
  netApplyRemote(f,dt);
  f.cannonCd-=dt;
}
