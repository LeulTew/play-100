import * as THREE from 'three';
import {
  ARTIFACT_COLORS,
  FOLIO_DESIGNS,
  P100_GLYPHS,
  type FolioDesign,
  type MarkPoint,
} from './artifactDesign';
import { FrameBudget, MIN_SCENE_DPR } from './frameBudget';

export interface CollectionSceneOptions {
  quality: 'auto' | 'full';
  fanned: boolean;
  active: boolean;
  onFirstFrame: () => void;
  onFrame: (count: number) => void;
  onFallback: (reason: string) => void;
}

export interface CollectionSceneHandle {
  setActive: (active: boolean) => void;
  setFanned: (fanned: boolean) => void;
  dispose: () => void;
}

interface Disposable {
  dispose: () => void;
}

const WIDTH = 2.58;
const DEPTH = 1.8;
const THICKNESS = 0.07;
const COVER_WIDTH = 512;
const COVER_HEIGHT = 352;

function canvasSurface(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The collection artwork could not be drawn.');
  return { canvas, context };
}

function canvasPolygon(context: CanvasRenderingContext2D, points: readonly MarkPoint[]) {
  points.forEach(([x, y], index) => {
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
}

function makeCover(design: FolioDesign) {
  const { canvas, context } = canvasSurface(COVER_WIDTH, COVER_HEIGHT);
  context.fillStyle = design.paper;
  context.fillRect(0, 0, COVER_WIDTH, COVER_HEIGHT);
  context.fillStyle = design.accent;
  context.fillRect(17, 0, 13, COVER_HEIGHT);
  context.strokeStyle = design.ink;
  context.lineWidth = 1;
  context.globalAlpha = 0.45;
  context.strokeRect(1, 1, COVER_WIDTH - 2, COVER_HEIGHT - 2);
  context.beginPath();
  context.moveTo(48, 76);
  context.lineTo(470, 76);
  context.moveTo(48, 313);
  context.lineTo(470, 313);
  context.stroke();
  context.globalAlpha = 1;
  context.fillStyle = design.ink;
  context.font = '700 13px "Hanken Grotesk", sans-serif';
  context.fillText('PLAY 100 / COLLECTION', 49, 45);
  context.textAlign = 'right';
  context.font = '800 43px "Barlow Condensed", sans-serif';
  context.fillText(design.number, 469, 57);
  context.textAlign = 'left';

  if (design.motif === 'mark') {
    context.save();
    context.translate(32, 112);
    context.scale(448 / 344, 448 / 344);
    context.fillStyle = design.ink;
    P100_GLYPHS.forEach((glyph) => {
      context.beginPath();
      canvasPolygon(context, glyph.outline);
      glyph.holes.forEach((hole) => canvasPolygon(context, hole));
      context.fill('evenodd');
    });
    context.restore();
    context.fillStyle = design.accent;
    context.fillRect(48, 282, 422, 31);
    context.fillStyle = design.ink;
    context.font = '800 14px "Hanken Grotesk", sans-serif';
    context.fillText('R O O M  F O R  P L A Y .', 64, 303);
  } else if (design.motif === 'stripes') {
    context.fillStyle = design.accent;
    for (let stripe = 0; stripe < 6; stripe += 1) {
      const x = 58 + stripe * 65;
      context.beginPath();
      context.moveTo(x, 277);
      context.lineTo(x + 64, 108);
      context.lineTo(x + 99, 108);
      context.lineTo(x + 35, 277);
      context.closePath();
      context.fill();
    }
    context.fillStyle = design.ink;
    context.fillRect(55, 288, 415, 5);
  } else if (design.motif === 'grid') {
    for (let cell = 0; cell < 15; cell += 1) {
      context.fillStyle = cell === 7 ? design.accent : design.ink;
      context.fillRect(61 + (cell % 5) * 82, 109 + Math.floor(cell / 5) * 58, 61, 40);
    }
  } else {
    context.strokeStyle = design.ink;
    context.lineWidth = 37;
    context.beginPath();
    context.moveTo(88, 283);
    context.lineTo(88, 218);
    context.ellipse(260, 218, 172, 119, 0, Math.PI, Math.PI * 2);
    context.lineTo(432, 283);
    context.stroke();
    context.lineWidth = 25;
    context.beginPath();
    context.moveTo(160, 283);
    context.lineTo(160, 218);
    context.ellipse(260, 218, 100, 64, 0, Math.PI, Math.PI * 2);
    context.lineTo(360, 283);
    context.stroke();
    context.fillStyle = design.accent;
    context.fillRect(234, 218, 53, 64);
  }

  context.fillStyle = design.ink;
  context.font = '600 12px "Hanken Grotesk", sans-serif';
  context.fillText(`VOL. ${design.number} / OPEN & EXPLORE`, 49, 337);
  context.strokeStyle = design.ink;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(429, 332);
  context.lineTo(469, 332);
  context.lineTo(458, 326);
  context.moveTo(469, 332);
  context.lineTo(458, 338);
  context.stroke();
  return canvas;
}

function makeRegistrationPlate() {
  const { canvas, context } = canvasSurface(1024, 1024);
  context.strokeStyle = ARTIFACT_COLORS.graphite;
  context.fillStyle = ARTIFACT_COLORS.graphite;
  context.globalAlpha = 0.25;
  context.lineWidth = 1.7;
  [357, 410].forEach((radius) => {
    context.beginPath();
    context.arc(512, 512, radius, 0, Math.PI * 2);
    context.stroke();
  });
  for (let tick = 0; tick < 32; tick += 1) {
    const angle = (tick / 32) * Math.PI * 2;
    const length = tick % 4 === 0 ? 15 : 6;
    context.beginPath();
    context.moveTo(512 + Math.cos(angle) * 410, 512 + Math.sin(angle) * 410);
    context.lineTo(512 + Math.cos(angle) * (410 - length), 512 + Math.sin(angle) * (410 - length));
    context.stroke();
  }
  [62, 962].forEach((x) => {
    context.beginPath();
    context.moveTo(x - 23, 512);
    context.lineTo(x + 23, 512);
    context.moveTo(x, 489);
    context.lineTo(x, 535);
    context.stroke();
  });
  context.globalAlpha = 0.66;
  context.font = '600 18px "Hanken Grotesk", sans-serif';
  context.fillText('P100 / ARCHIVE', 154, 857);
  context.fillText('01—06', 759, 201);
  context.font = '600 15px "Hanken Grotesk", sans-serif';
  context.fillText('M A D E  T O  O P E N', 589, 894);
  return canvas;
}

function makeFold() {
  const geometry = new THREE.BufferGeometry();
  const left = -WIDTH / 2;
  const top = THICKNESS / 2;
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    left, top, -DEPTH / 2,
    left + 0.055, top + 0.04, -DEPTH / 2,
    left + 0.14, top + 0.005, -DEPTH / 2,
    left, top, DEPTH / 2,
    left + 0.055, top + 0.04, DEPTH / 2,
    left + 0.14, top + 0.005, DEPTH / 2,
  ], 3));
  geometry.setIndex([
    0, 3, 4, 0, 4, 1,
    1, 4, 5, 1, 5, 2,
    0, 1, 2, 3, 5, 4,
    0, 2, 5, 0, 5, 3,
  ]);
  geometry.computeVertexNormals();
  return geometry;
}

