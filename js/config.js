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
  fitBasePlate: 0, fitPlateNuts: 0, fitLeaf: 0, fitPin: 0, fitPole: 0, fitHead: 0,
  fitTopper: 0, fitCollar: 0, fitBracket: 0, fitSleeve: 0, insert: 0, cable: 0,
  guyTopOn: 0, guyTopAnchor: 0, fitLeafLock: 0, fitStar: 0, strings: 0,
  guyMidOn: 0, guyMidAnchor: 0, lights: 0, night: 0,
  hinge: 'rest', sleeve: 280, collar: -2200, topper: -5070,
};

// tracks: key → [from, to] or [from, to, startFrac, endFrac] within the step.
// 'rest' resolves to the hinge angle at which the pole lies on the sawhorse.
export const STEPS = [
  {
    title: 'Base plate onto the studs',
    text: 'The NB50 stub is already in the ground. Lower the base plate over the four M12 studs onto the levelling nuts.',
    duration: 4,
    tracks: { fitBasePlate: [0, 1] },
    camera: { pos: [0.75, 0.6, 0.85], target: [0, 0.05, -0.1] },
  },
  {
    title: 'Bolt the base plate down',
    text: 'Spin the four M12 Nyloc nuts down onto the plate.',
    duration: 5,
    tracks: { fitPlateNuts: [0, 1] },
    camera: { pos: [0.55, 0.5, 0.6], target: [0, 0.05, -0.1] },
  },
  {
    title: 'Hinged leaf onto the pin',
    text: 'Seat the leaf between the hinge lugs, lying back toward the house, then push the M16 pin through and fit the Nyloc.',
    duration: 5,
    tracks: { fitLeaf: [0, 1, 0, 0.5], fitPin: [0, 1, 0.5, 1] },
    camera: { pos: [0.8, 0.6, 0.5], target: [0, 0.1, -0.2] },
  },
  {
    title: 'Assemble the pole',
    text: 'Join the three sections with the couplers on the sawhorse, and fit the pulley head to the top.',
    duration: 6,
    tracks: { fitPole: [0, 1, 0, 0.7], fitHead: [0, 1, 0.7, 1] },
    camera: { pos: [4.5, 2.6, 0.2], target: [0, 0.4, -4.5] },
  },
  {
    title: 'Slide on topper, collar, bracket and sleeve',
    text: 'From the bottom end, in order: topper assembly, mid collar, winch bracket, then the lock sleeve. None of them can go on once the pole is in the leaf.',
    duration: 10,
    tracks: {
      fitTopper: [0, 1, 0, 0.25], fitCollar: [0, 1, 0.25, 0.5],
      fitBracket: [0, 1, 0.5, 0.75], fitSleeve: [0, 1, 0.75, 1],
    },
    camera: { pos: [2.4, 1.5, 0.4], target: [0, 0.35, -1.7] },
  },
  {
    title: 'Pole into the hinged leaf',
    text: 'Slide the pole down into the leaf socket and tighten the socket grub screws.',
    duration: 4,
    tracks: { insert: [0, 1] },
    camera: { pos: [1.6, 1.0, 0.6], target: [0, 0.25, -0.8] },
  },
  {
    title: 'Reeve the winch cable',
    text: 'Cable from the winch drum, up over the sheave in the pulley head, and back down to the topper lift lug.',
    duration: 5,
    tracks: { cable: [0, 1] },
    camera: { pos: [3.5, 2.2, -3.5], target: [0, 0.6, -5.5] },
  },
  {
    title: 'Clip the top guys to the head',
    text: 'While the head is in reach, clip the three top guys to its guy tabs. They trail on the ground for the walk-up.',
    duration: 5,
    tracks: { guyTopOn: [0, 1] },
    camera: { pos: [2.2, 1.6, -5.6], target: [0, 0.6, -7.6] },
  },
  {
    title: 'Walk the pole up',
    text: 'Walk the pole up about the hinge pin from the sawhorse to vertical (hinge 81.5° → 0°).',
    duration: 7,
    tracks: { hinge: ['rest', 0] },
    camera: { pos: [9, 4.5, 6], target: [0, 3, -1.5] },
  },
  {
    title: 'Anchor the top guys',
    text: 'Straight away, carry each top guy to its anchor and clip it on.',
    duration: 6,
    tracks: { guyTopAnchor: [0, 1] },
    camera: { pos: [7, 5.5, 8], target: [0, 3, -0.5] },
  },
  {
    title: 'Drop the lock sleeve, bolt the leaf',
    text: 'Slide the lock sleeve down over the NB50 stub (+280 → 0) and clamp it. Bolt the leaf to the plate with the two M12 leaf-lock bolts.',
    duration: 5,
    tracks: { sleeve: [280, 0, 0, 0.55], fitLeafLock: [0, 1, 0.6, 1] },
    camera: { pos: [0.9, 0.8, 0.9], target: [0, 0.25, -0.05] },
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
    text: 'Crank the winch. The topper climbs 5070 mm to park and lifts the strings into the cone.',
    duration: 10,
    tracks: { topper: [-5070, 0] },
    camera: { pos: [9, 4.5, 9], target: [0, 3.5, 0] },
  },
  {
    title: 'Mid guys on, slide the collar up',
    text: 'Clip the three mid guys to the collar while it sits on the bracket, then slide it up to 3650 and clamp it.',
    duration: 7,
    tracks: { guyMidOn: [0, 1, 0, 0.35], collar: [-2200, 400, 0.4, 1] },
    camera: { pos: [3.5, 2.8, 4], target: [0, 2, 0] },
  },
  {
    title: 'Anchor the mid guys',
    text: 'Carry each mid guy to its anchor and clip it on. Tension all six until the pole is plumb.',
    duration: 6,
    tracks: { guyMidAnchor: [0, 1] },
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
    text: 'Reverse order. Lights off, unclip the mid guys from their anchors, drop the collar to the bracket and unclip them, then winch the topper low.',
    duration: 12,
    tracks: {
      lights: [1, 0, 0, 0.06], night: [1, 0, 0.04, 0.16], guyMidAnchor: [1, 0, 0.1, 0.25],
      collar: [400, -2200, 0.25, 0.42], guyMidOn: [1, 0, 0.42, 0.5], topper: [0, -5070, 0.5, 1],
    },
    camera: { pos: [9, 4.5, 9], target: [0, 3, 0] },
  },
  {
    title: 'Strike: walk the pole down',
    text: 'Unhook the strings, lift off the star, unbolt the leaf and raise the lock sleeve. Unclip the top guys from their anchors, walk the pole down onto the sawhorse, and unclip them from the head.',
    duration: 14,
    tracks: {
      strings: [1, 0, 0, 0.18], fitStar: [1, 0, 0.18, 0.28], fitLeafLock: [1, 0, 0.28, 0.36],
      sleeve: [0, 280, 0.36, 0.44], guyTopAnchor: [1, 0, 0.44, 0.58], hinge: [0, 'rest', 0.6, 0.92],
      guyTopOn: [1, 0, 0.92, 1],
    },
    camera: { pos: [9, 4.5, 6], target: [0, 2.5, -2.5] },
  },
];
