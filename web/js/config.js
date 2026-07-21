// Lobby/session config for Alaguli Mane. Written to sessionStorage 'am.game'.
export const WORLDS = [
  { id: 'parampare', title: 'Parampare', kannada: 'ಪರಂಪರೆ', tag: 'Heritage — carved sheesham & seeds', era: 'realistic', accent: '#c89b4a', t: '#9a6a2a', g: '#e8ddc4', bg: '#160f06' },
  { id: 'malnad', title: 'Malnad Mane', kannada: 'ಆಳಗುಳಿ ಮನೆ', tag: 'The home board — glowing 3D', era: 'original', accent: '#e8c24a', t: '#e8a24a', g: '#f0e0c0', bg: '#160f06' },
  { id: 'ulita',  title: 'Ulita',       kannada: 'ಉಳಿತ',        tag: 'The savings board — a modern reading', era: 'modern', accent: '#4bd6c2', t: '#4bd6a0', g: '#ffd24a', bg: '#08130f' },
  { id: 'suggi',  title: 'Suggi',       kannada: 'ಸುಗ್ಗಿ',       tag: 'The harvest tale — a folk reading', era: 'fable', accent: '#ff6b9d', t: '#ff9e5a', g: '#ffd24a', bg: '#1a0f14' },
  { id: 'mysuru-angala', title: 'Mysūru Aṅgaḷa', kannada: 'ಮೈಸೂರು ಅಂಗಳ', tag: 'Mysuru courtyard — an interpretive World Factory pilot', era: 'realistic', accent: '#c9a45f', t: '#bd8c4f', g: '#ded2b8', bg: '#17110d' },
  { id: 'bidari-guli', title: 'Bidari Guli', kannada: 'ಬಿದರಿ ಗುಳಿ', tag: 'Bidri — blackened silver pits', era: 'realistic', accent: '#cbd3db', t: '#e8edf2', g: '#b98a4e', bg: '#08090b' },
];
export const worldById = (id) => WORLDS.find((w) => w.id === id) || WORLDS[0];
export function saveGame(c) { try { sessionStorage.setItem('am.game', JSON.stringify(c)); } catch { /* */ } }
export function loadGame() { try { return JSON.parse(sessionStorage.getItem('am.game') || '{}'); } catch { return {}; } }
