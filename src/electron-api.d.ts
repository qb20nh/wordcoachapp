export {};

type Provider = "dictionary" | "merriam" | "naver";
type DictionaryMode = "dictionary" | "thesaurus";
type PreloadEagerness = "off" | "dns" | "preconnect" | "pages" | "prerender";
type DarkMode = "system" | "dark" | "off";
type ColorScheme = "light" | "dark";
type LocaleChoice = "system" | "en" | "ko";
type ResolvedLocale = "en" | "ko";
type DailyGoalType = "words" | "score";

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

type ReviewQueueItem = {
  word: string;
  key: string;
  result: string | null;
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

declare global {
  interface Window {
    wordCoach: {
      getAppSnapshot: () => Promise<AppSnapshot>;
      onAppSnapshot: (callback: (snapshot: AppSnapshot) => void) => () => void;
      searchDictionary: (word: string) => Promise<void>;
      setDictionaryProvider: (provider: Provider) => Promise<void>;
      setDictionaryMode: (mode: DictionaryMode) => Promise<void>;
      setPreloadEagerness: (eagerness: PreloadEagerness) => Promise<void>;
      setDarkMode: (mode: DarkMode) => Promise<void>;
      setCosmeticAdblock: (enabled: boolean) => Promise<void>;
      setLocaleChoice: (choice: LocaleChoice) => Promise<void>;
      setDailyGoalType: (type: DailyGoalType) => Promise<void>;
      setDailyGoal: (goal: number) => Promise<void>;
      setDailyScoreGoal: (goal: number) => Promise<void>;
      addStudyWord: (word: string) => Promise<boolean>;
      markReviewKnown: (word: string) => Promise<boolean>;
      answerReview: (word: string, answer: string) => Promise<ReviewAnswerResult | null>;
      setUiOverlayOpen: (open: boolean) => Promise<void>;
      openGoogleSignIn: () => Promise<void>;
      reloadCoach: () => Promise<void>;
      reloadDictionary: () => Promise<void>;
      dictionaryBack: () => Promise<void>;
      dictionaryForward: () => Promise<void>;
      updateAdblockFilters: () => Promise<AdblockStatus>;
      exportHistory: () => Promise<string | null>;
      importHistory: () => Promise<ImportSummary | null>;
    };
  }
}
