import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ArtifactStill from './ArtifactStill';
import { createCollectionScene } from './CollectionScene';

const render = vi.hoisted(() => vi.fn<(scene: THREE.Scene, camera: THREE.Camera) => void>());

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  return {
    ...actual,
    WebGLRenderer: class {
      shadowMap = { enabled: false };
      setClearColor() {}
      setPixelRatio() {}
      setSize() {}
      dispose() {}
      getContext() {
        return { isContextLost: () => false };
      }
      render(scene: THREE.Scene, camera: THREE.Camera) {
        scene.updateMatrixWorld(true);
        camera.updateMatrixWorld(true);
        render(scene, camera);
      }
    },
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  render.mockClear();
});

function fixture(width: number, height: number) {
  const drawing = {
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    ellipse: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
  };
  const context = { isContextLost: () => false, getExtension: () => ({ loseContext: vi.fn() }) };
  vi.stubGlobal('document', {
    fonts: { check: () => true },
    createElement: (tag: string) =>
      tag === 'div'
        ? { clientWidth: width, clientHeight: height, append: vi.fn() }
        : Object.assign(new EventTarget(), {
            width: 0,
            height: 0,
            setAttribute: vi.fn(),
            remove: vi.fn(),
            getContext: (kind: string) => (kind === '2d' ? drawing : context),
          }),
  });
  let next = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.stubGlobal(
    'window',
    Object.assign(new EventTarget(), {
      devicePixelRatio: 1,
      matchMedia: () => Object.assign(new EventTarget(), { matches: false }),
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        const id = ++next;
        frames.set(id, callback);
        return id;
      },
      cancelAnimationFrame: (id: number) => frames.delete(id),
    }),
  );
  vi.stubGlobal('ResizeObserver', undefined);
  const first = vi.fn();
  const failure = vi.fn();
  const handle = createCollectionScene(document.createElement('div'), {
    quality: 'auto',
    fanned: false,
    active: true,
    onFirstFrame: first,
    onFrame: vi.fn(),
    onFallback: failure,
  });
  const draw = (time: number) => {
    const pending = frames.entries().next().value;
    if (!pending) throw new Error('The scene did not request a frame.');
    frames.delete(pending[0]);
    pending[1](time);
    expect(failure).not.toHaveBeenCalled();
    const latest = render.mock.lastCall;
    if (!latest) throw new Error('The scene did not render.');
    return { scene: latest[0], camera: latest[1] };
  };
  return { handle, draw, first, frames, drawing };
}

function bounds(points: readonly { x: number; y: number }[]) {
  return {
    left: Math.min(...points.map((point) => point.x)),
    right: Math.max(...points.map((point) => point.x)),
    top: Math.min(...points.map((point) => point.y)),
    bottom: Math.max(...points.map((point) => point.y)),
  };
}

function projected(mesh: THREE.Mesh, camera: THREE.Camera, width: number, height: number) {
  const vertices = mesh.geometry.getAttribute('position');
  return bounds(
    Array.from({ length: vertices.count }, (_, index) => {
      const point = new THREE.Vector3()
        .fromBufferAttribute(vertices, index)
        .applyMatrix4(mesh.matrixWorld)
        .project(camera);
      return { x: ((point.x + 1) * width) / 2, y: ((1 - point.y) * height) / 2 };
    }),
  );
}

function stillCoverBounds(width: number, height: number) {
  const html = renderToStaticMarkup(createElement(ArtifactStill, { fanned: false }));
  const matrix = html
    .match(/transform="matrix\(([-\d. ]+)\)"/)?.[1]
    ?.split(' ')
    .map(Number);
  if (!matrix || matrix.length !== 6) throw new Error('The still must expose its authored cover projection.');
  const [a, b, c, d, e, f] = matrix as [number, number, number, number, number, number];
  const scale = Math.min(width / 600, height / 360);
  return [...html.matchAll(/transform:translate\(([-\d.]+)px, ([-\d.]+)px\) rotate\(([-\d.]+)deg\)/g)].map((match) => {
    const angle = THREE.MathUtils.degToRad(Number(match[3]));
    return bounds(
      (
        [
          [0, 0],
          [220, 0],
          [220, 150],
          [0, 150],
        ] as const
      ).map(([u, v]) => {
        const x = a * u + c * v + e;
        const y = b * u + d * v + f;
        return {
          x: (Number(match[1]) + Math.cos(angle) * x - Math.sin(angle) * y) * scale + (width - 600 * scale) / 2,
          y: (Number(match[2]) + Math.sin(angle) * x + Math.cos(angle) * y) * scale + (height - 360 * scale) / 2,
        };
      }),
    );
  });
}

describe('resting artifact continuity', () => {
  it.each([
    [600, 360],
    [616, 320],
    [286, 185],
  ])('matches all six still cover footprints on the first %ix%i scene frame', (width, height) => {
    const current = fixture(width, height);
    try {
      const { scene, camera } = current.draw(0);
      const collection = scene.children.find((child) => child instanceof THREE.Group);
      if (!collection) throw new Error('The six-sleeve collection must be in the scene.');
      const expected = stillCoverBounds(width, height);
      expect(expected).toHaveLength(6);
      expect(collection.children).toHaveLength(6);
      collection.children.forEach((folio, index) => {
        const target = expected[index];
        const cover = folio.children.find(
          (child) => child instanceof THREE.Mesh && child.geometry instanceof THREE.PlaneGeometry,
        );
        if (!(cover instanceof THREE.Mesh) || !target) throw new Error('A sleeve cover is missing.');
        const actual = projected(cover as THREE.Mesh, camera, width, height);
        for (const side of ['left', 'right', 'top', 'bottom'] as const) {
          expect(Math.abs(actual[side] - target[side])).toBeLessThanOrEqual(0.5);
        }
      });
      expect(current.first).toHaveBeenCalledOnce();
      expect(current.frames.size).toBe(0);
      expect(current.drawing.ellipse.mock.calls).toEqual(
        expect.arrayContaining([
          [0, 0, 240, 60, 0, 0, Math.PI * 2],
          [0, 0, 206, 48, 0, 0, Math.PI * 2],
        ]),
      );
      const plate = scene.children.find(
        (child) => child instanceof THREE.Mesh && child.geometry instanceof THREE.PlaneGeometry,
      );
      if (!(plate instanceof THREE.Mesh)) throw new Error('The printed guide must remain in the scene.');
      const guide = projected(plate as THREE.Mesh, camera, width, height);
      const scale = Math.min(width / 600, height / 360);
      expect(guide.right - guide.left).toBeCloseTo(600 * scale, 4);
      expect(guide.bottom - guide.top).toBeCloseTo(360 * scale, 4);

      current.handle.setFanned(true);
      current.draw(1);
      current.draw(781);
      collection.children.forEach((folio, index) => {
        const middle = index - 2.5;
        expect(folio.position.x).toBeCloseTo(middle * 0.72, 12);
        expect(folio.position.y).toBeCloseTo(-0.12 + index * 0.135, 12);
        expect(folio.position.z).toBeCloseTo(0.06 + Math.abs(middle) * 0.13 + middle * 0.495, 12);
        expect(folio.scale.x).toBeCloseTo(0.79, 12);
      });
    } finally {
      current.handle.dispose();
    }
  });
});
