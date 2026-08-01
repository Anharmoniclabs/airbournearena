/* ===================== sky-base operations =====================
   This is the explicit bridge between the shared base and each playable loop.
   Choosing an open-world activity arms the next surface landing; Arena and
   Campaign deliberately leave the world state before starting their own rules. */
function openOperations(){
  var card=document.getElementById('operationsCard');if(!card)return;
  card.classList.add('on');if(document.exitPointerLock)document.exitPointerLock();
}
function closeOperations(){
  var card=document.getElementById('operationsCard');if(card)card.classList.remove('on');
  if(!IS_TOUCH&&st.started&&!st.paused)lock();
}
function armWorldActivity(kind){
  worldFlow.activity=kind;closeOperations();
  banner(kind==='groundwar'?'GROUND WAR ARMED · BOARD AND LAUNCH':'SALVAGE RUN ARMED · BOARD AND LAUNCH',2.3);
  updateSalvageHud('[G] RETURN TO AIRCRAFT · '+(kind==='groundwar'?'HOSTILES EXPECTED':'RECOVERY PRIORITY'));
}
function startArenaOperation(){
  closeOperations();if(salvage.on){salvage.on=false;groundAvatar.visible=false;document.body.classList.remove('ground');}
  st.mode='arena';st.phase='flight';worldFlow.active=false;resetMatch();st.started=true;
  el.brief.classList.add('gone');el.hud.classList.add('live');document.body.classList.add('playing');
}
bindBtn('opSalvage',function(){armWorldActivity('salvage');});
bindBtn('opGroundWar',function(){armWorldActivity('groundwar');});
bindBtn('opArena',startArenaOperation);
bindBtn('opCampaign',function(){closeOperations();openMissions();});
bindBtn('opClose',closeOperations);
