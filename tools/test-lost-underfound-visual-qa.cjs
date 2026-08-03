const assert = require("assert");
const fs = require("fs");
const path = require("path");

const fixturePath = path.resolve(process.argv[2] || "adventureforge-playable-fixture.json");
const project = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const runtimePath = path.join(__dirname, "..", "src", "runtime", "forge-canvas-runtime.js");
const runtimeSource = fs.readFileSync(runtimePath, "utf8");

function model(id) {
  const value = project.assets.characters.find((candidate) => candidate.id === id);
  assert.ok(value, `missing model ${id}`);
  return value;
}

function frameBounds(animationModel, state) {
  const animation = animationModel.animations[state];
  assert.ok(animation, `${animationModel.id} missing ${state} animation`);
  return animation.frames.map((index) => animationModel.frames[index].alphaBounds);
}

function framesFor(animationModel, state) {
  const animation = animationModel.animations[state];
  assert.ok(animation, `${animationModel.id} missing ${state} animation`);
  return animation.frames.map((index) => animationModel.frames[index]);
}

function clipDurationMs(animation) {
  const frameDuration = 1000 / animation.fps;
  const holds = Array.isArray(animation.holds) && animation.holds.length === animation.frames.length
    ? animation.holds
    : animation.frames.map(() => 1);
  return holds.reduce((total, hold) => total + hold * frameDuration, 0);
}

function assertMotionBudget(animationModel, state) {
  const animation = animationModel.animations[state];
  const count = animation.frames.length;
  if (animation.loop !== true) {
    assert.ok(count >= 4, `${animationModel.name}.${state} needs at least four authored poses`);
    return;
  }
  const minimumFrames = state === "walk" ? 9 : 5;
  const minimumCycleMs = state === "walk" ? 650 : 900;
  assert.ok(count >= minimumFrames, `${animationModel.name}.${state} has ${count} frames; looping clips need ${minimumFrames} or must be authored as a one-shot hold`);
  assert.ok(clipDurationMs(animation) >= minimumCycleMs, `${animationModel.name}.${state} cycles in ${Math.round(clipDurationMs(animation))}ms; slow it down or add frames before shipping`);
}

const scene = project.scenes.find((candidate) => candidate.id === project.activeSceneId);
assert.ok(scene, "active scene missing");

// Dialogue belongs below the canvas. A scene-space bubble would cover props and actors.
assert.ok(runtimeSource.includes('class="dialogue-dock"'), "playable export must include a bottom dialogue dock");
assert.ok(runtimeSource.includes("elements.dialogueDock?.removeAttribute(\"hidden\")"), "dialogue dock must open for a line");
assert.ok(runtimeSource.includes("elements.dialogueDock?.setAttribute(\"hidden\", \"\")"), "dialogue dock must close after a sequence");
assert.ok(!runtimeSource.includes("drawBubble(state.bubble);"), "playable runtime must not draw dialogue over the scene");

const pip = model("pip-model");
assert.strictEqual(pip.animations.walk.frames.length, 9, "Pip walk must retain the 9-key-pose contract");
Object.keys(pip.animations).forEach((state) => assertMotionBudget(pip, state));
const pipIdleBounds = frameBounds(pip, "idle");
assert.ok(pipIdleBounds.every((bounds) => bounds.bottom >= 299 && bounds.h >= 218), "Pip idle frames must include the full body down to visible feet");
assert.ok(runtimeSource.includes('state.player.facing = dx < 0 ? "left" : "right"'), "walking must set a stable facing direction from travel direction");
const pipActor = scene.objects.find((object) => object.id === "pip-actor");
assert.strictEqual(pipActor.flipWhenFacingLeft, true, "Pip must mirror only when walking left");
assert.ok(pipActor.w >= 145 && pipActor.h >= 175, "Pip actor must be large enough for feet/shoes to read in runtime");

const bottlecap = model("old-bottlecap-model");
Object.keys(bottlecap.animations).forEach((state) => assertMotionBudget(bottlecap, state));
const bottlecapBounds = frameBounds(bottlecap, "idle");
assert.strictEqual(bottlecapBounds.length, 5, "Bottlecap idle must retain a stable held loop");
assert.strictEqual(new Set(framesFor(bottlecap, "idle").map((frame) => frame.sourcePath)).size, 1, "Bottlecap idle must use one approved full-body source until final animation frames are approved");
assert.strictEqual(new Set(framesFor(bottlecap, "tollRefused").map((frame) => frame.sourcePath)).size, 1, "Bottlecap refusal must use one approved full-body source until final animation frames are approved");
const widths = bottlecapBounds.map((bounds) => bounds.w);
assert.ok(Math.max(...widths) / Math.min(...widths) < 1.05, "Bottlecap idle frames must not contain crop-scale outliers");
assert.strictEqual(new Set(bottlecapBounds.map((bounds) => `${bounds.y}:${bounds.bottom}`)).size, 1, "Bottlecap idle frames must share vertical registration");

const bramble = model("bramble-model");
Object.keys(bramble.animations).forEach((state) => assertMotionBudget(bramble, state));

const bottlecapActor = scene.objects.find((object) => object.id === "old-bottlecap-actor");
const brambleActor = scene.objects.find((object) => object.id === "bramble-actor");
const chair = scene.layers.find((layer) => layer.id === "desk-chair-back");
const desk = scene.layers.find((layer) => layer.id === "desk-foreground");
const gate = scene.layers.find((layer) => layer.id === "gate-foreground");
const cobweb = scene.layers.find((layer) => layer.id === "cobweb-curtain");
assert.ok(chair && chair.baseline < brambleActor.baseline && brambleActor.baseline < desk.baseline, "Bramble must draw seated in the chair, between chair back and counter front");
assert.ok(pipActor.h < desk.h * 0.8, "Pip must remain visibly smaller than the desk while keeping feet readable");
assert.ok(gate.baseline < bottlecapActor.baseline, "gate frame must stay behind Bottlecap so it frames rather than obscures him");
assert.ok(cobweb.x < gate.x + gate.w && cobweb.x + cobweb.w > gate.x && cobweb.y < gate.y + gate.h, "cobweb must physically overlap the grate instead of floating beside it");

const shadow = scene.layers.find((layer) => layer.id === scene.integration.shadowAssetId);
assert.ok(shadow && shadow.visible === false, "actor contact shadows must use the shared dynamic shadow asset");

console.log("Lost & Underfound visual QA passed: dialogue dock, 9-pose walk facing, safe Bottlecap frames, and connected gate/cobweb layers.");
