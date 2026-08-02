import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const playwrightPath = process.env.PLAYWRIGHT_CORE_PATH
  || '/tmp/airbourne-capture/node_modules/playwright-core/index.js';
const executablePath = process.env.CHROMIUM_PATH
  || '/home/codespace/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const target = process.env.RUNTIME_CAPTURE_URL
  || 'http://127.0.0.1:4173/case-run.html?capture=1';
const outputDir = process.env.RUNTIME_CAPTURE_DIR
  || path.resolve(process.cwd(), '../source-assets/previews/runtime');
const flightOnly = process.env.RUNTIME_CAPTURE_FLIGHT_ONLY === '1';

const playwrightModule = await import(pathToFileURL(playwrightPath).href);
const { chromium } = playwrightModule.default || playwrightModule;
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--disable-gpu-sandbox',
  ],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  hasTouch: true,
});
const page = await context.newPage();
const browserErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => browserErrors.push(`page: ${error.message}`));
page.on('requestfailed', (request) => {
  browserErrors.push(`request: ${request.url()} — ${request.failure()?.errorText || 'failed'}`);
});

await page.goto(target, { waitUntil: 'load', timeout: 30_000 });
await page.waitForFunction(() => (
  window.__AIRBOURNE_CAPTURE__
  && window.__AIRBOURNE_CAPTURE__.hangarPlanes.blue
  && window.__AIRBOURNE_CAPTURE__.hangarPlanes.blue.userData.authoredPlane
  && window.__AIRBOURNE_CAPTURE__.hangarPlanes.blue.userData.authoredPlaneLod1
  && window.__AIRBOURNE_CAPTURE__.getHangarPilot().ready
  && window.__AIRBOURNE_CAPTURE__.renderer.info.render.calls > 0
), null, { timeout: 30_000 });
await page.waitForTimeout(1_500);

const hangarDiagnostics = await page.evaluate(() => {
  const capture = window.__AIRBOURNE_CAPTURE__;
  const host = capture.hangarPlanes.blue;
  const pilot = capture.getHangarPilot();
  const gl = capture.renderer.getContext();
  const pilotBounds = new THREE.Box3().setFromObject(pilot.root);
  let skinnedMeshes = 0;
  let mappedPilotMaterials = 0;
  pilot.root.traverse((object) => {
    if (!object.isSkinnedMesh) return;
    skinnedMeshes++;
    if (object.material?.map && object.material?.normalMap) mappedPilotMaterials++;
  });
  let authoredMappedMeshes = 0;
  let wrongAircraftMaps = 0;
  host.userData.authoredPlane.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    if (object.material.map) authoredMappedMeshes++;
    if (object.material.map === window.kestrelSkin) wrongAircraftMaps++;
  });
  return {
    phase: capture.st.phase,
    webglRenderer: gl.getParameter(gl.RENDERER),
    webglVersion: gl.getParameter(gl.VERSION),
    lodLevels: host.userData.authoredPlane.levels.length,
    lod0Visible: host.userData.authoredPlane.levels[0].object.visible,
    fallbackVisible: host.userData.legacyParts.some((part) => part.visible),
    authoredMappedMeshes,
    wrongAircraftMaps,
    pilot: {
      ready: pilot.ready,
      actions: pilot.actions,
      active: pilot.active,
      skinnedMeshes,
      mappedPilotMaterials,
      height: pilotBounds.max.y - pilotBounds.min.y,
    },
    renderCalls: capture.renderer.info.render.calls,
    triangles: capture.renderer.info.render.triangles,
  };
});

if (!flightOnly) {
  await page.screenshot({
    path: path.join(outputDir, 'vanguard-interceptor-v4-hangar-ui.png'),
    animations: 'disabled',
  });
}

await page.evaluate(() => {
  const capture = window.__AIRBOURNE_CAPTURE__;
  capture.leaveHangar();
  capture.launch();
  capture.st.camMode = 0;
  capture.settleFlightCamera();
});
await page.waitForFunction(() => (
  window.__AIRBOURNE_CAPTURE__.st.phase !== 'hangar'
  && window.__AIRBOURNE_CAPTURE__.st.started
  && window.__AIRBOURNE_CAPTURE__.getPlayer()
  && window.__AIRBOURNE_CAPTURE__.getPlayer().mesh.userData.authoredPlane
  && window.__AIRBOURNE_CAPTURE__.getPlayer().mesh.userData.authoredPlaneLod1
  && window.__AIRBOURNE_CAPTURE__.renderer.info.render.calls > 0
), null, { timeout: 20_000 });
await page.waitForTimeout(1_500);

const flightDiagnostics = await page.evaluate(() => {
  const capture = window.__AIRBOURNE_CAPTURE__;
  const host = capture.getPlayer().mesh;
  return {
    phase: capture.st.phase,
    started: capture.st.started,
    lodLevels: host.userData.authoredPlane.levels.length,
    currentLod: host.userData.authoredPlane.getCurrentLevel(),
    fallbackVisible: host.userData.legacyParts.some((part) => part.visible),
    renderCalls: capture.renderer.info.render.calls,
    triangles: capture.renderer.info.render.triangles,
    playerPosition: host.position.toArray(),
    cameraPosition: capture.camera.position.toArray(),
    cameraDistance: capture.camera.position.distanceTo(host.position),
  };
});
await page.screenshot({
  path: path.join(outputDir, 'vanguard-interceptor-v4-flight-ui.png'),
  animations: 'disabled',
});

const report = {
  target,
  hangar: hangarDiagnostics,
  flight: flightDiagnostics,
  errors: browserErrors,
};
await fs.writeFile(
  path.join(outputDir, 'vanguard-interceptor-v4-runtime-report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));
await browser.close();
