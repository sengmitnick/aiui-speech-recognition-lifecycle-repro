# 证据采集、脱敏与公开指南

## 原则

完整 `adb logcat` 可能包含账号、通知、其他应用、设备序列号、本机路径和用户说出的原文。原始文件只用于本地诊断，必须留在 `evidence/private/`，不得提交、上传或直接粘贴到公开 Issue。

`evidence/public/` 只能保存人工逐行复核后的最小相关片段。

## 采集原始证据

连接且只连接一台已授权真机，然后运行：

```bash
npm run evidence:capture -- auto-restart
```

脚本会记录设备环境与当前 Git 提交，并以前台方式采集 `adb logcat -v threadtime`。按[复现协议](reproduction-protocol.md)说固定语句，完成后按 Ctrl-C。

原始目录形如：

```text
evidence/private/20260827-120000-auto-restart/
├── device-info.txt
└── logcat-full.log
```

## 生成候选公开片段

```bash
npm run evidence:extract -- \
  evidence/private/<capture>/logcat-full.log \
  evidence/public/<capture>.log \
  evidence/private/<capture>/device-info.txt
```

提取器只保留 `ASR_REPRO`、`SpeechRecognition`、录音服务、JSAR 和 InkView 等候选行，自动把设备序列号替换为 `<device-serial>`，把 `/Users/...` 本机路径替换为 `<local-path>`，并拒绝覆盖已有公开证据。

自动筛选不是隐私审查，也不能判断问题已复现。

## 人工逐行复核清单

发布前必须打开候选文件，逐行确认：

- [ ] 无设备序列号、ADB 标识、MAC、IP、SSID 或蓝牙地址。
- [ ] 无用户名、本机路径、仓库外文件名或 shell 环境信息。
- [ ] 无账号、Token、Cookie、手机号、邮箱、联系人、通知和其他应用内容。
- [ ] 语音原文仅包含公开协议里的固定句子。
- [ ] 无与本案例无关的进程日志。
- [ ] 保留了足以理解时序的时间戳、RUN、SEGMENT 和事件名。
- [ ] 设备环境文件不含 fingerprint 中的私有定制标识；不确定时继续缩减。
- [ ] 结论写成“未复现”“疑似复现”或“待官方确认”，不把猜测写成根因。

## 推荐公开证据组成

每个公开案例使用一个独立前缀，包含：

```text
evidence/public/<case>-environment.md
evidence/public/<case>-events.log
evidence/public/<case>-timeline.md
evidence/public/<case>-screen.png   # 可选，确认无隐私后
```

`timeline.md` 应写明操作、固定语句、最后正常回调、首个无回调分段、观测时长，以及是否存在切页、主动中止或权限变化。

## 不能公开的内容

- 未筛选的 `logcat-full.log`。
- 原始 `device-info.txt`。
- 含非固定语句的录屏、转写和系统日志。
- 无法解释来源的录音服务行。
- 仅凭 `watchdog_no_callback` 得出的确定根因结论。
