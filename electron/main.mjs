import {
  app,
  BrowserWindow,
  WebContentsView,
  dialog,
  ipcMain,
  nativeTheme,
  session,
  shell
} from "electron";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createProxyServer, hostAllowed } from "./proxy.mjs";
import { AdblockService } from "./adblock.mjs";
import {
  acceptLanguageFor,
  labelFor,
  localeOptionsFor,
  messagesFor,
  normalizeLocaleChoice,
  resolveLocale
} from "./i18n.mjs";
import { JsonStore } from "./store.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ROOT_DIR = path.resolve(__dirname, "..");
const REMOTE_PRELOAD = path.join(__dirname, "remote-preload.cjs");
const DARK_READER_PATH = require.resolve("darkreader");
const WINDOW_WIDTH = 860;
const WINDOW_HEIGHT = 860;
const TOPBAR_HEIGHT = 86;
const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36";
const GOOGLE_SEARCH_URL = "https://www.google.co.in/search";
const PROVIDERS = [
  { id: "dictionary", labelKey: "provider_dictionary" },
  { id: "merriam", labelKey: "provider_merriam" },
  { id: "naver", labelKey: "provider_naver" }
];
const DICTIONARY_MODES = [
  { id: "dictionary", labelKey: "mode_dictionary" },
  { id: "thesaurus", labelKey: "mode_thesaurus" }
];
const PRELOAD_EAGERNESS_OPTIONS = [
  { id: "off", labelKey: "preload_off" },
  { id: "dns", labelKey: "preload_dns" },
  { id: "preconnect", labelKey: "preload_preconnect" },
  { id: "pages", labelKey: "preload_pages" },
  { id: "prerender", labelKey: "preload_prerender" }
];
const DARK_MODE_OPTIONS = [
  { id: "system", labelKey: "dark_mode_system" },
  { id: "dark", labelKey: "dark_mode_dark" },
  { id: "off", labelKey: "dark_mode_off" }
];
const PRELOAD_EAGERNESS_RANK = {
  off: 0,
  dns: 1,
  preconnect: 2,
  pages: 3,
  prerender: 4
};
const WARMUP_ORIGINS = [
  "https://www.google.com",
  "https://www.google.co.in",
  "https://www.google.co.kr",
  "https://accounts.google.com",
  "https://www.dictionary.com",
  "https://www.thesaurus.com",
  "https://www.merriam-webster.com",
  "https://english.dict.naver.com",
  "https://html-load.com",
  "https://content-loader.com",
  "https://d3d4gnv047l844.cloudfront.net"
];
const NAVER_DICTIONARY_HOST = "english.dict.naver.com";
const NAVER_ALLOWED_DICTIONARY_PATHS = new Set(["english-dictionary", "english-thesaurus"]);
const COLOR_SCHEME_ATTRIBUTE = "wordcoachColorScheme";
const COLOR_SCHEME_SOURCE_ATTRIBUTE = "wordcoachColorSchemeSource";
const USER_LINK_URL_ATTRIBUTE = "wordcoachLastUserLinkUrl";
const USER_LINK_TIME_ATTRIBUTE = "wordcoachLastUserLinkAt";
const USER_LINK_CLICK_TTL_MS = 5000;
const SYSTEM_COLOR_SCHEME_CACHE_MS = 5000;
const THEME_SYNC_INTERVAL_MS = 5000;
const REMOTE_THEME_RECHECK_DELAYS_MS = [900, 2400];
const REMOTE_THEME_GATE_TIMEOUT_MS = 4000;
const DICTIONARY_NAVIGATION_SYNC_GRACE_MS = 8000;
const DARK_READER_THEME = {
  brightness: 100,
  contrast: 90,
  sepia: 0
};
const BLOCKED_URL_PREFIXES = [
  "https://www.dictionary.com/articles",
  "https://www.dictionary.com/games",
  "https://www.dictionary.com/culture",
  "https://www.thesaurus.com/articles"
];

let mainWindow = null;
let coachView = null;
let dictionaryView = null;
let proxy = null;
let adblocker = null;
let store = null;
let remoteSession = null;
let pagePreloadWindow = null;
let warmupTimer = null;
let warmupGeneration = 0;
let dictionarySyncQueue = Promise.resolve();
let pendingDictionaryNavigation = null;
let themeSyncTimer = null;
let systemColorSchemeCache = { value: "light", expiresAt: 0 };
let uiOverlayOpen = false;
let darkReaderSourceCache = null;
const remoteViewsByWebContentsId = new Map();
const lastAllowedUrlByWebContentsId = new Map();
const prerenderDictionaryViews = new Map();
const prerenderUrlsByKey = new Map();
const pendingBlockedDialogs = new Set();
const cosmeticCssKeysByWebContentsId = new Map();
const remoteThemeRunIdsByWebContentsId = new Map();
const remoteThemeStateByWebContentsId = new Map();
const preloadLoadsByWebContentsId = new Map();
const remoteThemeReadyByWebContentsId = new Map();

app.commandLine.appendSwitch("disable-quic");
app.commandLine.appendSwitch("force-webrtc-ip-handling-policy", "disable_non_proxied_udp");
app.commandLine.appendSwitch("enable-features", "WebAuthentication,WebAuthenticationConditionalUI");
syncNativeThemeSourceWithDesktop();

app.whenReady().then(start).catch((error) => {
  console.error(error);
  app.exit(1);
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  if (themeSyncTimer) {
    clearInterval(themeSyncTimer);
    themeSyncTimer = null;
  }
  destroyPagePreloadWindow();
  destroyAllPrerenderDictionaryViews();
  proxy?.close().catch(() => undefined);
});

nativeTheme.on("updated", () => {
  systemColorSchemeCache.expiresAt = 0;
  applyColorSchemeToRemoteWebContents();
  sendSnapshot();
});

async function start() {
  store = new JsonStore(app.getPath("userData"));
  await store.load();
  syncNativeThemeSourceWithDesktop();
  adblocker = new AdblockService(app.getPath("userData"));
  await adblocker.loadCached();
  proxy = await createProxyServer();
  startThemeSyncTimer();

  remoteSession = session.fromPartition("persist:wordcoach");
  await configureRemoteSession(remoteSession);
  registerIpc();
  adblocker
    .ensureReady()
    .then(() => {
      sendSnapshot();
      applyCosmeticAdblockToRemoteWebContents();
    })
    .catch(() => sendSnapshot());

  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: WINDOW_WIDTH,
    minHeight: WINDOW_HEIGHT,
    maxWidth: WINDOW_WIDTH,
    maxHeight: WINDOW_HEIGHT,
    resizable: false,
    title: t("app_title"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow.setMenuBarVisibility(false);

  const uiUrl = process.env.VITE_DEV_SERVER_URL || fileUrl(path.join(ROOT_DIR, "dist", "index.html"));
  await mainWindow.loadURL(uiUrl);

  createRemoteViews(remoteSession);
  scheduleNetworkWarmup();
  layoutRemoteViews();
  mainWindow.on("resize", layoutRemoteViews);
  mainWindow.on("closed", () => {
    mainWindow = null;
    coachView = null;
    dictionaryView = null;
  });
}

async function configureRemoteSession(remoteSession) {
  await remoteSession.setProxy({
    proxyRules: proxy.proxyRules,
    proxyBypassRules: ""
  });
  remoteSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const origin = details.requestingOrigin || webContents.getURL();
    callback(permissionAllowedForOrigin(permission, origin));
  });
  remoteSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) =>
    permissionAllowedForOrigin(permission, requestingOrigin)
  );
  remoteSession.webRequest.onBeforeRequest((details, callback) => {
    if (details.url.startsWith("http://") || details.url.startsWith("https://")) {
      const allowed = isMainFrameRequest(details)
        ? remoteMainFrameUrlAllowed(details.url)
        : remoteUrlAllowed(details.url);
      if (!allowed) {
        recordBlockedUrl(details.url);
        if (isMainFrameRequest(details)) {
          const view = remoteViewsByWebContentsId.get(details.webContentsId);
          showBlockedNavigationDialogIfUserClick(view, details.url).catch(() => undefined);
          scheduleRestoreBlockedNavigation(details.webContentsId, details.url);
        }
        callback({ cancel: true });
        return;
      }
      if (!isMainFrameRequest(details) && adblocker?.requestBlocked(details)) {
        recordBlockedUrl(details.url);
        callback({ cancel: true });
        return;
      }
    }
    callback({});
  });
  remoteSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = {
      ...details.requestHeaders,
      "Accept-Language": acceptLanguageFor(currentLocale()),
      "Sec-CH-Prefers-Color-Scheme": `"${currentColorScheme()}"`,
      "Sec-CH-UA-Mobile": "?1",
      "Sec-CH-UA-Platform": '"Android"',
      "User-Agent": MOBILE_UA
    };
    callback({ requestHeaders: headers });
  });
}

function createRemoteViews(remoteSession) {
  coachView = createView(remoteSession, true);
  mainWindow.contentView.addChildView(coachView);

  loadAllowedUrl(coachView, googleUrl());
  if (currentPreloadEagerness() === "prerender") {
    activatePrerenderedDictionaryView(
      dictionaryKey(currentProvider(), currentDictionaryMode()),
      dictionaryUrl(currentProvider(), currentDictionaryMode(), store.snapshot().current_word)
    );
  } else {
    dictionaryView = createView(remoteSession, false);
    mainWindow.contentView.addChildView(dictionaryView);
    loadAllowedUrl(dictionaryView, homeUrl(currentProvider(), currentDictionaryMode()));
  }
}

