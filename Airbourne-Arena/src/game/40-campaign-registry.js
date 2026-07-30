/* ===================== THE CAMPAIGN =====================
   Six chapters, section 10, written as data on the runtime above. Registration
   order is play order: M() appends to ORDERED and to the chapter it declares,
   so the mission list, the unlock rule and "what comes next" all read from one
   place and cannot disagree with each other.

   CH1 remains as an alias because the arena code and the hangar board both
   reach into the table by name. */
var MISSIONS={}, CH1=MISSIONS, ORDERED=[];
var CHAPTERS=[
  {name:'ROOKIE WINGS',   missions:[]},
  {name:'THE OPEN SKIES', missions:[]},
  {name:'RIVAL ACES',     missions:[]},
  {name:'BROKEN ALLIANCE',missions:[]},
  {name:'THE SKY WAR',    missions:[]},
  {name:'WINGS UNITED',   missions:[]}
];
function M(def){
  MISSIONS[def.id]=def;
  ORDERED.push(def.id);
  var ch=CHAPTERS[(def.chapter||1)-1];
  if(ch)ch.missions.push(def.id);
  return def;
}
function missionIndex(id){var i=ORDERED.indexOf(id);return i<0?-1:i;}
/* A mission is reachable once the one before it has been flown. Nothing is
   gated on reputation or on a build: the bible's failure design (15.4) is
   "fly it again", never "come back when you are strong enough". */
function missionUnlocked(id){
  var i=missionIndex(id);
  if(i<0)return false;
  if(i===0||missionDone(id))return true;
  return missionDone(ORDERED[i-1]);
}
/* The furthest unflown mission that can be entered — what CONTINUE means. */
function nextPlayableMission(){
  if(SAVE.mission&&MISSIONS[SAVE.mission]&&!missionDone(SAVE.mission)&&
     missionUnlocked(SAVE.mission))return SAVE.mission;
  for(var i=0;i<ORDERED.length;i++)
    if(!missionDone(ORDERED[i])&&missionUnlocked(ORDERED[i]))return ORDERED[i];
  return null;
}

