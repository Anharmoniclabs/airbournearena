/* ===================== audio =====================
   Everything is synthesised at runtime — no audio files ship with the game.
   The context can only be created from a user gesture, so audioInit() is
   called from launch() rather than at load. */
var AUDIO={ctx:null,master:null,ready:false,eng:null,noise:null,gunT:0};
function audioInit(){
  if(AUDIO.ctx)return;
  var AC=window.AudioContext||window.webkitAudioContext;
  if(!AC)return;
  var ctx;
  try{ctx=new AC();}catch(err){return;}
  AUDIO.ctx=ctx;

  var master=ctx.createGain(); master.gain.value=cfg.vol/100;
  master.connect(ctx.destination); AUDIO.master=master;

  var n=ctx.sampleRate*2,buf=ctx.createBuffer(1,n,ctx.sampleRate),d=buf.getChannelData(0);
  for(var i=0;i<n;i++)d[i]=Math.random()*2-1;
  AUDIO.noise=buf;

  /* engine: two saws detuned just enough to beat against each other, behind a
     throttle-driven lowpass, plus a noise bed standing in for airflow */
  var eg=ctx.createGain(); eg.gain.value=0; eg.connect(master);
  var lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=900; lp.connect(eg);
  var og=ctx.createGain(); og.gain.value=.5; og.connect(lp);
  var o1=ctx.createOscillator(); o1.type='sawtooth'; o1.frequency.value=70; o1.connect(og);
  var o2=ctx.createOscillator(); o2.type='sawtooth'; o2.frequency.value=70.5; o2.connect(og);
  o1.start(); o2.start();

  var ns=ctx.createBufferSource(); ns.buffer=buf; ns.loop=true;
  var nf=ctx.createBiquadFilter(); nf.type='bandpass'; nf.frequency.value=700; nf.Q.value=.7;
  var ng=ctx.createGain(); ng.gain.value=0;
  ns.connect(nf); nf.connect(ng); ng.connect(master); ns.start();

  AUDIO.eng={g:eg,o1:o1,o2:o2,lp:lp,ng:ng,nf:nf};
  AUDIO.ready=true;
}
function audioResume(){
  if(AUDIO.ctx&&AUDIO.ctx.state==='suspended')AUDIO.ctx.resume().catch(function(){});
}
/* Distance falloff for anything that happens away from the camera. */
function earGain(pos){
  if(!AUDIO.ready)return 0;
  return clamp(1-camera.position.distanceTo(pos)/1600,0,1);
}
function tone(freq,dur,vol,type,glideTo){
  if(!AUDIO.ready||vol<=0.001)return;
  var ctx=AUDIO.ctx,t=ctx.currentTime;
  var o=ctx.createOscillator(); o.type=type||'square';
  o.frequency.setValueAtTime(freq,t);
  if(glideTo)o.frequency.exponentialRampToValueAtTime(glideTo,t+dur);
  var g=ctx.createGain();
  g.gain.setValueAtTime(.0001,t);
  g.gain.exponentialRampToValueAtTime(vol,t+.008);
  g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  o.connect(g); g.connect(AUDIO.master); o.start(t); o.stop(t+dur+.03);
}
function gunSfx(vol){
  if(!AUDIO.ready||vol<=.02)return;
  var ctx=AUDIO.ctx,t=ctx.currentTime;
  /* a burst is many rounds a second; without this the graph thrashes */
  if(t-AUDIO.gunT<0.028)return;
  AUDIO.gunT=t;
  var s=ctx.createBufferSource(); s.buffer=AUDIO.noise;
  s.playbackRate.value=1.5+Math.random()*.3;
  var f=ctx.createBiquadFilter(); f.type='bandpass'; f.frequency.value=1500; f.Q.value=1.2;
  var g=ctx.createGain();
  g.gain.setValueAtTime(vol*.20,t); g.gain.exponentialRampToValueAtTime(.0001,t+.09);
  s.connect(f); f.connect(g); g.connect(AUDIO.master);
  s.start(t); s.stop(t+.1);
}
function bangSfx(vol){
  if(!AUDIO.ready||vol<=.02)return;
  var ctx=AUDIO.ctx,t=ctx.currentTime;
  var s=ctx.createBufferSource(); s.buffer=AUDIO.noise; s.playbackRate.value=.65;
  var f=ctx.createBiquadFilter(); f.type='lowpass';
  f.frequency.setValueAtTime(1900,t); f.frequency.exponentialRampToValueAtTime(90,t+.7);
  var g=ctx.createGain();
  g.gain.setValueAtTime(vol*.45,t); g.gain.exponentialRampToValueAtTime(.0001,t+.8);
  s.connect(f); f.connect(g); g.connect(AUDIO.master); s.start(t); s.stop(t+.85);
  var o=ctx.createOscillator(); o.type='sine';
  o.frequency.setValueAtTime(115,t); o.frequency.exponentialRampToValueAtTime(30,t+.5);
  var og=ctx.createGain();
  og.gain.setValueAtTime(vol*.5,t); og.gain.exponentialRampToValueAtTime(.0001,t+.55);
  o.connect(og); og.connect(AUDIO.master); o.start(t); o.stop(t+.6);
}
function stingSfx(notes,vol){
  if(!AUDIO.ready)return;
  for(var i=0;i<notes.length;i++)(function(f,i2){
    setTimeout(function(){tone(f,.30,vol,'triangle');},i2*78);
  })(notes[i],i);
}
/* Engine note tracks throttle and airspeed; a stalled wing swaps the airflow
   band for a low buffet you can hear before you can see it. */
function audioEngine(){
  if(!AUDIO.ready)return;
  var e=AUDIO.eng,ctx=AUDIO.ctx,t=ctx.currentTime;
  var live=cfg.engine&&st.started&&!st.paused&&player.alive&&!st.over;
  var thr=player.throttle,sp=player.speed;
  e.o1.frequency.setTargetAtTime(58+thr*78+Math.min(sp,340)*.11,t,.08);
  e.o2.frequency.setTargetAtTime((58+thr*78+Math.min(sp,340)*.11)*1.007,t,.08);
  e.lp.frequency.setTargetAtTime(480+thr*1600,t,.10);
  e.g.gain.setTargetAtTime(live?.045+thr*.095:0,t,.15);
  e.ng.gain.setTargetAtTime(live?Math.min(.10,sp/340*.08)+(player.stalled?.055:0):0,t,.12);
  e.nf.frequency.setTargetAtTime(player.stalled?185:520+sp*1.5,t,.12);
}


