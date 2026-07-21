import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AM_RECAP_KEYS, analyzeAmTransition } from '../web/js/recap-insights.js';
import { createEngineAdapter } from '../web/js/engine-adapter.js';

const loadPuzzle = async (id) => JSON.parse(await readFile(
  new URL(`../web/assets/puzzles/am/${id}.json`, import.meta.url),
  'utf8',
));
const hydrate = (saved) => ({
  ...saved,
  pits: saved.pits.slice(),
  stores: saved.stores.slice(),
  events: [],
});

test('AM large relay harvest emits integer-scored factual candidates', async () => {
  const adapter = createEngineAdapter();
  const puzzle = await loadPuzzle('am.puzzle.harvest-relay');
  const before = hydrate(puzzle.position.state);
  const action = puzzle.solution[0];
  const after = adapter.applyLive(before, action);
  const candidates = analyzeAmTransition({
    before,
    after,
    entry: { side: 0, action },
    next: null,
  });
  const harvest = candidates.find((candidate) => candidate.kind === 'large-harvest');
  assert.equal(after.stores[0] - before.stores[0], 42);
  assert.equal(harvest.params.seeds, 42);
  assert.equal(Number.isSafeInteger(harvest.score), true);
  assert.equal(harvest.sentenceKey, 'am.recap.harvest.large');
});

test('AM final sweep is forced as a terminal recap moment', async () => {
  const adapter = createEngineAdapter();
  const puzzle = await loadPuzzle('am.puzzle.final-sweep');
  const before = hydrate(puzzle.position.state);
  const action = puzzle.solution[0];
  const after = adapter.applyLive(before, action);
  const candidates = analyzeAmTransition({
    before,
    after,
    entry: { side: 0, action },
    next: null,
  });
  const final = candidates.find((candidate) => candidate.kind === 'final-sweep');
  assert.equal(after.winner, 0);
  assert.equal(final.score, 1000);
  assert.equal(final.terminal, true);
  assert.equal(final.sentenceKey, 'am.recap.final.sweep');
});

test('AM sentence bank covers every detector content ID', async () => {
  const catalog = JSON.parse(await readFile(
    new URL('../web/recaps/content.en.json', import.meta.url),
    'utf8',
  ));
  assert.deepEqual(Object.keys(catalog).sort(), Object.values(AM_RECAP_KEYS).sort());
  assert.ok(Object.values(catalog).every((text) => typeof text === 'string' && text.length > 12));
});
