const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("wordCoach", {
  getAppSnapshot: () => ipcRenderer.invoke("wordcoach:get-app-snapshot"),
  onAppSnapshot: (callback) => {
    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on("wordcoach:snapshot", listener);
    return () => ipcRenderer.removeListener("wordcoach:snapshot", listener);
  },
  searchDictionary: (word) => ipcRenderer.invoke("wordcoach:search-dictionary", word),
  setDictionaryProvider: (provider) =>
    ipcRenderer.invoke("wordcoach:set-dictionary-provider", provider),
  setDictionaryMode: (mode) => ipcRenderer.invoke("wordcoach:set-dictionary-mode", mode),
  setPreloadEagerness: (eagerness) =>
    ipcRenderer.invoke("wordcoach:set-preload-eagerness", eagerness),
  setDarkMode: (mode) => ipcRenderer.invoke("wordcoach:set-dark-mode", mode),
  setCosmeticAdblock: (enabled) => ipcRenderer.invoke("wordcoach:set-cosmetic-adblock", enabled),
  setLocaleChoice: (choice) => ipcRenderer.invoke("wordcoach:set-locale-choice", choice),
  setDailyGoalType: (type) => ipcRenderer.invoke("wordcoach:set-daily-goal-type", type),
  setDailyGoal: (goal) => ipcRenderer.invoke("wordcoach:set-daily-goal", goal),
  setDailyScoreGoal: (goal) => ipcRenderer.invoke("wordcoach:set-daily-score-goal", goal),
  addStudyWord: (word) => ipcRenderer.invoke("wordcoach:add-study-word", word),
  markReviewKnown: (word) => ipcRenderer.invoke("wordcoach:mark-review-known", word),
  answerReview: (word, answer) => ipcRenderer.invoke("wordcoach:answer-review", word, answer),
  setUiOverlayOpen: (open) => ipcRenderer.invoke("wordcoach:set-ui-overlay-open", open),
  openGoogleSignIn: () => ipcRenderer.invoke("wordcoach:open-google-sign-in"),
  logoutGoogle: () => ipcRenderer.invoke("wordcoach:logout-google"),
  reloadCoach: () => ipcRenderer.invoke("wordcoach:reload-coach"),
  reloadDictionary: () => ipcRenderer.invoke("wordcoach:reload-dictionary"),
  dictionaryBack: () => ipcRenderer.invoke("wordcoach:dictionary-back"),
  dictionaryForward: () => ipcRenderer.invoke("wordcoach:dictionary-forward"),
  updateAdblockFilters: () => ipcRenderer.invoke("wordcoach:update-adblock-filters"),
  exportHistory: () => ipcRenderer.invoke("wordcoach:export-history"),
  importHistory: () => ipcRenderer.invoke("wordcoach:import-history")
});
