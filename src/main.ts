import "./styles.css";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  createIcons,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Settings,
  X
} from "lucide";

const ICONS = { Check, ChevronLeft, ChevronRight, LogIn, LogOut, Plus, RefreshCw, Search, Settings, X };
const ICON_ATTRS = {
  "aria-hidden": "true",
  focusable: "false"
};

type Provider = "dictionary" | "merriam" | "naver";
type DictionaryMode = "dictionary" | "thesaurus";
type PreloadEagerness = "off" | "dns" | "preconnect" | "pages" | "prerender";
type DarkMode = "system" | "dark" | "off";
type ColorScheme = "light" | "dark";
type LocaleChoice = "system" | "en" | "ko";
type ResolvedLocale = "en" | "ko";
type DailyGoalType = "words" | "score";

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
  score_before: number | null;
  score_after: number | null;
  score_delta: number | null;
  extractor_version: number;
};

type WordLogItem = {
  word: string;
  result: string | null;
  key: string;
};

type ReviewQueueItem = WordLogItem & {
  correct: number;
  mistakes: number;
  last_seen: number;
  last_wrong: number;
  last_wrong_question: string | null;
  last_wrong_options: string[];
  last_wrong_selected_answer: string | null;
  last_wrong_correct_answer: string | null;
  due_at: number;
};

type ReviewSummary = {
  due_count: number;
  pending_count: number;
  next_due_at: number | null;
};

type HistorySummary = {
  skipped_records: number;
  duplicate_records: number;
};

type ImportSummary = {
  records_imported: number;
  records_updated: number;
  records_skipped: number;
  records_duplicates: number;
  settings_imported: boolean;
};

type ReviewAnswerResult = {
  word: string;
  result: "correct" | "incorrect";
};

type StudyDay = {
  key: string;
  label: string;
  count: number;
  wordCount: number;
  score: number;
  today: boolean;
  metTarget: boolean;
};

