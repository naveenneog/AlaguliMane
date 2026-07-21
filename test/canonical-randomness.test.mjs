import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const canonicalFiles = [
  'web/js/logic.js',
  'web/js/game3d.js',
  'web/js/engine-adapter.js',
  'web/js/rng.js',
  'web/js/state-hash.js',
  'web/js/action-log.js',
  'web/js/save.js',
  'web/js/scenario.js',
  'web/js/ruleset.js',
  'web/js/replay-player.js',
  'web/js/auto-demo.js',
  'web/js/puzzle.js',
  'web/js/daily.js',
  'web/js/content-id.js',
  'web/js/profile.js',
  'web/js/challenge-link.js',
  'web/js/puzzle-iface.js',
  'web/js/puzzle-ui.js',
];

test('canonical engine, AI, log and save paths never use Math.random', async () => {
  for (const file of canonicalFiles) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\bMath\.random\b/, file);
  }
});
