import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import { findSplatFocus } from '../public/app/splat-focus.js';

function source(points) {
  return { packedSplats: { numSplats: points.length, getSplat: (index) => points[index] } };
}

function splats(count, coordinates, opacity = 0.9) {
  return Array.from({ length: count }, (_, index) => ({
    center: new Vector3(...coordinates(index)),
    opacity
  }));
}

test('initial view centers a compact group and excludes the wide surrounding map', () => {
  const core = splats(180, (i) => [(i % 9 - 4) * 0.18, i / 90 - 1, (i % 11 - 5) * 0.12]);
  const edges = splats(1300, (i) => [
    Math.cos(i) * (12 + i % 15), (i % 21) - 10, Math.sin(i) * (12 + i % 15)
  ]);
  const noise = splats(100, () => [100, 70, -100], 0.01);
  const result = findSplatFocus(source([...core, ...edges, ...noise]), Math.PI);
  assert.ok(result.getCenter(new Vector3()).length() < 0.35);
  assert.ok(result.getSize(new Vector3()).length() < 3);
  assert.ok(result.getSize(new Vector3()).y > 1.4);
});

test('a compact subject with no central concentration keeps its overall framing', () => {
  const points = splats(1500, (i) => [Math.cos(i), (i % 41) / 20 - 1, Math.sin(i)]);
  const result = findSplatFocus(source(points), 0);
  for (const extent of result.getSize(new Vector3())) assert.ok(extent > 1.8 && extent <= 2);
});