type StudySummary = {
  goal_type: DailyGoalType;
  today: number;
  target: number;
  remaining: number;
  progress: number;
  word_count: number;
  score: number;
  word_target: number;
  score_target: number;
  accuracy: number | null;
  streak: number;
  review: number;
  pendingReview: number;
  nextReviewAt: number | null;
  days: StudyDay[];
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
  daily_goal_type: DailyGoalType;
  daily_goal: number;
  daily_score_goal: number;
  resolved_locale: ResolvedLocale;
  locale_options: LocaleOption[];
  messages: Record<string, string>;
  current_word: string;
  google_signed_in: boolean;
  proxy_addr: string;
  proxy_blocked_hosts: string[];
  adblock: AdblockStatus;
  color_scheme: ColorScheme;
  review_queue: ReviewQueueItem[];
  review_backlog: ReviewQueueItem[];
  review_summary: ReviewSummary;
  study_summary: StudySummary;
  history_summary: HistorySummary;
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
      <button id="addStudyWord" class="icon-button" type="button" aria-label="Add study word" title="Add study word"><i data-lucide="plus"></i></button>
    </form>
    <div class="split-toolbar" aria-label="Page controls">
      <div class="toolbar-group toolbar-left" aria-label="Google Word Coach controls">
        <button id="reloadCoach" class="icon-button" type="button" aria-label="Reload Word Coach" title="Reload Word Coach"><i data-lucide="refresh-cw"></i></button>
        <button id="googleSignIn" class="icon-button" type="button" aria-label="Google sign in" title="Google sign in"><i data-lucide="log-in"></i></button>
        <button id="googleLogout" class="icon-button" type="button" aria-label="Log out of Google" title="Log out of Google" hidden><i data-lucide="log-out"></i></button>
      </div>
      <div class="toolbar-group toolbar-right" aria-label="Dictionary controls">
        <button id="dictionaryBack" class="icon-button" type="button" aria-label="Dictionary back" title="Dictionary back"><i data-lucide="chevron-left"></i></button>
        <button id="dictionaryForward" class="icon-button" type="button" aria-label="Dictionary forward" title="Dictionary forward"><i data-lucide="chevron-right"></i></button>
        <button id="dictionaryRefresh" class="icon-button" type="button" aria-label="Refresh dictionary" title="Refresh dictionary"><i data-lucide="refresh-cw"></i></button>
      </div>
    </div>
  </header>
  <section class="word-log-panel" aria-label="Word log">
    <div id="studySummary" class="study-summary" aria-label="Study summary"></div>
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
          <span id="dailyGoalTypeLabel">Goal type</span>
          <select id="dailyGoalTypeSelect" aria-label="Goal type">
            <option value="words">Words</option>
            <option value="score">Score</option>
          </select>
        </label>
        <label class="settings-field">
          <span id="dailyGoalLabel">Daily goal</span>
          <input id="dailyGoalInput" type="number" min="1" max="100" step="1" inputmode="numeric" aria-label="Daily goal" />
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

renderIcons(app);

const lookupForm = document.querySelector<HTMLFormElement>("#lookupForm")!;
const settingsButton = document.querySelector<HTMLButtonElement>("#settingsButton")!;
const settingsOverlay = document.querySelector<HTMLDivElement>("#settingsOverlay")!;
const closeSettings = document.querySelector<HTMLButtonElement>("#closeSettings")!;
const lookupInput = document.querySelector<HTMLInputElement>("#lookupInput")!;
const addStudyWord = document.querySelector<HTMLButtonElement>("#addStudyWord")!;
const providerSelect = document.querySelector<HTMLSelectElement>("#providerSelect")!;
const modeSelect = document.querySelector<HTMLSelectElement>("#modeSelect")!;
const localeSelect = document.querySelector<HTMLSelectElement>("#localeSelect")!;
const dailyGoalTypeSelect = document.querySelector<HTMLSelectElement>("#dailyGoalTypeSelect")!;
const dailyGoalInput = document.querySelector<HTMLInputElement>("#dailyGoalInput")!;
const preloadSelect = document.querySelector<HTMLSelectElement>("#preloadSelect")!;
const darkModeSelect = document.querySelector<HTMLSelectElement>("#darkModeSelect")!;
const cosmeticAdblockToggle =
  document.querySelector<HTMLInputElement>("#cosmeticAdblockToggle")!;
const reloadCoach = document.querySelector<HTMLButtonElement>("#reloadCoach")!;
const dictionaryBack = document.querySelector<HTMLButtonElement>("#dictionaryBack")!;
const dictionaryForward = document.querySelector<HTMLButtonElement>("#dictionaryForward")!;
const dictionaryRefresh = document.querySelector<HTMLButtonElement>("#dictionaryRefresh")!;
const googleSignIn = document.querySelector<HTMLButtonElement>("#googleSignIn")!;
const googleLogout = document.querySelector<HTMLButtonElement>("#googleLogout")!;
const exportData = document.querySelector<HTMLButtonElement>("#exportData")!;
const importData = document.querySelector<HTMLButtonElement>("#importData")!;
const updateFilters = document.querySelector<HTMLButtonElement>("#updateFilters")!;
const filterStatus = document.querySelector<HTMLSpanElement>("#filterStatus")!;
const studySummary = document.querySelector<HTMLDivElement>("#studySummary")!;
const historyList = document.querySelector<HTMLDivElement>("#historyList")!;
const toast = document.querySelector<HTMLDivElement>("#toast")!;

const DAILY_STUDY_TARGET = 10;

let lastHistorySignature = "";
let lastProviderSignature = "";
let lastModeSignature = "";
let lastPreloadSignature = "";
let lastDarkModeSignature = "";
let lastLocaleSignature = "";
let lastDailyGoalTypeSignature = "";
let lastCurrentWord = "";
let lastDueReviewNoticeCount = 0;
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
  google_logout: "Log out of Google",
  review_queue: "Review",
  review_now: "Practice now",
  review_upcoming: "Upcoming",
  review_later: "Later",
  review_later_count: "{count} for later",
  review_word_label: "Review {word}: {count} mistakes, last wrong {time}",
  review_upcoming_word_label: "Upcoming {word}: {count} mistakes, due {time}",
  review_due_at: "Due {time}",
  review_due_now: "Review {count} due",
  review_answer_detail: "Picked {selected}; Answer {correct}",
  review_answer_only: "Answer {correct}",
  review_mark_known: "Mark {word} reviewed",
  review_known: "Known",
  review_marked_known: "{word} reviewed",
  review_choose_answer: "Review {word}: choose {answer}",
  review_answer_correct: "{word} correct",
  review_answer_incorrect: "{word} still due",
  study_summary: "Study summary",
  study_today: "Today {count}/{target}",
  study_remaining: "{count} left",
  study_goal_done: "Goal done",
  study_accuracy: "Accuracy {count}%",
  study_streak: "Streak {count}d",
  study_review: "Review {count}",
  study_pending_review: "Pending {count}",
  study_next_review: "Next {time}",
  study_week: "Last 7 days",
  study_score_today: "Score {count}/{target}",
  study_score_remaining: "{count} pts left",
  study_score_goal_done: "Score goal done",
  daily_goal_type: "Goal type",
  daily_goal_words: "Daily word goal",
  daily_goal_score: "Daily score goal",
  goal_type_words: "Words",
  goal_type_score: "Score",
  daily_goal: "Daily goal",
  daily_goal_changed: "Daily goal changed",
  add_study_word: "Add study word",
  study_word_added: "{word} added",
  study_word_required: "Enter a word to add",
  study_word_not_added: "{word} was already recorded",
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
  search_word_required: "Enter a word to search",
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
  google_logged_out: "Logged out of Google",
  google_logout_confirm_title: "Log out of Google?",
  google_logout_confirm_message: "Clear Google account data from Word Coach?",
  google_logout_confirm_detail:
    "This removes Google cookies and site data from this app session, then reloads Word Coach.",
  filter_update_failed: "Filter update failed",
  filters_updated: "Filters updated",
  exported_path: "Exported {path}",
  export_cancelled: "Export cancelled",
  import_cancelled: "Import cancelled",
  imported_no_records: "No new records imported",
  imported_records: "Imported {count} new records",
  imported_updated_records: "Updated {count} existing records",
  imported_settings: "Imported settings",
  imported_records_and_settings: "Imported {count} new records and settings",
  import_skipped_records: "Skipped {count} incomplete records",
  import_duplicate_records: "Skipped {count} duplicate records",
  history_skipped_records: "{count} incomplete records hidden",
  history_duplicate_records: "{count} duplicate records hidden",
  history_recent_words: "Recent words",
  history_empty_title: "No words yet",
  history_empty_body: "Today starts with the first captured answer.",
  history_empty_action: "Reload Word Coach",
  prerender_confirm:
    "Prerender keeps all six dictionary pages loaded in the background. This can use much more RAM, CPU, and network. Enable it?",
  cancel: "Cancel"
};
let activeMessages: Record<string, string> = fallbackMessages;

