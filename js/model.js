import * as THREE from 'three';
import { SAWHORSE, RIG } from './config.js';

const CRANK_AXIS_POINT = new THREE.Vector3(0, 0.989, -0.278);
const SHEAVE_AXIS_POINT = new THREE.Vector3(0, 7.64, -0.0915);
const SHEAVE_RADIUS = 0.0555;
const EXPORTED_COLLAR = 400;

// How far the assembled pole sits back from the leaf socket before it's slid in (along its axis).
const INSERT_OFFSET = 1.2;

// Where each fitted part comes from before it is in place. Pole frame = along the pole as it lies
// on the sawhorse (negative Y = from the bottom end); world = dropped in from above.
// Order matters where nodes nest: a child's entry must come after its parent's.
const FIT = [
  { key: 'fitBasePlate', node: (m) => m.roles.basePlate, frame: 'world', from: [0, 0.45, 0] },
  { key: 'fitLeaf', node: (m) => m.groups['Base - hinged leaf'], frame: 'world', from: [0, 0.5, 0] },
  { key: 'fitPin', node: (m) => m.roles.hingePin, frame: 'world', from: [0.3, 0, 0] },
  { key: 'fitLeafLock', node: (m) => m.roles.leafLock, frame: 'pole', from: [0, 0.15, 0] },
  { key: 'fitHead', node: (m) => m.groups['Pulley Topper'], frame: 'pole', from: [0, 0.8, 0] },
  { key: 'fitTopper', node: (m) => m.groups['Topper Assembly'], frame: 'pole', from: [0, -1.75, 0] },
  { key: 'fitCollar', node: (m) => m.groups['Mid Collar'], frame: 'pole', from: [0, -1.3, 0] },
  { key: 'fitBracket', node: (m) => m.groups['Winch Bracket'], frame: 'pole', from: [0, -1.15, 0] },
  { key: 'fitSleeve', node: (m) => m.groups['Lock sleeve'], frame: 'pole', from: [0, -0.8, 0] },
  { key: 'fitStar', node: (m) => m.groups['Star + mast'], frame: 'world', from: [0, 0.9, 0] },
];
const POLE_SECTIONS = ['pole1', 'pole2', 'pole3'];
// Roles that get their own node so they can move or fade independently of their group.
const HELD_ROLES = new Set([...POLE_SECTIONS, 'basePlate', 'hingePin', 'leafLock']);

export async function loadModel(url) {
  const header = await fetch(`${url}.json`).then((r) => r.json());
  // Hosts that can't serve .bin files get the geometry inlined as base64 instead.
  const bin = header.binBase64
    ? Uint8Array.from(atob(header.binBase64), (c) => c.charCodeAt(0)).buffer
    : await fetch(`${url}.bin`).then((r) => r.arrayBuffer());
  return new Megatree(header, bin);
}

