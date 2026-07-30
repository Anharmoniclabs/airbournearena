/* ===================== PHASE 1 — FOUNDATION =====================
   STORY-BIBLE section 23. Everything narrative hangs off four structures kept
   deliberately separate from the flight code: a versioned save, a reputation
   ledger, an aircraft loadout, and a mission state machine. The bible asks for
   this separation even though we ship one HTML file, and it is what lets
   Missions 1 to 10 be data rather than ten bespoke code paths.            */
var SAVE_KEY='airbourne:save', SAVE_VERSION=1;

/* --- reputation (section 17.1) --- */
var REP_KEYS=['vanguard','tempest','inferno','independent','civilian','blackwing'];

/* --- loadout parts (section 13.4). Every part states its cost as plainly as
   its benefit, because section 2.4 forbids a straight path to one perfect
   aircraft and section 13.3 requires the hangar to show the trade. --- */
var PARTS={
  engine:[
    {id:'turbine', name:'BALANCED TURBINE', thrust:1.00, agile:1.00, mass:1.00, heat:1.00},
    {id:'booster', name:'HIGH-OUTPUT BOOSTER', thrust:1.18, agile:0.92, mass:1.05, heat:1.30},
    {id:'longrange',name:'LONG-RANGE ENGINE', thrust:0.92, agile:1.02, mass:0.95, heat:0.80},
    {id:'heavy',   name:'HEAVY-LOAD PLANT', thrust:1.10, agile:0.86, mass:1.18, heat:1.10}],
  wings:[
    {id:'stable',  name:'STABLE CONTROL', agile:1.00, mass:1.00},
    {id:'highturn',name:'HIGH-TURN', agile:1.16, mass:0.98, armor:0.92},
    {id:'swept',   name:'SWEPT HIGH-SPEED', agile:0.90, thrust:1.08, mass:1.00},
    {id:'armored', name:'ARMORED WINGS', agile:0.88, armor:1.15, mass:1.10}],
  armor:[
    {id:'light',   name:'LIGHT COMPOSITE', armor:1.00, mass:1.00},
    {id:'plate',   name:'REINFORCED PLATE', armor:1.30, mass:1.14, agile:0.93},
    {id:'reactive',name:'REACTIVE ARMOR', armor:1.18, mass:1.08, agile:0.96},
    {id:'lattice', name:'SELF-REPAIR LATTICE',armor:1.05, mass:1.06, regen:1.6}],
  primary:[
    {id:'machine', name:'MACHINE CANNON', dmg:1.00, rate:1.00, heat:1.00},
    {id:'heavy',   name:'HEAVY CANNON', dmg:1.55, rate:0.62, heat:1.35},
    {id:'burst',   name:'BURST LASER', dmg:0.78, rate:1.45, heat:1.20},
    {id:'scatter', name:'SCATTER CANNON', dmg:1.20, rate:0.85, heat:1.10, spread:2.4}]
};
function part(slot,id){
  var list=PARTS[slot];
  for(var i=0;i<list.length;i++)if(list[i].id===id)return list[i];
  return list[0];
}

/* --- active powers (section 14). Declared here so the trials can preview one
   and team selection can grant one; the arena reads only `id`. --- */
var POWERS={
  guardian:{name:'GUARDIAN FIELD', team:'blue',  blurb:'Shields you and nearby allies.'},
  velocity:{name:'VELOCITY BURST', team:'tempest',blurb:'Extreme controlled speed.'},
  overdrive:{name:'WEAPONS OVERDRIVE', team:'red',blurb:'More damage, rate and heat headroom.'}
};

/* --- rival trust (section 17.3) and the unity score (17.4). Both are read by
   Chapter 6 to pick an ending, so they are part of the save rather than one
   chapter's private state. --- */
var TRUST_KEYS=['aras','mercer','serrano','nyx'];

function freshSave(){
  var rep={},trust={};
  for(var i=0;i<REP_KEYS.length;i++)rep[REP_KEYS[i]]=0;
  for(var j=0;j<TRUST_KEYS.length;j++)trust[TRUST_KEYS[j]]=0;
  return {version:SAVE_VERSION, chapter:1, mission:'ch1_m1', completed:[], flags:{},
    rep:rep, trust:trust, unity:0, credits:0, trials:{}, ending:null,
    loadout:{engine:'turbine',wings:'stable',armor:'light',primary:'machine',power:null}};
}
var SAVE=freshSave();
function loadSave(){
  try{
    var raw=localStorage.getItem(SAVE_KEY);
    if(!raw)return;
    var s=JSON.parse(raw);
    /* a save from a future or unknown version is discarded rather than
       half-read; a broken campaign is worse than a restarted one */
    if(!s||s.version!==SAVE_VERSION)return;
    var f=freshSave();
    SAVE=Object.assign(f,s);
    SAVE.rep=Object.assign(f.rep,s.rep||{});
    SAVE.trust=Object.assign(f.trust,s.trust||{});
    SAVE.loadout=Object.assign(f.loadout,s.loadout||{});
    SAVE.flags=s.flags||{};
    SAVE.completed=s.completed||[];
    if(typeof SAVE.unity!=='number')SAVE.unity=0;
  }catch(err){SAVE=freshSave();}
}
function saveGame(){
  try{localStorage.setItem(SAVE_KEY,JSON.stringify(SAVE));}catch(err){}
}
loadSave();
function addRep(key,amount){
  if(!(key in SAVE.rep))return;
  SAVE.rep[key]=clamp(SAVE.rep[key]+amount,-100,100);
}
function addTrust(key,amount){
  if(!(key in SAVE.trust))return;
  SAVE.trust[key]=clamp(SAVE.trust[key]+amount,-100,100);
}
/* Section 17.4: unity is what the player did across faction lines, not a
   difficulty setting. Every choice that shares, protects or refuses to exploit
   moves it, and Chapter 6 reads it to decide which ending is available. */
