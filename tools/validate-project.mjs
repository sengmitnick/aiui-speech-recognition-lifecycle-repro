import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(repoRoot, 'src');

function fail(message) {
  throw new Error(`Craft source validation failed: ${message}`);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(target) : [target];
  });
}

function resolveImport(owner, specifier) {
  const base = path.resolve(path.dirname(owner), specifier);
  const candidates = [base, `${base}.js`, `${base}.ink`, path.join(base, 'index.js')];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

if (!fs.existsSync(sourceRoot)) fail('src/ is missing');

const appPath = path.join(sourceRoot, 'app.json');
if (!fs.existsSync(appPath)) fail('src/app.json is missing');

const app = JSON.parse(read(appPath));
if (!Array.isArray(app.pages) || app.pages.length !== 1) {
  fail('app.json must register exactly one page');
}

const permissions = app.requiredPermissions || {};
if (JSON.stringify(permissions) !== JSON.stringify({ microphone: true })) {
  fail('only microphone permission is allowed');
}

for (const route of app.pages) {
  const pagePath = path.join(sourceRoot, `${route}.ink`);
  if (!fs.existsSync(pagePath)) fail(`registered page is missing: ${route}.ink`);
  const pageSource = read(pagePath);
  if (/<template(?:\s|>)/.test(pageSource)) {
    fail(`${route}.ink uses unsupported <template> root`);
  }
  if (!/<page(?:\s|>)/.test(pageSource)) {
    fail(`${route}.ink must contain a <page> root`);
  }
}

const sourceFiles = filesUnder(sourceRoot).filter((file) => /\.(?:js|ink)$/.test(file));
const importPattern = /\b(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g;

for (const owner of sourceFiles) {
  const content = read(owner);
  for (const match of content.matchAll(importPattern)) {
    const specifier = match[1];
    if (!specifier.startsWith('.')) continue;
    const resolved = resolveImport(owner, specifier);
    if (!resolved) {
      fail(`unresolved import ${specifier} from ${path.relative(sourceRoot, owner)}`);
    }
    const relative = path.relative(sourceRoot, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      fail(`source import escapes src/: ${specifier}`);
    }
  }
}

console.log(`Craft source validation passed: ${app.pages.length} page, ${sourceFiles.length} source files, microphone only.`);
