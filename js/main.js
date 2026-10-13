import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { STEPS, INITIAL_STATE, LIGHTS, SITE } from './config.js';
import { Timeline } from './timeline.js';
import { loadModel } from './model.js';
import { LightStrings } from './strings.js';
import { GuyRopes } from './guys.js';
import { EFFECTS } from './effects.js';
import { loadTiles, loadImageFile, ATTRIBUTION } from './satellite.js';
import { idbGet, idbSet, idbDelete } from './store.js';

const $ = (id) => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const DAY_SKY = new THREE.Color('#9cc0e0');
const NIGHT_SKY = new THREE.Color('#060a14');

// ---------- renderer & scene ----------
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = DAY_SKY.clone();
scene.fog = new THREE.Fog(DAY_SKY.clone(), 60, 220);

const camera = new THREE.PerspectiveCamera(42, 1, 0.02, 600);
camera.position.set(9, 5, 11);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 3, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 0.3;
controls.maxDistance = 150;
controls.screenSpacePanning = true;

const hemi = new THREE.HemisphereLight(0xdfeeff, 0x3a4a2c, 1.1);
const sun = new THREE.DirectionalLight(0xfff2dc, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 9, bottom: -3, near: 1, far: 40 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
const moon = new THREE.DirectionalLight(0x6f8bd6, 0);
moon.position.set(-8, 12, 6);
scene.add(hemi, sun, sun.target, moon);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(300, 64).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0x4b6b3c, roughness: 1 }),
);
ground.receiveShadow = true;
scene.add(ground);

const satRoot = new THREE.Group();     // rotated so the imagery's north matches the yard frame
scene.add(satRoot);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.2, 0.5, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  updateViewOffset();
}
addEventListener('resize', resize);

// Shift the projection so the orbit target sits in the middle of the area the panels leave clear.
function updateViewOffset() {
  const w = innerWidth;
  const h = innerHeight;
  const rect = (id) => $(id)?.getBoundingClientRect();
  const card = rect('card');
  const steps = rect('stepsPanel');
  const transport = rect('transport');
  let dx = 0;
  let dy = 0;
  if (card && transport) {
    if (w > 760) {
      const left = Math.min(Math.max(card.right, steps.right), w * 0.45);
      dx = left / 2;
      dy = (h - transport.top) / 2;
    } else {
      const bottom = h - Math.min(card.top, steps.top);
      const top = rect('siteBtn').bottom;
      dy = (bottom - top) / 2;
    }
  }
  camera.setViewOffset(w, h, -dx, dy, w, h);
  camera.updateProjectionMatrix();
}
resize();
document.fonts?.ready.then(updateViewOffset);

// ---------- model ----------
const model = await loadModel('model/megatree').catch((err) => {
  $('loading').textContent = `Couldn't load the model: ${err.message}`;
  throw err;
});
scene.add(model.root);
const strings = new LightStrings(model.header.lines.strings, LIGHTS.pixelsPerString);
scene.add(strings.object);
const guySpecs = model.guySpecs;
const guys = new GuyRopes(guySpecs);
scene.add(guys.object);
const guyTabs = [];
const guyOn = new Array(guySpecs.length).fill(0);
const guyAnchored = new Array(guySpecs.length).fill(0);

// Guys within each set (top, mid) go on one after another.
function guyProgress(state) {
  for (const mid of [false, true]) {
    const idx = guySpecs.map((g, i) => (g.mid === mid ? i : -1)).filter((i) => i >= 0);
    const on = mid ? state.guyMidOn : state.guyTopOn;
    const anchored = mid ? state.guyMidAnchor : state.guyTopAnchor;
    idx.forEach((i, j) => {
      guyOn[i] = THREE.MathUtils.clamp(on * idx.length - j, 0, 1);
      guyAnchored[i] = THREE.MathUtils.clamp(anchored * idx.length - j, 0, 1);
    });
  }
}
$('loading').hidden = true;

const timeline = new Timeline(STEPS, INITIAL_STATE, { rest: model.restAngle });

