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
import { createGrandEffects, playOpening } from './grand.js';
import { initSettings, applySettings } from './settings.js';
import { initSave } from './save.js';
import { createCoachOverlay } from './coach3d.js';
import * as audio from './audio.js';

const $ = (s) => document.querySelector(s);
const hexInt = (h) => parseInt(String(h || '#000').replace('#', ''), 16) || 0;
const hexBlend = (a, b, t) => { a = hexInt(a); b = hexInt(b); const ch = (s) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t); return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a) => a[Math.floor(Math.random() * a.length)];
const SP = 1.15, CAP = 16;

async function main() {
  const params = new URLSearchParams(location.search);
  let cfg = {}; try { cfg = JSON.parse(sessionStorage.getItem('am.game') || '{}'); } catch { cfg = {}; }
  const worldId = (params.get('world') || cfg.world || 'parampare').replace(/[^a-z]/gi, '');
  const world = await (await fetch(`worlds/${worldId}.json`)).json();
  const T = world.theme || {};
  const REALISTIC = !!world.realistic;
  const mode = params.get('mode') || cfg.mode || 'ai';
  const level = Math.max(1, Math.min(3, +(params.get('level') || cfg.level || 2)));
  document.body.classList.add('cinematic-opening');
  document.title = `${world.title} — Alaguli Mane`;
  $('#title').textContent = world.title; $('#kn').textContent = world.kannada || '';
  const pname = (p) => (p === 0 ? world.sides.p0.name : world.sides.p1.name);
  const controls = (p) => mode === 'hotseat' || p === 0;

  let state = newGame(); let busy = true, fast = false, settingsApi = null, save = null;

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
    ? new THREE.MeshStandardMaterial({ map: loadTexture('assets/realistic/board.jpg', [3, 1]), roughness: 0.55, metalness: 0.08, envMapIntensity: 1.15 })
    : new THREE.MeshStandardMaterial({ color: hexInt(T.board), roughness: 0.6, metalness: 0.28, envMapIntensity: 0.5 }));
  slab.position.y = -0.22; slab.receiveShadow = true; scene.add(slab);
  addContactShadow(scene, 6.2 * SP, -0.04, 0.42);
  if (REALISTIC) addTableWorld(scene, { radius: 9 * SP, tableY: -0.44, woodUrl: 'assets/realistic/board.jpg', floorHex: hexInt(T.bg) });
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
    if (busy || state.winner !== null || !controls(state.turn)) return;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects([...pitGroups, ...glow], true); if (!hits.length) return;
    let o = hits[0].object; while (o && o.userData.pit === undefined && o.parent) o = o.parent;
    if (!o || o.userData.pit === undefined) return;
    const pit = o.userData.pit; clearHint(); audio.unlock(worldId);
    if (legalMoves(state).includes(pit)) doMove(pit);
  }

  // ---- move + animate cascade ----
  async function doMove(start) {
    if (busy) return; busy = true; clearGlow(); clearHint(); updateUndo();
    const before = state; save.record(); state = applyMove(before, start);
    await animateTurn(before, state.events);
    fullRelayout();
    const captured = state.stores[before.turn] - before.stores[before.turn];
    if (captured > 0 && state.winner === null) await reveal('capture', rand(world.teachings.capture));
    save.persist();
    if (state.winner !== null) { await onWin(); busy = false; return; }
    busy = false; loop();
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
    if (busy || state.winner !== null || !controls(state.turn)) return;
    const mv = bestMove(state, Math.max(2, level)); if (mv === null) return; clearHint();
    const ns = applyMove(state, mv); const gained = ns.stores[state.turn] - state.stores[state.turn];
    const txt = gained > 0 ? `Sow the glowing pit — this move gathers ${gained} seed${gained > 1 ? 's' : ''} for you.` : 'Sow the glowing pit — it keeps seeds on your side and sets up future fours.';
    previewSow(mv, ns);
    const h = $('#hint'); if (h) { h.textContent = '💡 ' + txt; h.classList.add('show'); } hintTimer = setTimeout(clearHint, 5200);
  }

  // ---- turn loop ----
  function loop() {
    if (state.winner !== null) return;
    updateHud();
    if (controls(state.turn)) {
      highlight();
      $('#status').textContent = `${pname(state.turn)}: tap one of your pits to sow`;
      updateUndo();
    } else aiTurn();
  }
  async function aiTurn() {
    busy = true; updateUndo(); $('#thinking').classList.add('show'); await wait(300);
    const mv = bestMove(state, level); $('#thinking').classList.remove('show');
    if (mv === null) { busy = false; updateUndo(); return; }
    busy = false;
    await doMove(mv);
  }

  // ---- reveal + win + hud ----
  const card = $('#card');
  async function reveal(kind, t) { if (!t) return; card.querySelector('.kind').textContent = 'Captured'; card.querySelector('.kind').className = 'kind capture'; card.querySelector('.en').textContent = t.en || ''; card.querySelector('.m').textContent = t.text; card.classList.add('show'); audio.narrate(t.text, world); await wait(fast ? 0 : 1700); card.classList.remove('show'); await wait(fast ? 0 : 200); }
  async function onWin() {
    save?.clear();
    updateUndo();
    const w = state.winner; const won = w === 'draw' ? null : (mode === 'hotseat' || w === 0);
    audio.sfx(won === false ? 'lose' : 'win');
    const t = w === 'draw' ? { text: 'The seeds are shared exactly — a rare, perfectly even harvest. A draw.' } : rand(won ? world.teachings.win : world.teachings.lose);
    const ov = $('#win'); ov.querySelector('#winTitle').textContent = w === 'draw' ? 'A draw' : `${pname(w)} gathers the most`;
    ov.querySelector('#winText').textContent = t.text; ov.classList.add('show'); grand.victoryShower(); settingsApi?.haptic('win'); audio.narrate(t.text, world);
  }
  function updateHud() {
    $('#store0').textContent = state.stores[0]; $('#store1').textContent = state.stores[1];
    $('#turnLabel').textContent = pname(state.turn); $('#turnDot').style.background = state.turn === 0 ? (T.p0color || T.accent) : (T.p1color || T.seed);
  }

  function restoreState(saved) {
    busy = true; fast = false; clearGlow(); clearHint(); updateUndo();
    state = saved;
    fullRelayout();
    card.classList.remove('show');
    $('#win').classList.remove('show');
    $('#thinking').classList.remove('show');
    busy = false;
    updateHud();
    loop();
    updateUndo();
  }

  function updateUndo() {
    const button = $('#undoBtn');
    if (button) button.disabled = !(save && !busy && state.winner === null && controls(state.turn) && save.canUndo());
  }

  function doUndo() {
    if (busy || state.winner !== null || !controls(state.turn) || !save?.canUndo()) return;
    audio.sfx('step');
    save.undo();
    updateUndo();
  }
  updateHud();

  (function frame() { const t = performance.now(); for (const r of glow) r.position.y = 0.08 + Math.sin(t * 0.005 + r.position.x) * 0.03; coach.update(); grand.update(); composer.render(); requestAnimationFrame(frame); })();
  $('#restart').addEventListener('click', () => { save?.clear(); location.reload(); });
  addEventListener('pointerdown', () => audio.unlock(worldId), { once: true });
  $('#winAgain')?.addEventListener('click', () => { save?.clear(); location.reload(); });
  $('#hintBtn')?.addEventListener('click', showHint);
  $('#undoBtn')?.addEventListener('click', doUndo);
  initTutorial({ key: 'am.tut.v1', title: 'How to play', accent: T.accent, steps: [
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
  });
  save = initSave({
    id: 'am',
    serialize: () => state,
    restore: restoreState,
    isMyTurn: (saved) => controls(saved.turn),
  });
  window.__am = {
    get state() { return state; }, get busy() { return busy; }, world,
    setFast(v) { fast = v; },
    play: (pit) => doMove(pit),
    async autoplay(maxTurns = 120) { fast = true; let n = 0; while (state.winner === null && n < maxTurns) { n++; while (busy) await wait(10); const mv = bestMove(state, 1); if (mv === null) break; await doMove(mv); } fast = false; return { winner: state.winner, stores: state.stores }; },
    rendererInfo: () => renderer.info.render,
    settingsInfo: () => ({ ...settingsApi.get(), bloomEnabled: bloom.enabled, bloomStrength: bloom.strength, grand: grand.info(), coach: coach.info() }),
  };

  playOpening({
    world,
    canvas,
    getView: () => ({ az, pol, dist }),
    setView: (v) => { az = v.az; pol = v.pol; dist = v.dist; },
    place,
    reducedMotion: settingsApi.get().reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches,
  }).finally(() => {
    document.body.classList.remove('cinematic-opening');
    busy = false;
    if (!(save.hasSaved() && save.resume())) loop();
    updateUndo();
  });
}
main().catch((e) => { console.error(e); const s = document.querySelector('#status'); if (s) s.textContent = 'Error: ' + e.message; });
