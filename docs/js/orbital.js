/**
 * orbital.js — Keplerian planetary positions for the WECORE hero solar system.
 *
 * Tier-1, self-contained, NO network. Computes heliocentric ecliptic positions
 * of the 8 major planets from mean orbital elements + secular rates. This is
 * visual-grade accuracy (correct relative configuration and revolution speeds),
 * not an ephemeris.
 *
 * ── Source / attribution ────────────────────────────────────────────────────
 * Orbital elements and the solution algorithm are the public-domain set from:
 *
 *   E. M. Standish, "Keplerian Elements for Approximate Positions of the Major
 *   Planets", Jet Propulsion Laboratory, Solar System Dynamics.
 *   https://ssd.jpl.nasa.gov/planets/approx_pos.html  (Table 1, valid 1800-2050)
 *
 * Each planet has elements at epoch J2000.0 and their rates per Julian century:
 *   a   semi-major axis            (AU, AU/century)
 *   e   eccentricity               (–, /century)
 *   I   inclination                (deg, deg/century)
 *   L   mean longitude             (deg, deg/century)
 *   varpi (ϖ) longitude of perihelion       (deg, deg/century)
 *   Omega (Ω) longitude of ascending node    (deg, deg/century)
 *
 * The "Earth" row is actually the Earth-Moon barycentre (EM Bary), per the table.
 *
 * This module imports nothing and uses no wall-clock randomness, so its output
 * is fully deterministic — the same simulated time always yields the same
 * positions (repo convention; keeps builds/screenshots stable).
 */

const DEG2RAD = Math.PI / 180;
const J2000_JD = 2451545.0; // Julian Date of the J2000.0 epoch (2000-01-01 12:00 TT)

// ── Mean elements at J2000 [value] and per-century rates [rate] ──────────────
// Columns: a, e, I (deg), L (deg), varpi (deg), Omega (deg).
// Verbatim from JPL SSD Table 1 (1800 AD – 2050 AD).
//
// Each planet also carries display/physical metadata (NOT orbital — used by the
// renderer for scientifically-proportioned visuals; values from the NASA NSSDC
// planetary fact sheet, https://nssdc.gsfc.nasa.gov/planetary/factsheet/):
//   diameterKm   true equatorial diameter (km) → display radius via displayRadius()
//   obliquityDeg axial tilt to the orbit, IAU convention 0–180° (>90° = retrograde
//                spin, e.g. Venus 177.4°, Uranus 97.77°)
//   rotationHours sidereal rotation period magnitude (h); spin sense comes from obliquity
//   kind         'terrestrial' | 'gas' | 'ice' (reserved for future material selection)
//   color        refined "true apparent" tint (less cartoonish than raw albedo)
export const PLANETS = [
  {
    name: 'Mercury', color: 0x8a8680, kind: 'terrestrial',
    diameterKm: 4879, obliquityDeg: 0.03, rotationHours: 1407.6,
    a:    [0.38709927,  0.00000037],
    e:    [0.20563593,  0.00001906],
    I:    [7.00497902, -0.00594749],
    L:    [252.25032350, 149472.67411175],
    varpi:[77.45779628,  0.16047689],
    Omega:[48.33076593, -0.12534081],
  },
  {
    name: 'Venus', color: 0xe6d3a3, kind: 'terrestrial',
    diameterKm: 12104, obliquityDeg: 177.4, rotationHours: 5832.5,
    a:    [0.72333566,  0.00000390],
    e:    [0.00677672, -0.00004107],
    I:    [3.39467605, -0.00078890],
    L:    [181.97909950, 58517.81538729],
    varpi:[131.60246718, 0.00268329],
    Omega:[76.67984255, -0.27769418],
  },
  {
    name: 'Earth', color: 0x3f6da8, kind: 'terrestrial',
    diameterKm: 12756, obliquityDeg: 23.44, rotationHours: 23.93,
    a:    [1.00000261,  0.00000562],
    e:    [0.01671123, -0.00004392],
    I:    [-0.00001531, -0.01294668],
    L:    [100.46457166, 35999.37244981],
    varpi:[102.93768193, 0.32327364],
    Omega:[0.0,          0.0],
  },
  {
    name: 'Mars', color: 0xc1683b, kind: 'terrestrial',
    diameterKm: 6792, obliquityDeg: 25.19, rotationHours: 24.62,
    a:    [1.52371034,  0.00001847],
    e:    [0.09339410,  0.00007882],
    I:    [1.84969142, -0.00813131],
    L:    [-4.55343205, 19140.30268499],
    varpi:[-23.94362959, 0.44441088],
    Omega:[49.55953891, -0.29257343],
  },
  {
    name: 'Jupiter', color: 0xcdb083, kind: 'gas',
    diameterKm: 142984, obliquityDeg: 3.13, rotationHours: 9.93,
    a:    [5.20288700, -0.00011607],
    e:    [0.04838624, -0.00013253],
    I:    [1.30439695, -0.00183714],
    L:    [34.39644051, 3034.74612775],
    varpi:[14.72847983, 0.21252668],
    Omega:[100.47390909, 0.20469106],
  },
  {
    name: 'Saturn', color: 0xe3d2a2, kind: 'gas', ring: true,
    diameterKm: 120536, obliquityDeg: 26.73, rotationHours: 10.66,
    a:    [9.53667594, -0.00125060],
    e:    [0.05386179, -0.00050991],
    I:    [2.48599187,  0.00193609],
    L:    [49.95424423, 1222.49362201],
    varpi:[92.59887831, -0.41897216],
    Omega:[113.66242448, -0.28867794],
  },
  {
    name: 'Uranus', color: 0xb9e3e6, kind: 'ice',
    diameterKm: 51118, obliquityDeg: 97.77, rotationHours: 17.24,
    a:    [19.18916464, -0.00196176],
    e:    [0.04725744, -0.00004397],
    I:    [0.77263783, -0.00242939],
    L:    [313.23810451, 428.48202785],
    varpi:[170.95427630, 0.40805281],
    Omega:[74.01692503,  0.04240589],
  },
  {
    name: 'Neptune', color: 0x3f63c9, kind: 'ice',
    diameterKm: 49528, obliquityDeg: 28.32, rotationHours: 16.11,
    a:    [30.06992276,  0.00026291],
    e:    [0.00859048,  0.00005105],
    I:    [1.77004347,  0.00035372],
    L:    [-55.12002969, 218.45945325],
    varpi:[44.96476227, -0.32241464],
    Omega:[131.78422574, -0.00508664],
  },
];

