/* ===================== toast ===================== */
var toastEl=document.getElementById('toast'),toastT=0;
function toast(msg,secs){
  if(!toastEl)return;
  toastEl.textContent=msg; toastEl.classList.add('on'); toastT=secs||2.2;
}

/* ===================== damage direction =====================
   An arc of a ring centred on the screen, rotated so it sits between you and
   whoever is shooting. Being hit from behind is otherwise invisible. */
var dmgDirEl=document.getElementById('dmgDir'),dmgArcs=[],_dmgV=new THREE.Vector3();
function dmgFrom(worldPos){
  if(!dmgDirEl)return;
  axes(player);
  /* its own vector: this runs from hurt(), deep inside the bullet loop, which
     is already holding the shared temporaries */
  var to=_dmgV.copy(worldPos).sub(player.pos);
  if(to.lengthSq()<1e-4)return;
  var ang=Math.atan2(to.dot(_r),to.dot(_f))*180/Math.PI;
  /* refresh an arc already pointing the same way instead of stacking them */
  for(var i=0;i<dmgArcs.length;i++){
    if(Math.abs(dmgArcs[i].ang-ang)<26){dmgArcs[i].t=1.5;dmgArcs[i].ang=ang;return;}
  }
  var node=document.createElement('div');
  node.className='dmgArc';
  node.style.transform='rotate('+ang.toFixed(1)+'deg)';
  dmgDirEl.appendChild(node);
  dmgArcs.push({node:node,ang:ang,t:1.5});
}
function stepDmgArcs(dt){
  for(var i=dmgArcs.length-1;i>=0;i--){
    var a=dmgArcs[i]; a.t-=dt;
    if(a.t<=0){dmgDirEl.removeChild(a.node);dmgArcs.splice(i,1);continue;}
    a.node.style.opacity=Math.min(1,a.t/0.9).toFixed(2);
    a.node.style.transform='rotate('+a.ang.toFixed(1)+'deg)';
  }
}

