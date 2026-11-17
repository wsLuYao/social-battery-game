(function(root){
 'use strict';
 const M=root.GAME_RESOURCE_MANIFEST||{resources:{},groups:{}},doc=root.document;
 const records=new Map(),urls=new Map(),listeners=new Set(),gates=new Map();
 const queue=[],active=new Set();let sequence=0,foreground=0,overlay=null,view=null,loadingPlay=null,currentOptional=new Set();
 const empty='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/%3E';
 const abs=value=>{try{return new URL(value,doc?.baseURI||root.location?.href||'http://game.local/').href;}catch{return value;}};
 for(const [id,item] of Object.entries(M.resources)){
  const rec={...item,id,status:'idle',phase:'',received:0,error:null,priority:20,order:0,promise:null,image:null,objectURL:'',controller:null};
  records.set(id,rec);urls.set(item.url,id);urls.set(abs(item.url),id);
 }
 for(const [path,id] of Object.entries(M.aliases||{})){urls.set(path,id);urls.set(abs(path),id);}
 const record=id=>records.get(id)||records.get(urls.get(id))||records.get(urls.get(abs(id)));
 const groupIds=group=>[...new Set((Array.isArray(group)?group:[group]).flatMap(g=>M.groups[g]?.required||[]))];
 const optionalIds=group=>[...new Set((Array.isArray(group)?group:[group]).flatMap(g=>M.groups[g]?.optional||[]))];
 const ready=group=>(Array.isArray(group)?group:[group]).every(g=>!!M.groups[g])&&groupIds(group).every(id=>records.get(id)?.status==='ready');
 function resolve(url){const r=record(url);return r?(r.objectURL||(r.status==='error'?empty:r.url)):url;}
 function image(url){const r=record(url);if(!r){const i=new root.Image();i.src=url;return i;}return r.image||(r.image=new root.Image());}
 const bound=new WeakSet();
 function bindAssets(map){if(!map||typeof map!=='object'||bound.has(map))return;bound.add(map);for(const key of Object.keys(map)){const value=map[key];if(value&&typeof value==='object')bindAssets(value);else if(typeof value==='string'&&record(value))Object.defineProperty(map,key,{enumerable:true,configurable:true,get:()=>resolve(value)});}}
 function source(r){return root.GAME_EMBEDDED_RESOURCES?.[r.id]||r.url;}
 function changed(){for(const fn of listeners)fn();}
 function task(r,priority=0){
  if(!r)return Promise.reject(Error('资源清单不完整'));
  if(r.status==='ready')return Promise.resolve(r);
  if(r.status==='error')return Promise.reject(r.error);
  if(!r.promise){r.promise=new Promise((ok,bad)=>{r.ok=ok;r.bad=bad;});r.promise.catch(()=>{});r.status='queued';r.order=++sequence;queue.push(r);}
  r.priority=Math.min(r.priority,priority);r.parked=false;pump();return r.promise;
 }
 function pump(){
  queue.sort((a,b)=>a.priority-b.priority||a.order-b.order);
  while(active.size<4){const i=queue.findIndex(r=>r.status==='queued'&&!r.parked&&(r.priority===0||[...active].some(a=>a.deps?.includes(r.id))||(!foreground&&active.size<1)));if(i<0)break;const [r]=queue.splice(i,1);active.add(r);r.status='loading';run(r);}
 }
 function timeout(promise,ms,onTimeout){let timer;return Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>{onTimeout?.();reject(Object.assign(Error('连接超时'),{code:'timeout'}));},ms))]).finally(()=>clearTimeout(timer));}
 async function binary(r){
  const input=source(r),signal=r.controller.signal;r.phase='download';
  if(input.startsWith('data:')){const response=await root.fetch(input,{signal});const blob=await response.blob();if(signal.aborted)throw Error('准备已中断');r.received=r.bytes;return blob;}
  const response=await root.fetch(input,{signal,cache:r.attempt>1?'reload':'force-cache',credentials:'same-origin'});
  if(!response.ok)throw Object.assign(Error('资源请求失败'),{code:'http',status:response.status});
  if(!response.body?.getReader){const blob=await response.blob();if(signal.aborted)throw Error('准备已中断');r.received=r.bytes;return blob;}
  const reader=response.body.getReader(),chunks=[];let received=0;
  for(;;){const {value,done}=await reader.read();if(done)break;chunks.push(value);received+=value.byteLength;r.received=received;changed();}
  if(signal.aborted)throw Error('准备已中断');r.received=r.bytes;return new Blob(chunks,{type:r.mime});
 }
 async function pixels(r,blob){
  const signal=r.controller.signal;r.phase='decode';changed();
  const url=URL.createObjectURL(blob),img=new root.Image();r.image=img;img.decoding='async';
  try{await new Promise((ok,bad)=>{img.onload=()=>ok();img.onerror=()=>bad(Object.assign(Error('画面文件损坏或无法打开'),{code:'decode'}));img.src=url;});
   if(img.decode)await img.decode();if(signal.aborted)throw Error('准备已中断');if(!img.naturalWidth)throw Object.assign(Error('画面未能显示'),{code:'decode'});
  }catch(error){URL.revokeObjectURL(url);throw error;}
  r.objectURL=url;urls.set(url,r.id);img.onload=img.onerror=null;
 }
 async function code(r){
  if(r.readyFlag&&root[r.readyFlag])return;
  r.phase=r.type==='style'?'style':'script';changed();
  let input=r.url;
  const embedded=root.GAME_EMBEDDED_CODE?.[r.id];
  if(embedded)input=URL.createObjectURL(new Blob([embedded],{type:r.type==='style'?'text/css':'text/javascript'}));
  else if(r.attempt>1)input+=(input.includes('?')?'&':'?')+'retry='+r.attempt;
  await new Promise((ok,bad)=>{const signal=r.controller.signal,el=doc.createElement(r.type==='style'?'link':'script');r.element=el;
   if(r.type==='style'){el.rel='stylesheet';el.href=input;}else{el.async=false;el.src=input;}
   const clean=()=>{el.onload=el.onerror=null;signal.removeEventListener('abort',abort);};
   const abort=()=>{clean();el.remove();bad(Error('准备已中断'));};
   el.onload=()=>{clean();r.readyFlag&&!root[r.readyFlag]?bad(Error('游戏代码未能初始化，请重试')):ok();};el.onerror=()=>{clean();bad(Error('界面代码未能载入'));};
   signal.addEventListener('abort',abort,{once:true});
   doc.head.appendChild(el);
  });
  r.received=r.bytes;
 }
 async function font(r,blob){
  r.phase='decode';changed();
  if(typeof root.FontFace!=='function'||!doc.fonts)throw Object.assign(Error('浏览器不支持游戏字体，请更新浏览器后重试'),{code:'decode'});
  const face=new root.FontFace(r.fontFamily,await blob.arrayBuffer(),{weight:r.fontWeight||'400',style:'normal',display:'block'});
  await face.load();
  if(r.controller.signal.aborted)throw Error('准备已中断');
  doc.fonts.add(face);r.fontFace=face;
 }
 async function run(r){
  r.attempt=(r.attempt||0)+1;r.controller=new AbortController();r.preempted=false;changed();
  try{
   for(const dep of r.deps||[])await task(records.get(dep),r.priority);
   await timeout((async()=>{
    if(r.type==='script'||r.type==='style')await code(r);
    else{const blob=await binary(r);if(r.type==='image')await pixels(r,blob);else if(r.type==='font')await font(r,blob);else{if(r.controller.signal.aborted)throw Error('准备已中断');r.objectURL=URL.createObjectURL(blob);urls.set(r.objectURL,r.id);}}
   })(),M.timeoutMs||32000,()=>{r.timedOut=true;r.controller.abort();});
   r.status='ready';r.phase='ready';r.error=null;if(r.cssVar&&r.objectURL)doc.documentElement.style.setProperty(r.cssVar,'url("'+r.objectURL+'")');r.ok?.(r);
  }catch(error){
   if(r.preempted){r.status='queued';r.received=0;r.order=++sequence;queue.push(r);}
   else{r.status='error';r.phase='error';r.error=Object.assign(error,{resource:r.label||'场景素材',code:r.timedOut?'timeout':error.code||'network'});r.element?.remove();r.bad?.(r.error);}
  }finally{r.controller=null;r.timedOut=false;active.delete(r);changed();pump();}
 }
 function preempt(){for(const r of active)if(r.priority>0&&r.phase==='download'&&!source(r).startsWith('data:')){r.preempted=true;r.controller?.abort();}}
 function stats(group){
  const list=groupIds(group).map(id=>records.get(id)).filter(Boolean);let total=0,done=0;
  for(const r of list){const weight=r.weight||r.bytes||1;total+=weight;if(r.status==='ready')done+=weight;else if(r.phase==='download'||r.phase==='decode')done+=Math.min(r.bytes||1,r.received||0);}
  const complete=(Array.isArray(group)?group:[group]).every(g=>!!M.groups[g])&&list.every(r=>r.status==='ready');
  return {total,done,percent:complete?100:Math.min(99,Math.floor(100*done/Math.max(1,total))),complete,failed:list.filter(r=>r.status==='error'),current:list.find(r=>r.status==='loading'),count:list.filter(r=>r.status==='ready').length};
 }
 function retry(group){for(const id of groupIds(group)){const r=records.get(id);if(r?.status==='error'){if(r.readyFlag&&root[r.readyFlag]){r.status='ready';r.phase='ready';r.error=null;continue;}r.status='idle';r.phase='';r.received=0;r.error=null;r.promise=null;r.priority=20;}}}
 async function ensure(group,{priority=0}={}){
  const groups=Array.isArray(group)?group:[group];for(const g of groups)if(!M.groups[g])throw Error('找不到场景资源：'+g);
  if(priority===0){foreground++;for(const id of groupIds(group)){const r=records.get(id);if(r)r.priority=0;}preempt();}
  try{const result=await Promise.all(groupIds(group).map(id=>task(records.get(id),priority)));hydrate();return result;}
  finally{if(priority===0)foreground--;pump();}
 }
 function preload(group){return ensure(group,{priority:10}).catch(()=>false);}
 function next(group){
  // Unstarted unrelated branches yield to the chosen route. Existing successes stay cached.
  const wanted=new Set([...groupIds(group),...groupIds('core'),...currentOptional]);
  for(const r of active)if(r.priority>0){r.priority=wanted.has(r.id)?5:20;r.parked=!wanted.has(r.id);if(r.parked&&r.phase==='download'&&!source(r).startsWith('data:')){r.preempted=true;r.controller?.abort();}}
  for(const r of queue)if(r.priority>0){r.priority=wanted.has(r.id)?5:20;r.parked=!wanted.has(r.id);}
  for(const id of groupIds(group)){const r=records.get(id);if(r?.status!=='error')task(r,5).catch(()=>{});}pump();
 }
 function optional(group){currentOptional=new Set(optionalIds(group));for(const id of currentOptional){const r=records.get(id);if(r?.status!=='error')task(r,5).catch(()=>{});}}
 function load(url,{priority=10}={}){const r=record(url);return r?task(r,priority).then(()=>resolve(url)):Promise.resolve(url);}
 function makeOverlay(){
  if(overlay)return overlay;
  overlay=doc.getElementById('game-initial-loading')||doc.createElement('section');overlay.className='scene-loader';overlay.hidden=true;overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','场景资源准备');
  overlay.innerHTML='<div class="scene-load-pattern" aria-hidden="true"><div class="scene-load-row"></div><div class="scene-load-row"></div></div><div class="scene-load-card"><div class="scene-load-progress"><h2 data-load-title></h2><div class="scene-load-battery" aria-hidden="true">'+Array.from({length:10},()=>'<span class="scene-load-cell"><i></i></span>').join('')+'</div><p class="scene-load-percent" role="progressbar" aria-label="资源准备进度" aria-valuemin="0" aria-valuemax="100" data-load-percent></p><p class="scene-load-status" role="status" aria-live="polite" data-load-status></p><p class="scene-load-duration" data-load-duration>加载可能需要约 1 分钟，请耐心等待。</p><div class="scene-load-actions" hidden><button type="button" data-load-retry>重试</button><button type="button" class="scene-load-back" data-load-back>返回封面</button></div></div><div class="load-play"></div></div>';
  overlay.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Tab'){const buttons=[...overlay.querySelectorAll('button,[tabindex="0"]')].filter(b=>!b.closest('[hidden]')&&!b.disabled);if(!buttons.length){e.preventDefault();return;}if(e.shiftKey&&doc.activeElement===buttons[0]){e.preventDefault();buttons.at(-1).focus({preventScroll:true});}else if(!e.shiftKey&&doc.activeElement===buttons.at(-1)){e.preventDefault();buttons[0].focus({preventScroll:true});}}});
  doc.getElementById('app').appendChild(overlay);loadingPlay=root.GameLoadingPlay?.create(overlay.querySelector('.load-play'));return overlay;
 }
 function loadingEvent(active){doc.getElementById('app').classList.toggle('is-resource-loading',active);root.dispatchEvent?.(new CustomEvent('game:loading',{detail:{active}}));}
 function paint(v){
  const s=stats(v.groups),el=makeOverlay(),percent=el.querySelector('[data-load-percent]');
  el.querySelector('[data-load-title]').textContent=v.title;
  percent.textContent=(v.progressLabel||'场景准备')+' '+s.percent+'%';percent.setAttribute('aria-valuenow',s.percent);
  el.querySelectorAll('.scene-load-cell').forEach((cell,i)=>{const fill=Math.max(0,Math.min(1,(s.percent-i*10)/10));cell.firstElementChild.style.width=(fill*100)+'%';cell.classList.toggle('is-current',!s.complete&&s.percent>=i*10&&s.percent<(i+1)*10);});
  if(v.previous!==s.done){v.previous=s.done;v.lastProgress=Date.now();}
  const failed=s.failed[0]||(v.error?{error:v.error}:null);
  el.classList.toggle('has-load-error',!!failed);
  let text=s.complete?'画面已准备好':s.current?(s.current.phase==='decode'?'正在展开':'正在准备')+'「'+s.current.label+'」':'正在等待准备';
  if(Date.now()-v.lastProgress>8000&&!failed)text='仍在准备'+(s.current?'「'+s.current.label+'」':'场景')+'，网络较慢时可能需要稍等。';
  if(failed){const err=failed.error;text=(root.navigator?.onLine===false?'网络已断开，请恢复连接后重试。':err?.code==='timeout'?'连接超时，请重试。':err?.code==='decode'?'画面文件未能打开，请重试。':'素材未能载入，请重试。')+' 已准备好的部分会保留。';}
  el.querySelector('[data-load-status]').textContent=text;
  let duration=el.querySelector('[data-load-duration]');
  if(!duration){duration=doc.createElement('p');duration.className='scene-load-duration';duration.setAttribute('data-load-duration','');el.querySelector('.scene-load-actions').before(duration);}
  duration.textContent='加载可能需要约 1 分钟，请耐心等待。';
  el.querySelector('.scene-load-actions').hidden=!failed;
  return s;
 }
 async function prepare(groups,options={}){
  if(ready(groups)&&!options.forceDisplay)return true;
  if(view){const pending=view,same=groupIds(groups).every(id=>groupIds(pending.groups).includes(id));const ok=await pending.promise;if(!ok)return false;return same&&ready(groups)?true:prepare(groups,options);}
  const owner={groups,title:options.title||M.groups[Array.isArray(groups)?groups.at(-1):groups]?.title||'正在准备下一段旅程',progressLabel:options.progressLabel,lastProgress:Date.now(),previous:-1,shown:0};
  view=owner;owner.promise=new Promise(resolve=>owner.finish=resolve);loadingEvent(true);
  const revealNow=()=>{if(view===owner){makeOverlay().hidden=false;loadingPlay?.start();owner.shown=Date.now();paint(owner);}};
  let reveal=options.immediate?null:setTimeout(revealNow,140);
  if(options.immediate)revealNow();
  const refresh=()=>{if(view===owner){const s=paint(owner);if(s.failed.length&&!owner.shown){clearTimeout(reveal);makeOverlay().hidden=false;loadingPlay?.start();owner.shown=Date.now();}}};listeners.add(refresh);const heartbeat=setInterval(refresh,1000);
  function end(ok){if(view!==owner)return;clearTimeout(reveal);clearInterval(heartbeat);listeners.delete(refresh);loadingPlay?.stop();if(overlay)overlay.hidden=true;view=null;loadingEvent(false);owner.finish(ok);if(!ok)root.GameRuntime?.returnToCover?.();}
  async function attempt(){try{await ensure(groups);if(view!==owner)return;await options.onReady?.();if(view!==owner)return;paint(owner);const remain=owner.shown?Math.max(0,180-(Date.now()-owner.shown)):0;if(remain)await new Promise(r=>setTimeout(r,remain));end(true);}catch(error){if(view!==owner)return;owner.error=error;refresh();if(!owner.shown){clearTimeout(reveal);makeOverlay().hidden=false;owner.shown=Date.now();}makeOverlay().querySelector('[data-load-retry]')?.focus({preventScroll:true});}}
  const el=makeOverlay();el.querySelector('[data-load-retry]').onclick=()=>{retry(groups);owner.error=null;el.querySelector('.scene-load-actions').hidden=true;owner.lastProgress=Date.now();attempt();};el.querySelector('[data-load-back]').hidden=options.allowCancel===false;el.querySelector('[data-load-back]').onclick=()=>{if(options.allowCancel!==false)end(false);};
  attempt();return owner.promise;
 }
 function gate(groups,run,options={}){const key=options.key||String(groups);if(gates.has(key))return gates.get(key);const p=(async()=>{if(await prepare(groups,options))return run();return false;})();gates.set(key,p);p.finally(()=>gates.delete(key)).catch(()=>{});return p;}
 function hydrate(scope=doc){for(const el of scope.querySelectorAll('[data-game-src]')){const raw=el.dataset.gameSrc,r=record(raw);if(r?.status==='ready'){el.src=resolve(raw);el.removeAttribute('data-game-src');}}}
 root.GameResources={manifest:M,ready,resolve,image,bindAssets,ensure,preload,next,optional,prepare,gate,retry,stats,hydrate,load,record,records};
 if(doc){for(const name of ['click','pointerdown','keydown'])doc.addEventListener(name,e=>{if(view&&!overlay?.contains(e.target)){e.preventDefault();e.stopImmediatePropagation();}},true);}
})(window);
