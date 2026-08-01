/* ===================== FLIGHT MODEL =====================
   Real velocity vector. Thrust, lift, drag and gravity are summed into an
   acceleration; the nose only decides where the wing is pointing. Angle of
   attack is the angle between where you're pointing and where you're going,
   and it drives the whole lift curve — including the stall.            */
var G=32.0;            // gravity
var THRUST=16.0;       // max thrust acceleration (T/W ~0.5)
var DRAG_K=0.00032;    // parasitic drag
var CDI=0.35;          // induced drag: hard turns bleed energy
var LIFT_K=0.00284;
var CL_A=5.2, CL0=0.06, A_CRIT=0.30;
var A_TRIM=0.045;      // trim angle of attack — hands off, it flies level
var G_LIMIT=9.0;       // structural limit — sets the sustained turn radius
var SIDE_K=0.0022;
var PITCH_RATE=1.85, ROLL_RATE=5.6, YAW_RATE=0.60, STAB=1.9;

/* ===================== afterburner =====================
   BOOST used to mean "set the throttle to 1", which is where the throttle
   already sits the moment you hold W — so the button did nothing and the
   aircraft had no way to make energy in a hurry. This is a real burner: a
   limited pool that gives thrust well past the military rating, drains while
   lit, and refills only once you let it cool. It is the tool for extending out
   of a fight, which is the other half of not being permanently tailed.       */
var AB_THRUST=1.85,      /* multiplier on top of full military thrust */
    AB_DRAIN=1/5.0,      /* five seconds of burner from full */
    AB_RECHARGE=1/8.0,   /* eight seconds to refill once cool */
    AB_COOL=0.9,         /* pause before it starts refilling */
    AB_RELIGHT=0.18;     /* how much you need banked to light it again */
var AIL_BIAS=1.35;     // standing roll rate a wrecked aileron leaves behind

/* ===================== open atmosphere =====================
   The previous 2,300-unit clamp made the sky another arena wall. Aircraft can
   now use the full visible atmosphere. Density falls gradually at altitude,
   preserving flight-model character without an invisible ceiling. CEIL_MAX
   is only a far-beyond-gameplay numerical safety guard. */
var CEIL_RHO0=6500, CEIL_RHO_SPAN=18000, CEIL_RHO_MIN=0.42;
var CEIL_HARD=18000, CEIL_MAX=24000;
function airDensity(y){return clamp(1-(y-CEIL_RHO0)/CEIL_RHO_SPAN,CEIL_RHO_MIN,1);}

/* ===================== turn response =====================
   A turn rate is g*tan(bank)/V whatever the input device, so the only way to
   make the aircraft come around faster is to bank it further and pull harder.
   62 deg of bank with a token amount of back pressure gave ~17 deg/s — an
   airliner. These numbers ask for a fighter's turn instead, and the angle of
   attack cap below is what keeps that from being a departure.

   BANK_SNAP is where a tap puts you, BANK_MAX where holding the turn ends up.
   Tapping stays precise for lining up a shot; holding builds to a max-rate
   turn over TURN_RAMP seconds. */
var BANK_SNAP=0.92;    // ~53 deg — instant, on the first frame of the input
var BANK_MAX=1.40;     // ~80 deg — sustained, held turn
var TURN_RAMP=0.55;    // seconds from snap to max while the input is held
var ROLL_GAIN=3.4;     // bank error -> roll command; higher stops the roll dead
var LEVEL_GAIN=2.6;    // roll back to wings level when the input is released
var ALPHA_GAIN=7.0;    // angle of attack error -> pitch command
var ALPHA_CAP=0.88;    // fraction of A_CRIT the turn governor will ask for

var _f=new THREE.Vector3(),_u=new THREE.Vector3(),_r=new THREE.Vector3(),
    _vd=new THREE.Vector3(),_ld=new THREE.Vector3(),_ac=new THREE.Vector3(),
    _ax=new THREE.Vector3(),_tg=new THREE.Vector3();

