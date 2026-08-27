# AIUI `SpeechRecognition` 自动续听后可能失去回调

## 状态

待官方确认。本报告来自应用侧可观测行为和真机测试，尚无 AIUI Runtime 内部状态或服务端会话日志，因此不宣称已确认具体根因。

## 问题摘要

在 Rokid 眼镜真机 AIUI 中，应用使用非连续 `SpeechRecognition`，并在自然停顿触发 `onend` 后复用同一对象再次 `start()`。连续若干原生分段后，可能出现已经请求启动、但 JavaScript 侧长时间不再收到识别结果或终态事件的状态。

该问题影响所有需要让用户“说一段、停顿思考、继续说”的交互。应用既无法可靠判断用户尚未开口、服务仍在处理，还是会话已经失去回调，也无法通过固定超时安全恢复，因为固定超时可能中止仍在正常处理的语音。

## 最小环境

- 运行形态：AIUI 全屏 Interactive InkView
- API：`SpeechRecognition`
- 语言：`zh-CN`
- 配置：`continuous = false`、`interimResults = true`、`maxAlternatives = 3`
- 对照：单次识别与 `onend` 后 300ms 自动再次 `start()`
- 权限：仅麦克风
- 排除项：无 LLM、业务解析、存储、网络请求、摄像头和 TTS

精确设备、系统 Build、Runtime 和源码提交号应随每组公开证据单独记录，避免用一次环境信息概括所有版本。

## 期望行为

每次成功接受的 `start()` 最终都应产生可观察的生命周期：

1. 返回识别文本；或
2. 返回明确的 `onerror`；并且
3. 返回明确的 `onend`，使应用知道本分段已终止并可以安全决定下一步。

在官方支持重复启动的前提下，连续执行 `start -> result/error -> end -> start` 不应进入永久无结果、无错误、无结束的中间状态。

## 实际行为

单次识别通常能够返回文本并结束；在 `onend` 后自动再次 `start()` 的对照模式中，连续若干分段后可能出现：

- 应用已经记录 `segment_start_request`，此前分段也正常返回过 `onend`；
- 页面仍处于等待原生回调的状态；
- 用户继续说话，但 JavaScript 侧没有新的 `onresult`；
- 部分复现中也没有新的 `onerror` 或 `onend`；
- 应用只能记录“自最后一次原生回调起已超过观测阈值”，无法确定内部原因。

## 已确认的观察

- 所有真正到达 `onresult` 的文本均能被最小页面显示和记录。
- 出现异常时，缺失内容没有进入业务文本合并；本项目本身也没有业务文本合并。
- 固定时长看门狗如果主动 `abort()`，会改变被测会话，并可能截断仍在处理的正常语音。因此本项目的 15 秒观测只记日志，不进行恢复。
- 浏览器预览不能证明真机原生 ASR 生命周期正常或异常，结论必须来自真机与对应日志。

## 尚未确认的推断

以下都只是待官方排查的可能方向，现有证据不足以区分：

- 原生录音资源或旧 ASR 会话未完全释放；
- 连续 `start()` 对应的 native target / session 发生竞态或错配；
- 音频处理仍在进行，但 JavaScript 事件桥接丢失；
- 服务端或 Runtime 进入没有明确终态的状态。

## 最小复现

1. 导入仓库 `src/` 到 Craft 并运行到真机。
2. 先选择“单次识别基线”，说固定句子，确认能返回结果和 `onend`。
3. 返回后选择“自动续听复现”。
4. 依次说“王秘书说他凌晨一点半”、停顿 2 至 3 秒、“在蓝色会议室”、停顿 2 至 3 秒、“桌上放着一份文件”。
5. 重复至少 10 轮，观察页面事件与 `ASR_REPRO` 日志。
6. 如果出现 `watchdog_no_callback`，不要立刻断言根因；保存设备环境、完整原始日志和对应时序。

完整控制变量和判定方法见[复现协议](reproduction-protocol.md)。

## 最小核心代码

```js
const recognition = new SpeechRecognition();
recognition.lang = 'zh-CN';
recognition.continuous = false;
recognition.interimResults = true;

recognition.onresult = (event) => console.log('result', event.results);
recognition.onerror = (event) => console.log('error', event.error);
recognition.onend = () => {
  setTimeout(() => recognition.start(), 300);
};

recognition.start();
```

公开仓库的实现增加了事件编号、时间、只读无回调观测和停止清理，但没有加入自动恢复策略。

## 影响

- 自然停顿可能迫使用户重复硬件操作，降低语音输入可用性。
- 假活时界面可能看似仍在等待，但用户已经说出的内容没有任何明确错误提示。
- 应用无法用固定超时可靠区分慢响应与失去回调，容易静默丢字。

## 希望官方确认

1. 当前 AIUI Runtime 是否正式支持同一页面、同一对象连续多次 `start()`？推荐间隔是多少？
2. `onend` 返回时，麦克风、识别会话和 JavaScript target 是否已经全部释放？
3. 每次成功启动的会话是否保证最终收到 `onerror` 或 `onend`？
4. `continuous = true` 在 Rokid 眼镜真机中的支持边界是什么？
5. 是否可提供 `sessionId`、处理状态和可等待的停止/释放完成信号？
6. 若已有修复，请提供最低 Runtime / 系统 Build 版本与变更说明。

## 建议验收

请使用仓库中的[修复验证清单](fix-verification-checklist.md)，在同一真机上至少完成 20 次连续分段、5 秒静默后继续说、页面切换和主动中止后重启等测试，并保留修复前后的同格式证据。
