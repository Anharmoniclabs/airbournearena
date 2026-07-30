/* ===================== campaign UI ===================== */
var rEl={};['radio','radioWho','radioText','objPanel','objTitle','objList','debrief',
  'debriefT','debriefB','debriefStats','debriefNext','choiceCard','choiceT','choiceB',
  'choiceOpts'].forEach(function(id){rEl[id]=document.getElementById(id);});

function renderObjective(){
  if(!rEl.objPanel||!mission.def)return;
  rEl.objTitle.textContent=mission.def.title;
  var html='';
  for(var i=0;i<mission.def.objectives.length;i++){
    var o=mission.def.objectives[i];
    var cls=i<mission.i?'done':(i===mission.i?'now':'');
    var t=(i===mission.i)?objText():(typeof o.text==='function'?'—':o.text);
    html+='<div class="obj '+cls+'">'+t+'</div>';
  }
  /* Checkpoint progress is reported here rather than in each mission's text,
     so it cannot be forgotten by one of them — which is exactly what happened
     to the first mission of the campaign, where flying a ring changed nothing
     on screen and the objective read the same either way. */
  if(gates.length){
    var flown=gates.length-gatesLeft();
    html+='<div class="objMeta">CHECKPOINTS <b>'+flown+' / '+gates.length+'</b>';
    if(gateNext&&player.alive)
      html+='<br>NEXT <b>'+(player.pos.distanceTo(gateNext.pos)/1000).toFixed(2)+' KM</b>';
    else if(!gateNext)html+='<br><b>ALL CHECKPOINTS FLOWN</b>';
    html+='</div>';
  }
  rEl.objList.innerHTML=html;
  rEl.objPanel.classList.add('on');
}
function openChoice(title,body,opts){
  if(!rEl.choiceCard)return;
  rEl.choiceT.textContent=title; rEl.choiceB.textContent=body;
  rEl.choiceOpts.innerHTML='';
  opts.forEach(function(o){
    var b=document.createElement('button');
    b.className='actionBtn'; b.textContent=o.label;
    bindBtn(b,function(){
      mission.choice=o.k;
      if(o.apply)o.apply();
      rEl.choiceCard.classList.remove('on');
      if(!IS_TOUCH&&st.started)lock();
    });
    rEl.choiceOpts.appendChild(b);
  });
  rEl.choiceCard.classList.add('on');
  if(document.exitPointerLock)document.exitPointerLock();
}
function repRows(){
  return [['CREDITS',SAVE.credits],['UNITY',SAVE.unity],['CIVILIAN',SAVE.rep.civilian],
          ['VANGUARD',SAVE.rep.vanguard],['TEMPEST',SAVE.rep.tempest],
          ['INFERNO',SAVE.rep.inferno],['INDEPENDENT',SAVE.rep.independent],
          ['BLACK WING',SAVE.rep.blackwing]];
}
function statHtml(rows){
  var h='';
  for(var i=0;i<rows.length;i++)
    h+='<div class="endStat"><b>'+rows[i][1]+'</b><span>'+rows[i][0]+'</span></div>';
  return h;
}
function showDebrief(def){
  if(!rEl.debrief)return;
  rEl.debriefT.textContent=def.title+' — COMPLETE';
  rEl.debriefStats.innerHTML=statHtml(repRows());
  var nx=def.next&&MISSIONS[def.next];
  var body='';
  /* the last mission of a chapter says where the story has arrived before it
     says what to fly next, so a chapter reads as a chapter */
  if(def.chapterEnd)body=def.chapterEnd+(nx?'  '+nx.brief:'');
  else body=nx?nx.brief:'The campaign is flown out. Breakwater Field is yours, '+
    'and the Arena is open for as many free Core Runs as you want.';
  rEl.debriefB.textContent=body;
  rEl.debriefNext.textContent=nx?'FLY '+nx.title:'RETURN TO BREAKWATER';
  rEl.debriefNext.disabled=!nx;
  rEl.debrief.classList.add('on');
  if(document.exitPointerLock)document.exitPointerLock();
}
/* The ending is not a debrief: nothing follows it, and what it reports is the
   whole campaign rather than one sortie. */
/* Section 18: a choice that changes nothing you can see is not a choice. Every
   decision the campaign recorded gets one line here, so the ending reads as the
   sum of a particular run rather than one final button press. */
