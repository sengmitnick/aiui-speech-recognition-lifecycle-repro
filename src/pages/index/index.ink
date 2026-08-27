<script def>
{
  "navigationBarTitleText": "ASR 生命周期复现",
  "description": "对照单次 SpeechRecognition 与 onend 后自动重启，显示并记录原生回调生命周期。"
}
</script>

<script setup>
import { createAsrLifecycleRunner } from '../../lib/asr-lifecycle-runner.js';

const EVENT_LABELS = {
  run_start: '测试开始',
  segment_start_request: '请求启动',
  onstart: 'onstart',
  onsoundstart: 'soundstart',
  onspeechstart: 'speechstart',
  onresult_interim: '中间结果',
  onresult_final: '最终结果',
  onerror: 'onerror',
  onend: 'onend',
  restart_scheduled: '已调度续听',
  watchdog_no_callback: '15s 无回调',
  start_throw: 'start 异常',
  create_throw: '创建异常',
  run_stop_requested: '用户中止',
  run_end: '测试结束',
};

function statusForEvent(event, running) {
  if (event === 'watchdog_no_callback') return 'NO CALLBACK';
  if (event === 'onerror' || event === 'start_throw' || event === 'create_throw') return 'ERROR';
  if (event === 'onstart' || event === 'onsoundstart' || event === 'onspeechstart') return 'LISTENING';
  if (event === 'onresult_interim' || event === 'onresult_final') return 'RESULT';
  if (event === 'restart_scheduled' || event === 'segment_start_request') return 'STARTING';
  if (!running || event === 'run_end') return 'READY';
  return 'RUNNING';
}

function eventRow(entry) {
  const detail = entry.text || entry.error || entry.reason || '';
  return {
    id: `${entry.run}-${entry.segment}-${entry.elapsedMs}-${entry.event}`,
    time: `+${(entry.elapsedMs / 1000).toFixed(1)}s`,
    name: EVENT_LABELS[entry.event] || entry.event,
    detail,
  };
}

export default {
  data: {
    mode: 'auto',
    running: false,
    statusLabel: 'READY',
    runLabel: '0',
    segmentLabel: '0',
    callbackAgeLabel: '--',
    transcript: '尚无识别文本',
    baselineClass: 'mode-row',
    autoClass: 'mode-row selected',
    actionHint: '上下选择 · 单击开始 · 长按启动',
    eventRows: [],
  },

  _runner: null,
  _tickTimer: null,

  onLoad() {
    if (typeof SpeechRecognition === 'undefined') {
      this.setData({
        statusLabel: 'UNSUPPORTED',
        actionHint: '当前环境不支持 SpeechRecognition',
      });
      return;
    }
    this._runner = createAsrLifecycleRunner({
      createRecognition: () => new SpeechRecognition(),
      onEvent: (entry) => this.handleLifecycleEvent(entry),
    });
    this.scheduleTick();
  },

  onUnload() {
    if (this._tickTimer !== null) clearTimeout(this._tickTimer);
    this._tickTimer = null;
    if (this._runner) this._runner.stop('unload');
    this._runner = null;
  },

  scheduleTick() {
    if (this._tickTimer !== null) clearTimeout(this._tickTimer);
    this._tickTimer = setTimeout(() => {
      this._tickTimer = null;
      if (this._runner) {
        const snapshot = this._runner.snapshot();
        const age = snapshot.lastCallbackAt
          ? Math.max(0, Date.now() - snapshot.lastCallbackAt)
          : 0;
        this.setData({
          callbackAgeLabel: snapshot.running ? `${(age / 1000).toFixed(1)}s` : '--',
        });
      }
      this.scheduleTick();
    }, 500);
  },

  handleLifecycleEvent(entry) {
    if (!this._runner) return;
    const snapshot = this._runner.snapshot();
    const nextRows = [eventRow(entry), ...this.data.eventRows].slice(0, 5);
    this.setData({
      running: snapshot.running,
      statusLabel: statusForEvent(entry.event, snapshot.running),
      runLabel: String(snapshot.run),
      segmentLabel: String(snapshot.segment),
      transcript: entry.text || snapshot.lastText || this.data.transcript,
      actionHint: snapshot.running
        ? '单击停止 · 返回中止并释放'
        : '上下选择 · 单击开始 · 长按启动',
      eventRows: nextRows,
    });
  },

  selectMode(mode) {
    if (this.data.running) return;
    const nextMode = mode === 'baseline' ? 'baseline' : 'auto';
    this.setData({
      mode: nextMode,
      baselineClass: nextMode === 'baseline' ? 'mode-row selected' : 'mode-row',
      autoClass: nextMode === 'auto' ? 'mode-row selected' : 'mode-row',
    });
  },

  moveMode() {
    this.selectMode(this.data.mode === 'baseline' ? 'auto' : 'baseline');
  },

  startSelected() {
    if (!this._runner) return;
    if (this._runner.isRunning()) {
      this._runner.stop('confirm');
      return;
    }
    this._runner.start(this.data.mode);
  },

  resetRun() {
    if (this._runner) this._runner.stop('back');
    this.setData({
      running: false,
      statusLabel: 'READY',
      callbackAgeLabel: '--',
      actionHint: '上下选择 · 单击开始 · 长按启动',
    });
  },

  onVoiceWakeup(event) {
    if (!this.data.running) this.startSelected();
  },

  onKeyUp(event) {
    const code = event?.code;
    if (code === 'ArrowUp' || code === 'ArrowDown') {
      event.preventDefault();
      this.moveMode();
      return;
    }
    if (code === 'Enter') {
      event.preventDefault();
      this.startSelected();
      return;
    }
    if (code === 'Backspace') {
      event.preventDefault();
      this.resetRun();
    }
  },
};
</script>