function addUnity(amount){SAVE.unity=clamp(SAVE.unity+amount,-100,100);}
function alliedAces(){
  var n=0;
  for(var i=0;i<TRUST_KEYS.length;i++)if(SAVE.trust[TRUST_KEYS[i]]>=20)n++;
  return n;
}
function missionDone(id){return SAVE.completed.indexOf(id)>=0;}

/* Loadout to flight model. The arena already reads trimThrust and trimAgile,
   so a build lands on the aircraft through the same two numbers the fit-out
   slider uses — no second path into stepFlight. */
function applyLoadout(){
  if(!player||typeof SAVE==='undefined'||!SAVE)return;
  var e=part('engine',SAVE.loadout.engine), w=part('wings',SAVE.loadout.wings),
      a=part('armor',SAVE.loadout.armor),   g=part('primary',SAVE.loadout.primary);
  var mass=(e.mass||1)*(w.mass||1)*(a.mass||1);
  player.trimThrust=(1+PILOT.trim*0.10)*(e.thrust||1)*(w.thrust||1)/mass;
  player.trimAgile =(1-PILOT.trim*0.10)*(e.agile||1)*(w.agile||1)*(a.agile||1);
  player.armorMul=(a.armor||1)*(w.armor||1);
  player.regenMul=a.regen||0;
  player.gunDmg=g.dmg||1; player.gunRate=g.rate||1; player.gunSpread=g.spread||1;
  player.maxHp=Math.round(100*player.armorMul);
}

/* ===================== radio (section 20) =====================
   Dialogue supports flying rather than competing with it: one short line at a
   time, queued, self-clearing, and never blocking control. */
var radio={q:[],cur:null,t:0};
function say(who,text,secs){radio.q.push({who:who,text:text,t:secs||3.4});}
function sayNow(who,text,secs){radio.q.length=0;radio.cur=null;say(who,text,secs);}
function clearRadio(){radio.q.length=0;radio.cur=null;radio.t=0;}
function stepRadio(dt){
  if(!radio.cur){
    if(!radio.q.length){if(rEl.radio)rEl.radio.classList.remove('on');return;}
    radio.cur=radio.q.shift(); radio.t=radio.cur.t;
    if(rEl.radio){
      rEl.radioWho.textContent=radio.cur.who;
      rEl.radioText.textContent=radio.cur.text;
      rEl.radio.classList.add('on');
    }
    tone(520,.05,.05,'square');
  }
  radio.t-=dt;
  if(radio.t<=0)radio.cur=null;
}
function radioBusy(){return !!(radio.cur||radio.q.length);}

/* ===================== disposal =====================
   three.js does not release GPU memory when a mesh leaves the scene graph, and
   a six-chapter campaign builds and discards several hundred gates, aircraft
   and installations in a single session — each with its own geometry, its own
   inline material and, for every beacon and halo, its own 128x128 canvas
   texture. Removing them from the scene only ever made them invisible; the
   buffers stayed allocated until the tab ran out and the renderer died.

   Everything cleared through here is built per-object, so it is freed
   per-object. The few materials the kit shares between objects are named and
   skipped, and only generated canvas textures are disposed — the loaded skins
   belong to the asset kit and outlive every mission. */
var _sharedMats=null;
function disposeSubtree(root){
  if(!root)return;
  if(!_sharedMats)_sharedMats=[steelMat];
  root.traverse(function(o){
    if(o.geometry&&o.geometry.dispose)o.geometry.dispose();
    var m=o.material;
    if(!m)return;
    var list=Array.isArray(m)?m:[m];
    for(var i=0;i<list.length;i++){
      var mat=list[i];
      if(!mat||_sharedMats.indexOf(mat)>=0)continue;
      if(mat.map&&mat.map.isCanvasTexture&&mat.map.dispose)mat.map.dispose();
      if(mat.dispose)mat.dispose();
    }
  });
}

