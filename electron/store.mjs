import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { DEFAULT_LOCALE_CHOICE, normalizeLocaleChoice } from "./i18n.mjs";

const DEFAULT_DAILY_GOAL = 10;
const DEFAULT_DAILY_SCORE_GOAL = 1200;
const DUPLICATE_CAPTURE_WINDOW_MS = 5_000;
const REVIEW_GRADUATION_STREAK = 6;
const GOAL_TYPES = new Set(["words", "score"]);

const DEFAULT_SETTINGS = {
  dictionary_provider: "dictionary",
  dictionary_mode: "dictionary",
  preload_eagerness: "preconnect",
  dark_mode: "system",
  cosmetic_adblock: true,
  locale_choice: DEFAULT_LOCALE_CHOICE,
  daily_goal_type: "words",
  daily_goal: DEFAULT_DAILY_GOAL,
  daily_score_goal: DEFAULT_DAILY_SCORE_GOAL,
  current_word: ""
};

export class JsonStore {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.settingsPath = path.join(baseDir, "settings.json");
    this.historyPath = path.join(baseDir, "history.json");
    this.settings = { ...DEFAULT_SETTINGS };
    this.history = [];
    this.historySkippedRecords = 0;
    this.historyDuplicateRecords = 0;
  }

  async load() {
    await fs.mkdir(this.baseDir, { recursive: true });
    this.settings = normalizeSettings(await readJson(this.settingsPath, {}));
    const history = await readJson(this.historyPath, []);
    const normalizedHistory = Array.isArray(history)
      ? history.map(normalizeCapture)
      : [];
    this.historySkippedRecords = normalizedHistory.filter((record) => !record).length;
    const deduped = dedupeRapidCaptures(normalizedHistory.filter(Boolean).sort(byCapturedAtDesc));
    this.historyDuplicateRecords = deduped.duplicateRecords;
    this.history = deduped.records;
    await this.backfillCurrentWordFromHistory();
  }

  snapshot(limit = 300) {
    const now = Date.now();
    const summary = reviewSummary(this.history, now);
    return {
      provider: this.settings.dictionary_provider,
      dictionary_mode: this.settings.dictionary_mode,
      preload_eagerness: this.settings.preload_eagerness,
      dark_mode: this.settings.dark_mode,
      cosmetic_adblock: this.settings.cosmetic_adblock,
      locale_choice: this.settings.locale_choice,
      daily_goal_type: this.settings.daily_goal_type,
      daily_goal: this.settings.daily_goal,
      daily_score_goal: this.settings.daily_score_goal,
      current_word: this.settings.current_word,
      review_queue: reviewQueue(this.history, 6, now),
      review_backlog: reviewBacklog(this.history, 4, now),
      review_summary: summary,
      study_summary: studySummary(this.history, this.settings, now, summary),
      history_summary: {
        skipped_records: this.historySkippedRecords,
        duplicate_records: this.historyDuplicateRecords
      },
      history: this.history.slice(0, limit)
    };
  }

  async setProvider(provider) {
    this.settings.dictionary_provider = normalizeProvider(provider);
    await writeJson(this.settingsPath, this.settings);
  }

  async setDictionaryMode(mode) {
    this.settings.dictionary_mode = normalizeDictionaryMode(mode);
    await writeJson(this.settingsPath, this.settings);
  }

  async setPreloadEagerness(eagerness) {
    this.settings.preload_eagerness = normalizePreloadEagerness(eagerness);
    await writeJson(this.settingsPath, this.settings);
  }

  async setDarkMode(mode) {
    this.settings.dark_mode = normalizeDarkMode(mode);
    await writeJson(this.settingsPath, this.settings);
  }

  async setCosmeticAdblock(enabled) {
    this.settings.cosmetic_adblock = normalizeBoolean(enabled, true);
    await writeJson(this.settingsPath, this.settings);
  }

  async setLocaleChoice(choice) {
    this.settings.locale_choice = normalizeLocaleChoice(choice);
    await writeJson(this.settingsPath, this.settings);
  }

  async setDailyGoal(goal) {
    this.settings.daily_goal = normalizeDailyGoal(goal);
    await writeJson(this.settingsPath, this.settings);
  }

  async setDailyGoalType(type) {
    this.settings.daily_goal_type = normalizeDailyGoalType(type);
    await writeJson(this.settingsPath, this.settings);
  }

  async setDailyScoreGoal(goal) {
    this.settings.daily_score_goal = normalizeDailyScoreGoal(goal);
    await writeJson(this.settingsPath, this.settings);
  }

  async setCurrentWord(word) {
    this.settings.current_word = cleanText(word, 160) || "";
    await writeJson(this.settingsPath, this.settings);
  }

  async insertCapture(capture) {
    const record = normalizeCapture(capture);
    const result = this.upsertCapture(record);
    if (!result.inserted) {
      return false;
    }
    this.history.sort(byCapturedAtDesc);
    const currentWord = currentWordFromCapture(record);
    if (currentWord) {
      this.settings.current_word = currentWord;
    }
    await writeJson(this.historyPath, this.history);
    if (currentWord) {
      await writeJson(this.settingsPath, this.settings);
    }
    return true;
  }

  async addStudyWord(word, now = Date.now()) {
    const studiedWord = cleanWord(word);
    if (!studiedWord) {
      return false;
    }
    return this.insertCapture({
      captured_at: now,
      options: [studiedWord],
      word_log: [studiedWord],
      selected_answer: studiedWord,
      correct_answer: studiedWord,
      result: "correct",
      source_url: "wordcoach://manual"
    });
  }

  async markReviewKnown(word, now = Date.now()) {
    const item = dueReviewItemForWord(this.history, word, now);
    if (!item) {
      return false;
    }
    const options = reviewRecordOptions(item);
    const correctAnswer = cleanText(item.last_wrong_correct_answer, 160) || item.word;
    const record = normalizeCapture({
      captured_at: now,
      question: item.last_wrong_question || `Review ${item.word}`,
      options,
      word_log: [item.word],
      selected_answer: correctAnswer,
      correct_answer: correctAnswer,
      result: "correct",
      source_url: "wordcoach://review"
    });
    if (!record) {
      return false;
    }
    this.history.unshift(record);
    this.history.sort(byCapturedAtDesc);
    this.settings.current_word = item.word;
    await writeJson(this.historyPath, this.history);
    await writeJson(this.settingsPath, this.settings);
    return true;
  }

  async answerReview(word, answer, now = Date.now()) {
    const item = dueReviewItemForWord(this.history, word, now);
    const selectedAnswer = cleanText(answer, 160);
    if (!item || !selectedAnswer) {
      return null;
    }
    const correctAnswer = cleanText(item.last_wrong_correct_answer, 160) || item.word;
    const result = sameWord(selectedAnswer, correctAnswer) ? "correct" : "incorrect";
    const options = reviewRecordOptions(item);
    const record = normalizeCapture({
      captured_at: now,
      question: item.last_wrong_question || `Review ${item.word}`,
      options,
      word_log: [item.word],
      selected_answer: selectedAnswer,
      correct_answer: correctAnswer,
      result,
      source_url: "wordcoach://review"
    });
    if (!record) {
      return null;
    }
    this.history.unshift(record);
    this.history.sort(byCapturedAtDesc);
    this.settings.current_word = item.word;
    await writeJson(this.historyPath, this.history);
    await writeJson(this.settingsPath, this.settings);
    return {
      word: item.word,
      result
    };
  }

  async exportTo(filePath) {
    await writeJson(filePath, {
      version: 1,
      exported_at: Date.now(),
      settings: this.settings,
      history: this.history
    });
  }

  async importFrom(filePath) {
    const data = await readJson(filePath, null);
    const records = Array.isArray(data) ? data : data?.history;
    if (!Array.isArray(records)) {
      throw new Error("Invalid Word Coach export.");
    }

    let settingsImported = false;
    if (!Array.isArray(data) && data?.settings && typeof data.settings === "object") {
      this.settings = normalizeSettings({
        ...this.settings,
        ...settingsForImport(data.settings, this.settings)
      });
      await writeJson(this.settingsPath, this.settings);
      settingsImported = true;
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let duplicates = 0;
    for (const item of records) {
      const record = normalizeCapture(item);
      if (!record) {
        skipped += 1;
        continue;
      }
      const result = this.upsertCapture(record);
      if (!result.inserted) {
        duplicates += 1;
        continue;
      }
      if (result.replaced) {
        updated += 1;
      } else {
        imported += 1;
      }
    }

    if (imported > 0 || updated > 0) {
      this.history.sort(byCapturedAtDesc);
      await writeJson(this.historyPath, this.history);
    }
    await this.backfillCurrentWordFromHistory();
    return {
      records_imported: imported,
      records_updated: updated,
      records_skipped: skipped,
      records_duplicates: duplicates,
      settings_imported: settingsImported
    };
  }

  async backfillCurrentWordFromHistory() {
    if (this.settings.current_word) {
      return false;
    }
    const currentWord = this.history.map(currentWordFromCapture).find(Boolean);
    if (!currentWord) {
      return false;
    }
    this.settings.current_word = currentWord;
    await writeJson(this.settingsPath, this.settings);
    return true;
  }

  upsertCapture(record) {
    if (!record || this.history.some((item) => item.id === record.id)) {
      return { inserted: false };
    }
    const duplicateIndex = rapidDuplicateCaptureIndex(record, this.history);
    if (duplicateIndex >= 0) {
      if (!captureRicherThan(record, this.history[duplicateIndex])) {
        return { inserted: false };
      }
      this.history[duplicateIndex] = record;
      return { inserted: true, replaced: true };
    }
    this.history.unshift(record);
    return { inserted: true, replaced: false };
  }
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await fs.rename(tmpPath, filePath);
}