// ---------- UI: steps ----------
const stepList = $('stepList');
timeline.steps.forEach((s, i) => {
  const li = document.createElement('li');
  if (s.title.startsWith('Strike') && !timeline.steps[i - 1].title.startsWith('Strike')) li.className = 'strike';
  const b = document.createElement('button');
  b.type = 'button';
  b.innerHTML = `<span class="n">${String(i + 1).padStart(2, '0')}</span><span></span>`;
  b.lastChild.textContent = s.title;
  b.addEventListener('click', () => {
    jumpTo(i, true);
    $('stepsPanel').classList.remove('open');
    $('stepsToggle').setAttribute('aria-expanded', 'false');
  });
  li.append(b);
  stepList.append(li);
});
$('stepsToggle').addEventListener('click', () => {
  const open = $('stepsPanel').classList.toggle('open');
  $('stepsToggle').setAttribute('aria-expanded', String(open));
});

function setCardCollapsed(collapsed) {
  $('card').classList.toggle('collapsed', collapsed);
  $('cardToggle').textContent = collapsed ? 'Show details' : 'Hide details';
  $('cardToggle').setAttribute('aria-expanded', String(!collapsed));
  try { localStorage.setItem('megatree.cardCollapsed', collapsed ? '1' : ''); } catch { /* storage unavailable */ }
  updateViewOffset();
}
$('cardToggle').addEventListener('click', () => setCardCollapsed(!$('card').classList.contains('collapsed')));
try { if (localStorage.getItem('megatree.cardCollapsed')) setCardCollapsed(true); } catch { /* storage unavailable */ }

const ticks = $('ticks');
timeline.starts.slice(1).forEach((t) => {
  const s = document.createElement('span');
  s.style.left = `${(t / timeline.total) * 100}%`;
  ticks.append(s);
});

for (const name of Object.keys(EFFECTS)) $('effect').add(new Option(name, name));

// ---------- playback ----------
const scrubber = $('scrubber');
scrubber.max = timeline.total;
let time = 0;
let playing = false;
let speed = 1;
let shownStep = -1;
let follow = true;
let needsSettle = true;

function setPlaying(p) {
  playing = p;
  if (playing && time >= timeline.total - 0.01) {
    time = 0;
    needsSettle = true;
  }
  $('play').classList.toggle('playing', playing);
  $('play').setAttribute('aria-label', playing ? 'Pause' : 'Play');
}

function jumpTo(i, play) {
  time = timeline.starts[i];
  needsSettle = true;
  follow = true;
  $('follow').setAttribute('aria-pressed', 'true');
  shownStep = -1;
  setPlaying(play);
}

$('play').addEventListener('click', () => setPlaying(!playing));
$('prev').addEventListener('click', () => {
  const i = timeline.stepAt(time);
  // Restart the current step unless we're at its very start.
  jumpTo(time - timeline.starts[i] > 0.6 || i === 0 ? i : i - 1, playing);
});
$('next').addEventListener('click', () => jumpTo(Math.min(timeline.steps.length - 1, timeline.stepAt(time) + 1), playing));
scrubber.addEventListener('input', () => {
  time = Number(scrubber.value);
  needsSettle = true;
});
$('speed').addEventListener('change', (e) => { speed = Number(e.target.value); });
$('follow').addEventListener('click', () => {
  follow = !follow;
  $('follow').setAttribute('aria-pressed', String(follow));
  if (follow) shownStep = -1;
});
controls.addEventListener('start', () => {
  tween = null;
  if (follow) {
    follow = false;
    $('follow').setAttribute('aria-pressed', 'false');
  }
});
addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea')) return;
  if (e.code === 'Space') { e.preventDefault(); setPlaying(!playing); }
  if (e.code === 'ArrowRight') $('next').click();
  if (e.code === 'ArrowLeft') $('prev').click();
});

// ---------- camera moves ----------
let tween = null;
function flyTo({ pos, target }) {
  if (reducedMotion) {
    camera.position.set(...pos);
    controls.target.set(...target);
    return;
  }
  tween = {
    t: 0,
    fromPos: camera.position.clone(),
    fromTarget: controls.target.clone(),
    toPos: new THREE.Vector3(...pos),
    toTarget: new THREE.Vector3(...target),
  };
}
function updateTween(dt) {
  if (!tween) return;
  tween.t = Math.min(1, tween.t + dt / 1.6);
  const k = tween.t < 0.5 ? 4 * tween.t ** 3 : 1 - (-2 * tween.t + 2) ** 3 / 2;
  camera.position.lerpVectors(tween.fromPos, tween.toPos, k);
  controls.target.lerpVectors(tween.fromTarget, tween.toTarget, k);
  if (tween.t >= 1) tween = null;
}

