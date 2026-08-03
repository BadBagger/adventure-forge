const stage = document.getElementById("stage");
const ctx = stage.getContext("2d");
const previewCanvas = document.getElementById("previewCanvas");
const pctx = previewCanvas.getContext("2d");
const framePreview = document.getElementById("framePreview");
const fctx = framePreview.getContext("2d");

const colors = {
  hitbox: "#ef6a75",
  dialogue: "#f1b45c",
  character: "#6fa8ff",
  walkable: "#57c7a2",
  selected: "#ffffff",
};
const animationStates = ["idle", "walk", "talk", "waiting", "failed"];
const protectedAnimationStates = new Set(["idle", "walk", "talk"]);

const sampleProject = {
  version: 1,
  name: "AdventureForge Pilot",
  slug: "adventureforge-pilot",
  activeSceneId: "forest-clearing",
  editor: {
    gridVisible: true,
    snapToGrid: false,
    gridSize: 16,
    zoom: "fit",
    labelsVisible: true,
    hitboxesVisible: true,
    baselinesVisible: false,
  },
  export: {
    target: "standalone-html",
    debug: "off",
  },
  assets: {
    characters: [
      {
        id: "old-woman-model",
        name: "Old Woman",
        role: "npc",
        status: "provisional",
        locked: false,
        registration: { canvas: { width: 72, height: 148 }, anchor: [36, 148], baseline: 148 },
        frames: [],
      },
    ],
  },
  script: {
    sourceName: "sample-script.txt",
    text: "@scene Forest Clearing\n@character Old Woman 438 270\nOld Woman: If you brought rope, the well becomes a door. If not, it stays a mouth.\n- Ask about the rope => The last traveler tied it to the north gate.\n- Inspect the well => Cold air rises from below.\n@hitbox Old well interaction 622 278 132 142\n@walkable Main path 80 388 780 82",
    lastSyncedAt: null,
  },
  scenes: [
    {
      id: "forest-clearing",
      name: "Forest Clearing",
      width: 960,
      height: 540,
      background: "#1b2a27",
      layers: [
        { id: "sky", name: "Dusk sky", type: "background", depth: 0, visible: true, color: "#26374a" },
        { id: "trees", name: "Tree wall", type: "midground", depth: 20, visible: true, color: "#244236" },
        { id: "well", name: "Old well", type: "prop", depth: 45, baseline: 382, visible: true, color: "#756a60" },
        { id: "fog", name: "Foreground mist", type: "foreground", depth: 80, baseline: 426, visible: true, color: "#cad8d3" },
      ],
      objects: [
        {
          id: "well-hitbox",
          kind: "hitbox",
          name: "Old well interaction",
          x: 622,
          y: 278,
          w: 132,
          h: 142,
          locked: false,
          target: "well",
          action: "Inspect the well",
          dialogue: "The stones are damp. Something below moves when you lean close.",
          targetSceneId: "",
        },
        {
          id: "old-woman",
          kind: "character",
          name: "Old Woman",
          x: 438,
          y: 270,
          w: 72,
          h: 148,
          locked: false,
          dialogue: "Mind the well. It remembers everyone who asks for shortcuts.",
          animationBible: {
            idle: "Bent posture, lantern hand barely sways.",
            walk: "Slow two-step shuffle with cloak lag.",
            talk: "Lantern rises on important words.",
            waiting: "Turns toward the player and offers the lantern.",
            failed: "Lantern dims and shoulders fold inward.",
          },
        },
        {
          id: "well-dialogue",
          kind: "dialogue",
          name: "Well text anchor",
          x: 688,
          y: 236,
          w: 36,
          h: 28,
          locked: false,
          text: "Lower dialogue bubble here.",
        },
        {
          id: "main-path",
          kind: "walkable",
          name: "Main path",
          x: 80,
          y: 388,
          w: 780,
          h: 82,
          locked: false,
          note: "Player can walk along this band.",
        },
      ],
      dialogue: [
        {
          id: "old-woman-start",
          speaker: "Old Woman",
          line: "If you brought rope, the well becomes a door. If not, it stays a mouth.",
          choices: [
            { label: "Ask about the rope", response: "The last traveler tied it to the north gate." },
            { label: "Inspect the well", response: "Cold air rises from below." },
          ],
        },
      ],
      flags: ["has_rope", "well_opened"],
    },
    {
      id: "north-gate",
      name: "North Gate",
      width: 960,
      height: 540,
      background: "#20252f",
      layers: [
        { id: "gate-bg", name: "Gate dusk", type: "background", depth: 0, visible: true, color: "#28303c" },
      ],
      objects: [
        {
          id: "gate-path",
          kind: "walkable",
          name: "Gate path",
          x: 90,
          y: 402,
          w: 780,
          h: 70,
          locked: false,
          note: "Return path near the old gate.",
        },
      ],
      dialogue: [],
      flags: [],
    },
  ],
};

let project = structuredClone(sampleProject);
let activeTool = "select";
let selectedId = null;
let drag = null;
let patchCandidate = null;
let selectedAssetId = "old-woman-model";
let onionSkinEnabled = false;
let selectedDialogueId = "old-woman-start";
let selectedAnimationState = "idle";
let selectedAnimationHitboxId = null;
let statePlaybackTimer = null;
let statePlaybackIndex = 0;
let pendingScriptSyncPlan = null;
let scriptSyncFilter = "all";
let previewSceneId = null;
let previewBubble = null;
let previewLoopId = null;
let sceneSizeTimer = null;
const undoStack = [];
const redoStack = [];
const historyLimit = 50;
const autosaveKey = "adventureforge.localProject.v1";
let autosaveTimer = null;
let autosaveLoaded = false;

const $ = (id) => document.getElementById(id);
const activeScene = () => project.scenes.find((scene) => scene.id === project.activeSceneId) || project.scenes[0];

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function setHint(text) {
  $("stageHint").textContent = text;
}

function renderAll() {
  normalizeProject();
  $("projectName").value = project.name;
  $("projectSlug").value = project.slug || slug(project.name);
  $("exportTarget").value = project.export?.target || "standalone-html";
  $("exportDebug").value = project.export?.debug || "off";
  $("scriptText").value = project.script?.text || "";
  renderEditorSettings();
  const scene = activeScene();
  if (!scene) return;
  $("sceneName").value = scene.name;
  $("sceneMeta").textContent = `${scene.objects.length} objects, ${scene.layers.length} layers, ${scene.dialogue.length} dialogue nodes`;
  renderSceneList();
  renderSceneSettings(scene);
  renderLayers();
  renderObjectOutliner();
  renderAssetLists();
  renderDialogueGraph();
  renderInspector();
  drawStage();
  validate(false);
  renderQaSummary();
  renderHandoffSummary();
  renderHistoryControls();
  scheduleAutosave();
}

function scheduleAutosave() {
  if (autosaveTimer) window.clearTimeout(autosaveTimer);
  autosaveTimer = window.setTimeout(() => saveLocalProject("Autosaved"), 250);
}

function saveLocalProject(reason = "Saved locally") {
  try {
    if (autosaveTimer) window.clearTimeout(autosaveTimer);
    autosaveTimer = null;
    const payload = {
      savedAt: new Date().toISOString(),
      reason,
      project: serializableProject(),
    };
    localStorage.setItem(autosaveKey, JSON.stringify(payload));
    renderAutosaveStatus(payload);
    return true;
  } catch (error) {
    renderAutosaveStatus(null, `Local save failed: ${error.message}`);
    return false;
  }
}

function readLocalProject() {
  try {
    const raw = localStorage.getItem(autosaveKey);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    renderAutosaveStatus(null, `Local restore failed: ${error.message}`);
    return null;
  }
}

async function restoreLocalProject(showMessage = true) {
  const payload = readLocalProject();
  if (!payload?.project) {
    if (showMessage) renderAutosaveStatus(null, "No local autosave found.");
    return false;
  }
  if (showMessage) commitHistory("Restore local autosave");
  project = structuredClone(payload.project);
  selectedId = null;
  selectedDialogueId = null;
  normalizeProject();
  await hydrateAssetImages();
  autosaveLoaded = true;
  renderAll();
  if (showMessage) setHint("Restored local autosave.");
  renderAutosaveStatus(payload, showMessage ? "Restored local autosave." : null);
  return true;
}

function clearLocalProject() {
  try {
    if (autosaveTimer) window.clearTimeout(autosaveTimer);
    autosaveTimer = null;
    localStorage.removeItem(autosaveKey);
    renderAutosaveStatus(null, "Local autosave cleared.");
  } catch (error) {
    renderAutosaveStatus(null, `Clear failed: ${error.message}`);
  }
}

function renderAutosaveStatus(payload = readLocalProject(), message = null) {
  const status = $("autosaveStatus");
  if (!status) return;
  if (message) {
    status.textContent = message;
    return;
  }
  if (!payload?.savedAt) {
    status.textContent = "No browser save yet.";
    return;
  }
  const saved = new Date(payload.savedAt);
  status.textContent = `${payload.reason || "Saved"} ${saved.toLocaleString()}.`;
}

function historySnapshot(label = "Edit") {
  return {
    label,
    project: serializableProject(),
    selectedId,
    selectedAssetId,
    selectedDialogueId,
    activeTool,
  };
}

function commitHistory(label) {
  undoStack.push(historySnapshot(label));
  if (undoStack.length > historyLimit) undoStack.shift();
  redoStack.length = 0;
  renderHistoryControls();
}

async function restoreHistory(snapshot) {
  project = structuredClone(snapshot.project);
  selectedId = snapshot.selectedId || null;
  selectedAssetId = snapshot.selectedAssetId || selectedAssetId;
  selectedDialogueId = snapshot.selectedDialogueId || null;
  activeTool = snapshot.activeTool || "select";
  normalizeProject();
  await hydrateAssetImages();
  document.querySelectorAll(".tool").forEach((button) => button.classList.toggle("active", button.dataset.tool === activeTool));
  renderAll();
  setHint(`Restored: ${snapshot.label}.`);
}

function renderHistoryControls() {
  if ($("undoEdit")) $("undoEdit").disabled = !undoStack.length;
  if ($("redoEdit")) $("redoEdit").disabled = !redoStack.length;
}

function renderEditorSettings() {
  if ($("toggleGrid")) $("toggleGrid").classList.toggle("active", project.editor?.gridVisible !== false);
  if ($("toggleSnap")) $("toggleSnap").classList.toggle("active", project.editor?.snapToGrid === true);
  if ($("toggleLabels")) $("toggleLabels").classList.toggle("active", project.editor?.labelsVisible !== false);
  if ($("toggleHitboxes")) $("toggleHitboxes").classList.toggle("active", project.editor?.hitboxesVisible !== false);
  if ($("toggleBaselines")) $("toggleBaselines").classList.toggle("active", project.editor?.baselinesVisible === true);
  if ($("gridSize")) $("gridSize").value = project.editor?.gridSize || 16;
  if ($("zoomFit")) $("zoomFit").classList.toggle("active", (project.editor?.zoom || "fit") === "fit");
  if ($("zoom100")) $("zoom100").classList.toggle("active", project.editor?.zoom === "100");
  if ($("zoom200")) $("zoom200").classList.toggle("active", project.editor?.zoom === "200");
  applyStageZoom();
}

function applyStageZoom() {
  const zoom = project.editor?.zoom || "fit";
  if (zoom === "fit") {
    stage.style.width = "100%";
    stage.style.height = "auto";
    return;
  }
  const scale = zoom === "200" ? 2 : 1;
  stage.style.width = `${stage.width * scale}px`;
  stage.style.height = `${stage.height * scale}px`;
}

async function undoEdit() {
  if (!undoStack.length) return;
  const snapshot = undoStack.pop();
  redoStack.push(historySnapshot(snapshot.label));
  await restoreHistory(snapshot);
}

async function redoEdit() {
  if (!redoStack.length) return;
  const snapshot = redoStack.pop();
  undoStack.push(historySnapshot(snapshot.label));
  await restoreHistory(snapshot);
}

function normalizeProject() {
  project.slug ||= slug(project.name || "AdventureForge Project");
  project.editor ||= {};
  project.editor.gridVisible = project.editor.gridVisible !== false;
  project.editor.snapToGrid = project.editor.snapToGrid === true;
  project.editor.labelsVisible = project.editor.labelsVisible !== false;
  project.editor.hitboxesVisible = project.editor.hitboxesVisible !== false;
  project.editor.baselinesVisible = project.editor.baselinesVisible === true;
  project.editor.gridSize = clamp(Number(project.editor.gridSize) || 16, 4, 96);
  if (!["fit", "100", "200"].includes(project.editor.zoom)) project.editor.zoom = "fit";
  project.export ||= {};
  if (!["standalone-html", "phaser-scaffold"].includes(project.export.target)) project.export.target = "standalone-html";
  if (!["off", "qa"].includes(project.export.debug)) project.export.debug = "off";
  project.assets ||= { characters: [] };
  project.assets.characters ||= [];
  project.assets.characters.forEach((model) => {
    model.status ||= "provisional";
    model.locked ||= false;
    model.registration ||= {};
    model.registration.canvas ||= model.frames?.[0] ? { width: model.frames[0].width, height: model.frames[0].height } : null;
    model.registration.anchor ||= model.registration.canvas ? [Math.round(model.registration.canvas.width / 2), model.registration.canvas.height] : null;
    model.registration.baseline ||= model.registration.canvas?.height || null;
    model.animations ||= defaultAnimations(model.frames?.length || 0);
    model.timelineHitboxes ||= [];
    for (const state of animationStateNames(model)) ensureAnimationState(model, state);
    repairTimelineHitboxes(model);
  });
  project.script ||= { sourceName: "script.txt", text: "", lastSyncedAt: null };
  project.scenes.forEach((scene) => {
    scene.width = clamp(Number(scene.width) || 960, 320, 3840);
    scene.height = clamp(Number(scene.height) || 540, 180, 2160);
    scene.background ||= "#222831";
    scene.layers ||= [];
    scene.objects ||= [];
    scene.dialogue ||= [];
    scene.flags ||= [];
    scene.locked ||= false;
    scene.layers.forEach((layer) => {
      layer.visible = layer.visible !== false;
      layer.locked ||= false;
      if (isDepthSortedLayer(layer) && !Number.isFinite(Number(layer.baseline))) layer.baseline = defaultLayerBaseline(layer, scene);
      clampLayerToScene(layer, scene);
    });
    scene.objects.forEach((object) => {
      object.locked ||= false;
      clampObjectToScene(object, scene);
      if (object.kind === "character" && !object.animationState) object.animationState = "idle";
      if (object.kind !== "walkable" && !Number.isFinite(Number(object.baseline))) object.baseline = object.y + object.h;
    });
  });
}

function renderSceneList() {
  const wrap = $("sceneList");
  wrap.innerHTML = "";
  project.scenes.forEach((scene) => {
    const button = document.createElement("button");
    button.textContent = scene.name;
    button.className = scene.id === project.activeSceneId ? "active" : "";
    button.onclick = () => {
      project.activeSceneId = scene.id;
      selectedId = null;
      renderAll();
    };
    wrap.appendChild(button);
  });
}

function renderSceneSettings(scene = activeScene()) {
  $("sceneWidth").value = scene.width;
  $("sceneHeight").value = scene.height;
  $("sceneBackground").value = normalizeColor(scene.background);
  $("lockScene").textContent = scene.locked ? "Unlock Scene" : "Lock Scene";
  $("deleteScene").disabled = project.scenes.length <= 1 || scene.locked;
  $("duplicateScene").disabled = false;
  $("sceneName").disabled = scene.locked;
  $("sceneWidth").disabled = scene.locked;
  $("sceneHeight").disabled = scene.locked;
  $("sceneBackground").disabled = scene.locked;
}

function duplicateScene(source) {
  const scene = JSON.parse(JSON.stringify(source, (key, value) => (key === "image" ? undefined : value)));
  scene.id = uid("scene");
  scene.name = nextSceneName(`${source.name} Copy`);
  scene.locked = false;
  scene.layers = (scene.layers || []).map((layer) => ({ ...layer, id: uid("layer"), locked: false }));
  scene.objects = (scene.objects || []).map((object) => ({ ...object, id: uid(object.kind || "object"), locked: false }));
  scene.dialogue = (scene.dialogue || []).map((node) => ({ ...node, id: uid("dialogue") }));
  return scene;
}

function nextSceneName(base) {
  const names = new Set(project.scenes.map((scene) => scene.name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  let index = 2;
  while (names.has(`${base} ${index}`.toLowerCase())) index += 1;
  return `${base} ${index}`;
}

function updateSceneSize() {
  if (sceneSizeTimer) {
    window.clearTimeout(sceneSizeTimer);
    sceneSizeTimer = null;
  }
  const scene = activeScene();
  if (scene.locked) return;
  const width = clamp(Number($("sceneWidth").value) || scene.width, 320, 3840);
  const height = clamp(Number($("sceneHeight").value) || scene.height, 180, 2160);
  if (width === scene.width && height === scene.height) {
    renderSceneSettings(scene);
    return;
  }
  commitHistory(`Resize scene ${scene.name}`);
  scene.width = width;
  scene.height = height;
  clampSceneContents(scene);
  renderAll();
}

function scheduleSceneSizeUpdate() {
  if (sceneSizeTimer) window.clearTimeout(sceneSizeTimer);
  sceneSizeTimer = window.setTimeout(updateSceneSize, 250);
}

function clampSceneContents(scene) {
  scene.layers.forEach((layer) => clampLayerToScene(layer, scene));
  scene.objects.forEach((object) => clampObjectToScene(object, scene));
}

function clampLayerToScene(layer, scene) {
  if (Number.isFinite(Number(layer.x))) layer.x = clamp(Number(layer.x), 0, Math.max(0, scene.width - 1));
  if (Number.isFinite(Number(layer.y))) layer.y = clamp(Number(layer.y), 0, Math.max(0, scene.height - 1));
  if (Number.isFinite(Number(layer.w))) layer.w = clamp(Number(layer.w), 1, Math.max(1, scene.width - Number(layer.x || 0)));
  if (Number.isFinite(Number(layer.h))) layer.h = clamp(Number(layer.h), 1, Math.max(1, scene.height - Number(layer.y || 0)));
  if (Number.isFinite(Number(layer.baseline))) layer.baseline = clamp(Number(layer.baseline), 0, scene.height);
}

function clampObjectToScene(object, scene) {
  object.w = clamp(Number(object.w) || 1, 1, scene.width);
  object.h = clamp(Number(object.h) || 1, 1, scene.height);
  object.x = clamp(Number(object.x) || 0, 0, scene.width - object.w);
  object.y = clamp(Number(object.y) || 0, 0, scene.height - object.h);
  if (object.kind !== "walkable" && Number.isFinite(Number(object.baseline))) object.baseline = clamp(Number(object.baseline), 0, scene.height);
}

function normalizeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value || "") ? value : "#222831";
}

