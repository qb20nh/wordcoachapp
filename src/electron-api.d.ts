export {};

type Provider = "dictionary" | "merriam" | "naver";
type DictionaryMode = "dictionary" | "thesaurus";
type PreloadEagerness = "off" | "dns" | "preconnect" | "pages" | "prerender";
type ColorScheme = "light" | "dark";

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

type AppSnapshot = {
  provider: Provider;
  dictionary_providers: DictionaryProviderOption[];
  dictionary_mode: DictionaryMode;
  dictionary_modes: DictionaryModeOption[];
  preload_eagerness: PreloadEagerness;
  preload_eagerness_options: PreloadEagernessOption[];
  current_word: string;
  proxy_addr: string;
  proxy_blocked_hosts: string[];
  adblock: AdblockStatus;
  color_scheme: ColorScheme;
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
      setUiOverlayOpen: (open: boolean) => Promise<void>;
      openGoogleSignIn: () => Promise<void>;
      reloadCoach: () => Promise<void>;
      reloadDictionary: () => Promise<void>;
      dictionaryBack: () => Promise<void>;
      dictionaryForward: () => Promise<void>;
      updateAdblockFilters: () => Promise<AdblockStatus>;
      exportHistory: () => Promise<string | null>;
      importHistory: () => Promise<number | null>;
    };
  }
}
