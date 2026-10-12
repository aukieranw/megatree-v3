import * as THREE from 'three';

const PIXEL_RADIUS = 0.012;
const GROUND = PIXEL_RADIUS;
const GRAVITY = -9.81;
const ITERATIONS = 24;
const SUBSTEPS = 3;
const FRICTION = 0.6;
// Strings are tensioned at park; a slightly short rest length keeps them near-straight instead of bellied.
const TENSION = 0.996;
const AXIS_X = 0;
const AXIS_Z = -0.07;

// Each string is a chain of pixels (Verlet nodes) pinned at the topper and the base ring.
export class LightStrings {
  constructor(lines, pixelsPerString) {
    this.n = lines.length;
    this.p = pixelsPerString;
    this.topsPark = lines.map(([a]) => new THREE.Vector3(...a));
    this.bottoms = lines.map(([, b]) => new THREE.Vector3(...b));
    this.length = lines.map(([a, b]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
    this.angle = this.bottoms.map((b) => Math.atan2(b.z - AXIS_Z, b.x - AXIS_X));
    this.active = new Array(this.n).fill(false);

    const count = this.n * this.p;
    this.pos = new Float32Array(count * 3);
    this.prev = new Float32Array(count * 3);
    this.tops = this.topsPark.map((t) => t.clone());

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
      this.tops[i].copy(this.topsPark[i]);
      this.tops[i].y += topperOffset;
      const want = hooked * this.n > i + 0.001;
      if (want && (!this.active[i] || settle)) this.layout(i);
      this.active[i] = want;
    }
    const steps = settle ? 240 : SUBSTEPS;
    const h = settle ? 1 / 120 : Math.min(dt, 1 / 30) / SUBSTEPS;
    for (let s = 0; s < steps; s++) this.step(h);
    this.object.visible = this.active.some(Boolean);
  }

  step(h) {
    const { pos, prev, p } = this;
    const g = GRAVITY * h * h;
    for (let i = 0; i < this.n; i++) {
      if (!this.active[i]) continue;
      const base = i * p;
      for (let k = 1; k < p - 1; k++) {
        const j = (base + k) * 3;
        const vx = (pos[j] - prev[j]) * 0.985;
        const vy = (pos[j + 1] - prev[j + 1]) * 0.985;
        const vz = (pos[j + 2] - prev[j + 2]) * 0.985;
        prev[j] = pos[j]; prev[j + 1] = pos[j + 1]; prev[j + 2] = pos[j + 2];
        pos[j] += vx; pos[j + 1] += vy + g; pos[j + 2] += vz;
      }
      this.pin(base, this.tops[i]);
      this.pin(base + p - 1, this.bottoms[i]);
      const rest = (this.length[i] * TENSION) / (p - 1);
      for (let it = 0; it < ITERATIONS; it++) {
        for (let k = 0; k < p - 1; k++) {
          const a = (base + k) * 3;
          const b = a + 3;
          const dx = pos[b] - pos[a];
          const dy = pos[b + 1] - pos[a + 1];
          const dz = pos[b + 2] - pos[a + 2];
          const d = Math.hypot(dx, dy, dz) || 1e-6;
          const diff = (d - rest) / d;
          const wa = k === 0 ? 0 : (k + 1 === p - 1 ? 1 : 0.5);
          const wb = k + 1 === p - 1 ? 0 : (k === 0 ? 1 : 0.5);
          pos[a] += dx * diff * wa; pos[a + 1] += dy * diff * wa; pos[a + 2] += dz * diff * wa;
          pos[b] -= dx * diff * wb; pos[b + 1] -= dy * diff * wb; pos[b + 2] -= dz * diff * wb;
        }
        for (let k = 1; k < p - 1; k++) {
          const j = (base + k) * 3;
          if (pos[j + 1] < GROUND) {
            pos[j + 1] = GROUND;
            prev[j] += (pos[j] - prev[j]) * FRICTION;
            prev[j + 2] += (pos[j + 2] - prev[j + 2]) * FRICTION;
          }
        }
      }
    }
  }

  pin(node, v) {
    const j = node * 3;
    this.pos[j] = this.prev[j] = v.x;
    this.pos[j + 1] = this.prev[j + 1] = v.y;
    this.pos[j + 2] = this.prev[j + 2] = v.z;
  }

  // A plausible starting shape: hanging from the topper to the ground, excess snaked along the ground.
  layout(i) {
    const T = this.tops[i];
    const B = this.bottoms[i];
    const L = this.length[i];
    const ux = Math.cos(this.angle[i]);
    const uz = Math.sin(this.angle[i]);
    const rT = (T.x - AXIS_X) * ux + (T.z - AXIS_Z) * uz;
    const R = (B.x - AXIS_X) * ux + (B.z - AXIS_Z) * uz;
    const hT = T.y - GROUND;
    const hB = B.y - GROUND;
    const at = (r, y, t) => new THREE.Vector3(AXIS_X + ux * r - uz * t, y, AXIS_Z + uz * r + ux * t);

    let path;
    const groundPath = (g) => Math.hypot(g - rT, hT) + (R - g) + hB;
    if (T.distanceTo(B) >= L * 0.999 || groundPath(R) >= L) {
      path = [T.clone(), B.clone()];
    } else if (groundPath(rT) >= L) {
      let lo = rT, hi = R;
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        if (groundPath(mid) > L) lo = mid; else hi = mid;
      }
      path = [T.clone(), at(lo, GROUND, 0), at(R, GROUND, 0), B.clone()];
    } else {
      const ground = L - hT - hB;
      const wiggle = (amp) => {
        const pts = [];
        for (let k = 0; k <= 64; k++) {
          const f = k / 64;
          pts.push(at(rT + (R - rT) * f, GROUND, amp * Math.sin(f * Math.PI * 7)));
        }
        return pts;
      };
      let lo = 0, hi = 2;
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        if (polylineLength(wiggle(mid)) > ground) hi = mid; else lo = mid;
      }
      path = [T.clone(), ...wiggle(lo), B.clone()];
    }
    const nodes = resample(path, this.p);
    nodes.forEach((v, k) => {
      const j = (i * this.p + k) * 3;
      this.pos[j] = this.prev[j] = v.x;
      this.pos[j + 1] = this.prev[j + 1] = v.y;
      this.pos[j + 2] = this.prev[j + 2] = v.z;
    });
  }

  // effect(i, k, out): colour for string i, pixel k (0 = top). power: 0..1 switch-on sweep.
  render(effect, power) {
    const { pos, p } = this;
    const wire = this.wire.geometry.attributes.position.array;
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      for (let k = 0; k < p; k++) {
        const idx = i * p + k;
        const j = idx * 3;
        if (this.active[i]) {
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
        if (k < p - 1) {
          const s = this.active[i] ? 1 : 0;
          for (let c = 0; c < 6; c++) wire[w + c] = s * pos[j + c];
          w += 6;
        }
      }
    }
    this.pixels.instanceMatrix.needsUpdate = true;
    this.pixels.instanceColor.needsUpdate = true;
    this.wire.geometry.attributes.position.needsUpdate = true;
  }
}

function polylineLength(pts) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += pts[i].distanceTo(pts[i - 1]);
  return l;
}

function resample(path, count) {
  const total = polylineLength(path);
  const out = [];
  let seg = 1;
  let acc = 0;
  for (let k = 0; k < count; k++) {
    const target = (total * k) / (count - 1);
    while (seg < path.length - 1 && acc + path[seg].distanceTo(path[seg - 1]) < target) {
      acc += path[seg].distanceTo(path[seg - 1]);
      seg++;
    }
    const len = path[seg].distanceTo(path[seg - 1]) || 1;
    out.push(path[seg - 1].clone().lerp(path[seg], Math.min(1, (target - acc) / len)));
  }
  return out;
}
