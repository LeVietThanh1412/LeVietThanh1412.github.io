import { mkdir, writeFile } from 'node:fs/promises';
import { Color, Group, Mesh, MeshStandardMaterial, TorusKnotGeometry, Vector3 } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { USDZExporter } from 'three/addons/exporters/USDZExporter.js';

// The glTF exporter reads Blob data through FileReader in browsers.
globalThis.FileReader ??= class {
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer();
    this.onloadend();
  }
};

const directory = new URL('../public/assets/', import.meta.url);
await mkdir(directory, { recursive: true });
const geometry = new TorusKnotGeometry(1, 0.32, 256, 32, 2, 3);
geometry.rotateX(0.32);
geometry.rotateZ(-0.30);
const positions = geometry.attributes.position;
const normals = geometry.attributes.normal;
const colors = new Float32Array(positions.count * 3);
const base = new Color('#7c61b9');
const accent = new Color('#bf96d8');
const shade = new Color();
const segments = 32;
for (let i = 0; i < positions.count; i++) {
  const fraction = Math.floor(i / (segments + 1)) / 256;
  shade.copy(base).lerp(accent, 0.5 + 0.5 * Math.sin(fraction * Math.PI * 4));
  shade.toArray(colors, i * 3);
}
const scene = new Group();
const mesh = new Mesh(geometry, new MeshStandardMaterial({
  color: '#9975ce', roughness: 0.29, metalness: 0.16
}));
mesh.name = 'Orbit Study';
scene.add(mesh);
const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
const usdz = await new USDZExporter().parseAsync(scene);
await writeFile(new URL('orbit.glb', directory), new Uint8Array(glb));
await writeFile(new URL('orbit.usdz', directory), usdz);

// Produce a small standard 3DGS PLY with covariance, opacity and SH0.
const properties = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2',
  'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3'];
const light = new Vector3(-2, 3, 4).normalize();
const normal = new Vector3();
const payload = Buffer.alloc(256 * segments * properties.length * 4);
let offset = 0;
for (let ring = 0; ring < 256; ring++) {
  for (let side = 0; side < segments; side++) {
    const i = ring * (segments + 1) + side;
    const illumination = 0.45 + 0.55 * Math.max(0, normal.fromBufferAttribute(normals, i).dot(light));
    shade.fromArray(colors, i * 3).multiplyScalar(illumination).convertLinearToSRGB();
    const dc = shade.toArray().map((value) => (value - 0.5) / 0.28209479177387814);
    const logScale = Math.log(0.032);
    const fields = [positions.getX(i), positions.getY(i), positions.getZ(i),
      ...dc, 3, logScale, logScale, logScale, 1, 0, 0, 0];
    for (const field of fields) offset = payload.writeFloatLE(field, offset);
  }
}
const header = ['ply', 'format binary_little_endian 1.0', 'comment dynamicview_up_axis y', `element vertex ${256 * segments}`,
  ...properties.map((property) => `property float ${property}`), 'end_header', ''].join('\n');
await writeFile(new URL('orbit-splats.ply', directory), Buffer.concat([Buffer.from(header), payload]));
