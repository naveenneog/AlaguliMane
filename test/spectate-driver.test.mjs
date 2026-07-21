import test from 'node:test';
import assert from 'node:assert/strict';
import { createLog, verify } from '../web/js/action-log.js';
import {
  createEngineAdapter, ENGINE, RULESET, validateReplayAction, validateReplaySide,
} from '../web/js/engine-adapter.js';
import { createRngSuite } from '../web/js/rng.js';
import { verifyReplay } from '../web/js/replay-format.js';
import { buildSpectateLog } from '../web/js/spectate.js';
import { createAmSpectateDriver } from '../web/js/spectate-driver.js';

function generate(seed = 'am-driver-test') {
  const adapter = createEngineAdapter();
  const rng = createRngSuite({ seed });
  const log = createLog({ game: 'am', engine: ENGINE, ruleset: RULESET, world: 'parampare', rng });
  const driver = createAmSpectateDriver({ level: 1 });
  return {
    adapter,
    generated: buildSpectateLog({ log, adapter, driver, maxActions: 40, repetition: 3 }),
  };
}

test('AM spectate driver produces deterministic replay-clean sow actions', () => {
  const first = generate();
  const second = generate();
  assert.equal(JSON.stringify(first.generated), JSON.stringify(second.generated));
  assert.equal(first.generated.log.actions.length > 0, true);
  assert.deepEqual(verify(first.generated.log, first.adapter), { ok: true });
  assert.equal(verifyReplay(first.generated.log, first.adapter, {
    game: 'am',
    engine: ENGINE,
    ruleset: RULESET,
    validateAction: validateReplayAction,
    validateSide: validateReplaySide,
  }).ok, true);
});

test('AM driver accounts only the current side AI tie-break stream', () => {
  const adapter = createEngineAdapter();
  const rng = createRngSuite({ seed: 'am-driver-draws' });
  const decision = createAmSpectateDriver({ level: 1 }).next({
    state: adapter.newState(),
    rng,
    actionIndex: 0,
  });
  assert.equal(decision.side, 0);
  assert.deepEqual(decision.rngUses, [{ stream: 'ai:0', draws: 1 }]);
});
