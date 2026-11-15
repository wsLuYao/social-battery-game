(function(root){
 'use strict';
 const doc=root.document,app=doc.getElementById('app');if(!app)return;
 const editable=el=>!!el?.closest?.('input,textarea,[contenteditable]:not([contenteditable="false"]),[data-native-select]');
 const exportMedia=el=>!!el?.closest?.('[data-native-media]');
 const surfaces='[data-gesture-surface],.sw4-board,.sw4-rack,.sw4-order,.cat-v4,.phone-v4-feed,.gaming-board,#world,#joystick';
 const gesture=el=>!!el?.closest?.(surfaces)||!!el?.closest?.('#report-scene')&&!scrollOwner(el);
 const automaticScroll=new WeakSet();
 const prevent=e=>{if(e.cancelable)e.preventDefault();};
 // Delegation covers future dialogue, newly opened modals and changing artwork.
 for(const type of ['selectstart','copy','cut'])doc.addEventListener(type,e=>{if(!editable(e.target))prevent(e);});
 doc.addEventListener('contextmenu',e=>{if(!editable(e.target)&&!exportMedia(e.target))prevent(e);});
 doc.addEventListener('dragstart',e=>{if(!editable(e.target))prevent(e);});
 function classify(el){
  if(el.nodeType!==1)return;
  if(el.matches('img')&&el.draggable)el.draggable=false;
  if(el.matches('[data-native-media]'))return;
  // Only actual scroll containers are marked. Canvas/pointer games keep their logic.
  if(!el.matches('input,textarea,canvas,img,svg')&&!el.matches(surfaces+',#app,#report-scene')){
   // Remove our previous override before measuring responsive styles again.
   if(automaticScroll.has(el)){el.removeAttribute('data-scroll-y');automaticScroll.delete(el);}
   const s=root.getComputedStyle(el);
   if(/^(auto|scroll)$/.test(s.overflowY)&&!el.hasAttribute('data-scroll-y')){el.setAttribute('data-scroll-y','');automaticScroll.add(el);}
  }
 }
 function scan(node){classify(node);node.querySelectorAll?.('*').forEach(classify);}
 let pending=new Set(),frame=0;
 function queue(node){if(node?.nodeType===1)pending.add(node);if(!frame)frame=root.requestAnimationFrame(()=>{frame=0;const all=[...pending],nodes=all.filter(node=>!all.some(parent=>parent!==node&&parent.contains(node)));pending.clear();nodes.forEach(scan);});}
 new MutationObserver(records=>{for(const r of records){r.addedNodes.forEach(queue);if(r.type==='attributes')queue(r.target);}}).observe(doc.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden','style']});
 scan(doc.body);root.addEventListener('resize',()=>queue(doc.body));
 let start=null;
 function scrollOwner(target){for(let e=target;e&&e!==app;e=e.parentElement){if(e.hasAttribute?.('data-scroll-y')&&e.scrollHeight>e.clientHeight+1)return e;}return null;}
 doc.addEventListener('touchstart',e=>{const t=e.touches[0];start=t?{x:t.clientX,y:t.clientY,owner:scrollOwner(e.target),native:editable(e.target),custom:gesture(e.target),rotated:!!e.target.closest?.('#app.is-rotated')}:null;},{passive:true});
 doc.addEventListener('touchmove',e=>{
  if(!start)return;
  if(e.touches.length>1){prevent(e);return;}
  if(start.native||start.custom)return; // Pointer games are governed by touch-action:none.
  const t=e.touches[0];if(!t)return;
  const physicalX=t.clientX-start.x,physicalY=t.clientY-start.y,dx=start.rotated?physicalY:physicalX,dy=start.rotated?-physicalX:physicalY,o=start.owner;
  if(!o){prevent(e);return;}
  if(Math.abs(dx)>Math.abs(dy)+3){prevent(e);return;}
  if((dy>0&&o.scrollTop<=0)||(dy<0&&o.scrollTop+o.clientHeight>=o.scrollHeight-1))prevent(e);
 },{passive:false});
 doc.addEventListener('touchend',()=>start=null,{passive:true});
 doc.addEventListener('touchcancel',()=>start=null,{passive:true});
 doc.addEventListener('gesturestart',e=>prevent(e),{passive:false});
 doc.addEventListener('wheel',e=>{if(e.ctrlKey){prevent(e);return;}const o=scrollOwner(e.target);if(!o||Math.abs(e.deltaX)>Math.abs(e.deltaY)){prevent(e);return;}if((e.deltaY<0&&o.scrollTop<=0)||(e.deltaY>0&&o.scrollTop+o.clientHeight>=o.scrollHeight-1))prevent(e);},{passive:false});
 doc.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&['c','x'].includes(e.key.toLowerCase())&&app.contains(doc.activeElement)&&!editable(doc.activeElement))prevent(e);});
 root.GameInteractionGuard={scan,editable,scrollOwner};
})(window);
