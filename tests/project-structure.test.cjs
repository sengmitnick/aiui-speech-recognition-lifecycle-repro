const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('src is a standalone one-page Craft project with microphone permission only', () => {
  const app = JSON.parse(read('src/app.json'));
  assert.deepEqual(app.pages, ['pages/index/index']);
  assert.deepEqual(app.requiredPermissions, { microphone: true });
  assert.ok(fs.existsSync(path.join(ROOT, 'src/app.js')));
  assert.ok(fs.existsSync(path.join(ROOT, 'src/app.wxss')));
  assert.ok(fs.existsSync(path.join(ROOT, 'src/AGENTS.md')));
});

test('raw evidence and generated artifacts cannot be committed by default', () => {
  const ignore = read('.gitignore');
  assert.match(ignore, /^evidence\/private\/$/m);
  assert.match(ignore, /^dist\/$/m);
});

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

test('page uses a supported high-contrast border-only diagnostic UI', () => {
  const source = read('src/pages/index/index.ink');
  assert.match(source, /<page>[\s\S]*<\/page>/);
  assert.doesNotMatch(source, /<template>[\s\S]*<\/template>/);
  assert.match(source, /background-color:\s*var\(--color-background\)/);
  assert.match(source, /border-color:\s*var\(--border-color-accent\)/);
  assert.doesNotMatch(source, /box-shadow|text-shadow|drop-shadow/);
  assert.doesNotMatch(source, /background-color:\s*var\(--color-primary\)/);
  assert.doesNotMatch(source, /[🌀-🫿]/u);
});