// ---------- step card ----------
function showStep(i) {
  const s = timeline.steps[i];
  $('cardEyebrow').textContent = `Step ${i + 1} of ${timeline.steps.length}`;
  $('cardTitle').textContent = s.title;
  $('cardText').textContent = s.text;
  $('stepCounter').textContent = `${i + 1} / ${timeline.steps.length}`;
  [...stepList.children].forEach((li, j) => {
    li.classList.toggle('current', j === i);
    li.classList.toggle('done', j < i);
  });
  stepList.children[i].scrollIntoView({ block: 'nearest' });
  updateViewOffset();
  if (follow && s.camera) flyTo(s.camera);
}

const readout = $('readout');
let lastReadout = '';
function updateReadout(state) {
  const values = model.readout(state);
  const key = Object.values(values).join('|');
  if (key === lastReadout) return;
  lastReadout = key;
  readout.replaceChildren(...Object.entries(values).map(([k, v]) => {
    const d = document.createElement('div');
    d.innerHTML = '<dt></dt><dd></dd>';
    d.firstChild.textContent = k;
    d.lastChild.textContent = v;
    return d;
  }));
}

// ---------- sky ----------
let skyMode = 'auto';
$('sky').addEventListener('change', (e) => { skyMode = e.target.value; });

// Ground choices. White and black are plain studio backdrops: the sky matches the floor.
const BACKDROPS = {
  photo: { ground: 0x4b6b3c },
  grass: { ground: 0x4b6b3c },
  white: { ground: 0xecece8, sky: new THREE.Color('#f3f3f0') },
  black: { ground: 0x101114, sky: new THREE.Color('#0a0b0d') },
};
let backdrop = 'photo';
function setBackdrop(value) {
  backdrop = BACKDROPS[value] ? value : 'photo';
  satRoot.visible = backdrop === 'photo';
  ground.material.color.setHex(BACKDROPS[backdrop].ground);
  $('backdrop').value = backdrop;
  try { localStorage.setItem('megatree.backdrop', backdrop); } catch { /* storage unavailable */ }
}
$('backdrop').addEventListener('change', (e) => setBackdrop(e.target.value));
try { setBackdrop(localStorage.getItem('megatree.backdrop') || 'photo'); } catch { setBackdrop('photo'); }

function applySky(nightFromTimeline) {
  const n = skyMode === 'auto' ? nightFromTimeline : (skyMode === 'night' ? 1 : 0);
  const plain = BACKDROPS[backdrop].sky;
  if (plain) scene.background.copy(plain);
  else scene.background.copy(DAY_SKY).lerp(NIGHT_SKY, n);
  scene.fog.color.copy(scene.background);
  hemi.intensity = THREE.MathUtils.lerp(1.1, 0.05, n);
  sun.intensity = THREE.MathUtils.lerp(2.4, 0, n);
  moon.intensity = THREE.MathUtils.lerp(0, 0.35, n);
  bloom.strength = THREE.MathUtils.lerp(0.15, 1.05, n);
  bloom.threshold = THREE.MathUtils.lerp(0.85, 0.15, n);
  renderer.toneMappingExposure = THREE.MathUtils.lerp(1.0, 1.15, n);
  return n;
}

function placeSun() {
  const north = new THREE.Vector3(0, 0, -1).applyAxisAngle(THREE.Object3D.DEFAULT_UP, satRoot.rotation.y);
  const east = new THREE.Vector3().crossVectors(north, THREE.Object3D.DEFAULT_UP);
  // Southern-hemisphere midday-ish sun sits to the north; flip if the site is north of the equator.
  const toSun = north.multiplyScalar(site.lat != null && site.lat > 0 ? -6 : 6).addScaledVector(east, 3);
  sun.position.set(toSun.x, 12, toSun.z);
  sun.target.position.set(0, 3, 0);
}

// ---------- site / satellite ----------
const site = { ...SITE, ...readSavedSite() };
let satMesh = null;

function readSavedSite() {
  const out = {};
  try { Object.assign(out, JSON.parse(localStorage.getItem('megatree.site') || '{}')); } catch { /* storage unavailable */ }
  const q = new URLSearchParams(location.search);
  if (q.has('lat') && q.has('lon')) {
    out.lat = Number(q.get('lat'));
    out.lon = Number(q.get('lon'));
    out.source = 'satellite';
  }
  if (q.has('brg')) out.houseBearing = Number(q.get('brg'));
  if (q.has('z')) out.zoom = Number(q.get('z'));
  return out;
}
// site.source records which imagery to restore on the next visit: 'satellite', 'photo' or null.
function saveSite() {
  try {
    localStorage.setItem('megatree.site', JSON.stringify({
      lat: site.lat, lon: site.lon, houseBearing: site.houseBearing, zoom: site.zoom, source: site.source,
    }));
  } catch { /* storage unavailable */ }
  if (satMesh?.userData.photo) {
    const { photo, mpp } = satMesh.userData;
    idbSet('photo', { blob: photo, mpp, x: satMesh.position.x, z: satMesh.position.z });
  }
}

