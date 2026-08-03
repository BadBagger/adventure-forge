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

  function currentFrame(model, stateName = "idle", elapsedMs = 0) {
    if (!model?.frames?.length) return null;
    const state = model.animations?.[stateName] || model.animations?.idle;
    if (!state?.frames?.length) return model.frames[0];
    const fps = Math.max(1, Number(state.fps) || 4);
    const index = state.loop === false
      ? Math.min(state.frames.length - 1, Math.floor((elapsedMs / 1000) * fps))
      : Math.floor((elapsedMs / 1000) * fps) % state.frames.length;
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
    currentFrame,
    objectAt,
    nearestWalkPoint,
    dialogueAnchorFor,
    bubbleBox,
    renderableRect,
    actorBodyRect,
    rectsOverlap,
    collectOcclusionWarnings,
    createGameState,
    applyEffects,
    pickInteractionRule,
    activeObjectByHotspot,
    dialogueMatchWords,
    wrapText,
    clamp,
  };
});
