import { spawn } from "node:child_process";
import http from "node:http";

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const viteUrl = "http://127.0.0.1:1420";
const children = new Set();

const vite = spawn(
  pnpm,
  ["exec", "vite", "--host", "127.0.0.1", "--port", "1420"],
  { stdio: "inherit" }
);
children.add(vite);

await waitForUrl(viteUrl);

const electron = spawn(pnpm, ["exec", "electron", "--no-sandbox", "electron/main.mjs"], {
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: `${viteUrl}/`
  }
});
children.add(electron);

electron.on("exit", (code) => {
  shutdown();
  process.exit(code ?? 0);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    shutdown();
    process.exit(0);
  });
}

function shutdown() {
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
}

function waitForUrl(url) {
  const deadline = Date.now() + 20_000;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });
      request.on("error", () => {
        if (Date.now() > deadline) {
          reject(new Error(`Timed out waiting for ${url}`));
        } else {
          setTimeout(tick, 150);
        }
      });
    };
    tick();
  });
}
