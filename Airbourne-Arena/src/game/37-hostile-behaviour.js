/* ===================== hostile behaviour =====================
   Every hostile used to point at the player and never stop. Two things made
   that inescapable rather than merely difficult: they all picked the same
   target, and they steered by lerping their velocity vector, which has no
   turn radius at all — a hostile could reverse direction inside its own
   length, so no amount of flying could break its tracking. The result was the
   thing every mission ended as: a permanent tail you could not shake.

   Three rules fix it without making them harmless.

     1. A turn rate. They rotate their heading at a bounded angular speed, so a
        hard turn or a burner extension genuinely defeats the solution and
        overshooting past you costs them the same time it costs you.
     2. Engagement slots. Only a few press the attack at once; the rest hold
        off at a distance and rotate in. Being outnumbered should mean pressure,
        not eight aircraft in one cone.
     3. Break-off. A hostile that has been in the saddle for a while extends
        away, resets, and comes back around. That is the breathing room the
        player never got.                                                     */
var HOSTILE_TURN=0.95,      /* radians/sec of heading change */
    HOSTILE_PRESS=3,        /* how many may commit at once */
    HOSTILE_SADDLE=9,       /* seconds on the attack before extending */
    HOSTILE_EXTEND=4.5;     /* seconds spent extending away */
var _hoV=new THREE.Vector3(),_hoC=new THREE.Vector3();

