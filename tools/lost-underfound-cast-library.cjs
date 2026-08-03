const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const { alphaBounds } = require("./import-asset-folder.cjs");

const repoRoot = path.join(__dirname, "..");
const libraryPath = path.join(repoRoot, "imports", "lost-underfound", "cast-animation-library.json");
const fixturePath = path.join(repoRoot, "adventureforge-playable-fixture.json");
const assetRoot = path.join(repoRoot, "assets", "lost-underfound", "animation-library");
const stripRoot = path.join(repoRoot, "imports", "lost-underfound", "generated-strips");
const qaRoot = path.join(repoRoot, "imports", "lost-underfound", "qa", "animation-library");

const CANONICAL_STATES = ["idle", "walk", "turnaround", "talk", "inspect", "pickup", "handoff", "tollRefused", "tollPaid", "dash", "reveal", "open"];
const STRUCTURE_TEMPLATE = "Single horizontal strip, [N] poses left to right, evenly spaced. Flat solid mid-grey background (#808080), no grid lines, no borders, no text, no cast shadows on the background. Same character, same design, same scale, same camera distance and eye level in every pose, even margins. Consistent flat lighting. [anchor line]";

const characterSpecs = {
  pip: {
    displayName: "Pip",
    modelId: "pip-model",
    scale: 1.0,
    anchorLine: "PIP -- full body, feet on a consistent ground line.",
    identityBlock: "**PIP** -- a shrunk kid searching under the couch for a lost lucky marble. Resourceful, stubborn, nervous energy -- brave because there's no better option. Practical kid clothes. [View per state.]",
    states: {
      idle: clip(6, "3/4", 8, true, "living idle: 1 neutral, 2 chest breath, 3 blink, 4 small anxious weight shift, 5 glance around, 6 settle. Alive, not statue-still."),
      walk: clip(9, "side, moving right", 12, true, "conform to the repo's 9-key-pose walk contract: 1 left contact, 2 left recoil/down, 3 left passing, 4 left high point, 5 right contact, 6 right recoil/down, 7 right passing, 8 right high point, 9 loop-safe return. Feet stay on one ground line."),
      turnaround: clip(6, "profile to front to profile", 10, false, "head/eyes lead, body follows -- no mirror snap. 1 facing left, 2 eyes cut right, 3 head turns, 4 shoulders follow to 3/4, 5 through front, 6 settle facing right."),
      talk: clip(5, "3/4", 10, false, "1 neutral, 2 lean toward object, 3 head tilt curious, 4 small nervous gesture, 5 react. Do not draw object."),
      inspect: clip(5, "3/4", 10, false, "1 neutral, 2 lean toward object, 3 head tilt curious, 4 small nervous gesture, 5 react. Do not draw object."),
      pickup: clip(8, "3/4", 12, false, "1 neutral, 2 crouch begins, 3 reaches into dust clump, 4 hand buried, 5 anticipation hold, 6 grasp, 7 rising with hand posed to hold, 8 upright presenting the button at chest. Object drawn only from pose 8."),
      hold: clip(4, "3/4", 8, true, "held-item idle: 1-4 subtle, item held at chest, small breathing."),
      handoff: clip(6, "3/4", 12, false, "toss/hand button to Bottlecap: 1 holding, 2 windup, 3 extend/throw, 4 release, 5 follow-through, 6 hand returns empty."),
      relief: clip(5, "3/4", 10, false, "after toll accepted: 1 tense, 2 realization, 3 exhale, 4 excited little bounce, 5 settle grinning."),
      transitionOut: clip(4, "3/4", 10, false, "exit reaction for line act01-049: 1 look toward the grate, 2 nod, 3 step toward, 4 pre-exit anticipation."),
    },
  },
  bramble: {
    displayName: "Bramble",
    modelId: "bramble-model",
    scale: 0.85,
    anchorLine: "BRAMBLE -- actor only, framed as if seated/set behind their station, no furniture or gate drawn, anchor point identical each pose.",
    identityBlock: "**BRAMBLE** -- a dust bunny who appointed itself Lost & Found Clerk. Fussy, procedure-proud, treats nonsense bureaucracy as sacred law. Small round dust-fluff body, expressive. **Actor only -- no desk drawn.** 3/4 view, framed as if seated behind a counter, hands posed at desk-surface height.",
    occluder: "desk-front",
    states: {
      idle: clip(6, "3/4 desk-anchored", 10, true, "fussy filing: 1 shuffling bottle-cap folders, 2 filing one, 3 checking a paper, 4 stamping lightly, 5 squaring the stack, 6 back to shuffling. Hands at desk height throughout."),
      talk: clip(5, "3/4 desk-anchored", 10, true, "interrupts the work naturally: 1 mid-file, 2 looks up, 3 gestures while explaining, 4 glances back at papers, 5 resumes work."),
      greeting: clip(5, "3/4 desk-anchored", 10, false, "Pip first approaches: 1 heads-down working, 2 notices, 3 straightens with importance, 4 officious little welcome gesture, 5 settles into clerk posture."),
      questGiver: clip(6, "3/4 desk-anchored", 10, false, "tutorial gesture set: 1 points (inspect), 2 mimes use, 3 mimes combining two items, 4 points off toward the gate, 5 emphatic nod, 6 hands-clasp settle."),
      responseSelf: clip(4, "3/4 desk-anchored", 10, false, "about self: 1 proud puff, 2 explanatory gesture, 3 beat, 4 return to work."),
      responseBottlecap: clip(4, "3/4 desk-anchored", 10, false, "about Old Bottlecap: 1 wary glance toward gate, 2 explanatory gesture, 3 beat, 4 return to work."),
      wrongAction: clip(4, "3/4 desk-anchored", 10, false, "1 sees the mistake, 2 fussy disapproval, 3 corrective wag, 4 settle."),
      postGate: clip(4, "3/4 desk-anchored", 10, false, "mildly disappointed Pip got through so fast: 1 looks up, 2 mild deflation, 3 small huff, 4 back to filing."),
    },
  },
  oldBottlecap: {
    displayName: "Old Bottlecap",
    modelId: "old-bottlecap-model",
    scale: 0.6,
    anchorLine: "OLD BOTTLECAP -- actor only, framed as if seated/set behind their station, no furniture or gate drawn, anchor point identical each pose.",
    identityBlock: "**OLD BOTTLECAP** -- an ancient sentient stack of bottle caps guarding the grate. Grumpy, deadpan, unimpressed by default. Comedy is heavy stillness and tiny judgmental movements, never frantic. Visually weighty despite small scale. **Actor only -- no gate bars drawn.** 3/4 view, fixed anchor.",
    occluder: "gate-front",
    states: {
      idle: clip(5, "3/4 gate-anchored", 6, true, "slow heavy loop: 1 settled, 2 slow rock to one side, 3 blink, 4 tiny eye shift, 5 small disapproving head tilt. Heavy, minimal -- weight over motion."),
      tollRefused: clip(4, "3/4 gate-anchored", 8, false, "1 idle, 2 short dismissive head shake, 3 turns slightly away, 4 back to idle."),
      tollPaid: clip(8, "3/4 gate-anchored", 8, false, "the big performance, held timing: 1 notices the button, 2 slow lean toward it, 3 reach on a deliberate arc, 4 takes it, 5 inspects -- held beat, 6 slow consideration, 7 grudging approval nod, 8 settles back into gate-guard pose."),
      talk: clip(4, "3/4 gate-anchored", 8, true, "lines 038-042: 1 neutral, 2 slow jaw/mouth open, 3 tiny head emphasis, 4 close. Deadpan, small."),
    },
  },
  scuttle: {
    displayName: "Scuttle",
    modelId: "scuttle-model",
    scale: 0.35,
    anchorLine: "SCUTTLE -- full body, tiny, consistent ground line.",
    identityBlock: "**SCUTTLE** -- a roly-poly courier bug, twitchy and self-important, always mid-delivery. A tiny official emergency with legs. Deliberately small. Side view for the dash.",
    states: {
      dash: clip(6, "side", 16, false, "one-shot burst through the cobweb on inspect: 1 solid ready pose, 2 launch, 3 smear frame elongated in travel direction, 4 smear frame, 5 solid landing pose, 6 skitters off. Keep 1 and 5 crisp so the smears read."),
      talk: clip(4, "side", 10, false, "line act01-015: 1 stops, 2 self-important puff, 3 quick bark with body jerk, 4 already leaving."),
    },
  },
  grommet: {
    displayName: "Grommet",
    modelId: "grommet-model",
    scale: 2.4,
    deferred: true,
    deferredReason: "Acts 2-3 lack script/design detail. Placeholder + scale-anchor only.",
    anchorLine: "GROMMET -- placeholder only, full body, consistent ground line.",
    identityBlock: "**GROMMET** -- a sock-puppet husk with gentle-guardian energy. Do not finalize until Acts 2-3 have script/design detail.",
    states: {},
  },
};

