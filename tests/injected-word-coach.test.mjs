import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function loadHelpers() {
  const hook = {};
  const document = {
    readyState: "loading",
    addEventListener() {},
    getElementById() {
      return null;
    },
    createElement() {
      return {};
    },
    head: {
      appendChild() {}
    },
    documentElement: {
      appendChild() {}
    },
    querySelector() {
      return null;
    }
  };
  const window = {
    __WORD_COACH_CUSTOM_CSS: "",
    __WORD_COACH_TEST_HOOK__: hook
  };

  vm.runInNewContext(await fs.readFile("src/injected/word_coach.js", "utf8"), {
    document,
    location: { href: "https://www.google.com/search?q=google+word+coach" },
    MutationObserver: class {
      observe() {}
    },
    window
  });
  return hook.helpers;
}

async function loadRuntimeHarness() {
  const listeners = new Map();
  const timeouts = [];
  let now = 1_000;
  const buttonNodes = [];
  class FakeElement {
    closest() {
      return null;
    }
  }
  class FakeButton extends FakeElement {
    constructor(text, attributes = {}) {
      super();
      this.innerText = text;
      this.textContent = text;
      this.attributes = attributes;
    }

    closest(selector) {
      return selector.includes("button") ? this : null;
    }

    getAttribute(name) {
      return (
        {
          "aria-label": "",
          class: "",
          style: "",
          ...this.attributes
        }[name] || ""
      );
    }
  }
  const root = new FakeElement();
  root.innerText =
    "WORD COACH Score 0 Which word is similar to equanimity? Forfeiture or Composure Question 1 of 5";
  root.textContent = root.innerText;
  root.querySelectorAll = () => buttonNodes;
  root.contains = (node) => buttonNodes.includes(node);
  root.classList = {
    add() {},
    remove() {}
  };
  root.setPointerCapture = () => undefined;
  root.releasePointerCapture = () => undefined;
  const document = {
    readyState: "complete",
    addEventListener(type, listener) {
      const bucket = listeners.get(type) || [];
      bucket.push(listener);
      listeners.set(type, bucket);
    },
    getElementById() {
      return null;
    },
    createElement() {
      return {};
    },
    head: {
      appendChild() {}
    },
    documentElement: {
      appendChild() {}
    },
    querySelector() {
      return root;
    }
  };
  const location = { href: "https://www.google.com/search?q=google+word+coach" };
  const window = {
    __WORD_COACH_CUSTOM_CSS: "",
    setTimeout(callback, delay) {
      timeouts.push({ callback, delay });
    }
  };

  vm.runInNewContext(await fs.readFile("src/injected/word_coach.js", "utf8"), {
    document,
    Element: FakeElement,
    location,
    MutationObserver: class {
      observe() {}
    },
    Date: {
      now() {
        return now;
      }
    },
    Math,
    window
  });

  const dispatch = (type, target) => {
    for (const listener of listeners.get(type) || []) {
      listener({ target, clientX: 0, clientY: 0, pointerId: 1 });
    }
  };
  const runTimers = () => {
    for (const timer of timeouts.splice(0).sort((left, right) => left.delay - right.delay)) {
      now = 1_000 + timer.delay;
      timer.callback();
    }
  };
  const setText = (text) => {
    root.innerText = text;
    root.textContent = text;
  };
  const addButton = (text, attributes = {}) => {
    const button = new FakeButton(text, attributes);
    buttonNodes.push(button);
    return button;
  };

  return { addButton, dispatch, location, runTimers, setText };
}

function rootWithButtons(buttons, text = "") {
  return {
    innerText: text,
    textContent: text,
    querySelectorAll() {
      return buttons.map(({ text, className = "", style = "", ariaLabel = "" }) => ({
        innerText: text,
        textContent: text,
        getAttribute(name) {
          return {
            "aria-label": ariaLabel,
            class: className,
            style
          }[name] || "";
        }
      }));
    }
  };
}

test("derives incorrect result from selected option and marked correct option", async () => {
  const helpers = await loadHelpers();
  const options = helpers.inferOptions([
    "unfathomable과(와) 뜻이 반대인 단어는 무엇인가요? Penetrable 또는 Payable Question 1 of 5"
  ]);
  const correct = helpers.inferCorrect(
    rootWithButtons([
      { text: "Penetrable" },
      { text: "Payable", style: "color: rgb(24, 128, 56)" }
    ]),
    options
  );

  assert.deepEqual(Array.from(options), ["Penetrable", "Payable"]);
  assert.equal(correct, "Payable");
  assert.equal(helpers.resultFromSelection("Penetrable", correct), "incorrect");
});

