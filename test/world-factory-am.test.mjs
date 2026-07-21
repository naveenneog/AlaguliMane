import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOOL = path.join(ROOT, 'tooling', 'world-factory.mjs');
const SOURCE = path.join(ROOT, 'worlds', 'am', 'mysuru-angala');
const WORK = path.join(ROOT, 'AlaguliMane', 'build', 'world-factory-test');

async function build(output) {
  await exec(process.execPath, [
    TOOL, 'build',
    '--game', 'am',
    '--world', 'mysuru-angala',
    '--source', SOURCE,
    '--output', output,
  ], { cwd: ROOT });
  return JSON.parse(await readFile(path.join(output, 'report.json'), 'utf8'));
}

test('AM factory adapter builds reproducibly and remains honestly blocked', async () => {
  const one = path.join(WORK, 'one');
  const two = path.join(WORK, 'two');
  await rm(WORK, { recursive: true, force: true });
  const [first, second] = await Promise.all([build(one), build(two)]);
  assert.equal(first.buildId, second.buildId);
  assert.equal(first.semanticFixture.rulesetId, 'am.base');
  assert.equal(first.screenshots.length, 2);
  assert.deepEqual(first.blockers.map(item => item.code), [
    'CULTURAL_REVIEW_PENDING',
    'KANNADA_COVERAGE_PENDING',
    'SCREENSHOT_REVIEW_PENDING',
  ]);
  await exec(process.execPath, [
    TOOL, 'verify',
    '--report', path.join(one, 'report.json'),
    '--source', SOURCE,
  ], { cwd: ROOT });
});
