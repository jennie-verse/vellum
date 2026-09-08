/* Single source of truth for the app version.
   Bump this one value when you ship a change:
     - service-worker.js imports it and names its cache "vellum-v<VERSION>"
     - app.js registers the worker as "service-worker.js?v=<VERSION>" so iOS
       always notices the update, and shows the value in Settings > About
   Nothing else needs editing. */
self.VELLUM_VERSION = "2026.09.08-data-safety";
