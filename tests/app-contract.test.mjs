import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

test("version has one source of truth across UI and service worker", async () => {
  const [version, app, serviceWorker, html] = await Promise.all([
    read("js/version.js"),
    read("js/app.js"),
    read("service-worker.js"),
    read("index.html"),
  ]);
  const currentVersion = version.match(/VELLUM_VERSION\s*=\s*"([^"]+)"/)[1];
  assert.ok(currentVersion);
  assert.match(serviceWorker, /importScripts\("\.\/js\/version\.js"\)/);
  assert.match(serviceWorker, /CACHE_PREFIX \+ self\.VELLUM_VERSION/);
  assert.match(app, /service-worker\.js\?v=/);
  assert.ok(html.includes(`id="about-version">${currentVersion}<`));
});

test("camera starts with a rear-camera preference and supported fallback", async () => {
  const app = await read("js/app.js");
  assert.match(app, /video\.facingMode = exact \? \{ exact: "environment" \} : \{ ideal: "environment" \}/);
  assert.match(app, /getStream\(true\).*?getStream\(false\)/s);
  for (const errorName of ["OverconstrainedError", "NotFoundError", "TypeError"]) {
    assert.ok(app.includes(errorName), `missing fallback for ${errorName}`);
  }
  assert.match(app, /navigator\.mediaDevices\.getUserMedia/);
});

test("photo picker return paths always clear picker state and recheck camera", async () => {
  const app = await read("js/app.js");
  assert.match(app, /function onPickerReturned/);
  assert.match(app, /pickerOpen = false/);
  assert.match(app, /scheduleCameraCheck\(600\)/);
  assert.match(app, /on\(el\.fileInput, "change", onFilePicked\)/);
  assert.match(app, /on\(el\.fileInput, "cancel", onPickerReturned\)/);
  assert.match(app, /on\(document, "visibilitychange"/);
  assert.match(app, /on\(window, "focus"/);
});

test("Wake Lock lifecycle is wired to user preference and visibility", async () => {
  const app = await read("js/app.js");
  assert.match(app, /navigator\.wakeLock\.request\("screen"\)/);
  assert.match(app, /wakeSentinel\.release\(\)/);
  assert.match(app, /document\.visibilityState === "visible"/);
  assert.match(app, /on\(el\.btnWake, "click"/);
});

test("offline shell assets exist and no remote runtime dependency is embedded", async () => {
  const [serviceWorker, html, app] = await Promise.all([
    read("service-worker.js"),
    read("index.html"),
    read("js/app.js"),
  ]);
  const assetsBlock = serviceWorker.slice(
    serviceWorker.indexOf("var ASSETS"),
    serviceWorker.indexOf("self.addEventListener(\"install\""),
  );
  const assets = [...assetsBlock.matchAll(/["']\.\/([^"']+)["']/g)]
    .map(match => match[1])
    .filter(Boolean);
  await Promise.all(assets.map(path => access(new URL(path, root))));
  assert.doesNotMatch(`${html}\n${app}`, /https?:\/\//i);
});

test("deployment workflow publishes an explicit runtime allowlist", async () => {
  const workflow = await read(".github/workflows/deploy.yml");
  for (const required of [
    "npm test",
    "npm run test:syntax",
    "cp .nojekyll README.md index.html manifest.webmanifest service-worker.js public/",
    "cp -R css docs fonts icons js licenses public/",
    "actions/upload-pages-artifact@v5",
    "actions/deploy-pages@v5",
  ]) assert.ok(workflow.includes(required), `missing workflow contract: ${required}`);
  assert.doesNotMatch(workflow, /cp -R \. public/);
});

test("public documentation matches the current version and the Actions deployment", async () => {
  const [readme, projectGuide, pagesGuide, testReport] = await Promise.all([
    read("README.md"),
    read("docs/README-KO.md"),
    read("docs/GITHUB-PAGES-KO.md"),
    read("docs/TEST-REPORT.md"),
  ]);
  const combined = `${readme}\n${projectGuide}\n${pagesGuide}\n${testReport}`;
  assert.match(combined, /GitHub Pages Actions/);
  const currentVersion = (await read("js/version.js")).match(/VELLUM_VERSION\s*=\s*"([^"]+)"/)[1];
  assert.ok(projectGuide.includes(`self.VELLUM_VERSION = "${currentVersion}"`));
  assert.match(pagesGuide, /Test and deploy Vellum/);
  assert.match(pagesGuide, /Source를 \*\*GitHub Actions\*\*/);
  assert.match(testReport, /Pages publishing source \| GitHub Actions/);
  assert.doesNotMatch(combined, /배포: GitHub Pages \(`main` 브랜치 `\/\(root\)`\)/);
});

test("startup preserves the saved photo and settings across application upgrades", async () => {
  const app = await read("js/app.js");
  assert.doesNotMatch(app, /deleteDatabase|freshStartReset/);
  assert.match(app, /restoreSettings\(\)/);
  assert.match(app, /return restorePhoto\(\)/);
});

test("foldable/Mac layout: wide-width rules, fine-pointer hover only, build stamp pinned", async () => {
  const [css, version, html] = await Promise.all([read("css/app.css"), read("js/version.js"), read("index.html")]);
  assert.match(css, /overscroll-behavior: none/);
  assert.match(css, /touch-action: manipulation/);
  assert.ok(css.includes("@media (min-width: 640px) and (min-height: 560px)"));
  assert.doesNotMatch(css, /@media \(min-width: 7[0-9]{2}px\)/);
  assert.match(css, /@media \(min-width: 640px\) and \(min-height: 560px\)[\s\S]*calc\(50% - 380px\)/);
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)/);
  // The camera must keep covering the window when it is resized.
  assert.match(css, /\.camera \{[^}]*object-fit: cover/);
  assert.match(version, /"2026\.11\.12-foldable2"/);
  assert.ok(html.includes('id="about-version">2026.11.12-foldable2<'));
});