function finaleNotes(){
  var f=SAVE.flags,n=[];
  if(f.savedShuttle===true)n.push('You covered the falling shuttle and let Nyx go.');
  if(f.savedShuttle===false)n.push('You chased Nyx. The shuttle came down.');
  if(f.ridgemouth)n.push('Ridgemouth is on a supply run again, and remembers who flew it.');
  if(f.fragment==='share')n.push('You put the Warden fragment in front of all three teams.');
  if(f.fragment==='team')n.push('You handed the Warden fragment to your own team.');
  if(f.fragment==='hide')n.push('A copy of the fragment is still under Mara\u2019s floor.');
  if(f.rescuedAce)n.push('You reached '+String(f.rescuedAce).toUpperCase()+' first on the night of the ace hunt.');
  if(f.witness)n.push('The engineer lived to testify.');
  /* the central mystery is an evidence chain, and the run should say how much
     of it the player actually assembled */
  var chain=(f.sawStolenTech?1:0)+(f.falseFlagProof?1:0)+(f.foundRelay?1:0)+(f.witness?1:0);
  if(chain>=4)n.push('You assembled the whole chain: stolen hardware, hulls in '+
    'borrowed colours, an unfiled relay, and a witness.');
  else if(chain>0)n.push('You brought back '+chain+' of the four proofs against Black Wing.');
  if(f.nodesDown)n.push('The Warden nodes were down before the carrier ever arrived.');
  if(f.carrierCrippled)n.push('The carrier lost its engines over the Starter Coast.');
  if(f.debut==='win')n.push('You won your league debut.');
  if(f.rescuedHauler)n.push('The hauler crew off Starter Coast are still flying.');
  if(f.ledger==='all')n.push('You published the whole ledger, your own team included.');
  if(f.ledger==='half')n.push('You published enough to convict Black Wing and no more.');
  if(f.ledger==='veyr')n.push('You handed the ledger to Cassian Veyr.');
  if(f.westField)n.push('The west field is held.');
  if(f.mastsUp)n.push('Five independent masts are lit and off the network.');
  if(f.cityHeld)n.push('The central sky city never lost its civilian traffic.');
  if(f.taskforce==='united')n.push('The carrier was met by one joint task force.');
  if(f.taskforce==='faction')n.push('The carrier was met by your team alone.');
  if(f.nyxAlly)n.push('Nyx Arlen held the bay doors for you.');
  else if(f.nyxSpared===false)n.push('You shot Nyx Arlen down over a civilian corridor.');
  return n;
}
function showFinale(ending){
  var card=document.getElementById('finaleCard');
  if(!card)return;
  if(rEl.debrief)rEl.debrief.classList.remove('on');
  document.getElementById('finaleT').textContent=ending.title;
  document.getElementById('finaleB').textContent=ending.text;
  var notes=finaleNotes(),nEl=document.getElementById('finaleNotes');
  if(nEl)nEl.innerHTML=notes.length
    ?'<div class="fnHd">WHAT THIS RUN DECIDED</div>'+
      notes.map(function(t){return '<div class="fnRow">'+t+'</div>';}).join('')
    :'';
  document.getElementById('finaleStats').innerHTML=statHtml(
    repRows().concat([['MISSIONS',SAVE.completed.length]]));
  card.classList.add('on');
  if(rEl.objPanel)rEl.objPanel.classList.remove('on');
  if(document.exitPointerLock)document.exitPointerLock();
  stingSfx([392,523,659,784],.22);
}
function advanceCampaign(){
  if(rEl.debrief)rEl.debrief.classList.remove('on');
  var nextId=nextPlayableMission();
  if(nextId){
    startMission(nextId);
    if(!IS_TOUCH)lock();
  } else {
    st.mode='arena'; parkArena(false); enterHangar();
  }
}
/* On-foot missions hand control back to the hangar and pick up again the moment
   the player walks out. */
function toCampaignHangar(){enterHangar();}
/* Leaving a mission by any door — END SORTIE, the hangar button, the mission
   list — has to tear the mission down, or its convoy keeps flying and its
   fail() keeps firing behind whatever the player did next. */
function abandonMission(){
  mission.running=false; mission.def=null; mission.obj=null;
  mission.token++;
  clearGates(); clearConvoy(); clearSites(); clearRadio(); clearStorySetpiece();
  if(rEl.objPanel)rEl.objPanel.classList.remove('on');
  if(rEl.choiceCard)rEl.choiceCard.classList.remove('on');
}
function toHangarFromMission(){
  if(rEl.debrief)rEl.debrief.classList.remove('on');
  var f=document.getElementById('finaleCard'); if(f)f.classList.remove('on');
  abandonMission();
  st.mode='arena'; parkArena(false); enterHangar();
}

buildSlots();
bindBtn(rEl.debriefNext,advanceCampaign);
bindBtn('debriefHangar',toHangarFromMission);
bindBtn('finaleHangar',toHangarFromMission);
bindBtn('finaleAgain',function(){
  SAVE=freshSave(); saveGame();
  toHangarFromMission();
  toast('NEW CAMPAIGN — CHAPTER 1, ROOKIE WINGS',3);
});