function renderLayers() {
  const scene = activeScene();
  const wrap = $("layerList");
  wrap.innerHTML = "";
  [...scene.layers].sort((a, b) => a.depth - b.depth).forEach((layer) => {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div><strong>${escapeHtml(layer.name)}</strong><br><small>${layer.type} / depth ${layer.depth}${isDepthSortedLayer(layer) ? ` / baseline ${Math.round(renderableBaseline(layer, scene))}` : ""}${layer.locked ? " / locked" : ""}${layer.dataUrl ? " / image" : ""}</small></div>
      <input class="text-input layer-baseline" type="number" value="${Math.round(renderableBaseline(layer, scene))}" title="Layer draw baseline" ${isDepthSortedLayer(layer) ? "" : "disabled"} />
      <button title="Toggle visibility">${layer.visible ? "Hide" : "Show"}</button>
      <button title="Lock layer">${layer.locked ? "Unlock" : "Lock"}</button>
      <button title="Remove layer">Remove</button>
    `;
    row.children[1].disabled = layer.locked || !isDepthSortedLayer(layer);
    row.children[1].oninput = () => {
      if (layer.locked || !isDepthSortedLayer(layer)) return;
      commitHistory(`Edit ${layer.name} baseline`);
      layer.baseline = Number(row.children[1].value);
      drawStage();
      renderHandoffSummary();
    };
    row.children[2].onclick = () => {
      commitHistory(`${layer.visible ? "Hide" : "Show"} ${layer.name}`);
      layer.visible = !layer.visible;
      renderAll();
    };
    row.children[3].onclick = () => {
      commitHistory(`${layer.locked ? "Unlock" : "Lock"} ${layer.name}`);
      layer.locked = !layer.locked;
      renderAll();
    };
    row.children[4].onclick = () => {
      if (layer.locked) {
        setHint(`${layer.name} is locked. Unlock it before removing.`);
        return;
      }
      commitHistory(`Remove layer ${layer.name}`);
      scene.layers = scene.layers.filter((candidate) => candidate.id !== layer.id);
      renderAll();
    };
    wrap.appendChild(row);
  });
}

function renderObjectOutliner() {
  const scene = activeScene();
  const wrap = $("objectOutliner");
  if (!wrap) return;
  wrap.innerHTML = "";
  if (!scene.objects.length) {
    wrap.innerHTML = `<p class="meta">No scene objects yet.</p>`;
    return;
  }
  const qaCounts = objectQaCounts(scene);
  const orderedObjects = [
    ...scene.objects.filter((object) => object.kind === "walkable"),
    ...sortedDepthRenderables(scene).filter((entry) => entry.kind === "object").map((entry) => entry.item),
  ];
  orderedObjects.forEach((object) => {
    const row = document.createElement("div");
    row.className = `object-row ${object.id === selectedId ? "active" : ""}`;
    const issueCount = qaCounts.get(object.id) || 0;
    const targetScene = project.scenes.find((candidate) => candidate.id === object.targetSceneId);
    row.innerHTML = `
      <button class="object-select" title="Select object">
        <strong>${escapeHtml(object.name)}</strong>
        <span>${escapeHtml(object.kind)} / ${Math.round(object.x)},${Math.round(object.y)} / ${Math.round(object.w)}x${Math.round(object.h)}${object.kind !== "walkable" ? ` / base ${Math.round(renderableBaseline(object, scene))}` : ""}${targetScene ? ` / exit ${escapeHtml(targetScene.name)}` : ""}</span>
      </button>
      <span class="object-badge ${issueCount ? "has-issues" : ""}" title="QA issues">${issueCount || "OK"}</span>
      <button class="object-lock" title="Lock object">${object.locked ? "Unlock" : "Lock"}</button>
    `;
    row.querySelector(".object-select").onclick = () => {
      selectedId = object.id;
      renderAll();
      setHint(`Selected ${object.name}.`);
    };
    row.querySelector(".object-lock").onclick = () => {
      commitHistory(`${object.locked ? "Unlock" : "Lock"} ${object.name}`);
      object.locked = !object.locked;
      selectedId = object.id;
      renderAll();
    };
    wrap.appendChild(row);
  });
}

function objectQaCounts(scene) {
  const counts = new Map();
  collectQaIssues().forEach((issue) => {
    if (issue.target?.sceneId !== scene.id || !issue.target.objectId) return;
    counts.set(issue.target.objectId, (counts.get(issue.target.objectId) || 0) + 1);
  });
  return counts;
}

function renderAssetLists() {
  const sidebar = $("characterAssetList");
  const library = $("modelLibrary");
  sidebar.innerHTML = "";
  library.innerHTML = "";
  const characters = project.assets.characters;
  if (!characters.length) {
    sidebar.innerHTML = `<p class="meta">No models imported yet.</p>`;
    library.innerHTML = `<p class="meta">Import transparent PNG animation frames to create a model.</p>`;
    drawFramePreview(null);
    syncModelControls(null);
    renderFrameList(null);
    return;
  }
  if (!characters.some((model) => model.id === selectedAssetId)) selectedAssetId = characters[0].id;

  characters.forEach((model) => {
    const frame = model.frames[0];
    const chip = document.createElement("button");
    chip.className = `asset-chip ${model.id === selectedAssetId ? "active" : ""}`;
    chip.dataset.modelId = model.id;
    chip.innerHTML = `${frame ? `<img alt="" src="${frame.dataUrl}" />` : `<span></span>`}<span>${escapeHtml(model.name)}<br><small>${model.frames.length} frame(s)</small></span>`;
    chip.onclick = () => {
      selectedAssetId = model.id;
      selectedAnimationHitboxId = null;
      renderAll();
    };
    sidebar.appendChild(chip);

    const card = document.createElement("div");
    card.className = "model-card";
    card.dataset.modelId = model.id;
    card.innerHTML = `
      ${frame ? `<img alt="" src="${frame.dataUrl}" />` : `<div></div>`}
      <div>
        <h3>${escapeHtml(model.name)}</h3>
        <p class="meta">${escapeHtml(model.role || "character")} / ${model.frames.length} transparent PNG frame(s)</p>
        <p class="meta">Canvas ${model.registration?.canvas?.width || "-"}x${model.registration?.canvas?.height || "-"} / anchor ${(model.registration?.anchor || ["-", "-"]).join(", ")}</p>
        <span class="status-pill ${escapeAttr(model.status)}">${model.locked ? "locked" : "editable"} / ${escapeHtml(model.status)}</span>
        <div class="button-row">
          <button data-place="${escapeAttr(model.id)}">Place in Scene</button>
          <button data-preview="${escapeAttr(model.id)}">Preview Frames</button>
        </div>
      </div>
    `;
    card.querySelector("[data-place]").onclick = () => placeModelInScene(model);
    card.querySelector("[data-preview]").onclick = () => {
      selectedAssetId = model.id;
      drawFramePreview(model);
      renderAssetLists();
    };
    library.appendChild(card);
  });

  drawFramePreview(characters.find((model) => model.id === selectedAssetId) || characters[0]);
}

function renderFrameList(model) {
  const wrap = $("frameList");
  if (!wrap) return;
  wrap.innerHTML = "";
  if (!model) {
    wrap.innerHTML = `<p class="meta">No model selected.</p>`;
    return;
  }
  if (!model.frames.length) {
    wrap.innerHTML = `<p class="meta">No frames imported for this model.</p>`;
    return;
  }
  model.frames.forEach((frame, index) => {
    const row = document.createElement("div");
    row.className = "frame-row";
    row.innerHTML = `
      ${frame.dataUrl ? `<img alt="" src="${frame.dataUrl}" />` : `<span></span>`}
      <div>
        <strong>${index}: ${escapeHtml(frame.name)}</strong>
        <small>${frame.width}x${frame.height}${frame.alphaBounds ? ` / alpha ${frame.alphaBounds.empty ? "empty" : `${frame.alphaBounds.w}x${frame.alphaBounds.h} @ ${frame.alphaBounds.x},${frame.alphaBounds.y}`}` : " / alpha pending"}</small>
      </div>
      <button title="Remove frame" ${model.locked ? "disabled" : ""}>Remove</button>
    `;
    row.querySelector("button").onclick = () => removeModelFrame(model, index);
    wrap.appendChild(row);
  });
}

function drawFramePreview(model) {
  fctx.clearRect(0, 0, framePreview.width, framePreview.height);
  fctx.fillStyle = "#0f1319";
  fctx.fillRect(0, 0, framePreview.width, framePreview.height);
  fctx.strokeStyle = "#303949";
  for (let x = 0; x < framePreview.width; x += 24) {
    for (let y = 0; y < framePreview.height; y += 24) {
      if (((x + y) / 24) % 2 === 0) fctx.fillStyle = "rgba(255,255,255,0.04)";
      else fctx.fillStyle = "rgba(255,255,255,0.02)";
      fctx.fillRect(x, y, 24, 24);
    }
  }
  if (!model) {
    $("frameDetails").textContent = "No model selected.";
    renderFrameList(null);
    renderModelQa(null);
    return;
  }
  if (!model.frames.length) {
    $("frameDetails").textContent = `${model.name}: no transparent PNG frames imported yet.`;
    syncModelControls(model);
    renderFrameList(model);
    renderModelQa(model);
    renderAnimationStateEditor(model);
    return;
  }
  const state = model.animations?.[selectedAnimationState] || fallbackAnimationConfig(model.frames.length, selectedAnimationState);
  const frameIndex = state?.frames?.[statePlaybackIndex] ?? state?.frames?.[0] ?? 0;
  const frame = model.frames[frameIndex] || model.frames[0];
  const scale = Math.min(220 / frame.width, 220 / frame.height, 3);
  const w = frame.width * scale;
  const h = frame.height * scale;
  const x = (framePreview.width - w) / 2;
  const y = (framePreview.height - h) / 2;
  if (onionSkinEnabled && model.frames.length > 1) {
    model.frames.forEach((candidate, index) => {
      if (!candidate.image) return;
      fctx.globalAlpha = Math.max(0.2, 0.75 / model.frames.length);
      fctx.drawImage(candidate.image, x, y, candidate.width * scale, candidate.height * scale);
      fctx.globalAlpha = 1;
      fctx.fillStyle = index % 2 ? "#57c7a2" : "#f1b45c";
      fctx.fillRect(x + 6 + index * 8, y + h + 8, 6, 6);
    });
  } else if (frame.image) {
    fctx.drawImage(frame.image, x, y, w, h);
  }
  fctx.strokeStyle = "#f1b45c";
  fctx.strokeRect(x, y, w, h);
  drawAlphaBounds(frame, x, y, scale);
  drawTimelineHitboxes(model, frameIndex, x, y, scale);
  if (model.registration?.anchor) {
    const [anchorX, anchorY] = model.registration.anchor;
    fctx.strokeStyle = "#ef6a75";
    fctx.beginPath();
    fctx.moveTo(x + anchorX * scale - 8, y + anchorY * scale);
    fctx.lineTo(x + anchorX * scale + 8, y + anchorY * scale);
    fctx.moveTo(x + anchorX * scale, y + anchorY * scale - 8);
    fctx.lineTo(x + anchorX * scale, y + anchorY * scale + 8);
    fctx.stroke();
  }
  $("frameDetails").textContent = `${model.name}: ${frame.name}, ${frame.width}x${frame.height}, ${model.frames.length} frame(s), ${selectedAnimationState} frame #${frameIndex}, ${onionSkinEnabled ? "onion skin" : "single frame"}.`;
  syncModelControls(model);
  renderFrameList(model);
  renderModelQa(model);
  renderAnimationStateEditor(model);
}

function syncModelControls(model) {
  $("modelName").value = model?.name || "";
  $("modelRole").value = model?.role || "";
  $("toggleOnionSkin").classList.toggle("active", onionSkinEnabled);
  $("lockModel").textContent = model?.locked ? "Unlock Model" : "Lock Model";
  $("lockModel").classList.toggle("active", Boolean(model?.locked));
  $("modelStatus").value = model?.status || "provisional";
  $("anchorX").value = model?.registration?.anchor?.[0] ?? "";
  $("anchorY").value = model?.registration?.anchor?.[1] ?? "";
  $("modelBaseline").value = model?.registration?.baseline ?? "";
  ["modelName", "modelRole", "modelStatus", "anchorX", "anchorY", "modelBaseline", "lockModel", "deleteModel"].forEach((id) => {
    $(id).disabled = !model;
  });
  ["modelName", "modelRole", "anchorX", "anchorY", "modelBaseline"].forEach((id) => {
    $(id).disabled = !model || model.locked;
  });
}

function getSelectedModel() {
  return project.assets.characters.find((model) => model.id === selectedAssetId) || project.assets.characters[0] || null;
}

function createEmptyModel(name) {
  return {
    id: uid("model"),
    name,
    role: "character",
    status: "provisional",
    locked: false,
    registration: { canvas: null, anchor: null, baseline: null },
    frames: [],
    animations: defaultAnimations(0),
    timelineHitboxes: [],
  };
}

function nextModelName(base) {
  const names = new Set(project.assets.characters.map((model) => model.name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  let index = 2;
  while (names.has(`${base} ${index}`.toLowerCase())) index += 1;
  return `${base} ${index}`;
}

function normalizeAnimationStateName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function animationStateNames(model) {
  const names = new Set(animationStates);
  Object.keys(model?.animations || {}).forEach((state) => names.add(state));
  return [...names].filter(Boolean);
}

function fallbackAnimationConfig(frameCount, stateName) {
  return defaultAnimations(frameCount)[stateName] || {
    frames: frameCount ? [...Array(frameCount).keys()] : [],
    fps: stateName === "walk" ? 8 : 6,
    loop: stateName !== "failed",
  };
}

function ensureAnimationState(model, stateName, frameIndices = null) {
  if (!model) return null;
  const normalized = normalizeAnimationStateName(stateName) || "idle";
  model.animations ||= defaultAnimations(model.frames?.length || 0);
  const fallback = fallbackAnimationConfig(model.frames?.length || 0, normalized);
  model.animations[normalized] ||= {
    frames: frameIndices || fallback.frames,
    fps: fallback.fps,
    loop: fallback.loop,
  };
  if (frameIndices) model.animations[normalized].frames = frameIndices;
  return normalized;
}

function modelUsage(modelId) {
  const model = project.assets.characters.find((candidate) => candidate.id === modelId);
  return project.scenes.flatMap((scene) => scene.objects
    .filter((object) => object.modelId === modelId || (model && object.kind === "character" && object.name === model.name))
    .map((object) => ({ scene: scene.name, object: object.name })));
}

function removeModelFrame(model, index) {
  if (!model || model.locked) return;
  commitHistory(`Remove frame ${index} from ${model.name}`);
  model.frames.splice(index, 1);
  if (!model.frames.length) {
    model.registration.canvas = null;
    model.registration.anchor = null;
    model.registration.baseline = null;
  } else {
    const first = model.frames[0];
    model.registration.canvas = { width: first.width, height: first.height };
    model.registration.anchor ||= [Math.round(first.width / 2), first.height];
    model.registration.baseline ||= first.height;
  }
  repairModelAnimations(model);
  repairTimelineHitboxes(model);
  renderAll();
}

function repairModelAnimations(model) {
  model.animations ||= defaultAnimations(model.frames.length);
  const max = model.frames.length - 1;
  for (const state of animationStateNames(model)) {
    const fallback = fallbackAnimationConfig(model.frames.length, state);
    const config = model.animations[state] || fallback;
    config.frames = [...new Set((config.frames || []).filter((index) => Number.isInteger(index) && index >= 0 && index <= max))];
    if (!model.frames.length) config.frames = [];
    if (!config.frames.length && fallback.frames.length) config.frames = fallback.frames;
    config.fps = clamp(Number(config.fps) || fallback.fps, 1, 24);
    config.loop = config.loop !== false;
    model.animations[state] = config;
  }
}

function repairTimelineHitboxes(model) {
  model.timelineHitboxes ||= [];
  const max = model.frames.length - 1;
  const allowedStates = new Set(animationStateNames(model));
  model.timelineHitboxes = model.timelineHitboxes
    .filter((box) => box && allowedStates.has(box.state || ""))
    .map((box) => {
      const canvas = model.registration?.canvas || model.frames[0] || { width: 72, height: 148 };
      const frame = clamp(Number(box.frame) || 0, 0, Math.max(0, max));
      const w = clamp(Number(box.w) || 1, 1, canvas.width || 1);
      const h = clamp(Number(box.h) || 1, 1, canvas.height || 1);
      return {
        id: box.id || uid("anim-hitbox"),
        name: box.name || `${box.state || "idle"} hitbox`,
        state: box.state,
        frame,
        kind: box.kind || "body",
        x: clamp(Number(box.x) || 0, 0, Math.max(0, (canvas.width || 1) - w)),
        y: clamp(Number(box.y) || 0, 0, Math.max(0, (canvas.height || 1) - h)),
        w,
        h,
      };
    });
  if (selectedAnimationHitboxId && !model.timelineHitboxes.some((box) => box.id === selectedAnimationHitboxId)) {
    selectedAnimationHitboxId = null;
  }
}

function timelineHitboxesFor(model, state = selectedAnimationState, frameIndex = null) {
  if (!model) return [];
  return (model.timelineHitboxes || []).filter((box) => {
    if (box.state !== state) return false;
    return frameIndex === null || Number(box.frame) === Number(frameIndex);
  });
}

function defaultTimelineHitbox(model) {
  const canvas = model.registration?.canvas || model.frames[0] || { width: 72, height: 148 };
  const state = model.animations?.[selectedAnimationState] || fallbackAnimationConfig(model.frames.length, selectedAnimationState);
  const frame = state?.frames?.[0] ?? 0;
  const w = Math.max(12, Math.round((canvas.width || 72) * 0.55));
  const h = Math.max(16, Math.round((canvas.height || 148) * 0.72));
  return {
    id: uid("anim-hitbox"),
    name: `${selectedAnimationState} body`,
    state: selectedAnimationState,
    frame,
    kind: "body",
    x: Math.round(((canvas.width || 72) - w) / 2),
    y: Math.max(0, Math.round((canvas.height || 148) - h)),
    w,
    h,
  };
}

function modelQaIssues(model) {
  return modelQaIssueRecords(model).map((issue) => issue.message);
}

function modelQaIssueRecords(model) {
  if (!model) return [{ severity: "error", message: "No model selected.", target: { tab: "characters" } }];
  const issues = [];
  const target = { tab: "characters", modelId: model.id };
  if (!model.frames.length) issues.push({ severity: "error", message: `${model.name}: no transparent PNG frames imported.`, target });
  const sizes = new Set(model.frames.map((frame) => `${frame.width}x${frame.height}`));
  if (sizes.size > 1) issues.push({ severity: "error", message: `${model.name}: frames have mixed canvas sizes (${[...sizes].join(", ")}).`, target });
  const alphaFrames = model.frames.filter((frame) => frame.alphaBounds && !frame.alphaBounds.empty);
  model.frames.forEach((frame) => {
    if (!frame.alphaBounds) issues.push({ severity: "warning", message: `${model.name}: ${frame.name} has no alpha-bounds scan yet.`, target });
    else if (frame.alphaBounds.empty) issues.push({ severity: "error", message: `${model.name}: ${frame.name} appears fully transparent.`, target });
  });
  if (alphaFrames.length > 1) {
    const bottoms = alphaFrames.map((frame) => frame.alphaBounds.bottom);
    const centers = alphaFrames.map((frame) => frame.alphaBounds.centerX);
    const bottomDrift = Math.max(...bottoms) - Math.min(...bottoms);
    const centerDrift = Math.max(...centers) - Math.min(...centers);
    if (bottomDrift > 3) issues.push({ severity: "error", message: `${model.name}: visible pixel bottom drifts ${bottomDrift}px across frames.`, target });
    else if (bottomDrift > 1) issues.push({ severity: "warning", message: `${model.name}: visible pixel bottom drifts ${bottomDrift}px across frames.`, target });
    if (centerDrift > 6) issues.push({ severity: "warning", message: `${model.name}: visible pixel center drifts ${centerDrift}px across frames.`, target });
  }
  const canvas = model.registration?.canvas;
  if (!canvas) issues.push({ severity: "error", message: `${model.name}: registration canvas is missing.`, target });
  const anchor = model.registration?.anchor;
  if (!anchor || anchor.length !== 2) issues.push({ severity: "error", message: `${model.name}: registration anchor is missing.`, target });
  else if (canvas && (anchor[0] < 0 || anchor[1] < 0 || anchor[0] > canvas.width || anchor[1] > canvas.height)) {
    issues.push({ severity: "error", message: `${model.name}: anchor falls outside the registered canvas.`, target });
  }
  if (!Number.isFinite(Number(model.registration?.baseline))) issues.push({ severity: "error", message: `${model.name}: baseline is missing.`, target });
  const animations = model.animations || {};
  animationStateNames(model).forEach((state) => {
    const config = animations[state];
    if (!config?.frames?.length) issues.push({ severity: "error", message: `${model.name}: ${state} animation has no assigned frames.`, target });
    else if (config.frames.some((index) => !Number.isInteger(index) || index < 0 || index >= model.frames.length)) {
      issues.push({ severity: "error", message: `${model.name}: ${state} animation references a missing frame.`, target });
    }
  });
  if (model.frames.length && !(model.timelineHitboxes || []).length) {
    issues.push({ severity: "warning", message: `${model.name}: no timeline-bound animation hitboxes defined.`, target });
  }
  (model.timelineHitboxes || []).forEach((box) => {
    const boxTarget = { tab: "characters", modelId: model.id };
    if (!animations[box.state]) issues.push({ severity: "error", message: `${model.name}: ${box.name} references unknown state ${box.state}.`, target: boxTarget });
    if (!Number.isInteger(box.frame) || box.frame < 0 || box.frame >= model.frames.length) {
      issues.push({ severity: "error", message: `${model.name}: ${box.name} references missing frame ${box.frame}.`, target: boxTarget });
    }
    if (canvas && (box.x < 0 || box.y < 0 || box.x + box.w > canvas.width || box.y + box.h > canvas.height)) {
      issues.push({ severity: "error", message: `${model.name}: ${box.name} falls outside the registered canvas.`, target: boxTarget });
    }
    if (box.w < 1 || box.h < 1) issues.push({ severity: "error", message: `${model.name}: ${box.name} needs positive hitbox dimensions.`, target: boxTarget });
  });
  if (model.status === "final" && issues.length) issues.push({ severity: "error", message: `${model.name}: cannot be final while QA issues remain.`, target });
  return issues;
}

function renderModelQa(model) {
  const wrap = $("modelQaList");
  if (!wrap) return;
  const issues = modelQaIssueRecords(model);
  wrap.innerHTML = "";
  if (!issues.length) {
    wrap.innerHTML = `<div class="issue ok">Frame registration QA passes for this model.</div>`;
    return;
  }
  issues.forEach((issue) => wrap.appendChild(issueElement(issue)));
}

function renderAnimationStateEditor(model) {
  const timeline = $("stateTimeline");
  if (!timeline) return;
  if (!model) {
    $("animationState").disabled = true;
    $("animationState").innerHTML = "";
    $("newAnimationState").disabled = true;
    $("addAnimationState").disabled = true;
    $("deleteAnimationState").disabled = true;
    $("stateFrames").disabled = true;
    $("stateFps").disabled = true;
    $("stateLoop").disabled = true;
    timeline.innerHTML = `<p class="meta">No model selected.</p>`;
    renderTimelineHitboxEditor(null);
    return;
  }
  model.animations ||= defaultAnimations(model.frames.length);
  const names = animationStateNames(model);
  if (!names.includes(selectedAnimationState)) selectedAnimationState = names[0] || "idle";
  const state = model.animations[selectedAnimationState] || fallbackAnimationConfig(model.frames.length, selectedAnimationState);
  $("animationState").innerHTML = names.map((stateName) => `<option value="${stateName}">${escapeHtml(stateName)}</option>`).join("");
  $("animationState").disabled = false;
  $("newAnimationState").disabled = model.locked;
  $("addAnimationState").disabled = model.locked;
  $("deleteAnimationState").disabled = model.locked || protectedAnimationStates.has(selectedAnimationState);
  $("stateFrames").disabled = model.locked;
  $("stateFps").disabled = model.locked;
  $("stateLoop").disabled = model.locked;
  $("animationState").value = selectedAnimationState;
  $("stateFrames").value = (state.frames || []).join(",");
  $("stateFps").value = state.fps || 6;
  $("stateLoop").value = state.loop === false ? "false" : "true";
  timeline.innerHTML = "";
  if (!state.frames?.length) {
    timeline.innerHTML = `<p class="meta">No frames assigned to ${selectedAnimationState}.</p>`;
    renderTimelineHitboxEditor(model);
    return;
  }
  state.frames.forEach((frameIndex, order) => {
    const frame = model.frames[frameIndex];
    const row = document.createElement("div");
    row.className = `timeline-frame ${order === statePlaybackIndex ? "active" : ""}`;
    row.innerHTML = `
      ${frame ? `<img alt="" src="${frame.dataUrl}" />` : `<span></span>`}
      <div><strong>#${frameIndex}</strong><br><small>${escapeHtml(frame?.name || "missing frame")}</small></div>
    `;
    timeline.appendChild(row);
  });
  renderTimelineHitboxEditor(model);
}

function renderTimelineHitboxEditor(model) {
  const list = $("timelineHitboxList");
  if (!list) return;
  const controlIds = ["timelineHitboxName", "timelineHitboxFrame", "timelineHitboxKind", "timelineHitboxX", "timelineHitboxY", "timelineHitboxW", "timelineHitboxH", "addTimelineHitbox", "deleteTimelineHitbox"];
  if (!model) {
    controlIds.forEach((id) => { $(id).disabled = true; });
    list.innerHTML = `<p class="meta">No model selected.</p>`;
    return;
  }
  const boxes = timelineHitboxesFor(model, selectedAnimationState);
  if (selectedAnimationHitboxId && !boxes.some((box) => box.id === selectedAnimationHitboxId)) selectedAnimationHitboxId = null;
  const selected = boxes.find((box) => box.id === selectedAnimationHitboxId) || boxes[0] || null;
  selectedAnimationHitboxId = selected?.id || null;
  controlIds.forEach((id) => { $(id).disabled = model.locked || (!selected && id !== "addTimelineHitbox"); });
  $("addTimelineHitbox").disabled = model.locked;
  $("deleteTimelineHitbox").disabled = model.locked || !selected;
  $("timelineHitboxName").value = selected?.name || "";
  $("timelineHitboxFrame").value = selected?.frame ?? "";
  $("timelineHitboxKind").value = selected?.kind || "body";
  $("timelineHitboxX").value = selected?.x ?? "";
  $("timelineHitboxY").value = selected?.y ?? "";
  $("timelineHitboxW").value = selected?.w ?? "";
  $("timelineHitboxH").value = selected?.h ?? "";
  list.innerHTML = "";
  if (!boxes.length) {
    list.innerHTML = `<p class="meta">No ${selectedAnimationState} frame hitboxes yet.</p>`;
    return;
  }
  boxes
    .sort((a, b) => a.frame - b.frame || a.name.localeCompare(b.name))
    .forEach((box) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = `timeline-hitbox-row ${box.id === selectedAnimationHitboxId ? "active" : ""}`;
      row.innerHTML = `<span style="--hitbox-color:${hitboxKindColor(box.kind)}"></span><strong>${escapeHtml(box.name)}</strong><em>${escapeHtml(box.kind)} / frame ${box.frame} / ${box.x},${box.y},${box.w},${box.h}</em>`;
      row.onclick = () => {
        selectedAnimationHitboxId = box.id;
        drawFramePreview(model);
      };
      list.appendChild(row);
    });
}

function updateTimelineHitboxFromControls() {
  const model = getSelectedModel();
  if (!model || model.locked || !selectedAnimationHitboxId) return;
  const box = model.timelineHitboxes.find((candidate) => candidate.id === selectedAnimationHitboxId);
  if (!box) return;
  const canvas = model.registration?.canvas || model.frames[0] || { width: 72, height: 148 };
  box.name = $("timelineHitboxName").value.trim() || `${selectedAnimationState} hitbox`;
  box.state = selectedAnimationState;
  box.frame = clamp(Number($("timelineHitboxFrame").value) || 0, 0, Math.max(0, model.frames.length - 1));
  box.kind = $("timelineHitboxKind").value || "body";
  box.w = clamp(Number($("timelineHitboxW").value) || 1, 1, canvas.width || 1);
  box.h = clamp(Number($("timelineHitboxH").value) || 1, 1, canvas.height || 1);
  box.x = clamp(Number($("timelineHitboxX").value) || 0, 0, Math.max(0, (canvas.width || 1) - box.w));
  box.y = clamp(Number($("timelineHitboxY").value) || 0, 0, Math.max(0, (canvas.height || 1) - box.h));
  drawFramePreview(model);
  renderQaSummary();
  renderHandoffSummary();
  scheduleAutosave();
}

function defaultAnimations(frameCount) {
  const frames = frameCount ? [...Array(frameCount).keys()] : [];
  return {
    idle: { frames: frames.slice(0, Math.min(2, frames.length)), fps: 4, loop: true },
    walk: { frames, fps: 8, loop: true },
    talk: { frames: frames.slice(0, Math.min(3, frames.length)), fps: 10, loop: true },
    waiting: { frames: frames.slice(0, Math.min(2, frames.length)), fps: 4, loop: true },
    failed: { frames: frames.slice(0, 1), fps: 6, loop: false },
  };
}

function updateAnimationStateFromControls() {
  const model = getSelectedModel();
  if (!model || model.locked) return;
  const frameIndices = $("stateFrames").value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isInteger(value) && value >= 0 && value < model.frames.length);
  model.animations ||= defaultAnimations(model.frames.length);
  model.animations[selectedAnimationState] = {
    frames: frameIndices,
    fps: Math.max(1, Math.min(24, Number($("stateFps").value) || 6)),
    loop: $("stateLoop").value === "true",
  };
  statePlaybackIndex = 0;
  renderAnimationStateEditor(model);
  renderModelQa(model);
  renderHandoffSummary();
}

function playAnimationState() {
  const model = getSelectedModel();
  if (!model) return;
  stopAnimationState(false);
  const state = model.animations?.[selectedAnimationState];
  if (!state?.frames?.length) return;
  const fps = Math.max(1, Number(state.fps) || 6);
  statePlaybackIndex = 0;
  const tick = () => {
    const frameIndex = state.frames[statePlaybackIndex] ?? 0;
    drawFramePreviewFrame(model, frameIndex);
    renderAnimationStateEditor(model);
    statePlaybackIndex += 1;
    if (statePlaybackIndex >= state.frames.length) {
      if (state.loop) statePlaybackIndex = 0;
      else {
        stopAnimationState(false);
        return;
      }
    }
    statePlaybackTimer = window.setTimeout(tick, 1000 / fps);
  };
  tick();
}

function stopAnimationState(reset = true) {
  if (statePlaybackTimer) window.clearTimeout(statePlaybackTimer);
  statePlaybackTimer = null;
  if (reset) statePlaybackIndex = 0;
  renderAnimationStateEditor(getSelectedModel());
}

function drawFramePreviewFrame(model, frameIndex) {
  const frame = model.frames[frameIndex] || model.frames[0];
  if (!frame) return;
  fctx.clearRect(0, 0, framePreview.width, framePreview.height);
  fctx.fillStyle = "#0f1319";
  fctx.fillRect(0, 0, framePreview.width, framePreview.height);
  const scale = Math.min(220 / frame.width, 220 / frame.height, 3);
  const w = frame.width * scale;
  const h = frame.height * scale;
  const x = (framePreview.width - w) / 2;
  const y = (framePreview.height - h) / 2;
  if (frame.image) fctx.drawImage(frame.image, x, y, w, h);
  fctx.strokeStyle = "#f1b45c";
  fctx.strokeRect(x, y, w, h);
  drawAlphaBounds(frame, x, y, scale);
  drawTimelineHitboxes(model, frameIndex, x, y, scale);
  $("frameDetails").textContent = `${model.name}: playing ${selectedAnimationState} frame #${frameIndex} (${frame.name}).`;
}

function drawAlphaBounds(frame, previewX, previewY, scale) {
  const bounds = frame?.alphaBounds;
  if (!bounds || bounds.empty) return;
  fctx.save();
  fctx.strokeStyle = "#57c7a2";
  fctx.setLineDash([5, 4]);
  fctx.lineWidth = 2;
  fctx.strokeRect(previewX + bounds.x * scale, previewY + bounds.y * scale, bounds.w * scale, bounds.h * scale);
  fctx.setLineDash([]);
  fctx.fillStyle = "#57c7a2";
  fctx.font = "11px Segoe UI";
  fctx.fillText("alpha bounds", previewX + bounds.x * scale + 3, Math.max(12, previewY + bounds.y * scale - 4));
  fctx.restore();
}

function drawTimelineHitboxes(model, frameIndex, previewX, previewY, scale) {
  timelineHitboxesFor(model, selectedAnimationState, frameIndex).forEach((box) => {
    const selected = box.id === selectedAnimationHitboxId;
    fctx.save();
    fctx.strokeStyle = selected ? "#ffffff" : hitboxKindColor(box.kind);
    fctx.fillStyle = selected ? "rgba(255,255,255,0.18)" : hitboxKindFill(box.kind);
    fctx.lineWidth = selected ? 3 : 2;
    fctx.fillRect(previewX + box.x * scale, previewY + box.y * scale, box.w * scale, box.h * scale);
    fctx.strokeRect(previewX + box.x * scale, previewY + box.y * scale, box.w * scale, box.h * scale);
    fctx.font = "11px Segoe UI";
    fctx.fillStyle = selected ? "#ffffff" : hitboxKindColor(box.kind);
    fctx.fillText(box.name, previewX + box.x * scale + 3, Math.max(12, previewY + box.y * scale - 3));
    fctx.restore();
  });
}

function hitboxKindColor(kind) {
  return {
    body: "#57c7a2",
    interaction: "#ef6a75",
    mouth: "#f1b45c",
    prop: "#6fa8ff",
  }[kind] || "#eef2f7";
}

function hitboxKindFill(kind) {
  return hexToRgba(hitboxKindColor(kind), 0.16);
}

function analyzeFrameAlpha(image) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;
  let pixels = 0;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (data[(y * canvas.width + x) * 4 + 3] <= 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      pixels += 1;
    }
  }
  if (!pixels) return { empty: true, pixels: 0, x: 0, y: 0, w: 0, h: 0, centerX: 0, bottom: 0 };
  return {
    empty: false,
    pixels,
    x: minX,
    y: minY,
    w: maxX - minX + 1,
    h: maxY - minY + 1,
    centerX: Math.round((minX + maxX) / 2),
    bottom: maxY,
  };
}

