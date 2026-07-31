/* ===================== net client =====================
   Socket, room membership and who-simulates-what.

   The authority rule, in one line: you simulate your own aircraft and nobody
   else's, except that whoever has been in the room longest also simulates the
   aircraft nobody is flying and the Core. Everything else on screen is an
   interpolated copy of what its owner said it was doing.

   That split is what keeps a flight game playable over a network. Your own
   aeroplane never waits for a round trip and is never rewound by a remote
   authority, which is the one thing a pilot would notice instantly. The cost is
   that the server takes a client's word for where it is — deliberate, and
   revisited in the deploy notes. */

var NET_OFF='off', NET_DIALLING='dialling', NET_LIVE='live', NET_LOST='lost', NET_ERROR='error';

var net={
  on:false,                 /* a match is being played over the wire */
  status:NET_OFF,
  error:'',
  server:'',                /* base URL of the arena worker */
  room:'',
  ws:null,
  slot:null,                /* my absolute slot, 0-7 */
  hostSlot:null,            /* who owns the AI aircraft and the Core */
  isHost:false,
  roster:{},                /* slot -> {callsign, team} for humans only */
  ai:[],                    /* slots currently under AI control */
  remotes:{},               /* slot -> interpolation buffer, see 55-net-sync */
  clockSkew:0,              /* server clock minus ours, ms */
  lastSend:0,
  lastRecv:0,
  retries:0,
  retryT:0,
  sendAcc:0
};

/* Where the arena server lives. Baked in so a player never has to know a URL;
   the lobby field stays editable for anyone running their own. The query
   parameter overrides both, for testing two browsers against a local
   `wrangler dev` without disturbing the stored setting. */
var ARENA_SERVER='https://airbourne-arena-net.luisminier79.workers.dev';
/* Precedence: an explicit ?net= wins, then a server the player deliberately
   typed, then the shipped default. The saved value has to outrank the default
   or anyone running their own server would be dragged back to ours on reload. */
function netServerUrl(){
  var q=new URLSearchParams(location.search).get('net');
  if(q)return q.replace(/\/+$/,'');
  try{
    var saved=localStorage.getItem('airbourne:net-server');
    if(saved)return saved.replace(/\/+$/,'');
  }catch(err){}
  return ARENA_SERVER.replace(/\/+$/,'');
}
function netSaveServerUrl(url){
  net.server=String(url||'').trim().replace(/\/+$/,'');
  try{
    /* Only a departure from the shipped default is worth remembering. Storing
       the default too would pin every player to whatever URL was current the
       first time they opened the lobby, and moving the server later would
       strand all of them. */
    if(net.server&&net.server!==ARENA_SERVER.replace(/\/+$/,''))
      localStorage.setItem('airbourne:net-server',net.server);
    else localStorage.removeItem('airbourne:net-server');
  }catch(err){}
}

function netSocketUrl(base,room){
  /* An https origin has to dial wss, and a plain http one ws — mixing them is
     blocked by the browser with an error that does not mention the scheme. */
  var url=base.replace(/^http/,'ws');
  if(!/^wss?:/.test(url))url=(location.protocol==='https:'?'wss://':'ws://')+url;
  return url+'/api/room/'+room+'/socket';
}

/* ---------- slot <-> fighter ---------- */
function netFighterForSlot(slot){
  var team=netSlotTeam(slot), index=netSlotIndex(slot);
  for(var i=0;i<fighters.length;i++)
    if(fighters[i].team===team&&fighters[i].slot===index)return fighters[i];
  return null;
}
function netSlotForFighter(f){return netSlotId(f.team,f.slot);}

/* Does this client run the physics for this aircraft? Everything downstream —
   whether AI thinks for it, whether damage lands on it, whether it is stepped
   or interpolated — is this one question. */
function netOwns(f){
  if(!net.on)return true;
  var slot=netSlotForFighter(f);
  if(slot===net.slot)return true;
  return net.isHost&&net.ai.indexOf(slot)>=0;
}
function netIsRemote(f){return net.on&&!netOwns(f);}

/* The Core needs exactly one simulator for the same reason an aircraft does,
   and it belongs to nobody in particular — so it goes to the arena host along
   with the aircraft nobody is flying. */