test("derives correct result from selected option and marked correct option", async () => {
  const helpers = await loadHelpers();
  const options = ["Penetrable", "Payable"];
  const correct = helpers.inferCorrect(
    rootWithButtons([
      { text: "Penetrable", className: "answer is-correct" },
      { text: "Payable" }
    ]),
    options
  );

  assert.equal(correct, "Penetrable");
  assert.equal(helpers.resultFromSelection("Penetrable", correct), "correct");
});

test("derives answer options from quiz buttons when prompt text omits choices", async () => {
  const helpers = await loadHelpers();
  const root = rootWithButtons(
    [{ text: "Forfeiture" }, { text: "Composure" }, { text: "SKIP" }, { text: "No thanks" }],
    "WORD COACH Score 0 Which word is similar to equanimity? Question 1 of 5"
  );

  assert.deepEqual(
    Array.from(
      helpers.inferOptions(root, [
        "WORD COACH Score 0 Which word is similar to equanimity? Question 1 of 5"
      ])
    ),
    ["Forfeiture", "Composure"]
  );
});

test("recognizes Korean incorrect feedback as fallback", async () => {
  const helpers = await loadHelpers();

  assert.equal(helpers.inferResult(["오답입니다"]), "incorrect");
});

test("does not treat a correct-answer label as a correct result", async () => {
  const helpers = await loadHelpers();

  assert.equal(helpers.inferResult(["Correct answer Payable"]), null);
  assert.equal(helpers.inferResult(["Correct"]), "correct");
});

test("parses duplicated Word Coach scores from English and Korean quiz text", async () => {
  const helpers = await loadHelpers();

  assert.equal(
    helpers.inferScore([
      "WORD COACH Score • 280 280 Which word is similar to indecisive? Inconclusive or Interpretative"
    ]),
    280
  );
  assert.equal(
    helpers.inferScore([
      "단어 과외 점수 • 5,360 5,360 uninitiated과(와) 뜻이 비슷한 단어는 무엇인가요?"
    ]),
    5360
  );
});

test("derives answer result from score movement when no marker is exposed", async () => {
  const helpers = await loadHelpers();

  assert.equal(helpers.resultFromScore("Forfeiture", 0, 120, 900), "correct");
  assert.equal(helpers.resultFromScore("Forfeiture", 0, 0, 900), null);
  assert.equal(helpers.resultFromScore("Forfeiture", 0, 0, 1800), "incorrect");
  assert.equal(helpers.scoreDelta(0, 120), 120);
  assert.equal(helpers.scoreDelta(280, 280), 0);
  assert.equal(helpers.scoreDelta(280, 120), 0);
});

test("keeps the pre-click score when Google updates before click handlers run", async () => {
  const harness = await loadRuntimeHarness();
  const selected = harness.addButton("Composure");
  harness.addButton("Forfeiture");

  harness.dispatch("pointerdown", selected);
  harness.setText(
    "WORD COACH Score 280 Which word is similar to equanimity? Forfeiture or Composure Question 1 of 5"
  );
  harness.dispatch("click", selected);
  harness.runTimers();

  const payload = JSON.parse(
    decodeURIComponent(new URL(harness.location.href).searchParams.get("payload"))
  );
  assert.equal(payload.selected_answer, "Composure");
  assert.equal(payload.correct_answer, "Composure");
  assert.equal(payload.result, "correct");
  assert.equal(payload.score_before, 0);
  assert.equal(payload.score_after, 280);
  assert.equal(payload.score_delta, 280);
});

test("captures skip as an incorrect answer for the pre-click quiz word", async () => {
  const harness = await loadRuntimeHarness();
  harness.addButton("Forfeiture");
  harness.addButton("Composure");
  const skip = harness.addButton("SKIP");

  harness.dispatch("pointerdown", skip);
  harness.setText(
    "WORD COACH Score 0 Which word is similar to abundant? Plenty or Scarce Question 2 of 5"
  );
  harness.dispatch("click", skip);
  harness.runTimers();

  const payload = JSON.parse(
    decodeURIComponent(new URL(harness.location.href).searchParams.get("payload"))
  );
  assert.equal(
    payload.question,
    "WORD COACH Score 0 Which word is similar to equanimity? Forfeiture or Composure"
  );
  assert.deepEqual(payload.options, ["Forfeiture", "Composure"]);
  assert.deepEqual(payload.word_log, ["equanimity", "forfeiture", "composure"]);
  assert.equal(payload.selected_answer, "SKIP");
  assert.equal(payload.result, "incorrect");
});

