/* ===================== loop ===================== */
var prevT=performance.now();
requestAnimationFrame(function loop(now){
  requestAnimationFrame(loop);
  var dt=(now-prevT)/1000; prevT=now; if(dt>.05)dt=.05;
  padTick(dt);
  /* Above the phase check, because a socket does not care which screen is up:
     you can be sitting in the hangar or reading the briefing while the rest of
     the room is already flying, and a dropped connection has to keep retrying
     through all of it. */
  netStep(dt);
  watchFrameRate(dt);
  /* the hangar owns the frame entirely while you are in it */
  if(st.phase==='hangar'){hangarStep(dt);renderFrame(hangarScene,hangarCam);return;}
  if(st.started&&!st.paused)step(dt); else env(Math.min(dt,.016));
  audioEngine();
  stepDmgArcs(dt);
  if(toastT>0){toastT-=dt; if(toastT<=0)toastEl.classList.remove('on');}
  for(var gi=0;gi<goalVisuals.length;gi++){
    goalVisuals[gi].rotation.z+=dt*(gi?-.18:.18);
    goalVisuals[gi].material.opacity=.68+Math.sin(now*.003+gi*Math.PI)*.16;
  }
  renderFrame(scene,camera);
});

function env(dt){
  st.hours=(st.hours+dt*st.timeSpeed*24/300)%24;
  /* Two very slow UV drifts keep the generated water alive without replacing
     the real reflective plane with a flat animated billboard. */
  oceanSkin.offset.x=(oceanSkin.offset.x+dt*.0017)%1;
  oceanSkin.offset.y=(oceanSkin.offset.y+dt*.0011)%1;
  var ang=(st.hours/24)*6.283-1.5708;
  sunDir.set(Math.cos(ang),Math.sin(ang),-.38).normalize();
  var dayF=smooth(-.14,.20,sunDir.y),warm=clamp(1-Math.abs(sunDir.y)/.30,0,1);

  wxTimer-=dt; if(wxTimer<=0){wxKey=ORDER[(Math.random()*ORDER.length)|0];wxTimer=rnd(70,140);}
  var tg=WX[wxKey],k=(1-Math.pow(.06,dt))*.6;
  wx.fog+=(tg.fog-wx.fog)*k; wx.cover+=(tg.cover-wx.cover)*k; wx.rain+=(tg.rain-wx.rain)*k;
  wx.wind+=(tg.wind-wx.wind)*k; wx.gust+=(tg.gust-wx.gust)*k;
  windAngle+=dt*.035;
  var gu=1+Math.sin(performance.now()*.0013)*.5+Math.sin(performance.now()*.0041)*.3;
  windVec.set(Math.cos(windAngle),0,Math.sin(windAngle)).multiplyScalar(wx.wind+wx.gust*gu);

  cTop.copy(C.nightTop).lerp(C.dayTop,dayF).lerp(C.duskTop,warm*.55);
  cBot.copy(C.nightBot).lerp(C.dayBot,dayF).lerp(C.duskBot,warm*.75);
  cSun.copy(C.sunWarm).lerp(C.sunHigh,dayF);
  cTop.lerp(C.grey,wx.cover*.42); cBot.lerp(C.grey,wx.cover*.5);
  skyU.top.value.copy(cTop); skyU.bottom.value.copy(cBot);
  skyU.sunCol.value.copy(cSun); skyU.sunDir.value.copy(sunDir); skyU.glow.value=1-wx.cover*.8;
  skyU.cover.value=wx.cover;skyU.time.value=performance.now()*.001;
  scene.fog.color.copy(cBot).lerp(C.grey,.18);
  /* Weather haze belongs to the lower atmosphere. Keeping sea-level fog at a
     15 km sky base erased its deck, structures and faction markings. */
  var ozoneClear=worldFlow.active?smooth(4200,11000,camera.position.y):0;
  scene.fog.density=wx.fog*(1-ozoneClear*.9);

  var shade=1-wx.cover*.62,nightF=1-dayF;
  sunLight.color.copy(cSun); sunLight.intensity=(.08+dayF*1.12)*shade+st.flash*2.2;
  /* Night must still read as night, but the player cannot fly a map that
     disappears. Moon key plus a cool ground bounce preserves terrain relief
     and authored materials without lifting the sky to daytime exposure. */
  moonLight.intensity=nightF*.52*(1-wx.cover*.38);
  hemi.color.copy(cBot);
  cGround.setRGB(.075+dayF*.15,.09+dayF*.11,.13+dayF*.015);
  hemi.groundColor.copy(cGround);
  hemi.intensity=.31+dayF*.31*shade+st.flash;
  /* the city keeps its lights on after dark, which is also the only thing
     that stops a night match reading as an empty black valley */
  if(cityMat){
    var lit=(1-dayF)*.34;
    for(var cm=0;cm<cityNightMats.length;cm++){
      var ml=cm<2?lit:lit*.15;
      cityNightMats[cm].emissive.setRGB(ml,ml*.82,ml*.5);
    }
    if(cityRoofMat)cityRoofMat.emissive.setRGB(lit*.24,lit*.2,lit*.15);
  }
  stars.material.opacity=(1-dayF)*(1-wx.cover*.85);
  moon.material.opacity=(1-dayF)*.9*(1-wx.cover*.8);
  sea.material.color.copy(cBot).multiplyScalar(.42).lerp(new THREE.Color(0x14405f),.55);

  st.flash=Math.max(0,st.flash-dt*4.5);
  if(wxKey==='storm'&&Math.random()<dt*.55)st.flash=cfg.motion?.22:.9;
  el.flash.style.opacity=cfg.motion?0:(st.flash*.5).toFixed(3);

  var anchor=player.alive?player.pos:core.pos;
  updateTerrain(anchor.x,anchor.z);
  sea.position.set(anchor.x,0,anchor.z);
  sky.position.copy(camera.position); stars.position.copy(camera.position);
  moon.position.copy(camera.position).addScaledVector(sunDir,-10000);
  ceiling.position.set(anchor.x,1400,anchor.z);
  ceiling.material.opacity=clamp((wx.cover-.5)*1.7,0,.85);
  ceiling.material.color.copy(cBot).lerp(C.grey,.4);
  ceilTex.offset.x+=dt*.004;

  var half=SPAN/2;
  for(var i=0;i<clouds.length;i++){
    var c=clouds[i];
    c.position.x+=windVec.x*dt*.35; c.position.z+=windVec.z*dt*.35;
    if(c.position.x-anchor.x>half)c.position.x-=SPAN; else if(c.position.x-anchor.x<-half)c.position.x+=SPAN;
    if(c.position.z-anchor.z>half)c.position.z-=SPAN; else if(c.position.z-anchor.z<-half)c.position.z+=SPAN;
    c.material.opacity=clamp(wx.cover*.62,0,.58)*((i/clouds.length<wx.cover)?1:0);
    c.material.color.copy(cBot).lerp(cSun,dayF*.35).lerp(C.grey,wx.cover*.35);
  }

  rain.material.opacity=wx.rain*.55;
  if(wx.rain>.02){
    rain.visible=true;
    var fallY=-(220+wx.rain*160)*dt;
    var streak=new THREE.Vector3(-windVec.x*.16,9+wx.rain*7,-windVec.z*.16);
    for(var r2=0;r2<RAIN_N;r2++){
      var p=rainPt[r2]; p.y+=fallY; p.x+=windVec.x*dt*.35; p.z+=windVec.z*dt*.35;
      if(p.y<-90){p.y=140;p.x=rnd(-130,130);p.z=rnd(-130,130);}
      if(p.x>140)p.x-=280; else if(p.x<-140)p.x+=280;
      if(p.z>140)p.z-=280; else if(p.z<-140)p.z+=280;
      var o2=r2*6;
      rainPos[o2]=p.x;rainPos[o2+1]=p.y;rainPos[o2+2]=p.z;
      rainPos[o2+3]=p.x+streak.x;rainPos[o2+4]=p.y+streak.y;rainPos[o2+5]=p.z+streak.z;
    }
    rainGeo.attributes.position.needsUpdate=true;
    rain.position.copy(camera.position);
  } else rain.visible=false;

  /* Airflow cue. Driven by the camera subject rather than the player, so it is
     right in the chase, the cockpit and a spectate camera alike. */
  stepSpeedLines(dt,(st.phase==='hangar'||st.phase==='ground')?null:player);

  /* The sun is a shadow caster now, so its placement is the shadow frustum's
     placement — see frameShadowCamera in 08a-render-quality.js. With shadows
     off it falls back to the old fixed offset, which is all a non-casting
     directional light needs. */
  if(sunLight.castShadow)frameShadowCamera(anchor);
  else{
    sunLight.position.copy(anchor).addScaledVector(sunDir,2600);
    sunLight.target.position.copy(anchor);
  }
  moonLight.position.copy(anchor).addScaledVector(sunDir,-2600);
  moonLight.target.position.copy(anchor);
  stepFx(dt);
}

