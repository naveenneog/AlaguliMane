// Alaguli Mane (Pallanguzhi) — pure rules engine. No DOM.
//
// A 2x7 pit board (14 pits), 6 seeds per pit to start. On your turn you lift a
// pit's seeds and sow them one per pit counterclockwise. Whenever a pit reaches
// exactly four it is captured. When your handful ends, the next pit — if it has
// seeds — is lifted and sowing continues (a relay); if it is empty, you capture
// the pit beyond it (if any) and the turn ends. Most seeds captured wins.
//
// Original intent (research): counting, resource management and concentration —
// "a traditional antidote for children weak in mathematics". So the digital
// build must SHOW the sowing chain and captures, never resolve them invisibly.

export const PITS = 14;                 // 0..6 = player 0's row, 7..13 = player 1's row
export const SEEDS_PER_PIT = 6;
export const ownerOf = (pit) => (pit < 7 ? 0 : 1);
export const ownPits = (p) => (p === 0 ? [0, 1, 2, 3, 4, 5, 6] : [7, 8, 9, 10, 11, 12, 13]);

export function newGame(seedsPerPit = SEEDS_PER_PIT) {
  return {
    pits: new Array(PITS).fill(seedsPerPit),
    stores: [0, 0],
    turn: 0,
    winner: null,        // null | 0 | 1 | 'draw'
    events: [],
  };
}

function clone(s) { return { pits: s.pits.slice(), stores: s.stores.slice(), turn: s.turn, winner: s.winner, events: [] }; }

export function legalMoves(state, side = state.turn) {
  return ownPits(side).filter((i) => state.pits[i] > 0);
}

// Resolve an ENTIRE turn from starting pit `start` (all relays + captures),
// recording an event list for the renderer to animate, then pass the turn.
export function applyMove(state, start) {
  const s = clone(state);
  const p = s.turn;
  const ev = s.events;
  let hand = s.pits[start]; s.pits[start] = 0;
  ev.push({ type: 'pickup', pit: start, count: hand });
  let cur = start;
  let guard = 0;
  while (guard++ < 20000) {
    while (hand > 0) {
      cur = (cur + 1) % PITS;
      s.pits[cur] += 1; hand -= 1;
      ev.push({ type: 'sow', pit: cur });
      if (s.pits[cur] === 4) { s.stores[p] += 4; s.pits[cur] = 0; ev.push({ type: 'capture4', pit: cur, by: p }); }
    }
    const next = (cur + 1) % PITS;
    if (s.pits[next] > 0) { hand = s.pits[next]; s.pits[next] = 0; cur = next; ev.push({ type: 'pickup', pit: next, count: hand }); continue; }
    const after = (next + 1) % PITS;
    if (s.pits[after] > 0) { ev.push({ type: 'captureEnd', pit: after, by: p, count: s.pits[after] }); s.stores[p] += s.pits[after]; s.pits[after] = 0; }
    break;
  }
  s.turn = p === 0 ? 1 : 0;
  // if the player to move now has no seeds, the round ends: each side banks its own row.
  if (legalMoves(s).length === 0) {
    for (let i = 0; i < PITS; i++) if (s.pits[i] > 0) { const o = ownerOf(i); s.stores[o] += s.pits[i]; ev.push({ type: 'sweep', pit: i, by: o, count: s.pits[i] }); s.pits[i] = 0; }
    s.winner = s.stores[0] === s.stores[1] ? 'draw' : (s.stores[0] > s.stores[1] ? 0 : 1);
  }
  return s;
}

// captured this move (for quick heuristics / UI)
export function capturedBy(before, after, p) { return after.stores[p] - before.stores[p]; }

// ---------------------------------------------------------------- AI (minimax on store lead)
export function evaluate(state, forP) {
  if (state.winner === forP) return 100000;
  if (state.winner === (forP ^ 1)) return -100000;
  const lead = state.stores[forP] - state.stores[forP ^ 1];
  const onBoard = ownPits(forP).reduce((a, i) => a + state.pits[i], 0) - ownPits(forP ^ 1).reduce((a, i) => a + state.pits[i], 0);
  return lead * 10 + onBoard;   // captured seeds dominate; keeping seeds on your side helps
}

function search(state, depth, alpha, beta, root) {
  if (state.winner !== null || depth <= 0) return evaluate(state, root);
  const moves = legalMoves(state);
  if (!moves.length) return evaluate(state, root);
  const max = state.turn === root;
  if (max) { let best = -Infinity; for (const m of moves) { best = Math.max(best, search(applyMove(state, m), depth - 1, alpha, beta, root)); alpha = Math.max(alpha, best); if (alpha >= beta) break; } return best; }
  let best = Infinity; for (const m of moves) { best = Math.min(best, search(applyMove(state, m), depth - 1, alpha, beta, root)); beta = Math.min(beta, best); if (alpha >= beta) break; } return best;
}

// Optional seeded generator breaks equal-score ties without perturbing minimax ordering.
export function bestMove(state, level = 2, rng = null) {
  const moves = legalMoves(state);
  if (moves.length === 0) return null;
  if (moves.length === 1) return rng ? rng.pick(moves) : moves[0];
  const depth = [0, 2, 4, 6][level] || 4;
  const root = state.turn;
  let bestMoves = [], bestScore = -Infinity;
  for (const m of moves) {
    const sc = search(applyMove(state, m), depth - 1, -Infinity, Infinity, root);
    if (sc > bestScore) { bestScore = sc; bestMoves = [m]; }
    else if (sc === bestScore) bestMoves.push(m);
  }
  return rng ? rng.pick(bestMoves) : bestMoves[0];
}

// ---------------------------------------------------------------- world data
export function validateWorld(w) {
  const need = (c, m) => { if (!c) throw new Error(`world ${w && w.id}: ${m}`); };
  need(w && w.id && w.title, 'id + title');
  need(w.kannada && w.kannada.length, 'kannada name');
  const hex = /^#[0-9a-fA-F]{6}$/;
  for (const k of ['bg', 'board', 'pit', 'seed', 'accent', 'text']) need(hex.test((w.theme || {})[k] || ''), `theme.${k} hex`);
  need(w.sides && w.sides.p0 && w.sides.p1, 'sides.p0/p1');
  need(typeof w.intent === 'string' && w.intent.length > 12, 'intent line');
  for (const k of ['capture', 'win', 'lose']) {
    const bank = (w.teachings || {})[k];
    need(Array.isArray(bank) && bank.length > 0, `teachings.${k} bank`);
    for (const t of bank) need(t && t.text && t.text.length > 8, `teachings.${k} substantial`);
  }
  return true;
}
