import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");

function makeHarness(cacheNames = ["vellum-v1", "vellum-v2", "other-app-v9"]) {
  const listeners = new Map();
  const deleted = [];
  const cache = {
    addAll: async () => {},
    match: async () => undefined,
    put: async () => {},
  };
  const self = {
    VELLUM_VERSION: "3",
    location: {
      href: "https://example.github.io/vellum/service-worker.js",
      origin: "https://example.github.io",
    },
    clients: { claim: async () => {} },
    addEventListener: (type, listener) => listeners.set(type, listener),
  };
  const context = vm.createContext({
    URL,
    Response,
    self,
    importScripts: () => {},
    fetch: async () => Response.error(),
    caches: {
      keys: async () => cacheNames,
      open: async () => cache,
      delete: async name => { deleted.push(name); return true; },
    },
  });
  vm.runInContext(source, context, { filename: "service-worker.js" });
  return { listeners, deleted };
}

test("activate removes only stale Vellum caches", async () => {
  const { listeners, deleted } = makeHarness();
  let completion;
  listeners.get("activate")({ waitUntil: promise => { completion = promise; } });
  await completion;
  assert.deepEqual(deleted, ["vellum-v1", "vellum-v2"]);
});

test("cross-origin, non-GET, and Range requests are not intercepted", () => {
  const { listeners } = makeHarness();
  const fetchHandler = listeners.get("fetch");
  const cases = [
    { method: "POST", url: "https://example.github.io/vellum/", headers: new Headers() },
    { method: "GET", url: "https://outside.example/file", headers: new Headers() },
    { method: "GET", url: "https://example.github.io/vellum/file", headers: new Headers({ range: "bytes=0-9" }) },
  ];
  for (const request of cases) {
    let intercepted = false;
    fetchHandler({ request, respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false);
  }
});

test("same-origin GET requests are intercepted", () => {
  const { listeners } = makeHarness();
  let responsePromise;
  listeners.get("fetch")({
    request: {
      method: "GET",
      url: "https://example.github.io/vellum/index.html",
      mode: "navigate",
      headers: new Headers(),
    },
    respondWith: promise => { responsePromise = promise; },
  });
  assert.ok(responsePromise instanceof Promise);
});