/* ---------- player control ---------- */
/* burner pool and the aim zoom, both held rather than toggled */
var burner={fuel:1,lit:false,cool:0};
var zoom={on:false,k:0};

function playerControl(dt){
  /* throttle: W/S, the THR buttons or the d-pad trim it; SHIFT or A firewalls,
     CTRL or the left trigger idles */
  if(keys.KeyW||touchIn.thrUp||padIn.thrUp)player.throttle=clamp(player.throttle+dt*.55,0,1);
  if(keys.KeyS||touchIn.thrDn||padIn.thrDn)player.throttle=clamp(player.throttle-dt*.55,0,1);
  var thr=player.throttle;
  var wantBurn=!!(keys.ShiftLeft||keys.ShiftRight||touchIn.boost||padIn.boost);
  if(wantBurn)thr=1;
  if(keys.ControlLeft||keys.ControlRight||padIn.idle){thr=0;wantBurn=false;}

  /* The burner needs a floor to relight from, so feathering the button cannot
     be used as an infinite one — you either commit to the burn or you cool. */
  if(wantBurn&&!burner.lit&&burner.fuel>AB_RELIGHT)burner.lit=true;
  if(!wantBurn||burner.fuel<=0||!player.alive)burner.lit=false;
  if(burner.lit){
    burner.fuel=clamp(burner.fuel-dt*AB_DRAIN,0,1);
    burner.cool=AB_COOL;
    if(burner.fuel<=0){burner.lit=false;banner('BURNER DRY',1);}
  } else if(wantBurn){
    /* Holding the button through a dry burner must not refill it. Without this
       the pool cools for a moment, creeps back over the relight floor, lights
       again on its own and the "limited" burner becomes a permanent one at
       about a 40% duty cycle — you have to let go of it. */
    burner.cool=AB_COOL;
  } else if(burner.cool>0)burner.cool-=dt;
  else burner.fuel=clamp(burner.fuel+dt*AB_RECHARGE,0,1);

  /* Zoom: hold L1 on a pad, the right mouse button, or Z. Narrowing the field
     of view without narrowing the mouse gain would make the reticle jumpy at
     exactly the moment you are trying to be precise, so the two move together
     — that is what makes a zoomed pass feel steady rather than twitchy. */
  zoom.on=!!(padIn.zoom||touchIn.zoom||keys.KeyZ||mouseRight)&&player.alive&&!st.over;
  zoom.k+=((zoom.on?1:0)-zoom.k)*Math.min(1,dt*7);

  /* the thumbstick and the gamepad stick drive the same aim vector the mouse
     does, and spring back to centre so the aircraft flies straight when let go */
  if(IS_TOUCH){
    if(stick.active){
      aim.x=stick.dx*AIM_R*zoomGain();
      aim.y=-stick.dy*AIM_R*st.invertY*zoomGain();
    } else {
      var k=Math.min(1,dt*5);
      aim.x+=(0-aim.x)*k; aim.y+=(0-aim.y)*k;
    }
  } else if(padAimT>0){
    /* the stick owns the reticle while it is deflected and for a moment after,
       then hands back to the mouse so both can be used on the same machine */
    padAimT-=dt;
    if(padIn.aimX||padIn.aimY){
      aim.x=padIn.aimX*AIM_R*zoomGain();
      aim.y=-padIn.aimY*AIM_R*st.invertY*zoomGain();
    } else {
      var kp=Math.min(1,dt*5);
      aim.x+=(0-aim.x)*kp; aim.y+=(0-aim.y)*kp;
    }
  }

  /* where the reticle points, in the world */
  tmpV.set(aim.x,aim.y,0.5).unproject(camera).sub(camera.position).normalize();
  aimDir.copy(tmpV);

  var ctl;
  var canAim=st.locked||IS_TOUCH||st.mouseSeen||st.padSeen;
  axes(player);
  var bankNow=Math.atan2(-_r.y,_u.y);
  var kTurn=((keys.KeyD||keys.ArrowRight)?1:0)-((keys.KeyA||keys.ArrowLeft)?1:0);
  var kPitch=(keys.ArrowUp?1:0)-(keys.ArrowDown?1:0);

  if(kTurn!==0||kPitch!==0){
    /* keyboard: bank to a target and hold it, then pull — that's what turns
       an aeroplane. Raw roll input alone just rolls you in circles.

       The bank target ramps while the key is held, which is what makes one key
       do two jobs: a tap is a crisp 53 deg correction that stops where you put
       it, holding winds up to 80 deg and the governor pulls it round at the
       best rate the wing has. */
    if(kTurn!==0&&kTurn===turnDir)turnHold=Math.min(1,turnHold+dt/TURN_RAMP);
    else turnHold=0;
    turnDir=kTurn;
    var bankWant=kTurn*(BANK_SNAP+(BANK_MAX-BANK_SNAP)*turnHold);
    var pitchCmd=kPitch*st.invertY;
    if(kTurn!==0&&kPitch===0){
      /* Level turn: the load factor that holds altitude at a bank angle is
         1/cos, taken from the bank the aircraft is actually at rather than the
         one being rolled towards — pulling for 80 deg while still passing
         through 20 balloons you several hundred feet up on every roll-in. A
         slow vertical-speed trim then mops up what the wing cannot deliver. */
      pitchCmd=clamp(alphaPull(player,bankLoad(bankNow))
                     +clamp(-player.vel.y*0.006,-0.30,0.30),-1,1);
    }
    ctl={pitch:pitchCmd,
         roll:kTurn!==0?clamp(-(bankWant-bankNow)*ROLL_GAIN,-1,1)
                       :clamp(-bankNow*LEVEL_GAIN,-1,1),
         yaw:0,throttle:thr,burner:burner.lit};
  } else if(canAim){
    turnHold=0; turnDir=0;
    ctl=steerTo(player,aimDir,2.2,true);
    ctl.throttle=thr; ctl.burner=burner.lit;
    /* light damping only — the old 0.85 on roll was most of why the reticle
       felt like it was steering through treacle */
    ctl.pitch*=0.95; ctl.roll*=0.97;
  } else {
    /* nothing touched yet: roll wings level and fly on */
    turnHold=0; turnDir=0;
    ctl={pitch:0,roll:clamp(-bankNow*LEVEL_GAIN,-1,1),yaw:0,throttle:thr,burner:burner.lit};
  }

  ctl=applyRoll(player,ctl,dt);
  stepFlight(player,ctl,dt);
  player.cannonCd-=dt;
  if(keys.Space||mouseDown||touchIn.fire||padIn.fire)fire(player);
}

