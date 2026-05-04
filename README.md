# Word Coach

Dedicated Electron desktop shell for Google Word Coach study.

## Development

```bash
pnpm install
pnpm dev
```

`pnpm dev` starts Vite and the Electron shell. The window is fixed at `860x860`: top controls/history stay in the renderer, Google Word Coach runs in the left Chromium view, and the selected dictionary runs in the right Chromium view.

Dictionary panel choices: Dictionary.com, Merriam-Webster, and Naver Dictionary. The mode selector switches each provider between dictionary and thesaurus navigation; Naver stays inside English-English dictionary and English thesaurus pages.

The study panel tracks today's unique review words, the remaining daily goal, progress, daily accuracy, the current study streak, seven-day activity, and words due for spaced review after mistakes. The daily goal is configurable in Settings.
Review chips focus on the quiz prompt word, or on the correct answer when an image-style prompt has no reviewable word. They include picked-vs-correct mistake context, show upcoming scheduled difficult words, graduate after the final spaced review, and raise an in-app cue when due reviews appear.

The Preload control tunes network warmup:

- Off: no extra warmup
- DNS: warms Electron DNS and the app proxy DNS cache
- Preconnect: DNS plus Chromium session preconnects through the app proxy
- Pages: preconnect plus hidden same-session page loads to warm HTTP cache, without OS proxy changes or browser prerender APIs
- Prerender: keeps all six dictionary provider/mode pages loaded in hidden same-session windows; this can use much more RAM, CPU, and network

Useful commands:

```bash
pnpm dev:ui          # renderer only
pnpm test            # focused capture-normalization tests
pnpm smoke:renderer  # headless built-renderer smoke test
pnpm quality         # tests + build + renderer smoke
pnpm check:electron  # parse-check Electron main/preload/proxy/store
pnpm build           # renderer build + Electron parse check
```

## Network Model

Electron uses an isolated `persist:wordcoach` session for remote pages. That session gets a loopback-only app proxy before navigation, plus an Electron `webRequest` allowlist as a second guard. The proxy binds `127.0.0.1:0`, resolves through AdGuard DNS, denies hosts outside the app allowlist, and never changes OS proxy settings.

## Data

History and settings are JSON files in Electron `userData`. Export/import uses `.wcoach.json`. Incomplete legacy captures and rapid duplicate captures are hidden from study/review metrics and reported in the history panel or import toast instead of being counted as learned words.

Injected remote-page scripts live in `src/injected/`. Google Word Coach receives `network_guard.js`, `word_coach.js`, and `custom.css`; dictionary pages receive only `network_guard.js`.

## Passkeys

The app allows Google sign-in pages, Google account domains, and Electron permission checks needed for WebAuthn. Electron still has upstream gaps around native passkey prompts on some platforms, especially system passkey pickers. Password and non-passkey Google sign-in should work in-app; full passkey UX may require using a real Chrome/Chromium profile instead of Electron.
