(() => {
  const VERSION = 1;
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
      cursor: grab !important;
      overscroll-behavior: contain !important;
      touch-action: pan-x pan-y !important;
    }
    div[class*='knowledge_game'].word-coach-dragging {
      cursor: grabbing !important;
      user-select: none !important;
    }
    @media (prefers-color-scheme: dark) {
      html,
      body,
      div[class*='knowledge_game'] {
        color-scheme: dark !important;
      }
    }
    html[data-wordcoach-color-scheme='dark'],
    html[data-wordcoach-color-scheme='dark'] body,
    html[data-wordcoach-color-scheme='dark'] div[class*='knowledge_game'] {
      color-scheme: dark !important;
    }
    html[data-wordcoach-color-scheme='dark'] div[class*='knowledge_game'] {
      background: #202124 !important;
      color: #e8eaed !important;
    }
    html[data-wordcoach-color-scheme='dark'] div[class*='knowledge_game'] [data-wordcoach-neutral-bg='true'] {
      background-color: #202124 !important;
      border-color: #3c4043 !important;
    }
    html[data-wordcoach-color-scheme='dark'] div[class*='knowledge_game'] [data-wordcoach-neutral-bg='surface'] {
      background-color: #303134 !important;
      border-color: #3c4043 !important;
    }
    html[data-wordcoach-color-scheme='dark'] div[class*='knowledge_game'] [data-wordcoach-neutral-fg='true'] {
      color: #e8eaed !important;
    }
    html[data-wordcoach-color-scheme='dark'] div[class*='knowledge_game'] [data-wordcoach-muted-fg='true'] {
      color: #bdc1c6 !important;
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

  function darkModeActive() {
    return (
      document.documentElement.dataset.wordcoachColorScheme === "dark" ||
      Boolean(window.matchMedia?.("(prefers-color-scheme: dark)")?.matches)
    );
  }

  function syncDarkTheme() {
    const root = gameRoot();
    if (!root) {
      return;
    }
    if (!darkModeActive()) {
      clearDarkMarks(root);
      return;
    }
    for (const element of [root, ...root.querySelectorAll("*")]) {
      markNeutralElement(element);
    }
  }

  function clearDarkMarks(root) {
    for (const element of root.querySelectorAll("[data-wordcoach-neutral-bg], [data-wordcoach-neutral-fg], [data-wordcoach-muted-fg]")) {
      delete element.dataset.wordcoachNeutralBg;
      delete element.dataset.wordcoachNeutralFg;
      delete element.dataset.wordcoachMutedFg;
    }
  }

  function markNeutralElement(element) {
    if (resultStateElement(element)) {
      delete element.dataset.wordcoachNeutralBg;
      return;
    }
    const style = window.getComputedStyle(element);
    const background = colorChannels(style.backgroundColor);
    const foreground = colorChannels(style.color);
    if (background && lightNeutral(background)) {
      const value = element === gameRoot() ? "true" : "surface";
      if (element.dataset.wordcoachNeutralBg !== value) {
        element.dataset.wordcoachNeutralBg = value;
      }
    }
    if (foreground && darkNeutral(foreground)) {
      if (element.dataset.wordcoachNeutralFg !== "true") {
        element.dataset.wordcoachNeutralFg = "true";
      }
    } else if (foreground && mutedNeutral(foreground)) {
      if (element.dataset.wordcoachMutedFg !== "true") {
        element.dataset.wordcoachMutedFg = "true";
      }
    }
  }

  function resultStateElement(element) {
    const marker = [
      element.getAttribute("aria-label") || "",
      element.getAttribute("class") || "",
      element.getAttribute("style") || ""
    ]
      .join(" ")
      .toLowerCase();
    return /(correct|incorrect|wrong|right|green|red|#188038|#d93025|rgb\(24,\s*128,\s*56\)|rgb\(217,\s*48,\s*37\))/.test(marker);
  }

  function colorChannels(value) {
    const match = String(value || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);
    if (!match) {
      return null;
    }
    const alpha = match[4] === undefined ? 1 : Number(match[4]);
    if (!Number.isFinite(alpha) || alpha < 0.1) {
      return null;
    }
    return [Number(match[1]), Number(match[2]), Number(match[3])];
  }

  function neutral(channels) {
    return Math.max(...channels) - Math.min(...channels) <= 18;
  }

  function lightNeutral(channels) {
    return neutral(channels) && channels.every((channel) => channel >= 225);
  }

  function darkNeutral(channels) {
    return neutral(channels) && channels.every((channel) => channel <= 95);
  }

  function mutedNeutral(channels) {
    return neutral(channels) && channels.every((channel) => channel > 95 && channel <= 170);
  }

  function visible(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function ownText(element) {
    return Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent || "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function nodeText(element) {
    return (element.innerText || element.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function lines(root) {
    return nodeText(root)
      .split(/\n| {2,}/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }

  function optionNodes(root) {
    const nodes = Array.from(root.querySelectorAll("button, [role='button'], [aria-label]"));
    const seen = new Set();
    return nodes
      .filter((node) => visible(node))
      .map((node) => {
        const text = ownText(node) || nodeText(node) || node.getAttribute("aria-label") || "";
        return text.replace(/\s+/g, " ").trim();
      })
      .filter((text) => {
        const key = text.toLowerCase();
        if (!text || text.length > 80 || seen.has(key)) {
          return false;
        }
        seen.add(key);
        return !/^(next|share|search|learn more|check|try again)$/i.test(text);
      })
      .slice(0, 6);
  }

  function inferResult(textLines) {
    const joined = textLines.join(" ").toLowerCase();
    if (/\b(correct|great|nice)\b/.test(joined)) {
      return "correct";
    }
    if (/\b(incorrect|wrong|not quite)\b/.test(joined)) {
      return "incorrect";
    }
    return null;
  }

  function inferQuestion(textLines, options, selected) {
    const banned = new Set(options.concat([selected || ""]).map((value) => value.toLowerCase()));
    const candidates = textLines.filter((line) => {
      const key = line.toLowerCase();
      return (
        line.length > 2 &&
        line.length < 220 &&
        !banned.has(key) &&
        !/^(google word coach|word coach|next|share|check|correct|incorrect|wrong)$/i.test(line)
      );
    });
    return candidates[0] || null;
  }

  function inferCorrect(root, options, selected, result) {
    if (result === "correct" && selected) {
      return selected;
    }
    const candidates = Array.from(root.querySelectorAll("button, [role='button'], [aria-label]"));
    for (const node of candidates) {
      const text = nodeText(node);
      const marker = [
        node.getAttribute("aria-label") || "",
        node.getAttribute("class") || "",
        node.getAttribute("style") || ""
      ].join(" ").toLowerCase();
      if (text && options.includes(text) && /(correct|right|green|#188038|rgb\(24,\s*128,\s*56\))/.test(marker)) {
        return text;
      }
    }
    return null;
  }

  function inferWordLog(textLines, options, question) {
    const prompt = textLines.join(" ").toLowerCase();
    const askedWord = cleanWord(question);
    const optionWords = options.map(cleanWord).filter(Boolean);
    if (/\b(similar|synonym|opposite|antonym)\b/.test(prompt)) {
      return uniqueWords([targetWord(textLines, optionWords, prompt) || askedWord, ...optionWords]).slice(0, 3);
    }
    if (/\b(image|picture|photo)\b/.test(prompt)) {
      return uniqueWords([targetWord(textLines, optionWords, prompt) || askedWord]).slice(0, 1);
    }
    return uniqueWords([askedWord || targetWord(textLines, optionWords, prompt), ...optionWords]).slice(0, 3);
  }

  function targetWord(textLines, optionWords, prompt) {
    const patterns = [
      /\b(?:similar|synonym)\b.*?\b(?:to|of|for)\b\s+["'“”]?([A-Za-z][A-Za-z'-]{1,})/i,
      /\b(?:opposite|antonym)\b.*?\b(?:to|of|for)\b\s+["'“”]?([A-Za-z][A-Za-z'-]{1,})/i,
      /\b(?:image|picture|photo)\b.*?\b(?:word|means|matches|represents)\b\s+["'“”]?([A-Za-z][A-Za-z'-]{1,})/i
    ];
    for (const pattern of patterns) {
      const match = prompt.match(pattern);
      const word = cleanWord(match?.[1]);
      if (word) {
        return word;
      }
    }

    const promptIndex = textLines.findIndex((line) =>
      /\b(similar|synonym|opposite|antonym|image|picture|photo)\b/i.test(line)
    );
    const candidates = textLines.slice(Math.max(0, promptIndex), promptIndex + 4);
    for (const line of candidates) {
      const word = cleanWord(line);
      if (word && !optionWords.includes(word)) {
        return word;
      }
    }
    return null;
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

  function cleanWord(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    const words = text.match(/[A-Za-z][A-Za-z'-]{1,}/g) || [];
    if (words.length !== 1 || /^(word|coach|google|similar|opposite|image|picture|photo)$/i.test(words[0])) {
      return null;
    }
    return words[0].replace(/^'+|'+$/g, "").toLowerCase();
  }

  let selectedAnswer = null;
  let lastSent = "";

  function snapshot() {
    const root = gameRoot();
    if (!root) {
      return null;
    }
    const textLines = lines(root);
    const options = optionNodes(root);
    const result = inferResult(textLines);
    const question = inferQuestion(textLines, options, selectedAnswer);
    const correct = inferCorrect(root, options, selectedAnswer, result);
    const wordLog = inferWordLog(textLines, options, question);
    return {
      id: `wc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      captured_at: Date.now(),
      question,
      options,
      word_log: wordLog,
      selected_answer: selectedAnswer,
      correct_answer: correct,
      result,
      source_url: location.href,
      extractor_version: VERSION
    };
  }

  function send(record) {
    if (!record || (!record.selected_answer && !record.result)) {
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
    syncDarkTheme();
    bindDragPan();
    document.addEventListener(
      "click",
      (event) => {
        const root = gameRoot();
        const target = event.target instanceof Element ? event.target : null;
        const button = target?.closest("button, [role='button'], [aria-label]");
        if (!root || !button || !root.contains(button)) {
          return;
        }
        const text = nodeText(button);
        if (!text || /^(next|share|search|learn more)$/i.test(text)) {
          return;
        }
        selectedAnswer = text;
        window.setTimeout(() => send(snapshot()), 900);
        window.setTimeout(() => send(snapshot()), 1800);
      },
      true
    );

    const observer = new MutationObserver(() => {
      injectCss();
      syncDarkTheme();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "aria-label", "data-wordcoach-color-scheme"]
    });
    window.matchMedia?.("(prefers-color-scheme: dark)")?.addEventListener?.("change", syncDarkTheme);
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

  ready(bind);
})();