function step(dt){
  env(dt);
  stepWorldFlow(dt);
  stepWorldDistricts(dt);
  /* the match clock, the Core and the rings belong to an Arena match; a
     campaign mission owns its own pacing (STORY-BIBLE section 15). */
  if(st.mode==='arena'&&!st.over){
    st.time-=dt;
    /* Online, the clock still runs down locally so the HUD reads smoothly, but
       the server's value overwrites it about once a second and the server is
       the only thing allowed to call the match. Ending it locally would let two
       clients disagree about when time ran out. */
    if(st.time<=0){st.time=0; if(!net.on)endMatch();}
  }

  if(player.alive&&!st.over){
    if(salvage.on)groundControl(dt);
    else if(!salvage.landed&&!(worldFlow.active&&worldFlow.transition))playerControl(dt);
  }

  for(var i=0;i<fighters.length;i++){
    var f=fighters[i];
    var remote=netIsRemote(f);
    f.invuln=Math.max(0,f.invuln-dt);
    if(!f.alive){
      f.respawnT-=dt;
      disposeRollTips(f);
      /* A remote wreck comes back when its owner says so, not on our clock. */
      if(remote){netStepRemote(f,dt);continue;}
      if(f.respawnT<=0&&!st.over){respawnFighter(f);feed(tag(f)+' is airborne');}
      continue;
    }
    stepRollTips(f,dt);
    if(remote)netStepRemote(f,dt);
    else if(!f.isPlayer&&!st.over)aiFor(f,dt);

    /* Terrain and the ceiling are simulation, and a remote aircraft is not
       simulated here — its owner has already flown it into the hill or not. */
    if(!remote&&!(f===player&&(salvage.on||salvage.landed))){
      var deck=f===player&&st.mode==='world'?skyDeckAt(f.pos.x,f.pos.z):null;
      var gh=deck?deck.height:ground(f.pos.x,f.pos.z);
      var districtTop=f===player&&st.mode==='world'?districtObstacleHeightAt(f.pos.x,f.pos.z):null;
      if(districtTop!==null&&f.pos.y<districtTop+5){kill(f,null);continue;}
      if(f.pos.y-gh<8){
        if(f===player&&f.speed<=150&&f.vel.y>-55){settleAircraft(gh,deck?'skybase':'ground');continue;}
        kill(f,null);continue;
      }
      /* Open sky: altitude changes aircraft performance through airDensity, but
         does not inflict arbitrary damage. The final clamp is numerical safety
         beyond the visible atmosphere, not a tactical boundary. */
      if(f.pos.y>CEIL_HARD)f.ceilT+=dt; else f.ceilT=0;
      if(f.pos.y>CEIL_MAX){f.pos.y=CEIL_MAX;if(f.vel.y>0)f.vel.y=0;}
    }

    f.boundT=0;
    if(f.isPlayer)el.warn.style.opacity=0;

    var bea=f.mesh.userData.beacon;
    if(bea){
      bea.material.opacity=f.carrying?.78:(f.invuln>0?(Math.sin(performance.now()*.02)>0?.58:.08):.22);
      bea.material.color.setHex(f.carrying?0xffb347:TEAM_COL[f.team]);
      bea.scale.setScalar(f.carrying?34:16);
    }
  }

  stepBullets(dt);
  stepStructs(dt);
  stepDrones(dt);
  if(st.mode==='arena'){stepGoalRings(dt);stepCore(dt);}
  stepSites(dt);
  /* The radio steps outside stepMission because the last lines of a mission are
     queued by its reward(), which runs after mission.running has already gone
     false — those lines used to be written and never spoken. */
  stepRadio(dt);
  if(mission.running)stepMission(dt);
  stepLock(dt);
  if(!salvage.on){gpwsCheck(dt);camWork(dt);}
  hudWork(dt);
}