function netOwnsCore(){return !net.on||net.isHost;}

/* Rounds are also fired by AA emplacements, drones and convoys, none of which
   have a slot on the wire. They belong to the arena host, along with everything
   else in the world that nobody is personally flying. */
function netOwnsEntity(e){
  if(!net.on)return true;
  if(!e||fighters.indexOf(e)<0)return net.isHost;
  return netOwns(e);
}

/* ---------- seating ----------
   The server decides which aircraft you are, which may not be the one the
   hangar had you in. Both the team and the position within it can change, and
   the mesh differs between a player aircraft and an AI one, so the eight are
   rebuilt rather than patched. */
function netSeatPlayer(slot){
  var team=netSlotTeam(slot), index=netSlotIndex(slot);
  if(player&&player.team===team&&player.slot===index){netApplyRoster();return;}
  for(var i=0;i<fighters.length;i++)scene.remove(fighters[i].mesh);
  fighters.length=0;
  PILOT.team=team;
  claimLeadName();
  var foe=foeOf(team);
  for(var a=0;a<4;a++)makeFighter(team,a,a===index);
  for(var b=0;b<4;b++)makeFighter(foe,b,false);
  for(var k=0;k<fighters.length;k++)if(fighters[k].isPlayer)player=fighters[k];
  applyPilot();
  netApplyRoster();
}

/* Human-flown aircraft carry their pilot's callsign; the rest keep the roster
   names the single-player game already uses. claimLeadName() stamps your own
   callsign onto slot 0 of your team, which is wrong the moment slot 0 is
   somebody else, so this runs after it and puts every name back. */
function netApplyRoster(){
  for(var i=0;i<fighters.length;i++){
    var f=fighters[i], slot=netSlotForFighter(f);
    var seat=net.roster[slot];
    f.name=seat?seat.callsign:NAMES[f.team][f.slot];
    f.netHuman=!!seat&&slot!==net.slot;
  }
  if(player)player.name=PILOT.callsign;
  if(typeof renderRoster==='function')renderRoster();
}

/* ---------- connection ---------- */
function netCreateRoom(base,done){
  var url=base.replace(/\/+$/,'')+'/api/room';
  fetch(url,{method:'POST'})
    .then(function(r){return r.ok?r.json():r.json().then(function(b){throw new Error(b.error||'server');});})
    .then(function(body){done(null,body.code);})
    .catch(function(err){done(err);});
}

function netConnect(base,room){
  netDisconnect(true);
  net.server=base.replace(/\/+$/,'');
  net.room=room;
  net.status=NET_DIALLING;
  net.error='';
  net.on=true;
  var ws;
  try{
    ws=new WebSocket(netSocketUrl(net.server,room));
  }catch(err){
    netFail('could not open a socket to '+net.server);
    return;
  }
  ws.binaryType='arraybuffer';
  net.ws=ws;
  ws.onopen=function(){
    net.lastRecv=performance.now();
    netSend({t:NET_C.HELLO,v:NET_PROTOCOL_VERSION,
      callsign:PILOT.callsign,team:PILOT.team});
  };
  ws.onmessage=function(e){
    net.lastRecv=performance.now();
    if(typeof e.data==='string'){
      var msg=null;
      try{msg=JSON.parse(e.data);}catch(err){return;}
      netOnControl(msg);
    } else netOnSnapshot(e.data);
  };
  ws.onerror=function(){
    /* onerror fires without detail by design; onclose carries the code, so the
       message the player sees is written there. */
  };
  ws.onclose=function(evt){
    if(net.ws!==ws)return;
    net.ws=null;
    if(!net.on)return;
    if(evt.code===4001){netFail('this build is too old for that server');return;}
    if(evt.code===4002){netFail('that match is full');return;}
    net.status=NET_LOST;
    net.retryT=1.5;
  };
}

function netDisconnect(quiet){
  if(net.ws){
    try{netSend({t:NET_C.BYE});net.ws.close(1000,'left');}catch(err){}
    net.ws=null;
  }
  net.on=false; net.slot=null; net.hostSlot=null; net.isHost=false;
  net.roster={}; net.ai=[]; net.remotes={}; net.retries=0; net.retryT=0;
  if(!quiet){net.status=NET_OFF;net.error='';}
}

