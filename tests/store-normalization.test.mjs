import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  JsonStore,
  normalizeCapture,
  normalizeDailyGoal,
  normalizeDailyGoalType,
  normalizeDailyScoreGoal,
  reviewBacklog,
  reviewQueue,
  reviewSummary
} from "../electron/store.mjs";

test("normalizes an English missed prompt into reviewable words", () => {
  const record = normalizeCapture({
    captured_at: 1,
    question: 'Which word is most similar to "Abundant"? plenty or scarce',
    options: ["plenty", "scarce"],
    selected_answer: "scarce",
    correct_answer: "plenty",
    result: "incorrect",
    source_url: "https://www.google.com/search?q=google+word+coach"
  });

  assert.deepEqual(record.word_log, ["abundant", "plenty", "scarce"]);
  assert.equal(record.result, "incorrect");
});

test("normalizes a Korean missed prompt into reviewable words", () => {
  const record = normalizeCapture({
    captured_at: 2,
    question: '다음 중 "꼼꼼한"과(와) 비슷한 단어는? 세심한 또는 부주의한',
    options: ["세심한", "부주의한"],
    selected_answer: "부주의한",
    correct_answer: "세심한",
    result: "incorrect",
    source_url: "https://www.google.com/search?q=google+word+coach"
  });

  assert.deepEqual(record.word_log, ["꼼꼼한", "세심한", "부주의한"]);
  assert.equal(record.result, "incorrect");
});

test("normalizes one-word picture prompts around the quiz word", () => {
  const record = normalizeCapture({
    captured_at: 2,
    question: "WORD COACH Score 0 Reticent Question 1 of 5",
    options: ["Forest", "Conversation"],
    word_log: ["word coach score reticent", "forest", "conversation"],
    selected_answer: "Forest",
    correct_answer: "Conversation",
    result: "incorrect",
    source_url: "https://www.google.com/search?q=google+word+coach"
  });

  assert.deepEqual(record.word_log, ["reticent"]);
  assert.equal(record.selected_answer, "Forest");
  assert.equal(record.correct_answer, "Conversation");
  assert.deepEqual(
    reviewQueue([record]).map((item) => item.word),
    ["reticent"]
  );
});

test("normalizes localized one-word picture prompts around the quiz word", () => {
  const record = normalizeCapture({
    captured_at: 2,
    question: "단어 과외 점수 • 280 280 Reticent Question 1 of 5",
    options: ["Forest", "Conversation"],
    word_log: ["forest", "conversation"],
    selected_answer: "Forest",
    correct_answer: "Conversation",
    result: "incorrect",
    source_url: "https://www.google.com/search?q=google+word+coach"
  });

  assert.deepEqual(record.word_log, ["reticent"]);
  assert.deepEqual(
    reviewQueue([record]).map((item) => item.word),
    ["reticent"]
  );
});

test("normalizes English picture-question prompts around the quiz word", () => {
  const record = normalizeCapture({
    captured_at: 2,
    question: "WORD COACH Score 0 Which image best represents the word Reticent? Question 1 of 5",
    options: ["Forest", "Conversation"],
    word_log: ["reticent"],
    selected_answer: "Forest",
    correct_answer: "Conversation",
    result: "incorrect",
    source_url: "https://www.google.com/search?q=google+word+coach"
  });

  assert.deepEqual(record.word_log, ["reticent"]);
  assert.deepEqual(
    reviewQueue([record]).map((item) => item.word),
    ["reticent"]
  );
});

test("rejects captures with only Word Coach chrome vocabulary", () => {
  const record = normalizeCapture({
    captured_at: 3,
    word_log: ["Google Word Coach", "Next"],
    result: "correct",
    source_url: "https://www.google.com/search?q=google+word+coach"
  });

  assert.equal(record, null);
});

test("rejects captures with only Word Coach question chrome", () => {
  const record = normalizeCapture({
    captured_at: 3,
    question: "WORD COACH Score 0 Question 1 of 5",
    word_log: ["Word Coach", "Score"],
    result: "correct",
    source_url: "https://www.google.com/search?q=google+word+coach"
  });

  assert.equal(record, null);
});

test("keeps resultless structured answer captures for study history", () => {
  const record = normalizeCapture({
    captured_at: 4,
    question: "Which word is most similar to abundant? plenty or scarce",
    options: ["plenty", "scarce"],
    word_log: ["abundant", "plenty", "scarce"],
    selected_answer: "scarce",
    result: null,
    source_url: "https://www.google.com/search?q=google+word+coach"
  });

  assert.deepEqual(record.word_log, ["abundant", "plenty", "scarce"]);
  assert.equal(record.selected_answer, "scarce");
  assert.equal(record.result, null);
  assert.deepEqual(reviewQueue([record]), []);
});

test("keeps resultless captures when choices are parsed from the question", () => {
  const record = normalizeCapture({
    captured_at: 4,
    question: "Which word is most similar to abundant? plenty or scarce",
    selected_answer: "scarce",
    result: null,
    source_url: "https://www.google.com/search?q=google+word+coach"
  });

  assert.deepEqual(record.options, ["plenty", "scarce"]);
  assert.deepEqual(record.word_log, ["abundant", "plenty", "scarce"]);
  assert.equal(record.selected_answer, "scarce");
  assert.equal(record.result, null);
  assert.deepEqual(reviewQueue([record]), []);
});

test("infers missing result from selected and correct answers", () => {
  const record = normalizeCapture({
    captured_at: 5,
    question: "Which word is most similar to abundant?",
    options: ["plenty", "scarce"],
    word_log: ["abundant", "plenty", "scarce"],
    selected_answer: "scarce",
    correct_answer: "plenty",
    result: null,
    source_url: "https://www.google.com/search?q=google+word+coach"
  });

  assert.equal(record.result, "incorrect");
  assert.deepEqual(
    reviewQueue([record]).map((item) => item.word),
    ["abundant"]
  );
});

