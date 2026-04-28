(() => {
  const HOST = "english.dict.naver.com";
  const THESAURUS_PATH = "/english-thesaurus";
  const LABEL = "번역문";
  const HIDDEN_ATTR = "data-wordcoach-hidden-naver-translation";
  const STYLE_ID = "wordcoach-naver-thesaurus-style";

  const active = () =>
    location.hostname === HOST && location.pathname.startsWith(THESAURUS_PATH);

  const ensureStyle = () => {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `[${HIDDEN_ATTR}="true"] { display: none !important; }`;
    (document.head || document.documentElement).appendChild(style);
  };

  const text = (element) =>
    String(element?.innerText || element?.textContent || "")
      .replace(/\s+/g, " ")
      .trim();

  const visible = (element) => {
    if (!element || element.closest(`[${HIDDEN_ATTR}="true"]`)) {
      return false;
    }
    const style = getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity || 1) !== 0 &&
      element.getClientRects().length > 0
    );
  };

  const optionRoots = () => {
    const roots = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (node.nodeValue?.includes(LABEL) && node.parentElement) {
        roots.add(optionRoot(node.parentElement));
      }
      node = walker.nextNode();
    }
    return [...roots].filter(Boolean);
  };

  const optionRoot = (element) => {
    let current = element;
    let fallback = element.closest("span, label, button, [role='button'], [role='switch'], [role='checkbox']");
    for (let depth = 0; current && current !== document.body && depth < 6; depth += 1) {
      const value = text(current);
      if (value.includes(LABEL) && value.length <= 100) {
        fallback = current;
        if (
          hasControl(current) ||
          /(^|\s)(option|filter|switch|toggle|check|checkbox|setting)/i.test(current.className)
        ) {
          return current;
        }
      }
      if (value.includes(LABEL) && value.length > 100) {
        break;
      }
      current = current.parentElement;
    }
    return fallback;
  };

  const hasControl = (element) =>
    Boolean(
      element.matches?.("label, button, input, [role='button'], [role='switch'], [role='checkbox']") ||
        element.querySelector?.("input, button, [role='button'], [role='switch'], [role='checkbox']")
    );

  const controlFor = (root) =>
    root.matches("input, button, label, [role='button'], [role='switch'], [role='checkbox']")
      ? root
      : root.querySelector("input, button, label, [role='button'], [role='switch'], [role='checkbox']");

  const checkedState = (root, control) => {
    const input = control?.matches?.("input[type='checkbox'], input[type='radio']")
      ? control
      : root.querySelector("input[type='checkbox'], input[type='radio']");
    if (input) {
      return input.checked;
    }
    const stateElement =
      control ||
      root.querySelector("[aria-checked], [aria-pressed], .on, .active, .selected, .checked");
    const ariaState =
      stateElement?.getAttribute("aria-checked") || stateElement?.getAttribute("aria-pressed");
    if (ariaState === "true") {
      return true;
    }
    if (ariaState === "false") {
      return false;
    }
    const className = String(stateElement?.className || root.className || "");
    if (/(^|[_\-\s])(on|active|selected|checked|is-active|is-checked|is-selected)([_\-\s]|$)/i.test(className)) {
      return true;
    }
    return null;
  };

  const apply = () => {
    if (!active() || !document.body) {
      return;
    }
    ensureStyle();
    for (const root of optionRoots()) {
      if (!visible(root)) {
        continue;
      }
      const control = controlFor(root);
      if (control && checkedState(root, control) === true) {
        control?.click();
      }
      root.setAttribute(HIDDEN_ATTR, "true");
    }
  };

  let timer = null;
  const schedule = () => {
    if (timer) {
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      apply();
    }, 50);
  };

  apply();
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("hashchange", schedule);
  window.addEventListener("popstate", schedule);
})();
