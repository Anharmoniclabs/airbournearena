/* ===================== scene ===================== */
var scene=new THREE.Scene();
var camera=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,0.6,26000);
var renderer;
try{
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
}catch(webglError){
  document.getElementById('brief').innerHTML='<div class="card"><h1>ARENA CORE</h1>'+
    '<div class="sub">3D ACCELERATION REQUIRED</div><p>This browser could not open a WebGL flight deck. '+
    'Turn on hardware acceleration or open the game in a current Chrome, Edge, Firefox, or Safari browser.</p></div>';
  /* Nothing below runs, so nothing below will ever take the boot cover down.
     Leaving it up would hide the one message that explains what went wrong. */
  document.body.classList.remove('hangar');
  document.getElementById('boot').classList.add('gone');
  return;
}
renderer.setPixelRatio(Math.min(devicePixelRatio,LOW?1.25:2));
renderer.setSize(innerWidth,innerHeight);
/* Filmic output keeps sunlit concrete from clipping to flat white while
   retaining the teal/orange cockpit language in dusk and storm conditions. */
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=LOW?.98:1.04;
document.getElementById('app').appendChild(renderer.domElement);
scene.fog=new THREE.FogExp2(0x9ec7e8,0.00022);

