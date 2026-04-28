(() => {
  const { contextBridge, ipcRenderer } = require("electron");
  contextBridge.exposeInMainWorld("__wordCoachDarkReaderFetch", async (url) =>
    ipcRenderer.invoke("wordcoach:darkreader-fetch", String(url || ""), location.href)
  );
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
