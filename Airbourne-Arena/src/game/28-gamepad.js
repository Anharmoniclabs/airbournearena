/* ===================== gamepad =====================
   Standard mapping. The left stick drives the same aim vector the mouse and
   the touch stick drive, so the flight path stays identical across devices. */
var pad={on:false,prev:{},axisPrev:{},index:-1,id:'',hangarFocus:0};
var PAD_DEAD=0.16;
function padAxis(v){return Math.abs(v)<PAD_DEAD?0:(v-Math.sign(v)*PAD_DEAD)/(1-PAD_DEAD);}
function padOff(notify){
  var wasOn=pad.on;
  pad.on=false;pad.index=-1;pad.id='';pad.prev={};pad.axisPrev={};
  document.body.classList.remove('pad');
  if(notify&&wasOn)toast('CONTROLLER DISCONNECTED',1.8);
}
function padGet(){
  if(!cfg.pad||!navigator.getGamepads){padOff(false);return null;}
  var list=navigator.getGamepads(),gp=null;
  if(pad.index>=0&&list[pad.index]&&list[pad.index].connected)gp=list[pad.index];
  if(!gp)for(var i=0;i<list.length;i++)if(list[i]&&list[i].connected){gp=list[i];break;}
  if(!gp){
    padOff(true);
    return null;
  }
  if(!pad.on||pad.index!==gp.index){
    pad.on=true;pad.index=gp.index;pad.id=gp.id||'Controller';
    pad.prev={};pad.axisPrev={};
    document.body.classList.add('pad');
    toast('CONTROLLER READY — '+pad.id.replace(/\s*\([^)]*\)\s*/g,' ').slice(0,38),2.4);
  }
  return gp;
}
/* Rising edge only — held buttons must not retrigger a toggle every frame. */
function padTap(gp,index){
  var down=!!(gp.buttons[index]&&gp.buttons[index].pressed);
  var was=!!pad.prev[index]; pad.prev[index]=down;
  return down&&!was;
}
function padHeld(gp,index){
  var b=gp.buttons[index];
  return !!(b&&(b.pressed||b.value>.18));
}
function padAxisTap(gp,index,direction,key){
  var down=direction*(gp.axes[index]||0)>.62,was=!!pad.axisPrev[key];
  pad.axisPrev[key]=down;
  return down&&!was;
}
function padFocusable(scope){
  if(!scope)return [];
  return [].slice.call(scope.querySelectorAll(
    'button:not([disabled]),[role="button"]:not([aria-disabled="true"]),input:not([type="hidden"])'
  )).filter(function(node){
    var style=getComputedStyle(node);
    return style.display!=='none'&&style.visibility!=='hidden'&&style.pointerEvents!=='none';
  });
}
function padFocusMove(nodes,delta){
  if(!nodes.length)return;
  var at=nodes.indexOf(document.activeElement);
  if(at<0)at=delta>0?-1:0;
  at=(at+delta+nodes.length)%nodes.length;
  nodes[at].focus({preventScroll:true});
}
function padMenuScope(){
  var ids=['settings','pause','fitCard','missionCard','debrief','choiceCard','finaleCard'];
  for(var i=0;i<ids.length;i++){
    var node=document.getElementById(ids[i]);
    if(node&&node.classList.contains('on'))return node;
  }
  if(st.phase!=='hangar'&&!st.started&&!el.brief.classList.contains('gone'))return el.brief;
  return null;
}
function padCancelMenu(scope){
  if(!scope)return;
  if(scope.id==='settings')setOpen(false);
  else if(scope.id==='pause')setPaused(false);
  else if(scope.id==='fitCard')closeFit();
  else if(scope.id==='missionCard')closeMissions();
}
function padMenuTick(gp,scope){
  var nodes=padFocusable(scope);
  var back=padTap(gp,12)||padTap(gp,14)||
    padAxisTap(gp,1,-1,'menuUp')||padAxisTap(gp,0,-1,'menuLeft');
  var next=padTap(gp,13)||padTap(gp,15)||
    padAxisTap(gp,1,1,'menuDown')||padAxisTap(gp,0,1,'menuRight');
  if(back)padFocusMove(nodes,-1);
  if(next)padFocusMove(nodes,1);
  if(padTap(gp,0)){
    var active=document.activeElement;
    if(nodes.indexOf(active)<0){padFocusMove(nodes,1);active=document.activeElement;}
    if(active&&typeof active.click==='function')active.click();
  }
  if(padTap(gp,1))padCancelMenu(scope);
  if(scope.id==='pause'&&padTap(gp,9))setPaused(false);
}
function padHangarTick(gp,dt){
  var lx=padAxis(gp.axes[0]||0),ly=padAxis(gp.axes[1]||0);
  var rx=padAxis(gp.axes[2]||0),ry=padAxis(gp.axes[3]||0);
  hWalk.active=!!(lx||ly);hWalk.x=lx;hWalk.y=ly;
  if(rx||ry){
    st.padSeen=true;
    walk.yaw-=rx*dt*2.7;
    walk.pitch=clamp(walk.pitch-ry*dt*2.1,-1.05,1.05);
  }
  var buttons=padFocusable(document.getElementById('hangarTouch'));
  var previous=padTap(gp,14)||padTap(gp,12);
  var following=padTap(gp,15)||padTap(gp,13);
  if((previous||following)&&buttons.length){
    pad.hangarFocus=(pad.hangarFocus+(following?1:-1)+buttons.length)%buttons.length;
    if(buttons[pad.hangarFocus])buttons[pad.hangarFocus].focus({preventScroll:true});
  }
  if(padTap(gp,0)){
    if(hangarNear)hangarInteract();
    else if(buttons.indexOf(document.activeElement)>=0)document.activeElement.click();
    else if(buttons.length){buttons[pad.hangarFocus].focus({preventScroll:true});}
  }
  if(padTap(gp,2))openFit();
  if(padTap(gp,3))openMissions();
  if(padTap(gp,9)){
    var begin=document.getElementById('hGo');
    if(begin)begin.click();
  }
}
addEventListener('gamepadconnected',function(e){
  if(!cfg.pad)return;
  pad.index=e.gamepad.index;pad.on=false;padGet();
});
addEventListener('gamepaddisconnected',function(e){
  if(e.gamepad.index===pad.index)padOff(true);
});

