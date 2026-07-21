import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPuzzleIface } from '../web/js/puzzle-iface.js';
import { solvePuzzle, verifyPuzzle } from '../web/js/puzzle.js';
import { assertNoEnglishKeys } from '../web/js/content-id.js';

const readJson = async (url) => JSON.parse(await readFile(url, 'utf8'));
const index = await readJson(new URL('../web/puzzles/index.json', import.meta.url));
const catalog = await readJson(new URL('../web/puzzles/content.en.json', import.meta.url));
const puzzles = await Promise.all(index.map(({ file }) => readJson(new URL(`../web/puzzles/${file}`, import.meta.url))));
const iface = createPuzzleIface();

test('Alaguli Mane pack has two easy, two medium and two hard content-ID puzzles', () => {
  assert.equal(puzzles.length, 6);
  assert.deepEqual(
    Object.fromEntries(['easy', 'medium', 'hard'].map((level) => [level, puzzles.filter((p) => p.difficulty === level).length])),
    { easy: 2, medium: 2, hard: 2 },
  );
  for (const puzzle of puzzles) {
    assert.equal(assertNoEnglishKeys(puzzle), true);
    assert.equal(typeof catalog[puzzle.titleKey], 'string');
    assert.equal(typeof catalog[puzzle.briefKey], 'string');
    assert.ok(puzzle.hintKeys.every((key) => typeof catalog[key] === 'string'));
  }
});

test('runtime puzzle assets package the verified Alaguli specs', async () => {
  const runtime = await readJson(new URL('../web/assets/puzzles/am/index.json', import.meta.url));
  assert.equal(runtime.game, 'am');
  assert.equal(runtime.version, '1.6.0');
  assert.deepEqual(runtime.puzzles.map(({ id }) => id), puzzles.map(({ id }) => id));
  const packaged = await Promise.all(runtime.puzzles.map(({ id }) =>
    readJson(new URL(`../web/assets/puzzles/am/${id}.json`, import.meta.url))));
  assert.deepEqual(packaged, puzzles);
});

for (const puzzle of puzzles) {
  test(`${puzzle.id} is legal, solver-reproduced and exactly at par`, () => {
    const result = verifyPuzzle(puzzle, iface);
    assert.deepEqual(result, { ok: true, moves: puzzle.par, par: puzzle.par });
    assert.deepEqual(solvePuzzle(puzzle, iface, { maxDepth: puzzle.par }), puzzle.solution);
    assert.equal(puzzle.solution.length, 1, 'AM puzzles stay within one uninterrupted turn');
  });
}