test("does not infer a result for non-option selected chrome text", () => {
  const record = normalizeCapture({
    captured_at: 5,
    question: "Which word is most similar to abundant? plenty or scarce",
    options: ["plenty", "scarce"],
    word_log: ["abundant", "plenty", "scarce"],
    selected_answer: "Next",
    correct_answer: "plenty",
    result: null,
    source_url: "https://www.google.com/search?q=google+word+coach"
  });

  assert.equal(record, null);
});

test("does not infer a result for chrome text when explicit options are missing", () => {
  const record = normalizeCapture({
    captured_at: 5,
    question: "Which word is most similar to abundant? plenty or scarce",
    selected_answer: "Next",
    correct_answer: "plenty",
    result: null,
    source_url: "https://www.google.com/search?q=google+word+coach"
  });

  assert.equal(record, null);
});

test("rejects explicit-result captures with non-option selected chrome text", () => {
  const record = normalizeCapture({
    captured_at: 5,
    question: "Which word is most similar to abundant? plenty or scarce",
    options: ["plenty", "scarce"],
    word_log: ["abundant", "plenty", "scarce"],
    selected_answer: "Next",
    result: "incorrect",
    source_url: "https://www.google.com/search?q=google+word+coach"
  });

  assert.equal(record, null);
});

test("strips Word Coach chrome choices from detected answer options", () => {
  const record = normalizeCapture({
    captured_at: 5,
    question:
      "WORD COACH Score 0 Which word is similar to equanimity? Forfeiture or Composure Question 1 of 5",
    options: ["Forfeiture", "Composure", "SKIP", "No thanks", "Turn on"],
    word_log: ["forfeiture", "composure", "skip", "equanimity", "no thanks", "turn on"],
    selected_answer: "Forfeiture",
    result: null,
    source_url: "https://www.google.co.in/search?q=google+word+coach&hl=en&gl=IN"
  });

  assert.deepEqual(record.options, ["Forfeiture", "Composure"]);
  assert.deepEqual(record.word_log, ["equanimity", "forfeiture", "composure"]);
  assert.equal(record.result, null);
});

test("strips Korean notification chrome from structured quiz captures", () => {
  const record = normalizeCapture({
    captured_at: 5,
    question:
      "단어 과외 점수 • 4140 4140 pompous과(와) 뜻이 비슷한 단어는 무엇인가요? Omnipresent 또는 Self-Important Question 4 of 5 건너뛰기 단어 과외 알림을 다시 사용하시겠습니까? 사용 안함 사용",
    options: ["Omnipresent", "Self-Important", "건너뛰기", "사용 안함", "사용"],
    word_log: [
      "pompous",
      "omnipresent",
      "self-important",
      "건너뛰기",
      "신기록",
      "올바른 답변"
    ],
    selected_answer: "Omnipresent",
    result: null,
    source_url: "https://www.google.co.in/search?q=google+word+coach&hl=ko&gl=IN"
  });

  assert.deepEqual(record.options, ["Omnipresent", "Self-Important"]);
  assert.deepEqual(record.word_log, ["pompous", "omnipresent", "self-important"]);
  assert.equal(record.selected_answer, "Omnipresent");
  assert.equal(record.result, null);
});

test("rejects localized result-summary chrome without active quiz structure", () => {
  const record = normalizeCapture({
    captured_at: 6,
    question: null,
    options: [
      "신기록",
      "다음 라운드",
      "이 이미지에 묘사된 단어는 무엇인가요?",
      "올바른 답변",
      "문제에 나온 작품",
      "잘못된 답변"
    ],
    word_log: ["interdict", "신기록", "올바른 답변"],
    selected_answer: "이 이미지에 묘사된 단어는 무엇인가요?",
    result: null,
    source_url: "https://www.google.co.in/search?q=google+word+coach&hl=ko&gl=IN"
  });

  assert.equal(record, null);
});

test("records skipped unknown answers without counting skip as vocabulary", () => {
  const record = normalizeCapture({
    captured_at: 5,
    question: "Which word is most similar to abundant? plenty or scarce",
    options: ["SKIP", "plenty", "scarce"],
    word_log: ["abundant", "plenty", "scarce", "skip"],
    selected_answer: "I don't know",
    result: "incorrect",
    source_url: "https://www.google.com/search?q=google+word+coach"
  });

  assert.equal(record.selected_answer, "I don't know");
  assert.deepEqual(record.options, ["plenty", "scarce"]);
  assert.deepEqual(record.word_log, ["abundant", "plenty", "scarce"]);
  assert.equal(record.result, "incorrect");
  assert.deepEqual(
    reviewQueue([record]).map((item) => item.word),
    ["abundant"]
  );
  assert.equal(reviewQueue([record])[0].last_wrong_selected_answer, "I don't know");
});

test("carries original answer options into review items for skipped answers", () => {
  const record = normalizeCapture({
    captured_at: 5,
    question: "Which word is most similar to abundant? plenty or scarce",
    options: ["plenty", "scarce"],
    word_log: ["abundant", "plenty", "scarce"],
    selected_answer: "I don't know",
    correct_answer: "plenty",
    result: "incorrect",
    source_url: "https://www.google.com/search?q=google+word+coach"
  });

  assert.deepEqual(reviewQueue([record])[0].last_wrong_options, ["plenty", "scarce"]);
});

test("infers missing result from question options when explicit options are missing", () => {
  const record = normalizeCapture({
    captured_at: 5,
    question: "Which word is most similar to abundant? plenty or scarce",
    selected_answer: "scarce",
    correct_answer: "plenty",
    result: null,
    source_url: "https://www.google.com/search?q=google+word+coach"
  });

  assert.equal(record.result, "incorrect");
  assert.deepEqual(
    reviewQueue([record]).map((item) => item.word),
    ["abundant"]
  );
});

test("preserves legacy word log prompt when question text is missing", () => {
  const record = normalizeCapture({
    captured_at: 5,
    options: ["plenty", "scarce"],
    word_log: ["abundant", "plenty", "scarce"],
    selected_answer: "scarce",
    correct_answer: "plenty",
    result: "incorrect",
    source_url: "https://www.google.com/search?q=google+word+coach"
  });

  assert.deepEqual(record.word_log, ["abundant", "plenty", "scarce"]);
  assert.deepEqual(
    reviewQueue([record]).map((item) => item.word),
    ["abundant"]
  );
});