function placeModelInScene(model) {
  commitHistory(`Place model ${model.name}`);
  const scene = activeScene();
  const frame = model.frames[0];
  const object = {
    id: uid("character"),
    kind: "character",
    name: model.name,
    modelId: model.id,
    x: Math.round(scene.width / 2 - (frame?.width || 72) / 2),
    y: Math.round(scene.height / 2 - (frame?.height || 148) / 2),
    w: frame?.width || 72,
    h: frame?.height || 148,
    animationState: "idle",
    dialogue: "New imported character line.",
    animationBible: {
      idle: "Imported model needs reviewed idle performance.",
      walk: "Imported model needs contact-Y stable walk frames.",
      talk: "Imported model uses independent mouth or talk frames.",
      waiting: "Imported model needs a readable waiting pose.",
      failed: "Imported model needs a clear failed/reaction pose.",
    },
  };
  scene.objects.push(object);
  selectedId = object.id;
  activeTool = "select";
  document.querySelectorAll(".tool").forEach((button) => button.classList.toggle("active", button.dataset.tool === "select"));
  renderAll();
}

function renderDialogueGraph() {
  const graph = $("dialogueGraph");
  const inspector = $("dialogueInspector");
  if (!graph || !inspector) return;
  const scene = activeScene();
  graph.innerHTML = "";
  renderDialogueBranchMap(scene);
  if (!scene.dialogue.length) {
    graph.innerHTML = `<p class="meta">No dialogue nodes yet.</p>`;
    inspector.innerHTML = `<p class="meta">Add a node or sync script dialogue.</p>`;
    return;
  }
  if (!scene.dialogue.some((node) => node.id === selectedDialogueId)) selectedDialogueId = scene.dialogue[0].id;
  scene.dialogue.forEach((node) => {
    node.choices ||= [];
    const card = document.createElement("div");
    card.className = `dialogue-node ${node.id === selectedDialogueId ? "active" : ""}`;
    card.innerHTML = `
      <h3>${escapeHtml(node.speaker || "Unknown Speaker")}</h3>
      <p>${escapeHtml(node.line || "No line written.")}</p>
      <p>${node.choices.length} choice(s)</p>
    `;
    card.onclick = () => {
      selectedDialogueId = node.id;
      renderDialogueGraph();
    };
    graph.appendChild(card);
  });
  renderDialogueInspector();
}

function renderDialogueBranchMap(scene) {
  const map = $("dialogueBranchMap");
  if (!map) return;
  map.innerHTML = "";
  if (!scene.dialogue.length) {
    map.innerHTML = `<p class="meta">No dialogue branches yet.</p>`;
    return;
  }
  const edges = dialogueBranchEdges(scene);
  const nodes = scene.dialogue.map((node, index) => ({ node, index, x: 42 + index * 260, y: 56 }));
  const leaves = edges.filter((edge) => !edge.target).map((edge, index) => ({ edge, index, x: 96 + index * 220, y: 228 }));
  const width = Math.max(720, nodes.length * 260 + 64, leaves.length * 220 + 120);
  const height = leaves.length ? 330 : 190;
  map.style.setProperty("--dialogue-map-width", `${width}px`);
  const svgParts = [
    `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Dialogue branch map">`,
    `<defs><marker id="dialogueArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"></path></marker></defs>`,
  ];
  edges.forEach((edge) => {
    const source = nodes.find((entry) => entry.node.id === edge.source.id);
    const target = edge.target ? nodes.find((entry) => entry.node.id === edge.target.id) : leaves.find((leaf) => leaf.edge === edge);
    if (!source || !target) return;
    const sx = source.x + 94;
    const sy = source.y + 86;
    const tx = edge.target ? target.x + 94 : target.x + 82;
    const ty = edge.target ? target.y : target.y + 4;
    const midY = sy + (ty - sy) * 0.58;
    svgParts.push(`<path class="branch-line ${edge.target ? "" : "branch-line-leaf"}" d="M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}" />`);
    svgParts.push(`<text class="branch-label" x="${(sx + tx) / 2 - 54}" y="${midY - 6}">${escapeHtml(edge.choice.label || "Choice")}</text>`);
  });
  nodes.forEach(({ node, x, y }, index) => {
    const active = node.id === selectedDialogueId ? " active" : "";
    svgParts.push(`<g class="branch-node${active}" data-dialogue-id="${escapeAttr(node.id)}" transform="translate(${x} ${y})"><rect width="188" height="86" rx="8"></rect><text class="node-index" x="12" y="22">${index + 1}</text><text class="node-speaker" x="38" y="22">${escapeHtml(node.speaker || "Unknown")}</text><text class="node-line" x="12" y="50">${escapeHtml(truncateText(node.line || "No line written.", 28))}</text><text class="node-choice-count" x="12" y="72">${(node.choices || []).length} choice(s)</text></g>`);
  });
  leaves.forEach(({ edge, x, y }) => {
    svgParts.push(`<g class="branch-leaf" transform="translate(${x} ${y})"><rect width="164" height="58" rx="8"></rect><text x="10" y="22">Response</text><text x="10" y="44">${escapeHtml(truncateText(edge.choice.response || "No response.", 24))}</text></g>`);
  });
  svgParts.push("</svg>");
  map.innerHTML = svgParts.join("");
  map.querySelectorAll("[data-dialogue-id]").forEach((nodeEl) => {
    nodeEl.onclick = () => {
      selectedDialogueId = nodeEl.dataset.dialogueId;
      renderDialogueGraph();
    };
  });
}

function dialogueBranchEdges(scene) {
  return scene.dialogue.flatMap((node) => (node.choices || []).map((choice) => ({
    source: node,
    choice,
    target: inferDialogueTarget(scene, node, choice),
  })));
}

function inferDialogueTarget(scene, sourceNode, choice) {
  const response = String(choice.response || "");
  const arrow = response.match(/(?:->|=>)\s*([a-z0-9 _-]+)/i);
  const targetText = (arrow?.[1] || response).toLowerCase();
  return scene.dialogue.find((candidate) => {
    if (candidate.id === sourceNode.id) return false;
    const speaker = String(candidate.speaker || "").toLowerCase();
    const id = String(candidate.id || "").toLowerCase();
    return speaker && targetText.includes(speaker) || id && targetText.includes(id);
  }) || null;
}

function truncateText(text, max) {
  const value = String(text || "");
  return value.length > max ? `${value.slice(0, Math.max(0, max - 3))}...` : value;
}

function renderDialogueInspector() {
  const scene = activeScene();
  const node = scene.dialogue.find((item) => item.id === selectedDialogueId);
  const wrap = $("dialogueInspector");
  if (!node) {
    wrap.innerHTML = `<p class="meta">Select a dialogue node.</p>`;
    return;
  }
  node.choices ||= [];
  wrap.innerHTML = `
    <div class="field">
      <label>Speaker</label>
      <input id="dialogueSpeaker" class="text-input" value="${escapeAttr(node.speaker || "")}" />
    </div>
    <div class="field">
      <label>Line</label>
      <textarea id="dialogueLine">${escapeHtml(node.line || "")}</textarea>
    </div>
    <div class="panel-title">Choices</div>
    <div id="choiceEditor"></div>
    <div class="button-row">
      <button id="addChoice">Add Choice</button>
      <button id="deleteDialogueNode">Delete Node</button>
    </div>
  `;
  $("dialogueSpeaker").oninput = () => updateDialogueNode(node);
  $("dialogueLine").oninput = () => updateDialogueNode(node);
  $("addChoice").onclick = () => {
    commitHistory(`Add choice to ${node.speaker || "dialogue"}`);
    node.choices.push({ label: "New choice", response: "New response." });
    renderDialogueGraph();
    renderHandoffSummary();
  };
  $("deleteDialogueNode").onclick = () => {
    commitHistory(`Delete dialogue ${node.speaker || node.id}`);
    scene.dialogue = scene.dialogue.filter((item) => item.id !== node.id);
    selectedDialogueId = scene.dialogue[0]?.id || null;
    renderAll();
  };
  renderChoiceEditor(node);
}

function renderChoiceEditor(node) {
  const wrap = $("choiceEditor");
  wrap.innerHTML = "";
  node.choices.forEach((choice, index) => {
    const row = document.createElement("div");
    row.className = "choice-row";
    row.innerHTML = `
      <input class="text-input" data-choice-label="${index}" value="${escapeAttr(choice.label || "")}" />
      <button data-choice-remove="${index}">Remove</button>
      <textarea data-choice-response="${index}">${escapeHtml(choice.response || "")}</textarea>
    `;
    row.querySelector(`[data-choice-label="${index}"]`).oninput = (event) => {
      choice.label = event.target.value;
      renderDialogueGraph();
      renderHandoffSummary();
    };
    row.querySelector(`[data-choice-response="${index}"]`).oninput = (event) => {
      choice.response = event.target.value;
      renderDialogueBranchMap(activeScene());
      renderHandoffSummary();
    };
    row.querySelector(`[data-choice-remove="${index}"]`).onclick = () => {
      commitHistory(`Remove choice ${choice.label || index}`);
      node.choices.splice(index, 1);
      renderDialogueGraph();
      renderHandoffSummary();
    };
    wrap.appendChild(row);
  });
}

function updateDialogueNode(node) {
  node.speaker = $("dialogueSpeaker").value;
  node.line = $("dialogueLine").value;
  const actor = activeScene().objects.find((object) => object.kind === "character" && object.name.toLowerCase() === node.speaker.toLowerCase());
  if (actor && !actor.locked) actor.dialogue = node.line;
  renderDialogueBranchMap(activeScene());
  renderHandoffSummary();
}

function renderInspector() {
  const scene = activeScene();
  const object = scene.objects.find((item) => item.id === selectedId);
  const wrap = $("inspectorBody");
  if (!object) {
    wrap.innerHTML = `<p class="meta">Select an object, or choose a tool and draw on the stage.</p>`;
    return;
  }

  const bibleFields = object.animationBible
    ? Object.entries(object.animationBible).map(([key, value]) => `
      <div class="field">
        <label>${escapeHtml(key)}</label>
        <input class="text-input bible-input" data-bible="${escapeHtml(key)}" value="${escapeAttr(value)}" />
      </div>
    `).join("")
    : "";
  const modelOptions = project.assets.characters.map((model) => `<option value="${model.id}" ${object.modelId === model.id ? "selected" : ""}>${escapeHtml(model.name)}</option>`).join("");
  const objectModel = project.assets.characters.find((model) => model.id === object.modelId);
  const animationStateOptions = animationStateNames(objectModel).map((state) => `<option value="${state}" ${object.animationState === state ? "selected" : ""}>${escapeHtml(state)}</option>`).join("");
  const sceneOptions = [`<option value="">No scene change</option>`, ...project.scenes.map((sceneOption) => `<option value="${sceneOption.id}" ${object.targetSceneId === sceneOption.id ? "selected" : ""}>${escapeHtml(sceneOption.name)}</option>`)].join("");

  wrap.innerHTML = `
    <div class="field">
      <label>Name</label>
      <input id="objName" class="text-input" value="${escapeAttr(object.name)}" />
    </div>
    <div class="field">
      <label>Kind</label>
      <select id="objKind">
        ${["hitbox", "dialogue", "character", "walkable"].map((kind) => `<option value="${kind}" ${object.kind === kind ? "selected" : ""}>${kind}</option>`).join("")}
      </select>
    </div>
    <div class="field inline">
      <label>X <input id="objX" class="text-input" type="number" value="${Math.round(object.x)}" /></label>
      <label>Y <input id="objY" class="text-input" type="number" value="${Math.round(object.y)}" /></label>
    </div>
    <div class="field inline">
      <label>W <input id="objW" class="text-input" type="number" value="${Math.round(object.w)}" /></label>
      <label>H <input id="objH" class="text-input" type="number" value="${Math.round(object.h)}" /></label>
    </div>
    <div class="field inline">
      <label>Baseline <input id="objBaseline" class="text-input" type="number" value="${Math.round(renderableBaseline(object, scene))}" /></label>
      <button id="autoBaseline" title="Use the bottom edge as this object's draw baseline">Auto Baseline</button>
    </div>
    <div class="field">
      <label>Dialogue / Note</label>
      <textarea id="objDialogue">${escapeHtml(object.dialogue || object.text || object.note || "")}</textarea>
    </div>
    ${object.kind === "character" ? `
      <div class="field">
        <label>Character Model</label>
        <select id="objModel"><option value="">Placeholder</option>${modelOptions}</select>
      </div>
      <div class="field">
        <label>Runtime State</label>
        <select id="objAnimationState">${animationStateOptions}</select>
      </div>
    ` : ""}
    ${object.kind === "hitbox" ? `
      <div class="field">
        <label>Exit Destination</label>
        <select id="objTargetScene">${sceneOptions}</select>
      </div>
    ` : ""}
    ${bibleFields}
    <div class="button-row">
      <button id="toggleObjectLock">${object.locked ? "Unlock Object" : "Lock Object"}</button>
      <button id="duplicateObject">Duplicate</button>
      <button id="deleteObject">Delete</button>
    </div>
  `;

  ["objName", "objKind", "objX", "objY", "objW", "objH", "objBaseline", "objDialogue"].forEach((id) => {
    $(id).disabled = object.locked;
    $(id).oninput = () => updateObjectFromInspector(object);
  });
  $("autoBaseline").disabled = object.locked || object.kind === "walkable";
  $("autoBaseline").onclick = () => {
    if (object.locked) return;
    commitHistory(`Auto baseline ${object.name}`);
    object.baseline = object.y + object.h;
    renderAll();
  };
  if ($("objModel")) $("objModel").oninput = () => {
    if (object.locked) return;
    object.modelId = $("objModel").value;
    drawStage();
    validate(false);
    renderHandoffSummary();
  };
  if ($("objModel")) $("objModel").disabled = object.locked;
  if ($("objAnimationState")) $("objAnimationState").oninput = () => {
    if (object.locked) return;
    object.animationState = $("objAnimationState").value;
    drawStage();
    renderObjectOutliner();
    renderHandoffSummary();
  };
  if ($("objAnimationState")) $("objAnimationState").disabled = object.locked;
  if ($("objTargetScene")) $("objTargetScene").oninput = () => {
    if (object.locked) return;
    object.targetSceneId = $("objTargetScene").value;
    renderObjectOutliner();
    renderHandoffSummary();
  };
  if ($("objTargetScene")) $("objTargetScene").disabled = object.locked;
  document.querySelectorAll(".bible-input").forEach((input) => {
    input.disabled = object.locked;
    input.oninput = () => {
      if (object.locked) return;
      object.animationBible[input.dataset.bible] = input.value;
      drawStage();
    };
  });
  $("toggleObjectLock").onclick = () => {
    commitHistory(`${object.locked ? "Unlock" : "Lock"} ${object.name}`);
    object.locked = !object.locked;
    renderAll();
  };
  $("duplicateObject").onclick = () => {
    commitHistory(`Duplicate ${object.name}`);
    const clone = structuredClone(object);
    clone.id = uid(object.kind);
    clone.name = `${object.name} copy`;
    clone.locked = false;
    clone.x += 22;
    clone.y += 22;
    scene.objects.push(clone);
    selectedId = clone.id;
    renderAll();
  };
  $("deleteObject").onclick = () => {
    if (object.locked) {
      setHint(`${object.name} is locked. Unlock it before deleting.`);
      return;
    }
    commitHistory(`Delete ${object.name}`);
    scene.objects = scene.objects.filter((item) => item.id !== object.id);
    selectedId = null;
    renderAll();
  };
}

