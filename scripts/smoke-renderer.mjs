import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"]
]);

const now = Date.now();
const day = 24 * 60 * 60 * 1000;

function dayKey(epochMs) {
  const date = new Date(epochMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayOfMonth}`;
}

const mockSnapshot = {
  provider: "dictionary",
  dictionary_providers: [{ id: "dictionary", label: "Dictionary.com" }],
  dictionary_mode: "dictionary",
  dictionary_modes: [{ id: "dictionary", label: "Dictionary" }],
  preload_eagerness: "preconnect",
  preload_eagerness_options: [{ id: "preconnect", label: "Preconnect" }],
  dark_mode: "off",
  dark_mode_options: [{ id: "off", label: "Off" }],
  cosmetic_adblock: true,
  locale_choice: "en",
  daily_goal_type: "words",
  daily_goal: 10,
  daily_score_goal: 1200,
  resolved_locale: "en",
  locale_options: [{ id: "en", label: "English" }],
  messages: {},
  current_word: "",
  google_signed_in: false,
  proxy_addr: "127.0.0.1:0",
  proxy_blocked_hosts: [],
  adblock: {
    ready: true,
    updating: false,
    updated_at: now,
    list_count: 1,
    error: null
  },
  color_scheme: "light",
  review_queue: [
    {
      word: "abundant",
      key: "abundant",
      result: "incorrect",
      correct: 0,
      mistakes: 2,
      last_seen: now - day,
      last_wrong: now - day,
      last_wrong_question: 'Which word is most similar to "Abundant"? plenty or scarce',
      last_wrong_options: ["plenty", "scarce"],
      last_wrong_selected_answer: "I don't know",
      last_wrong_correct_answer: "plenty",
      due_at: now - day
    }
  ],
  review_backlog: [
    {
      word: "careful",
      key: "careful",
      result: "correct",
      correct: 1,
      mistakes: 1,
      last_seen: now,
      last_wrong: now - day,
      last_wrong_question: "Which word is most similar to careful? attentive or careless",
      last_wrong_options: ["attentive", "careless"],
      last_wrong_selected_answer: "careless",
      last_wrong_correct_answer: "attentive",
      due_at: now + day
    }
  ],
  review_summary: {
    due_count: 1,
    pending_count: 2,
    next_due_at: now + day
  },
  study_summary: {
    goal_type: "words",
    today: 3,
    target: 10,
    remaining: 7,
    progress: 30,
    word_count: 3,
    score: 240,
    word_target: 10,
    score_target: 1200,
    accuracy: 67,
    streak: 2,
    review: 1,
    pendingReview: 2,
    nextReviewAt: now + day,
    days: Array.from({ length: 7 }, (_value, index) => {
      const key = dayKey(now - day * (6 - index));
      const count = index === 5 ? 1 : index === 6 ? 3 : 0;
      return {
        key,
        label: key,
        count,
        wordCount: count,
        score: index === 6 ? 240 : 0,
        today: index === 6,
        metTarget: false
      };
    })
  },
  history_summary: {
    skipped_records: 2,
    duplicate_records: 3
  },
  history: [
    {
      ...record("1", now, "abundant", "incorrect"),
      question: 'Which word is most similar to "Abundant"? plenty or scarce',
      options: ["plenty", "scarce"],
      word_log: ["abundant", "plenty", "scarce"],
      selected_answer: "scarce",
      correct_answer: "plenty"
    },
    {
      ...record("picture", now - 100, "reticent", "incorrect"),
      question: "WORD COACH Score 0 Which image best represents the word Reticent? Question 1 of 5",
      options: ["Forest", "Conversation"],
      word_log: ["reticent"],
      selected_answer: "Forest",
      correct_answer: "Conversation"
    },
    record("2", now, "scarce", "correct"),
    record("3", now, "careful", "correct"),
    record("4", now - day, "steady", "correct")
  ]
};

const nextReviewSnapshot = {
  ...mockSnapshot,
  review_queue: [],
  review_summary: {
    due_count: 0,
    pending_count: 1,
    next_due_at: now + day
  }
};

const emptySnapshot = {
  ...mockSnapshot,
  review_queue: [],
  review_backlog: [],
  review_summary: {
    due_count: 0,
    pending_count: 0,
    next_due_at: null
  },
  study_summary: {
    ...mockSnapshot.study_summary,
    today: 0,
    remaining: 10,
    progress: 0,
    accuracy: null,
    streak: 0,
    review: 0,
    pendingReview: 0,
    nextReviewAt: null,
    days: mockSnapshot.study_summary.days.map((day) => ({
      ...day,
      count: 0,
      wordCount: 0,
      score: 0,
      metTarget: false
    }))
  },
  history_summary: {
    skipped_records: 0,
    duplicate_records: 0
  },
  history: []
};

const scoreSnapshot = {
  ...mockSnapshot,
  daily_goal_type: "score",
  daily_score_goal: 600,
  study_summary: {
    ...mockSnapshot.study_summary,
    goal_type: "score",
    today: 240,
    target: 600,
    remaining: 360,
    progress: 40,
    word_count: 3,
    score: 240,
    word_target: 10,
    score_target: 600,
    days: mockSnapshot.study_summary.days.map((day) => ({
      ...day,
      count: day.today ? 240 : 0,
      wordCount: day.today ? 3 : 0,
      score: day.today ? 240 : 0,
      metTarget: false
    }))
  }
};

const signedInSnapshot = {
  ...mockSnapshot,
  google_signed_in: true
};

const preload = `
<script>
(() => {
  const snapshots = {
    due: ${JSON.stringify(mockSnapshot)},
    next: ${JSON.stringify(nextReviewSnapshot)},
    empty: ${JSON.stringify(emptySnapshot)},
    score: ${JSON.stringify(scoreSnapshot)},
    signedIn: ${JSON.stringify(signedInSnapshot)}
  };
  const scenarioParam = new URL(window.location.href).searchParams.get("scenario");
  const scenario = scenarioParam === "next" ? "next" : scenarioParam === "score-goal" ? "score" : scenarioParam === "signed-in" ? "signedIn" : scenarioParam === "empty" || scenarioParam === "empty-reload" || scenarioParam === "manual" ? "empty" : "due";
  const snapshot = structuredClone(snapshots[scenario]);
  const smokeNow = ${now};
  const smokeDay = ${day};
  const listeners = new Set();
  const send = () => listeners.forEach((listener) => listener(structuredClone(snapshot)));
  const recordToastGeometry = () => {
    const toast = document.querySelector("#toast");
    const lookup = document.querySelector("#lookupForm");
    const toolbar = document.querySelector(".split-toolbar");
    if (!toast || !lookup || !toolbar) {
      return;
    }
    const toastRect = toast.getBoundingClientRect();
    const lookupRect = lookup.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();
    const toastCenterX = toastRect.left + toastRect.width / 2;
    const toastCenterY = toastRect.top + toastRect.height / 2;
    const toolbarCenterY = toolbarRect.top + toolbarRect.height / 2;
    document.body.dataset.smokeToastCentered = String(Math.abs(toastCenterX - window.innerWidth / 2) <= 2);
    document.body.dataset.smokeToastBelowSearch = String(toastRect.top >= lookupRect.bottom);
    document.body.dataset.smokeToastInButtonBar = String(
      toastCenterY >= toolbarRect.top &&
        toastCenterY <= toolbarRect.bottom &&
        Math.abs(toastCenterY - toolbarCenterY) <= 3
    );
  };
  window.addEventListener("unhandledrejection", (event) => {
    document.body.dataset.smokeUnhandled = String(
      event.reason && event.reason.message ? event.reason.message : event.reason
    );
  });
  window.addEventListener("load", () => {
    window.setTimeout(() => {
      document.body.dataset.smokeTitle = document.title;
      const googleSignIn = document.querySelector("#googleSignIn");
      const googleLogout = document.querySelector("#googleLogout");
      document.body.dataset.smokeGoogleSignInHidden = String(Boolean(googleSignIn?.hidden));
      document.body.dataset.smokeGoogleLogoutHidden = String(Boolean(googleLogout?.hidden));
      document.body.dataset.smokeGoogleSignInDisplay = googleSignIn ? getComputedStyle(googleSignIn).display : "";
      document.body.dataset.smokeGoogleLogoutDisplay = googleLogout ? getComputedStyle(googleLogout).display : "";
    }, 500);
  });
  window.wordCoach = {
    getAppSnapshot: async () => {
      if (scenarioParam === "filters-refresh-error" && window.__wordCoachSmokeSnapshotFails) {
        throw new Error("Snapshot refresh failed");
      }
      return structuredClone(snapshot);
    },
    onAppSnapshot: (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    searchDictionary: async (word) => {
      if (scenarioParam === "lookup-error" || scenarioParam === "click-error") {
        throw new Error("Dictionary navigation failed");
      }
      snapshot.current_word = String(word || "");
      window.__wordCoachSmokeSearch = snapshot.current_word;
      send();
    },
    addStudyWord: async (word) => {
      const studied = String(word || "").trim();
      window.__wordCoachSmokeAdded = studied;
      if (!studied) {
        return false;
      }
      if (scenarioParam === "manual-rejected") {
        return false;
      }
      snapshot.history.unshift({
        id: "manual",
        captured_at: smokeNow,
        question: "Manual " + studied,
        options: [studied],
        word_log: [studied],
        selected_answer: studied,
        correct_answer: studied,
        result: "correct",
        source_url: "wordcoach://manual",
        extractor_version: 1
      });
      send();
      return true;
    },
    setDictionaryProvider: async () => {},
    setDictionaryMode: async () => {},
    setPreloadEagerness: async () => {},
    setDarkMode: async () => {},
    setCosmeticAdblock: async () => {},
    setLocaleChoice: async () => {},
    setDailyGoalType: async (type) => {
      if (scenarioParam === "daily-goal-error") {
        throw new Error("Daily goal save failed");
      }
      snapshot.daily_goal_type = type === "score" ? "score" : "words";
      snapshot.study_summary.goal_type = snapshot.daily_goal_type;
      snapshot.study_summary.target =
        snapshot.daily_goal_type === "score" ? snapshot.daily_score_goal : snapshot.daily_goal;
      snapshot.study_summary.today =
        snapshot.daily_goal_type === "score"
          ? snapshot.study_summary.score
          : snapshot.study_summary.word_count;
      snapshot.study_summary.remaining = Math.max(
        0,
        snapshot.study_summary.target - snapshot.study_summary.today
      );
      snapshot.study_summary.progress = Math.round(
        (snapshot.study_summary.today / snapshot.study_summary.target) * 100
      );
      send();
    },
    setDailyGoal: async (goal) => {
      if (scenarioParam === "daily-goal-error") {
        throw new Error("Daily goal save failed");
      }
      snapshot.daily_goal = Number(goal) || snapshot.daily_goal;
      send();
    },
    setDailyScoreGoal: async (goal) => {
      if (scenarioParam === "daily-goal-error") {
        throw new Error("Daily goal save failed");
      }
      snapshot.daily_score_goal = Number(goal) || snapshot.daily_score_goal;
      send();
    },
    markReviewKnown: async (word) => {
      if (scenarioParam === "complete-error") {
        throw new Error("Review completion failed");
      }
      try {
        window.__wordCoachSmokeMarkedCalls = window.__wordCoachSmokeMarkedCalls || [];
        window.__wordCoachSmokeMarkedCalls.push(String(word || ""));
        window.__wordCoachSmokeMarked = String(word || "");
        snapshot.review_queue = snapshot.review_queue.filter((item) => item.word !== word);
        snapshot.review_summary = {
          due_count: snapshot.review_queue.length,
          pending_count: snapshot.review_summary.pending_count,
          next_due_at: smokeNow + smokeDay
        };
        send();
        return true;
      } catch (error) {
        window.__wordCoachSmokeError = String(error && error.message ? error.message : error);
        return false;
      }
    },
    answerReview: async (word, answer) => {
      if (scenarioParam === "answer-error") {
        throw new Error("Review answer failed");
      }
      const correct = answer === "plenty";
      window.__wordCoachSmokeAnswerCalls = window.__wordCoachSmokeAnswerCalls || [];
      window.__wordCoachSmokeAnswerCalls.push(String(word) + ":" + String(answer));
      if (scenarioParam === "answer-busy") {
        await new Promise((resolve) => window.setTimeout(resolve, 800));
      }
      window.__wordCoachSmokeAnswer = String(word) + ":" + String(answer) + ":" + (correct ? "correct" : "incorrect");
      if (correct) {
        snapshot.review_queue = snapshot.review_queue.filter((item) => item.word !== word);
      }
      snapshot.review_summary = {
        due_count: snapshot.review_queue.length,
        pending_count: snapshot.review_summary.pending_count,
        next_due_at: smokeNow + smokeDay
      };
      return { word, result: correct ? "correct" : "incorrect" };
    },
    setUiOverlayOpen: async () => {},
    openGoogleSignIn: async () => {},
    logoutGoogle: async () => {
      window.__wordCoachSmokeLoggedOut = "true";
      return true;
    },
    reloadCoach: async () => {
      window.__wordCoachSmokeReloaded = "true";
    },
    reloadDictionary: async () => {
      if (scenarioParam === "dictionary-refresh-error") {
        throw new Error("Dictionary reload failed");
      }
    },
    dictionaryBack: async () => {},
    dictionaryForward: async () => {},
    updateAdblockFilters: async () => {
      if (scenarioParam === "filters-refresh-error") {
        window.__wordCoachSmokeSnapshotFails = true;
      }
      return snapshot.adblock;
    },
    exportHistory: async () => null,
    importHistory: async () =>
      scenarioParam === "import-error"
        ? Promise.reject(new Error("Invalid Word Coach export."))
        : scenarioParam === "import-summary"
        ? {
            records_imported: 1,
            records_updated: 4,
            records_skipped: 2,
            records_duplicates: 3,
            settings_imported: false
          }
        : null
  };
  if (scenarioParam === "click") {
    window.addEventListener("load", () => {
      window.setTimeout(() => {
        document.querySelector('[data-review="true"]')?.click();
      }, 100);
      window.setTimeout(() => {
        document.body.dataset.smokeSearch = window.__wordCoachSmokeSearch || "";
      }, 500);
    });
  }
  if (scenarioParam === "click-error") {
    window.addEventListener("load", () => {
      window.setTimeout(() => {
        document.querySelector('[data-review="true"]')?.click();
      }, 100);
      window.setTimeout(() => {
        document.body.dataset.smokeClickToast = document.querySelector("#toast")?.textContent || "";
        document.body.dataset.smokeUnhandled = document.body.dataset.smokeUnhandled || "";
      }, 1000);
    });
  }
  if (scenarioParam === "lookup-empty") {
    window.addEventListener("load", () => {
      window.setTimeout(() => {
        document.querySelector("#lookupForm")?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true })
        );
      }, 100);
      window.setTimeout(() => {
        document.body.dataset.smokeLookupToast = document.querySelector("#toast")?.textContent || "";
        document.body.dataset.smokeSearch = window.__wordCoachSmokeSearch || "";
        recordToastGeometry();
      }, 1000);
    });
  }
  if (scenarioParam === "lookup-error") {
    window.addEventListener("load", () => {
      window.setTimeout(() => {
        const input = document.querySelector("#lookupInput");
        if (input) {
          input.value = "abundant";
        }
        document.querySelector("#lookupForm")?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true })
        );
      }, 100);
      window.setTimeout(() => {
        document.body.dataset.smokeLookupToast = document.querySelector("#toast")?.textContent || "";
        document.body.dataset.smokeUnhandled = document.body.dataset.smokeUnhandled || "";
      }, 1000);
    });
  }
  if (scenarioParam === "complete") {
    window.addEventListener("load", () => {
      window.setTimeout(() => {
        document.querySelector('[data-review-complete="true"]')?.click();
      }, 100);
      window.setTimeout(() => {
        document.body.dataset.smokeMarked = window.__wordCoachSmokeMarked || "";
        document.body.dataset.smokeError = window.__wordCoachSmokeError || "";
        document.body.dataset.smokeReviewCount = String(document.querySelectorAll('[data-review="true"]').length);
      }, 1000);
    });
  }
  if (scenarioParam === "answer") {
    window.addEventListener("load", () => {
      window.setTimeout(() => {
        document.querySelector('[data-review-answer="plenty"]')?.click();
      }, 100);
      window.setTimeout(async () => {
        document.body.dataset.smokeAnswer = window.__wordCoachSmokeAnswer || "";
        document.body.dataset.smokeReviewCount = String(document.querySelectorAll('[data-review="true"]').length);
      }, 1500);
    });
  }
  if (scenarioParam === "answer-busy") {
    window.addEventListener("load", () => {
      window.setTimeout(() => {
        document.querySelector('[data-review-answer="scarce"]')?.click();
        document.querySelector('[data-review-answer="plenty"]')?.click();
        document.querySelector('[data-review-complete="true"]')?.click();
      }, 100);
      window.setTimeout(() => {
        const answerCalls = window.__wordCoachSmokeAnswerCalls || [];
        const markedCalls = window.__wordCoachSmokeMarkedCalls || [];
        const rowButtons = Array.from(document.querySelectorAll(".review-word-row button"));
        document.body.dataset.smokeAnswerCallCount = String(answerCalls.length);
        document.body.dataset.smokeAnswerCalls = answerCalls.join("|");
        document.body.dataset.smokeMarkedCallCount = String(markedCalls.length);
        document.body.dataset.smokeReviewBusy = String(
          rowButtons.length > 0 && rowButtons.every((button) => button.disabled)
        );
      }, 300);
    });
  }
  if (scenarioParam === "answer-error") {
    window.addEventListener("load", () => {
      window.setTimeout(() => {
        document.querySelector('[data-review-answer="plenty"]')?.click();
      }, 100);
      window.setTimeout(() => {
        const rowButtons = Array.from(document.querySelectorAll(".review-word-row button"));
        document.body.dataset.smokeAnswerToast = document.querySelector("#toast")?.textContent || "";
        document.body.dataset.smokeUnhandled = document.body.dataset.smokeUnhandled || "";
        document.body.dataset.smokeReviewBusy = String(rowButtons.some((button) => button.disabled));
      }, 1000);
    });
  }
  if (scenarioParam === "complete-error") {
    window.addEventListener("load", () => {
      window.setTimeout(() => {
        document.querySelector('[data-review-complete="true"]')?.click();
      }, 100);
      window.setTimeout(() => {
        const rowButtons = Array.from(document.querySelectorAll(".review-word-row button"));
        document.body.dataset.smokeCompleteToast = document.querySelector("#toast")?.textContent || "";
        document.body.dataset.smokeUnhandled = document.body.dataset.smokeUnhandled || "";
        document.body.dataset.smokeReviewBusy = String(rowButtons.some((button) => button.disabled));
      }, 1000);
    });
  }
  if (scenarioParam === "empty-reload") {
    window.addEventListener("load", () => {
      window.setTimeout(() => {
        document.querySelector('[data-empty-reload="true"]')?.click();
      }, 100);
      window.setTimeout(() => {
        document.body.dataset.smokeReloaded = window.__wordCoachSmokeReloaded || "";
      }, 500);
    });
  }
  if (scenarioParam === "manual") {
    window.addEventListener("load", () => {
      window.setTimeout(() => {
        const input = document.querySelector("#lookupInput");
        if (input) {
          input.value = "manual";
        }
        document.querySelector("#addStudyWord")?.click();
      }, 100);
      window.setTimeout(() => {
        document.body.dataset.smokeAdded = window.__wordCoachSmokeAdded || "";
        document.body.dataset.smokeHistoryCount = String(document.querySelectorAll(".history-word").length);
      }, 1000);
    });
  }
  if (scenarioParam === "manual-empty") {
    window.addEventListener("load", () => {
      window.setTimeout(() => {
        document.querySelector("#addStudyWord")?.click();
      }, 100);
      window.setTimeout(() => {
        document.body.dataset.smokeManualToast = document.querySelector("#toast")?.textContent || "";
        document.body.dataset.smokeAdded = window.__wordCoachSmokeAdded || "";
      }, 1000);
    });
  }
  if (scenarioParam === "manual-rejected") {
    window.addEventListener("load", () => {
      window.setTimeout(() => {
        const input = document.querySelector("#lookupInput");
        if (input) {
          input.value = "manual";
        }
        document.querySelector("#addStudyWord")?.click();
      }, 100);
      window.setTimeout(() => {
        document.body.dataset.smokeManualToast = document.querySelector("#toast")?.textContent || "";
        document.body.dataset.smokeAdded = window.__wordCoachSmokeAdded || "";
      }, 1000);
    });
  }
  if (scenarioParam === "import-summary") {
    window.addEventListener("load", () => {
      window.setTimeout(() => {
        document.querySelector("#importData")?.click();
      }, 100);
      window.setTimeout(() => {
        document.body.dataset.smokeImportToast = document.querySelector("#toast")?.textContent || "";
      }, 1000);
    });
  }
  if (scenarioParam === "import-error") {
    window.addEventListener("load", () => {
      window.setTimeout(() => {
        document.querySelector("#importData")?.click();
      }, 100);
      window.setTimeout(() => {
        document.body.dataset.smokeImportToast = document.querySelector("#toast")?.textContent || "";
        document.body.dataset.smokeUnhandled = document.body.dataset.smokeUnhandled || "";
      }, 1000);
    });
  }
  if (scenarioParam === "filters-refresh-error") {
    window.addEventListener("load", () => {
      window.setTimeout(() => {
        document.querySelector("#updateFilters")?.click();
      }, 100);
      window.setTimeout(() => {
        document.body.dataset.smokeFilterToast = document.querySelector("#toast")?.textContent || "";
        document.body.dataset.smokeFilterDisabled = String(
          Boolean(document.querySelector("#updateFilters")?.disabled)
        );
        document.body.dataset.smokeUnhandled = document.body.dataset.smokeUnhandled || "";
      }, 1000);
    });
  }
  if (scenarioParam === "daily-goal-error") {
    window.addEventListener("load", () => {
      window.setTimeout(() => {
        const input = document.querySelector("#dailyGoalInput");
        if (input) {
          input.value = "25";
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }, 100);
      window.setTimeout(() => {
        document.body.dataset.smokeDailyToast = document.querySelector("#toast")?.textContent || "";
        document.body.dataset.smokeDailyGoal = document.querySelector("#dailyGoalInput")?.value || "";
        document.body.dataset.smokeUnhandled = document.body.dataset.smokeUnhandled || "";
      }, 1000);
    });
  }
  if (scenarioParam === "dictionary-refresh-error") {
    window.addEventListener("load", () => {
      window.setTimeout(() => {
        document.querySelector("#dictionaryRefresh")?.click();
      }, 100);
      window.setTimeout(() => {
        document.body.dataset.smokeDictionaryToast = document.querySelector("#toast")?.textContent || "";
        document.body.dataset.smokeUnhandled = document.body.dataset.smokeUnhandled || "";
      }, 1000);
    });
  }
})();
</script>`;

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    const filePath = safeFilePath(url.pathname);
    let body = await fs.readFile(filePath);
    if (path.basename(filePath) === "index.html") {
      body = Buffer.from(String(body).replace("<body>", `<body>${preload}`));
    }
    response.writeHead(200, {
      "Content-Type": MIME_TYPES.get(path.extname(filePath)) || "application/octet-stream"
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

try {
  const { port } = server.address();
  const html = await dumpDom(`http://127.0.0.1:${port}/`);
  assertIncludes(html, 'data-smoke-title="Review 1 due - Word Coach"');
  assertIncludes(html, "Today 3/10");
  assertIncludes(html, "7 left");
  assertIncludes(html, 'data-progress="30"');
  const scoreGoalHtml = await dumpDom(`http://127.0.0.1:${port}/?scenario=score-goal`);
  assertIncludes(scoreGoalHtml, "Score 240/600");
  assertIncludes(scoreGoalHtml, "360 pts left");
  assertIncludes(scoreGoalHtml, 'data-progress="40"');
  assertIncludes(scoreGoalHtml, 'aria-label="Daily score goal"');
  assertIncludes(html, "Streak 2d");
  assertIncludes(html, "Review 1");
  assertNotIncludes(html, "Accuracy 67%");
  assertIncludes(html, "Practice now");
  assertIncludes(html, 'data-word="abundant"');
  assertIncludes(html, 'data-review="true"');
  assertIncludes(html, 'data-review-choice="true"');
  assertIncludes(html, 'data-review-answer="scarce"');
  assertIncludes(html, 'data-review-answer="plenty"');
  assertNotIncludes(html, 'data-review-answer="I don&#039;t know"');
  assertNotIncludes(html, 'data-word="plenty"');
  assertIncludes(html, 'data-word="reticent"');
  assertNotIncludes(html, 'data-word="Conversation"');
  assertNotIncludes(html, "Picked I don't know; Answer plenty");
  assertIncludes(html, 'data-review-complete="true"');
  assertIncludes(html, "Known");
  assertIncludes(html, "Mark abundant reviewed");
  assertIncludes(html, "Review abundant:");
  assertIncludes(html, "Review 1 due");
  assertIncludes(html, "Later");
  assertIncludes(html, "1 for later");
  assertNotIncludes(html, 'data-review-upcoming="true"');
  assertNotIncludes(html, 'data-word="careful"');
  assertNotIncludes(html, "Due ");
  assertIncludes(html, "2 incomplete records hidden");
  assertIncludes(html, "3 duplicate records hidden");
  assertIncludes(html, "Recent words");
  assertIncludes(html, 'data-smoke-google-sign-in-hidden="false"');
  assertIncludes(html, 'data-smoke-google-logout-hidden="true"');
  assertIncludes(html, 'data-smoke-google-sign-in-display="flex"');
  assertIncludes(html, 'data-smoke-google-logout-display="none"');
  assertNotIncludes(html, "x2");
  assertNotIncludes(html, 'data-study-day=');
  const signedInHtml = await dumpDom(`http://127.0.0.1:${port}/?scenario=signed-in`);
  assertIncludes(signedInHtml, 'data-smoke-google-sign-in-hidden="true"');
  assertIncludes(signedInHtml, 'data-smoke-google-logout-hidden="false"');
  assertIncludes(signedInHtml, 'data-smoke-google-sign-in-display="none"');
  assertIncludes(signedInHtml, 'data-smoke-google-logout-display="flex"');
  const nextHtml = await dumpDom(`http://127.0.0.1:${port}/?scenario=next`);
  assertIncludes(nextHtml, 'data-smoke-title="Word Coach"');
  assertNotIncludes(nextHtml, "Next ");
  assertNotIncludes(nextHtml, "Pending 1");
  assertIncludes(nextHtml, "Later");
  assertIncludes(nextHtml, "1 for later");
  assertNotIncludes(nextHtml, 'data-review-upcoming="true"');
  assertIncludes(nextHtml, "Today 3/10");
  assertNotIncludes(nextHtml, "Accuracy 67%");
  assertNotIncludes(nextHtml, 'data-study-day=');
  const emptyHtml = await dumpDom(`http://127.0.0.1:${port}/?scenario=empty`);
  assertIncludes(emptyHtml, "No words yet");
  assertIncludes(emptyHtml, "Today starts with the first captured answer.");
  assertIncludes(emptyHtml, 'data-empty-reload="true"');
  assertIncludes(emptyHtml, "Reload Word Coach");
  const emptyReloadHtml = await dumpDom(`http://127.0.0.1:${port}/?scenario=empty-reload`);
  assertIncludes(emptyReloadHtml, 'data-smoke-reloaded="true"');
  const manualHtml = await dumpDom(`http://127.0.0.1:${port}/?scenario=manual`);
  assertIncludes(manualHtml, "Add study word");
  assertIncludes(manualHtml, 'data-smoke-added="manual"');
  assertIncludes(manualHtml, 'data-smoke-history-count="1"');
  const manualEmptyHtml = await dumpDom(`http://127.0.0.1:${port}/?scenario=manual-empty`);
  assertIncludes(manualEmptyHtml, 'data-smoke-manual-toast="Enter a word to add"');
  assertIncludes(manualEmptyHtml, 'data-smoke-added=""');
  const manualRejectedHtml = await dumpDom(`http://127.0.0.1:${port}/?scenario=manual-rejected`);
  assertIncludes(manualRejectedHtml, 'data-smoke-manual-toast="manual was already recorded"');
  assertIncludes(manualRejectedHtml, 'data-smoke-added="manual"');
  const importHtml = await dumpDom(`http://127.0.0.1:${port}/?scenario=import-summary`);
  assertIncludes(
    importHtml,
    'data-smoke-import-toast="Imported 1 new records. Updated 4 existing records. Skipped 2 incomplete records. Skipped 3 duplicate records"'
  );
  const importErrorHtml = await dumpDom(`http://127.0.0.1:${port}/?scenario=import-error`);
  assertIncludes(importErrorHtml, 'data-smoke-import-toast="Invalid Word Coach export."');
  assertIncludes(importErrorHtml, 'data-smoke-unhandled=""');
  const filterRefreshErrorHtml = await dumpDom(`http://127.0.0.1:${port}/?scenario=filters-refresh-error`);
  assertIncludes(filterRefreshErrorHtml, 'data-smoke-filter-toast="Filters updated"');
  assertIncludes(filterRefreshErrorHtml, 'data-smoke-filter-disabled="false"');
  assertIncludes(filterRefreshErrorHtml, 'data-smoke-unhandled=""');
  const dailyGoalErrorHtml = await dumpDom(`http://127.0.0.1:${port}/?scenario=daily-goal-error`);
  assertIncludes(dailyGoalErrorHtml, 'data-smoke-daily-toast="Daily goal save failed"');
  assertIncludes(dailyGoalErrorHtml, 'data-smoke-daily-goal="10"');
  assertIncludes(dailyGoalErrorHtml, 'data-smoke-unhandled=""');
  const dictionaryRefreshErrorHtml = await dumpDom(`http://127.0.0.1:${port}/?scenario=dictionary-refresh-error`);
  assertIncludes(dictionaryRefreshErrorHtml, 'data-smoke-dictionary-toast="Dictionary reload failed"');
  assertIncludes(dictionaryRefreshErrorHtml, 'data-smoke-unhandled=""');
  const lookupEmptyHtml = await dumpDom(`http://127.0.0.1:${port}/?scenario=lookup-empty`);
  assertIncludes(lookupEmptyHtml, 'data-smoke-lookup-toast="Enter a word to search"');
  assertIncludes(lookupEmptyHtml, 'data-smoke-search=""');
  assertIncludes(lookupEmptyHtml, 'data-smoke-toast-centered="true"');
  assertIncludes(lookupEmptyHtml, 'data-smoke-toast-below-search="true"');
  assertIncludes(lookupEmptyHtml, 'data-smoke-toast-in-button-bar="true"');
  const lookupErrorHtml = await dumpDom(`http://127.0.0.1:${port}/?scenario=lookup-error`);
  assertIncludes(lookupErrorHtml, 'data-smoke-lookup-toast="Dictionary navigation failed"');
  assertIncludes(lookupErrorHtml, 'data-smoke-unhandled=""');
  const clickHtml = await dumpDom(`http://127.0.0.1:${port}/?scenario=click`);
  assertIncludes(clickHtml, 'data-smoke-search="abundant"');
  const clickErrorHtml = await dumpDom(`http://127.0.0.1:${port}/?scenario=click-error`);
  assertIncludes(clickErrorHtml, 'data-smoke-click-toast="Dictionary navigation failed"');
  assertIncludes(clickErrorHtml, 'data-smoke-unhandled=""');
  const completeHtml = await dumpDom(`http://127.0.0.1:${port}/?scenario=complete`);
  assertIncludes(completeHtml, 'data-smoke-marked="abundant"');
  assertIncludes(completeHtml, 'data-smoke-review-count="0"');
  const answerHtml = await dumpDom(`http://127.0.0.1:${port}/?scenario=answer`);
  assertIncludes(answerHtml, 'data-smoke-answer="abundant:plenty:correct"');
  assertIncludes(answerHtml, 'data-smoke-review-count="0"');
  const answerBusyHtml = await dumpDom(`http://127.0.0.1:${port}/?scenario=answer-busy`);
  assertIncludes(answerBusyHtml, 'data-smoke-answer-call-count="1"');
  assertIncludes(answerBusyHtml, 'data-smoke-answer-calls="abundant:scarce"');
  assertIncludes(answerBusyHtml, 'data-smoke-marked-call-count="0"');
  assertIncludes(answerBusyHtml, 'data-smoke-review-busy="true"');
  const answerErrorHtml = await dumpDom(`http://127.0.0.1:${port}/?scenario=answer-error`);
  assertIncludes(answerErrorHtml, 'data-smoke-answer-toast="Review answer failed"');
  assertIncludes(answerErrorHtml, 'data-smoke-unhandled=""');
  assertIncludes(answerErrorHtml, 'data-smoke-review-busy="false"');
  const completeErrorHtml = await dumpDom(`http://127.0.0.1:${port}/?scenario=complete-error`);
  assertIncludes(completeErrorHtml, 'data-smoke-complete-toast="Review completion failed"');
  assertIncludes(completeErrorHtml, 'data-smoke-unhandled=""');
  assertIncludes(completeErrorHtml, 'data-smoke-review-busy="false"');
  console.log("Renderer smoke passed: study summary, review queue, upcoming review backlog, auth controls, empty/manual states, settings/toolbar errors, lookup/manual feedback, import summary/error, filter recovery, review click/error, review answer/error, and review completion/error rendered.");
} finally {
  await new Promise((resolve) => server.close(resolve));
}

