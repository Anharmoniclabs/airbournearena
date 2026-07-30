import { chromium, devices } from "playwright";

const executablePath =
  process.env.AIRBOURNE_CHROME ??
  "/home/codespace/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
const baseUrl = process.env.AIRBOURNE_URL ?? "http://127.0.0.1:4173/index.html";
const output = process.env.AIRBOURNE_REVIEW_DIR ?? "/tmp";
const reviewCase = process.env.AIRBOURNE_CASE ?? "all";
const headful = process.env.AIRBOURNE_HEADFUL === "1";
const browser = await chromium.launch({
  executablePath,
  headless: !headful,
  args: headful
    ? ["--disable-dev-shm-usage"]
    : ["--disable-dev-shm-usage", "--use-angle=swiftshader"],
});

const failures = [];
async function openPage(context, label) {
  const page = await context.newPage();
  page.setDefaultTimeout(120_000);
  page.on("pageerror", (error) => failures.push(`${label}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`${label}: ${message.text()}`);
  });
  const url = new URL(baseUrl);
  url.searchParams.set("capture", "1");
  if (label !== "desktop hangar") url.searchParams.set("captureFlight", "1");
  await page.goto(url.href, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__AIRBOURNE_CAPTURE__);
  await page.waitForFunction(() => {
    const capture = window.__AIRBOURNE_CAPTURE__;
    return capture.getWorld() && capture.getStoryTemplateCount() >= 13;
  });
  await page.waitForTimeout(2200);
  return page;
}

async function enterMission(page, missionId, position, target) {
  await page.evaluate(
    ({ id, at, lookAt }) => {
      const capture = window.__AIRBOURNE_CAPTURE__;
      capture.startMission(id);
      capture.leaveHangar();
      capture.launch();
      const player = capture.getPlayer();
      if (at) player.pos.set(at[0], at[1], at[2]);
      if (lookAt) {
        const direction = new THREE.Vector3(...lookAt).sub(player.pos).normalize();
        player.quat.setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
        player.vel.copy(direction).multiplyScalar(150);
      }
      capture.settleFlightCamera();
      document.querySelector("#boot")?.classList.add("gone");
    },
    { id: missionId, at: position, lookAt: target },
  );
  await page.waitForTimeout(2600);
}

const desktop = await browser.newContext({ viewport: { width: 1280, height: 720 } });
if (reviewCase === "gamepad") {
  await desktop.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
    const controller = {
      axes: [0, 0, 0, 0],
      buttons,
      connected: true,
      id: "Airbourne Test Controller (STANDARD GAMEPAD)",
      index: 0,
      mapping: "standard",
      timestamp: 1,
    };
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [controller],
    });
    Object.defineProperty(window, "__AIRBOURNE_TEST_PAD__", { value: controller });
  });
}
if (reviewCase === "all" || reviewCase === "hangar") {
  const hangar = await openPage(desktop, "desktop hangar");
  await hangar.screenshot({ path: `${output}/airbourne-v2-hangar.png`, timeout: 120_000 });
  await hangar.close();
}
if (reviewCase === "all" || reviewCase === "flight") {
  const flight = await openPage(desktop, "desktop flight");
  await enterMission(flight, "ch1_m1", [650, 720, 980]);
  await flight.screenshot({ path: `${output}/airbourne-v2-flight.png`, timeout: 120_000 });
  await flight.close();
}
if (reviewCase === "nightmap") {
  const nightmap = await openPage(desktop, "desktop night map");
  await enterMission(nightmap, "ch1_m10", [0, 820, 250], [0, 820, -1000]);
  await nightmap.evaluate(() => {
    const capture = window.__AIRBOURNE_CAPTURE__;
    capture.setEnvironment(21, "fair");
    capture.settleFlightCamera();
  });
  await nightmap.waitForTimeout(1600);
  await nightmap.screenshot({
    path: `${output}/airbourne-v2-night-map.png`,
    timeout: 120_000,
  });
  await nightmap.close();
}
if (reviewCase === "all" || reviewCase === "bank") {
  const bank = await openPage(desktop, "desktop bank");
  await enterMission(bank, "ch1_m1", [650, 720, 980]);
  await bank.evaluate(() => {
    const capture = window.__AIRBOURNE_CAPTURE__;
    capture.getPlayer().quat.multiply(
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, -1),
        Math.PI * 0.46,
      ),
    );
    capture.settleFlightCamera();
  });
  await bank.waitForTimeout(1200);
  await bank.screenshot({ path: `${output}/airbourne-v2-bank.png`, timeout: 120_000 });
  await bank.close();
}
if (reviewCase === "all" || reviewCase === "carrier") {
  const carrier = await openPage(desktop, "desktop carrier");
  await enterMission(carrier, "ch6_m4", [2100, 1080, -620], [2850, 900, 0]);
  await carrier.screenshot({ path: `${output}/airbourne-v2-carrier.png`, timeout: 120_000 });
  await carrier.close();
}
if (reviewCase === "gamepad") {
  const controller = await openPage(desktop, "desktop gamepad");
  const before = await controller.evaluate(() => window.__AIRBOURNE_CAPTURE__.getWalk());
  await controller.evaluate(() => {
    window.__AIRBOURNE_TEST_PAD__.axes[1] = -1;
    for (let index = 0; index < 5; index++) {
      window.__AIRBOURNE_CAPTURE__.tickController(0.1);
    }
  });
  await controller.evaluate(() => {
    window.__AIRBOURNE_TEST_PAD__.axes[1] = 0;
    window.__AIRBOURNE_CAPTURE__.tickController(0.1);
  });
  const after = await controller.evaluate(() => window.__AIRBOURNE_CAPTURE__.getWalk());
  if (!(after.z < before.z - 0.05)) {
    throw new Error(`gamepad hangar movement did not advance: ${before.z} -> ${after.z}`);
  }
  await controller.evaluate(() => {
    const button = window.__AIRBOURNE_TEST_PAD__.buttons[9];
    button.pressed = true;
    button.value = 1;
    window.__AIRBOURNE_CAPTURE__.tickController(0.1);
  });
  await controller.evaluate(() => {
    const button = window.__AIRBOURNE_TEST_PAD__.buttons[9];
    button.pressed = false;
    button.value = 0;
    window.__AIRBOURNE_CAPTURE__.tickController(0.1);
  });
  await controller.waitForTimeout(900);
  const phase = await controller.evaluate(() => window.__AIRBOURNE_CAPTURE__.getPhase());
  if (phase === "hangar") {
    const debug = await controller.evaluate(() => ({
      button: window.__AIRBOURNE_TEST_PAD__.buttons[9],
      pad: window.__AIRBOURNE_CAPTURE__.getPad(),
    }));
    throw new Error(`gamepad Start did not leave the hangar: ${JSON.stringify(debug)}`);
  }
  await controller.evaluate(() => {
    window.__AIRBOURNE_TEST_PAD__.axes[0] = 0.72;
    // Some browser/controller pairs report trigger value without `pressed`.
    window.__AIRBOURNE_TEST_PAD__.buttons[7].value = 1;
    window.__AIRBOURNE_CAPTURE__.tickController(0.1);
  });
  await controller.waitForTimeout(180);
  const result = await controller.evaluate(() => ({
    bullets: window.__AIRBOURNE_CAPTURE__.getBulletCount(),
    pad: window.__AIRBOURNE_CAPTURE__.getPad(),
  }));
  if (!result.pad.on) throw new Error("gamepad was not marked connected");
  if (result.bullets < 1) throw new Error("analog right trigger did not fire");
  await controller.screenshot({
    path: `${output}/airbourne-v2-gamepad.png`,
    timeout: 120_000,
  });
  await controller.close();
}
await desktop.close();

if (reviewCase === "all" || reviewCase === "mobile") {
  const mobile = await browser.newContext({
    ...devices["iPhone 13"],
    viewport: { width: 780, height: 360 },
    screen: { width: 780, height: 360 },
    deviceScaleFactor: 1,
  });
  const phone = await openPage(mobile, "mobile flight");
  await enterMission(phone, "ch1_m1", [650, 720, 980]);
  await phone.screenshot({ path: `${output}/airbourne-v2-mobile-flight.png`, timeout: 120_000 });
  await phone.close();
  await mobile.close();
}
if (reviewCase === "mobilebank") {
  const mobile = await browser.newContext({
    ...devices["iPhone 13"],
    viewport: { width: 780, height: 360 },
    screen: { width: 780, height: 360 },
    deviceScaleFactor: 1,
  });
  const phone = await openPage(mobile, "mobile bank");
  await enterMission(phone, "ch1_m1", [650, 720, 980]);
  await phone.evaluate(() => {
    const capture = window.__AIRBOURNE_CAPTURE__;
    capture.getPlayer().quat.multiply(
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, -1),
        Math.PI * 0.46,
      ),
    );
    capture.settleFlightCamera();
  });
  await phone.waitForTimeout(1200);
  await phone.screenshot({
    path: `${output}/airbourne-v2-mobile-bank.png`,
    timeout: 120_000,
  });
  await phone.close();
  await mobile.close();
}
if (reviewCase === "nightmapmobile") {
  const mobile = await browser.newContext({
    ...devices["iPhone 13"],
    viewport: { width: 780, height: 360 },
    screen: { width: 780, height: 360 },
    deviceScaleFactor: 1,
  });
  const phone = await openPage(mobile, "mobile night map");
  await enterMission(phone, "ch1_m10", [0, 820, 250], [0, 820, -1000]);
  await phone.evaluate(() => {
    const capture = window.__AIRBOURNE_CAPTURE__;
    capture.setEnvironment(21, "fair");
    capture.settleFlightCamera();
  });
  await phone.waitForTimeout(1400);
  await phone.screenshot({
    path: `${output}/airbourne-v2-mobile-night-map.png`,
    timeout: 120_000,
  });
  await phone.close();
  await mobile.close();
}

await browser.close();
if (failures.length) {
  throw new Error(`Visual approval browser errors:\n${failures.join("\n")}`);
}
console.log("Visual approval frames captured with no browser errors.");
