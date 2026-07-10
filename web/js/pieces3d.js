// Procedural 3D objects for Alaguli Mane: carved pit bowls, seeds, and the two
// stores where captured seeds are banked. Emissive seeds glow under the bloom.
import * as THREE from '../vendor/three.module.js';
const mesh = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; return m; };

export function makePit(rimMat, wellMat) {
  const g = new THREE.Group();
  const rim = mesh(new THREE.TorusGeometry(0.42, 0.07, 14, 32), rimMat, false);
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.02; g.add(rim);
  const well = mesh(new THREE.CylinderGeometry(0.4, 0.34, 0.2, 28), wellMat, false);
  well.position.y = -0.09; well.receiveShadow = true; g.add(well);
  return g;
}

export function makeStore(rimMat, wellMat) {
  const g = new THREE.Group();
  const rim = mesh(new THREE.TorusGeometry(0.6, 0.09, 16, 40), rimMat, false);
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.02; g.add(rim);
  const well = mesh(new THREE.CylinderGeometry(0.58, 0.5, 0.24, 36), wellMat, false);
  well.position.y = -0.11; well.receiveShadow = true; g.add(well);
  return g;
}

export function makeSeed(mat) {
  const s = mesh(new THREE.SphereGeometry(0.075, 12, 10), mat);
  s.scale.set(1, 0.8, 1.3);   // tamarind-seed shape
  return s;
}

// deterministic seed offsets inside a bowl (spiral), radius ~0.3
export function seedSlots(n, radius = 0.28) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2.399963;                 // golden angle
    const r = radius * Math.sqrt(i / Math.max(1, n));
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}
