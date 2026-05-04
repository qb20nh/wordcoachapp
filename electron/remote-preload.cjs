(() => {
  const { contextBridge, ipcRenderer } = require("electron");
  contextBridge.exposeInMainWorld("__wordCoachDarkReaderFetch", async (url) =>
    ipcRenderer.invoke("wordcoach:darkreader-fetch", String(url || ""), location.href)
  );
  const bootHideStyleId = "wordcoach-boot-hide-style";
  const bootHideCss = `
    html[data-wordcoach-boot-hidden],
    html[data-wordcoach-boot-hidden] body {
      background-color: Canvas !important;
    }
    html[data-wordcoach-boot-hidden] body {
      opacity: 0 !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
  `;
  const autoDarkCss = `
    :root {
      color-scheme: light dark;
    }
    :root[data-wordcoach-color-scheme="dark"] {
      color-scheme: dark;
    }
  `;
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  const noteUserLinkClick = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const link = target?.closest("a[href], area[href]");
    if (!link) {
      return;
    }
    try {
      const href = new URL(link.getAttribute("href"), location.href).toString();
      const root = document.documentElement;
      root.dataset.wordcoachLastUserLinkUrl = href;
      root.dataset.wordcoachLastUserLinkAt = String(Date.now());
    } catch (_) {}
  };

  document.addEventListener("click", noteUserLinkClick, true);
  document.addEventListener("auxclick", noteUserLinkClick, true);

  const setAutoColorScheme = (scheme, source) => {
    const root = document.documentElement;
    if (!root) {
      return;
    }
    root.dataset.wordcoachColorScheme = scheme;
    root.dataset.wordcoachColorSchemeSource = source;
    root.style.colorScheme = scheme;
  };

  const syncAutoColorScheme = () => {
    const root = document.documentElement;
    if (!root) {
      return;
    }
    if (media?.matches) {
      setAutoColorScheme("dark", "media");
      return;
    }
    if (root.dataset.wordcoachColorSchemeSource === "media") {
      setAutoColorScheme("light", "media");
      return;
    }
    if (!root.dataset.wordcoachColorScheme) {
      setAutoColorScheme("light", "media");
    }
  };

  if (media?.addEventListener) {
    media.addEventListener("change", syncAutoColorScheme);
  } else {
    media?.addListener?.(syncAutoColorScheme);
  }

  const isWordCoachSearchPage = () => {
    try {
      const url = new URL(location.href);
      const query = (url.searchParams.get("q") || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      return (
        url.hostname.toLowerCase().startsWith("www.google.") &&
        url.pathname === "/search" &&
        query === "google word coach"
      );
    } catch (_) {
      return false;
    }
  };

  const injectBootHideCss = () => {
    const root = document.head || document.documentElement;
    if (!root || document.getElementById(bootHideStyleId)) {
      return false;
    }
    const style = document.createElement("style");
    style.id = bootHideStyleId;
    style.textContent = bootHideCss;
    root.appendChild(style);
    return true;
  };

  const removeBootHide = (timedOut = false) => {
    const root = document.documentElement;
    if (!root?.dataset.wordcoachBootHidden) {
      return;
    }
    if (timedOut) {
      root.dataset.wordcoachBootTimedOut = "true";
    }
    delete root.dataset.wordcoachBootHidden;
    document.getElementById(bootHideStyleId)?.remove?.();
  };

  const hideWordCoachBoot = () => {
    const root = document.documentElement;
    if (!root) {
      return false;
    }
    root.dataset.wordcoachBootHidden = "true";
    root.dataset.wordcoachBootHiddenAt = String(Date.now());
    if (!injectBootHideCss()) {
      document.addEventListener("readystatechange", () => injectBootHideCss(), { once: true });
    }
    window.setTimeout(() => removeBootHide(true), 10_000);
    return true;
  };

  if (isWordCoachSearchPage() && !hideWordCoachBoot()) {
    document.addEventListener("readystatechange", () => hideWordCoachBoot(), { once: true });
  }

  const injectAutoDarkCss = () => {
    const root = document.head || document.documentElement;
    if (!root || document.getElementById("wordcoach-auto-dark-style")) {
      return false;
    }
    syncAutoColorScheme();
    const style = document.createElement("style");
    style.id = "wordcoach-auto-dark-style";
    style.textContent = autoDarkCss;
    root.appendChild(style);
    return true;
  };

  if (!injectAutoDarkCss()) {
    document.addEventListener("readystatechange", () => injectAutoDarkCss(), { once: true });
  }

})();
