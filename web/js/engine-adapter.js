import { applyMove, legalMoves, newGame } from './logic.js';
import { createRngSuite } from './rng.js';
import { hashState } from './state-hash.js';

export const ENGINE = Object.freeze({ version: 'am-engine-v1' });
export const RULESET = Object.freeze({ id: 'am.base', version: 1 });

export function toAction(pitOrAction) {
  const action = Number.isInteger(pitOrAction) ? { type: 'sow', pit: pitOrAction } : pitOrAction;
  if (!action || action.type !== 'sow' || !Number.isInteger(action.pit)) {
    throw new TypeError('Alaguli Mane actions must be { type: "sow", pit }');
  }
  return { type: 'sow', pit: action.pit };
}

export function validateReplayAction(action) {
  if (!action || typeof action !== 'object' || Array.isArray(action)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(action))
    || Object.keys(action).length !== 2
    || action.type !== 'sow'
    || !Object.hasOwn(action, 'pit')
    || !Number.isSafeInteger(action.pit)
    || action.pit < 0
    || action.pit >= 14) {
    throw new TypeError('Alaguli Mane replay action must be { type: "sow", pit: 0..13 }');
  }
  return true;
}

export const validateReplaySide = (side) => side === 0 || side === 1;

export function canonicalState(state) {
  return {
    pits: state.pits,
    stores: state.stores,
    turn: state.turn,
    winner: state.winner,
  };
}

function advanceRng(rng, uses = []) {
  for (const use of uses) {
    if (!use || typeof use.stream !== 'string' || !Number.isSafeInteger(use.draws) || use.draws < 0) {
      throw new TypeError('rngUses entries must be { stream, draws } with non-negative draws');
    }
    const stream = rng.stream(use.stream);
    for (let draw = 0; draw < use.draws; draw += 1) stream.nextU32();
  }
}

export function createEngineAdapter({ seedsPerPit } = {}) {
  const newState = (seeds = seedsPerPit) => (seeds === undefined ? newGame() : newGame(seeds));
  const applyLive = (state, action) => {
    const { pit } = toAction(action);
    if (!legalMoves(state).includes(pit)) throw new RangeError(`Illegal Alaguli Mane action: sow ${pit}`);
    return applyMove(state, pit);
  };
  const adapter = {
    newState,
    applyLive,
    setup(log = {}) {
      const seeds = log.setup?.seedsPerPit ?? seedsPerPit;
      return {
        state: newState(seeds),
        rng: createRngSuite({
          algorithm: log.rng?.algorithm === 'migrated' ? undefined : log.rng?.algorithm,
          seed: log.rng?.seed ?? 0,
        }),
      };
    },
    apply(state, entry, rng) {
      advanceRng(rng, entry.rngUses);
      return applyLive(state, entry.action);
    },
    restore(log, saved) {
      const state = {
        ...saved.state,
        pits: saved.state.pits.slice(),
        stores: saved.state.stores.slice(),
        events: [],
      };
      const rng = createRngSuite({
        algorithm: log.rng.algorithm === 'migrated' ? undefined : log.rng.algorithm,
        seed: log.rng.seed,
      });
      if (saved.rngState) rng.restore(saved.rngState);
      return { state, rng };
    },
    hash: (state) => hashState(canonicalState(state)),
  };
  return Object.freeze(adapter);
}