class Megatree {
  constructor(header, bin) {
    this.header = header;
    this.root = new THREE.Group();
    this.pickables = [];

    const hingeJoint = header.joints['Hinge (leaf on base pin)'];
    this.hingeAxis = new THREE.Vector3(...hingeJoint.axis);
    this.hingeOrigin = new THREE.Vector3(...hingeJoint.origin);

    this.fixed = new THREE.Group();
    this.hinge = new THREE.Group();
    this.hinge.position.copy(this.hingeOrigin);
    this.pole = new THREE.Group();          // pole frame == world frame at the exported pose
    this.pole.position.copy(this.hingeOrigin).negate();
    this.hinge.add(this.pole);
    this.poleBody = new THREE.Group();      // the pole and everything on it; slides into the leaf socket
    this.pole.add(this.poleBody);
    this.topperSlide = new THREE.Group();
    this.collarSlide = new THREE.Group();
    this.sleeveSlide = new THREE.Group();
    this.poleBody.add(this.topperSlide, this.collarSlide, this.sleeveSlide);
    this.root.add(this.fixed, this.hinge);

    const parentOf = {
      'NB50 ground stub': this.fixed,
      'Base - fixed': this.fixed,
      'Base - hinged leaf': this.pole,
      Pole: this.poleBody,
      'Winch Bracket': this.poleBody,
      'Pulley Topper': this.poleBody,
      'Topper Assembly': this.topperSlide,
      'Star + mast': this.topperSlide,
      'Mid Collar': this.collarSlide,
      'Lock sleeve': this.sleeveSlide,
    };

    this.groups = {};
    this.roles = {};
    this.plateNuts = [];
    const groupNode = (name) => {
      if (!this.groups[name]) {
        const g = new THREE.Group();
        g.name = name;
        g.userData.materials = [];
        parentOf[name].add(g);
        this.groups[name] = g;
      }
      return this.groups[name];
    };

    this.crank = pivotAbout(CRANK_AXIS_POINT);
    this.sheave = pivotAbout(SHEAVE_AXIS_POINT);
    groupNode('Winch Bracket').add(this.crank.outer);
    groupNode('Pulley Topper').add(this.sheave.outer);

    for (const m of header.meshes) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bin, m.position, m.vertexCount * 3), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(bin, m.normal, m.vertexCount * 3), 3, true));
      geo.setIndex(new THREE.BufferAttribute(new Uint32Array(bin, m.index, m.indexCount), 1));
      geo.computeBoundingSphere();
      const color = new THREE.Color().setRGB(...m.color, THREE.SRGBColorSpace);
      const mat = new THREE.MeshStandardMaterial({
        color,
        metalness: m.role === 'starPixels' || m.color[0] > 0.8 ? 0 : 0.2,
        roughness: m.color[0] > 0.8 ? 0.75 : 0.5,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.parts = m.parts;
      this.pickables.push(mesh);

      const group = groupNode(m.group);
      group.userData.materials.push(mat);
      if (m.role === 'crank') this.crank.inner.add(mesh);
      else if (m.role === 'sheave') this.sheave.inner.add(mesh);
      else if (m.role?.startsWith('plateNut:')) {
        geo.computeBoundingBox();
        const nut = pivotAbout(geo.boundingBox.getCenter(new THREE.Vector3()));
        nut.inner.add(mesh);
        nut.outer.userData.materials = [mat];
        nut.home = nut.outer.position.clone();
        group.add(nut.outer);
        this.plateNuts.push(nut);
      } else if (HELD_ROLES.has(m.role)) {
        const holder = (this.roles[m.role] ??= Object.assign(new THREE.Group(), { userData: { materials: [] } }));
        holder.add(mesh);
        holder.userData.materials.push(mat);
        group.add(holder);
      } else group.add(mesh);
      if (m.role === 'starPixels') this.starPixels = mat;
    }

    this.restAngle = solveRestAngle(this.hingeOrigin);
    this.buildCable(header.lines);
    this.buildRigging(header.lines);
    this.buildSawhorse();
  }

  // Guy ropes: tab positions (pole frame at the exported pose), anchors, and tensioned lengths.
  // Mid guys ride the collar; top guys ride the pulley head.
  get guySpecs() {
    return this.guyLines.map(({ tab, anchor }) => ({
      tab,
      anchor,
      length: tab.distanceTo(anchor),
      mid: tab.y < 5,
    }));
  }

  guyTabsWorld(out) {
    this.guyLines.forEach(({ tab }, i) => {
      const parent = tab.y < 5 ? this.collarSlide : this.poleBody;
      out[i] = parent.localToWorld((out[i] ?? new THREE.Vector3()).copy(tab));
    });
    return out;
  }

  partAt(hit) {
    const ranges = hit.object.userData.parts;
    const tri = hit.faceIndex;
    const r = ranges?.find(([a, b]) => tri >= a && tri < b);
    return r ? this.header.parts[r[2]] : null;
  }

  buildCable(lines) {
    const [lug, sheaveFront] = lines.cablePark[0].map((p) => new THREE.Vector3(...p));
    this.lugPark = lug;
    const rear = new THREE.Vector3(0, SHEAVE_AXIS_POINT.y, SHEAVE_AXIS_POINT.z - SHEAVE_RADIUS);
    const arc = [];
    for (let i = 0; i <= 8; i++) {
      const a = (Math.PI * i) / 8;
      arc.push(new THREE.Vector3(0, SHEAVE_AXIS_POINT.y + Math.sin(a) * SHEAVE_RADIUS,
        SHEAVE_AXIS_POINT.z + Math.cos(a) * SHEAVE_RADIUS));
    }
    sheaveFront.copy(arc[0]);
    this.cableFixed = [
      ...arc,
      rear,
      new THREE.Vector3(0, 1.9, -0.147),
      new THREE.Vector3(0.02, 1.05, -0.185),
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * (this.cableFixed.length + 1)), 3));
    this.cable = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xd8d2c0 }));
    this.cable.frustumCulled = false;
    this.poleBody.add(this.cable);
  }

  buildRigging(lines) {
    const ringPts = lines.baseRing.flatMap(([a, b]) => [...a, ...b]);
    const ringGeo = new THREE.BufferGeometry();
    ringGeo.setAttribute('position', new THREE.Float32BufferAttribute(ringPts, 3));
    this.baseRing = new THREE.LineSegments(ringGeo, new THREE.LineBasicMaterial({ color: 0x2d3a2a }));
    this.fixed.add(this.baseRing);

    this.guyLines = lines.guys.map(([tab, anchor]) => ({
      tab: new THREE.Vector3(...tab),
      anchor: new THREE.Vector3(...anchor),
    }));
  }

  // Not in the Fusion model; drawn to show where the pole rests before the walk-up.
  buildSawhorse() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.9 });
    const g = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.07, 0.09), mat);
    beam.position.y = SAWHORSE.height - 0.035;
    g.add(beam);
    for (const sx of [-0.38, 0.38]) {
      for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.045, SAWHORSE.height / Math.cos(0.2), 0.07), mat);
        leg.position.set(sx, SAWHORSE.height / 2 - 0.035, sz * 0.06);
        leg.rotation.x = sz * 0.2;
        g.add(leg);
      }
    }
    g.position.set(0, 0, this.hingeOrigin.z - SAWHORSE.distance);
    g.traverse((o) => { o.castShadow = true; });
    this.sawhorse = g;
    this.fixed.add(g);
  }

  apply(s) {
    const hingeRad = THREE.MathUtils.degToRad(s.hinge);
    this.hinge.quaternion.setFromAxisAngle(this.hingeAxis, hingeRad);
    this.hinge.updateMatrixWorld(true);
    const invHinge = this.hinge.quaternion.clone().invert();

    this.topperSlide.position.y = s.topper / 1000;
    this.collarSlide.position.y = (s.collar - EXPORTED_COLLAR) / 1000;
    this.sleeveSlide.position.y = s.sleeve / 1000;

    this.poleBody.position.y = (1 - s.insert) * INSERT_OFFSET;

    for (const spec of FIT) {
      const node = spec.node(this);
      const offset = new THREE.Vector3(...spec.from).multiplyScalar(1 - s[spec.key]);
      if (spec.frame === 'world' && !isUnder(node, this.fixed)) {
        offset.applyQuaternion(invHinge);
      }
      setFit(node, s[spec.key], offset);
    }
    POLE_SECTIONS.forEach((role, i) => {
      const f = THREE.MathUtils.clamp(s.fitPole * 3 - i, 0, 1);
      setFit(this.roles[role], f, new THREE.Vector3(0, 1.2 * (1 - f), 0));
    });
    // Nuts go on one after another, spinning down their studs.
    this.plateNuts.forEach((nut, i) => {
      const f = THREE.MathUtils.clamp(s.fitPlateNuts * this.plateNuts.length - i, 0, 1);
      setFit(nut.outer, f, nut.home.clone().add(new THREE.Vector3(0, 0.1 * (1 - f), 0)));
      nut.spin.rotation.y = (1 - f) * Math.PI * 8;
    });

    const travel = (s.topper + 5070) / 1000;
    this.crank.spin.rotation.x = -(travel * 1000 / RIG.crankMmPerTurn) * Math.PI * 2;
    this.sheave.spin.rotation.x = travel / SHEAVE_RADIUS;

    this.updateCable(s);
    this.sawhorse.visible = s.hinge > 1 && s.fitPole > 0;
    this.baseRing.visible = s.strings > 0;
    this.root.updateMatrixWorld(true);
  }

  updateCable(s) {
    const lug = this.lugPark.clone();
    lug.y += s.topper / 1000;
    const pts = [lug, ...this.cableFixed];
    const visible = s.cable > 0 && s.fitTopper >= 1 && s.fitHead >= 1;
    this.cable.visible = visible;
    if (!visible) return;
    const drawn = truncatePolyline(pts.slice().reverse(), s.cable);
    const attr = this.cable.geometry.attributes.position;
    drawn.forEach((p, i) => attr.setXYZ(i, p.x, p.y, p.z));
    this.cable.geometry.setDrawRange(0, drawn.length);
    attr.needsUpdate = true;
  }

  // Unlit lines would otherwise glow under night-time bloom.
  setNight(n) {
    const dim = 1 - 0.75 * n;
    this.cable.material.color.setHex(0xd8d2c0).multiplyScalar(dim);
  }

  // Live readout in Fusion's own joint units.
  readout(s) {
    return {
      Hinge: `${s.hinge.toFixed(1)}°`,
      Topper: `${Math.round(s.topper)} mm`,
      'Mid collar': `${Math.round(s.collar)} mm`,
      'Lock sleeve': `+${Math.round(s.sleeve)} mm`,
    };
  }
}

