import assert from 'node:assert/strict';
import test from 'node:test';
import { applyWorldProjector } from '../web/js/world-format.js';
import { projectAmWorldV2 } from '../web/js/world-projection.js';

const manifest = {
  schema: 2,
  id: 'mysuru-angala',
  game: 'am',
  titleKey: 'am.mysuru-angala.title',
  kannadaTitleKey: 'am.mysuru-angala.title.kn',
  realistic: true,
  rulesetCompatibility: [{ id: 'am.base', version: 1 }],
  render: {
    boardTexture: 'assets/mysuru-angala/board.jpg',
    environment: null,
    poster: 'assets/mysuru-angala/poster.jpg',
    pieceStyle: 'seeds',
    cameraMood: 'courtyard-warm',
    bloom: 0.06,
    accessibilityPalette: 'mysuru-angala',
    palette: [
      { role: 'background', color: '#17110d' },
      { role: 'surface', color: '#241a14' },
      { role: 'board', color: '#4b2d1d' },
      { role: 'node', color: '#1d120d' },
      { role: 'piece-0', color: '#bd8c4f' },
      { role: 'piece-1', color: '#ded2b8' },
      { role: 'accent', color: '#c9a45f' },
      { role: 'text', color: '#f3e8d3' },
    ],
    materials: [{
      role: 'board',
      baseColor: '#4b2d1d',
      roughness: 0.8,
      metalness: 0,
      emissive: '#000000',
      emissiveIntensity: 0,
      environmentIntensity: 0.4,
    }],
    lighting: {
      ambient: { color: '#ead7bd', intensity: 0.6 },
      key: { color: '#ffd49b', intensity: 1.4 },
      rim: { color: '#b99c7d', intensity: 0.7 },
      hero: { color: '#ffe9c4', intensity: 1.4, angle: 0.8, penumbra: 0.7 },
    },
    limits: { desktopParticles: 48, mobileParticles: 12, maxPixelRatio: 2, maxShadowMap: 1024 },
  },
  audio: { music: null, ambience: null },
  content: {
    teachingIds: [
      'am.mysuru-angala.teaching.capture-1',
      'am.mysuru-angala.teaching.win-1',
      'am.mysuru-angala.teaching.lose-1',
    ],
    glossaryIds: [],
    provenanceId: 'am.mysuru-angala.provenance',
    aboutSummaryKey: 'am.mysuru-angala.about',
  },
  campaignIds: [],
  assetManifest: 'assets/mysuru-angala/assets.manifest.json',
  cinematicManifest: null,
};
const en = {
  'am.mysuru-angala.title': 'Mysuru Angala — Mysuru Courtyard',
  'am.mysuru-angala.about': 'An interpretive courtyard setting using synthetic inlay.',
  'am.mysuru-angala.intent': 'Count every seed and plan the next harvest.',
  'am.mysuru-angala.side.p0': 'Tamarind seeds',
  'am.mysuru-angala.side.p1': 'Cowrie seeds',
  'am.mysuru-angala.teaching.capture-1': 'Four seeds gather into the store.',
  'am.mysuru-angala.teaching.win-1': 'The fuller store carries the harvest.',
  'am.mysuru-angala.teaching.lose-1': 'Count one sowing chain further next time.',
};
const kn = { 'am.mysuru-angala.title.kn': 'ಮೈಸೂರು ಅಂಗಳ' };

test('AM projector maps generic world-v2 data to the pit-board renderer contract', () => {
  const world = applyWorldProjector(manifest, { en, kn }, projectAmWorldV2);
  assert.equal(world.game, 'am');
  assert.equal(world.theme.pit, '#1d120d');
  assert.equal(world.theme.seed, '#bd8c4f');
  assert.equal(world.sides.p1.name, 'Cowrie seeds');
  assert.equal(world.teachings.capture[0].contentId, 'am.mysuru-angala.teaching.capture-1');
  assert.deepEqual(world.rulesetCompatibility, [{ id: 'am.base', version: 1 }]);
});

test('AM projector rejects missing and cross-role teaching content', () => {
  assert.throws(
    () => applyWorldProjector(manifest, { en: { ...en, 'am.mysuru-angala.side.p1': undefined }, kn }, projectAmWorldV2),
    /invalid text|side\.p1/,
  );
  const bad = structuredClone(manifest);
  bad.content.teachingIds[0] = 'am.mysuru-angala.teaching.tiger-capture-1';
  assert.throws(() => applyWorldProjector(bad, { en, kn }, projectAmWorldV2), /no renderer role/);
});
