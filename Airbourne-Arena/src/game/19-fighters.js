/* ===================== fighters ===================== */
/* Slot 0 of whichever side you sign with gets overwritten by your callsign, so
   both rosters carry a real name and neither has a hole in it. */
var NAMES={blue:['CAONABO','ARAWAK','GUABIN','MABI'],red:['YAGUANA','CIBAO','HIGUEY','MAGUA']};
/* the two lead names as built, so switching sides can hand the old one back
   instead of leaving your callsign stamped on a pilot you no longer are */
var LEAD0={blue:NAMES.blue[0],red:NAMES.red[0]};
function claimLeadName(){
  NAMES.blue[0]=LEAD0.blue; NAMES.red[0]=LEAD0.red;
  NAMES[PILOT.team][0]=PILOT.callsign;
}
var fighters=[],player=null;