const propSpecs = {
  dustClump: {
    displayName: "Dust Clump",
    clips: {
      idle: propClip(4, 6, true, "settled clump, tiny drift/breathing loop."),
      reveal: propClip(7, 12, false, "search to puff to squash/stretch dispersal, button revealed only after Pip's reach anticipation, poses 5-7."),
    },
  },
  button: {
    displayName: "Button",
    clips: {
      reveal: propClip(3, 8, false, "glint and settle as it is uncovered."),
    },
  },
  grate: {
    displayName: "The Grate",
    clips: {
      open: propClip(6, 8, false, "toll-paid mechanical open: 1 closed, 2 clunk/anticipation, 3 begins sliding/lifting with weight, 4 mid, 5 near-open overshoot, 6 settle."),
    },
  },
  cobwebCurtain: {
    displayName: "Cobweb Curtain",
    clips: {
      disturbance: propClip(4, 12, false, "mostly static hotspot; 4-frame ripple triggered by Scuttle's dash."),
    },
  },
};

function clip(n, view, fps, loop, poseLine) {
  return { n, view, fps, loop, poseLine };
}

function propClip(n, fps, loop, poseLine) {
  return { n, fps, loop, poseLine };
}

function slug(text) {
  return String(text || "asset").replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function resolvedPrompt(character, clipConfig) {
  const structure = character.structureTemplate.replace("[N]", String(clipConfig.n));
  return `${structure}\n\n${character.identityBlock}\n\n${clipConfig.poseLine}`;
}

function buildManifest() {
  const characters = {};
  for (const [id, spec] of Object.entries(characterSpecs)) {
    const states = {};
    const character = {
      id,
      displayName: spec.displayName,
      modelId: spec.modelId,
      scale: spec.scale,
      deferred: spec.deferred === true,
      deferredReason: spec.deferredReason || "",
      structureTemplate: STRUCTURE_TEMPLATE,
      anchorLine: spec.anchorLine,
      identityBlock: spec.identityBlock,
      occluder: spec.occluder || null,
      states,
    };
    for (const [state, config] of Object.entries(spec.states || {})) {
      states[state] = {
        state,
        n: config.n,
        fps: config.fps,
        loop: config.loop,
        view: config.view,
        poseLine: config.poseLine,
        sourceStrip: `imports/lost-underfound/generated-strips/characters/${id}/${state}.png`,
        frameDir: `assets/lost-underfound/animation-library/characters/${id}/${state}`,
        sliceMode: "horizontal-even",
        backgroundKey: "#808080",
        qaStatus: "needs-generation",
        resolvedPrompt: resolvedPrompt(character, config),
      };
    }
    characters[id] = character;
  }
  const props = {};
  for (const [id, spec] of Object.entries(propSpecs)) {
    const clips = {};
    for (const [clipName, config] of Object.entries(spec.clips)) {
      const poseLine = config.poseLine;
      clips[clipName] = {
        state: clipName,
        n: config.n,
        fps: config.fps,
        loop: config.loop,
        poseLine,
        sourceStrip: `imports/lost-underfound/generated-strips/props/${id}/${clipName}.png`,
        frameDir: `assets/lost-underfound/animation-library/props/${id}/${clipName}`,
        sliceMode: "horizontal-even",
        backgroundKey: "#808080",
        qaStatus: "needs-generation",
        resolvedPrompt: `${STRUCTURE_TEMPLATE.replace("[N]", String(config.n)).replace("[anchor line]", "PROP -- object only, centered consistently in every pose.")}\n\n${spec.displayName.toUpperCase()} prop animation for Lost & Underfound. Object only on flat grey background, no character, no room, no text.\n\n${poseLine}`,
      };
    }
    props[id] = { id, displayName: spec.displayName, clips };
  }
  return {
    version: 1,
    project: "lost-underfound",
    policy: {
      promptComposition: "structureTemplateWithNInjection + identityBlock + poseLine",
      scaleIsRuntimeData: true,
      actorOnlyForAnchoredCharacters: true,
      backgroundKey: "#808080",
    },
    canonicalStates: CANONICAL_STATES,
    characters,
    props,
    environmentalThreats: {
      theRoar: {
        displayName: "The Roar",
        spriteFrames: false,
        note: "Vacuum cleaner threat handled through rumble, tremor, ambience, and Act 3 scripting later.",
      },
    },
  };
}

function keyToAlpha(png, key = [128, 128, 128]) {
  for (let index = 0; index < png.data.length; index += 4) {
    const r = png.data[index];
    const g = png.data[index + 1];
    const b = png.data[index + 2];
    if (Math.abs(r - key[0]) <= 6 && Math.abs(g - key[1]) <= 6 && Math.abs(b - key[2]) <= 6) {
      png.data[index + 3] = 0;
    }
  }
  return png;
}

function cropFrame(source, left, right) {
  const width = Math.max(1, right - left);
  const frame = new PNG({ width, height: source.height });
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (y * source.width + left + x) * 4;
      const targetOffset = (y * width + x) * 4;
      source.data.copy(frame.data, targetOffset, sourceOffset, sourceOffset + 4);
    }
  }
  return keyToAlpha(frame);
}

