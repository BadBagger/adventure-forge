(function factory(root, makeRuntime) {
  let core = root.ForgeRuntimeCore;
  if (!core && typeof require === "function") core = require("./forge-runtime-core.js");
  const runtime = makeRuntime(core);
  if (typeof module === "object" && module.exports) module.exports = runtime;
  root.ForgeCanvasRuntime = runtime;
})(typeof globalThis !== "undefined" ? globalThis : this, function makeRuntime(core) {
  const RUNTIME_MARKER = "ForgeRuntimeCore";

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }

  function buildStandaloneHtml(project, options = {}) {
    const projectJson = JSON.stringify(project).replace(/</g, "\\u003c");
    const coreScript = options.coreSource
      ? `<script>${options.coreSource}\n<\/script>`
      : `<script src="src/runtime/forge-runtime-core.js"><\/script>`;
    const runtimeScript = options.runtimeSource
      ? `<script>${options.runtimeSource}\n<\/script>`
      : `<script src="src/runtime/forge-canvas-runtime.js"><\/script>`;
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(project.name)} Playable</title>
  <style>
    :root { color-scheme: dark; --bg:#130f0c; --panel:#21170f; --line:#4c3828; --ink:#fff6df; --muted:#c8b89d; --accent:#75c9c3; --gold:#f4d58a; }
    * { box-sizing: border-box; } body { margin:0; font-family:Segoe UI, system-ui, sans-serif; background:var(--bg); color:var(--ink); }
    main { width:min(1180px,100%); margin:0 auto; padding:14px; }
    header { display:flex; justify-content:space-between; gap:12px; align-items:end; margin-bottom:10px; }
    h1,h2,p { margin:0; } h1 { font-size:clamp(22px,3vw,34px); letter-spacing:0; } h2 { font-size:15px; text-transform:uppercase; letter-spacing:0; color:var(--gold); }
    p { color:var(--muted); } canvas { display:block; width:100%; aspect-ratio:16/9; max-height:calc(100vh - 230px); object-fit:contain; border:1px solid var(--line); border-radius:8px; background:#07090d; touch-action:manipulation; }
    .top-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
    .verbs { display:flex; gap:0; border:1px solid var(--line); border-radius:8px; overflow:hidden; }
    button { border:1px solid var(--line); background:#2b2119; color:var(--ink); min-height:38px; padding:0 13px; border-radius:6px; cursor:pointer; font:inherit; }
    button:hover { border-color:var(--accent); } .verbs button { border:0; border-right:1px solid var(--line); border-radius:0; min-width:92px; }
    .verbs button:last-child { border-right:0; } .verbs button.active { background:var(--accent); color:#10201f; }
    .lower { display:grid; grid-template-columns:minmax(0,1fr) 340px; gap:12px; margin-top:12px; }
    .panel { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:12px; }
    .status-grid { display:grid; gap:10px; } .inventory { display:flex; align-items:center; gap:8px; flex-wrap:wrap; min-height:38px; }
    .inventory button.active { background:var(--gold); color:#271706; } .choices { display:grid; gap:8px; margin-top:12px; }
    .line { color:var(--ink); font-size:17px; line-height:1.45; margin-top:8px; } .quiet { color:var(--muted); font-size:13px; }
    @media (max-width: 840px) { main { padding:10px; } header,.lower { grid-template-columns:1fr; display:grid; } canvas { max-height:54vh; } .top-actions { justify-content:space-between; } .verbs { width:100%; } .verbs button { flex:1; min-width:0; } }
  </style>
</head>
<body data-runtime="${RUNTIME_MARKER}">
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
      <div class="panel status-grid"><p id="status">Click a character or hotspot.</p><div><h2>Inventory</h2><div id="inventory" class="inventory"><span class="quiet">empty</span></div></div></div>
      <aside class="panel"><h2 id="speaker">Scene Log</h2><p id="line" class="line">No interaction yet.</p><div id="choices" class="choices"></div></aside>
    </section>
  </main>
  ${coreScript}
  ${runtimeScript}
  <script>
    window.__FORGE_PROJECT__ = ${projectJson};
    window.__FORGE_RUNTIME__ = ForgeCanvasRuntime.createCanvasRuntime({
      project: window.__FORGE_PROJECT__,
      canvas: document.getElementById('game'),
      elements: {
        sceneName: document.getElementById('sceneName'),
        status: document.getElementById('status'),
        speaker: document.getElementById('speaker'),
        line: document.getElementById('line'),
        choices: document.getElementById('choices'),
        inventory: document.getElementById('inventory'),
        inspectMode: document.getElementById('inspectMode'),
        useMode: document.getElementById('useMode'),
        resetScene: document.getElementById('resetScene')
      }
    });
  <\/script>
</body>
</html>`;
  }

  function createCanvasRuntime({ project, canvas, elements = {}, debugOverlays = null }) {
    const ctx = canvas.getContext("2d");
    const images = new Map();
    const audio = new Map();
    const gameSpec = project.game || {};
    const lineMap = new Map((project.script?.lines || []).map((line) => [line.line_id, line]));
    const gameState = core.createGameState(project);
    const state = {
      scene: core.activeScene(project),
      bubble: null,
      sequence: null,
      player: null,
      walkTarget: null,
      pendingInteraction: null,
      ended: false,
      userActivatedAudio: false,
      activeEvents: [],
      clockStart: now(),
      raf: null,
    };

    function setScene(sceneId) {
      state.scene = core.sceneById(project, sceneId);
      if (!state.scene) return;
      canvas.width = state.scene.width;
      canvas.height = state.scene.height;
      state.player = (state.scene.objects || []).find((object) => object.kind === "character") || null;
      state.walkTarget = null;
      state.pendingInteraction = null;
      state.bubble = null;
      if (elements.sceneName) elements.sceneName.textContent = state.scene.name;
    }

    async function hydrate() {
      for (const scene of project.scenes || []) {
        for (const layer of scene.layers || []) if (layer.dataUrl && !images.has(layer.id)) images.set(layer.id, await loadImage(layer.dataUrl));
      }
      for (const model of project.assets?.characters || []) {
        for (const frame of model.frames || []) if (frame.dataUrl && !images.has(frame.id)) images.set(frame.id, await loadImage(frame.dataUrl));
      }
      hydrateAudio();
      setScene(project.activeSceneId);
      renderUi();
      if (gameSpec.startLineIds?.length) playLineSequence(gameSpec.startLineIds, (state.scene.objects || []).find((object) => object.name === "Pip") || null);
      loop();
    }

    function loop() {
      updateWalk();
      draw();
      state.raf = requestAnimationFrame(loop);
    }

    function stop() {
      if (state.raf) cancelAnimationFrame(state.raf);
      state.raf = null;
    }

    function updateWalk() {
      if (!state.player || !state.walkTarget) return;
      const current = { x: state.player.x + state.player.w / 2, y: core.baseline(state.player, state.scene) };
      const dx = state.walkTarget.x - current.x;
      const dy = state.walkTarget.y - current.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= 3) {
        if (state.walkTarget.stateAfter) state.player.animationState = state.walkTarget.stateAfter;
        const nextInteraction = state.pendingInteraction;
        state.walkTarget = null;
        state.pendingInteraction = null;
        if (nextInteraction) handleObject(nextInteraction);
        return;
      }
      const step = Math.min(5, distance);
      state.player.x += (dx / distance) * step;
      state.player.y += (dy / distance) * step;
      state.player.baseline = state.player.y + state.player.h;
      state.player.animationState = "walk";
    }

    function draw() {
      const scene = state.scene;
      if (!scene) return;
      ctx.clearRect(0, 0, scene.width, scene.height);
      ctx.fillStyle = scene.background || "#1b2a27";
      ctx.fillRect(0, 0, scene.width, scene.height);
      [...(scene.layers || [])].filter((layer) => layer.visible !== false && !core.isDepthSortedLayer(layer)).sort((a, b) => a.depth - b.depth).forEach(drawLayer);
      if (showDebug()) [...(scene.objects || [])].filter((object) => object.kind === "walkable").forEach(drawObject);
      core.sortedDepthRenderables(scene, { includeDialogue: showDebug() }).forEach((entry) => entry.kind === "layer" ? drawLayer(entry.item) : drawObject(entry.item));
      drawBubble(state.bubble);
    }

    function drawLayer(layer) {
      const image = images.get(layer.id);
      if (image) {
        ctx.globalAlpha = layer.opacity ?? 1;
        ctx.drawImage(image, layer.x || 0, layer.y || 0, layer.w || state.scene.width, layer.h || state.scene.height);
        ctx.globalAlpha = 1;
        return;
      }
      if (layer.type === "background") {
        ctx.fillStyle = layer.color || "#26374a";
        ctx.fillRect(0, 0, state.scene.width, state.scene.height);
      }
      if (layer.type === "foreground" && showDebug()) {
        ctx.fillStyle = layer.color || "rgba(202,216,211,.16)";
        ctx.fillRect(layer.x || 0, layer.y ?? state.scene.height - 114, layer.w || state.scene.width, layer.h || 60);
      }
    }

    function drawObject(object) {
      if (object.hiddenInPlayable) return;
      if (object.kind === "walkable") {
        if (!showDebug()) return;
        ctx.fillStyle = "rgba(87,199,162,.12)";
        ctx.fillRect(object.x, object.y, object.w, object.h);
        return;
      }
      if (object.kind === "character") {
        const model = (project.assets?.characters || []).find((candidate) => candidate.id === object.modelId);
        const elapsed = object.animationStartedAt ? now() - object.animationStartedAt : now() - state.clockStart;
        const frame = core.currentFrame(model, object.animationState || "idle", elapsed);
        const image = frame ? images.get(frame.id) : null;
        if (image) ctx.drawImage(image, object.x, object.y, object.w, object.h);
        else if (showDebug()) {
          ctx.fillStyle = "rgba(111,168,255,.8)";
          ctx.fillRect(object.x, object.y, object.w, object.h);
        }
      } else if (object.modelId) {
        const model = (project.assets?.characters || []).find((candidate) => candidate.id === object.modelId);
        const elapsed = object.animationStartedAt ? now() - object.animationStartedAt : now() - state.clockStart;
        const frame = core.currentFrame(model, object.animationState || "idle", elapsed);
        const image = frame ? images.get(frame.id) : null;
        if (image) ctx.drawImage(image, object.x, object.y, object.w, object.h);
      } else if (showDebug()) {
        ctx.fillStyle = object.kind === "dialogue" ? "rgba(241,180,92,.2)" : "rgba(239,106,117,.2)";
        ctx.fillRect(object.x, object.y, object.w, object.h);
      }
      if (showDebug()) {
        ctx.strokeStyle = object.kind === "character" ? "#6fa8ff" : "#ef6a75";
        ctx.strokeRect(object.x, object.y, object.w, object.h);
      }
    }

    function showDebug() {
      if (debugOverlays !== null) return debugOverlays === true;
      return project.export?.debugOverlays === true || project.export?.debug === "qa" || gameSpec.debugOverlays === true;
    }

    function setMode(mode) {
      gameState.mode = mode;
      if (mode !== "use") gameState.selectedItem = null;
      renderUi();
    }

    function renderUi() {
      elements.inspectMode?.classList.toggle("active", gameState.mode === "inspect" && !gameState.selectedItem);
      elements.useMode?.classList.toggle("active", gameState.mode === "use" || Boolean(gameState.selectedItem));
      if (!elements.inventory) return;
      elements.inventory.innerHTML = "";
      if (!gameState.inventory.length) {
        const empty = document.createElement("span");
        empty.className = "quiet";
        empty.textContent = "empty";
        elements.inventory.appendChild(empty);
      }
      for (const itemId of gameState.inventory) {
        const item = gameSpec.items?.[itemId] || { name: itemId };
        const button = document.createElement("button");
        button.textContent = item.name || itemId;
        button.className = gameState.selectedItem === itemId ? "active" : "";
        button.onclick = () => {
          gameState.selectedItem = gameState.selectedItem === itemId ? null : itemId;
          gameState.mode = gameState.selectedItem ? "use" : "inspect";
          renderUi();
        };
        elements.inventory.appendChild(button);
      }
    }

    function showText(speakerName, text, object) {
      if (elements.speaker) elements.speaker.textContent = speakerName || "Scene Log";
      if (elements.line) elements.line.textContent = text || "";
      state.bubble = makeBubble(resolveSpeakerObject(speakerName, object) || object, text);
      drawChoices([]);
    }

    function drawChoices(choices) {
      if (!elements.choices) return;
      elements.choices.innerHTML = "";
      for (const choice of choices || []) {
        const button = document.createElement("button");
        button.textContent = choice.label;
        button.onclick = () => handleChoice(choice);
        elements.choices.appendChild(button);
      }
    }

    function playLineSequence(lineIds, object, after) {
      state.sequence = { lineIds: [...lineIds], index: 0, object, after };
      showSequenceLine();
    }

    function showSequenceLine() {
      if (!state.sequence) return;
      const line = lineMap.get(state.sequence.lineIds[state.sequence.index]);
      if (!line) {
        finishSequence();
        return;
      }
      playLineAudio(line);
      triggerLineEvent(line);
      showText(displaySpeaker(line.speaker), line.text, state.sequence.object);
      const choices = [];
      if (state.sequence.index < state.sequence.lineIds.length - 1) choices.push({ label: "Next", action: "nextSequence" });
      else choices.push({ label: state.sequence.after?.label || "Done", action: "finishSequence" });
      drawChoices(choices);
    }

    function finishSequence() {
      const after = state.sequence?.after;
      state.sequence = null;
      if (after?.sceneId) {
        setScene(after.sceneId);
        renderUi();
      }
      if (after?.lineIds?.length) {
        const nextAfter = { ...after };
        delete nextAfter.sceneId;
        delete nextAfter.lineIds;
        playLineSequence(after.lineIds, (state.scene.objects || []).find((object) => object.name === "Pip") || null, nextAfter);
        return;
      }
      if (after?.endGame) endGame(after);
      if (after?.status && elements.status) elements.status.textContent = after.status;
      drawChoices([]);
    }

    function endGame(after = {}) {
      state.ended = true;
      gameState.ended = true;
      state.walkTarget = null;
      state.pendingInteraction = null;
      if (elements.status) elements.status.textContent = after.status || "The End";
      drawChoices([]);
    }

    function handleChoice(choice) {
      if (choice.action === "nextSequence") {
        playCue(gameSpec.audio?.uiSelect);
        state.sequence.index += 1;
        showSequenceLine();
        return;
      }
      if (choice.action === "finishSequence") {
        playCue(gameSpec.audio?.uiSelect);
        finishSequence();
        return;
      }
      if (choice.lineIds) {
        playCue(gameSpec.audio?.uiSelect);
        core.applyEffects(gameState, state.scene, choice.effects || {});
        renderUi();
        playLineSequence(choice.lineIds, core.activeObjectByHotspot(state.scene, choice.hotspotId) || null, choice.after || null);
        return;
      }
      if (choice.response) showText(choice.speaker || "Scene Log", choice.response, core.activeObjectByHotspot(state.scene, choice.hotspotId) || null);
    }

    function handleRule(rule, object, hotspotId) {
      if (!rule) {
        playFallback(object);
        return;
      }
      playCue(gameSpec.audio?.uiSelect);
      playCue(rule.sfx);
      core.applyEffects(gameState, state.scene, rule.effects || {});
      renderUi();
      let lineIds = rule.lineIds || [];
      if (rule.cycleLineIds?.length) {
        const key = `cycle:${hotspotId}:${rule.id || "default"}`;
        const index = gameState.counters[key] || 0;
        lineIds = [rule.cycleLineIds[index % rule.cycleLineIds.length]];
        gameState.counters[key] = index + 1;
      }
      const after = rule.after ? { ...rule.after } : null;
      if (after?.sceneId && after?.lineIds?.length) after.label ||= "Continue";
      playLineSequence(lineIds, object, after);
      if (rule.status && elements.status) elements.status.textContent = rule.status;
      if (rule.onceCounter) gameState.counters[rule.onceCounter] = (gameState.counters[rule.onceCounter] || 0) + 1;
    }

    function playFallback(object) {
      const fallback = gameSpec.fallbacks?.useScenery;
      if (fallback?.length) playLineSequence(fallback, object);
      else showText(object?.name || "Scene Log", object?.dialogue || object?.text || object?.note || "No response authored yet.", object);
    }

    function handleConversation(hotspotId, object) {
      const spec = gameSpec.conversations?.[hotspotId];
      if (!spec) return false;
      if (hotspotId === "bramble-desk") {
        if (gameState.flags.gateOpen && !gameState.flags.bramblePostGateSeen) {
          core.applyEffects(gameState, state.scene, { setFlags: ["bramblePostGateSeen"] });
          setAnimation("bramble-actor", "postGate");
          renderUi();
          playLineSequence(spec.postGateLineIds, object);
          return true;
        }
        if (!gameState.flags.brambleIntroComplete) {
          core.applyEffects(gameState, state.scene, { setFlags: ["brambleIntroComplete"] });
          setAnimation("bramble-actor", "greeting");
          renderUi();
          playLineSequence(spec.introLineIds, object);
          return true;
        }
      }
      showText(object.name, object.dialogue || "What do you want to ask?", object);
      drawChoices((spec.topics || []).map((topic) => ({ ...topic, hotspotId })));
      return true;
    }

    function handleObject(object) {
      if (!object) {
        state.bubble = null;
        showText("Scene Log", "Nothing responds there.", null);
        return;
      }
      const hotspotId = object.hotspotId || object.id;
      if (elements.status) elements.status.textContent = `${gameState.selectedItem ? `Use ${itemName(gameState.selectedItem)} on ` : `${cap(gameState.mode)} `}${object.name}`;
      if (!gameState.selectedItem && handleConversation(hotspotId, object)) return;
      const hotspot = gameSpec.hotspots?.[hotspotId];
      let rule = null;
      if (gameState.selectedItem) rule = core.pickInteractionRule(gameState, hotspot?.useItem?.[gameState.selectedItem], hotspotId);
      else rule = core.pickInteractionRule(gameState, hotspot?.[gameState.mode], hotspotId);
      if (!rule && gameState.mode === "use") rule = core.pickInteractionRule(gameState, hotspot?.use, hotspotId);
      if (!rule && object.targetSceneId) {
        const target = core.sceneById(project, object.targetSceneId);
        if (target) {
          setScene(target.id);
          showText(target.name, `Entered ${target.name}.`, null);
          return;
        }
      }
      handleRule(rule, object, hotspotId);
    }

    function setWalkTarget(x, y, object = null) {
      if (!state.player) return false;
      const point = object ? core.nearestWalkPoint(state.scene, object.x + object.w / 2, object.y + object.h) : core.nearestWalkPoint(state.scene, x, y);
      if (!point.area) return false;
      state.walkTarget = { x: point.x, y: point.y, stateAfter: state.player.animationState === "walk" ? "idle" : state.player.animationState || "idle" };
      state.pendingInteraction = object;
      if (elements.status) elements.status.textContent = object ? `Walking to ${object.name}.` : "Walking.";
      return true;
    }

    function click(x, y) {
      if (state.ended || gameState.ended) return;
      activateAudio();
      const object = core.objectAt(state.scene, x, y, { includeDialogue: showDebug() });
      if (!object) {
        if (setWalkTarget(x, y)) return;
        state.bubble = null;
        showText("Scene Log", "Nothing responds there.", null);
        return;
      }
      if (object !== state.player && setWalkTarget(x, y, object)) return;
      handleObject(object);
    }

    function makeBubble(object, text) {
      if (!object || !text) return null;
      return { objectId: object.id, speaker: object.name, text, anchorId: core.dialogueAnchorFor(state.scene, object)?.id || null };
    }

    function drawBubble(payload) {
      if (!payload?.text) return;
      const object = (state.scene.objects || []).find((item) => item.id === payload.objectId);
      const anchor = (state.scene.objects || []).find((item) => item.id === payload.anchorId) || core.dialogueAnchorFor(state.scene, object);
      const source = anchor || object;
      const box = core.bubbleBox(state.scene, source, (text) => ctx.measureText(text).width, payload.text);
      if (!box) return;
      ctx.save();
      ctx.font = "16px Segoe UI";
      ctx.fillStyle = "rgba(15, 10, 6, .94)";
      ctx.strokeStyle = "#f4d58a";
      ctx.lineWidth = 2;
      roundedRect(ctx, box.x, box.y, box.width, box.height, 8);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(box.stemX - 8, box.y + box.height - 1);
      ctx.lineTo(box.stemX, Math.min(source.y, box.y + box.height + 16));
      ctx.lineTo(box.stemX + 8, box.y + box.height - 1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#f4d58a";
      ctx.font = "700 12px Segoe UI";
      ctx.fillText(payload.speaker || "Dialogue", box.x + 16, box.y + 20);
      ctx.fillStyle = "#fff6df";
      ctx.font = "16px Segoe UI";
      box.lines.forEach((line, index) => ctx.fillText(line, box.x + 16, box.y + 46 + index * 21));
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

    function resolveSpeakerObject(speakerName, fallback) {
      const key = normalizeSpeaker(speakerName);
      return (state.scene.objects || []).find((object) => object.kind === "character" && normalizeSpeaker(object.name) === key) || fallback;
    }

    function displaySpeaker(speaker) {
      return String(speaker || "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
    }

    function normalizeSpeaker(speaker) {
      return String(speaker || "").replace(/_/g, " ").toLowerCase();
    }

    function itemName(itemId) {
      return gameSpec.items?.[itemId]?.name || itemId;
    }

    function cap(value) {
      return String(value || "").slice(0, 1).toUpperCase() + String(value || "").slice(1);
    }

    function canvasPoint(event) {
      const rect = canvas.getBoundingClientRect();
      return { x: (event.clientX - rect.left) * (canvas.width / rect.width), y: (event.clientY - rect.top) * (canvas.height / rect.height) };
    }

    canvas.addEventListener("click", (event) => {
      const point = canvasPoint(event);
      click(point.x, point.y);
    });
    elements.inspectMode && (elements.inspectMode.onclick = () => setMode("inspect"));
    elements.useMode && (elements.useMode.onclick = () => setMode("use"));
    elements.resetScene && (elements.resetScene.onclick = () => {
      const fresh = core.createGameState(project);
      Object.assign(gameState, fresh);
      state.sequence = null;
      state.ended = false;
      setScene(project.activeSceneId);
      showText("Scene Log", "Reset. Click a character or hotspot.", null);
      renderUi();
    });
    hydrate();
    return { state, gameState, draw, stop, click, setScene, core };

    function hydrateAudio() {
      for (const cue of project.assets?.audio?.cues || []) {
        if (!cue.dataUrl || !cue.id) continue;
        const element = new Audio(cue.dataUrl);
        element.loop = cue.loop === true;
        element.volume = Number.isFinite(Number(cue.volume)) ? Number(cue.volume) : 0.5;
        audio.set(cue.id, element);
        if (cue.trigger && cue.trigger !== cue.id) audio.set(cue.trigger, element);
      }
    }

    function activateAudio() {
      if (state.userActivatedAudio) return;
      state.userActivatedAudio = true;
      playCue(gameSpec.audio?.ambience);
    }

    function playCue(cueIds) {
      const ids = Array.isArray(cueIds) ? cueIds : (cueIds ? [cueIds] : []);
      for (const id of ids) {
        const source = audio.get(id);
        if (!source || !state.userActivatedAudio) continue;
        const sound = source.loop ? source : source.cloneNode(true);
        sound.volume = source.volume;
        sound.currentTime = 0;
        sound.play().catch(() => {});
      }
    }

    function playLineAudio(line) {
      if (!line?.audioDataUrl || !state.userActivatedAudio) return;
      const voice = new Audio(line.audioDataUrl);
      voice.volume = 0.85;
      voice.play().catch(() => {});
    }

    function triggerLineEvent(line) {
      playCue(line?.event?.sfx);
      playCue(line?.event?.music);
      if (line?.event?.name) triggerEvent(line.event.name);
    }

    function triggerEvent(eventName) {
      const spec = gameSpec.eventActions?.[eventName];
      if (!spec) return;
      playCue(spec.sfx);
      playCue(spec.music);
      const startedAt = now();
      const event = { eventName, startedAt, durationMs: Number(spec.durationMs) || 1000, restores: [] };
      for (const action of spec.actors || []) {
        const object = (state.scene.objects || []).find((candidate) => candidate.id === action.objectId);
        if (!object) continue;
        event.restores.push({ object, animationState: object.animationState, hiddenInPlayable: object.hiddenInPlayable });
        if (action.state) {
          object.animationState = action.state;
          object.animationStartedAt = startedAt;
        }
        if (typeof action.hidden === "boolean") object.hiddenInPlayable = action.hidden;
      }
      state.activeEvents.push(event);
      setTimeout(() => finishEvent(event), event.durationMs);
    }

    function finishEvent(event) {
      state.activeEvents = state.activeEvents.filter((candidate) => candidate !== event);
      for (const restore of event.restores) {
        restore.object.animationState = restore.animationState || "idle";
        restore.object.hiddenInPlayable = restore.hiddenInPlayable;
        restore.object.animationStartedAt = now();
      }
    }

    function setAnimation(objectId, animationState) {
      const object = (state.scene.objects || []).find((candidate) => candidate.id === objectId);
      if (!object) return;
      object.animationState = animationState;
      object.animationStartedAt = now();
    }
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
  }

  function now() {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  return { RUNTIME_MARKER, buildStandaloneHtml, createCanvasRuntime };
});
