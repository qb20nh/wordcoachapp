import "./styles.css";
import {
  ChevronLeft,
  ChevronRight,
  createIcons,
  LogIn,
  RefreshCw,
  Search,
  Settings,
  X
} from "lucide";

type Provider = "dictionary" | "merriam" | "naver";
type DictionaryMode = "dictionary" | "thesaurus";
type PreloadEagerness = "off" | "dns" | "preconnect" | "pages" | "prerender";
type DarkMode = "system" | "dark" | "off";
type ColorScheme = "light" | "dark";
type LocaleChoice = "system" | "en" | "ko";
type ResolvedLocale = "en" | "ko";

type DictionaryProviderOption = {
  id: Provider;
  label: string;
};

type DictionaryModeOption = {
  id: DictionaryMode;
  label: string;
};

type PreloadEagernessOption = {
  id: PreloadEagerness;
  label: string;
};

type DarkModeOption = {
  id: DarkMode;
  label: string;
};

type LocaleOption = {
  id: LocaleChoice;
  label: string;
};

type AdblockStatus = {
  ready: boolean;
  updating: boolean;
  updated_at: number | null;
  list_count: number;
  error: string | null;
};

type HistoryRecord = {
  id: string;
  captured_at: number;
  question: string | null;
  options: string[];
  word_log: string[];
  selected_answer: string | null;
  correct_answer: string | null;
  result: string | null;
  source_url: string;
  extractor_version: number;
};

type WordLogItem = {
  word: string;
  result: string | null;
};

type AppSnapshot = {
  provider: Provider;
  dictionary_providers: DictionaryProviderOption[];
  dictionary_mode: DictionaryMode;
  dictionary_modes: DictionaryModeOption[];
  preload_eagerness: PreloadEagerness;
  preload_eagerness_options: PreloadEagernessOption[];
  dark_mode: DarkMode;
  dark_mode_options: DarkModeOption[];
  cosmetic_adblock: boolean;
  locale_choice: LocaleChoice;
  resolved_locale: ResolvedLocale;
  locale_options: LocaleOption[];
  messages: Record<string, string>;
  current_word: string;
  proxy_addr: string;
  proxy_blocked_hosts: string[];
  adblock: AdblockStatus;
  color_scheme: ColorScheme;
  history: HistoryRecord[];
};

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing app root");
}

app.innerHTML = `
  <header class="topbar">
    <form id="lookupForm" class="lookup">
      <button id="settingsButton" class="icon-button" type="button" aria-label="Settings" title="Settings"><i data-lucide="settings"></i></button>
      <select id="providerSelect" aria-label="Dictionary provider"></select>
      <select id="modeSelect" aria-label="Dictionary mode"></select>
      <input id="lookupInput" type="search" spellcheck="false" placeholder="Search meaning" />
      <button class="icon-button" type="submit" aria-label="Look up" title="Look up"><i data-lucide="search"></i></button>
    </form>
    <div class="split-toolbar" aria-label="Page controls">
      <div class="toolbar-group toolbar-left" aria-label="Google Word Coach controls">
        <button id="reloadCoach" class="icon-button" type="button" aria-label="Reload Word Coach" title="Reload Word Coach"><i data-lucide="refresh-cw"></i></button>
        <button id="googleSignIn" class="icon-button" type="button" aria-label="Google sign in" title="Google sign in"><i data-lucide="log-in"></i></button>
      </div>
      <div class="toolbar-group toolbar-right" aria-label="Dictionary controls">
        <button id="dictionaryBack" class="icon-button" type="button" aria-label="Dictionary back" title="Dictionary back"><i data-lucide="chevron-left"></i></button>
        <button id="dictionaryForward" class="icon-button" type="button" aria-label="Dictionary forward" title="Dictionary forward"><i data-lucide="chevron-right"></i></button>
        <button id="dictionaryRefresh" class="icon-button" type="button" aria-label="Refresh dictionary" title="Refresh dictionary"><i data-lucide="refresh-cw"></i></button>
      </div>
    </div>
  </header>
  <section class="word-log-panel" aria-label="Word log">
    <div id="historyList" class="history-list"></div>
  </section>
  <div id="settingsOverlay" class="settings-overlay" hidden>
    <section class="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settingsTitle">
      <header class="settings-header">
        <h2 id="settingsTitle">Settings</h2>
        <button id="closeSettings" class="icon-button" type="button" aria-label="Close settings" title="Close settings"><i data-lucide="x"></i></button>
      </header>
      <div class="settings-body">
        <label class="settings-field">
          <span id="languageLabel">Language</span>
          <select id="localeSelect" aria-label="Language"></select>
        </label>
        <label class="settings-field">
          <span id="preloadLabel">Preload</span>
          <select id="preloadSelect" aria-label="Preload eagerness"></select>
        </label>
        <label class="settings-field">
          <span id="darkModeLabel">Dark mode</span>
          <select id="darkModeSelect" aria-label="Dark mode"></select>
        </label>
        <label class="settings-field settings-check-field">
          <span id="cosmeticAdblockLabel">Cosmetic ad blocking</span>
          <input id="cosmeticAdblockToggle" type="checkbox" aria-label="Cosmetic ad blocking" />
        </label>
        <div class="settings-actions">
          <button id="exportData" type="button">Export</button>
          <button id="importData" type="button">Import</button>
        </div>
        <div class="settings-actions settings-actions-wide">
          <button id="updateFilters" type="button">Update filters</button>
          <span id="filterStatus" class="settings-status">Filters not loaded</span>
        </div>
      </div>
    </section>
  </div>
  <div id="toast" class="toast" role="status" aria-live="polite"></div>
`;

