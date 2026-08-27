# Agent Manifest

## Identity

- **Name**: AIUI SpeechRecognition Lifecycle Repro
- **Version**: 0.1.0
- **Description**: 对照单次识别和自动续听，记录 AIUI SpeechRecognition 的真机生命周期事件。

## Capabilities

- **Permissions**:
  - microphone

## Privacy

- 只在用户主动启动测试后使用麦克风。
- 不保存音频，不由应用主动上传识别文本。
- 复现时只使用公开文档中的固定测试句子。

