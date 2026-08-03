const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { PNG } = require("pngjs");
const { splitSpritesheet } = require("./split-spritesheet.cjs");
const { importAssetFolder } = require("./import-asset-folder.cjs");
const { exportPackage } = require("./export-package.cjs");
const { validateProject } = require("./validate-project.cjs");
const { productionReadiness } = require("./production-readiness.cjs");

function writePng(filePath, width, height, paint) {
  const png = new PNG({ width, height });
  paint(png);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

function fillRect(png, x, y, w, h, rgba) {
  for (let row = y; row < y + h; row += 1) {
    for (let col = x; col < x + w; col += 1) {
      const offset = (png.width * row + col) * 4;
      png.data[offset] = rgba[0];
      png.data[offset + 1] = rgba[1];
      png.data[offset + 2] = rgba[2];
      png.data[offset + 3] = rgba[3];
    }
  }
}

function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "adventureforge-pipeline-"));
  const sheet = path.join(tmp, "hero-sheet.png");
  writePng(sheet, 8, 4, (png) => {
    fillRect(png, 1, 1, 2, 2, [255, 0, 0, 255]);
    fillRect(png, 5, 1, 2, 2, [0, 255, 0, 255]);
  });

  const splitDir = path.join(tmp, "split");
  const splitManifest = splitSpritesheet({ input: sheet, outDir: splitDir, frameWidth: 4, frameHeight: 4, state: "stamp", prefix: "hero" });
  assert.strictEqual(splitManifest.frames.length, 2, "spritesheet split should emit visible frames only");
  assert.ok(fs.existsSync(path.join(splitDir, "stamp", "hero_stamp_01.png")), "first split frame exists");

  const assetRoot = path.join(tmp, "fixture-assets");
  const characterDir = path.join(assetRoot, "characters", "mara", "stamp");
  fs.mkdirSync(characterDir, { recursive: true });
  fs.copyFileSync(path.join(splitDir, "stamp", "hero_stamp_01.png"), path.join(characterDir, "mara_stamp_01.png"));
  fs.copyFileSync(path.join(splitDir, "stamp", "hero_stamp_02.png"), path.join(characterDir, "mara_stamp_02.png"));

  const projectPath = path.join(tmp, "project.adventureforge.json");
  const project = importAssetFolder(assetRoot, projectPath);
  assert.strictEqual(project.assets.characters.length, 1, "folder import should create one character");
  assert.deepStrictEqual(project.assets.characters[0].animations.stamp.frames, [0, 1], "folder import should map state frames");
  assert.ok(project.assets.characters[0].frames[0].sourcePath.includes("characters/mara/stamp"), "frames should keep external source paths");
  assert.deepStrictEqual(validateProject(project), [], "imported asset project should pass schema validation");

  const brokenProject = JSON.parse(JSON.stringify(project));
  brokenProject.scenes[0].objects.push({ id: "bad-character", kind: "character", name: "Bad Character", x: 1, y: 1, w: 10, h: 10, modelId: "missing-model" });
  brokenProject.assets.characters[0].animations.stamp.frames = [99];
  const validationMessages = validateProject(brokenProject).map((issue) => issue.message);
  assert.ok(validationMessages.some((message) => message.includes("missing model")), "validator should reject missing model references");
  assert.ok(validationMessages.some((message) => message.includes("missing frame index")), "validator should reject bad animation frame references");

  const placeholderAudit = productionReadiness(project);
  assert.strictEqual(placeholderAudit.status, "placeholder-ready", "imported provisional art should not be production-ready");
  assert.ok(placeholderAudit.issues.some((issue) => issue.code === "non-final-model"), "production audit should flag non-final models");

  const finalProject = JSON.parse(JSON.stringify(project));
  finalProject.assets.characters[0].status = "final";
  finalProject.assets.castAnimationLibrary = { characters: {}, props: {} };
  finalProject.script = { lines: [{ line_id: "line-1", speaker: "Mara", text: "Ready.", audio: "voice/line-1.wav", lipSync: "lipsync/line-1.json" }] };
  finalProject.game = { items: {}, hotspots: {}, startLineIds: ["line-1"] };
  const finalAudit = productionReadiness(finalProject);
  assert.strictEqual(finalAudit.status, "production-ready", "final art plus voice and lip-sync should pass production audit");

  const outDir = path.join(tmp, "package");
  const exported = exportPackage(projectPath, outDir);
  assert.ok(fs.existsSync(path.join(outDir, "project.json")), "project.json should be exported");
  assert.ok(fs.existsSync(path.join(outDir, "manifest.json")), "manifest.json should be exported");
  assert.strictEqual(exported.manifest.frames.length, 2, "manifest should include frame references");
  assert.strictEqual(exported.project.assets.characters[0].frames[0].dataUrl, undefined, "external package should not invent embedded data URLs");

  console.log("pipeline tests passed");
}

main();