function axes(f){
  _f.set(0,0,-1).applyQuaternion(f.quat);
  _u.set(0,1,0).applyQuaternion(f.quat);
  _r.set(1,0,0).applyQuaternion(f.quat);
}
function stepFlight(f,ctl,dt){
  var m=f.mesh;
  axes(f);
  var speed=f.vel.length();
  var carry=f.carrying?1:0;
  /* Battle damage lands on a system rather than on a bigger subtraction from
     one health bar. A hit engine caps the thrust you are allowed to command;
     a hit aileron costs roll authority and leaves a standing roll you have to
     hold off against for the rest of the sortie. Same damage numbers, but the
     aircraft degrades in a way you have to fly around. */
  if(f.dmgEng>0)ctl.throttle=Math.min(ctl.throttle,1-f.dmgEng*0.40);
  /* control authority falls off with airspeed — mushy when slow */
  var auth=clamp((speed-16)/125,0.10,1.0);
  /* soft angle-of-attack limiter: you can still force a departure by holding
     the pull, but a normal hard turn won't dump you out of the sky */
  var lim=1;
  var over=(Math.abs(f.alpha)-A_CRIT*0.72)/(A_CRIT*0.55);
  if(over>0&&ctl.pitch*(f.alpha>=0?1:-1)>0)lim=1-clamp(over,0,1)*0.70;
  var agile=f.trimAgile||1;
  m.rotateX(ctl.pitch*PITCH_RATE*agile*(carry?.82:1)*auth*lim*dt);
  m.rotateZ(ctl.roll*ROLL_RATE*(ctl.rollMul||1)*agile*(carry?.82:1)*(1-f.dmgAil*0.5)*auth*dt);
  if(f.dmgAil>0)m.rotateZ(f.dmgAil*f.ailSign*AIL_BIAS*dt);
  m.rotateY(-ctl.yaw*YAW_RATE*auth*dt);
  axes(f);

  if(speed>0.5)_vd.copy(f.vel).multiplyScalar(1/speed); else _vd.copy(_f);
  var alpha=Math.asin(clamp(-_vd.dot(_u),-1,1));
  var beta=Math.asin(clamp(_vd.dot(_r),-1,1));
  var cl=CL0+CL_A*alpha;
  var stalled=Math.abs(alpha)>A_CRIT;
  if(stalled)cl*=1-0.75*clamp((Math.abs(alpha)-A_CRIT)/0.25,0,1);
  var q2=speed*speed;

  _ld.crossVectors(_r,_vd);
  if(_ld.lengthSq()>1e-6)_ld.normalize(); else _ld.copy(_u);

  /* thin air up high: the wing, the drag and the engine all lose the same
     medium, so the climb rate goes to nothing on its own */
  var rho=airDensity(f.pos.y);
  var activeGLimit=carry?6.5:G_LIMIT;
  var liftA=clamp(LIFT_K*q2*cl*rho,-activeGLimit*G,activeGLimit*G);
  var cd=1+CDI*(carry?1.25:1)*cl*cl+(stalled?0.9:0);
  if(speed>280)cd+=(speed-280)/140;          /* compressibility wall */

  _ac.set(0,0,0);
  /* thrust falls off more slowly than density — an intake still packs air */
  var thrustMul=1;
  if(ctl.burner){
    /* the burner comes in over a beat rather than as a step, so lighting it
       reads as an engine spooling instead of a teleport */
    f.abRamp=Math.min(1,(f.abRamp||0)+dt*3.2);
    thrustMul=1+(AB_THRUST-1)*f.abRamp;
  } else f.abRamp=Math.max(0,(f.abRamp||0)-dt*2.4);
  _ac.addScaledVector(_f,THRUST*(f.trimThrust||1)*(carry?.85:1)*ctl.throttle*
    thrustMul*Math.pow(rho,0.75));
  _ac.addScaledVector(_ld,liftA);
  _ac.addScaledVector(_vd,-DRAG_K*q2*cd*rho);
  _ac.addScaledVector(_r,-SIDE_K*q2*beta);
  _ac.y-=G;

  f.vel.addScaledVector(_ac,dt);
  f.pos.addScaledVector(f.vel,dt);
  f.pos.addScaledVector(windVec,dt*0.30);

  /* weathervane: the airframe swings into the airflow, offset by trim AoA,
     which is why it holds altitude hands-off instead of sinking */
  if(speed>8){
    _tg.copy(_vd).applyAxisAngle(_r,A_TRIM);
    _ax.crossVectors(_f,_tg);
    var s=clamp(_ax.length(),-1,1);
    if(s>1e-4){_ax.normalize();m.rotateOnWorldAxis(_ax,Math.asin(s)*Math.min(1,STAB*dt));}
  }

  f.speed=f.vel.length(); f.alpha=alpha; f.stalled=stalled;
  f.gLoad=liftA/G;
  if(f.mesh.userData.exhausts){
    var flame=2.8+ctl.throttle*4.8+(f.abRamp||0)*5.4;
    for(var ei=0;ei<f.mesh.userData.exhausts.length;ei++){
      var ex=f.mesh.userData.exhausts[ei];
      ex.scale.set(2.4+ctl.throttle*1.8,flame,1);
      ex.material.opacity=Math.min(1,.34+ctl.throttle*.62+(f.abRamp||0)*.3);
    }
  }
}

