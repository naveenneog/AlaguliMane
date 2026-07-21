import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { append, createLog, setResult } from '../web/js/action-log.js';
import { createAmAchievementEvaluators } from '../web/js/achievement-insights.js';
import { createEngineAdapter, ENGINE, RULESET } from '../web/js/engine-adapter.js';
import { legalMoves } from '../web/js/logic.js';
import { createRngSuite } from '../web/js/rng.js';

const readJson = async (relative) => JSON.parse(await readFile(new URL(relative, import.meta.url), 'utf8'));
function deterministicMatch(adapter) {
  const rng = createRngSuite({ seed: 'am-achievement-test' });
  const log = createLog({ game: 'am', engine: ENGINE, ruleset: RULESET, rng });
  let state = adapter.newState();
  while (state.winner === null && log.actions.length < 100) {
    const pit = legalMoves(state)[0];
    const side = state.turn;
    state = adapter.applyLive(state, { type: 'sow', pit });
    append(log, { side, action: { type: 'sow', pit }, stateHash: adapter.hash(state) });
  }
  setResult(log, { winner: state.winner, afterAction: log.actions.length });
  return { log, state };
}

test('AM registry is valid and every content id has English source text', async () => {
  const registry = await readJson('../web/achievements/registry.json');
  const content = await readJson('../web/achievements/content.en.json');
  assert.equal(registry.schema, 1);
  assert.equal(registry.game, 'am');
  assert.equal(registry.achievements.length, 9);
  assert.equal(new Set(registry.achievements.map(({ id }) => id)).size, 9);
  for (const achievement of registry.achievements) {
    assert.match(achievement.titleKey, /^am\.achievement\./);
    assert.match(achievement.descKey, /^am\.achievement\./);
    assert.equal(typeof content[achievement.titleKey], 'string');
    assert.equal(typeof content[achievement.descKey], 'string');
  }
});

test('AM craft evaluators reproduce exact canonical match statistics', async () => {
  const adapter = createEngineAdapter();
  const { log, state } = deterministicMatch(adapter);
  const evaluators = createAmAchievementEvaluators({ adapter });
  assert.equal(log.actions.length, 14);
  assert.equal(state.winner, 1);
  assert.deepEqual({
    harvest: evaluators['am.max-harvest']({ log }),
    captures: evaluators['am.max-capture-events']({ log }),
    relay: evaluators['am.max-relay-pickups']({ log }),
    reversal: evaluators['am.win-after-lead-reversal']({ log }),
  }, {
    harvest: 25,
    captures: 7,
    relay: 9,
    reversal: 1,
  });

});