function writeContactSheet(frames, outputPath) {
  if (!frames.length) return;
  const width = frames.reduce((sum, frame) => sum + frame.width, 0);
  const height = Math.max(...frames.map((frame) => frame.height));
  const sheet = new PNG({ width, height });
  for (let i = 0; i < sheet.data.length; i += 4) {
    sheet.data[i] = 128;
    sheet.data[i + 1] = 128;
    sheet.data[i + 2] = 128;
    sheet.data[i + 3] = 255;
  }
  let offsetX = 0;
  for (const frame of frames) {
    blit(frame, sheet, offsetX, height - frame.height);
    offsetX += frame.width;
  }
  ensureDir(path.dirname(outputPath));
  fs.writeFileSync(outputPath, PNG.sync.write(sheet));
}

function writeOnion(frames, outputPath) {
  if (!frames.length) return;
  const width = Math.max(...frames.map((frame) => frame.width));
  const height = Math.max(...frames.map((frame) => frame.height));
  const onion = new PNG({ width, height });
  for (let i = 0; i < onion.data.length; i += 4) {
    onion.data[i] = 128;
    onion.data[i + 1] = 128;
    onion.data[i + 2] = 128;
    onion.data[i + 3] = 255;
  }
  frames.forEach((frame, index) => blitTint(frame, onion, Math.round((width - frame.width) / 2), height - frame.height, index / Math.max(1, frames.length - 1)));
  ensureDir(path.dirname(outputPath));
  fs.writeFileSync(outputPath, PNG.sync.write(onion));
}

