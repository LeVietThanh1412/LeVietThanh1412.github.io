import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listDemos } from './demo-library.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(process.argv[2] || join(root, 'dist'));
const vendors = new Map([
  ['three/build/three.module.js', 'three/build/three.module.js'],
  ['three/build/three.core.js', 'three/build/three.core.js'],
  ['three/examples/jsm', 'three/examples/jsm'],
  ['three/LICENSE', 'three/LICENSE'],
  ['@sparkjsdev/spark/dist/spark.module.js', 'spark/spark.module.js'],
  ['@sparkjsdev/spark/LICENSE', 'spark/LICENSE']
]);
await mkdir(output, { recursive: true });
await Promise.all([
  cp(join(root, 'public', 'app'), join(output, 'app'), { recursive: true }),
  cp(join(root, 'public', 'assets'), join(output, 'assets'), { recursive: true }),
  ...Array.from(vendors, ([source, target]) =>
    cp(join(root, 'node_modules', source), join(output, 'vendor', target), { recursive: true }))
]);

const html = await readFile(join(root, 'public', 'index.html'), 'utf8');
const staticHtml = html.replace('<html lang="vi">', '<html lang="vi" data-runtime="static">');
const demos = await listDemos();
const models = demos.map(({ file, ...model }) => ({ ...model, url: './assets/' + file, staticDemo: true }));
await Promise.all([
  writeFile(join(output, 'index.html'), staticHtml),
  writeFile(join(output, 'library.json'), JSON.stringify({ activeId: models[0].id, models }))
]);
console.log('DynamicView static build · ' + output);
