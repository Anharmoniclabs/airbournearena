/* ===================== net protocol =====================
   The browser half of the wire format. The canonical copy lives at
   source/worker/protocol.mjs; this one exists because the game is a single
   concatenated IIFE that must stay loadable from a file:// URL, and `import`
   is not available to it.

   Keeping two copies is a real hazard, so source/tests/net-protocol.test.mjs
   encodes with each and decodes with the other, in both directions, over the
   full field set. A change to one that is not mirrored in the other fails the
   build rather than silently corrupting every packet at runtime.

   Two channels over one socket: JSON strings for control (join, roster, score),
   packed ArrayBuffers for aircraft state at NET_STATE_HZ. */
var NET_PROTOCOL_VERSION=1;
var NET_STATE_HZ=20;
/* How far behind live remote aircraft are drawn. Long enough that a late packet
   still lands before its frame is due, short enough that the lead you pull on a
   remote target is honest. */
var NET_INTERP_DELAY_MS=110;
/* Past this with no fresh packet a remote holds its last attitude instead of
   flying on. A frozen aircraft reads as a network problem; one that keeps
   coasting reads as a teleport the moment packets resume. */
var NET_EXTRAPOLATE_MAX_MS=250;
var NET_HEARTBEAT_MS=3000;
var NET_MAX_SLOTS=8, NET_SLOTS_PER_TEAM=4;
var NET_ROOM_CODE_LENGTH=5;
var NET_ROOM_CODE_ALPHABET='23456789BCDFGHJKMNPQRSTVWXYZ';

var NET_C={HELLO:'hello',STATE_ACK:'ack',HIT:'hit',EVENT:'event',BYE:'bye'};
var NET_S={WELCOME:'welcome',REJECT:'reject',PEER_JOIN:'peer_join',
  PEER_LEAVE:'peer_leave',HOST:'host',SCORE:'score',HIT:'hit',EVENT:'event'};
/* REMATCH may be called by any pilot, and only once the match is over.
   Restricting it to the arena host would strand a finished room whenever the
   host is the one who walked away from the keyboard. */
var NET_EV={KILL:'kill',RESPAWN:'respawn',CORE_GRAB:'core_grab',
  CORE_PASS:'core_pass',CORE_DROP:'core_drop',CORE_SCORE:'core_score',
  DAMAGE:'damage',REMATCH:'rematch'};
var NET_REJECT={VERSION:'version',FULL:'full',BAD_ROOM:'bad_room'};

/* Slots are absolute — 0-3 blue, 4-7 red — and never array positions. The
   game's fighters[] is built player's-team-first and so reorders whenever the
   player switches sides in the hangar; indexing the wire by array position
   would swap two aircraft the moment anyone did that. */
function netSlotId(team,index){return (team==='red'?NET_SLOTS_PER_TEAM:0)+index;}
function netSlotTeam(slot){return slot<NET_SLOTS_PER_TEAM?'blue':'red';}
function netSlotIndex(slot){return slot%NET_SLOTS_PER_TEAM;}

var NET_KIND_STATE=1, NET_KIND_SNAPSHOT=2;
var NET_HEADER_BYTES=12, NET_AIRCRAFT_BYTES=44, NET_CORE_BYTES=28;
var NET_CORE_NO_CARRIER=0xff;
var NET_FLAG_ALIVE=1, NET_FLAG_CARRYING=2, NET_FLAG_BURNER=4,
    NET_FLAG_FIRING=8, NET_FLAG_STALLED=16;

function netClampByte(value,max){
  if(!isFinite(value))return 0;
  if(value<0)return 0;
  if(value>max)return max;
  return Math.round(value);
}

/* Layout, little-endian:
     u8 kind, u8 count, u8 hasCore, u8 reserved, f64 time
     per aircraft (44): u8 slot, u8 flags, u8 hp, u8 throttle,
                        f32 pos xyz, f32 quat xyzw, f32 vel xyz
     core (28): u8 carrier, u8 charge, u16 reserved, f32 pos xyz, f32 vel xyz  */
