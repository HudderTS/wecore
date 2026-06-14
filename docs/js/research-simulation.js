/**
 * research-simulation.js — Scientific simulation-result hero for WECORE.
 *
 * The scene reads like a CFD / OpenFOAM post-processing view: finite-volume
 * mesh, pressure/vorticity scalar field, airfoil geometry, streamlines, flow
 * tracers, and a compact color legend. It is deterministic and self-contained.
 */

import * as THREE from 'three';

const BACKGROUND_COLOR = 0x000d14;
const DOMAIN_WIDTH = 10.4;
const DOMAIN_DEPTH = 6.4;
const SURFACE_COLUMNS = 118;
const SURFACE_ROWS = 74;
const AIRFOIL_ANGLE = -0.18;
const AIRFOIL_CHORD = 2.65;
const AIRFOIL_HEIGHT = 0.42;

const STREAMLINE_OFFSETS = [
  -2.65, -2.25, -1.85, -1.45, -1.05, -0.68, -0.38,
  0.38, 0.68, 1.05, 1.45, 1.85, 2.25, 2.65,
];

const FIELD_PALETTE = [
  [0.04, 0.08, 0.28],
  [0.02, 0.22, 0.52],
  [0.00, 0.58, 0.72],
  [0.72, 0.82, 0.34],
  [0.94, 0.46, 0.12],
  [0.78, 0.08, 0.08],
];

function clamp(value, minValue, maxValue) {
  return Math.max(minValue, Math.min(maxValue, value));
}

function gaussian(coordinateX, coordinateZ, spreadX, spreadZ) {
  return Math.exp(-((coordinateX * coordinateX) / spreadX + (coordinateZ * coordinateZ) / spreadZ));
}

function rotateToAirfoilFrame(coordinateX, coordinateZ) {
  const cosine = Math.cos(AIRFOIL_ANGLE);
  const sine = Math.sin(AIRFOIL_ANGLE);
  return {
    localX: coordinateX * cosine - coordinateZ * sine,
    localZ: coordinateX * sine + coordinateZ * cosine,
  };
}

function rotateFromAirfoilFrame(localX, localZ) {
  const cosine = Math.cos(AIRFOIL_ANGLE);
  const sine = Math.sin(AIRFOIL_ANGLE);
  return {
    coordinateX: localX * cosine + localZ * sine,
    coordinateZ: -localX * sine + localZ * cosine,
  };
}

function scalarField(coordinateX, coordinateZ, simulationTime) {
  const frame = rotateToAirfoilFrame(coordinateX, coordinateZ);
  const localX = frame.localX;
  const localZ = frame.localZ;
  const downstream = Math.max(0, localX - 0.72);

  const leadingSuction = -1.12 * gaussian(localX + 0.72, localZ - 0.25, 0.58, 0.075);
  const lowerPressure = 0.95 * gaussian(localX + 0.42, localZ + 0.28, 0.75, 0.12);
  const trailingShear = -0.52 * gaussian(localX - 1.05, localZ - 0.12, 1.25, 0.12);
  const wakeEnvelope = Math.exp(-downstream / 3.2) * Math.exp(-(localZ * localZ) / 0.44);
  const vortexStreet = downstream > 0
    ? 0.62 * Math.sin(downstream * 4.2 - simulationTime * 1.55 + localZ * 2.1) * wakeEnvelope
    : 0;
  const farField = 0.13 * Math.sin(coordinateX * 0.8 - coordinateZ * 1.1);

  return clamp(leadingSuction + lowerPressure + trailingShear + vortexStreet + farField, -1.32, 1.32);
}

function surfaceHeight(coordinateX, coordinateZ, simulationTime) {
  const scalar = scalarField(coordinateX, coordinateZ, simulationTime);
  return 0.02 + scalar * 0.18;
}

function paletteColor(scalarValue, colorTarget) {
  const normalized = clamp((scalarValue + 1.32) / 2.64, 0, 1);
  const scaled = normalized * (FIELD_PALETTE.length - 1);
  const lowerIndex = Math.floor(scaled);
  const upperIndex = Math.min(FIELD_PALETTE.length - 1, lowerIndex + 1);
  const blend = scaled - lowerIndex;
  const lowerColor = FIELD_PALETTE[lowerIndex];
  const upperColor = FIELD_PALETTE[upperIndex];

  colorTarget.setRGB(
    lowerColor[0] + (upperColor[0] - lowerColor[0]) * blend,
    lowerColor[1] + (upperColor[1] - lowerColor[1]) * blend,
    lowerColor[2] + (upperColor[2] - lowerColor[2]) * blend,
  );
}