function message(key: string, values: Record<string, string | number> = {}) {
  const template = activeMessages[key] || fallbackMessages[key] || key;
  return template.replace(/\{(\w+)\}/g, (_match, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : `{${name}}`
  );
}

function renderIcons(root: HTMLElement) {
  createIcons({
    icons: ICONS,
    root,
    attrs: ICON_ATTRS
  });
}

function importSummaryMessage(summary: ImportSummary | null) {
  if (summary === null) {
    return message("import_cancelled");
  }
  let importedMessage = message("imported_no_records");
  if (summary.settings_imported && summary.records_imported > 0) {
    importedMessage = message("imported_records_and_settings", { count: summary.records_imported });
  } else if (summary.settings_imported) {
    importedMessage = message("imported_settings");
  } else if (summary.records_imported > 0) {
    importedMessage = message("imported_records", { count: summary.records_imported });
  } else if (summary.records_updated > 0) {
    importedMessage = message("imported_updated_records", { count: summary.records_updated });
  }
  const details: string[] = [];
  if (summary.records_updated > 0 && summary.records_imported > 0) {
    details.push(message("imported_updated_records", { count: summary.records_updated }));
  }
  if (summary.records_skipped > 0) {
    details.push(message("import_skipped_records", { count: summary.records_skipped }));
  }
  if (summary.records_duplicates > 0) {
    details.push(message("import_duplicate_records", { count: summary.records_duplicates }));
  }
  return details.length > 0 ? `${importedMessage}. ${details.join(". ")}` : importedMessage;
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

function updateDailyGoalLabel(type: DailyGoalType) {
  const labelKey = type === "score" ? "daily_goal_score" : "daily_goal_words";
  setText("dailyGoalLabel", labelKey);
  dailyGoalInput.setAttribute("aria-label", message(labelKey));
}

function applyStaticTranslations() {
  document.documentElement.lang = activeResolvedLocale;
  document.title = message("app_title");
  setLabel(settingsButton, "settings");
  providerSelect.setAttribute("aria-label", message("dictionary_provider"));
  modeSelect.setAttribute("aria-label", message("dictionary_mode"));
  lookupInput.placeholder = message("search_meaning");
  setLabel(lookupForm.querySelector<HTMLButtonElement>("button[type='submit']")!, "look_up");
  setLabel(addStudyWord, "add_study_word");
  document.querySelector(".split-toolbar")?.setAttribute("aria-label", message("page_controls"));
  document.querySelector(".toolbar-left")?.setAttribute(
    "aria-label",
    message("google_word_coach_controls")
  );
  setLabel(reloadCoach, "reload_word_coach");
  setLabel(googleSignIn, "google_sign_in");
  setLabel(googleLogout, "google_logout");
  document.querySelector(".toolbar-right")?.setAttribute("aria-label", message("dictionary_controls"));
  setLabel(dictionaryBack, "dictionary_back");
  setLabel(dictionaryForward, "dictionary_forward");
  setLabel(dictionaryRefresh, "refresh_dictionary");
  document.querySelector(".word-log-panel")?.setAttribute("aria-label", message("word_log"));
  setText("settingsTitle", "settings");
  setLabel(closeSettings, "close_settings");
  setText("languageLabel", "language");
  localeSelect.setAttribute("aria-label", message("language"));
  setText("dailyGoalTypeLabel", "daily_goal_type");
  dailyGoalTypeSelect.setAttribute("aria-label", message("daily_goal_type"));
  updateDailyGoalLabel(dailyGoalTypeSelect.value === "score" ? "score" : "words");
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

function updateGoogleSessionControls(signedIn: boolean) {
  googleSignIn.hidden = signedIn;
  googleLogout.hidden = !signedIn;
}

function showToast(message: string) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2400);
}

function errorToastMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : String(error);
}

async function runUiAction(
  action: () => Promise<void>,
  options: { refreshOnError?: boolean } = {}
) {
  try {
    await action();
  } catch (error) {
    showToast(errorToastMessage(error));
    if (options.refreshOnError) {
      await refreshSnapshot().catch(() => undefined);
    }
  }
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
  const answerOptions = answerOptionsFromText(record.question || "");
  const selected = cleanQuestionWord(record.selected_answer || "");
  const correct = cleanQuestionWord(record.correct_answer || "");
  const structuralAnswer = [correct, selected].find(
    (word) => word && answerOptions.some((option) => sameWord(option, word))
  );
  return fromQuestion || structuralAnswer || (answerOptions.length === 0 ? correct || selected : "") || "";
}

function wordFromQuestion(question: string) {
  const text = quizText(question);
  const wordToken = "[A-Za-z][A-Za-z'-]*|[\\p{Script=Hangul}]+?";
  const phrase = `((?:${wordToken})(?:\\s+(?:${wordToken})){0,3})`;
  const optionalKoreanPrefix =
    "(?:(?:다음\\s*중|새로운\\s+단어(?:를|을)?\\s+배워\\s*보세요)\\s*)?";
  const koreanParticle = "(?:과\\(와\\)|와\\(과\\)|와|과|랑|하고|의|에)";
  const englishWordPrefix = "(?:the\\s+)?(?:word\\s+)?";
  const quoteOpen = "[\"'“‘「『]";
  const quoteClose = "[\"'”’」』]";
  const patterns = [
    new RegExp(`${quoteOpen}\\s*${phrase}\\s*${quoteClose}`, "iu"),
    new RegExp(`\\b(?:similar|synonym|opposite|antonym)\\b.*?\\b(?:to|of|for)\\b\\s+${quoteOpen}?${phrase}`, "iu"),
    new RegExp(
      `\\b(?:image|picture|photo)\\b.*?\\b(?:of|for|word|means|matches|represents)\\b\\s+${englishWordPrefix}${quoteOpen}?${phrase}`,
      "iu"
    ),
    new RegExp(`\\b(?:matches|represents|means)\\b\\s+${englishWordPrefix}${quoteOpen}?${phrase}`, "iu"),
    new RegExp(
      `\\bwhat\\s+does\\s+${englishWordPrefix}${quoteOpen}?${phrase}${quoteClose}?\\s+mean\\b`,
      "iu"
    ),
    new RegExp(
      `${optionalKoreanPrefix}${quoteOpen}?${phrase}${quoteClose}?\\s*${koreanParticle}?\\s*(?:뜻|의미)?\\s*(?:이|가|에)?\\s*(?:비슷한|유사한|같은|동의어)`,
      "iu"
    ),
    new RegExp(
      `${optionalKoreanPrefix}${quoteOpen}?${phrase}${quoteClose}?\\s*${koreanParticle}?\\s*(?:뜻|의미)?\\s*(?:이|가|에)?\\s*(?:반대말|반의어|반대)`,
      "iu"
    ),
    new RegExp(
      `${optionalKoreanPrefix}${quoteOpen}?${phrase}${quoteClose}?\\s*(?:의|이|가|은|는)?\\s*(?:뜻|의미)`,
      "iu"
    ),
    new RegExp(
      `${optionalKoreanPrefix}(?:단어\\s+)?${quoteOpen}?${phrase}${quoteClose}?\\s*(?:을|를|이|가|의|에)?\\s*(?:나타내는|표현하는|뜻하는|의미하는|가리키는|보여주는|어울리는).*?(?:이미지|사진|그림|단어)`,
      "iu"
    )
  ];
  for (const pattern of patterns) {
    const word = cleanQuestionWord(text.match(pattern)?.[1] || "");
    if (word) {
      return word;
    }
  }
  return standalonePromptWord(text);
}