createIcons({
  icons: { ChevronLeft, ChevronRight, LogIn, RefreshCw, Search, Settings, X },
  root: app,
  attrs: {
    "aria-hidden": "true",
    focusable: "false"
  }
});

const lookupForm = document.querySelector<HTMLFormElement>("#lookupForm")!;
const settingsButton = document.querySelector<HTMLButtonElement>("#settingsButton")!;
const settingsOverlay = document.querySelector<HTMLDivElement>("#settingsOverlay")!;
const closeSettings = document.querySelector<HTMLButtonElement>("#closeSettings")!;
const lookupInput = document.querySelector<HTMLInputElement>("#lookupInput")!;
const providerSelect = document.querySelector<HTMLSelectElement>("#providerSelect")!;
const modeSelect = document.querySelector<HTMLSelectElement>("#modeSelect")!;
const localeSelect = document.querySelector<HTMLSelectElement>("#localeSelect")!;
const preloadSelect = document.querySelector<HTMLSelectElement>("#preloadSelect")!;
const darkModeSelect = document.querySelector<HTMLSelectElement>("#darkModeSelect")!;
const cosmeticAdblockToggle =
  document.querySelector<HTMLInputElement>("#cosmeticAdblockToggle")!;
const reloadCoach = document.querySelector<HTMLButtonElement>("#reloadCoach")!;
const dictionaryBack = document.querySelector<HTMLButtonElement>("#dictionaryBack")!;
const dictionaryForward = document.querySelector<HTMLButtonElement>("#dictionaryForward")!;
const dictionaryRefresh = document.querySelector<HTMLButtonElement>("#dictionaryRefresh")!;
const googleSignIn = document.querySelector<HTMLButtonElement>("#googleSignIn")!;
const exportData = document.querySelector<HTMLButtonElement>("#exportData")!;
const importData = document.querySelector<HTMLButtonElement>("#importData")!;
const updateFilters = document.querySelector<HTMLButtonElement>("#updateFilters")!;
const filterStatus = document.querySelector<HTMLSpanElement>("#filterStatus")!;
const historyList = document.querySelector<HTMLDivElement>("#historyList")!;
const toast = document.querySelector<HTMLDivElement>("#toast")!;

let lastHistorySignature = "";
let lastProviderSignature = "";
let lastModeSignature = "";
let lastPreloadSignature = "";
let lastDarkModeSignature = "";
let lastLocaleSignature = "";
let lastCurrentWord = "";
let activePreloadEagerness: PreloadEagerness = "preconnect";
let activeResolvedLocale: ResolvedLocale = "en";

