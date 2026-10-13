import * as THREE from 'three';

const GRAVITY = -9.81;
const ITERATIONS = 24;
const SUBSTEPS = 3;
const FRICTION = 0.6;

// A set of Verlet ropes. Node 0 is pinned to tops[i]; the last node is pinned to bottoms[i]
// when pinBottom[i] is true, otherwise it hangs free. Nodes rest on the ground at `ground`.
export class RopeSet {
  constructor(count, nodes, ground) {
    this.n = count;
    this.p = nodes;
    this.ground = ground;
    this.pos = new Float32Array(count * nodes * 3);
    this.prev = new Float32Array(count * nodes * 3);
    this.tops = Array.from({ length: count }, () => new THREE.Vector3());
    this.bottoms = Array.from({ length: count }, () => new THREE.Vector3());
    this.pinBottom = new Array(count).fill(true);
    this.length = new Array(count).fill(1);
    this.active = new Array(count).fill(false);
  }

  // want[i]: rope i should exist. Newly active ropes (or all, when settling after a jump) get laid out first.
  update(dt, want, settle = false) {
    for (let i = 0; i < this.n; i++) {
      if (want[i] && (!this.active[i] || settle)) this.layout(i);
      this.active[i] = want[i];
    }
    const steps = settle ? 240 : SUBSTEPS;
    const h = settle ? 1 / 120 : Math.min(dt, 1 / 30) / SUBSTEPS;
    for (let s = 0; s < steps; s++) this.step(h);
  }

  node(i, k, out) {
    const j = (i * this.p + k) * 3;
    return out.set(this.pos[j], this.pos[j + 1], this.pos[j + 2]);
  }

  step(h) {
    const { pos, prev, p, ground } = this;
    const g = GRAVITY * h * h;
    for (let i = 0; i < this.n; i++) {
      if (!this.active[i]) continue;
      const base = i * p;
      const free = !this.pinBottom[i];
      const last = free ? p : p - 1;
      for (let k = 1; k < last; k++) {
        const j = (base + k) * 3;
        const vx = (pos[j] - prev[j]) * 0.985;
        const vy = (pos[j + 1] - prev[j + 1]) * 0.985;
        const vz = (pos[j + 2] - prev[j + 2]) * 0.985;
        prev[j] = pos[j]; prev[j + 1] = pos[j + 1]; prev[j + 2] = pos[j + 2];
        pos[j] += vx; pos[j + 1] += vy + g; pos[j + 2] += vz;
      }
      this.pin(base, this.tops[i]);
      if (!free) this.pin(base + p - 1, this.bottoms[i]);
      const rest = this.length[i] / (p - 1);
      for (let it = 0; it < ITERATIONS; it++) {
        for (let k = 0; k < p - 1; k++) {
          const a = (base + k) * 3;
          const b = a + 3;
          const dx = pos[b] - pos[a];
          const dy = pos[b + 1] - pos[a + 1];
          const dz = pos[b + 2] - pos[a + 2];
          const d = Math.hypot(dx, dy, dz) || 1e-6;
          const diff = (d - rest) / d;
          const bPinned = !free && k + 1 === p - 1;
          const wa = k === 0 ? 0 : (bPinned ? 1 : 0.5);
          const wb = bPinned ? 0 : (k === 0 ? 1 : 0.5);
          pos[a] += dx * diff * wa; pos[a + 1] += dy * diff * wa; pos[a + 2] += dz * diff * wa;
          pos[b] -= dx * diff * wb; pos[b + 1] -= dy * diff * wb; pos[b + 2] -= dz * diff * wb;
        }
        for (let k = 1; k < last; k++) {
          const j = (base + k) * 3;
          if (pos[j + 1] < ground) {
            pos[j + 1] = ground;
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

  // A plausible starting shape: hanging from the top to the ground, then along the ground toward
  // bottoms[i], with any excess snaked sideways. A free rope just ends wherever its length runs out.
  layout(i) {
    const T = this.tops[i];
    const B = this.bottoms[i];
    const L = this.length[i];
    const G = this.ground;
    const free = !this.pinBottom[i];
    const dx = B.x - T.x;
    const dz = B.z - T.z;
    const R = Math.hypot(dx, dz) || 1e-6;
    const ux = dx / R;
    const uz = dz / R;
    const hT = Math.max(0, T.y - G);
    const hB = free ? 0 : Math.max(0, B.y - G);
    const at = (r, t) => new THREE.Vector3(T.x + ux * r - uz * t, G, T.z + uz * r + ux * t);

    let path;
    const groundPath = (g) => Math.hypot(g, hT) + (R - g) + hB;
    if (free) {
      // Drop to the ground, then run toward the target for whatever length is left.
      const run = Math.max(0, L - hT);
      path = hT >= L ? [T.clone(), new THREE.Vector3(T.x, T.y - L, T.z)] : [T.clone(), at(0, 0), at(run, 0)];
    } else if (T.distanceTo(B) >= L * 0.999 || groundPath(R) >= L) {
      path = [T.clone(), B.clone()];
    } else if (groundPath(0) >= L) {
      let lo = 0, hi = R;
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        if (groundPath(mid) > L) lo = mid; else hi = mid;
      }
      path = [T.clone(), at(lo, 0), at(R, 0), B.clone()];
    } else {
      const ground = L - hT - hB;
      const wiggle = (amp) => {
        const pts = [];
        for (let k = 0; k <= 64; k++) {
          const f = k / 64;
          pts.push(at(R * f, amp * Math.sin(f * Math.PI * 7)));
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
    resample(path, this.p).forEach((v, k) => {
      const j = (i * this.p + k) * 3;
      this.pos[j] = this.prev[j] = v.x;
      this.pos[j + 1] = this.prev[j + 1] = v.y;
      this.pos[j + 2] = this.prev[j + 2] = v.z;
    });
  }

  // Positions for a LineSegments buffer: (p - 1) segments per rope, collapsed when inactive.
  writeSegments(out) {
    const { pos, p } = this;
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const s = this.active[i] ? 1 : 0;
      for (let k = 0; k < p - 1; k++) {
        const j = (i * p + k) * 3;
        for (let c = 0; c < 6; c++) out[w + c] = s * pos[j + c];
        w += 6;
      }
    }
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
