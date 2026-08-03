(function factory(root, makeCore) {
  const core = makeCore();
  if (typeof module === "object" && module.exports) module.exports = core;
  root.ForgeRuntimeCore = core;
})(typeof globalThis !== "undefined" ? globalThis : this, function makeCore() {
  function sceneById(project, sceneId) {
    return (project.scenes || []).find((scene) => scene.id === sceneId) || (project.scenes || [])[0] || null;
  }

  function activeScene(project) {
    return sceneById(project, project.activeSceneId);
  }

  function isDepthSortedLayer(layer) {
    return layer && (layer.type === "foreground" || layer.type === "prop" || layer.type === "occlusion");
  }

  function baseline(item, scene = {}) {
    if (Number.isFinite(Number(item?.baseline))) return Number(item.baseline);
    if (item?.kind) return Number(item.y || 0) + Number(item.h || 0);
    if (item?.type === "foreground") return Number(item.y ?? (scene.height || 540) - 114) + Number(item.h ?? 60);
    if (item?.type === "prop" || item?.type === "occlusion") return Number(item.y ?? 0) + Number(item.h ?? scene.height ?? 540);
    return Number(item?.depth || 0);
  }

  function sortedDepthRenderables(scene, options = {}) {
    const includeDialogue = options.includeDialogue === true;
    return [
      ...(scene.layers || [])
        .filter((layer) => layer.visible !== false && isDepthSortedLayer(layer))
        .map((item, index) => ({ kind: "layer", item, index })),
      ...(scene.objects || [])
        .filter((object) => object.kind !== "walkable" && (includeDialogue || object.kind !== "dialogue"))
        .map((item, index) => ({ kind: "object", item, index: index + 1000 })),
    ].sort((a, b) => baseline(a.item, scene) - baseline(b.item, scene) || a.index - b.index);
  }

  function animationDurations(animation) {
    const frames = animation?.frames || [];
    const fps = Math.max(1, Number(animation?.fps) || 4);
    const holds = Array.isArray(animation?.holds) && animation.holds.length === frames.length
      ? animation.holds
      : frames.map(() => 1);
    return holds.map((hold) => Math.max(0.001, Number(hold) || 1) * (1000 / fps));
  }

  function animationLengthMs(animation) {
    return animationDurations(animation).reduce((sum, duration) => sum + duration, 0);
  }

  function animationFrameIndex(animation, elapsedMs = 0) {
    const frames = animation?.frames || [];
    if (!frames.length) return 0;
    const durations = animationDurations(animation);
    const total = durations.reduce((sum, duration) => sum + duration, 0);
    if (!total) return 0;
    let time = animation.loop === false
      ? Math.min(Math.max(0, Number(elapsedMs) || 0), total - 0.001)
      : (((Number(elapsedMs) || 0) % total) + total) % total;
    for (let index = 0; index < durations.length; index += 1) {
      if (time < durations[index]) return index;
      time -= durations[index];
    }
    return frames.length - 1;
  }

  function currentFrame(model, stateName = "idle", elapsedMs = 0) {
    if (!model?.frames?.length) return null;
    const state = model.animations?.[stateName] || model.animations?.idle;
    if (!state?.frames?.length) return model.frames[0];
    const index = animationFrameIndex(state, elapsedMs);
    return model.frames[state.frames[index]] || model.frames[0];
  }

  function objectAt(scene, x, y, options = {}) {
    return sortedDepthRenderables(scene, { includeDialogue: options.includeDialogue === true })
      .filter((entry) => entry.kind === "object")
      .map((entry) => entry.item)
      .reverse()
      .find((object) => {
        if (object.kind === "walkable") return false;
        if (options.ignoreHidden !== false && object.hiddenInPlayable) return false;
        if (options.ignoreNonInteractive !== false && object.nonInteractive) return false;
        return x >= object.x && x <= object.x + object.w && y >= object.y && y <= object.y + object.h;
      }) || null;
  }

  function nearestWalkPoint(scene, x, y) {
    const areas = (scene.objects || []).filter((object) => object.kind === "walkable");
    if (!areas.length) return { x, y, area: null, score: Infinity };
    let best = null;
    for (const area of areas) {
      const px = clamp(x, area.x, area.x + area.w);
      const py = clamp(y, area.y, area.y + area.h);
      const score = Math.hypot(px - x, py - y);
      if (!best || score < best.score) best = { x: px, y: py, area, score };
    }
    return best;
  }

  function dialogueAnchorFor(scene, object) {
    if (!object) return null;
    if (object.kind === "dialogue") return object;
    const objectWords = dialogueMatchWords(object.name);
    return (scene.objects || []).find((candidate) => candidate.kind === "dialogue" && dialogueMatchWords(candidate.name).some((word) => objectWords.includes(word))) || null;
  }

  function bubbleBox(scene, source, measureText, text, options = {}) {
    if (!source) return null;
    const fontSize = options.fontSize || 16;
    const maxWidth = Math.min(options.maxWidth || 520, Math.max(260, scene.width - 32));
    const lines = wrapText(text, maxWidth - 32, measureText).slice(0, options.maxLines || 5);
    const width = Math.min(maxWidth, Math.max(230, ...lines.map((line) => measureText(line) + 32)));
    const height = 40 + lines.length * (fontSize + 5);
    const sourceCenter = source.x + source.w / 2;
    const y = clamp(source.y - height - 16, 12, Math.max(12, scene.height - height - 12));
    const x = clamp(sourceCenter - width / 2, 12, Math.max(12, scene.width - width - 12));
    return { x, y, width, height, lines, stemX: clamp(sourceCenter, x + 22, x + width - 22) };
  }

  function renderableRect(item, scene = {}) {
    return {
      x: Number(item?.x ?? 0),
      y: Number(item?.y ?? 0),
      w: Number(item?.w ?? scene.width ?? 0),
      h: Number(item?.h ?? scene.height ?? 0),
    };
  }

  function actorBodyRect(actor) {
    return {
      x: Number(actor?.x || 0),
      y: Number(actor?.y || 0) + Number(actor?.h || 0) * 0.2,
      w: Number(actor?.w || 0),
      h: Number(actor?.h || 0) * 0.8,
    };
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function collectOcclusionWarnings(scene, options = {}) {
    const severity = options.severity || "warning";
    const occluders = (scene.layers || []).filter((layer) => layer.visible !== false && (layer.type === "occlusion" || layer.type === "foreground"));
    const actors = (scene.objects || []).filter((object) => object.kind === "character" && object.hiddenInPlayable !== true);
    const warnings = [];
    for (const actor of actors) {
      const actorBaseline = baseline(actor, scene);
      for (const layer of occluders) {
        const layerBaseline = baseline(layer, scene);
        if (actorBaseline >= layerBaseline) continue;
        const layerRect = renderableRect(layer, scene);
        const bodyRect = actorBodyRect(actor);
        if (rectsOverlap(bodyRect, layerRect)) continue;
        warnings.push({
          sceneId: scene.id,
          sceneName: scene.name,
          severity,
          message: `${scene.name}: ${actor.name} is depth-sorted behind ${layer.name || layer.type}, but that occlusion layer does not cover the actor body.`,
          actor,
          layer,
          actorBody: bodyRect,
          occluderRect: layerRect,
          actorBaseline,
          layerBaseline,
        });
      }
    }
    return warnings;
  }

  function createGameState(project) {
    const gameSpec = project.game || {};
    return {
      mode: gameSpec.defaultMode || "inspect",
      selectedItem: null,
      inventory: [...(gameSpec.initialInventory || [])],
      flags: { ...(gameSpec.initialFlags || {}) },
      counters: {},
      ended: false,
    };
  }

  function applyEffects(gameState, scene, effects = {}) {
    for (const flag of effects.setFlags || []) gameState.flags[flag] = true;
    for (const flag of effects.clearFlags || []) delete gameState.flags[flag];
    for (const item of effects.addItems || []) if (!gameState.inventory.includes(item)) gameState.inventory.push(item);
    for (const item of effects.removeItems || []) gameState.inventory = gameState.inventory.filter((existing) => existing !== item);
    if (effects.animationState) {
      const actor = (scene.objects || []).find((object) => object.id === effects.animationState.objectId);
      if (actor) actor.animationState = effects.animationState.state;
    }
    return gameState;
  }

  function pickInteractionRule(gameState, rules, hotspotId) {
    for (const rule of rules || []) {
      if (rule.requiresFlag && !gameState.flags[rule.requiresFlag]) continue;
      if (rule.unlessFlag && gameState.flags[rule.unlessFlag]) continue;
      if (rule.onceCounter && gameState.counters[rule.onceCounter]) continue;
      return rule;
    }
    return (rules || []).find((rule) => rule.default) || null;
  }

  function activeObjectByHotspot(scene, hotspotId) {
    return (scene.objects || []).find((object) => (object.hotspotId || object.id) === hotspotId) || null;
  }

  function collectGameCompletionIssues(project, options = {}) {
    const issues = [];
    const forbidden = options.forbidden || [/script pass required/i, /outline-only/i, /blocked pending/i, /not production-approved/i];
    const scenes = project.scenes || [];
    const gameSpec = project.game || {};
    const target = { tab: "qa" };
    const requireComplete = options.requireComplete === true || gameSpec.completionRequired === true || Boolean(gameSpec.buildStatus);
    if (!requireComplete) return issues;
    if (gameSpec.buildStatus !== "forge-complete-placeholder") {
      issues.push({ severity: "error", message: "Game build status must be forge-complete-placeholder.", target });
    }
    for (const scene of scenes) {
      scanForbidden(scene.name, `Scene ${scene.name} name`, sceneTarget(scene));
      for (const layer of scene.layers || []) scanForbidden(layer.name, `${scene.name}: ${layer.name || layer.id}`, sceneTarget(scene));
      for (const object of scene.objects || []) {
        scanForbidden(object.name, `${scene.name}: ${object.name || object.id} name`, sceneTarget(scene, object));
        scanForbidden(object.dialogue, `${scene.name}: ${object.name || object.id} dialogue`, sceneTarget(scene, object));
        scanForbidden(object.note, `${scene.name}: ${object.name || object.id} note`, sceneTarget(scene, object));
      }
      for (const node of scene.dialogue || []) {
        scanForbidden(node.speaker, `${scene.name}: dialogue speaker`, sceneTarget(scene));
        scanForbidden(node.line, `${scene.name}: dialogue line`, sceneTarget(scene));
      }
    }
    for (const line of project.script?.lines || []) scanForbidden(line.text, `Script line ${line.line_id}`, target);
    for (const model of project.assets?.characters || []) {
      scanForbidden(model.animationBible?.source, `${model.name}: animation source`, { tab: "characters", modelId: model.id });
      scanForbidden(model.animationBible?.qa, `${model.name}: animation QA`, { tab: "characters", modelId: model.id });
    }

    const reachable = reachableSceneIds(project);
    for (const scene of scenes) {
      if (!reachable.has(scene.id)) issues.push({ severity: "error", message: `${scene.name}: scene is not reachable from the active scene.`, target: sceneTarget(scene) });
    }
    if (!hasEndingRule(gameSpec)) issues.push({ severity: "error", message: "Game has no interaction rule that reaches after.endGame.", target });
    for (const itemId of requiredItemIds(gameSpec)) {
      if (!obtainableItemIds(gameSpec).has(itemId)) issues.push({ severity: "error", message: `${itemId} is required by a useItem rule but is never obtainable.`, target });
    }
    return issues;

    function scanForbidden(value, label, issueTarget) {
      if (!value) return;
      const text = String(value);
      if (forbidden.some((pattern) => pattern.test(text))) {
        issues.push({ severity: "error", message: `${label} contains blocker text.`, target: issueTarget });
      }
    }
  }

  function reachableSceneIds(project) {
    const edges = sceneEdges(project);
    const start = project.activeSceneId || project.scenes?.[0]?.id;
    const reachable = new Set();
    const queue = start ? [start] : [];
    while (queue.length) {
      const sceneId = queue.shift();
      if (reachable.has(sceneId)) continue;
      reachable.add(sceneId);
      for (const next of edges.get(sceneId) || []) if (!reachable.has(next)) queue.push(next);
    }
    return reachable;
  }

  function sceneEdges(project) {
    const edges = new Map((project.scenes || []).map((scene) => [scene.id, new Set()]));
    for (const scene of project.scenes || []) {
      for (const object of scene.objects || []) if (object.targetSceneId) edges.get(scene.id)?.add(object.targetSceneId);
      for (const rule of sceneRulesFor(project, scene)) if (rule.after?.sceneId) edges.get(scene.id)?.add(rule.after.sceneId);
    }
    return edges;
  }

  function sceneRulesFor(project, scene) {
    const gameSpec = project.game || {};
    const hotspotIds = new Set((scene.objects || []).map((object) => object.hotspotId || object.id));
    const rules = [];
    for (const hotspotId of hotspotIds) {
      const hotspot = gameSpec.hotspots?.[hotspotId];
      if (!hotspot) continue;
      for (const value of Object.values(hotspot)) collectRules(value, rules);
    }
    return rules;
  }

  function collectRules(value, out = []) {
    if (!value) return out;
    if (Array.isArray(value)) {
      for (const item of value) collectRules(item, out);
    } else if (typeof value === "object") {
      if (value.lineIds || value.cycleLineIds || value.after || value.effects) out.push(value);
      for (const item of Object.values(value)) if (item && typeof item === "object") collectRules(item, out);
    }
    return out;
  }

  function hasEndingRule(gameSpec) {
    return collectRules(gameSpec.hotspots || {}).some((rule) => rule.after?.endGame === true);
  }

  function obtainableItemIds(gameSpec) {
    const items = new Set(gameSpec.initialInventory || []);
    for (const rule of collectRules(gameSpec.hotspots || {})) for (const item of rule.effects?.addItems || []) items.add(item);
    return items;
  }

  function requiredItemIds(gameSpec) {
    const items = new Set();
    for (const hotspot of Object.values(gameSpec.hotspots || {})) {
      for (const itemId of Object.keys(hotspot.useItem || {})) items.add(itemId);
    }
    return items;
  }

  function sceneTarget(scene, object = null) {
    const target = { tab: "editor", sceneId: scene.id };
    if (object) target.objectId = object.id;
    return target;
  }

  function dialogueMatchWords(text) {
    const ignored = new Set(["anchor", "bubble", "dialogue", "hotspot", "interaction", "text", "the"]);
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((word) => word.length > 2 && !ignored.has(word));
  }

  function wrapText(text, maxWidth, measureText) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    for (const word of words) {
      const trial = line ? `${line} ${word}` : word;
      if (measureText(trial) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = trial;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  return {
    sceneById,
    activeScene,
    isDepthSortedLayer,
    baseline,
    sortedDepthRenderables,
    animationDurations,
    animationLengthMs,
    animationFrameIndex,
    currentFrame,
    objectAt,
    nearestWalkPoint,
    dialogueAnchorFor,
    bubbleBox,
    renderableRect,
    actorBodyRect,
    rectsOverlap,
    collectOcclusionWarnings,
    collectGameCompletionIssues,
    reachableSceneIds,
    createGameState,
    applyEffects,
    pickInteractionRule,
    activeObjectByHotspot,
    dialogueMatchWords,
    wrapText,
    clamp,
  };
});
