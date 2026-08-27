# AIUI SpeechRecognition Lifecycle Repro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use box:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish a minimal AIUI project whose `src/` directory imports directly into Craft, compares one-shot ASR with automatic restart, and captures evidence when native callbacks stop arriving.

**Architecture:** A pure JavaScript lifecycle runner owns one `SpeechRecognition` object per test run and emits structured `ASR_REPRO` events for every native callback. One Ink page exposes baseline and automatic-restart modes without business logic. Root-level Node tests, validation scripts, evidence tools, and public documentation stay outside `src/`; raw device logs are private by default and only reviewed extracts are committed.

**Tech Stack:** AIUI Ink SFC, browser-style `SpeechRecognition`, Node.js built-in test runner, AIX CLI 0.8.2, ADB/logcat, shell and Node evidence tools, Git/GitHub.

---

### Task 1: Scaffold the public repository contract

**Files:**
- Create: `.gitignore`
- Create: `LICENSE`
- Create: `package.json`
- Create: `src/AGENTS.md`
- Create: `src/app.js`
- Create: `src/app.json`
- Create: `src/app.wxss`
- Create: `tests/project-structure.test.cjs`

- [ ] **Step 1: Write the failing project-structure test**

Create a Node test that requires all Craft-importable files to live under `src/`, requires exactly one page route, and requires only microphone permission:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('src is a standalone one-page Craft project with microphone permission only', () => {
  const app = JSON.parse(read('src/app.json'));
  assert.deepEqual(app.pages, ['pages/index/index']);
  assert.deepEqual(app.requiredPermissions, { microphone: true });
  assert.ok(fs.existsSync(path.join(ROOT, 'src/app.js')));
  assert.ok(fs.existsSync(path.join(ROOT, 'src/app.wxss')));
  assert.ok(fs.existsSync(path.join(ROOT, 'src/AGENTS.md')));
});

test('raw evidence cannot be committed by default', () => {
  const ignore = read('.gitignore');
  assert.match(ignore, /^evidence\/private\/$/m);
  assert.match(ignore, /^dist\/$/m);
});
```

- [ ] **Step 2: Run the test to verify RED**

Run: `node --test tests/project-structure.test.cjs`

Expected: FAIL because `src/app.json` and the repository contract do not exist.

- [ ] **Step 3: Add the minimal scaffold**

Create a root `package.json` with `private: true`, module mode, AIX CLI 0.8.2, and scripts for tests, validation, preview, and packing. Create `src/app.json` with one `pages/index/index` route, a 480px device viewport, custom navigation, and only microphone permission. Add a minimal empty `app.js`, black/green root styling in `app.wxss`, an AIUI manifest in `AGENTS.md`, MIT License, and ignores for `node_modules/`, `dist/`, `.DS_Store`, and `evidence/private/`.

- [ ] **Step 4: Run the project-structure test to verify GREEN**

Run: `node --test tests/project-structure.test.cjs`

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add .gitignore LICENSE package.json src tests/project-structure.test.cjs
git commit -m "chore: scaffold AIUI lifecycle repro"
```

### Task 2: Build the instrumented ASR lifecycle runner with TDD

**Files:**
- Create: `src/lib/asr-lifecycle-runner.js`
- Create: `tests/asr-lifecycle-runner.test.cjs`

- [ ] **Step 1: Write failing tests for baseline, auto restart, event logs, and non-invasive observation**

Use a fake recognizer and fake timers to assert:

```js
test('baseline logs one segment and never restarts after onend', () => {
  const context = createContext();
  context.runner.start('baseline');
  const recognizer = context.recognizers[0];
  recognizer.emitStart();
  recognizer.emitResult('王秘书说他凌晨一点半', true);
  recognizer.emitEnd();
  context.timers.runAll();
  assert.equal(recognizer.startCount, 1);
  assert.deepEqual(context.eventNames(), [
    'run_start', 'segment_start_request', 'onstart', 'onresult_final', 'onend', 'run_end'
  ]);
});

test('auto mode restarts the same recognizer 300ms after onend', () => {
  const context = createContext();
  context.runner.start('auto');
  const recognizer = context.recognizers[0];
  recognizer.emitStart();
  recognizer.emitEnd();
  context.timers.runDelay(300);
  assert.equal(context.recognizers.length, 1);
  assert.equal(recognizer.startCount, 2);
  assert.equal(context.runner.snapshot().segment, 2);
});

test('fifteen seconds without a native callback only logs watchdog_no_callback', () => {
  const context = createContext();
  context.runner.start('auto');
  const recognizer = context.recognizers[0];
  recognizer.emitStart();
  context.timers.runDelay(15000);
  assert.equal(context.lastEvent().event, 'watchdog_no_callback');
  assert.equal(recognizer.abortCount, 0);
  assert.equal(recognizer.stopCount, 0);
  assert.equal(recognizer.startCount, 1);
});

test('stop invalidates late callbacks and releases the recognizer', () => {
  const context = createContext();
  context.runner.start('auto');
  const recognizer = context.recognizers[0];
  context.runner.stop('user');
  recognizer.emitResult('late', true);
  assert.equal(recognizer.abortCount, 1);
  assert.equal(context.events.some((entry) => entry.text === 'late'), false);
});
```

Also test that every console line starts with `ASR_REPRO ` and contains valid JSON with relative milliseconds, run number, segment number, mode, event, and optional text/error.

- [ ] **Step 2: Run the lifecycle tests to verify RED**

Run: `node --test tests/asr-lifecycle-runner.test.cjs`

Expected: FAIL because the lifecycle runner is missing.

- [ ] **Step 3: Implement the smallest runner that satisfies the tests**

Export these public constants and factory:

```js
export const RESTART_DELAY_MS = 300;
export const NO_CALLBACK_OBSERVATION_MS = 15000;
export const CONSOLE_PREFIX = 'ASR_REPRO ';

function transcriptFromResults(event = {}) {
  return Array.from(event.results || []).map((result) => (
    result?.[0]?.transcript || ''
  )).join('').trim();
}

export function createAsrLifecycleRunner(options) {
  if (typeof options.createRecognition !== 'function') {
    throw new TypeError('createRecognition must be a function');
  }
  const setTimer = options.setTimer || setTimeout;
  const clearTimer = options.clearTimer || clearTimeout;
  const now = options.now || Date.now;
  const output = options.output || console.log;
  const onEvent = options.onEvent || (() => {});
  let running = false;
  let mode = 'baseline';
  let run = 0;
  let segment = 0;
  let token = 0;
  let startedAt = 0;
  let lastCallbackAt = 0;
  let recognition = null;
  let restartTimer = null;
  let observationTimer = null;
  let events = [];

  function emit(event, details = {}) {
    const entry = {
      version: 1,
      elapsedMs: Math.max(0, now() - startedAt),
      run,
      segment,
      mode,
      event,
      ...details,
    };
    events = [...events, entry].slice(-100);
    output(`${CONSOLE_PREFIX}${JSON.stringify(entry)}`);
    onEvent(entry);
    return entry;
  }

  function clearObservation() {
    if (observationTimer !== null) clearTimer(observationTimer);
    observationTimer = null;
  }

  function armObservation(localToken) {
    clearObservation();
    observationTimer = setTimer(() => {
      observationTimer = null;
      if (!running || localToken !== token) return;
      emit('watchdog_no_callback', {
        sinceLastCallbackMs: Math.max(0, now() - lastCallbackAt),
      });
    }, NO_CALLBACK_OBSERVATION_MS);
  }

  function nativeEvent(event, details = {}, observe = true) {
    lastCallbackAt = now();
    clearObservation();
    const entry = emit(event, details);
    if (running && observe) armObservation(token);
    return entry;
  }

  function finish(reason) {
    running = false;
    clearObservation();
    if (restartTimer !== null) clearTimer(restartTimer);
    restartTimer = null;
    emit('run_end', { reason });
  }

  function startSegment(localToken) {
    if (!running || localToken !== token || !recognition) return;
    segment += 1;
    lastCallbackAt = now();
    emit('segment_start_request');
    armObservation(localToken);
    try {
      recognition.start();
    } catch (error) {
      emit('start_throw', { error: String(error?.message || error) });
      finish('start_throw');
    }
  }

  function bind(target, localToken) {
    target.onstart = () => {
      if (!running || localToken !== token || target !== recognition) return;
      nativeEvent('onstart');
    };
    target.onsoundstart = () => {
      if (!running || localToken !== token || target !== recognition) return;
      nativeEvent('onsoundstart');
    };
    target.onspeechstart = () => {
      if (!running || localToken !== token || target !== recognition) return;
      nativeEvent('onspeechstart');
    };
    target.onresult = (event) => {
      if (!running || localToken !== token || target !== recognition) return;
      const results = Array.from(event.results || []);
      const isFinal = Boolean(results[results.length - 1]?.isFinal);
      nativeEvent(isFinal ? 'onresult_final' : 'onresult_interim', {
        text: transcriptFromResults(event),
      });
    };
    target.onerror = (event = {}) => {
      if (!running || localToken !== token || target !== recognition) return;
      nativeEvent('onerror', { error: String(event.error || 'unknown') }, false);
      finish('error');
    };
    target.onend = () => {
      if (!running || localToken !== token || target !== recognition) return;
      nativeEvent('onend', {}, false);
      if (mode === 'baseline') {
        finish('native_end');
        return;
      }
      emit('restart_scheduled', { delayMs: RESTART_DELAY_MS });
      restartTimer = setTimer(() => {
        restartTimer = null;
        startSegment(localToken);
      }, RESTART_DELAY_MS);
    };
  }

  function start(nextMode = 'baseline') {
    if (running) return false;
    mode = nextMode === 'auto' ? 'auto' : 'baseline';
    run += 1;
    segment = 0;
    token += 1;
    startedAt = now();
    lastCallbackAt = startedAt;
    running = true;
    recognition = options.createRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    bind(recognition, token);
    emit('run_start');
    startSegment(token);
    return true;
  }

  function stop(reason = 'user') {
    if (!running && !recognition) return false;
    const target = recognition;
    running = false;
    token += 1;
    clearObservation();
    if (restartTimer !== null) clearTimer(restartTimer);
    restartTimer = null;
    recognition = null;
    emit('run_stop_requested', { reason });
    try { target?.abort(); } catch (_) {}
    emit('run_end', { reason });
    return true;
  }

  return {
    start,
    stop,
    snapshot: () => ({ running, mode, run, segment, lastCallbackAt, events: [...events] }),
    isRunning: () => running,
  };
}
```