function normalizeSettings(settings) {
  const raw = settings && typeof settings === "object" ? settings : {};
  const normalized = {
    ...DEFAULT_SETTINGS,
    ...raw
  };
  normalized.dictionary_provider = normalizeProvider(normalized.dictionary_provider);
  normalized.dictionary_mode = normalizeDictionaryMode(normalized.dictionary_mode);
  normalized.preload_eagerness = normalizePreloadEagerness(normalized.preload_eagerness);
  normalized.dark_mode = normalizeDarkMode(normalized.dark_mode);
  normalized.cosmetic_adblock = normalizeBoolean(normalized.cosmetic_adblock, true);
  normalized.locale_choice = normalizeLocaleChoice(normalized.locale_choice);
  normalized.daily_goal_type = normalizeDailyGoalType(normalized.daily_goal_type);
  normalized.daily_goal = normalizeDailyGoal(normalized.daily_goal);
  normalized.daily_score_goal = normalizeDailyScoreGoal(normalized.daily_score_goal);
  normalized.current_word = cleanText(normalized.current_word, 160) || "";
  return normalized;
}

function settingsForImport(settings, currentSettings = {}) {
  const imported = { ...settings };
  if (
    !cleanText(imported.current_word, 160) ||
    cleanText(currentSettings.current_word, 160)
  ) {
    delete imported.current_word;
  }
  return imported;
}

