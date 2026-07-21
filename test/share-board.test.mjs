import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../web/js/logic.js';
import { amBoardModel, drawShareBoard } from '../web/js/share-board.js';

function mockContext() {
  const operations = [];
  const ctx = {
    operations,
    save: () => operations.push('save'),
    restore: () => operations.push('restore'),
    fillRect: (...args) => operations.push(['fillRect', ...args]),
    beginPath: () => operations.push('beginPath'),
    stroke: () => operations.push('stroke'),
    arc: (...args) => operations.push(['arc', ...args]),
    fill: () => operations.push('fill'),
    fillText: (...args) => operations.push(['fillText', ...args]),
  };
  for (const property of ['fillStyle', 'strokeStyle', 'lineWidth', 'font', 'textAlign', 'textBaseline']) {
    Object.defineProperty(ctx, property, { set: (value) => operations.push([property, value]) });
  }
  return ctx;
}

test('AM share board model preserves fourteen pits and both public stores', () => {
  const model = amBoardModel(newGame());
  assert.equal(model.pits.length, 14);
  assert.equal(model.pits.every(({ seeds }) => seeds === 6), true);
  assert.deepEqual(model.stores, [0, 0]);
  assert.deepEqual(model.pits.slice(7).map(({ column }) => column), [6, 5, 4, 3, 2, 1, 0]);
});

test('AM share board drawing is deterministic and labels every pit plus store', () => {
  const state = newGame();
  const first = mockContext();
  const second = mockContext();
  const box = { state, x: 0, y: 0, width: 480, height: 320 };
  const world = { theme: { board: '#111111', pit: '#222222', p0color: '#333333', p1color: '#444444' } };
  drawShareBoard(first, box, { world });
  drawShareBoard(second, box, { world });
  assert.deepEqual(first.operations, second.operations);
  assert.equal(first.operations.filter((item) => Array.isArray(item) && item[0] === 'fillText').length, 16);
});
