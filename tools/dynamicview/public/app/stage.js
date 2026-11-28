import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ModelLoader, disposeModel } from './models.js';
import { SceneLighting } from './lighting.js';
import { FlyNavigation } from './fly-navigation.js';

const defaults = new THREE.Vector3(0.12, 0.24, 1).normalize();
const unit = 2.7;
const xrWidth = 0.45;
const viewRight = new THREE.Vector3(0, 1, 0).cross(defaults).normalize();
const viewUp = new THREE.Vector3().crossVectors(defaults, viewRight);

export class Stage {
  constructor(viewport, video, xrOverlay, onMode, onXRHint) {
    this.viewport = viewport;
    this.video = video;
    this.xrOverlay = xrOverlay;
    this.onMode = onMode;
    this.onXRHint = onXRHint;
    this.mode = 'orbit';
    this.renderer = new THREE.WebGLRenderer({ alpha: true });
    this.renderer.domElement.setAttribute('aria-label', 'Khung xem model 3D');
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setClearColor(0, 0);
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType('local');
    this.renderer.setAnimationLoop((time, frame) => this.animate(time, frame));
    viewport.append(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.lighting = new SceneLighting(this.scene, this.renderer);

    this.camera = new THREE.PerspectiveCamera(39, 1, 0.02, 100);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.addEventListener('change', () => { this.dirty = true; });
    this.controls.enableDamping = true;
    this.controls.zoomToCursor = true;
    this.controls.minDistance = 0.12;
    this.controls.maxDistance = 28;
    this.controls.autoRotateSpeed = 0.75;
    this.flight = new FlyNavigation(this.camera, this.renderer.domElement, viewport, () => { this.dirty = true; });
    this.sight = new THREE.Vector3();

    this.anchor = new THREE.Group();
    this.pivot = new THREE.Group();
    this.anchor.add(this.pivot);
    this.scene.add(this.anchor);
    this.reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.052, 0.066, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xe4d1ff, side: THREE.DoubleSide })
    );
    this.reticle.matrixAutoUpdate = false;
    this.reticle.visible = false;
    this.scene.add(this.reticle);
    this.loader = new ModelLoader(this.renderer);
    this.placement = new THREE.Matrix4();
    this.floorPoint = new THREE.Vector3();
    new ResizeObserver(() => this.resize()).observe(viewport);
    this.resize();
    this.reset();
  }

  resize() {
    if (this.renderer.xr.isPresenting) return;
    const { clientWidth: width, clientHeight: height } = this.viewport;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.dirty = true;
  }

  async show(model, signal) {
    const asset = await this.loader.load(model, signal);
    if (signal.aborted) {
      disposeModel(asset);
      signal.throwIfAborted();
    }
    if (this.asset) {
      this.pivot.remove(this.asset.object);
      disposeModel(this.asset);
    }
    this.asset = asset;
    this.flip = false;
    this.lighting.setAsset(asset);
    this.viewport.classList.toggle('has-mesh', asset.kind === 'mesh');
    this.pivot.add(asset.object);
    if (asset.SparkRenderer && !this.spark) {
      this.spark = new asset.SparkRenderer({
        renderer: this.renderer,
        onDirty: () => { this.dirty = true; }
      });
      this.scene.add(this.spark);
    }
    if (this.spark) this.spark.visible = asset.kind === 'splats';
    this.fit();
    this.reset();
    return asset;
  }

  fit() {
    const { bounds } = this.asset;
    const angle = this.asset.rotationX + (this.flip ? Math.PI : 0);
    const rotation = new THREE.Matrix4().makeRotationX(angle);
    const box = bounds.clone().applyMatrix4(rotation);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const scale = unit / (Math.max(size.x, size.y, size.z) || 1);
    this.pivot.rotation.x = angle;
    this.pivot.scale.setScalar(scale);
    this.pivot.position.copy(center.multiplyScalar(-scale));
    this.halfHeight = size.y * scale / 2;
    this.viewSize = size.multiplyScalar(scale);
    if (this.asset.kind === 'points') this.asset.object.material.size = 0.013 / scale;
    this.updateGround();
    this.dirty = true;
  }

  reset() {
    if (this.mode === 'xr') return;
    this.controls.target.set(0, 0, 0);
    const fit = Math.min(this.camera.aspect || 1, 1.25);
    const distance = this.asset?.kind === 'mesh' ? this.meshDistance() : 5.5 / fit;
    this.camera.position.copy(defaults).multiplyScalar(distance);
    if (this.flight.active) {
      this.flight.clearInput();
      this.camera.lookAt(this.controls.target);
      this.flight.align();
    } else {
      this.controls.update();
    }
    this.dirty = true;
  }

  setFlight(active) {
    if (this.flight.active === active || (active && this.mode !== 'orbit')) return;
    if (active) this.controls.autoRotate = false;
    this.controls.enabled = this.mode !== 'xr' && !active;
    this.camera.near = active ? 0.004 : 0.02;
    this.camera.updateProjectionMatrix();
    this.flight.setActive(active);
    if (!active && this.controls.enabled) {
      this.camera.getWorldDirection(this.sight);
      this.controls.target.sub(this.camera.position);
      const depth = THREE.MathUtils.clamp(this.controls.target.dot(this.sight), 0.25, this.controls.maxDistance);
      this.controls.target.copy(this.camera.position).addScaledVector(this.sight, depth);
      this.controls.update();
    }
    this.dirty = true;
  }

  meshDistance() {
    const half = this.viewSize.clone().multiplyScalar(0.5);
    const corner = new THREE.Vector3();
    const vertical = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 0.86;
    const horizontal = vertical * this.camera.aspect;
    let distance = 3.7;
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? half.x : -half.x, i & 2 ? half.y : -half.y, i & 4 ? half.z : -half.z);
      const width = Math.abs(corner.dot(viewRight)) / horizontal;
      const height = Math.abs(corner.dot(viewUp)) / vertical;
      distance = Math.max(distance, corner.dot(defaults) + Math.max(width, height));
    }
    return distance;
  }

  rotate() {
    this.flip = !this.flip;
    this.fit();
  }

  setMode(mode) {
    this.mode = mode;
    if (mode !== 'orbit') this.setFlight(false);
    this.viewport.classList.toggle('camera-live', mode === 'camera');
    document.body.classList.toggle('in-xr', mode === 'xr');
    this.updateGround();
    this.dirty = true;
    this.onMode(mode);
  }

  updateGround() {
    if (!this.asset) return;
    let floor = null;
    if (this.mode === 'orbit') {
      floor = this.floorPoint.set(0, -this.halfHeight - 0.003, 0);
    } else if (this.mode === 'xr' && this.anchor.visible && this.placement.elements[5] > 0.85) {
      floor = this.floorPoint.setFromMatrixPosition(this.placement);
      floor.y -= 0.002;
    }
    this.lighting.place(this.anchor.position, unit * this.anchor.scale.x, floor, this.mode === 'orbit');
  }

  setStudioLight(angle, level, shadows) {
    this.lighting.setStudio(angle, level);
    this.lighting.setShadows(shadows);
    this.dirty = true;
  }

  async startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera cần mở viewer bằng HTTPS.');
    const media = await navigator.mediaDevices.getUserMedia({
      audio: false, video: { facingMode: { ideal: 'environment' } }
    });
    try {
      this.video.srcObject = media;
      await this.video.play();
      this.setMode('camera');
    } catch (error) {
      this.stopCamera();
      throw error;
    }
  }

  stopCamera() {
    this.video.srcObject?.getTracks().forEach((track) => track.stop());
    this.video.srcObject = null;
    if (this.mode === 'camera') this.setMode('orbit');
  }

  async startXR() {
    const session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: this.asset.kind === 'mesh' ? ['dom-overlay', 'light-estimation'] : ['dom-overlay'],
      domOverlay: { root: this.xrOverlay }
    });
    this.stopCamera();
    session.addEventListener('end', () => this.endXR(), { once: true });
    try {
      const viewerSpace = await session.requestReferenceSpace('viewer');
      this.hitSource = await session.requestHitTestSource({ space: viewerSpace });
      this.xrSession = session;
      this.controls.enabled = false;
      this.anchor.visible = false;
      this.scaleXR = 1;
      this.onXRHint('Di chuyển camera để tìm bề mặt.');
      this.setMode('xr');
      await this.renderer.xr.setSession(session);
      if (this.asset.kind === 'mesh' && typeof session.requestLightProbe === 'function') {
        session.requestLightProbe().then((probe) => {
          if (this.xrSession === session) this.xrLightProbe = probe;
        }).catch(() => {}); // Continue with the studio lights when estimation is unavailable.
      }
      session.addEventListener('select', () => {
        if (this.reticle.visible) this.place();
      });
    } catch (error) {
      await session.end().catch(() => {});
      throw error;
    }
  }

  place() {
    this.placement.copy(this.reticle.matrix);
    this.anchor.position.setFromMatrixPosition(this.placement);
    // Keep the model vertical even when the selected surface is inclined.
    this.anchor.quaternion.identity();
    this.anchor.visible = true;
    this.resizeInAR(1);
    this.onXRHint('Chạm vào bề mặt để đổi vị trí.');
  }

  resizeInAR(factor) {
    this.scaleXR = THREE.MathUtils.clamp(this.scaleXR * factor, 0.25, 5);
    const scale = xrWidth * this.scaleXR / unit;
    this.anchor.scale.setScalar(scale);
    this.anchor.position.y = this.placement.elements[13] + this.halfHeight * scale;
    this.updateGround();
  }

  endXR() {
    this.hitSource?.cancel();
    this.hitSource = null;
    this.xrSession = null;
    this.xrLightProbe = null;
    this.lighting.useStudio();
    this.reticle.visible = false;
    this.anchor.visible = true;
    this.anchor.position.set(0, 0, 0);
    this.anchor.scale.setScalar(1);
    this.controls.enabled = true;
    this.setMode('orbit');
    this.resize();
    this.reset();
  }

  animate(time, frame) {
    const elapsed = THREE.MathUtils.clamp((time - (this.lastFrame ?? time)) / 1000, 0, 0.05);
    this.lastFrame = time;
    if (this.asset?.mixer) {
      this.asset.mixer.update(elapsed);
      this.lighting.updateAnimatedShadow();
    }
    if (frame && this.hitSource) {
      const space = this.renderer.xr.getReferenceSpace();
      const pose = space && frame.getHitTestResults(this.hitSource)[0]?.getPose(space);
      if (space && this.xrLightProbe) {
        const lightPose = frame.getPose(this.xrLightProbe.probeSpace, space);
        const estimate = frame.getLightEstimate(this.xrLightProbe);
        if (lightPose && estimate) this.lighting.useEstimate(estimate, lightPose.transform.orientation);
      }
      this.reticle.visible = !!pose;
      if (pose) {
        this.reticle.matrix.fromArray(pose.transform.matrix);
        this.reticle.matrixWorldNeedsUpdate = true;
        if (!this.anchor.visible) this.onXRHint('Chạm vào bề mặt để đặt model.');
      }
    } else if (this.flight.active) {
      this.flight.update(elapsed);
    } else if (this.controls.enabled) {
      this.controls.update(elapsed);
    }
    if (this.dirty || frame || this.asset?.mixer) {
      this.dirty = false;
      this.renderer.render(this.scene, this.camera);
    }
  }

  async makeQuickLook() {
    const [{ USDZExporter }, { decompress }] = await Promise.all([
      import('three/addons/exporters/USDZExporter.js'),
      import('three/addons/utils/WebGLTextureUtils.js')
    ]);
    const exporter = new USDZExporter();
    exporter.setTextureUtils({ decompress });
    const copy = this.pivot.clone();
    const wrapper = new THREE.Group();
    wrapper.scale.setScalar(xrWidth / unit);
    wrapper.add(copy);
    const data = await exporter.parseAsync(wrapper, { maxTextureSize: 2048 });
    return URL.createObjectURL(new Blob([data], { type: 'model/vnd.usdz+zip' }));
  }
}
