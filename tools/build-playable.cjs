const fs = require('fs');
const path = require('path');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}

function buildPlayableHtml(project) {
  const projectJson = JSON.stringify(project).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(project.name)} Playable</title>
  <style>
    :root { color-scheme: dark; --bg:#101216; --panel:#191d24; --line:#303949; --ink:#eef2f7; --muted:#9aa6b6; --accent:#57c7a2; }
    * { box-sizing: border-box; } body { margin:0; font-family:Segoe UI, system-ui, sans-serif; background:var(--bg); color:var(--ink); }
    main { width:min(1180px,100%); margin:0 auto; padding:16px; } header { display:flex; justify-content:space-between; gap:12px; align-items:end; margin-bottom:12px; }
    h1,p { margin:0; } p { color:var(--muted); } canvas { display:block; width:100%; aspect-ratio:16/9; border:1px solid var(--line); border-radius:8px; background:#07090d; }
    .lower { display:grid; grid-template-columns:minmax(0,1fr) 320px; gap:12px; margin-top:12px; } .panel { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:12px; }
    button { border:1px solid var(--line); background:#242b37; color:var(--ink); min-height:36px; padding:0 12px; border-radius:6px; cursor:pointer; } button:hover { border-color:var(--accent); }
    .choices { display:grid; gap:8px; margin-top:12px; } @media (max-width: 840px) { header,.lower { grid-template-columns:1fr; display:grid; } }
  </style>
</head>
<body>
  <main><header><div><h1>${escapeHtml(project.name)}</h1><p id="sceneName"></p></div><button id="resetScene">Reset</button></header><canvas id="game" width="960" height="540"></canvas><section class="lower"><div class="panel"><p id="status">Click a character or hotspot.</p></div><aside class="panel"><h2 id="speaker">Scene Log</h2><p id="line">No interaction yet.</p><div id="choices" class="choices"></div></aside></section></main>
  <script>
    const project = ${projectJson};
    const canvas = document.getElementById('game'); const ctx = canvas.getContext('2d');
    let scene = project.scenes.find(s => s.id === project.activeSceneId) || project.scenes[0]; let bubble = null; const images = new Map(); const animClock = { start: performance.now() };
    function setScene(sceneId){ scene = project.scenes.find(s=>s.id===sceneId)||project.scenes[0]; document.getElementById('sceneName').textContent=scene.name; }
    setScene(project.activeSceneId);
    function loadImage(src){ return new Promise((resolve,reject)=>{ const img = new Image(); img.onload=()=>resolve(img); img.onerror=reject; img.src=src; }); }
    async function hydrate(){ for (const layer of scene.layers || []) if (layer.dataUrl) images.set(layer.id, await loadImage(layer.dataUrl)); for (const model of project.assets?.characters || []) for (const frame of model.frames || []) if (frame.dataUrl) images.set(frame.id, await loadImage(frame.dataUrl)); draw(); requestAnimationFrame(loop); }
    function loop(){ draw(); requestAnimationFrame(loop); }
    function draw(){ ctx.clearRect(0,0,scene.width,scene.height); ctx.fillStyle=scene.background||'#1b2a27'; ctx.fillRect(0,0,scene.width,scene.height); [...(scene.layers||[])].filter(l=>l.visible!==false&&!isDepthSortedLayer(l)).sort((a,b)=>a.depth-b.depth).forEach(drawLayer); [...(scene.objects||[])].filter(o=>o.kind==='walkable').forEach(drawObject); sortedDepthRenderables().forEach(e=>e.kind==='layer'?drawLayer(e.item):drawObject(e.item)); drawBubble(bubble); }
    function drawLayer(layer){ const image=images.get(layer.id); if(image){ ctx.globalAlpha=layer.opacity??1; ctx.drawImage(image,layer.x||0,layer.y||0,layer.w||scene.width,layer.h||scene.height); ctx.globalAlpha=1; return; } if(layer.type==='background'){ctx.fillStyle=layer.color||'#26374a'; ctx.fillRect(0,0,scene.width,scene.height);} if(layer.type==='foreground'){ctx.fillStyle=layer.color||'rgba(202,216,211,.16)'; ctx.fillRect(0,scene.height-114,scene.width,60);} }
    function drawObject(object){ if(object.kind==='walkable'){ ctx.fillStyle='rgba(87,199,162,.12)'; ctx.fillRect(object.x,object.y,object.w,object.h); return; } if(object.kind==='character'){ const model=(project.assets?.characters||[]).find(m=>m.id===object.modelId); const frame=currentFrame(model,object.animationState||'idle'); const image=frame?images.get(frame.id):null; if(image) ctx.drawImage(image,object.x,object.y,object.w,object.h); else { ctx.fillStyle='rgba(111,168,255,.8)'; ctx.fillRect(object.x,object.y,object.w,object.h); } } else { ctx.fillStyle=object.kind==='dialogue'?'rgba(241,180,92,.2)':'rgba(239,106,117,.2)'; ctx.fillRect(object.x,object.y,object.w,object.h); } ctx.strokeStyle=object.kind==='character'?'#6fa8ff':'#ef6a75'; ctx.strokeRect(object.x,object.y,object.w,object.h); }
    function makeBubble(object,text){ if(!object||!text) return null; return { objectId:object.id, speaker:object.name, text, anchorId:dialogueAnchorFor(object)?.id||null }; }
    function dialogueAnchorFor(object){ if(!object) return null; if(object.kind==='dialogue') return object; const objectWords=dialogueMatchWords(object.name); return (scene.objects||[]).find(candidate=>candidate.kind==='dialogue'&&dialogueMatchWords(candidate.name).some(word=>objectWords.includes(word)))||null; }
    function dialogueMatchWords(text){ const ignored=new Set(['anchor','bubble','dialogue','hotspot','interaction','text','the']); return String(text||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').split(' ').filter(word=>word.length>2&&!ignored.has(word)); }
    function drawBubble(payload){ if(!payload?.text) return; const object=(scene.objects||[]).find(item=>item.id===payload.objectId); const anchor=(scene.objects||[]).find(item=>item.id===payload.anchorId)||dialogueAnchorFor(object); const source=anchor||object; if(!source) return; ctx.save(); ctx.font='14px Segoe UI'; const maxWidth=Math.min(340,Math.max(220,scene.width-32)); const lines=wrapText(payload.text,maxWidth-28).slice(0,4); const width=Math.min(maxWidth,Math.max(190,...lines.map(text=>ctx.measureText(text).width+28))); const height=34+lines.length*19; const sourceCenter=source.x+source.w/2; const y=clamp(source.y-height-16,12,Math.max(12,scene.height-height-12)); const x=clamp(sourceCenter-width/2,12,Math.max(12,scene.width-width-12)); const stemX=clamp(sourceCenter,x+22,x+width-22); ctx.fillStyle='rgba(10,12,16,.92)'; ctx.strokeStyle='#f1b45c'; ctx.lineWidth=2; roundedRect(ctx,x,y,width,height,10); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(stemX-8,y+height-1); ctx.lineTo(stemX,Math.min(source.y,y+height+16)); ctx.lineTo(stemX+8,y+height-1); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle='#f1b45c'; ctx.font='600 12px Segoe UI'; ctx.fillText(payload.speaker||'Dialogue',x+14,y+18); ctx.fillStyle='#eef2f7'; ctx.font='14px Segoe UI'; lines.forEach((text,index)=>ctx.fillText(text,x+14,y+40+index*19)); ctx.restore(); }
    function roundedRect(target,x,y,w,h,r){ target.beginPath(); if(target.roundRect) target.roundRect(x,y,w,h,r); else { target.moveTo(x+r,y); target.arcTo(x+w,y,x+w,y+h,r); target.arcTo(x+w,y+h,x,y+h,r); target.arcTo(x,y+h,x,y,r); target.arcTo(x,y,x+w,y,r); } }
    function wrapText(text,maxWidth){ const words=String(text||'').split(/\\s+/).filter(Boolean); const lines=[]; let line=''; for(const word of words){ const trial=line?line+' '+word:word; if(ctx.measureText(trial).width>maxWidth&&line){ lines.push(line); line=word; } else line=trial; } if(line) lines.push(line); return lines.length?lines:['']; }
    function clamp(value,min,max){ return Math.max(min,Math.min(max,value)); }
    function currentFrame(model,stateName){ if(!model?.frames?.length) return null; const state=model.animations?.[stateName]||model.animations?.idle; if(!state?.frames?.length) return model.frames[0]; const fps=Math.max(1,Number(state.fps)||4); const elapsed=(performance.now()-animClock.start)/1000; const index=state.loop===false?Math.min(state.frames.length-1,Math.floor(elapsed*fps)):Math.floor(elapsed*fps)%state.frames.length; return model.frames[state.frames[index]]||model.frames[0]; }
    function sortedDepthRenderables(){ return [...(scene.layers||[]).filter(l=>l.visible!==false&&isDepthSortedLayer(l)).map((item,index)=>({kind:'layer',item,index})), ...(scene.objects||[]).filter(o=>o.kind!=='walkable').map((item,index)=>({kind:'object',item,index:index+1000}))].sort((a,b)=>baseline(a.item)-baseline(b.item)||a.index-b.index); }
    function baseline(item){ if(Number.isFinite(Number(item.baseline))) return Number(item.baseline); if(item.kind) return Number(item.y||0)+Number(item.h||0); if(item.type==='foreground') return Number(item.y??scene.height-114)+Number(item.h??60); if(item.type==='prop'||item.type==='occlusion') return Number(item.y??0)+Number(item.h??scene.height); return Number(item.depth||0); }
    function isDepthSortedLayer(layer){ return layer.type==='foreground'||layer.type==='prop'||layer.type==='occlusion'; }
    function objectAt(x,y){ return sortedDepthRenderables().filter(e=>e.kind==='object').map(e=>e.item).reverse().find(o=>x>=o.x&&x<=o.x+o.w&&y>=o.y&&y<=o.y+o.h); }
    canvas.addEventListener('click', event=>{ const rect=canvas.getBoundingClientRect(); const x=(event.clientX-rect.left)*(canvas.width/rect.width); const y=(event.clientY-rect.top)*(canvas.height/rect.height); const object=objectAt(x,y); const speaker=document.getElementById('speaker'); const line=document.getElementById('line'); const choices=document.getElementById('choices'); choices.innerHTML=''; if(!object){ bubble=null; speaker.textContent='Scene Log'; line.textContent='Nothing responds there.'; draw(); return; } if(object.targetSceneId){ const target=project.scenes.find(s=>s.id===object.targetSceneId); if(target){ setScene(target.id); bubble=null; speaker.textContent=target.name; line.textContent='Entered '+target.name+'.'; draw(); return; } } const node=(scene.dialogue||[]).find(n=>n.speaker===object.name); speaker.textContent=object.name; line.textContent=node?.line||object.dialogue||object.text||object.note||'No response authored yet.'; bubble=makeBubble(object,line.textContent); draw(); for(const choice of node?.choices||[]){ const button=document.createElement('button'); button.textContent=choice.label; button.onclick=()=>{ line.textContent=choice.response; bubble=makeBubble(object,choice.response); draw(); }; choices.appendChild(button); } });
    document.getElementById('resetScene').onclick=()=>{ setScene(project.activeSceneId); bubble=null; document.getElementById('speaker').textContent='Scene Log'; document.getElementById('line').textContent='No interaction yet.'; document.getElementById('choices').innerHTML=''; draw(); };
    hydrate();
  </script>
</body>
</html>`;
}

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) {
  console.error('usage: node tools/build-playable.cjs project.json output.html');
  process.exit(2);
}
const project = JSON.parse(fs.readFileSync(input, 'utf8'));
fs.writeFileSync(output, buildPlayableHtml(project));
console.log(`Wrote ${output}`);