function renderHistory(
  records: HistoryRecord[],
  studySummary: StudySummary,
  reviewItems: ReviewQueueItem[],
  reviewBacklog: ReviewQueueItem[],
  reviewSummary: ReviewSummary,
  historySummary: HistorySummary
) {
  const summary = localizedStudySummary(studySummary, reviewSummary);
  const signature = records
    .map(
      (record) =>
        `${record.id}:${record.captured_at}:${record.result || ""}:${record.question || ""}:${record.selected_answer || ""}:${record.correct_answer || ""}:${record.word_log.join(",")}`
    )
    .join("|")
    .concat(
      `:${activeResolvedLocale}:${message("review_now")}:${message("review_upcoming")}:${message("review_later")}:${message("review_later_count")}:${message("review_due_at")}:${message("review_known")}:${message("history_recent_words")}:${message("study_today")}:${message("study_remaining")}:${message("study_goal_done")}:${message("review_answer_detail")}:${message("history_empty_title")}:${message("history_empty_body")}:${message("history_empty_action")}:${localDayKey(Date.now())}`
    )
    .concat(
      `:${studySummarySignature(summary)}:${reviewSummary.due_count}:${reviewSummary.pending_count}:${reviewSummary.next_due_at || ""}:${historySummary.skipped_records}:${historySummary.duplicate_records}:${reviewItems
        .map(
          (item) =>
            `${item.key}:${item.mistakes}:${item.last_wrong}:${item.due_at}:${item.last_wrong_options.join("/")}:${item.last_wrong_selected_answer || ""}:${item.last_wrong_correct_answer || ""}`
        )
        .join(",")}:${reviewBacklog
        .map(
          (item) =>
            `${item.key}:${item.mistakes}:${item.last_wrong}:${item.due_at}:${item.last_wrong_options.join("/")}:${item.last_wrong_selected_answer || ""}:${item.last_wrong_correct_answer || ""}`
        )
        .join(",")}`
    );
  if (signature === lastHistorySignature) {
    return;
  }
  lastHistorySignature = signature;
  const reviewKeys = new Set([...reviewItems, ...reviewBacklog].map((item) => item.key));
  const recentWords = recentHistoryWords(records, 12, reviewKeys);
  renderStudySummary(summary);
  const noticeMarkup = historyNoticeMarkup(historySummary);

  if (reviewItems.length === 0 && reviewBacklog.length === 0 && recentWords.length === 0) {
    historyList.innerHTML = noticeMarkup + emptyHistoryMarkup();
    renderIcons(historyList);
    return;
  }

  const reviewMarkup =
    reviewItems.length === 0
      ? ""
      : `
        <section class="history-session review-session" aria-label="${escapeHtml(message("review_now"))}">
          <div class="history-section-label">${escapeHtml(message("review_now"))}</div>
          ${reviewItems.map(reviewItemMarkup).join("")}
        </section>
      `;
  const backlogMarkup =
    reviewBacklog.length === 0
      ? ""
      : `
        <section class="history-later" aria-label="${escapeHtml(message("review_upcoming"))}">
          <span class="history-later-label">${escapeHtml(message("review_later"))}</span>
          <span class="history-later-count">${escapeHtml(message("review_later_count", { count: reviewBacklog.length }))}</span>
        </section>
      `;
  const recentMarkup =
    recentWords.length === 0
      ? ""
      : `
        <section class="history-session recent-words" aria-label="${escapeHtml(message("history_recent_words"))}">
          <div class="history-section-label">${escapeHtml(message("history_recent_words"))}</div>
          ${recentWords
            .map(
              (item) => `
                <button class="${historyWordClass(item.result)}" type="button" data-word="${escapeHtml(item.word)}">
                  ${escapeHtml(item.word)}
                </button>
              `
            )
            .join("")}
        </section>
      `;

  historyList.innerHTML =
    noticeMarkup +
    reviewMarkup +
    backlogMarkup +
    recentMarkup;
  renderIcons(historyList);
}

function historyNoticeMarkup(historySummary: HistorySummary) {
  const notices: string[] = [];
  if (historySummary.skipped_records > 0) {
    notices.push(message("history_skipped_records", { count: historySummary.skipped_records }));
  }
  if (historySummary.duplicate_records > 0) {
    notices.push(message("history_duplicate_records", { count: historySummary.duplicate_records }));
  }
  return notices
    .map((notice) => `<div class="history-notice" role="note">${escapeHtml(notice)}</div>`)
    .join("");
}

function emptyHistoryMarkup() {
  return `
    <section class="history-empty" aria-label="${escapeHtml(message("history_empty_title"))}">
      <div class="history-empty-copy">
        <div class="history-empty-title">${escapeHtml(message("history_empty_title"))}</div>
        <div class="history-empty-body">${escapeHtml(message("history_empty_body"))}</div>
      </div>
      <button class="history-empty-action" type="button" data-empty-reload="true">
        <i data-lucide="refresh-cw"></i>
        <span>${escapeHtml(message("history_empty_action"))}</span>
      </button>
    </section>
  `;
}