async function showPhoto(blob, mpp, position) {
  const { mesh } = await loadImageFile(blob, mpp);
  Object.assign(mesh.userData, { photo: blob, mpp });
  if (position) mesh.position.set(position.x, mesh.position.y, position.z);
  replaceImagery(mesh);
  $('aerialScale').value = String(mpp);
  $('attribution').textContent = '';
}

async function restorePhoto() {
  const saved = await idbGet('photo');
  if (!saved?.blob) {
    setStatus('The saved photo is no longer in this browser. Upload it again.', true);
    return;
  }
  try {
    await showPhoto(saved.blob, saved.mpp, saved);
    setStatus('Restored your saved photo.');
  } catch (err) {
    setStatus(`Couldn't restore the saved photo: ${err.message}`, true);
  }
}
function setStatus(msg, isError = false) {
  $('siteStatus').textContent = msg;
  $('siteStatus').classList.toggle('error', isError);
}
function setBearing(deg) {
  site.houseBearing = ((Number(deg) % 360) + 360) % 360;
  satRoot.rotation.y = THREE.MathUtils.degToRad(site.houseBearing);
  $('bearing').value = site.houseBearing;
  $('bearingOut').textContent = `${Math.round(site.houseBearing)}°`;
  placeSun();
}
function replaceImagery(mesh) {
  if (satMesh) {
    satRoot.remove(satMesh);
    satMesh.geometry.dispose();
    satMesh.material.map?.dispose();
    satMesh.material.dispose();
  }
  satMesh = mesh;
  if (mesh) satRoot.add(mesh);
}

function parseLatLon(text) {
  const m = text.match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

async function loadSatellite() {
  const ll = parseLatLon($('latlon').value);
  if (!ll) {
    setStatus('Enter the location as "lat, lon", e.g. -33.865143, 151.209900.', true);
    return;
  }
  Object.assign(site, ll, { zoom: Number($('zoom').value) });
  setStatus('Loading satellite tiles…');
  try {
    const { mesh, loaded, total } = await loadTiles(site);
    replaceImagery(mesh);
    site.source = 'satellite';
    saveSite();
    placeSun();
    $('attribution').textContent = ATTRIBUTION;
    setStatus(loaded < total
      ? `Loaded ${loaded} of ${total} tiles. Try a lower detail level if there are gaps.`
      : 'Satellite loaded. Turn the house direction slider until the house lines up.');
  } catch (err) {
    setStatus(err.message, true);
  }
}

$('latlon').value = site.lat != null ? `${site.lat.toFixed(6)}, ${site.lon.toFixed(6)}` : '';
$('zoom').value = String(site.zoom);
setBearing(site.houseBearing);
if (site.source === 'photo') restorePhoto();
else if (site.lat != null && site.source !== null && !(SITE.photo && site.source === undefined)) loadSatellite();
else if (SITE.photo && site.source === undefined) loadRepoPhoto();

async function loadRepoPhoto() {
  const { src, metresPerPixel, offset = [0, 0] } = SITE.photo;
  try {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`${src} returned ${res.status}`);
    await showPhoto(await res.blob(), metresPerPixel, { x: offset[0], z: offset[1] });
    satMesh.userData.photo = null;   // the repo copy is the source of truth; don't duplicate it locally
  } catch (err) {
    setStatus(`Couldn't load the site photo: ${err.message}`, true);
  }
}

