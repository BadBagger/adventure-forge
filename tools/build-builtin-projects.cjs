const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..");
const inputPath = path.join(repoRoot, "adventureforge-playable-fixture.json");
const outputPath = path.join(repoRoot, "builtin-projects.js");

function buildBuiltinProjects() {
  const project = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const source = [
    "window.AdventureForgeBuiltInProjects = window.AdventureForgeBuiltInProjects || {};",
    `window.AdventureForgeBuiltInProjects.lostUnderfound = ${JSON.stringify(project)};`,
    "",
  ].join("\n");
  fs.writeFileSync(outputPath, source);
  return { inputPath, outputPath };
}

if (require.main === module) {
  const result = buildBuiltinProjects();
  console.log(`Wrote ${path.relative(repoRoot, result.outputPath)}`);
}

module.exports = { buildBuiltinProjects };
