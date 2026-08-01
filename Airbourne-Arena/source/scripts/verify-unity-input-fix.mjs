import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const buildRoot = resolve(repositoryRoot, "Builds/WebGL");
const outputRoot = resolve(repositoryRoot, "docs/renders");
const frames = {
  hangar: resolve(outputRoot, "unity-input-fix-hangar.png"),
  hangarRight: resolve(outputRoot, "unity-input-fix-hangar-d-right.png"),
  flightUncaptured: resolve(outputRoot, "unity-input-fix-flight-uncaptured.png"),
  flightCaptured: resolve(outputRoot, "unity-input-fix-flight-captured.png"),
  flightTurn: resolve(outputRoot, "unity-input-fix-flight-d-turn.png"),
};
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
const browser = await chromium.launch({
  executablePath: "/home/codespace/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
  headless: true,
  args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle",
    "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 760 } });
const errors = [];
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});
page.on("requestfailed", (request) =>
  errors.push(`requestfailed: ${request.url()} — ${request.failure()?.errorText ?? "unknown"}`));

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#unity-loading-bar", { state: "hidden", timeout: 30_000 });
  const canvas = page.locator("#unity-canvas");
  await page.waitForTimeout(4_000);
  await canvas.screenshot({ path: frames.hangar });

  // A normal primary click must arm hangar mouse-look. D must use the explicit
  // positive/right path even if a local legacy Horizontal axis is inverted.
  await canvas.click({ position: { x: 480, y: 280 } });
  await page.mouse.move(760, 350, { steps: 8 });
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(1_400);
  await page.keyboard.up("KeyD");
  await canvas.screenshot({ path: frames.hangarRight });

  // Enter is the canonical keyboard launch shortcut and avoids conflating
  // this replay with UI-button hit testing.
  await page.keyboard.press("Enter");
  await page.waitForTimeout(4_000);
  await canvas.screenshot({ path: frames.flightUncaptured });

  // Until this deliberate flight-scene click, cursor motion must not steer.
  await canvas.click({ position: { x: 480, y: 300 } });
  await page.waitForTimeout(1_200);
  await canvas.screenshot({ path: frames.flightCaptured });
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(900);
  await page.keyboard.up("KeyD");
  await page.waitForTimeout(400);
  await canvas.screenshot({ path: frames.flightTurn });

  process.stdout.write(JSON.stringify({ frames, errors }, null, 2));
} finally {
  await browser.close();
  server.closeAllConnections();
  server.close();
}