$('loadSat').addEventListener('click', loadSatellite);
$('bearing').addEventListener('input', (e) => { setBearing(e.target.value); saveSite(); });
$('clearSat').addEventListener('click', () => {
  setMovingImagery(false);
  replaceImagery(null);
  site.source = null;
  saveSite();
  idbDelete('photo');
  $('attribution').textContent = '';
  setStatus('Imagery removed.');
});
$('loadAerial').addEventListener('click', async () => {
  const file = $('aerialFile').files[0];
  const mpp = Number($('aerialScale').value);
  if (!file || !(mpp > 0)) {
    setStatus('Choose an image file and enter its scale in metres per pixel.', true);
    return;
  }
  try {
    await showPhoto(file, mpp);
    site.source = 'photo';
    saveSite();
    setStatus('Photo placed and saved in this browser. Use "Move imagery" to drag it into place, then set the house direction.');
  } catch (err) {
    setStatus(`Couldn't read that image: ${err.message}`, true);
  }
});
// Rescale a placed photo about the stub so the stub stays on the same spot in the image.
$('aerialScale').addEventListener('change', () => {
  const mpp = Number($('aerialScale').value);
  const placed = satMesh?.userData.mpp;
  if (!placed || !(mpp > 0)) return;
  const k = mpp / placed;
  satMesh.scale.x *= k;
  satMesh.scale.z *= k;
  satMesh.position.x *= k;
  satMesh.position.z *= k;
  satMesh.userData.mpp = mpp;
  saveSite();
});

// Placement in the form js/config.js expects, so a placed photo can be committed for everyone.
$('copyPlacement').addEventListener('click', async () => {
  if (!satMesh) {
    setStatus('Place a photo or load satellite imagery first.', true);
    return;
  }
  const r = (v, d = 3) => Number(v.toFixed(d));
  const out = { houseBearing: r(site.houseBearing, 1) };
  if (site.lat != null) Object.assign(out, { lat: r(site.lat, 7), lon: r(site.lon, 7) });
  if (satMesh.userData.mpp) {
    out.photo = { src: 'site/aerial.jpg', metresPerPixel: satMesh.userData.mpp, offset: [r(satMesh.position.x), r(satMesh.position.z)] };
  }
  const text = JSON.stringify(out, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    setStatus('Placement copied. Paste it to Claude along with the photo to commit it.');
  } catch {
    setStatus(text);
  }
});

$('copyLink').addEventListener('click', async () => {
  if (site.lat == null) {
    setStatus('Load a satellite location first.', true);
    return;
  }
  const url = new URL(location.href);
  url.search = new URLSearchParams({
    lat: site.lat.toFixed(7), lon: site.lon.toFixed(7), brg: String(Math.round(site.houseBearing)), z: String(site.zoom),
  }).toString();
  try {
    await navigator.clipboard.writeText(url.toString());
    setStatus('Link copied.');
  } catch {
    setStatus(url.toString());
  }
});

let pickingStub = false;
$('pickStub').addEventListener('click', () => {
  pickingStub = !pickingStub;
  $('pickStub').setAttribute('aria-pressed', String(pickingStub));
  setStatus(pickingStub ? 'Click where the NB50 stub is on the imagery.' : '');
});
function toggleSitePanel(open) {
  $('sitePanel').hidden = !open;
  if (!open && movingImagery) setMovingImagery(false);
  $('siteBtn').setAttribute('aria-expanded', String(open));
}
$('siteBtn').addEventListener('click', () => toggleSitePanel($('sitePanel').hidden));
$('siteClose').addEventListener('click', () => toggleSitePanel(false));

// Shift the imagery by `delta` (world metres) and move the stored lat/lon to match, so the stub stays the origin.
function shiftImagery(delta) {
  const local = delta.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, -satRoot.rotation.y);
  satMesh.position.x += local.x;
  satMesh.position.z += local.z;
  if (site.lat != null) {
    site.lat += local.z / 111320;
    site.lon -= local.x / (111320 * Math.cos(THREE.MathUtils.degToRad(site.lat)));
    $('latlon').value = `${site.lat.toFixed(7)}, ${site.lon.toFixed(7)}`;
  }
}

function moveStubTo(worldPoint) {
  if (!satMesh) return;
  shiftImagery(worldPoint.clone().negate());
  saveSite();
  pickingStub = false;
  $('pickStub').setAttribute('aria-pressed', 'false');
  setStatus('Stub moved. Now turn the house direction slider until the house lines up.');
}

// Move-imagery mode: left-drag moves the imagery, Shift-drag rotates it about the stub.
// Right-drag and the scroll wheel still pan and zoom the camera.
let movingImagery = false;
let drag = null;
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function setMovingImagery(on) {
  movingImagery = on && !!satMesh;
  document.body.classList.toggle('moving-imagery', movingImagery);
  $('moveSat').setAttribute('aria-pressed', String(movingImagery));
  if (on && !satMesh) setStatus('Load satellite imagery or a photo first.', true);
  else if (movingImagery) setStatus('Drag the imagery to move it. Shift-drag to rotate it around the stub. Click "Move imagery" again when done.');
  else if (on === false) setStatus('');
}

