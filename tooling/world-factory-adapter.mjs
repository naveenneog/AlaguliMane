import path from 'node:path';
import { PITS, SEEDS_PER_PIT } from '../web/js/logic.js';
import { RULESET } from '../web/js/engine-adapter.js';

const exact = (value, fields, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  for (const key of Object.keys(value)) if (!fields.includes(key)) throw new TypeError(`${label} has unknown field ${key}`);
  for (const key of fields) if (!Object.hasOwn(value, key)) throw new TypeError(`${label} is missing ${key}`);
};

export async function validateFactorySemantic({ root, game, worldId, compatibility, fixture }) {
  if (game !== 'am' || RULESET.id !== compatibility.ruleset.id || RULESET.version !== compatibility.ruleset.version) {
    throw new TypeError('AM renderer compatibility does not match the registered ruleset');
  }
  exact(fixture, ['schema', 'game', 'worldId', 'ruleset', 'board'], 'AM semantic fixture');
  exact(fixture.ruleset, ['id', 'version'], 'AM semantic ruleset');
  exact(fixture.board, ['kind', 'rows', 'pitsPerRow', 'pitCount', 'seedsPerPit'], 'AM semantic board');
  const actual = {
    kind: 'pit-board',
    rows: 2,
    pitsPerRow: PITS / 2,
    pitCount: PITS,
    seedsPerPit: SEEDS_PER_PIT,
  };
  if (fixture.schema !== 1 || fixture.game !== game || fixture.worldId !== worldId
    || fixture.ruleset.id !== RULESET.id || fixture.ruleset.version !== RULESET.version
    || JSON.stringify(fixture.board) !== JSON.stringify(actual)) {
    throw new TypeError('AM semantic fixture does not match the base engine ruleset');
  }
  return {
    ruleset: { ...RULESET },
    rendererContentIds: [
      `${game}.${worldId}.intent`,
      `${game}.${worldId}.side.p0`,
      `${game}.${worldId}.side.p1`,
    ],
    toolFiles: [
      { name: 'rules-engine', version: String(RULESET.version), path: path.join(root, 'AlaguliMane', 'web', 'js', 'logic.js') },
      { name: 'ruleset-adapter', version: String(RULESET.version), path: path.join(root, 'AlaguliMane', 'web', 'js', 'engine-adapter.js') },
    ],
  };
}