function netEncodeState(kind,time,aircraft,core){
  var count=aircraft.length, hasCore=core?1:0;
  var buffer=new ArrayBuffer(NET_HEADER_BYTES+count*NET_AIRCRAFT_BYTES+hasCore*NET_CORE_BYTES);
  var view=new DataView(buffer);
  view.setUint8(0,kind); view.setUint8(1,count);
  view.setUint8(2,hasCore); view.setUint8(3,0);
  view.setFloat64(4,time,true);
  var at=NET_HEADER_BYTES;
  for(var i=0;i<count;i++){
    var a=aircraft[i];
    view.setUint8(at,a.slot);
    view.setUint8(at+1,a.flags);
    view.setUint8(at+2,netClampByte(a.hp,100));
    view.setUint8(at+3,netClampByte(Math.round(a.throttle*255),255));
    view.setFloat32(at+4,a.px,true);
    view.setFloat32(at+8,a.py,true);
    view.setFloat32(at+12,a.pz,true);
    view.setFloat32(at+16,a.qx,true);
    view.setFloat32(at+20,a.qy,true);
    view.setFloat32(at+24,a.qz,true);
    view.setFloat32(at+28,a.qw,true);
    view.setFloat32(at+32,a.vx,true);
    view.setFloat32(at+36,a.vy,true);
    view.setFloat32(at+40,a.vz,true);
    at+=NET_AIRCRAFT_BYTES;
  }
  if(core){
    view.setUint8(at,core.carrier===null?NET_CORE_NO_CARRIER:core.carrier);
    view.setUint8(at+1,netClampByte(core.charge,100));
    view.setUint16(at+2,0,true);
    view.setFloat32(at+4,core.px,true);
    view.setFloat32(at+8,core.py,true);
    view.setFloat32(at+12,core.pz,true);
    view.setFloat32(at+16,core.vx,true);
    view.setFloat32(at+20,core.vy,true);
    view.setFloat32(at+24,core.vz,true);
  }
  return buffer;
}

function netDecodeState(buffer){
  var bytes=buffer.byteLength;
  if(bytes<NET_HEADER_BYTES)return null;
  var view=new DataView(buffer);
  var kind=view.getUint8(0);
  if(kind!==NET_KIND_STATE&&kind!==NET_KIND_SNAPSHOT)return null;
  var count=view.getUint8(1), hasCore=view.getUint8(2)===1;
  /* A frame of the wrong length is a malformed frame. Decoding whichever
     records happen to fit would hand the game a half-filled snapshot, which
     shows up as one aircraft parked at the origin rather than as an error
     anyone can trace. */
  if(bytes!==NET_HEADER_BYTES+count*NET_AIRCRAFT_BYTES+(hasCore?NET_CORE_BYTES:0))return null;
  var time=view.getFloat64(4,true);
  var aircraft=[], at=NET_HEADER_BYTES;
  for(var i=0;i<count;i++){
    aircraft.push({
      slot:view.getUint8(at), flags:view.getUint8(at+1),
      hp:view.getUint8(at+2), throttle:view.getUint8(at+3)/255,
      px:view.getFloat32(at+4,true), py:view.getFloat32(at+8,true), pz:view.getFloat32(at+12,true),
      qx:view.getFloat32(at+16,true), qy:view.getFloat32(at+20,true),
      qz:view.getFloat32(at+24,true), qw:view.getFloat32(at+28,true),
      vx:view.getFloat32(at+32,true), vy:view.getFloat32(at+36,true), vz:view.getFloat32(at+40,true)});
    at+=NET_AIRCRAFT_BYTES;
  }
  var core=null;
  if(hasCore){
    var carrier=view.getUint8(at);
    core={carrier:carrier===NET_CORE_NO_CARRIER?null:carrier,
      charge:view.getUint8(at+1),
      px:view.getFloat32(at+4,true), py:view.getFloat32(at+8,true), pz:view.getFloat32(at+12,true),
      vx:view.getFloat32(at+16,true), vy:view.getFloat32(at+20,true), vz:view.getFloat32(at+24,true)};
  }
  return {kind:kind,time:time,aircraft:aircraft,core:core};
}

function netIsRoomCode(code){
  if(typeof code!=='string'||code.length!==NET_ROOM_CODE_LENGTH)return false;
  for(var i=0;i<code.length;i++)
    if(NET_ROOM_CODE_ALPHABET.indexOf(code.charAt(i))<0)return false;
  return true;
}
function netNormaliseRoomCode(raw){
  var code=String(raw||'').toUpperCase().replace(/[^0-9A-Z]/g,'');
  return netIsRoomCode(code)?code:null;
}
