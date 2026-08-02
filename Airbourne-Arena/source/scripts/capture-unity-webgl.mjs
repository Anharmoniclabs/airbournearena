import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const buildRoot = resolve(repositoryRoot, "Builds/WebGL");
const hangarFramePath = resolve(repositoryRoot, "docs/renders/unity-webgl-hangar.png");
const aircraftPromptFramePath = resolve(repositoryRoot, "docs/renders/unity-webgl-aircraft-prompt.png");
const aircraftFitFramePath = resolve(repositoryRoot, "docs/renders/unity-webgl-aircraft-fit.png");
const flightFramePath = resolve(repositoryRoot, "docs/renders/unity-webgl-first-flight.png");
const turnFramePath = resolve(repositoryRoot, "docs/renders/unity-webgl-after-turn.png");
const loadingFailurePath = resolve(repositoryRoot, "docs/renders/unity-webgl-loading-failure.png");
const servedRequests = [];

const types = {
  ".br": "application/octet-stream",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
};

const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const filePath = resolve(buildRoot, relative);
    if (!filePath.startsWith(`${buildRoot}/`) && filePath !== buildRoot) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const body = await readFile(filePath);
    servedRequests.push({ relative, bytes: body.byteLength });
    const headers = { "Content-Type": types[extname(filePath)] ?? "application/octet-stream" };
    if (filePath.endsWith(".br")) {
      headers["Content-Encoding"] = "br";
      if (filePath.endsWith(".js.br")) headers["Content-Type"] = "text/javascript";
      if (filePath.endsWith(".wasm.br")) headers["Content-Type"] = "application/wasm";
    }
    response.writeHead(200, headers).end(body);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const serverPort = server.address().port;
const browser = await chromium.launch({
  executablePath: "/home/codespace/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
  headless: true,
  args: [
    "--no-sandbox",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 760 } });
const errors = [];
const messages = [];
let closingNormally = false;
browser.on("disconnected", () => {
  if (closingNormally) return;
  errors.push("browser: disconnected");
  process.stderr.write("browser: disconnected\n");
});
page.on("crash", () => {
  errors.push("page: crashed");
  process.stderr.write("page: crashed\n");
});
page.on("pageerror", (error) => {
  const detail = `pageerror: ${error.message}`;
  errors.push(detail);
  process.stderr.write(`${detail}\n`);
});
page.on("console", (message) => {
  const detail = `${message.type()}: ${message.text()}`;
  if (!messages.includes(detail)) messages.push(detail);
  if (message.type() === "error" || message.type() === "warning") {
    const failure = `console ${detail}`;
    if (!errors.includes(failure)) errors.push(failure);
  }
});
page.on("requestfailed", (request) => {
  const detail = `requestfailed: ${request.url()} — ${request.failure()?.errorText ?? "unknown"}`;
  errors.push(detail);
  process.stderr.write(`${detail}\n`);
});

try {
  await page.goto(`http://127.0.0.1:${serverPort}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#unity-loading-bar", { state: "hidden", timeout: 30_000 });
  const canvas = page.locator("#unity-canvas");
  await page.waitForTimeout(7_000);
  await canvas.screenshot({ path: hangarFramePath });

  // Exercise the desktop path instead of bypassing it with BEGIN: run toward
  // the Vanguard bay, strafe into its canonical 13m radius, press E to board,
  // then use Enter to launch from the fit-out.
  await canvas.click({ position: { x: 480, y: 300 } });
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(40_000);
  await page.keyboard.up("KeyW");
  await page.keyboard.down("KeyA");
  await page.waitForTimeout(20_000);
  await page.keyboard.up("KeyA");
  await page.waitForTimeout(350);
  await canvas.screenshot({ path: aircraftPromptFramePath });
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(500);
  await canvas.screenshot({ path: aircraftFitFramePath });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(4_000);
  await canvas.screenshot({ path: flightFramePath });

  await canvas.click({ position: { x: 480, y: 300 } });
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(900);
  await page.keyboard.up("KeyD");
  await page.waitForTimeout(350);
  await canvas.screenshot({ path: turnFramePath });
  process.stdout.write(JSON.stringify({
    hangarFramePath,
    aircraftPromptFramePath,
    aircraftFitFramePath,
    flightFramePath,
    turnFramePath,
    errors,
    canvas: await canvas.evaluate((element) => ({
      clientWidth: element.clientWidth,
      clientHeight: element.clientHeight,
      width: element.width,
      height: element.height,
    })),
  }, null, 2));
} catch (error) {
  await page.screenshot({ path: loadingFailurePath, fullPage: true });
  process.stdout.write(JSON.stringify({
    loadingFailurePath,
    error: error.message,
    errors,
    messages,
    servedRequests,
    documentState: await page.evaluate(() => ({
      readyState: document.readyState,
      scripts: Array.from(document.scripts, (script) => script.src || "inline"),
      resources: performance.getEntriesByType("resource").map((entry) => ({
        name: entry.name,
        duration: entry.duration,
        transferSize: entry.transferSize,
      })),
      loadingBarDisplay: getComputedStyle(document.querySelector("#unity-loading-bar")).display,
    })),
  }, null, 2));
  process.exitCode = 1;
} finally {
  closingNormally = true;
  await browser.close();
  server.closeAllConnections();
  server.close();
  process.exit(process.exitCode ?? 0);
}
