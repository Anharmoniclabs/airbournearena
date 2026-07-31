/* ===================== shadows and bloom =====================
   The tier was chosen in 05a-quality-tier.js. This is where it becomes pixels,
   and it runs after 08-assets.js because it needs both the renderer and the sun.

   Two things were missing before this file existed.

   Shadows: the scene set castShadow on aircraft, story props and authored world
   pieces, and 16-authored-world.js reasoned carefully about which batches were
   too large to cast — but nothing ever set renderer.shadowMap.enabled or
   sunLight.castShadow, and both default to off. Every one of those flags was a
   no-op and the game rendered with no shadows at all, which is the main reason
   aircraft read as pasted onto the terrain rather than flying over it.

   Bloom: the entire visual language is emissive — burners, tracers, the Core,
   the goal rings, city windows at night — and all of it was drawn flat. */

/* ---------- shadows ----------
   A directional light over an arena kilometres across cannot shadow the whole
   thing: spread that far, the map is a few texels per aircraft and resolves
   nothing. The frustum is kept deliberately small and flown along with whoever
   the camera is following, because the shadows worth having are the near ones. */
var SHADOW_HALF=520;
function applyShadowQuality(){
  renderer.shadowMap.enabled=GFX.shadow>0;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  sunLight.castShadow=GFX.shadow>0;
  /* Telling the light as well as the renderer matters: left casting with the
     map disabled, three still allocates and renders a depth pass nothing
     samples, which is the whole cost and none of the benefit. */
  if(!sunLight.castShadow){
    if(sunLight.shadow.map){sunLight.shadow.map.dispose();sunLight.shadow.map=null;}
    return;
  }
  var s=sunLight.shadow;
  s.mapSize.width=s.mapSize.height=GFX.shadow;
  s.camera.left=-SHADOW_HALF; s.camera.right=SHADOW_HALF;
  s.camera.top=SHADOW_HALF;   s.camera.bottom=-SHADOW_HALF;
  s.camera.near=1; s.camera.far=GFX.shadowFar;
  /* Aircraft are thin, so acne shows on their own wings long before it shows on
     the ground. normalBias handles that at this frustum size without the
     peter-panning a large constant bias would cost. */
  s.bias=-0.0006;
  s.normalBias=0.9;
  s.camera.updateProjectionMatrix();
  if(s.map){s.map.dispose();s.map=null;}
}

/* Called each frame from env(), replacing the fixed sun placement that used to
   live there. The light sits up-sun of the camera subject and aims at it. */
var _shadowAt=new THREE.Vector3();
function frameShadowCamera(anchor){
  if(!sunLight.castShadow)return;
  /* Quantise the centre to whole shadow texels. Without this the depth map
     resamples on a slightly different grid every frame and every shadow edge
     crawls — the shimmer that makes a moving directional shadow look cheap. */
  var texel=(SHADOW_HALF*2)/GFX.shadow;
  _shadowAt.copy(anchor);
  _shadowAt.x=Math.round(_shadowAt.x/texel)*texel;
  _shadowAt.y=Math.round(_shadowAt.y/texel)*texel;
  _shadowAt.z=Math.round(_shadowAt.z/texel)*texel;
  sunLight.position.copy(_shadowAt).addScaledVector(sunDir,GFX.shadowFar*0.45);
  sunLight.target.position.copy(_shadowAt);
  sunLight.target.updateMatrixWorld();
}

/* ---------- bloom ----------
   One composer serves both scenes. The hangar draws a different scene and
   camera through the same renderer, so the render pass is retargeted per frame
   rather than a second composer being built and kept in step. */
var composer=null,bloomPass=null,bloomRenderPass=null;
function buildComposer(){
  composer=null; bloomPass=null; bloomRenderPass=null;
  /* postprocessing-r128.js is a separate script tag. If it failed to load the
     game must still run — bloom is the first thing to lose, not the frame. */
  if(!GFX.bloom||typeof THREE.EffectComposer!=='function')return;
  composer=new THREE.EffectComposer(renderer);
  bloomRenderPass=new THREE.RenderPass(scene,camera);
  composer.addPass(bloomRenderPass);
  /* Keep sunlit white aircraft below the effect. The first live Pages render
     used 0.72 / 0.82 here and turned the player's beacon plus wing highlights
     into a large white halo, erasing the silhouette in level and banked views.
     Burners, tracers, the Core and night windows still clear this tighter
     threshold; the smaller radius keeps their glow attached to its source. */
  bloomPass=new THREE.UnrealBloomPass(
    new THREE.Vector2(innerWidth,innerHeight),GFX.bloomStrength,0.42,0.92);
  composer.addPass(bloomPass);
  composer.setSize(innerWidth,innerHeight);
  composer.setPixelRatio(renderer.getPixelRatio());
}

/* Every render in the game goes through here. With bloom off it is a plain
   renderer.render and costs nothing extra. */
function renderFrame(useScene,useCamera){
  if(composer&&bloomRenderPass){
    bloomRenderPass.scene=useScene;
    bloomRenderPass.camera=useCamera;
    composer.render();
  } else renderer.render(useScene,useCamera);
}

function resizeRenderTargets(w,h){
  if(!composer)return;
  composer.setSize(w,h);
  composer.setPixelRatio(renderer.getPixelRatio());
}

/* ---------- measure, then settle ----------
   The pointer-type guess in 05a is a bid, not an answer. This watches real
   frame times early in a sortie and eases down once if the machine is visibly
   not keeping up. It never climbs back: oscillating between tiers looks worse
   than sitting one below the ceiling, and a player who disagrees has the
   setting in the menu. */
var gfxWatch={t:0,frames:0,slow:0,settled:false};
function watchFrameRate(dt){
  if(gfxWatch.settled||cfg.gfx>=0)return;
  /* The first seconds are textures still decoding and shaders still compiling;
     nothing measured there says anything about the steady state. */
  gfxWatch.t+=dt;
  if(gfxWatch.t<3)return;
  gfxWatch.frames++;
  if(dt>1/45)gfxWatch.slow++;
  if(gfxWatch.frames<240)return;
  gfxWatch.settled=true;
  if(gfxWatch.slow>gfxWatch.frames*0.34&&gfxTier>0)setGfxTier(gfxTier-1,true);
}

function setGfxTier(tier,automatic){
  gfxTier=clamp(tier|0,0,GFX_TIERS.length-1);
  GFX=GFX_TIERS[gfxTier];
  LOW=gfxTier===0;
  renderer.setPixelRatio(Math.min(devicePixelRatio,GFX.pixelCap));
  applyShadowQuality();
  if(composer&&composer.dispose)composer.dispose();
  buildComposer();
  resizeRenderTargets(innerWidth,innerHeight);
  if(automatic){
    gfxWatch.settled=true;
    feed('<span style="color:#ffb347">graphics eased to '+GFX.name+'</span>');
  }
}

applyShadowQuality();
buildComposer();