function createView(remoteSession, includeExtractor) {
  const view = new WebContentsView({
    webPreferences: {
      session: remoteSession,
      preload: REMOTE_PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  const webContents = view.webContents;
  const webContentsId = webContents.id;
  webContents.setUserAgent(MOBILE_UA);
  remoteViewsByWebContentsId.set(webContentsId, view);
  view.webContents.on("destroyed", () => {
    remoteViewsByWebContentsId.delete(webContentsId);
    lastAllowedUrlByWebContentsId.delete(webContentsId);
    cosmeticCssKeysByWebContentsId.delete(webContentsId);
    remoteThemeRunIdsByWebContentsId.delete(webContentsId);
    remoteThemeStateByWebContentsId.delete(webContentsId);
    preloadLoadsByWebContentsId.delete(webContentsId);
    remoteThemeReadyByWebContentsId.delete(webContentsId);
  });
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (urlAllowed(url)) {
      loadAllowedUrl(view, url);
    } else {
      recordBlockedUrl(url);
      showBlockedNavigationDialogIfUserClick(view, url);
    }
    return { action: "deny" };
  });
  view.webContents.on("select-client-certificate", (event, _url, _certificates, callback) => {
    event.preventDefault();
    callback();
  });
  view.webContents.on("will-frame-navigate", (event) => {
    if (event.isMainFrame) {
      handleRemoteNavigation(view, event, event.url);
    }
  });
  view.webContents.on("will-navigate", (event, url) =>
    handleRemoteNavigation(view, event, url || event.url)
  );
  view.webContents.on("will-redirect", (event, url, _isInPlace, isMainFrame) => {
    if (isMainFrame || event.isMainFrame) {
      handleRemoteNavigation(view, event, url || event.url);
    }
  });
  view.webContents.on("did-navigate", (_event, url) => {
    rememberAllowedUrl(view, url);
    syncDictionaryStateFromUrl(view, url);
    scheduleRemoteTheme(view, { recheck: true });
    applyCosmeticAdblockToView(view);
  });
  view.webContents.on("did-navigate-in-page", (_event, url, isMainFrame) => {
    if (isMainFrame) {
      rememberAllowedUrl(view, url);
      syncDictionaryStateFromUrl(view, url);
      scheduleRemoteTheme(view, { sameDocument: true });
      applyCosmeticAdblockToView(view);
    }
  });
  view.webContents.on(
    "did-fail-load",
    (_event, _errorCode, _errorDescription, validatedURL, isMainFrame) => {
      if (isMainFrame && !urlAllowed(validatedURL)) {
        scheduleRestoreBlockedNavigation(view.webContents.id, validatedURL);
      }
    }
  );
  view.webContents.on(
    "did-fail-provisional-load",
    (_event, _errorCode, _errorDescription, validatedURL, isMainFrame) => {
      if (isMainFrame && !urlAllowed(validatedURL)) {
        scheduleRestoreBlockedNavigation(view.webContents.id, validatedURL);
      }
    }
  );
  view.webContents.on("dom-ready", () => injectRemoteScripts(view, includeExtractor));
  view.webContents.on("did-finish-load", () => injectRemoteScripts(view, includeExtractor));
  return view;
}

function layoutRemoteViews() {
  if (!mainWindow || !coachView || !dictionaryView) {
    return;
  }
  const [width, height] = mainWindow.getContentSize();
  const remoteHeight = Math.max(0, height - TOPBAR_HEIGHT);
  const leftWidth = Math.floor(width / 2);
  const rightWidth = width - leftWidth;
  if (uiOverlayOpen) {
    coachView.setBounds({ x: 0, y: TOPBAR_HEIGHT, width: leftWidth, height: 0 });
    dictionaryView.setBounds({ x: leftWidth, y: TOPBAR_HEIGHT, width: rightWidth, height: 0 });
    layoutInactivePrerenderDictionaryViews(leftWidth, rightWidth, remoteHeight);
    return;
  }
  const coachHeight = Math.floor(remoteHeight / 2);
  setReadyViewBounds(coachView, { x: 0, y: TOPBAR_HEIGHT, width: leftWidth, height: coachHeight });
  setReadyViewBounds(dictionaryView, {
    x: leftWidth,
    y: TOPBAR_HEIGHT,
    width: rightWidth,
    height: remoteHeight
  });
  layoutInactivePrerenderDictionaryViews(leftWidth, rightWidth, remoteHeight);
}

function setReadyViewBounds(view, bounds) {
  if (!remoteViewReadyForDisplay(view)) {
    view.setBounds({ ...bounds, x: bounds.x + bounds.width + 1, height: 0 });
    return;
  }
  view.setBounds(bounds);
}

function remoteViewReadyForDisplay(view) {
  if (!view || view.webContents.isDestroyed() || currentColorScheme() !== "dark") {
    return true;
  }
  return remoteThemeReadyByWebContentsId.get(view.webContents.id) !== false;
}

function layoutInactivePrerenderDictionaryViews(leftWidth, rightWidth, remoteHeight) {
  for (const view of prerenderDictionaryViews.values()) {
    if (view !== dictionaryView && !view.webContents.isDestroyed()) {
      view.setBounds({
        x: leftWidth + rightWidth + 1,
        y: TOPBAR_HEIGHT,
        width: rightWidth,
        height: remoteHeight
      });
    }
  }
}

function injectRemoteScripts(view, includeExtractor) {
  scheduleRemoteTheme(view, { recheck: true });
  const guard = readText(path.join(ROOT_DIR, "src", "injected", "network_guard.js"));
  const customCss = readText(path.join(ROOT_DIR, "custom.css"));
  const extractor = includeExtractor
    ? readText(path.join(ROOT_DIR, "src", "injected", "word_coach.js"))
    : "";
  const naverHelper = readText(path.join(ROOT_DIR, "src", "injected", "naver_dictionary.js"));
  const script = `${guard}\nwindow.__WORD_COACH_CUSTOM_CSS = ${JSON.stringify(customCss)};\n${extractor}\n${naverHelper}`;
  view.webContents.executeJavaScript(script, true).catch(() => undefined);
  applyCosmeticAdblockToView(view);
  setTimeout(() => applyCosmeticAdblockToView(view), 1200);
  setTimeout(() => applyCosmeticAdblockToView(view), 3000);
}

function handleRemoteNavigation(view, event, url) {
  const targetUrl = String(url || "");
  if (targetUrl.startsWith("wcoach://capture")) {
    handleCaptureNavigation(event, targetUrl);
    return;
  }

  if (!urlAllowed(targetUrl)) {
    event.preventDefault();
    recordBlockedUrl(targetUrl);
    showBlockedNavigationDialogIfUserClick(view, targetUrl);
    return;
  }
  markRemoteThemePending(view);
}

function handleCaptureNavigation(event, url) {
  event.preventDefault();
  const payload = new URL(url).searchParams.get("payload");
  if (!payload) {
    return;
  }
  Promise.resolve()
    .then(() => store.insertCapture(JSON.parse(payload)))
    .then((inserted) => {
      if (inserted) {
        sendSnapshot();
      }
    })
    .catch(() => undefined);
}

function registerIpc() {
  ipcMain.handle("wordcoach:get-app-snapshot", () => appSnapshot());
  ipcMain.handle("wordcoach:search-dictionary", async (_event, word) => {
    const currentWord = String(word || "").trim();
    await store.setCurrentWord(currentWord);
    navigateDictionary(currentWord);
    scheduleNetworkWarmup();
  });
  ipcMain.handle("wordcoach:set-dictionary-provider", async (_event, provider) => {
    const nextProvider = parseProvider(provider);
    await store.setProvider(nextProvider);
    navigateDictionary(store.snapshot().current_word);
    scheduleNetworkWarmup();
  });
  ipcMain.handle("wordcoach:set-dictionary-mode", async (_event, mode) => {
    const nextMode = parseDictionaryMode(mode);
    await store.setDictionaryMode(nextMode);
    navigateDictionary(store.snapshot().current_word);
    scheduleNetworkWarmup();
  });
  ipcMain.handle("wordcoach:set-preload-eagerness", async (_event, eagerness) => {
    const nextEagerness = parsePreloadEagerness(eagerness);
    await store.setPreloadEagerness(nextEagerness);
    syncDictionaryPrerenderMode();
    scheduleNetworkWarmup();
  });
  ipcMain.handle("wordcoach:set-dark-mode", async (_event, mode) => {
    await store.setDarkMode(parseDarkMode(mode));
    systemColorSchemeCache.expiresAt = 0;
    syncNativeThemeSourceWithDesktop();
    applyColorSchemeToRemoteWebContents();
    sendSnapshot();
  });
  ipcMain.handle("wordcoach:set-cosmetic-adblock", async (_event, enabled) => {
    await store.setCosmeticAdblock(Boolean(enabled));
    if (cosmeticAdblockEnabled()) {
      applyCosmeticAdblockToRemoteWebContents();
    } else {
      clearCosmeticAdblockFromRemoteWebContents();
    }
    sendSnapshot();
  });
  ipcMain.handle("wordcoach:set-locale-choice", async (_event, choice) => {
    await store.setLocaleChoice(normalizeLocaleChoice(choice));
    mainWindow?.setTitle(t("app_title"));
    reloadRemoteViewsForLocale();
    scheduleNetworkWarmup();
    sendSnapshot();
  });
  ipcMain.handle("wordcoach:set-ui-overlay-open", (_event, open) => {
    uiOverlayOpen = Boolean(open);
    layoutRemoteViews();
  });
  ipcMain.handle("wordcoach:open-google-sign-in", () => {
    if (coachView) {
      loadAllowedUrl(coachView, googleSignInUrl());
    }
  });
  ipcMain.handle("wordcoach:reload-coach", () => {
    coachView?.webContents.reload();
  });
  ipcMain.handle("wordcoach:reload-dictionary", () => {
    dictionaryView?.webContents.reload();
  });
  ipcMain.handle("wordcoach:dictionary-back", () => {
    if (dictionaryView?.webContents.canGoBack()) {
      dictionaryView.webContents.goBack();
    }
  });
  ipcMain.handle("wordcoach:dictionary-forward", () => {
    if (dictionaryView?.webContents.canGoForward()) {
      dictionaryView.webContents.goForward();
    }
  });
  ipcMain.handle("wordcoach:export-history", async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: t("export_history_title"),
      defaultPath: "wordcoach-history.wcoach.json",
      filters: [{ name: t("word_coach_export"), extensions: ["json"] }]
    });
    if (result.canceled || !result.filePath) {
      return null;
    }
    await store.exportTo(result.filePath);
    return result.filePath;
  });
  ipcMain.handle("wordcoach:import-history", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: t("import_history_title"),
      properties: ["openFile"],
      filters: [{ name: t("word_coach_export"), extensions: ["json"] }]
    });
    if (result.canceled || !result.filePaths[0]) {
      return null;
    }
    const imported = await store.importFrom(result.filePaths[0]);
    sendSnapshot();
    return imported;
  });
  ipcMain.handle("wordcoach:update-adblock-filters", async () => {
    const status = adblocker
      ? await adblocker.updateFilters()
      : { ready: false, updating: false, updated_at: null, list_count: 0, error: t("adblock_unavailable") };
    sendSnapshot();
    applyCosmeticAdblockToRemoteWebContents();
    return status;
  });
  ipcMain.handle("wordcoach:darkreader-fetch", async (event, url, pageUrl) =>
    fetchDarkReaderResource(event.sender, url, pageUrl)
  );
}

