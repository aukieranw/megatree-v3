import * as THREE from 'three';
import { RopeSet } from './rope.js';

const PIXEL_RADIUS = 0.012;
// Strings are tensioned at park; a slightly short rest length keeps them near-straight instead of bellied.
const TENSION = 0.996;

// Each string is a chain of pixels (rope nodes) pinned at the topper and the base ring.
export class LightStrings {
  constructor(lines, pixelsPerString) {
    this.n = lines.length;
    this.p = pixelsPerString;
    this.topsPark = lines.map(([a]) => new THREE.Vector3(...a));
    this.ropes = new RopeSet(this.n, this.p, PIXEL_RADIUS);
    lines.forEach(([a, b], i) => {
      this.ropes.bottoms[i].set(...b);
      this.ropes.length[i] = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * TENSION;
    });
    this.want = new Array(this.n).fill(false);

    const count = this.n * this.p;
    const sphere = new THREE.SphereGeometry(PIXEL_RADIUS, 8, 6);
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.pixels = new THREE.InstancedMesh(sphere, mat, count);
    this.pixels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pixels.setColorAt(0, new THREE.Color());
    this.pixels.frustumCulled = false;

    const wireGeo = new THREE.BufferGeometry();
    wireGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.n * (this.p - 1) * 6), 3));
    this.wire = new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x1d3320 }));
    this.wire.frustumCulled = false;

    this.object = new THREE.Group();
    this.object.add(this.wire, this.pixels);
    this.matrix = new THREE.Matrix4();
    this.color = new THREE.Color();
  }

  // topperOffset: metres the topper sits above park (negative = below). hooked: 0..1 fraction of strings attached.
  update(dt, topperOffset, hooked, settle = false) {
    for (let i = 0; i < this.n; i++) {
      this.ropes.tops[i].copy(this.topsPark[i]);
      this.ropes.tops[i].y += topperOffset;
      this.want[i] = hooked * this.n > i + 0.001;
    }
    this.ropes.update(dt, this.want, settle);
    this.object.visible = this.want.some(Boolean);
  }

  // effect(i, k, out): colour for string i, pixel k (0 = top). power: 0..1 switch-on sweep.
  render(effect, power) {
    const { pos, active } = this.ropes;
    const p = this.p;
    for (let i = 0; i < this.n; i++) {
      for (let k = 0; k < p; k++) {
        const idx = i * p + k;
        const j = idx * 3;
        if (active[i]) {
          this.matrix.makeTranslation(pos[j], pos[j + 1], pos[j + 2]);
          // Bottom pixels switch on first, sweeping up the string.
          const sweep = THREE.MathUtils.smoothstep(power * 1.25 - (1 - k / (p - 1)) * 0.25, 0, 1);
          if (sweep > 0) {
            effect(i, k, this.color);
            this.color.multiplyScalar(sweep).addScalar(0.035 * (1 - sweep));
          } else this.color.setScalar(0.035);
        } else {
          this.matrix.makeScale(0, 0, 0);
        }
        this.pixels.setMatrixAt(idx, this.matrix);
        this.pixels.setColorAt(idx, this.color);
      }
    }
    this.ropes.writeSegments(this.wire.geometry.attributes.position.array);
    this.pixels.instanceMatrix.needsUpdate = true;
    this.pixels.instanceColor.needsUpdate = true;
    this.wire.geometry.attributes.position.needsUpdate = true;
  }
}
