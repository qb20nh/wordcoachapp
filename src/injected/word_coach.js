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
    for (const line of [...textLines, prompt]) {
      const word = wordFromPromptLine(line);
      if (word && !optionWords.includes(word)) {
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

  function wordFromPromptLine(line) {
    const phrase = "([A-Za-z][A-Za-z'-]*(?:\\s+[A-Za-z][A-Za-z'-]*){0,3})";
    const patterns = [
      new RegExp(`["'“]${phrase}["'”]`, "i"),
      new RegExp(`\\b(?:similar|synonym)\\b.*?\\b(?:to|of|for)\\b\\s+["'“]?${phrase}`, "i"),
      new RegExp(`\\b(?:opposite|antonym)\\b.*?\\b(?:to|of|for)\\b\\s+["'“]?${phrase}`, "i"),
      new RegExp(`\\b(?:image|picture|photo)\\b.*?\\b(?:of|for|word|means|matches|represents)\\b\\s+["'“]?${phrase}`, "i"),
      new RegExp(`\\b(?:matches|represents|means)\\b\\s+["'“]?${phrase}`, "i")
    ];
    for (const pattern of patterns) {
      const match = String(line || "").match(pattern);
      const word = cleanWord(match?.[1]);
      if (word) {
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
    const text = String(value || "")
      .replace(/[“”]/g, '"')
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^["']+|["'.,!?;:]+$/g, "");
    if (
      !text ||
      text.length > 64 ||
      /\b(which|what|choose|select|similar|synonym|opposite|antonym|image|picture|photo|matches|represents|means)\b/i.test(text)
    ) {
      return null;
    }
    const words = text.match(/[A-Za-z][A-Za-z'-]*/g) || [];
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

  ready(bind);
})();
