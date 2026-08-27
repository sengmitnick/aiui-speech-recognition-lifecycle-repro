const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

test('public extractor keeps relevant lines and redacts device and local identifiers', async () => {
  const { extractEvidence } = await import('../tools/extract-public-evidence.mjs');
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aiui-asr-evidence-'));
  const privateDirectory = path.join(temporaryRoot, 'private');
  const outputFile = path.join(temporaryRoot, 'public.log');
  fs.mkdirSync(privateDirectory);
  fs.writeFileSync(path.join(privateDirectory, 'device-info.txt'), [
    'serial=1901092524000561',
    'model=RG-glasses',
    'source=/Users/seng/Documents/RokidAIUI/repro',
  ].join('\n'));
  fs.writeFileSync(path.join(privateDirectory, 'logcat-full.log'), [
    '08-27 I JSAR: ASR_REPRO {"event":"onstart"}',
    '08-27 I SpeechRecognition: targetId=1901092524000561',
    '08-27 I cxr-service: open AudioRecord',
    '08-27 I InkView: source=/Users/seng/Documents/RokidAIUI/repro',
    '08-27 I com.bank.app: account notification',
  ].join('\n'));

  await extractEvidence({ privateDirectory, outputFile });
  const output = fs.readFileSync(outputFile, 'utf8');

  assert.match(output, /MANUAL PRIVACY REVIEW REQUIRED/);
  assert.match(output, /ASR_REPRO/);
  assert.match(output, /SpeechRecognition/);
  assert.match(output, /cxr-service/);
  assert.match(output, /AudioRecord/);
  assert.match(output, /InkView/);
  assert.doesNotMatch(output, /com\.bank\.app/);
  assert.doesNotMatch(output, /1901092524000561/);
  assert.match(output, /<device-serial>/);
  assert.doesNotMatch(output, /\/Users\/seng/);
  assert.match(output, /<local-path>/);
});

test('public extractor refuses to overwrite reviewed evidence', async () => {
  const { extractEvidence } = await import('../tools/extract-public-evidence.mjs');
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aiui-asr-evidence-'));
  const privateDirectory = path.join(temporaryRoot, 'private');
  const outputFile = path.join(temporaryRoot, 'public.log');
  fs.mkdirSync(privateDirectory);
  fs.writeFileSync(path.join(privateDirectory, 'device-info.txt'), 'serial=abc\n');
  fs.writeFileSync(path.join(privateDirectory, 'logcat-full.log'), 'ASR_REPRO first\n');
  fs.writeFileSync(outputFile, 'reviewed');

  await assert.rejects(
    extractEvidence({ privateDirectory, outputFile }),
    /refusing to overwrite/i,
  );
  assert.equal(fs.readFileSync(outputFile, 'utf8'), 'reviewed');
});

test('capture script records device metadata and foreground logcat under private evidence', () => {
  const source = fs.readFileSync(path.join(ROOT, 'tools/capture-device-evidence.sh'), 'utf8');
  assert.match(source, /adb devices/);
  assert.match(source, /ro\.product\.manufacturer/);
  assert.match(source, /ro\.product\.model/);
  assert.match(source, /ro\.build\.version\.release/);
  assert.match(source, /ro\.build\.display\.id/);
  assert.match(source, /ro\.build\.version\.incremental/);
  assert.match(source, /ro\.build\.fingerprint/);
  assert.match(source, /git rev-parse HEAD/);
  assert.match(source, /evidence\/private/);
  assert.match(source, /adb logcat -v threadtime/);
  assert.match(source, /trap/);
  assert.match(source, /王秘书说他凌晨一点半/);
  assert.match(source, /在蓝色会议室/);
  assert.match(source, /桌上放着一份文件/);
});