export function normalizeCapture(capture) {
  if (!capture || typeof capture !== "object") {
    return null;
  }
  const capturedAt = Number.isFinite(capture.captured_at) ? capture.captured_at : Date.now();
  const question = cleanText(capture.question, 500);
  const selectedAnswer = cleanText(capture.selected_answer, 160);
  const providedCorrectAnswer = cleanText(capture.correct_answer, 160);
  const sourceUrl = cleanText(capture.source_url, 500) || "";
  const options = normalizeCaptureOptions(capture.options, question);
  const result =
    normalizeResult(capture.result) ||
    resultFromAnswers(selectedAnswer, providedCorrectAnswer, options, question);
  if (!selectedAnswerAllowed(selectedAnswer, options, question, result)) {
    return null;
  }
  const correctAnswer = inferredCorrectAnswer(
    selectedAnswer,
    providedCorrectAnswer,
    options,
    question,
    result
  );
  if (!result && !selectedAnswerMatchesOption(selectedAnswer, options, question)) {
    return null;
  }
  const wordLog = normalizeWordLog(capture.word_log, question, options, selectedAnswer, correctAnswer);
  if (wordLog.length === 0) {
    return null;
  }
  const id =
    cleanText(capture.id, 120) || stableId(capturedAt, question, selectedAnswer, correctAnswer);
  const scoreBefore = normalizeScore(capture.score_before);
  const scoreAfter = normalizeScore(capture.score_after ?? capture.score ?? scoreFromQuestion(question));
  const scoreDelta = normalizeScoreDelta(capture.score_delta, scoreBefore, scoreAfter);

  return {
    id,
    captured_at: capturedAt,
    question,
    options,
    word_log: wordLog,
    selected_answer: selectedAnswer,
    correct_answer: correctAnswer,
    result,
    source_url: sourceUrl,
    score_before: scoreBefore,
    score_after: scoreAfter,
    score_delta: scoreDelta,
    extractor_version: Number.isFinite(capture.extractor_version)
      ? capture.extractor_version
      : 1
  };
}

function normalizeCaptureOptions(rawOptions, question) {
  const questionOptions = answerOptionsFromText(question);
  if (questionOptions.length >= 2) {
    return questionOptions.slice(0, 8);
  }
  return Array.isArray(rawOptions)
    ? rawOptions
        .map((option) => cleanText(option, 160))
        .filter((option) => option && !isQuizAction(option))
        .slice(0, 2)
    : [];
}

