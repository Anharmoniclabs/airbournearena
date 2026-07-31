/* ===================== HUD refs ===================== */
var el={};['spd','alt','aoa','hpv','hpBar','thrBar','sysDmg','sB','sR','clock','coreLine','tapeInner','hdgRead',
  'wx','wxsub','roster','aimRet','pip','lead','vpath','dmg','flash','center','warn','prompt',
  'end','endT','endS','mapWrap','hud','brief','abBar','abTag','zoomVig','zoomTag'].forEach(function(id){el[id]=document.getElementById(id);});
var PPD=2.3;
for(var dg=-180;dg<=540;dg+=5){
  var tk=document.createElement('div'),maj=(dg%45===0);
  tk.className='tick '+(maj?'maj':'min'); tk.style.left=(dg*PPD)+'px'; el.tapeInner.appendChild(tk);
  if(maj){var cd2=document.createElement('div');cd2.className='cardinal';
    var dd=((dg%360)+360)%360;
    cd2.textContent=({0:'N',45:'NE',90:'E',135:'SE',180:'S',225:'SW',270:'W',315:'NW'})[dd]||'';
    cd2.style.left=(dg*PPD)+'px'; el.tapeInner.appendChild(cd2);}
}
/* Rebuildable, because the callsign and the side you fly for are both chosen
   in the hangar and can change before the first sortie. */
var rosterEls=[];
function renderRoster(){
  if(!el.roster)return;
  el.roster.innerHTML=''; rosterEls.length=0;
  fighters.forEach(function(f){
    var d=document.createElement('div');
    d.className='pilot '+(f.team==='blue'?'b':'r')+(f.isPlayer?' me':'');
    d.innerHTML='<span class="d"></span>'+f.name+'<b>—</b>';
    el.roster.appendChild(d); rosterEls.push(d);
  });
}
renderRoster();
var bannerT=0;
function banner(msg,t){el.center.textContent=msg;bannerT=t||1.2;}

var coachSteps=[
  {goal:'Build speed and bank through the arena.',hint:'W adds throttle. Hold A / D to tighten the turn.'},
  {goal:'Learn the energy trade.',hint:'Climb to gain height, then lower the nose to recover speed.'},
  /* Slot 2 is filled in by coachEnvelopeStep() — see below. */
  {goal:'Recover cleanly from a stall.',hint:'Ease off the turn and let the nose fall until airflow returns.'},
  {goal:'Secure the drifting case.',hint:'Fly through the amber hard case at midfield.'},
  {goal:'Pass before the trap closes.',hint:'While carrying, press F to throw the case forward.'},
  {goal:'Finish the run.',hint:'Carry the case through the enemy ring in the east.'}
],coachIndex=0,coachSeenStall=false,coachSeenHover=false,coachEnabled=true;

/* The third sortie lesson teaches the bottom of the envelope, and what lives
   down there depends on the flight model. On the energy model it is a stall you
   have to fly out of. With zero-point flight there is no stall to have, so the
   same slot teaches station-keeping instead — which is the more useful lesson
   anyway, because hovering is the thing a pilot arriving from any other flight
   game will not think to try.

   This is not cosmetic: the step used to wait on player.stalled, and with
   zero-point on that never becomes true, so the first sortie could not be
   completed at all. */
var COACH_STALL={goal:'Recover cleanly from a stall.',
      hint:'Ease off the turn and let the nose fall until airflow returns.'},
    COACH_HOVER={goal:'Come to a stop and hold station.',
      hint:'Cut the throttle. The drive carries you — then point the nose and add throttle to move off.'};
function coachEnvelopeStep(){return cfg.zp?COACH_HOVER:COACH_STALL;}
var coachEl=document.getElementById('coach'),coachGoal=document.getElementById('coachGoal'),
  coachHint=document.getElementById('coachHint'),coachStep=document.getElementById('coachStep'),
  coachBar=document.querySelector('#coachTrack i');