function groundPoint(e) {
  const r = canvas.getBoundingClientRect();
  pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  return raycaster.ray.intersectPlane(groundPlane, new THREE.Vector3());
}

$('moveSat').addEventListener('click', () => {
  pickingStub = false;
  $('pickStub').setAttribute('aria-pressed', 'false');
  setMovingImagery(!movingImagery);
});

// Capture phase on window runs before OrbitControls' own listener on the canvas.
addEventListener('pointerdown', (e) => {
  if (!movingImagery || e.target !== canvas || e.button !== 0) return;
  const start = groundPoint(e);
  if (!start || !pick(e, [satMesh])) return;
  e.stopPropagation();
  drag = { id: e.pointerId, last: start, rotate: e.shiftKey || e.altKey };
  document.body.classList.add('dragging');
}, { capture: true });

addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const p = groundPoint(e);
  if (!p) return;
  if (drag.rotate) {
    // Angle about the stub, counter-clockwise seen from above, matching rotation.y.
    const turn = Math.atan2(-p.z, p.x) - Math.atan2(-drag.last.z, drag.last.x);
    setBearing(site.houseBearing + THREE.MathUtils.radToDeg(turn));
  } else {
    shiftImagery(p.clone().sub(drag.last));
  }
  drag.last = p;
});

addEventListener('pointerup', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  drag = null;
  document.body.classList.remove('dragging');
  saveSite();
});

// ---------- picking ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const tooltip = $('tooltip');
let hoverQueued = null;

function shown(obj) {
  for (let o = obj; o; o = o.parent) if (!o.visible) return false;
  return true;
}
function pick(e, objects) {
  const r = canvas.getBoundingClientRect();
  pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObjects(objects, false).find((h) => shown(h.object));
}

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || e.buttons || movingImagery) {
    tooltip.hidden = true;
    return;
  }
  hoverQueued = e;
});
canvas.addEventListener('pointerleave', () => { tooltip.hidden = true; hoverQueued = null; });
let downAt = null;
canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', (e) => {
  if (!pickingStub || !downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  const hit = pick(e, [satMesh, ground].filter(Boolean));
  if (hit) moveStubTo(hit.point);
});

function updateHover() {
  if (!hoverQueued) return;
  const e = hoverQueued;
  hoverQueued = null;
  const hit = pick(e, model.pickables);
  const part = hit && model.partAt(hit);
  if (!part) {
    tooltip.hidden = true;
    return;
  }
  tooltip.innerHTML = '<b></b><span></span>';
  tooltip.firstChild.textContent = part.name;
  tooltip.lastChild.textContent = part.group;
  tooltip.hidden = false;
  const x = Math.min(e.clientX + 14, innerWidth - tooltip.offsetWidth - 8);
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${e.clientY + 16}px`;
}

// ---------- loop ----------
const timer = new THREE.Timer();
timer.connect(document);
let showTime = 0;
const starColor = new THREE.Color();

function fmt(t) {
  const m = Math.floor(t / 60);
  return `${m}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
}

function frame(now) {
  timer.update(now);
  const dt = Math.min(timer.getDelta(), 0.1);
  if (playing) {
    time = Math.min(timeline.total, time + dt * speed);
    if (time >= timeline.total) setPlaying(false);
  }
  const state = timeline.stateAt(time);
  const step = timeline.stepAt(time);
  if (step !== shownStep) {
    shownStep = step;
    showStep(step);
  }

  model.apply(state);
  const simDt = dt * (playing ? speed : 1);
  strings.update(simDt, state.topper / 1000, state.strings, needsSettle);
  guyProgress(state);
  guys.update(simDt, model.guyTabsWorld(guyTabs), guyOn, guyAnchored, needsSettle);
  needsSettle = false;

  showTime += dt;
  const effect = EFFECTS[$('effect').value]({ t: showTime, n: strings.n, p: strings.p });
  strings.render(effect, state.lights);
  if (model.starPixels) {
    effect(0, Math.floor(strings.p / 2), starColor);
    model.starPixels.emissive.copy(starColor).multiplyScalar(state.lights * 0.8);
  }

  const night = applySky(state.night);
  model.setNight(night);
  guys.setNight(night);
  updateReadout(state);
  if (document.activeElement !== scrubber) scrubber.value = time;
  $('clock').textContent = fmt(time);

  updateTween(dt);
  controls.update();
  updateHover();
  composer.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
setPlaying(!reducedMotion);
