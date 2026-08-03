const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

function parseArgs(argv) {
  const args = { input: argv[2], outDir: argv[3] };
  for (let index = 4; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--frame-width") args.frameWidth = Number(argv[++index]);
    else if (value === "--frame-height") args.frameHeight = Number(argv[++index]);
    else if (value === "--state") args.state = argv[++index];
    else if (value === "--prefix") args.prefix = argv[++index];
  }
  return args;
}

function assertArgs(args) {
  if (!args.input || !args.outDir || !Number.isInteger(args.frameWidth) || !Number.isInteger(args.frameHeight)) {
    throw new Error("usage: node tools/split-spritesheet.cjs sheet.png out-dir --frame-width N --frame-height N [--state idle] [--prefix name]");
  }
  if (args.frameWidth < 1 || args.frameHeight < 1) throw new Error("frame width/height must be positive integers");
}

function hasVisiblePixels(png, x, y, w, h) {
  for (let row = y; row < y + h; row += 1) {
    for (let col = x; col < x + w; col += 1) {
      if (png.data[(png.width * row + col) * 4 + 3] > 0) return true;
    }
  }
  return false;
}

function copyFrame(sheet, x, y, w, h) {
  const frame = new PNG({ width: w, height: h });
  for (let row = 0; row < h; row += 1) {
    for (let col = 0; col < w; col += 1) {
      const source = ((y + row) * sheet.width + (x + col)) * 4;
      const target = (row * w + col) * 4;
      sheet.data.copy(frame.data, target, source, source + 4);
    }
  }
  return frame;
}

function splitSpritesheet(args) {
  assertArgs(args);
  const sheet = PNG.sync.read(fs.readFileSync(args.input));
  const columns = Math.floor(sheet.width / args.frameWidth);
  const rows = Math.floor(sheet.height / args.frameHeight);
  const prefix = args.prefix || path.basename(args.input, path.extname(args.input));
  const state = args.state || "frames";
  const outputDir = path.join(args.outDir, state);
  fs.mkdirSync(outputDir, { recursive: true });
  const frames = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = column * args.frameWidth;
      const y = row * args.frameHeight;
      if (!hasVisiblePixels(sheet, x, y, args.frameWidth, args.frameHeight)) continue;
      const filename = `${prefix}_${state}_${String(frames.length + 1).padStart(2, "0")}.png`;
      const outputPath = path.join(outputDir, filename);
      fs.writeFileSync(outputPath, PNG.sync.write(copyFrame(sheet, x, y, args.frameWidth, args.frameHeight)));
      frames.push({ path: path.relative(args.outDir, outputPath).replace(/\\/g, "/"), width: args.frameWidth, height: args.frameHeight });
    }
  }
  const manifest = { source: path.basename(args.input), state, frameWidth: args.frameWidth, frameHeight: args.frameHeight, frames };
  fs.writeFileSync(path.join(outputDir, "sheet-manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

if (require.main === module) {
  try {
    const manifest = splitSpritesheet(parseArgs(process.argv));
    console.log(`Wrote ${manifest.frames.length} frame(s) for ${manifest.state}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = { splitSpritesheet, parseArgs };
