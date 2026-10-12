const DEFAULT_HOLD = 1;

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const clamp01 = (t) => Math.min(1, Math.max(0, t));

export class Timeline {
  // symbols maps named values used in tracks (e.g. 'rest') to numbers.
  constructor(steps, initialState, symbols = {}) {
    const resolve = (v) => (typeof v === 'string' ? symbols[v] : v);
    this.steps = steps.map((s) => ({
      ...s,
      tracks: Object.fromEntries(
        Object.entries(s.tracks).map(([k, [from, to, a, b]]) => [k, [resolve(from), resolve(to), a, b]]),
      ),
    }));
    this.initialState = Object.fromEntries(
      Object.entries(initialState).map(([k, v]) => [k, resolve(v)]),
    );
    let t = 0;
    this.starts = this.steps.map((s) => {
      const start = t;
      t += s.duration;
      return start;
    });
    this.total = t;
  }

  stepAt(time) {
    for (let i = this.steps.length - 1; i >= 0; i--) {
      if (time >= this.starts[i]) return i;
    }
    return 0;
  }

  // Recomputed from scratch each call so scrubbing backwards is exact.
  stateAt(time) {
    const state = { ...this.initialState };
    this.steps.forEach((step, i) => {
      const local = time - this.starts[i];
      if (local < 0) return;
      const animLen = Math.max(0.001, step.duration - (step.hold ?? DEFAULT_HOLD));
      const p = clamp01(local / animLen);
      for (const [key, [from, to, a = 0, b = 1]] of Object.entries(step.tracks)) {
        const k = easeInOut(clamp01((p - a) / Math.max(0.001, b - a)));
        state[key] = from + (to - from) * k;
      }
    });
    return state;
  }
}
