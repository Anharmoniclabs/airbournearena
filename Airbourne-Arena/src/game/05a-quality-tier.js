/* ===================== quality tier =====================
   Which of three render budgets this machine gets.

   This used to be one line — `LOW = IS_TOUCH` — which asked the wrong question.
   A touchscreen laptop got phone settings and a decade-old desktop got the full
   scene, because a pointer type says what you touch the screen with and nothing
   about what the GPU can do.

   The tier is decided here, before anything reads it, because the star count,
   terrain segment count and texture anisotropy are all fixed at load time from
   LOW. What the tier actually turns on — shadows, bloom — is wired up in
   08a-render-quality.js, once the renderer and the sun exist to configure. That
   split is a load-order fact, not a design preference.

   The guess is only a starting point; 08a measures real frame times and steps
   down once if this machine cannot hold the pace. */
var GFX_TIERS=[
  {name:'LOW',   shadow:0,    shadowFar:0,    bloom:false, bloomStrength:0,   pixelCap:1.25},
  {name:'MEDIUM',shadow:1024, shadowFar:1500, bloom:true,  bloomStrength:0.18,pixelCap:1.5},
  {name:'HIGH',  shadow:2048, shadowFar:2600, bloom:true,  bloomStrength:0.24,pixelCap:2}
];
/* A touch device is still the best cheap signal for "probably a phone", so it
   picks the opening bid. Anything else starts at the top and is measured down. */
var gfxTier=IS_TOUCH?0:2;
if(cfg.gfx>=0&&cfg.gfx<GFX_TIERS.length)gfxTier=cfg.gfx;
var GFX=GFX_TIERS[gfxTier];
/* LOW keeps its name because a dozen call sites already ask for it, but it now
   means "the bottom tier" rather than "has a touchscreen". */
LOW=gfxTier===0;
