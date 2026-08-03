const assert = require("assert");
const core = require("../src/runtime/forge-runtime-core.js");
const { buildPlayableHtml } = require("./build-playable.cjs");

const scene = {
  id: "scene-1",
  name: "Counter Test",
  width: 320,
  height: 180,
  layers: [
    { id: "bg", name: "Background", type: "background", visible: true, depth: 0 },
    { id: "counter", name: "Front Counter", type: "occlusion", visible: true, x: 70, y: 95, w: 180, h: 40, baseline: 120 },
  ],
  objects: [
    { id: "walk", name: "Walk Zone", kind: "walkable", x: 20, y: 120, w: 260, h: 40 },
    { id: "hero", name: "Hero", kind: "character", x: 105, y: 58, w: 40, h: 70, baseline: 128, modelId: "hero-model", animationState: "stamp" },
    { id: "anchor", name: "Hero dialogue anchor", kind: "dialogue", x: 104, y: 42, w: 70, h: 20, baseline: 62 },
    { id: "hotspot", name: "Desk Hotspot", kind: "hitbox", x: 150, y: 82, w: 60, h: 50, baseline: 132, hotspotId: "desk" },
  ],
  dialogue: [],
};

const model = {
  id: "hero-model",
  frames: [{ id: "f0" }, { id: "f1" }, { id: "f2" }],
  animations: { stamp: { frames: [1, 2], fps: 2, loop: true }, idle: { frames: [0], fps: 1, loop: true } },
};

const project = {
  name: "Runtime Conformance",
  activeSceneId: "scene-1",
  scenes: [scene],
  assets: { characters: [model] },
  game: {
    buildStatus: "forge-complete-placeholder",
    initialInventory: ["stamp"],
    initialFlags: { intro: true },
    hotspots: {
      desk: { useItem: { stamp: [{ lineIds: ["ok"], after: { endGame: true } }] } },
    },
  },
  script: { lines: [{ line_id: "ok", speaker: "Hero", text: "Done." }] },
};

function main() {
  assert.strictEqual(core.activeScene(project).id, "scene-1");
  assert.strictEqual(core.baseline(scene.objects[1], scene), 128);

  const order = core.sortedDepthRenderables(scene).map((entry) => entry.item.id);
  assert.deepStrictEqual(order, ["counter", "hero", "hotspot"], "production baseline draw order should be stable");
  const editorOrder = core.sortedDepthRenderables(scene, { includeDialogue: true }).map((entry) => entry.item.id);
  assert.deepStrictEqual(editorOrder, ["anchor", "counter", "hero", "hotspot"], "editor/debug draw order should include dialogue anchors");

  scene.objects[1].baseline = 110;
  const crossedOrder = core.sortedDepthRenderables(scene).map((entry) => entry.item.id);
  assert.ok(crossedOrder.indexOf("hero") < crossedOrder.indexOf("counter"), "actor should flip behind counter when baseline crosses");
  scene.objects[1].baseline = 128;

  const missingOcclusionScene = JSON.parse(JSON.stringify(scene));
  missingOcclusionScene.layers[1].x = 0;
  missingOcclusionScene.layers[1].w = 20;
  missingOcclusionScene.objects[1].baseline = 110;
  const occlusionWarnings = core.collectOcclusionWarnings(missingOcclusionScene);
  assert.strictEqual(occlusionWarnings.length, 1, "actor behind an uncovered occluder should produce one warning");
  assert.strictEqual(occlusionWarnings[0].actor.id, "hero");
  assert.strictEqual(occlusionWarnings[0].layer.id, "counter");
  assert.deepStrictEqual(occlusionWarnings[0].actorBody, { x: 105, y: 72, w: 40, h: 56 });

  const coveredOcclusionScene = JSON.parse(JSON.stringify(scene));
  coveredOcclusionScene.objects[1].baseline = 110;
  assert.strictEqual(core.collectOcclusionWarnings(coveredOcclusionScene).length, 0, "actor behind a covering occluder should pass occlusion QA");

  assert.strictEqual(core.dialogueAnchorFor(scene, scene.objects[1]).id, "anchor");
  assert.strictEqual(core.currentFrame(model, "stamp", 0).id, "f1");
  assert.strictEqual(core.currentFrame(model, "stamp", 500).id, "f2");

  const walkPoint = core.nearestWalkPoint(scene, 500, 500);
  assert.strictEqual(walkPoint.x, 280);
  assert.strictEqual(walkPoint.y, 160);

  assert.strictEqual(core.objectAt(scene, 160, 90).id, "hotspot", "topmost interactive object should win hit testing");
  assert.notStrictEqual(core.objectAt(scene, 25, 125)?.kind, "walkable", "walkable zones are not interactive hit targets");

  const state = core.createGameState(project);
  core.applyEffects(state, scene, { setFlags: ["gateOpen"], clearFlags: ["intro"], addItems: ["key"], removeItems: ["stamp"], animationState: { objectId: "hero", state: "idle" } });
  assert.strictEqual(state.flags.gateOpen, true);
  assert.strictEqual(state.flags.intro, undefined);
  assert.deepStrictEqual(state.inventory, ["key"]);
  assert.strictEqual(scene.objects[1].animationState, "idle");

  const rule = core.pickInteractionRule(state, [{ requiresFlag: "missing", id: "bad" }, { requiresFlag: "gateOpen", id: "good" }], "desk");
  assert.strictEqual(rule.id, "good");

  assert.deepStrictEqual(core.collectGameCompletionIssues(project), [], "complete placeholder projects should pass completion QA");
  const blockedProject = JSON.parse(JSON.stringify(project));
  blockedProject.scenes.push({ id: "blocked", name: "Act 2 - Script Pass Required", width: 320, height: 180, layers: [], objects: [] });
  blockedProject.game.buildStatus = "Act 1 playable only";
  delete blockedProject.game.hotspots.desk.useItem.stamp[0].after;
  const completionMessages = core.collectGameCompletionIssues(blockedProject).map((issue) => issue.message);
  assert.ok(completionMessages.some((message) => message.includes("build status")), "completion QA should require the placeholder-complete build marker");
  assert.ok(completionMessages.some((message) => message.includes("blocker text")), "completion QA should reject placeholder blocker text");
  assert.ok(completionMessages.some((message) => message.includes("not reachable")), "completion QA should reject unreachable story scenes");
  assert.ok(completionMessages.some((message) => message.includes("after.endGame")), "completion QA should require an authored ending");

  const html = buildPlayableHtml(project);
  assert.ok(html.includes("ForgeRuntimeCore"), "playable export should embed Forge runtime core marker");
  assert.ok(html.includes("ForgeCanvasRuntime"), "playable export should embed Forge canvas runtime marker");
  console.log("runtime core conformance tests passed");
}

main();