var padIn={aimX:0,aimY:0,fire:false,boost:false,idle:false,thrUp:false,thrDn:false,zoom:false};
var padAimT=0;
/* Polled from the render loop rather than from step(), so Start still unpauses
   and A still starts a rematch while the simulation is frozen. */
function padTick(dt){
  var gp=padGet();
  if(!gp){
    padIn.fire=padIn.boost=padIn.idle=padIn.thrUp=padIn.thrDn=padIn.zoom=false;
    padIn.aimX=padIn.aimY=0;
    if(typeof hWalk!=='undefined'&&hWalk){
      hWalk.active=false;hWalk.x=0;hWalk.y=0;
    }
    return;
  }
  var anyButton=false;
  for(var b=0;b<gp.buttons.length;b++)if(padHeld(gp,b)){anyButton=true;break;}

  var menu=padMenuScope();
  if(menu){
    if(st.phase==='hangar'){hWalk.active=false;hWalk.x=0;hWalk.y=0;}
    padMenuTick(gp,menu);return;
  }
  if(st.phase==='hangar'){padHangarTick(gp,dt);return;}

  padIn.aimX=padAxis(gp.axes[0]||0);
  padIn.aimY=padAxis(gp.axes[1]||0);
  if(padIn.aimX||padIn.aimY){st.padSeen=true;padAimT=0.6;}

  if(!st.started){if(anyButton)launch();return;}
  if(padTap(gp,9))setPaused(!st.paused);
  if(st.over){if(padTap(gp,0))resetMatch();return;}
  if(st.paused)return;

  padIn.fire=padHeld(gp,7);
  padIn.boost=padHeld(gp,0);
  padIn.idle=padHeld(gp,6);
  padIn.thrUp=padHeld(gp,12);
  padIn.thrDn=padHeld(gp,13);
  padIn.zoom=padHeld(gp,4);          /* L1 / LB — held, for gun work */
  if(padTap(gp,2)&&core.carrier===player)passCore(player);
  if(padTap(gp,1))cycleTarget();
  if(padTap(gp,10))releaseLock();
  /* R1 rolls the way the stick is leaning; L1 is the zoom now */
  if(padTap(gp,5))startRoll(player,padIn.aimX>0?-1:1);
  if(padTap(gp,3))st.camMode=(st.camMode+1)%3;
  if(padTap(gp,8)){st.mapBig=!st.mapBig;el.mapWrap.classList.toggle('big',st.mapBig);}
}