/* ---------- bullets ---------- */
function stepBullets(dt){
  for(var i=bullets.length-1;i>=0;i--){
    var b=bullets[i];
    /* A guided tracer receives only a short, rate-limited correction. The
       target still has to stay in a forward cone; once the allowance expires
       the round continues on the heading it earned. */
    if(b.guide&&b.guideT>0&&targetAlive(b.guide)){
      var guideSpeed=b.v.length();
      targetPoint(b.guide,_guideV);
      var guideLead=Math.min(.65,_guideV.distanceTo(b.p)/Math.max(guideSpeed,1));
      _guideV.addScaledVector(targetVelocity(b.guide,_tv2),guideLead).sub(b.p).normalize();
      _guideDir.copy(b.v).normalize();
      if(_guideDir.dot(_guideV)>GUIDE_TRACK_CONE){
        var guideAlpha=Math.min(1,GUIDE_TURN*dt*(.45+.55*b.guideT/GUIDE_TIME));
        _guideDir.lerp(_guideV,guideAlpha).normalize();
        b.v.copy(_guideDir).multiplyScalar(guideSpeed);
      }
      b.guideT-=dt;
    }
    var prev=tmpV.copy(b.p);
    b.p.addScaledVector(b.v,dt); b.life-=dt;
    var dead=b.life<=0;
    if(!dead&&ground(b.p.x,b.p.z)>b.p.y){boom(b.p,26);dead=true;}
    if(!dead){
      for(var j=0;j<fighters.length;j++){
        var f=fighters[j];
        if(!f.alive||f.team===b.team||f.invuln>0)continue;
        var seg=tmpV2.copy(b.p).sub(prev);
        var L2=seg.lengthSq(); if(L2<1e-6)continue;
        var t=clamp(tmpV3.copy(f.pos).sub(prev).dot(seg)/L2,0,1);
        var cx=prev.x+seg.x*t,cy=prev.y+seg.y*t,cz=prev.z+seg.z*t;
        var dx=cx-f.pos.x,dy=cy-f.pos.y,dz=cz-f.pos.z;
        if(dx*dx+dy*dy+dz*dz<HIT_RADIUS*HIT_RADIUS){
          /* A round only does damage on the machine that fired it. Every client
             draws every tracer — including ones spawned locally to show a remote
             pilot shooting — but those pass through, or eight machines would
             each subtract the same fourteen points. If the target belongs to
             someone else, the hit is claimed and their machine decides. */
          if(netOwnsEntity(b.owner)){
            if(netOwns(f))hurt(f,b.dmg||BULLET_DMG,b.owner);
            else netClaimHit(f,b.dmg||BULLET_DMG,b.owner);
          }
          if(b.owner===player){st.hitmark=.12;sortie.hits++;tone(1500,.05,.12,'square');}
          boom(new THREE.Vector3(cx,cy,cz),18); dead=true; break;
        }
      }
    }
    /* ground structures are fat, stationary and only worth a cylinder test */
    if(!dead){
      for(var s2=0;s2<structs.length;s2++){
        var sc=structs[s2];
        if(!sc.alive||sc.team===b.team)continue;
        var sdx=b.p.x-sc.pos.x,sdz=b.p.z-sc.pos.z;
        if(sdx*sdx+sdz*sdz<sc.radius*sc.radius&&
           b.p.y>sc.pos.y-10&&b.p.y<sc.pos.y+sc.height){
          hurtStruct(sc,b.dmg||BULLET_DMG,b.owner);
          if(b.owner===player){st.hitmark=.12;sortie.hits++;tone(1500,.05,.12,'square');}
          boom(b.p,16); dead=true; break;
        }
      }
    }
    /* mission installations — towers, relays, platforms, carrier sections.
       Same fat cylinder the league structures get, and only league rounds
       count: a defence platform cannot shoot its own carrier apart. */
    if(!dead&&b.team!=='blackwing'){
      for(var si=0;si<sites.length;si++){
        var sit=sites[si];
        if(!sit.alive||sit.hold)continue;
        var idx=b.p.x-sit.pos.x,idz=b.p.z-sit.pos.z;
        if(idx*idx+idz*idz<sit.radius*sit.radius&&
           b.p.y>sit.pos.y-10&&b.p.y<sit.pos.y+sit.height){
          hurtSite(sit,b.dmg||BULLET_DMG,b.owner);
          if(b.owner===player){st.hitmark=.12;sortie.hits++;tone(1500,.05,.12,'square');}
          boom(b.p,16); dead=true; break;
        }
      }
    }
    /* mission traffic — cargo, transports, raiders, rivals. Passive aircraft
       are hit only by hostile fire; hostiles are hit only by league fire. */
    if(!dead){
      for(var c2=0;c2<convoy.length;c2++){
        var cv=convoy[c2];
        if(!cv.alive)continue;
        if(cv.hostile===(b.team==='blackwing'))continue;
        var cdx=b.p.x-cv.pos.x,cdy=b.p.y-cv.pos.y,cdz=b.p.z-cv.pos.z;
        var cr=cv.maxHp>150?26:HIT_RADIUS;
        if(cdx*cdx+cdy*cdy+cdz*cdz<cr*cr){
          cv.hp-=b.dmg||BULLET_DMG;
          if(b.owner===player){st.hitmark=.12;sortie.hits++;tone(1500,.05,.12,'square');}
          if(cv.hp<=0){
            cv.alive=false; cv.mesh.visible=false; boom(cv.pos,cv.maxHp>150?220:130);
            feed('<span style="color:'+(cv.hostile?'#b98cff':'#ffb347')+'">'+cv.name+
              (cv.hostile?' DOWN':' LOST')+'</span>');
          } else boom(b.p,14);
          dead=true; break;
        }
      }
    }
    /* raid drones: hit by everyone except their own rounds */
    if(!dead&&b.team!=='blackwing'){
      for(var d2=0;d2<drones.length;d2++){
        var dr=drones[d2];
        if(!dr.alive)continue;
        var ddx=b.p.x-dr.pos.x,ddy=b.p.y-dr.pos.y,ddz=b.p.z-dr.pos.z;
        if(ddx*ddx+ddy*ddy+ddz*ddz<HIT_RADIUS*HIT_RADIUS){
          dr.hp-=b.dmg||BULLET_DMG;
          if(b.owner===player){st.hitmark=.12;sortie.hits++;tone(1500,.05,.12,'square');}
          if(dr.hp<=0){killDrone(dr); if(b.owner===player)sortie.kills++;}
          else boom(b.p,14);
          dead=true; break;
        }
      }
    }
    if(dead)bullets.splice(i,1);
  }
  for(var k=0;k<B_MAX;k++){
    var o=k*6;
    if(k<bullets.length){
      var bb=bullets[k],sp2=bb.v.length();
      var ux=bb.v.x/sp2,uy=bb.v.y/sp2,uz=bb.v.z/sp2;
      bPos[o]=bb.p.x;bPos[o+1]=bb.p.y;bPos[o+2]=bb.p.z;
      bPos[o+3]=bb.p.x-ux*14;bPos[o+4]=bb.p.y-uy*14;bPos[o+5]=bb.p.z-uz*14;
    } else {bPos[o]=bPos[o+3]=0;bPos[o+1]=bPos[o+4]=-99999;bPos[o+2]=bPos[o+5]=0;}
  }
  bGeo.attributes.position.needsUpdate=true;
}

