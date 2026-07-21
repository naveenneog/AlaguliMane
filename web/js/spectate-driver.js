// Alaguli Mane deterministic AI-vs-AI driver with exact ai:0 / ai:1 RNG accounting.
import { bestMove } from './logic.js';

export function createAmSpectateDriver({ level = 2 } = {}) {
  if (!Number.isSafeInteger(level) || level < 1 || level > 3) throw new RangeError('AM spectate level must be 1..3');
  return Object.freeze({
    next({ state, rng }) {
      if (state.winner != null) return null;
      const side = state.turn;
      const stream = rng.stream(`ai:${side}`);
      const before = stream.draws;
      const pit = bestMove(state, level, stream);
      const draws = stream.draws - before;
      if (pit == null) return null;
      return {
        side,
        action: { type: 'sow', pit },
        ...(draws ? { rngUses: [{ stream: stream.name, draws }] } : {}),
      };
    },
  });
}
