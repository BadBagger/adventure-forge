const fs = require("fs");
const path = require("path");

const FINAL_MODEL_STATUSES = new Set(["final", "production", "approved"]);
const NON_FINAL_QA_STATUSES = new Set(["needs-generation", "sliced-provisional", "seeded-from-existing-production-frames"]);

function productionReadiness(project, options = {}) {
  const issues = [];
  const summary = {
    scenes: (project.scenes || []).length,
    models: 0,
    finalModels: 0,
    nonFinalModels: 0,
    castClips: 0,
    finalCastClips: 0,
    nonFinalCastClips: 0,
    scriptLines: (project.script?.lines || []).length,
    voicedLines: 0,
    lipSyncLines: 0,
  };

  for (const model of project.assets?.characters || []) {
    summary.models += 1;
    const status = normalizeStatus(model.status);
    if (FINAL_MODEL_STATUSES.has(status)) summary.finalModels += 1;
    else {
      summary.nonFinalModels += 1;
      issue("art", "non-final-model", `${model.name || model.id} is ${model.status || "missing status"}, not final-approved.`, { modelId: model.id });
    }
    if (!model.frames?.length) issue("art", "missing-frames", `${model.name || model.id} has no imported frames.`, { modelId: model.id });
    for (const [stateName, animation] of Object.entries(model.animations || {})) {
      if (!animation.frames?.length) issue("animation", "empty-animation", `${model.name || model.id}.${stateName} has no frames.`, { modelId: model.id, state: stateName });
      if (animation.holds && animation.holds.length !== animation.frames.length) issue("animation", "bad-holds", `${model.name || model.id}.${stateName} holds length does not match frame count.`, { modelId: model.id, state: stateName });
    }
  }

  const library = project.assets?.castAnimationLibrary || null;
  if (!library) issue("art", "missing-cast-library", "Project does not include a cast animation library.", { tab: "characters" });
  else auditCastLibrary(library);

  for (const line of project.script?.lines || []) {
    const audio = line.audio || line.voice || line.voiceover;
    const lipSync = line.lipSync || line.lipsync || line.mouthCues;
    if (audio) summary.voicedLines += 1;
    else issue("audio", "missing-voice", `Script line ${line.line_id} has no voice/audio reference.`, { lineId: line.line_id });
    if (lipSync) summary.lipSyncLines += 1;
    else issue("lip-sync", "missing-lipsync", `Script line ${line.line_id} has no lip-sync cue reference.`, { lineId: line.line_id });
  }

  const finalReady = issues.length === 0;
  return {
    status: finalReady ? "production-ready" : "placeholder-ready",
    enforceFinal: options.enforceFinal === true,
    summary,
    issues,
  };

  function auditCastLibrary(castLibrary) {
    for (const [characterId, character] of Object.entries(castLibrary.characters || {})) {
      if (character.deferred) {
        issue("art", "deferred-character", `${character.displayName || characterId} is deferred: ${character.deferredReason || "no reason supplied"}`, { characterId });
        continue;
      }
      for (const [stateName, clip] of Object.entries(character.states || {})) auditClip("character", characterId, stateName, clip);
    }
    for (const [propId, prop] of Object.entries(castLibrary.props || {})) {
      for (const [stateName, clip] of Object.entries(prop.clips || {})) auditClip("prop", propId, stateName, clip);
    }
  }

  function auditClip(kind, ownerId, stateName, clip) {
    summary.castClips += 1;
    const status = normalizeStatus(clip.qaStatus);
    if (FINAL_MODEL_STATUSES.has(status)) summary.finalCastClips += 1;
    else {
      summary.nonFinalCastClips += 1;
      const reason = NON_FINAL_QA_STATUSES.has(status) ? clip.qaStatus : (clip.qaStatus || "missing qaStatus");
      issue("art", "non-final-cast-clip", `${kind} ${ownerId}.${stateName} is ${reason}.`, { kind, ownerId, state: stateName });
    }
  }

  function issue(area, code, message, target) {
    issues.push({ severity: "blocker", area, code, message, target });
  }
}

function normalizeStatus(value) {
  return String(value || "").toLowerCase().trim();
}

function renderMarkdown(report, projectName = "AdventureForge Project") {
  const lines = [];
  lines.push("# Production Readiness Audit");
  lines.push("");
  lines.push(`Project: ${projectName}`);
  lines.push(`Status: ${report.status}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Scenes: ${report.summary.scenes}`);
  lines.push(`- Character models: ${report.summary.finalModels}/${report.summary.models} final`);
  lines.push(`- Cast animation clips: ${report.summary.finalCastClips}/${report.summary.castClips} final`);
  lines.push(`- Script lines with voice: ${report.summary.voicedLines}/${report.summary.scriptLines}`);
  lines.push(`- Script lines with lip-sync cues: ${report.summary.lipSyncLines}/${report.summary.scriptLines}`);
  lines.push("");
  lines.push("## Blockers");
  lines.push("");
  if (!report.issues.length) lines.push("- None.");
  for (const issue of report.issues) lines.push(`- [${issue.area}/${issue.code}] ${issue.message}`);
  lines.push("");
  lines.push("## Next Gate");
  lines.push("");
  lines.push("Use `npm.cmd run production:audit` while the build is still placeholder-ready.");
  lines.push("Use `node tools/production-readiness.cjs adventureforge-playable-fixture.json --enforce-final` when final art/audio/lip-sync are expected; it exits non-zero until every blocker is gone.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const input = process.argv[2] || "adventureforge-playable-fixture.json";
  const enforceFinal = process.argv.includes("--enforce-final");
  const markdownOutIndex = process.argv.indexOf("--markdown");
  const markdownOut = markdownOutIndex >= 0 ? process.argv[markdownOutIndex + 1] : null;
  const project = JSON.parse(fs.readFileSync(input, "utf8"));
  const report = productionReadiness(project, { enforceFinal });
  if (markdownOut) {
    fs.mkdirSync(path.dirname(markdownOut), { recursive: true });
    fs.writeFileSync(markdownOut, renderMarkdown(report, project.name || input));
    console.log(`${markdownOut}: wrote production readiness audit`);
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
  if (enforceFinal && report.issues.length) process.exit(1);
}

if (require.main === module) main();

module.exports = { productionReadiness, renderMarkdown };
