import test from 'node:test';
import assert from 'node:assert/strict';
import { PITS, SEEDS_PER_PIT, newGame, legalMoves, applyMove, bestMove, ownPits } from '../web/js/logic.js';

const TOTAL = PITS * SEEDS_PER_PIT;   // 84
const total = (s) => s.pits.reduce((a, b) => a + b, 0) + s.stores[0] + s.stores[1];

test('fresh board: 14 pits of 6 = 84 seeds, player 0 first', () => {
  const g = newGame();
  assert.equal(g.pits.length, 14);
  assert.ok(g.pits.every((x) => x === 6));
  assert.equal(total(g), TOTAL);
  assert.deepEqual(legalMoves(g), [0, 1, 2, 3, 4, 5, 6]);
});

test('seeds are conserved across every move', () => {
  let g = newGame();
  for (let i = 0; i < 200 && g.winner === null; i++) {
    const mv = bestMove(g, 1); if (mv === null) break;
    g = applyMove(g, mv);
    assert.equal(total(g), TOTAL, `84 seeds conserved after move ${i}`);
  }
});

test('a pit reaching four is captured by the sower', () => {
  const g = newGame(0);            // empty board
  g.pits[0] = 3; g.pits[1] = 1;    // sow from pit 0 (3 seeds) -> pits 1,2,3 each +1
  g.turn = 0;
  // pit1 becomes 2, pit2=1, pit3=1; then relay next pit (4) empty -> after (5) empty -> stop. No 4 yet.
  // Instead craft an exact-four: pit 0 has 1 seed, pit 1 has 3 -> sowing 1 seed into pit1 makes 4.
  const g2 = newGame(0); g2.pits[0] = 1; g2.pits[1] = 3; g2.turn = 0;
  const after = applyMove(g2, 0);
  assert.equal(after.stores[0], 4, 'the four was captured by player 0');
  assert.equal(after.pits[1], 0, 'the pit was emptied');
});

test('relay continues while the next pit has seeds', () => {
  const g = newGame(0);
  g.pits[0] = 1; g.pits[1] = 1; g.pits[2] = 1; g.turn = 0;
  const after = applyMove(g, 0);
  // sow pit0(1)->pit1 becomes2; next pit(2) has 1 -> relay picks it, sows pit3=1; next(4) empty; after(5) empty -> stop
  assert.ok(after.events.some((e) => e.type === 'pickup' && e.pit === 2), 'relayed through pit 2');
  assert.equal(total(after), 3);
});

test('a full auto-played game ends with all 84 seeds banked', () => {
  let g = newGame();
  let guard = 0;
  while (g.winner === null && guard++ < 500) g = applyMove(g, bestMove(g, 2));
  assert.notEqual(g.winner, null, 'game ended');
  assert.equal(g.stores[0] + g.stores[1], TOTAL, 'every seed is in a store');
  assert.ok(g.pits.every((x) => x === 0), 'board empty at end');
});
