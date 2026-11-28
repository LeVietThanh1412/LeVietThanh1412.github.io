import { Euler, MathUtils, Vector3 } from 'three';

const keyDirections = {
  KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  KeyQ: 'down', KeyE: 'up'
};
const speed = 1.35;
const slowScale = 0.16;
const maxPitch = Math.PI / 2 - 0.001;

export class FlyNavigation {
  constructor(camera, canvas, viewport, redraw) {
    this.camera = camera;
    this.canvas = canvas;
    this.redraw = redraw;
    this.active = false;
    this.slow = false;
    this.keys = new Set();
    this.buttons = new Map();
    this.angles = new Euler(0, 0, 0, 'YXZ');
    this.step = new Vector3();

    canvas.tabIndex = 0;
    canvas.addEventListener('pointerdown', (event) => {
      if (!this.active || event.button !== 0 || this.look) return;
      canvas.focus({ preventScroll: true });
      canvas.setPointerCapture(event.pointerId);
      this.look = { id: event.pointerId, x: event.clientX, y: event.clientY };
    });
    canvas.addEventListener('pointermove', (event) => {
      const look = this.look;
      if (look?.id !== event.pointerId) return;
      this.angles.y -= (event.clientX - look.x) * 0.004;
      this.angles.x = MathUtils.clamp(this.angles.x - (event.clientY - look.y) * 0.004, -maxPitch, maxPitch);
      this.camera.quaternion.setFromEuler(this.angles);
      look.x = event.clientX;
      look.y = event.clientY;
      this.redraw();
    });
    canvas.addEventListener('lostpointercapture', (event) => {
      if (this.look?.id === event.pointerId) this.look = null;
    });
    canvas.addEventListener('wheel', (event) => {
      if (!this.active || event.ctrlKey || event.deltaY === 0) return;
      event.preventDefault();
      const scale = [1, 16, canvas.clientHeight][event.deltaMode] || 1;
      const delta = MathUtils.clamp(event.deltaY * scale, -120, 120);
      this.camera.translateZ(delta * 0.0035 * this.speedScale);
      this.redraw();
    }, { passive: false });

    viewport.addEventListener('keydown', (event) => {
      if (!this.active || event.altKey || event.ctrlKey || event.metaKey || event.target.matches('input, textarea, select')) return;
      if (!(event.code in keyDirections) && !event.code.startsWith('Shift')) return;
      if (event.code.startsWith('Arrow')) event.preventDefault();
      this.keys.add(event.code);
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => this.clearInput());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clearInput(); });
    viewport.addEventListener('focusout', (event) => {
      if (!viewport.contains(event.relatedTarget)) this.clearInput();
    });

    for (const button of viewport.querySelectorAll('[data-flight-move]')) {
      const direction = button.dataset.flightMove;
      button.addEventListener('pointerdown', (event) => {
        if (!this.active || event.button !== 0) return;
        button.setPointerCapture(event.pointerId);
        this.buttons.set(event.pointerId, button);
        this.move(new Set([direction]), 0.035);
      });
      button.addEventListener('lostpointercapture', (event) => this.buttons.delete(event.pointerId));
      button.addEventListener('click', (event) => {
        if (this.active && event.detail === 0) this.move(new Set([direction]), 0.035);
      });
    }
  }

  get speedScale() {
    return this.slow || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? slowScale : 1;
  }

  setActive(active) {
    this.active = active;
    if (active) {
      this.align();
      this.canvas.focus({ preventScroll: true });
    } else {
      this.clearInput();
    }
  }

  align() {
    this.angles.setFromQuaternion(this.camera.quaternion);
    this.angles.z = 0;
  }

  clearInput() {
    this.keys.clear();
    const id = this.look?.id;
    this.look = null;
    if (id !== undefined && this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
    for (const [pointerId, button] of this.buttons) {
      if (button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
    }
    this.buttons.clear();
  }

  update(elapsed) {
    if (!this.keys.size && !this.buttons.size) return;
    const directions = new Set();
    for (const key of this.keys) directions.add(keyDirections[key]);
    for (const button of this.buttons.values()) directions.add(button.dataset.flightMove);
    this.move(directions, elapsed);
  }

  move(directions, elapsed) {
    const across = Number(directions.has('right')) - Number(directions.has('left'));
    const forward = Number(directions.has('forward')) - Number(directions.has('back'));
    const rise = Number(directions.has('up')) - Number(directions.has('down'));
    if (!elapsed || !(across || forward || rise)) return;
    this.step.set(across, 0, -forward).applyQuaternion(this.camera.quaternion);
    this.step.y += rise;
    this.step.clampLength(0, 1);
    this.camera.position.addScaledVector(this.step, speed * this.speedScale * elapsed);
    this.redraw();
  }
}
