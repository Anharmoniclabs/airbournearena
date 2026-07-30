/* ===================== mission state machine =====================
   A mission is a list of objectives. Each objective declares how it sets up,
   how it reports progress, and what counts as done. The runtime never knows
   what a mission is about — that lives entirely in the MISSIONS table below,
   which is why six chapters cost data rather than six code paths.

   `token` rises on every start and every abandon. Anything scheduled against a
   mission — the retry after a failure, a delayed radio beat — checks it before
   acting, so a player who walks out to the hangar mid-sortie does not get the
   dead mission restarted on top of wherever they went. */
var mission={def:null,i:0,obj:null,t:0,running:false,failed:false,choice:null,token:0};

function objText(){
  if(!mission.obj)return '';
  return typeof mission.obj.text==='function'?mission.obj.text():mission.obj.text;
}
function startMission(id){
  var def=MISSIONS[id];
  if(!def)return false;
  if(rEl.debrief)rEl.debrief.classList.remove('on');
  if(rEl.choiceCard)rEl.choiceCard.classList.remove('on');
  var fc=document.getElementById('finaleCard'); if(fc)fc.classList.remove('on');
  el.end.classList.remove('on');
  clearGates(); clearConvoy(); clearRadio(); clearSites();
  syncStorySetpiece(id);
  mission.def=def; mission.i=-1; mission.obj=null; mission.t=0;
  mission.running=true; mission.failed=false; mission.choice=null; mission.token++;
  /* Replaying a finished mission must not drag the story position backwards:
     SAVE.mission is the furthest point reached, not the last thing flown. */
  if(!missionDone(id))
    {SAVE.mission=id; saveGame();}
  st.mode='campaign'; st.over=false; st.paused=false;
  parkArena(true);
  respawnFighter(player,true);
  var start=def.start||BREAKWATER;
  player.pos.copy(start); player.pos.y=Math.max(start.y,520);
  if(def.weather){wxKey=def.weather; wxTimer=400;}
  if(def.intro)def.intro();
  nextObjective();
  return true;
}
function nextObjective(){
  mission.i++;
  if(mission.i>=mission.def.objectives.length){finishMission();return;}
  mission.obj=mission.def.objectives[mission.i];
  mission.t=0;
  /* Objectives are shared definitions, not instances. A one-shot flag left on
     one from a previous run ("_nag", "_wave") would silently skip that beat on
     every replay, so the scratch keys are wiped on entry. */
  for(var k in mission.obj)if(k.charAt(0)==='_')delete mission.obj[k];
  if(mission.obj.setup)mission.obj.setup();
  renderObjective();
}
function failMission(why){
  if(!mission.running||mission.failed)return;
  mission.failed=true; mission.running=false;
  var id=mission.def.id, tk=mission.token;
  sayNow('BREAKWATER',why||'Sortie lost. Come back around.',4);
  banner('MISSION FAILED',2.2);
  if(rEl.objPanel)rEl.objPanel.classList.remove('on');
  /* Section 15.4: a failure returns you to the start of the sortie, not to a
     menu — but only if the player is still in the sortie it belongs to. */
  setTimeout(function(){
    if(mission.token===tk&&st.mode==='campaign')startMission(id);
  },3600);
}
function finishMission(){
  mission.running=false;
  var def=mission.def;
  var first=!missionDone(def.id);
  if(def.reward)def.reward();
  if(first)SAVE.completed.push(def.id);
  /* Only forward. Replaying Chapter 2 after reaching Chapter 5 leaves the
     campaign pointer where it was. */
  if(first||missionIndex(def.next)>missionIndex(SAVE.mission))
    SAVE.mission=def.next||def.id;
  if(def.chapter&&def.last&&SAVE.chapter<=def.chapter)
    SAVE.chapter=Math.min(CHAPTERS.length,def.chapter+1);
  saveGame();
  banner('MISSION COMPLETE',2.2);
  if(rEl.objPanel)rEl.objPanel.classList.remove('on');
  clearGates(); clearConvoy(); clearSites(); clearStorySetpiece();
  /* An Arena mission ends by ending a match, which raises the scoreboard. The
     debrief is the campaign's own board and owns the screen from here. */
  el.end.classList.remove('on');
  if(def.finale){showFinale(def.finale());return;}
  showDebrief(def);
}
function stepMission(dt){
  stepGates(dt); stepConvoy(dt);
  if(!mission.running||!mission.obj)return;
  mission.t+=dt;
  var o=mission.obj;
  if(o.fail&&o.fail()){failMission(o.failText);return;}
  if(o.step)o.step(dt);
  renderObjective();
  if(o.done&&o.done())nextObjective();
}
/* The eight arena pilots and the Core sit out every campaign mission. Parking
   them beats a second world: the terrain, bases, masts and guns all stay. */
function parkArena(on){
  for(var i=0;i<fighters.length;i++){
    var f=fighters[i];
    if(f.isPlayer)continue;
    f.alive=!on; f.mesh.visible=!on; f.carrying=false;
    if(on)f.respawnT=1e9;
  }
  if(typeof coreGroup!=='undefined')coreGroup.visible=!on;
  if(on){core.carrier=null;}
}
var BREAKWATER=new THREE.Vector3(-BASE_X,460,0);