/* ---------- camera ---------- */
var camOff=new THREE.Vector3(),camWant=new THREE.Vector3(),camLook=new THREE.Vector3(),
    camLookWant=new THREE.Vector3(),camTargetDir=new THREE.Vector3(),camLookReady=false,
    camFlatRight=new THREE.Vector3(),camModeSeen=-1;
function camWork(dt){
  var subject=player.alive?player:(core.carrier||fighters.find(function(o){return o.alive;})||player);
  axes(subject);
  var bank=Math.atan2(-_r.y,_u.y);
  var turnPivot=st.camMode===2||cfg.motion?0:smooth(.30,1.18,Math.abs(bank));
  if(st.camMode===0)camOff.set(-Math.sin(bank)*5.2*turnPivot,6.5,26+turnPivot*4.5);
  else if(st.camMode===1)camOff.set(-Math.sin(bank)*2.7*turnPivot,3.6,14+turnPivot*2.2);
  else camOff.set(0,1.5,.6);
  if(st.camMode===2){
    camWant.copy(camOff).applyQuaternion(subject.quat).add(subject.pos);
  }else{
    /* Follow heading and pitch, but keep chase-camera height tied to world-up.
       Rotating the entire offset by the airframe quaternion made a hard bank
       swing the camera sideways into terrain and roll the island nearly 90°. */
    camFlatRight.crossVectors(_f,WORLD_UP);
    if(camFlatRight.lengthSq()<.001)camFlatRight.set(_r.x,0,_r.z);
    camFlatRight.normalize();
    camWant.copy(subject.pos)
      .addScaledVector(camFlatRight,camOff.x)
      .addScaledVector(WORLD_UP,camOff.y)
      .addScaledVector(_f,-camOff.z);
  }
  camera.position.lerp(camWant,st.camMode===2?1:1-Math.pow(.0012,dt));
  var cg=ground(camera.position.x,camera.position.z)+4;
  if(camera.position.y<cg)camera.position.y=cg;
  /* buffet and hit shake — the first thing to go when motion is reduced */
  var jitter=cfg.motion?0:shake*2.2+(subject.stalled?0.9:0);
  if(jitter>0.01){
    camera.position.x+=rnd(-jitter,jitter);
    camera.position.y+=rnd(-jitter,jitter);
    camera.position.z+=rnd(-jitter,jitter);
  }
  var lookDist=st.camMode===2?60:(st.camMode===0?38:30);
  camLookWant.copy(subject.pos).addScaledVector(_f,lookDist);
  /* At altitude, a fixed level sightline can put the entire island below the
     viewport even though it is directly under the aircraft. Gradually pitch
     only the chase camera toward the terrain; cockpit view and flight physics
     remain untouched. */
  if(st.camMode!==2){
    var cameraAgl=Math.max(0,subject.pos.y-ground(subject.pos.x,subject.pos.z));
    var mapReveal=3+smooth(180,1100,cameraAgl)*(LOW?17:22);
    camLookWant.y-=mapReveal;
  }
  /* Wide banks pivot the sightline into the turn. A live lock adds a capped
     bias toward the other aircraft, so both planes stay readable without
     pulling the player out of frame. */
  if(turnPivot>0)camLookWant.addScaledVector(_r,Math.sin(bank)*12*turnPivot);
  var tracked=!cfg.motion&&lockOn.target&&lockOn.target.alive?lockOn.target:null;
  if(tracked&&st.camMode!==2){
    camTargetDir.copy(tracked.pos).sub(subject.pos);
    var trackRange=camTargetDir.length();
    if(trackRange>1)camLookWant.addScaledVector(camTargetDir.multiplyScalar(1/trackRange),
      Math.min(42,trackRange*.075)*(.38+turnPivot*.38));
  }
  if(!camLookReady||camModeSeen!==st.camMode){
    camLook.copy(camLookWant);camLookReady=true;camModeSeen=st.camMode;
  }
  else camLook.lerp(camLookWant,1-Math.pow(.018,dt));
  camera.up.copy(WORLD_UP).lerp(
    _u,st.camMode===2?1:(LOW?.08:.18+turnPivot*.10)
  ).normalize();
  camera.lookAt(camLook);
  var targetFov=70+(st.camMode===2?0:turnPivot*6);
  /* Narrow for gun work. The lerp below already eases it, so holding and
     releasing the zoom is a glide rather than a snap. */
  if(typeof zoom!=='undefined')targetFov-=zoom.k*30;
  if(Math.abs(camera.fov-targetFov)>.03){
    camera.fov+=(targetFov-camera.fov)*Math.min(1,dt*4.5);
    camera.updateProjectionMatrix();
  }
  subject.mesh.visible=!(st.camMode===2&&subject===player);
}

