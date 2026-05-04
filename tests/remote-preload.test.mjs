import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function runRemotePreload(href) {
  const listeners = new Map();
  const styles = new Map();
  const timeouts = [];
  const appendStyle = (node) => {
    if (node.id) {
      styles.set(node.id, node);
    }
  };
  const documentElement = {
    dataset: {},
    style: {},
    appendChild: appendStyle
  };
  const document = {
    documentElement,
    head: {
      appendChild: appendStyle
    },
    addEventListener(type, listener) {
      const bucket = listeners.get(type) || [];
      bucket.push(listener);
      listeners.set(type, bucket);
    },
    createElement() {
      return {
        id: "",
        textContent: "",
        remove() {
          styles.delete(this.id);
        }
      };
    },
    getElementById(id) {
      return styles.get(id) || null;
    }
  };
  const window = {
    matchMedia() {
      return {
        matches: false,
        addEventListener() {}
      };
    },
    setTimeout(callback, delay) {
      timeouts.push({ callback, delay });
    }
  };

  vm.runInNewContext(await fs.readFile("electron/remote-preload.cjs", "utf8"), {
    Date,
    Element: class {},
    URL,
    document,
    location: { href },
    require(name) {
      assert.equal(name, "electron");
      return {
        contextBridge: {
          exposeInMainWorld() {}
        },
        ipcRenderer: {
          invoke() {}
        }
      };
    },
    window
  });

  const runTimers = () => {
    for (const timer of timeouts.splice(0).sort((left, right) => left.delay - right.delay)) {
      timer.callback();
    }
  };

  return { document, listeners, runTimers, styles };
}

test("remote preload hides Google Word Coach search before injected css runs", async () => {
  const harness = await runRemotePreload(
    "https://www.google.co.in/search?q=google+word+coach&hl=ko&gl=IN"
  );

  assert.equal(harness.document.documentElement.dataset.wordcoachBootHidden, "true");
  assert.ok(harness.styles.get("wordcoach-boot-hide-style").textContent.includes("visibility: hidden"));
});

test("remote preload does not boot-hide unrelated remote pages", async () => {
  const harness = await runRemotePreload("https://en.dict.naver.com/#/search?query=test");

  assert.equal(harness.document.documentElement.dataset.wordcoachBootHidden, undefined);
  assert.equal(harness.styles.has("wordcoach-boot-hide-style"), false);
});

test("remote preload boot hide fails open if extractor never releases it", async () => {
  const harness = await runRemotePreload(
    "https://www.google.co.in/search?q=google+word+coach&hl=ko&gl=IN"
  );

  harness.runTimers();

  assert.equal(harness.document.documentElement.dataset.wordcoachBootHidden, undefined);
  assert.equal(harness.document.documentElement.dataset.wordcoachBootTimedOut, "true");
  assert.equal(harness.styles.has("wordcoach-boot-hide-style"), false);
});