test("infers a missing correct answer for incorrect binary captures", () => {
  const record = normalizeCapture({
    captured_at: 5,
    question: "Which word is most similar to abundant? plenty or scarce",
    selected_answer: "scarce",
    result: "incorrect",
    source_url: "https://www.google.com/search?q=google+word+coach"
  });

  assert.equal(record.correct_answer, "plenty");
  assert.deepEqual(record.options, ["plenty", "scarce"]);
  assert.deepEqual(record.word_log, ["abundant", "plenty", "scarce"]);
  assert.equal(reviewQueue([record])[0].last_wrong_correct_answer, "plenty");
});

test("rejects resultless non-option captures before they can affect study history", () => {
  const record = normalizeCapture({
    captured_at: 5,
    question: "Which word is most similar to abundant? plenty or scarce",
    options: ["plenty", "scarce"],
    word_log: ["abundant", "plenty", "scarce"],
    selected_answer: "Next",
    result: null,
    source_url: "https://www.google.com/search?q=google+word+coach"
  });

  assert.equal(record, null);
});

test("filters resultless legacy history on load", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wordcoach-load-filter-"));
  try {
    await fs.writeFile(
      path.join(dir, "history.json"),
      JSON.stringify([
        {
          id: "dirty-record",
          captured_at: 6,
          question: "Which word is most similar to abundant? plenty or scarce",
          options: ["plenty", "scarce"],
          word_log: ["abundant", "plenty", "scarce"],
          selected_answer: "Next",
          result: null,
          source_url: "https://www.google.com/search?q=google+word+coach"
        },
        {
          id: "pending-record",
          captured_at: 10_000,
          question: "Which word is most similar to abundant? plenty or scarce",
          options: ["plenty", "scarce"],
          word_log: ["abundant", "plenty", "scarce"],
          selected_answer: "scarce",
          result: null,
          source_url: "https://www.google.com/search?q=google+word+coach"
        },
        {
          id: "clean-record",
          captured_at: 7,
          question: "Which word is most similar to abundant? plenty or scarce",
          options: ["plenty", "scarce"],
          word_log: ["abundant", "plenty", "scarce"],
          selected_answer: "scarce",
          correct_answer: "plenty",
          result: "incorrect",
          source_url: "https://www.google.com/search?q=google+word+coach"
        }
      ])
    );

    const store = new JsonStore(dir);
    await store.load();

    assert.deepEqual(
      store.snapshot().history.map((record) => record.id),
      ["pending-record", "clean-record"]
    );
    assert.deepEqual(store.snapshot().history_summary, {
      skipped_records: 1,
      duplicate_records: 0
    });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("hides rapid duplicate legacy captures on load", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wordcoach-load-duplicates-"));
  const baseCapture = {
    question: "Which word is most similar to abundant? plenty or scarce",
    options: ["plenty", "scarce"],
    word_log: ["abundant", "plenty", "scarce"],
    selected_answer: "scarce",
    correct_answer: "plenty",
    result: "incorrect",
    source_url: "https://www.google.com/search?q=google+word+coach"
  };
  try {
    await fs.writeFile(
      path.join(dir, "history.json"),
      JSON.stringify([
        { ...baseCapture, id: "duplicate-old", captured_at: 1_000 },
        { ...baseCapture, id: "duplicate-new", captured_at: 1_001 },
        { ...baseCapture, id: "later-real-attempt", captured_at: 11_000 }
      ])
    );

    const store = new JsonStore(dir);
    await store.load();

    const snapshot = store.snapshot();
    assert.deepEqual(
      snapshot.history.map((record) => record.id),
      ["later-real-attempt", "duplicate-new"]
    );
    assert.deepEqual(snapshot.history_summary, {
      skipped_records: 0,
      duplicate_records: 1
    });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("keeps the richer legacy capture when sparse and scored duplicates overlap", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wordcoach-load-rich-duplicate-"));
  try {
    await fs.writeFile(
      path.join(dir, "history.json"),
      JSON.stringify([
        {
          id: "sparse",
          captured_at: 1_000,
          question: "Which word is most similar to abundant? plenty or scarce",
          options: ["plenty", "scarce"],
          word_log: ["abundant", "plenty", "scarce"],
          selected_answer: "scarce",
          result: null,
          source_url: "https://www.google.com/search?q=google+word+coach"
        },
        {
          id: "scored",
          captured_at: 1_900,
          question: "Which word is most similar to abundant? plenty or scarce",
          options: ["plenty", "scarce"],
          word_log: ["abundant", "plenty", "scarce"],
          selected_answer: "scarce",
          correct_answer: "plenty",
          result: "incorrect",
          source_url: "https://www.google.com/search?q=google+word+coach"
        }
      ])
    );

    const store = new JsonStore(dir);
    await store.load();
    const snapshot = store.snapshot();

    assert.deepEqual(
      snapshot.history.map((record) => record.id),
      ["scored"]
    );
    assert.equal(snapshot.history_summary.duplicate_records, 1);
    assert.deepEqual(
      snapshot.review_queue.map((item) => item.word),
      ["abundant"]
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("rejects rapid duplicate live captures before they inflate study history", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wordcoach-live-duplicates-"));
  try {
    const store = new JsonStore(dir);
    await store.load();
    const capture = {
      question: "Which word is most similar to abundant? plenty or scarce",
      options: ["plenty", "scarce"],
      word_log: ["abundant", "plenty", "scarce"],
      selected_answer: "scarce",
      correct_answer: "plenty",
      result: "incorrect",
      source_url: "https://www.google.com/search?q=google+word+coach"
    };

    assert.equal(await store.insertCapture({ ...capture, id: "first", captured_at: 1_000 }), true);
    assert.equal(await store.insertCapture({ ...capture, id: "duplicate", captured_at: 1_001 }), false);
    assert.equal(await store.insertCapture({ ...capture, id: "later", captured_at: 11_000 }), true);
    assert.deepEqual(
      store.snapshot().history.map((record) => record.id),
      ["later", "first"]
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("replaces a sparse live duplicate with a scored capture", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wordcoach-live-rich-duplicate-"));
  try {
    const store = new JsonStore(dir);
    await store.load();
    const capture = {
      question: "Which word is most similar to abundant? plenty or scarce",
      options: ["plenty", "scarce"],
      word_log: ["abundant", "plenty", "scarce"],
      selected_answer: "scarce",
      source_url: "https://www.google.com/search?q=google+word+coach"
    };

    assert.equal(await store.insertCapture({ ...capture, id: "sparse", captured_at: 1_000 }), true);
    assert.equal(
      await store.insertCapture({
        ...capture,
        id: "scored",
        captured_at: 1_900,
        correct_answer: "plenty",
        result: "incorrect"
      }),
      true
    );

    const snapshot = store.snapshot();
    assert.deepEqual(
      snapshot.history.map((record) => record.id),
      ["scored"]
    );
    assert.deepEqual(
      snapshot.review_queue.map((item) => item.word),
      ["abundant"]
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("updates the active lookup word from captured quiz prompts", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wordcoach-current-word-"));
  try {
    const store = new JsonStore(dir);
    await store.load();

    assert.equal(
      await store.insertCapture({
        captured_at: 1_000,
        question: "Which word is most similar to equanimity? composure or forfeiture",
        selected_answer: "composure",
        correct_answer: "composure",
        result: "correct",
        source_url: "https://www.google.com/search?q=google+word+coach"
      }),
      true
    );

    assert.equal(store.snapshot().current_word, "equanimity");

    const reloaded = new JsonStore(dir);
    await reloaded.load();
    assert.equal(reloaded.snapshot().current_word, "equanimity");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("backfills the active lookup word from existing history on load", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wordcoach-current-word-load-"));
  try {
    await fs.writeFile(
      path.join(dir, "settings.json"),
      JSON.stringify({ current_word: "" }, null, 2)
    );
    await fs.writeFile(
      path.join(dir, "history.json"),
      JSON.stringify(
        [
          {
            id: "old-capture",
            captured_at: 1_000,
            question: "Which word is most similar to equanimity? composure or forfeiture",
            selected_answer: "composure",
            result: null,
            source_url: "https://www.google.com/search?q=google+word+coach"
          }
        ],
        null,
        2
      )
    );

    const store = new JsonStore(dir);
    await store.load();

    assert.equal(store.snapshot().current_word, "equanimity");

    const reloaded = new JsonStore(dir);
    await reloaded.load();
    assert.equal(reloaded.snapshot().current_word, "equanimity");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("keeps an existing active lookup word when loading history", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wordcoach-current-word-keep-"));
  try {
    await fs.writeFile(
      path.join(dir, "settings.json"),
      JSON.stringify({ current_word: "abundant" }, null, 2)
    );
    await fs.writeFile(
      path.join(dir, "history.json"),
      JSON.stringify(
        [
          {
            id: "old-capture",
            captured_at: 1_000,
            question: "Which word is most similar to equanimity? composure or forfeiture",
            selected_answer: "composure",
            result: null,
            source_url: "https://www.google.com/search?q=google+word+coach"
          }
        ],
        null,
        2
      )
    );

    const store = new JsonStore(dir);
    await store.load();

    assert.equal(store.snapshot().current_word, "abundant");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("persists a normalized daily study goal", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wordcoach-store-"));
  try {
    const store = new JsonStore(dir);
    await store.load();

    assert.equal(store.snapshot().daily_goal_type, "words");
    assert.equal(store.snapshot().daily_goal, 10);
    assert.equal(store.snapshot().daily_score_goal, 1200);
    await store.setDailyGoal("25");
    await store.setDailyGoalType("score");
    await store.setDailyScoreGoal("2400");
    assert.equal(store.snapshot().daily_goal_type, "score");
    assert.equal(store.snapshot().daily_goal, 25);
    assert.equal(store.snapshot().daily_score_goal, 2400);

    const reloaded = new JsonStore(dir);
    await reloaded.load();
    assert.equal(reloaded.snapshot().daily_goal_type, "score");
    assert.equal(reloaded.snapshot().daily_goal, 25);
    assert.equal(reloaded.snapshot().daily_score_goal, 2400);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("computes score-goal study progress from captured score deltas", async () => {
  const now = Date.now();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wordcoach-score-summary-"));
  try {
    const store = new JsonStore(dir);
    await store.load();
    await store.setDailyGoalType("score");
    await store.setDailyScoreGoal(240);
    await store.insertCapture({
      captured_at: now - 1000,
      question: "WORD COACH Score 120 Which word is similar to alpha? beta or gamma",
      options: ["beta", "gamma"],
      word_log: ["alpha"],
      selected_answer: "beta",
      correct_answer: "beta",
      result: "correct",
      score_before: 0,
      score_after: 120,
      source_url: "https://www.google.com/search?q=google+word+coach"
    });
    await store.insertCapture({
      captured_at: now - 900,
      question: "WORD COACH Score 240 Which word is similar to beta? delta or gamma",
      options: ["delta", "gamma"],
      word_log: ["beta"],
      selected_answer: "delta",
      correct_answer: "delta",
      result: "correct",
      score_delta: 120,
      source_url: "https://www.google.com/search?q=google+word+coach"
    });

    const snapshot = store.snapshot();
    assert.equal(snapshot.history[1].score_delta, 120);
    assert.equal(snapshot.study_summary.goal_type, "score");
    assert.equal(snapshot.study_summary.word_count, 2);
    assert.equal(snapshot.study_summary.score, 240);
    assert.equal(snapshot.study_summary.today, 240);
    assert.equal(snapshot.study_summary.target, 240);
    assert.equal(snapshot.study_summary.remaining, 0);
    assert.equal(snapshot.study_summary.progress, 100);
    assert.equal(snapshot.study_summary.days[snapshot.study_summary.days.length - 1].count, 240);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("computes study summary from full history when snapshot history is limited", async () => {
  const now = Date.now();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wordcoach-study-summary-"));
  try {
    const store = new JsonStore(dir);
    await store.load();
    await store.setDailyGoal(2);
    await store.insertCapture({
      captured_at: now - 1000,
      options: ["alpha"],
      word_log: ["alpha"],
      selected_answer: "alpha",
      correct_answer: "alpha",
      result: "correct",
      source_url: "wordcoach://manual"
    });
    await store.insertCapture({
      captured_at: now - 900,
      options: ["beta"],
      word_log: ["beta"],
      selected_answer: "beta",
      correct_answer: "beta",
      result: "correct",
      source_url: "wordcoach://manual"
    });

    const snapshot = store.snapshot(1);
    assert.equal(snapshot.history.length, 1);
    assert.equal(snapshot.study_summary.today, 2);
    assert.equal(snapshot.study_summary.remaining, 0);
    assert.equal(snapshot.study_summary.progress, 100);
    assert.equal(snapshot.study_summary.accuracy, null);
    assert.equal(snapshot.study_summary.streak, 1);
    assert.equal(snapshot.study_summary.days.length, 7);
    assert.equal(snapshot.study_summary.days[snapshot.study_summary.days.length - 1].count, 2);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("excludes manually added study words from answer accuracy", async () => {
  const now = Date.now();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wordcoach-manual-accuracy-"));
  try {
    const store = new JsonStore(dir);
    await store.load();
    await store.insertCapture({
      captured_at: now - 1000,
      options: ["alpha"],
      word_log: ["alpha"],
      selected_answer: "alpha",
      correct_answer: "alpha",
      result: "correct",
      source_url: "wordcoach://manual"
    });
    await store.insertCapture({
      captured_at: now - 900,
      question: "Which word is most similar to beta? delta or gamma",
      options: ["delta", "gamma"],
      word_log: ["beta"],
      selected_answer: "delta",
      correct_answer: "gamma",
      result: "incorrect",
      source_url: "https://www.google.com/search?q=google+word+coach"
    });

    const summary = store.snapshot().study_summary;
    assert.equal(summary.today, 2);
    assert.equal(summary.accuracy, 0);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("records manually studied lookup words", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wordcoach-manual-word-"));
  try {
    const store = new JsonStore(dir);
    await store.load();

    assert.equal(await store.addStudyWord(" Abundant! "), true);

    const snapshot = store.snapshot();
    assert.equal(snapshot.history.length, 1);
    assert.deepEqual(snapshot.history[0].word_log, ["abundant"]);
    assert.equal(snapshot.history[0].selected_answer, "abundant");
    assert.equal(snapshot.history[0].correct_answer, "abundant");
    assert.equal(snapshot.history[0].result, "correct");
    assert.equal(snapshot.history[0].source_url, "wordcoach://manual");

    const reloaded = new JsonStore(dir);
    await reloaded.load();
    assert.deepEqual(
      reloaded.snapshot().history.map((record) => record.word_log[0]),
      ["abundant"]
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("manual study does not advance due review progress", async () => {
  const now = Date.now();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wordcoach-manual-review-"));
  try {
    const store = new JsonStore(dir);
    await store.load();
    await store.insertCapture({
      captured_at: now - 10_000,
      question: "Which word is most similar to abundant? plenty or scarce",
      options: ["plenty", "scarce"],
      word_log: ["abundant"],
      selected_answer: "scarce",
      correct_answer: "plenty",
      result: "incorrect",
      source_url: "https://www.google.com/search?q=google+word+coach"
    });

    assert.deepEqual(
      store.snapshot().review_queue.map((item) => item.word),
      ["abundant"]
    );

    await store.addStudyWord("abundant", now - 5_000);

    assert.deepEqual(
      store.snapshot().review_queue.map((item) => item.word),
      ["abundant"]
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("normal quiz correct answers advance due review progress", async () => {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wordcoach-quiz-review-"));
  try {
    const store = new JsonStore(dir);
    await store.load();
    await store.insertCapture({
      captured_at: now - 10_000,
      question: "Which word is most similar to abundant? plenty or scarce",
      options: ["plenty", "scarce"],
      word_log: ["abundant"],
      selected_answer: "scarce",
      correct_answer: "plenty",
      result: "incorrect",
      source_url: "https://www.google.com/search?q=google+word+coach"
    });
    await store.insertCapture({
      captured_at: now - 5_000,
      question: "Which word is most similar to abundant? plenty or scarce",
      options: ["plenty", "scarce"],
      word_log: ["abundant"],
      selected_answer: "plenty",
      correct_answer: "plenty",
      result: "correct",
      source_url: "https://www.google.com/search?q=google+word+coach"
    });

    assert.deepEqual(store.snapshot().review_queue, []);
    assert.deepEqual(
      reviewQueue(store.snapshot().history, 6, now + oneDay + 1).map((item) => item.word),
      ["abundant"]
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("imports settings from a Word Coach export", async () => {
  const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), "wordcoach-export-source-"));
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), "wordcoach-export-target-"));
  try {
    const source = new JsonStore(sourceDir);
    await source.load();
    await source.setDailyGoal(31);
    const exportPath = path.join(sourceDir, "history.wcoach.json");
    await source.exportTo(exportPath);

    const target = new JsonStore(targetDir);
    await target.load();
    await target.setDailyGoal(4);
    await target.setCurrentWord("abundant");
    const imported = await target.importFrom(exportPath);

    assert.deepEqual(imported, {
      records_imported: 0,
      records_updated: 0,
      records_skipped: 0,
      records_duplicates: 0,
      settings_imported: true
    });
    assert.equal(target.snapshot().daily_goal, 31);
    assert.equal(target.snapshot().current_word, "abundant");
  } finally {
    await fs.rm(sourceDir, { recursive: true, force: true });
    await fs.rm(targetDir, { recursive: true, force: true });
  }
});

test("imports a non-empty active lookup word from settings exports", async () => {
  const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), "wordcoach-export-word-source-"));
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), "wordcoach-export-word-target-"));
  try {
    const source = new JsonStore(sourceDir);
    await source.load();
    await source.setCurrentWord("equanimity");
    const exportPath = path.join(sourceDir, "history.wcoach.json");
    await source.exportTo(exportPath);

    const target = new JsonStore(targetDir);
    await target.load();
    await target.importFrom(exportPath);

    assert.equal(target.snapshot().current_word, "equanimity");
  } finally {
    await fs.rm(sourceDir, { recursive: true, force: true });
    await fs.rm(targetDir, { recursive: true, force: true });
  }
});

test("keeps an existing active lookup word when importing non-empty settings", async () => {
  const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), "wordcoach-export-word-keep-source-"));
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), "wordcoach-export-word-keep-target-"));
  try {
    const source = new JsonStore(sourceDir);
    await source.load();
    await source.setCurrentWord("equanimity");
    const exportPath = path.join(sourceDir, "history.wcoach.json");
    await source.exportTo(exportPath);

    const target = new JsonStore(targetDir);
    await target.load();
    await target.setCurrentWord("abundant");
    await target.importFrom(exportPath);

    assert.equal(target.snapshot().current_word, "abundant");
  } finally {
    await fs.rm(sourceDir, { recursive: true, force: true });
    await fs.rm(targetDir, { recursive: true, force: true });
  }
});

test("reports imported records separately from settings", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wordcoach-import-records-"));
  try {
    const importPath = path.join(dir, "legacy-history.json");
    await fs.writeFile(
      importPath,
      JSON.stringify([
        {
          id: "legacy-record",
          captured_at: 5,
          question: 'Which word is most similar to "Abundant"? plenty or scarce',
          options: ["plenty", "scarce"],
          selected_answer: "scarce",
          correct_answer: "plenty",
          result: "incorrect",
          source_url: "https://www.google.com/search?q=google+word+coach"
        }
      ])
    );

    const store = new JsonStore(dir);
    await store.load();
    const imported = await store.importFrom(importPath);

    assert.deepEqual(imported, {
      records_imported: 1,
      records_updated: 0,
      records_skipped: 0,
      records_duplicates: 0,
      settings_imported: false
    });
    assert.equal(store.snapshot().history.length, 1);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("sets the active lookup word from imported history when none is selected", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wordcoach-import-current-word-"));
  try {
    const importPath = path.join(dir, "legacy-history.json");
    await fs.writeFile(
      importPath,
      JSON.stringify([
        {
          id: "legacy-record",
          captured_at: 5,
          question: "Which word is most similar to equanimity? composure or forfeiture",
          selected_answer: "composure",
          correct_answer: "composure",
          result: "correct",
          source_url: "https://www.google.com/search?q=google+word+coach"
        }
      ])
    );

    const store = new JsonStore(dir);
    await store.load();
    await store.importFrom(importPath);

    assert.equal(store.snapshot().current_word, "equanimity");

    const reloaded = new JsonStore(dir);
    await reloaded.load();
    assert.equal(reloaded.snapshot().current_word, "equanimity");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("reports skipped non-option resultless records during import", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wordcoach-import-skipped-"));
  try {
    const importPath = path.join(dir, "dirty-history.json");
    await fs.writeFile(
      importPath,
      JSON.stringify([
        {
          id: "dirty-record",
          captured_at: 6,
          question: "Which word is most similar to abundant? plenty or scarce",
          options: ["plenty", "scarce"],
          word_log: ["abundant", "plenty", "scarce"],
          selected_answer: "Next",
          result: null,
          source_url: "https://www.google.com/search?q=google+word+coach"
        }
      ])
    );

    const store = new JsonStore(dir);
    await store.load();
    const imported = await store.importFrom(importPath);

    assert.deepEqual(imported, {
      records_imported: 0,
      records_updated: 0,
      records_skipped: 1,
      records_duplicates: 0,
      settings_imported: false
    });
    assert.equal(store.snapshot().history.length, 0);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("reports duplicate records separately during import", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wordcoach-import-duplicates-"));
  const capture = {
    question: "Which word is most similar to abundant? plenty or scarce",
    options: ["plenty", "scarce"],
    word_log: ["abundant", "plenty", "scarce"],
    selected_answer: "scarce",
    correct_answer: "plenty",
    result: "incorrect",
    source_url: "https://www.google.com/search?q=google+word+coach"
  };
  try {
    const store = new JsonStore(dir);
    await store.load();
    await store.insertCapture({ ...capture, id: "existing", captured_at: 1_000 });

    const importPath = path.join(dir, "duplicate-history.json");
    await fs.writeFile(
      importPath,
      JSON.stringify([
        { ...capture, id: "duplicate", captured_at: 1_001 },
        { ...capture, id: "same-id", captured_at: 1_002 },
        { ...capture, id: "later-real-attempt", captured_at: 11_000 }
      ])
    );

    const imported = await store.importFrom(importPath);

    assert.deepEqual(imported, {
      records_imported: 1,
      records_updated: 0,
      records_skipped: 0,
      records_duplicates: 2,
      settings_imported: false
    });
    assert.deepEqual(
      store.snapshot().history.map((record) => record.id),
      ["later-real-attempt", "existing"]
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("replaces an existing sparse duplicate with a richer imported capture", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wordcoach-import-rich-duplicate-"));
  const capture = {
    question: "Which word is most similar to abundant? plenty or scarce",
    options: ["plenty", "scarce"],
    word_log: ["abundant", "plenty", "scarce"],
    selected_answer: "scarce",
    source_url: "https://www.google.com/search?q=google+word+coach"
  };
  try {
    const store = new JsonStore(dir);
    await store.load();
    await store.insertCapture({ ...capture, id: "sparse", captured_at: 1_000 });

    const importPath = path.join(dir, "richer-history.json");
    await fs.writeFile(
      importPath,
      JSON.stringify([
        {
          ...capture,
          id: "scored",
          captured_at: 1_900,
          correct_answer: "plenty",
          result: "incorrect"
        }
      ])
    );

    const imported = await store.importFrom(importPath);

    assert.deepEqual(imported, {
      records_imported: 0,
      records_updated: 1,
      records_skipped: 0,
      records_duplicates: 0,
      settings_imported: false
    });
    assert.deepEqual(
      store.snapshot().history.map((record) => record.id),
      ["scored"]
    );
    assert.deepEqual(
      store.snapshot().review_queue.map((item) => item.word),
      ["abundant"]
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("keeps incorrect words due until reviewed correctly later", () => {
  const now = Date.UTC(2026, 0, 10);
  const oneDay = 24 * 60 * 60 * 1000;
  const due = reviewQueue(
    [
      {
        id: "old-correct",
        captured_at: now - oneDay / 2,
        word_log: ["abundant"],
        result: "correct"
      },
      {
        id: "wrong",
        captured_at: now - oneDay * 2,
        word_log: ["abundant"],
        result: "incorrect"
      },
      {
        id: "open-wrong",
        captured_at: now - 60_000,
        word_log: ["scarce"],
        question: 'Which word is most similar to "Abundant"? plenty or scarce',
        selected_answer: "scarce",
        correct_answer: "plenty",
        result: "incorrect"
      }
    ],
    6,
    now
  );

  assert.deepEqual(
    due.map((item) => item.word),
    ["abundant"]
  );
  assert.equal(due[0].last_wrong_selected_answer, "scarce");
  assert.equal(due[0].last_wrong_correct_answer, "plenty");
});

test("reviews the correct answer when a missed prompt has no reviewable prompt word", () => {
  const now = Date.UTC(2026, 0, 10);
  const due = reviewQueue(
    [
      normalizeCapture({
        captured_at: now - 60_000,
        question: "What's shown in this image? Worn Out or Wrought",
        options: ["Worn Out", "Wrought"],
        word_log: ["worn out", "wrought"],
        selected_answer: "Wrought",
        correct_answer: "Worn Out",
        result: "incorrect",
        source_url: "https://www.google.com/search?q=google+word+coach"
      })
    ],
    6,
    now
  );

  assert.deepEqual(
    due.map((item) => item.word),
    ["worn out"]
  );
  assert.equal(due[0].last_wrong_selected_answer, "Wrought");
  assert.equal(due[0].last_wrong_correct_answer, "Worn Out");
});

test("orders due reviews by mistake count before oldest due time", () => {
  const now = Date.UTC(2026, 0, 10);
  const oneDay = 24 * 60 * 60 * 1000;
  const due = reviewQueue(
    [
      {
        id: "steady-wrong",
        captured_at: now - oneDay * 4,
        word_log: ["steady"],
        result: "incorrect"
      },
      {
        id: "abundant-wrong-1",
        captured_at: now - oneDay * 2,
        word_log: ["abundant"],
        result: "incorrect"
      },
      {
        id: "abundant-wrong-2",
        captured_at: now - oneDay,
        word_log: ["abundant"],
        result: "incorrect"
      }
    ],
    6,
    now
  );

  assert.deepEqual(
    due.map((item) => item.word),
    ["abundant", "steady"]
  );
});

test("marks a due review word as known and schedules the next review", async () => {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wordcoach-review-known-"));
  try {
    const store = new JsonStore(dir);
    await store.load();
    await store.insertCapture({
      captured_at: now - oneDay * 2,
      question: "Which word is most similar to abundant? plenty or scarce",
      options: ["plenty", "scarce"],
      word_log: ["abundant"],
      selected_answer: "scarce",
      correct_answer: "plenty",
      result: "incorrect",
      source_url: "https://www.google.com/search?q=google+word+coach"
    });

    assert.deepEqual(
      store.snapshot().review_queue.map((item) => item.word),
      ["abundant"]
    );

    assert.equal(await store.markReviewKnown("abundant", now), true);

    const snapshot = store.snapshot();
    assert.deepEqual(
      snapshot.review_queue.map((item) => item.word),
      []
    );
    assert.equal(snapshot.review_summary.due_count, 0);
    assert.equal(snapshot.review_summary.pending_count, 1);
    assert.equal(snapshot.review_summary.next_due_at, now + oneDay);
    assert.equal(snapshot.history[0].word_log[0], "abundant");
    assert.equal(snapshot.history[0].selected_answer, "plenty");
    assert.equal(snapshot.history[0].correct_answer, "plenty");
    assert.equal(snapshot.history[0].result, "correct");
    assert.equal(snapshot.history[0].source_url, "wordcoach://review");
    assert.equal(snapshot.current_word, "abundant");

    const reloaded = new JsonStore(dir);
    await reloaded.load();
    assert.equal(reloaded.snapshot().current_word, "abundant");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("records review answers and keeps wrong answers due", async () => {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wordcoach-review-answer-"));
  try {
    const store = new JsonStore(dir);
    await store.load();
    await store.insertCapture({
      captured_at: now - oneDay * 2,
      question: "Which word is most similar to abundant? plenty or scarce",
      options: ["abundant"],
      word_log: ["abundant"],
      selected_answer: "scarce",
      correct_answer: "plenty",
      result: "incorrect",
      source_url: "https://www.google.com/search?q=google+word+coach"
    });

    assert.deepEqual(await store.answerReview("abundant", "scarce", now), {
      word: "abundant",
      result: "incorrect"
    });
    assert.equal(store.snapshot().review_summary.due_count, 1);
    assert.equal(store.snapshot().history[0].selected_answer, "scarce");
    assert.equal(store.snapshot().history[0].result, "incorrect");
    assert.equal(store.snapshot().current_word, "abundant");
    assert.equal(
      store.snapshot().review_queue[0].last_wrong_question,
      "Which word is most similar to abundant? plenty or scarce"
    );

    assert.deepEqual(await store.answerReview("abundant", "plenty", now + oneDay), {
      word: "abundant",
      result: "correct"
    });

    const snapshot = store.snapshot();
    assert.equal(snapshot.review_summary.due_count, 0);
    assert.equal(snapshot.review_summary.pending_count, 1);
    assert.equal(snapshot.review_summary.next_due_at, now + oneDay * 2);
    assert.equal(snapshot.history[0].selected_answer, "plenty");
    assert.equal(snapshot.history[0].correct_answer, "plenty");
    assert.equal(snapshot.history[0].source_url, "wordcoach://review");
    assert.equal(snapshot.current_word, "abundant");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("preserves original answer options in review answer history", async () => {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wordcoach-review-answer-options-"));
  try {
    const store = new JsonStore(dir);
    await store.load();
    await store.insertCapture({
      captured_at: now - oneDay * 2,
      question: "Which picture matches this word?",
      options: ["Worn Out", "Wrought"],
      word_log: ["Worn Out", "Wrought"],
      selected_answer: "Wrought",
      correct_answer: "Worn Out",
      result: "incorrect",
      source_url: "https://www.google.com/search?q=google+word+coach"
    });

    assert.deepEqual(
      store.snapshot().review_queue.map((item) => item.word),
      ["worn out"]
    );
    assert.deepEqual(store.snapshot().review_queue[0].last_wrong_options, [
      "Worn Out",
      "Wrought"
    ]);

    assert.deepEqual(await store.answerReview("worn out", "Wrought", now), {
      word: "worn out",
      result: "incorrect"
    });

    const snapshot = store.snapshot();
    assert.deepEqual(snapshot.history[0].options, ["Worn Out", "Wrought"]);
    assert.equal(snapshot.history[0].selected_answer, "Wrought");
    assert.equal(snapshot.history[0].correct_answer, "Worn Out");
    assert.deepEqual(snapshot.review_queue[0].last_wrong_options, ["Worn Out", "Wrought"]);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("returns corrected mistakes when their next review interval is due", () => {
  const now = Date.UTC(2026, 0, 10);
  const oneDay = 24 * 60 * 60 * 1000;
  const due = reviewQueue(
    [
      {
        id: "wrong",
        captured_at: now - oneDay * 3,
        word_log: ["abundant"],
        result: "incorrect"
      },
      {
        id: "correct",
        captured_at: now - oneDay * 2,
        word_log: ["abundant"],
        result: "correct"
      }
    ],
    6,
    now
  );

  assert.equal(due.length, 1);
  assert.equal(due[0].word, "abundant");
  assert.equal(due[0].result, "correct");
  assert.equal(due[0].mistakes, 1);
});

test("summarizes pending reviews before they are due", () => {
  const now = Date.UTC(2026, 0, 10);
  const oneDay = 24 * 60 * 60 * 1000;
  const records = [
    {
      id: "wrong",
      captured_at: now - oneDay,
      word_log: ["abundant"],
      result: "incorrect"
    },
    {
      id: "correct",
      captured_at: now - oneDay / 2,
      word_log: ["abundant"],
      result: "correct"
    }
  ];

  assert.deepEqual(reviewQueue(records, 6, now), []);
  assert.deepEqual(reviewSummary(records, now), {
    due_count: 0,
    pending_count: 1,
    next_due_at: now + oneDay / 2
  });
  assert.deepEqual(
    reviewBacklog(records, 4, now).map((item) => ({
      word: item.word,
      due_at: item.due_at,
      mistakes: item.mistakes
    })),
    [{ word: "abundant", due_at: now + oneDay / 2, mistakes: 1 }]
  );
});

test("orders upcoming review backlog by next due time", () => {
  const now = Date.UTC(2026, 0, 10);
  const oneDay = 24 * 60 * 60 * 1000;
  const records = [
    {
      id: "steady-wrong",
      captured_at: now - oneDay * 2,
      word_log: ["steady"],
      result: "incorrect"
    },
    {
      id: "steady-correct",
      captured_at: now - oneDay / 4,
      word_log: ["steady"],
      result: "correct"
    },
    {
      id: "abundant-wrong",
      captured_at: now - oneDay,
      word_log: ["abundant"],
      result: "incorrect"
    },
    {
      id: "abundant-correct",
      captured_at: now - oneDay / 2,
      word_log: ["abundant"],
      result: "correct"
    },
    {
      id: "careful-wrong",
      captured_at: now - oneDay * 3,
      word_log: ["careful"],
      result: "incorrect"
    }
  ];

  assert.deepEqual(
    reviewBacklog(records, 2, now).map((item) => item.word),
    ["abundant", "steady"]
  );
});

test("graduates review words after the final spaced review is answered correctly", () => {
  const start = Date.UTC(2026, 0, 1);
  const oneDay = 24 * 60 * 60 * 1000;
  const correctAt = [
    start + 60_000,
    start + oneDay + 60_000,
    start + oneDay * 4 + 60_000,
    start + oneDay * 11 + 60_000,
    start + oneDay * 25 + 60_000,
    start + oneDay * 55 + 60_000
  ];
  const records = [
    {
      id: "wrong",
      captured_at: start,
      word_log: ["abundant"],
      result: "incorrect"
    },
    ...correctAt.map((capturedAt, index) => ({
      id: `correct-${index}`,
      captured_at: capturedAt,
      word_log: ["abundant"],
      result: "correct"
    }))
  ];

  assert.deepEqual(reviewQueue(records, 6, start + oneDay * 56), []);
  assert.deepEqual(reviewSummary(records, start + oneDay * 56), {
    due_count: 0,
    pending_count: 0,
    next_due_at: null
  });
});

test("rejects unusable daily study goals", () => {
  assert.equal(normalizeDailyGoal(0), 10);
  assert.equal(normalizeDailyGoal(101), 10);
  assert.equal(normalizeDailyGoal("abc"), 10);
  assert.equal(normalizeDailyGoal(12.4), 12);
  assert.equal(normalizeDailyGoalType("score"), "score");
  assert.equal(normalizeDailyGoalType("words"), "words");
  assert.equal(normalizeDailyGoalType("bad"), "words");
  assert.equal(normalizeDailyScoreGoal(0), 1200);
  assert.equal(normalizeDailyScoreGoal(100_001), 1200);
  assert.equal(normalizeDailyScoreGoal("abc"), 1200);
  assert.equal(normalizeDailyScoreGoal(239.6), 240);
});
