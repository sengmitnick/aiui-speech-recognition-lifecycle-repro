# AIUI SpeechRecognition 生命周期最小复现

一个面向 Rokid AIUI 真机的公开最小案例，用来观察 `SpeechRecognition` 在自然停顿、`onend` 后自动再次 `start()` 以及连续页面使用场景中的生命周期行为。

> 项目状态：待官方确认

本项目只记录应用能够观察到的事实，不把尚未获得运行时内部证据的现象写成已确认根因。

## 直接导入 Craft

在 Rokid Craft 中选择“导入本地文件夹”，选择仓库中的 `src/` 目录。`src/` 本身就是完整、可独立导入的 AIUI 项目；仓库根目录下的测试、文档和证据工具不会进入应用。

应用只申请麦克风权限，不包含 LLM、TTS、摄像头、账号、网络请求或业务逻辑，也不会保存音频。

## 两个对照模式

- **单次识别**：启动一个原生识别分段，收到 `onend` 后结束，用作基线。
- **自动续听**：复用同一个 `SpeechRecognition` 对象，在每次 `onend` 后等待 300ms，再调用一次 `start()`。

页面显示测试轮次、原生分段、最后回调距今时间、最近识别文本和最近事件。所有事件同时以 `ASR_REPRO ` 前缀输出为单行 JSON。

15 秒无原生回调只会记录 `watchdog_no_callback`，不会调用 `stop()`、`abort()` 或再次 `start()`。这样观测代码不会用“自动恢复”掩盖被测行为。

## 操作

1. 上下滑动镜腿选择模式。
2. 单击镜腿开始；在 Craft 中使用方向键和 Enter。
3. 按[固定复现协议](docs/reproduction-protocol.md)说出三段测试语句。
4. 单击停止；返回键也会中止并释放当前识别对象。

建议先跑“单次识别”确认当前设备能正常识别，再跑“自动续听”至少 10 轮。

## 本地开发

```bash
npm install
npm test
npm run check
npm run preview
npm run pack
```

`npm run preview` 用 AIX CLI 在浏览器预览 UI；它不能替代真机 ASR 生命周期验证。

## 证据采集

```bash
npm run evidence:capture -- auto-restart
```

原始 `logcat` 和设备信息写入被 Git 忽略的 `evidence/private/`。不要提交原始日志。完成隐私检查后，再用提取工具生成候选公开证据：

```bash
npm run evidence:extract -- \
  evidence/private/<capture>/logcat-full.log \
  evidence/public/<capture>.log \
  evidence/private/<capture>/device-info.txt
```

提取结果仍然必须人工逐行复核。详见[证据指南](docs/evidence-guide.md)。

## 文档

- [问题反馈](docs/issue-report.zh-CN.md)
- [复现协议](docs/reproduction-protocol.md)
- [证据采集与脱敏](docs/evidence-guide.md)
- [官方修复后的验收清单](docs/fix-verification-checklist.md)
- [后续文章与教程提纲](docs/article-outline.md)
- [English summary](README.en.md)

## 仓库结构

```text
src/                  可直接导入 Craft 的 AIUI 源码
tests/                Node 行为与项目结构测试
tools/                校验、打包与证据工具
docs/                 问题报告、复现和验收文档
evidence/private/     原始证据，Git 默认忽略
evidence/public/      人工复核后的公开证据
```

## License

MIT