function appSnapshot() {
  const snapshot = store.snapshot();
  const locale = currentLocale();
  return {
    provider: snapshot.provider,
    dictionary_providers: localizedOptions(PROVIDERS, locale),
    dictionary_mode: snapshot.dictionary_mode,
    dictionary_modes: localizedOptions(DICTIONARY_MODES, locale),
    preload_eagerness: snapshot.preload_eagerness,
    preload_eagerness_options: localizedOptions(PRELOAD_EAGERNESS_OPTIONS, locale),
    dark_mode: snapshot.dark_mode,
    dark_mode_options: localizedOptions(DARK_MODE_OPTIONS, locale),
    cosmetic_adblock: snapshot.cosmetic_adblock,
    locale_choice: currentLocaleChoice(),
    resolved_locale: locale,
    locale_options: localeOptionsFor(locale),
    messages: messagesFor(locale),
    current_word: snapshot.current_word,
    proxy_addr: proxy.addr,
    proxy_blocked_hosts: proxy.blockedHosts(),
    adblock: adblocker?.snapshot() || {
      ready: false,
      updating: false,
      updated_at: null,
      list_count: 0,
      error: null
    },
    color_scheme: currentColorScheme(),
    history: snapshot.history
  };
}

function currentColorScheme() {
  const mode = currentDarkModeSetting();
  if (mode === "dark") {
    return "dark";
  }
  if (mode === "off") {
    return "light";
  }
  if (nativeTheme.shouldUseDarkColors) {
    return "dark";
  }
  return cachedSystemColorScheme();
}

function currentDarkModeSetting() {
  return parseDarkMode(store?.snapshot().dark_mode);
}

function cosmeticAdblockEnabled() {
  return store?.snapshot().cosmetic_adblock !== false;
}

function currentLocaleChoice() {
  return normalizeLocaleChoice(store?.snapshot().locale_choice);
}

function currentLocale() {
  return resolveLocale(currentLocaleChoice(), systemLocale());
}

function systemLocale() {
  try {
    return app.getLocale();
  } catch {
    return "en";
  }
}

function t(key) {
  return labelFor(currentLocale(), key);
}

function localizedOptions(options, locale = currentLocale()) {
  return options.map((option) => ({
    id: option.id,
    label: labelFor(locale, option.labelKey)
  }));
}

function googleUrl(locale = currentLocale()) {
  const url = new URL(GOOGLE_SEARCH_URL);
  url.searchParams.set("q", "google word coach");
  url.searchParams.set("hl", locale);
  url.searchParams.set("gl", "IN");
  url.searchParams.set("pws", "0");
  url.searchParams.set("source", "mobilesearchapp");
  return url.toString();
}

function googleSignInUrl() {
  return "https://accounts.google.com/ServiceLogin?continue=" + encodeURIComponent(googleUrl());
}

function startThemeSyncTimer() {
  if (themeSyncTimer) {
    return;
  }
  themeSyncTimer = setInterval(() => {
    if (syncNativeThemeSourceWithDesktop()) {
      applyColorSchemeToRemoteWebContents();
      sendSnapshot();
    }
  }, THEME_SYNC_INTERVAL_MS);
}

function syncNativeThemeSourceWithDesktop() {
  const detectedScheme = detectSystemColorScheme();
  systemColorSchemeCache = {
    value: detectedScheme,
    expiresAt: Date.now() + SYSTEM_COLOR_SCHEME_CACHE_MS
  };
  const darkMode = currentDarkModeSetting();
  const nextSource =
    darkMode === "dark"
      ? "dark"
      : darkMode === "off"
        ? "light"
        : detectedScheme === "dark"
          ? "dark"
          : "system";
  if (nativeTheme.themeSource === nextSource) {
    return false;
  }
  nativeTheme.themeSource = nextSource;
  return true;
}

function cachedSystemColorScheme() {
  const now = Date.now();
  if (now >= systemColorSchemeCache.expiresAt) {
    systemColorSchemeCache = {
      value: detectSystemColorScheme(),
      expiresAt: now + SYSTEM_COLOR_SCHEME_CACHE_MS
    };
  }
  return systemColorSchemeCache.value;
}

function detectSystemColorScheme() {
  const envTheme = [
    process.env.GTK_THEME,
    process.env.QT_STYLE_OVERRIDE,
    process.env.KDE_COLOR_SCHEME,
    process.env.XFCE_THEME
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/\bdark\b|adwaita-dark|yaru-dark|breeze-dark/.test(envTheme)) {
    return "dark";
  }

  if (process.platform === "linux") {
    const portalColorScheme = readDesktopSetting("gdbus", [
      "call",
      "--session",
      "--dest",
      "org.freedesktop.portal.Desktop",
      "--object-path",
      "/org/freedesktop/portal/desktop",
      "--method",
      "org.freedesktop.portal.Settings.Read",
      "org.freedesktop.appearance",
      "color-scheme"
    ]);
    if (/\buint32 1\b|\b1\b/.test(portalColorScheme)) {
      return "dark";
    }

    if (gtkConfigPrefersDark()) {
      return "dark";
    }

    const gnomeColorScheme = readDesktopSetting("gsettings", [
      "get",
      "org.gnome.desktop.interface",
      "color-scheme"
    ]);
    if (/prefer-dark|dark/.test(gnomeColorScheme)) {
      return "dark";
    }

    const gtkTheme = readDesktopSetting("gsettings", [
      "get",
      "org.gnome.desktop.interface",
      "gtk-theme"
    ]);
    if (/\bdark\b|adwaita-dark|yaru-dark/.test(gtkTheme)) {
      return "dark";
    }

    for (const command of ["kreadconfig6", "kreadconfig5"]) {
      const kdeColorScheme = readDesktopSetting(command, ["--group", "General", "--key", "ColorScheme"]);
      if (/\bdark\b|breezedark/.test(kdeColorScheme)) {
        return "dark";
      }
    }
  }

  return "light";
}

function gtkConfigPrefersDark() {
  const home = process.env.HOME;
  if (!home) {
    return false;
  }
  const paths = [
    path.join(home, ".config", "gtk-4.0", "settings.ini"),
    path.join(home, ".config", "gtk-3.0", "settings.ini"),
    path.join(home, ".config", "kdeglobals")
  ];
  for (const filePath of paths) {
    const text = readOptionalText(filePath).toLowerCase();
    if (
      /gtk-application-prefer-dark-theme\s*=\s*true/.test(text) ||
      /gtk-theme-name\s*=.*dark/.test(text) ||
      /colorscheme\s*=.*dark/.test(text) ||
      /lookandfeelpackage\s*=.*dark/.test(text)
    ) {
      return true;
    }
  }
  return false;
}

function readOptionalText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function readDesktopSetting(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 500
    })
      .trim()
      .toLowerCase();
  } catch {
    return "";
  }
}

function applyColorSchemeToRemoteWebContents() {
  for (const view of remoteViewsByWebContentsId.values()) {
    scheduleRemoteTheme(view, { recheck: true });
  }
  if (pagePreloadWindow && !pagePreloadWindow.isDestroyed()) {
    applyColorSchemeHintToWebContents(pagePreloadWindow.webContents).catch(() => undefined);
  }
}

function applyColorSchemeToView(view) {
  scheduleRemoteTheme(view);
}

function scheduleRemoteTheme(view, options = {}) {
  if (!view || view.webContents.isDestroyed()) {
    return;
  }
  if (options.recheck) {
    markRemoteThemePending(view);
  }
  applyRemoteThemeToView(view, {
    forceNativeCheck: Boolean(options.recheck),
    sameDocument: Boolean(options.sameDocument)
  });
  if (options.recheck) {
    for (const delay of REMOTE_THEME_RECHECK_DELAYS_MS) {
      setTimeout(() => applyRemoteThemeToView(view, { forceNativeCheck: true }), delay);
    }
  }
}

function applyRemoteThemeToView(view, options = {}) {
  if (!view || view.webContents.isDestroyed()) {
    return;
  }
  applyRemoteThemeToWebContents(view.webContents, options).catch(() =>
    markRemoteThemeReady(view.webContents)
  );
}