function updateObjectFromInspector(object) {
  if (object.locked) return;
  object.name = $("objName").value;
  object.kind = $("objKind").value;
  if (object.kind === "character" && !object.animationState) object.animationState = "idle";
  object.x = Number($("objX").value);
  object.y = Number($("objY").value);
  object.w = Number($("objW").value);
  object.h = Number($("objH").value);
  object.baseline = Number($("objBaseline").value);
  const text = $("objDialogue").value;
  if (object.kind === "dialogue") object.text = text;
  else if (object.kind === "walkable") object.note = text;
  else object.dialogue = text;
  if ($("objModel")) object.modelId = $("objModel").value;
  if ($("objTargetScene")) object.targetSceneId = $("objTargetScene").value;
  $("sceneMeta").textContent = `${activeScene().objects.length} objects, ${activeScene().layers.length} layers, ${activeScene().dialogue.length} dialogue nodes`;
  drawStage();
  validate(false);
}

function drawStage(target = ctx, scene = activeScene(), preview = false) {
  if (target.canvas && (target.canvas.width !== scene.width || target.canvas.height !== scene.height)) {
    target.canvas.width = scene.width;
    target.canvas.height = scene.height;
    if (target.canvas === stage) applyStageZoom();
  }
  target.clearRect(0, 0, scene.width, scene.height);
  target.fillStyle = scene.background;
  target.fillRect(0, 0, scene.width, scene.height);
  if (!preview && project.editor?.gridVisible) drawGrid(target, scene);

  drawBaseLayers(target, scene);
  scene.objects.filter((object) => object.kind === "walkable").forEach((object) => drawObject(target, object, object.id === selectedId && !preview, scene));
  sortedDepthRenderables(scene).forEach((entry) => {
    if (entry.kind === "layer") drawLayer(target, entry.item, scene);
    else drawObject(target, entry.item, entry.item.id === selectedId && !preview, scene);
  });
  if (!preview && project.editor?.baselinesVisible) drawBaselineOverlay(target, scene);

  if (!preview) {
    target.strokeStyle = "#394456";
    target.strokeRect(0.5, 0.5, scene.width - 1, scene.height - 1);
  }
}

function drawBaselineOverlay(target, scene) {
  target.save();
  target.font = "11px Segoe UI";
  target.textBaseline = "bottom";
  const depthQa = collectDepthQa(scene);
  const entries = depthQa.entries;
  depthQa.conflicts.forEach((conflict) => {
    const y = (conflict.first.baseline + conflict.second.baseline) / 2;
    const x = Math.max(0, Math.min(conflict.first.span.start, conflict.second.span.start) - 10);
    const right = Math.min(scene.width, Math.max(conflict.first.span.end, conflict.second.span.end) + 10);
    target.fillStyle = conflict.severity === "error" ? "rgba(239,106,117,0.14)" : "rgba(241,180,92,0.12)";
    target.fillRect(x, Math.max(0, y - 8), right - x, 16);
    target.fillStyle = conflict.severity === "error" ? "#ef6a75" : "#f1b45c";
    target.fillText(`${Math.round(conflict.distance)}px baseline gap`, clamp(x + 4, 4, scene.width - 150), Math.max(14, y - 9));
  });
  collectOcclusionQa(scene).forEach((warning) => {
    const actorRect = actorBodyRect(warning.actor);
    target.fillStyle = "rgba(241,180,92,0.12)";
    target.fillRect(actorRect.x, actorRect.y, actorRect.w, actorRect.h);
    target.strokeStyle = "#f1b45c";
    target.setLineDash([3, 3]);
    target.strokeRect(actorRect.x, actorRect.y, actorRect.w, actorRect.h);
    target.setLineDash([]);
    target.fillStyle = "#f1b45c";
    target.fillText("occlusion?", clamp(actorRect.x + 4, 4, scene.width - 100), Math.max(14, actorRect.y - 4));
  });
  entries.forEach((entry, index) => {
    const item = entry.item;
    const baseline = entry.baseline;
    const color = entry.kind === "layer" ? "#f1b45c" : (colors[item.kind] || "#eef2f7");
    const x = entry.span.start;
    const w = entry.span.end - entry.span.start;
    target.strokeStyle = color;
    target.globalAlpha = 0.86;
    target.setLineDash([5, 4]);
    target.beginPath();
    target.moveTo(Math.max(0, x - 16), baseline + 0.5);
    target.lineTo(Math.min(scene.width, x + w + 16), baseline + 0.5);
    target.stroke();
    target.setLineDash([]);
    target.fillStyle = color;
    target.globalAlpha = 1;
    target.fillText(`${index + 1} ${item.name || item.id} (${Math.round(baseline)})`, clamp(x + 4, 4, scene.width - 180), Math.max(14, baseline - 3));
  });
  target.restore();
}

function dialogueAnchorFor(scene, object) {
  if (!object) return null;
  if (object.kind === "dialogue") return object;
  const objectWords = dialogueMatchWords(object.name);
  return (scene.objects || []).find((candidate) => {
    if (candidate.kind !== "dialogue") return false;
    const candidateWords = dialogueMatchWords(candidate.name);
    return candidateWords.some((word) => objectWords.includes(word));
  }) || null;
}

function dialogueMatchWords(text) {
  const ignored = new Set(["anchor", "bubble", "dialogue", "hotspot", "interaction", "text", "the"]);
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length > 2 && !ignored.has(word));
}

function makeDialogueBubble(scene, object, text) {
  if (!object || !text) return null;
  return {
    objectId: object.id,
    speaker: object.name,
    text,
    anchorId: dialogueAnchorFor(scene, object)?.id || null,
  };
}

function dialogueBubbleBox(target, scene, bubble) {
  const object = (scene.objects || []).find((item) => item.id === bubble.objectId);
  const anchor = (scene.objects || []).find((item) => item.id === bubble.anchorId) || dialogueAnchorFor(scene, object);
  const source = anchor || object;
  if (!source) return null;
  target.font = "14px Segoe UI";
  const maxWidth = Math.min(340, Math.max(220, scene.width - 32));
  const lines = wrapCanvasText(target, bubble.text, maxWidth - 28);
  const width = Math.min(maxWidth, Math.max(190, ...lines.map((line) => target.measureText(line).width + 28)));
  const height = 34 + lines.length * 19;
  const sourceCenter = source.x + source.w / 2;
  const sourceTop = source.y;
  const y = clamp(sourceTop - height - 16, 12, Math.max(12, scene.height - height - 12));
  const x = clamp(sourceCenter - width / 2, 12, Math.max(12, scene.width - width - 12));
  return { x, y, width, height, lines, stemX: clamp(sourceCenter, x + 22, x + width - 22), stemY: sourceTop };
}

function drawDialogueBubble(target, scene, bubble) {
  if (!bubble?.text) return;
  target.save();
  const box = dialogueBubbleBox(target, scene, bubble);
  if (!box) {
    target.restore();
    return;
  }
  target.fillStyle = "rgba(10, 12, 16, 0.92)";
  target.strokeStyle = "#f1b45c";
  target.lineWidth = 2;
  target.beginPath();
  target.roundRect(box.x, box.y, box.width, box.height, 10);
  target.fill();
  target.stroke();
  target.beginPath();
  target.moveTo(box.stemX - 8, box.y + box.height - 1);
  target.lineTo(box.stemX, Math.min(box.stemY, box.y + box.height + 16));
  target.lineTo(box.stemX + 8, box.y + box.height - 1);
  target.closePath();
  target.fill();
  target.stroke();
  target.fillStyle = "#f1b45c";
  target.font = "600 12px Segoe UI";
  target.fillText(bubble.speaker || "Dialogue", box.x + 14, box.y + 18);
  target.fillStyle = "#eef2f7";
  target.font = "14px Segoe UI";
  box.lines.forEach((line, index) => target.fillText(line, box.x + 14, box.y + 40 + index * 19));
  target.restore();
}

function wrapCanvasText(target, text, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const trial = line ? `${line} ${word}` : word;
    if (target.measureText(trial).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = trial;
    }
  });
  if (line) lines.push(line);
  return lines.length ? lines.slice(0, 4) : [""];
}

function drawGrid(target, scene) {
  const size = project.editor?.gridSize || 16;
  target.save();
  target.strokeStyle = "rgba(238,242,247,0.09)";
  target.lineWidth = 1;
  for (let x = size; x < scene.width; x += size) {
    target.beginPath();
    target.moveTo(x + 0.5, 0);
    target.lineTo(x + 0.5, scene.height);
    target.stroke();
  }
  for (let y = size; y < scene.height; y += size) {
    target.beginPath();
    target.moveTo(0, y + 0.5);
    target.lineTo(scene.width, y + 0.5);
    target.stroke();
  }
  target.restore();
}

function drawBaseLayers(target, scene) {
  scene.layers
    .filter((layer) => layer.visible && !isDepthSortedLayer(layer))
    .sort((a, b) => a.depth - b.depth)
    .forEach((layer) => drawLayer(target, layer, scene));
}

function sortedDepthRenderables(scene) {
  const entries = [
    ...scene.layers.filter((layer) => layer.visible && isDepthSortedLayer(layer)).map((layer, index) => ({ kind: "layer", item: layer, index })),
    ...scene.objects.filter((object) => object.kind !== "walkable").map((object, index) => ({ kind: "object", item: object, index: index + 1000 })),
  ];
  return entries.sort((a, b) => renderableBaseline(a.item, scene) - renderableBaseline(b.item, scene) || a.index - b.index);
}

function collectDepthQa(scene = activeScene()) {
  const entries = sortedDepthRenderables(scene).map((entry, order) => ({
    order: order + 1,
    kind: entry.kind,
    item: entry.item,
    id: entry.item.id,
    name: entry.item.name || entry.item.id,
    label: depthEntryLabel(entry),
    baseline: renderableBaseline(entry.item, scene),
    span: renderableSpan(entry.item, scene),
    target: depthEntryTarget(scene, entry),
  }));
  const conflicts = [];
  for (let index = 1; index < entries.length; index += 1) {
    const previous = entries[index - 1];
    const current = entries[index];
    const distance = Math.abs(current.baseline - previous.baseline);
    if (distance <= 12 && spansOverlap(previous.span, current.span)) {
      conflicts.push({
        sceneId: scene.id,
        sceneName: scene.name,
        severity: distance <= 4 ? "error" : "warning",
        message: `${scene.name}: ${previous.name} and ${current.name} baselines are ${Math.round(distance)}px apart.`,
        distance,
        first: previous,
        second: current,
        target: previous.kind === "object" ? previous.target : current.target,
      });
    }
  }
  return { scene, entries, conflicts };
}

function collectProjectDepthQa() {
  return project.scenes.map((scene) => collectDepthQa(scene));
}

function collectOcclusionQa(scene = activeScene()) {
  const warnings = [];
  const occluders = (scene.layers || []).filter((layer) => layer.visible !== false && (layer.type === "occlusion" || layer.type === "foreground"));
  const actors = (scene.objects || []).filter((object) => object.kind === "character");
  actors.forEach((actor) => {
    const actorBaseline = renderableBaseline(actor, scene);
    occluders.forEach((layer) => {
      const layerBaseline = renderableBaseline(layer, scene);
      if (actorBaseline >= layerBaseline) return;
      const layerRect = renderableRect(layer, scene);
      const bodyRect = actorBodyRect(actor);
      if (!rectsOverlap(bodyRect, layerRect)) {
        warnings.push({
          sceneId: scene.id,
          sceneName: scene.name,
          severity: "warning",
          message: `${scene.name}: ${actor.name} is depth-sorted behind ${layer.name || layer.type}, but that occlusion layer does not cover the actor body.`,
          actor,
          layer,
          target: { tab: "editor", sceneId: scene.id, objectId: actor.id },
        });
      }
    });
  });
  return warnings;
}

function depthEntryLabel(entry) {
  return entry.kind === "layer" ? `layer:${entry.item.type}` : entry.item.kind;
}

function depthEntryTarget(scene, entry) {
  const target = { tab: "editor", sceneId: scene.id };
  if (entry.kind === "object") target.objectId = entry.item.id;
  if (entry.kind === "layer") target.layerId = entry.item.id;
  return target;
}

function renderableSpan(item, scene) {
  const x = Number(item.x ?? 0);
  const w = Number(item.w ?? scene.width);
  return { start: x, end: x + w };
}

function renderableRect(item, scene) {
  return {
    x: Number(item.x ?? 0),
    y: Number(item.y ?? 0),
    w: Number(item.w ?? scene.width),
    h: Number(item.h ?? scene.height),
  };
}

function actorBodyRect(actor) {
  return {
    x: Number(actor.x || 0),
    y: Number(actor.y || 0) + Number(actor.h || 0) * 0.2,
    w: Number(actor.w || 0),
    h: Number(actor.h || 0) * 0.8,
  };
}

function spansOverlap(a, b) {
  return Math.max(a.start, b.start) <= Math.min(a.end, b.end);
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function renderableBaseline(item, scene = activeScene()) {
  if (Number.isFinite(Number(item.baseline))) return Number(item.baseline);
  if (item.kind) return Number(item.y || 0) + Number(item.h || 0);
  return defaultLayerBaseline(item, scene);
}

function defaultLayerBaseline(layer, scene = activeScene()) {
  if (layer.type === "foreground") return Number(layer.y ?? scene.height - 114) + Number(layer.h ?? 60);
  if (layer.type === "prop" || layer.type === "occlusion") return Number(layer.y ?? 0) + Number(layer.h ?? scene.height);
  return Number(layer.depth || 0);
}

function isDepthSortedLayer(layer) {
  return layer.type === "foreground" || layer.type === "prop" || layer.type === "occlusion";
}

function drawLayer(target, layer, scene = activeScene()) {
  target.save();
  if (layer.image) {
    target.globalAlpha = layer.opacity ?? 1;
    target.drawImage(layer.image, layer.x || 0, layer.y || 0, layer.w || scene.width, layer.h || scene.height);
    target.restore();
    return;
  }
  if (layer.type === "background") {
    target.fillStyle = layer.color;
    target.fillRect(0, 0, 960, 540);
    target.fillStyle = "rgba(255,255,255,0.08)";
    for (let i = 0; i < 42; i++) target.fillRect((i * 67) % 940, (i * 31) % 170, 2, 2);
  }
  if (layer.type === "midground") {
    target.fillStyle = layer.color;
    for (let x = -20; x < 980; x += 80) {
      target.beginPath();
      target.moveTo(x, 320);
      target.lineTo(x + 40, 130);
      target.lineTo(x + 88, 320);
      target.closePath();
      target.fill();
    }
  }
  if (layer.type === "prop") {
    target.fillStyle = layer.color;
    target.fillRect(642, 330, 92, 76);
    target.beginPath();
    target.arc(688, 326, 58, Math.PI, 0);
    target.strokeStyle = "#b7aea4";
    target.lineWidth = 10;
    target.stroke();
    target.fillStyle = "#17191e";
    target.beginPath();
    target.ellipse(688, 352, 42, 16, 0, 0, Math.PI * 2);
    target.fill();
  }
  if (layer.type === "foreground") {
    target.globalAlpha = 0.16;
    target.fillStyle = layer.color;
    target.fillRect(0, 426, 960, 60);
  }
  target.restore();
}

function drawObject(target, object, selected, scene = activeScene()) {
  const color = colors[object.kind] || "#fff";
  const showOverlays = project.editor?.hitboxesVisible !== false || selected;
  const showLabels = project.editor?.labelsVisible !== false || selected;
  target.save();
  target.lineWidth = selected ? 4 : 2;
  target.strokeStyle = selected ? colors.selected : color;
  target.fillStyle = hexToRgba(color, object.kind === "walkable" ? 0.12 : 0.18);

  if (object.kind === "character") {
    const model = project.assets.characters.find((item) => item.id === object.modelId);
    const frame = currentRuntimeFrame(model, object.animationState || "idle");
    if (frame?.image) {
      target.drawImage(frame.image, object.x, object.y, object.w, object.h);
    } else {
      if (showOverlays) target.fillRect(object.x, object.y, object.w, object.h);
      target.fillStyle = "#d9e7ff";
      target.beginPath();
      target.arc(object.x + object.w / 2, object.y + 24, 20, 0, Math.PI * 2);
      target.fill();
    }
  } else if (object.kind === "dialogue") {
    if (showOverlays) {
      target.beginPath();
      target.roundRect(object.x, object.y, object.w, object.h, 8);
      target.fill();
    }
  } else {
    if (showOverlays) target.fillRect(object.x, object.y, object.w, object.h);
  }

  if (showOverlays) target.strokeRect(object.x, object.y, object.w, object.h);
  if (selected && object.kind !== "walkable") {
    const baseline = renderableBaseline(object, scene);
    target.strokeStyle = "#57c7a2";
    target.setLineDash([6, 4]);
    target.beginPath();
    target.moveTo(object.x - 12, baseline);
    target.lineTo(object.x + object.w + 12, baseline);
    target.stroke();
    target.setLineDash([]);
  }
  if (selected) drawResizeHandles(target, object);
  if (showLabels) {
    target.fillStyle = color;
    target.font = "13px Segoe UI";
    target.fillText(object.name, object.x + 6, Math.max(16, object.y - 6));
  }
  target.restore();
}

function currentRuntimeFrame(model, stateName = "idle") {
  if (!model?.frames?.length) return null;
  const state = model.animations?.[stateName] || model.animations?.idle;
  if (!state?.frames?.length) return model.frames[0];
  const fps = Math.max(1, Number(state.fps) || 4);
  const elapsed = performance.now() / 1000;
  const stateIndex = state.loop === false ? Math.min(state.frames.length - 1, Math.floor(elapsed * fps)) : Math.floor(elapsed * fps) % state.frames.length;
  return model.frames[state.frames[stateIndex]] || model.frames[0];
}

function drawResizeHandles(target, object) {
  target.save();
  target.fillStyle = "#eef2f7";
  target.strokeStyle = "#101216";
  target.lineWidth = 2;
  resizeHandles(object).forEach((handle) => {
    target.fillRect(handle.x - 4, handle.y - 4, 8, 8);
    target.strokeRect(handle.x - 4, handle.y - 4, 8, 8);
  });
  target.restore();
}

function resizeHandles(object) {
  const midX = object.x + object.w / 2;
  const midY = object.y + object.h / 2;
  const right = object.x + object.w;
  const bottom = object.y + object.h;
  return [
    { id: "nw", x: object.x, y: object.y, cursor: "nwse-resize" },
    { id: "n", x: midX, y: object.y, cursor: "ns-resize" },
    { id: "ne", x: right, y: object.y, cursor: "nesw-resize" },
    { id: "e", x: right, y: midY, cursor: "ew-resize" },
    { id: "se", x: right, y: bottom, cursor: "nwse-resize" },
    { id: "s", x: midX, y: bottom, cursor: "ns-resize" },
    { id: "sw", x: object.x, y: bottom, cursor: "nesw-resize" },
    { id: "w", x: object.x, y: midY, cursor: "ew-resize" },
  ];
}

function resizeHandleAt(object, x, y) {
  return resizeHandles(object).find((handle) => Math.abs(x - handle.x) <= 7 && Math.abs(y - handle.y) <= 7) || null;
}

function resizeObjectFromHandle(object, handleId, startBox, point, scene) {
  const minSize = 8;
  const snapped = snapPoint(point);
  let left = startBox.x;
  let top = startBox.y;
  let right = startBox.x + startBox.w;
  let bottom = startBox.y + startBox.h;
  if (handleId.includes("w")) left = clamp(snapped.x, 0, right - minSize);
  if (handleId.includes("e")) right = clamp(snapped.x, left + minSize, scene.width);
  if (handleId.includes("n")) top = clamp(snapped.y, 0, bottom - minSize);
  if (handleId.includes("s")) bottom = clamp(snapped.y, top + minSize, scene.height);
  object.x = left;
  object.y = top;
  object.w = right - left;
  object.h = bottom - top;
  if (object.kind !== "walkable") object.baseline = object.y + object.h;
}

function snapValue(value) {
  const size = project.editor?.gridSize || 16;
  return project.editor?.snapToGrid ? Math.round(value / size) * size : value;
}

function snapPoint(point) {
  return { x: snapValue(point.x), y: snapValue(point.y) };
}

function snapBox(object, scene = activeScene()) {
  if (!project.editor?.snapToGrid) return;
  object.x = clamp(snapValue(object.x), 0, scene.width - object.w);
  object.y = clamp(snapValue(object.y), 0, scene.height - object.h);
  object.w = Math.max(8, snapValue(object.w));
  object.h = Math.max(8, snapValue(object.h));
  if (object.x + object.w > scene.width) object.w = scene.width - object.x;
  if (object.y + object.h > scene.height) object.h = scene.height - object.y;
  if (object.kind !== "walkable") object.baseline = object.y + object.h;
}

function objectAt(x, y, scene = activeScene()) {
  return sortedDepthRenderables(scene)
    .filter((entry) => entry.kind === "object")
    .map((entry) => entry.item)
    .reverse()
    .find((object) => x >= object.x && x <= object.x + object.w && y >= object.y && y <= object.y + object.h);
}

function canvasPoint(event, canvas = stage) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height),
  };
}