The runner must:

- create one recognizer per user run;
- configure `lang = 'zh-CN'`, `continuous = false`, `interimResults = true`, and `maxAlternatives = 3`;
- log `onstart`, `onsoundstart`, `onspeechstart`, interim/final `onresult`, `onerror`, and `onend`;
- restart the same recognizer only in `auto` mode and only after native `onend` plus 300ms;
- arm a 15-second observation after `onstart`, speech activity, or a result;
- let the observation log once without calling any recognizer control method;
- expose `start(mode)`, `stop(reason)`, `snapshot()`, and `isRunning()`;
- invalidate stale callbacks when a run stops.

- [ ] **Step 4: Run lifecycle and structure tests to verify GREEN**

Run: `node --test tests/asr-lifecycle-runner.test.cjs tests/project-structure.test.cjs`

Expected: all tests pass with no active fake timers.

- [ ] **Step 5: Commit**

```bash
git add src/lib/asr-lifecycle-runner.js tests/asr-lifecycle-runner.test.cjs
git commit -m "feat: add instrumented ASR lifecycle runner"
```

### Task 3: Add the one-page Craft and glasses UI

**Files:**
- Create: `src/pages/index/index.ink`
- Modify: `tests/project-structure.test.cjs`

- [ ] **Step 1: Add failing structural interaction assertions**

Assert that the page:

```js
test('page exposes baseline and auto modes with hardware navigation', () => {
  const source = read('src/pages/index/index.ink');
  assert.match(source, /createAsrLifecycleRunner/);
  assert.match(source, /baseline/);
  assert.match(source, /auto/);
  assert.match(source, /onVoiceWakeup\(event\)/);
  assert.match(source, /onKeyUp\(event\)/);
  assert.match(source, /ArrowUp/);
  assert.match(source, /ArrowDown/);
  assert.match(source, /Enter/);
  assert.match(source, /Backspace/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /onUnload\(\)[\s\S]*stop/);
  assert.doesNotMatch(source, /LanguageModel|fetch\(|camera|localStorage/);
});
```

Also assert that the page uses `<page>`, a black background, semantic green tokens where available, border-only selection, no glow shadows, and no emoji.