test("captures aria-label unknown answers as history records", async () => {
  const harness = await loadRuntimeHarness();
  harness.addButton("Forfeiture");
  harness.addButton("Composure");
  const skip = harness.addButton("", { "aria-label": "I don't know" });

  harness.dispatch("pointerdown", skip);
  harness.setText(
    "WORD COACH Score 0 Which word is similar to abundant? Plenty or Scarce Question 2 of 5"
  );
  harness.dispatch("click", skip);
  harness.runTimers();

  const payload = JSON.parse(
    decodeURIComponent(new URL(harness.location.href).searchParams.get("payload"))
  );
  assert.equal(
    payload.question,
    "WORD COACH Score 0 Which word is similar to equanimity? Forfeiture or Composure"
  );
  assert.deepEqual(payload.options, ["Forfeiture", "Composure"]);
  assert.deepEqual(payload.word_log, ["equanimity", "forfeiture", "composure"]);
  assert.equal(payload.selected_answer, "I don't know");
  assert.equal(payload.result, "incorrect");
});

test("captures one-word picture prompts as the quiz word", async () => {
  const harness = await loadRuntimeHarness();
  const selected = harness.addButton("", { "aria-label": "Forest" });
  harness.addButton("", { "aria-label": "Conversation" });

  harness.setText("WORD COACH Score 0 Reticent Question 1 of 5");
  harness.dispatch("pointerdown", selected);
  harness.dispatch("click", selected);
  harness.runTimers();

  const payload = JSON.parse(
    decodeURIComponent(new URL(harness.location.href).searchParams.get("payload"))
  );
  assert.equal(payload.question, "WORD COACH Score 0 Reticent");
  assert.deepEqual(payload.options, ["Forest", "Conversation"]);
  assert.deepEqual(payload.word_log, ["reticent"]);
  assert.equal(payload.selected_answer, "Forest");
  assert.equal(payload.correct_answer, "Conversation");
  assert.equal(payload.result, "incorrect");
});

test("captures picture-question prompts as the quiz word", async () => {
  const harness = await loadRuntimeHarness();
  const selected = harness.addButton("", { "aria-label": "Forest" });
  harness.addButton("", { "aria-label": "Conversation" });

  harness.setText(
    "WORD COACH Score 0 Which image best represents the word Reticent? Question 1 of 5"
  );
  harness.dispatch("pointerdown", selected);
  harness.dispatch("click", selected);
  harness.runTimers();

  const payload = JSON.parse(
    decodeURIComponent(new URL(harness.location.href).searchParams.get("payload"))
  );
  assert.equal(
    payload.question,
    "WORD COACH Score 0 Which image best represents the word Reticent?"
  );
  assert.deepEqual(payload.options, ["Forest", "Conversation"]);
  assert.deepEqual(payload.word_log, ["reticent"]);
  assert.equal(payload.selected_answer, "Forest");
  assert.equal(payload.correct_answer, "Conversation");
  assert.equal(payload.result, "incorrect");
});

test("captures localized one-word picture prompts as the quiz word", async () => {
  const harness = await loadRuntimeHarness();
  const selected = harness.addButton("", { "aria-label": "Forest" });
  harness.addButton("", { "aria-label": "Conversation" });

  harness.setText("단어 과외 점수 • 280 280 Reticent Question 1 of 5");
  harness.dispatch("pointerdown", selected);
  harness.dispatch("click", selected);
  harness.runTimers();

  const payload = JSON.parse(
    decodeURIComponent(new URL(harness.location.href).searchParams.get("payload"))
  );
  assert.equal(payload.question, "단어 과외 점수 • 280 280 Reticent");
  assert.deepEqual(payload.options, ["Forest", "Conversation"]);
  assert.deepEqual(payload.word_log, ["reticent"]);
  assert.equal(payload.selected_answer, "Forest");
  assert.equal(payload.correct_answer, "Conversation");
  assert.equal(payload.result, "incorrect");
});

test("derives the missing correct answer from binary choices and score result", async () => {
  const helpers = await loadHelpers();

  assert.equal(
    helpers.correctFromResult("Forfeiture", ["Forfeiture", "Composure"], "incorrect"),
    "Composure"
  );
  assert.equal(
    helpers.correctFromResult("Composure", ["Forfeiture", "Composure"], "correct"),
    "Composure"
  );
});

test("keeps resultless answer captures only when the selected word is an option", async () => {
  const helpers = await loadHelpers();

  assert.equal(
    helpers.captureReady({
      selected_answer: "다음 라운드",
      options: ["Penetrable", "Payable"],
      result: null
    }),
    false
  );
  assert.equal(
    helpers.captureReady({
      selected_answer: "Penetrable",
      options: ["Penetrable", "Payable"],
      result: null
    }),
    true
  );
  assert.equal(
    helpers.captureReady({
      selected_answer: "Penetrable",
      result: "incorrect"
    }),
    true
  );
});