function pivotAbout(point) {
  const outer = new THREE.Group();
  outer.position.copy(point);
  const spin = new THREE.Group();
  const inner = new THREE.Group();
  inner.position.copy(point).negate();
  outer.add(spin);
  spin.add(inner);
  return { outer, spin, inner };
}

function isUnder(node, ancestor) {
  for (let o = node.parent; o; o = o.parent) if (o === ancestor) return true;
  return false;
}

function setFit(node, f, offset) {
  if (!node) return;
  node.visible = f > 0.001;
  node.position.copy(offset);
  const fading = f < 0.999;
  for (const m of node.userData.materials ?? []) {
    m.transparent = fading;
    m.opacity = fading ? Math.min(1, f * 2.5) : 1;
    m.depthWrite = !fading;
  }
}

// Hinge angle at which the pole's underside rests on the sawhorse beam.
function solveRestAngle(origin) {
  const halfWidth = 0.025;
  const axisOffset = -0.07 - origin.z;            // pole axis relative to the pin, along Z
  const underside = axisOffset - halfWidth;       // face that ends up downward when lowered
  let lo = 45, hi = 90;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const t = THREE.MathUtils.degToRad(mid);
    // Point on the underside at distance d along the pole that sits above the sawhorse.
    const d = (SAWHORSE.distance + underside * Math.cos(t)) / Math.sin(t);
    const height = origin.y + d * Math.cos(t) + underside * Math.sin(t);
    if (height > SAWHORSE.height) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export function truncatePolyline(points, frac) {
  const lens = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const l = points[i].distanceTo(points[i - 1]);
    lens.push(l);
    total += l;
  }
  let remaining = total * frac;
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (remaining >= lens[i - 1]) {
      out.push(points[i]);
      remaining -= lens[i - 1];
    } else {
      out.push(points[i - 1].clone().lerp(points[i], remaining / lens[i - 1]));
      break;
    }
  }
  return out;
}
