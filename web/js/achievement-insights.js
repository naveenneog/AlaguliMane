// Alaguli Mane achievement evidence derived only from the canonical completed action log.
import { derive } from './action-log.js';

function collect(log, adapter) {
  if (!adapter || typeof adapter.apply !== 'function') {
    throw new TypeError('Alaguli Mane achievement evaluators require an action-log adapter');
  }
  const replayed = derive(log, adapter, 0);
  let state = replayed.state;
  let maxHarvest = 0;
  let maxCaptureEvents = 0;
  let maxRelayPickups = 0;
  const leadReversed = [false, false];
  for (const entry of log.actions) {
    const before = state;
    state = adapter.apply(state, entry, replayed.rng);
    const mover = entry.side === 0 || entry.side === 1 ? entry.side : before.turn;
    const captures = state.events.filter((event) => event.type === 'capture4' || event.type === 'captureEnd');
    const harvest = captures.reduce((total, event) => total + (event.type === 'capture4' ? 4 : event.count), 0);
    maxHarvest = Math.max(maxHarvest, harvest);
    maxCaptureEvents = Math.max(maxCaptureEvents, captures.length);
    maxRelayPickups = Math.max(maxRelayPickups, state.events.filter((event) => event.type === 'pickup').length);
    if (mover === 0 || mover === 1) {
      const other = mover ^ 1;
      const beforeLead = before.stores[mover] - before.stores[other];
      const afterLead = state.stores[mover] - state.stores[other];
      if (beforeLead <= 0 && afterLead > 0) leadReversed[mover] = true;
    }
  }
  const winner = state.winner === 0 || state.winner === 1 ? state.winner : null;
  return {
    maxHarvest,
    maxCaptureEvents,
    maxRelayPickups,
    winAfterLeadReversal: winner !== null && leadReversed[winner] ? 1 : 0,
  };
}

export function createAmAchievementEvaluators({ adapter } = {}) {
  const stats = (log) => collect(log, adapter);
  return Object.freeze({
    'am.max-harvest': ({ log }) => stats(log).maxHarvest,
    'am.max-capture-events': ({ log }) => stats(log).maxCaptureEvents,
    'am.max-relay-pickups': ({ log }) => stats(log).maxRelayPickups,
    'am.win-after-lead-reversal': ({ log }) => stats(log).winAfterLeadReversal,
  });
}