async function applyRemoteThemeToWebContents(webContents, options = {}) {
  if (!webContents || webContents.isDestroyed()) {
    return;
  }
  const webContentsId = webContents.id;
  const runId = (remoteThemeRunIdsByWebContentsId.get(webContentsId) || 0) + 1;
  remoteThemeRunIdsByWebContentsId.set(webContentsId, runId);
  const scheme = currentColorScheme();
  const url = webContents.getURL();
  await applyColorSchemeHintToWebContents(webContents, scheme);
  if (!remoteThemeRunActive(webContents, runId)) {
    return;
  }

  if (scheme !== "dark") {
    await setDarkReaderEnabled(webContents, false);
    remoteThemeStateByWebContentsId.set(webContentsId, {
      url,
      scheme,
      nativeDark: false,
      darkReaderEnabled: false
    });
    markRemoteThemeReady(webContents);
    return;
  }

  const previous = remoteThemeStateByWebContentsId.get(webContentsId);
  if (previous?.scheme === scheme && (previous.url === url || options.sameDocument)) {
    if (previous.darkReaderEnabled) {
      const enabled = await setDarkReaderEnabled(webContents, true);
      remoteThemeStateByWebContentsId.set(webContentsId, {
        url,
        scheme,
        nativeDark: false,
        darkReaderEnabled: enabled
      });
      markRemoteThemeReady(webContents);
      return;
    }
    if (options.sameDocument && previous.nativeDark) {
      await setDarkReaderEnabled(webContents, false);
      remoteThemeStateByWebContentsId.set(webContentsId, {
        url,
        scheme,
        nativeDark: true,
        darkReaderEnabled: false
      });
      markRemoteThemeReady(webContents);
      return;
    }
  }

  const canReuse =
    !options.forceNativeCheck &&
    previous?.url === url &&
    previous?.scheme === scheme &&
    typeof previous.nativeDark === "boolean";
  if (canReuse) {
    const enabled = previous.nativeDark
      ? await setDarkReaderEnabled(webContents, false)
      : await setDarkReaderEnabled(webContents, true);
    remoteThemeStateByWebContentsId.set(webContentsId, {
      url,
      scheme,
      nativeDark: previous.nativeDark,
      darkReaderEnabled: enabled
    });
    markRemoteThemeReady(webContents);
    return;
  }

  if (previous?.darkReaderEnabled) {
    await setDarkReaderEnabled(webContents, false);
  }
  if (!remoteThemeRunActive(webContents, runId)) {
    return;
  }

  const nativeDark = await remotePageAppearsNativeDark(webContents);
  if (!remoteThemeRunActive(webContents, runId)) {
    return;
  }

  const darkReaderEnabled = nativeDark === true ? false : await setDarkReaderEnabled(webContents, true);
  if (nativeDark) {
    await setDarkReaderEnabled(webContents, false);
  }
  remoteThemeStateByWebContentsId.set(webContentsId, {
    url,
    scheme,
    nativeDark,
    darkReaderEnabled
  });
  markRemoteThemeReady(webContents);
}

function markRemoteThemePending(view) {
  if (!view || view.webContents.isDestroyed() || currentColorScheme() !== "dark") {
    return;
  }
  const webContentsId = view.webContents.id;
  remoteThemeReadyByWebContentsId.set(webContentsId, false);
  layoutRemoteViews();
  setTimeout(() => {
    if (remoteThemeReadyByWebContentsId.get(webContentsId) === false) {
      remoteThemeReadyByWebContentsId.set(webContentsId, true);
      layoutRemoteViews();
    }
  }, REMOTE_THEME_GATE_TIMEOUT_MS);
}

function markRemoteThemeReady(webContents) {
  if (!webContents || webContents.isDestroyed()) {
    return;
  }
  remoteThemeReadyByWebContentsId.set(webContents.id, true);
  layoutRemoteViews();
}

function remoteThemeRunActive(webContents, runId) {
  return (
    webContents &&
    !webContents.isDestroyed() &&
    remoteThemeRunIdsByWebContentsId.get(webContents.id) === runId
  );
}

function applyColorSchemeHintToWebContents(webContents, scheme = currentColorScheme()) {
  if (!webContents || webContents.isDestroyed()) {
    return Promise.resolve();
  }
  const script = `(() => {
    const root = document.documentElement;
    if (!root) {
      return;
    }
    const scheme = ${JSON.stringify(scheme)};
    root.dataset[${JSON.stringify(COLOR_SCHEME_ATTRIBUTE)}] = scheme;
    root.dataset[${JSON.stringify(COLOR_SCHEME_SOURCE_ATTRIBUTE)}] = "main";
    root.style.colorScheme = scheme;
  })();`;
  return webContents.executeJavaScript(script, true).catch(() => undefined);
}

async function remotePageAppearsNativeDark(webContents) {
  if (!webContents || webContents.isDestroyed()) {
    return null;
  }
  const script = `(() => {
    const parseColor = (value) => {
      const match = String(value || "").match(/rgba?\\(([^)]+)\\)/i);
      if (!match) {
        return null;
      }
      const parts = match[1].split(",").map((part) => part.trim());
      const channel = (part) => {
        if (part.endsWith("%")) {
          return Math.round(Number(part.slice(0, -1)) * 2.55);
        }
        return Number(part);
      };
      const r = channel(parts[0]);
      const g = channel(parts[1]);
      const b = channel(parts[2]);
      const a = parts[3] === undefined ? 1 : Number(parts[3]);
      if (![r, g, b, a].every(Number.isFinite)) {
        return null;
      }
      return { r, g, b, a };
    };
    const luminance = (color) => {
      const linear = [color.r, color.g, color.b].map((value) => {
        const channel = Math.max(0, Math.min(255, value)) / 255;
        return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
    const visible = (element) => {
      if (!element) {
        return false;
      }
      if (element === document.documentElement || element === document.body) {
        return true;
      }
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const area = (element) => {
      if (element === document.documentElement || element === document.body) {
        return viewportArea;
      }
      const rect = element.getBoundingClientRect();
      return Math.max(0, rect.width * rect.height);
    };
    const effectiveBackground = (element) => {
      for (let current = element; current; current = current.parentElement) {
        const color = parseColor(window.getComputedStyle(current).backgroundColor);
        if (color && color.a >= 0.35) {
          return color;
        }
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };
    const textContrastOnDarkBackground = (scope, maxArea) => {
      const selector = [
        "h1",
        "h2",
        "h3",
        "h4",
        "p",
        "span",
        "a",
        "button",
        "li",
        "td",
        "th",
        "label",
        "input",
        "textarea",
        "select",
        "[role='button']"
      ].join(",");
      const source = scope || document.body || document.documentElement;
      const nodes = Array.from(source.querySelectorAll?.(selector) || [])
        .map((element) => ({ element, area: area(element) }))
        .filter((item) => item.area > 0)
        .sort((left, right) => right.area - left.area)
        .slice(0, 120);
      let darkBgArea = 0;
      let readableArea = 0;
      let unreadableArea = 0;
      for (const item of nodes) {
        const element = item.element;
        if (!visible(element)) {
          continue;
        }
        const text = String(element.value || element.innerText || element.textContent || "").trim();
        if (!text) {
          continue;
        }
        const sampleArea = Math.min(maxArea, item.area);
        const bgLum = luminance(effectiveBackground(element));
        if (bgLum > 0.45) {
          continue;
        }
        const foreground = parseColor(window.getComputedStyle(element).color);
        if (!foreground || foreground.a < 0.35) {
          continue;
        }
        darkBgArea += sampleArea;
        if (luminance(foreground) <= 0.45) {
          unreadableArea += sampleArea;
        } else {
          readableArea += sampleArea;
        }
      }
      return { darkBgArea, readableArea, unreadableArea };
    };
    const hasUnreadableTextOnDarkBackground = (scope, maxArea) => {
      const contrast = textContrastOnDarkBackground(scope, maxArea);
      return (
        contrast.darkBgArea >= maxArea * 0.02 &&
        contrast.unreadableArea >= maxArea * 0.01 &&
        contrast.unreadableArea > contrast.readableArea * 1.2
      );
    };
    const samples = [];
    const add = (element, root) => {
      if (!visible(element)) {
        return;
      }
      const sampleArea = area(element);
      if (sampleArea <= 0) {
        return;
      }
      const background = effectiveBackground(element);
      samples.push({
        area: Math.min(viewportArea, sampleArea),
        luminance: luminance(background),
        root
      });
    };
    const gameRoot = document.querySelector("div[class*='knowledge_game']");
    if (gameRoot && visible(gameRoot)) {
      const gameArea = Math.max(1, area(gameRoot));
      const gameSamples = [];
      const addGameSample = (element) => {
        if (!visible(element)) {
          return;
        }
        const sampleArea = Math.min(gameArea, area(element));
        if (sampleArea <= 0) {
          return;
        }
        gameSamples.push({
          area: sampleArea,
          luminance: luminance(effectiveBackground(element))
        });
      };
      addGameSample(gameRoot);
      Array.from(gameRoot.querySelectorAll("div, section, article, table, button, [role='button']"))
        .map((element) => ({ element, area: area(element) }))
        .filter((item) => item.area >= gameArea * 0.08)
        .sort((left, right) => right.area - left.area)
        .slice(0, 24)
        .forEach((item) => addGameSample(item.element));
      if (gameSamples.length > 0) {
        const rootSample = gameSamples[0];
        const darkArea = gameSamples
          .filter((sample) => sample.luminance <= 0.45)
          .reduce((total, sample) => total + sample.area, 0);
        const lightArea = gameSamples
          .filter((sample) => sample.luminance >= 0.65)
          .reduce((total, sample) => total + sample.area, 0);
        const nativeGameDark =
          (rootSample.luminance <= 0.45 && lightArea < gameArea * 0.4) ||
          (darkArea >= gameArea * 0.35 && darkArea > lightArea * 1.2);
        return nativeGameDark && !hasUnreadableTextOnDarkBackground(gameRoot, gameArea);
      }
    }
    for (const selector of [
      "html",
      "body",
      "main",
      "#app",
      "#root",
      "[role='main']",
      "div[class*='knowledge_game']"
    ]) {
      document.querySelectorAll(selector).forEach((element) => add(element, true));
    }
    const elements = Array.from(document.body?.querySelectorAll("main, article, section, [role='main'], div, table") || [])
      .map((element) => ({ element, area: area(element) }))
      .filter((item) => item.area >= viewportArea * 0.08)
      .sort((left, right) => right.area - left.area)
      .slice(0, 24);
    for (const item of elements) {
      add(item.element, false);
    }
    if (samples.length === 0) {
      return null;
    }
    const rootDark = samples.some(
      (sample) => sample.root && sample.area >= viewportArea * 0.2 && sample.luminance <= 0.45
    );
    const darkArea = samples
      .filter((sample) => sample.luminance <= 0.45)
      .reduce((total, sample) => total + sample.area, 0);
    const lightArea = samples
      .filter((sample) => sample.luminance >= 0.65)
      .reduce((total, sample) => total + sample.area, 0);
    const nativeDark = rootDark || (darkArea >= viewportArea * 0.35 && darkArea > lightArea * 1.2);
    return nativeDark && !hasUnreadableTextOnDarkBackground(document.body || document.documentElement, viewportArea);
  })();`;
  return webContents.executeJavaScript(script, true).catch(() => null);
}