function boxSize(canvas) {
  const element = canvas.parentElement || canvas;
  const rect = element.getBoundingClientRect();
  return {
    width: rect.width || canvas.clientWidth || 600,
    height: rect.height || canvas.clientHeight || 500,
  };
}

function makeDiscTexture(colorCss) {
  const discCanvas = document.createElement('canvas');
  discCanvas.width = 64;
  discCanvas.height = 64;
  const context = discCanvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, colorCss);
  gradient.addColorStop(0.34, colorCss);
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);

  const texture = new THREE.CanvasTexture(discCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeLegendTexture() {
  const legendCanvas = document.createElement('canvas');
  legendCanvas.width = 180;
  legendCanvas.height = 520;
  const context = legendCanvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 440, 0, 70);
  gradient.addColorStop(0, '#081447');
  gradient.addColorStop(0.2, '#055c94');
  gradient.addColorStop(0.42, '#00a6b7');
  gradient.addColorStop(0.62, '#c6d45a');
  gradient.addColorStop(0.82, '#f06d22');
  gradient.addColorStop(1, '#c81414');

  context.fillStyle = 'rgba(0,13,20,0.68)';
  context.strokeStyle = 'rgba(234,250,255,0.28)';
  context.lineWidth = 2;
  context.beginPath();
  context.roundRect?.(18, 22, 144, 476, 24);
  if (!context.roundRect) {
    context.rect(18, 22, 144, 476);
  }
  context.fill();
  context.stroke();

  context.fillStyle = gradient;
  context.fillRect(55, 78, 34, 350);
  context.strokeStyle = 'rgba(234,250,255,0.45)';
  context.strokeRect(55, 78, 34, 350);

  context.fillStyle = '#eafaff';
  context.font = '800 28px Geist, system-ui, sans-serif';
  context.textAlign = 'center';
  context.fillText('Cp', 72, 58);
  context.font = '700 22px Geist, system-ui, sans-serif';
  context.textAlign = 'left';
  context.fillText('+1.3', 100, 88);
  context.fillText('0.0', 100, 260);
  context.fillText('-1.3', 100, 432);
  context.font = '600 17px Geist, system-ui, sans-serif';
  context.fillStyle = 'rgba(234,250,255,0.72)';
  context.fillText('pressure', 40, 470);

  const texture = new THREE.CanvasTexture(legendCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createSurfaceGeometry(track) {
  const geometry = track(new THREE.BufferGeometry());
  const coordinates = [];
  const positions = [];
  const colors = [];
  const indices = [];
  const color = new THREE.Color();

  for (let rowIndex = 0; rowIndex <= SURFACE_ROWS; rowIndex++) {
    const rowRatio = rowIndex / SURFACE_ROWS;
    const coordinateZ = -DOMAIN_DEPTH / 2 + rowRatio * DOMAIN_DEPTH;
    for (let columnIndex = 0; columnIndex <= SURFACE_COLUMNS; columnIndex++) {
      const columnRatio = columnIndex / SURFACE_COLUMNS;
      const coordinateX = -DOMAIN_WIDTH / 2 + columnRatio * DOMAIN_WIDTH;
      const scalar = scalarField(coordinateX, coordinateZ, 0);
      coordinates.push({ coordinateX, coordinateZ });
      positions.push(coordinateX, surfaceHeight(coordinateX, coordinateZ, 0), coordinateZ);
      paletteColor(scalar, color);
      colors.push(color.r, color.g, color.b);
    }
  }

  for (let rowIndex = 0; rowIndex < SURFACE_ROWS; rowIndex++) {
    for (let columnIndex = 0; columnIndex < SURFACE_COLUMNS; columnIndex++) {
      const vertexIndex = rowIndex * (SURFACE_COLUMNS + 1) + columnIndex;
      indices.push(
        vertexIndex,
        vertexIndex + SURFACE_COLUMNS + 1,
        vertexIndex + 1,
        vertexIndex + 1,
        vertexIndex + SURFACE_COLUMNS + 1,
        vertexIndex + SURFACE_COLUMNS + 2,
      );
    }
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);

  return { geometry, coordinates };
}

function updateSurfaceGeometry(surfaceGeometry, coordinates, simulationTime) {
  const positionAttribute = surfaceGeometry.getAttribute('position');
  const colorAttribute = surfaceGeometry.getAttribute('color');
  const color = new THREE.Color();

  for (let vertexIndex = 0; vertexIndex < coordinates.length; vertexIndex++) {
    const coordinate = coordinates[vertexIndex];
    const scalar = scalarField(coordinate.coordinateX, coordinate.coordinateZ, simulationTime);
    positionAttribute.setY(vertexIndex, surfaceHeight(coordinate.coordinateX, coordinate.coordinateZ, simulationTime));
    paletteColor(scalar, color);
    colorAttribute.setXYZ(vertexIndex, color.r, color.g, color.b);
  }

  positionAttribute.needsUpdate = true;
  colorAttribute.needsUpdate = true;
}

function createMeshLines(track) {
  const group = new THREE.Group();
  const material = track(new THREE.LineBasicMaterial({
    color: 0xd7edf3,
    transparent: true,
    opacity: 0.20,
    depthWrite: false,
  }));

  for (let rowIndex = 0; rowIndex <= SURFACE_ROWS; rowIndex += 6) {
    const coordinateZ = -DOMAIN_DEPTH / 2 + (rowIndex / SURFACE_ROWS) * DOMAIN_DEPTH;
    const points = [];
    for (let columnIndex = 0; columnIndex <= SURFACE_COLUMNS; columnIndex += 2) {
      const coordinateX = -DOMAIN_WIDTH / 2 + (columnIndex / SURFACE_COLUMNS) * DOMAIN_WIDTH;
      points.push(new THREE.Vector3(coordinateX, surfaceHeight(coordinateX, coordinateZ, 0) + 0.012, coordinateZ));
    }
    group.add(new THREE.Line(track(new THREE.BufferGeometry().setFromPoints(points)), material));
  }

  for (let columnIndex = 0; columnIndex <= SURFACE_COLUMNS; columnIndex += 8) {
    const coordinateX = -DOMAIN_WIDTH / 2 + (columnIndex / SURFACE_COLUMNS) * DOMAIN_WIDTH;
    const points = [];
    for (let rowIndex = 0; rowIndex <= SURFACE_ROWS; rowIndex += 2) {
      const coordinateZ = -DOMAIN_DEPTH / 2 + (rowIndex / SURFACE_ROWS) * DOMAIN_DEPTH;
      points.push(new THREE.Vector3(coordinateX, surfaceHeight(coordinateX, coordinateZ, 0) + 0.012, coordinateZ));
    }
    group.add(new THREE.Line(track(new THREE.BufferGeometry().setFromPoints(points)), material));
  }

  return group;
}

function streamlinePoint(coordinateX, baseOffsetZ, simulationTime) {
  const sign = baseOffsetZ >= 0 ? 1 : -1;
  const aroundAirfoil = Math.exp(-(coordinateX * coordinateX) / 1.35);
  const downstream = Math.max(0, coordinateX - 0.65);
  const wakeOscillation = downstream > 0
    ? Math.sin(downstream * 2.45 + baseOffsetZ * 1.7 - simulationTime * 1.05) * 0.14 * Math.exp(-downstream / 4.2)
    : 0;
  const displacement = sign * 0.36 * aroundAirfoil / (Math.abs(baseOffsetZ) + 0.52);
  const coordinateZ = baseOffsetZ + displacement + wakeOscillation;
  const coordinateY = surfaceHeight(coordinateX, coordinateZ, simulationTime) + 0.11;
  return new THREE.Vector3(coordinateX, coordinateY, coordinateZ);
}

function createStreamline(baseOffsetZ, track) {
  const points = [];
  const sampleCount = 112;
  for (let sampleIndex = 0; sampleIndex <= sampleCount; sampleIndex++) {
    const sampleRatio = sampleIndex / sampleCount;
    const coordinateX = -DOMAIN_WIDTH / 2 + sampleRatio * DOMAIN_WIDTH;
    points.push(streamlinePoint(coordinateX, baseOffsetZ, 0));
  }

  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.28);
  const material = track(new THREE.LineBasicMaterial({
    color: Math.abs(baseOffsetZ) < 0.8 ? 0xeafaff : 0x6fd6ff,
    transparent: true,
    opacity: Math.abs(baseOffsetZ) < 0.8 ? 0.58 : 0.34,
    depthWrite: false,
  }));
  const line = new THREE.Line(track(new THREE.BufferGeometry().setFromPoints(points)), material);
  return { curve, line };
}

function createAirfoilGeometry(track) {
  const outline = [];
  const upperPoints = [];
  const lowerPoints = [];
  const thicknessRatio = 0.12;
  const samples = 42;

  for (let sampleIndex = samples; sampleIndex >= 0; sampleIndex--) {
    const fraction = sampleIndex / samples;
    const thickness = 5 * thicknessRatio * (
      0.2969 * Math.sqrt(fraction)
      - 0.1260 * fraction
      - 0.3516 * fraction * fraction
      + 0.2843 * fraction * fraction * fraction
      - 0.1015 * fraction * fraction * fraction * fraction
    );
    upperPoints.push({ localX: (fraction - 0.5) * AIRFOIL_CHORD, localZ: thickness * AIRFOIL_CHORD });
  }

  for (let sampleIndex = 0; sampleIndex <= samples; sampleIndex++) {
    const fraction = sampleIndex / samples;
    const thickness = 5 * thicknessRatio * (
      0.2969 * Math.sqrt(fraction)
      - 0.1260 * fraction
      - 0.3516 * fraction * fraction
      + 0.2843 * fraction * fraction * fraction
      - 0.1015 * fraction * fraction * fraction * fraction
    );
    lowerPoints.push({ localX: (fraction - 0.5) * AIRFOIL_CHORD, localZ: -thickness * AIRFOIL_CHORD });
  }

  for (const point of upperPoints.concat(lowerPoints)) {
    const rotated = rotateFromAirfoilFrame(point.localX, point.localZ);
    outline.push(new THREE.Vector2(rotated.coordinateX, rotated.coordinateZ));
  }

  const triangles = THREE.ShapeUtils.triangulateShape(outline, []);
  const positions = [];
  for (const point of outline) {
    positions.push(point.x, AIRFOIL_HEIGHT, point.y);
  }

  const indices = [];
  for (const triangle of triangles) {
    indices.push(triangle[0], triangle[1], triangle[2]);
  }

  const geometry = track(new THREE.BufferGeometry());
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createResearchSimulation(canvas, opts = {}) {
  const reduceMotion = !!opts.reduceMotion;
  const pixelRatioCap = opts.pixelRatioCap ?? 2;
  const disposables = [];
  const track = (object) => {
    disposables.push(object);
    return object;
  };

  const initialSize = boxSize(canvas);
  const aspect = initialSize.width / Math.max(initialSize.height, 1);
  const frustumSize = 8.2;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND_COLOR);
  scene.fog = new THREE.Fog(BACKGROUND_COLOR, 11, 27);

  const camera = new THREE.OrthographicCamera(
    (frustumSize * aspect) / -2,
    (frustumSize * aspect) / 2,
    frustumSize / 2,
    frustumSize / -2,
    0.1,
    80,
  );
  camera.position.set(6.5, 5.1, 7.2);
  camera.lookAt(0.3, 0.1, 0);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap));
  renderer.setSize(initialSize.width, initialSize.height, false);

  scene.add(new THREE.HemisphereLight(0xeafaff, 0x00141d, 1.4));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
  keyLight.position.set(3, 7, 4);
  scene.add(keyLight);

  const simulationGroup = new THREE.Group();
  simulationGroup.rotation.y = -0.18;
  simulationGroup.rotation.x = -0.02;
  scene.add(simulationGroup);

  const surfaceData = createSurfaceGeometry(track);
  const surfaceMaterial = track(new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
  }));
  const surfaceMesh = new THREE.Mesh(surfaceData.geometry, surfaceMaterial);
  simulationGroup.add(surfaceMesh);
  simulationGroup.add(createMeshLines(track));

  const streamlines = STREAMLINE_OFFSETS.map((baseOffsetZ) => createStreamline(baseOffsetZ, track));
  for (const streamline of streamlines) {
    simulationGroup.add(streamline.line);
  }

  const airfoilMaterial = track(new THREE.MeshStandardMaterial({
    color: 0xf2f7f8,
    emissive: 0x24333a,
    roughness: 0.48,
    metalness: 0.18,
  }));
  const airfoilMesh = new THREE.Mesh(createAirfoilGeometry(track), airfoilMaterial);
  simulationGroup.add(airfoilMesh);

  const trailingEdgeMaterial = track(new THREE.LineBasicMaterial({
    color: 0x000d14,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
  }));
  const airfoilOutline = new THREE.LineLoop(
    track(new THREE.EdgesGeometry(airfoilMesh.geometry)),
    trailingEdgeMaterial,
  );
  simulationGroup.add(airfoilOutline);

  const tracerTexture = track(makeDiscTexture('rgba(234,250,255,0.95)'));
  const tracers = [];
  for (let tracerIndex = 0; tracerIndex < 34; tracerIndex++) {
    const streamline = streamlines[tracerIndex % streamlines.length];
    const material = track(new THREE.SpriteMaterial({
      map: tracerTexture,
      color: tracerIndex % 3 === 0 ? 0xe67e22 : 0x6fd6ff,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.13, 0.13, 1);
    simulationGroup.add(sprite);
    tracers.push({
      sprite,
      curve: streamline.curve,
      offset: (tracerIndex * 0.113) % 1,
      speed: 0.055 + (tracerIndex % 5) * 0.006,
    });
  }

  const legendMaterial = track(new THREE.SpriteMaterial({
    map: track(makeLegendTexture()),
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    depthTest: false,
  }));
  const legend = new THREE.Sprite(legendMaterial);
  legend.position.set(4.95, 1.52, -2.72);
  legend.scale.set(0.78, 2.24, 1);
  simulationGroup.add(legend);

  const clock = new THREE.Clock(false);
  const pointer = new THREE.Vector2(0, 0);
  const targetPointer = new THREE.Vector2(0, 0);
  let simulationTime = 0;
  let rafId = 0;
  let running = false;

  function updateScene() {
    pointer.lerp(targetPointer, 0.07);
    simulationGroup.rotation.y = -0.18 + pointer.x * 0.055;
    simulationGroup.rotation.x = -0.02 + pointer.y * 0.035;

    updateSurfaceGeometry(surfaceData.geometry, surfaceData.coordinates, simulationTime);

    for (const tracer of tracers) {
      const progress = reduceMotion ? tracer.offset : (tracer.offset + simulationTime * tracer.speed) % 1;
      tracer.curve.getPointAt(progress, tracer.sprite.position);
      const tracerScale = 0.10 + Math.sin(progress * Math.PI) * 0.055;
      tracer.sprite.scale.set(tracerScale, tracerScale, 1);
    }
  }

  function renderFrame() {
    renderer.render(scene, camera);
  }

  function loop() {
    rafId = requestAnimationFrame(loop);
    const deltaTime = clock.getDelta();
    simulationTime += deltaTime;
    updateScene();
    renderFrame();
  }

  function onPointerMove(event) {
    if (reduceMotion) return;
    const rect = canvas.getBoundingClientRect();
    const normalizedX = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
    const normalizedY = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1;
    targetPointer.set(
      clamp(normalizedX, -1, 1),
      clamp(normalizedY, -1, 1),
    );
  }

  function onPointerLeave() {
    targetPointer.set(0, 0);
  }

  canvas.addEventListener('pointermove', onPointerMove, { passive: true });
  canvas.addEventListener('pointerleave', onPointerLeave, { passive: true });

  const resizeObserver = new ResizeObserver(() => {
    const currentSize = boxSize(canvas);
    if (currentSize.width === 0 || currentSize.height === 0) return;
    const currentAspect = currentSize.width / Math.max(currentSize.height, 1);
    camera.left = (frustumSize * currentAspect) / -2;
    camera.right = (frustumSize * currentAspect) / 2;
    camera.top = frustumSize / 2;
    camera.bottom = frustumSize / -2;
    camera.updateProjectionMatrix();
    renderer.setSize(currentSize.width, currentSize.height, false);
    if (!running) renderFrame();
  });
  resizeObserver.observe(canvas.parentElement || canvas);

  function start() {
    updateScene();
    if (reduceMotion) {
      renderFrame();
      return;
    }
    if (running) return;
    running = true;
    clock.start();
    loop();
  }

  function stop() {
    if (!running) return;
    running = false;
    clock.stop();
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function dispose() {
    stop();
    resizeObserver.disconnect();
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerleave', onPointerLeave);
    for (const disposable of disposables) {
      if (disposable && typeof disposable.dispose === 'function') {
        disposable.dispose();
      }
    }
    renderer.dispose();
  }

  return { renderer, scene, camera, start, stop, dispose };
}
