import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { DEFAULT_LOCALE_CHOICE, normalizeLocaleChoice } from "./i18n.mjs";

const DEFAULT_SETTINGS = {
  dictionary_provider: "dictionary",
  dictionary_mode: "dictionary",
  preload_eagerness: "preconnect",
  dark_mode: "system",
  cosmetic_adblock: true,
  locale_choice: DEFAULT_LOCALE_CHOICE,
  current_word: ""
};

export class JsonStore {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.settingsPath = path.join(baseDir, "settings.json");
    this.historyPath = path.join(baseDir, "history.json");
    this.settings = { ...DEFAULT_SETTINGS };
    this.history = [];
  }

  async load() {
    await fs.mkdir(this.baseDir, { recursive: true });
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(await readJson(this.settingsPath, {}))
    };
    this.settings.dictionary_provider = normalizeProvider(this.settings.dictionary_provider);
    this.settings.dictionary_mode = normalizeDictionaryMode(this.settings.dictionary_mode);
    this.settings.preload_eagerness = normalizePreloadEagerness(
      this.settings.preload_eagerness
    );
    this.settings.dark_mode = normalizeDarkMode(this.settings.dark_mode);
    this.settings.cosmetic_adblock = normalizeBoolean(this.settings.cosmetic_adblock, true);
    this.settings.locale_choice = normalizeLocaleChoice(this.settings.locale_choice);
    const history = await readJson(this.historyPath, []);
    this.history = Array.isArray(history)
      ? history.map(normalizeCapture).filter(Boolean).sort(byCapturedAtDesc)
      : [];
  }

  snapshot(limit = 300) {
    return {
      provider: this.settings.dictionary_provider,
      dictionary_mode: this.settings.dictionary_mode,
      preload_eagerness: this.settings.preload_eagerness,
      dark_mode: this.settings.dark_mode,
      cosmetic_adblock: this.settings.cosmetic_adblock,
      locale_choice: this.settings.locale_choice,
      current_word: this.settings.current_word,
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

  async setCurrentWord(word) {
    this.settings.current_word = cleanText(word, 160) || "";
    await writeJson(this.settingsPath, this.settings);
  }

  async insertCapture(capture) {
    const record = normalizeCapture(capture);
    if (!record || this.history.some((item) => item.id === record.id)) {
      return false;
    }
    this.history.unshift(record);
    this.history.sort(byCapturedAtDesc);
    await writeJson(this.historyPath, this.history);
    return true;
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

    let imported = 0;
    const seen = new Set(this.history.map((record) => record.id));
    for (const item of records) {
      const record = normalizeCapture(item);
      if (!record || seen.has(record.id)) {
        continue;
      }
      seen.add(record.id);
      this.history.push(record);
      imported += 1;
    }

    if (imported > 0) {
      this.history.sort(byCapturedAtDesc);
      await writeJson(this.historyPath, this.history);
    }
    return imported;
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

function normalizeCapture(capture) {
  if (!capture || typeof capture !== "object") {
    return null;
  }
  const capturedAt = Number.isFinite(capture.captured_at) ? capture.captured_at : Date.now();
  const question = cleanText(capture.question, 500);
  const selectedAnswer = cleanText(capture.selected_answer, 160);
  const correctAnswer = cleanText(capture.correct_answer, 160);
  const result = cleanText(capture.result, 32)?.toLowerCase() || null;
  const sourceUrl = cleanText(capture.source_url, 500) || "";
  const options = Array.isArray(capture.options)
    ? capture.options.map((option) => cleanText(option, 160)).filter(Boolean).slice(0, 8)
    : [];
  const wordLog = normalizeWordLog(capture.word_log, question, options, selectedAnswer, correctAnswer);
  const id =
    cleanText(capture.id, 120) || stableId(capturedAt, question, selectedAnswer, correctAnswer);

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
    extractor_version: Number.isFinite(capture.extractor_version)
      ? capture.extractor_version
      : 1
  };
}

function normalizeWordLog(wordLog, question, options, selectedAnswer, correctAnswer) {
  const values = Array.isArray(wordLog) ? wordLog : [question, ...options, selectedAnswer, correctAnswer];
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
    })
    .slice(0, 12);
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
    /\b(which|what|choose|select|similar|synonym|opposite|antonym|image|picture|photo|matches|represents|means)\b/i.test(normalized)
  ) {
    return null;
  }
  const words = normalized.match(/[A-Za-z][A-Za-z'-]*/g) || [];
  const phrase = words.join(" ").replace(/^'+|'+$/g, "").toLowerCase();
  if (
    words.length < 1 ||
    words.length > 4 ||
    /^(word|coach|google|next|share|search|learn more|none of the above)$/.test(phrase)
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
