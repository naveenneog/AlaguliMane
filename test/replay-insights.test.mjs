import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createEngineAdapter } from '../web/js/engine-adapter.js';
import { AM_REPLAY_KEYS, describeAmTransition } from '../web/js/replay-insights.js';

const loadPuzzle = async (id) => JSON.parse(await readFile(
  new URL(`../web/assets/puzzles/am/${id}.json`, import.meta.url),
  'utf8',
));

test('AM replay narration reports a deterministic harvest', async () => {
  const adapter = createEngineAdapter();
  const puzzle = await loadPuzzle('am.puzzle.harvest-relay');
  const before = {
    ...puzzle.position.state,
    pits: puzzle.position.state.pits.slice(),
    stores: puzzle.position.state.stores.slice(),
    events: [],
  };
  const action = puzzle.solution[0];
  const after = adapter.applyLive(before, action);
  const descriptor = describeAmTransition({
    before,
    after,
    entry: { side: 0, action },
  });
  assert.equal(descriptor.key, AM_REPLAY_KEYS.capture);
  assert.equal(descriptor.params.seeds, 42);
  assert.ok(descriptor.focus.includes(4));
});

test('AM replay sentence bank covers every descriptor key', async () => {
  const catalog = JSON.parse(await readFile(
    new URL('../web/replays/content.en.json', import.meta.url),
    'utf8',
  ));
  assert.deepEqual(Object.keys(catalog).sort(), Object.values(AM_REPLAY_KEYS).sort());
});
