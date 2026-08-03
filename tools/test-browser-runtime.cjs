const assert = require("assert");
const { spawn } = require("child_process");
const http = require("http");
const { chromium } = require("playwright");

const PORT = 4177;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function startServer() {
  const child = spawn("python", ["-m", "http.server", String(PORT)], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  return child;
}

async function waitForServer() {
  const deadline = Date.now() + 10000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const statusCode = await new Promise((resolve, reject) => {
        const request = http.get(`${BASE_URL}/index.html`, (response) => {
          response.resume();
          response.on("end", () => resolve(response.statusCode));
        });
        request.on("error", reject);
        request.setTimeout(1000, () => request.destroy(new Error("timeout")));
      });
      if (statusCode >= 200 && statusCode < 400) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Browser test server did not start: ${lastError?.message || "timeout"}`);
}

async function clickCanvasAt(page, selector, x, y) {
  const box = await page.locator(selector).boundingBox();
  assert.ok(box, `${selector} should have a browser bounding box`);
  const size = await page.locator(selector).evaluate((canvas) => ({ width: canvas.width, height: canvas.height }));
  await page.mouse.click(box.x + (x / size.width) * box.width, box.y + (y / size.height) * box.height);
}

async function drainChoices(page, selector = "#choices") {
  for (let index = 0; index < 20; index += 1) {
    const button = page.locator(`${selector} button`).first();
    if (await button.count() === 0) return;
    await button.click();
    await page.waitForTimeout(60);
  }
  throw new Error(`Choice list ${selector} did not drain`);
}

async function selectInventory(page, label) {
  const button = page.locator("#inventory button", { hasText: label });
  if (await button.evaluate((node) => node.classList.contains("active"))) return;
  await button.click();
}

async function waitForInventory(page, label) {
  await page.locator("#inventory button", { hasText: label }).waitFor({ timeout: 8000 });
}

async function runEditorPreviewTest(page) {
  await page.goto(`${BASE_URL}/index.html`, { waitUntil: "networkidle" });
  const globals = await page.evaluate(() => ({
    core: Boolean(window.ForgeRuntimeCore),
    canvas: Boolean(window.ForgeCanvasRuntime),
  }));
  assert.deepStrictEqual(globals, { core: true, canvas: true }, "editor should load both Forge runtime globals");

  await page.click("#playPreview");
  await page.locator("#playModal:not(.hidden)").waitFor();
  await page.locator("#previewCanvas").waitFor();
  await page.waitForFunction(() => document.querySelector("#dialogueOutput")?.textContent.includes("Preview started"));

  await clickCanvasAt(page, "#previewCanvas", 688, 332);
  await page.waitForFunction(() => /Walking to Old well|Old well|stones are damp/i.test(document.querySelector("#dialogueOutput")?.textContent || document.querySelector("#previewStatus")?.textContent || ""), null, { timeout: 5000 });
}

async function runStandalonePlayableTest(page) {
  await page.goto(`${BASE_URL}/adventureforge-pilot.playable.html`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__FORGE_RUNTIME__ && window.ForgeRuntimeCore && window.ForgeCanvasRuntime));

  const conformance = await page.evaluate(() => {
    const runtime = window.__FORGE_RUNTIME__;
    const scene = runtime.state.scene;
    const bramble = scene.objects.find((object) => object.id === "bramble-actor");
    const pip = scene.objects.find((object) => object.id === "pip-actor");
    const desk = scene.layers.find((layer) => layer.id === "desk-foreground");
    const order = window.ForgeRuntimeCore.sortedDepthRenderables(scene).map((entry) => entry.item.id);
    const crossedOrder = (() => {
      const originalBaseline = pip.baseline;
      pip.baseline = 548;
      const result = window.ForgeRuntimeCore.sortedDepthRenderables(scene).map((entry) => entry.item.id);
      pip.baseline = originalBaseline;
      return result;
    })();
    const walkPoint = window.ForgeRuntimeCore.nearestWalkPoint(scene, 5000, 5000);
    const hit = window.ForgeRuntimeCore.objectAt(scene, 650, 440, { ignoreHidden: false, ignoreNonInteractive: false });
    return {
      sceneIds: window.__FORGE_PROJECT__.scenes.map((candidate) => candidate.id),
      brambleAnchor: window.ForgeRuntimeCore.dialogueAnchorFor(scene, bramble)?.id,
      completionIssues: window.ForgeRuntimeCore.collectGameCompletionIssues(window.__FORGE_PROJECT__).map((issue) => issue.message),
      brambleBeforeDesk: order.indexOf(bramble.id) < order.indexOf(desk.id),
      pipBeforeDeskAfterCrossing: crossedOrder.indexOf(pip.id) < crossedOrder.indexOf(desk.id),
      walkPoint: { x: walkPoint.x, y: walkPoint.y, areaId: walkPoint.area?.id },
      hitId: hit?.id,
    };
  });
  assert.deepStrictEqual(conformance.sceneIds, ["under-couch-entry"], "standalone build should be Act 1 only");
  assert.strictEqual(conformance.brambleAnchor, "bramble-dialogue-anchor");
  assert.deepStrictEqual(conformance.completionIssues, [], "shipped fixture should pass game-completion QA");
  assert.strictEqual(conformance.brambleBeforeDesk, true, "Bramble should draw behind the desk foreground occluder");
  assert.strictEqual(conformance.pipBeforeDeskAfterCrossing, true, "actor depth should flip when its baseline crosses a hotspot baseline");
  assert.deepStrictEqual(conformance.walkPoint, { x: 1516, y: 772, areaId: "walk-band" });
  assert.strictEqual(conformance.hitId, "bramble-desk-hotspot");

  await drainChoices(page);

  await clickCanvasAt(page, "#game", 650, 440);
  await page.waitForFunction(() => /Walking to Bramble's Desk|Bramble/i.test(document.querySelector("#status")?.textContent || document.querySelector("#speaker")?.textContent || ""), null, { timeout: 5000 });
  await page.waitForFunction(() => /Bramble|Scene Log/i.test(document.querySelector("#speaker")?.textContent || ""), null, { timeout: 5000 });

  await drainChoices(page);
  await page.click("#useMode");
  await clickCanvasAt(page, "#game", 110, 680);
  await waitForInventory(page, "Button");
  await drainChoices(page);

  await selectInventory(page, "Button");
  await clickCanvasAt(page, "#game", 1270, 450);
  await page.waitForFunction(() => window.__FORGE_RUNTIME__?.gameState.flags.gateOpen === true, null, { timeout: 10000 });
  await drainChoices(page);
  await page.waitForFunction(() => /Act 1 complete/i.test(document.querySelector("#status")?.textContent || ""), null, { timeout: 10000 });
  const endState = await page.evaluate(() => ({
    ended: window.__FORGE_RUNTIME__.state.ended,
    gameEnded: window.__FORGE_RUNTIME__.gameState.ended,
    actComplete: window.__FORGE_RUNTIME__.gameState.flags.actComplete,
    sceneId: window.__FORGE_RUNTIME__.state.scene.id,
    hasButton: window.__FORGE_RUNTIME__.gameState.inventory.includes("button"),
  }));
  assert.deepStrictEqual(endState, { ended: true, gameEnded: true, actComplete: true, sceneId: "under-couch-entry", hasButton: false });
}

async function main() {
  const server = startServer();
  let browser = null;
  try {
    await waitForServer();
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on("pageerror", (error) => {
      throw error;
    });
    await runEditorPreviewTest(page);
    await runStandalonePlayableTest(page);
    console.log("browser runtime conformance tests passed");
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