<page>
  <view class="page-shell">
    <view class="header-row">
      <view>
        <text class="eyebrow">AIUI ASR LAB</text>
        <text class="title">SpeechRecognition 生命周期</text>
      </view>
      <text class="status">{{ statusLabel }}</text>
    </view>

    <view class="mode-list">
      <view class="{{baselineClass}}">
        <text class="mode-index">01</text>
        <view class="mode-copy">
          <text class="mode-title">单次识别</text>
          <text class="mode-note">onend 后结束，作为正常基线</text>
        </view>
      </view>
      <view class="{{autoClass}}">
        <text class="mode-index">02</text>
        <view class="mode-copy">
          <text class="mode-title">自动续听</text>
          <text class="mode-note">onend 后 300ms 再次 start</text>
        </view>
      </view>
    </view>

    <view class="diagnostic-grid">
      <view class="metrics">
        <text class="metric-label">RUN / SEGMENT</text>
        <text class="metric-value">{{ runLabel }} / {{ segmentLabel }}</text>
        <text class="metric-label callback-label">LAST CALLBACK</text>
        <text class="metric-value small">{{ callbackAgeLabel }}</text>
        <text class="transcript">{{ transcript }}</text>
      </view>
      <view class="event-list">
        <view class="event-row" ink:for="{{eventRows}}" ink:key="id">
          <text class="event-time">{{item.time}}</text>
          <text class="event-name">{{item.name}}</text>
          <text class="event-detail">{{item.detail}}</text>
        </view>
      </view>
    </view>

    <text class="footer">{{ actionHint }}</text>
  </view>
</page>

<style>
page {
  width: 100%;
  height: 100%;
  background-color: var(--color-background);
  color: var(--color-text-primary);
}

.page-shell {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 20px 24px 14px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.header-row {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  justify-content: space-between;
}

.eyebrow {
  display: block;
  color: var(--color-text-secondary);
  font-size: 10px;
  letter-spacing: 1.5px;
}

.title {
  display: block;
  margin-top: 3px;
  color: var(--color-primary);
  font-size: 22px;
  font-weight: 700;
}

.status {
  margin-top: 2px;
  padding: 4px 9px;
  border: var(--border-width-default) solid var(--border-color-accent);
  border-radius: var(--radius-sm);
  color: var(--color-primary);
  font-size: 10px;
  letter-spacing: 1px;
}

.mode-list {
  margin-top: 13px;
  display: flex;
  flex-direction: row;
  gap: 10px;
}

.mode-row {
  flex: 1;
  height: 54px;
  box-sizing: border-box;
  padding: 8px 11px;
  display: flex;
  flex-direction: row;
  align-items: center;
  border: var(--border-width-thin) solid var(--border-color-muted);
  border-radius: var(--radius-md);
  opacity: 0.62;
}

.mode-row.selected {
  border-width: var(--border-width-strong);
  border-color: var(--border-color-accent);
  opacity: 1;
}

.mode-index {
  color: var(--color-text-secondary);
  font-size: 10px;
}

.mode-copy {
  margin-left: 10px;
  display: flex;
  flex-direction: column;
}

.mode-title {
  color: var(--color-primary);
  font-size: 15px;
  font-weight: 700;
}

.mode-note {
  margin-top: 2px;
  color: var(--color-text-secondary);
  font-size: 9px;
}

.diagnostic-grid {
  margin-top: 12px;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: row;
  gap: 12px;
}

.metrics {
  width: 160px;
  padding-right: 12px;
  box-sizing: border-box;
  border-right: var(--border-width-thin) solid var(--border-color-muted);
  display: flex;
  flex-direction: column;
}

.metric-label {
  color: var(--color-text-secondary);
  font-size: 9px;
  letter-spacing: 0.8px;
}

.callback-label {
  margin-top: 6px;
}

.metric-value {
  margin-top: 1px;
  color: var(--color-primary);
  font-size: 20px;
  font-weight: 700;
}

.metric-value.small {
  font-size: 15px;
}

.transcript {
  margin-top: 8px;
  color: var(--color-text-primary);
  font-size: 12px;
  line-height: 1.35;
  word-break: break-all;
}

.event-list {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.event-row {
  height: 20px;
  display: flex;
  flex-direction: row;
  align-items: center;
  border-bottom: var(--border-width-thin) solid var(--border-color-muted);
}

.event-time {
  width: 42px;
  color: var(--color-text-secondary);
  font-size: 9px;
}

.event-name {
  width: 76px;
  color: var(--color-primary);
  font-size: 10px;
}

.event-detail {
  min-width: 0;
  flex: 1;
  color: var(--color-text-secondary);
  font-size: 9px;
  white-space: nowrap;
  overflow: hidden;
}

.footer {
  margin-top: 7px;
  color: var(--color-text-secondary);
  font-size: 10px;
  text-align: center;
}
</style>
