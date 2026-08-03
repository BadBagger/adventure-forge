const assert = require("assert");
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
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

async function runOpenLostUnderfoundTest(page) {
  await page.goto(`${BASE_URL}/index.html`, { waitUntil: "networkidle" });
  await page.locator("#projectName").waitFor();
  assert.strictEqual(await page.locator("#projectName").inputValue(), "AdventureForge Pilot");
  await page.click("#openLostUnderfound");
  await page.waitForFunction(() => document.querySelector("#projectName")?.value.includes("Lost & Underfound"), null, { timeout: 15000 });
  const loaded = await page.evaluate(() => ({
    name: document.querySelector("#projectName")?.value,
    sceneButtons: [...document.querySelectorAll("#sceneList button")].map((button) => button.textContent.trim()),
    sceneId: window.AdventureForge.project().activeSceneId,
    scenes: window.AdventureForge.project().scenes.map((scene) => scene.id),
  }));
  assert.strictEqual(loaded.name, "Lost & Underfound - Act 1 Forge Build");
  assert.deepStrictEqual(loaded.scenes, ["under-couch-entry"]);
  assert.ok(loaded.sceneButtons.some((label) => label.includes("The Crack Under the Couch")), "Lost & Underfound scene should be visible in the scene list");
  assert.strictEqual(loaded.sceneId, "under-couch-entry");
}

async function runOpenLostUnderfoundFileFallbackTest(page) {
  const fileUrl = `file:///${path.join(process.cwd(), "index.html").replace(/\\/g, "/")}`;
  await page.goto(fileUrl);
  await page.locator("#projectName").waitFor();
  assert.strictEqual(await page.locator("#projectName").inputValue(), "AdventureForge Pilot");
  await page.click("#openLostUnderfound");
  await page.waitForFunction(() => document.querySelector("#projectName")?.value.includes("Lost & Underfound"), null, { timeout: 15000 });
  const loaded = await page.evaluate(() => ({
    name: document.querySelector("#projectName")?.value,
    sceneId: window.AdventureForge.project().activeSceneId,
    hasBuiltIn: Boolean(window.AdventureForgeBuiltInProjects?.lostUnderfound),
  }));
  assert.strictEqual(loaded.name, "Lost & Underfound - Act 1 Forge Build");
  assert.strictEqual(loaded.sceneId, "under-couch-entry");
  assert.strictEqual(loaded.hasBuiltIn, true, "file-open fallback should load the built-in project bundle");
}