- [ ] **Step 2: Run the page structure test to verify RED**

Run: `node --test tests/project-structure.test.cjs`

Expected: FAIL because `src/pages/index/index.ink` does not exist.

- [ ] **Step 3: Implement the diagnostic page**

Build one 480x352 page with:

- a compact title and state summary;
- two border-only selectable mode rows;
- run/segment/status/last-callback metrics;
- the latest transcript;
- a rolling list of the most recent six event summaries;
- footer instructions for slide, click, long press, and back;
- no solid selected background and no decorative glow.

The page creates the runner with `new SpeechRecognition()`, converts emitted entries to short display rows, refreshes elapsed time without changing ASR state, and routes hardware input as follows:

- `ArrowUp` / `ArrowDown`: change mode while idle;
- `Enter`: start selected mode while idle or stop the current run;
- `Backspace`: stop and reset;
- `onVoiceWakeup`: start selected mode while idle;
- `onUnload`: stop and clear the UI timer.

- [ ] **Step 4: Run all unit tests**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/pages/index/index.ink tests/project-structure.test.cjs
git commit -m "feat: add lifecycle reproduction page"
```

### Task 4: Add private-first device evidence tooling

**Files:**
- Create: `tools/capture-device-evidence.sh`
- Create: `tools/extract-public-evidence.mjs`
- Create: `tests/evidence-tools.test.cjs`
- Create: `evidence/public/README.md`

- [ ] **Step 1: Write failing evidence-tool tests**

Use a temporary directory to verify that the extractor:

- retains `ASR_REPRO`, `SpeechRecognition`, `cxr-service`, `AudioRecord`, `JSAR`, and `InkView` lines;
- discards unrelated application logs;
- replaces the device serial with `<device-serial>`;
- writes a prominent manual privacy-review header;
- refuses to overwrite an existing public evidence file.

Also inspect the shell script source to require device properties, Git commit, full `adb logcat`, an interrupt trap, and output under `evidence/private/`.

- [ ] **Step 2: Run the evidence tests to verify RED**

Run: `node --test tests/evidence-tools.test.cjs`

Expected: FAIL because the tools are missing.

- [ ] **Step 3: Implement capture and extraction tools**

`capture-device-evidence.sh` must:

- fail clearly if no single ADB device is connected;
- create a timestamped folder under `evidence/private/`;
- record serial, manufacturer, model, Android version, build ID, incremental build, fingerprint, and current repository commit;
- start threadtime `adb logcat` capture in the foreground;
- print the fixed test protocol before recording;
- stop cleanly on Ctrl-C and preserve the captured files.

`extract-public-evidence.mjs` must accept a private evidence directory and an explicit output file, filter the relevant lines, redact the device serial and local absolute paths, prepend a manual-review warning, and never publish automatically.

- [ ] **Step 4: Run evidence and full tests**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add tools tests/evidence-tools.test.cjs evidence/public/README.md .gitignore package.json
git commit -m "feat: add private-first evidence capture"
```

### Task 5: Write the public issue, reproduction, and future tutorial docs

**Files:**
- Create: `README.md`
- Create: `README.en.md`
- Create: `docs/issue-report.zh-CN.md`
- Create: `docs/reproduction-protocol.md`
- Create: `docs/evidence-guide.md`
- Create: `docs/fix-verification-checklist.md`
- Create: `docs/article-outline.md`
- Create: `tests/documentation.test.cjs`

- [ ] **Step 1: Write failing documentation assertions**

Require the docs to include:

- the exact instruction to import `src/` into Craft;
- project status “待官方确认”;
- the fixed three-part phrase and 2–3 second pause protocol;
- a warning that raw logs are private by default;
- expected versus actual lifecycle behavior;
- system-boundary language that does not claim an unverified internal root cause;
- a 20-cycle post-fix acceptance checklist;
- a future article outline that keeps the failure history after the runtime is fixed.

- [ ] **Step 2: Run documentation tests to verify RED**

Run: `node --test tests/documentation.test.cjs`

Expected: FAIL because the public docs are missing.

- [ ] **Step 3: Write the public documentation set**

