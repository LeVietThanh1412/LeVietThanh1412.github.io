import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectPly } from '../public/app/ply.js';

const coordinates = ['property float x', 'property float y', 'property float z'];
const trained = [...coordinates, 'property float f_dc_0', 'property float scale_0', 'property float rot_0'];

function ply(...fields) {
  const lines = ['ply', 'format binary_little_endian 1.0', 'element vertex 1', ...fields, 'end_header', ''];
  return new TextEncoder().encode(lines.join('\n'));
}

test('raw trained Gaussian PLY gets an X half-turn', () => {
  assert.deepEqual(inspectPly(ply(...trained)), { kind: 'splats', rotationX: Math.PI });
});

test('demo splats and a Y-up export preserve their authored orientation', () => {
  assert.deepEqual(inspectPly(ply(...trained), true), { kind: 'splats', rotationX: 0 });
  assert.deepEqual(inspectPly(ply('comment dynamicview_up_axis y', ...trained)), { kind: 'splats', rotationX: 0 });
});

test('plain PLY mesh and point clouds retain their orientation', () => {
  assert.deepEqual(inspectPly(ply(...coordinates)), { kind: 'points', rotationX: 0 });
  assert.deepEqual(inspectPly(ply(...coordinates, 'element face 1')), { kind: 'mesh', rotationX: 0 });
});

test('a declared Z-up axis maps to world +Y', () => {
  assert.deepEqual(inspectPly(ply('obj_info up_axis Z', ...coordinates)), {
    kind: 'points', rotationX: -Math.PI / 2
  });
});
