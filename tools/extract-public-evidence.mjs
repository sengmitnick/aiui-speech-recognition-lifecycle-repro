import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RELEVANT_LINE = /ASR_REPRO|SpeechRecognition|cxr-service|AudioRecord|audio\s*record|JSAR|InkView/i;
const LOCAL_PATH = /\/Users\/[^\s"'<>]+/g;

function valueFromInfo(info, key) {
  const line = info.split(/\r?\n/).find((entry) => entry.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim() : '';
}

export function redactEvidence(text, serial = '') {
  let redacted = String(text || '').replace(LOCAL_PATH, '<local-path>');
  if (serial) redacted = redacted.split(serial).join('<device-serial>');
  return redacted;
}

export function filterRelevantLines(logcat) {
  return String(logcat || '')
    .split(/\r?\n/)
    .filter((line) => RELEVANT_LINE.test(line))
    .join('\n');
}

export async function extractEvidence({ privateDirectory, outputFile }) {
  const destination = path.resolve(outputFile);
  try {
    await fs.access(destination);
    throw new Error(`Refusing to overwrite existing evidence: ${destination}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const deviceInfoPath = path.join(privateDirectory, 'device-info.txt');
  const logcatPath = path.join(privateDirectory, 'logcat-full.log');
  const [deviceInfo, logcat] = await Promise.all([
    fs.readFile(deviceInfoPath, 'utf8'),
    fs.readFile(logcatPath, 'utf8'),
  ]);
  const serial = valueFromInfo(deviceInfo, 'serial');
  const relevant = filterRelevantLines(logcat);
  const body = redactEvidence(relevant, serial);
  const header = [
    '# MANUAL PRIVACY REVIEW REQUIRED',
    '# This is an automatic relevance filter, not an approval to publish.',
    '# Review every line before adding this file to Git.',
    '',
  ].join('\n');

  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, `${header}${body}${body ? '\n' : ''}`, 'utf8');
  return destination;
}

const isCommandLine = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCommandLine) {
  const [, , privateDirectory, outputFile] = process.argv;
  if (!privateDirectory || !outputFile) {
    console.error('Usage: node tools/extract-public-evidence.mjs <private-directory> <public-output-file>');
    process.exitCode = 1;
  } else {
    extractEvidence({ privateDirectory, outputFile })
      .then((destination) => console.log(`Public candidate written for manual review: ${destination}`))
      .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
      });
  }
}

