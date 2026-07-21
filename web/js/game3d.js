// Alaguli Mane — real 3D renderer (Three.js + Unreal bloom). A 2x7 pit board with
// two stores, glowing seeds and a live count over every pit. Tap your pit to sow;
// the relay and captures are animated step by step (a counting game must SHOW its
// counting), and the world's teaching is read aloud on a capture and the win.
import * as THREE from '../vendor/three.module.js';
import { EffectComposer } from '../vendor/EffectComposer.js';
import { RenderPass } from '../vendor/RenderPass.js';
import { UnrealBloomPass } from '../vendor/UnrealBloomPass.js';
import { OutputPass } from '../vendor/OutputPass.js';
import { PITS, newGame, legalMoves, applyMove, bestMove, ownPits, ownerOf } from './logic.js';
import { makePit, makeStore, makeSeed, seedSlots } from './pieces3d.js';
import { applyEnvironment, addContactShadow, applyRealistic, loadTexture, addTableWorld } from './sky.js';
import { initTutorial } from './tutorial.js';
import { maybeAutoDemo } from './auto-demo.js';
import { createGrandEffects, playOpening } from './grand.js';
import { initSettings, applySettings } from './settings.js';
import { initSave } from './save.js';
import { createCoachOverlay } from './coach3d.js';
import { initLearn } from './learn.js';
import { initPuzzleUI } from './puzzle-ui.js';
import { makeAmPuzzleIface } from './puzzle-iface.js';
import { initProfile } from './profile.js';
import { initProfileUI } from './profile-ui.js';
import { validateAchievementRegistry, evaluateAchievements, newUnlocks, recordUnlocks } from './achievements.js';
import { createAmAchievementEvaluators } from './achievement-insights.js';
import { initReplayUI } from './replay-ui.js';
import { describeAmTransition } from './replay-insights.js';
import { renderShareCard, shareCard } from './share-card.js';
import { drawShareBoard } from './share-board.js';
import { buildSpectateLog, initSpectate } from './spectate.js';
import { initSpectateUI } from './spectate-ui.js';
import { createAmSpectateDriver } from './spectate-driver.js';
import { encode as encodeChallenge } from './challenge-link.js';
import { openLanguagePackDb, initLanguagePacks } from './language-pack.js';
import { initLanguageStoreUI } from './language-store-ui.js';
import { setLang as i18nSetLang, savedLang, loadWorldI18n, loadUII18n, localizeUI, setCatalogSource as i18nSetCatalogSource, t as tr } from './i18n.js';
import { createRngSuite } from './rng.js';
import { checkpoint, createLog, derive, setResult } from './action-log.js';
import {
  createEngineAdapter, ENGINE, RULESET, toAction, validateReplayAction, validateReplaySide,
} from './engine-adapter.js';
import * as audio from './audio.js';
import { loadWorld } from './world-loader.js';
import { projectAmWorldV2 } from './world-projection.js';

const $ = (s) => document.querySelector(s);
const hexInt = (h) => parseInt(String(h || '#000').replace('#', ''), 16) || 0;
const hexBlend = (a, b, t) => { a = hexInt(a); b = hexInt(b); const ch = (s) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t); return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ACH_ICON_GLYPH = {
  'board-knot': '🪢', 'victory-leaf': '🍃', 'puzzle-knot': '🧩', 'daily-lamp': '🪔', 'streak-thread': '🧵',
  'trap-ring': '🎯', 'tiger-paw': '🐯', 'goat-shield': '🐐', 'seed-hand': '🌱', 'relay-loop': '🔁',
  'harvest-bowl': '🥣', 'balance-scale': '⚖️', 'cowrie-shell': '🐚', 'home-gate': '🏠', 'safe-cell': '🛡️',
  'mill-wheel': '🎡', 'flying-stone': '🪨', 'capture-ring': '💍',
};
const freshSeed = () => {
  const words = new Uint32Array(2);
  globalThis.crypto.getRandomValues(words);
  return `0x${words[0].toString(16).padStart(8, '0')}${words[1].toString(16).padStart(8, '0')}`;
};
const SP = 1.15, CAP = 16;