async function runStandalonePlayableTest(page) {
  await page.goto(`${BASE_URL}/adventureforge-pilot.playable.html`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__FORGE_RUNTIME__ && window.ForgeRuntimeCore && window.ForgeCanvasRuntime));
  assert.strictEqual(await page.locator("#dialogueDock").isHidden(), false, "opening narration should render in the bottom dialogue dock");

  const conformance = await page.evaluate(() => {
    const runtime = window.__FORGE_RUNTIME__;
    const scene = runtime.state.scene;
    const bramble = scene.objects.find((object) => object.id === "bramble-actor");
    const pip = scene.objects.find((object) => object.id === "pip-actor");
    const chair = scene.layers.find((layer) => layer.id === "desk-chair-back");
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
      layerIds: scene.layers.map((layer) => layer.id),
      brambleAnchor: window.ForgeRuntimeCore.dialogueAnchorFor(scene, bramble)?.id,
      completionIssues: window.ForgeRuntimeCore.collectGameCompletionIssues(window.__FORGE_PROJECT__).map((issue) => issue.message),
      brambleBeforeDesk: order.indexOf(bramble.id) < order.indexOf(desk.id),
      chairBeforeBramble: order.indexOf(chair.id) < order.indexOf(bramble.id),
      pipBeforeDeskAfterCrossing: crossedOrder.indexOf(pip.id) < crossedOrder.indexOf(desk.id),
      walkPoint: { x: walkPoint.x, y: walkPoint.y, areaId: walkPoint.area?.id },
      hitId: hit?.id,
      scaleCalibration: scene.integration?.scaleCalibration,
      postPass: Boolean(scene.postProcessing?.colorGrade && scene.postProcessing?.vignette && scene.postProcessing?.grain),
      shadowAsset: scene.integration?.shadowAssetId && scene.layers.some((layer) => layer.id === scene.integration.shadowAssetId && layer.visible === false),
    };
  });
  assert.deepStrictEqual(conformance.sceneIds, ["under-couch-entry"], "standalone build should be Act 1 only");
  assert.deepStrictEqual(conformance.layerIds, ["background-plate", "desk-chair-back", "desk-foreground", "gate-foreground", "cobweb-curtain", "soft-oval-shadow"]);
  assert.strictEqual(conformance.brambleAnchor, "bramble-dialogue-anchor");
  assert.deepStrictEqual(conformance.completionIssues, [], "shipped fixture should pass game-completion QA");
  assert.strictEqual(conformance.brambleBeforeDesk, true, "Bramble should draw behind the desk foreground occluder");
  assert.strictEqual(conformance.chairBeforeBramble, true, "Bramble should sit in front of the chair back");
  assert.strictEqual(conformance.pipBeforeDeskAfterCrossing, true, "actor depth should flip when its baseline crosses a hotspot baseline");
  assert.deepStrictEqual(conformance.walkPoint, { x: 1212, y: 672, areaId: "walk-band" });
  assert.strictEqual(conformance.hitId, "bramble-desk-hotspot");
  assert.deepStrictEqual(conformance.scaleCalibration, { pip: 1, bramble: 0.85, oldBottlecap: 0.6, scuttle: 0.35 });
  assert.strictEqual(conformance.postPass, true, "scene should define a single runtime color/vignette/grain post pass");
  assert.strictEqual(conformance.shadowAsset, true, "scene should hydrate one invisible reusable soft shadow asset");

  await drainChoices(page);
  assert.strictEqual(await page.locator("#dialogueDock").isHidden(), true, "dialogue dock must close after Done");

  await clickCanvasAt(page, "#game", 650, 440);
  await page.waitForFunction(() => /Walking to Bramble's Desk|Bramble/i.test(document.querySelector("#status")?.textContent || document.querySelector("#speaker")?.textContent || ""), null, { timeout: 5000 });
  await page.waitForFunction(() => /Bramble|Scene Log/i.test(document.querySelector("#speaker")?.textContent || ""), null, { timeout: 5000 });
  assert.strictEqual(await page.locator("#dialogueDock").isHidden(), false, "interaction text must render in the bottom dialogue dock");

  await drainChoices(page);
  await page.click("#useMode");
  await clickCanvasAt(page, "#game", 145, 620);
  await waitForInventory(page, "Button");
  await page.waitForFunction(() => {
    const scene = window.__FORGE_RUNTIME__?.state.scene;
    const dust = scene?.objects.find((object) => object.id === "dust-prop");
    const reveal = scene?.objects.find((object) => object.id === "dust-reveal-prop");
    return dust?.hiddenInPlayable === true && reveal?.hiddenInPlayable === false;
  }, null, { timeout: 5000 });
  await drainChoices(page);

  await selectInventory(page, "Button");
  await clickCanvasAt(page, "#game", 945, 430);
  await page.waitForFunction(() => window.__FORGE_RUNTIME__?.gameState.flags.gateOpen === true, null, { timeout: 10000 });
  await page.waitForFunction(() => window.__FORGE_RUNTIME__?.state.scene.objects.find((object) => object.id === "grate-animation-prop")?.hiddenInPlayable === false, null, { timeout: 5000 });
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
    await runOpenLostUnderfoundTest(page);
    await runOpenLostUnderfoundFileFallbackTest(page);
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