// Lookup by lowercase name (e.g. orbital position queries from the renderer).
export const PLANET_BY_NAME = Object.fromEntries(
  PLANETS.map((p) => [p.name.toLowerCase(), p]),
);

/** Julian centuries past J2000 for a given Julian Date. */
export function julianCentury(jd) {
  return (jd - J2000_JD) / 36525.0;
}

/** Convert a simulated "days past J2000" clock to Julian centuries. */
export function centuryFromDays(daysPastJ2000) {
  return daysPastJ2000 / 36525.0;
}

export const J2000_EPOCH_JD = J2000_JD;

// Wrap an angle in degrees to [-180, 180].
function wrapDeg(deg) {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/**
 * Solve Kepler's equation  M = E - e·sin(E)  for the eccentric anomaly E.
 * M, E in radians; Newton-Raphson, fixed iteration count (deterministic, and
 * e < 0.21 for all planets so it converges in a few steps).
 */
function solveKepler(M, e) {
  let E = M + e * Math.sin(M); // good first guess
  for (let i = 0; i < 8; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-9) break;
  }
  return E;
}

/**
 * Heliocentric position of a planet in the J2000 ecliptic frame.
 *
 * @param {object} planet  one of PLANETS (or PLANET_BY_NAME[...])
 * @param {number} T       time in Julian centuries past J2000
 * @returns {{x:number, y:number, z:number}}  ecliptic rectangular coords in AU
 *          (x → vernal equinox, z → ecliptic north pole, right-handed)
 *
 * Algorithm: JPL SSD "approximate positions" — compute each element at T, form
 * the argument of perihelion ω = ϖ − Ω and mean anomaly M = L − ϖ, solve
 * Kepler's equation, build the in-plane coordinates, then rotate by ω, I, Ω
 * into the ecliptic frame.
 */
export function heliocentricPosition(planet, T) {
  const a = planet.a[0] + planet.a[1] * T;          // AU
  const e = planet.e[0] + planet.e[1] * T;          // –
  const I = (planet.I[0] + planet.I[1] * T) * DEG2RAD;
  const L = planet.L[0] + planet.L[1] * T;          // deg
  const varpi = planet.varpi[0] + planet.varpi[1] * T; // deg
  const Omega = (planet.Omega[0] + planet.Omega[1] * T) * DEG2RAD;

  const omega = (varpi - (planet.Omega[0] + planet.Omega[1] * T)) * DEG2RAD; // arg. of perihelion ω = ϖ − Ω
  const M = wrapDeg(L - varpi) * DEG2RAD;            // mean anomaly, wrapped

  const E = solveKepler(M, e);

  // Coordinates in the orbital plane (x' toward perihelion).
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);

  const cosO = Math.cos(Omega), sinO = Math.sin(Omega);
  const cosw = Math.cos(omega), sinw = Math.sin(omega);
  const cosI = Math.cos(I), sinI = Math.sin(I);

  // Rotate orbital-plane → ecliptic (standard 3-1-3 Euler rotation).
  const x = (cosw * cosO - sinw * sinO * cosI) * xp + (-sinw * cosO - cosw * sinO * cosI) * yp;
  const y = (cosw * sinO + sinw * cosO * cosI) * xp + (-sinw * sinO + cosw * cosO * cosI) * yp;
  const z = (sinw * sinI) * xp + (cosw * sinI) * yp;

  return { x, y, z };
}

