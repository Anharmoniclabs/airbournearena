/* ===================== online lobby =====================
   Opening a room hands back a five-character code. Anyone with the code joins
   the same match. Seats nobody has taken keep flying themselves, so a room is
   playable from the moment it exists rather than from the moment it fills — the
   arena already ran eight AI aircraft, and a human joining is only that AI
   letting go of one of them. */

var netEl={
  panel:document.getElementById('netLobby'),
  status:document.getElementById('netStatus'),
  server:document.getElementById('netServer'),
  code:document.getElementById('netCode'),
  roster:document.getElementById('netRoster'),
  host:document.getElementById('netHostBtn'),
  join:document.getElementById('netJoinBtn'),
  leave:document.getElementById('netLeaveBtn'),
  close:document.getElementById('netCloseBtn'),
  tag:document.getElementById('netTag')
};

function netLobbyOpen(){
  if(!netEl.panel)return;
  netEl.server.value=net.server||netServerUrl();
  netEl.panel.classList.add('on');
  if(document.exitPointerLock)document.exitPointerLock();
  netLobbyRefresh();
}
function netLobbyClose(){
  if(netEl.panel)netEl.panel.classList.remove('on');
}

function netSetStatus(text,kind){
  if(!netEl.status)return;
  netEl.status.textContent=text;
  netEl.status.className='netStatus'+(kind?' '+kind:'');
}

function netLobbyRefresh(){
  if(!netEl.panel)return;
  if(net.status===NET_LIVE){
    netSetStatus('IN ROOM '+net.room+(net.isHost?' · HOSTING THE ARENA':''),'live');
  } else if(net.status===NET_DIALLING){
    netSetStatus('CONNECTING…','busy');
  } else if(net.status===NET_LOST){
    netSetStatus('CONNECTION LOST — RETRYING','busy');
  } else if(net.status===NET_ERROR){
    netSetStatus(net.error.toUpperCase(),'bad');
  } else {
    netSetStatus('OFFLINE');
  }
  var live=net.status===NET_LIVE||net.status===NET_DIALLING;
  netEl.host.disabled=live;
  netEl.join.disabled=live;
  netEl.leave.disabled=!net.on;
  if(net.room&&netEl.code.value!==net.room)netEl.code.value=net.room;
  netRenderSeats();
  netRenderTag();
}

/* Both teams, all eight seats, in slot order — the point of the list is to show
   at a glance which aircraft have somebody in them. */
function netRenderSeats(){
  if(!netEl.roster)return;
  if(!net.on){netEl.roster.innerHTML='';return;}
  var html='';
  for(var slot=0;slot<NET_MAX_SLOTS;slot++){
    var team=netSlotTeam(slot), seat=net.roster[slot];
    var mine=slot===net.slot, isHost=slot===net.hostSlot;
    var who=seat?seat.callsign:NAMES[team][netSlotIndex(slot)];
    var kind=seat?(mine?'YOU':'PILOT'):'AI';
    if(isHost&&seat)kind+=' · ARENA';
    html+='<div class="netSeat'+(seat?' human':'')+(mine?' you':'')+(isHost?' host':'')+'">'+
      '<span class="pip"></span>'+
      '<span class="who" style="color:'+(mine?'':teamHex(team))+'">'+who+'</span>'+
      '<span class="kind">'+kind+'</span></div>';
  }
  netEl.roster.innerHTML=html;
}

/* A one-line reminder over the HUD that this is a live match, and how many
   people are in it. It turns amber the moment the socket is in trouble, which
   is the only network state worth interrupting a fight for. */
function netRenderTag(){
  if(!netEl.tag)return;
  if(!net.on){netEl.tag.classList.remove('on');return;}
  var humans=0;
  for(var k in net.roster)if(Object.prototype.hasOwnProperty.call(net.roster,k))humans++;
  var trouble=net.status===NET_LOST||net.status===NET_DIALLING;
  netEl.tag.textContent=trouble
    ? 'RECONNECTING TO '+net.room
    : net.room+' · '+humans+' PILOT'+(humans===1?'':'S')+' · '+(NET_MAX_SLOTS-humans)+' AI';
  netEl.tag.classList.add('on');
  netEl.tag.classList.toggle('warn',trouble);
}

function netLobbyServer(){
  var url=(netEl.server.value||'').trim();
  if(!url){netSetStatus('ENTER THE ARENA SERVER URL','bad');return null;}
  if(!/^https?:\/\//i.test(url))url='https://'+url;
  netSaveServerUrl(url);
  netEl.server.value=net.server;
  return net.server;
}

bindBtn(netEl.host,function(){
  var base=netLobbyServer();
  if(!base)return;
  netSetStatus('OPENING A ROOM…','busy');
  netCreateRoom(base,function(err,code){
    if(err){netSetStatus('COULD NOT REACH THAT SERVER','bad');return;}
    netEl.code.value=code;
    netConnect(base,code);
    netLobbyRefresh();
  });
});

bindBtn(netEl.join,function(){
  var base=netLobbyServer();
  if(!base)return;
  var code=netNormaliseRoomCode(netEl.code.value);
  if(!code){netSetStatus('THAT ROOM CODE IS NOT VALID','bad');return;}
  netEl.code.value=code;
  netConnect(base,code);
  netLobbyRefresh();
});

bindBtn(netEl.leave,function(){
  netDisconnect();
  /* Back to eight AI aircraft with the player in the seat the hangar chose,
     which is what the offline game expects to find. */
  netSeatPlayer(netSlotId(PILOT.team,0));
  banner('LEFT THE ROOM',1.4);
  netLobbyRefresh();
});

bindBtn(netEl.close,netLobbyClose);
bindBtn('briefNetBtn',netLobbyOpen);

if(netEl.code){
  netEl.code.addEventListener('input',function(){
    netEl.code.value=netEl.code.value.toUpperCase().replace(/[^0-9A-Z]/g,'').slice(0,NET_ROOM_CODE_LENGTH);
  });
}

addEventListener('keydown',function(e){
  if(!netEl.panel||!netEl.panel.classList.contains('on'))return;
  if(e.code==='Escape'){netLobbyClose();e.preventDefault();}
});

/* A code in the URL is how an invite travels: send someone
   .../index.html?room=ABCDE and the lobby is already filled in for them. */
(function(){
  var params=new URLSearchParams(location.search);
  var room=netNormaliseRoomCode(params.get('room'));
  net.server=netServerUrl();
  if(room&&netEl.code)netEl.code.value=room;
  if(room&&net.server)netConnect(net.server,room);
  netLobbyRefresh();
})();