function reviewItemMarkup(item: ReviewQueueItem) {
  const choices = reviewChoices(item);
  return `
    <span class="review-word-row">
      <button
        class="${historyWordClass(item.result, true)}"
        type="button"
        data-word="${escapeHtml(item.word)}"
        data-review="true"
        aria-label="${escapeHtml(reviewWordLabel(item))}"
        title="${escapeHtml(reviewWordLabel(item))}"
      >
        <span class="history-word-main">
          <span class="history-word-label">${escapeHtml(item.word)}</span>
        </span>
      </button>
      ${
        choices.length > 0
          ? `<span class="review-choice-list">
              ${choices
                .map(
                  (answer) => `
                    <button
                      class="review-choice"
                      type="button"
                      data-review-choice="true"
                      data-review-word="${escapeHtml(item.word)}"
                      data-review-answer="${escapeHtml(answer)}"
                      aria-label="${escapeHtml(message("review_choose_answer", { word: item.word, answer }))}"
                      title="${escapeHtml(message("review_choose_answer", { word: item.word, answer }))}"
                    >
                      ${escapeHtml(answer)}
                    </button>
                  `
                )
                .join("")}
            </span>`
          : ""
      }
      <button
        class="review-complete"
        type="button"
        data-review-complete="true"
        data-review-word="${escapeHtml(item.word)}"
        aria-label="${escapeHtml(message("review_mark_known", { word: item.word }))}"
        title="${escapeHtml(message("review_mark_known", { word: item.word }))}"
      >
        <i data-lucide="check"></i>
        <span class="review-complete-label">${escapeHtml(message("review_known"))}</span>
      </button>
    </span>
  `;
}

function reviewChoices(item: ReviewQueueItem) {
  const selected = item.last_wrong_selected_answer?.trim();
  const correct = item.last_wrong_correct_answer?.trim();
  if (!correct) {
    return [];
  }
  const originalChoices = (item.last_wrong_options || []).filter(Boolean);
  const originalChoiceKeys = originalChoices.map(wordKey);
  if (originalChoices.length >= 2 && originalChoiceKeys.includes(wordKey(correct))) {
    return item.key.charCodeAt(0) % 2 === 0 ? originalChoices.slice().reverse() : originalChoices;
  }
  if (!selected || wordKey(selected) === wordKey(correct) || isUnknownAnswer(selected)) {
    return [];
  }
  const choices = [selected, correct].filter(
    (answer, index, values) => values.findIndex((value) => wordKey(value) === wordKey(answer)) === index
  );
  return item.key.charCodeAt(0) % 2 === 0 ? choices.reverse() : choices;
}

function isUnknownAnswer(answer: string) {
  const text = normalizedText(answer)
    .replace(/[’]/g, "'")
    .toLowerCase();
  return /^(skip|i don't know|i dont know|don't know|dont know|not sure|건너뛰기|모르겠어요|모름)$/.test(
    text
  );
}

function setReviewRowBusy(control: HTMLElement, busy: boolean) {
  const row = control.closest<HTMLElement>(".review-word-row");
  const buttons = row
    ? Array.from(row.querySelectorAll<HTMLButtonElement>("button"))
    : control instanceof HTMLButtonElement
      ? [control]
      : [];
  buttons.forEach((button) => {
    button.disabled = busy;
  });
}

function localizedStudySummary(summary: StudySummary, reviewSummary: ReviewSummary): StudySummary {
  const goalType = summary.goal_type === "score" ? "score" : "words";
  const target =
    goalType === "score" ? normalizedDailyScoreGoal(summary.target) : normalizedDailyGoal(summary.target);
  const today = Math.max(0, Number(summary.today) || 0);
  return {
    ...summary,
    goal_type: goalType,
    today,
    target,
    remaining: Math.max(0, target - today),
    progress: Math.max(0, Math.min(100, Number(summary.progress) || 0)),
    word_count: Math.max(0, Number(summary.word_count) || 0),
    score: Math.max(0, Number(summary.score) || 0),
    word_target: normalizedDailyGoal(summary.word_target),
    score_target: normalizedDailyScoreGoal(summary.score_target),
    accuracy:
      typeof summary.accuracy === "number" && Number.isFinite(summary.accuracy)
        ? Math.max(0, Math.min(100, Math.round(summary.accuracy)))
        : null,
    streak: Math.max(0, Math.round(Number(summary.streak) || 0)),
    review: Math.max(0, Number(reviewSummary.due_count) || 0),
    pendingReview: Math.max(0, Number(reviewSummary.pending_count) || 0),
    nextReviewAt: reviewSummary.next_due_at,
    days: (Array.isArray(summary.days) ? summary.days : []).map((day) => {
      const count = Math.max(0, Number(day.count) || 0);
      return {
        ...day,
        label: formatStudyDayLabel(day.key),
        count,
        wordCount: Math.max(0, Number(day.wordCount) || 0),
        score: Math.max(0, Number(day.score) || 0),
        today: Boolean(day.today),
        metTarget: count >= target
      };
    })
  };
}

function studySummarySignature(summary: StudySummary) {
  return [
    summary.goal_type,
    summary.today,
    summary.target,
    summary.remaining,
    summary.progress,
    summary.word_count,
    summary.score,
    summary.word_target,
    summary.score_target,
    summary.accuracy ?? "",
    summary.streak,
    summary.review,
    summary.pendingReview,
    summary.nextReviewAt ?? "",
    ...summary.days.map(
      (day) =>
        `${day.key}:${day.count}:${day.wordCount}:${day.score}:${day.today ? "1" : "0"}:${day.metTarget ? "1" : "0"}:${day.label}`
    )
  ].join("|");
}