async function setDarkReaderEnabled(webContents, enabled) {
  if (!webContents || webContents.isDestroyed()) {
    return false;
  }
  if (enabled) {
    await ensureDarkReaderInjected(webContents);
  }
  if (webContents.isDestroyed()) {
    return false;
  }
  const script = `(() => {
    const root = document.documentElement;
    const enabled = ${JSON.stringify(Boolean(enabled))};
    if (!enabled) {
      delete root.dataset.wordcoachDarkReader;
      if (!window.DarkReader) {
        return false;
      }
      try {
        window.DarkReader.auto?.(false);
        window.DarkReader.disable?.();
      } catch (_) {}
      return Boolean(window.DarkReader.isEnabled?.());
    }
    if (!window.DarkReader?.enable) {
      return false;
    }
    try {
      window.DarkReader.setFetchMethod?.(async (url) => {
        const result = await window.__wordCoachDarkReaderFetch(String(url || ""));
        const bytes = Uint8Array.from(atob(result.body), (char) => char.charCodeAt(0));
        return new Response(bytes, {
          status: result.status || 200,
          statusText: result.statusText || "OK",
          headers: result.contentType ? { "content-type": result.contentType } : undefined
        });
      });
      if (!window.DarkReader.isEnabled?.()) {
        window.DarkReader.enable(${JSON.stringify(DARK_READER_THEME)});
      }
      root.dataset.wordcoachDarkReader = "enabled";
      return Boolean(window.DarkReader.isEnabled?.());
    } catch (_) {
      return false;
    }
  })();`;
  return Boolean(await webContents.executeJavaScript(script, true).catch(() => false));
}

async function ensureDarkReaderInjected(webContents) {
  if (!webContents || webContents.isDestroyed()) {
    return false;
  }
  const ready = await webContents
    .executeJavaScript("Boolean(window.DarkReader?.enable)", true)
    .catch(() => false);
  if (ready || webContents.isDestroyed()) {
    return Boolean(ready);
  }
  await webContents.executeJavaScript(darkReaderSource(), true).catch(() => undefined);
  return Boolean(
    await webContents
      .executeJavaScript("Boolean(window.DarkReader?.enable)", true)
      .catch(() => false)
  );
}

function darkReaderSource() {
  if (darkReaderSourceCache === null) {
    darkReaderSourceCache = readText(DARK_READER_PATH);
  }
  return darkReaderSourceCache;
}

async function fetchDarkReaderResource(sender, rawUrl, rawPageUrl) {
  if (!sender || sender.isDestroyed()) {
    throw new Error("Renderer unavailable");
  }
  const fromRemoteView = remoteViewsByWebContentsId.has(sender.id);
  const fromPreloadWindow = pagePreloadWindow?.webContents.id === sender.id;
  if (!fromRemoteView && !fromPreloadWindow) {
    throw new Error("Renderer not allowed");
  }
  const pageUrl = normalizeUrl(rawPageUrl) || sender.getURL();
  const resourceUrl = resolveResourceUrl(rawUrl, pageUrl);
  if (!remoteUrlAllowed(resourceUrl)) {
    throw new Error("Resource URL not allowed");
  }
  const response = await fetch(resourceUrl, {
    headers: {
      Accept: "text/css,image/*,*/*;q=0.8",
      "Accept-Language": acceptLanguageFor(currentLocale()),
      Referer: pageUrl,
      "User-Agent": MOBILE_UA
    },
    redirect: "follow"
  });
  if (!response.ok) {
    throw new Error(`Dark Reader fetch failed ${response.status}: ${resourceUrl}`);
  }
  const contentType = response.headers.get("content-type") || "";
  const buffer = Buffer.from(await response.arrayBuffer());
  const body = buffer.toString("base64");
  return {
    url: response.url || resourceUrl,
    status: response.status,
    statusText: response.statusText,
    contentType,
    body
  };
}

function resolveResourceUrl(rawUrl, pageUrl) {
  try {
    return new URL(String(rawUrl || ""), pageUrl).toString();
  } catch {
    throw new Error("Invalid resource URL");
  }
}

function applyCosmeticAdblockToRemoteWebContents() {
  for (const view of remoteViewsByWebContentsId.values()) {
    applyCosmeticAdblockToView(view);
  }
}

async function applyCosmeticAdblockToView(view) {
  if (!adblocker || !cosmeticAdblockEnabled() || !view || view.webContents.isDestroyed()) {
    return;
  }
  const webContents = view.webContents;
  const features = await collectAdblockFeatures(webContents);
  if (!features || webContents.isDestroyed()) {
    return;
  }
  let css = "";
  try {
    css = normalizeCosmeticCss(adblocker.cosmeticCss(features));
  } catch {
    return;
  }
  await injectCosmeticAdblockCss(webContents, css).catch(() => undefined);
}

function clearCosmeticAdblockFromRemoteWebContents() {
  for (const view of remoteViewsByWebContentsId.values()) {
    if (view && !view.webContents.isDestroyed()) {
      injectCosmeticAdblockCss(view.webContents, "").catch(() => undefined);
    }
  }
}

function collectAdblockFeatures(webContents) {
  if (!webContents || webContents.isDestroyed()) {
    return null;
  }
  const script = `(() => {
    const cap = (set, value, limit) => {
      if (set.size >= limit) {
        return;
      }
      const text = String(value || "").trim();
      if (text && text.length <= 256) {
        set.add(text);
      }
    };
    const ids = new Set();
    const classes = new Set();
    const hrefs = new Set();
    for (const element of document.querySelectorAll("[id]")) {
      cap(ids, element.id, 8000);
    }
    for (const element of document.querySelectorAll("[class]")) {
      for (const className of element.classList || []) {
        cap(classes, className, 8000);
      }
    }
    for (const element of document.querySelectorAll("[href], [src]")) {
      cap(hrefs, element.getAttribute("href"), 4000);
      cap(hrefs, element.getAttribute("src"), 4000);
      cap(hrefs, element.href, 4000);
      cap(hrefs, element.src, 4000);
    }
    return {
      url: location.href,
      ids: [...ids],
      classes: [...classes],
      hrefs: [...hrefs]
    };
  })();`;
  return webContents.executeJavaScript(script, true).catch(() => null);
}

async function injectCosmeticAdblockCss(webContents, css) {
  if (!webContents || webContents.isDestroyed()) {
    return;
  }
  const webContentsId = webContents.id;
  const previousKey = cosmeticCssKeysByWebContentsId.get(webContentsId);
  if (previousKey) {
    cosmeticCssKeysByWebContentsId.delete(webContentsId);
    await webContents.removeInsertedCSS(previousKey).catch(() => undefined);
  }
  if (css) {
    const key = await webContents.insertCSS(css, { cssOrigin: "user" }).catch(() => "");
    if (key && !webContents.isDestroyed()) {
      cosmeticCssKeysByWebContentsId.set(webContentsId, key);
    }
  }
  await injectCosmeticAdblockStyleFallback(webContents, css);
}

function injectCosmeticAdblockStyleFallback(webContents, css) {
  if (!webContents || webContents.isDestroyed()) {
    return Promise.resolve();
  }
  const script = `(() => {
    const id = "wordcoach-cosmetic-adblock-style";
    const css = ${JSON.stringify(css || "")};
    window.__WORDCOACH_COSMETIC_ADBLOCK_CSS = css;
    const ensureStyle = () => {
      let style = document.getElementById(id);
      if (!window.__WORDCOACH_COSMETIC_ADBLOCK_CSS) {
        style?.remove();
        return;
      }
      if (!style) {
        style = document.createElement("style");
        style.id = id;
        (document.head || document.documentElement).appendChild(style);
      }
      if (style.textContent !== window.__WORDCOACH_COSMETIC_ADBLOCK_CSS) {
        style.textContent = window.__WORDCOACH_COSMETIC_ADBLOCK_CSS;
      }
    };
    if (!css) {
      ensureStyle();
      return;
    }
    ensureStyle();
    if (!window.__WORDCOACH_COSMETIC_ADBLOCK_OBSERVER) {
      window.__WORDCOACH_COSMETIC_ADBLOCK_OBSERVER = new MutationObserver(() => ensureStyle());
      window.__WORDCOACH_COSMETIC_ADBLOCK_OBSERVER.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    }
  })();`;
  return webContents.executeJavaScript(script, true);
}