function netFail(message){
  net.on=false; net.status=NET_ERROR; net.error=message;
  net.ws=null;
  if(typeof netLobbyRefresh==='function')netLobbyRefresh();
}

function netSend(obj){
  if(!net.ws||net.ws.readyState!==1)return;
  try{net.ws.send(JSON.stringify(obj));}catch(err){}
}
function netSendHot(buffer){
  if(!net.ws||net.ws.readyState!==1)return;
  try{net.ws.send(buffer);}catch(err){}
}

/* ---------- control messages ---------- */
function netOnControl(msg){
  if(msg.t===NET_S.WELCOME){
    net.slot=msg.you.slot;
    net.roster={};
    for(var i=0;i<msg.roster.length;i++)
      net.roster[msg.roster[i].slot]={callsign:msg.roster[i].callsign,team:msg.roster[i].team};
    net.ai=msg.ai||[];
    net.hostSlot=msg.host;
    net.isHost=msg.host===net.slot;
    net.status=NET_LIVE;
    net.retries=0;
    netSeatPlayer(net.slot);
    netApplyScore(msg.score,msg.clock,msg.over);
    banner('ONLINE — '+net.room,2);
    feed('<span style="color:#6fe3d0">joined '+net.room+'</span> as '+PILOT.callsign);
    if(typeof netLobbyRefresh==='function')netLobbyRefresh();
    return;
  }
  if(msg.t===NET_S.REJECT){
    netFail(msg.why===NET_REJECT.VERSION?'this build is too old for that server'
      :msg.why===NET_REJECT.FULL?'that match is full':'that room code was refused');
    return;
  }
  if(msg.t===NET_S.PEER_JOIN){
    net.roster[msg.slot]={callsign:msg.callsign,team:msg.team};
    net.ai=msg.ai||net.ai;
    if(msg.host!==undefined)netSetHost(msg.host);
    netApplyRoster();
    feed('<span style="color:'+teamHex(msg.team)+'">'+msg.callsign+'</span> joined');
    if(typeof netLobbyRefresh==='function')netLobbyRefresh();
    return;
  }
  if(msg.t===NET_S.PEER_LEAVE){
    var gone=net.roster[msg.slot];
    delete net.roster[msg.slot];
    delete net.remotes[msg.slot];
    net.ai=msg.ai||net.ai;
    netApplyRoster();
    if(gone)feed('<span style="color:'+teamHex(gone.team)+'">'+gone.callsign+'</span> left — AI has the aircraft');
    if(typeof netLobbyRefresh==='function')netLobbyRefresh();
    return;
  }
  if(msg.t===NET_S.HOST){
    net.ai=msg.ai||net.ai;
    netSetHost(msg.slot);
    return;
  }
  if(msg.t===NET_S.SCORE){
    netApplyScore({blue:msg.blue,red:msg.red},msg.clock,msg.over);
    return;
  }
  if(msg.t===NET_S.HIT){netOnRemoteHit(msg);return;}
  if(msg.t===NET_S.EVENT){netOnRemoteEvent(msg);return;}
}

function netSetHost(slot){
  var was=net.isHost;
  net.hostSlot=slot;
  net.isHost=slot===net.slot;
  if(net.isHost&&!was){
    /* Inheriting the room mid-match means inheriting aircraft that have been
       interpolating rather than flying. Their velocity is whatever the last two
       packets implied, which is close enough for the AI to take the controls
       from without a visible jump. */
    feed('<span style="color:#ffb347">you are hosting the arena</span>');
    for(var i=0;i<net.ai.length;i++)delete net.remotes[net.ai[i]];
  }
  if(typeof netLobbyRefresh==='function')netLobbyRefresh();
}

/* The scoreboard and the clock are the server's, not ours. Taking them wholesale
   is what stops two clients disagreeing about who won. */
function netApplyScore(score,clock,over){
  if(score){st.scoreB=score.blue;st.scoreR=score.red;}
  if(typeof clock==='number')st.time=clock;
  if(over&&!st.over)endMatch();
}
