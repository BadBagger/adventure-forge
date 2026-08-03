const fs = require('fs');

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
    :root { color-scheme: dark; --bg:#130f0c; --panel:#21170f; --line:#4c3828; --ink:#fff6df; --muted:#c8b89d; --accent:#75c9c3; --gold:#f4d58a; }
    * { box-sizing: border-box; }
    body { margin:0; font-family:Segoe UI, system-ui, sans-serif; background:var(--bg); color:var(--ink); }
    main { width:min(1180px,100%); margin:0 auto; padding:14px; }
    header { display:flex; justify-content:space-between; gap:12px; align-items:end; margin-bottom:10px; }
    h1,h2,p { margin:0; }
    h1 { font-size:clamp(22px,3vw,34px); letter-spacing:0; }
    h2 { font-size:15px; text-transform:uppercase; letter-spacing:0; color:var(--gold); }
    p { color:var(--muted); }
    canvas { display:block; width:100%; aspect-ratio:16/9; border:1px solid var(--line); border-radius:8px; background:#07090d; touch-action:manipulation; }
    .top-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
    .verbs { display:flex; gap:0; border:1px solid var(--line); border-radius:8px; overflow:hidden; }
    button { border:1px solid var(--line); background:#2b2119; color:var(--ink); min-height:38px; padding:0 13px; border-radius:6px; cursor:pointer; font:inherit; }
    button:hover { border-color:var(--accent); }
    .verbs button { border:0; border-right:1px solid var(--line); border-radius:0; min-width:92px; }
    .verbs button:last-child { border-right:0; }
    .verbs button.active { background:var(--accent); color:#10201f; }
    .lower { display:grid; grid-template-columns:minmax(0,1fr) 340px; gap:12px; margin-top:12px; }
    .panel { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:12px; }
    .status-grid { display:grid; gap:10px; }
    .inventory { display:flex; align-items:center; gap:8px; flex-wrap:wrap; min-height:38px; }
    .inventory button.active { background:var(--gold); color:#271706; }
    .choices { display:grid; gap:8px; margin-top:12px; }
    .line { color:var(--ink); font-size:17px; line-height:1.45; margin-top:8px; }
    .quiet { color:var(--muted); font-size:13px; }
    @media (max-width: 840px) {
      main { padding:10px; }
      header,.lower { grid-template-columns:1fr; display:grid; }
      .top-actions { justify-content:space-between; }
      .verbs { width:100%; }
      .verbs button { flex:1; min-width:0; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div><h1>${escapeHtml(project.name)}</h1><p id="sceneName"></p></div>
      <div class="top-actions">
        <div class="verbs" role="group" aria-label="Action mode"><button id="inspectMode" class="active">Inspect</button><button id="useMode">Use</button></div>
        <button id="resetScene">Reset</button>
      </div>
    </header>
    <canvas id="game" width="960" height="540"></canvas>
    <section class="lower">
      <div class="panel status-grid">
        <p id="status">Click a character or hotspot.</p>
        <div><h2>Inventory</h2><div id="inventory" class="inventory"><span class="quiet">empty</span></div></div>
      </div>
      <aside class="panel"><h2 id="speaker">Scene Log</h2><p id="line" class="line">No interaction yet.</p><div id="choices" class="choices"></div></aside>
    </section>
  </main>
  <script>
    const project = ${projectJson};
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');
    const images = new Map();
    const animClock = { start: performance.now() };
    const gameSpec = project.game || {};
    const lineMap = new Map((project.script?.lines || []).map(line => [line.line_id, line]));
    const gameState = {
      mode: gameSpec.defaultMode || 'inspect',
      selectedItem: null,
      inventory: [...(gameSpec.initialInventory || [])],
      flags: { ...(gameSpec.initialFlags || {}) },
      counters: {},
    };
    let scene = project.scenes.find(s => s.id === project.activeSceneId) || project.scenes[0];
    let bubble = null;
    let sequence = null;

    function setScene(sceneId) {
      scene = project.scenes.find(s => s.id === sceneId) || project.scenes[0];
      canvas.width = scene.width;
      canvas.height = scene.height;
      document.getElementById('sceneName').textContent = scene.name;
      bubble = null;
    }

    function loadImage(src) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });
    }

    async function hydrate() {
      for (const sceneEntry of project.scenes || []) {
        for (const layer of sceneEntry.layers || []) if (layer.dataUrl && !images.has(layer.id)) images.set(layer.id, await loadImage(layer.dataUrl));
      }
      for (const model of project.assets?.characters || []) {
        for (const frame of model.frames || []) if (frame.dataUrl && !images.has(frame.id)) images.set(frame.id, await loadImage(frame.dataUrl));
      }
      setScene(project.activeSceneId);
      renderUi();
      draw();
      if (gameSpec.startLineIds?.length) playLineSequence(gameSpec.startLineIds, scene.objects.find(o => o.name === 'Pip') || null);
      requestAnimationFrame(loop);
    }

    function loop() {
      draw();
      requestAnimationFrame(loop);
    }

    function draw() {
      ctx.clearRect(0, 0, scene.width, scene.height);
      ctx.fillStyle = scene.background || '#1b2a27';
      ctx.fillRect(0, 0, scene.width, scene.height);
      [...(scene.layers || [])].filter(l => l.visible !== false && !isDepthSortedLayer(l)).sort((a, b) => a.depth - b.depth).forEach(drawLayer);
      if (debugOverlays()) [...(scene.objects || [])].filter(o => o.kind === 'walkable').forEach(drawObject);
      sortedDepthRenderables().forEach(e => e.kind === 'layer' ? drawLayer(e.item) : drawObject(e.item));
      drawBubble(bubble);
    }

    function drawLayer(layer) {
      const image = images.get(layer.id);
      if (image) {
        ctx.globalAlpha = layer.opacity ?? 1;
        ctx.drawImage(image, layer.x || 0, layer.y || 0, layer.w || scene.width, layer.h || scene.height);
        ctx.globalAlpha = 1;
        return;
      }
      if (layer.type === 'background') {
        ctx.fillStyle = layer.color || '#26374a';
        ctx.fillRect(0, 0, scene.width, scene.height);
      }
      if (layer.type === 'foreground' && debugOverlays()) {
        ctx.fillStyle = layer.color || 'rgba(202,216,211,.16)';
        ctx.fillRect(layer.x || 0, layer.y ?? scene.height - 114, layer.w || scene.width, layer.h || 60);
      }
    }

    function drawObject(object) {
      if (object.hiddenInPlayable) return;
      if (object.kind === 'walkable') {
        if (!debugOverlays()) return;
        ctx.fillStyle = 'rgba(87,199,162,.12)';
        ctx.fillRect(object.x, object.y, object.w, object.h);
        return;
      }
      if (object.kind === 'character') {
        const model = (project.assets?.characters || []).find(m => m.id === object.modelId);
        const frame = currentFrame(model, object.animationState || 'idle');
        const image = frame ? images.get(frame.id) : null;
        if (image) ctx.drawImage(image, object.x, object.y, object.w, object.h);
        else if (debugOverlays()) {
          ctx.fillStyle = 'rgba(111,168,255,.8)';
          ctx.fillRect(object.x, object.y, object.w, object.h);
        }
      } else if (debugOverlays()) {
        ctx.fillStyle = object.kind === 'dialogue' ? 'rgba(241,180,92,.2)' : 'rgba(239,106,117,.2)';
        ctx.fillRect(object.x, object.y, object.w, object.h);
      }
      if (debugOverlays()) {
        ctx.strokeStyle = object.kind === 'character' ? '#6fa8ff' : '#ef6a75';
        ctx.strokeRect(object.x, object.y, object.w, object.h);
      }
    }

    function debugOverlays() {
      return project.export?.debugOverlays === true || gameSpec.debugOverlays === true;
    }

    function renderUi() {
      document.getElementById('inspectMode').classList.toggle('active', gameState.mode === 'inspect' && !gameState.selectedItem);
      document.getElementById('useMode').classList.toggle('active', gameState.mode === 'use' || !!gameState.selectedItem);
      const inventory = document.getElementById('inventory');
      inventory.innerHTML = '';
      if (!gameState.inventory.length) {
        const empty = document.createElement('span');
        empty.className = 'quiet';
        empty.textContent = 'empty';
        inventory.appendChild(empty);
      }
      for (const itemId of gameState.inventory) {
        const item = gameSpec.items?.[itemId] || { name: itemId };
        const button = document.createElement('button');
        button.textContent = item.name || itemId;
        button.className = gameState.selectedItem === itemId ? 'active' : '';
        button.onclick = () => {
          gameState.selectedItem = gameState.selectedItem === itemId ? null : itemId;
          gameState.mode = gameState.selectedItem ? 'use' : 'inspect';
          renderUi();
        };
        inventory.appendChild(button);
      }
    }

    function setMode(mode) {
      gameState.mode = mode;
      if (mode !== 'use') gameState.selectedItem = null;
      renderUi();
    }

    function showText(speakerName, text, object) {
      document.getElementById('speaker').textContent = speakerName || 'Scene Log';
      document.getElementById('line').textContent = text || '';
      bubble = makeBubble(resolveSpeakerObject(speakerName, object) || object, text);
      drawChoices([]);
      draw();
    }

    function drawChoices(choices) {
      const wrap = document.getElementById('choices');
      wrap.innerHTML = '';
      for (const choice of choices || []) {
        const button = document.createElement('button');
        button.textContent = choice.label;
        button.onclick = () => handleChoice(choice);
        wrap.appendChild(button);
      }
    }

    function playLineSequence(lineIds, object, after) {
      sequence = { lineIds: [...lineIds], index: 0, object, after };
      showSequenceLine();
    }

    function showSequenceLine() {
      if (!sequence) return;
      const line = lineMap.get(sequence.lineIds[sequence.index]);
      if (!line) {
        finishSequence();
        return;
      }
      showText(displaySpeaker(line.speaker), line.text, sequence.object);
      const choices = [];
      if (sequence.index < sequence.lineIds.length - 1) choices.push({ label: 'Next', action: 'nextSequence' });
      else choices.push({ label: sequence.after?.label || 'Done', action: 'finishSequence' });
      drawChoices(choices);
    }

    function finishSequence() {
      const after = sequence?.after;
      sequence = null;
      if (after?.sceneId) {
        setScene(after.sceneId);
        renderUi();
      }
      if (after?.lineIds?.length) {
        playLineSequence(after.lineIds, scene.objects.find(o => o.name === 'Pip') || null);
        return;
      }
      drawChoices([]);
      draw();
    }

    function handleChoice(choice) {
      if (choice.action === 'nextSequence') {
        sequence.index += 1;
        showSequenceLine();
        return;
      }
      if (choice.action === 'finishSequence') {
        finishSequence();
        return;
      }
      if (choice.lineIds) {
        applyEffects(choice.effects || {});
        playLineSequence(choice.lineIds, activeObjectByHotspot(choice.hotspotId) || null, choice.after || null);
        return;
      }
      if (choice.response) showText(choice.speaker || 'Scene Log', choice.response, activeObjectByHotspot(choice.hotspotId) || null);
    }

    function applyEffects(effects) {
      for (const flag of effects.setFlags || []) gameState.flags[flag] = true;
      for (const flag of effects.clearFlags || []) delete gameState.flags[flag];
      for (const item of effects.addItems || []) if (!gameState.inventory.includes(item)) gameState.inventory.push(item);
      for (const item of effects.removeItems || []) gameState.inventory = gameState.inventory.filter(existing => existing !== item);
      if (effects.animationState) {
        const actor = scene.objects.find(o => o.id === effects.animationState.objectId);
        if (actor) actor.animationState = effects.animationState.state;
      }
      renderUi();
    }

    function handleRule(rule, object, hotspotId) {
      if (!rule) {
        playFallback(object);
        return;
      }
      applyEffects(rule.effects || {});
      let lineIds = rule.lineIds || [];
      if (rule.cycleLineIds?.length) {
        const key = 'cycle:' + hotspotId + ':' + (rule.id || 'default');
        const index = gameState.counters[key] || 0;
        lineIds = [rule.cycleLineIds[index % rule.cycleLineIds.length]];
        gameState.counters[key] = index + 1;
      }
      const after = rule.after ? { ...rule.after } : null;
      if (after?.sceneId && after?.lineIds?.length) after.label ||= 'Continue';
      playLineSequence(lineIds, object, after);
      if (rule.status) document.getElementById('status').textContent = rule.status;
      if (rule.onceCounter) gameState.counters[rule.onceCounter] = (gameState.counters[rule.onceCounter] || 0) + 1;
    }

    function pickRule(rules, hotspotId) {
      for (const rule of rules || []) {
        if (rule.requiresFlag && !gameState.flags[rule.requiresFlag]) continue;
        if (rule.unlessFlag && gameState.flags[rule.unlessFlag]) continue;
        if (rule.onceCounter && gameState.counters[rule.onceCounter]) continue;
        return rule;
      }
      return (rules || []).find(rule => rule.default) || null;
    }

    function playFallback(object) {
      const fallback = gameSpec.fallbacks?.useScenery;
      if (fallback?.length) playLineSequence(fallback, object);
      else showText(object?.name || 'Scene Log', object?.dialogue || object?.text || object?.note || 'No response authored yet.', object);
    }

    function handleConversation(hotspotId, object) {
      const spec = gameSpec.conversations?.[hotspotId];
      if (!spec) return false;
      if (hotspotId === 'bramble-desk') {
        if (gameState.flags.gateOpen && !gameState.flags.bramblePostGateSeen) {
          applyEffects({ setFlags: ['bramblePostGateSeen'] });
          playLineSequence(spec.postGateLineIds, object);
          return true;
        }
        if (!gameState.flags.brambleIntroComplete) {
          applyEffects({ setFlags: ['brambleIntroComplete'] });
          playLineSequence(spec.introLineIds, object);
          return true;
        }
      }
      showText(object.name, object.dialogue || 'What do you want to ask?', object);
      drawChoices((spec.topics || []).map(topic => ({ ...topic, hotspotId })));
      return true;
    }

    function handleObject(object) {
      if (!object) {
        bubble = null;
        showText('Scene Log', 'Nothing responds there.', null);
        return;
      }
      const hotspotId = object.hotspotId || object.id;
      document.getElementById('status').textContent = (gameState.selectedItem ? 'Use ' + itemName(gameState.selectedItem) + ' on ' : cap(gameState.mode) + ' ') + object.name;
      if (!gameState.selectedItem && handleConversation(hotspotId, object)) return;
      const hotspot = gameSpec.hotspots?.[hotspotId];
      let rule = null;
      if (gameState.selectedItem) rule = pickRule(hotspot?.useItem?.[gameState.selectedItem], hotspotId);
      else rule = pickRule(hotspot?.[gameState.mode], hotspotId);
      if (!rule && gameState.mode === 'use') rule = pickRule(hotspot?.use, hotspotId);
      if (!rule && object.targetSceneId) {
        const target = project.scenes.find(s => s.id === object.targetSceneId);
        if (target) {
          setScene(target.id);
          showText(target.name, 'Entered ' + target.name + '.', null);
          return;
        }
      }
      handleRule(rule, object, hotspotId);
    }

    function makeBubble(object, text) {
      if (!object || !text) return null;
      return { objectId: object.id, speaker: object.name, text, anchorId: dialogueAnchorFor(object)?.id || null };
    }

    function dialogueAnchorFor(object) {
      if (!object) return null;
      if (object.kind === 'dialogue') return object;
      const objectWords = dialogueMatchWords(object.name);
      return (scene.objects || []).find(candidate => candidate.kind === 'dialogue' && dialogueMatchWords(candidate.name).some(word => objectWords.includes(word))) || null;
    }

    function dialogueMatchWords(text) {
      const ignored = new Set(['anchor', 'bubble', 'dialogue', 'hotspot', 'interaction', 'text', 'the']);
      return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(word => word.length > 2 && !ignored.has(word));
    }

    function drawBubble(payload) {
      if (!payload?.text) return;
      const object = (scene.objects || []).find(item => item.id === payload.objectId);
      const anchor = (scene.objects || []).find(item => item.id === payload.anchorId) || dialogueAnchorFor(object);
      const source = anchor || object;
      if (!source) return;
      ctx.save();
      ctx.font = '16px Segoe UI';
      const maxWidth = Math.min(520, Math.max(260, scene.width - 32));
      const lines = wrapText(payload.text, maxWidth - 32).slice(0, 5);
      const width = Math.min(maxWidth, Math.max(230, ...lines.map(text => ctx.measureText(text).width + 32)));
      const height = 40 + lines.length * 21;
      const sourceCenter = source.x + source.w / 2;
      const y = clamp(source.y - height - 16, 12, Math.max(12, scene.height - height - 12));
      const x = clamp(sourceCenter - width / 2, 12, Math.max(12, scene.width - width - 12));
      const stemX = clamp(sourceCenter, x + 22, x + width - 22);
      ctx.fillStyle = 'rgba(15, 10, 6, .94)';
      ctx.strokeStyle = '#f4d58a';
      ctx.lineWidth = 2;
      roundedRect(ctx, x, y, width, height, 8);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(stemX - 8, y + height - 1);
      ctx.lineTo(stemX, Math.min(source.y, y + height + 16));
      ctx.lineTo(stemX + 8, y + height - 1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f4d58a';
      ctx.font = '700 12px Segoe UI';
      ctx.fillText(payload.speaker || 'Dialogue', x + 16, y + 20);
      ctx.fillStyle = '#fff6df';
      ctx.font = '16px Segoe UI';
      lines.forEach((text, index) => ctx.fillText(text, x + 16, y + 46 + index * 21));
      ctx.restore();
    }

    function roundedRect(target, x, y, w, h, r) {
      target.beginPath();
      if (target.roundRect) target.roundRect(x, y, w, h, r);
      else {
        target.moveTo(x + r, y);
        target.arcTo(x + w, y, x + w, y + h, r);
        target.arcTo(x + w, y + h, x, y + h, r);
        target.arcTo(x, y + h, x, y, r);
        target.arcTo(x, y, x + w, y, r);
      }
    }

    function wrapText(text, maxWidth) {
      const words = String(text || '').split(/\\s+/).filter(Boolean);
      const lines = [];
      let line = '';
      for (const word of words) {
        const trial = line ? line + ' ' + word : word;
        if (ctx.measureText(trial).width > maxWidth && line) {
          lines.push(line);
          line = word;
        } else line = trial;
      }
      if (line) lines.push(line);
      return lines.length ? lines : [''];
    }

    function currentFrame(model, stateName) {
      if (!model?.frames?.length) return null;
      const state = model.animations?.[stateName] || model.animations?.idle;
      if (!state?.frames?.length) return model.frames[0];
      const fps = Math.max(1, Number(state.fps) || 4);
      const elapsed = (performance.now() - animClock.start) / 1000;
      const index = state.loop === false ? Math.min(state.frames.length - 1, Math.floor(elapsed * fps)) : Math.floor(elapsed * fps) % state.frames.length;
      return model.frames[state.frames[index]] || model.frames[0];
    }

    function sortedDepthRenderables() {
      return [
        ...(scene.layers || []).filter(l => l.visible !== false && isDepthSortedLayer(l)).map((item, index) => ({ kind: 'layer', item, index })),
        ...(scene.objects || []).filter(o => o.kind !== 'walkable' && o.kind !== 'dialogue').map((item, index) => ({ kind: 'object', item, index: index + 1000 })),
        ...(debugOverlays() ? (scene.objects || []).filter(o => o.kind === 'dialogue').map((item, index) => ({ kind: 'object', item, index: index + 2000 })) : []),
      ].sort((a, b) => baseline(a.item) - baseline(b.item) || a.index - b.index);
    }

    function baseline(item) {
      if (Number.isFinite(Number(item.baseline))) return Number(item.baseline);
      if (item.kind) return Number(item.y || 0) + Number(item.h || 0);
      if (item.type === 'foreground') return Number(item.y ?? scene.height - 114) + Number(item.h ?? 60);
      if (item.type === 'prop' || item.type === 'occlusion') return Number(item.y ?? 0) + Number(item.h ?? scene.height);
      return Number(item.depth || 0);
    }

    function isDepthSortedLayer(layer) {
      return layer.type === 'foreground' || layer.type === 'prop' || layer.type === 'occlusion';
    }

    function objectAt(x, y) {
      return sortedDepthRenderables()
        .filter(e => e.kind === 'object')
        .map(e => e.item)
        .reverse()
        .find(o => !o.nonInteractive && !o.hiddenInPlayable && x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h);
    }

    function resolveSpeakerObject(speakerName, fallback) {
      const key = normalizeSpeaker(speakerName);
      return (scene.objects || []).find(object => object.kind === 'character' && normalizeSpeaker(object.name) === key) || fallback;
    }

    function activeObjectByHotspot(hotspotId) {
      return (scene.objects || []).find(object => (object.hotspotId || object.id) === hotspotId) || null;
    }

    function displaySpeaker(speaker) {
      return String(speaker || '').replace(/_/g, ' ').toLowerCase().replace(/\\b\\w/g, char => char.toUpperCase());
    }

    function normalizeSpeaker(speaker) {
      return String(speaker || '').replace(/_/g, ' ').toLowerCase();
    }

    function itemName(itemId) {
      return gameSpec.items?.[itemId]?.name || itemId;
    }

    function cap(value) {
      return String(value || '').slice(0, 1).toUpperCase() + String(value || '').slice(1);
    }

    canvas.addEventListener('click', event => {
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) * (canvas.width / rect.width);
      const y = (event.clientY - rect.top) * (canvas.height / rect.height);
      handleObject(objectAt(x, y));
    });
    document.getElementById('inspectMode').onclick = () => setMode('inspect');
    document.getElementById('useMode').onclick = () => setMode('use');
    document.getElementById('resetScene').onclick = () => {
      gameState.mode = gameSpec.defaultMode || 'inspect';
      gameState.selectedItem = null;
      gameState.inventory = [...(gameSpec.initialInventory || [])];
      gameState.flags = { ...(gameSpec.initialFlags || {}) };
      gameState.counters = {};
      sequence = null;
      setScene(project.activeSceneId);
      showText('Scene Log', 'Reset. Click a character or hotspot.', null);
      renderUi();
    };
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
