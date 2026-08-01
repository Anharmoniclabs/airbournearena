/* ===================== input ===================== */
var touchIn={fire:false,thrUp:false,thrDn:false,boost:false,zoom:false};
var stick={id:null,ox:0,oy:0,dx:0,dy:0,active:false,R:64};

/* Chrome rejects requestPointerLock outside a user gesture with a promise, and
   an unhandled rejection surfaces as a page error. Not every caller is on a
   gesture — a mission restarting after a failure is on a timer — and none of
   them can do anything useful about it, so the refusal is swallowed here. The
   mouse-position fallback in the mousemove handler already covers an
   uncaptured pointer. */
function lock(){
  var c=renderer.domElement;
  if(!c.requestPointerLock)return;
  try{
    var r=c.requestPointerLock();
    if(r&&r.catch)r.catch(function(){});
  }catch(err){}
}
function goFullscreen(){
  var d=document.documentElement;
  try{
    if(!document.fullscreenElement&&d.requestFullscreen)d.requestFullscreen().catch(function(){});
  }catch(e){}
}
function launch(){
  if(st.phase==='hangar')return;
  if(st.over||document.getElementById('settings').classList.contains('on'))return;
  var first=!st.started;
  if(st.mode==='arena'&&typeof worldFlow!=='undefined')worldFlow.active=false;
  /* the audio context can only be created from a gesture, and this is the
     first one the game is guaranteed to get */
  audioInit(); audioResume();
  if(first){st.started=true;
    sortie.startedAt=performance.now();emit('match_start',{mode:'case_run_4v4'});
    banner('CORE IS LIVE',2);renderCoach();}
  /* Taking the briefing down is not part of "first ever launch". Ending a
     sortie and walking back out of the hangar puts the card up again with
     st.started still true, and LAUNCH used to be a no-op every time after the
     first — the button visibly did nothing. */
  el.brief.classList.add('gone');
  el.hud.classList.add('live');
  document.body.classList.add('playing');
  if(IS_TOUCH){ if(first){goFullscreen();} }
  else lock();
}
/* The briefing card is a menu with its own buttons and a scrollable control
   list, so only the backdrop around it is "tap to launch" — otherwise dragging
   the card to read it starts the match underneath. */
el.brief.addEventListener('pointerdown',function(e){
  if(e.target&&e.target.closest&&e.target.closest('.card'))return;
  launch();
});
renderer.domElement.addEventListener('pointerdown',function(e){
  if(IS_TOUCH){launch();return;}
  /* The hangar is already running before the match is "started". Previously
     this path called launch(), which intentionally returns during the hangar,
     so the mouse was never captured and free-look could never receive relative
     movement. A click in free roam now captures the camera directly. */
  if(st.phase==='hangar'){
    if(!hEl.fitCard||!hEl.fitCard.classList.contains('on'))lock();
    return;
  }
  if(!st.started){launch();return;}
  /* An embedded frame is allowed to refuse pointer lock, and this used to
     return early on every click when it did — so inside the iframe build the
     left mouse button silently stopped firing the guns. Retry the lock, but
     never at the cost of the trigger. */
  if(!st.locked)lock();
  if(e.button===0)mouseDown=true;
  if(e.button===2)mouseRight=true;
});
addEventListener('pointerup',function(e){
  if(e.button===2)mouseRight=false; else mouseDown=false;
});
/* the right button is the zoom, so the browser menu cannot have it */
renderer.domElement.addEventListener('contextmenu',function(e){e.preventDefault();});
document.addEventListener('pointerlockchange',function(){
  st.locked=(document.pointerLockElement===renderer.domElement);
  document.body.classList.toggle('locked',st.locked);
});

