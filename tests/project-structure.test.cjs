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