function coachAdvance(){
  if(!coachEnabled)return;
  coachIndex++;
  if(coachIndex>=coachSteps.length){
    coachEnabled=false;coachEl.classList.remove('on');banner('FIRST SORTIE COMPLETE',2);
    emit('tutorial_complete');return;
  }
  banner('OBJECTIVE COMPLETE',.9);renderCoach();
}
function renderCoach(){
  if(!coachEnabled)return;
  var s=coachIndex===2?coachEnvelopeStep():coachSteps[coachIndex];
  coachGoal.textContent=s.goal;coachHint.textContent=s.hint;
  coachStep.textContent=('0'+(coachIndex+1)).slice(-2)+' / 06';
  coachBar.style.width=(coachIndex/coachSteps.length*100)+'%';
  coachEl.classList.toggle('on',st.started);
}
function coachTick(){
  if(!coachEnabled||!player.alive)return;
  if(coachIndex===0&&player.speed>125&&(keys.KeyA||keys.KeyD||Math.abs(aim.x)>.18))coachAdvance();
  else if(coachIndex===1&&player.pos.y>720&&player.speed>110)coachAdvance();
  else if(coachIndex===2){
    if(cfg.zp){
      if(player.hover>.8)coachSeenHover=true;
      if(coachSeenHover&&player.speed>85)coachAdvance();
    } else {
      if(player.stalled)coachSeenStall=true;
      if(coachSeenStall&&!player.stalled&&player.speed>85)coachAdvance();
    }
  } else if(coachIndex===3&&core.carrier===player)coachAdvance();
  else if(coachIndex===4&&sortie.passes>0)coachAdvance();
  else if(coachIndex===5&&sortie.scores>0)coachAdvance();
}

function setPaused(on){
  if(!st.started||st.over)return;
  st.paused=on;document.getElementById('pause').classList.toggle('on',on);
  if(on&&document.exitPointerLock)document.exitPointerLock();
  else if(!IS_TOUCH)lock();
}
bindBtn('resumeBtn',function(){setPaused(false);});

