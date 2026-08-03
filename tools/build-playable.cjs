const fs = require("fs");
const path = require("path");
const { buildStandaloneHtml } = require("../src/runtime/forge-canvas-runtime.js");

function runtimeSource(name) {
  return fs.readFileSync(path.join(__dirname, "..", "src", "runtime", name), "utf8");
}

function buildPlayableHtml(project) {
  return buildStandaloneHtml(project, {
    coreSource: runtimeSource("forge-runtime-core.js"),
    runtimeSource: runtimeSource("forge-canvas-runtime.js"),
  });
}

if (require.main === module) {
  const input = process.argv[2];
  const output = process.argv[3];
  if (!input || !output) {
    console.error("usage: node tools/build-playable.cjs project.json output.html");
    process.exit(2);
  }

  const project = JSON.parse(fs.readFileSync(input, "utf8"));
  fs.writeFileSync(output, buildPlayableHtml(project));
  console.log(`Wrote ${output}`);
}

module.exports = { buildPlayableHtml };