function blit(source, target, offsetX, offsetY) {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const s = (y * source.width + x) * 4;
      const alpha = source.data[s + 3] / 255;
      if (!alpha) continue;
      const t = ((offsetY + y) * target.width + offsetX + x) * 4;
      target.data[t] = Math.round(source.data[s] * alpha + target.data[t] * (1 - alpha));
      target.data[t + 1] = Math.round(source.data[s + 1] * alpha + target.data[t + 1] * (1 - alpha));
      target.data[t + 2] = Math.round(source.data[s + 2] * alpha + target.data[t + 2] * (1 - alpha));
      target.data[t + 3] = 255;
    }
  }
}

function blitTint(source, target, offsetX, offsetY, ratio) {
  const tint = ratio < 0.5 ? [80, 190, 255] : [255, 210, 80];
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const s = (y * source.width + x) * 4;
      const alpha = Math.min(0.28, source.data[s + 3] / 255);
      if (!alpha) continue;
      const t = ((offsetY + y) * target.width + offsetX + x) * 4;
      target.data[t] = Math.round(tint[0] * alpha + target.data[t] * (1 - alpha));
      target.data[t + 1] = Math.round(tint[1] * alpha + target.data[t + 1] * (1 - alpha));
      target.data[t + 2] = Math.round(tint[2] * alpha + target.data[t + 2] * (1 - alpha));
      target.data[t + 3] = 255;
    }
  }
}

