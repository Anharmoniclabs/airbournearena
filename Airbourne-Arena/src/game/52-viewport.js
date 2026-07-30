/* Both cameras, not just the flight one. hangarCam took its aspect once at
   construction, so rotating a phone to landscape rendered a portrait frustum
   into a landscape canvas — the hangar came out horizontally stretched while
   the match looked right. */
function applyViewport(){
  var w=innerWidth,h=innerHeight;
  if(!w||!h)return;
  camera.aspect=w/h; camera.updateProjectionMatrix();
  hangarCam.aspect=w/h; hangarCam.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio,LOW?1.25:2));
  renderer.setSize(w,h);
}
addEventListener('resize',applyViewport);
/* iOS reports the pre-rotation innerWidth/innerHeight for a frame or two after
   orientationchange, and a URL bar sliding away fires no resize at all, so the
   first reading is re-taken rather than trusted. */
addEventListener('orientationchange',function(){
  applyViewport();
  setTimeout(applyViewport,120);
  setTimeout(applyViewport,420);
});
if(window.visualViewport)visualViewport.addEventListener('resize',applyViewport);
applyViewport();