/* ---------- HUD ---------- */
function project(p){
  tmpV.copy(p).project(camera);
  return {x:(tmpV.x*.5+.5)*innerWidth,y:(-tmpV.y*.5+.5)*innerHeight,vis:tmpV.z<1};
}
function place(node,pt,on){
  if(!on||!pt.vis){node.style.opacity=0;return;}
  node.style.opacity=1;node.style.left=pt.x+'px';node.style.top=pt.y+'px';
}
function hudWork(dt){
  var alive=player.alive;
  el.spd.innerHTML=Math.round(player.speed*1.1)+'<small>KTS</small>';
  el.alt.innerHTML=Math.round(player.pos.y*3.6)+'<small>FT</small>';
  el.aoa.innerHTML=(player.alpha*57.3).toFixed(0)+'<small>&deg;</small> '+player.gLoad.toFixed(1)+'<small>G</small>';
  el.hpv.textContent=Math.round(player.hp);
  el.hpBar.style.width=Math.max(0,player.hp)+'%';
  el.thrBar.style.width=Math.round(player.throttle*100)+'%';
  if(el.abBar){
    el.abBar.style.width=Math.round(burner.fuel*100)+'%';
    el.abTag.className=burner.lit?'lit':(burner.fuel<AB_RELIGHT?'dry':'');
    el.abTag.textContent=burner.lit?'BURNER LIT'
      :(burner.fuel<AB_RELIGHT?'BURNER COOLING':'BURNER');
  }
  if(el.zoomVig){
    el.zoomVig.style.opacity=zoom.k.toFixed(3);
    el.zoomTag.style.opacity=(zoom.k*0.9).toFixed(3);
  }
  var sys=[];
  if(player.dmgEng>0)sys.push(player.dmgEng>=1?'ENGINE OUT':'ENGINE');
  if(player.dmgAil>0)sys.push(player.dmgAil>=1?'AILERON OUT':'AILERON');
  el.sysDmg.textContent=sys.join(' · ');

  axes(player);
  var hdg=(Math.atan2(_f.x,-_f.z)*180/Math.PI+360)%360;
  el.hdgRead.textContent=('00'+Math.round(hdg)).slice(-3);
  el.tapeInner.style.transform='translateX('+(-hdg*PPD)+'px)';

  el.sB.textContent=st.scoreB; el.sR.textContent=st.scoreR;
  el.clock.textContent=('0'+Math.floor(st.time/60)).slice(-2)+':'+('0'+Math.floor(st.time%60)).slice(-2);

  var h=core.carrier;
  if(h){
    var g=GOALS[h.team];
    el.coreLine.textContent=(h===player?'YOU HAVE THE CORE':
      (h.team===player.team?'ALLY CARRIER — ':'ENEMY CARRIER — ')+h.name)+
      ' · '+Math.round(core.charge)+'% CHARGE · '+
      (Math.hypot(h.pos.x-g.x,h.pos.z-g.z)/1000).toFixed(2)+' KM TO THE RING';
  } else {
    el.coreLine.textContent='CORE LOOSE · '+
      (Math.hypot(core.pos.x-player.pos.x,core.pos.z-player.pos.z)/1000).toFixed(2)+' KM';
  }

  el.wx.textContent=WX[wxKey].name;
  var wDeg=((-windAngle*180/Math.PI+180)%360+360)%360;
  el.wxsub.textContent='WIND '+('00'+Math.round(wDeg)).slice(-3)+'/'+('0'+Math.round(wx.wind)).slice(-2)+
    ' · '+('0'+Math.floor(st.hours)).slice(-2)+':'+('0'+Math.floor(st.hours%1*60)).slice(-2)+
    (st.timeSpeed>1?' x'+st.timeSpeed:'');

  for(var i=0;i<fighters.length;i++){
    var f=fighters[i],d=rosterEls[i];
    d.classList.toggle('dead',!f.alive);
    d.classList.toggle('carry',f.carrying);
    d.querySelector('b').textContent=f.alive?(Math.round(f.hp)+'%'):(Math.ceil(f.respawnT)+'s');
  }

  /* --- aiming furniture --- */
  st.hitmark=Math.max(0,st.hitmark-dt);
  st.dmgFlash=Math.max(0,st.dmgFlash-dt*1.6);
  el.dmg.style.opacity=st.dmgFlash*.9;
  el.pip.classList.toggle('hit',st.hitmark>0);
  el.aimRet.classList.toggle('stall',player.stalled);

  /* mouse reticle */
  if(salvage.on){
    el.aimRet.style.opacity=.9;
    el.aimRet.style.left=(innerWidth*.5)+'px';
    el.aimRet.style.top=(innerHeight*.5)+'px';
  } else if(alive&&(st.locked||IS_TOUCH)){
    el.aimRet.style.opacity=.9;
    el.aimRet.style.left=((aim.x*.5+.5)*innerWidth)+'px';
    el.aimRet.style.top=((-aim.y*.5+.5)*innerHeight)+'px';
  } else el.aimRet.style.opacity=0;

  /* velocity vector: where the aircraft is actually going */
  var vp=tmpV3.copy(player.vel);
  place(el.vpath,project(tmpV2.copy(player.pos).addScaledVector(vp.normalize(),700)),alive&&player.speed>15);

  targetHud(alive);

  if(!alive&&!st.over){el.center.textContent='REBUILDING AIRFRAME — '+Math.ceil(player.respawnT);bannerT=.2;}
  else if(bannerT>0){bannerT-=dt; if(bannerT<=0)el.center.textContent='';}

  var pr='';
  if(worldFlow.active&&worldFlow.transition)pr='ATMOSPHERIC INSERTION · AUTO ROUTE';
  else if(salvage.landed&&!salvage.on)pr='LANDED · G TO EXIT AIRCRAFT';
  else if(!IS_TOUCH&&!st.mouseSeen&&alive)pr='MOVE THE MOUSE TO STEER  ·  A / D TO TURN';
  else if(core.carrier===player)pr='F — PASS THE CORE';
  else if(player.stalled)pr='STALLED — EASE OFF AND LET THE NOSE DROP';
  else if(!core.carrier&&alive&&player.pos.distanceTo(core.pos)<450)pr='FLY THROUGH THE CORE';
  el.prompt.textContent=pr; el.prompt.style.opacity=pr?1:0;

  /* barrel-roll state + touch button availability */
  var rh=document.getElementById('rollHud');
  if(rh){
    if(player.roll.t>0){rh.textContent='BARREL ROLL';rh.style.opacity=1;}
    else if(player.roll.cd>0){rh.textContent='ROLL '+player.roll.cd.toFixed(1)+'s';rh.style.opacity=.45;}
    else if(alive&&player.speed>=70){rh.textContent='ROLL READY';rh.style.opacity=.55;}
    else rh.style.opacity=0;
  }
  if(IS_TOUCH){
    var pb=document.getElementById('tPass'),rb=document.getElementById('tRoll'),
        lb=document.getElementById('tLock');
    if(pb)pb.classList.toggle('off',core.carrier!==player);
    if(rb)rb.classList.toggle('off',player.roll.cd>0||!alive);
    if(lb){lb.classList.toggle('armed',lockOn.manual||lockOn.assisted);
      lb.classList.toggle('off',!lockOn.target&&!lockOn.manual);}
  }

  drawMap();
  coachTick();
  if(player.stalled&&!sortie.stalling){sortie.stalling=true;sortie.stalls++;emit('stall_enter');}
  else if(!player.stalled&&sortie.stalling){sortie.stalling=false;emit('stall_exit');}
}