function normalizeWordLog(wordLog, question, options, selectedAnswer, correctAnswer) {
  const expectedList = expectedWordList(question, options, selectedAnswer, correctAnswer);
  const fallbackList = !question && Array.isArray(wordLog) ? wordLog : [];
  const expected = new Set(
    [...expectedList, ...fallbackList].map((word) => cleanWord(word)).filter(Boolean)
  );
  if (!question && expected.size === 0) {
    return [];
  }
  const values = Array.isArray(wordLog)
    ? question
      ? [...expectedList, ...wordLog]
      : [...wordLog, ...expectedList]
    : [...expectedList, question, ...options, selectedAnswer, correctAnswer];
  const seen = new Set();
  return values
    .map((word) => cleanWord(word))
    .filter(Boolean)
    .filter((word) => expected.size === 0 || expected.has(word.toLowerCase()))
    .filter((word) => {
      const key = word.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

function expectedWordList(question, options, selectedAnswer, correctAnswer) {
  const standaloneWord = standalonePromptWord(question);
  if (standaloneWord) {
    return [standaloneWord];
  }
  const promptWord = wordFromQuestion(question);
  if (promptWord && isPicturePrompt(question)) {
    return [promptWord];
  }
  const answers = answerOptionsFromText(question);
  const knownOptions = options.length > 0 ? options : answers;
  return [
    promptWord,
    ...answers,
    ...options,
    ...[selectedAnswer, correctAnswer].filter(
      (answer) =>
        knownOptions.length > 0 && knownOptions.some((option) => sameWord(option, answer))
    )
  ]
    .map((word) => cleanWord(word))
    .filter(Boolean);
}

function currentWordFromCapture(record) {
  return recordReviewWords(record)[0] || "";
}

function selectedAnswerMatchesOption(selectedAnswer, options, question) {
  const knownOptions = knownAnswerOptions(options, question);
  return Boolean(
    cleanWord(selectedAnswer) &&
      knownOptions.length >= 2 &&
      knownOptions.some((option) => sameWord(option, selectedAnswer))
  );
}

function selectedAnswerAllowed(selectedAnswer, options, question, result) {
  const knownOptions = knownAnswerOptions(options, question);
  const selectedWord = cleanWord(selectedAnswer);
  if (!selectedWord) {
    return !cleanText(selectedAnswer, 160);
  }
  if (knownOptions.length < 2) {
    return true;
  }
  if (knownOptions.some((option) => sameWord(option, selectedAnswer))) {
    return true;
  }
  if (result === "incorrect" && isUnknownAnswer(selectedAnswer)) {
    return true;
  }
  return result === "correct" && sameWord(selectedAnswer, wordFromQuestion(question));
}

function resultFromAnswers(selectedAnswer, correctAnswer, options, question) {
  if (!cleanWord(selectedAnswer) || !cleanWord(correctAnswer)) {
    return null;
  }
  const knownOptions = knownAnswerOptions(options, question);
  if (
    isUnknownAnswer(selectedAnswer) &&
    knownOptions.length >= 2 &&
    knownOptions.some((option) => sameWord(option, correctAnswer))
  ) {
    return "incorrect";
  }
  if (
    knownOptions.length >= 2 &&
    (!knownOptions.some((option) => sameWord(option, selectedAnswer)) ||
      !knownOptions.some((option) => sameWord(option, correctAnswer)))
  ) {
    return null;
  }
  return sameWord(selectedAnswer, correctAnswer) ? "correct" : "incorrect";
}

function inferredCorrectAnswer(selectedAnswer, correctAnswer, options, question, result) {
  if (cleanWord(correctAnswer)) {
    return correctAnswer;
  }
  if (result !== "correct" && result !== "incorrect") {
    return correctAnswer;
  }
  const knownOptions = knownAnswerOptions(options, question);
  if (knownOptions.length !== 2) {
    return correctAnswer;
  }
  const selectedOption = knownOptions.find((option) => sameWord(option, selectedAnswer));
  if (!selectedOption) {
    return correctAnswer;
  }
  if (result === "correct") {
    return selectedOption;
  }
  return knownOptions.find((option) => !sameWord(option, selectedOption)) || correctAnswer;
}

function knownAnswerOptions(options, question) {
  const questionOptions = answerOptionsFromText(question);
  return options.length >= 2 ? options : questionOptions;
}

function wordFromQuestion(question) {
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
    new RegExp(`\\b(?:opposite|antonym)\\b.*?\\b(?:to|of|for)\\b\\s+${quoteOpen}?${phrase}`, "iu"),
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
      `${optionalKoreanPrefix}(?:단어\\s+)?${quoteOpen}?${phrase}${quoteClose}?\\s*(?:을|를|이|가|의|에)?\\s*(?:나타내는|표현하는|뜻하는|의미하는|가리키는|보여주는|어울리는).*?(?:이미지|사진|그림|단어)`,
      "iu"
    )
  ];
  for (const pattern of patterns) {
    const word = cleanWord(text.match(pattern)?.[1]);
    if (word) {
      return word;
    }
  }
  return standalonePromptWord(text);
}

function answerOptionsFromText(text) {
  const wordToken = "[A-Za-z][A-Za-z'-]*|[\\p{Script=Hangul}]+";
  const phrase = `((?:${wordToken})(?:\\s+(?:${wordToken})){0,3})`;
  const match = quizText(text).match(new RegExp(`\\?\\s*${phrase}\\s+(?:or|또는)\\s+${phrase}\\s*$`, "iu"));
  return [cleanChoice(match?.[1]), cleanChoice(match?.[2])].filter(Boolean);
}

function cleanChoice(value) {
  const words =
    normalizedText(value)
      .replace(/[“”]/g, '"')
      .replace(/^["']+|["'.,!?;:]+$/g, "")
      .match(/[A-Za-z][A-Za-z'-]*|[\p{Script=Hangul}]+/gu) || [];
  if (words.length < 1 || words.length > 4) {
    return null;
  }
  return words.join(" ");
}

function quizText(text) {
  const normalized = normalizedText(text);
  const delimiter = normalized.match(/\bQuestion\s+\d+\s+of\s+\d+\b/i);
  return (delimiter ? normalized.slice(0, delimiter.index) : normalized).trim();
}

function quizPromptText(text) {
  return quizText(text)
    .replace(/^\s*(?:word\s+coach|단어\s+과외)\s*/i, "")
    .replace(/^\s*(?:score|점수)\s*[•:：-]?\s*[\d,]+(?:\s+[\d,]+)?\s*/i, "")
    .trim();
}

function scoreFromQuestion(text) {
  const match = normalizedText(text).match(/(?:\bScore\b|점수)\s*[•:：-]?\s*([\d,]+)(?:\s+([\d,]+))?/i);
  const scores = [match?.[1], match?.[2]]
    .map((value) => normalizeScore(value))
    .filter((value) => value !== null);
  return scores.length > 0 ? Math.max(...scores) : null;
}

function standalonePromptWord(text) {
  const match = quizPromptText(text).match(
    /^[\s"'“”‘’「」『』.,!?;:()-]*([A-Za-z][A-Za-z'-]*|[\p{Script=Hangul}]+)[\s"'“”‘’「」『』.,!?;:()-]*$/u
  );
  return cleanWord(match?.[1]);
}

function isPicturePrompt(text) {
  return /\b(image|picture|photo)\b/i.test(text) || /(이미지|사진|그림)/.test(text);
}

function normalizedText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeScore(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const score = Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(score)) {
    return null;
  }
  const rounded = Math.round(score);
  return rounded >= 0 ? rounded : null;
}

function normalizeScoreDelta(value, scoreBefore, scoreAfter) {
  const explicit = normalizeScore(value);
  if (explicit !== null) {
    return explicit;
  }
  if (scoreBefore !== null && scoreAfter !== null) {
    return Math.max(0, scoreAfter - scoreBefore);
  }
  return null;
}

function sameWord(left, right) {
  const leftWord = cleanWord(left);
  const rightWord = cleanWord(right);
  return Boolean(leftWord && rightWord && leftWord === rightWord);
}

function isQuizAction(value) {
  const text = normalizedText(value)
    .replace(/[’]/g, "'")
    .toLowerCase();
  return /^(skip|i don't know|i dont know|don't know|dont know|not sure|no thanks|turn on|next|next round|다음|건너뛰기|모르겠어요|모름)$/.test(
    text
  );
}

function isUnknownAnswer(value) {
  const text = normalizedText(value)
    .replace(/[’]/g, "'")
    .toLowerCase();
  return /^(skip|i don't know|i dont know|don't know|dont know|not sure|건너뛰기|모르겠어요|모름)$/.test(
    text
  );
}

function cleanWord(value) {
  const cleaned = cleanText(value, 80);
  if (!cleaned) {
    return null;
  }
  const normalized = cleaned
    .replace(/[“”]/g, '"')
    .replace(/^["']+|["'.,!?;:]+$/g, "")
    .trim();
  if (
    !normalized ||
    /\b(which|what|choose|select|similar|synonym|opposite|antonym|image|picture|photo|matches|represents|means)\b/i.test(
      normalized
    ) ||
    /(다음|무엇|어느|선택|고르|비슷|유사|동의어|반대|반의어|이미지|사진|그림|뜻|의미|나타내|표현|일치|어울리|가리키|단어|정답)/.test(
      normalized
    )
  ) {
    return null;
  }
  const words = normalized.match(/[A-Za-z][A-Za-z'-]*|[\p{Script=Hangul}]+/gu) || [];
  const phrase = words.join(" ").replace(/^'+|'+$/g, "").toLowerCase();
  if (words.length < 1 || words.length > 4) {
    return null;
  }
  if (
    /^(google word coach|word coach|coach|score|next|share|search|learn more|this word|the word|word)$/.test(
      phrase
    )
  ) {
    return null;
  }
  return phrase;
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value.split(/\s+/).filter(Boolean).join(" ");
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function normalizeProvider(provider) {
  const id = String(provider || "").toLowerCase();
  if (["dictionary", "merriam", "naver"].includes(id)) {
    return id;
  }
  return DEFAULT_SETTINGS.dictionary_provider;
}

function normalizeDictionaryMode(mode) {
  const id = String(mode || "").toLowerCase();
  if (["dictionary", "thesaurus"].includes(id)) {
    return id;
  }
  return DEFAULT_SETTINGS.dictionary_mode;
}

function normalizePreloadEagerness(eagerness) {
  const id = String(eagerness || "").toLowerCase();
  if (["off", "dns", "preconnect", "pages", "prerender"].includes(id)) {
    return id;
  }
  return DEFAULT_SETTINGS.preload_eagerness;
}

function normalizeDarkMode(mode) {
  const id = String(mode || "").toLowerCase();
  if (["system", "dark", "off"].includes(id)) {
    return id;
  }
  return DEFAULT_SETTINGS.dark_mode;
}

function normalizeBoolean(value, fallback) {
  if (typeof value === "boolean") {
    return value;
  }
  return fallback;
}

export function normalizeDailyGoal(value) {
  const goal = Number(value);
  if (!Number.isFinite(goal)) {
    return DEFAULT_DAILY_GOAL;
  }
  const rounded = Math.round(goal);
  return rounded >= 1 && rounded <= 100 ? rounded : DEFAULT_DAILY_GOAL;
}

export function normalizeDailyGoalType(value) {
  const type = String(value || "").toLowerCase();
  return GOAL_TYPES.has(type) ? type : DEFAULT_SETTINGS.daily_goal_type;
}

export function normalizeDailyScoreGoal(value) {
  const goal = Number(value);
  if (!Number.isFinite(goal)) {
    return DEFAULT_DAILY_SCORE_GOAL;
  }
  const rounded = Math.round(goal);
  return rounded >= 1 && rounded <= 100_000 ? rounded : DEFAULT_DAILY_SCORE_GOAL;
}

function normalizeStudyGoalSettings(value) {
  if (!value || typeof value !== "object") {
    return {
      daily_goal_type: "words",
      daily_goal: normalizeDailyGoal(value),
      daily_score_goal: DEFAULT_DAILY_SCORE_GOAL
    };
  }
  return {
    daily_goal_type: normalizeDailyGoalType(value.daily_goal_type),
    daily_goal: normalizeDailyGoal(value.daily_goal),
    daily_score_goal: normalizeDailyScoreGoal(value.daily_score_goal)
  };
}

export function reviewQueue(records, limit = 6, now = Date.now()) {
  return reviewQueueItems(records)
    .filter((item) => item.due_at <= now)
    .sort(compareDueReviewItems)
    .slice(0, limit)
    .map(publicReviewItem);
}

export function reviewBacklog(records, limit = 4, now = Date.now()) {
  return reviewQueueItems(records)
    .filter((item) => item.due_at > now)
    .sort(compareUpcomingReviewItems)
    .slice(0, limit)
    .map(publicReviewItem);
}

export function reviewSummary(records, now = Date.now()) {
  const pending = reviewQueueItems(records).filter((item) => item.mistakes > 0);
  const due = pending.filter((item) => item.due_at <= now);
  const next = pending
    .filter((item) => item.due_at > now)
    .sort((left, right) => left.due_at - right.due_at)[0];
  return {
    due_count: due.length,
    pending_count: pending.length,
    next_due_at: next?.due_at || null
  };
}

export function studySummary(
  records,
  target = DEFAULT_DAILY_GOAL,
  now = Date.now(),
  summary = reviewSummary(records, now)
) {
  const goalSettings = normalizeStudyGoalSettings(target);
  const goal =
    goalSettings.daily_goal_type === "score"
      ? goalSettings.daily_score_goal
      : goalSettings.daily_goal;
  const todayKey = localDayKey(now);
  const studiedDays = new Set();
  const todayWords = new Set();
  let todayScore = 0;
  let todayAnswered = 0;
  let todayCorrect = 0;

  for (const record of Array.isArray(records) ? records : []) {
    const words = recordStudyWords(record);
    if (words.length === 0) {
      continue;
    }
    const key = localDayKey(record.captured_at);
    studiedDays.add(key);
    if (key === todayKey) {
      for (const word of words) {
        todayWords.add(word.toLowerCase());
      }
      todayScore += recordStudyScore(record);
      const result = normalizeResult(record.result);
      if (result && countsTowardAccuracy(record)) {
        todayAnswered += 1;
        if (result === "correct") {
          todayCorrect += 1;
        }
      }
    }
  }
  const todayValue = goalSettings.daily_goal_type === "score" ? todayScore : todayWords.size;

  return {
    goal_type: goalSettings.daily_goal_type,
    today: todayValue,
    target: goal,
    remaining: Math.max(0, goal - todayValue),
    progress: studyProgress(todayValue, goal),
    word_count: todayWords.size,
    score: todayScore,
    word_target: goalSettings.daily_goal,
    score_target: goalSettings.daily_score_goal,
    accuracy: todayAnswered > 0 ? Math.round((todayCorrect / todayAnswered) * 100) : null,
    streak: studyStreak(studiedDays, now),
    review: summary.due_count,
    pendingReview: summary.pending_count,
    nextReviewAt: summary.next_due_at,
    days: studyWeek(records, goalSettings, now)
  };
}

function countsTowardAccuracy(record) {
  return !isManualStudyRecord(record);
}

function isManualStudyRecord(record) {
  return cleanText(record?.source_url, 500) === "wordcoach://manual";
}

function reviewQueueItems(records) {
  const byWord = new Map();
  const ordered = Array.isArray(records)
    ? records
        .slice()
        .filter((record) => record && Number.isFinite(record.captured_at))
        .sort((left, right) => left.captured_at - right.captured_at)
    : [];

  for (const record of ordered) {
    const result = normalizeResult(record.result);
    if (!result || isManualStudyRecord(record)) {
      continue;
    }
    const seen = new Set();
    for (const word of recordReviewWords(record)) {
      const key = word.toLowerCase();
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      const current =
        byWord.get(key) ||
        ({
          word,
          key,
          result,
          correct: 0,
          mistakes: 0,
          correct_streak: 0,
          last_seen: 0,
          last_wrong: 0,
          last_wrong_question: null,
          last_wrong_options: [],
          last_wrong_selected_answer: null,
          last_wrong_correct_answer: null,
          due_at: 0
        });
      current.word = word;
      current.result = result;
      current.last_seen = record.captured_at;
      if (result === "incorrect") {
        current.mistakes += 1;
        current.correct_streak = 0;
        current.last_wrong = record.captured_at;
        current.last_wrong_question = cleanText(record.question, 500);
        current.last_wrong_options = normalizeReviewOptions(record.options);
        current.last_wrong_selected_answer = cleanText(record.selected_answer, 160);
        current.last_wrong_correct_answer = cleanText(record.correct_answer, 160);
        current.due_at = record.captured_at;
      } else {
        current.correct += 1;
        if (current.mistakes > 0) {
          current.correct_streak += 1;
          if (current.correct_streak >= REVIEW_GRADUATION_STREAK) {
            current.mistakes = 0;
            current.due_at = 0;
          } else {
            current.due_at = record.captured_at + reviewIntervalMs(current.correct_streak);
          }
        }
      }
      byWord.set(key, current);
    }
  }

  return Array.from(byWord.values()).filter((item) => item.mistakes > 0);
}

function compareDueReviewItems(left, right) {
  return (
    right.mistakes - left.mistakes ||
    left.due_at - right.due_at ||
    right.last_wrong - left.last_wrong ||
    right.last_seen - left.last_seen
  );
}

function compareUpcomingReviewItems(left, right) {
  return (
    left.due_at - right.due_at ||
    right.mistakes - left.mistakes ||
    right.last_wrong - left.last_wrong ||
    right.last_seen - left.last_seen
  );
}

function publicReviewItem({ correct_streak, ...item }) {
  return item;
}

function recordStudyWords(record) {
  const word = recordReviewWords(record)[0];
  return word ? [word] : [];
}

function recordStudyScore(record) {
  const delta = normalizeScore(record?.score_delta);
  return delta ?? 0;
}

function studyProgress(today, target) {
  return Math.max(0, Math.min(100, Math.round((today / target) * 100)));
}

function studyWeek(records, goalSettings, now) {
  const settings = normalizeStudyGoalSettings(goalSettings);
  const target =
    settings.daily_goal_type === "score" ? settings.daily_score_goal : settings.daily_goal;
  const days = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    const words = recordStudyWords(record);
    if (words.length === 0) {
      continue;
    }
    const key = localDayKey(record.captured_at);
    const day = days.get(key) || { words: new Set(), score: 0 };
    for (const word of words) {
      day.words.add(word.toLowerCase());
    }
    day.score += recordStudyScore(record);
    days.set(key, day);
  }

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_value, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    const key = localDayKey(date.getTime());
    const day = days.get(key);
    const wordCount = day?.words.size || 0;
    const score = day?.score || 0;
    const count = settings.daily_goal_type === "score" ? score : wordCount;
    return {
      key,
      label: key,
      count,
      wordCount,
      score,
      today: index === 6,
      metTarget: count >= target
    };
  });
}

function studyStreak(studiedDays, now) {
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  if (!studiedDays.has(localDayKey(cursor.getTime()))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  let streak = 0;
  while (studiedDays.has(localDayKey(cursor.getTime()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function localDayKey(epochMs) {
  const date = new Date(epochMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function reviewRecordOptions(item) {
  const options = normalizeReviewOptions(item?.last_wrong_options);
  return options.length > 0 ? options : [item.word];
}

function normalizeReviewOptions(options) {
  return Array.isArray(options)
    ? options.map((option) => cleanText(option, 160)).filter(Boolean).slice(0, 4)
    : [];
}

function dueReviewItemForWord(records, word, now) {
  const normalizedWord = cleanWord(word);
  if (!normalizedWord) {
    return null;
  }
  return (
    reviewQueueItems(records)
      .filter((reviewItem) => reviewItem.due_at <= now)
      .find((reviewItem) => reviewItem.key === normalizedWord.toLowerCase()) || null
  );
}

function recordReviewWords(record) {
  const promptWord = wordFromQuestion(record.question);
  const correctAnswer = cleanWord(record.correct_answer);
  const values = promptWord
    ? [promptWord]
    : Array.isArray(record.word_log) && record.word_log.length > 0
      ? [record.word_log[0]]
    : correctAnswer
      ? [correctAnswer]
      : [record.question, ...(Array.isArray(record.options) ? record.options : [])];
  const seen = new Set();
  return values
    .map((word) => cleanWord(word))
    .filter(Boolean)
    .filter((word) => {
      const key = word.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function normalizeResult(result) {
  const id = String(result || "").toLowerCase();
  return id === "correct" || id === "incorrect" ? id : null;
}

function reviewIntervalMs(correctStreak) {
  const days = [1, 3, 7, 14, 30][Math.min(Math.max(correctStreak, 1), 5) - 1];
  return days * 24 * 60 * 60 * 1000;
}

function dedupeRapidCaptures(records) {
  const acceptedByKey = new Map();
  const deduped = [];
  let duplicateRecords = 0;
  for (const record of records) {
    const key = captureDuplicateKey(record);
    const accepted = acceptedByKey
      .get(key)
      ?.find((item) => Math.abs(item.captured_at - record.captured_at) <= DUPLICATE_CAPTURE_WINDOW_MS);
    if (accepted) {
      duplicateRecords += 1;
      if (captureRicherThan(record, deduped[accepted.index])) {
        deduped[accepted.index] = record;
        accepted.captured_at = record.captured_at;
      }
      continue;
    }
    deduped.push(record);
    const bucket = acceptedByKey.get(key) || [];
    bucket.push({ captured_at: record.captured_at, index: deduped.length - 1 });
    acceptedByKey.set(key, bucket);
  }
  return { records: deduped, duplicateRecords };
}

function isRapidDuplicateCapture(record, records) {
  return rapidDuplicateCaptureIndex(record, records) >= 0;
}

function rapidDuplicateCaptureIndex(record, records) {
  const key = captureDuplicateKey(record);
  return records.findIndex(
    (item) =>
      captureDuplicateKey(item) === key &&
      Math.abs(item.captured_at - record.captured_at) <= DUPLICATE_CAPTURE_WINDOW_MS
  );
}

function captureDuplicateKey(record) {
  return JSON.stringify([
    record.question || "",
    record.selected_answer || "",
    record.source_url || "",
    record.options || [],
    record.word_log || []
  ]);
}

function captureRicherThan(candidate, existing) {
  return captureRichness(candidate) > captureRichness(existing);
}

function captureRichness(record) {
  return (
    (normalizeResult(record?.result) ? 4 : 0) +
    (cleanText(record?.correct_answer, 160) ? 2 : 0) +
    (Array.isArray(record?.word_log) && record.word_log.length > 0 ? 1 : 0)
  );
}

function stableId(capturedAt, question, selectedAnswer, correctAnswer) {
  return `wc_${crypto
    .createHash("sha256")
    .update(`${capturedAt}|${question || ""}|${selectedAnswer || ""}|${correctAnswer || ""}`)
    .digest("hex")
    .slice(0, 16)}`;
}

function byCapturedAtDesc(left, right) {
  return right.captured_at - left.captured_at;
}
