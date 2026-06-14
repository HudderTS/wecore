/**
 * solar-system.js — Interactive 3D solar system for the WECORE index hero.
 *
 * A NASA "Eyes on the Solar System"-style hero visual: the Sun, the 8 planets
 * (+ Earth's Moon), geometrically-correct orbit rings, a starfield, and an
 * "Artemis II" spacecraft on a stylized free-return trajectory in the
 * Earth-Moon subsystem. Mouse-responsive (orbit / zoom / pan) with inertial
 * damping and an idle auto-rotate that pauses the instant the user grabs it.
 *
 * Tier 1 (self-contained): planet positions come from Keplerian elements
 * (orbital.js); the spacecraft follows a parametric curve. No network, no CDN.
 *
 * Visual conventions (NOT to scale — this is a marketing visual):
 *   - Planet display radii are exaggerated; true radii would be invisible dots.
 *   - Heliocentric distances use a compressive AU->scene scale (orbital.js) so
 *     Neptune stays framed while the inner system is still legible.
 *   - The ecliptic plane maps to the scene's horizontal X-Z plane (three.js Y
 *     is "up" = ecliptic north), so the system reads as a tilted disk.
 *
 * Dependencies: three (import map) + OrbitControls addon (three/addons).
 *
 * Public API (mirrors the old terrain module's shape so the bootstrap is tiny):
 *   createSolarSystem(canvas, opts) ->
 *     { renderer, scene, camera, controls, start, stop, dispose }
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  PLANETS,
  displayRadius,
  heliocentricPosition,
  orbitPath,
  auToScene,
} from '/js/orbital.js';

// ── Brand palette ────────────────────────────────────────────────────────────
const SPACE_BG = 0x000d14;   // --hd-color-accent (deep space)
const ORBIT_LINE = 0x9fb4bd; // desaturated neutral that reads on dark
const SUN_CORE = 0xfff2cf;
const STAR_COLOR = 0xcfe6ef;
const DEG2RAD = Math.PI / 180;
const SCENE_UP = new THREE.Vector3(0, 1, 0);
const SATURN_RING_INNER = 1.11;
const SATURN_RING_OUTER = 2.269;
const SATURN_CASSINI_INNER = 1.951;
const SATURN_CASSINI_OUTER = 2.027;

// ── Small deterministic PRNG (mulberry32) ─────────────────────────────────────
// No Math.random()/Date.now(): star placement must be reproducible (repo rule).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── AU (ecliptic) -> scene Vector3 ─────────────────────────────────────────────
// Radial compression preserves heliocentric longitude exactly (correct relative
// configuration + angular speeds); only the radius is compressed. Ecliptic z
// (north) maps to scene Y so the orbital plane lies horizontal.
function toScene(au, out) {
  const r = Math.sqrt(au.x * au.x + au.y * au.y + au.z * au.z);
  const f = r > 1e-9 ? auToScene(r) / r : 0;
  return out.set(au.x * f, au.z * f, au.y * f);
}

// ── Procedural textures ────────────────────────────────────────────────────────
function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0.0, 'rgba(255,246,224,1)');
  g.addColorStop(0.18, 'rgba(255,210,122,0.9)');
  g.addColorStop(0.45, 'rgba(255,154,60,0.35)');
  g.addColorStop(1.0, 'rgba(255,154,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeLabelTexture(text) {
  const pad = 24;
  const font = '600 52px Geist, system-ui, sans-serif';
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = font;
  const w = Math.ceil(measure.measureText(text).width) + pad * 2;
  const h = 96;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#eafaff';
  ctx.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, aspect: w / h };
}

function smoothstep(edge0, edge1, value) {
  const clamped = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function orbitalNormalScene(def) {
  const inclination = def.I[0] * DEG2RAD;
  const node = def.Omega[0] * DEG2RAD;
  const sinInclination = Math.sin(inclination);
  const eclipticNormal = new THREE.Vector3(
    sinInclination * Math.sin(node),
    -sinInclination * Math.cos(node),
    Math.cos(inclination),
  );
  return new THREE.Vector3(eclipticNormal.x, eclipticNormal.z, eclipticNormal.y).normalize();
}

function spinAxisScene(def) {
  const node = def.Omega[0] * DEG2RAD;
  const nodeAxis = new THREE.Vector3(Math.cos(node), 0, Math.sin(node)).normalize();
  return orbitalNormalScene(def)
    .applyAxisAngle(nodeAxis, def.obliquityDeg * DEG2RAD)
    .normalize();
}

function makePlanetMaterial(color, kind) {
  const nightFill = kind === 'gas' ? 0.11 : 0.08;
  const dayStrength = kind === 'ice' ? 1.08 : 1.16;

  return new THREE.ShaderMaterial({
    uniforms: {
      planetColor: { value: new THREE.Color(color) },
      nightFill: { value: nightFill },
      dayStrength: { value: dayStrength },
    },
    vertexShader: `
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 planetColor;
      uniform float nightFill;
      uniform float dayStrength;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vec3 normalDirection = normalize(vWorldNormal);
        vec3 sunDirection = normalize(-vWorldPosition);
        float sunDot = dot(normalDirection, sunDirection);
        float terminator = smoothstep(-0.08, 0.18, sunDot);
        float sunFace = pow(max(sunDot, 0.0), 0.45);
        vec3 shaded = planetColor * (nightFill + dayStrength * mix(terminator, sunFace, 0.18));

        gl_FragColor = vec4(shaded, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

function makeSaturnRingTexture() {
  const textureSize = 512;
  const canvasEl = document.createElement('canvas');
  canvasEl.width = canvasEl.height = textureSize;
  const context = canvasEl.getContext('2d');
  const imageData = context.createImageData(textureSize, textureSize);
  const pixelData = imageData.data;
  const halfSize = textureSize / 2;
  const radialBands = [
    { inner: 1.11, outer: 1.24, color: [156, 132, 94], alpha: 0.16 },
    { inner: 1.24, outer: 1.526, color: [190, 168, 126], alpha: 0.28 },
    { inner: 1.526, outer: 1.951, color: [226, 208, 161], alpha: 0.62 },
    { inner: 2.027, outer: 2.269, color: [207, 190, 148], alpha: 0.44 },
  ];

  for (let pixelY = 0; pixelY < textureSize; pixelY++) {
    for (let pixelX = 0; pixelX < textureSize; pixelX++) {
      const offset = (pixelY * textureSize + pixelX) * 4;
      const normalizedX = (pixelX + 0.5 - halfSize) / halfSize;
      const normalizedY = (pixelY + 0.5 - halfSize) / halfSize;
      const saturnRadii = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY) * SATURN_RING_OUTER;
      const band = radialBands.find((entry) => saturnRadii >= entry.inner && saturnRadii <= entry.outer);

      if (!band || (saturnRadii > SATURN_CASSINI_INNER && saturnRadii < SATURN_CASSINI_OUTER)) {
        continue;
      }

      const edgeFade = smoothstep(band.inner, band.inner + 0.018, saturnRadii)
        * (1 - smoothstep(band.outer - 0.018, band.outer, saturnRadii));
      const ringlet = 0.9 + 0.1 * Math.sin(saturnRadii * 70);
      pixelData[offset] = Math.round(band.color[0] * ringlet);
      pixelData[offset + 1] = Math.round(band.color[1] * ringlet);
      pixelData[offset + 2] = Math.round(band.color[2] * ringlet);
      pixelData[offset + 3] = Math.round(255 * band.alpha * edgeFade);
    }
  }

  context.putImageData(imageData, 0, 0);
  const texture = new THREE.CanvasTexture(canvasEl);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// ── Public factory ──────────────────────────────────────────────────────────────
export function createSolarSystem(canvas, opts = {}) {
  const reduceMotion = !!opts.reduceMotion;
  const daysPerSecond = opts.timeScale ?? 9;     // sim-time compression
  const dprCap = opts.pixelRatioCap ?? 2;

  const disposables = []; // geometries / materials / textures to free on dispose()
  const track = (obj) => { disposables.push(obj); return obj; };

  // Geometry/material display tuning (scene units; not physical).
  const PLANET_SIZE = 0.42;   // multiplies each planet's display radius
  const SUN_RADIUS = 2.2;

  // ── Sizing ────────────────────────────────────────────────────────────────
  function boxSize() {
    const el = canvas.parentElement || canvas;
    const r = el.getBoundingClientRect();
    const w = r.width || canvas.clientWidth || 600;
    const h = r.height || canvas.clientHeight || 500;
    return { w, h };
  }
  const { w: w0, h: h0 } = boxSize();

  // ── Scene / camera / renderer ───────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SPACE_BG);

  const camera = new THREE.PerspectiveCamera(45, w0 / Math.max(h0, 1), 0.1, 2000);
  camera.position.set(0, 16, 30);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
  renderer.setSize(w0, h0, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  // ── Controls (verified r169 API: auto-connects DOM listeners + update() once
  // on construct; update(dt) must run every frame for damping/autoRotate) ──────
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enablePan = true;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.8;
  controls.panSpeed = 0.6;
  controls.minDistance = 6;
  controls.maxDistance = 120;
  controls.minPolarAngle = 0.12 * Math.PI; // keep a pleasant viewing band
  controls.maxPolarAngle = 0.88 * Math.PI;
  controls.autoRotate = !reduceMotion;
  controls.autoRotateSpeed = 0.35;

  // ── Lights ────────────────────────────────────────────────────────────────
  // The planet shader computes its own Sun-facing terminator from world space so
  // compressed distances never flatten the day/night boundary. This light keeps
  // auxiliary meshes (Moon, Artemis) coherent with the Sun at the origin.
  const sunLight = new THREE.PointLight(0xfff4e0, 3.2, 0, 0);
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0xddefff, 0.08));

  // ── Sun ─────────────────────────────────────────────────────────────────────
  const sunGeo = track(new THREE.SphereGeometry(SUN_RADIUS, 48, 48));
  const sunMat = track(new THREE.MeshBasicMaterial({ color: SUN_CORE }));
  scene.add(new THREE.Mesh(sunGeo, sunMat));

  const glowTex = track(makeGlowTexture());
  const glowMat = track(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffffff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  const glow = new THREE.Sprite(glowMat);
  glow.scale.set(SUN_RADIUS * 6, SUN_RADIUS * 6, 1);
  scene.add(glow);

  // ── Starfield (deterministic) ────────────────────────────────────────────────
  const starRng = mulberry32(0x5ec0);
  const STAR_COUNT = 2600;
  const starPos = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    // uniform on a large sphere shell
    const u = starRng() * 2 - 1;
    const theta = starRng() * Math.PI * 2;
    const rad = 300 + starRng() * 80;
    const s = Math.sqrt(1 - u * u);
    starPos[i * 3] = rad * s * Math.cos(theta);
    starPos[i * 3 + 1] = rad * u;
    starPos[i * 3 + 2] = rad * s * Math.sin(theta);
  }
  const starGeo = track(new THREE.BufferGeometry());
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = track(new THREE.PointsMaterial({
    color: STAR_COLOR, size: 1.4, sizeAttenuation: false,
    transparent: true, opacity: 0.85, depthWrite: false,
  }));
  scene.add(new THREE.Points(starGeo, starMat));

  // ── Planets + orbit rings ────────────────────────────────────────────────────
  const _au = { x: 0, y: 0, z: 0 };

  // Earth subsystem group travels with Earth (holds Earth mesh, Moon, Artemis).
  const earthGroup = new THREE.Group();
  scene.add(earthGroup);

  const saturnRingTex = track(makeSaturnRingTexture());
  const bodies = []; // { def, root, spinPivot, tiltQuaternion, spinRate, spinAngle, isEarth }
  for (const def of PLANETS) {
    const isEarth = def.name === 'Earth';
    const radius = displayRadius(def) * PLANET_SIZE;
    const root = isEarth ? earthGroup : new THREE.Group();
    const spinPivot = new THREE.Group();
    const axis = spinAxisScene(def);
    const tiltQuaternion = new THREE.Quaternion().setFromUnitVectors(SCENE_UP, axis);

    // Orbit ring — sampled once at T=0 (secular drift over a session is
    // negligible), transformed through the same toScene mapping as the planet
    // so the body tracks its drawn ring exactly.
    const ringPts = orbitPath(def, 0, 360).map((p) => toScene(p, new THREE.Vector3()));
    const ringGeo = track(new THREE.BufferGeometry().setFromPoints(ringPts));
    const ringMat = track(new THREE.LineBasicMaterial({
      color: ORBIT_LINE, transparent: true, opacity: 0.22,
    }));
    scene.add(new THREE.LineLoop(ringGeo, ringMat));

    const geo = track(new THREE.SphereGeometry(radius, 48, 48));
    const mat = track(makePlanetMaterial(def.color, def.kind));
    const mesh = new THREE.Mesh(geo, mat);
    spinPivot.quaternion.copy(tiltQuaternion);
    spinPivot.add(mesh);
    root.add(spinPivot);

    if (!isEarth) scene.add(root);

    // Saturn's ring
    if (def.ring) {
      const rg = track(new THREE.RingGeometry(radius * SATURN_RING_INNER, radius * SATURN_RING_OUTER, 192, 1));
      const rm = track(new THREE.MeshBasicMaterial({
        map: saturnRingTex, side: THREE.DoubleSide, transparent: true, opacity: 0.9,
        depthWrite: false,
      }));
      const ring = new THREE.Mesh(rg, rm);
      ring.rotation.x = Math.PI / 2;
      spinPivot.add(ring);
    }

    bodies.push({
      def,
      root,
      spinPivot,
      tiltQuaternion,
      spinRate: (Math.PI * 2 * 24) / def.rotationHours,
      spinAngle: 0,
      isEarth,
    });
  }

  // ── Moon (child of earthGroup) ────────────────────────────────────────────────
  const moonGeo = track(new THREE.SphereGeometry(0.16, 24, 24));
  const moonMat = track(new THREE.MeshStandardMaterial({ color: 0xcfcfcf, roughness: 1 }));
  const moon = new THREE.Mesh(moonGeo, moonMat);
  earthGroup.add(moon);
  const MOON_DIST = 1.5; // scene units (stylized, not to scale)

  // ── Artemis II: stylized free-return trajectory (Earth-local frame) ───────────
  // Plausible lunar-flyby loop: out from low-Earth, swing past the Moon's
  // distance, loop behind, free-return. Closed CatmullRom so the marker cycles.
  const artemisCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.5, 0.05, 0.2),
    new THREE.Vector3(1.4, 0.25, 0.9),
    new THREE.Vector3(0.9, 0.15, 1.9),
    new THREE.Vector3(-0.6, -0.1, 2.3),
    new THREE.Vector3(-1.7, -0.05, 1.2),
    new THREE.Vector3(-1.4, 0.1, -0.4),
    new THREE.Vector3(-0.3, 0.05, -0.9),
    new THREE.Vector3(0.6, -0.05, -0.4),
  ], true, 'catmullrom', 0.5);

  const pathPts = artemisCurve.getPoints(220);
  const pathGeo = track(new THREE.BufferGeometry().setFromPoints(pathPts));
  const pathMat = track(new THREE.LineBasicMaterial({
    color: 0x7fd1e0, transparent: true, opacity: 0.55, depthWrite: false,
  }));
  earthGroup.add(new THREE.LineLoop(pathGeo, pathMat));

  // Procedural Orion-like craft (forward = +Y, the cone/cylinder axis).
  const craft = new THREE.Group();
  const capGeo = track(new THREE.ConeGeometry(0.12, 0.2, 16));
  const capMat = track(new THREE.MeshStandardMaterial({ color: 0xe8eef2, roughness: 0.5, metalness: 0.3 }));
  const cap = new THREE.Mesh(capGeo, capMat);
  cap.position.y = 0.16;
  craft.add(cap);
  const smGeo = track(new THREE.CylinderGeometry(0.1, 0.1, 0.22, 16));
  const smMat = track(new THREE.MeshStandardMaterial({ color: 0x8a939b, roughness: 0.6, metalness: 0.4 }));
  const sm = new THREE.Mesh(smGeo, smMat);
  craft.add(sm);
  const panelGeo = track(new THREE.BoxGeometry(0.5, 0.01, 0.16));
  const panelMat = track(new THREE.MeshStandardMaterial({
    color: 0x1b3a6b, roughness: 0.4, metalness: 0.2,
    emissive: 0x16345f, emissiveIntensity: 0.4,
  }));
  const panelL = new THREE.Mesh(panelGeo, panelMat);
  const panelR = new THREE.Mesh(panelGeo, panelMat);
  craft.add(panelL, panelR);
  craft.scale.setScalar(1.15);
  earthGroup.add(craft);

  // Label "Artemis II" — a camera-facing sprite, kept subtle.
  const { tex: labelTex, aspect: labelAspect } = makeLabelTexture('Artemis II');
  track(labelTex);
  const labelMat = track(new THREE.SpriteMaterial({
    map: labelTex, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false,
  }));
  const label = new THREE.Sprite(labelMat);
  const LABEL_H = 0.55;
  label.scale.set(LABEL_H * labelAspect, LABEL_H, 1);
  earthGroup.add(label);

  // ── Simulation state ──────────────────────────────────────────────────────────
  const clock = new THREE.Clock(false);
  let simDays = 0;
  let rafId = 0;
  let running = false;
  let idleTimer = 0;
  const FORWARD = new THREE.Vector3(0, 1, 0);
  const tangent = new THREE.Vector3();
  const craftPos = new THREE.Vector3();
  const q = new THREE.Quaternion();

  // Earth period in days, for the Artemis loop pacing reference.
  const ARTEMIS_LOOP_SEC = 26; // one trajectory lap at default time scale

  function updateBodies(dt) {
    const T = simDays / 36525.0; // Julian centuries past J2000

    for (const b of bodies) {
      const helio = heliocentricPosition(b.def, T);
      _au.x = helio.x; _au.y = helio.y; _au.z = helio.z;
      if (b.isEarth) {
        toScene(_au, earthGroup.position);
      } else {
        toScene(_au, b.root.position);
      }
      b.spinAngle += dt * daysPerSecond * b.spinRate;
      b.spinPivot.quaternion.copy(b.tiltQuaternion);
      b.spinPivot.rotateY(b.spinAngle);
    }

    // Moon orbits Earth locally (~27.3-day sidereal period, time-compressed).
    const moonAng = (simDays / 27.3) * Math.PI * 2;
    moon.position.set(Math.cos(moonAng) * MOON_DIST, 0.12 * Math.sin(moonAng), Math.sin(moonAng) * MOON_DIST);

    // Artemis II marches along its closed curve.
    const t = (simDays / (daysPerSecond * ARTEMIS_LOOP_SEC)) % 1;
    artemisCurve.getPointAt(t, craftPos);
    artemisCurve.getTangentAt(t, tangent);
    craft.position.copy(craftPos);
    q.setFromUnitVectors(FORWARD, tangent.normalize());
    craft.quaternion.copy(q);
    label.position.set(craftPos.x, craftPos.y + 0.55, craftPos.z);
  }

  function renderFrame() {
    renderer.render(scene, camera);
  }

  function loop() {
    rafId = requestAnimationFrame(loop);
    const dt = clock.getDelta();
    simDays += dt * daysPerSecond;
    updateBodies(dt);
    controls.update(dt); // dt -> frame-rate-independent autoRotate + damping
    renderFrame();
  }

  // ── Idle auto-rotate: pause on grab, resume 4s after release ─────────────────
  function onInteractStart() {
    controls.autoRotate = false;
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = 0; }
  }
  function onInteractEnd() {
    if (reduceMotion) return;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { controls.autoRotate = true; idleTimer = 0; }, 4000);
  }
  controls.addEventListener('start', onInteractStart);
  controls.addEventListener('end', onInteractEnd);

  // In reduced-motion mode we never auto-animate. Damping off so manual orbit is
  // instant, and we render on demand whenever the user moves the camera.
  if (reduceMotion) {
    controls.enableDamping = false;
    controls.autoRotate = false;
    controls.addEventListener('change', renderFrame);
  }

  // ── Resize ────────────────────────────────────────────────────────────────────
  const ro = new ResizeObserver(() => {
    const { w, h } = boxSize();
    if (w === 0 || h === 0) return;
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    if (!running) renderFrame(); // keep static/reduced-motion frame crisp
  });
  ro.observe(canvas.parentElement || canvas);

  // ── Public controls ──────────────────────────────────────────────────────────
  function start() {
    // Position everything correctly for the first paint either way.
    updateBodies(0);
    controls.update();
    if (reduceMotion) { renderFrame(); return; } // single static frame, no RAF
    if (running) return;
    running = true;
    clock.start();
    loop();
  }

  function stop() {
    if (!running) return;
    running = false;
    clock.stop();
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  }

  function dispose() {
    stop();
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = 0; }
    ro.disconnect();
    controls.removeEventListener('start', onInteractStart);
    controls.removeEventListener('end', onInteractEnd);
    if (reduceMotion) controls.removeEventListener('change', renderFrame);
    controls.dispose();
    for (const d of disposables) { if (d && typeof d.dispose === 'function') d.dispose(); }
    renderer.dispose();
  }

  return { renderer, scene, camera, controls, start, stop, dispose };
}
