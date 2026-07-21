// Alaguli Mane deterministic recap candidates. Facts only; no search or locale-dependent decisions.

export const AM_RECAP_KEYS = Object.freeze({
  largeHarvest: 'am.recap.harvest.large',
  longRelay: 'am.recap.relay.long',
  leadChanged: 'am.recap.lead.changed',
  finalSweep: 'am.recap.final.sweep',
  exposedHarvest: 'am.recap.harvest.exposed',
});

const eventCount = (events, type) => events.filter((event) => event.type === type).length;
const focusPits = (action, events) => [...new Set([
  action?.pit,
  ...events.map((event) => event.pit),
].filter((pit) => Number.isSafeInteger(pit)))].slice(0, 16);

export function analyzeAmTransition({ before, after, entry, next }) {
  const candidates = [];
  const mover = Number.isSafeInteger(entry.side) ? entry.side : before.turn;
  const other = mover ^ 1;
  const events = Array.isArray(after.events) ? after.events : [];
  const captures = events.filter((event) => event.type === 'capture4' || event.type === 'captureEnd');
  const pickups = eventCount(events, 'pickup');
  const gain = after.stores[mover] - before.stores[mover];
  const terminal = after.winner !== null;
  const focus = focusPits(entry.action, events);

  if (gain >= 8) {
    candidates.push({
      kind: 'large-harvest',
      score: 25 * gain + (captures.length >= 2 ? 80 : 0) + (pickups >= 3 ? 60 : 0),
      sentenceKey: AM_RECAP_KEYS.largeHarvest,
      params: { seeds: gain, captures: captures.length },
      focus,
      coexistsWithTerminal: terminal,
    });
  }
  if (pickups >= 3) {
    candidates.push({
      kind: 'long-relay',
      score: 60 + 10 * pickups,
      sentenceKey: AM_RECAP_KEYS.longRelay,
      params: { pickups },
      focus,
    });
  }

  const beforeLead = before.stores[mover] - before.stores[other];
  const afterLead = after.stores[mover] - after.stores[other];
  if (beforeLead <= 0 && afterLead > 0) {
    candidates.push({
      kind: 'lead-reversal',
      score: 180 + 10 * afterLead,
      sentenceKey: AM_RECAP_KEYS.leadChanged,
      params: { lead: afterLead },
      focus,
    });
  }

  if (terminal) {
    candidates.push({
      kind: 'final-sweep',
      score: 1000,
      sentenceKey: AM_RECAP_KEYS.finalSweep,
      params: {},
      focus,
      terminal: true,
    });
  }

  if (next) {
    const nextMover = Number.isSafeInteger(next.entry.side) ? next.entry.side : next.before.turn;
    const nextGain = next.after.stores[nextMover] - next.before.stores[nextMover];
    if (nextGain >= 8) {
      candidates.push({
        kind: 'exposed-harvest',
        score: 80 + 10 * nextGain,
        sentenceKey: AM_RECAP_KEYS.exposedHarvest,
        params: { seeds: nextGain },
        focus: focusPits(next.entry.action, next.after.events ?? []),
        coexistsWithTerminal: next.after.winner !== null,
      });
    }
  }

  return candidates;
}

export const analyzeTransition = analyzeAmTransition;