function normalizeCosmeticCss(css) {
  const normalizedRules = [];
  for (const rule of splitCssRules(css)) {
    for (const selector of splitSelectorList(rule.selector)) {
      if (selector) {
        normalizedRules.push(`${selector} { ${rule.body} }`);
      }
    }
  }
  return normalizedRules.join("\n");
}

function splitCssRules(css) {
  const rules = [];
  const text = String(css || "");
  let selectorStart = 0;
  let bodyStart = -1;
  let quote = "";
  let escapeNext = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === "\\") {
      escapeNext = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = "";
      }
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (char === "{" && bodyStart === -1) {
      bodyStart = index + 1;
      continue;
    }
    if (char === "}" && bodyStart !== -1) {
      const selector = text.slice(selectorStart, bodyStart - 1).trim();
      const body = text.slice(bodyStart, index).trim();
      if (selector && body) {
        rules.push({ selector, body });
      }
      selectorStart = index + 1;
      bodyStart = -1;
    }
  }

  return rules;
}

function splitSelectorList(selectorText) {
  const selectors = [];
  const text = String(selectorText || "");
  let start = 0;
  let quote = "";
  let bracketDepth = 0;
  let parenDepth = 0;
  let escapeNext = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === "\\") {
      escapeNext = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = "";
      }
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (char === "[") {
      bracketDepth += 1;
      continue;
    }
    if (char === "]" && bracketDepth > 0) {
      bracketDepth -= 1;
      continue;
    }
    if (char === "(") {
      parenDepth += 1;
      continue;
    }
    if (char === ")" && parenDepth > 0) {
      parenDepth -= 1;
      continue;
    }
    if (char === "," && bracketDepth === 0 && parenDepth === 0) {
      selectors.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  selectors.push(text.slice(start).trim());
  return selectors.filter(Boolean);
}

function sendSnapshot() {
  mainWindow?.webContents.send("wordcoach:snapshot", appSnapshot());
}

async function showBlockedNavigationDialogIfUserClick(view, url) {
  if (!view || view.webContents.isDestroyed() || !(await wasRecentUserLinkClick(view, url))) {
    return;
  }
  const normalized = normalizeUrl(url);
  const key = `${view.webContents.id}:${normalized}`;
  if (pendingBlockedDialogs.has(key)) {
    return;
  }

  pendingBlockedDialogs.add(key);
  try {
    const options = {
      type: "warning",
      title: t("navigation_blocked_title"),
      message: t("navigation_blocked_message"),
      detail: normalized,
      buttons: [t("ok"), t("open_in_browser")],
      defaultId: 0,
      cancelId: 0
    };
    const result = mainWindow
      ? await dialog.showMessageBox(mainWindow, options)
      : await dialog.showMessageBox(options);
    if (result.response === 1) {
      await shell.openExternal(normalized);
    }
  } catch {
    // Dialog/open-external failure should not affect navigation blocking.
  } finally {
    pendingBlockedDialogs.delete(key);
  }
}

async function wasRecentUserLinkClick(view, url) {
  const script = `(() => {
    const root = document.documentElement;
    if (!root) {
      return null;
    }
    const value = {
      url: root.dataset[${JSON.stringify(USER_LINK_URL_ATTRIBUTE)}] || "",
      at: Number(root.dataset[${JSON.stringify(USER_LINK_TIME_ATTRIBUTE)}] || 0),
      now: Date.now()
    };
    if (${JSON.stringify(normalizeUrl(url))} === value.url) {
      delete root.dataset[${JSON.stringify(USER_LINK_URL_ATTRIBUTE)}];
      delete root.dataset[${JSON.stringify(USER_LINK_TIME_ATTRIBUTE)}];
    }
    return value;
  })();`;
  const click = await view.webContents.executeJavaScript(script, true).catch(() => null);
  return (
    click &&
    urlsEqual(click.url, url) &&
    Number.isFinite(click.at) &&
    Number.isFinite(click.now) &&
    click.now - click.at >= 0 &&
    click.now - click.at <= USER_LINK_CLICK_TTL_MS
  );
}

function loadAllowedUrl(view, url) {
  rememberAllowedUrl(view, url);
  markRemoteThemePending(view);
  return view.webContents.loadURL(url);
}

function rememberAllowedUrl(view, url) {
  if (view && remoteMainFrameUrlAllowed(url)) {
    lastAllowedUrlByWebContentsId.set(view.webContents.id, url);
  }
}

function syncDictionaryStateFromUrl(view, url) {
  if (view !== dictionaryView || !store) {
    return;
  }
  const state = dictionaryStateFromUrl(url);
  if (!state) {
    return;
  }
  if (pendingDictionaryNavigation) {
    if (Date.now() > pendingDictionaryNavigation.expiresAt) {
      pendingDictionaryNavigation = null;
    } else if (dictionaryStatesMatch(state, pendingDictionaryNavigation.state)) {
      pendingDictionaryNavigation = null;
    } else if (state.needs_page_word && state.provider === pendingDictionaryNavigation.state?.provider) {
      pendingDictionaryNavigation = null;
    } else {
      return;
    }
  }
  dictionarySyncQueue = dictionarySyncQueue
    .then(() => syncDictionaryState(state))
    .catch(() => undefined);
  if (state.needs_page_word) {
    scheduleDictionaryPageWordSync(view, url);
  }
}

async function syncDictionaryState(state) {
  const snapshot = store.snapshot();
  let changed = false;
  if (state.provider !== snapshot.provider) {
    await store.setProvider(state.provider);
    changed = true;
  }
  if (state.mode !== snapshot.dictionary_mode) {
    await store.setDictionaryMode(state.mode);
    changed = true;
  }
  if (typeof state.word === "string" && state.word !== snapshot.current_word) {
    await store.setCurrentWord(state.word);
    changed = true;
  }
  if (changed) {
    sendSnapshot();
    scheduleNetworkWarmup();
  }
}

function scheduleDictionaryPageWordSync(view, url) {
  for (const delay of [150, 600, 1500, 3000]) {
    setTimeout(() => syncDictionaryStateFromPage(view, url), delay);
  }
}

async function syncDictionaryStateFromPage(view, expectedUrl) {
  if (!view || view !== dictionaryView || view.webContents.isDestroyed()) {
    return;
  }
  const currentUrl = view.webContents.getURL();
  if (!urlsEqual(currentUrl, expectedUrl)) {
    return;
  }
  const state = dictionaryStateFromUrl(currentUrl);
  if (!state?.needs_page_word) {
    return;
  }
  const word = await extractNaverDictionaryWord(view.webContents);
  if (!word) {
    return;
  }
  dictionarySyncQueue = dictionarySyncQueue
    .then(() => syncDictionaryState({ ...state, word, needs_page_word: false }))
    .catch(() => undefined);
}

async function extractNaverDictionaryWord(webContents) {
  if (!webContents || webContents.isDestroyed()) {
    return "";
  }
  const script = `(() => {
    const clean = (value) => {
      const text = String(value || "")
        .replace(/\\u00b7/g, "")
        .replace(/\\s+/g, " ")
        .trim()
        .replace(/\\s*\\d+$/, "")
        .trim();
      const match = text.match(/[A-Za-z][A-Za-z' -]{0,80}/);
      return match ? match[0].replace(/\\s+/g, " ").trim() : "";
    };
    const textFrom = (selector) => {
      const element = document.querySelector(selector);
      if (!element) {
        return "";
      }
      const clone = element.cloneNode(true);
      clone.querySelectorAll("sup, .num, .blind").forEach((node) => node.remove());
      return clean(clone.textContent);
    };
    for (const selector of [
      ".section_entry .entry_title strong.word",
      ".component_entry .entry_title strong.word",
      ".entry_title .word",
      ".headword"
    ]) {
      const word = textFrom(selector);
      if (word) {
        return word;
      }
    }
    const attr = document.querySelector("#ac_input")?.getAttribute("data-value");
    const attrWord = clean(attr);
    if (attrWord) {
      return attrWord;
    }
    return clean(document.querySelector("meta[property='og:title']")?.content || document.title);
  })();`;
  return webContents.executeJavaScript(script, true).catch(() => "");
}

function isMainFrameRequest(details) {
  return details.resourceType === "mainFrame" || details.resourceType === "main_frame";
}

function scheduleRestoreBlockedNavigation(webContentsId, blockedUrl) {
  const view = remoteViewsByWebContentsId.get(webContentsId);
  if (!view) {
    return;
  }
  for (const delay of [0, 150, 600]) {
    setTimeout(() => restoreBlockedNavigation(view, blockedUrl), delay);
  }
}

function restoreBlockedNavigation(view, blockedUrl) {
  if (!view || view.webContents.isDestroyed()) {
    return;
  }
  recordBlockedUrl(blockedUrl);
  const currentUrl = view.webContents.getURL();
  if (currentUrl && remoteMainFrameUrlAllowed(currentUrl)) {
    return;
  }
  const fallbackUrl = lastAllowedUrlByWebContentsId.get(view.webContents.id) || fallbackUrlForView(view);
  if (fallbackUrl) {
    loadAllowedUrl(view, fallbackUrl);
  }
}

function fallbackUrlForView(view) {
  if (view === coachView) {
    return googleUrl();
  }
  if (view === dictionaryView) {
    return homeUrl(currentProvider(), currentDictionaryMode());
  }
  return "";
}

function reloadRemoteViewsForLocale() {
  if (coachView && !coachView.webContents.isDestroyed()) {
    loadAllowedUrl(coachView, googleUrl()).catch(() => undefined);
  }
  if (currentPreloadEagerness() === "prerender") {
    prerenderUrlsByKey.clear();
    syncDictionaryPrerenderMode();
    return;
  }
  if (dictionaryView && !dictionaryView.webContents.isDestroyed()) {
    loadAllowedUrl(
      dictionaryView,
      dictionaryUrl(currentProvider(), currentDictionaryMode(), store.snapshot().current_word)
    ).catch(() => undefined);
  }
}

