import { legalMoves } from './logic.js';
import { createEngineAdapter, toAction } from './engine-adapter.js';

export function makeAmPuzzleIface() {
  const engine = createEngineAdapter();
  return Object.freeze({
    engine,
    legalActions: (state) => legalMoves(state).map(toAction),
    apply: (state, action) => engine.applyLive(state, action),
    hash: (state) => engine.hash(state),
    isTerminal: (state) => state.winner !== null,
  });
}

export const createPuzzleIface = makeAmPuzzleIface;
