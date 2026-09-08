/* Vellum — trace a photo on paper through the camera.
   Everything stays on the device: no network calls, no analytics, no accounts. */

(function () {
  "use strict";

  var VERSION = typeof self.VELLUM_VERSION === "string" ? self.VELLUM_VERSION : "?";

  var SIZE_STEPS = [null, 6, 8, 10, 12, 14, 17]; // index 1..6, 4 is the default
  var DEFAULT_STEP = 4;
  var MIN_SCALE = 0.2;
  var MAX_SCALE = 8;
  var DRAG_THRESHOLD = 8; // px before a touch counts as a drag
  var MAX_SIDE = 3000; // long edge kept for large photos
  var HIDDEN_AT = 5; // opacity below this shows the "Photo hidden" badge
  var TOAST_MS = 3000;
  var LS = "vellum.";
  var BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

  var el = {};
  var ids = [
    "stage", "camera", "photo-wrap", "photo", "screen-start", "screen-denied",
    "screen-error", "screen-resume", "screen-nophoto", "error-text", "btn-start",
    "btn-retry-denied", "btn-retry-error", "btn-resume", "btn-choose", "controls",
    "control-body", "btn-collapse", "btn-expand", "opacity", "opacity-value",
    "hidden-badge", "btn-photo", "btn-fit", "btn-lock", "lock-text", "btn-settings",
    "btn-clear", "settings", "btn-settings-close", "size-steps", "btn-size-reset",
    "btn-wake", "wake-note", "about-version", "about-repo", "about-repo-fallback",
    "about-repo-wrap", "confirm", "confirm-head",
    "confirm-text", "confirm-ok", "confirm-cancel", "toast", "file-input"
  ];

  var state = {
    opacity: 45,
    tx: 0, // translate as a fraction of stage width
    ty: 0, // translate as a fraction of stage height
    scale: 1, // 1 = fitted
    locked: false,
    step: DEFAULT_STEP,
    keepAwake: true,
    hasPhoto: false
  };

  var stream = null;
  var cameraRequest = null;
  var cameraStarted = false;
  var photoUrl = null;
  var wakeSentinel = null;
  var toastTimer = null;
  var checkTimer = null;
  var restarting = false;
  var confirmAction = null;
  var pickerOpen = false;
  var lastFocus = null;

  /* ---------------- small helpers ---------------- */

  function camel(id) {
    return id.replace(/-([a-z])/g, function (m, c) { return c.toUpperCase(); });
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function on(node, type, fn, opts) {
    node.addEventListener(type, fn, opts || false);
  }

  function lsGet(key) {
    try { return window.localStorage.getItem(LS + key); } catch (e) { return null; }
  }

  function lsSet(key, value) {
    try { window.localStorage.setItem(LS + key, value); } catch (e) { /* private mode or full */ }
  }

  function lsDel(key) {
    try { window.localStorage.removeItem(LS + key); } catch (e) { /* ignore */ }
  }

  function toast(message) {
    el.toast.textContent = message;
    el.toast.hidden = false;
    if (toastTimer) { window.clearTimeout(toastTimer); }
    toastTimer = window.setTimeout(function () {
      el.toast.hidden = true;
      el.toast.textContent = "";
    }, TOAST_MS);
  }

  /* ---------------- photo storage (IndexedDB) ---------------- */

  function idb() {
    return new Promise(function (resolve, reject) {
      var req = window.indexedDB.open("vellum", 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains("photo")) {
          req.result.createObjectStore("photo");
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbRun(mode, fn) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction("photo", mode);
        var req = fn(tx.objectStore("photo"));
        tx.oncomplete = function () { db.close(); resolve(req ? req.result : null); };
        tx.onerror = function () { db.close(); reject(tx.error); };
        tx.onabort = function () { db.close(); reject(tx.error); };
      });
    });
  }

  function savePhoto(blob) {
    return idbRun("readwrite", function (store) {
      return store.put(blob, "current");
    })["catch"](function (err) {
      var name = err && err.name ? err.name : "";
      // Do not leave an older photo behind after a failed replacement. Otherwise
      // the next launch would unexpectedly restore the previous alignment.
      return dropPhoto().then(function () {
        if (name === "QuotaExceededError" || name === "UnknownError") {
          toast("Not enough space to keep this photo for next time.");
        } else {
          toast("This photo could not be kept for next time.");
        }
      });
    });
  }

  function loadPhoto() {
    return idbRun("readonly", function (store) { return store.get("current"); });
  }

  function dropPhoto() {
    return idbRun("readwrite", function (store) {
      return store["delete"]("current");
    })["catch"](function () { /* nothing left to remove */ });
  }

  /* ---------------- transform ---------------- */

  function stageRect() {
    return el.stage.getBoundingClientRect();
  }

  /* The control bar grows with the text-size setting and changes shape between
     portrait and landscape, so overlays are positioned from its measured height
     instead of a guessed constant. */
  function measureBottomUi() {
    if (el.controls.hidden && el.btnExpand.hidden) {
      document.documentElement.style.setProperty("--bottom-ui", "0px");
      return;
    }
    var node = el.controls.hidden ? el.btnExpand : el.controls;
    var h = node.getBoundingClientRect().height;
    if (el.controls.hidden) { h += 16; }
    if (!h) { return; }
    document.documentElement.style.setProperty("--bottom-ui", Math.round(h) + "px");
  }

  function applyTransform() {
    var r = stageRect();
    var wrap = el.photoWrap.style;
    wrap.setProperty("--tx", (state.tx * r.width).toFixed(2) + "px");
    wrap.setProperty("--ty", (state.ty * r.height).toFixed(2) + "px");
    wrap.setProperty("--scale", state.scale.toFixed(4));
  }

  function saveTransform() {
    lsSet("transform", JSON.stringify({ tx: state.tx, ty: state.ty, scale: state.scale }));
  }

  function fit() {
    state.tx = 0;
    state.ty = 0;
    state.scale = 1;
    applyTransform();
    saveTransform();
  }

  /* ---------------- opacity, lock, text size ---------------- */

  function applyOpacity() {
    el.photoWrap.style.setProperty("--photo-opacity", String(state.opacity / 100));
    el.opacityValue.textContent = state.opacity + "%";
    el.hiddenBadge.hidden = !(state.hasPhoto && state.opacity < HIDDEN_AT);
    if (el.opacity.value !== String(state.opacity)) {
      el.opacity.value = String(state.opacity);
    }
  }

  function applyLock() {
    el.btnLock.setAttribute("aria-pressed", state.locked ? "true" : "false");
    el.lockText.textContent = state.locked ? "Locked" : "Lock";
    el.btnFit.disabled = !state.hasPhoto || state.locked;
    el.btnLock.disabled = !state.hasPhoto;
    el.btnClear.disabled = !state.hasPhoto;
    lsSet("locked", state.locked ? "1" : "0");
  }

  /* A lock protects one alignment. When that alignment is replaced or lost,
     keeping the lock would silently block the user from placing the new photo. */
  function unlockAlignment() {
    if (!state.locked) { return; }
    state.locked = false;
    applyLock();
  }

  function applySize() {
    var px = SIZE_STEPS[state.step] || SIZE_STEPS[DEFAULT_STEP];
    document.documentElement.style.setProperty("--fs", px + "px");
    var steps = el.sizeSteps.querySelectorAll(".step");
    for (var i = 0; i < steps.length; i += 1) {
      var isOn = Number(steps[i].getAttribute("data-step")) === state.step;
      steps[i].setAttribute("aria-pressed", isOn ? "true" : "false");
    }
    lsSet("step", String(state.step));
    measureBottomUi();
    applyTransform();
  }

  /* ---------------- photo pipeline ---------------- */

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error("decode failed")); };
      img.src = src;
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) { resolve(blob); }, type, quality);
    });
  }

  /* Shrinks oversized photos so iOS Safari can render them comfortably.
     Alpha-capable sources stay PNG so transparent line art does not go black. */
  function prepare(file) {
    var url = URL.createObjectURL(file);
    var img = null;

    return loadImage(url).then(function (loaded) {
      img = loaded;
      var w = img.naturalWidth;
      var h = img.naturalHeight;
      if (!w || !h) { throw new Error("decode failed"); }
      if (Math.max(w, h) <= MAX_SIDE) { return file; }

      var ratio = MAX_SIDE / Math.max(w, h);
      var cw = Math.max(1, Math.round(w * ratio));
      var ch = Math.max(1, Math.round(h * ratio));

      // Prefer createImageBitmap with EXIF orientation applied; fall back to the
      // <img> element, which the browser has already oriented for us.
      var sourcePromise = Promise.resolve(img);
      if (typeof window.createImageBitmap === "function") {
        sourcePromise = window.createImageBitmap(file, { imageOrientation: "from-image" })
          .then(function (bitmap) {
            if (bitmap.width === w && bitmap.height === h) { return bitmap; }
            if (bitmap.close) { bitmap.close(); }
            return img;
          })["catch"](function () { return img; });
      }

      return sourcePromise.then(function (source) {
        var canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(source, 0, 0, cw, ch);
        if (source !== img && source.close) { source.close(); }
        var keepsAlpha = /(png|webp|gif|avif|svg)/i.test((file.type || "") + " " + (file.name || ""));
        return canvasToBlob(canvas, keepsAlpha ? "image/png" : "image/jpeg", 0.9)
          .then(function (blob) { return blob || file; });
      });
    })["finally"](function () {
      URL.revokeObjectURL(url);
    });
  }

  function showPhoto(blob, resetView) {
    if (photoUrl) { URL.revokeObjectURL(photoUrl); }
    photoUrl = URL.createObjectURL(blob);
    el.photo.src = photoUrl;
    el.photoWrap.hidden = false;
    state.hasPhoto = true;
    if (resetView) {
      state.tx = 0;
      state.ty = 0;
      state.scale = 1;
      unlockAlignment();
      saveTransform();
    }
    applyTransform();
    applyOpacity();
    applyLock();
    updateScreens();
  }

  function clearPhoto() {
    if (photoUrl) { URL.revokeObjectURL(photoUrl); photoUrl = null; }
    el.photo.src = BLANK;
    el.photoWrap.hidden = true;
    state.hasPhoto = false;
    state.tx = 0;
    state.ty = 0;
    state.scale = 1;
    state.locked = false;
    applyTransform();
    applyLock();
    applyOpacity();
    lsDel("transform");
    dropPhoto();
    updateScreens();
  }

  function pickPhoto() {
    pickerOpen = true;
    el.fileInput.click();
  }

  function onPickerReturned() {
    pickerOpen = false;
    scheduleCameraCheck(600);
  }

  function onFilePicked() {
    var file = el.fileInput.files && el.fileInput.files[0];
    el.fileInput.value = ""; // so picking the same photo again still fires
    onPickerReturned();
    if (!file) { return; }
    if (file.type && file.type.indexOf("image/") !== 0) {
      toast("That file is not a photo.");
      return;
    }
    prepare(file).then(function (blob) {
      showPhoto(blob, true);
      savePhoto(blob);
    })["catch"](function () {
      toast("That photo could not be opened. Try another one.");
      updateScreens();
    });
  }

  /* ---------------- camera ---------------- */

  function tracksLive() {
    if (!stream) { return false; }
    return stream.getVideoTracks().some(function (t) {
      return t.readyState === "live" && !t.muted;
    });
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null;
    }
    el.camera.srcObject = null;
  }

  function playCamera() {
    var played = el.camera.play();
    if (played && played["catch"]) { played["catch"](function () { /* autoplay guard */ }); }
  }

  function watchTracks() {
    if (!stream) { return; }
    stream.getVideoTracks().forEach(function (track) {
      track.onended = function () { showResume(); };
      track.onmute = function () {
        if (!pickerOpen && document.visibilityState === "visible") { showResume(); }
      };
      track.onunmute = function () {
        if (tracksLive()) { playCamera(); updateScreens(); }
      };
    });
  }

  function getStream(exact) {
    var video = { width: { ideal: 1280 }, height: { ideal: 720 } };
    video.facingMode = exact ? { exact: "environment" } : { ideal: "environment" };
    return navigator.mediaDevices.getUserMedia({ video: video, audio: false });
  }

  function startCamera() {
    if (cameraRequest) { return cameraRequest; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error("unsupported"));
    }
    stopCamera();
    cameraRequest = getStream(true)["catch"](function (err) {
      var name = err && err.name;
      if (name === "OverconstrainedError" || name === "NotFoundError" || name === "TypeError") {
        return getStream(false);
      }
      throw err;
    }).then(function (media) {
      stream = media;
      el.camera.srcObject = media;
      watchTracks();
      cameraStarted = true;
      playCamera();
      if (el.controls.hidden && el.btnExpand.hidden) {
        el.controls.hidden = false;
        measureBottomUi();
      }
      requestWake();
      updateScreens();
    })["finally"](function () { cameraRequest = null; });
    return cameraRequest;
  }

  function handleCameraError(err) {
    var name = err && err.name ? err.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      showOnly(el.screenDenied);
      return;
    }
    var text = "Something interrupted the camera.";
    if (name === "NotFoundError" || name === "OverconstrainedError") {
      text = "No usable camera was found on this device.";
    } else if (!window.isSecureContext) {
      text = "The camera needs a secure (https) address. Open the published link, not a local file.";
    } else if (name) {
      text = "The camera could not start (" + name + ").";
    }
    el.errorText.textContent = text;
    showOnly(el.screenError);
  }

  function tryStart() {
    startCamera()["catch"](handleCameraError);
  }

  function showResume() {
    if (!cameraStarted || pickerOpen) { return; }
    showOnly(el.screenResume);
  }

  /* Restarts once on its own; if iOS wants a fresh permission prompt the user
     taps "Tap to resume camera" so the request carries a real user gesture. */
  function ensureCamera() {
    if (!cameraStarted || restarting || pickerOpen) { return; }
    if (document.visibilityState !== "visible") { return; }
    if (tracksLive()) {
      if (el.camera.paused) { playCamera(); }
      return;
    }
    restarting = true;
    startCamera()["catch"](function () {
      showResume();
    })["finally"](function () { restarting = false; });
  }

  function scheduleCameraCheck(delay) {
    if (checkTimer) { window.clearTimeout(checkTimer); }
    checkTimer = window.setTimeout(ensureCamera, delay || 400);
  }

  /* ---------------- wake lock ---------------- */

  function wakeSupported() {
    return !!(navigator.wakeLock && navigator.wakeLock.request);
  }

  function requestWake() {
    if (!wakeSupported() || !state.keepAwake) { return; }
    if (document.visibilityState !== "visible") { return; }
    if (wakeSentinel) { return; }
    navigator.wakeLock.request("screen").then(function (sentinel) {
      wakeSentinel = sentinel;
      sentinel.addEventListener("release", function () { wakeSentinel = null; });
    })["catch"](function () { wakeSentinel = null; });
  }

  function releaseWake() {
    if (wakeSentinel) {
      wakeSentinel.release()["catch"](function () { /* already gone */ });
      wakeSentinel = null;
    }
  }

  function applyWake() {
    el.btnWake.setAttribute("aria-checked", state.keepAwake ? "true" : "false");
    lsSet("wake", state.keepAwake ? "1" : "0");
    if (state.keepAwake) { requestWake(); } else { releaseWake(); }
  }

  /* ---------------- screens ---------------- */

  function showOnly(screen) {
    [el.screenStart, el.screenDenied, el.screenError, el.screenResume, el.screenNophoto]
      .forEach(function (node) { node.hidden = node !== screen; });
  }

  function updateScreens() {
    if (!cameraStarted) { return; }
    if (!el.screenDenied.hidden || !el.screenError.hidden || !el.screenResume.hidden) {
      if (!tracksLive()) { return; }
    }
    showOnly(state.hasPhoto ? null : el.screenNophoto);
  }

  /* ---------------- gestures ---------------- */

  var pointers = new Map();
  var gesture = null;

  function midpoint() {
    var xs = 0, ys = 0, n = 0;
    pointers.forEach(function (p) { xs += p.x; ys += p.y; n += 1; });
    return { x: xs / n, y: ys / n, n: n };
  }

  function spread() {
    var list = [];
    pointers.forEach(function (p) { list.push(p); });
    if (list.length < 2) { return 0; }
    return Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y);
  }

  function beginGesture() {
    if (state.locked || !state.hasPhoto || pointers.size === 0) { gesture = null; return; }
    var r = stageRect();
    var m = midpoint();
    if (pointers.size >= 2) {
      gesture = {
        mode: "pinch",
        d0: spread() || 1,
        m0: { x: m.x, y: m.y },
        s0: state.scale,
        t0: { x: state.tx * r.width, y: state.ty * r.height }
      };
    } else {
      gesture = { mode: "pan", x0: m.x, y0: m.y, moved: false };
    }
  }

  function onPointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) { return; }
    if (state.locked || !state.hasPhoto) { return; }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    beginGesture();
  }

  function onPointerMove(event) {
    if (!pointers.has(event.pointerId)) { return; }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!gesture || state.locked || !state.hasPhoto) { return; }

    var r = stageRect();
    var cx = r.left + r.width / 2;
    var cy = r.top + r.height / 2;

    if (gesture.mode === "pinch" && pointers.size >= 2) {
      var d1 = spread();
      if (!d1) { return; }
      var m1 = midpoint();
      var s1 = clamp(gesture.s0 * (d1 / gesture.d0), MIN_SCALE, MAX_SCALE);
      // keep the point under the fingers anchored while zooming
      var qx = (gesture.m0.x - cx - gesture.t0.x) / gesture.s0;
      var qy = (gesture.m0.y - cy - gesture.t0.y) / gesture.s0;
      state.scale = s1;
      state.tx = (m1.x - cx - s1 * qx) / r.width;
      state.ty = (m1.y - cy - s1 * qy) / r.height;
      applyTransform();
      return;
    }

    if (gesture.mode === "pan" && pointers.size === 1) {
      var m = midpoint();
      var dx = m.x - gesture.x0;
      var dy = m.y - gesture.y0;
      if (!gesture.moved) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) { return; }
        gesture.moved = true;
        gesture.x0 = m.x;
        gesture.y0 = m.y;
        return;
      }
      state.tx += dx / r.width;
      state.ty += dy / r.height;
      gesture.x0 = m.x;
      gesture.y0 = m.y;
      applyTransform();
    }
  }

  function onPointerUp(event) {
    if (!pointers.has(event.pointerId)) { return; }
    pointers["delete"](event.pointerId);
    if (pointers.size === 0) {
      if (gesture) { saveTransform(); }
      gesture = null;
      return;
    }
    beginGesture();
  }

  /* ---------------- dialogs ---------------- */

  function openSheet(sheet, focusTarget) {
    lastFocus = document.activeElement;
    sheet.hidden = false;
    if (focusTarget) { focusTarget.focus(); }
  }

  function closeSheet(sheet) {
    sheet.hidden = true;
    if (lastFocus && lastFocus.focus) { lastFocus.focus(); }
    lastFocus = null;
  }

  function trapFocus(event, sheet) {
    var selector = "button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])";
    var nodes = Array.prototype.slice.call(sheet.querySelectorAll(selector)).filter(function (node) {
      return !node.hidden && node.getClientRects().length > 0;
    });
    if (!nodes.length) { event.preventDefault(); return; }
    var first = nodes[0];
    var last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /* The callback runs synchronously from the button's own click handler.
     A Promise would resolve one microtask later and iOS may no longer treat
     the file picker as user-initiated. */
  function ask(head, text, okLabel, onYes) {
    el.confirmHead.textContent = head;
    el.confirmText.textContent = text;
    el.confirmOk.textContent = okLabel;
    confirmAction = onYes;
    openSheet(el.confirm, el.confirmCancel);
  }

  function settleConfirm(answer) {
    closeSheet(el.confirm);
    var action = confirmAction;
    confirmAction = null;
    if (answer && action) { action(); }
  }

  function setControlsCollapsed(collapsed) {
    el.controls.hidden = collapsed;
    el.btnExpand.hidden = !collapsed;
    el.btnCollapse.setAttribute("aria-expanded", collapsed ? "false" : "true");
    measureBottomUi();
    if (collapsed) { el.btnExpand.focus(); } else { el.btnCollapse.focus(); }
  }

  /* ---------------- wiring ---------------- */

  function bind() {
    on(el.btnStart, "click", tryStart);
    on(el.btnRetryDenied, "click", tryStart);
    on(el.btnRetryError, "click", tryStart);
    on(el.btnResume, "click", tryStart);
    on(el.btnChoose, "click", pickPhoto);

    on(el.btnPhoto, "click", function () {
      if (!state.hasPhoto) { pickPhoto(); return; }
      ask("Replace photo?", "The current photo and its alignment are discarded.", "Replace", pickPhoto);
    });

    on(el.btnFit, "click", function () {
      if (state.locked || !state.hasPhoto) { return; }
      fit();
    });

    on(el.btnLock, "click", function () {
      if (!state.hasPhoto) { return; }
      state.locked = !state.locked;
      applyLock();
      toast(state.locked ? "Alignment locked." : "Alignment unlocked.");
    });

    on(el.btnClear, "click", function () {
      if (!state.hasPhoto) { return; }
      ask("Clear photo?", "The photo and its alignment are removed from this device.", "Clear", function () {
        clearPhoto();
        toast("Photo cleared.");
      });
    });

    on(el.opacity, "input", function () {
      state.opacity = clamp(Number(el.opacity.value) || 0, 0, 100);
      applyOpacity();
    });
    on(el.opacity, "change", function () { lsSet("opacity", String(state.opacity)); });

    on(el.fileInput, "change", onFilePicked);
    on(el.fileInput, "cancel", onPickerReturned);

    on(el.btnCollapse, "click", function () { setControlsCollapsed(true); });
    on(el.btnExpand, "click", function () { setControlsCollapsed(false); });

    on(el.btnSettings, "click", function () {
      el.btnSettings.setAttribute("aria-expanded", "true");
      openSheet(el.settings, el.btnSettingsClose);
    });
    on(el.btnSettingsClose, "click", function () {
      el.btnSettings.setAttribute("aria-expanded", "false");
      closeSheet(el.settings);
    });
    on(el.settings, "click", function (event) {
      if (event.target === el.settings) {
        el.btnSettings.setAttribute("aria-expanded", "false");
        closeSheet(el.settings);
      }
    });

    on(el.sizeSteps, "click", function (event) {
      var button = event.target.closest ? event.target.closest(".step") : null;
      if (!button) { return; }
      state.step = Number(button.getAttribute("data-step")) || DEFAULT_STEP;
      applySize();
    });
    on(el.btnSizeReset, "click", function () {
      state.step = DEFAULT_STEP;
      applySize();
    });

    on(el.btnWake, "click", function () {
      if (!wakeSupported()) { return; }
      state.keepAwake = !state.keepAwake;
      applyWake();
    });

    on(el.confirmOk, "click", function () { settleConfirm(true); });
    on(el.confirmCancel, "click", function () { settleConfirm(false); });

    on(document, "keydown", function (event) {
      var activeSheet = !el.confirm.hidden ? el.confirm : (!el.settings.hidden ? el.settings : null);
      if (event.key === "Tab" && activeSheet) {
        trapFocus(event, activeSheet);
        return;
      }
      if (event.key !== "Escape") { return; }
      if (!el.confirm.hidden) { settleConfirm(false); return; }
      if (!el.settings.hidden) {
        el.btnSettings.setAttribute("aria-expanded", "false");
        closeSheet(el.settings);
      }
    });

    // gestures on the camera area only
    on(el.stage, "pointerdown", onPointerDown);
    on(window, "pointermove", onPointerMove);
    on(window, "pointerup", onPointerUp);
    on(window, "pointercancel", onPointerUp);

    // keep iOS from turning our pinch into a page zoom, inside the stage only
    on(el.stage, "touchmove", function (event) { event.preventDefault(); }, { passive: false });
    ["gesturestart", "gesturechange", "gestureend"].forEach(function (type) {
      on(document, type, function (event) {
        if (el.stage.contains(event.target)) { event.preventDefault(); }
      }, { passive: false });
    });
    on(el.stage, "dblclick", function (event) { event.preventDefault(); });
    on(el.stage, "contextmenu", function (event) { event.preventDefault(); });

    on(window, "resize", function () {
      measureBottomUi();
      applyTransform();
    });
    on(window, "orientationchange", function () {
      window.setTimeout(function () {
        measureBottomUi();
        applyTransform();
      }, 250);
    });
    if (typeof window.ResizeObserver === "function") {
      new window.ResizeObserver(measureBottomUi).observe(el.controls);
    }

    on(document, "visibilitychange", function () {
      if (document.visibilityState !== "visible") { return; }
      requestWake();
      if (pickerOpen) { onPickerReturned(); } else { scheduleCameraCheck(300); }
    });
    on(window, "focus", function () {
      if (pickerOpen) { onPickerReturned(); } else { scheduleCameraCheck(500); }
    });
    on(window, "pagehide", function () { releaseWake(); });
  }

  /* ---------------- start-up ---------------- */

  function restoreSettings() {
    var step = Number(lsGet("step"));
    if (SIZE_STEPS[step]) { state.step = step; }

    var opacity = Number(lsGet("opacity"));
    if (lsGet("opacity") !== null && isFinite(opacity)) {
      state.opacity = clamp(opacity, 0, 100);
    }

    var wake = lsGet("wake");
    if (wake !== null) { state.keepAwake = wake === "1"; }

    state.locked = lsGet("locked") === "1";

    var raw = lsGet("transform");
    if (raw) {
      try {
        var t = JSON.parse(raw);
        if (Number.isFinite(t.tx) && Number.isFinite(t.ty) && Number.isFinite(t.scale)) {
          state.tx = t.tx;
          state.ty = t.ty;
          state.scale = clamp(t.scale, MIN_SCALE, MAX_SCALE);
        }
      } catch (e) { lsDel("transform"); }
    }
  }

  function restorePhoto() {
    return loadPhoto().then(function (blob) {
      if (!blob || typeof blob.size !== "number" || !blob.size) {
        state.tx = 0;
        state.ty = 0;
        state.scale = 1;
        applyTransform();
        lsDel("transform");
        unlockAlignment();
        return;
      }
      var url = URL.createObjectURL(blob);
      return loadImage(url).then(function () {
        showPhoto(blob, false);
      })["finally"](function () {
        URL.revokeObjectURL(url);
      });
    })["catch"](function () {
      toast("The saved photo could not be restored.");
      state.tx = 0;
      state.ty = 0;
      state.scale = 1;
      applyTransform();
      lsDel("transform");
      dropPhoto();
      unlockAlignment();
    });
  }

  function registerWorker() {
    if (!("serviceWorker" in navigator)) { return; }
    // The ?v= keeps the worker URL in step with the version so iOS sees updates.
    navigator.serviceWorker.register("./service-worker.js?v=" + VERSION)["catch"](function () {
      /* offline support is optional; the app still runs */
    });
  }

  function applyAbout() {
    var match = /^([^.]+)\.github\.io$/i.exec(window.location.hostname);
    var path = window.location.pathname.split("/").filter(function (part) { return part; });
    if (match && path.length) {
      var repo = path[0];
      try { repo = decodeURIComponent(repo); } catch (e) { /* keep the safe URL segment */ }
      var url = "//github.com/" + match[1] + "/" + repo;
      el.aboutRepo.href = url;
      el.aboutRepo.textContent = "Source: github.com/" + match[1] + "/" + repo;
      el.aboutRepoWrap.hidden = false;
      el.aboutRepoFallback.hidden = true;
      return;
    }
    el.aboutRepoWrap.hidden = true;
    el.aboutRepoFallback.hidden = false;
  }

  function init() {
    ids.forEach(function (id) { el[camel(id)] = document.getElementById(id); });

    el.aboutVersion.textContent = VERSION;
    applyAbout();

    bind();
    measureBottomUi();
    registerWorker();

    // Restoring an app update must never discard the saved photo or alignment.
    Promise.resolve().then(function () {
      restoreSettings();
      applySize();
      applyOpacity();
      applyLock();
      applyTransform();

      if (!wakeSupported()) {
        state.keepAwake = false;
        el.btnWake.disabled = true;
        el.wakeNote.hidden = false;
      }
      el.btnWake.setAttribute("aria-checked", state.keepAwake ? "true" : "false");

      return restorePhoto();
    });
  }

  if (document.readyState === "loading") {
    on(document, "DOMContentLoaded", init);
  } else {
    init();
  }
}());