function navigateDictionary(word) {
  if (!dictionaryView) {
    return;
  }
  const url = dictionaryUrl(currentProvider(), currentDictionaryMode(), word);
  pendingDictionaryNavigation = {
    url,
    state: dictionaryStateFromUrl(url),
    expiresAt: Date.now() + DICTIONARY_NAVIGATION_SYNC_GRACE_MS
  };
  if (currentPreloadEagerness() === "prerender") {
    activatePrerenderedDictionaryView(dictionaryKey(currentProvider(), currentDictionaryMode()), url);
    keepPrerenderPages(warmupGeneration).catch(() => undefined);
    return;
  }
  loadAllowedUrl(dictionaryView, url);
}

function currentProvider() {
  return parseProvider(store.snapshot().provider);
}

function currentDictionaryMode() {
  return parseDictionaryMode(store.snapshot().dictionary_mode);
}

function parseProvider(provider) {
  const id = String(provider || "").toLowerCase();
  if (PROVIDERS.some((item) => item.id === id)) {
    return id;
  }
  return "dictionary";
}

function parseDictionaryMode(mode) {
  const id = String(mode || "").toLowerCase();
  if (DICTIONARY_MODES.some((item) => item.id === id)) {
    return id;
  }
  return "dictionary";
}

function parsePreloadEagerness(eagerness) {
  const id = String(eagerness || "").toLowerCase();
  if (PRELOAD_EAGERNESS_OPTIONS.some((item) => item.id === id)) {
    return id;
  }
  return "preconnect";
}

function parseDarkMode(mode) {
  const id = String(mode || "").toLowerCase();
  if (DARK_MODE_OPTIONS.some((item) => item.id === id)) {
    return id;
  }
  return "system";
}

function dictionaryUrl(provider, mode, word) {
  const sanitized = sanitizeWord(word);
  if (!sanitized) {
    return homeUrl(provider, mode);
  }
  if (provider === "merriam") {
    return mode === "thesaurus"
      ? `https://www.merriam-webster.com/thesaurus/${sanitized}`
      : `https://www.merriam-webster.com/dictionary/${sanitized}`;
  }
  if (provider === "naver") {
    return naverDictionaryUrl(mode, sanitized);
  }
  return mode === "thesaurus"
    ? `https://www.thesaurus.com/browse/${sanitized}`
    : `https://www.dictionary.com/browse/${sanitized}`;
}

function homeUrl(provider, mode) {
  if (provider === "merriam") {
    return mode === "thesaurus"
      ? "https://www.merriam-webster.com/thesaurus"
      : "https://www.merriam-webster.com/dictionary";
  }
  if (provider === "naver") {
    return `${naverDictionaryBaseUrl(mode)}/`;
  }
  return mode === "thesaurus" ? "https://www.thesaurus.com/" : "https://www.dictionary.com/";
}

function dictionaryStateFromUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  const parts = parsed.pathname.split("/").filter(Boolean);
  if (host === "dictionary.com" || host === "www.dictionary.com") {
    return {
      provider: "dictionary",
      mode: "dictionary",
      word: parts[0] === "browse" ? wordFromPathPart(parts[1]) : wordFromSearch(parsed)
    };
  }
  if (host === "thesaurus.com" || host === "www.thesaurus.com") {
    return {
      provider: "dictionary",
      mode: "thesaurus",
      word: parts[0] === "browse" ? wordFromPathPart(parts[1]) : wordFromSearch(parsed)
    };
  }
  if (host === "merriam-webster.com" || host === "www.merriam-webster.com") {
    if (parts[0] === "thesaurus") {
      return { provider: "merriam", mode: "thesaurus", word: wordFromPathPart(parts[1]) };
    }
    return {
      provider: "merriam",
      mode: "dictionary",
      word: parts[0] === "dictionary" ? wordFromPathPart(parts[1]) : wordFromSearch(parsed)
    };
  }
  if (host === NAVER_DICTIONARY_HOST) {
    const naverWord = wordFromSearch(parsed) || wordFromHashSearch(parsed);
    return {
      provider: "naver",
      mode: parts[0] === "english-thesaurus" ? "thesaurus" : "dictionary",
      word: naverWord || (naverHashRoute(parsed) === "entry" ? null : ""),
      needs_page_word: !naverWord && naverHashRoute(parsed) === "entry"
    };
  }
  return null;
}

function dictionaryStatesMatch(left, right) {
  if (!left || !right) {
    return false;
  }
  return left.provider === right.provider && left.mode === right.mode && left.word === right.word;
}

function wordFromSearch(url) {
  return cleanUrlWord(url.searchParams.get("q") || "");
}

function wordFromHashSearch(url) {
  const hash = String(url.hash || "");
  const queryIndex = hash.indexOf("?");
  if (queryIndex === -1) {
    return "";
  }
  const params = new URLSearchParams(hash.slice(queryIndex + 1));
  return cleanUrlWord(params.get("query") || params.get("q") || "");
}