const fallbackMessages: Record<string, string> = {
  app_title: "Word Coach",
  settings: "Settings",
  close_settings: "Close settings",
  dictionary_provider: "Dictionary provider",
  dictionary_mode: "Dictionary mode",
  search_meaning: "Search meaning",
  look_up: "Look up",
  page_controls: "Page controls",
  google_word_coach_controls: "Google Word Coach controls",
  reload_word_coach: "Reload Word Coach",
  google_sign_in: "Google sign in",
  dictionary_controls: "Dictionary controls",
  dictionary_back: "Dictionary back",
  dictionary_forward: "Dictionary forward",
  refresh_dictionary: "Refresh dictionary",
  word_log: "Word log",
  language: "Language",
  preload: "Preload",
  preload_eagerness: "Preload eagerness",
  dark_mode: "Dark mode",
  dark_mode_system: "System",
  dark_mode_dark: "Dark",
  dark_mode_off: "Off",
  cosmetic_adblock: "Cosmetic ad blocking",
  export: "Export",
  import: "Import",
  update_filters: "Update filters",
  filters_not_loaded: "Filters not loaded",
  updating_filters: "Updating filters",
  filter_error: "Filter error: {error}",
  filters_updated_at: "Updated {time} ({count} lists)",
  filters_loaded: "{count} lists loaded",
  filters_not_loaded_count: "{count} lists not loaded",
  searching_word: "Searching {word}",
  dictionary_changed: "Dictionary changed",
  dictionary_mode_changed: "Dictionary mode changed",
  language_changed: "Language changed",
  preload_changed: "Preload changed",
  dark_mode_changed: "Dark mode changed",
  cosmetic_adblock_changed: "Cosmetic ad blocking changed",
  word_coach_reloaded: "Word Coach reloaded",
  dictionary_reloaded: "Dictionary reloaded",
  opening_google_sign_in: "Opening Google sign in",
  filter_update_failed: "Filter update failed",
  filters_updated: "Filters updated",
  exported_path: "Exported {path}",
  export_cancelled: "Export cancelled",
  import_cancelled: "Import cancelled",
  imported_records: "Imported {count} new records",
  prerender_confirm:
    "Prerender keeps all six dictionary pages loaded in the background. This can use much more RAM, CPU, and network. Enable it?"
};
let activeMessages: Record<string, string> = fallbackMessages;

function message(key: string, values: Record<string, string | number> = {}) {
  const template = activeMessages[key] || fallbackMessages[key] || key;
  return template.replace(/\{(\w+)\}/g, (_match, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : `{${name}}`
  );
}

function setText(id: string, key: string) {
  const element = document.querySelector<HTMLElement>(`#${id}`);
  if (element) {
    element.textContent = message(key);
  }
}

function setLabel(element: HTMLElement, key: string) {
  const text = message(key);
  element.setAttribute("aria-label", text);
  element.setAttribute("title", text);
}

function applyStaticTranslations() {
  document.documentElement.lang = activeResolvedLocale;
  document.title = message("app_title");
  setLabel(settingsButton, "settings");
  providerSelect.setAttribute("aria-label", message("dictionary_provider"));
  modeSelect.setAttribute("aria-label", message("dictionary_mode"));
  lookupInput.placeholder = message("search_meaning");
  setLabel(lookupForm.querySelector<HTMLButtonElement>("button[type='submit']")!, "look_up");
  document.querySelector(".split-toolbar")?.setAttribute("aria-label", message("page_controls"));
  document.querySelector(".toolbar-left")?.setAttribute(
    "aria-label",
    message("google_word_coach_controls")
  );
  setLabel(reloadCoach, "reload_word_coach");
  setLabel(googleSignIn, "google_sign_in");
  document.querySelector(".toolbar-right")?.setAttribute("aria-label", message("dictionary_controls"));
  setLabel(dictionaryBack, "dictionary_back");
  setLabel(dictionaryForward, "dictionary_forward");
  setLabel(dictionaryRefresh, "refresh_dictionary");
  document.querySelector(".word-log-panel")?.setAttribute("aria-label", message("word_log"));
  setText("settingsTitle", "settings");
  setLabel(closeSettings, "close_settings");
  setText("languageLabel", "language");
  localeSelect.setAttribute("aria-label", message("language"));
  setText("preloadLabel", "preload");
  preloadSelect.setAttribute("aria-label", message("preload_eagerness"));
  setText("darkModeLabel", "dark_mode");
  darkModeSelect.setAttribute("aria-label", message("dark_mode"));
  setText("cosmeticAdblockLabel", "cosmetic_adblock");
  cosmeticAdblockToggle.setAttribute("aria-label", message("cosmetic_adblock"));
  exportData.textContent = message("export");
  importData.textContent = message("import");
  updateFilters.textContent = message("update_filters");
}

function showToast(message: string) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2400);
}

