/* ===================== buttons =====================
   One binder for every button in the game, because the two devices used to be
   wired differently and each menu got whichever half its author remembered.

   `click` is the activation, and deliberately so. It is the one event every
   input path produces — mouse, touch, pen, Enter, Space, and the synthetic
   clicks assistive technology sends — and the browser has already decided by
   then that the press started and ended on this element, which is the "slid my
   thumb off to cancel" rule for free.

   The pointer handlers exist only to paint a press state and to stop the
   gesture reaching what is underneath (the briefing's tap-to-launch backdrop,
   the canvas). They must NOT preventDefault: that suppresses the compatibility
   mouse events the browser generates from a tap, and the click never arrives —
   which is exactly how every one of these buttons came to be dead on a real
   device while passing a synthetic-event test. `touch-action:manipulation` on
   the overlays is what removes the old 300ms tap delay, not a hand-rolled
   pointerup path. */
function bindBtn(target,fn){
  var b=(typeof target==='string')?document.getElementById(target):target;
  if(!b)return null;
  var off=function(){b.classList.remove('press');};
  b.addEventListener('pointerdown',function(e){
    if(b.disabled)return;
    e.stopPropagation();
    b.classList.add('press');
    if(typeof IS_TOUCH!=='undefined'&&IS_TOUCH&&navigator.vibrate)navigator.vibrate(8);
  });
  b.addEventListener('pointerup',function(e){e.stopPropagation();off();});
  b.addEventListener('pointercancel',off);
  b.addEventListener('pointerleave',off);
  b.addEventListener('click',function(e){
    e.preventDefault(); e.stopPropagation();
    if(b.disabled)return;
    fn(e);
  });
  if(!b.hasAttribute('tabindex')&&b.tagName!=='BUTTON')b.setAttribute('tabindex','0');
  if(!b.hasAttribute('role')&&b.tagName!=='BUTTON')b.setAttribute('role','button');
  /* a div with role=button gets no free keyboard activation */
  if(b.tagName!=='BUTTON')b.addEventListener('keydown',function(e){
    if(b.disabled)return;
    if(e.key==='Enter'||e.key===' '||e.code==='Space'){e.preventDefault();b.click();}
  });
  return b;
}