stage.addEventListener("pointerdown", (event) => {
  const point = canvasPoint(event);
  const scene = activeScene();
  if (activeTool === "select") {
    const selectedObject = scene.objects.find((item) => item.id === selectedId);
    const handle = selectedObject && !selectedObject.locked ? resizeHandleAt(selectedObject, point.x, point.y) : null;
    if (handle) {
      commitHistory(`Resize ${selectedObject.name}`);
      drag = {
        mode: "resize",
        id: selectedObject.id,
        handle: handle.id,
        startBox: pickObjectGeometry(selectedObject),
      };
      stage.style.cursor = handle.cursor;
      event.preventDefault();
      return;
    }
    const object = objectAt(point.x, point.y);
    selectedId = object?.id || null;
    if (object && !object.locked) {
      commitHistory(`Move ${object.name}`);
      drag = { mode: "move", id: object.id, dx: point.x - object.x, dy: point.y - object.y, baselineOffset: renderableBaseline(object, scene) - object.y };
    }
    renderAll();
    return;
  }

  commitHistory(`Draw ${activeTool}`);
  const snappedStart = snapPoint(point);
  const object = {
    id: uid(activeTool),
    kind: activeTool,
    name: defaultName(activeTool),
    x: snappedStart.x,
    y: snappedStart.y,
    w: activeTool === "dialogue" ? 44 : 1,
    h: activeTool === "dialogue" ? 30 : 1,
  };
  if (activeTool === "character") {
    object.w = 64;
    object.h = 132;
    object.animationState = "idle";
    object.dialogue = "New character line.";
    object.animationBible = {
      idle: "Define character-specific idle.",
      walk: "Define movement mechanics.",
      talk: "Define speech posture.",
      waiting: "Define input-needed posture.",
      failed: "Define failure reaction.",
    };
  }
  if (activeTool === "hitbox") object.dialogue = "Interaction text.";
  if (activeTool === "dialogue") object.text = "Dialogue anchor.";
  if (activeTool === "walkable") object.note = "Walkable region.";
  if (activeTool !== "walkable") object.baseline = object.y + object.h;
  scene.objects.push(object);
  selectedId = object.id;
  drag = { mode: "draw", id: object.id, startX: snappedStart.x, startY: snappedStart.y };
  renderAll();
});

stage.addEventListener("pointermove", (event) => {
  const point = canvasPoint(event);
  const scene = activeScene();
  if (!drag && activeTool === "select") {
    const selectedObject = scene.objects.find((item) => item.id === selectedId);
    const handle = selectedObject && !selectedObject.locked ? resizeHandleAt(selectedObject, point.x, point.y) : null;
    stage.style.cursor = handle?.cursor || "default";
    return;
  }
  if (!drag) return;
  const object = scene.objects.find((item) => item.id === drag.id);
  if (!object) return;

  if (drag.mode === "move") {
    object.x = clamp(snapValue(point.x - drag.dx), 0, scene.width - object.w);
    object.y = clamp(snapValue(point.y - drag.dy), 0, scene.height - object.h);
    if (object.kind !== "walkable") object.baseline = object.y + drag.baselineOffset;
  } else if (drag.mode === "resize") {
    resizeObjectFromHandle(object, drag.handle, drag.startBox, point, scene);
  } else {
    const snapped = snapPoint(point);
    object.x = Math.min(drag.startX, snapped.x);
    object.y = Math.min(drag.startY, snapped.y);
    object.w = Math.max(8, Math.abs(snapped.x - drag.startX));
    object.h = Math.max(8, Math.abs(snapped.y - drag.startY));
    if (object.kind !== "walkable") object.baseline = object.y + object.h;
  }
  renderAll();
});

window.addEventListener("pointerup", () => {
  drag = null;
  stage.style.cursor = "default";
});

window.addEventListener("keydown", (event) => {
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
  const scene = activeScene();
  const object = scene.objects.find((item) => item.id === selectedId);
  if (!object || object.locked) return;
  commitHistory(`Nudge ${object.name}`);
  const step = project.editor?.snapToGrid ? (project.editor.gridSize || 16) : (event.shiftKey ? 10 : 1);
  const beforeY = object.y;
  if (event.key === "ArrowLeft") object.x = clamp(object.x - step, 0, scene.width - object.w);
  if (event.key === "ArrowRight") object.x = clamp(object.x + step, 0, scene.width - object.w);
  if (event.key === "ArrowUp") object.y = clamp(object.y - step, 0, scene.height - object.h);
  if (event.key === "ArrowDown") object.y = clamp(object.y + step, 0, scene.height - object.h);
  if (object.kind !== "walkable") object.baseline += object.y - beforeY;
  event.preventDefault();
  renderAll();
});

document.querySelectorAll(".tool").forEach((button) => {
  button.onclick = () => {
    activeTool = button.dataset.tool;
    document.querySelectorAll(".tool").forEach((candidate) => candidate.classList.toggle("active", candidate === button));
    setHint(toolHint(activeTool));
  };
});

$("projectName").oninput = () => {
  project.name = $("projectName").value;
  project.slug = slug(project.name);
  $("projectSlug").value = project.slug;
  renderHandoffSummary();
  scheduleAutosave();
};

$("projectSlug").oninput = () => {
  project.slug = slug($("projectSlug").value);
  $("projectSlug").value = project.slug;
  renderHandoffSummary();
  scheduleAutosave();
};

$("exportTarget").onchange = () => {
  commitHistory("Change export target");
  project.export.target = $("exportTarget").value;
  renderHandoffSummary();
  scheduleAutosave();
};

$("exportDebug").onchange = () => {
  commitHistory("Change export debug mode");
  project.export.debug = $("exportDebug").value;
  renderHandoffSummary();
  scheduleAutosave();
};

$("sceneName").oninput = () => {
  const scene = activeScene();
  if (scene.locked) return;
  scene.name = $("sceneName").value;
  renderSceneList();
  scheduleAutosave();
};

$("addScene").onclick = () => {
  commitHistory("Add scene");
  const scene = {
    id: uid("scene"),
    name: "New Scene",
    width: 960,
    height: 540,
    background: "#222831",
    layers: [{ id: uid("layer"), name: "Background", type: "background", depth: 0, visible: true, color: "#222831" }],
    objects: [],
    dialogue: [],
    flags: [],
  };
  project.scenes.push(scene);
  project.activeSceneId = scene.id;
  selectedId = null;
  renderAll();
};

$("duplicateScene").onclick = () => {
  const source = activeScene();
  commitHistory(`Duplicate scene ${source.name}`);
  const scene = duplicateScene(source);
  project.scenes.push(scene);
  project.activeSceneId = scene.id;
  selectedId = null;
  selectedDialogueId = scene.dialogue[0]?.id || null;
  renderAll();
  setHint(`Duplicated ${source.name}.`);
};

$("deleteScene").onclick = () => {
  const scene = activeScene();
  if (project.scenes.length <= 1) {
    setHint("A project needs at least one scene.");
    return;
  }
  if (scene.locked) {
    setHint(`${scene.name} is locked. Unlock it before deleting.`);
    return;
  }
  commitHistory(`Delete scene ${scene.name}`);
  const sceneIndex = project.scenes.findIndex((candidate) => candidate.id === scene.id);
  project.scenes = project.scenes.filter((candidate) => candidate.id !== scene.id);
  project.scenes.forEach((candidate) => {
    candidate.objects.forEach((object) => {
      if (object.targetSceneId === scene.id) object.targetSceneId = "";
    });
  });
  const nextScene = project.scenes[Math.max(0, sceneIndex - 1)] || project.scenes[0];
  project.activeSceneId = nextScene.id;
  selectedId = null;
  selectedDialogueId = nextScene.dialogue[0]?.id || null;
  renderAll();
  setHint(`Deleted ${scene.name} and cleared exits that targeted it.`);
};

$("lockScene").onclick = () => {
  const scene = activeScene();
  commitHistory(`${scene.locked ? "Unlock" : "Lock"} scene ${scene.name}`);
  scene.locked = !scene.locked;
  renderAll();
};

$("sceneWidth").oninput = () => scheduleSceneSizeUpdate();
$("sceneHeight").oninput = () => scheduleSceneSizeUpdate();
$("sceneWidth").onchange = () => updateSceneSize();
$("sceneHeight").onchange = () => updateSceneSize();
$("sceneBackground").onchange = () => {
  const scene = activeScene();
  if (scene.locked) return;
  commitHistory(`Edit ${scene.name} background`);
  scene.background = $("sceneBackground").value;
  const backgroundLayer = scene.layers.find((layer) => layer.type === "background" && !layer.dataUrl);
  if (backgroundLayer && !backgroundLayer.locked) backgroundLayer.color = scene.background;
  renderAll();
};

$("addLayer").onclick = () => {
  commitHistory("Add layer");
  const scene = activeScene();
  scene.layers.push({
    id: uid("layer"),
    name: "New layer",
    type: "midground",
    depth: scene.layers.length * 10,
    visible: true,
    color: "#556070",
  });
  renderAll();
};

$("importBackground").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  commitHistory(`Import background ${file.name}`);
  const layer = await imageFileToLayer(file, {
    id: "background-plate",
    name: file.name.replace(/\.[^.]+$/, ""),
    type: "background",
    depth: -10,
  });
  const scene = activeScene();
  const existingIndex = scene.layers.findIndex((candidate) => candidate.type === "background");
  if (existingIndex >= 0 && !scene.layers[existingIndex].locked) scene.layers[existingIndex] = layer;
  else scene.layers.unshift(layer);
  setHint(`Imported ${file.name} as the scene background plate.`);
  renderAll();
};

$("importSceneLayer").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  commitHistory(`Import foreground ${file.name}`);
  const scene = activeScene();
  const layer = await imageFileToLayer(file, {
    id: uid("layer"),
    name: file.name.replace(/\.[^.]+$/, ""),
    type: "foreground",
    depth: 90 + scene.layers.length,
    baseline: scene.height - 54,
  });
  scene.layers.push(layer);
  setHint(`Imported ${file.name} as a foreground/occlusion layer.`);
  renderAll();
};

$("newProject").onclick = () => {
  commitHistory("New project");
  project = structuredClone(sampleProject);
  selectedId = null;
  renderAll();
};

$("exportJson").onclick = () => {
  download(`${slug(project.name)}.adventureforge.json`, JSON.stringify(serializableProject(), null, 2));
};

$("exportPlayable").onclick = () => {
  downloadHtml(`${slug(project.name)}.playable.html`, buildPlayableHtml(serializableProject()));
};

$("exportPackage").onclick = () => {
  const filename = `${slug(project.name)}.${project.export.target}.package.json`;
  download(filename, JSON.stringify(buildExportPackage(serializableProject()), null, 2));
};

$("saveLocal").onclick = () => {
  saveLocalProject("Saved locally");
  setHint("Project saved to this browser.");
};

$("restoreLocal").onclick = async () => {
  await restoreLocalProject(true);
};

$("clearLocal").onclick = () => {
  clearLocalProject();
};

$("importJson").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  commitHistory(`Import project ${file.name}`);
  project = JSON.parse(await file.text());
  normalizeProject();
  await hydrateAssetImages();
  selectedId = null;
  renderAll();
};

$("importFrames").onchange = async (event) => {
  const files = [...event.target.files].filter((file) => file.type === "image/png" || file.name.toLowerCase().endsWith(".png"));
  if (!files.length) return;
  const selectedModel = getSelectedModel();
  const appending = selectedModel && !selectedModel.locked;
  commitHistory(`${appending ? "Append" : "Import"} ${files.length} frame(s)`);
  const modelName = inferModelName(files[0].name);
  const model = appending ? selectedModel : {
    id: uid("model"),
    name: modelName,
    role: "character",
    status: "provisional",
    locked: false,
    registration: { canvas: null, anchor: null, baseline: null },
    frames: [],
    timelineHitboxes: [],
  };
  for (const file of files) {
    const dataUrl = await fileToDataUrl(file);
    const image = await loadImage(dataUrl);
    model.registration.canvas ||= { width: image.naturalWidth, height: image.naturalHeight };
    model.registration.anchor ||= [Math.round(image.naturalWidth / 2), image.naturalHeight];
    model.registration.baseline ||= image.naturalHeight;
    model.frames.push({
      id: uid("frame"),
      name: file.name,
      width: image.naturalWidth,
      height: image.naturalHeight,
      alphaBounds: analyzeFrameAlpha(image),
      dataUrl,
      image,
    });
  }
  if (!appending) {
    model.animations = defaultAnimations(model.frames.length);
    project.assets.characters.push(model);
  } else {
    repairModelAnimations(model);
  }
  selectedAssetId = model.id;
  $("assetImportLog").textContent = `${appending ? "Appended" : "Imported"} ${files.length} transparent PNG frame(s) ${appending ? "to" : "as"} ${model.name}.`;
  event.target.value = "";
  renderAll();
};

$("importSpriteSheet").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const frameW = Number($("sheetFrameW").value);
  const frameH = Number($("sheetFrameH").value);
  if (!Number.isInteger(frameW) || !Number.isInteger(frameH) || frameW < 1 || frameH < 1) {
    $("assetImportLog").textContent = "Enter sprite-sheet frame width and height before importing.";
    event.target.value = "";
    return;
  }
  const frames = await splitSpriteSheetFile(file, frameW, frameH);
  if (!frames.length) {
    $("assetImportLog").textContent = "No complete frames were found in that sprite sheet.";
    event.target.value = "";
    return;
  }
  const selectedModel = getSelectedModel();
  const appending = selectedModel && !selectedModel.locked;
  const stateName = normalizeAnimationStateName($("sheetStateName").value) || inferStateName(file.name) || "idle";
  commitHistory(`${appending ? "Append" : "Import"} sprite sheet ${file.name}`);
  const model = appending ? selectedModel : {
    id: uid("model"),
    name: inferModelName(file.name),
    role: "character",
    status: "provisional",
    locked: false,
    registration: { canvas: { width: frameW, height: frameH }, anchor: [Math.round(frameW / 2), frameH], baseline: frameH },
    frames: [],
    animations: defaultAnimations(0),
    timelineHitboxes: [],
  };
  const startIndex = model.frames.length;
  frames.forEach((frame, index) => model.frames.push({
    id: uid("frame"),
    name: `${file.name.replace(/\.png$/i, "")}_${String(index + 1).padStart(2, "0")}.png`,
    width: frameW,
    height: frameH,
    alphaBounds: frame.alphaBounds,
    dataUrl: frame.dataUrl,
    image: frame.image,
    sourceSheet: file.name,
  }));
  model.registration.canvas ||= { width: frameW, height: frameH };
  model.registration.anchor ||= [Math.round(frameW / 2), frameH];
  model.registration.baseline ||= frameH;
  ensureAnimationState(model, stateName, frames.map((_, index) => startIndex + index));
  repairModelAnimations(model);
  repairTimelineHitboxes(model);
  if (!appending) project.assets.characters.push(model);
  selectedAssetId = model.id;
  selectedAnimationState = stateName;
  $("assetImportLog").textContent = `Imported ${frames.length} frame(s) from ${file.name} into ${model.name} / ${stateName}.`;
  event.target.value = "";
  renderAll();
};

$("importScript").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  project.script.sourceName = file.name;
  project.script.text = await file.text();
  $("scriptText").value = project.script.text;
  renderScriptSyncLog([{ ok: true, text: `Imported ${file.name}.` }]);
};

$("scriptText").oninput = () => {
  project.script.text = $("scriptText").value;
  pendingScriptSyncPlan = null;
  renderHandoffSummary();
  scheduleAutosave();
};

$("previewScriptSync").onclick = () => {
  project.script.text = $("scriptText").value;
  pendingScriptSyncPlan = buildScriptSyncPlan(project.script.text);
  renderScriptSyncLog(pendingScriptSyncPlan.results, pendingScriptSyncPlan);
  renderHandoffSummary();
};

$("syncScript").onclick = () => {
  project.script.text = $("scriptText").value;
  pendingScriptSyncPlan ||= buildScriptSyncPlan(project.script.text);
  commitHistory("Sync script");
  const selectedCount = pendingScriptSyncPlan.actions.filter((action) => action.ok && action.selected).length;
  const results = applyScriptSyncPlan(pendingScriptSyncPlan, true);
  project.script.lastSyncedAt = new Date().toISOString();
  project.script.lastSyncPlan = summarizeScriptSyncPlan(pendingScriptSyncPlan);
  pendingScriptSyncPlan = null;
  selectedDialogueId = activeScene().dialogue[0]?.id || selectedDialogueId;
  renderAll();
  renderScriptSyncLog(results);
  setHint(`Applied ${selectedCount} selected script sync action(s).`);
};

$("exportScript").onclick = () => {
  const script = composeScriptFromProject();
  project.script.text = script;
  $("scriptText").value = script;
  downloadScript(`${project.slug || slug(project.name)}.script.txt`, script);
};

$("addDialogueNode").onclick = () => {
  commitHistory("Add dialogue node");
  const scene = activeScene();
  const node = {
    id: uid("dialogue-node"),
    speaker: "New Speaker",
    line: "New dialogue line.",
    choices: [],
  };
  scene.dialogue.push(node);
  selectedDialogueId = node.id;
  renderAll();
};

$("layoutDialogue").onclick = () => {
  renderDialogueGraph();
  setHint("Dialogue graph layout refreshed.");
};

$("toggleOnionSkin").onclick = () => {
  stopAnimationState(false);
  onionSkinEnabled = !onionSkinEnabled;
  drawFramePreview(getSelectedModel());
};

$("addModel").onclick = () => {
  commitHistory("Add character model");
  const model = createEmptyModel(nextModelName("New Character"));
  project.assets.characters.push(model);
  selectedAssetId = model.id;
  selectedAnimationHitboxId = null;
  renderAll();
  setHint(`Added model ${model.name}.`);
};

$("deleteModel").onclick = () => {
  const model = getSelectedModel();
  if (!model) return;
  const usedBy = modelUsage(model.id);
  if (usedBy.length) {
    setHint(`${model.name} is used by ${usedBy.map((entry) => `${entry.scene}: ${entry.object}`).join(", ")}. Remove those placements first.`);
    return;
  }
  commitHistory(`Delete model ${model.name}`);
  project.assets.characters = project.assets.characters.filter((candidate) => candidate.id !== model.id);
  selectedAssetId = project.assets.characters[0]?.id || null;
  renderAll();
};

function updateModelIdentityFromControls(commit = false) {
  const model = getSelectedModel();
  if (!model || model.locked) return;
  const name = $("modelName").value.trim() || "Unnamed Model";
  const role = $("modelRole").value.trim() || "character";
  const changed = name !== model.name || role !== model.role;
  if (!changed) return;
  if (commit) commitHistory(`Edit model ${model.name}`);
  model.name = name;
  model.role = role;
  renderAssetLists();
  renderQaSummary();
  renderHandoffSummary();
  scheduleAutosave();
}

$("modelName").oninput = () => updateModelIdentityFromControls(false);
$("modelRole").oninput = () => updateModelIdentityFromControls(false);
$("modelName").onchange = () => updateModelIdentityFromControls(true);
$("modelRole").onchange = () => updateModelIdentityFromControls(true);

$("lockModel").onclick = () => {
  const model = getSelectedModel();
  if (!model) return;
  commitHistory(`${model.locked ? "Unlock" : "Lock"} model ${model.name}`);
  model.locked = !model.locked;
  drawFramePreview(model);
  renderAssetLists();
  renderQaSummary();
  renderHandoffSummary();
};

$("modelStatus").oninput = () => {
  const model = getSelectedModel();
  if (!model) return;
  commitHistory(`Set model status ${model.name}`);
  model.status = $("modelStatus").value;
  renderAssetLists();
  renderQaSummary();
  renderHandoffSummary();
};

["anchorX", "anchorY", "modelBaseline"].forEach((id) => {
  $(id).oninput = () => {
    const model = getSelectedModel();
    if (!model || model.locked) {
      drawFramePreview(model);
      return;
    }
    model.registration.anchor = [Number($("anchorX").value), Number($("anchorY").value)];
    model.registration.baseline = Number($("modelBaseline").value);
    drawFramePreview(model);
    renderQaSummary();
    renderHandoffSummary();
  };
});

function handleAnimationStateChange() {
  const nextState = $("animationState").value;
  if (statePlaybackTimer) window.clearTimeout(statePlaybackTimer);
  statePlaybackTimer = null;
  selectedAnimationState = nextState;
  statePlaybackIndex = 0;
  selectedAnimationHitboxId = null;
  renderAnimationStateEditor(getSelectedModel());
  drawFramePreview(getSelectedModel());
}

$("animationState").oninput = handleAnimationStateChange;
$("animationState").onchange = handleAnimationStateChange;

$("addAnimationState").onclick = () => {
  const model = getSelectedModel();
  if (!model || model.locked) return;
  const stateName = normalizeAnimationStateName($("newAnimationState").value);
  if (!stateName) {
    setHint("Enter a state name like stamp, inspect, or pickup.");
    return;
  }
  commitHistory(`Add ${stateName} animation state`);
  selectedAnimationState = ensureAnimationState(model, stateName);
  $("newAnimationState").value = "";
  renderAnimationStateEditor(model);
  drawFramePreview(model);
  renderQaSummary();
  renderHandoffSummary();
};

$("deleteAnimationState").onclick = () => {
  const model = getSelectedModel();
  if (!model || model.locked || protectedAnimationStates.has(selectedAnimationState)) return;
  commitHistory(`Delete ${selectedAnimationState} animation state`);
  delete model.animations[selectedAnimationState];
  model.timelineHitboxes = (model.timelineHitboxes || []).filter((box) => box.state !== selectedAnimationState);
  project.scenes.forEach((scene) => scene.objects.forEach((object) => {
    if (object.modelId === model.id && object.animationState === selectedAnimationState) object.animationState = "idle";
  }));
  selectedAnimationState = "idle";
  selectedAnimationHitboxId = null;
  repairModelAnimations(model);
  renderAll();
};

