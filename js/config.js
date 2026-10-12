// Joint values use Fusion units: hinge in degrees, sliders in mm, same sign conventions
// as fusion-export/joints.json. Appearance tracks (fit*) run 0 → 1 as a part is fitted.

export const SITE = {
  // NB50 ground stub centre. Right-click the spot in Google Maps to copy "lat, lon".
  lat: null,
  lon: null,
  // Compass bearing (degrees clockwise from north) of Fusion +Y, i.e. from the stub toward the house.
  houseBearing: 359,
  zoom: 20,
  tileRadius: 3,
  // An aerial photo committed to the repo, shown to everyone who hasn't placed their own.
  // Paste the output of Site → "Copy placement" here, e.g.
  // { src: 'site/aerial.jpg', metresPerPixel: 0.05, offset: [1.2, -3.4] }
  photo: { src: 'site/aerial.jpeg', metresPerPixel: 0.015, offset: [-6.059, -2.717] },
};

export const LIGHTS = {
  pixelsPerString: 50,   // not in the Fusion export — set to the real pixel count
};

export const SAWHORSE = { distance: 3.0, height: 0.6 };  // metres from the hinge toward the house

export const RIG = {
  crankMmPerTurn: 250,   // visual only; the Jarrett gear ratio isn't in the export
};

export const INITIAL_STATE = {
  fitStub: 0, fitBase: 0, fitLeaf: 0, fitPole: 0, fitBracket: 0, fitCollar: 0, fitTopper: 0,
  fitHead: 0, fitSleeve: 0, cable: 0, fitStar: 0, strings: 0, guys: 0, lights: 0, night: 0,
  hinge: 'rest', sleeve: 280, collar: -2200, topper: -5070,
};

// tracks: key → [from, to] or [from, to, startFrac, endFrac] within the step.
// 'rest' resolves to the hinge angle at which the pole lies on the sawhorse.
export const STEPS = [
  {
    title: 'Ground stub & base plate',
    text: 'NB50 stub set 945 mm in the ground. Base plate drops over the studs and is levelled on the M12 nuts.',
    duration: 5,
    tracks: { fitStub: [0, 1, 0, 0.5], fitBase: [0, 1, 0.5, 1] },
    camera: { pos: [0.9, 0.7, 1.1], target: [0, 0.15, -0.05] },
  },
  {
    title: 'Hinged leaf onto the pin',
    text: 'Leaf with pole socket goes onto the M16 hinge pin, lying back toward the house.',
    duration: 4,
    tracks: { fitLeaf: [0, 1] },
    camera: { pos: [0.8, 0.6, 0.6], target: [0, 0.15, -0.2] },
  },
  {
    title: 'Assemble the pole on the sawhorse',
    text: 'Three sections joined with couplers, lying toward the house on a sawhorse about 600 high and 3 m out.',
    duration: 6,
    tracks: { fitPole: [0, 1] },
    camera: { pos: [4.5, 2.6, 1.2], target: [0, 0.4, -3.5] },
  },
  {
    title: 'Slide on bracket, collar and topper',
    text: 'From the top end: winch bracket (pinned), mid collar resting on the bracket, then the topper resting on the collar.',
    duration: 8,
    tracks: { fitBracket: [0, 1, 0, 0.33], fitCollar: [0, 1, 0.33, 0.66], fitTopper: [0, 1, 0.66, 1] },
    camera: { pos: [2.2, 1.6, 0.4], target: [0, 0.35, -1.4] },
  },
  {
    title: 'Fit pulley head & reeve the cable',
    text: 'Pulley topper onto the pole top. Cable from the winch drum, up over the sheave, down to the topper lift lug.',
    duration: 6,
    tracks: { fitHead: [0, 1, 0, 0.4], cable: [0, 1, 0.4, 1] },
    camera: { pos: [3.5, 2.2, -3.5], target: [0, 0.6, -5.5] },
  },
  {
    title: 'Lock sleeve on, raised',
    text: 'Lock sleeve halves clamped on, slid up +280 so the pole can pivot clear of the stub.',
    duration: 3.5,
    tracks: { fitSleeve: [0, 1] },
    camera: { pos: [1.0, 0.8, 0.7], target: [0, 0.3, -0.3] },
  },
  {
    title: 'Walk the pole up',
    text: 'Walk the pole up about the hinge pin from the sawhorse to vertical (hinge 90° → 0°).',
    duration: 7,
    tracks: { hinge: ['rest', 0] },
    camera: { pos: [9, 4.5, 6], target: [0, 3, -1.5] },
  },
  {
    title: 'Drop the lock sleeve',
    text: 'Lock sleeve slides down over the NB50 stub (+280 → 0). Tighten the grub screws.',
    duration: 3.5,
    tracks: { sleeve: [280, 0] },
    camera: { pos: [0.9, 0.8, 0.9], target: [0, 0.3, 0] },
  },
  {
    title: 'Fit the star',
    text: 'With the topper still low, the star mast drops into its socket on the topper.',
    duration: 4,
    tracks: { fitStar: [0, 1] },
    camera: { pos: [2.6, 2.2, 3.2], target: [0, 1.8, 0] },
  },
  {
    title: 'Hang the strings',
    text: 'Hook each string to the topper and to the base ring. Slack lies on the ground for now.',
    duration: 6,
    tracks: { strings: [0, 1] },
    camera: { pos: [3.2, 2.4, 4.2], target: [0, 0.9, 0] },
  },
  {
    title: 'Winch the topper to park',
    text: 'Crank the winch. Topper climbs 5070 mm to park and lifts the strings into the cone.',
    duration: 10,
    tracks: { topper: [-5070, 0] },
    camera: { pos: [9, 4.5, 9], target: [0, 3.5, 0] },
  },
  {
    title: 'Slide the collar up',
    text: 'Mid collar slides from the bracket up to 3650 and is clamped with the grub screws.',
    duration: 4,
    tracks: { collar: [-2200, 400] },
    camera: { pos: [3, 3.5, 3.5], target: [0, 2.6, 0] },
  },
  {
    title: 'Guys',
    text: 'Three top guys from the pulley head, three mid guys from the collar. Tension until plumb.',
    duration: 5,
    tracks: { guys: [0, 1] },
    camera: { pos: [7, 6, 8], target: [0, 3, 0] },
  },
  {
    title: 'Lights on',
    text: 'Power and data on. Showtime.',
    duration: 14,
    tracks: { night: [0, 1, 0, 0.25], lights: [0, 1, 0.25, 0.5] },
    camera: { pos: [9, 4, 11], target: [0, 3.5, 0] },
  },
  {
    title: 'Strike: topper down',
    text: 'Reverse order. Lights off, guys off, collar down onto the bracket, winch the topper low.',
    duration: 10,
    tracks: {
      lights: [1, 0, 0, 0.08], night: [1, 0, 0.05, 0.2], guys: [1, 0, 0.1, 0.25],
      collar: [400, -2200, 0.25, 0.45], topper: [0, -5070, 0.45, 1],
    },
    camera: { pos: [9, 4.5, 9], target: [0, 3, 0] },
  },
  {
    title: 'Strike: strings, star, walk down',
    text: 'Unhook the strings, lift off the star, raise the lock sleeve and walk the pole down onto the sawhorse.',
    duration: 10,
    tracks: {
      strings: [1, 0, 0, 0.25], fitStar: [1, 0, 0.25, 0.4], sleeve: [0, 280, 0.4, 0.5],
      hinge: [0, 'rest', 0.5, 1],
    },
    camera: { pos: [9, 4.5, 6], target: [0, 2.5, -1.5] },
  },
];
