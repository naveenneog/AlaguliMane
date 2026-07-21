import { worldCatalogText, worldPaletteColor } from './world-format.js';

const TEACHING_ROLES = {
  capture: 'capture',
  win: 'win',
  lose: 'lose',
};

export function projectAmWorldV2({ manifest, catalogs: { en, kn } }) {
  const prefix = `${manifest.game}.${manifest.id}`;
  const banks = { capture: [], win: [], lose: [] };
  for (const contentId of manifest.content.teachingIds) {
    const role = Object.entries(TEACHING_ROLES).find(([slug]) =>
      contentId.startsWith(`${prefix}.teaching.${slug}-`))?.[1];
    if (!role) throw new TypeError(`AM projector: teaching id has no renderer role (${contentId})`);
    banks[role].push({ text: worldCatalogText(en, contentId), contentId });
  }
  for (const [role, items] of Object.entries(banks)) {
    if (!items.length) throw new TypeError(`AM projector: catalog missing ${role}`);
  }

  const render = manifest.render;
  const bg = worldPaletteColor(render, 'background', '#160f06');
  const seed0 = worldPaletteColor(render, 'piece-0', '#9a6a2a');
  const seed1 = worldPaletteColor(render, 'piece-1', '#e8ddc4');
  return {
    schema: 2,
    game: manifest.game,
    id: manifest.id,
    title: worldCatalogText(en, manifest.titleKey, 'title'),
    kannada: worldCatalogText(kn, manifest.kannadaTitleKey, 'Kannada title'),
    subtitle: worldCatalogText(en, manifest.content.aboutSummaryKey, 'about summary'),
    intent: worldCatalogText(en, `${prefix}.intent`, 'intent'),
    era: 'original',
    realistic: manifest.realistic,
    theme: {
      bg,
      board: worldPaletteColor(render, 'board', '#5a3418'),
      pit: worldPaletteColor(render, 'node', worldPaletteColor(render, 'surface', '#2a1810')),
      seed: seed0,
      accent: worldPaletteColor(render, 'accent', '#c89b4a'),
      text: worldPaletteColor(render, 'text', '#f4e7cf'),
      fog: bg,
      p0color: seed0,
      p1color: seed1,
    },
    sides: {
      p0: { name: worldCatalogText(en, `${prefix}.side.p0`, 'side.p0'), en: 'Player one seeds' },
      p1: { name: worldCatalogText(en, `${prefix}.side.p1`, 'side.p1'), en: 'Player two seeds' },
    },
    voice: { web: 'en-IN', azure: null },
    teachings: banks,
    render: JSON.parse(JSON.stringify(render)),
    audio: JSON.parse(JSON.stringify(manifest.audio)),
    content: JSON.parse(JSON.stringify(manifest.content)),
    rulesetCompatibility: JSON.parse(JSON.stringify(manifest.rulesetCompatibility)),
  };
}