["stateFrames", "stateFps", "stateLoop"].forEach((id) => {
  $(id).oninput = updateAnimationStateFromControls;
  $(id).onchange = updateAnimationStateFromControls;
});

$("assignAllFrames").onclick = () => {
  const model = getSelectedModel();
  if (!model || model.locked) return;
  $("stateFrames").value = model.frames.map((_, index) => index).join(",");
  updateAnimationStateFromControls();
};

$("playState").onclick = playAnimationState;
$("stopState").onclick = () => {
  stopAnimationState();
  drawFramePreview(getSelectedModel());
};

$("addTimelineHitbox").onclick = () => {
  const model = getSelectedModel();
  if (!model || model.locked) return;
  commitHistory(`Add ${selectedAnimationState} frame hitbox`);
  const box = defaultTimelineHitbox(model);
  model.timelineHitboxes ||= [];
  model.timelineHitboxes.push(box);
  selectedAnimationHitboxId = box.id;
  drawFramePreview(model);
  renderQaSummary();
  renderHandoffSummary();
};

$("deleteTimelineHitbox").onclick = () => {
  const model = getSelectedModel();
  if (!model || model.locked || !selectedAnimationHitboxId) return;
  const box = model.timelineHitboxes.find((candidate) => candidate.id === selectedAnimationHitboxId);
  commitHistory(`Delete frame hitbox ${box?.name || ""}`.trim());
  model.timelineHitboxes = model.timelineHitboxes.filter((candidate) => candidate.id !== selectedAnimationHitboxId);
  selectedAnimationHitboxId = null;
  drawFramePreview(model);
  renderQaSummary();
  renderHandoffSummary();
};

["timelineHitboxName", "timelineHitboxFrame", "timelineHitboxKind", "timelineHitboxX", "timelineHitboxY", "timelineHitboxW", "timelineHitboxH"].forEach((id) => {
  $(id).oninput = updateTimelineHitboxFromControls;
  $(id).onchange = updateTimelineHitboxFromControls;
});

$("previewPatch").onclick = () => {
  patchCandidate = parsePatch();
  renderPatchReview(patchCandidate);
};

$("applyPatch").onclick = () => {
  patchCandidate = patchCandidate || parsePatch();
  if (!patchCandidate.ok) {
    renderPatchReview(patchCandidate);
    return;
  }
  const selected = patchCandidate.actions.filter((action) => action.ok && action.selected);
  if (!selected.length) {
    setHint("No valid Codex patch actions selected.");
    renderPatchReview(patchCandidate);
    return;
  }
  commitHistory(`Apply ${selected.length} Codex patch action(s)`);
  selected.forEach((action) => action.apply());
  $("patchPreview").innerHTML = "";
  selected.forEach((action) => {
    const div = document.createElement("div");
    div.className = "issue ok";
    div.textContent = `Applied: ${action.summary}`;
    $("patchPreview").appendChild(div);
  });
  $("codexPatch").value = "";
  patchCandidate = null;
  renderAll();
};

$("validateProject").onclick = () => validate(true);

$("undoEdit").onclick = () => undoEdit();
$("redoEdit").onclick = () => redoEdit();

$("toggleGrid").onclick = () => {
  commitHistory(`${project.editor.gridVisible ? "Hide" : "Show"} grid`);
  project.editor.gridVisible = !project.editor.gridVisible;
  renderAll();
};

$("toggleSnap").onclick = () => {
  commitHistory(`${project.editor.snapToGrid ? "Disable" : "Enable"} snap`);
  project.editor.snapToGrid = !project.editor.snapToGrid;
  if (project.editor.snapToGrid) {
    const selected = activeScene().objects.find((object) => object.id === selectedId);
    if (selected && !selected.locked) snapBox(selected);
  }
  renderAll();
};

function toggleEditorOverlay(key, label) {
  commitHistory(`${project.editor[key] === false || project.editor[key] !== true && key === "baselinesVisible" ? "Show" : "Hide"} ${label}`);
  if (key === "baselinesVisible") project.editor[key] = project.editor[key] !== true;
  else project.editor[key] = project.editor[key] === false;
  renderAll();
}

$("toggleLabels").onclick = () => toggleEditorOverlay("labelsVisible", "labels");
$("toggleHitboxes").onclick = () => toggleEditorOverlay("hitboxesVisible", "hitboxes");
$("toggleBaselines").onclick = () => toggleEditorOverlay("baselinesVisible", "baselines");

function updateGridSizeFromInput() {
  commitHistory("Change grid size");
  project.editor.gridSize = clamp(Number($("gridSize").value) || 16, 4, 96);
  if (project.editor.snapToGrid) {
    const selected = activeScene().objects.find((object) => object.id === selectedId);
    if (selected && !selected.locked) snapBox(selected);
  }
  renderAll();
}

$("gridSize").oninput = updateGridSizeFromInput;
$("gridSize").onchange = updateGridSizeFromInput;

function setEditorZoom(zoom) {
  if (project.editor.zoom === zoom) return;
  commitHistory(`Set zoom ${zoom}`);
  project.editor.zoom = zoom;
  renderAll();
}

$("zoomFit").onclick = () => setEditorZoom("fit");
$("zoom100").onclick = () => setEditorZoom("100");
$("zoom200").onclick = () => setEditorZoom("200");

$("playPreview").onclick = () => {
  previewSceneId = activeScene().id;
  previewBubble = null;
  $("playModal").classList.remove("hidden");
  $("dialogueOutput").textContent = "Preview started. Click a character or hitbox.";
  $("choiceList").innerHTML = "";
  $("dialogueTitle").textContent = "Scene Log";
  $("previewStatus").textContent = activeScene().name;
  startPreviewLoop();
};

$("closePreview").onclick = () => {
  previewBubble = null;
  stopPreviewLoop();
  $("playModal").classList.add("hidden");
};

function startPreviewLoop() {
  stopPreviewLoop();
  const tick = () => {
    const scene = project.scenes.find((candidate) => candidate.id === previewSceneId) || activeScene();
    drawStage(pctx, scene, true);
    drawDialogueBubble(pctx, scene, previewBubble);
    previewLoopId = window.requestAnimationFrame(tick);
  };
  tick();
}

function stopPreviewLoop() {
  if (previewLoopId) window.cancelAnimationFrame(previewLoopId);
  previewLoopId = null;
}

previewCanvas.addEventListener("click", (event) => {
  const scene = project.scenes.find((candidate) => candidate.id === previewSceneId) || activeScene();
  const point = canvasPoint(event, previewCanvas);
  const object = objectAt(point.x, point.y, scene);
  const output = $("dialogueOutput");
  const choices = $("choiceList");
  choices.innerHTML = "";
  if (!object) {
    previewBubble = null;
    drawStage(pctx, scene, true);
    output.textContent = "Nothing responds there.";
    return;
  }
  $("dialogueTitle").textContent = object.name;
  if (object.targetSceneId) {
    const targetScene = project.scenes.find((candidate) => candidate.id === object.targetSceneId);
    if (targetScene) {
      previewSceneId = targetScene.id;
      previewBubble = null;
      $("dialogueTitle").textContent = targetScene.name;
      $("previewStatus").textContent = targetScene.name;
      output.textContent = `Entered ${targetScene.name}.`;
      drawStage(pctx, targetScene, true);
      return;
    }
  }
  const node = scene.dialogue.find((item) => item.speaker === object.name);
  output.textContent = node?.line || object.dialogue || object.text || object.note || "No response authored yet.";
  previewBubble = makeDialogueBubble(scene, object, output.textContent);
  drawStage(pctx, scene, true);
  drawDialogueBubble(pctx, scene, previewBubble);
  if (node?.choices?.length) {
    node.choices.forEach((choice) => {
      const button = document.createElement("button");
      button.textContent = choice.label;
      button.onclick = () => {
        output.textContent = choice.response;
        previewBubble = makeDialogueBubble(scene, object, choice.response);
        drawStage(pctx, scene, true);
        drawDialogueBubble(pctx, scene, previewBubble);
      };
      choices.appendChild(button);
    });
  }
});

function parsePatch() {
  let patch;
  try {
    patch = JSON.parse($("codexPatch").value);
  } catch (error) {
    return { ok: false, error: `Patch is not valid JSON: ${error.message}` };
  }
  const patches = Array.isArray(patch) ? patch : [patch];
  const actions = patches.map((item, index) => {
    const action = parsePatchAction(item, index);
    action.id = `codex-patch-${index + 1}`;
    action.selected = action.ok;
    action.source = item;
    return action;
  });
  const okCount = actions.filter((action) => action.ok).length;
  return {
    ok: okCount > 0,
    error: okCount ? "" : actions.map((action) => action.error).join("\n"),
    summary: `${okCount}/${actions.length} Codex patch action(s) ready.`,
    actions,
  };
}

function parsePatchAction(patch, index = 0) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return { ok: false, error: `Patch ${index + 1} must be an object.` };
  }
  const scene = activeScene();
  if (patch.addHitbox) {
    return {
      ok: true,
      type: "addHitbox",
      summary: `Add hitbox "${patch.addHitbox.name || "Untitled hitbox"}" to ${scene.name}.`,
      apply: () => scene.objects.push({ id: uid("hitbox"), kind: "hitbox", dialogue: "", ...patch.addHitbox }),
    };
  }
  if (patch.addCharacter) {
    return {
      ok: true,
      type: "addCharacter",
      summary: `Add character "${patch.addCharacter.name || "Untitled character"}" to ${scene.name}.`,
      apply: () => scene.objects.push({
        id: uid("character"),
        kind: "character",
        w: 64,
        h: 132,
        dialogue: "",
        animationBible: {
          idle: "Define character-specific idle.",
          walk: "Define movement mechanics.",
          talk: "Define speech posture.",
          waiting: "Define input-needed posture.",
          failed: "Define failure reaction.",
        },
        ...patch.addCharacter,
      }),
    };
  }
  if (patch.updateObject) {
    const target = scene.objects.find((item) => item.id === patch.updateObject.id || item.name === patch.updateObject.name);
    if (!target) return { ok: false, error: "No object matched updateObject.id or updateObject.name." };
    if (target.locked) return { ok: false, error: `${target.name} is locked. Unlock it before applying Codex updates.` };
    return {
      ok: true,
      type: "updateObject",
      summary: `Update ${target.name}.`,
      apply: () => Object.assign(target, patch.updateObject.values || {}),
    };
  }
  if (patch.updateLayer) {
    const target = scene.layers.find((item) => item.id === patch.updateLayer.id || item.name === patch.updateLayer.name);
    if (!target) return { ok: false, error: "No layer matched updateLayer.id or updateLayer.name." };
    if (target.locked) return { ok: false, error: `${target.name} is locked. Unlock it before applying Codex layer updates.` };
    return {
      ok: true,
      type: "updateLayer",
      summary: `Update layer ${target.name}.`,
      apply: () => Object.assign(target, patch.updateLayer.values || {}),
    };
  }
  if (patch.addDialogueNode) {
    return {
      ok: true,
      type: "addDialogueNode",
      summary: `Add dialogue node for ${patch.addDialogueNode.speaker || "unknown speaker"}.`,
      apply: () => {
        const node = { id: uid("dialogue-node"), choices: [], ...patch.addDialogueNode };
        scene.dialogue.push(node);
        selectedDialogueId = node.id;
      },
    };
  }
  if (patch.updateDialogueNode) {
    const target = scene.dialogue.find((item) => item.id === patch.updateDialogueNode.id || item.speaker === patch.updateDialogueNode.speaker);
    if (!target) return { ok: false, error: "No dialogue node matched updateDialogueNode.id or updateDialogueNode.speaker." };
    return {
      ok: true,
      type: "updateDialogueNode",
      summary: `Update dialogue node for ${target.speaker || "unknown speaker"}.`,
      apply: () => {
        Object.assign(target, patch.updateDialogueNode.values || {});
        selectedDialogueId = target.id;
      },
    };
  }
  return { ok: false, error: "Supported patch keys: addHitbox, addCharacter, updateObject, updateLayer, addDialogueNode, updateDialogueNode." };
}

function renderPatchReview(plan) {
  const review = $("patchReview");
  const wrap = $("patchPreview");
  if (!review || !wrap) return;
  review.innerHTML = "";
  wrap.innerHTML = "";
  if (!plan.actions?.length) {
    const div = document.createElement("div");
    div.className = "issue";
    div.textContent = plan.error || "No Codex patch actions found.";
    wrap.appendChild(div);
    return;
  }
  const valid = plan.actions.filter((action) => action.ok);
  const selected = valid.filter((action) => action.selected);
  const blocked = plan.actions.length - valid.length;
  review.innerHTML = `
    <div class="patch-summary">
      <span class="patch-pill ok">${selected.length}/${valid.length} selected</span>
      <span class="patch-pill">${plan.actions.length} total</span>
      <span class="patch-pill blocked">${blocked} blocked</span>
    </div>
    <div class="patch-actions">
      <button data-patch-select="all">Select All</button>
      <button data-patch-select="none">Clear</button>
    </div>
  `;
  review.querySelector("[data-patch-select='all']").onclick = () => {
    plan.actions.forEach((action) => {
      if (action.ok) action.selected = true;
    });
    renderPatchReview(plan);
  };
  review.querySelector("[data-patch-select='none']").onclick = () => {
    plan.actions.forEach((action) => {
      if (action.ok) action.selected = false;
    });
    renderPatchReview(plan);
  };
  plan.actions.forEach((action) => wrap.appendChild(patchActionElement(action, plan)));
}

function patchActionElement(action, plan) {
  const div = document.createElement("div");
  div.className = `issue patch-row ${action.ok ? "ok" : "warning"}`;
  const checked = action.selected ? "checked" : "";
  const disabled = action.ok ? "" : "disabled";
  div.innerHTML = `
    <input type="checkbox" ${checked} ${disabled} aria-label="Select Codex patch action" />
    <span><strong>${escapeHtml(action.type || "blocked")}</strong> ${escapeHtml(action.summary || action.error)}<em>${escapeHtml(patchActionSourceLabel(action))}</em></span>
  `;
  const checkbox = div.querySelector("input");
  checkbox.onchange = () => {
    action.selected = checkbox.checked;
    renderPatchReview(plan);
  };
  return div;
}

function patchActionSourceLabel(action) {
  if (!action.source) return activeScene().name;
  const keys = Object.keys(action.source);
  return `${activeScene().name} / ${keys[0] || "unknown"}`;
}

function collectQaIssues() {
  const issues = [];
  project.scenes.forEach((scene) => {
    const sceneTarget = { tab: "editor", sceneId: scene.id };
    if (!scene.layers.some((layer) => layer.type === "background" && layer.visible)) {
      issues.push({ severity: "error", message: `${scene.name}: add a visible background layer.`, target: sceneTarget });
    }
    if (!scene.objects.some((object) => object.kind === "walkable")) {
      issues.push({ severity: "error", message: `${scene.name}: no walkable area defined.`, target: sceneTarget });
    }
    scene.layers.forEach((layer) => {
      if (layer.dataUrl && !layer.sourceSize) {
        issues.push({ severity: "error", message: `${scene.name}: ${layer.name} image layer is missing source size metadata.`, target: { tab: "editor", sceneId: scene.id, layerId: layer.id } });
      }
    });
    scene.objects.forEach((object) => {
      const target = { tab: "editor", sceneId: scene.id, objectId: object.id };
      if (object.w < 8 || object.h < 8) issues.push({ severity: "error", message: `${scene.name}: ${object.name} is too small to edit reliably.`, target });
      if (object.x < 0 || object.y < 0 || object.x + object.w > scene.width || object.y + object.h > scene.height) {
        issues.push({ severity: "error", message: `${scene.name}: ${object.name} is outside scene bounds.`, target });
      }
      if (object.kind !== "walkable" && !Number.isFinite(Number(object.baseline))) {
        issues.push({ severity: "error", message: `${scene.name}: ${object.name} needs a draw baseline.`, target });
      }
      if (object.targetSceneId && !project.scenes.some((candidate) => candidate.id === object.targetSceneId)) {
        issues.push({ severity: "error", message: `${scene.name}: ${object.name} exits to a missing scene.`, target });
      }
      if (object.kind === "character") {
        const bible = object.animationBible || {};
        ["idle", "walk", "talk", "waiting", "failed"].forEach((state) => {
          if (!bible[state] || bible[state].length < 12) {
            issues.push({ severity: "warning", message: `${scene.name}: ${object.name} needs a stronger ${state} animation note.`, target });
          }
        });
      }
      if ((object.kind === "hitbox" || object.kind === "character") && !(object.dialogue || object.action)) {
        issues.push({ severity: "error", message: `${scene.name}: ${object.name} needs interaction text.`, target });
      }
    });
    scene.dialogue.forEach((node) => {
      if (!node.speaker || !node.line) {
        issues.push({ severity: "error", message: `${scene.name}: dialogue node ${node.speaker || node.id} needs speaker and line text.`, target: { tab: "dialogue", sceneId: scene.id, dialogueId: node.id } });
      }
      if (node.speaker && !scene.objects.some((object) => object.kind === "character" && object.name === node.speaker)) {
        issues.push({ severity: "warning", message: `${scene.name}: dialogue speaker ${node.speaker} has no matching character object.`, target: { tab: "dialogue", sceneId: scene.id, dialogueId: node.id } });
      }
    });
    issues.push(...collectOcclusionQa(scene));
  });
  project.assets.characters.forEach((model) => issues.push(...modelQaIssueRecords(model)));
  return issues;
}

function validate(show) {
  const issueRecords = collectQaIssues().filter((issue) => issue.target?.tab !== "characters");
  const issues = issueRecords.map((issue) => issue.message);
  const wrap = $("validationList");
  wrap.innerHTML = "";
  if (!issues.length) {
    wrap.innerHTML = `<div class="issue ok">Project passes MVP checks.</div>`;
  } else {
    issueRecords.forEach((issue) => wrap.appendChild(issueElement(issue)));
  }
  if (show) setHint(issues.length ? `${issues.length} issue(s) need attention.` : "Validation passed.");
  return issues;
}

function buildScriptSyncPlan(text) {
  const actions = [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let scene = activeScene();
  let lastDialogueAction = null;
  for (const line of lines) {
    if (line.startsWith("@scene ")) {
      lastDialogueAction = null;
      const name = line.slice(7).trim();
      const matched = project.scenes.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase());
      if (matched) {
        scene = matched;
        actions.push({ type: "use-scene", ok: true, sceneId: matched.id, sceneName: name, text: `Use scene ${name}.` });
      } else {
        const newScene = {
          id: uid("scene"),
          name,
          width: 960,
          height: 540,
          background: "#222831",
          layers: [{ id: uid("layer"), name: "Background", type: "background", depth: 0, visible: true, color: "#222831" }],
          objects: [],
          dialogue: [],
          flags: [],
        };
        scene = newScene;
        actions.push({ type: "create-scene", ok: true, scene: newScene, text: `Create scene ${name}.` });
      }
      continue;
    }

    const exitCommand = line.match(/^@exit\s+(.+?)\s+(-?\d+)\s+(-?\d+)\s+(\d+)\s+(\d+)\s*->\s*(.+)$/i);
    if (exitCommand) {
      lastDialogueAction = null;
      const [, name, x, y, w, h, targetSceneName] = exitCommand;
      const existing = scene.objects.find((object) => object.name.toLowerCase() === name.toLowerCase());
      const targetScene = project.scenes.find((candidate) => candidate.name.toLowerCase() === targetSceneName.trim().toLowerCase());
      if (existing?.locked) {
        actions.push({ type: "skip", ok: false, text: `Skip locked exit ${name}.` });
        continue;
      }
      if (!targetScene) {
        actions.push({ type: "skip", ok: false, text: `Exit ${name} targets missing scene ${targetSceneName.trim()}.` });
        continue;
      }
      const values = {
        kind: "hitbox",
        x: Number(x),
        y: Number(y),
        w: Number(w),
        h: Number(h),
        targetSceneId: targetScene.id,
        action: `Go to ${targetScene.name}`,
        dialogue: `Go to ${targetScene.name}.`,
      };
      const object = existing || { id: uid("hitbox"), kind: "hitbox", name };
      actions.push({
        type: existing ? "update-object" : "create-object",
        ok: true,
        sceneId: scene.id,
        object,
        objectId: existing?.id,
        before: existing ? pickObjectGeometry(existing) : null,
        after: values,
        text: `${existing ? "Update" : "Create"} exit ${name} to ${targetScene.name}.`,
      });
      continue;
    }

    const command = line.match(/^@(character|hitbox|walkable)\s+(.+?)\s+(-?\d+)\s+(-?\d+)(?:\s+(\d+)\s+(\d+))?$/i);
    if (command) {
      lastDialogueAction = null;
      const [, kind, name, x, y, w, h] = command;
      const normalizedKind = kind.toLowerCase() === "character" ? "character" : kind.toLowerCase();
      const existing = scene.objects.find((object) => object.name.toLowerCase() === name.toLowerCase());
      if (existing?.locked) {
        actions.push({ type: "skip", ok: false, text: `Skip locked ${existing.kind} ${name}.` });
        continue;
      }
      const values = {
        x: Number(x),
        y: Number(y),
        w: Number(w || (normalizedKind === "character" ? 72 : 120)),
        h: Number(h || (normalizedKind === "character" ? 148 : 80)),
      };
      if (existing?.targetSceneId && normalizedKind === "hitbox") values.targetSceneId = "";
      const object = existing || {
        id: uid(normalizedKind),
        kind: normalizedKind,
        name,
        dialogue: normalizedKind === "character" ? "Script imported character." : "Script imported interaction.",
      };
      if (normalizedKind === "character") {
        object.animationBible ||= {
          idle: "Script imported idle needs review.",
          walk: "Script imported walk needs review.",
          talk: "Script imported talk needs review.",
          waiting: "Script imported waiting pose needs review.",
          failed: "Script imported failure pose needs review.",
        };
      }
      if (normalizedKind === "walkable") object.note ||= "Script imported walkable area.";
      actions.push({
        type: existing ? "update-object" : "create-object",
        ok: true,
        sceneId: scene.id,
        object,
        objectId: existing?.id,
        before: existing ? pickObjectGeometry(existing) : null,
        after: values,
        text: `${existing ? "Update" : "Create"} ${normalizedKind} ${name}.`,
      });
      continue;
    }

    const dialogue = line.match(/^([^:@]+):\s+(.+)$/);
    if (dialogue) {
      const speaker = dialogue[1].trim();
      const spoken = dialogue[2].trim();
      const existingNode = scene.dialogue.find((item) => item.speaker === speaker);
      const node = existingNode || { id: uid("dialogue-node"), speaker, line: "", choices: [] };
      const actor = scene.objects.find((object) => object.kind === "character" && object.name.toLowerCase() === speaker.toLowerCase());
      if (actor?.locked) {
        actions.push({ type: "skip", ok: false, text: `Skip dialogue update for locked character ${speaker}.` });
        lastDialogueAction = null;
      } else {
        lastDialogueAction = {
          type: existingNode ? "update-dialogue" : "create-dialogue",
          ok: true,
          sceneId: scene.id,
          node,
          nodeId: existingNode?.id,
          actorId: actor?.id,
          before: existingNode?.line || actor?.dialogue || "",
          after: spoken,
          choicesSeen: false,
          text: `${existingNode ? "Update" : "Create"} dialogue for ${speaker}.`,
        };
        actions.push(lastDialogueAction);
      }
      continue;
    }

    const choice = line.match(/^[-*+]\s*(.+?)\s*=>\s*(.+)$/);
    if (choice) {
      const [, label, response] = choice;
      if (!lastDialogueAction) {
        actions.push({ type: "skip", ok: false, text: `Choice has no preceding dialogue line: ${line}` });
        continue;
      }
      const node = lastDialogueAction.node;
      node.choices ||= [];
      const existingChoice = node.choices.find((item) => item.label.toLowerCase() === label.trim().toLowerCase());
      lastDialogueAction.choicesSeen = true;
      actions.push({
        type: "upsert-choice",
        ok: true,
        sceneId: lastDialogueAction.sceneId,
        node,
        nodeId: lastDialogueAction.nodeId,
        speaker: node.speaker,
        label: label.trim(),
        response: response.trim(),
        before: existingChoice ? { label: existingChoice.label, response: existingChoice.response } : null,
        after: { label: label.trim(), response: response.trim() },
        text: `${existingChoice ? "Update" : "Add"} choice "${label.trim()}" for ${node.speaker}.`,
      });
      continue;
    }

    lastDialogueAction = null;
    actions.push({ type: "skip", ok: false, text: `Ignore unsupported script line: ${line}` });
  }
  if (!actions.length) actions.push({ type: "skip", ok: false, text: "Script is empty." });
  actions.forEach((action, index) => {
    action.id = `script-action-${index + 1}`;
    action.selected = action.ok && action.type !== "use-scene";
  });
  return { createdAt: new Date().toISOString(), actions, results: actions.map(actionToResult) };
}

