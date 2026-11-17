(function(root){
 'use strict';
 const M=root.GAME_RESOURCE_MANIFEST||{resources:{},groups:{}},doc=root.document;
 const records=new Map(),urls=new Map(),decodedImages=new WeakMap(),listeners=new Set(),gates=new Map();
 const queue=[],active=new Set();let sequence=0,foreground=0,overlay=null,view=null,loadingPlay=null,currentOptional=new Set();
 const bundles=new Map(Object.entries(M.bundles||{}).map(([id,item])=>[
  id,{...item,status:'idle',members:[],received:0,attempt:0,error:null,blob:null}
 ]));
 const activeBundles=new Set();
 const atlases=new Map(Object.entries(M.atlases||{}).map(([id,item])=>[id,{...item,image:null,promise:null}]));
 let lastBundleUpdate=0;
 const empty='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/%3E';
 const abs=value=>{try{return new URL(value,doc?.baseURI||root.location?.href||'http://game.local/').href;}catch{return value;}};
 for(const [id,item] of Object.entries(M.resources)){
  const rec={...item,id,status:'idle',phase:'',received:0,error:null,priority:20,order:0,promise:null,image:null,objectURL:'',controller:null};
  records.set(id,rec);urls.set(item.url,id);urls.set(abs(item.url),id);
  bundles.get(item.bundle)?.members.push(rec);
 }
 for(const [path,id] of Object.entries(M.aliases||{})){urls.set(path,id);urls.set(abs(path),id);}
 const recordByUrl=url=>url&&(records.get(urls.get(url))||records.get(urls.get(abs(url))));
 function record(value){
  if(typeof value==='string')return records.get(value)||recordByUrl(value);
  if(value&&typeof value==='object')return decodedImages.get(value)||recordByUrl(value.currentSrc)||recordByUrl(value.src);
 }
 const groupIds=group=>[...new Set((Array.isArray(group)?group:[group]).flatMap(g=>M.groups[g]?.required||[]))];
 const optionalIds=group=>[...new Set((Array.isArray(group)?group:[group]).flatMap(g=>M.groups[g]?.optional||[]))];
 const ready=group=>(Array.isArray(group)?group:[group]).every(g=>!!M.groups[g])&&groupIds(group).every(id=>records.get(id)?.status==='ready');
 function resolve(url){const r=record(url);return r?(r.objectURL||(r.status==='error'?empty:r.url)):url;}
 function image(url){const r=record(url);if(!r){const i=new root.Image();i.src=url;return i;}return r.image||(r.image=new root.Image());}
 function drawImage(ctx,img,...args){
  const r=decodedImages.get(img),sheet=r?.atlas&&atlases.get(r.atlas);
  if(!sheet)return ctx.drawImage(img,...args);
  if(!sheet.image||r.status!=='ready')return;
  let sx=0,sy=0,sw=r.width,sh=r.height,dx,dy,dw=sw,dh=sh;
  if(args.length===2)[dx,dy]=args;
  else if(args.length===4)[dx,dy,dw,dh]=args;
  else if(args.length===8)[sx,sy,sw,sh,dx,dy,dw,dh]=args;
  else throw new TypeError('Invalid image drawing arguments');
  if(![sx,sy,sw,sh,dx,dy,dw,dh].every(Number.isFinite)||!sw||!sh||!dw||!dh)return;
  if(sw<0){sx+=sw;sw=-sw;}if(sh<0){sy+=sh;sh=-sh;}
  if(dw<0){dx+=dw;dw=-dw;}if(dh<0){dy+=dh;dh=-dh;}
  // Match native drawImage clipping, without sampling a neighboring sprite.
  const x=Math.max(0,sx),y=Math.max(0,sy),w=Math.min(r.width,sx+sw)-x,h=Math.min(r.height,sy+sh)-y;
  if(w<=0||h<=0)return;
  return ctx.drawImage(sheet.image,r.rect[0]+x,r.rect[1]+y,w,h,
   dx+(x-sx)*dw/sw,dy+(y-sy)*dh/sh,w*dw/sw,h*dh/sh);
 }
 const bound=new WeakSet();
 function bindAssets(map){if(!map||typeof map!=='object'||bound.has(map))return;bound.add(map);for(const key of Object.keys(map)){const value=map[key];if(value&&typeof value==='object')bindAssets(value);else if(typeof value==='string'&&record(value))Object.defineProperty(map,key,{enumerable:true,configurable:true,get:()=>resolve(value)});}}
 function source(r){return root.GAME_EMBEDDED_RESOURCES?.[r.id]||r.url;}
 function isBundled(r){return !!r.bundle&&!root.GAME_EMBEDDED_RESOURCES?.[r.id];}
 function changed(){for(const fn of listeners)fn();}
 function task(r,priority=0){
  if(!r)return Promise.reject(Error('资源清单不完整'));
  if(r.status==='ready')return Promise.resolve(r);
  if(r.status==='error')return Promise.reject(r.error);
  const firstRequest=!r.promise;
  if(firstRequest){r.promise=new Promise((ok,bad)=>{r.ok=ok;r.bad=bad;});r.promise.catch(()=>{});r.status='queued';}
  r.priority=Math.min(r.priority,priority);r.parked=false;
  // Start dependencies before their consumers can fill all four active slots.
  for(const id of r.deps||[])task(records.get(id),r.priority).catch(()=>{});
  if(firstRequest){r.order=++sequence;queue.push(r);}
  pump();return r.promise;
 }
 function pumpBundles(){
  if(activeBundles.size>=4||!bundles.size)return;
  // Pack downloads have their own slots, separate from image and font decoders.
  // A pack can serve several scenes and is requested only once.
  const needed=[];
  for(const pack of bundles.values()){
   if(pack.status!=='idle')continue;
   let first=null;
   for(const r of pack.members){
    if(r.status!=='queued'||r.parked||!isBundled(r))continue;
    if(!first||r.priority<first.priority||r.priority===first.priority&&r.order<first.order)first=r;
   }
   if(first)needed.push({pack,priority:first.priority,order:first.order});
  }
  needed.sort((a,b)=>a.priority-b.priority||a.order-b.order);
  for(const {pack,priority} of needed){
   if(activeBundles.size>=4)break;
   if(priority>0&&(foreground||activeBundles.size))break;
   pack.status='loading';activeBundles.add(pack);runBundle(pack);
  }
 }
 function pump(){
  pumpBundles();
  // Finish a decoded sheet before opening more sheets, keeping mobile peak
  // memory bounded while the full session is being prepared.
  const sheetOpen=r=>r.atlas&&atlases.get(r.atlas)?.promise?0:1;
  queue.sort((a,b)=>a.priority-b.priority||sheetOpen(a)-sheetOpen(b)||a.order-b.order);
  while(active.size<4){
   const i=queue.findIndex(r=>{
    if(r.status!=='queued'||r.parked)return false;
    const pack=isBundled(r)&&bundles.get(r.bundle);
    if(pack&&(pack.status==='idle'||pack.status==='loading'))return false;
    return r.priority===0||[...active].some(a=>a.deps?.includes(r.id))||(!foreground&&active.size<1);
   });
   if(i<0)break;
   const [r]=queue.splice(i,1);active.add(r);r.status='loading';run(r);
  }
 }
 function timeout(promise,ms,onTimeout){let timer;return Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>{onTimeout?.();reject(Object.assign(Error('连接超时'),{code:'timeout'}));},ms))]).finally(()=>clearTimeout(timer));}
 const retries=Math.max(0,Math.min(3,M.autoRetries??2));
 const transient=error=>error?.code==='timeout'||error?.code==='network'||error instanceof TypeError||error?.name==='TypeError'||error?.code==='http'&&(error.status===408||error.status===429||error.status>=500);
 function pause(ms){return new Promise(ok=>setTimeout(ok,ms));}
 async function watched(owner,work){
  let timer;
  const stalled=new Promise((_,reject)=>{
   owner.pulse=()=>{clearTimeout(timer);timer=setTimeout(()=>{
    const error=Object.assign(Error('连接超时'),{code:'timeout'});owner.timedOut=true;owner.controller.abort();reject(error);
   },M.timeoutMs||32000);};
  });
  owner.pulse();
  try{return await Promise.race([stalled,work()]);}
  catch(error){if(owner.timedOut)error.code='timeout';throw error;}
  finally{clearTimeout(timer);owner.pulse=null;}
 }
 async function download(input,signal,attempt,mime,onProgress){
  const inline=input.startsWith('data:');
  let response;
  try{response=await root.fetch(input,inline?{signal}:{signal,cache:attempt>1?'reload':'force-cache',credentials:'same-origin'});}
  catch(error){if(!signal.aborted)error.code='network';throw error;}
  if(!response.ok)throw Object.assign(Error('资源请求失败'),{code:'http',status:response.status});
  onProgress(0);
  if(inline||!response.body?.getReader){
   const blob=await response.blob();
   if(signal.aborted)throw Error('准备已中断');
   return blob;
  }
  const reader=response.body.getReader(),chunks=[];
  let received=0;
  for(;;){
   const {value,done}=await reader.read();
   if(done)break;
   if(signal.aborted)throw Error('准备已中断');
   chunks.push(value);received+=value.byteLength;onProgress(received);
  }
  if(signal.aborted)throw Error('准备已中断');
  return new Blob(chunks,{type:mime});
 }
 async function runBundle(pack){
  try{
   for(let retryNo=0;;retryNo++){
    pack.controller=new AbortController();pack.timedOut=false;
    pack.attempt++;pack.received=0;pack.error=null;pack.retryCount=0;changed();
    try{
     const blob=await watched(pack,()=>download(pack.url,pack.controller.signal,pack.attempt,'application/octet-stream',received=>{
      pack.pulse?.();pack.received=received;
      const now=Date.now();if(now-lastBundleUpdate>=60){lastBundleUpdate=now;changed();}
     }));
     if(blob.size!==pack.bytes)throw Object.assign(Error('资源包不完整'),{code:'decode'});
     pack.received=pack.bytes;pack.blob=blob;pack.status='ready';break;
    }catch(error){
     if(!transient(error)||retryNo>=retries)throw error;
     pack.retryCount=retryNo+1;changed();await pause((M.retryDelayMs??700)*(retryNo+1));
    }
   }
  }catch(error){
   pack.error=error;pack.status='error';
   // Fail every waiting consumer together before exposing manual Retry.
   for(const r of pack.members){
    if(r.status!=='queued'||!isBundled(r))continue;
    r.status='error';r.phase='error';
    r.error=Object.assign(Error(error.message),{code:error.code||'network',status:error.status,resource:r.label||'场景素材'});
    r.bad?.(r.error);
   }
   for(let i=queue.length-1;i>=0;i--)if(queue[i].status==='error')queue.splice(i,1);
  }finally{pack.controller=null;activeBundles.delete(pack);changed();pump();}
 }
 async function atlasPixels(r){
  const sheet=atlases.get(r.atlas),pack=bundles.get(r.bundle),rect=r.rect,signal=r.controller.signal;
  if(!sheet||!pack?.blob||!Array.isArray(rect)||rect.length!==4||
     rect.some(n=>!Number.isSafeInteger(n)||n<0)||rect[2]!==r.width||rect[3]!==r.height||
     rect[0]+rect[2]>sheet.width||rect[1]+rect[3]>sheet.height||
     sheet.offset<0||sheet.offset+sheet.bytes>pack.blob.size)
   throw Object.assign(Error('图集裁切信息不完整'),{code:'decode'});
  r.phase='decode';r.received=r.bytes;r.pulse?.();
  if(!sheet.promise)sheet.promise=(async()=>{
   const url=URL.createObjectURL(pack.blob.slice(sheet.offset,sheet.offset+sheet.bytes,sheet.mime));
   const img=new root.Image();img.decoding='async';
   try{
    await new Promise((ok,bad)=>{img.onload=ok;img.onerror=()=>bad(Object.assign(Error('图集无法打开'),{code:'decode'}));img.src=url;});
    if(img.decode)await img.decode();
    if(img.naturalWidth!==sheet.width||img.naturalHeight!==sheet.height)throw Object.assign(Error('图集尺寸不完整'),{code:'decode'});
    sheet.image=img;return img;
   }finally{img.onload=img.onerror=null;URL.revokeObjectURL(url);}
  })();
  await sheet.promise;if(signal.aborted)throw Error('准备已中断');
  // A view keeps the original dimensions but shares the decoded sheet pixels.
  // Only drawImage consumes these views; DOM images keep standalone encoded bytes.
  const view=Object.freeze({src:r.url,complete:true,naturalWidth:r.width,naturalHeight:r.height,width:r.width,height:r.height});
  decodedImages.set(view,r);r.image=view;
 }
 async function binary(r){
  const input=source(r),signal=r.controller.signal;r.phase='download';
  if(isBundled(r)){
   const pack=bundles.get(r.bundle);
   if(pack?.error){
    const {message,code,status}=pack.error;
    throw Object.assign(Error(message),{code,status});
   }
   if(!pack?.blob||!Number.isSafeInteger(r.offset)||r.offset<0||
      !Number.isSafeInteger(r.bytes)||r.bytes<=0||r.offset+r.bytes>pack.blob.size){
    throw Object.assign(Error('资源包索引不完整'),{code:'decode'});
   }
   r.received=r.bytes;
   return pack.blob.slice(r.offset,r.offset+r.bytes,r.mime);
  }
  const blob=await download(input,signal,r.attempt,r.mime,n=>{r.pulse?.();if(n){r.received=n;changed();}});
  r.received=r.bytes;return blob;
 }
 async function pixels(r,blob){
  const signal=r.controller.signal;r.phase='decode';changed();
  const url=URL.createObjectURL(blob),img=new root.Image();img.decoding='async';
  try{await new Promise((ok,bad)=>{img.onload=()=>ok();img.onerror=()=>bad(Object.assign(Error('画面文件损坏或无法打开'),{code:'decode'}));img.src=url;});
   if(img.decode)await img.decode();if(signal.aborted)throw Error('准备已中断');if(!img.naturalWidth)throw Object.assign(Error('画面未能显示'),{code:'decode'});
  }catch(error){URL.revokeObjectURL(url);throw error;}
  finally{img.onload=img.onerror=null;}
  // Publish pixels and their original atlas dimensions together after decoding.
  decodedImages.set(img,r);urls.set(url,r.id);r.objectURL=url;r.image=img;
 }
 async function code(r){
  if(r.readyFlag&&root[r.readyFlag])return;
  let input=r.url,revoke=false;
  const embedded=root.GAME_EMBEDDED_CODE?.[r.id];
  if(embedded){input=URL.createObjectURL(new Blob([embedded],{type:r.type==='style'?'text/css':'text/javascript'}));revoke=true;}
  else if(r.type==='script'){
   // Fetch incrementally so a slow but progressing script does not time out.
   const blob=await binary(r);input=URL.createObjectURL(new Blob([blob],{type:'text/javascript'}));revoke=true;
  }else if(r.attempt>1)input+=(input.includes('?')?'&':'?')+'retry='+r.attempt;
  r.phase=r.type==='style'?'style':'script';r.pulse?.();changed();
  try{await new Promise((ok,bad)=>{const signal=r.controller.signal,el=doc.createElement(r.type==='style'?'link':'script');r.element=el;
   if(r.type==='style'){el.rel='stylesheet';el.href=input;}else{el.async=false;el.src=input;}
   const clean=()=>{el.onload=el.onerror=null;signal.removeEventListener('abort',abort);};
   const abort=()=>{clean();el.remove();bad(Error('准备已中断'));};
   el.onload=()=>{clean();r.readyFlag&&!root[r.readyFlag]?bad(Object.assign(Error('游戏代码未能初始化，请重试'),{code:'initialization'})):ok();};
   el.onerror=()=>{clean();bad(Object.assign(Error('界面代码未能载入'),{code:revoke?'initialization':'network'}));};
   signal.addEventListener('abort',abort,{once:true});doc.head.appendChild(el);
  });}finally{if(revoke)URL.revokeObjectURL(input);}
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
 async function audio(r,blob){
  const signal=r.controller.signal;
  if(r.pcm){
   r.phase='decode';changed();
   const input=new Uint8Array(await blob.arrayBuffer());
   const wave=await root.GameLosslessAudio.restore(input,r.pcm,signal);
   blob=new Blob([wave],{type:'audio/wav'});
  }else{
   blob=new Blob([blob],{type:r.mime});
  }
  if(signal.aborted)throw Error('准备已中断');
  r.objectURL=URL.createObjectURL(blob);urls.set(r.objectURL,r.id);
 }
 async function run(r){
  r.preempted=false;changed();
  try{
   for(const dep of r.deps||[])await task(records.get(dep),r.priority);
   for(let retryNo=0;;retryNo++){
    r.attempt=(r.attempt||0)+1;r.controller=new AbortController();r.timedOut=false;r.retryCount=0;
    try{
     await watched(r,async()=>{
      if(r.type==='script'||r.type==='style')await code(r);
      else if(r.type==='image'&&r.atlas&&isBundled(r))await atlasPixels(r);
      else{const blob=await binary(r);r.pulse?.();if(r.type==='image')await pixels(r,blob);else if(r.type==='font')await font(r,blob);else await audio(r,blob);}
     });break;
    }catch(error){
     if(r.preempted||!transient(error)||retryNo>=retries)throw error;
     r.element?.remove();r.phase='retry';r.retryCount=retryNo+1;changed();await pause((M.retryDelayMs??700)*(retryNo+1));
     if(r.preempted)throw error;
    }
   }
   r.status='ready';r.phase='ready';r.error=null;if(r.cssVar&&r.objectURL)doc.documentElement.style.setProperty(r.cssVar,'url("'+r.objectURL+'")');r.ok?.(r);
  }catch(error){
   if(r.preempted){r.status='queued';r.received=0;r.order=++sequence;queue.push(r);}
   else{r.status='error';r.phase='error';r.error=Object.assign(error,{resource:r.label||'场景素材',code:error.code||'network'});r.element?.remove();r.bad?.(r.error);}
  }finally{r.controller=null;r.timedOut=false;active.delete(r);changed();pump();}
 }
 function preempt(){for(const r of active)if(r.priority>0&&r.phase==='download'&&!source(r).startsWith('data:')){r.preempted=true;r.controller?.abort();}}
 function stats(group){
  const list=groupIds(group).map(id=>records.get(id)).filter(Boolean);let total=0,done=0;
  let current=null;
  for(const r of list){
   const weight=r.weight||r.bytes||1;total+=weight;
   if(r.status==='ready'){done+=weight;continue;}
   if(r.status==='loading')current??=r;
   const pack=isBundled(r)&&bundles.get(r.bundle);
   if(pack&&(pack.status==='loading'||pack.status==='ready')){
    const source=r.atlas?atlases.get(r.atlas):r;
    const fraction=Math.max(0,Math.min(1,(pack.received-source.offset)/source.bytes));
    done+=r.bytes*fraction;
    if(pack.status==='loading'&&r.status==='queued')current??=r;
   }else if(!pack&&(r.phase==='download'||r.phase==='decode')){
    done+=Math.min(r.bytes||1,r.received||0);
   }
  }
  const complete=(Array.isArray(group)?group:[group]).every(g=>!!M.groups[g])&&list.every(r=>r.status==='ready');
  return {total,done,percent:complete?100:Math.min(99,Math.floor(100*done/Math.max(1,total))),complete,failed:list.filter(r=>r.status==='error'),current,count:list.filter(r=>r.status==='ready').length};
 }
 function retry(group){
  for(const id of groupIds(group)){
   const r=records.get(id);
   if(r?.status!=='error')continue;
   if(r.readyFlag&&root[r.readyFlag]){
    r.status='ready';r.phase='ready';r.error=null;continue;
   }
   const pack=isBundled(r)&&bundles.get(r.bundle);
   if(pack&&(pack.status==='error'||pack.status==='ready')){
    pack.status='idle';pack.received=0;pack.error=null;pack.blob=null;
   }
   if(r.atlas){const sheet=atlases.get(r.atlas);if(sheet){sheet.image=null;sheet.promise=null;}}
   r.status='idle';r.phase='';r.received=0;r.error=null;r.promise=null;r.priority=20;
  }
 }
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
  overlay.innerHTML='<div class="scene-load-pattern" aria-hidden="true"><div class="scene-load-row"></div><div class="scene-load-row"></div></div><div class="scene-load-card"><div class="scene-load-progress"><h2 data-load-title><span></span></h2><div class="scene-load-battery" aria-hidden="true">'+Array.from({length:10},()=>'<span class="scene-load-cell"><i></i></span>').join('')+'</div><p class="scene-load-percent" role="progressbar" aria-label="资源准备进度" aria-valuemin="0" aria-valuemax="100" data-load-percent></p><p class="scene-load-status" role="status" aria-live="polite" data-load-status></p><p class="scene-load-duration" data-load-duration>加载大概需要1分钟</p><div class="scene-load-actions" hidden><button type="button" data-load-retry>重试</button><button type="button" class="scene-load-back" data-load-back>返回封面</button></div></div><div class="load-play"></div></div>';
  overlay.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Tab'){const buttons=[...overlay.querySelectorAll('button,[tabindex="0"]')].filter(b=>!b.closest('[hidden]')&&!b.disabled);if(!buttons.length){e.preventDefault();return;}if(e.shiftKey&&doc.activeElement===buttons[0]){e.preventDefault();buttons.at(-1).focus({preventScroll:true});}else if(!e.shiftKey&&doc.activeElement===buttons.at(-1)){e.preventDefault();buttons[0].focus({preventScroll:true});}}});
  doc.getElementById('app').appendChild(overlay);
  loadingPlay=root.GameLoadingPlay?.create(overlay.querySelector('.load-play'));
  return overlay;
 }
 function loadingEvent(active){doc.getElementById('app').classList.toggle('is-resource-loading',active);root.dispatchEvent?.(new CustomEvent('game:loading',{detail:{active}}));}
 function loadingTitle(v,s){
  if(v.error||s.failed.length)return '网络打了个小盹，重试就能接着准备';
  if(s.complete)return '准备好啦，你的这一晚即将开场！';
  const elapsed=Date.now()-v.startedAt;
  if(s.percent>=90)return '就差一点点，今晚马上开场！';
  if(s.percent>=80)return '再接几颗星，好心情就位中！';
  if(elapsed>=10000)return '先接几颗星，等今晚慢慢亮起来';
  if(elapsed>=5000)return '初次见面，下载大约需要 1 分钟';
  return v.title;
 }
 function paint(v){
  const s=stats(v.groups),el=makeOverlay(),percent=el.querySelector('[data-load-percent]');
  const heading=el.querySelector('[data-load-title] span'),title=loadingTitle(v,s);
  if(heading.textContent!==title){
   heading.textContent=title;
   const units=Array.from(title).reduce((width,char)=>width+(char.charCodeAt(0)<128?.85:1.02),.25);
   heading.style.setProperty('--load-title-units',String(units));
  }
  percent.textContent=(v.progressLabel||'场景准备')+' '+s.percent+'%';percent.setAttribute('aria-valuenow',s.percent);
  el.querySelectorAll('.scene-load-cell').forEach((cell,i)=>{const fill=Math.max(0,Math.min(1,(s.percent-i*10)/10));cell.firstElementChild.style.width=(fill*100)+'%';cell.classList.toggle('is-current',!s.complete&&s.percent>=i*10&&s.percent<(i+1)*10);});
  if(v.previous!==s.done){v.previous=s.done;v.lastProgress=Date.now();}
  const failed=s.failed[0]||(v.error?{error:v.error}:null);
  el.classList.toggle('has-load-error',!!failed);
  let text=s.complete?'画面已准备好':s.current?(s.current.phase==='decode'?'正在展开':'正在准备')+'「'+s.current.label+'」':'正在等待准备';
  const reconnect=s.current?.retryCount||(s.current?.bundle&&bundles.get(s.current.bundle)?.retryCount);
  if(reconnect&&!failed)text='网络较慢，正在自动重试（'+reconnect+'/'+retries+'）…';
  if(Date.now()-v.lastProgress>8000&&!failed&&!reconnect)text='仍在准备'+(s.current?'「'+s.current.label+'」':'场景')+'，网络较慢时可能需要稍等。';
  if(failed){const err=failed.error;text=(root.navigator?.onLine===false?'网络已断开，请恢复连接后重试。':err?.code==='timeout'?'连接超时，请重试。':err?.code==='decode'?'画面文件未能打开，请重试。':'素材未能载入，请重试。')+' 已准备好的部分会保留。';}
  el.querySelector('[data-load-status]').textContent=text;
  el.querySelector('.scene-load-actions').hidden=!failed;
  return s;
 }
 async function prepare(groups,options={}){
  if(ready(groups)&&!options.forceDisplay)return true;
  if(view){const pending=view,same=groupIds(groups).every(id=>groupIds(pending.groups).includes(id));const ok=await pending.promise;if(!ok)return false;return same&&ready(groups)?true:prepare(groups,options);}
  const owner={groups,title:options.title||M.groups[Array.isArray(groups)?groups.at(-1):groups]?.title||'正在准备下一段旅程',progressLabel:options.progressLabel,startedAt:Date.now(),lastProgress:Date.now(),previous:-1,shown:0};
  view=owner;owner.promise=new Promise(resolve=>owner.finish=resolve);loadingEvent(true);
  const revealNow=()=>{if(view===owner){makeOverlay().hidden=false;loadingPlay?.start();owner.shown=Date.now();paint(owner);}};
  let reveal=options.immediate?null:setTimeout(revealNow,140);
  if(options.immediate)revealNow();
  const refresh=()=>{if(view===owner){const s=paint(owner);if(s.failed.length&&!owner.shown){clearTimeout(reveal);revealNow();}}};listeners.add(refresh);const heartbeat=setInterval(refresh,1000);
  function end(ok){if(view!==owner)return;clearTimeout(reveal);clearInterval(heartbeat);listeners.delete(refresh);loadingPlay?.stop();if(overlay)overlay.hidden=true;view=null;loadingEvent(false);owner.finish(ok);if(!ok)root.GameRuntime?.returnToCover?.();}
  async function attempt(){try{await ensure(groups);if(view!==owner)return;await options.onReady?.();if(view!==owner)return;paint(owner);const remain=owner.shown?Math.max(0,180-(Date.now()-owner.shown)):0;if(remain)await new Promise(r=>setTimeout(r,remain));end(true);}catch(error){if(view!==owner)return;owner.error=error;refresh();if(!owner.shown){clearTimeout(reveal);revealNow();}makeOverlay().querySelector('[data-load-retry]')?.focus({preventScroll:true});}}
  const el=makeOverlay();el.querySelector('[data-load-retry]').onclick=()=>{retry(groups);owner.error=null;el.querySelector('.scene-load-actions').hidden=true;owner.lastProgress=Date.now();attempt();};el.querySelector('[data-load-back]').hidden=options.allowCancel===false;el.querySelector('[data-load-back]').onclick=()=>{if(options.allowCancel!==false)end(false);};
  attempt();return owner.promise;
 }
 function gate(groups,run,options={}){const key=options.key||String(groups);if(gates.has(key))return gates.get(key);const p=(async()=>{if(await prepare(groups,options))return run();return false;})();gates.set(key,p);p.finally(()=>gates.delete(key)).catch(()=>{});return p;}
 function hydrate(scope=doc){for(const el of scope.querySelectorAll('[data-game-src]')){const raw=el.dataset.gameSrc,r=record(raw);if(r?.status==='ready'){el.src=resolve(raw);el.removeAttribute('data-game-src');}}}
 root.GameResources={manifest:M,ready,resolve,image,drawImage,bindAssets,ensure,preload,next,optional,prepare,gate,retry,stats,hydrate,load,record,records};
 if(doc){for(const name of ['click','pointerdown','keydown'])doc.addEventListener(name,e=>{if(view&&!overlay?.contains(e.target)){e.preventDefault();e.stopImmediatePropagation();}},true);}
})(window);
