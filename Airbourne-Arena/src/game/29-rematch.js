/* ===================== rematch =====================
   A soft reset. Reloading the page would re-download every texture and the
   Three.js bundle just to zero a scoreboard. */
function resetMatch(){
  if(typeof salvage!=='undefined'){
    salvage.on=false;salvage.landed=false;salvage.surface=null;groundAvatar.visible=false;
    document.body.classList.remove('ground');
  }
  if(typeof worldFlow!=='undefined'){
    worldFlow.active=false;worldFlow.zone='surface';worldFlow.faction=null;worldFlow.base=null;worldFlow.transition=null;
  }
  if(typeof endGroundEncounter==='function')endGroundEncounter();
  st.scoreB=0; st.scoreR=0; st.time=MATCH_TIME; st.over=false; st.paused=false;
  st.dmgFlash=0; st.hitmark=0; shake=0; st.ringWarned=false;
  lockOn.target=null;lockOn.manual=false;lockOn.assisted=false;
  lockOn.hover=null;lockOn.hoverT=0;lockOn.grace=0;
  while(bullets.length)bulletFree(bullets.pop());
  for(var s=0;s<structs.length;s++){
    var sc=structs[s];
    sc.alive=true; sc.hp=sc.maxHp; sc.respawnT=0; sc.cd=0; sc.mesh.visible=true;
  }
  clearDrones();
  stepGoalRings(0);
  /* explosion sprites are pooled now — a rematch shelves them, it does not
     dispose them; see the fx pool in 22-bullets.js */
  for(var i=fx.length-1;i>=0;i--){fx[i].s.visible=false;fxPool.push(fx[i].s);}
  fx.length=0;
  for(var a=dmgArcs.length-1;a>=0;a--)dmgDirEl.removeChild(dmgArcs[a].node);
  dmgArcs.length=0;
  core.carrier=null; core.lockout=null; core.lockT=0; core.charge=100;
  core.pos.set(0,600,rnd(-260,260)); core.vel.set(0,0,0);
  for(var j=0;j<fighters.length;j++){
    var f=fighters[j];
    f.kills=0; f.caps=0; f.carrying=false; f.boundT=0;
    f.roll.t=0; f.roll.cd=0; f.evade=0; f.aiJink=0;
    respawnFighter(f,true);
  }
  sortie={startedAt:performance.now(),kills:0,deaths:0,shots:0,hits:0,grabs:0,passes:0,
    scores:0,stalls:0,events:[],stalling:false};
  el.end.classList.remove('on');
  document.getElementById('pause').classList.remove('on');
  el.warn.style.opacity=0; el.center.textContent=''; bannerT=0;
  document.getElementById('feed').innerHTML='';
  emit('match_start',{mode:'case_run_4v4'});
  banner('CORE IS LIVE',2);
  audioResume();
  if(!IS_TOUCH)lock();
}