/**
 * Sample the full orbit ellipse of a planet at time T, as an array of ecliptic
 * points (in AU). Sweeps the eccentric anomaly E over [0, 2π) directly — this
 * traces the exact Keplerian ellipse (focus at the Sun), sharing the same ω/I/Ω
 * rotation as heliocentricPosition so the drawn ring and the planet coincide.
 *
 * @param {object} planet
 * @param {number} T          Julian centuries past J2000 (for the secular drift)
 * @param {number} segments   number of sample points (ring is closed by caller)
 * @returns {Array<{x:number,y:number,z:number}>}
 */
export function orbitPath(planet, T, segments = 256) {
  const a = planet.a[0] + planet.a[1] * T;
  const e = planet.e[0] + planet.e[1] * T;
  const I = (planet.I[0] + planet.I[1] * T) * DEG2RAD;
  const varpi = planet.varpi[0] + planet.varpi[1] * T;
  const node = planet.Omega[0] + planet.Omega[1] * T;
  const Omega = node * DEG2RAD;
  const omega = (varpi - node) * DEG2RAD;

  const cosO = Math.cos(Omega), sinO = Math.sin(Omega);
  const cosw = Math.cos(omega), sinw = Math.sin(omega);
  const cosI = Math.cos(I), sinI = Math.sin(I);
  const b = a * Math.sqrt(1 - e * e);

  const pts = [];
  for (let k = 0; k < segments; k++) {
    const E = (k / segments) * 2 * Math.PI;
    const xp = a * (Math.cos(E) - e);
    const yp = b * Math.sin(E);
    pts.push({
      x: (cosw * cosO - sinw * sinO * cosI) * xp + (-sinw * cosO - cosw * sinO * cosI) * yp,
      y: (cosw * sinO + sinw * cosO * cosI) * xp + (-sinw * sinO + cosw * cosO * cosI) * yp,
      z: (sinw * sinI) * xp + (cosw * sinI) * yp,
    });
  }
  return pts;
}

/** Orbital period in (Julian) years from the semi-major axis: P = a^1.5. */
export function periodYears(planet) {
  const a = planet.a[0];
  return Math.pow(a, 1.5);
}

/**
 * Compressive AU → scene-unit distance scale.
 *
 * A linear AU scale is unusable: Neptune (30 AU) would be ~77× Mercury's
 * distance and fall far outside the frame. We map radius non-linearly with a
 * power curve r_scene = BASE · AU^EXP, which keeps the inner system legible
 * while pulling the outer planets back into view:
 *
 *   AU:    0.39   1.0    5.2    9.5   19.2   30.1
 *   scene: 3.6    6.0   14.8   20.7   30.5   39.0   (BASE=6, EXP=0.55)
 *
 * The compression ratio drops from 77:1 (linear) to ~11:1 — every planet stays
 * framed at the default camera distance. EXP=0.55 is a deliberate tuning
 * between log (too flat, inner planets collide) and linear (outer planets gone).
 */
export const SCENE_DISTANCE_BASE = 6.0;
export const SCENE_DISTANCE_EXP = 0.55;

export function auToScene(au) {
  return SCENE_DISTANCE_BASE * Math.pow(au, SCENE_DISTANCE_EXP);
}

/**
 * Compressive true-diameter → display-radius scale (mirrors auToScene's curve).
 *
 * Raw true diameters span ~29:1 (Jupiter 142,984 km vs Mercury 4,879 km). At a
 * linear scale either Mercury is a sub-pixel dot or Jupiter dwarfs the frame, so
 * we compress with the same power-law idiom as the distance scale:
 *
 *   r_display = DISPLAY_RADIUS_EARTH · (diameterKm / EARTH_DIAMETER_KM)^EXP
 *
 * EXP = 0.5 (sqrt) keeps a clean physical meaning and gives effective on-screen
 * radii (after the renderer's PLANET_SIZE multiplier) where Mercury stays
 * clearly visible and Jupiter is unambiguously largest (~5.4× Mercury) without
 * any planet overlapping its orbit neighbours. EXP is the single tuning knob:
 * 0.45 = more conservative gas giants, 0.55 = upper bound before crowding.
 */
export const EARTH_DIAMETER_KM = 12756;
export const DISPLAY_RADIUS_EARTH = 0.66; // anchor: Earth ≈ its previous display size
export const DISPLAY_RADIUS_EXP = 0.5;    // sqrt compression of the true diameter ratio

export function displayRadius(planet) {
  return DISPLAY_RADIUS_EARTH * Math.pow(planet.diameterKm / EARTH_DIAMETER_KM, DISPLAY_RADIUS_EXP);
}
