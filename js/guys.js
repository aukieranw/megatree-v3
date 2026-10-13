import * as THREE from 'three';
import { RopeSet } from './rope.js';

const NODES = 28;
const GROUND = 0.006;
const TENSION = 0.997;

// Guy ropes. Each is clipped to its tab first (hanging free, trailing on the ground), then its
// free end is carried to the anchor and pinned. Tabs ride the pole, so they're given in world space each frame.
export class GuyRopes {
  constructor(guys) {
    this.guys = guys;                 // [{ anchor: Vector3, length: number, mid: boolean }]
    this.n = guys.length;
    this.ropes = new RopeSet(this.n, NODES, GROUND);
    guys.forEach((g, i) => { this.ropes.length[i] = g.length * TENSION; });
    this.want = new Array(this.n).fill(false);
    this.anchorFrom = new Array(this.n).fill(null);
    this.tmp = new THREE.Vector3();

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.n * (NODES - 1) * 6), 3));
    this.material = new THREE.LineBasicMaterial({ color: 0xe0b44a });
    this.lines = new THREE.LineSegments(geo, this.material);
    this.lines.frustumCulled = false;

    const anchorGeo = new THREE.SphereGeometry(0.03, 12, 8);
    const anchorMat = new THREE.MeshStandardMaterial({ color: 0xe0b44a, roughness: 0.6 });
    this.anchors = guys.map((g) => {
      const m = new THREE.Mesh(anchorGeo, anchorMat);
      m.position.copy(g.anchor);
      return m;
    });
    this.object = new THREE.Group();
    this.object.add(this.lines, ...this.anchors);
  }

  // tabs[i]: world position of guy i's tab. on[i]: clipped to the tab (0..1 → on when > 0).
  // anchored[i]: 0..1 progress carrying the free end to its anchor.
  update(dt, tabs, on, anchored, settle) {
    const { ropes } = this;
    for (let i = 0; i < this.n; i++) {
      const g = this.guys[i];
      ropes.tops[i].copy(tabs[i]);
      this.want[i] = on[i] > 0;
      const k = anchored[i];
      if (k <= 0 || !this.want[i]) {
        ropes.pinBottom[i] = false;
        ropes.bottoms[i].copy(g.anchor);        // free ropes are laid out toward their anchor
        this.anchorFrom[i] = null;
        continue;
      }
      if (!this.anchorFrom[i] || settle) {
        // Start from wherever the free end lies now; after a scrub, from where it would hang.
        this.anchorFrom[i] = ropes.active[i] && !settle
          ? ropes.node(i, NODES - 1, new THREE.Vector3())
          : restingEnd(tabs[i], g.anchor, ropes.length[i]);
      }
      ropes.pinBottom[i] = true;
      ropes.bottoms[i].copy(this.anchorFrom[i]).lerp(g.anchor, k);
    }
    ropes.update(dt, this.want, settle);
    ropes.writeSegments(this.lines.geometry.attributes.position.array);
    this.lines.geometry.attributes.position.needsUpdate = true;
    this.lines.visible = this.want.some(Boolean);
    this.anchors.forEach((m, i) => { m.visible = anchored[i] > 0.999; });
  }

  setNight(n) {
    this.material.color.setHex(0xe0b44a).multiplyScalar(1 - 0.75 * n);
  }
}

// Where the free end of a rope hanging from `tab` comes to rest: on the ground, toward the anchor.
function restingEnd(tab, anchor, length) {
  const h = Math.max(0, tab.y - GROUND);
  const dir = new THREE.Vector3(anchor.x - tab.x, 0, anchor.z - tab.z).normalize();
  if (h >= length) return new THREE.Vector3(tab.x, tab.y - length, tab.z);
  return new THREE.Vector3(tab.x, GROUND, tab.z).addScaledVector(dir, length - h);
}
