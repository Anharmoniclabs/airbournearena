/* ===================== helpers ===================== */
function clamp(v,a,b){return v<a?a:v>b?b:v;}
function smooth(a,b,x){var t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);}
function rnd(a,b){return a+Math.random()*(b-a);}
function hash(x,y){var n=Math.sin(x*127.1+y*311.7)*43758.5453123;return n-Math.floor(n);}
function vnoise(x,y){
  var xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi;
  var u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
  var a=hash(xi,yi),b=hash(xi+1,yi),c=hash(xi,yi+1),d=hash(xi+1,yi+1);
  return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;
}
function fbm(x,y,o){var s=0,a=.5,f=1;o=o||5;for(var i=0;i<o;i++){s+=a*vnoise(x*f,y*f);f*=2.03;a*=.5;}return s;}

