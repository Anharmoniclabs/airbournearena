/* ===================== settings =====================
   Everything the player can tune, persisted across sessions. Defaults
   reproduce the original feel, except reduced motion, which follows the
   operating system the first time the game is opened. */
var SKEY='airbourne:settings';
var prefersReduced=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches);
var cfg={sens:180,invert:false,pad:true,vol:70,engine:true,
         hud:100,diff:1,cb:false,motion:prefersReduced,coach:true,
         /* -1 means "work it out": start from the pointer type and step down if
            measured frame times say this machine cannot hold it. 0/1/2 pin the
            tier and switch the measuring off. See 05a-quality-tier.js. */
         gfx:-1};
(function loadCfg(){
  try{
    var saved=JSON.parse(localStorage.getItem(SKEY)||'null');
    if(!saved)return;
    for(var k in cfg)if(typeof saved[k]===typeof cfg[k])cfg[k]=saved[k];
  }catch(err){}
})();
function saveCfg(){try{localStorage.setItem(SKEY,JSON.stringify(cfg));}catch(err){}}

