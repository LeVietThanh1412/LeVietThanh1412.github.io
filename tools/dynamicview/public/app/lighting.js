import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

function makeGrid(geometry) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#8e76a5';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let position = 16; position < 1024; position += 32) {
    ctx.moveTo(position, 0);
    ctx.lineTo(position, 1024);
    ctx.moveTo(0, position);
    ctx.lineTo(1024, position);
  }
  ctx.stroke();
  const fade = ctx.createRadialGradient(512, 512, 112, 512, 512, 510);
  fade.addColorStop(0, 'rgba(0,0,0,.34)');
  fade.addColorStop(1, 'transparent');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 1024, 1024);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    map, transparent: true, depthWrite: false, toneMapped: false
  }));
}

export class SceneLighting {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.angle = -36;
    this.level = 1;
    this.shadows = true;
    this.direction = new THREE.Vector3();
    this.estimatedDirection = new THREE.Vector3();
    this.probeRotation = new THREE.Quaternion();
    this.key = new THREE.DirectionalLight();
    Object.assign(this.key.shadow, { autoUpdate: false, bias: -0.00012, radius: 3 });
    this.key.shadow.mapSize.set(1024, 1024);
    this.fill = new THREE.HemisphereLight(0xffffff, 0xbeaead, 0.46);
    this.xrAmbient = new THREE.LightProbe();
    scene.add(this.key, this.key.target, this.fill, this.xrAmbient);

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    scene.environment = pmrem.fromScene(room, 0.05).texture;
    room.dispose();
    pmrem.dispose();

    this.ground = new THREE.Group();
    const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.grid = makeGrid(plane);
    this.shadow = new THREE.Mesh(plane, new THREE.ShadowMaterial({
      color: 0x302440, opacity: 0.43, depthWrite: false, toneMapped: false
    }));
    this.shadow.receiveShadow = true;
    this.shadow.renderOrder = 1;
    this.ground.add(this.grid, this.shadow);
    this.ground.visible = false;
    scene.add(this.ground);
    this.useStudio();
  }

  setAsset(asset) {
    this.mesh = asset.kind === 'mesh';
    this.renderer.toneMapping = this.mesh ? THREE.NeutralToneMapping : THREE.NoToneMapping;
    if (this.mesh) {
      asset.object.traverse((node) => {
        if (!node.isMesh) return;
        node.castShadow = [node.material].flat().some((material) =>
          (!material.transparent || material.alphaTest > 0) && !material.transmission);
        node.receiveShadow = true;
      });
    }
    this.setShadows(this.shadows);
  }

  setShadows(enabled) {
    this.shadows = enabled;
    this.key.castShadow = this.mesh && enabled;
    this.shadow.visible = this.key.castShadow;
    this.key.shadow.needsUpdate = this.key.castShadow;
  }

  setStudio(angle, level) {
    this.angle = angle;
    this.level = level;
    this.useStudio();
  }

  useStudio() {
    const angle = THREE.MathUtils.degToRad(this.angle);
    this.scene.environmentIntensity = 0.78 * this.level;
    this.fill.intensity = 0.46 * this.level;
    this.fill.visible = true;
    this.xrAmbient.visible = false;
    this.key.color.set(0xfff9f2);
    this.key.intensity = 1.6 * this.level;
    this.key.shadow.intensity = 1;
    this.setDirection(this.estimatedDirection.set(Math.sin(angle), 0.95, Math.cos(angle)).normalize());
  }

  useEstimate(estimate, orientation) {
    this.scene.environmentIntensity = 0.24;
    this.fill.visible = false;
    this.xrAmbient.visible = true;
    this.xrAmbient.sh.fromArray(estimate.sphericalHarmonicsCoefficients);
    const { x: red, y: green, z: blue } = estimate.primaryLightIntensity;
    const max = Math.max(1, red, green, blue);
    this.key.color.setRGB(red / max, green / max, blue / max);
    this.key.intensity = max;
    this.key.shadow.intensity = THREE.MathUtils.clamp(Math.max(red, green, blue), 0, 1);
    this.probeRotation.copy(orientation);
    const { x, y, z } = estimate.primaryLightDirection;
    const direction = this.estimatedDirection.set(x, y, z).applyQuaternion(this.probeRotation).normalize();
    this.setDirection(direction, 0.9998);
  }

  setDirection(direction, threshold = 1) {
    if (this.direction.dot(direction) >= threshold - Number.EPSILON) return;
    this.direction.copy(direction);
    this.positionKey();
  }

  positionKey() {
    this.key.position.copy(this.key.target.position).addScaledVector(this.direction, (this.extent || 1) * 3);
    this.key.shadow.needsUpdate = this.key.castShadow;
  }

  place(center, extent, floor, studio) {
    this.ground.visible = this.mesh && !!floor;
    this.grid.visible = studio;
    if (!this.mesh) return;
    if (floor) {
      this.ground.position.copy(floor);
      this.ground.scale.setScalar(extent * 4.5);
    }
    this.key.target.position.copy(center);
    if (this.extent !== extent) {
      this.extent = extent;
      const half = extent * 1.12;
      const camera = this.key.shadow.camera;
      Object.assign(camera, {
        left: -half, right: half, bottom: -half, top: half, near: extent * 0.025, far: extent * 6
      });
      camera.updateProjectionMatrix();
      this.key.shadow.normalBias = extent / 480;
    }
    this.positionKey();
  }

  updateAnimatedShadow() {
    this.key.shadow.needsUpdate = this.key.castShadow;
  }
}
