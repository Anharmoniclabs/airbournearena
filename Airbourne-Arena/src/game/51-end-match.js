function endMatch(){
  if(st.over)return; st.over=true;
  var winTeam=st.scoreB>st.scoreR?'blue':(st.scoreR>st.scoreB?'red':null);
  el.endT.textContent=winTeam?factionName(winTeam)+' TAKES IT':'STALEMATE';
  el.endT.style.color=winTeam?teamHex(winTeam):'var(--ink)';
  var accuracy=sortie.shots?Math.round(sortie.hits/sortie.shots*100):0;
  emit('match_end',{winner:winTeam||'draw',blue:st.scoreB,red:st.scoreR});
  el.endS.innerHTML='<span style="color:'+teamHex('blue')+'">'+st.scoreB+'</span>'+
    ' &mdash; <span style="color:'+teamHex('red')+'">'+st.scoreR+'</span>';
  var stats=[['KILLS',player.kills],['CAPTURES',player.caps],['PASSES',sortie.passes],
             ['SHOTS',sortie.shots],['ACCURACY',accuracy+'%'],['STALLS',sortie.stalls],
             ['LOSSES',sortie.deaths],['DIFFICULTY',DIFF[clamp(cfg.diff|0,0,2)].name]];
  var html='';
  for(var i=0;i<stats.length;i++)
    html+='<div class="endStat"><b>'+stats[i][1]+'</b><span>'+stats[i][0]+'</span></div>';
  document.getElementById('endStats').innerHTML=html;
  /* name the mission the button will load, so the story button is a promise of
     something specific rather than a second "play again" */
  var sb=document.getElementById('endStoryBtn');
  if(sb){
    var nid=nextPlayableMission();
    sb.textContent=nid
      ? ((SAVE&&SAVE.completed&&SAVE.completed.length?'CONTINUE — ':'BEGIN — ')+MISSIONS[nid].title)
      : 'BREAKWATER HANGAR';
  }
  el.end.classList.add('on');
  /* which chord plays depends on whether YOU won, not on which colour did —
     the player is no longer always blue */
  stingSfx(winTeam===player.team?[523,659,784,1046]:[440,392,330],.2);
  if(document.exitPointerLock)document.exitPointerLock();
}

