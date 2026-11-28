import { stat } from 'node:fs/promises';

export function listDemos() {
  return Promise.all([
    ['orbit', 'Orbit Study', 'glb', 'orbit.glb'],
    ['orbit-splats', 'Orbit · Gaussian', 'ply', 'orbit-splats.ply'],
    ['orbit-usdz', 'Orbit · USDZ', 'usdz', 'orbit.usdz']
  ].map(async ([id, name, type, file]) => ({
    id, name, type, file, sample: true,
    size: (await stat(new URL('../public/assets/' + file, import.meta.url))).size
  })));
}
