import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

test("main app snapshot forwards every renderer snapshot field", async () => {
  const [mainSource, rendererTypes] = await Promise.all([
    fs.readFile("electron/main.mjs", "utf8"),
    fs.readFile("src/electron-api.d.ts", "utf8")
  ]);
  const rendererFields = snapshotTypeFields(rendererTypes);
  const mainFields = appSnapshotReturnFields(mainSource);

  assert.deepEqual(
    rendererFields.filter((field) => !mainFields.includes(field)),
    [],
    "electron/main.mjs appSnapshot() should forward every renderer AppSnapshot field"
  );
  assert.deepEqual(
    mainFields.filter((field) => !rendererFields.includes(field)),
    [],
    "renderer AppSnapshot type should include every appSnapshot() field"
  );
});

test("preload API, renderer calls, and main IPC handlers stay aligned", async () => {
  const [mainSource, preloadSource, rendererSource, rendererTypes] = await Promise.all([
    fs.readFile("electron/main.mjs", "utf8"),
    fs.readFile("electron/preload.cjs", "utf8"),
    fs.readFile("src/main.ts", "utf8"),
    fs.readFile("src/electron-api.d.ts", "utf8")
  ]);
  const preloadApi = preloadMethods(preloadSource);
  const rendererApi = rendererWordCoachMethods(rendererSource);
  const typedApi = typedWordCoachMethods(rendererTypes);
  const invokedChannels = preloadInvokeChannels(preloadSource);
  const handledChannels = mainIpcChannels(mainSource);

  assert.deepEqual(
    rendererApi.filter((method) => !preloadApi.includes(method)),
    [],
    "renderer should only call methods exposed by electron/preload.cjs"
  );
  assert.deepEqual(
    preloadApi.filter((method) => !typedApi.includes(method)),
    [],
    "src/electron-api.d.ts should type every preload method"
  );
  assert.deepEqual(
    typedApi.filter((method) => !preloadApi.includes(method)),
    [],
    "electron/preload.cjs should expose every typed wordCoach method"
  );
  assert.deepEqual(
    invokedChannels.filter((channel) => !handledChannels.includes(channel)),
    [],
    "electron/main.mjs should handle every channel invoked by preload"
  );
});

function snapshotTypeFields(source) {
  const match = source.match(/type AppSnapshot = \{([\s\S]*?)\n\};/);
  assert.ok(match, "renderer AppSnapshot type should exist");
  return [...match[1].matchAll(/^\s{2}([a-zA-Z_][a-zA-Z0-9_]*):/gm)].map((field) => field[1]);
}

function preloadMethods(source) {
  return [...source.matchAll(/^\s{2}([a-zA-Z_][a-zA-Z0-9_]*):/gm)].map((method) => method[1]);
}

function rendererWordCoachMethods(source) {
  return unique([...source.matchAll(/window\.wordCoach\.([a-zA-Z_][a-zA-Z0-9_]*)/g)].map((method) => method[1]));
}

function typedWordCoachMethods(source) {
  const match = source.match(/wordCoach: \{([\s\S]*?)\n    \};/);
  assert.ok(match, "renderer wordCoach type should exist");
  return [...match[1].matchAll(/^\s{6}([a-zA-Z_][a-zA-Z0-9_]*):/gm)].map((method) => method[1]);
}

function preloadInvokeChannels(source) {
  return unique([...source.matchAll(/ipcRenderer\.invoke\("([^"]+)"/g)].map((channel) => channel[1]));
}

function mainIpcChannels(source) {
  return unique([...source.matchAll(/ipcMain\.handle\("([^"]+)"/g)].map((channel) => channel[1]));
}

function unique(values) {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function appSnapshotReturnFields(source) {
  const functionStart = source.indexOf("function appSnapshot()");
  assert.notEqual(functionStart, -1, "main appSnapshot function should exist");
  const returnStart = source.indexOf("return {", functionStart);
  assert.notEqual(returnStart, -1, "main appSnapshot function should return an object");
  const objectStart = source.indexOf("{", returnStart);
  const objectEnd = matchingBraceIndex(source, objectStart);
  const objectSource = source.slice(objectStart, objectEnd + 1);
  return topLevelObjectFields(objectSource);
}

function matchingBraceIndex(source, start) {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "{") {
      depth += 1;
    } else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  assert.fail("object literal should have a matching closing brace");
}

function topLevelObjectFields(source) {
  const fields = [];
  let depth = 0;
  let lineDepth = 0;
  let line = "";
  for (const char of source) {
    const startsLine = line.length === 0;
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
    }
    if (startsLine) {
      lineDepth = depth;
    }
    if (char === "\n") {
      const match = lineDepth === 1 ? line.match(/^\s{4}([a-zA-Z_][a-zA-Z0-9_]*):/) : null;
      if (match) {
        fields.push(match[1]);
      }
      line = "";
    } else {
      line += char;
    }
  }
  return fields;
}
