// Each effect returns (i, k, out) => void, colouring string i, pixel k (0 = top) into a THREE.Color.
// stringCount/pixels let effects work in "fraction around" / "fraction down" terms.

const hash = (a, b) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export const EFFECTS = {
  'Rainbow spiral': ({ t, n, p }) => (i, k, out) => {
    out.setHSL((((i / n) + (k / p) * 1.3 - t * 0.25) % 1 + 1) % 1, 1, 0.55);
  },
  'Candy cane': ({ t, n, p }) => (i, k, out) => {
    const band = Math.floor(((i / n) * 3 + (k / p) * 4 + t * 0.6) * 2) % 2;
    out.setRGB(band ? 1.2 : 1.0, band ? 1.1 : 0.04, band ? 1.0 : 0.06);
  },
  'Falling snow': ({ t, p }) => (i, k, out) => {
    const head = ((t * 0.45 + hash(i, 1)) % 1) * p;
    const d = k - head;
    const tail = d <= 0 && d > -10 ? Math.exp(d / 3) : 0;
    out.setRGB(0.02 + tail * 1.3, 0.04 + tail * 1.4, 0.18 + tail * 1.6);
  },
  'Warm twinkle': ({ t }) => (i, k, out) => {
    const tw = 0.55 + 0.45 * Math.sin(t * (2 + hash(i, k) * 5) + hash(k, i) * 40);
    out.setRGB(1.25 * tw, 0.72 * tw, 0.28 * tw);
  },
  'Red & green chase': ({ t, p }) => (i, k, out) => {
    const pulse = Math.max(0, Math.sin((k / p) * 18 - t * 7)) ** 3;
    if (i % 2) out.setRGB(1.3 * pulse + 0.05, 0.02, 0.02);
    else out.setRGB(0.02, 1.2 * pulse + 0.05, 0.08);
  },
};
