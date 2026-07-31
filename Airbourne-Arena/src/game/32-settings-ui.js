/* ===================== settings UI ===================== */
var setEl=document.getElementById('settings');
function applyCfg(){
  document.documentElement.style.setProperty('--hs',(cfg.hud/100).toFixed(2));
  document.body.classList.toggle('cb',cfg.cb);
  document.body.classList.toggle('noMotion',cfg.motion);
  st.invertY=cfg.invert?-1:1;
  applyTeamPalette();
  if(AUDIO.master)AUDIO.master.gain.value=cfg.vol/100;
  coachEnabled=cfg.coach&&coachIndex<coachSteps.length;
  if(coachEl)coachEl.classList.toggle('on',coachEnabled&&st.started);
  saveCfg();
}
function setOpen(on){
  if(on&&!st.started&&IS_TOUCH)audioInit();
  setEl.classList.toggle('on',on);
  if(on){syncSettings(); if(document.exitPointerLock)document.exitPointerLock();}
  else if(st.started&&!st.paused&&!st.over&&!IS_TOUCH)lock();
}
var syncFns=[];
function bindRange(id,outId,key,fmt){
  var input=document.getElementById(id),out=document.getElementById(outId);
  input.addEventListener('input',function(){
    cfg[key]=+input.value; out.textContent=fmt(cfg[key]); applyCfg();
  });
  syncFns.push(function(){input.value=cfg[key]; out.textContent=fmt(cfg[key]);});
}
function bindToggle(id,key){
  var input=document.getElementById(id);
  input.addEventListener('change',function(){cfg[key]=input.checked;applyCfg();});
  syncFns.push(function(){input.checked=!!cfg[key];});
}
bindRange('sSens','oSens','sens',function(v){return v;});
bindToggle('sInvert','invert');
bindToggle('sPad','pad');
bindRange('sVol','oVol','vol',function(v){return v+'%';});
bindToggle('sEngine','engine');
bindRange('sHud','oHud','hud',function(v){return v+'%';});
bindToggle('sCb','cb');
bindToggle('sZp','zp');
bindToggle('sMotion','motion');
bindToggle('sCoach','coach');

var diffBtns=[].slice.call(document.querySelectorAll('#sDiff .seg'));
diffBtns.forEach(function(b){
  bindBtn(b,function(){cfg.diff=+b.getAttribute('data-v');applyCfg();syncSettings();});
});
syncFns.push(function(){
  diffBtns.forEach(function(b){b.classList.toggle('on',+b.getAttribute('data-v')===cfg.diff);});
});

/* AUTO is -1: keep measuring and step down if this machine cannot hold the
   pace. Picking a tier by hand pins it and stops the measuring, which is the
   point of picking one. */
var gfxBtns=[].slice.call(document.querySelectorAll('#sGfx .seg'));
gfxBtns.forEach(function(b){
  bindBtn(b,function(){
    cfg.gfx=+b.getAttribute('data-v');
    setGfxTier(cfg.gfx<0?(IS_TOUCH?0:2):cfg.gfx,false);
    applyCfg(); syncSettings();
  });
});
syncFns.push(function(){
  gfxBtns.forEach(function(b){b.classList.toggle('on',+b.getAttribute('data-v')===cfg.gfx);});
});
function syncSettings(){for(var i=0;i<syncFns.length;i++)syncFns[i]();}

bindBtn('setClose',function(){setOpen(false);});
bindBtn('pauseSetBtn',function(){setOpen(true);});
bindBtn('endSetBtn',function(){setOpen(true);});
bindBtn('briefSetBtn',function(){setOpen(true);});
bindBtn('briefKeysBtn',function(){
  var k=document.getElementById('keyList');
  if(k)k.classList.toggle('on');
});
bindBtn('briefGoBtn',function(){launch();});
bindBtn('briefStoryBtn',function(){
  /* one way back to the one place the campaign is run from */
  abandonMission(); st.mode='arena'; parkArena(false); enterHangar();
});
bindBtn('againBtn',function(){
  /* Online the scoreboard is the server's, so a rematch is a request rather
     than a local reset — clearing our own copy here would put this client a
     match ahead of everyone else. The server zeroes the score and tells the
     whole room, and resetMatch() runs on the way back in. */
  if(net.on){netRequestRematch();return;}
  abandonMission(); st.mode='arena'; parkArena(false); resetMatch();
});
/* A free Core Run used to dead-end on RUN IT BACK. The scoreboard is the point
   where a player is most likely to want the next chapter, so it hands straight
   back to the mission runtime rather than making them fly home to the board. */
bindBtn('endStoryBtn',function(){
  var id=nextPlayableMission();
  /* zero the arena first: score, wreckage and the debris of the last match all
     belong to the run that just ended */
  resetMatch();
  el.end.classList.remove('on');
  if(!id){
    /* campaign flown out — there is no next mission to load */
    st.mode='arena'; parkArena(false); enterHangar();
    return;
  }
  startMission(id);
  /* resetMatch announces a Core Run; the mission brief is the headline here */
  banner('',0); bannerT=0;
  if(!IS_TOUCH)lock(); else goFullscreen();
});
bindBtn('pauseQuitBtn',function(){setPaused(false);abandonMission();endMatch();});
bindBtn('tPause',function(){if(st.started&&!st.over)setPaused(!st.paused);});

/* ===================== focus =====================
   A match that keeps running while the tab is hidden burns the clock and
   respawns you into gunfire you never saw. */
function autoPause(){
  if(st.started&&!st.over&&!st.paused)setPaused(true);
}
document.addEventListener('visibilitychange',function(){if(document.hidden)autoPause();});
addEventListener('blur',autoPause);

applyCfg();
syncSettings();

/* ===================== colours ===================== */
var C={dayTop:new THREE.Color(0x2b6fc9),dayBot:new THREE.Color(0xa9d6f2),
  duskTop:new THREE.Color(0x2a2c55),duskBot:new THREE.Color(0xff9a4d),
  nightTop:new THREE.Color(0x03050e),nightBot:new THREE.Color(0x0d1730),
  sunWarm:new THREE.Color(0xffb469),sunHigh:new THREE.Color(0xfff4dc),grey:new THREE.Color(0x59636b)};
var cTop=new THREE.Color(),cBot=new THREE.Color(),cSun=new THREE.Color(),
    cGround=new THREE.Color(),sunDir=new THREE.Vector3();

