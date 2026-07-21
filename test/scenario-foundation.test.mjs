import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createScenario,
  deriveScenario,
  deserializeScenario,
  loadScenario,
  scenarioToLog,
  serializeScenario,
  validateScenario,
} from '../web/js/scenario.js';
import {
  createRuleset,
  createRulesetRegistry,
  deserializeRuleset,
  loadRuleset,
  rulesetRef,
  serializeRuleset,
} from '../web/js/ruleset.js';
import { createRngSuite } from '../web/js/rng.js';
import { hashState } from '../web/js/state-hash.js';

const adapter = {
  setup: (log) => ({
    state: { total: 0 },
    rng: createRngSuite({ algorithm: log.rng.algorithm, seed: log.rng.seed }),
  }),
  apply: (state, entry, rng) => {
    for (const use of entry.rngUses || []) {
      for (let i = 0; i < use.draws; i += 1) rng.stream(use.stream).nextU32();
    }
    return { total: state.total + entry.action.value };
  },
  restore: (log, saved) => {
    const rng = createRngSuite({ algorithm: log.rng.algorithm, seed: log.rng.seed });
    if (saved.rngState) rng.restore(saved.rngState);
    return { state: saved.state, rng };
  },
  hash: hashState,
};

const baseScenario = {
  schema: 1,
  id: 'toy.opening',
  game: 'toy',
  world: 'parampare',
  engine: { version: 'toy-v1' },
  ruleset: { id: 'toy.base', version: 1 },
  rng: { algorithm: 'xoshiro128ss-v1', seed: 'scenario-seed' },
  titleKey: 'The opening lesson',
  briefKey: 'Build a strong opening.',
  position: { kind: 'initial' },
  constraints: { maxActions: 8, allowUndo: true },
  hintKeys: ['Begin from the centre.'],
  solution: [{ type: 'add', value: 2 }],
  par: 1,
};

test('initial scenarios validate English source-text keys and derive from setup', () => {
  assert.equal(validateScenario(baseScenario), true);
  const result = deriveScenario(baseScenario, adapter);
  assert.deepEqual(result.state, { total: 0 });
  assert.equal(result.log.actions.length, 0);
  assert.equal(result.scenario.titleKey, 'The opening lesson');
});

test('action positions become canonical action-log entries and preserve RNG cursors', () => {
  const scenario = createScenario({
    ...baseScenario,
    position: {
      kind: 'actions',
      actions: [
        { side: 0, action: { type: 'add', value: 2 }, rngUses: [{ stream: 'rules', draws: 2 }] },
        { side: 1, action: { type: 'add', value: 3 } },
      ],
    },
  });
  const { log, state, rng } = deriveScenario(scenario, adapter);
  assert.deepEqual(state, { total: 5 });
  assert.equal(log.actions[0].i, 0);
  assert.equal(log.actions[1].i, 1);
  assert.equal(rng.stream('rules').draws, 2);
});

test('state positions become action-zero checkpoints', () => {
  const scenario = {
    ...baseScenario,
    position: { kind: 'state', state: { total: 9 }, stateHash: hashState({ total: 9 }) },
  };
  const log = scenarioToLog(scenario);
  assert.equal(log.actions.length, 0);
  assert.equal(log.checkpoints.length, 1);
  assert.equal(log.checkpoints[0].afterAction, 0);
  assert.deepEqual(deriveScenario(scenario, adapter).state, { total: 9 });
});

test('scenario JSON round-trips and rejects executable or malformed content', async () => {
  const text = serializeScenario(baseScenario, { space: 2 });
  assert.deepEqual(deserializeScenario(text), baseScenario);
  assert.throws(() => createScenario({ ...baseScenario, goal: { test: () => true } }), /data only/);
  assert.throws(() => createScenario({ ...baseScenario, position: { kind: 'moves' } }), /position kind/);
  const loaded = await loadScenario('/scenario.json', {
    game: 'toy',
    fetchImpl: async () => ({ ok: true, json: async () => baseScenario }),
  });
  assert.equal(loaded.id, baseScenario.id);
});

test('rulesets validate, round-trip and resolve exact versions', async () => {
  const base = {
    schema: 1,
    id: 'toy.base',
    version: 1,
    game: 'toy',
    variantOf: null,
    board: { nodes: [0, 1], edges: [[0, 1]] },
  };
  const variant = { ...base, id: 'toy.fast', version: 2, variantOf: 'toy.base' };
  assert.deepEqual(rulesetRef(base), { id: 'toy.base', version: 1 });
  assert.deepEqual(deserializeRuleset(serializeRuleset(base)), base);
  const registry = createRulesetRegistry([base, variant]);
  assert.equal(registry.get('toy.fast', 2).variantOf, 'toy.base');
  assert.equal(registry.resolve({ id: 'toy.base', version: 1 }).game, 'toy');
  assert.throws(() => registry.add(base), /Duplicate/);
  assert.throws(() => createRuleset({ ...base, board: new Map() }), /plain objects/);
  const loaded = await loadRuleset('/ruleset.json', {
    game: 'toy',
    fetchImpl: async () => ({ ok: true, json: async () => base }),
  });
  assert.equal(loaded.id, 'toy.base');
});