function splitClip(stripPath, clipConfig, outputDir, prefix) {
  if (!fs.existsSync(stripPath)) return { frames: [], missing: true };
  const strip = PNG.sync.read(fs.readFileSync(stripPath));
  ensureDir(outputDir);
  for (const entry of fs.readdirSync(outputDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".png")) fs.unlinkSync(path.join(outputDir, entry.name));
  }
  const frames = [];
  for (let index = 0; index < clipConfig.n; index += 1) {
    const left = Math.round(index * strip.width / clipConfig.n);
    const right = Math.round((index + 1) * strip.width / clipConfig.n);
    const frame = cropFrame(strip, left, right);
    const filename = `${prefix}_${String(index + 1).padStart(2, "0")}.png`;
    const outputPath = path.join(outputDir, filename);
    fs.writeFileSync(outputPath, PNG.sync.write(frame));
    const encoded = fs.readFileSync(outputPath).toString("base64");
    frames.push({
      id: `${prefix}-${String(index + 1).padStart(2, "0")}`,
      name: filename,
      width: frame.width,
      height: frame.height,
      sourcePath: path.relative(repoRoot, outputPath).replace(/\\/g, "/"),
      dataUrl: `data:image/png;base64,${encoded}`,
      alphaBounds: alphaBounds(frame),
    });
  }
  return { frames, missing: false };
}

function hydrateFixture(library) {
  const project = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  project.assets ||= {};
  project.assets.characters ||= [];
  project.assets.castAnimationLibrary = library;
  const modelsById = new Map(project.assets.characters.map((model) => [model.id, model]));

  for (const character of Object.values(library.characters)) {
    if (character.deferred) continue;
    const model = modelsById.get(character.modelId) || {
      id: character.modelId,
      name: character.displayName,
      role: "character",
      status: "provisional",
      locked: false,
      registration: { canvas: null, anchor: null, baseline: null },
      frames: [],
      animations: {},
      timelineHitboxes: [],
    };
    const preservedFrames = (model.frames || []).filter((frame) => !String(frame.sourcePath || frame.source || "").includes("assets/lost-underfound/animation-library/"));
    const frames = [...preservedFrames];
    const animations = { ...(model.animations || {}) };
    model.scale = character.scale;
    for (const [state, clipConfig] of Object.entries(character.states)) {
      const stripPath = path.join(repoRoot, clipConfig.sourceStrip);
      const outputDir = path.join(repoRoot, clipConfig.frameDir);
      const prefix = `${slug(character.id)}_${slug(state)}`;
      const result = splitClip(stripPath, clipConfig, outputDir, prefix);
      if (result.missing) continue;
      const start = frames.length;
      frames.push(...result.frames);
      animations[state] = { frames: result.frames.map((_, index) => start + index), fps: clipConfig.fps, loop: clipConfig.loop };
      clipConfig.qaStatus = "sliced-provisional";
      writeContactSheet(result.frames.map((frame) => PNG.sync.read(fs.readFileSync(path.join(repoRoot, frame.sourcePath)))), path.join(qaRoot, "characters", character.id, `${state}-contact-sheet.png`));
      writeOnion(result.frames.map((frame) => PNG.sync.read(fs.readFileSync(path.join(repoRoot, frame.sourcePath)))), path.join(qaRoot, "characters", character.id, `${state}-onion.png`));
    }
    model.frames = frames;
    model.animations = animations;
    if (!project.assets.characters.some((candidate) => candidate.id === model.id)) project.assets.characters.push(model);
  }

  fs.writeFileSync(fixturePath, JSON.stringify(project, null, 2));
}

