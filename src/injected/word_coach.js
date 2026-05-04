(() => {
  const VERSION = 2;
  const fallbackCss = `
    html, body {
      margin: 0 !important;
      overflow: hidden !important;
      scrollbar-width: none !important;
      -ms-overflow-style: none !important;
    }
    html::-webkit-scrollbar,
    body::-webkit-scrollbar,
    div[class*='knowledge_game']::-webkit-scrollbar,
    div[class*='knowledge_game'] *::-webkit-scrollbar {
      width: 0 !important;
      height: 0 !important;
      display: none !important;
    }
    div[class*='knowledge_game'],
    div[class*='knowledge_game'] * {
      scrollbar-width: none !important;
      -ms-overflow-style: none !important;
    }
    body:has(div[class*='knowledge_game']) > * {
      visibility: hidden !important;
      pointer-events: none !important;
      overflow: clip !important;
    }
    body:has(div[class*='knowledge_game']) div[class*='knowledge_game'],
    body:has(div[class*='knowledge_game']) div[class*='knowledge_game'] * {
      visibility: visible !important;
      pointer-events: auto !important;
    }
    div[class*='knowledge_game'] {
      visibility: visible !important;
      pointer-events: auto !important;
      position: fixed !important;
      inset: 0 !important;
      z-index: 2147483647 !important;
      display: flex !important;
      flex-direction: column !important;
      overflow: auto !important;
      overscroll-behavior: contain !important;
      touch-action: pan-x pan-y !important;
    }
    div[class*='knowledge_game'].word-coach-dragging {
      user-select: none !important;
    }
  `;

  function cleanedUserCss() {
    const raw = String(window.__WORD_COACH_CUSTOM_CSS || "");
    return raw
      .replace(/\/\*\s*==UserStyle==[\s\S]*?==\/UserStyle==\s*\*\//, "")
      .replace(/@-moz-document[^{]+{([\s\S]*)}\s*$/, "$1");
  }

  function injectCss() {
    if (document.getElementById("word-coach-style")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "word-coach-style";
    style.textContent = `${cleanedUserCss()}\n${fallbackCss}`;
    (document.head || document.documentElement).appendChild(style);
  }

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  function gameRoot() {
    return document.querySelector("div[class*='knowledge_game']");
  }

  function nodeText(element) {
    return (
      element.innerText ||
      element.textContent ||
      element.getAttribute?.("aria-label") ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizedText(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function quizText(text) {
    const normalized = normalizedText(text);
    const delimiter = normalized.match(/\bQuestion\s+\d+\s+of\s+\d+\b/i);
    return (delimiter ? normalized.slice(0, delimiter.index) : normalized).trim();
  }

  function quizTextFromLines(textLines) {
    return quizText(textLines.join(" "));
  }

  function quizPromptText(text) {
    return quizText(text)
      .replace(/^\s*(?:word\s+coach|단어\s+과외)\s*/i, "")
      .replace(/^\s*(?:score|점수)\s*[•:：-]?\s*[\d,]+(?:\s+[\d,]+)?\s*/i, "")
      .trim();
  }

  function standalonePromptWord(text) {
    const match = quizPromptText(text).match(
      /^[\s"'“”‘’「」『』.,!?;:()-]*([A-Za-z][A-Za-z'-]*|[\p{Script=Hangul}]+)[\s"'“”‘’「」『』.,!?;:()-]*$/u
    );
    return cleanWord(match?.[1]);
  }

  function lines(root) {
    return nodeText(root)
      .split(/\n| {2,}/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }

  function inferOptions(rootOrTextLines, maybeTextLines) {
    const root = Array.isArray(maybeTextLines) ? rootOrTextLines : null;
    const textLines = Array.isArray(maybeTextLines) ? maybeTextLines : rootOrTextLines;
    const textOptions = answerOptionsFromText(quizTextFromLines(textLines));
    return textOptions.length >= 2 ? textOptions : inferButtonOptions(root);
  }

  function inferButtonOptions(root) {
    if (!root) {
      return [];
    }
    const choices = Array.from(root.querySelectorAll("button, [role='button']"))
      .map((node) => cleanChoice(nodeText(node)))
      .filter((choice) => !isQuizAction(choice))
      .filter(Boolean);
    return uniqueWords(choices).slice(0, 2);
  }

  function inferResult(textLines) {
    const joined = textLines.join(" ").toLowerCase();
    if (/\b(incorrect|wrong|not quite)\b/.test(joined)) {
      return "incorrect";
    }
    if (/\b(correct|great|nice)\b/.test(joined) && !/\bcorrect answer\b/.test(joined)) {
      return "correct";
    }
    if (/(오답|틀렸)/.test(joined)) {
      return "incorrect";
    }
    return null;
  }

  function inferScore(textLines) {
    const text = normalizedText(Array.isArray(textLines) ? textLines.join(" ") : textLines);
    const match = text.match(/(?:\bScore\b|점수)\s*[•:：-]?\s*([\d,]+)(?:\s+([\d,]+))?/i);
    const values = [match?.[1], match?.[2]]
      .map((value) => Number(String(value || "").replace(/,/g, "")))
      .filter(Number.isFinite);
    return values.length > 0 ? Math.max(...values) : null;
  }

  function resultFromScore(selected, previousScore, currentScore, elapsedMs) {
    if (!selected || !Number.isFinite(previousScore) || !Number.isFinite(currentScore)) {
      return null;
    }
    if (currentScore > previousScore) {
      return "correct";
    }
    if (currentScore === previousScore && elapsedMs >= 1200) {
      return "incorrect";
    }
    return null;
  }

  function scoreDelta(previousScore, currentScore) {
    if (!Number.isFinite(previousScore) || !Number.isFinite(currentScore)) {
      return null;
    }
    return Math.max(0, currentScore - previousScore);
  }

  function inferQuestion(textLines) {
    return quizTextFromLines(textLines) || null;
  }

  function inferCorrect(root, options) {
    const candidates = Array.from(root.querySelectorAll("button, [role='button'], [aria-label]"));
    for (const node of candidates) {
      const text = nodeText(node);
      const option = options.find((candidate) => cleanWord(candidate) === cleanWord(text));
      const marker = [
        node.getAttribute("aria-label") || "",
        node.getAttribute("class") || "",
        node.getAttribute("style") || ""
      ].join(" ").toLowerCase();
      if (option && /(correct|right|green|#188038|rgb\(24,\s*128,\s*56\))/.test(marker)) {
        return option;
      }
    }
    return null;
  }

  function resultFromSelection(selected, correct) {
    if (!selected || !correct) {
      return null;
    }
    return cleanWord(selected) === cleanWord(correct) ? "correct" : "incorrect";
  }

  function correctFromResult(selected, options, result) {
    if (!selected || (result !== "correct" && result !== "incorrect")) {
      return null;
    }
    if (result === "correct") {
      return selected;
    }
    const selectedKey = cleanWord(selected);
    const choices = Array.isArray(options) ? options : [];
    const otherChoices = choices.filter((option) => cleanWord(option) !== selectedKey);
    return choices.length === 2 && otherChoices.length === 1 ? otherChoices[0] : null;
  }

  function selectedMatchesOption(record) {
    const selected = cleanWord(record?.selected_answer);
    if (!selected || !Array.isArray(record?.options) || record.options.length < 2) {
      return false;
    }
    return record.options.some((option) => cleanWord(option) === selected);
  }

  function captureReady(record) {
    const selected = record?.selected_answer;
    if (isUnknownAnswer(selected)) {
      return record?.result === "incorrect";
    }
    return Boolean(selected && (record.result || selectedMatchesOption(record)));
  }

  function inferWordLog(textLines, options, question) {
    const quiz = quizText(question || quizTextFromLines(textLines));
    const promptWord = standalonePromptWord(quiz);
    if (promptWord) {
      return [promptWord];
    }
    const prompt = quiz.toLowerCase();
    const askedWord = cleanWord(question);
    const optionWords = options.map(cleanWord).filter(Boolean);
    if (
      /\b(similar|synonym|opposite|antonym)\b/.test(prompt) ||
      /(비슷|유사|동의어|반대|반의어)/.test(prompt)
    ) {
      return uniqueWords([wordFromPromptLine(quiz) || askedWord, ...optionWords]).slice(0, 3);
    }
    if (/\b(image|picture|photo)\b/.test(prompt) || /(이미지|사진|그림)/.test(prompt)) {
      return uniqueWords([wordFromPromptLine(quiz) || askedWord]).slice(0, 1);
    }
    return uniqueWords([wordFromPromptLine(quiz) || askedWord, ...optionWords]).slice(0, 3);
  }

  function wordFromPromptLine(line) {
    const text = quizText(line);
    const wordToken = "[A-Za-z][A-Za-z'-]*|[\\p{Script=Hangul}]+?";
    const phrase = `((?:${wordToken})(?:\\s+(?:${wordToken})){0,3})`;
    const optionalKoreanPrefix = "(?:다음\\s*중\\s*)?";
    const koreanParticle = "(?:과\\(와\\)|와\\(과\\)|와|과|랑|하고|의|에)";
    const englishWordPrefix = "(?:the\\s+)?(?:word\\s+)?";
    const quoteOpen = "[\"'“‘「『]";
    const quoteClose = "[\"'”’」』]";
    const patterns = [
      new RegExp(`${quoteOpen}\\s*${phrase}\\s*${quoteClose}`, "iu"),
      new RegExp(`\\b(?:similar|synonym)\\b.*?\\b(?:to|of|for)\\b\\s+${quoteOpen}?${phrase}`, "iu"),
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
        `${optionalKoreanPrefix}${quoteOpen}?${phrase}${quoteClose}?\\s*(?:의|이|가|은|는)?\\s*(?:뜻|의미)`,
        "iu"
      ),
      new RegExp(
        `${optionalKoreanPrefix}(?:단어\\s+)?${quoteOpen}?${phrase}${quoteClose}?\\s*(?:을|를|이|가|의|에)?\\s*(?:나타내는|표현하는|뜻하는|의미하는|가리키는|보여주는|어울리는).*?(?:이미지|사진|그림|단어)`,
        "iu"
      )
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      const word = cleanWord(match?.[1]);
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
    return uniqueWords([cleanChoice(match?.[1]), cleanChoice(match?.[2])]).slice(0, 2);
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

  function uniqueWords(words) {
    const seen = new Set();
    return words.filter((word) => {
      if (!word || seen.has(word)) {
        return false;
      }
      seen.add(word);
      return true;
    });
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
    const text = normalizedText(value)
      .replace(/[“”]/g, '"')
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^["']+|["'.,!?;:]+$/g, "");
    if (
      !text ||
      text.length > 64 ||
      /\b(which|what|choose|select|similar|synonym|opposite|antonym|image|picture|photo|matches|represents|means)\b/i.test(
        text
      ) ||
      /(다음|무엇|어느|선택|고르|비슷|유사|동의어|반대|반의어|이미지|사진|그림|뜻|의미|나타내|표현|일치|어울리|가리키|단어|정답)/.test(
        text
      )
    ) {
      return null;
    }
    const words = text.match(/[A-Za-z][A-Za-z'-]*|[\p{Script=Hangul}]+/gu) || [];
    const phrase = words.join(" ").replace(/^'+|'+$/g, "").toLowerCase();
    if (words.length < 1 || words.length > 4) {
      return null;
    }
    if (/^(this word|the word|word)$/.test(phrase)) {
      return null;
    }
    return phrase;
  }

  let selectedAnswer = null;
  let selectedScore = null;
  let selectedAt = 0;
  let selectedContext = null;
  let lastSent = "";

  function selectedOptionForButton(root, button, options = inferOptions(root, lines(root))) {
    const text = nodeText(button);
    return options.find((option) => cleanWord(option) === cleanWord(text)) || null;
  }

  function unknownAnswerForButton(button) {
    const text = normalizedText(nodeText(button));
    return isUnknownAnswer(text) ? text : null;
  }

  function rememberSelection(root, button) {
    const textLines = lines(root);
    const options = inferOptions(root, textLines);
    const question = inferQuestion(textLines);
    const selected = selectedOptionForButton(root, button, options) || unknownAnswerForButton(button);
    if (!selected) {
      return null;
    }
    selectedAnswer = selected;
    selectedScore = inferScore(textLines);
    selectedAt = Date.now();
    selectedContext = {
      question,
      options,
      wordLog: inferWordLog(textLines, options, question)
    };
    return selected;
  }

  function recentSelectionMatches(selected) {
    const ageMs = Date.now() - selectedAt;
    return (
      cleanWord(selectedAnswer) === cleanWord(selected) &&
      Number.isFinite(ageMs) &&
      ageMs >= 0 &&
      ageMs <= 2_000
    );
  }

  function snapshot() {
    const root = gameRoot();
    if (!root) {
      return null;
    }
    const textLines = lines(root);
    const currentOptions = inferOptions(root, textLines);
    const unknownSelected = isUnknownAnswer(selectedAnswer);
    const options = unknownSelected && selectedContext?.options?.length ? selectedContext.options : currentOptions;
    const question = unknownSelected && selectedContext?.question ? selectedContext.question : inferQuestion(textLines);
    const selected =
      options.find((option) => cleanWord(option) === cleanWord(selectedAnswer)) ||
      (unknownSelected ? selectedAnswer : null);
    const markedCorrect = inferCorrect(root, options);
    const elapsedMs = selectedAt ? Date.now() - selectedAt : 0;
    const currentScore = inferScore(textLines);
    const scoreResult = resultFromScore(selected, selectedScore, currentScore, elapsedMs);
    const result = unknownSelected
      ? inferResult(textLines) || scoreResult || "incorrect"
      : resultFromSelection(selected, markedCorrect) || inferResult(textLines) || scoreResult;
    const correct = markedCorrect || correctFromResult(selected, options, result);
    const wordLog =
      unknownSelected && selectedContext?.wordLog?.length
        ? selectedContext.wordLog
        : inferWordLog(textLines, options, question);
    return {
      id: `wc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      captured_at: Date.now(),
      question,
      options,
      word_log: wordLog,
      selected_answer: selected,
      correct_answer: correct,
      result,
      source_url: location.href,
      score_before: selectedScore,
      score_after: currentScore,
      score_delta: scoreDelta(selectedScore, currentScore),
      extractor_version: VERSION
    };
  }

  function send(record, options = {}) {
    if (options.requireResult && !record?.result) {
      return;
    }
    if (!captureReady(record)) {
      return;
    }
    const signature = JSON.stringify([
      record.question,
      record.selected_answer,
      record.correct_answer,
      record.result
    ]);
    if (signature === lastSent) {
      return;
    }
    lastSent = signature;
    location.href = `wcoach://capture?payload=${encodeURIComponent(JSON.stringify(record))}`;
  }

  function bind() {
    injectCss();
    bindDragPan();
    document.addEventListener(
      "pointerdown",
      (event) => {
        const root = gameRoot();
        const target = event.target instanceof Element ? event.target : null;
        const button = target?.closest("button, [role='button'], [aria-label]");
        if (!root || !button || !root.contains(button)) {
          return;
        }
        rememberSelection(root, button);
      },
      true
    );
    document.addEventListener(
      "click",
      (event) => {
        const root = gameRoot();
        const target = event.target instanceof Element ? event.target : null;
        const button = target?.closest("button, [role='button'], [aria-label]");
        if (!root || !button || !root.contains(button)) {
          return;
        }
        const selected = selectedOptionForButton(root, button) || unknownAnswerForButton(button);
        if (!selected) {
          return;
        }
        if (!recentSelectionMatches(selected)) {
          rememberSelection(root, button);
        }
        window.setTimeout(() => send(snapshot(), { requireResult: true }), 900);
        window.setTimeout(() => send(snapshot()), 1800);
      },
      true
    );

    const observer = new MutationObserver(() => {
      injectCss();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "aria-label"]
    });
  }

  function bindDragPan() {
    let activeRoot = null;
    let startX = 0;
    let startY = 0;
    let scrollLeft = 0;
    let scrollTop = 0;

    document.addEventListener(
      "pointerdown",
      (event) => {
        const root = gameRoot();
        const target = event.target instanceof Element ? event.target : null;
        if (!root || !target || !root.contains(target) || interactiveTarget(target)) {
          return;
        }
        activeRoot = root;
        startX = event.clientX;
        startY = event.clientY;
        scrollLeft = root.scrollLeft;
        scrollTop = root.scrollTop;
        root.classList.add("word-coach-dragging");
        root.setPointerCapture?.(event.pointerId);
      },
      true
    );

    document.addEventListener(
      "pointermove",
      (event) => {
        if (!activeRoot) {
          return;
        }
        activeRoot.scrollLeft = scrollLeft - (event.clientX - startX);
        activeRoot.scrollTop = scrollTop - (event.clientY - startY);
      },
      true
    );

    const stop = (event) => {
      if (!activeRoot) {
        return;
      }
      activeRoot.releasePointerCapture?.(event.pointerId);
      activeRoot.classList.remove("word-coach-dragging");
      activeRoot = null;
    };

    document.addEventListener("pointerup", stop, true);
    document.addEventListener("pointercancel", stop, true);
  }

  function interactiveTarget(target) {
    return Boolean(
      target.closest(
        "button, a, input, textarea, select, [role='button'], [contenteditable='true']"
      )
    );
  }

  if (window.__WORD_COACH_TEST_HOOK__) {
    window.__WORD_COACH_TEST_HOOK__.helpers = {
      inferCorrect,
      inferOptions,
      inferResult,
      inferScore,
      resultFromScore,
      scoreDelta,
      resultFromSelection,
      correctFromResult,
      captureReady
    };
  }

  ready(bind);
})();
