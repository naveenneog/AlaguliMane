// Alaguli Mane per-move replay narration. One finite content-ID descriptor per sow.

export const AM_REPLAY_KEYS = Object.freeze({
  sow: 'am.replay.sow',
  relay: 'am.replay.relay',
  capture: 'am.replay.capture',
  final: 'am.replay.final',
});

export function describeAmTransition({ before, after, entry }) {
  const events = Array.isArray(after.events) ? after.events : [];
  const mover = Number.isSafeInteger(entry.side) ? entry.side : before.turn;
  const gain = after.stores[mover] - before.stores[mover];
  const pickups = events.filter((event) => event.type === 'pickup').length;
  const focus = [...new Set([
    entry.action.pit,
    ...events.map((event) => event.pit),
  ].filter((pit) => Number.isSafeInteger(pit)))].slice(0, 16);
  if (after.winner !== null) {
    return { key: AM_REPLAY_KEYS.final, params: { seeds: gain }, focus };
  }
  if (gain > 0) {
    return { key: AM_REPLAY_KEYS.capture, params: { seeds: gain }, focus };
  }
  if (pickups >= 3) {
    return { key: AM_REPLAY_KEYS.relay, params: { pickups }, focus };
  }
  return { key: AM_REPLAY_KEYS.sow, params: { pit: entry.action.pit }, focus };
}

export const describeTransition = describeAmTransition;