function formatTime(epochMs: number) {
  return new Intl.DateTimeFormat(activeResolvedLocale === "ko" ? "ko-KR" : "en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(epochMs));
}

function formatAdblockStatus(status: AdblockStatus) {
  if (status.updating) {
    return message("updating_filters");
  }
  if (status.error) {
    return message("filter_error", { error: status.error });
  }
  if (status.ready && status.updated_at) {
    return message("filters_updated_at", {
      time: formatTime(status.updated_at),
      count: status.list_count
    });
  }
  if (status.ready) {
    return message("filters_loaded", { count: status.list_count });
  }
  return message("filters_not_loaded_count", { count: status.list_count });
}

function wordFromRecord(record: HistoryRecord) {
  const fromQuestion = wordFromQuestion(record.question || "");
  return record.correct_answer || record.selected_answer || fromQuestion || "";
}

function wordFromQuestion(question: string) {
  const phrase = "([A-Za-z][A-Za-z'-]*(?:\\s+[A-Za-z][A-Za-z'-]*){0,3})";
  const patterns = [
    new RegExp(`["'“]${phrase}["'”]`, "i"),
    new RegExp(`\\b(?:similar|synonym|opposite|antonym)\\b.*?\\b(?:to|of|for)\\b\\s+["'“]?${phrase}`, "i"),
    new RegExp(`\\b(?:image|picture|photo)\\b.*?\\b(?:of|for|word|means|matches|represents)\\b\\s+["'“]?${phrase}`, "i"),
    new RegExp(`\\b(?:matches|represents|means)\\b\\s+["'“]?${phrase}`, "i")
  ];
  for (const pattern of patterns) {
    const word = cleanDisplayWord(question.match(pattern)?.[1] || "");
    if (word) {
      return word;
    }
  }
  return "";
}

function renderHistory(records: HistoryRecord[]) {
  const signature = records
    .map((record) => `${record.id}:${record.result || ""}:${record.word_log.join(",")}`)
    .join("|");
  if (signature === lastHistorySignature) {
    return;
  }
  lastHistorySignature = signature;
  const sessions = wordSessions(records, 5).slice(0, 4);

  if (sessions.length === 0) {
    historyList.innerHTML = "";
    return;
  }

  historyList.innerHTML = sessions
    .map(
      (session) => `
        <section class="history-session">
          ${session
            .map(
              (item) => `
                <button class="${historyWordClass(item.result)}" type="button" data-word="${escapeHtml(item.word)}">
                  ${escapeHtml(item.word)}
                </button>
              `
            )
            .join("")}
        </section>
      `
    )
    .join("");
}

function wordSessions(records: HistoryRecord[], size: number) {
  const sessions: WordLogItem[][] = [];
  for (let index = 0; index < records.length; index += size) {
    const seen = new Set<string>();
    const words: WordLogItem[] = [];
    for (const record of records.slice(index, index + size)) {
      const result = normalizeHistoryResult(record.result);
      const recordWords = (record.word_log.length > 0 ? record.word_log : [wordFromRecord(record)])
        .map(cleanDisplayWord)
        .filter(Boolean);
      for (const word of recordWords) {
        const key = word.toLowerCase();
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        words.push({ word, result });
      }
    }
    if (words.length > 0) {
      sessions.push(words);
    }
  }
  return sessions;
}

function cleanDisplayWord(word: string) {
  return word.replace(/\s+/g, " ").trim();
}

function normalizeHistoryResult(result: string | null) {
  const normalized = String(result || "").toLowerCase();
  if (normalized === "correct" || normalized === "incorrect") {
    return normalized;
  }
  return null;
}

function historyWordClass(result: string | null) {
  const state = normalizeHistoryResult(result);
  return `history-word${state ? ` is-${state}` : ""}`;
}

function renderProviderOptions(providers: DictionaryProviderOption[]) {
  const signature = providers.map((provider) => `${provider.id}:${provider.label}`).join("|");
  if (signature === lastProviderSignature) {
    return;
  }
  lastProviderSignature = signature;
  providerSelect.innerHTML = providers
    .map(
      (provider) =>
        `<option value="${escapeHtml(provider.id)}">${escapeHtml(provider.label)}</option>`
    )
    .join("");
}

function renderModeOptions(modes: DictionaryModeOption[]) {
  const signature = modes.map((mode) => `${mode.id}:${mode.label}`).join("|");
  if (signature === lastModeSignature) {
    return;
  }
  lastModeSignature = signature;
  modeSelect.innerHTML = modes
    .map((mode) => `<option value="${escapeHtml(mode.id)}">${escapeHtml(mode.label)}</option>`)
    .join("");
}

function renderPreloadOptions(options: PreloadEagernessOption[]) {
  const signature = options.map((option) => `${option.id}:${option.label}`).join("|");
  if (signature === lastPreloadSignature) {
    return;
  }
  lastPreloadSignature = signature;
  preloadSelect.innerHTML = options
    .map((option) => `<option value="${escapeHtml(option.id)}">${escapeHtml(option.label)}</option>`)
    .join("");
}

function renderDarkModeOptions(options: DarkModeOption[]) {
  const signature = options.map((option) => `${option.id}:${option.label}`).join("|");
  if (signature === lastDarkModeSignature) {
    return;
  }
  lastDarkModeSignature = signature;
  darkModeSelect.innerHTML = options
    .map((option) => `<option value="${escapeHtml(option.id)}">${escapeHtml(option.label)}</option>`)
    .join("");
}

function renderLocaleOptions(options: LocaleOption[]) {
  const signature = options.map((option) => `${option.id}:${option.label}`).join("|");
  if (signature === lastLocaleSignature) {
    return;
  }
  lastLocaleSignature = signature;
  localeSelect.innerHTML = options
    .map((option) => `<option value="${escapeHtml(option.id)}">${escapeHtml(option.label)}</option>`)
    .join("");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#039;";
    }
  });
}

