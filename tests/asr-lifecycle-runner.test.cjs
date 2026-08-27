const test = require('node:test');
const assert = require('node:assert/strict');

class FakeTimers {
  constructor() {
    this.now = 1000;
    this.nextId = 1;
    this.entries = new Map();
  }

  setTimer(fn, delay) {
    const id = this.nextId;
    this.nextId += 1;
    this.entries.set(id, { fn, delay });
    return id;
  }

  clearTimer(id) {
    this.entries.delete(id);
  }

  runDelay(delay) {
    const matches = [...this.entries.entries()].filter(([, entry]) => entry.delay === delay);
    this.now += delay;
    for (const [id, entry] of matches) {
      if (!this.entries.has(id)) continue;
      this.entries.delete(id);
      entry.fn();
    }
  }

  runAll() {
    for (const delay of [...new Set([...this.entries.values()].map((entry) => entry.delay))]) {
      this.runDelay(delay);
    }
  }
}

class FakeRecognition {
  constructor() {
    this.startCount = 0;
    this.stopCount = 0;
    this.abortCount = 0;
  }

  start() {
    this.startCount += 1;
  }

  stop() {
    this.stopCount += 1;
  }

  abort() {
    this.abortCount += 1;
  }

  emitStart() {
    this.onstart?.({});
  }

  emitSoundStart() {
    this.onsoundstart?.({});
  }

  emitSpeechStart() {
    this.onspeechstart?.({});
  }

  emitResult(text, isFinal = false) {
    const alternative = { transcript: text, confidence: 0.9 };
    const result = [alternative];
    result.isFinal = isFinal;
    this.onresult?.({ results: [result], resultIndex: 0 });
  }

  emitError(error) {
    this.onerror?.({ error });
  }

  emitEnd() {
    this.onend?.({});
  }
}

async function createContext() {
  const lifecycle = await import('../src/lib/asr-lifecycle-runner.js');
  const timers = new FakeTimers();
  const recognizers = [];
  const events = [];
  const lines = [];
  const runner = lifecycle.createAsrLifecycleRunner({
    createRecognition: () => {
      const recognition = new FakeRecognition();
      recognizers.push(recognition);
      return recognition;
    },
    setTimer: (fn, delay) => timers.setTimer(fn, delay),
    clearTimer: (id) => timers.clearTimer(id),
    now: () => timers.now,
    output: (line) => lines.push(line),
    onEvent: (event) => events.push(event),
  });
  return {
    lifecycle,
    runner,
    timers,
    recognizers,
    events,
    lines,
    eventNames: () => events.map((entry) => entry.event),
    lastEvent: () => events[events.length - 1],
  };
}

test('baseline logs one segment and never restarts after onend', async () => {
  const context = await createContext();
  context.runner.start('baseline');
  const recognition = context.recognizers[0];

  recognition.emitStart();
  recognition.emitResult('王秘书说他凌晨一点半', true);
  recognition.emitEnd();
  context.timers.runAll();

  assert.equal(recognition.startCount, 1);
  assert.deepEqual(context.eventNames(), [
    'run_start',
    'segment_start_request',
    'onstart',
    'onresult_final',
    'onend',
    'run_end',
  ]);
  assert.equal(context.runner.isRunning(), false);
});

test('auto mode restarts the same recognizer 300ms after onend', async () => {
  const context = await createContext();
  context.runner.start('auto');
  const recognition = context.recognizers[0];

  recognition.emitStart();
  recognition.emitEnd();
  context.timers.runDelay(context.lifecycle.RESTART_DELAY_MS);

  assert.equal(context.recognizers.length, 1);
  assert.equal(recognition.startCount, 2);
  assert.equal(context.runner.snapshot().segment, 2);
  assert.match(context.eventNames().join(','), /onend,restart_scheduled,segment_start_request/);
});

test('fifteen seconds without a native callback only logs watchdog_no_callback', async () => {
  const context = await createContext();
  context.runner.start('auto');
  const recognition = context.recognizers[0];
  recognition.emitStart();

  context.timers.runDelay(context.lifecycle.NO_CALLBACK_OBSERVATION_MS);

  assert.equal(context.lastEvent().event, 'watchdog_no_callback');
  assert.equal(recognition.abortCount, 0);
  assert.equal(recognition.stopCount, 0);
  assert.equal(recognition.startCount, 1);
  assert.equal(context.runner.isRunning(), true);
});

test('native sound, speech and interim result callbacks are recorded', async () => {
  const context = await createContext();
  context.runner.start('baseline');
  const recognition = context.recognizers[0];

  recognition.emitStart();
  recognition.emitSoundStart();
  recognition.emitSpeechStart();
  recognition.emitResult('在蓝色会议室');

  assert.deepEqual(context.eventNames().slice(-4), [
    'onstart', 'onsoundstart', 'onspeechstart', 'onresult_interim',
  ]);
  assert.equal(context.lastEvent().text, '在蓝色会议室');
});

test('native errors end the run without automatic restart', async () => {
  const context = await createContext();
  context.runner.start('auto');
  const recognition = context.recognizers[0];
  recognition.emitStart();
  recognition.emitError('network');
  context.timers.runAll();

  assert.equal(context.runner.isRunning(), false);
  assert.equal(recognition.startCount, 1);
  assert.deepEqual(context.eventNames().slice(-2), ['onerror', 'run_end']);
  assert.equal(context.events.at(-2).error, 'network');
});

test('stop invalidates late callbacks and releases the recognizer', async () => {
  const context = await createContext();
  context.runner.start('auto');
  const recognition = context.recognizers[0];

  context.runner.stop('user');
  recognition.emitResult('late', true);
  recognition.emitEnd();

  assert.equal(recognition.abortCount, 1);
  assert.equal(context.events.some((entry) => entry.text === 'late'), false);
  assert.deepEqual(context.eventNames().slice(-2), ['run_stop_requested', 'run_end']);
});

test('structured console output uses one parseable ASR_REPRO JSON line per event', async () => {
  const context = await createContext();
  context.runner.start('baseline');
  context.recognizers[0].emitStart();

  assert.equal(context.lines.length, context.events.length);
  for (const line of context.lines) {
    assert.match(line, /^ASR_REPRO /);
    const event = JSON.parse(line.slice('ASR_REPRO '.length));
    assert.equal(event.version, 1);
    assert.equal(typeof event.elapsedMs, 'number');
    assert.equal(typeof event.run, 'number');
    assert.equal(typeof event.segment, 'number');
    assert.equal(typeof event.mode, 'string');
    assert.equal(typeof event.event, 'string');
  }
});

test('configures the native recognizer for a non-continuous Chinese segment', async () => {
  const context = await createContext();
  context.runner.start('auto');
  const recognition = context.recognizers[0];

  assert.equal(recognition.lang, 'zh-CN');
  assert.equal(recognition.continuous, false);
  assert.equal(recognition.interimResults, true);
  assert.equal(recognition.maxAlternatives, 3);
});
