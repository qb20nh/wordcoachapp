(() => {
  const setViewport = () => {
    let meta = document.querySelector("meta[name='viewport']");
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "viewport";
      (document.head || document.documentElement).appendChild(meta);
    }
    meta.content = "width=device-width, initial-scale=1, viewport-fit=cover";
  };
  setViewport();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setViewport, { once: true });
  }
  try {
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      get: () => 5
    });
  } catch (_) {}
  const deny = () => {
    throw new Error("Direct peer networking is disabled in Word Coach.");
  };
  for (const name of ["RTCPeerConnection", "webkitRTCPeerConnection", "mozRTCPeerConnection"]) {
    try {
      Object.defineProperty(window, name, {
        configurable: false,
        get: () => undefined,
        set: deny
      });
    } catch (_) {
      try {
        window[name] = undefined;
      } catch (_) {}
    }
  }
  try {
    if (navigator.serviceWorker?.register) {
      navigator.serviceWorker.register = () =>
        Promise.reject(new Error("Service workers are disabled in Word Coach."));
    }
  } catch (_) {}
})();
