export const RESTART_DELAY_MS = 300;
export const NO_CALLBACK_OBSERVATION_MS = 15000;
export const CONSOLE_PREFIX = 'ASR_REPRO ';

function transcriptFromResults(event = {}) {
  return Array.from(event.results || []).map((result) => (
    result?.[0]?.transcript || ''
  )).join('').trim();
}

function nativeErrorText(error) {
  return String(error?.error || error?.message || error || 'unknown');
}

export function createAsrLifecycleRunner(options = {}) {
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
  let lastText = '';
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

  function clearRestart() {
    if (restartTimer !== null) clearTimer(restartTimer);
    restartTimer = null;
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

  function endRun(reason) {
    running = false;
    clearObservation();
    clearRestart();
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
      emit('start_throw', { error: nativeErrorText(error) });
      endRun('start_throw');
    }
  }

  function bindRecognition(target, localToken) {
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
      lastText = transcriptFromResults(event);
      nativeEvent(isFinal ? 'onresult_final' : 'onresult_interim', {
        text: lastText,
      });
    };
    target.onerror = (event = {}) => {
      if (!running || localToken !== token || target !== recognition) return;
      nativeEvent('onerror', { error: nativeErrorText(event) }, false);
      endRun('error');
    };
    target.onend = () => {
      if (!running || localToken !== token || target !== recognition) return;
      nativeEvent('onend', {}, false);
      if (mode === 'baseline') {
        endRun('native_end');
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
    lastText = '';
    running = true;

    try {
      recognition = options.createRecognition();
    } catch (error) {
      emit('create_throw', { error: nativeErrorText(error) });
      endRun('create_throw');
      recognition = null;
      return false;
    }

    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    bindRecognition(recognition, token);
    emit('run_start');
    startSegment(token);
    return running;
  }

  function stop(reason = 'user') {
    if (!running && !recognition) return false;
    const target = recognition;
    running = false;
    token += 1;
    clearObservation();
    clearRestart();
    recognition = null;
    emit('run_stop_requested', { reason });
    try { target?.abort(); } catch (_) {}
    emit('run_end', { reason });
    return true;
  }

  function snapshot() {
    return {
      running,
      mode,
      run,
      segment,
      lastCallbackAt,
      lastText,
      events: [...events],
    };
  }

  return {
    start,
    stop,
    snapshot,
    isRunning: () => running,
  };
}