function validateLibrary(library) {
  const issues = [];
  for (const state of CANONICAL_STATES) {
    if (!library.canonicalStates.includes(state)) issues.push(`missing canonical state ${state}`);
  }
  if (library.environmentalThreats?.theRoar?.spriteFrames !== false) issues.push("The Roar must not have sprite frames");
  for (const [id, character] of Object.entries(library.characters || {})) {
    if (character.deferred) {
      if (id === "grommet" && character.scale !== 2.4) issues.push("Grommet deferred metadata must retain scale 2.4");
      continue;
    }
    if (!Number.isFinite(Number(character.scale))) issues.push(`${id} missing numeric scale`);
    if (!character.structureTemplate || !character.identityBlock) issues.push(`${id} missing prompt blocks`);
    for (const [state, clipConfig] of Object.entries(character.states || {})) validateClip(`${id}.${state}`, clipConfig);
    if ((id === "bramble" || id === "oldBottlecap")) {
      for (const [state, clipConfig] of Object.entries(character.states || {})) {
        const prompt = clipConfig.resolvedPrompt || "";
        if (!/Actor only/i.test(prompt)) issues.push(`${id}.${state} prompt must enforce actor-only`);
      }
    }
  }
  for (const [id, prop] of Object.entries(library.props || {})) {
    for (const [clipName, clipConfig] of Object.entries(prop.clips || {})) validateClip(`prop.${id}.${clipName}`, clipConfig);
  }
  return issues;

  function validateClip(label, clipConfig) {
    if (!Number.isInteger(clipConfig.n) || clipConfig.n < 1) issues.push(`${label} missing valid n`);
    if (!Number.isFinite(Number(clipConfig.fps))) issues.push(`${label} missing fps`);
    if (typeof clipConfig.loop !== "boolean") issues.push(`${label} missing loop`);
    if (!clipConfig.poseLine) issues.push(`${label} missing pose line`);
    if (!clipConfig.resolvedPrompt) issues.push(`${label} missing resolved prompt`);
    if (!clipConfig.sourceStrip) issues.push(`${label} missing source strip`);
    if (!clipConfig.frameDir) issues.push(`${label} missing frame dir`);
    const stripPath = clipConfig.sourceStrip ? path.join(repoRoot, clipConfig.sourceStrip) : null;
    if (stripPath && fs.existsSync(stripPath)) {
      const frameDir = path.join(repoRoot, clipConfig.frameDir);
      const frames = fs.existsSync(frameDir) ? fs.readdirSync(frameDir).filter((name) => name.toLowerCase().endsWith(".png")) : [];
      if (frames.length && frames.length !== clipConfig.n) issues.push(`${label} sliced frame count ${frames.length} does not match n ${clipConfig.n}`);
    }
  }
}

function writeManifest() {
  ensureDir(path.dirname(libraryPath));
  const library = buildManifest();
  fs.writeFileSync(libraryPath, JSON.stringify(library, null, 2));
  return library;
}

function readManifest() {
  return JSON.parse(fs.readFileSync(libraryPath, "utf8"));
}