function naverHashRoute(url) {
  return String(url.hash || "")
    .replace(/^#\/?/, "")
    .split(/[/?#]/)
    .filter(Boolean)[0] || "";
}

function wordFromPathPart(part) {
  return cleanUrlWord(part || "");
}

function naverDictionaryBaseUrl(mode) {
  const path = mode === "thesaurus" ? "english-thesaurus" : "english-dictionary";
  return `https://${NAVER_DICTIONARY_HOST}/${path}`;
}

function naverDictionaryUrl(mode, word) {
  const route = mode === "thesaurus" ? "thesaurus" : "search";
  return `${naverDictionaryBaseUrl(mode)}/#/${route}?query=${encodeURIComponent(word)}`;
}

function cleanUrlWord(value) {
  try {
    return decodeURIComponent(String(value).replace(/\+/g, " ")).split(/\s+/).filter(Boolean).join(" ");
  } catch {
    return "";
  }
}

function currentPreloadEagerness() {
  return parsePreloadEagerness(store.snapshot().preload_eagerness);
}

function scheduleNetworkWarmup() {
  if (warmupTimer) {
    clearTimeout(warmupTimer);
    warmupTimer = null;
  }

  const eagerness = currentPreloadEagerness();
  const generation = ++warmupGeneration;
  if (!remoteSession || !proxy || eagerness === "off") {
    destroyPagePreloadWindow();
    disableDictionaryPrerenderViews();
    return;
  }

  warmupTimer = setTimeout(() => {
    runNetworkWarmup(eagerness, generation).catch(() => undefined);
  }, 100);
}

async function runNetworkWarmup(eagerness, generation) {
  if (generation !== warmupGeneration) {
    return;
  }
  const rank = PRELOAD_EAGERNESS_RANK[eagerness] ?? 0;
  const origins = warmupOrigins();
  const hosts = origins.map((origin) => new URL(origin).hostname);

  if (rank >= PRELOAD_EAGERNESS_RANK.dns) {
    warmDns(hosts);
  }
  if (rank >= PRELOAD_EAGERNESS_RANK.preconnect) {
    warmPreconnect(origins);
  }
  if (rank >= PRELOAD_EAGERNESS_RANK.prerender) {
    await keepPrerenderPages(generation);
  } else if (rank >= PRELOAD_EAGERNESS_RANK.pages) {
    disableDictionaryPrerenderViews();
    await preloadPages(warmupPageUrls(), generation);
  } else {
    destroyPagePreloadWindow();
    disableDictionaryPrerenderViews();
  }
}

function warmDns(hosts) {
  proxy.warmHosts(hosts).catch(() => undefined);
  for (const host of hosts) {
    remoteSession.resolveHost(host).catch(() => undefined);
  }
}

function warmPreconnect(origins) {
  for (const origin of origins) {
    try {
      remoteSession.preconnect({ url: origin, numSockets: 1 });
    } catch {
      // Best-effort warmup only.
    }
  }
}

async function preloadPages(urls, generation) {
  destroyPagePreloadWindow();
  if (generation !== warmupGeneration || urls.length === 0) {
    return;
  }

  pagePreloadWindow = createHiddenRemoteWindow();

  for (const url of urls) {
    if (generation !== warmupGeneration || !pagePreloadWindow || pagePreloadWindow.isDestroyed()) {
      break;
    }
    await loadPreloadUrl(pagePreloadWindow, url);
  }

  if (generation === warmupGeneration) {
    destroyPagePreloadWindow();
    warmPreconnect(warmupOrigins());
  }
}

async function keepPrerenderPages(generation) {
  destroyPagePreloadWindow();
  if (generation !== warmupGeneration) {
    return;
  }

  const specs = prerenderPageSpecs();
  const wantedKeys = new Set(specs.map((spec) => spec.key));
  for (const [key, view] of prerenderDictionaryViews) {
    if (!wantedKeys.has(key) || view.webContents.isDestroyed()) {
      destroyPrerenderDictionaryView(key);
    }
  }

  const loads = [];
  for (const spec of specs) {
    if (generation !== warmupGeneration) {
      break;
    }
    const view = prerenderDictionaryViewFor(spec.key);
    if (prerenderUrlsByKey.get(spec.key) !== spec.url) {
      prerenderUrlsByKey.set(spec.key, spec.url);
      rememberAllowedUrl(view, spec.url);
      loads.push(loadPreloadUrl(view, spec.url));
    }
  }

  await Promise.allSettled(loads);
  if (generation === warmupGeneration) {
    activatePrerenderedDictionaryView(
      dictionaryKey(currentProvider(), currentDictionaryMode()),
      dictionaryUrl(currentProvider(), currentDictionaryMode(), store.snapshot().current_word)
    );
    warmPreconnect(warmupOrigins());
  }
}

function createHiddenRemoteWindow() {
  const window = new BrowserWindow({
    show: false,
    width: 390,
    height: 720,
    webPreferences: {
      session: remoteSession,
      preload: REMOTE_PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  window.webContents.setUserAgent(MOBILE_UA);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  return window;
}

function syncDictionaryPrerenderMode() {
  const word = store.snapshot().current_word;
  if (currentPreloadEagerness() === "prerender") {
    activatePrerenderedDictionaryView(
      dictionaryKey(currentProvider(), currentDictionaryMode()),
      dictionaryUrl(currentProvider(), currentDictionaryMode(), word)
    );
    keepPrerenderPages(warmupGeneration).catch(() => undefined);
  } else {
    disableDictionaryPrerenderViews();
  }
}

function activatePrerenderedDictionaryView(key, url) {
  const view = prerenderDictionaryViewFor(key);
  if (dictionaryView && dictionaryView !== view && !prerenderDictionaryViews.has(viewKey(dictionaryView))) {
    destroyWebContentsView(dictionaryView);
  }
  dictionaryView = view;
  rememberAllowedUrl(view, url);
  if (prerenderUrlsByKey.get(key) !== url) {
    prerenderUrlsByKey.set(key, url);
    loadPreloadUrl(view, url).catch(() => undefined);
  }
  layoutRemoteViews();
}

function prerenderDictionaryViewFor(key) {
  const existing = prerenderDictionaryViews.get(key);
  if (existing && !existing.webContents.isDestroyed()) {
    return existing;
  }
  const view = createView(remoteSession, false);
  view.__wordCoachPrerenderKey = key;
  prerenderDictionaryViews.set(key, view);
  mainWindow?.contentView.addChildView(view);
  view.webContents.on("destroyed", () => {
    prerenderDictionaryViews.delete(key);
    prerenderUrlsByKey.delete(key);
  });
  return view;
}

function disableDictionaryPrerenderViews() {
  if (prerenderDictionaryViews.size === 0) {
    return;
  }
  const activeUrl = dictionaryView?.webContents.isDestroyed() ? "" : dictionaryView?.webContents.getURL();
  const activeState = activeUrl ? dictionaryStateFromUrl(activeUrl) : null;
  destroyAllPrerenderDictionaryViews();
  dictionaryView = createView(remoteSession, false);
  mainWindow?.contentView.addChildView(dictionaryView);
  loadAllowedUrl(
    dictionaryView,
    activeState?.provider
      ? activeUrl
      : dictionaryUrl(currentProvider(), currentDictionaryMode(), store.snapshot().current_word)
  );
  layoutRemoteViews();
}

function destroyAllPrerenderDictionaryViews() {
  for (const key of [...prerenderDictionaryViews.keys()]) {
    destroyPrerenderDictionaryView(key);
  }
}

function destroyPrerenderDictionaryView(key) {
  const view = prerenderDictionaryViews.get(key);
  if (view) {
    destroyWebContentsView(view);
  }
  prerenderDictionaryViews.delete(key);
  prerenderUrlsByKey.delete(key);
}

function destroyWebContentsView(view) {
  if (!view) {
    return;
  }
  try {
    mainWindow?.contentView.removeChildView(view);
  } catch {
    // View may already be detached.
  }
}

function dictionaryKey(provider, mode) {
  return `${parseProvider(provider)}:${parseDictionaryMode(mode)}`;
}

function viewKey(view) {
  return view?.__wordCoachPrerenderKey || "";
}

function loadPreloadUrl(windowOrView, url) {
  if (remoteContainerDestroyed(windowOrView)) {
    return Promise.resolve();
  }
  const webContentsId = windowOrView.webContents.id;
  const existing = preloadLoadsByWebContentsId.get(webContentsId);
  existing?.cancel?.();
  try {
    if (!remoteContainerDestroyed(windowOrView) && windowOrView.webContents.isLoading()) {
      windowOrView.webContents.stop();
    }
  } catch {
    // The page can finish or be destroyed between checks.
  }

  const promise = new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const done = () => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      try {
        if (!remoteContainerDestroyed(windowOrView)) {
          preloadLoadsByWebContentsId.delete(windowOrView.webContents.id);
          windowOrView.webContents.off("did-finish-load", done);
          windowOrView.webContents.off("did-fail-load", done);
          windowOrView.webContents.off("did-fail-provisional-load", done);
        }
      } catch {
        // Hidden preload windows can be destroyed while cleanup is running.
      }
      resolve();
    };
    try {
      if (remoteContainerDestroyed(windowOrView)) {
        done();
        return;
      }
      timer = setTimeout(done, 3500);
      preloadLoadsByWebContentsId.set(webContentsId, {
        url,
        cancel: done
      });
      windowOrView.webContents.once("did-finish-load", done);
      windowOrView.webContents.once("did-fail-load", done);
      windowOrView.webContents.once("did-fail-provisional-load", done);
      windowOrView.webContents.loadURL(url).catch(done);
    } catch {
      done();
    }
  });
  return promise;
}

function remoteContainerDestroyed(windowOrView) {
  if (!windowOrView) {
    return true;
  }
  if (typeof windowOrView.isDestroyed === "function") {
    return windowOrView.isDestroyed();
  }
  return windowOrView.webContents.isDestroyed();
}

function destroyPagePreloadWindow() {
  if (pagePreloadWindow && !pagePreloadWindow.isDestroyed()) {
    pagePreloadWindow.destroy();
  }
  pagePreloadWindow = null;
}

function warmupOrigins() {
  return [...new Set(WARMUP_ORIGINS.filter((origin) => remoteUrlAllowed(origin)))];
}

function warmupPageUrls() {
  const word = store.snapshot().current_word;
  const urls = [googleUrl()];
  const providerIds = PROVIDERS.map((provider) => provider.id);
  for (const provider of providerIds) {
    for (const mode of ["dictionary", "thesaurus"]) {
      urls.push(homeUrl(provider, mode));
      if (word) {
        urls.push(dictionaryUrl(provider, mode, word));
      }
    }
  }
  return [...new Set(urls.filter(remoteUrlAllowed))];
}

function prerenderPageSpecs() {
  const word = store.snapshot().current_word;
  const specs = [];
  for (const provider of PROVIDERS.map((item) => item.id)) {
    for (const mode of DICTIONARY_MODES.map((item) => item.id)) {
      specs.push({
        key: `${provider}:${mode}`,
        url: word ? dictionaryUrl(provider, mode, word) : homeUrl(provider, mode)
      });
    }
  }
  return specs.filter((spec) => remoteUrlAllowed(spec.url));
}

function sanitizeWord(word) {
  return String(word || "")
    .trim()
    .split("")
    .filter((char) => /[A-Za-z'-]/.test(char))
    .join("")
    .replace(/'/g, "")
    .toLowerCase();
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function fileUrl(filePath) {
  return pathToFileURL(filePath).toString();
}

function urlAllowed(url) {
  if (nonNetworkUrlAllowed(url)) {
    return true;
  }
  return remoteMainFrameUrlAllowed(url);
}

function remoteUrlAllowed(url) {
  try {
    const parsed = new URL(url);
    return remoteParsedUrlAllowed(parsed);
  } catch {
    return false;
  }
}

function remoteMainFrameUrlAllowed(url) {
  try {
    const parsed = new URL(url);
    return remoteParsedUrlAllowed(parsed) && naverMainFrameUrlAllowed(parsed);
  } catch {
    return false;
  }
}

function remoteParsedUrlAllowed(parsed) {
  return (
    ["http:", "https:"].includes(parsed.protocol) &&
    hostAllowed(parsed.hostname) &&
    !urlBlockedByPrefix(parsed.toString())
  );
}

function naverMainFrameUrlAllowed(url) {
  const host = url.hostname.toLowerCase();
  if (!naverOwnedHost(host)) {
    return true;
  }
  if (host !== NAVER_DICTIONARY_HOST) {
    return false;
  }
  const section = url.pathname.split("/").filter(Boolean)[0] || "";
  return NAVER_ALLOWED_DICTIONARY_PATHS.has(section);
}

function naverOwnedHost(host) {
  return (
    host === "naver.com" ||
    host.endsWith(".naver.com") ||
    host === "naver.net" ||
    host.endsWith(".naver.net") ||
    host === "pstatic.net" ||
    host.endsWith(".pstatic.net")
  );
}

function urlBlockedByPrefix(url) {
  const normalized = normalizeUrl(url);
  return Boolean(normalized && BLOCKED_URL_PREFIXES.some((prefix) => normalized.startsWith(prefix)));
}

function urlsEqual(left, right) {
  return normalizeUrl(left) === normalizeUrl(right);
}

function normalizeUrl(url) {
  try {
    return new URL(url).toString();
  } catch {
    return String(url || "");
  }
}

function nonNetworkUrlAllowed(url) {
  return url === "about:blank" || url === "about:srcdoc";
}

function recordBlockedUrl(url) {
  const host = hostFromUrl(url);
  if (host) {
    proxy.recordBlocked(host);
    sendSnapshot();
  }
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function permissionAllowedForOrigin(permission, origin) {
  const host = originHost(origin);
  if (!host || !(host === "accounts.google.com" || host.endsWith(".google.com"))) {
    return false;
  }
  const allowedPermissions = new Set([
    "hid",
    "serial",
    "usb",
    "publickey-credentials-create",
    "publickey-credentials-get",
    "storage-access",
    "top-level-storage-access",
    "unknown"
  ]);
  if (!allowedPermissions.has(permission)) {
    return false;
  }
  if (permission !== "unknown") {
    return true;
  }
  return host === "accounts.google.com";
}

function originHost(origin) {
  try {
    return new URL(origin).hostname;
  } catch {
    return "";
  }
}
