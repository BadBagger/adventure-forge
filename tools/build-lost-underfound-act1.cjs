const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const { alphaBounds } = require("./import-asset-folder.cjs");

const forgeRoot = path.join(__dirname, "..");
const lostRoot = process.argv[2] || path.join(forgeRoot, "..", "..", "you-re-starting-a-new-project");
const outputProject = path.join(forgeRoot, "adventureforge-playable-fixture.json");
const outputPlayable = path.join(forgeRoot, "adventureforge-pilot.playable.html");
const lostForgeDir = path.join(lostRoot, "forge");

const { buildPlayableHtml } = require("./build-playable.cjs");

const sceneSize = { width: 1280, height: 720 };

const hotspotDefs = {
  "couch-ceiling": ["Couch-Bottom Ceiling", 120, 36, 1040, 150],
  "dust-clump": ["Dust Clump", 82, 582, 130, 92],
  "cubby-wall": ["Lost & Found Cubby Wall", 32, 178, 258, 410],
  "sign-in-log": ["Sign-In Log", 498, 286, 250, 112],
  "popcorn-boulder": ["Popcorn Kernel Boulder", 1012, 540, 170, 112],
  "cobweb-curtain": ["Cobweb Curtain", 982, 242, 276, 286],
  "bramble-desk": ["Bramble's Desk", 342, 392, 470, 248],
  "toll-gate": ["The Grate / Old Bottlecap", 848, 270, 266, 340],
};

const lineEvents = {
  "act01-005-pip-dustclump-search-success": { name: "found-button" },
  "act01-011-pip-signinlog-examine": { sfx: ["signinlog-open"] },
  "act01-013-pip-popcorn-use-fail": { sfx: ["popcorn-thud"] },
  "act01-014-pip-cobweb-examine": { name: "cobweb-cameo", sfx: ["cobweb-rustle"] },
  "act01-015-scuttle-cameo-bark": { name: "scuttle-cameo", sfx: ["scuttle-dash"] },
  "act01-038-bottlecap-no-toll": { name: "toll-refused", sfx: ["toll-refused"] },
  "act01-039-bottlecap-toll-accepted": { name: "toll-paid", sfx: ["toll-gate-open"], music: ["toll-paid-stinger"] },
  "act01-049-pip-transition-out": { name: "act-complete" },
};

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(lostRoot, relativePath), "utf8"));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".ogg") return "audio/ogg";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".wav") return "audio/wav";
  return "application/octet-stream";
}

function dataUrl(filePath) {
  return `data:${mimeFor(filePath)};base64,${fs.readFileSync(filePath).toString("base64")}`;
}

function imageLayer(id, name, type, relativePath, baseline, extra = {}) {
  const filePath = path.join(lostRoot, relativePath);
  return {
    id,
    name,
    type,
    x: 0,
    y: 0,
    w: sceneSize.width,
    h: sceneSize.height,
    baseline,
    visible: true,
    dataUrl: dataUrl(filePath),
    sourcePath: relativePath.replace(/\\/g, "/"),
    ...extra,
  };
}

function frameFromFile(id, filePath) {
  const png = PNG.sync.read(fs.readFileSync(filePath));
  return {
    id,
    name: path.basename(filePath),
    width: png.width,
    height: png.height,
    alphaBounds: alphaBounds(png),
    dataUrl: dataUrl(filePath),
    sourcePath: path.relative(lostRoot, filePath).replace(/\\/g, "/"),
  };
}

function pngs(relativeDir, limit = Infinity) {
  const dir = path.join(lostRoot, relativeDir);
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".png") && !entry.name.toLowerCase().includes("onion"))
    .map((entry) => path.join(dir, entry.name))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, limit);
}

function selectedPngs(relativeDir, names) {
  const dir = path.join(lostRoot, relativeDir);
  return names.map((name) => path.join(dir, name));
}

