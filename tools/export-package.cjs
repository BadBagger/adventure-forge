const fs = require("fs");
const path = require("path");

function stripEmbeddedAssets(project) {
  return JSON.parse(JSON.stringify(project, function replacer(key, value) {
    if (key === "dataUrl" && this && this.sourcePath) return undefined;
    if (key === "image") return undefined;
    return value;
  }));
}

function externalAssetManifest(project) {
  return {
    format: "adventureforge.asset-manifest",
    version: 1,
    project: { name: project.name, slug: project.slug, startSceneId: project.activeSceneId },
    layers: (project.scenes || []).flatMap((scene) => (scene.layers || [])
      .filter((layer) => layer.sourcePath || layer.dataUrl)
      .map((layer) => ({
        sceneId: scene.id,
        layerId: layer.id,
        name: layer.name,
        type: layer.type,
        sourcePath: layer.sourcePath || null,
        embedded: Boolean(layer.dataUrl && !layer.sourcePath),
      }))),
    frames: (project.assets?.characters || []).flatMap((model) => (model.frames || []).map((frame, index) => ({
      modelId: model.id,
      modelName: model.name,
      frameId: frame.id,
      index,
      name: frame.name,
      sourcePath: frame.sourcePath || null,
      sourceSheet: frame.sourceSheet || null,
      embedded: Boolean(frame.dataUrl && !frame.sourcePath),
      width: frame.width,
      height: frame.height,
      alphaBounds: frame.alphaBounds || null,
    }))),
  };
}

function exportPackage(inputPath, outDir) {
  const project = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  fs.mkdirSync(outDir, { recursive: true });
  const cleanProject = stripEmbeddedAssets(project);
  const manifest = externalAssetManifest(project);
  fs.writeFileSync(path.join(outDir, "project.json"), JSON.stringify(cleanProject, null, 2));
  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return { project: cleanProject, manifest };
}

if (require.main === module) {
  const inputPath = process.argv[2];
  const outDir = process.argv[3];
  if (!inputPath || !outDir) {
    console.error("usage: node tools/export-package.cjs project.adventureforge.json out-dir");
    process.exit(1);
  }
  const result = exportPackage(inputPath, outDir);
  console.log(`Wrote package with ${result.manifest.frames.length} frame reference(s)`);
}

module.exports = { exportPackage, externalAssetManifest, stripEmbeddedAssets };