function applyScriptSyncPlan(plan, onlySelected = false) {
  const results = [];
  for (const action of plan.actions) {
    if (onlySelected && action.type === "use-scene") continue;
    if (onlySelected && !action.selected) continue;
    if (!action.ok) {
      results.push(actionToResult(action));
      continue;
    }
    if (action.type === "use-scene") {
      project.activeSceneId = action.sceneId;
    }
    if (action.type === "create-scene") {
      project.scenes.push(action.scene);
      project.activeSceneId = action.scene.id;
    }
    if (action.type === "create-object" || action.type === "update-object") {
      const scene = project.scenes.find((candidate) => candidate.id === action.sceneId) || activeScene();
      const existing = scene.objects.find((object) => object.id === action.objectId || object.name === action.object.name);
      const target = existing || action.object;
      Object.assign(target, action.after);
      if (target.kind !== "walkable") target.baseline = target.y + target.h;
      if (!existing) scene.objects.push(target);
    }
    if (action.type === "create-dialogue" || action.type === "update-dialogue") {
      const scene = project.scenes.find((candidate) => candidate.id === action.sceneId) || activeScene();
      const existingNode = scene.dialogue.find((node) => node.id === action.nodeId || node.speaker === action.node.speaker);
      const target = existingNode || action.node;
      target.line = action.after;
      target.speaker = action.node.speaker;
      target.choices = action.choicesSeen ? [] : (target.choices || structuredClone(action.node.choices || []));
      if (!existingNode) scene.dialogue.push(target);
      const actor = scene.objects.find((object) => object.id === action.actorId);
      if (actor && !actor.locked) actor.dialogue = action.after;
    }
    if (action.type === "upsert-choice") {
      const scene = project.scenes.find((candidate) => candidate.id === action.sceneId) || activeScene();
      const target = scene.dialogue.find((node) => node.id === action.nodeId || node.speaker === action.speaker) || action.node;
      target.choices ||= [];
      const existingChoice = target.choices.find((choice) => choice.label.toLowerCase() === action.label.toLowerCase());
      if (existingChoice) existingChoice.response = action.response;
      else target.choices.push({ label: action.label, response: action.response });
      if (!scene.dialogue.includes(target)) scene.dialogue.push(target);
    }
    results.push(actionToResult(action));
  }
  return results;
}

function pickObjectGeometry(object) {
  return { x: object.x, y: object.y, w: object.w, h: object.h };
}

function actionToResult(action) {
  const detail = action.before
    ? ` ${JSON.stringify(action.before)} -> ${JSON.stringify(action.after)}`
    : action.after
      ? ` -> ${JSON.stringify(action.after)}`
      : "";
  return { ok: action.ok, text: `${action.text}${detail}` };
}

function summarizeScriptSyncPlan(plan) {
  return {
    createdAt: plan.createdAt,
    counts: scriptSyncCounts(plan),
    actions: plan.actions.map((action) => ({
      id: action.id,
      type: action.type,
      ok: action.ok,
      selected: Boolean(action.selected),
      text: action.text,
      before: action.before,
      after: action.after,
    })),
  };
}

function renderScriptSyncLog(results, plan = null) {
  const wrap = $("scriptSyncLog");
  const review = $("scriptSyncReview");
  if (!wrap) return;
  if (review) review.innerHTML = "";
  if (!results.length) {
    wrap.innerHTML = `<div class="issue ok">Ready to sync script commands into the active scene.</div>`;
    return;
  }
  wrap.innerHTML = "";
  if (plan) {
    renderScriptSyncReview(plan);
    plan.actions
      .filter((action) => actionMatchesScriptFilter(action))
      .forEach((action) => wrap.appendChild(scriptActionElement(action)));
    if (!wrap.children.length) wrap.innerHTML = `<div class="issue warning">No actions match the current filter.</div>`;
    return;
  }
  results.forEach((result) => {
    const div = document.createElement("div");
    div.className = `issue ${result.ok ? "ok" : ""}`;
    div.textContent = result.text;
    wrap.appendChild(div);
  });
}

function renderScriptSyncReview(plan) {
  const review = $("scriptSyncReview");
  if (!review) return;
  const counts = scriptSyncCounts(plan);
  review.innerHTML = `
    <div class="sync-summary">
      <span class="sync-pill ok">${counts.selected}/${counts.applicable} selected</span>
      <span class="sync-pill">${counts.create} create</span>
      <span class="sync-pill">${counts.update} update</span>
      <span class="sync-pill blocked">${counts.blocked} blocked</span>
    </div>
    <div class="sync-actions">
      <button data-sync-filter="all">All</button>
      <button data-sync-filter="create">Create</button>
      <button data-sync-filter="update">Update</button>
      <button data-sync-filter="blocked">Blocked</button>
      <button data-sync-select="all">Select All</button>
      <button data-sync-select="none">Clear</button>
    </div>
  `;
  review.querySelectorAll("[data-sync-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.syncFilter === scriptSyncFilter);
    button.onclick = () => {
      scriptSyncFilter = button.dataset.syncFilter;
      renderScriptSyncLog(plan.results, plan);
    };
  });
  review.querySelector("[data-sync-select='all']").onclick = () => {
    plan.actions.forEach((action) => {
      if (action.ok) action.selected = true;
    });
    renderScriptSyncLog(plan.results, plan);
    renderHandoffSummary();
  };
  review.querySelector("[data-sync-select='none']").onclick = () => {
    plan.actions.forEach((action) => {
      if (action.ok) action.selected = false;
    });
    renderScriptSyncLog(plan.results, plan);
    renderHandoffSummary();
  };
}

function scriptSyncCounts(plan) {
  return plan.actions.reduce((counts, action) => {
    if (action.ok && action.type !== "use-scene") counts.applicable += 1;
    if (action.ok && action.selected) counts.selected += 1;
    if (!action.ok) counts.blocked += 1;
    if (scriptActionBucket(action) === "create") counts.create += 1;
    if (scriptActionBucket(action) === "update") counts.update += 1;
    return counts;
  }, { applicable: 0, selected: 0, blocked: 0, create: 0, update: 0 });
}

function actionMatchesScriptFilter(action) {
  if (scriptSyncFilter === "all") return true;
  if (scriptSyncFilter === "blocked") return !action.ok;
  return scriptActionBucket(action) === scriptSyncFilter;
}

function scriptActionBucket(action) {
  if (action.type === "use-scene") return "context";
  if (action.type.startsWith("create") || action.type === "upsert-choice" && !action.before) return "create";
  if (action.type.startsWith("update") || action.type === "upsert-choice" && action.before) return "update";
  return action.ok ? "update" : "blocked";
}

function scriptActionElement(action) {
  const result = actionToResult(action);
  const div = document.createElement("div");
  div.className = `issue sync-row ${action.ok ? "ok" : ""}`;
  if (!action.ok) div.classList.add("warning");
  const checked = action.selected ? "checked" : "";
  const disabled = action.ok && action.type !== "use-scene" ? "" : "disabled";
  div.innerHTML = `
    <input type="checkbox" ${checked} ${disabled} aria-label="Select script action" />
    <span><strong>${escapeHtml(action.type)}</strong> ${escapeHtml(result.text)}<em>${escapeHtml(scriptActionTarget(action))}</em></span>
  `;
  const checkbox = div.querySelector("input");
  checkbox.onchange = () => {
    action.selected = checkbox.checked;
    renderScriptSyncLog(pendingScriptSyncPlan.results, pendingScriptSyncPlan);
    renderHandoffSummary();
  };
  return div;
}

function scriptActionTarget(action) {
  const scene = project.scenes.find((candidate) => candidate.id === action.sceneId);
  if (scene) return `Scene: ${scene.name}`;
  if (action.sceneName) return `Scene: ${action.sceneName}`;
  return "Project script";
}

function renderQaSummary() {
  const wrap = $("qaSummary");
  if (!wrap) return;
  validate(false);
  wrap.innerHTML = "";
  const issues = collectQaIssues();
  issues.forEach((issue) => wrap.appendChild(issueElement(issue)));
  if (!wrap.children.length) wrap.innerHTML = `<div class="issue ok">Project, scene, and imported model checks pass.</div>`;
  renderDepthQaSummary();
}

function renderDepthQaSummary() {
  const wrap = $("depthQaSummary");
  if (!wrap) return;
  const scene = activeScene();
  const depthQa = collectDepthQa(scene);
  const occlusionQa = collectOcclusionQa(scene);
  wrap.innerHTML = "";
  if (depthQa.conflicts.length) {
    depthQa.conflicts.forEach((conflict) => wrap.appendChild(depthConflictElement(conflict)));
  }
  if (occlusionQa.length) {
    occlusionQa.forEach((warning) => wrap.appendChild(issueElement(warning)));
  }
  if (!depthQa.conflicts.length && !occlusionQa.length) {
    wrap.innerHTML = `<div class="issue ok">No close baseline or occlusion coverage conflicts in ${escapeHtml(scene.name)}.</div>`;
  }
  const order = document.createElement("div");
  order.className = "depth-order";
  order.innerHTML = `<strong>${escapeHtml(scene.name)} draw order</strong>`;
  depthQa.entries.forEach((entry) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "depth-row";
    button.innerHTML = `<span>${entry.order}</span><strong>${escapeHtml(entry.name)}</strong><em>${escapeHtml(entry.label)} / y=${Math.round(entry.baseline)}</em>`;
    button.onclick = () => navigateToIssue({ message: `${entry.name}: baseline ${Math.round(entry.baseline)}.`, target: entry.target });
    order.appendChild(button);
  });
  wrap.appendChild(order);
}

function depthConflictElement(conflict) {
  const div = document.createElement("button");
  div.type = "button";
  div.className = `issue issue-button ${conflict.severity === "warning" ? "warning" : ""}`;
  div.innerHTML = `<strong>${conflict.severity === "warning" ? "Review" : "Fix"}</strong><span>${escapeHtml(conflict.message)} Adjust one baseline or separate the visual contact-Y.</span>`;
  div.onclick = () => navigateToIssue(conflict);
  return div;
}

function issueElement(issue) {
  const div = document.createElement("button");
  div.type = "button";
  div.className = `issue issue-button ${issue.severity === "warning" ? "warning" : ""}`;
  div.innerHTML = `<strong>${issue.severity === "warning" ? "Review" : "Fix"}</strong><span>${escapeHtml(issue.message)}</span>`;
  div.onclick = () => navigateToIssue(issue);
  return div;
}

function navigateToIssue(issue) {
  const target = issue.target || {};
  if (target.sceneId) project.activeSceneId = target.sceneId;
  if (target.objectId) selectedId = target.objectId;
  if (target.modelId) selectedAssetId = target.modelId;
  if (target.dialogueId) selectedDialogueId = target.dialogueId;
  setActiveTab(target.tab || "editor");
  renderAll();
  if (target.tab === "characters") renderAssetLists();
  if (target.tab === "dialogue") renderDialogueGraph();
  setHint(issue.message);
}

function renderHandoffSummary() {
  const wrap = $("handoffSummary");
  if (!wrap) return;
  wrap.textContent = JSON.stringify({
    project: project.name,
    slug: project.slug,
    activeScene: activeScene()?.name,
    scenes: project.scenes.length,
    editor: project.editor,
    export: {
      target: project.export?.target || "standalone-html",
      debug: project.export?.debug || "off",
      adapter: exportAdapter(project.export?.target || "standalone-html"),
    },
    sceneSettings: project.scenes.map((scene) => ({
      id: scene.id,
      name: scene.name,
      width: scene.width,
      height: scene.height,
      background: scene.background,
      locked: scene.locked,
      objects: scene.objects.length,
      layers: scene.layers.length,
      dialogue: scene.dialogue.length,
    })),
    sceneObjects: project.scenes.flatMap((scene) => scene.objects.map((object) => ({
      scene: scene.name,
      id: object.id,
      name: object.name,
      kind: object.kind,
      x: object.x,
      y: object.y,
      w: object.w,
      h: object.h,
      baseline: object.kind === "walkable" ? null : renderableBaseline(object, scene),
      locked: object.locked,
      animationState: object.kind === "character" ? (object.animationState || "idle") : null,
      targetSceneId: object.targetSceneId || null,
    }))),
    imageLayers: project.scenes.flatMap((scene) => scene.layers.filter((layer) => layer.dataUrl).map((layer) => ({
      scene: scene.name,
      id: layer.id,
      name: layer.name,
      type: layer.type,
      baseline: isDepthSortedLayer(layer) ? renderableBaseline(layer, scene) : null,
      locked: layer.locked,
      sourceSize: layer.sourceSize,
    }))),
    depthOrder: project.scenes.map((scene) => ({
      scene: scene.name,
      entries: sortedDepthRenderables(scene).map((entry) => ({
        id: entry.item.id,
        name: entry.item.name,
        kind: entry.kind === "layer" ? `layer:${entry.item.type}` : entry.item.kind,
        baseline: renderableBaseline(entry.item, scene),
      })),
    })),
    baselineConflicts: collectProjectDepthQa().flatMap((depthQa) => depthQa.conflicts.map((conflict) => ({
      scene: conflict.sceneName,
      severity: conflict.severity,
      distance: Math.round(conflict.distance),
      first: {
        id: conflict.first.id,
        name: conflict.first.name,
        kind: conflict.first.label,
        baseline: Math.round(conflict.first.baseline),
      },
      second: {
        id: conflict.second.id,
        name: conflict.second.name,
        kind: conflict.second.label,
        baseline: Math.round(conflict.second.baseline),
      },
      target: conflict.target,
    }))),
    sceneExits: project.scenes.flatMap((scene) => scene.objects.filter((object) => object.targetSceneId).map((object) => ({
      scene: scene.name,
      id: object.id,
      name: object.name,
      targetSceneId: object.targetSceneId,
      targetScene: project.scenes.find((candidate) => candidate.id === object.targetSceneId)?.name || null,
    }))),
    lockedObjects: project.scenes.flatMap((scene) => scene.objects.filter((object) => object.locked).map((object) => ({
      scene: scene.name,
      id: object.id,
      name: object.name,
      kind: object.kind,
    }))),
    dialogueGraph: project.scenes.flatMap((scene) => scene.dialogue.map((node) => ({
      scene: scene.name,
      id: node.id,
      speaker: node.speaker,
      choices: (node.choices || []).length,
    }))),
    dialogueBranches: project.scenes.flatMap((scene) => dialogueBranchEdges(scene).map((edge) => ({
      scene: scene.name,
      fromId: edge.source.id,
      fromSpeaker: edge.source.speaker,
      choice: edge.choice.label,
      response: edge.choice.response,
      toId: edge.target?.id || null,
      toSpeaker: edge.target?.speaker || null,
      unresolved: !edge.target,
    }))),
    qaIssues: collectQaIssues().map((issue) => ({
      severity: issue.severity,
      message: issue.message,
      target: issue.target,
    })),
    characterModels: project.assets.characters.map((model) => ({
      id: model.id,
      name: model.name,
      role: model.role || "character",
      frames: model.frames.length,
      canvas: model.registration?.canvas,
      anchor: model.registration?.anchor,
      baseline: model.registration?.baseline,
      locked: model.locked,
      status: model.status,
      framesMeta: model.frames.map((frame, index) => ({
        index,
        id: frame.id,
        name: frame.name,
        width: frame.width,
        height: frame.height,
        alphaBounds: frame.alphaBounds || null,
      })),
      animations: model.animations,
      timelineHitboxes: (model.timelineHitboxes || []).map((box) => ({
        id: box.id,
        name: box.name,
        state: box.state,
        frame: box.frame,
        kind: box.kind,
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
      })),
      usedBy: modelUsage(model.id),
      qaIssues: modelQaIssues(model),
    })),
    script: {
      sourceName: project.script.sourceName,
      lastSyncedAt: project.script.lastSyncedAt,
      pendingPlan: pendingScriptSyncPlan ? summarizeScriptSyncPlan(pendingScriptSyncPlan) : null,
      lastSyncPlan: project.script.lastSyncPlan || null,
    },
    history: {
      undo: undoStack.length,
      redo: redoStack.length,
      lastUndo: undoStack.at(-1)?.label || null,
      lastRedo: redoStack.at(-1)?.label || null,
    },
  }, null, 2);
}

function defaultName(kind) {
  return {
    hitbox: "New hitbox",
    dialogue: "Dialogue anchor",
    character: "New character",
    walkable: "Walkable area",
  }[kind];
}

function toolHint(tool) {
  return {
    select: "Select objects to move or inspect them.",
    hitbox: "Drag on the stage to create an interaction hitbox.",
    dialogue: "Click or drag to place a dialogue bubble anchor.",
    character: "Click and drag to place a character model placeholder.",
    walkable: "Drag to mark where the player can walk.",
  }[tool];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "adventureforge-project";
}

function download(filename, text) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const stableLink = $("downloadLink");
  if (stableLink.dataset.url) URL.revokeObjectURL(stableLink.dataset.url);
  stableLink.href = url;
  stableLink.download = filename;
  stableLink.dataset.url = url;
  stableLink.hidden = false;
  stableLink.textContent = `Download ${filename}`;

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function composeScriptFromProject() {
  const lines = [];
  project.scenes.forEach((scene) => {
    lines.push(`@scene ${scene.name}`);
    scene.objects
      .filter((object) => object.kind === "character")
      .forEach((object) => lines.push(`@character ${object.name} ${Math.round(object.x)} ${Math.round(object.y)} ${Math.round(object.w)} ${Math.round(object.h)}`));
    scene.dialogue.forEach((node) => {
      lines.push(`${node.speaker || "Unknown Speaker"}: ${node.line || ""}`);
      (node.choices || []).forEach((choice) => lines.push(`- ${choice.label || "Choice"} => ${choice.response || ""}`));
    });
    scene.objects
      .filter((object) => object.kind === "hitbox")
      .forEach((object) => {
        const targetScene = project.scenes.find((candidate) => candidate.id === object.targetSceneId);
        if (targetScene) lines.push(`@exit ${object.name} ${Math.round(object.x)} ${Math.round(object.y)} ${Math.round(object.w)} ${Math.round(object.h)} -> ${targetScene.name}`);
        else lines.push(`@hitbox ${object.name} ${Math.round(object.x)} ${Math.round(object.y)} ${Math.round(object.w)} ${Math.round(object.h)}`);
      });
    scene.objects
      .filter((object) => object.kind === "walkable")
      .forEach((object) => lines.push(`@walkable ${object.name} ${Math.round(object.x)} ${Math.round(object.y)} ${Math.round(object.w)} ${Math.round(object.h)}`));
    lines.push("");
  });
  return lines.join("\n").trimEnd();
}