function makeEmbossedMark() {
  const scaleX = (WIDTH * 448) / (COVER_WIDTH * 344);
  const scaleY = (DEPTH * 448) / (COVER_HEIGHT * 344);
  const shapes = P100_GLYPHS.map((glyph) => {
    const shape = new THREE.Shape(glyph.outline.map(([x, y]) => new THREE.Vector2(x * scaleX, -y * scaleY)));
    glyph.holes.forEach((hole) => {
      shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x * scaleX, -y * scaleY))));
    });
    return shape;
  });
  return new THREE.ExtrudeGeometry(shapes, {
    depth: 0.011,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
}

export function createCollectionScene(
  host: HTMLDivElement,
  options: CollectionSceneOptions,
): CollectionSceneHandle {
  const resources = new Set<Disposable>();
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.tabIndex = -1;
  let renderer: THREE.WebGLRenderer | null = null;
  let context: WebGL2RenderingContext | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let resizeListener: (() => void) | null = null;
  let pointerListener: (() => void) | null = null;
  const pointerQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: coarse)') : null;
  let raf: number | null = null;
  let disposed = false;
  let failed = false;
  let active = options.active;
  let previousTime: number | null = null;
  let targetSpread = options.fanned ? 1 : 0;
  let spread = targetSpread;
  let lift = 0.24;
  let transition: { fromSpread: number; fromLift: number; elapsed: number; duration: number } | null = {
    fromSpread: spread,
    fromLift: lift,
    elapsed: 0,
    duration: 850,
  };

  function keep<T extends Disposable>(resource: T): T {
    resources.add(resource);
    return resource;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (raf !== null) window.cancelAnimationFrame(raf);
    raf = null;
    resizeObserver?.disconnect();
    if (resizeListener) window.removeEventListener('resize', resizeListener);
    if (pointerListener) pointerQuery?.removeEventListener('change', pointerListener);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    resources.forEach((resource) => resource.dispose());
    resources.clear();
    renderer?.dispose();
    if (context && !context.isContextLost()) context.getExtension('WEBGL_lose_context')?.loseContext();
    canvas.remove();
  }

  function fallback(reason: string) {
    if (failed || disposed) return;
    failed = true;
    dispose();
    options.onFallback(reason);
  }

  function onContextLost(event: Event) {
    event.preventDefault();
    fallback('The 3D view was interrupted. The illustrated view is ready.');
  }

  try {
    context = canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      depth: true,
      stencil: false,
      powerPreference: 'low-power',
    });
    if (!context) throw new Error('WebGL 2 is unavailable.');
    const engine = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: true });
    renderer = engine;
    engine.setClearColor(0x000000, 0);
    engine.outputColorSpace = THREE.SRGBColorSpace;
    engine.toneMapping = THREE.NoToneMapping;
    engine.shadowMap.enabled = false;
    canvas.addEventListener('webglcontextlost', onContextLost);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-3.6, 3.6, 2.2, -2.2, 0.1, 40);
    camera.position.set(-5.2, 6.8, 8.4);
    camera.lookAt(0, 0.03, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x777a68, 1.65));
    const keyLight = new THREE.DirectionalLight(0xfffdf2, 2.05);
    keyLight.position.set(-3, 7, 5);
    scene.add(keyLight);

    const collection = new THREE.Group();
    collection.rotation.y = -0.18;
    scene.add(collection);
    const bodyGeometry = keep(new THREE.BoxGeometry(WIDTH, THICKNESS, DEPTH));
    const coverGeometry = keep(new THREE.PlaneGeometry(WIDTH, DEPTH));
    const foldGeometry = keep(makeFold());
    const foldMaterial = keep(new THREE.MeshStandardMaterial({
      color: ARTIFACT_COLORS.lime,
      roughness: 0.87,
      metalness: 0,
    }));
    const edgeGeometry = keep(new THREE.BufferGeometry());
    edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -WIDTH / 2 + 0.03, -0.012, DEPTH / 2 + 0.001,
      WIDTH / 2 - 0.03, -0.012, DEPTH / 2 + 0.001,
      -WIDTH / 2 + 0.03, 0.012, DEPTH / 2 + 0.001,
      WIDTH / 2 - 0.03, 0.012, DEPTH / 2 + 0.001,
    ], 3));
    const edgeMaterial = keep(new THREE.LineBasicMaterial({
      color: ARTIFACT_COLORS.graphite,
      transparent: true,
      opacity: 0.36,
    }));

    const folios = FOLIO_DESIGNS.map((design, index) => {
      const folio = new THREE.Group();
      const texture = keep(new THREE.CanvasTexture(makeCover(design)));
      texture.colorSpace = THREE.SRGBColorSpace;
      const coverMaterial = keep(new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.92,
        metalness: 0,
      }));
      const bodyMaterial = keep(new THREE.MeshStandardMaterial({
        color: index % 2 === 0 ? ARTIFACT_COLORS.chalk : ARTIFACT_COLORS.lime,
        roughness: 0.95,
        metalness: 0,
      }));
      folio.add(new THREE.Mesh(bodyGeometry, bodyMaterial));
      const cover = new THREE.Mesh(coverGeometry, coverMaterial);
      cover.rotation.x = -Math.PI / 2;
      cover.position.y = THICKNESS / 2 + 0.001;
      folio.add(cover);
      folio.add(new THREE.Mesh(foldGeometry, foldMaterial));
      folio.add(new THREE.LineSegments(edgeGeometry, edgeMaterial));
      if (design.motif === 'mark') {
        const markMaterial = keep(new THREE.MeshStandardMaterial({
          color: design.ink,
          roughness: 0.7,
          metalness: 0,
        }));
        const mark = new THREE.Mesh(keep(makeEmbossedMark()), markMaterial);
        mark.rotation.x = -Math.PI / 2;
        mark.position.set(
          -WIDTH / 2 + (32 / COVER_WIDTH) * WIDTH,
          THICKNESS / 2 + 0.0015,
          -DEPTH / 2 + (112 / COVER_HEIGHT) * DEPTH,
        );
        folio.add(mark);
      }
      collection.add(folio);
      return { folio, index };
    });

    const plateTexture = keep(new THREE.CanvasTexture(makeRegistrationPlate()));
    plateTexture.colorSpace = THREE.SRGBColorSpace;
    const plateMaterial = keep(new THREE.MeshBasicMaterial({
      map: plateTexture,
      transparent: true,
      depthWrite: false,
    }));
    const plate = new THREE.Mesh(keep(new THREE.PlaneGeometry(6.7, 6.7)), plateMaterial);
    plate.rotation.x = -Math.PI / 2;
    plate.position.set(0, -0.75, 0);
    plate.renderOrder = -2;
    scene.add(plate);
    const shadow = new THREE.Mesh(
      keep(new THREE.CircleGeometry(1, 48)),
      keep(new THREE.MeshBasicMaterial({
        color: ARTIFACT_COLORS.graphite,
        transparent: true,
        opacity: 0.085,
        depthWrite: false,
      })),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0.14, -0.742, 0.18);
    shadow.scale.set(1.75, 1.08, 1);
    shadow.renderOrder = -1;
    scene.add(shadow);

    let currentDpr = 1;
    let adaptiveCap = Number.POSITIVE_INFINITY;
    let frameCount = 0;
    const budget = new FrameBudget();
    const lerp = THREE.MathUtils.lerp;

    function requestFrame() {
      if (disposed || !active || raf !== null) return;
      raf = window.requestAnimationFrame(renderFrame);
    }

    function resize() {
      if (disposed) return;
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      const qualityCap = options.quality === 'full' ? 1.5 : pointerQuery?.matches ? 1 : 1.25;
      currentDpr = Math.min(window.devicePixelRatio || 1, qualityCap, adaptiveCap);
      engine.setPixelRatio(currentDpr);
      engine.setSize(width, height, false);
      const aspect = width / height;
      const viewHeight = Math.max(4.35, 7.1 / aspect);
      camera.left = (-viewHeight * aspect) / 2;
      camera.right = (viewHeight * aspect) / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.updateProjectionMatrix();
      requestFrame();
    }

    function pose() {
      collection.position.y = lift;
      shadow.scale.x = lerp(1.75, 2.45, spread);
      folios.forEach(({ folio, index }) => {
        const middle = index - 2.5;
        const parity = index % 2 === 0 ? -1 : 1;
        folio.position.set(
          lerp(parity * 0.085, middle * 0.72, spread),
          lerp(-0.42 + index * 0.195, -0.12 + index * 0.135, spread),
          lerp((index - 2.5) * 0.018, 0.06 + Math.abs(middle) * 0.13 + middle * 0.495, spread),
        );
        // Parallel fan targets keep the raised folds clear of neighboring covers.
        folio.rotation.set(
          lerp(parity * 0.012, 0, spread),
          lerp(parity * 0.1, middle * 0.24, spread),
          lerp(parity * 0.014, 0, spread),
        );
        folio.scale.setScalar(lerp(1, 0.79, spread));
      });
    }

    function renderFrame(time: number) {
      raf = null;
      if (disposed || !active) return;
      const delta = previousTime === null ? 0 : time - previousTime;
      previousTime = time;
      const wasAnimating = transition !== null;
      if (transition) {
        transition.elapsed += delta;
        const progress = Math.min(1, transition.elapsed / transition.duration);
        const eased = 1 - (1 - progress) ** 3;
        spread = lerp(transition.fromSpread, targetSpread, eased);
        lift = lerp(transition.fromLift, 0, eased);
        if (progress === 1) transition = null;
      }
      pose();
      try {
        const start = performance.now();
        engine.render(scene, camera);
        const renderMs = performance.now() - start;
        if (engine.getContext().isContextLost()) {
          fallback('The 3D view was interrupted. The illustrated view is ready.');
          return;
        }
        frameCount += 1;
        options.onFrame(frameCount);
        if (frameCount === 1) options.onFirstFrame();
        // Only consecutive animated frames count: idle time is not a slow frame.
        const action = wasAnimating ? budget.sample(delta, renderMs, currentDpr) : 'keep';
        if (action === 'fallback') {
          fallback('Showing the illustrated view to keep things responsive.');
          return;
        }
        if (action === 'reduce') {
          adaptiveCap = Math.max(MIN_SCENE_DPR, currentDpr > 1 ? 1 : currentDpr - 0.25);
          resize();
        }
      } catch {
        fallback('The 3D view could not be drawn. The illustrated view is ready.');
        return;
      }
      if (transition) requestFrame();
      else previousTime = null;
    }

    host.append(canvas);
    resizeListener = resize;
    pointerListener = resize;
    window.addEventListener('resize', resize);
    pointerQuery?.addEventListener('change', resize);
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);
    }
    resize();

    return {
      setActive(nextActive) {
        if (disposed || active === nextActive) return;
        active = nextActive;
        previousTime = null;
        if (active) requestFrame();
        else if (raf !== null) {
          window.cancelAnimationFrame(raf);
          raf = null;
        }
      },
      setFanned(fanned) {
        if (disposed || targetSpread === Number(fanned)) return;
        targetSpread = Number(fanned);
        transition = {
          fromSpread: spread,
          fromLift: lift,
          elapsed: 0,
          duration: 780,
        };
        previousTime = null;
        requestFrame();
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