const existingSeedMap = [
  ["characters", "pip", "idle", "art/act01-production/characters/pip/idle", 6],
  ["characters", "pip", "walk", "art/act01-production/characters/pip/walk", 9],
  ["characters", "pip", "pickup", "art/act01-production/characters/pip/dust-reach", 8],
  ["characters", "pip", "handoff", "art/act01-production/characters/pip/toll-paid", 6],
  ["characters", "bramble", "idle", "art/act01-production/characters/bramble/idle", 6],
  ["characters", "bramble", "talk", "art/act01-production/characters/bramble/talk", 5],
  ["characters", "oldBottlecap", "idle", "art/act01-production/characters/old-bottlecap/idle", 5],
  ["characters", "oldBottlecap", "tollRefused", "art/act01-production/characters/old-bottlecap/toll-refused", 4],
];

function listPngs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".png") && !entry.name.toLowerCase().includes("onion"))
    .map((entry) => path.join(dir, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

function composeStrip(framePaths, outputPath) {
  const frames = framePaths.map((framePath) => PNG.sync.read(fs.readFileSync(framePath)));
  const frameWidth = Math.max(...frames.map((frame) => frame.width));
  const frameHeight = Math.max(...frames.map((frame) => frame.height));
  const strip = new PNG({ width: frameWidth * frames.length, height: frameHeight });
  for (let i = 0; i < strip.data.length; i += 4) {
    strip.data[i] = 128;
    strip.data[i + 1] = 128;
    strip.data[i + 2] = 128;
    strip.data[i + 3] = 255;
  }
  frames.forEach((frame, index) => {
    const x = index * frameWidth + Math.round((frameWidth - frame.width) / 2);
    const y = frameHeight - frame.height;
    blit(frame, strip, x, y);
  });
  ensureDir(path.dirname(outputPath));
  fs.writeFileSync(outputPath, PNG.sync.write(strip));
}

function seedExisting(lostRoot) {
  if (!lostRoot || !fs.existsSync(lostRoot)) throw new Error("usage: node tools/lost-underfound-cast-library.cjs seed-existing <lost-underfound-root>");
  const library = fs.existsSync(libraryPath) ? readManifest() : writeManifest();
  for (const [kind, owner, state, relativeDir, count] of existingSeedMap) {
    const sourceDir = path.join(lostRoot, relativeDir);
    const frames = listPngs(sourceDir).slice(0, count);
    if (frames.length !== count) throw new Error(`${owner}.${state} expected ${count} source frames, found ${frames.length}`);
    const clipConfig = library[kind][owner].states[state];
    if (clipConfig.n !== count) throw new Error(`${owner}.${state} manifest n ${clipConfig.n} does not match seed count ${count}`);
    const outputPath = path.join(repoRoot, clipConfig.sourceStrip);
    composeStrip(frames, outputPath);
    clipConfig.qaStatus = "seeded-from-existing-production-frames";
    clipConfig.sourceNote = `Seeded from ${relativeDir}; still provisional under the cast-library QA gate.`;
  }
  fs.writeFileSync(libraryPath, JSON.stringify(library, null, 2));
  return library;
}

function main() {
  const command = process.argv[2] || "help";
  if (command === "init") {
    const library = writeManifest();
    console.log(`Wrote ${path.relative(repoRoot, libraryPath)} with ${Object.keys(library.characters).length} character(s)`);
  } else if (command === "seed-existing") {
    seedExisting(process.argv[3]);
    console.log("seeded cast animation library strips from existing production frames");
  } else if (command === "validate") {
    const issues = validateLibrary(readManifest());
    if (issues.length) {
      console.error(issues.join("\n"));
      process.exit(1);
    }
    console.log("cast animation library validation passed");
  } else if (command === "import") {
    const library = readManifest();
    hydrateFixture(library);
    fs.writeFileSync(libraryPath, JSON.stringify(library, null, 2));
    const issues = validateLibrary(library);
    if (issues.length) {
      console.error(issues.join("\n"));
      process.exit(1);
    }
    console.log("cast animation library imported");
  } else {
    console.log("usage: node tools/lost-underfound-cast-library.cjs init|seed-existing <lost-root>|import|validate");
  }
}

if (require.main === module) main();

module.exports = { buildManifest, validateLibrary, splitClip, seedExisting };
