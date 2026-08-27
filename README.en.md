# AIUI SpeechRecognition Lifecycle Reproduction

This is a small, public Rokid AIUI project for observing the native `SpeechRecognition` lifecycle across natural pauses and repeated `start()` calls after `onend`.

**Status: awaiting official confirmation.** The repository distinguishes observed behavior from hypotheses about runtime internals.

## Import into Craft

Import the `src/` directory into Craft as a local folder. The directory is a complete standalone AIUI project; tests, documentation, and evidence tooling remain outside the application bundle.

The app requests microphone access only. It has no LLM, TTS, camera, account, network, or product-specific logic, and it does not save audio.

## Comparison modes

- **Baseline:** starts one native recognition segment and stops after `onend`.
- **Auto restart:** reuses the same `SpeechRecognition` object and calls `start()` 300ms after every `onend`.

Every lifecycle callback is visible on the page and emitted as one JSON console line prefixed with `ASR_REPRO `. A 15-second no-callback observer records the condition without aborting, stopping, or restarting the recognizer.

## Run

```bash
npm install
npm test
npm run check
npm run preview
npm run pack
```

Use the [reproduction protocol](docs/reproduction-protocol.md) on real glasses. Browser preview is useful for UI and keyboard navigation, but it is not evidence of the device ASR lifecycle.

Raw ADB logs stay under the Git-ignored `evidence/private/` directory. Only manually reviewed and redacted extracts may be placed in `evidence/public/`.

License: MIT.
