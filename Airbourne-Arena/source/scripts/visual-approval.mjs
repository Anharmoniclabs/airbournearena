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

await browser.close();
if (failures.length) {
  throw new Error(`Visual approval browser errors:\n${failures.join("\n")}`);
}
console.log("Visual approval frames captured with no browser errors.");
