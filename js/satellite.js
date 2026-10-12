import * as THREE from 'three';

const TILE = 256;
const EARTH_MPP = 156543.03392;   // Web Mercator metres per pixel at zoom 0, equator
const TILE_URL = (z, x, y) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

export const ATTRIBUTION = 'Imagery © Esri, Maxar, Earthstar Geographics';

function project(lat, lon, z) {
  const scale = TILE * 2 ** z;
  const r = THREE.MathUtils.degToRad(lat);
  return {
    x: ((lon + 180) / 360) * scale,
    y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * scale,
  };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed: ${src}`));
    img.src = src;
  });
}

// Satellite tiles stitched around (lat, lon). The returned plane is centred so (lat, lon) is at the origin.
export async function loadTiles({ lat, lon, zoom, tileRadius }) {
  const centre = project(lat, lon, zoom);
  const cx = Math.floor(centre.x / TILE);
  const cy = Math.floor(centre.y / TILE);
  const span = tileRadius * 2 + 1;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = span * TILE;
  const ctx = canvas.getContext('2d');

  const jobs = [];
  for (let dy = -tileRadius; dy <= tileRadius; dy++) {
    for (let dx = -tileRadius; dx <= tileRadius; dx++) {
      jobs.push(loadImage(TILE_URL(zoom, cx + dx, cy + dy)).then((img) => {
        ctx.drawImage(img, (dx + tileRadius) * TILE, (dy + tileRadius) * TILE);
      }));
    }
  }
  const results = await Promise.allSettled(jobs);
  const loaded = results.filter((r) => r.status === 'fulfilled').length;
  if (!loaded) throw new Error('No satellite tiles loaded. Check the network connection, or upload an aerial image instead.');

  const mpp = (EARTH_MPP * Math.cos(THREE.MathUtils.degToRad(lat))) / 2 ** zoom;
  const px = centre.x - (cx - tileRadius) * TILE;
  const py = centre.y - (cy - tileRadius) * TILE;
  return { mesh: imagePlane(canvas, mpp, px, py), loaded, total: jobs.length };
}

// An aerial image the user supplies, at a known scale, centred on the image until moved.
export async function loadImageFile(file, metresPerPixel) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    return { mesh: imagePlane(img, metresPerPixel, img.width / 2, img.height / 2) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function imagePlane(source, mpp, originPx, originPy) {
  const w = source.width;
  const h = source.height;
  const tex = new THREE.Texture(source);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  const geo = new THREE.PlaneGeometry(w * mpp, h * mpp);
  geo.rotateX(-Math.PI / 2);   // image top → -Z (north before the bearing rotation)
  // Sits a hair above the grass; polygonOffset stops the two flickering through each other when zoomed out.
  const mat = new THREE.MeshStandardMaterial({
    map: tex, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((w / 2 - originPx) * mpp, 0.002, (h / 2 - originPy) * mpp);
  mesh.receiveShadow = true;
  return mesh;
}