/* minimap */
var MM=372,MM_HALF=3600,mapCv=document.getElementById('map'),mctx=mapCv.getContext('2d');
var baseMap=document.createElement('canvas'); baseMap.width=baseMap.height=MM;
(function bake(){
  var b=baseMap.getContext('2d'),N=110,cell=MM/N;
  for(var iy=0;iy<N;iy++)for(var ix=0;ix<N;ix++){
    var wx3=(ix/N*2-1)*MM_HALF,wz3=(iy/N*2-1)*MM_HALF,h=terrainHeight(wx3,wz3);
    var col;
    if(h<-15)col='#0b2438'; else if(h<0)col='#12405c';
    else if(h<5)col='#b7a377'; else if(h<70)col='#3d6634';
    else if(h<190)col='#4a5a45'; else col='#8e8f8a';
    b.fillStyle=col;b.fillRect(ix*cell,iy*cell,cell+1,cell+1);
  }
  /* Bake the circulation hierarchy into the chart. The terrain raster alone
     hid the civic ring and made the authored district look like empty ground. */
  function line(points,width,color){
    b.beginPath();
    for(var i=0;i<points.length;i++){
      var p=w2m(points[i][0],points[i][1]);
      if(i)b.lineTo(p.x,p.y);else b.moveTo(p.x,p.y);
    }
    b.strokeStyle=color;b.lineWidth=width;b.stroke();
  }
  b.lineCap='round';b.lineJoin='round';
  var avenues=[[-CITY_REACH,0,CITY_REACH,0],[0,-CITY_REACH,0,CITY_REACH],
    [-CITY_REACH,-670,CITY_REACH,-670],[-CITY_REACH,670,CITY_REACH,670],
    [-670,-CITY_REACH,-670,CITY_REACH],[670,-CITY_REACH,670,CITY_REACH]];
  for(var ai=0;ai<avenues.length;ai++){
    var a=avenues[ai];line([[a[0],a[1]],[a[2],a[3]]],2.8,'rgba(5,12,16,.76)');
    line([[a[0],a[1]],[a[2],a[3]]],.8,'rgba(172,194,188,.42)');
  }
  var ring=[];
  for(var ri=0;ri<=64;ri++){var ra=ri/64*Math.PI*2;ring.push([Math.cos(ra)*ROAD_RING_R,Math.sin(ra)*ROAD_RING_R]);}
  line(ring,4.2,'rgba(5,12,16,.82)');line(ring,1.2,'rgba(111,227,208,.48)');
  /* Reserved central blocks contain the authored Blender district. */
  var heroLots=[[-520,-420],[-350,-420],[430,-420],[500,420],[-520,420],
    [-365,420],[335,420],[0,720],[-210,575],[210,575],[-210,-575],[210,-575]];
  b.fillStyle='rgba(160,187,181,.44)';b.strokeStyle='rgba(223,243,255,.34)';b.lineWidth=.8;
  for(var hi=0;hi<heroLots.length;hi++){
    var hp=w2m(heroLots[hi][0],heroLots[hi][1]);
    b.fillRect(hp.x-2.8,hp.y-2.2,5.6,4.4);b.strokeRect(hp.x-2.8,hp.y-2.2,5.6,4.4);
  }
  var coreP=w2m(0,0);b.strokeStyle='rgba(255,179,71,.66)';b.lineWidth=1.2;
  b.beginPath();b.arc(coreP.x,coreP.y,8,0,Math.PI*2);b.stroke();
})();
function w2m(x,z){return {x:(x+MM_HALF)/(2*MM_HALF)*MM,y:(z+MM_HALF)/(2*MM_HALF)*MM};}
function drawMap(){
  mctx.clearRect(0,0,MM,MM); mctx.drawImage(baseMap,0,0);
  mctx.save();
  ['blue','red'].forEach(function(tm){
    var g=w2m(GOALS[tm].x,GOALS[tm].z);
    mctx.globalAlpha=.85; mctx.strokeStyle=teamHex(tm);
    mctx.lineWidth=2;mctx.beginPath();mctx.arc(g.x,g.y,goalR/(2*MM_HALF)*MM,0,7);mctx.stroke();
  });
  ['blue','red'].forEach(function(tm){
    var b=w2m(BASES[tm].x,BASES[tm].z);
    mctx.globalAlpha=.55; mctx.fillStyle=teamHex(tm);
    mctx.fillRect(b.x-6,b.y-6,12,12);
    mctx.globalAlpha=1;
    mctx.strokeStyle='rgba(223,243,255,.5)';mctx.lineWidth=1;mctx.strokeRect(b.x-6,b.y-6,12,12);
  });
  /* ground structures: a filled mark while it stands, a hollow one counting
     back up while it rebuilds, so you can see the window you bought */
  for(var si=0;si<structs.length;si++){
    var s=structs[si],sp=w2m(s.pos.x,s.pos.z),radar=s.kind==='radar';
    mctx.globalAlpha=s.alive?.9:.3;
    mctx.strokeStyle=mctx.fillStyle=teamHex(s.team);
    mctx.lineWidth=1.5;
    mctx.beginPath();
    if(radar){mctx.moveTo(sp.x,sp.y-5);mctx.lineTo(sp.x+5,sp.y+4);mctx.lineTo(sp.x-5,sp.y+4);mctx.closePath();}
    else mctx.arc(sp.x,sp.y,3,0,7);
    if(s.alive)mctx.fill(); else mctx.stroke();
  }
  /* mission traffic and mission installations. Without these a campaign
     objective — a hauler to escort, a relay to reach — exists on the HUD and
     nowhere on the map, which is the one panel a player checks to find it. */
  for(var mi=0;mi<sites.length;mi++){
    var ms=sites[mi]; if(!ms.alive)continue;
    var mp=w2m(ms.pos.x,ms.pos.z);
    mctx.globalAlpha=.92;
    mctx.strokeStyle=ms.hold?(ms.worked?'#6fe3d0':'#ffb347'):'#b98cff';
    mctx.lineWidth=1.6;
    mctx.beginPath(); mctx.rect(mp.x-4,mp.y-4,8,8);
    if(ms.hold&&ms.worked)mctx.fillStyle='#6fe3d0',mctx.fill(); else mctx.stroke();
  }
  for(var ci=0;ci<convoy.length;ci++){
    var cvm=convoy[ci]; if(!cvm.alive)continue;
    var cp=w2m(cvm.pos.x,cvm.pos.z);
    mctx.globalAlpha=.92;
    mctx.fillStyle=cvm.hostile?'#b98cff':'#ffb347';
    mctx.beginPath(); mctx.arc(cp.x,cp.y,cvm.maxHp>150?4.5:3.2,0,7); mctx.fill();
  }
  for(var gi2=0;gi2<gates.length;gi2++){
    var ga=gates[gi2]; if(ga.passed)continue;
    var gp=w2m(ga.pos.x,ga.pos.z),isNext=(ga===gateNext);
    mctx.globalAlpha=isNext?1:.5;
    mctx.strokeStyle=isNext?'#ffb347':'#6fe3d0'; mctx.lineWidth=isNext?2:1.3;
    mctx.beginPath(); mctx.arc(gp.x,gp.y,isNext?6:4,0,7); mctx.stroke();
    /* the one you are heading for gets a filled pip as well, so it reads at a
       glance on a phone-sized minimap */
    if(isNext){mctx.fillStyle='#ffb347';mctx.beginPath();mctx.arc(gp.x,gp.y,2,0,7);mctx.fill();}
  }
  mctx.globalAlpha=1;
  mctx.restore();
  var c=w2m(core.pos.x,core.pos.z);
  mctx.fillStyle='#ffb347';
  var cs=5+Math.sin(performance.now()*.006)*1.4;
  mctx.fillRect(c.x-cs,c.y-cs*.72,cs*2,cs*1.44);
  mctx.strokeStyle='#ffe0a8';mctx.lineWidth=1;mctx.strokeRect(c.x-cs,c.y-cs*.72,cs*2,cs*1.44);
  /* a standing mast is worth the whole picture — this is what the fog of war
     is for, and what makes a tower worth defending */
  var radarUp=teamHasRadar(player.team);
  for(var i=0;i<fighters.length;i++){
    var f=fighters[i]; if(!f.alive)continue;
    var enemy=f.team!==player.team,now=performance.now()*.001;
    if(enemy){
      var range=f.pos.distanceTo(player.pos);
      var pf=tmpV.set(0,0,-1).applyQuaternion(player.quat);
      var bearing=tmpV2.copy(f.pos).sub(player.pos).normalize();
      var inCloud=f.pos.y>820&&f.pos.y<1260;
      /* Radar buys reach and drops the forward-cone requirement, but it cannot
         see into the cloud deck — so the deck stays the counter to it, and
         losing both masts costs you the long look rather than everything. */
      var seen=f.carrying||range<(inCloud?430:900)
             ||(!inCloud&&range<1600&&bearing.dot(pf)>.72)
             ||(radarUp&&!inCloud&&range<2400);
      if(seen){f.lastSeen={x:f.pos.x,z:f.pos.z};f.lastSeenT=now;}
      else {
        if(!f.lastSeen||now-f.lastSeenT>8)continue;
        var ghost=w2m(f.lastSeen.x,f.lastSeen.z);
        mctx.globalAlpha=Math.max(.12,1-(now-f.lastSeenT)/8)*.42;
        mctx.strokeStyle=teamHex(f.team);mctx.lineWidth=1.5;
        mctx.beginPath();mctx.arc(ghost.x,ghost.y,4.5,0,7);mctx.stroke();
        mctx.globalAlpha=1;
        continue;
      }
    }
    var p=w2m(f.pos.x,f.pos.z);
    if(f.isPlayer){
      var fwd=tmpV.set(0,0,-1).applyQuaternion(f.quat);
      mctx.save();mctx.translate(p.x,p.y);mctx.rotate(Math.atan2(fwd.x,-fwd.z));
      mctx.fillStyle='#6fe3d0';mctx.beginPath();
      mctx.moveTo(0,-8);mctx.lineTo(5,6);mctx.lineTo(0,3);mctx.lineTo(-5,6);mctx.closePath();mctx.fill();
      mctx.restore();
    } else {
      mctx.fillStyle=teamHex(f.team);
      mctx.beginPath();mctx.arc(p.x,p.y,f.carrying?5:3.2,0,7);mctx.fill();
    }
    if(f.carrying){mctx.strokeStyle='#ffb347';mctx.lineWidth=1.5;
      mctx.beginPath();mctx.arc(p.x,p.y,8,0,7);mctx.stroke();}
    if(f===lockOn.target){mctx.strokeStyle=lockOn.manual?'#ffb347':'rgba(255,179,71,.6)';
      mctx.lineWidth=1.5;mctx.strokeRect(p.x-7,p.y-7,14,14);}
  }
}

