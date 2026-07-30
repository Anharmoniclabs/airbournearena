/* ===================== device profile ===================== */
var coarse=window.matchMedia&&matchMedia('(pointer:coarse)').matches;
var fine=window.matchMedia&&matchMedia('(any-pointer:fine)').matches;
var IS_TOUCH=(coarse&&!fine)||(('ontouchstart' in window)&&!fine);
function setTouchMode(on){
  IS_TOUCH=on;
  document.body.classList.toggle('touch',on);
  var gl=document.getElementById('goLine'),mb=document.getElementById('modeBtn');
  /* the card is a menu, so the backdrop — not the panel — is the tap target */
  if(gl)gl.textContent=on?'TAP OUTSIDE THIS PANEL TO LAUNCH'
                         :'CLICK OUTSIDE THIS PANEL TO CAPTURE THE MOUSE AND LAUNCH';
  if(mb)mb.textContent=on?'SWITCH TO MOUSE + KEYBOARD':'SWITCH TO TOUCH CONTROLS';
}
setTouchMode(IS_TOUCH);
var LOW=IS_TOUCH;   /* trim the scene for phone GPUs */

