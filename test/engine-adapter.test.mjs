import test from 'node:test';
import assert from 'node:assert/strict';
import { bestMove, legalMoves } from '../web/js/logic.js';
import {
  createEngineAdapter, toAction, validateReplayAction, validateReplaySide,
} from '../web/js/engine-adapter.js';
import { createRngSuite } from '../web/js/rng.js';
import { append, checkpoint, createLog, derive, truncate, verify } from '../web/js/action-log.js';

const play = (seed, disturbPresentation = false) => {
  const adapter = createEngineAdapter();
  const rng = createRngSuite({ seed });
  let state = adapter.newState();
  const hashes = [adapter.hash(state)];
  const actions = [];
  for (let turn = 0; turn < 20 && state.winner === null; turn++) {
    if (disturbPresentation) {
      rng.stream('visual').nextU32();
      rng.stream('audio').nextU32();
    }
    const move = bestMove(state, 1, rng.stream(`ai:${state.turn}`));
    if (move === null) break;
    const action = toAction(move);
    state = adapter.applyLive(state, action);
    actions.push(action);
    hashes.push(adapter.hash(state));
  }
  return { actions, hashes, rng: rng.snapshot({ canonicalOnly: true }) };
};

test('Alaguli adapter exposes stable setup and after-action hashes', () => {
  const adapter = createEngineAdapter();
  const state = adapter.newState();
  assert.equal(adapter.hash(state), '782bb02c2f53bdcb');
  const action = toAction(legalMoves(state)[0]);
  const next = adapter.applyLive(state, action);
  assert.notEqual(adapter.hash(next), adapter.hash(state));
  assert.deepEqual(action, { type: 'sow', pit: 0 });
});

test('Alaguli state hashes exclude renderer-only event lists', () => {
  const adapter = createEngineAdapter();
  const state = adapter.applyLive(adapter.newState(), { type: 'sow', pit: 0 });
  assert.equal(adapter.hash(state), adapter.hash({ ...state, events: [{ type: 'different' }] }));
});

test('Alaguli adapter rejects illegal structured actions', () => {
  const adapter = createEngineAdapter();
  const state = adapter.newState();
  assert.throws(() => adapter.applyLive(state, { type: 'sow', pit: 8 }), /Illegal/);
  assert.throws(() => toAction({ type: 'move', pit: 0 }), /must be/);
});

test('Alaguli replay action validator is strict and side-aware', () => {
  assert.equal(validateReplayAction({ type: 'sow', pit: 6 }), true);
  assert.throws(() => validateReplayAction({ type: 'sow', pit: 14 }), /0\.\.13/);
  assert.throws(() => validateReplayAction({ type: 'sow', pit: 6, extra: true }), /0\.\.13/);
  assert.equal(validateReplaySide(0), true);
  assert.equal(validateReplaySide(1), true);
  assert.equal(validateReplaySide('0'), false);
});

test('Alaguli restores a migrated v1 checkpoint and can continue replaying', () => {
  const adapter = createEngineAdapter();
  const legacy = adapter.applyLive(adapter.newState(), { type: 'sow', pit: 0 });
  const log = createLog({ game: 'am', rng: { algorithm: 'migrated', seed: 'am-v1-migration' } });
  checkpoint(log, {
    afterAction: 0,
    state: JSON.parse(JSON.stringify(legacy)),
    stateHash: adapter.hash(legacy),
  });
  const restored = derive(log, adapter);
  assert.equal(adapter.hash(restored.state), adapter.hash(legacy));
  const move = legalMoves(restored.state)[0];
  append(log, { side: restored.state.turn, action: toAction(move), stateHash: adapter.hash(adapter.applyLive(restored.state, move)) });
  assert.doesNotThrow(() => derive(log, adapter));
});

test('Alaguli seeded AI produces identical actions and hashes despite presentation draws', () => {
  const first = play('am-replay-vector', false);
  const second = play('am-replay-vector', true);
  assert.deepEqual(second.actions, first.actions);
  assert.deepEqual(second.hashes, first.hashes);
  assert.ok(first.rng['ai:0'].draws + first.rng['ai:1'].draws > 0);
  assert.equal(first.rng.rules.draws, 0, 'Alaguli rules currently have no chance draws');
});

test('Alaguli action-log derive advances AI streams and verifies every state hash', () => {
  const adapter = createEngineAdapter();
  const liveRng = createRngSuite({ seed: 'am-action-log' });
  const log = createLog({
    game: 'am',
    engine: { version: 'am-engine-v1' },
    ruleset: { id: 'am.base', version: 1 },
    world: 'parampare',
    rng: liveRng,
  });
  let state = adapter.newState();
  for (let i = 0; i < 10 && state.winner === null; i += 1) {
    const side = state.turn;
    const streamName = `ai:${side}`;
    const stream = liveRng.stream(streamName);
    const before = stream.draws;
    const action = toAction(bestMove(state, 1, stream));
    state = adapter.applyLive(state, action);
    append(log, {
      side,
      action,
      rngUses: [{ stream: streamName, draws: stream.draws - before }],
      stateHash: adapter.hash(state),
    });
    if (i === 3) checkpoint(log, {
      afterAction: 4,
      state: JSON.parse(JSON.stringify(state)),
      rngState: liveRng.snapshot(),
      stateHash: adapter.hash(state),
    });
  }
  const replay = derive(log, adapter);
  assert.equal(adapter.hash(replay.state), adapter.hash(state));
  assert.deepEqual(replay.rng.snapshot({ canonicalOnly: true }), liveRng.snapshot({ canonicalOnly: true }));
  assert.deepEqual(verify(log, adapter), { ok: true });
  const prefixHash = log.actions[5].stateHash;
  truncate(log, 6);
  assert.equal(adapter.hash(derive(log, adapter).state), prefixHash);
});