function applyColorScheme(scheme: ColorScheme) {
  document.documentElement.dataset.wordcoachColorScheme = scheme;
  document.documentElement.style.colorScheme = scheme;
}

function applySnapshot(snapshot: AppSnapshot) {
  activeResolvedLocale = snapshot.resolved_locale;
  activeMessages = { ...fallbackMessages, ...(snapshot.messages || {}) };
  applyStaticTranslations();
  applyColorScheme(snapshot.color_scheme);
  renderProviderOptions(snapshot.dictionary_providers);
  renderModeOptions(snapshot.dictionary_modes);
  renderPreloadOptions(snapshot.preload_eagerness_options);
  renderDarkModeOptions(snapshot.dark_mode_options);
  renderLocaleOptions(snapshot.locale_options);
  providerSelect.value = snapshot.provider;
  modeSelect.value = snapshot.dictionary_mode;
  preloadSelect.value = snapshot.preload_eagerness;
  darkModeSelect.value = snapshot.dark_mode;
  cosmeticAdblockToggle.checked = snapshot.cosmetic_adblock;
  localeSelect.value = snapshot.locale_choice;
  activePreloadEagerness = snapshot.preload_eagerness;
  if (snapshot.current_word !== lastCurrentWord || (!lookupInput.value && snapshot.current_word)) {
    lookupInput.value = snapshot.current_word;
  }
  lastCurrentWord = snapshot.current_word;
  filterStatus.textContent = formatAdblockStatus(snapshot.adblock);
  updateFilters.disabled = snapshot.adblock.updating;
  renderHistory(snapshot.history);
}

async function refreshSnapshot() {
  const snapshot = await window.wordCoach.getAppSnapshot();
  applySnapshot(snapshot);
}

async function setSettingsOpen(open: boolean) {
  settingsOverlay.hidden = !open;
  await window.wordCoach.setUiOverlayOpen(open).catch(() => undefined);
}

lookupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const word = lookupInput.value.trim();
  if (!word) {
    return;
  }
  await window.wordCoach.searchDictionary(word);
  showToast(message("searching_word", { word }));
});

settingsButton.addEventListener("click", () => {
  setSettingsOpen(true).catch(() => undefined);
});

closeSettings.addEventListener("click", () => {
  setSettingsOpen(false).catch(() => undefined);
});

settingsOverlay.addEventListener("click", (event) => {
  if (event.target === settingsOverlay) {
    setSettingsOpen(false).catch(() => undefined);
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !settingsOverlay.hidden) {
    setSettingsOpen(false).catch(() => undefined);
  }
});

providerSelect.addEventListener("change", async () => {
  await window.wordCoach.setDictionaryProvider(providerSelect.value as Provider);
  showToast(message("dictionary_changed"));
  await refreshSnapshot();
});

modeSelect.addEventListener("change", async () => {
  await window.wordCoach.setDictionaryMode(modeSelect.value as DictionaryMode);
  showToast(message("dictionary_mode_changed"));
  await refreshSnapshot();
});

localeSelect.addEventListener("change", async () => {
  await window.wordCoach.setLocaleChoice(localeSelect.value as LocaleChoice);
  await refreshSnapshot();
  showToast(message("language_changed"));
});

preloadSelect.addEventListener("change", async () => {
  const nextEagerness = preloadSelect.value as PreloadEagerness;
  if (
    nextEagerness === "prerender" &&
    activePreloadEagerness !== "prerender" &&
    !window.confirm(message("prerender_confirm"))
  ) {
    preloadSelect.value = activePreloadEagerness;
    return;
  }
  await window.wordCoach.setPreloadEagerness(nextEagerness);
  showToast(message("preload_changed"));
  await refreshSnapshot();
});

darkModeSelect.addEventListener("change", async () => {
  await window.wordCoach.setDarkMode(darkModeSelect.value as DarkMode);
  showToast(message("dark_mode_changed"));
  await refreshSnapshot();
});

cosmeticAdblockToggle.addEventListener("change", async () => {
  await window.wordCoach.setCosmeticAdblock(cosmeticAdblockToggle.checked);
  showToast(message("cosmetic_adblock_changed"));
  await refreshSnapshot();
});

reloadCoach.addEventListener("click", async () => {
  await window.wordCoach.reloadCoach();
  showToast(message("word_coach_reloaded"));
});

dictionaryBack.addEventListener("click", async () => {
  await window.wordCoach.dictionaryBack();
});

dictionaryForward.addEventListener("click", async () => {
  await window.wordCoach.dictionaryForward();
});

dictionaryRefresh.addEventListener("click", async () => {
  await window.wordCoach.reloadDictionary();
  showToast(message("dictionary_reloaded"));
});

googleSignIn.addEventListener("click", async () => {
  await window.wordCoach.openGoogleSignIn();
  showToast(message("opening_google_sign_in"));
});

updateFilters.addEventListener("click", async () => {
  updateFilters.disabled = true;
  filterStatus.textContent = message("updating_filters");
  try {
    const status = await window.wordCoach.updateAdblockFilters();
    filterStatus.textContent = formatAdblockStatus(status);
    showToast(status.error ? message("filter_update_failed") : message("filters_updated"));
  } catch (error) {
    showToast(String(error));
  } finally {
    await refreshSnapshot().catch(() => undefined);
  }
});

exportData.addEventListener("click", async () => {
  const path = await window.wordCoach.exportHistory();
  showToast(path ? message("exported_path", { path }) : message("export_cancelled"));
});

importData.addEventListener("click", async () => {
  const imported = await window.wordCoach.importHistory();
  showToast(
    imported === null
      ? message("import_cancelled")
      : message("imported_records", { count: imported })
  );
  await refreshSnapshot();
});

historyList.addEventListener("click", async (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>(".history-word");
  const word = target?.dataset.word?.trim();
  if (!word) {
    return;
  }
  lookupInput.value = word;
  await window.wordCoach.searchDictionary(word);
});

window.wordCoach.onAppSnapshot(applySnapshot);
refreshSnapshot().catch((error) => showToast(String(error)));
window.setInterval(() => {
  refreshSnapshot().catch(() => undefined);
}, 2000);
