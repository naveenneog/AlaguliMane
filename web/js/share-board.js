// Alaguli Mane deterministic mini-board for share cards.

export function amBoardModel(state) {
  const pits = Array.isArray(state?.pits) ? state.pits.slice(0, 14) : new Array(14).fill(0);
  while (pits.length < 14) pits.push(0);
  const stores = Array.isArray(state?.stores) ? state.stores.slice(0, 2) : [0, 0];
  while (stores.length < 2) stores.push(0);
  return {
    pits: pits.map((seeds, pit) => ({
      pit,
      row: pit < 7 ? 0 : 1,
      column: pit < 7 ? pit : 13 - pit,
      seeds: Number.isSafeInteger(seeds) && seeds >= 0 ? seeds : 0,
    })),
    stores: stores.map((seeds) => Number.isSafeInteger(seeds) && seeds >= 0 ? seeds : 0),
  };
}

export function drawShareBoard(ctx, box, { world = {} } = {}) {
  const { state, x = 0, y = 0, width = 0, height = 0 } = box || {};
  const model = amBoardModel(state);
  const theme = world.theme || {};
  const boardWidth = Math.min(width, height * 1.8);
  const boardHeight = Math.min(height, boardWidth / 1.8);
  const ox = x + (width - boardWidth) / 2;
  const oy = y + (height - boardHeight) / 2;
  const storeWidth = boardWidth * 0.11;
  const pitArea = boardWidth - storeWidth * 2;
  const pitCell = pitArea / 7;
  const rowHeight = boardHeight / 2;

  ctx.save();
  ctx.fillStyle = theme.board || '#5a3418';
  ctx.fillRect(ox, oy, boardWidth, boardHeight);
  const drawCount = (value, cx, cy, radius, color) => {
    ctx.beginPath();
    ctx.fillStyle = theme.pit || '#2a1810';
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = theme.accent || '#c89b4a';
    ctx.lineWidth = Math.max(1, boardWidth * 0.004);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = `700 ${Math.max(12, Math.round(radius * 0.72))}px "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(value), cx, cy);
  };
  for (const pit of model.pits) {
    const cx = ox + storeWidth + (pit.column + 0.5) * pitCell;
    const cy = oy + (pit.row + 0.5) * rowHeight;
    const color = pit.row === 0 ? (theme.p0color || theme.seed || '#9a6a2a') : (theme.p1color || '#e8ddc4');
    drawCount(pit.seeds, cx, cy, Math.min(pitCell, rowHeight) * 0.34, color);
  }
  drawCount(model.stores[0], ox + storeWidth * 0.5, oy + boardHeight * 0.5, storeWidth * 0.35, theme.p0color || theme.seed || '#9a6a2a');
  drawCount(model.stores[1], ox + boardWidth - storeWidth * 0.5, oy + boardHeight * 0.5, storeWidth * 0.35, theme.p1color || '#e8ddc4');
  ctx.restore();
  return model;
}
