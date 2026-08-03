const fs = require("fs");

function validateProject(project) {
  const issues = [];
  const scenes = Array.isArray(project?.scenes) ? project.scenes : [];
  const models = Array.isArray(project?.assets?.characters) ? project.assets.characters : [];
  const scriptLines = Array.isArray(project?.script?.lines) ? project.script.lines : [];
  const gameSpec = project?.game || {};
  const sceneIds = new Set();
  const modelIds = new Set();
  const lineIds = new Set();
  const itemIds = new Set(Object.keys(gameSpec.items || {}));

  if (!project || typeof project !== "object") error("Project must be a JSON object.", "$");
  if (!Number.isInteger(project?.version) || project.version < 1) error("Project version must be a positive integer.", "version");
  if (!nonEmpty(project?.name)) error("Project name is required.", "name");
  if (!nonEmpty(project?.activeSceneId)) error("activeSceneId is required.", "activeSceneId");
  if (!scenes.length) error("Project must contain at least one scene.", "scenes");

  for (const scene of scenes) {
    if (!nonEmpty(scene?.id)) error("Scene id is required.", "scenes[]");
    else if (sceneIds.has(scene.id)) error(`Duplicate scene id ${scene.id}.`, `scenes.${scene.id}`);
    else sceneIds.add(scene.id);
    if (!nonEmpty(scene?.name)) error(`${scene?.id || "Scene"} name is required.`, `scenes.${scene?.id || "unknown"}.name`);
    if (!positive(scene?.width) || !positive(scene?.height)) error(`${scene?.id || "Scene"} width and height must be positive.`, `scenes.${scene?.id || "unknown"}`);
    validateCollection(scene?.layers, "layer", scene?.id, ["background", "midground", "foreground", "prop", "occlusion"]);
    validateCollection(scene?.objects, "object", scene?.id, ["character", "hitbox", "dialogue", "walkable", "prop"]);
  }

  if (project?.activeSceneId && !sceneIds.has(project.activeSceneId)) error(`activeSceneId ${project.activeSceneId} does not match any scene.`, "activeSceneId");

  for (const model of models) {
    if (!nonEmpty(model?.id)) error("Character model id is required.", "assets.characters[]");
    else if (modelIds.has(model.id)) error(`Duplicate character model id ${model.id}.`, `assets.characters.${model.id}`);
    else modelIds.add(model.id);
    if (!nonEmpty(model?.name)) error(`${model?.id || "Character model"} name is required.`, `assets.characters.${model?.id || "unknown"}.name`);
    if (!Array.isArray(model?.frames)) error(`${model?.id || "Character model"} frames must be an array.`, `assets.characters.${model?.id || "unknown"}.frames`);
    validateAnimations(model);
  }

  for (const scene of scenes) {
    for (const object of scene.objects || []) {
      if (object.kind === "character" && object.modelId && !modelIds.has(object.modelId)) {
        error(`${scene.id}.${object.id} references missing model ${object.modelId}.`, `scenes.${scene.id}.objects.${object.id}.modelId`);
      }
      if (object.targetSceneId && !sceneIds.has(object.targetSceneId)) {
        error(`${scene.id}.${object.id} exits to missing scene ${object.targetSceneId}.`, `scenes.${scene.id}.objects.${object.id}.targetSceneId`);
      }
    }
  }

  for (const line of scriptLines) {
    if (!nonEmpty(line?.line_id)) error("Script line_id is required.", "script.lines[]");
    else if (lineIds.has(line.line_id)) error(`Duplicate script line id ${line.line_id}.`, `script.lines.${line.line_id}`);
    else lineIds.add(line.line_id);
    if (typeof line?.text !== "string") error(`${line?.line_id || "Script line"} text must be a string.`, `script.lines.${line?.line_id || "unknown"}.text`);
  }

  for (const itemId of gameSpec.initialInventory || []) {
    if (!itemIds.has(itemId)) error(`Initial inventory references undefined item ${itemId}.`, "game.initialInventory");
  }
  for (const lineId of gameSpec.startLineIds || []) validateLineRef(lineId, "game.startLineIds");
  for (const [fallbackName, lineList] of Object.entries(gameSpec.fallbacks || {})) {
    for (const lineId of lineList || []) validateLineRef(lineId, `game.fallbacks.${fallbackName}`);
  }
  validateHotspots(gameSpec.hotspots || {});
  validateConversations(gameSpec.conversations || {});

  return issues;

  function validateCollection(items, label, sceneId, allowedKinds) {
    if (!Array.isArray(items)) {
      error(`${sceneId || "Scene"} ${label}s must be an array.`, `scenes.${sceneId || "unknown"}.${label}s`);
      return;
    }
    const ids = new Set();
    for (const item of items) {
      const itemId = item?.id;
      if (!nonEmpty(itemId)) error(`${sceneId || "Scene"} ${label} id is required.`, `scenes.${sceneId || "unknown"}.${label}s[]`);
      else if (ids.has(itemId)) error(`${sceneId}.${label} duplicate id ${itemId}.`, `scenes.${sceneId}.${label}s.${itemId}`);
      else ids.add(itemId);
      const typeValue = label === "layer" ? item?.type : item?.kind;
      if (!allowedKinds.includes(typeValue)) error(`${sceneId}.${itemId || label} has invalid ${label === "layer" ? "type" : "kind"} ${typeValue}.`, `scenes.${sceneId}.${label}s.${itemId || "unknown"}`);
      const needsRect = label === "object" || !["background", "midground"].includes(typeValue);
      if (needsRect && (!finite(item?.x) || !finite(item?.y) || !finite(item?.w) || !finite(item?.h))) error(`${sceneId}.${itemId || label} must have numeric x, y, w, h.`, `scenes.${sceneId}.${label}s.${itemId || "unknown"}`);
      if (needsRect && (Number(item?.w) < 0 || Number(item?.h) < 0)) error(`${sceneId}.${itemId || label} width and height cannot be negative.`, `scenes.${sceneId}.${label}s.${itemId || "unknown"}`);
      if (item?.baseline !== undefined && !finite(item.baseline)) error(`${sceneId}.${itemId || label} baseline must be numeric when present.`, `scenes.${sceneId}.${label}s.${itemId || "unknown"}.baseline`);
    }
  }

  function validateAnimations(model) {
    const animations = model?.animations || {};
    if (!animations || typeof animations !== "object" || Array.isArray(animations)) {
      error(`${model?.id || "Character model"} animations must be an object.`, `assets.characters.${model?.id || "unknown"}.animations`);
      return;
    }
    for (const [stateName, animation] of Object.entries(animations)) {
      const target = `assets.characters.${model.id}.animations.${stateName}`;
      if (!Array.isArray(animation?.frames) || !animation.frames.length) error(`${model.id}.${stateName} must list at least one frame.`, target);
      if (!positive(animation?.fps)) error(`${model.id}.${stateName} fps must be positive.`, `${target}.fps`);
      if (typeof animation?.loop !== "boolean") error(`${model.id}.${stateName} loop must be boolean.`, `${target}.loop`);
      for (const frameIndex of animation?.frames || []) {
        if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= (model.frames || []).length) {
          error(`${model.id}.${stateName} references missing frame index ${frameIndex}.`, `${target}.frames`);
        }
      }
      if (animation?.holds !== undefined) {
        if (!Array.isArray(animation.holds) || animation.holds.length !== (animation.frames || []).length) {
          error(`${model.id}.${stateName} holds must match frames length.`, `${target}.holds`);
        } else {
          for (const hold of animation.holds) if (!positive(hold)) error(`${model.id}.${stateName} holds must be positive.`, `${target}.holds`);
        }
      }
    }
  }

  function validateHotspots(hotspots) {
    for (const [hotspotId, hotspot] of Object.entries(hotspots || {})) {
      validateRules(hotspot.inspect, `game.hotspots.${hotspotId}.inspect`);
      validateRules(hotspot.use, `game.hotspots.${hotspotId}.use`);
      for (const [itemId, rules] of Object.entries(hotspot.useItem || {})) {
        if (!itemIds.has(itemId)) error(`Hotspot ${hotspotId} has useItem rule for undefined item ${itemId}.`, `game.hotspots.${hotspotId}.useItem.${itemId}`);
        validateRules(rules, `game.hotspots.${hotspotId}.useItem.${itemId}`);
      }
    }
  }

  function validateConversations(conversations) {
    for (const [conversationId, conversation] of Object.entries(conversations || {})) {
      for (const [nodeId, node] of Object.entries(conversation.nodes || {})) {
        for (const lineId of node.lineIds || []) validateLineRef(lineId, `game.conversations.${conversationId}.${nodeId}.lineIds`);
        for (const choice of node.choices || []) {
          if (choice.nextNodeId && !conversation.nodes?.[choice.nextNodeId]) {
            error(`Conversation ${conversationId}.${nodeId} choice points to missing node ${choice.nextNodeId}.`, `game.conversations.${conversationId}.${nodeId}.choices`);
          }
        }
      }
    }
  }

  function validateRules(rules, target) {
    for (const rule of normalizeRuleList(rules)) {
      for (const lineId of rule.lineIds || []) validateLineRef(lineId, `${target}.lineIds`);
      for (const lineId of rule.cycleLineIds || []) validateLineRef(lineId, `${target}.cycleLineIds`);
      if (rule.after?.sceneId && !sceneIds.has(rule.after.sceneId)) error(`${target} transitions to missing scene ${rule.after.sceneId}.`, `${target}.after.sceneId`);
      for (const lineId of rule.after?.lineIds || []) validateLineRef(lineId, `${target}.after.lineIds`);
      for (const itemId of rule.effects?.addItems || []) if (!itemIds.has(itemId)) error(`${target} adds undefined item ${itemId}.`, `${target}.effects.addItems`);
      for (const itemId of rule.effects?.removeItems || []) if (!itemIds.has(itemId)) error(`${target} removes undefined item ${itemId}.`, `${target}.effects.removeItems`);
    }
  }

  function validateLineRef(lineId, target) {
    if (!lineIds.has(lineId)) error(`${target} references missing script line ${lineId}.`, target);
  }

  function error(message, target) {
    issues.push({ severity: "error", message, target });
  }
}

function normalizeRuleList(rules) {
  if (!rules) return [];
  return Array.isArray(rules) ? rules : [rules];
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function positive(value) {
  return finite(value) && Number(value) > 0;
}

function main() {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error("usage: node tools/validate-project.cjs project.json [...]");
    process.exit(2);
  }
  let failures = 0;
  for (const file of files) {
    const project = JSON.parse(fs.readFileSync(file, "utf8"));
    const issues = validateProject(project);
    if (issues.length) {
      failures += issues.length;
      console.error(`${file}: ${issues.length} validation issue(s)`);
      for (const issue of issues) console.error(`  ${issue.severity}: ${issue.message} (${issue.target})`);
    } else {
      console.log(`${file}: validation passed`);
    }
  }
  process.exit(failures ? 1 : 0);
}

if (require.main === module) main();

module.exports = { validateProject };