function stepConvoy(dt){
  /* Hand out the engagement slots to whoever is closest, once per frame. */
  var press=[];
  for(var pi=0;pi<convoy.length;pi++){
    var h=convoy[pi];
    if(!h.alive||!h.hostile)continue;
    if(h.role==='patrol')continue;
    h._d=player.alive?h.pos.distanceTo(player.pos):1e9;
    press.push(h);
  }
  press.sort(function(a,b){return a._d-b._d;});
  for(var qi=0;qi<press.length;qi++)press[qi].committed=(qi<HOSTILE_PRESS);

  for(var i=0;i<convoy.length;i++){
    var c=convoy[i];
    if(!c.alive)continue;
    var tgt=null;
    if(c.hostile){
      if(c.anchor===undefined){
        /* a third of any group works its own patch instead of the player, so a
           mission reads as defended airspace rather than a swarm */
        c.role=(i%3===2)?'patrol':'fighter';
        c.anchor=c.pos.clone();
        c.saddle=0; c.extend=0; c.orbit=rnd(0,Math.PI*2);
      }
      /* A hostile that has somehow ended up a long way out comes back in, no
         matter what it thought it was doing. An objective that waits on
         hostilesLeft() must never be left waiting on one that left. */
      if(player.alive&&c.pos.distanceTo(player.pos)>2600){
        c.extend=0; c.saddle=0; c.committed=true;
      }
      if(c.extend>0){
        /* extending: run away from the player, rebuild the picture, come back */
        c.extend-=dt;
        if(player.alive){
          _drV.copy(c.pos).sub(player.pos);
          if(_drV.lengthSq()<1)_drV.set(1,0,0);
          _hoV.copy(c.pos).add(_drV.normalize().multiplyScalar(900));
          _hoV.y=clamp(_hoV.y+120,ground(_hoV.x,_hoV.z)+220,1500);
          tgt=_hoV;
        }
        if(c.extend<=0)c.saddle=0;
      } else if(c.role==='patrol'&&(!player.alive||c.pos.distanceTo(player.pos)>900)){
        /* Orbit the patch you were left to guard. The angular rate has to keep
           the orbit point slower than the aircraft that is chasing it — at
           0.5 rad/s on a 420 m ring the point moves at 210 m/s and a 110 m/s
           hostile can never catch it, so it spirals away and never comes back.
           That is not a patrol, it is a defection. */
        c.orbit+=dt*Math.min(0.22,c.speed/520);
        _hoV.set(c.anchor.x+Math.cos(c.orbit)*420,c.anchor.y,
                 c.anchor.z+Math.sin(c.orbit)*420);
        tgt=_hoV;
      } else if(c.committed||c.role==='patrol'){
        if(player.alive){
          tgt=player.pos;
          c.saddle+=dt;
          if(c.saddle>HOSTILE_SADDLE){c.extend=HOSTILE_EXTEND;c.saddle=0;}
        }
      } else if(player.alive){
        /* Waiting your turn: stand off on the flank rather than pile in. Same
           trap as the patrol ring — the holding point must not outrun the
           aircraft holding on it. And a hostile already outside the ring closes
           on the player directly rather than chasing a point on the far side
           of it, which is what let them trail off to the horizon. */
        c.orbit+=dt*Math.min(0.12,c.speed/900);
        var dp0=c.pos.distanceTo(player.pos);
        if(dp0>1000)tgt=player.pos;
        else{
          _hoV.set(player.pos.x+Math.cos(c.orbit)*760,
                   player.pos.y+140,
                   player.pos.z+Math.sin(c.orbit)*760);
          tgt=_hoV;
        }
        c.saddle=Math.max(0,c.saddle-dt);
      }
    } else if(c.leg<c.path.length){
      tgt=c.path[c.leg];
      if(c.pos.distanceTo(tgt)<110){c.leg++; if(c.leg>=c.path.length)c.arrived=true;}
    }
    if(tgt){
      _drV.copy(tgt).sub(c.pos);
      var d=_drV.length(); if(d>1e-3)_drV.multiplyScalar(1/d);
      var want=(c.hostile&&c.extend<=0&&d<260)?-0.4:1;
      if(c.hostile){
        /* Steer the heading itself at a bounded rate.

           Capping the *commanded* direction and then lerping the velocity
           toward it does not give a turn rate — it gives the product of the
           two. The command sat a fraction of a degree ahead of the current
           heading and the velocity chased it at 2.7% a frame, which worked out
           at about 1.4 deg/sec: a hostile needed two minutes to reverse and in
           practice never turned at all, so nothing could re-engage and patrols
           wandered off the map. Rotating the direction and easing only the
           speed gives exactly the rate asked for.

           At 0.95 rad/s a hostile reverses in about 3.3 seconds. The player's
           pitch authority is 1.85 rad/s, so a committed turn or a burner
           extension genuinely breaks their tracking — which is the point. */
        if(c.extend<=0&&d<260)_drV.negate();   /* too close: break away, don't ram */
        var spd=c.vel.length();
        var cur=spd>1e-3?_hoC.copy(c.vel).multiplyScalar(1/spd):_hoC.copy(_drV);
        var ang=Math.acos(clamp(cur.dot(_drV),-1,1));
        var maxTurn=HOSTILE_TURN*dt;
        if(ang>maxTurn&&ang>1e-5){
          _hoV.crossVectors(cur,_drV);
          if(_hoV.lengthSq()<1e-8){
            /* exactly reversed: any perpendicular axis will do */
            _hoV.set(0,1,0).cross(cur);
            if(_hoV.lengthSq()<1e-8)_hoV.set(1,0,0);
          }
          _hoV.normalize();
          cur.applyAxisAngle(_hoV,maxTurn);
        } else cur.copy(_drV);
        var spWant=c.speed*(c.extend>0?1.18:1);
        c.vel.copy(cur).multiplyScalar(spd+(spWant-spd)*Math.min(1,dt*1.2));
      } else {
        c.vel.lerp(_drV2.copy(_drV).multiplyScalar(c.speed*want),Math.min(1,dt*1.0));
      }
    }
    c.pos.addScaledVector(c.vel,dt);
    var gh=ground(c.pos.x,c.pos.z)+70;
    if(c.pos.y<gh){c.pos.y=gh;if(c.vel.y<0)c.vel.y=0;}
    if(c.vel.lengthSq()>1e-4)c.mesh.lookAt(_drV.copy(c.pos).add(c.vel));
    if(c.hostile&&player.alive&&c.extend<=0){
      c.cd-=dt;
      var dp=c.pos.distanceTo(player.pos);
      /* they have to actually be pointing at you: a bounded turn rate means a
         hostile can be close and still have no shot, which is what makes
         breaking their tracking worth doing */
      var aligned=true;
      if(c.vel.lengthSq()>1e-4){
        _hoV.copy(player.pos).sub(c.pos).normalize();
        aligned=_drV2.copy(c.vel).normalize().dot(_hoV)>0.90;
      }
      if(dp<620&&aligned&&c.cd<=0){
        c.cd=rnd(.8,1.4);
        var aim=_drV2.copy(player.pos).sub(c.pos).normalize();
        var sp=.03;
        aim.set(aim.x+rnd(-sp,sp),aim.y+rnd(-sp,sp),aim.z+rnd(-sp,sp)).normalize();
        var b=bulletSpawn();
        b.p.copy(c.pos).addScaledVector(aim,9);
        b.v.copy(aim).multiplyScalar(MUZZLE*.8);
        b.life=1.7;b.team='blackwing';b.owner=c;b.dmg=7;
        gunSfx(earGain(c.pos)*.4);
      }
    }
  }
}
function convoyAlive(){var n=0;for(var i=0;i<convoy.length;i++)if(convoy[i].alive&&convoy[i].passive)n++;return n;}
function hostilesLeft(){var n=0;for(var i=0;i<convoy.length;i++)if(convoy[i].alive&&convoy[i].hostile)n++;return n;}
function convoyArrived(){
  for(var i=0;i<convoy.length;i++)if(convoy[i].passive&&convoy[i].alive&&!convoy[i].arrived)return false;
  return true;
}
function namedFlier(name){
  for(var i=0;i<convoy.length;i++)if(convoy[i].name===name)return convoy[i];
  return null;
}

