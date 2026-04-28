export const DEFAULT_LOCALE_CHOICE = "system";
export const SUPPORTED_LOCALES = ["en", "ko"];

const MESSAGE_CATALOG = {
  en: {
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
      "Prerender keeps all six dictionary pages loaded in the background. This can use much more RAM, CPU, and network. Enable it?",
    provider_dictionary: "Dictionary.com",
    provider_merriam: "Merriam-Webster",
    provider_naver: "Naver Dictionary",
    mode_dictionary: "Dictionary",
    mode_thesaurus: "Thesaurus",
    preload_off: "Off",
    preload_dns: "DNS",
    preload_preconnect: "TLS/TCP",
    preload_pages: "HTTP",
    preload_prerender: "Prerender",
    dark_mode_system: "System",
    dark_mode_dark: "Dark",
    dark_mode_off: "Off",
    locale_system: "System",
    locale_en: "English",
    locale_ko: "Korean",
    export_history_title: "Export Word Coach history",
    import_history_title: "Import Word Coach history",
    word_coach_export: "Word Coach export",
    adblock_unavailable: "Adblock unavailable",
    navigation_blocked_title: "Navigation blocked",
    navigation_blocked_message: "This link is outside the allowed in-app pages.",
    ok: "OK",
    open_in_browser: "Open in Browser"
  },
  ko: {
    app_title: "Word Coach",
    settings: "설정",
    close_settings: "설정 닫기",
    dictionary_provider: "사전 제공자",
    dictionary_mode: "사전 모드",
    search_meaning: "뜻 검색",
    look_up: "검색",
    page_controls: "페이지 컨트롤",
    google_word_coach_controls: "Google Word Coach 컨트롤",
    reload_word_coach: "Word Coach 새로고침",
    google_sign_in: "Google 로그인",
    dictionary_controls: "사전 컨트롤",
    dictionary_back: "사전 뒤로",
    dictionary_forward: "사전 앞으로",
    refresh_dictionary: "사전 새로고침",
    word_log: "단어 기록",
    language: "언어",
    preload: "프리로드",
    preload_eagerness: "프리로드 수준",
    dark_mode: "다크 모드",
    cosmetic_adblock: "화면 광고 차단",
    export: "내보내기",
    import: "가져오기",
    update_filters: "필터 업데이트",
    filters_not_loaded: "필터가 로드되지 않음",
    updating_filters: "필터 업데이트 중",
    filter_error: "필터 오류: {error}",
    filters_updated_at: "{time} 업데이트됨 ({count}개 목록)",
    filters_loaded: "{count}개 목록 로드됨",
    filters_not_loaded_count: "{count}개 목록이 로드되지 않음",
    searching_word: "{word} 검색 중",
    dictionary_changed: "사전이 변경됨",
    dictionary_mode_changed: "사전 모드가 변경됨",
    language_changed: "언어가 변경됨",
    preload_changed: "프리로드 설정이 변경됨",
    dark_mode_changed: "다크 모드가 변경됨",
    cosmetic_adblock_changed: "화면 광고 차단이 변경됨",
    word_coach_reloaded: "Word Coach 새로고침됨",
    dictionary_reloaded: "사전 새로고침됨",
    opening_google_sign_in: "Google 로그인 여는 중",
    filter_update_failed: "필터 업데이트 실패",
    filters_updated: "필터 업데이트됨",
    exported_path: "{path} 내보냄",
    export_cancelled: "내보내기 취소됨",
    import_cancelled: "가져오기 취소됨",
    imported_records: "새 기록 {count}개 가져옴",
    prerender_confirm:
      "프리렌더는 여섯 개 사전 페이지를 모두 백그라운드에 유지합니다. RAM, CPU, 네트워크를 더 많이 사용할 수 있습니다. 켜시겠습니까?",
    provider_dictionary: "Dictionary.com",
    provider_merriam: "Merriam-Webster",
    provider_naver: "네이버 사전",
    mode_dictionary: "사전",
    mode_thesaurus: "동의어 사전",
    preload_off: "끔",
    preload_dns: "DNS",
    preload_preconnect: "TLS/TCP",
    preload_pages: "HTTP",
    preload_prerender: "프리렌더",
    dark_mode_system: "시스템",
    dark_mode_dark: "다크",
    dark_mode_off: "끔",
    locale_system: "시스템",
    locale_en: "영어",
    locale_ko: "한국어",
    export_history_title: "Word Coach 기록 내보내기",
    import_history_title: "Word Coach 기록 가져오기",
    word_coach_export: "Word Coach 내보내기",
    adblock_unavailable: "광고 차단 사용 불가",
    navigation_blocked_title: "탐색 차단됨",
    navigation_blocked_message: "이 링크는 허용된 앱 내 페이지 밖입니다.",
    ok: "확인",
    open_in_browser: "브라우저에서 열기"
  }
};

export function normalizeLocaleChoice(choice) {
  const id = String(choice || "").toLowerCase();
  if (id === "system" || SUPPORTED_LOCALES.includes(id)) {
    return id;
  }
  return DEFAULT_LOCALE_CHOICE;
}

export function resolveLocale(choice, systemLocale) {
  const normalized = normalizeLocaleChoice(choice);
  if (SUPPORTED_LOCALES.includes(normalized)) {
    return normalized;
  }
  return String(systemLocale || "").toLowerCase().startsWith("ko") ? "ko" : "en";
}

export function messagesFor(locale) {
  const resolved = SUPPORTED_LOCALES.includes(locale) ? locale : "en";
  return { ...MESSAGE_CATALOG.en, ...MESSAGE_CATALOG[resolved] };
}

export function labelFor(locale, key) {
  return messagesFor(locale)[key] || messagesFor("en")[key] || key;
}

export function localeOptionsFor(locale) {
  return [
    { id: "system", label: labelFor(locale, "locale_system") },
    { id: "en", label: labelFor(locale, "locale_en") },
    { id: "ko", label: labelFor(locale, "locale_ko") }
  ];
}

export function acceptLanguageFor(locale) {
  return locale === "ko" ? "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7" : "en-US,en;q=0.9";
}
