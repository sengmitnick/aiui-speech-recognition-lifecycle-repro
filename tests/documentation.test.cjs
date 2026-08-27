const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const REQUIRED_DOCS = [
  'README.md',
  'README.en.md',
  'docs/issue-report.zh-CN.md',
  'docs/reproduction-protocol.md',
  'docs/evidence-guide.md',
  'docs/fix-verification-checklist.md',
  'docs/article-outline.md',
];

test('public documentation set exists and the project status stays unconfirmed', () => {
  for (const file of REQUIRED_DOCS) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} should exist`);
  }
  assert.match(read('README.md'), /项目状态[：:]\s*待官方确认/);
  assert.match(read('README.md'), /选择仓库中的 `src\/` 目录/);
  assert.match(read('README.en.md'), /Import.*`src\/`.*Craft/i);
});

test('reproduction protocol uses fixed privacy-safe phrases and contrasting modes', () => {
  const protocol = read('docs/reproduction-protocol.md');
  assert.match(protocol, /单次识别基线/);
  assert.match(protocol, /自动续听复现/);
  assert.match(protocol, /王秘书说他凌晨一点半/);
  assert.match(protocol, /在蓝色会议室/);
  assert.match(protocol, /桌上放着一份文件/);
  assert.match(protocol, /2\s*至\s*3\s*秒/);
  assert.match(protocol, /至少\s*10\s*轮/);
});

test('issue report separates observation from inference and states expected behavior', () => {
  const report = read('docs/issue-report.zh-CN.md');
  assert.match(report, /期望行为/);
  assert.match(report, /实际行为/);
  assert.match(report, /已确认的观察/);
  assert.match(report, /尚未确认的推断/);
  assert.match(report, /onresult/);
  assert.match(report, /onend/);
  assert.match(report, /onerror/);
});

test('evidence guide keeps raw data private and requires manual review', () => {
  const guide = read('docs/evidence-guide.md');
  assert.match(guide, /evidence\/private\//);
  assert.match(guide, /不得提交/);
  assert.match(guide, /人工逐行复核/);
  assert.match(guide, /序列号/);
  assert.match(guide, /本机路径/);
});

test('fix verification and future tutorial preserve the project after an official fix', () => {
  const checklist = read('docs/fix-verification-checklist.md');
  const outline = read('docs/article-outline.md');
  assert.match(checklist, /20\s*次/);
  assert.match(checklist, /5\s*秒/);
  assert.match(checklist, /页面切换/);
  assert.match(outline, /问题修复后/);
  assert.match(outline, /教程/);
});