/* ===================== turn governor =====================
   Back pressure as an angle of attack command rather than a fixed stick
   deflection. Ask for the g the bank angle needs, convert it to the AoA that
   makes that g at this airspeed, and close the loop on the AoA the airframe is
   actually flying. Three things fall out of it for free:

     - the same input gives the same turn at 120 knots and at 300, because the
       required deflection is solved rather than guessed;
     - the cap sits just under A_CRIT, so holding the turn all the way in
       settles at the best rate the wing has instead of departing;
     - at low speed it asks for everything available and simply gets a wider
       turn, which is the honest answer.                                    */
function alphaPull(f,nWant){
  var q2=f.speed*f.speed;
  if(q2<400)return 0;                     /* too slow for the wing to bite */
  var clReq=clamp(nWant,0,G_LIMIT)*G/(LIFT_K*q2);
  var aReq=clamp((clReq-CL0)/CL_A,-A_CRIT*ALPHA_CAP,A_CRIT*ALPHA_CAP);
  return clamp((aReq-f.alpha)*ALPHA_GAIN,-1,1);
}
/* load factor that holds altitude at a given bank — 1/cos, capped so a
   knife-edge bank does not ask for infinite g */
function bankLoad(bank){return 1/Math.max(0.14,Math.cos(bank));}

/* Steering: give it a world direction, get stick inputs back.
   Used identically by the mouse, the thumbstick, the gamepad and every AI
   pilot. `hard` is the player's profile: it banks further and pulls through
   the turn under the governor above, so a full stick deflection is a real
   max-rate turn instead of a lazy 62 deg arc. AI pilots keep the softer
   original numbers, degraded further by skill. */
function steerTo(f,dir,gain,hard){
  axes(f);
  var ex=dir.dot(_r),ey=dir.dot(_u),ez=dir.dot(_f);
  var horiz=Math.hypot(ex,ez);
  var pitchErr=Math.atan2(ey,horiz);
  var yawErr=Math.atan2(ex,ez);
  var bankNow=Math.atan2(-_r.y,_u.y);
  var cap=hard?BANK_MAX:1.25;
  var bankWant=clamp(yawErr*(gain||1.7),-cap,cap);
  var roll=clamp(-(bankWant-bankNow)*(hard?ROLL_GAIN:1.9),-1,1);
  var pitch;
  if(hard){
    /* Blend the turn pull in with bank angle: small corrections around level
       stay pure aiming, so the nose still settles on a target instead of
       ballooning every time the reticle moves.

       Only ever adds pull. Here the player is commanding the nose directly, so
       a governor that can also subtract becomes a ceiling on the aim: it would
       push back precisely when the reticle is hauling the aircraft round.
       Holding altitude is the keyboard's job, where nobody is flying the nose
       by hand. (Measured on its own this clamp changes the stick turn rate by
       under half a degree per second — it is here to stop the governor fighting
       the player, not because it showed up as a number.) */
    var blend=smooth(0.30,0.85,Math.abs(bankNow));
    pitch=clamp(pitchErr*2.6+Math.max(0,alphaPull(f,bankLoad(bankNow)))*blend,-1,1);
  } else {
    pitch=clamp(pitchErr*2.5+Math.abs(bankNow)*0.55,-1,1);
  }
  var yaw=clamp(yawErr*0.6,-1,1)*0.30;
  return {pitch:pitch,roll:roll,yaw:yaw,throttle:1,pitchErr:pitchErr,yawErr:yawErr};
}


