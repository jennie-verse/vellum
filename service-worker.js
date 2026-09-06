/* Vellum offline shell.
   The version comes from js/version.js so the cache name and the About panel
   never drift apart. Bump it there, not here. */

importScripts("./js/version.js");

var CACHE_PREFIX = "vellum-v";
var CACHE = CACHE_PREFIX + self.VELLUM_VERSION;
var VERSION_PATH = new URL("./js/version.js", self.location.href).pathname;

var ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/app.css",
  "./js/version.js",
  "./js/app.js",
  "./fonts/lexend-400.woff2",
  "./fonts/lexend-600.woff2",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", function (event) {
  // No skipWaiting on purpose: a refresh mid-drawing would lose the alignment.
  // cache: "reload" bypasses the browser's own HTTP cache — without it, a
  // recently-visited asset can still be HTTP-cache-fresh and get copied
  // straight into the new versioned CACHE unchanged, silently defeating a
  // version bump.
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return Promise.all(ASSETS.map(function (url) {
        return fetch(new Request(url, { cache: "reload" })).then(function (response) {
          if (!response.ok) { throw new Error("Could not cache " + url + ": " + response.status); }
          return cache.put(url, response);
        });
      }));
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (name) {
        // CacheStorage is shared by every app on an origin. GitHub Pages project
        // sites therefore must never delete caches that do not belong to Vellum.
        return name.indexOf(CACHE_PREFIX) === 0 && name !== CACHE
          ? caches["delete"](name)
          : null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function fetchAndCache(cache, request) {
  return fetch(request).then(function (response) {
    if (!response || !response.ok || response.type !== "basic") {
      return response;
    }
    var copy = response.clone();
    return cache.put(request, copy).then(
      function () { return response; },
      function () { return response; }
    );
  });
}

self.addEventListener("fetch", function (event) {
  var request = event.request;

  if (request.method !== "GET") { return; }
  if (request.headers.has("range")) { return; }

  var url;
  try { url = new URL(request.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) { return; }

  event.respondWith(
    caches.open(CACHE).then(function (cache) {
      // The version file is the update signal. Prefer the network when online,
      // but retain the cached copy so the app still starts offline.
      if (url.pathname === VERSION_PATH) {
        return fetchAndCache(cache, request)["catch"](function () {
          return cache.match(request, { ignoreSearch: true }).then(function (hit) {
            return hit || Response.error();
          });
        });
      }

      return cache.match(request, { ignoreSearch: true }).then(function (hit) {
        if (hit) { return hit; }
        return fetchAndCache(cache, request)["catch"](function () {
          if (request.mode === "navigate") { return cache.match("./index.html"); }
          return Response.error();
        });
      });
    })
  );
});