function modelFromDirs(id, name, status, dirs) {
  const frames = [];
  const animations = {};
  for (const [state, spec] of Object.entries(dirs)) {
    const files = spec.files ? selectedPngs(spec.dir, spec.files) : pngs(spec.dir, spec.count);
    const start = frames.length;
    frames.push(...files.map((file, index) => frameFromFile(`${id}-${state}-${String(index + 1).padStart(2, "0")}`, file)));
    animations[state] = {
      frames: files.map((_, index) => start + index),
      fps: spec.fps,
      loop: spec.loop,
      holds: spec.holds,
    };
  }
  const first = frames[0];
  return {
    id,
    name,
    status,
    locked: status === "approved",
    registration: first ? { canvas: { width: first.width, height: first.height }, anchor: [Math.round(first.width / 2), first.height], baseline: first.height } : {},
    frames,
    animations,
  };
}

function propModel(id, name, state, dir, fps, loop, count = Infinity) {
  return modelFromDirs(id, name, "provisional", { [state]: { dir, fps, loop, count } });
}

function buildLines() {
  const script = readJson("script/ACT_01_SCRIPT.json");
  const dialogue = readJson("script/ACT_01_DIALOGUE.json");
  const dialogueById = new Map(dialogue.lines.map((line) => [line.line_id, line]));
  return script.lines.map((scriptLine) => {
    const voiceLine = dialogueById.get(scriptLine.line_id);
    const audioFile = voiceLine?.audio_filename ? path.join(lostRoot, voiceLine.audio_filename) : null;
    return {
      ...scriptLine,
      text: voiceLine?.text || scriptLine.text,
      audio: audioFile && fs.existsSync(audioFile) ? voiceLine.audio_filename.replace(/^public\/audio\//, "audio/") : null,
      audioDataUrl: audioFile && fs.existsSync(audioFile) ? dataUrl(audioFile) : null,
      duration_s: voiceLine?.duration_s || null,
      event: lineEvents[scriptLine.line_id] || null,
    };
  });
}

function buildAudio() {
  const manifest = readJson("public/audio/AUDIO_MANIFEST.json");
  const cues = manifest.cues.map((cue) => {
    const filePath = path.join(lostRoot, "public", "audio", cue.filename);
    return {
      ...cue,
      id: cue.trigger,
      dataUrl: fs.existsSync(filePath) ? dataUrl(filePath) : null,
    };
  });
  return {
    cues,
    manifestNote: manifest.voiceDialogueNote,
    sourcingNote: manifest.sourcingNote,
  };
}

function buildCastLibrary() {
  const libraryPath = path.join(forgeRoot, "imports", "lost-underfound", "cast-animation-library.json");
  const library = JSON.parse(fs.readFileSync(libraryPath, "utf8"));
  library.scope = "act-1-playable";
  library.characters.grommet.deferred = true;
  return library;
}

function buildProject() {
  const scriptLines = buildLines();
  const audio = buildAudio();
  const castAnimationLibrary = buildCastLibrary();
  const v2 = "art/act01-production/scene/layered-v2";
  const spriteV2 = "art/act01-production/characters-sprite-v2";
  const layers = [
    imageLayer("background-plate", "Entry chamber furnished room background plate", "background", `${v2}/bg_room.png`, 0, { depth: 0 }),
    imageLayer("desk-foreground", "Bramble desk foreground occluder", "occlusion", `${v2}/occluders/desk_front.png`, 616, { x: 342, y: 396, w: 470, h: 238, depth: 40 }),
    imageLayer("gate-foreground", "Gate foreground occluder", "occlusion", `${v2}/occluders/gate_front.png`, 604, { x: 850, y: 274, w: 252, h: 330, depth: 42 }),
    imageLayer("cobweb-curtain", "Cobweb curtain foreground", "occlusion", `${v2}/cobweb.png`, 610, { x: 988, y: 248, w: 260, h: 264, depth: 50 }),
    imageLayer("soft-oval-shadow", "Reusable soft oval contact shadow", "background", `${v2}/fx/soft_oval_shadow.png`, 0, { visible: false, shadowAsset: true }),
  ];
  const characters = [
    {
      ...modelFromDirs("pip-model", "Pip", "provisional", {
        idle: { dir: `${spriteV2}/pip/idle`, count: 8, fps: 8, loop: true },
        walk: { dir: `${spriteV2}/pip/walk`, count: 9, fps: 12, loop: true },
        pickup: { dir: `${spriteV2}/pip/dust-reach`, count: 8, fps: 12, loop: false },
        handoff: { dir: `${spriteV2}/pip/toll-paid`, count: 6, fps: 12, loop: false },
        relief: { dir: `${spriteV2}/pip/relief`, count: 5, fps: 10, loop: false },
      }),
      scale: 1,
    },
    {
      ...modelFromDirs("bramble-model", "Bramble", "provisional", {
        idle: { dir: `${spriteV2}/bramble/idle`, count: 6, fps: 8, loop: true },
        talk: { dir: `${spriteV2}/bramble/talk`, count: 6, fps: 10, loop: true },
        greeting: { dir: `${spriteV2}/bramble/talk`, count: 6, fps: 10, loop: false },
        questGiver: { dir: `${spriteV2}/bramble/talk`, count: 6, fps: 10, loop: false },
        wrongAction: { dir: `${spriteV2}/bramble/talk`, count: 4, fps: 10, loop: false },
        postGate: { dir: `${spriteV2}/bramble/talk`, count: 4, fps: 10, loop: false },
      }),
      scale: 0.85,
    },
    {
      ...modelFromDirs("old-bottlecap-model", "Old Bottlecap", "provisional", {
        idle: { dir: `${spriteV2}/old-bottlecap/idle`, count: 8, fps: 6, loop: true },
        tollRefused: { dir: `${spriteV2}/old-bottlecap/toll-refused`, count: 5, fps: 8, loop: false },
        tollPaid: { dir: `${spriteV2}/old-bottlecap/toll-paid`, count: 7, fps: 8, loop: false, holds: [1, 1, 1, 1, 2, 1, 1] },
        talk: { dir: `${spriteV2}/old-bottlecap/talk`, count: 4, fps: 8, loop: true },
      }),
      scale: 0.6,
    },
    {
      ...modelFromDirs("scuttle-model", "Scuttle", "provisional", {
        dash: { dir: `${spriteV2}/scuttle/dash`, count: 5, fps: 16, loop: false },
        talk: { dir: `${spriteV2}/scuttle/dash`, count: 4, fps: 10, loop: false },
        idle: { dir: `${spriteV2}/scuttle/dash`, count: 1, fps: 6, loop: true },
      }),
      scale: 0.35,
    },
    propModel("dust-clump-model", "Dust Clump", "idle", "art/act01-production/scene/layered-v2/dust", 6, true, 1),
    modelFromDirs("dust-reveal-model", "Dust Reveal", "provisional", {
      reveal: { dir: "art/act01-production/scene/layered-v2/dust", files: ["reveal_01.png", "reveal_02.png", "reveal_03.png", "reveal_04.png", "reveal_05.png", "reveal_06.png"], fps: 8, loop: false },
    }),
    modelFromDirs("grate-model", "The Grate", "provisional", {
      open: { dir: "art/act01-production/scene/layered-v2/grate", files: ["open_01.png", "open_02.png", "open_03.png", "open_04.png", "open_05.png", "open_06.png"], fps: 8, loop: false },
    }),
    modelFromDirs("button-model", "Button", "provisional", {
      idle: { dir: "art/act01-production/scene/layered-v2/button", files: ["icon.png"], fps: 6, loop: true },
      held: { dir: "art/act01-production/scene/layered-v2/button", files: ["held.png"], fps: 6, loop: true },
      tossed: { dir: "art/act01-production/scene/layered-v2/button", files: ["tossed.png"], fps: 6, loop: false },
    }),
  ];

  const scene = {
    id: "under-couch-entry",
    name: "Act 1 - The Crack Under the Couch",
    width: sceneSize.width,
    height: sceneSize.height,
    background: "#21170f",
    layers,
    objects: [
      { id: "walk-band", kind: "walkable", name: "Under-couch walk plane", x: 64, y: 558, w: 1148, h: 114 },
      { id: "pip-actor", kind: "character", name: "Pip", x: 686, y: 478, w: 134, h: 194, baseline: 672, modelId: "pip-model", animationState: "idle", hotspotId: "pip-self", shadowW: 82, shadowH: 24, shadowOpacity: 0.48 },
      { id: "bramble-actor", kind: "character", name: "Bramble", x: 462, y: 350, w: 203, h: 165, baseline: 515, modelId: "bramble-model", animationState: "idle", nonInteractive: true, shadowW: 110, shadowH: 22, shadowOpacity: 0.22 },
      { id: "old-bottlecap-actor", kind: "character", name: "Old Bottlecap", x: 888, y: 488, w: 160, h: 116, baseline: 604, modelId: "old-bottlecap-model", animationState: "idle", nonInteractive: true, shadowW: 130, shadowH: 24, shadowOpacity: 0.46 },
      { id: "scuttle-actor", kind: "character", name: "Scuttle", x: 1050, y: 520, w: 124, h: 68, baseline: 588, modelId: "scuttle-model", animationState: "dash", hiddenInPlayable: true, nonInteractive: true, shadowW: 76, shadowH: 14, shadowOpacity: 0.38 },
      { id: "dust-prop", kind: "prop", name: "Dust Clump", x: 92, y: 592, w: 108, h: 80, baseline: 672, modelId: "dust-clump-model", animationState: "idle", hiddenInPlayable: false, nonInteractive: true, shadowW: 104, shadowH: 22, shadowOpacity: 0.34 },
      { id: "dust-reveal-prop", kind: "prop", name: "Dust Reveal", x: 70, y: 568, w: 150, h: 104, baseline: 672, modelId: "dust-reveal-model", animationState: "reveal", hiddenInPlayable: true, nonInteractive: true, shadowW: 118, shadowH: 24, shadowOpacity: 0.28 },
      { id: "grate-animation-prop", kind: "prop", name: "Opening Grate", x: 850, y: 410, w: 252, h: 194, baseline: 604, modelId: "grate-model", animationState: "open", hiddenInPlayable: true, nonInteractive: true, shadow: false },
      { id: "button-floor-prop", kind: "prop", name: "Button", x: 132, y: 620, w: 42, h: 42, baseline: 662, modelId: "button-model", animationState: "idle", hiddenInPlayable: true, nonInteractive: true, shadowW: 38, shadowH: 10, shadowOpacity: 0.3 },
      ...Object.entries(hotspotDefs).map(([id, [name, x, y, w, h]]) => ({
        id: `${id}-hotspot`,
        kind: "hitbox",
        name,
        x,
        y,
        w,
        h,
        baseline: y + h,
        hotspotId: id,
      })),
      { id: "pip-dialogue-anchor", kind: "dialogue", name: "Pip dialogue anchor", x: 660, y: 430, w: 260, h: 54, baseline: 484 },
      { id: "bramble-dialogue-anchor", kind: "dialogue", name: "Bramble dialogue anchor", x: 472, y: 238, w: 300, h: 54, baseline: 292 },
      { id: "old-bottlecap-dialogue-anchor", kind: "dialogue", name: "Old Bottlecap dialogue anchor", x: 800, y: 430, w: 300, h: 54, baseline: 484 },
      { id: "scuttle-dialogue-anchor", kind: "dialogue", name: "Scuttle dialogue anchor", x: 958, y: 424, w: 240, h: 54, baseline: 478 },
    ],
    postProcessing: {
      colorGrade: { color: "rgba(92, 50, 20, 0.13)", mode: "multiply" },
      vignette: { inner: 0.42, outer: 0.82, opacity: 0.34 },
      grain: { opacity: 0.055, tileSize: 96 },
      haze: { color: "rgba(180, 150, 112, 0.05)", y: 0, h: 330 },
    },
    integration: {
      referenceActorHeightPx: 194,
      scaleCalibration: {
        pip: 1,
        bramble: 0.85,
        oldBottlecap: 0.6,
        scuttle: 0.35,
      },
      shadowAssetId: "soft-oval-shadow",
    },
    dialogue: [],
    flags: {},
    locked: false,
  };

  return {
    version: 1,
    name: "Lost & Underfound - Act 1 Forge Build",
    slug: "lost-underfound-act-1-forge-build",
    activeSceneId: "under-couch-entry",
    assets: { characters, castAnimationLibrary, audio },
    script: { lines: scriptLines },
    scenes: [scene],
    export: {
      target: "standalone-html",
      debug: true,
      debugOverlays: false,
      notes: "AdventureForge production build for Act 1 only. Acts 2-3 require script/design passes before content buildout.",
    },
    game: buildGameSpec(),
  };
}

function buildGameSpec() {
  return {
    engine: "AdventureForge rules v1",
    status: "Act 1 playable production pass in AdventureForge.",
    buildStatus: "forge-complete-placeholder",
    completionRequired: true,
    defaultMode: "inspect",
    initialInventory: [],
    initialFlags: {},
    items: {
      button: { name: "Button", description: "Small, round, and apparently valid currency." },
    },
    startLineIds: ["act01-001-pip-cold-open-landing", "act01-002-pip-cold-open-goal"],
    fallbacks: {
      useScenery: ["act01-046-pip-fallback-use-scenery"],
      examineSelf: ["act01-047-pip-fallback-examine-self"],
      tryExit: ["act01-048-pip-fallback-try-exit"],
    },
    audio: {
      ambience: "scene_underneath_ambience",
      uiSelect: "ui_select",
      footstep: ["footstep", "footstep"],
    },
    eventActions: {
      "found-button": {
        durationMs: 1600,
        sfx: ["found-button", "button_pickup"],
        actors: [
          { objectId: "pip-actor", state: "pickup" },
          { objectId: "dust-prop", hidden: true, restore: false },
          { objectId: "dust-reveal-prop", state: "reveal", hidden: false, restore: false },
        ],
      },
      "toll-refused": {
        durationMs: 1200,
        sfx: ["toll-refused"],
        actors: [{ objectId: "old-bottlecap-actor", state: "tollRefused" }],
      },
      "toll-paid": {
        durationMs: 2600,
        sfx: ["toll-paid"],
        music: ["toll-paid"],
        actors: [
          { objectId: "pip-actor", state: "handoff" },
          { objectId: "old-bottlecap-actor", state: "tollPaid" },
          { objectId: "grate-animation-prop", state: "open", hidden: false, restore: false },
        ],
      },
      "scuttle-cameo": {
        durationMs: 1450,
        sfx: ["scuttle_cameo"],
        actors: [{ objectId: "scuttle-actor", state: "dash", hidden: false }],
      },
      "act-complete": {
        durationMs: 1200,
        actors: [{ objectId: "pip-actor", state: "relief" }],
      },
    },
    hotspots: {
      "pip-self": { inspect: [{ lineIds: ["act01-047-pip-fallback-examine-self"] }], use: [{ lineIds: ["act01-047-pip-fallback-examine-self"] }] },
      "couch-ceiling": { inspect: [{ lineIds: ["act01-003-pip-ceiling-examine"] }], use: [{ lineIds: ["act01-046-pip-fallback-use-scenery"] }] },
      "dust-clump": {
        inspect: [
          { unlessFlag: "dustSearched", lineIds: ["act01-004-pip-dustclump-examine"] },
          { lineIds: ["act01-006-pip-dustclump-search-again"], default: true },
        ],
        use: [
          { unlessFlag: "dustSearched", lineIds: ["act01-005-pip-dustclump-search-success"], effects: { setFlags: ["dustSearched"], addItems: ["button"] } },
          { lineIds: ["act01-006-pip-dustclump-search-again"], default: true },
        ],
      },
      "cubby-wall": {
        inspect: [
          { onceCounter: "cubby-intro", lineIds: ["act01-007-pip-cubbywall-examine-1st"], sfx: ["cubby_wall_inspect"] },
          { id: "cubby-rotate", cycleLineIds: ["act01-008-pip-cubbywall-rotate-1", "act01-009-pip-cubbywall-rotate-2", "act01-010-pip-cubbywall-rotate-3"], sfx: ["cubby_wall_inspect"], default: true },
        ],
        use: [{ lineIds: ["act01-046-pip-fallback-use-scenery"] }],
      },
      "sign-in-log": { inspect: [{ lineIds: ["act01-011-pip-signinlog-examine"], sfx: ["sign_in_log_inspect"] }], use: [{ lineIds: ["act01-046-pip-fallback-use-scenery"] }] },
      "popcorn-boulder": { inspect: [{ lineIds: ["act01-012-pip-popcorn-examine"] }], use: [{ lineIds: ["act01-013-pip-popcorn-use-fail"], sfx: ["popcorn_boulder_use"] }] },
      "cobweb-curtain": {
        inspect: [
          { unlessFlag: "scuttleSeen", lineIds: ["act01-014-pip-cobweb-examine", "act01-015-scuttle-cameo-bark", "act01-016-pip-cobweb-reaction"], effects: { setFlags: ["scuttleSeen"] } },
          { lineIds: ["act01-014-pip-cobweb-examine"], default: true },
        ],
        use: [{ lineIds: ["act01-048-pip-fallback-try-exit"] }],
      },
      "bramble-desk": {
        inspect: [{ lineIds: ["act01-036-bramble-wrong-action"], effects: { animationState: { objectId: "bramble-actor", state: "wrongAction" } } }],
        use: [{ lineIds: ["act01-036-bramble-wrong-action"], effects: { animationState: { objectId: "bramble-actor", state: "wrongAction" } } }],
      },
      "toll-gate": {
        inspect: [
          { requiresFlag: "gateOpen", lineIds: ["act01-043-pip-gate-reexamine-open"] },
          { lineIds: ["act01-037-pip-gate-examine"], default: true },
        ],
        use: [
          { requiresFlag: "gateOpen", lineIds: ["act01-043-pip-gate-reexamine-open"] },
          { lineIds: ["act01-038-bottlecap-no-toll"], default: true },
        ],
        useItem: {
          button: [
            {
              lineIds: ["act01-039-bottlecap-toll-accepted", "act01-040-bottlecap-toll-close", "act01-041-pip-lost-and-underfound-joke", "act01-042-bottlecap-go", "act01-049-pip-transition-out"],
              effects: { setFlags: ["gateOpen", "actComplete"], removeItems: ["button"] },
              after: { endGame: true, status: "Act 1 complete. Acts 2 and 3 need their own script/design pass before building continues.", label: "Finish Act 1" },
            },
          ],
        },
      },
    },
    conversations: {
      "bramble-desk": {
        introLineIds: [
          "act01-017-bramble-greeting",
          "act01-018-pip-greeting-response",
          "act01-019-bramble-marble-common",
          "act01-020-pip-popular-how",
          "act01-021-bramble-deflect",
          "act01-022-bramble-teach-verbs",
          "act01-023-pip-already-do-that",
          "act01-024-bramble-natural-claimant",
          "act01-025-bramble-quest-lead",
          "act01-026-pip-quest-lead-interrupt",
          "act01-027-bramble-quest-lead-gate",
          "act01-028-pip-what-does-he-want",
          "act01-029-bramble-toll",
          "act01-030-pip-any-tips",
          "act01-031-bramble-toll-hint",
        ],
        postGateLineIds: ["act01-044-pip-return-to-bramble", "act01-045-bramble-almost-disappointed"],
        topics: [
          { label: "About Bramble", lineIds: ["act01-032-bramble-about-herself", "act01-033-pip-nobody-made-you", "act01-034-bramble-the-tragedy"], effects: { animationState: { objectId: "bramble-actor", state: "talk" } } },
          { label: "About Old Bottlecap", lineIds: ["act01-035-bramble-about-bottlecap"], effects: { animationState: { objectId: "bramble-actor", state: "talk" } } },
        ],
      },
    },
  };
}

function main() {
  if (!fs.existsSync(lostRoot)) throw new Error(`Lost & Underfound root not found: ${lostRoot}`);
  const project = buildProject();
  fs.writeFileSync(outputProject, `${JSON.stringify(project, null, 2)}\n`);
  const playable = buildPlayableHtml(project);
  fs.writeFileSync(outputPlayable, playable);
  ensureDir(lostForgeDir);
  fs.writeFileSync(path.join(lostForgeDir, "lost-underfound-act1.forge.json"), `${JSON.stringify(project, null, 2)}\n`);
  fs.writeFileSync(path.join(lostForgeDir, "lost-underfound-act1.playable.html"), playable);
  console.log(`Wrote ${path.relative(forgeRoot, outputProject)}`);
  console.log(`Wrote ${path.relative(forgeRoot, outputPlayable)}`);
  console.log(`Mirrored Forge outputs to ${lostForgeDir}`);
}

if (require.main === module) main();

module.exports = { buildProject };
