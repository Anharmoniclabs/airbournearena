/* ===================== mission select =====================
   Thirty-two missions across six chapters is more than a single CONTINUE
   button can represent. This is the one screen that states what exists, what
   has been flown, and what is reachable — and it is the same screen on a
   phone, because it is built out of the same buttons everything else uses. */
function openMissions(){
  var card=document.getElementById('missionCard');
  if(!card)return;
  renderMissions();
  card.classList.add('on');
  if(document.exitPointerLock)document.exitPointerLock();
}
function closeMissions(){
  var card=document.getElementById('missionCard');
  if(card)card.classList.remove('on');
  if(!IS_TOUCH&&st.started&&!st.paused&&st.phase!=='hangar')lock();
}
function renderMissions(){
  var list=document.getElementById('missionList'),
      meta=document.getElementById('missionMeta');
  if(!list)return;
  if(meta){
    var ch=CHAPTERS[clamp(SAVE.chapter,1,CHAPTERS.length)-1];
    meta.textContent='CHAPTER '+SAVE.chapter+' — '+ch.name+
      '  ·  '+SAVE.completed.length+' / '+ORDERED.length+' FLOWN'+
      '  ·  UNITY '+SAVE.unity;
  }
  list.innerHTML='';
  CHAPTERS.forEach(function(ch,ci){
    var hd=document.createElement('div');
    hd.className='chapHd';
    hd.textContent='CHAPTER '+(ci+1)+' — '+ch.name;
    list.appendChild(hd);
    ch.missions.forEach(function(id){
      var def=MISSIONS[id]; if(!def)return;
      var done=missionDone(id), open=missionUnlocked(id), now=(SAVE.mission===id&&!done);
      var b=document.createElement('button');
      b.className='misRow'+(now?' now':'')+(open?'':' locked');
      b.disabled=!open;
      b.innerHTML='<span class="mk">'+(done?'✓':(open?'▸':'✕'))+'</span>'+
        '<span class="mt"></span><span class="mn">'+
        (done?'FLOWN':(open?(now?'NEXT':'REPLAY'):'LOCKED'))+'</span>';
      b.querySelector('.mt').textContent=def.title;
      if(open)bindBtn(b,function(){
        closeMissions();
        flyMission(id);
      });
      list.appendChild(b);
    });
  });
}
/* Replaying a mission must not rewind the campaign: the story position is only
   ever moved forward by finishing the furthest mission reached. */
function flyMission(id){
  if(!MISSIONS[id])return;
  if(rEl.debrief)rEl.debrief.classList.remove('on');
  var f=document.getElementById('finaleCard'); if(f)f.classList.remove('on');
  el.end.classList.remove('on');
  document.getElementById('pause').classList.remove('on');
  st.paused=false;
  if(st.phase==='hangar')leaveHangar();
  st.started=true;
  el.brief.classList.add('gone');
  el.hud.classList.add('live');
  document.body.classList.add('playing');
  audioInit(); audioResume(); applyLoadout();
  startMission(id);
  if(!IS_TOUCH)lock(); else goFullscreen();
}
bindBtn('missionClose',closeMissions);
bindBtn('missionReset',function(){
  SAVE=freshSave(); saveGame();
  renderMissions();
  toast('CAMPAIGN RESET — CHAPTER 1, ROOKIE WINGS',3);
});

function startCampaign(){
  var id=nextPlayableMission()||ORDERED[0];
  leaveHangar();
  st.started=true;
  el.brief.classList.add('gone');
  el.hud.classList.add('live');
  document.body.classList.add('playing');
  audioInit(); audioResume();
  applyLoadout();
  startMission(id);
  /* The mouse path grabs the pointer here; the touch path never went through
     launch(), so this is its only chance to take the screen. */
  if(!IS_TOUCH)lock(); else goFullscreen();
}