function formatStudyDayLabel(key: string) {
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return key;
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Intl.DateTimeFormat(activeResolvedLocale === "ko" ? "ko-KR" : "en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(date);
}

function renderStudySummary(summary: StudySummary) {
  const scoreGoal = summary.goal_type === "score";
  const remainingText =
    summary.remaining > 0
      ? message(scoreGoal ? "study_score_remaining" : "study_remaining", { count: summary.remaining })
      : message(scoreGoal ? "study_score_goal_done" : "study_goal_done");
  const todayText = scoreGoal
    ? message("study_score_today", { count: summary.today, target: summary.target })
    : message("study_today", { count: summary.today, target: summary.target });
  const reviewText =
    summary.review > 0
      ? message("study_review", { count: summary.review })
      : summary.nextReviewAt
        ? message("study_next_review", { time: formatTime(summary.nextReviewAt) })
        : message("study_review", { count: 0 });
  studySummary.setAttribute("aria-label", message("study_summary"));
  studySummary.innerHTML = `
    <div class="study-main">
      <strong class="study-total">${escapeHtml(todayText)}</strong>
      <span
        class="study-progress"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow="${summary.progress}"
        data-progress="${summary.progress}"
      >
        <span class="study-progress-fill" style="width: ${summary.progress}%"></span>
      </span>
    </div>
    <div class="study-secondary">
      <span class="study-pill">${escapeHtml(remainingText)}</span>
      ${summary.review > 0 ? `<span class="study-pill">${escapeHtml(reviewText)}</span>` : ""}
      ${summary.streak > 0 ? `<span class="study-pill">${escapeHtml(message("study_streak", { count: summary.streak }))}</span>` : ""}
    </div>
  `;
}

function reviewWordLabel(item: ReviewQueueItem) {
  const detail = reviewChoices(item).length === 0 ? reviewDetailText(item) : "";
  const label = message("review_word_label", {
    word: item.word,
    count: item.mistakes,
    time: formatTime(item.last_wrong)
  });
  return detail ? `${label}. ${detail}` : label;
}

function reviewDetailText(item: ReviewQueueItem) {
  const selected = item.last_wrong_selected_answer?.trim();
  const correct = item.last_wrong_correct_answer?.trim();
  if (selected && correct && wordKey(selected) !== wordKey(correct)) {
    return message("review_answer_detail", { selected, correct });
  }
  if (correct) {
    return message("review_answer_only", { correct });
  }
  return "";
}

function maybeShowReviewDueNotice(summary: ReviewSummary) {
  const dueCount = Math.max(0, Number(summary.due_count) || 0);
  if (dueCount === 0) {
    lastDueReviewNoticeCount = 0;
    return;
  }
  if (dueCount > lastDueReviewNoticeCount) {
    showToast(message("review_due_now", { count: dueCount }));
  }
  lastDueReviewNoticeCount = dueCount;
}

function updateDocumentTitle(summary: ReviewSummary) {
  const dueCount = Math.max(0, Number(summary.due_count) || 0);
  const appTitle = message("app_title");
  document.title = dueCount > 0 ? `${message("review_due_now", { count: dueCount })} - ${appTitle}` : appTitle;
}

function normalizedDailyGoal(goal: number) {
  return Number.isFinite(goal) && goal >= 1 && goal <= 100 ? Math.round(goal) : DAILY_STUDY_TARGET;
}

function normalizedDailyScoreGoal(goal: number) {
  return Number.isFinite(goal) && goal >= 1 && goal <= 100_000 ? Math.round(goal) : 1200;
}

function localDayKey(epochMs: number) {
  const date = new Date(epochMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function recentHistoryWords(records: HistoryRecord[], limit: number, excludeKeys = new Set<string>()) {
  const seen = new Set<string>();
  const words: WordLogItem[] = [];
  for (const record of records) {
    const result = normalizeHistoryResult(record.result);
    for (const word of recordDisplayWords(record)) {
      const key = wordKey(word);
      if (!key || seen.has(key) || excludeKeys.has(key)) {
        continue;
      }
      seen.add(key);
      words.push({ word, result, key });
      if (words.length >= limit) {
        return words;
      }
    }
  }
  return words;
}

function recordDisplayWords(record: HistoryRecord) {
  const displayWord = wordFromRecord(record);
  return (displayWord ? [displayWord] : record.word_log)
    .map(cleanDisplayWord)
    .filter(Boolean);
}

function wordKey(word: string) {
  return cleanDisplayWord(word).toLowerCase();
}

function cleanDisplayWord(word: string) {
  return word.replace(/\s+/g, " ").trim();
}

function quizText(text: string) {
  const normalized = normalizedText(text);
  const delimiter = normalized.match(/\bQuestion\s+\d+\s+of\s+\d+\b/i);
  return (delimiter ? normalized.slice(0, delimiter.index) : normalized).trim();
}

function quizPromptText(text: string) {
  return quizText(text)
    .replace(/^\s*(?:word\s+coach|단어\s+과외)\s*/i, "")
    .replace(/^\s*(?:score|점수)\s*[•:：-]?\s*[\d,]+(?:\s+[\d,]+)?\s*/i, "")
    .trim();
}

function standalonePromptWord(text: string) {
  const match = quizPromptText(text).match(
    /^[\s"'“”‘’「」『』.,!?;:()-]*([A-Za-z][A-Za-z'-]*|[\p{Script=Hangul}]+)[\s"'“”‘’「」『』.,!?;:()-]*$/u
  );
  return cleanQuestionWord(match?.[1] || "");
}

function normalizedText(text: string) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function answerOptionsFromText(text: string) {
  const wordToken = "[A-Za-z][A-Za-z'-]*|[\\p{Script=Hangul}]+";
  const phrase = `((?:${wordToken})(?:\\s+(?:${wordToken})){0,3})`;
  const match = quizText(text).match(new RegExp(`\\?\\s*${phrase}\\s+(?:or|또는)\\s+${phrase}\\s*$`, "iu"));
  return [cleanChoice(match?.[1]), cleanChoice(match?.[2])].filter(Boolean) as string[];
}

function cleanChoice(value: string | undefined) {
  const words =
    normalizedText(value || "")
      .replace(/[“”]/g, '"')
      .replace(/^["']+|["'.,!?;:]+$/g, "")
      .match(/[A-Za-z][A-Za-z'-]*|[\p{Script=Hangul}]+/gu) || [];
  if (words.length < 1 || words.length > 4) {
    return "";
  }
  return words.join(" ");
}

function sameWord(left: string, right: string) {
  const leftWord = cleanQuestionWord(left).toLowerCase();
  const rightWord = cleanQuestionWord(right).toLowerCase();
  return Boolean(leftWord && rightWord && leftWord === rightWord);
}

function cleanQuestionWord(word: string) {
  const cleaned = cleanDisplayWord(word)
    .replace(/[“”]/g, '"')
    .replace(/^["']+|["'.,!?;:]+$/g, "")
    .trim();
  if (
    !cleaned ||
    /\b(which|what|choose|select|similar|synonym|opposite|antonym|image|picture|photo|matches|represents|means)\b/i.test(
      cleaned
    ) ||
    /(다음|무엇|어느|선택|고르|비슷|유사|동의어|반대|반의어|이미지|사진|그림|뜻|의미|나타내|표현|일치|어울리|가리키|단어|정답)/.test(
      cleaned
    )
  ) {
    return "";
  }
  const words = cleaned.match(/[A-Za-z][A-Za-z'-]*|[\p{Script=Hangul}]+/gu) || [];
  if (words.length < 1 || words.length > 4) {
    return "";
  }
  const phrase = words.join(" ").replace(/^'+|'+$/g, "").toLowerCase();
  if (/^(google word coach|word coach|coach|score|next|share|search|learn more)$/.test(phrase)) {
    return "";
  }
  if (/^(this word|the word|word)$/.test(phrase)) {
    return "";
  }
  return phrase;
}

function normalizeHistoryResult(result: string | null) {
  const normalized = String(result || "").toLowerCase();
  if (normalized === "correct" || normalized === "incorrect") {
    return normalized;
  }
  return null;
}

function historyWordClass(result: string | null, review = false) {
  const state = normalizeHistoryResult(result);
  return `history-word${review ? " is-review" : ""}${state ? ` is-${state}` : ""}`;
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

function renderDailyGoalTypeOptions() {
  const options: Array<{ id: DailyGoalType; label: string }> = [
    { id: "words", label: message("goal_type_words") },
    { id: "score", label: message("goal_type_score") }
  ];
  const signature = options.map((option) => `${option.id}:${option.label}`).join("|");
  if (signature === lastDailyGoalTypeSignature) {
    return;
  }
  lastDailyGoalTypeSignature = signature;
  dailyGoalTypeSelect.innerHTML = options
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
  renderDailyGoalTypeOptions();
  providerSelect.value = snapshot.provider;
  modeSelect.value = snapshot.dictionary_mode;
  preloadSelect.value = snapshot.preload_eagerness;
  darkModeSelect.value = snapshot.dark_mode;
  cosmeticAdblockToggle.checked = snapshot.cosmetic_adblock;
  localeSelect.value = snapshot.locale_choice;
  dailyGoalTypeSelect.value = snapshot.daily_goal_type;
  dailyGoalInput.value = String(
    snapshot.daily_goal_type === "score" ? snapshot.daily_score_goal : snapshot.daily_goal
  );
  dailyGoalInput.max = snapshot.daily_goal_type === "score" ? "100000" : "100";
  dailyGoalInput.step = snapshot.daily_goal_type === "score" ? "10" : "1";
  updateDailyGoalLabel(snapshot.daily_goal_type);
  activePreloadEagerness = snapshot.preload_eagerness;
  if (snapshot.current_word !== lastCurrentWord || (!lookupInput.value && snapshot.current_word)) {
    lookupInput.value = snapshot.current_word;
  }
  lastCurrentWord = snapshot.current_word;
  updateGoogleSessionControls(snapshot.google_signed_in);
  filterStatus.textContent = formatAdblockStatus(snapshot.adblock);
  updateFilters.disabled = snapshot.adblock.updating;
  renderHistory(
    snapshot.history,
    snapshot.study_summary,
    snapshot.review_queue,
    snapshot.review_backlog || [],
    snapshot.review_summary,
    snapshot.history_summary
  );
  updateDocumentTitle(snapshot.review_summary);
  maybeShowReviewDueNotice(snapshot.review_summary);
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
    showToast(message("search_word_required"));
    return;
  }
  try {
    await window.wordCoach.searchDictionary(word);
    showToast(message("searching_word", { word }));
  } catch (error) {
    showToast(errorToastMessage(error));
  }
});

addStudyWord.addEventListener("click", async () => {
  const word = lookupInput.value.trim();
  if (!word) {
    showToast(message("study_word_required"));
    return;
  }
  try {
    const added = await window.wordCoach.addStudyWord(word);
    if (added) {
      showToast(message("study_word_added", { word }));
      await refreshSnapshot();
      return;
    }
    showToast(message("study_word_not_added", { word }));
  } catch (error) {
    showToast(errorToastMessage(error));
  }
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

providerSelect.addEventListener("change", () => {
  void runUiAction(
    async () => {
      await window.wordCoach.setDictionaryProvider(providerSelect.value as Provider);
      showToast(message("dictionary_changed"));
      await refreshSnapshot();
    },
    { refreshOnError: true }
  );
});

modeSelect.addEventListener("change", () => {
  void runUiAction(
    async () => {
      await window.wordCoach.setDictionaryMode(modeSelect.value as DictionaryMode);
      showToast(message("dictionary_mode_changed"));
      await refreshSnapshot();
    },
    { refreshOnError: true }
  );
});

localeSelect.addEventListener("change", () => {
  void runUiAction(
    async () => {
      await window.wordCoach.setLocaleChoice(localeSelect.value as LocaleChoice);
      await refreshSnapshot();
      showToast(message("language_changed"));
    },
    { refreshOnError: true }
  );
});

dailyGoalTypeSelect.addEventListener("change", () => {
  void runUiAction(
    async () => {
      const nextType = dailyGoalTypeSelect.value as DailyGoalType;
      await window.wordCoach.setDailyGoalType(nextType);
      showToast(message("daily_goal_changed"));
      await refreshSnapshot();
    },
    { refreshOnError: true }
  );
});

dailyGoalInput.addEventListener("change", () => {
  void runUiAction(
    async () => {
      if (dailyGoalTypeSelect.value === "score") {
        await window.wordCoach.setDailyScoreGoal(Number(dailyGoalInput.value));
      } else {
        await window.wordCoach.setDailyGoal(Number(dailyGoalInput.value));
      }
      showToast(message("daily_goal_changed"));
      await refreshSnapshot();
    },
    { refreshOnError: true }
  );
});

preloadSelect.addEventListener("change", () => {
  void runUiAction(
    async () => {
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
    },
    { refreshOnError: true }
  );
});

darkModeSelect.addEventListener("change", () => {
  void runUiAction(
    async () => {
      await window.wordCoach.setDarkMode(darkModeSelect.value as DarkMode);
      showToast(message("dark_mode_changed"));
      await refreshSnapshot();
    },
    { refreshOnError: true }
  );
});

cosmeticAdblockToggle.addEventListener("change", () => {
  void runUiAction(
    async () => {
      await window.wordCoach.setCosmeticAdblock(cosmeticAdblockToggle.checked);
      showToast(message("cosmetic_adblock_changed"));
      await refreshSnapshot();
    },
    { refreshOnError: true }
  );
});

reloadCoach.addEventListener("click", () => {
  void runUiAction(reloadWordCoach);
});

dictionaryBack.addEventListener("click", () => {
  void runUiAction(async () => {
    await window.wordCoach.dictionaryBack();
  });
});

dictionaryForward.addEventListener("click", () => {
  void runUiAction(async () => {
    await window.wordCoach.dictionaryForward();
  });
});

dictionaryRefresh.addEventListener("click", () => {
  void runUiAction(async () => {
    await window.wordCoach.reloadDictionary();
    showToast(message("dictionary_reloaded"));
  });
});

googleSignIn.addEventListener("click", () => {
  void runUiAction(async () => {
    await window.wordCoach.openGoogleSignIn();
    showToast(message("opening_google_sign_in"));
  });
});

googleLogout.addEventListener("click", () => {
  void runUiAction(async () => {
    if (await window.wordCoach.logoutGoogle()) {
      showToast(message("google_logged_out"));
    }
  });
});

updateFilters.addEventListener("click", async () => {
  updateFilters.disabled = true;
  filterStatus.textContent = message("updating_filters");
  try {
    const status = await window.wordCoach.updateAdblockFilters();
    filterStatus.textContent = formatAdblockStatus(status);
    showToast(status.error ? message("filter_update_failed") : message("filters_updated"));
  } catch (error) {
    showToast(errorToastMessage(error));
  } finally {
    await refreshSnapshot().catch(() => undefined);
    updateFilters.disabled = false;
  }
});

async function reloadWordCoach() {
  await window.wordCoach.reloadCoach();
  showToast(message("word_coach_reloaded"));
}

exportData.addEventListener("click", async () => {
  try {
    const path = await window.wordCoach.exportHistory();
    showToast(path ? message("exported_path", { path }) : message("export_cancelled"));
  } catch (error) {
    showToast(errorToastMessage(error));
  }
});

importData.addEventListener("click", async () => {
  try {
    const summary = await window.wordCoach.importHistory();
    showToast(importSummaryMessage(summary));
    if (summary !== null) {
      await refreshSnapshot();
    }
  } catch (error) {
    showToast(errorToastMessage(error));
  }
});

historyList.addEventListener("click", async (event) => {
  const emptyReload = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-empty-reload]");
  if (emptyReload) {
    emptyReload.disabled = true;
    try {
      await reloadWordCoach();
    } catch (error) {
      showToast(errorToastMessage(error));
    } finally {
      emptyReload.disabled = false;
    }
    return;
  }
  const choice = (event.target as HTMLElement).closest<HTMLButtonElement>(".review-choice");
  const choiceWord = choice?.dataset.reviewWord?.trim();
  const choiceAnswer = choice?.dataset.reviewAnswer?.trim();
  if (choice && choiceWord && choiceAnswer) {
    setReviewRowBusy(choice, true);
    try {
      const answered = await window.wordCoach.answerReview(choiceWord, choiceAnswer);
      if (answered) {
        showToast(
          message(
            answered.result === "correct" ? "review_answer_correct" : "review_answer_incorrect",
            { word: answered.word }
          )
        );
      }
      await refreshSnapshot();
    } catch (error) {
      showToast(errorToastMessage(error));
    } finally {
      setReviewRowBusy(choice, false);
    }
    return;
  }
  const complete = (event.target as HTMLElement).closest<HTMLButtonElement>(".review-complete");
  const reviewWord = complete?.dataset.reviewWord?.trim();
  if (complete && reviewWord) {
    setReviewRowBusy(complete, true);
    try {
      const marked = await window.wordCoach.markReviewKnown(reviewWord);
      if (marked) {
        showToast(message("review_marked_known", { word: reviewWord }));
      }
      await refreshSnapshot();
    } catch (error) {
      showToast(errorToastMessage(error));
    } finally {
      setReviewRowBusy(complete, false);
    }
    return;
  }
  const target = (event.target as HTMLElement).closest<HTMLElement>(".history-word");
  const word = target?.dataset.word?.trim();
  if (!word) {
    return;
  }
  lookupInput.value = word;
  try {
    await window.wordCoach.searchDictionary(word);
  } catch (error) {
    showToast(errorToastMessage(error));
  }
});

window.wordCoach.onAppSnapshot(applySnapshot);
refreshSnapshot().catch((error) => showToast(String(error)));
window.setInterval(() => {
  refreshSnapshot().catch(() => undefined);
}, 2000);
