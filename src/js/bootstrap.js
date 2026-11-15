/* Prepare the complete game before revealing its finished cover. */
(function(root){
 'use strict';
 const R=root.GameResources,doc=root.document,app=doc.getElementById('app');
 const saveKey='social-battery-pixel-v2';let selected=0;
 function saved(){for(const key of [saveKey,saveKey+'-backup'])try{const value=JSON.parse(root.localStorage.getItem(key)||'null');if(value?.state)return value;}catch{}return null;}
 const original=saved();if(Number.isFinite(original?.state?.avatar))selected=original.state.avatar===1?1:0;
 const boot=root.GameBoot={selectedAvatar:selected,forceLandscape:false,ready:false,sceneForSave(value){
  const s=value?.state||value;if(!s)return ['party'];if(s.done)return ['report'];
  const groups=[s.scene==='dorm'?'dorm':'party'];
  if(s.departureStory){const route=s.route||s.departureStory.route||'early';groups.push(route==='late'?'late':route==='walk'?'walk':'party','story:exitPerformance:'+route);}
  const d=s.dormV3||s.dorm||{},active=d.activeAttempt||d.stations&&Object.values(d.stations).find(x=>x?.status==='active');
  if(active){const action=active.actionId;groups.push(action==='snack'?'sandwich':action==='rest'?'rest':action==='gaming'?'gaming':action==='music'?'music-'+(active.detail?.songId||'night'):active.source==='phone'||active.stationId==='phone'?'phone':'desk');}
  return [...new Set(groups)];
 }};
 function select(n){selected=n===1?1:0;boot.selectedAvatar=selected;doc.querySelectorAll('[data-avatar]').forEach(b=>{const on=+b.dataset.avatar===selected;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));});}
 select(selected);
 const continueBtn=doc.getElementById('continueBtn');continueBtn.hidden=!original;
 if(original)continueBtn.textContent=original.state.done?'查看我的充电说明书':'继续我的这一晚';
 function fit(){
  if(root.GameRuntimeReady)return;
  const vw=root.visualViewport?.width||root.innerWidth,vh=root.visualViewport?.height||root.innerHeight,rotated=boot.forceLandscape&&vh>vw,w=rotated?vh:vw,h=rotated?vw:vh;
  app.classList.toggle('is-rotated',rotated);
  app.style.setProperty('--game-w',w+'px');app.style.setProperty('--game-h',h+'px');app.classList.toggle('compact',h<=540);app.classList.toggle('short-ui',h<=360);app.classList.toggle('narrow',w<750);
  const query=new URLSearchParams(root.location.search),phone=/iPhone|iPod|Android.+Mobile|Windows Phone|HarmonyOS|OpenHarmony/i.test(root.navigator.userAgent||''),coarse=root.matchMedia?.('(pointer:coarse)').matches&&root.matchMedia?.('(hover:none)').matches&&!root.matchMedia?.('(any-pointer:fine)').matches;
  const mobile=query.get('ui')!=='desktop'&&(query.get('ui')==='mobile'||query.get('controls')==='touch'||phone||coarse)&&w>=h&&h<=500&&w<=1100;
  app.classList.toggle('mobile-landscape',mobile);doc.documentElement.classList.toggle('mobile-landscape',mobile);
  doc.getElementById('rotateHint').hidden=!(h>w&&!boot.forceLandscape&&(phone||coarse||query.get('controls')==='touch'));
 }
 fit();root.addEventListener('resize',fit);root.visualViewport?.addEventListener('resize',fit);
 doc.getElementById('landscapeBtn')?.addEventListener('click',e=>{if(root.GameRuntimeReady)return;e.preventDefault();e.stopImmediatePropagation();boot.forceLandscape=true;fit();},true);
 function coverArt(){
  const M=R.manifest;doc.documentElement.style.setProperty('--sprite',`url("${R.resolve(M.coverSprite)}")`);
  const grid=doc.getElementById('roleGrid');if(grid&&!root.GameRuntimeReady)grid.innerHTML=M.coverRoles.map(r=>`<span class="role-face locked" title="${r.name}"><img src="${R.resolve(r.sprite)}" alt="" draggable="false"></span>`).join('');
 }
 doc.getElementById('cover').addEventListener('click',e=>{if(!boot.ready){e.preventDefault();e.stopImmediatePropagation();}},true);
 doc.getElementById('cover').addEventListener('click',e=>{const b=e.target.closest?.('[data-avatar]');if(b)select(+b.dataset.avatar);},true);
 // Automatic preparation is the very first screen. Starting from the finished
 // cover is a normal game action and never opens a second loading screen.
 function finishCover(){
  coverArt();
  doc.documentElement.removeAttribute('data-game-boot');
  root.GameRuntime.prepareCover();
 }
 boot.loading=R.prepare('session',{title:'正在准备你的这一晚',immediate:true,forceDisplay:true,allowCancel:false,progressLabel:'资源准备',onReady:finishCover}).then(ok=>{
  if(!ok)return false;
  boot.ready=true;
  return true;
 });
 root.GameStartupReady?.();
})(window);