async function main() {
  const params = new URLSearchParams(location.search);
  let cfg = {}; try { cfg = JSON.parse(sessionStorage.getItem('am.game') || '{}'); } catch { cfg = {}; }
  let rng = createRngSuite({ seed: params.get('seed') || cfg.seed || freshSeed() });
  cfg.seed = rng.seed;
  try { sessionStorage.setItem('am.game', JSON.stringify(cfg)); } catch { /* session persistence is optional */ }
  const aiRng = (player) => rng.stream(`ai:${player}`);
  const rand = (values) => rng.stream('audio').pick(values);
  const engine = createEngineAdapter();
  const requestedWorld = params.get('world') || cfg.world || 'parampare';
  const worldId = /^[a-z][a-z0-9-]{0,63}$/i.test(requestedWorld) ? requestedWorld.toLowerCase() : 'parampare';
  const world = await loadWorld(worldId, { game: 'am', projector: projectAmWorldV2 });
  if (world.schema === 2 && !world.rulesetCompatibility.some(ref =>
    ref.id === RULESET.id && ref.version === RULESET.version)) {
    throw new RangeError(`World ${worldId} is incompatible with ruleset ${RULESET.id}@${RULESET.version}`);
  }
  const uiLang = savedLang('am');
  i18nSetLang(uiLang);
  audio.setLang(uiLang);
  document.documentElement.lang = uiLang;
  await loadWorldI18n(worldId);
  await loadUII18n('am');
  localizeUI();
  const T = world.theme || {};
  const REALISTIC = !!world.realistic;
  const mode = params.get('mode') || cfg.mode || 'ai';
  const level = Math.max(1, Math.min(3, +(params.get('level') || cfg.level || 2)));
  document.body.classList.add('cinematic-opening');
  document.title = `${world.title} — Alaguli Mane`;
  $('#title').textContent = world.title; $('#kn').textContent = world.kannada || '';
  const pname = (p) => (p === 0 ? world.sides.p0.name : world.sides.p1.name);
  const controls = (p) => mode === 'hotseat' || p === 0;

  let state = engine.newState(); let busy = true, fast = false, settingsApi = null, save = null, learn = null, replayUI = null, puzzleUI = null;
  let learning = false, replaying = false, puzzling = false, lessonMove = null;
  let puzzleMoveCount = 0, lastPuzzleShare = null, lastResultShare = null, spectate = null, spectateUI = null;
  let languagePacks = null, languageStoreUI = null, languagePacksReady = Promise.resolve(null);
  const storeSeed = () => {
    cfg.seed = rng.seed;
    try { sessionStorage.setItem('am.game', JSON.stringify(cfg)); } catch { /* session persistence is optional */ }
  };
  const freshLog = () => createLog({
    game: 'am',
    engine: ENGINE,
    ruleset: RULESET,
    world: worldId,
    rng,
  });
  const rngUse = (stream, before) => {
    const draws = stream.draws - before;
    return draws > 0 ? [{ stream: stream.name, draws }] : undefined;
  };
  const recordAction = (side, move, rngUses) => {
    if (learning || replaying || puzzling || !save) return;
    const stateHash = engine.hash(state);
    save.record({ side, action: toAction(move), rngUses, stateHash });
    if (save.log.actions.length % 16 === 0) {
      checkpoint(save.log, {
        afterAction: save.log.actions.length,
        state: JSON.parse(JSON.stringify(state)),
        rngState: rng.snapshot({ canonicalOnly: true }),
        stateHash,
      });
      save.persist();
    }
    if (state.winner !== null) {
      setResult(save.log, { winner: state.winner, afterAction: save.log.actions.length });
      save.persist();
    }
  };

  const MOBILE = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 760;
  const renderer = new THREE.WebGLRenderer({ antialias: !MOBILE, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, MOBILE ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = !MOBILE; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.06;
  $('#stage').appendChild(renderer.domElement);
  const gl = renderer.getContext(); const gpuInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const softwareRenderer = gpuInfo && /swiftshader/i.test(gl.getParameter(gpuInfo.UNMASKED_RENDERER_WEBGL));
  const scene = new THREE.Scene();
  applyEnvironment(renderer, scene, { top: hexBlend(T.bg, T.accent, REALISTIC ? 0.10 : 0.20), mid: hexBlend(T.bg, T.board, REALISTIC ? 0.35 : 0.55), bottom: T.bg });
  if (REALISTIC && !softwareRenderer) applyRealistic(renderer, scene, 'assets/realistic/env.jpg');
  scene.fog = new THREE.Fog(hexInt(T.fog || T.bg), 22, 60);
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
  scene.add(new THREE.HemisphereLight(hexInt(T.accent), hexInt(T.board), 0.8));
  const key = new THREE.DirectionalLight(0xffd7a3, REALISTIC ? 1.18 : 1.08); key.position.set(3, 12, 5);
  if (!MOBILE) { key.castShadow = true; key.shadow.mapSize.set(2048, 2048); const d = 8; Object.assign(key.shadow.camera, { left: -d, right: d, top: d, bottom: -d, near: 1, far: 34 }); key.shadow.bias = -0.0002; key.shadow.normalBias = 0.03; }
  scene.add(key); scene.add(new THREE.AmbientLight(0xffffff, 0.18));
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), REALISTIC ? 0.08 : (MOBILE ? 0.48 : 0.6), 0.9, REALISTIC ? 0.6 : 0.26);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ---- board ----
  const pitPos = (i) => (i <= 6 ? new THREE.Vector3((i - 3) * SP, 0, 1.05 * SP) : new THREE.Vector3((3 - (i - 7)) * SP, 0, -1.05 * SP));
  const storePos = (p) => new THREE.Vector3((p === 0 ? 4.4 : -4.4) * SP, 0, 0);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(10.6 * SP, 0.4, 3.2 * SP), REALISTIC
    ? new THREE.MeshStandardMaterial({ map: loadTexture(`assets/${worldId}/board.jpg`, [1, 1]), roughness: 0.55, metalness: 0.08, envMapIntensity: 1.15 })
    : new THREE.MeshStandardMaterial({ color: hexInt(T.board), roughness: 0.6, metalness: 0.28, envMapIntensity: 0.5 }));
  slab.position.y = -0.22; slab.receiveShadow = true; scene.add(slab);
  addContactShadow(scene, 6.2 * SP, -0.04, 0.42);
  if (REALISTIC) addTableWorld(scene, { radius: 9 * SP, tableY: -0.44, woodUrl: `assets/${worldId}/board.jpg`, tableUrl: `assets/${worldId}/table.jpg`, tableRepeat: [5, 5], floorHex: hexInt(T.bg) });
  const rimMat = new THREE.MeshStandardMaterial(REALISTIC ? { color: hexInt(T.accent), emissive: 0x000000, roughness: 0.4, metalness: 0.85, envMapIntensity: 1.2 } : { color: hexInt(T.accent), emissive: hexInt(T.accent), emissiveIntensity: 0.35, roughness: 0.35, metalness: 0.5, envMapIntensity: 0.9 });
  const wellMat = new THREE.MeshStandardMaterial(REALISTIC ? { color: hexInt(T.pit), roughness: 0.75, metalness: 0.05, envMapIntensity: 0.5 } : { color: hexInt(T.pit), roughness: 0.7, metalness: 0.15, envMapIntensity: 0.4 });
  const pitGroups = [], pitFlash = [];
  for (let i = 0; i < PITS; i++) { const g = makePit(rimMat, wellMat); g.position.copy(pitPos(i)); g.userData.pit = i; scene.add(g); pitGroups.push(g); }
  for (const p of [0, 1]) { const g = makeStore(rimMat, wellMat); g.position.copy(storePos(p)); scene.add(g); }

  const seedMat = new THREE.MeshStandardMaterial(REALISTIC ? { color: hexInt(T.seed), emissive: 0x000000, roughness: 0.45, metalness: 0.1, envMapIntensity: 0.9 } : { color: hexInt(T.seed), emissive: hexInt(T.seed), emissiveIntensity: 0.4, roughness: 0.35, metalness: 0.35, envMapIntensity: 0.6 });
  // per-pit seed pool
  const pitSeeds = pitGroups.map((g, i) => { const arr = []; for (let k = 0; k < CAP; k++) { const s = makeSeed(seedMat); s.visible = false; s.position.copy(pitPos(i)); scene.add(s); arr.push(s); } return arr; });
  const storeSeeds = [0, 1].map((p) => { const arr = []; for (let k = 0; k < 28; k++) { const s = makeSeed(seedMat); s.visible = false; scene.add(s); arr.push(s); } return arr; });

  // count labels (canvas sprites)
  function makeLabel() {
    const c = document.createElement('canvas'); c.width = 96; c.height = 64; const tex = new THREE.CanvasTexture(c);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })); spr.scale.set(0.9, 0.6, 1); scene.add(spr);
    return { c, tex, spr };
  }
  function setLabel(lbl, n, color) {
    const g = lbl.c.getContext('2d'); g.clearRect(0, 0, 96, 64);
    g.font = 'bold 48px Segoe UI, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillText(String(n), 49, 35); g.fillStyle = color; g.fillText(String(n), 48, 33);
    lbl.tex.needsUpdate = true;
  }
  const pitLabels = pitGroups.map((g, i) => { const l = makeLabel(); l.spr.position.copy(pitPos(i)).add(new THREE.Vector3(0, 0.55, 0)); return l; });
  const storeLabels = [0, 1].map((p) => { const l = makeLabel(); l.spr.position.copy(storePos(p)).add(new THREE.Vector3(0, 0.7, 0)); l.spr.scale.set(1.2, 0.8, 1); return l; });

  function relayoutPit(i, count) {
    const slots = seedSlots(Math.min(count, CAP)); const base = pitPos(i);
    pitSeeds[i].forEach((s, k) => { if (k < count && k < CAP) { s.visible = true; s.position.set(base.x + slots[k][0], 0.02 + (k % 3) * 0.03, base.z + slots[k][1]); } else s.visible = false; });
    setLabel(pitLabels[i], count, i <= 6 ? T.p0color || '#ffe' : T.p1color || '#ffe');
  }
  function relayoutStore(p, count) {
    const slots = seedSlots(Math.min(count, 28), 0.44); const base = storePos(p);
    storeSeeds[p].forEach((s, k) => { if (k < count && k < 28) { s.visible = true; s.position.set(base.x + slots[k][0], 0.02 + (k % 4) * 0.03, base.z + slots[k][1]); } else s.visible = false; });
    setLabel(storeLabels[p], count, '#ffd98a');
  }
  function fullRelayout() { for (let i = 0; i < PITS; i++) relayoutPit(i, state.pits[i]); relayoutStore(0, state.stores[0]); relayoutStore(1, state.stores[1]); }
  fullRelayout();

  // selectable rings on the mover's pits
  const glow = [];
  function highlight() { clearGlow(); if (!controls(state.turn) || busy || state.winner !== null) return; for (const i of legalMoves(state)) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.05, 10, 28), new THREE.MeshStandardMaterial({ color: hexInt(T.accent), emissive: hexInt(T.accent), emissiveIntensity: 1.4 })); r.rotation.x = Math.PI / 2; r.position.copy(pitPos(i)).add(new THREE.Vector3(0, 0.06, 0)); r.userData.pit = i; scene.add(r); glow.push(r); } }
  function clearGlow() { for (const r of glow) scene.remove(r); glow.length = 0; }

  // ---- camera + controls ----
  const radius = 5.4 * SP;
  let az = 0, pol = MOBILE ? 0.38 : 0.5, dist = radius / Math.tan((camera.fov * Math.PI / 180) / 2) * (MOBILE ? 1.15 : 0.98);
  const tv = new THREE.Vector3(0, 0, 0);
  function place() { pol = Math.max(0.12, Math.min(1.2, pol)); dist = Math.max(radius * 0.7, Math.min(radius * 3, dist)); camera.position.set(dist * Math.sin(pol) * Math.sin(az), dist * Math.cos(pol), tv.z + dist * Math.sin(pol) * Math.cos(az)); camera.lookAt(tv); }
  place();
  const grand = createGrandEffects({ scene, boardRadius: radius, accent: hexInt(T.accent), realistic: REALISTIC, mobile: MOBILE });
  const coach = createCoachOverlay({ scene });
  const canvas = renderer.domElement; const ptrs = new Map(); let dragged = false, pinchD = 0;
  canvas.addEventListener('pointerdown', (e) => { ptrs.set(e.pointerId, e); dragged = false; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (!ptrs.has(e.pointerId)) return; const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, e);
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); if (pinchD) { dist *= pinchD / d; place(); } pinchD = d; dragged = true; }
    else if (ptrs.size === 1 && (e.buttons || e.pressure)) { const dx = e.clientX - prev.clientX, dy = e.clientY - prev.clientY; if (Math.abs(dx) + Math.abs(dy) > 2) dragged = true; az -= dx * 0.006; pol -= dy * 0.006; place(); } });
  canvas.addEventListener('pointerup', (e) => { const tracked = ptrs.has(e.pointerId); ptrs.delete(e.pointerId); if (ptrs.size < 2) pinchD = 0; if (tracked && !dragged) onTap(e); });
  canvas.addEventListener('pointercancel', (e) => ptrs.delete(e.pointerId));
  canvas.addEventListener('wheel', (e) => { dist *= 1 + Math.sign(e.deltaY) * 0.08; place(); }, { passive: true });
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); place(); });

  const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
  function onTap(e) {
    if (replaying || busy || state.winner !== null || (!learning && !puzzling && !controls(state.turn))) return;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects([...pitGroups, ...glow], true); if (!hits.length) return;
    let o = hits[0].object; while (o && o.userData.pit === undefined && o.parent) o = o.parent;
    if (!o || o.userData.pit === undefined) return;
    const pit = o.userData.pit; clearHint(); audio.unlock(worldId);
    if (legalMoves(state).includes(pit) && lessonAllows(pit)) doMove(pit);
  }
  const lessonAllows = (pit) => !learning || pit === lessonMove;

  // ---- move + animate cascade ----
  async function doMove(start, rngUses) {
    if (replaying || busy || !lessonAllows(start)) return; busy = true; clearGlow(); clearHint(); updateUndo();
    const before = state; const side = before.turn; state = engine.applyLive(before, toAction(start));
    recordAction(side, start, rngUses);
    await animateTurn(before, state.events);
    fullRelayout();
    if (puzzling) {
      puzzleMoveCount++;
      const solved = puzzleUI?.report(state);
      if (!solved) puzzleUI?.fail();
      busy = true;
      return;
    }
    const captured = state.stores[before.turn] - before.stores[before.turn];
    if (!learning && captured > 0 && state.winner === null) await reveal('capture', rand(world.teachings.capture));
    learn?.notifyMove(start);
    if (state.winner !== null) { if (!learning) await onWin(); busy = false; updateUndo(); return; }
    busy = false; updateUndo();
    if (!learning) loop();
  }
  async function animateTurn(before, events) {
    const dP = before.pits.slice(), dS = before.stores.slice();
    const delay = fast ? 0 : 52;
    let sinceSound = 0;
    for (const e of events) {
      if (e.type === 'pickup') { dP[e.pit] = 0; relayoutPit(e.pit, 0); audio.sfx('step'); }
      else if (e.type === 'sow') { dP[e.pit] += 1; relayoutPit(e.pit, dP[e.pit]); if (++sinceSound % 4 === 0) audio.sfx('place'); }
      else if (e.type === 'capture4' || e.type === 'captureEnd') { dS[e.by] += (e.count || 4); dP[e.pit] = 0; relayoutPit(e.pit, 0); relayoutStore(e.by, dS[e.by]); flashPit(e.pit); grand.burst(pitPos(e.pit)); settingsApi?.haptic('capture'); audio.sfx('capture'); }
      else if (e.type === 'sweep') { dS[e.by] += e.count; dP[e.pit] = 0; relayoutPit(e.pit, 0); relayoutStore(e.by, dS[e.by]); }
      if (delay) await wait(delay);
    }
  }
  function flashPit(i) { const g = pitGroups[i]; const rim = g.children[0]; const old = rim.material; const flash = new THREE.MeshStandardMaterial({ color: 0xffd24a, emissive: 0xffd24a, emissiveIntensity: 1.8 }); rim.material = flash; setTimeout(() => { rim.material = old; }, fast ? 0 : 320); }

  // ---- hint engine ----
  let hintTimer = null;
  function clearHint() { coach.clear(); const h = $('#hint'); if (h) h.classList.remove('show'); if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; } }
  function previewSow(start, next) {
    coach.destination(pitPos(start), { radius: 0.52 });
    const routeEvents = next.events.filter((event) => event.type === 'pickup' || event.type === 'sow').slice(0, PITS + 6);
    coach.path([pitPos(start), ...routeEvents.map((event) => pitPos(event.pit))], { y: 0.21 });

    const drops = new Map();
    for (const event of next.events) if (event.type === 'sow') drops.set(event.pit, (drops.get(event.pit) || 0) + 1);
    const ghostSeeds = [];
    for (const [pit, count] of drops) {
      const base = pitPos(pit);
      const slots = seedSlots(Math.min(count, 4), 0.28);
      slots.forEach(([x, z], i) => ghostSeeds.push(new THREE.Vector3(base.x + x, 0.18 + i * 0.012, base.z + z)));
    }
    coach.ghosts(ghostSeeds, { role: 'path', radius: 0.075, max: 48 });

    const captures = next.events.filter((event) => event.type === 'capture4' || event.type === 'captureEnd');
    for (const event of captures) {
      const base = pitPos(event.pit);
      coach.danger(base, { radius: 0.48 });
      const count = event.type === 'capture4' ? 4 : Math.min(event.count || 4, 4);
      const redSeeds = seedSlots(count, 0.3).map(([x, z], i) => new THREE.Vector3(base.x + x, 0.23 + i * 0.012, base.z + z));
      coach.ghosts(redSeeds, { role: 'danger', radius: 0.085, max: 4 });
    }
    if (next.stores[state.turn] > state.stores[state.turn]) coach.destination(storePos(state.turn), { radius: 0.68, y: 0.18 });
  }
  function showHint() {
    if (learning || replaying || puzzling || busy || state.winner !== null || !controls(state.turn)) return;
    const mv = bestMove(state, Math.max(2, level)); if (mv === null) return; clearHint();
    const ns = applyMove(state, mv); const gained = ns.stores[state.turn] - state.stores[state.turn];
    const txt = gained === 1
      ? tr('Sow the glowing pit — this move gathers one seed for you.')
      : gained > 1
        ? tr('Sow the glowing pit — this move gathers %s seeds for you.').replace('%s', gained)
        : tr('Sow the glowing pit — it keeps seeds on your side and sets up future fours.');
    previewSow(mv, ns);
    const h = $('#hint'); if (h) { h.textContent = '💡 ' + txt; h.classList.add('show'); } hintTimer = setTimeout(clearHint, 5200);
  }

  // ---- turn loop ----
  function loop() {
    if (learning || replaying || puzzling || state.winner !== null) return;
    updateHud();
    if (controls(state.turn)) {
      highlight();
      $('#status').textContent = tr('%s: tap one of your pits to sow').replace('%s', pname(state.turn));
      updateUndo();
    } else aiTurn();
  }
  async function aiTurn() {
    if (learning || replaying || puzzling) return;
    busy = true; updateUndo(); $('#thinking').classList.add('show'); await wait(300);
    if (learning || replaying || puzzling) { busy = false; $('#thinking').classList.remove('show'); updateUndo(); return; }
    const stream = aiRng(state.turn); const beforeDraws = stream.draws;
    const mv = bestMove(state, level, stream); const rngUses = rngUse(stream, beforeDraws);
    $('#thinking').classList.remove('show');
    if (mv === null) { busy = false; updateUndo(); return; }
    busy = false;
    await doMove(mv, rngUses);
  }

  // ---- reveal + win + hud ----
  const card = $('#card');
  async function reveal(kind, t) { if (!t) return; card.querySelector('.kind').textContent = tr('Captured'); card.querySelector('.kind').className = 'kind capture'; card.querySelector('.en').textContent = t.en || ''; card.querySelector('.m').textContent = tr(t.text); card.classList.add('show'); audio.narrate(t.text, world); await wait(fast ? 0 : 1700); card.classList.remove('show'); await wait(fast ? 0 : 200); }
  async function onWin() {
    updateUndo();
    const w = state.winner; const won = w === 'draw' ? null : (mode === 'hotseat' || w === 0);
    lastResultShare = {
      outcome: w === 'draw' ? 'draw' : (w === 0 ? 'win' : 'loss'),
      moves: save?.log?.actions?.length ?? 0,
      score: state.stores[0],
      opponentScore: state.stores[1],
      state: publicShareState(state),
    };
    if (w === 0) profile.bump('games.won');
    audio.sfx(won === false ? 'lose' : 'win');
    const t = w === 'draw' ? { text: 'The seeds are shared exactly — a rare, perfectly even harvest. A draw.' } : rand(won ? world.teachings.win : world.teachings.lose);
    const ov = $('#win'); ov.querySelector('#winTitle').textContent = w === 'draw'
      ? tr('A draw') : tr('%s gathers the most').replace('%s', pname(w));
    ov.querySelector('#winText').textContent = tr(t.text); ov.classList.add('show'); resultShareButton.hidden = false; grand.victoryShower(); settingsApi?.haptic('win'); audio.narrate(t.text, world);
    awardAchievements('live', { log: save.log, finalState: state });
  }
  function updateHud() {
    $('#store0').textContent = state.stores[0]; $('#store1').textContent = state.stores[1];
    $('#turnLabel').textContent = pname(state.turn); $('#turnDot').style.background = state.turn === 0 ? (T.p0color || T.accent) : (T.p1color || T.seed);
  }

  function applyStateVisual(saved) {
    busy = true; fast = false; clearGlow(); clearHint(); updateUndo();
    state = saved;
    fullRelayout();
    card.classList.remove('show');
    $('#win').classList.remove('show');
    $('#thinking').classList.remove('show');
    busy = false;
    updateHud();
    updateUndo();
  }

  function restoreState(saved) {
    applyStateVisual(saved);
    if (!learning && !replaying) loop();
  }

  function updateUndo() {
    const button = $('#undoBtn');
    if (button) button.disabled = !(save && !learning && !replaying && !puzzling && !busy && state.winner === null && controls(state.turn) && save.canUndo());
    const learnButton = $('#tbg-learn-btn');
    if (learnButton) learnButton.disabled = replaying || puzzling || (busy && !learning);
    const puzzleButton = $('#pz-open');
    if (puzzleButton) puzzleButton.disabled = busy || learning || replaying || puzzling;
    const replayButton = $('#rp-open');
    if (replayButton) replayButton.disabled = busy || learning || replaying || puzzling;
  }

  function doUndo() {
    if (learning || replaying || puzzling || busy || state.winner !== null || !controls(state.turn) || !save?.canUndo()) return;
    audio.sfx('step');
    const restored = save.undo();
    if (restored) {
      const replayed = derive(save.log, engine);
      rng = replayed.rng;
      storeSeed();
      applyStateVisual(replayed.state);
      loop();
    }
    updateUndo();
  }
  updateHud();

  (function frame() { const t = performance.now(); for (const r of glow) r.position.y = 0.08 + Math.sin(t * 0.005 + r.position.x) * 0.03; coach.update(); grand.update(); composer.render(); requestAnimationFrame(frame); })();
  function publicShareState(source = state) {
    return {
      pits: Array.isArray(source?.pits) ? source.pits.slice(0, PITS) : [],
      stores: Array.isArray(source?.stores) ? source.stores.slice(0, 2) : [0, 0],
      turn: source?.turn ?? 0,
      winner: source?.winner ?? null,
    };
  }
  function formatShareText(key, params = {}) {
    let text = tr(key);
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
    return text;
  }
  async function shareGameCard({ kind, titleKey, bodyKey, params: cardParams, cardState, url, downloadName }, button) {
    const old = button?.textContent;
    if (button) { button.disabled = true; button.textContent = tr('Sharing…'); }
    try {
      const rendered = await renderShareCard({
        kind,
        game: 'am',
        world: worldId,
        locale: uiLang,
        titleKey,
        bodyKey,
        params: cardParams,
        state: cardState,
        drawBoard: (ctx, box) => drawShareBoard(ctx, box, { world }),
        translate: tr,
      });
      const result = await shareCard({
        file: rendered.file,
        title: formatShareText(titleKey, cardParams),
        text: formatShareText(bodyKey, cardParams),
        url,
        downloadName,
      });
      if (button && result.method !== 'cancel') {
        button.textContent = result.method === 'file-share' || result.method === 'url-share' ? tr('Shared')
          : result.method === 'clipboard' ? tr('Link copied') : tr('Saved image');
      }
      return result;
    } catch {
      if (button) button.textContent = tr('Share unavailable');
      return { method: 'unavailable' };
    } finally {
      if (button) setTimeout(() => { button.disabled = false; button.textContent = old || tr('Share'); }, 1800);
    }
  }
  function shareAchievement(achievement, button) {
    return shareGameCard({
      kind: 'achievement',
      titleKey: achievement.titleKey,
      bodyKey: achievement.descKey,
      params: { achievementId: achievement.id, tier: achievement.tier },
      cardState: publicShareState(),
      downloadName: `alaguli-mane-${achievement.id}.png`,
    }, button);
  }
  async function sharePuzzleResult(payload, button) {
    let url;
    try {
      const hash = await encodeChallenge({ game: 'am', puzzleId: payload.spec.id });
      url = `${location.origin}${location.pathname}${location.search}${hash}`;
    } catch { url = location.href; }
    return shareGameCard({
      kind: 'puzzle',
      titleKey: 'am.share.puzzle.title',
      bodyKey: 'am.share.puzzle.body',
      params: {
        puzzleId: payload.spec.id,
        difficulty: payload.spec.difficulty ?? 'easy',
        moves: payload.moves,
        par: payload.par,
        daily: payload.isDaily,
      },
      cardState: payload.state,
      url,
      downloadName: `alaguli-mane-puzzle-${payload.spec.id}.png`,
    }, button);
  }
  const restartMatch = () => {
    save?.clear();
    rng = createRngSuite({ seed: freshSeed() });
    storeSeed();
    location.reload();
  };
  $('#restart').addEventListener('click', restartMatch);
  addEventListener('pointerdown', () => audio.unlock(worldId), { once: true });
  $('#winAgain')?.addEventListener('click', restartMatch);
  const resultShareButton = document.createElement('button');
  resultShareButton.type = 'button';
  resultShareButton.textContent = tr('Share');
  resultShareButton.hidden = true;
  resultShareButton.style.cssText = 'margin-left:.5rem';
  $('#winAgain')?.insertAdjacentElement('afterend', resultShareButton);
  resultShareButton.addEventListener('click', () => {
    if (!lastResultShare) return;
    const payload = lastResultShare;
    shareGameCard({
      kind: 'result',
      titleKey: `am.share.result.${payload.outcome}.title`,
      bodyKey: `am.share.result.${payload.outcome}.body`,
      params: {
        outcome: payload.outcome,
        side: 0,
        moves: payload.moves,
        score: payload.score,
        opponentScore: payload.opponentScore,
      },
      cardState: payload.state,
      downloadName: `alaguli-mane-${payload.outcome}.png`,
    }, resultShareButton);
  });
  $('#hintBtn')?.addEventListener('click', showHint);
  $('#undoBtn')?.addEventListener('click', doUndo);
  let demoPending = false; try { demoPending = !localStorage.getItem('tbg.am.demo.v1'); } catch { /* */ }
  demoPending = demoPending && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  initTutorial({ key: 'am.tut.v1', title: 'How to play', accent: T.accent, autoOpen: !demoPending, steps: [
    { icon: '🌱', title: 'Alaguli Mane', text: 'A game of counting, not luck. Two rows of seven pits, six seeds each — gather more seeds than your rival.' },
    { icon: '👆', title: '1 · Sow', text: 'Tap one of your glowing pits. Its seeds are lifted and dropped one per pit, going counter-clockwise.' },
    { icon: '4️⃣', title: 'Capture on four', text: 'Whenever a pit reaches exactly four seeds, you collect all four into your store.' },
    { icon: '🔗', title: 'The relay', text: 'When your handful runs out, the next pit is scooped up and sowing continues — it stops when the next pit is empty.' },
    { icon: '🏆', title: 'Win', text: 'When a player has no seeds to sow, each banks their own row. Most seeds wins. Tap 💡 Hint for the best pit.' },
  ] });
  settingsApi = initSettings({
    id: 'am',
    accent: T.accent,
    onChange: (settings) => {
      applySettings(settings, { bloomPass: bloom, grand, audio });
      coach.setPreferences(settings);
    },
    onLanguageRequest: (lang) => languageStoreUI?.requestLanguage(lang),
  });
  save = initSave({
    id: 'am',
    adapter: engine,
    isMyTurn: (saved) => controls(saved.turn),
  });
  save.begin(freshLog());
  function restoreReplayLive() {
    replaying = false;
    const restored = derive(save.log, engine);
    state = restored.state;
    rng = restored.rng;
    storeSeed();
    applyStateVisual(state);
    if (state.winner !== null) {
      $('#win').classList.add('show');
      resultShareButton.hidden = !lastResultShare;
    } else loop();
    updateUndo();
  }
  replayUI = initReplayUI({
    id: 'am',
    adapter: engine,
    validation: {
      game: 'am',
      engine: ENGINE,
      ruleset: RULESET,
      validateAction: validateReplayAction,
      validateSide: validateReplaySide,
    },
    renderState: (next) => {
      replaying = true;
      applyStateVisual(next);
      updateUndo();
    },
    restoreLive: restoreReplayLive,
    describeTransition: describeAmTransition,
    narrate: (text) => audio.narrate(text, world),
    translate: tr,
    reducedMotion: settingsApi.get().reducedMotion
      || matchMedia('(prefers-reduced-motion: reduce)').matches,
    accent: T.accent,
  });
  $('#rp-open')?.addEventListener('click', () => {
    if (save?.log?.actions?.length) replayUI.load(save.log);
  });
  function lessonState(moves = []) {
    let next = newGame();
    for (const move of moves) {
      if (!legalMoves(next).includes(move)) throw new Error(`Invalid Alaguli Mane lesson move: ${move}`);
      next = applyMove(next, move);
    }
    return next;
  }
  const endCaptureReady = lessonState([3, 13]);
  const fourReady = lessonState([0, 11, 1]);
  const fourDone = lessonState([0, 11, 1, 10]);
  const ghostSeed = (pit) => pitPos(pit).add(new THREE.Vector3(0, 0.2, 0));
  const storeGhosts = (player) => {
    const base = storePos(player);
    return seedSlots(4, 0.3).map(([x, z], i) => new THREE.Vector3(base.x + x, 0.2 + i * 0.012, base.z + z));
  };
  const lessonSteps = [
    {
      en: 'Two rows · six seeds each',
      text: 'The board has two rows of seven pits, with six seeds in every pit. Counting is your strategy.',
      position: lessonState(),
      highlight: ({ coach: c }) => {
        lessonMove = null;
        c.destination(pitPos(0), { radius: 0.52 });
        c.ghosts([0, 1, 2, 3, 4, 5, 6].map(ghostSeed), { role: 'path', radius: 0.075, max: 7 });
      },
    },
    {
      en: 'Lift and sow',
      text: 'Lift every seed from one pit and sow one into each following pit.',
      position: lessonState(),
      expectedMove: (move) => move === 0,
      highlight: ({ coach: c }) => {
        lessonMove = 0;
        c.destination(pitPos(0), { radius: 0.52 });
        c.path([0, 1, 2, 3, 4, 5, 6].map(pitPos), { y: 0.21 });
        c.ghosts([1, 2, 3, 4, 5, 6].map(ghostSeed), { role: 'path', radius: 0.075, max: 6 });
      },
    },
    {
      en: 'Follow the relay',
      text: 'If the pit after your last seed is occupied, lift those seeds and continue—the sowing becomes a relay.',
      position: lessonState(),
      highlight: ({ coach: c }) => {
        lessonMove = null;
        c.destination(pitPos(0), { radius: 0.52 });
        c.path(Array.from({ length: PITS }, (_, pit) => pitPos(pit)), { y: 0.21 });
        c.ghosts([1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13].map(ghostSeed), { role: 'path', radius: 0.075, max: 12 });
      },
    },
    {
      en: 'Gather beyond the empty pit',
      text: 'Here one seed lands in pit one; pit two is empty, so the seeds beyond it in pit three are gathered.',
      position: endCaptureReady,
      expectedMove: (move) => move === 0,
      highlight: ({ coach: c }) => {
        lessonMove = 0;
        c.destination(pitPos(0), { radius: 0.52 });
        c.path([pitPos(0), pitPos(1), pitPos(2), pitPos(3)], { y: 0.21 });
        c.ghosts([ghostSeed(1)], { role: 'path', radius: 0.075, max: 1 });
        c.danger(pitPos(3), { radius: 0.48 });
        c.destination(storePos(0), { radius: 0.68, y: 0.18 });
      },
    },
    {
      en: 'Make the fourth seed',
      text: 'Pit eleven holds three. Sow the single seed from pit ten: the fourth seed completes the set.',
      position: fourReady,
      expectedMove: (move) => move === 10,
      highlight: ({ coach: c }) => {
        lessonMove = 10;
        c.destination(pitPos(10), { radius: 0.52 });
        c.path([pitPos(10), pitPos(11)], { y: 0.21 });
        c.ghosts([ghostSeed(11)], { role: 'path', radius: 0.075, max: 1 });
        c.danger(pitPos(11), { radius: 0.48 });
        c.destination(storePos(1), { radius: 0.68, y: 0.18 });
      },
    },
    {
      en: 'The gathering four',
      text: 'All four seeds leave the pit and enter your store. Plan each relay to create more gathering fours.',
      position: fourDone,
      highlight: ({ coach: c }) => {
        lessonMove = null;
        c.danger(pitPos(11), { radius: 0.48 });
        c.destination(storePos(1), { radius: 0.68, y: 0.18 });
        c.ghosts(storeGhosts(1), { role: 'gain', radius: 0.085, max: 4 });
      },
    },
  ];
  learn = initLearn({
    id: 'am',
    title: 'Count, Sow, Gather',
    accent: T.accent,
    steps: lessonSteps,
    hooks: {
      applyState: applyStateVisual,
      coach,
      clearCoach: () => coach.clear(),
      narrate: (text) => audio.narrate(text, world),
      setLearning: (active) => {
        learning = active;
        lessonMove = null;
        clearGlow();
        clearHint();
        $('#thinking').classList.remove('show');
        if (active) $('#status').textContent = tr('Guided lesson — follow the gold path');
        updateUndo();
      },
      freshGame: () => {
        save.clear();
        rng = createRngSuite({ seed: freshSeed() });
        storeSeed();
        save.begin(freshLog());
        applyStateVisual(engine.newState());
        loop();
      },
    },
  });
  const amIface = makeAmPuzzleIface();
  const profile = initProfile({ id: 'am' });
  initProfileUI({ id: 'am', accent: T.accent, profile });
  const OPTIONAL_LANGUAGES = ['hi', 'ta', 'te', 'ml', 'mr'];
  languagePacksReady = (async () => {
    try {
      // v1.8 α1 flip: core-config.json (emitted by tooling/build-core.mjs; dev ships all-languages/relative)
      // picks the packaging profile + optional remote pack origin. A staged `default-core` core is
      // authoritative and cannot be loosened via ?langprofile because its optional originals are absent.
      const coreConfig = await fetch('core-config.json').then((response) =>
        response.ok ? response.json() : null).catch(() => null);
      const configProfile = coreConfig?.profile === 'default-core' ? 'default-core' : 'all-languages';
      const packBaseUrl = coreConfig?.packBaseUrl || null;
      const [trustedIndex, schema] = await Promise.all([
        // Index + schema are local trust anchors. Only the pinned payloads use packBaseUrl.
        fetch('packs/am/language-index.json').then((response) => response.ok ? response.json() : null),
        fetch('schemas/v1.8/language-pack.schema.json').then((response) => response.ok ? response.json() : null),
      ]);
      if (!trustedIndex || typeof caches === 'undefined') return null;
      const db = await openLanguagePackDb();
      const profileName = configProfile === 'default-core'
        ? 'default-core'
        : (params.get('langprofile') || 'all-languages');
      const bundled = profileName === 'all-languages' ? OPTIONAL_LANGUAGES : [];
      languagePacks = initLanguagePacks({
        game: 'am',
        coreLanguages: ['kn', 'en'],
        trustedIndex,
        schema,
        fetchImpl: fetch,
        packBaseUrl,
        cacheStorage: caches,
        db,
        maxPackBytes: 8 * 1024 * 1024,
        compatibility: {
          languages: bundled,
          components: ['text'],
          loadText: async (language) => {
            const response = await fetch(`assets/ui/${language}.json`);
            return response.ok ? response.json() : {};
          },
        },
      });
      await languagePacks.repair();
      i18nSetCatalogSource((language, role, options) =>
        languagePacks.getCatalog(language, role, options));
      audio.setVoiceSource((language, text, scope) =>
        languagePacks.getVoiceFile(language, text, scope));
      if (OPTIONAL_LANGUAGES.includes(uiLang)) {
        try {
          const status = await languagePacks.status(uiLang, 'text');
          if (status.state === 'installed' || status.state === 'compatibility') {
            await languagePacks.activate(uiLang);
            await loadUII18n('am');
            await loadWorldI18n(worldId);
            localizeUI();
          }
        } catch { /* leave the English fallback */ }
      }
      try {
        languageStoreUI = initLanguageStoreUI({
          packs: languagePacks,
          translate: tr,
          accent: T.accent,
          getSelectedLanguage: () => uiLang,
          dataSaver: navigator.connection?.saveData === true,
          onActivated: async (language, snapshot, metadata) => {
            languageStoreUI?.refresh();
            if (metadata?.preservePreference === true) {
              i18nSetLang(language);
              audio.setLang(language);
              await loadWorldI18n(worldId);
              await loadUII18n('am');
              localizeUI();
            } else {
              settingsApi.setLanguage(language, { persist: true });
              location.reload();
            }
          },
        });
      } catch (error) {
        console.warn('language store UI unavailable:', error?.message || error);
      }
      return languagePacks;
    } catch (error) {
      console.warn('language packs unavailable:', error?.message || error);
      return null;
    }
  })();
  const achievementEvaluators = createAmAchievementEvaluators({ adapter: engine });
  let achievementRegistry = null;
  (async () => {
    try {
      const registry = await (await fetch('achievements/registry.json')).json();
      validateAchievementRegistry(registry);
      achievementRegistry = registry;
    } catch { achievementRegistry = null; }
  })();
  function showAchievementToast(list) {
    let host = document.getElementById('achToasts');
    if (!host) {
      host = document.createElement('div');
      host.id = 'achToasts';
      host.setAttribute('aria-live', 'polite');
      host.style.cssText = 'position:fixed;left:50%;bottom:calc(1rem + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:70;display:flex;flex-direction:column;gap:.5rem;pointer-events:none;width:min(92vw,420px)';
      document.body.appendChild(host);
    }
    for (const achievement of list) {
      const toast = document.createElement('div');
      toast.setAttribute('role', 'status');
      toast.style.cssText = `pointer-events:auto;display:flex;align-items:center;gap:.7rem;background:${T.accent || '#e8c24a'};color:#241200;border-radius:16px;padding:.7rem .9rem;box-shadow:0 10px 30px rgba(0,0,0,.35);cursor:pointer;transform:translateY(14px);opacity:0;transition:transform .3s ease,opacity .3s ease`;
      const icon = document.createElement('span'); icon.setAttribute('aria-hidden', 'true'); icon.style.cssText = 'font-size:1.6rem;line-height:1;flex:0 0 auto'; icon.textContent = ACH_ICON_GLYPH[achievement.icon] || '🏅';
      const col = document.createElement('span'); col.style.cssText = 'display:flex;flex-direction:column;min-width:0';
      const kicker = document.createElement('strong'); kicker.style.cssText = 'font-size:.78rem;letter-spacing:.04em;text-transform:uppercase;opacity:.75'; kicker.textContent = tr('Achievement unlocked');
      const title = document.createElement('span'); title.style.cssText = 'font-weight:700;font-size:1rem'; title.textContent = tr(achievement.titleKey);
      const desc = document.createElement('span'); desc.style.cssText = 'font-size:.86rem;opacity:.9'; desc.textContent = tr(achievement.descKey);
      const share = document.createElement('button'); share.type = 'button'; share.textContent = tr('Share'); share.style.cssText = 'margin-left:auto;flex:0 0 auto;border:1px solid currentColor;border-radius:999px;padding:.35rem .6rem;background:transparent;color:inherit;font:inherit;font-size:.8rem;cursor:pointer';
      share.addEventListener('click', (event) => { event.stopPropagation(); shareAchievement(achievement, share); });
      col.append(kicker, title, desc); toast.append(icon, col, share); host.appendChild(toast);
      requestAnimationFrame(() => { toast.style.transform = 'translateY(0)'; toast.style.opacity = '1'; });
      settingsApi?.haptic?.('win');
      const dismiss = () => { toast.style.opacity = '0'; toast.style.transform = 'translateY(14px)'; setTimeout(() => toast.remove(), 320); };
      toast.addEventListener('click', dismiss);
      setTimeout(dismiss, 5600);
    }
  }
  function awardAchievements(source, { log = null, finalState = null } = {}) {
    if (!achievementRegistry) return;
    try {
      const results = evaluateAchievements(achievementRegistry, {
        profile: profile.snapshot(), log, finalState,
        evaluators: achievementEvaluators, context: { source },
      });
      const unlocked = newUnlocks(results, profile.snapshot());
      if (!unlocked.length) return;
      recordUnlocks(profile, unlocked);
      showAchievementToast(unlocked);
    } catch { /* achievements are optional cosmetics — never break play */ }
  }
  let openingDone = false, hashLaunched = false;
  function maybeLaunchHash() {
    if (hashLaunched || !openingDone || !puzzleUI) return;
    hashLaunched = true;
    puzzleUI.launchFromHash();
  }
  function enterPuzzle(spec) {
    if (learning || replaying) return;
    puzzling = true;
    puzzleMoveCount = 0;
    lastPuzzleShare = null;
    clearGlow();
    clearHint();
    $('#thinking').classList.remove('show');
    applyStateVisual(JSON.parse(JSON.stringify(spec.position.state)));
    busy = false;
    updateUndo();
  }
  function exitPuzzle() {
    puzzling = false;
    try {
      const restored = derive(save.log, engine);
      state = restored.state;
      rng = restored.rng;
      storeSeed();
    } catch {
      state = engine.newState();
    }
    applyStateVisual(state);
    loop();
  }
  (async () => {
    try {
      const idx = await (await fetch('assets/puzzles/am/index.json')).json();
      const specs = await Promise.all(idx.puzzles.map((p) => fetch(`assets/puzzles/am/${p.id}.json`).then((response) => response.json())));
      puzzleUI = initPuzzleUI({
        id: 'am',
        accent: T.accent,
        profile,
        iface: amIface,
        index: { version: idx.version, puzzles: specs },
        hooks: {
          enter: enterPuzzle,
          exit: exitPuzzle,
          narrate: (text) => audio.narrate(text, world),
          solved: ({ spec, isDaily }) => {
            lastPuzzleShare = {
              spec,
              isDaily,
              moves: puzzleMoveCount,
              par: spec.par ?? spec.solution?.length ?? puzzleMoveCount,
              state: publicShareState(state),
            };
            awardAchievements(isDaily ? 'daily' : 'puzzle');
          },
        },
      });
      $('#pz-share')?.addEventListener('click', (event) => {
        if (!lastPuzzleShare) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        sharePuzzleResult(lastPuzzleShare, event.currentTarget);
      }, true);
      maybeLaunchHash();
      updateUndo();
    } catch { /* puzzles unavailable — button simply absent */ }
  })();
  updateUndo();
  const spectateReducedMotion = settingsApi.get().reducedMotion
    || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const spectateSaveData = navigator.connection?.saveData === true;
  const spectateLevel = 2;
  const spectateDriver = createAmSpectateDriver({ level: spectateLevel });
  spectate = initSpectate({
    generate: (seed = freshSeed()) => {
      if (!openingDone || busy || learning || puzzling || replaying || state.winner !== null || !controls(state.turn)) {
        throw new Error('spectate is unavailable while another mode is active');
      }
      const spectateRng = createRngSuite({ seed });
      const log = createLog({
        game: 'am',
        engine: ENGINE,
        ruleset: RULESET,
        world: worldId,
        rng: spectateRng,
      });
      log.setup = { ai: { id: 'am.minimax', version: 1, level: spectateLevel } };
      return buildSpectateLog({
        log,
        adapter: engine,
        driver: spectateDriver,
        maxActions: 512,
        repetition: 3,
      });
    },
    replayUI,
    restoreLive: restoreReplayLive,
    reducedMotion: spectateReducedMotion,
    saveData: spectateSaveData,
  });
  spectateUI = initSpectateUI({
    spectate,
    translate: tr,
    accent: T.accent,
    reducedMotion: spectateReducedMotion,
    saveData: spectateSaveData,
  });
  let attractTimer = null;
  function canStartAttract() {
    return openingDone && !document.hidden && !busy && !learning && !puzzling && !replaying
      && state.winner === null && controls(state.turn) && (save?.log?.actions?.length ?? 0) === 0
      && !location.hash.startsWith('#c=')
      && !document.querySelector('[role="dialog"].show,[aria-modal="true"].show,#win.show');
  }
  function resetAttractTimer() {
    if (attractTimer !== null) clearTimeout(attractTimer);
    attractTimer = null;
    if (spectateReducedMotion || spectateSaveData) return;
    attractTimer = setTimeout(async () => {
      attractTimer = null;
      if (!canStartAttract()) { resetAttractTimer(); return; }
      await spectateUI.start();
    }, 60000);
  }
  addEventListener('pointerdown', resetAttractTimer, { passive: true });
  addEventListener('keydown', resetAttractTimer, { passive: true });
  window.__am = {
    get state() { return state; }, get busy() { return busy; }, get learning() { return learning; }, get replaying() { return replaying; }, get puzzling() { return puzzling; },
    get log() { return save?.log; }, world,
    award: (source, options) => awardAchievements(source, options || {}),
    achToast: (list) => showAchievementToast(list),
    achRegistry: () => achievementRegistry,
    packs: () => languagePacks,
    packsReady: () => languagePacksReady,
    shareResult: () => resultShareButton.click(),
    renderShareTest: async () => {
      const { blob } = await renderShareCard({
        kind: 'result',
        game: 'am',
        world: worldId,
        locale: uiLang,
        titleKey: 'am.share.result.win.title',
        bodyKey: 'am.share.result.win.body',
        params: { outcome: 'win', side: 0, moves: 42, score: 48, opponentScore: 36 },
        state: publicShareState(),
        drawBoard: (ctx, box) => drawShareBoard(ctx, box, { world }),
        translate: tr,
      });
      return blob?.size ?? 0;
    },
    spectate: {
      start: (seed) => spectateUI.start(seed),
      pause: () => spectate.pause(),
      skip: () => spectateUI.skip(),
      info: () => ({ active: spectate.active, playing: spectate.playing, result: spectate.current?.result ?? null }),
    },
    setFast(v) { fast = v; },
    play: (pit) => doMove(pit),
    puzzles: {
      open: () => puzzleUI?.openPicker(),
      current: () => puzzleUI?.current(),
      exit: () => puzzleUI?.exit(),
    },
    async autoplay(maxTurns = 120) {
      fast = true;
      let n = 0;
      while (state.winner === null && n < maxTurns) {
        n++;
        while (busy) await wait(10);
        const stream = aiRng(state.turn); const beforeDraws = stream.draws;
        const mv = bestMove(state, 1, stream);
        if (mv === null) break;
        await doMove(mv, rngUse(stream, beforeDraws));
      }
      fast = false;
      return { winner: state.winner, stores: state.stores };
    },
    rendererInfo: () => renderer.info.render,
    rngInfo: () => ({ algorithm: rng.algorithm, seed: rng.seed, streams: rng.snapshot() }),
    logInfo: () => save?.log,
    settingsInfo: () => ({ ...settingsApi.get(), bloomEnabled: bloom.enabled, bloomStrength: bloom.strength, grand: grand.info(), coach: coach.info() }),
  };

  playOpening({
    world,
    canvas,
    getView: () => ({ az, pol, dist }),
    setView: (v) => { az = v.az; pol = v.pol; dist = v.dist; },
    place,
    reducedMotion: settingsApi.get().reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches,
  }).finally(async () => {
    document.body.classList.remove('cinematic-opening');
    busy = false;
    let resumed = null;
    if (save.hasSaved()) resumed = save.resume(rng.seed);
    if (resumed) {
      const replayed = derive(resumed.log, engine);
      rng = replayed.rng;
      storeSeed();
      applyStateVisual(replayed.state);
    } else {
      save.begin(freshLog());
      busy = true;
      await maybeAutoDemo({
        id: 'am',
        adapter: engine,
        applyState: (next) => { applyStateVisual(next); busy = true; },
        freshState: () => {
          const replayed = derive(save.log, engine);
          rng = replayed.rng;
          storeSeed();
          applyStateVisual(replayed.state);
        },
        audio,
        accent: T.accent,
        stepMs: 1400,
        reducedMotion: settingsApi.get().reducedMotion
          || matchMedia('(prefers-reduced-motion: reduce)').matches,
      });
      profile.bump('games.played');
    }
    busy = false;
    loop();
    updateUndo();
    openingDone = true;
    maybeLaunchHash();
    resetAttractTimer();
  });
}
main().catch((e) => {
  console.error(e);
  const s = document.querySelector('#status');
  if (s) s.textContent = tr('Error: %s').replace('%s', e.message);
});