/* ---------- touch: floating analog stick + button cluster ---------- */
(function touchUI(){
  var zone=document.getElementById('tStick'),
      base=document.getElementById('stickBase'),
      knob=document.getElementById('stickKnob');
  function down(e){
    e.preventDefault();
    if(stick.id!==null)return;
    stick.id=e.pointerId; stick.ox=e.clientX; stick.oy=e.clientY;
    stick.active=true; stick.dx=0; stick.dy=0;
    base.style.left=e.clientX+'px'; base.style.top=e.clientY+'px';
    base.classList.add('on'); knob.style.transform='translate(0px,0px)';
    try{zone.setPointerCapture(e.pointerId);}catch(err){}
    launch();
  }
  function move(e){
    if(e.pointerId!==stick.id)return;
    e.preventDefault();
    var dx=e.clientX-stick.ox, dy=e.clientY-stick.oy, r=Math.hypot(dx,dy);
    if(r>stick.R){dx*=stick.R/r;dy*=stick.R/r;}
    stick.dx=dx/stick.R; stick.dy=dy/stick.R;
    knob.style.transform='translate('+dx.toFixed(1)+'px,'+dy.toFixed(1)+'px)';
  }
  function up(e){
    if(e.pointerId!==stick.id)return;
    stick.id=null; stick.active=false; stick.dx=0; stick.dy=0;
    base.classList.remove('on'); knob.style.transform='translate(0px,0px)';
  }
  zone.addEventListener('pointerdown',down);
  zone.addEventListener('pointermove',move);
  zone.addEventListener('pointerup',up);
  zone.addEventListener('pointercancel',up);

  function hold(id,onDown,onUp){
    var b=document.getElementById(id); if(!b)return;
    b.addEventListener('pointerdown',function(e){
      e.preventDefault();e.stopPropagation();b.classList.add('press');
      try{b.setPointerCapture(e.pointerId);}catch(err){}
      if(navigator.vibrate)navigator.vibrate(10);
      onDown();launch();
    });
    var rel=function(e){e.preventDefault();b.classList.remove('press');if(onUp)onUp();};
    b.addEventListener('pointerup',rel);
    b.addEventListener('pointercancel',rel);
  }
  hold('tFire',function(){touchIn.fire=true;},function(){touchIn.fire=false;});
  hold('tUp',function(){touchIn.thrUp=true;},function(){touchIn.thrUp=false;});
  hold('tDn',function(){touchIn.thrDn=true;},function(){touchIn.thrDn=false;});
  hold('tBoost',function(){touchIn.boost=true;},function(){touchIn.boost=false;});
  hold('tPass',function(){
    if(salvage.on){
      var d=Math.hypot(salvage.x-player.pos.x,salvage.z-player.pos.z);
      if(d<13)leaveGroundMode();else if(salvage.surface==='skybase')openOperations();
    }else if(core.carrier===player)passCore(player);
  });
  hold('tRoll',function(){startRoll(player,stick.dx>0?-1:1);});
  hold('tLock',function(){if(lockOn.manual)releaseLock(); else cycleTarget();});
  hold('tZoom',function(){touchIn.zoom=true;},function(){touchIn.zoom=false;});
  hold('tCam',function(){st.camMode=(st.camMode+1)%3;});
  hold('tMap',function(){st.mapBig=!st.mapBig;el.mapWrap.classList.toggle('big',st.mapBig);});

  bindBtn('modeBtn',function(){setTouchMode(!IS_TOUCH);});
})();
addEventListener('mousemove',function(e){
  st.mouseSeen=true;
  if(st.phase==='hangar'&&!IS_TOUCH){
    if(st.locked&&(!hEl.fitCard||!hEl.fitCard.classList.contains('on'))){
      var hs=clamp(cfg.sens,20,120)/18000;
      walk.yaw-=e.movementX*hs;
      walk.pitch=clamp(walk.pitch-e.movementY*hs,-1.35,1.35);
    }
    return;
  }
  if(st.locked){
    /* captured: relative deltas, infinite travel */
    aim.x+=e.movementX*mouseSens();
    aim.y-=e.movementY*mouseSens()*st.invertY;
  } else {
    /* not captured (embedded frames often refuse pointer lock): map the
       cursor's position over the canvas straight onto the aim disc */
    var b=renderer.domElement.getBoundingClientRect();
    if(!b.width||!b.height)return;
    aim.x=(((e.clientX-b.left)/b.width)*2-1)*AIM_R;
    aim.y=(1-((e.clientY-b.top)/b.height)*2)*AIM_R*st.invertY;
  }
  var r=Math.hypot(aim.x,aim.y);
  if(r>AIM_R){aim.x*=AIM_R/r;aim.y*=AIM_R/r;}
});
addEventListener('keydown',function(e){
  keys[e.code]=true;
  if(e.code==='Space'||e.code==='Tab'||e.code.indexOf('Arrow')===0)e.preventDefault();
  /* the hangar runs its own keys, and "any key launches" would fire the match
     off on the first step you took across the floor */
  if(st.phase==='hangar')return;
  if(e.code==='KeyG'){
    if(salvage.on)leaveGroundMode();else enterGroundMode();
    e.preventDefault();return;
  }
  if(salvage.on){
    if(e.code==='KeyF'&&salvage.surface==='skybase'){openOperations();e.preventDefault();return;}
    if(e.code==='KeyM'){st.mapBig=!st.mapBig;el.mapWrap.classList.toggle('big',st.mapBig);}
    if(e.code==='KeyP')setPaused(!st.paused);
    return;
  }
  if(!st.started){launch();return;}
  if(e.code==='Tab'){cycleTarget();return;}
  if(e.code==='KeyX'){releaseLock();return;}
  if(e.code==='KeyF'&&core.carrier===player)passCore(player);
  if(e.code==='KeyC')st.camMode=(st.camMode+1)%3;
  if(e.code==='KeyM'){st.mapBig=!st.mapBig;el.mapWrap.classList.toggle('big',st.mapBig);}
  if(e.code==='KeyV'){wxKey=ORDER[(ORDER.indexOf(wxKey)+1)%ORDER.length];wxTimer=90;}
  if(e.code==='KeyT')st.timeSpeed=st.timeSpeed>=16?1:st.timeSpeed*4;
  if(e.code==='KeyI')st.invertY*=-1;
  if(e.code==='KeyQ')startRoll(player,1);
  if(e.code==='KeyE')startRoll(player,-1);
  if(e.code==='KeyP'){setPaused(!st.paused);return;}
  if(e.code==='KeyO'){setOpen(!setEl.classList.contains('on'));return;}
  if(e.code==='KeyR'&&st.over)resetMatch();
});
addEventListener('keyup',function(e){keys[e.code]=false;});
