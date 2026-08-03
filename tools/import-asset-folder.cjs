const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

function slug(text) {
  return String(text || "asset").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "asset";
}

function title(text) {
  return String(text || "Character").replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function alphaBounds(png) {
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (png.data[(png.width * y + x) * 4 + 3] > 0) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < 0) return { empty: true, x: 0, y: 0, w: 0, h: 0, bottom: 0, centerX: 0 };
  return { empty: false, x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, bottom: maxY, centerX: Math.round((minX + maxX) / 2) };
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

function listPngs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".png"))
    .map((entry) => path.join(dir, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

function buildModel(characterDir, rootDir) {
  const characterSlug = slug(path.basename(characterDir));
  const stateDirs = fs.readdirSync(characterDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  const frames = [];
  const animations = {};
  for (const stateDir of stateDirs) {
    const state = slug(stateDir.name);
    const indices = [];
    for (const pngPath of listPngs(path.join(characterDir, stateDir.name))) {
      const png = PNG.sync.read(fs.readFileSync(pngPath));
      indices.push(frames.length);
      frames.push({
        id: `${characterSlug}-${state}-${String(indices.length).padStart(2, "0")}`,
        name: path.basename(pngPath),
        width: png.width,
        height: png.height,
        alphaBounds: alphaBounds(png),
        sourcePath: path.relative(rootDir, pngPath).replace(/\\/g, "/"),
      });
    }
    if (indices.length) animations[state] = { frames: indices, fps: state === "walk" ? 8 : 6, loop: state !== "failed" };
  }
  const first = frames[0];
  const defaults = defaultAnimations(frames.length);
  for (const [state, config] of Object.entries(defaults)) animations[state] ||= config;
  return {
    id: `${characterSlug}-model`,
    name: title(path.basename(characterDir)),
    role: "character",
    status: "provisional",
    locked: false,
    registration: first ? { canvas: { width: first.width, height: first.height }, anchor: [Math.round(first.width / 2), first.height], baseline: first.height } : { canvas: null, anchor: null, baseline: null },
    frames,
    animations,
    timelineHitboxes: [],
  };
}

function importAssetFolder(rootDir, outputPath) {
  const charactersDir = path.join(rootDir, "characters");
  const models = fs.existsSync(charactersDir)
    ? fs.readdirSync(charactersDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => buildModel(path.join(charactersDir, entry.name), rootDir))
    : [];
  const project = {
    version: 1,
    name: title(path.basename(rootDir)),
    slug: slug(path.basename(rootDir)),
    activeSceneId: "scene-1",
    editor: { gridVisible: true, snapToGrid: false, gridSize: 16, zoom: "fit", labelsVisible: true, hitboxesVisible: true, baselinesVisible: false },
    export: { target: "standalone-html", debug: "off" },
    assets: { characters: models },
    script: { sourceName: "script.txt", text: "", lastSyncedAt: null },
    scenes: [{ id: "scene-1", name: "Scene 1", width: 960, height: 540, background: "#222831", layers: [{ id: "background", name: "Background", type: "background", depth: 0, visible: true, color: "#26374a" }], objects: [], dialogue: [], flags: [] }],
  };
  if (outputPath) fs.writeFileSync(outputPath, JSON.stringify(project, null, 2));
  return project;
}

if (require.main === module) {
  const rootDir = process.argv[2];
  const outputPath = process.argv[3] || path.join(rootDir || ".", "project.adventureforge.json");
  if (!rootDir) {
    console.error("usage: node tools/import-asset-folder.cjs asset-root output.json");
    process.exit(1);
  }
  const project = importAssetFolder(rootDir, outputPath);
  console.log(`Wrote ${outputPath} with ${project.assets.characters.length} character model(s)`);
}

module.exports = { importAssetFolder, alphaBounds };