function downloadScript(filename, text) {
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const stableLink = $("scriptDownloadLink");
  if (stableLink.dataset.url) URL.revokeObjectURL(stableLink.dataset.url);
  stableLink.href = url;
  stableLink.download = filename;
  stableLink.dataset.url = url;
  stableLink.hidden = false;
  stableLink.textContent = `Download ${filename}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function downloadHtml(filename, html) {
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const stableLink = $("downloadLink");
  if (stableLink.dataset.url) URL.revokeObjectURL(stableLink.dataset.url);
  stableLink.href = url;
  stableLink.download = filename;
  stableLink.dataset.url = url;
  stableLink.hidden = false;
  stableLink.textContent = `Download ${filename}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function buildPlayableHtml(cleanProject) {
  const projectJson = JSON.stringify(cleanProject).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(cleanProject.name)} Playable</title>
  <style>
    :root { color-scheme: dark; --bg:#101216; --panel:#191d24; --line:#303949; --ink:#eef2f7; --muted:#9aa6b6; --accent:#57c7a2; }
    * { box-sizing: border-box; }
    body { margin:0; font-family:Segoe UI, system-ui, sans-serif; background:var(--bg); color:var(--ink); }
    main { width:min(1180px,100%); margin:0 auto; padding:16px; }
    header { display:flex; justify-content:space-between; gap:12px; align-items:end; margin-bottom:12px; }
    h1,p { margin:0; }
    p { color:var(--muted); }
    canvas { display:block; width:100%; aspect-ratio:16/9; border:1px solid var(--line); border-radius:8px; background:#07090d; }
    .lower { display:grid; grid-template-columns:minmax(0,1fr) 320px; gap:12px; margin-top:12px; }
    .panel { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:12px; }
    button { border:1px solid var(--line); background:#242b37; color:var(--ink); min-height:36px; padding:0 12px; border-radius:6px; cursor:pointer; }
    button:hover { border-color:var(--accent); }
    .choices { display:grid; gap:8px; margin-top:12px; }
    @media (max-width: 840px) { header,.lower { grid-template-columns:1fr; display:grid; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div><h1>${escapeHtml(cleanProject.name)}</h1><p id="sceneName"></p></div>
      <button id="resetScene">Reset</button>
    </header>
    <canvas id="game" width="960" height="540"></canvas>
    <section class="lower">
      <div class="panel"><p id="status">Click a character or hotspot.</p></div>
      <aside class="panel">
        <h2 id="speaker">Scene Log</h2>
        <p id="line">No interaction yet.</p>
        <div id="choices" class="choices"></div>
      </aside>
    </section>
  </main>
  <script>
    const project = ${projectJson};
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');
    let scene = project.scenes.find(s => s.id === project.activeSceneId) || project.scenes[0];
    let bubble = null;
    let player = null;
    let walkTarget = null;
    let pendingInteraction = null;
    const images = new Map();
    const animClock = { start: performance.now() };
    setScene(scene.id);

    function setScene(sceneId) {
      scene = project.scenes.find(s => s.id === sceneId) || project.scenes[0];
      player = (scene.objects || []).find(o => o.kind === 'character') || null;
      walkTarget = null;
      pendingInteraction = null;
      document.getElementById('sceneName').textContent = scene.name;
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
      for (const layer of scene.layers || []) {
        if (layer.dataUrl) images.set(layer.id, await loadImage(layer.dataUrl));
      }
      for (const model of project.assets?.characters || []) {
        for (const frame of model.frames || []) {
          if (frame.dataUrl) images.set(frame.id, await loadImage(frame.dataUrl));
        }
      }
      draw();
      requestAnimationFrame(loop);
    }

    function loop() {
      updateWalk();
      draw();
      requestAnimationFrame(loop);
    }

    function updateWalk() {
      if (!player || !walkTarget) return;
      const current = { x: player.x + player.w / 2, y: baseline(player) };
      const dx = walkTarget.x - current.x;
      const dy = walkTarget.y - current.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= 3) {
        if (walkTarget.stateAfter) player.animationState = walkTarget.stateAfter;
        const nextInteraction = pendingInteraction;
        walkTarget = null;
        pendingInteraction = null;
        if (nextInteraction) interactObject(nextInteraction);
        return;
      }
      const step = Math.min(5, distance);
      player.x += (dx / distance) * step;
      player.y += (dy / distance) * step;
      player.baseline = player.y + player.h;
      player.animationState = 'walk';
    }

    function draw() {
      ctx.clearRect(0, 0, scene.width, scene.height);
      ctx.fillStyle = scene.background || '#1b2a27';
      ctx.fillRect(0, 0, scene.width, scene.height);
      [...(scene.layers || [])].filter(l => l.visible !== false && !isDepthSortedLayer(l)).sort((a,b) => a.depth - b.depth).forEach(drawLayer);
      [...(scene.objects || [])].filter(o => o.kind === 'walkable').forEach(drawObject);
      sortedDepthRenderables().forEach(entry => entry.kind === 'layer' ? drawLayer(entry.item) : drawObject(entry.item));
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
      if (layer.type === 'background') { ctx.fillStyle = layer.color || '#26374a'; ctx.fillRect(0, 0, scene.width, scene.height); }
      if (layer.type === 'foreground') { ctx.fillStyle = layer.color || 'rgba(202,216,211,.16)'; ctx.fillRect(0, scene.height - 114, scene.width, 60); }
    }

    function drawObject(object) {
      if (object.kind === 'walkable') {
        ctx.fillStyle = 'rgba(87,199,162,.12)';
        ctx.fillRect(object.x, object.y, object.w, object.h);
        return;
      }
      if (object.kind === 'character') {
        const model = (project.assets?.characters || []).find(m => m.id === object.modelId);
        const frame = currentFrame(model, object.animationState || 'idle');
        const image = frame ? images.get(frame.id) : null;
        if (image) ctx.drawImage(image, object.x, object.y, object.w, object.h);
        else { ctx.fillStyle = 'rgba(111,168,255,.8)'; ctx.fillRect(object.x, object.y, object.w, object.h); }
      } else {
        ctx.fillStyle = object.kind === 'dialogue' ? 'rgba(241,180,92,.2)' : 'rgba(239,106,117,.2)';
        ctx.fillRect(object.x, object.y, object.w, object.h);
      }
      ctx.strokeStyle = object.kind === 'character' ? '#6fa8ff' : '#ef6a75';
      ctx.strokeRect(object.x, object.y, object.w, object.h);
    }

    function makeBubble(object, text) {
      if (!object || !text) return null;
      return {
        objectId: object.id,
        speaker: object.name,
        text,
        anchorId: dialogueAnchorFor(object)?.id || null
      };
    }

    function dialogueAnchorFor(object) {
      if (!object) return null;
      if (object.kind === 'dialogue') return object;
      const objectWords = dialogueMatchWords(object.name);
      return (scene.objects || []).find(candidate => {
        if (candidate.kind !== 'dialogue') return false;
        const candidateWords = dialogueMatchWords(candidate.name);
        return candidateWords.some(word => objectWords.includes(word));
      }) || null;
    }

    function dialogueMatchWords(text) {
      const ignored = new Set(['anchor', 'bubble', 'dialogue', 'hotspot', 'interaction', 'text', 'the']);
      return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .filter(word => word.length > 2 && !ignored.has(word));
    }

    function drawBubble(payload) {
      if (!payload?.text) return;
      const object = (scene.objects || []).find(item => item.id === payload.objectId);
      const anchor = (scene.objects || []).find(item => item.id === payload.anchorId) || dialogueAnchorFor(object);
      const source = anchor || object;
      if (!source) return;
      ctx.save();
      ctx.font = '14px Segoe UI';
      const maxWidth = Math.min(340, Math.max(220, scene.width - 32));
      const lines = wrapText(payload.text, maxWidth - 28).slice(0, 4);
      const width = Math.min(maxWidth, Math.max(190, ...lines.map(text => ctx.measureText(text).width + 28)));
      const height = 34 + lines.length * 19;
      const sourceCenter = source.x + source.w / 2;
      const y = clamp(source.y - height - 16, 12, Math.max(12, scene.height - height - 12));
      const x = clamp(sourceCenter - width / 2, 12, Math.max(12, scene.width - width - 12));
      const stemX = clamp(sourceCenter, x + 22, x + width - 22);
      ctx.fillStyle = 'rgba(10, 12, 16, 0.92)';
      ctx.strokeStyle = '#f1b45c';
      ctx.lineWidth = 2;
      roundedRect(ctx, x, y, width, height, 10);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(stemX - 8, y + height - 1);
      ctx.lineTo(stemX, Math.min(source.y, y + height + 16));
      ctx.lineTo(stemX + 8, y + height - 1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f1b45c';
      ctx.font = '600 12px Segoe UI';
      ctx.fillText(payload.speaker || 'Dialogue', x + 14, y + 18);
      ctx.fillStyle = '#eef2f7';
      ctx.font = '14px Segoe UI';
      lines.forEach((text, index) => ctx.fillText(text, x + 14, y + 40 + index * 19));
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
        } else {
          line = trial;
        }
      }
      if (line) lines.push(line);
      return lines.length ? lines : [''];
    }

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
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
        ...(scene.objects || []).filter(o => o.kind !== 'walkable').map((item, index) => ({ kind: 'object', item, index: index + 1000 }))
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
      return sortedDepthRenderables().filter(e => e.kind === 'object').map(e => e.item).reverse().find(o => x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h);
    }

    function walkableAt(x, y) {
      return (scene.objects || []).find(o => o.kind === 'walkable' && x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h);
    }

    function nearestWalkPoint(x, y) {
      const areas = (scene.objects || []).filter(o => o.kind === 'walkable');
      if (!areas.length) return { x, y, area: null };
      let best = null;
      for (const area of areas) {
        const px = clamp(x, area.x, area.x + area.w);
        const py = clamp(y, area.y, area.y + area.h);
        const score = Math.hypot(px - x, py - y);
        if (!best || score < best.score) best = { x: px, y: py, area, score };
      }
      return best;
    }

    function setWalkTarget(x, y, object = null) {
      if (!player) return false;
      const point = object ? nearestWalkPoint(object.x + object.w / 2, object.y + object.h) : nearestWalkPoint(x, y);
      if (!point.area && !walkableAt(point.x, point.y)) return false;
      walkTarget = { x: point.x, y: point.y, stateAfter: player.animationState === 'walk' ? 'idle' : player.animationState || 'idle' };
      pendingInteraction = object;
      document.getElementById('status').textContent = object ? 'Walking to ' + object.name + '.' : 'Walking.';
      return true;
    }

    function interactObject(object) {
      const rect = canvas.getBoundingClientRect();
      const speaker = document.getElementById('speaker');
      const line = document.getElementById('line');
      const choices = document.getElementById('choices');
      choices.innerHTML = '';
      if (!object) {
        bubble = null;
        speaker.textContent = 'Scene Log';
        line.textContent = 'Nothing responds there.';
        draw();
        return;
      }
      if (object.targetSceneId) {
        const target = project.scenes.find(s => s.id === object.targetSceneId);
        if (target) {
          setScene(target.id);
          bubble = null;
          speaker.textContent = target.name;
          line.textContent = 'Entered ' + target.name + '.';
          draw();
          return;
        }
      }
      const node = (scene.dialogue || []).find(n => n.speaker === object.name);
      speaker.textContent = object.name;
      line.textContent = node?.line || object.dialogue || object.text || object.note || 'No response authored yet.';
      bubble = makeBubble(object, line.textContent);
      draw();
      for (const choice of node?.choices || []) {
        const button = document.createElement('button');
        button.textContent = choice.label;
        button.onclick = () => {
          line.textContent = choice.response;
          bubble = makeBubble(object, choice.response);
          draw();
        };
        choices.appendChild(button);
      }
    }

    canvas.addEventListener('click', (event) => {
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) * (canvas.width / rect.width);
      const y = (event.clientY - rect.top) * (canvas.height / rect.height);
      const object = objectAt(x, y);
      if (!object) {
        if (setWalkTarget(x, y)) return;
        bubble = null;
        document.getElementById('speaker').textContent = 'Scene Log';
        document.getElementById('line').textContent = 'Nothing responds there.';
        draw();
        return;
      }
      if (object !== player && setWalkTarget(x, y, object)) return;
      interactObject(object);
    });

    document.getElementById('resetScene').onclick = () => {
      setScene(project.activeSceneId);
      bubble = null;
      document.getElementById('speaker').textContent = 'Scene Log';
      document.getElementById('line').textContent = 'No interaction yet.';
      document.getElementById('choices').innerHTML = '';
      draw();
    };

    hydrate();
  </script>
</body>
</html>`;
}

function serializableProject() {
  return JSON.parse(JSON.stringify(project, (key, value) => (key === "image" ? undefined : value)));
}

function buildExportPackage(cleanProject) {
  const target = cleanProject.export?.target || "standalone-html";
  const debug = cleanProject.export?.debug || "off";
  return {
    format: "adventureforge.engine-package",
    version: 1,
    project: {
      name: cleanProject.name,
      slug: cleanProject.slug || slug(cleanProject.name),
      target,
      debug,
      startSceneId: cleanProject.activeSceneId,
    },
    adapter: exportAdapter(target),
    files: exportPackageFiles(cleanProject, target),
    assetMode: "external-preferred",
    assetManifest: externalAssetManifest(cleanProject),
    scenes: cleanProject.scenes.map((scene) => ({
      id: scene.id,
      name: scene.name,
      width: scene.width,
      height: scene.height,
      background: scene.background,
      layers: (scene.layers || []).map((layer) => ({
        id: layer.id,
        name: layer.name,
        type: layer.type,
        visible: layer.visible !== false,
        depth: layer.depth,
        baseline: isDepthSortedLayer(layer) ? renderableBaseline(layer, scene) : null,
        hasEmbeddedImage: Boolean(layer.dataUrl),
        sourcePath: layer.sourcePath || null,
      })),
      objects: (scene.objects || []).map((object) => ({
        id: object.id,
        name: object.name,
        kind: object.kind,
        x: object.x,
        y: object.y,
        w: object.w,
        h: object.h,
        baseline: object.kind === "walkable" ? null : renderableBaseline(object, scene),
        modelId: object.modelId || null,
        animationState: object.kind === "character" ? (object.animationState || "idle") : null,
        targetSceneId: object.targetSceneId || null,
      })),
      depthOrder: sortedDepthRenderables(scene).map((entry) => ({
        id: entry.item.id,
        name: entry.item.name,
        kind: entry.kind === "layer" ? `layer:${entry.item.type}` : entry.item.kind,
        baseline: renderableBaseline(entry.item, scene),
      })),
      dialogueBranches: dialogueBranchEdges(scene).map((edge) => ({
        fromId: edge.source.id,
        choice: edge.choice.label,
        response: edge.choice.response,
        toId: edge.target?.id || null,
      })),
    })),
    characterModels: (cleanProject.assets?.characters || []).map((model) => ({
      id: model.id,
      name: model.name,
      role: model.role,
      frameCount: (model.frames || []).length,
      registration: model.registration,
      animations: model.animations,
      timelineHitboxes: model.timelineHitboxes || [],
      frames: (model.frames || []).map((frame, index) => ({
        index,
        id: frame.id,
        name: frame.name,
        width: frame.width,
        height: frame.height,
        alphaBounds: frame.alphaBounds || null,
        embedded: Boolean(frame.dataUrl),
        sourcePath: frame.sourcePath || null,
        sourceSheet: frame.sourceSheet || null,
      })),
    })),
    qa: {
      issues: collectQaIssues().map((issue) => ({ severity: issue.severity, message: issue.message, target: issue.target })),
      baselineConflicts: collectProjectDepthQa().flatMap((depthQa) => depthQa.conflicts.map((conflict) => ({
        scene: conflict.sceneName,
        severity: conflict.severity,
        distance: Math.round(conflict.distance),
        first: conflict.first.name,
        second: conflict.second.name,
      }))),
      occlusionWarnings: cleanProject.scenes.flatMap((scene) => collectOcclusionQa(scene).map((warning) => ({
        scene: warning.sceneName,
        severity: warning.severity,
        actor: warning.actor.name,
        layer: warning.layer.name || warning.layer.type,
        message: warning.message,
      }))),
    },
  };
}

function exportAdapter(target) {
  if (target === "phaser-scaffold") {
    return {
      engine: "Phaser",
      status: "scaffold",
      entrypoint: "src/main.js",
      notes: [
        "Create Phaser scenes from the scenes array.",
        "Load embedded dataUrl assets or externalize them during a later build step.",
        "Use depthOrder baselines for displayList ordering and dialogueBranches for interaction flow.",
      ],
    };
  }
  return {
    engine: "Standalone Canvas HTML",
    status: "ready",
    entrypoint: `${slug(project.name)}.playable.html`,
    notes: ["Use the Playable export for a single-file runtime with embedded project data."],
  };
}

function externalAssetManifest(cleanProject) {
  return {
    layers: cleanProject.scenes.flatMap((scene) => (scene.layers || [])
      .filter((layer) => layer.dataUrl || layer.sourcePath)
      .map((layer) => ({
        sceneId: scene.id,
        layerId: layer.id,
        name: layer.name,
        type: layer.type,
        sourcePath: layer.sourcePath || null,
        embedded: Boolean(layer.dataUrl),
      }))),
    frames: (cleanProject.assets?.characters || []).flatMap((model) => (model.frames || []).map((frame, index) => ({
      modelId: model.id,
      frameId: frame.id,
      index,
      name: frame.name,
      sourcePath: frame.sourcePath || null,
      sourceSheet: frame.sourceSheet || null,
      embedded: Boolean(frame.dataUrl),
    }))),
  };
}

function exportPackageFiles(cleanProject, target) {
  if (target === "phaser-scaffold") {
    return [
      { path: "package.json", role: "npm manifest", status: "planned" },
      { path: "src/main.js", role: "Phaser boot entry", status: "planned" },
      { path: "src/scenes/*.js", role: "Generated scene adapters", status: "planned" },
      { path: "manifest.json", role: "External asset manifest", status: "exportable" },
      { path: "project.json", role: "Authoring source with asset references", status: "exportable" },
      { path: "assets/characters/*", role: "Externalized PNG frames", status: "preferred" },
      { path: `${cleanProject.slug || slug(cleanProject.name)}.adventureforge.json`, role: "Authoring source", status: "included" },
    ];
  }
  return [
    { path: "manifest.json", role: "External asset manifest", status: "exportable" },
    { path: "project.json", role: "Authoring source with asset references", status: "exportable" },
    { path: `${cleanProject.slug || slug(cleanProject.name)}.playable.html`, role: "Standalone playable", status: "exportable" },
    { path: `${cleanProject.slug || slug(cleanProject.name)}.adventureforge.json`, role: "Authoring source", status: "exportable" },
  ];
}

async function importCharacterModelFromData(modelData) {
  const model = {
    id: modelData.id || uid("model"),
    name: modelData.name || nextModelName("Imported Character"),
    role: modelData.role || "character",
    status: modelData.status || "provisional",
    locked: modelData.locked === true,
    registration: modelData.registration || { canvas: null, anchor: null, baseline: null },
    frames: (modelData.frames || []).map((frame) => ({ ...frame, id: frame.id || uid("frame") })),
    animations: modelData.animations || null,
    timelineHitboxes: modelData.timelineHitboxes || [],
  };
  for (const frame of model.frames) {
    if (frame.dataUrl && !frame.image) frame.image = await loadImage(frame.dataUrl);
    if (frame.image) {
      frame.width ||= frame.image.naturalWidth;
      frame.height ||= frame.image.naturalHeight;
      frame.alphaBounds ||= analyzeFrameAlpha(frame.image);
    }
  }
  const first = model.frames[0];
  model.registration.canvas ||= first ? { width: first.width, height: first.height } : null;
  model.registration.anchor ||= first ? [Math.round(first.width / 2), first.height] : null;
  model.registration.baseline ||= first?.height || null;
  model.animations ||= defaultAnimations(model.frames.length);
  repairModelAnimations(model);
  repairTimelineHitboxes(model);
  project.assets.characters.push(model);
  selectedAssetId = model.id;
  selectedAnimationHitboxId = null;
  renderAll();
  return serializableProject();
}

async function imageFileToLayer(file, base) {
  const dataUrl = await fileToDataUrl(file);
  const image = await loadImage(dataUrl);
  return {
    ...base,
    visible: true,
    locked: false,
    dataUrl,
    image,
    x: 0,
    y: 0,
    w: activeScene().width,
    h: activeScene().height,
    sourceSize: { width: image.naturalWidth, height: image.naturalHeight },
  };
}

async function splitSpriteSheetFile(file, frameW, frameH) {
  const dataUrl = await fileToDataUrl(file);
  const image = await loadImage(dataUrl);
  const columns = Math.floor(image.naturalWidth / frameW);
  const rows = Math.floor(image.naturalHeight / frameH);
  const frames = [];
  const canvas = document.createElement("canvas");
  canvas.width = frameW;
  canvas.height = frameH;
  const target = canvas.getContext("2d");
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      target.clearRect(0, 0, frameW, frameH);
      target.drawImage(image, column * frameW, row * frameH, frameW, frameH, 0, 0, frameW, frameH);
      const frameDataUrl = canvas.toDataURL("image/png");
      const frameImage = await loadImage(frameDataUrl);
      const alphaBounds = analyzeFrameAlpha(frameImage);
      if (!alphaBounds.empty) frames.push({ dataUrl: frameDataUrl, image: frameImage, alphaBounds });
    }
  }
  return frames;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function hydrateAssetImages() {
  for (const scene of project.scenes) {
    for (const layer of scene.layers || []) {
      if (layer.dataUrl && !layer.image) layer.image = await loadImage(layer.dataUrl);
    }
  }
  for (const model of project.assets.characters) {
    for (const frame of model.frames || []) {
      if (frame.dataUrl && !frame.image) frame.image = await loadImage(frame.dataUrl);
      if (frame.image && !frame.alphaBounds) frame.alphaBounds = analyzeFrameAlpha(frame.image);
    }
  }
}

function inferModelName(filename) {
  return filename
    .replace(/\.png$/i, "")
    .replace(/[_-]?(idle|walk|talk|frame|mouth)?[_-]?\d+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim() || "Imported Character";
}

function inferStateName(filename) {
  const lower = String(filename || "").toLowerCase();
  return animationStates.find((state) => lower.includes(state)) || "";
}

function hexToRgba(hex, alpha) {
  const bigint = parseInt(hex.slice(1), 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function roundRect(x, y, w, h, r) {
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
  };
}

function setActiveTab(tabName) {
  document.querySelectorAll(".workspace-tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === tabName));
  document.querySelectorAll(".tab-page").forEach((page) => page.classList.toggle("active", page.id === `tab-${tabName}`));
  if (tabName === "characters") renderAssetLists();
  if (tabName === "dialogue") renderDialogueGraph();
  if (tabName === "qa") {
    renderQaSummary();
    renderHandoffSummary();
  }
}

document.querySelectorAll(".workspace-tab").forEach((button) => {
  button.onclick = () => setActiveTab(button.dataset.tab);
});

window.AdventureForge = {
  project: () => serializableProject(),
  playableHtml: () => buildPlayableHtml(serializableProject()),
  exportPackage: () => buildExportPackage(serializableProject()),
  importCharacterModel: importCharacterModelFromData,
  saveLocal: () => saveLocalProject("Saved locally"),
  restoreLocal: () => restoreLocalProject(true),
  clearLocal: () => clearLocalProject(),
};

async function boot() {
  const restored = await restoreLocalProject(false);
  setHint(restored ? "Restored browser autosave." : toolHint(activeTool));
  renderAutosaveStatus();
  if (!restored) renderAll();
}

boot();
