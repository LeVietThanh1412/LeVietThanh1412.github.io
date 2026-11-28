import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { USDLoader } from 'three/addons/loaders/USDLoader.js';
import { inspectPly } from './ply.js';

const root = new URL('../vendor/three/examples/jsm/libs/', import.meta.url).pathname;
const manager = new THREE.LoadingManager().setURLModifier((url) => {
  if (/^(blob:|data:)/.test(url) || url.startsWith(root)) return url;
  throw new Error('GLB cần nhúng toàn bộ texture và dữ liệu hình học vào tệp.');
});

function makePly(buffer, kind) {
  const geometry = new PLYLoader().parse(buffer.buffer);
  const color = geometry.hasAttribute('color');
  if (kind === 'points') {
    return new THREE.Points(geometry, new THREE.PointsMaterial({
      color: color ? 0xffffff : 0x7251bd, vertexColors: color, size: 0.013
    }));
  }
  if (!geometry.hasAttribute('normal')) geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: color ? 0xffffff : 0xa690d7, vertexColors: color, side: THREE.DoubleSide, roughness: 0.72
  }));
}

export class ModelLoader {
  constructor(renderer) {
    const draco = new DRACOLoader(manager).setDecoderPath(root + 'draco/gltf/');
    const basis = new KTX2Loader(manager).setTranscoderPath(root + 'basis/').detectSupport(renderer);
    this.gltf = new GLTFLoader(manager)
      .setDRACOLoader(draco).setKTX2Loader(basis).setMeshoptDecoder(MeshoptDecoder);
  }

  async load(model, signal) {
    const response = await fetch(model.url, { signal });
    if (!response.ok) throw new Error(`Máy chủ trả mã ${response.status} khi tải model.`);
    const buffer = new Uint8Array(await response.arrayBuffer());
    signal.throwIfAborted();
    const { kind, rotationX } = model.type === 'ply' ? inspectPly(buffer, model.sample) : {
      kind: model.type === 'glb' || model.type === 'usdz' ? 'mesh' : 'splats', rotationX: 0
    };
    let object;
    let mixer;
    let SparkRenderer;
    let bounds;
    let usdzBlob;
    let exportable = false;
    try {
      if (kind === 'splats') {
        const spark = await import('@sparkjsdev/spark');
        SparkRenderer = spark.SparkRenderer;
        signal.throwIfAborted();
        object = new spark.SplatMesh({ fileBytes: buffer, fileName: model.name, raycastable: false });
        await object.initialized;
        bounds = object.getBoundingBox();
      } else if (model.type === 'glb') {
        const asset = await this.gltf.parseAsync(buffer.buffer, '');
        object = asset.scene;
        if (asset.animations.length) {
          mixer = new THREE.AnimationMixer(object);
          mixer.clipAction(asset.animations[0]).play();
        }
        exportable = true;
      } else if (model.type === 'usdz') {
        await new Promise((resolve, reject) => {
          object = new USDLoader(manager).parse(buffer.buffer, '', resolve, reject);
        });
        if (model.staticDemo) usdzBlob = new Blob([buffer], { type: 'model/vnd.usdz+zip' });
      } else {
        object = makePly(buffer, kind);
        exportable = kind === 'mesh';
      }
      signal.throwIfAborted();
      bounds ??= new THREE.Box3().setFromObject(object);
      const length = bounds.getSize(new THREE.Vector3()).length();
      if (!Number.isFinite(length) || bounds.isEmpty()) throw new Error('Không tìm thấy hình học hợp lệ.');
      return { ...model, object, bounds, kind, rotationX, SparkRenderer, mixer, exportable, usdzBlob };
    } catch (error) {
      if (object) disposeModel({ object, kind, mixer });
      throw error;
    }
  }
}

export function disposeModel({ object, kind, mixer }) {
  mixer?.stopAllAction();
  mixer?.uncacheRoot(object);
  if (kind === 'splats') {
    object.dispose();
    return;
  }
  const resources = new Set();
  const bitmaps = new Set();
  object.traverse((item) => {
    if (item.geometry) resources.add(item.geometry);
    if (item.skeleton) resources.add(item.skeleton);
    if (!item.material) return;
    for (const material of [item.material].flat()) {
      resources.add(material);
      for (const value of Object.values(material)) {
        if (!value?.isTexture) continue;
        resources.add(value);
        if (typeof ImageBitmap !== 'undefined' && value.image instanceof ImageBitmap) bitmaps.add(value.image);
      }
    }
  });
  for (const resource of resources) resource.dispose();
  for (const bitmap of bitmaps) bitmap.close();
}