Adapt the existing murder-mystery report into a business-neutral runtime report. Explain the baseline and auto modes, list exact Craft and glasses steps, document the event schema, explain how to capture and review logs, and state that `watchdog_no_callback` is observational only. Link all documents from both READMEs.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add README.md README.en.md docs tests/documentation.test.cjs
git commit -m "docs: publish lifecycle reproduction guide"
```

### Task 6: Validate Craft packaging and capture the initial device environment

**Files:**
- Create: `tools/validate-project.mjs`
- Modify: `package.json`
- Create: `evidence/public/2026-08-27-device-environment.md`
- Modify: `README.md`

- [ ] **Step 1: Add a validation test that initially fails**

Extend the project test to require `npm run check` to validate:

- registered route files exist under `src/`;
- all `src/` imports resolve;
- only microphone permission is requested;
- no root-level file is required by the Craft source;
- the page contains no unsupported `<template>` root.

- [ ] **Step 2: Run the validation test to verify RED**

Run: `node --test tests/project-structure.test.cjs`

Expected: FAIL because the validator is absent.

- [ ] **Step 3: Implement the project validator and package script**

Add `tools/validate-project.mjs`, wire `npm run check`, and wire `npm run pack` to package exactly `src/` into `dist/aiui-speech-recognition-lifecycle-repro.aix`.

- [ ] **Step 4: Record non-sensitive connected-device metadata**

Use read-only ADB properties to create a public environment record for the connected Rokid device. Include model, Android version, build ID, incremental build, fingerprint, source commit, and capture date; redact the serial.

- [ ] **Step 5: Run fresh verification**

Run:

```bash
npm test
npm run check
npm run pack
git diff --check
```

Expected: tests pass, validation succeeds, an AIX archive is created from `src/`, and no whitespace errors are reported.

- [ ] **Step 6: Commit**

```bash
git add tools/validate-project.mjs package.json evidence/public README.md tests/project-structure.test.cjs
git commit -m "chore: validate Craft package and device environment"
```

### Task 7: Capture a reproducible live log session

**Files:**
- Create: `evidence/public/2026-08-27-auto-restart-reproduction.log`
- Create: `evidence/public/2026-08-27-auto-restart-reproduction.md`
- Modify: `docs/issue-report.zh-CN.md`
- Modify: `README.md`

- [ ] **Step 1: Import and run the source**

Import the repository's `src/` directory into Craft, run the AIUI app, and verify baseline mode once before switching to automatic restart mode.

- [ ] **Step 2: Start private evidence capture**

Run: `npm run evidence:capture -- auto-restart`

Expected: a timestamped private directory is created and logcat streams until Ctrl-C.

- [ ] **Step 3: Execute the fixed voice protocol**

In automatic mode, repeat the three fixed phrases with 2–3 second pauses for at least 10 rounds or until callbacks stop. Do not use personal names or unrelated speech. Stop capture after the page displays `WATCHDOG_NO_CALLBACK` or the run completes.

- [ ] **Step 4: Produce and manually review the public extract**

Run the extractor with the private directory and a dated public output path. Inspect every line for personal data and confirm that the event sequence contains the relevant start/result/end or no-callback evidence. If the issue does not reproduce, publish a truthful “not reproduced in this run” record instead of manufacturing evidence.

- [ ] **Step 5: Link the evidence and commit**

```bash
git add evidence/public docs/issue-report.zh-CN.md README.md
git commit -m "docs: add first device reproduction evidence"
```

### Task 8: Publish the verified repository to GitHub

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Confirm repository hygiene**

Run:

```bash
git status --short --branch
git ls-files evidence/private
git grep -nE '1901092524000561|/Users/|token|password|secret' -- . ':!docs/architecture/*'
```

Expected: worktree clean, no private evidence tracked, no device serial, local absolute path, or credential present in public files.

- [ ] **Step 2: Create the public GitHub repository**

Create `sengmitnick/aiui-speech-recognition-lifecycle-repro` as a public repository without adding generated README or license files, add it as `origin`, and push `main`.

- [ ] **Step 3: Add the canonical repository URL and verify links**

Update README with the public URL, run documentation tests again, commit the link, and push.

- [ ] **Step 4: Final verification**

Run:

```bash
npm test
npm run check
npm run pack
git status --short --branch
git remote -v
```

Expected: all checks pass, worktree is clean and synchronized with `origin/main`, and the public repository is reachable.