function record(id, capturedAt, word, result) {
  return {
    id,
    captured_at: capturedAt,
    question: `Which word matches ${word}?`,
    options: [word],
    word_log: [word],
    selected_answer: word,
    correct_answer: word,
    result,
    source_url: "https://www.google.com/search?q=google+word+coach",
    extractor_version: 1
  };
}

function safeFilePath(urlPathname) {
  const relativePath = decodeURIComponent(urlPathname === "/" ? "/index.html" : urlPathname);
  const filePath = path.join(DIST, relativePath);
  if (!filePath.startsWith(DIST)) {
    throw new Error("Path escapes dist");
  }
  return filePath;
}

function dumpDom(url) {
  return new Promise((resolve, reject) => {
    const chrome = spawn(process.env.CHROMIUM_PATH || "chromium", [
      "--headless=new",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--virtual-time-budget=3000",
      "--dump-dom",
      url
    ]);
    let stdout = "";
    let stderr = "";
    chrome.stdout.setEncoding("utf8");
    chrome.stderr.setEncoding("utf8");
    chrome.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    chrome.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    chrome.on("error", reject);
    chrome.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Chromium exited ${code}: ${stderr.slice(0, 1200)}`));
      }
    });
  });
}

function assertIncludes(value, expected) {
  if (!value.includes(expected)) {
    throw new Error(
      `Renderer smoke missing ${JSON.stringify(expected)} in ${value.match(/data-smoke-[^>]+/)?.[0] || "dump"}`
    );
  }
}

function assertNotIncludes(value, expected) {
  if (value.includes(expected)) {
    throw new Error(`Renderer smoke unexpectedly included ${JSON.stringify(expected)}`);
  }
}

function assertMatchCount(value, pattern, expected) {
  const count = value.match(pattern)?.length || 0;
  if (count !== expected) {
    throw new Error(`Renderer smoke expected ${expected} matches for ${pattern}, got ${count}`);
  }
}