/* ===================== barrel roll =====================
   Not an animation — the aircraft rolls hard while holding back pressure, so
   the lift vector sweeps a cone and the flight path corkscrews sideways. The
   displacement is what actually takes you out of somebody's gun solution. */
/* ROLL_MUL is a multiple of ROLL_RATE, so it drops as the base roll rate rises
   — the barrel roll is still a single revolution and not one and a half. */
var ROLL_DUR=1.05, ROLL_CD=3.4, ROLL_MUL=1.35;
function startRoll(f,dir){
  if(!f.alive||f.roll.t>0||f.roll.cd>0||f.speed<70)return false;
  f.roll.t=ROLL_DUR; f.roll.dir=dir; f.roll.cd=ROLL_CD; f.evade=1;
  if(f.isPlayer){banner('BARREL ROLL',0.7);shake=Math.min(1,shake+0.22);}
  return true;
}
function applyRoll(f,ctl,dt){
  f.roll.cd=Math.max(0,f.roll.cd-dt);
  f.evade=Math.max(0,f.evade-dt*1.2);
  if(f.roll.t<=0)return ctl;
  f.roll.t-=dt; f.evade=1;
  ctl.roll=f.roll.dir;
  ctl.rollMul=ROLL_MUL;
  ctl.pitch=clamp(ctl.pitch*0.2+0.40,-1,1);      /* back pressure scribes the barrel */
  return ctl;
}

/* ===================== roll wingtip highlight =====================
   This used to spawn a pair of additive white sprites 26 times a second, each
   growing to 26 units — two thirds of a second of bloom per roll, from the one
   manoeuvre you perform while somebody is shooting at you. It washed out the
   gunsight and the lead circle at exactly the wrong moment.

   A roll is a wing event, so mark the wings. Two small sprites are pinned to
   the wingtips for the life of the roll and faded on a curve, rather than
   hundreds being spawned and left to grow. That is one allocation per aircraft
   for the whole sortie instead of ~55 per roll, and it stays under the HUD
   instead of over it.                                                    */
var ROLL_TIP_TEX=softSprite('rgba(214,240,255,.55)','rgba(150,200,255,0)');
var ROLL_TIP_SPAN=6.2,   /* half-span, matched to the old vapor offset */
    ROLL_TIP_SIZE=5.4,   /* was an effective 26 at full growth */
    ROLL_TIP_PEAK=0.38;  /* additive, so this is the knob to turn if it reads hot */
function rollTips(f){
  if(f.rollTip)return f.rollTip;
  var pair=[];
  for(var i=-1;i<=1;i+=2){
    var s=new THREE.Sprite(new THREE.SpriteMaterial({map:ROLL_TIP_TEX,transparent:true,
      depthWrite:false,fog:false,blending:THREE.AdditiveBlending,opacity:0}));
    s.scale.set(ROLL_TIP_SIZE,ROLL_TIP_SIZE,1); s.visible=false;
    scene.add(s); pair.push(s);
  }
  f.rollTip=pair;
  return pair;
}
function stepRollTips(f,dt){
  /* Fade in over the first fifth of the roll and out over the last third, so
     it reads as the wing loading up and unloading rather than as a light
     switch. Reduced motion drops it to a trace. */
  var want=0;
  if(f.roll.t>0){
    var k=1-f.roll.t/ROLL_DUR;                       /* 0 at entry, 1 at exit */
    want=Math.min(smooth(0,.2,k),smooth(1,.67,k))*(cfg.motion?.35:1);
  }
  f.rollGlow=f.rollGlow===undefined?0:f.rollGlow+(want-f.rollGlow)*Math.min(1,dt*9);
  if(f.rollGlow<0.004){
    if(f.rollTip){f.rollTip[0].visible=false;f.rollTip[1].visible=false;}
    return;
  }
  var pair=rollTips(f);
  axes(f);
  for(var i=0;i<2;i++){
    var s=pair[i];
    s.visible=true;
    s.material.opacity=f.rollGlow*ROLL_TIP_PEAK;
    s.position.copy(f.pos).addScaledVector(_r,(i?1:-1)*ROLL_TIP_SPAN);
  }
}
function disposeRollTips(f){
  if(!f.rollTip)return;
  for(var i=0;i<2;i++){scene.remove(f.rollTip[i]);f.rollTip[i].material.dispose();}
  f.rollTip=null; f.rollGlow=0;
}

