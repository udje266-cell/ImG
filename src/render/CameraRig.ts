import { PerspectiveCamera, Vector3 } from "three";

/**
 * God-view camera: orbits a target point on the ground plane at a fixed
 * pitch, with pan / dolly / yaw controls. Touch-first: pan and zoom map
 * naturally to two-finger gestures (docs/GDD.md §5.3).
 */
export class CameraRig {
  static readonly MIN_DISTANCE = 14;
  static readonly MAX_DISTANCE = 260;

  readonly camera: PerspectiveCamera;
  readonly target: Vector3;
  distance = 90;
  /** Camera elevation angle above the horizon, radians. */
  pitch = 0.95;
  yaw = Math.PI;

  constructor(aspect: number, targetX: number, targetZ: number) {
    this.camera = new PerspectiveCamera(50, aspect, 0.5, 1200);
    this.target = new Vector3(targetX, 0, targetZ);
    this.update();
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Re-derive the camera transform from target/distance/pitch/yaw. */
  update(): void {
    const horizontal = this.distance * Math.cos(this.pitch);
    this.camera.position.set(
      this.target.x + horizontal * Math.sin(this.yaw),
      this.target.y + this.distance * Math.sin(this.pitch),
      this.target.z + horizontal * Math.cos(this.yaw),
    );
    this.camera.lookAt(this.target);
  }

  /** Pan the target on the ground plane by a screen-space drag delta. */
  panByScreen(dx: number, dy: number, viewH: number): void {
    // Screen-space scale: a full-height drag sweeps ~1.2x the view depth.
    const scale = (this.distance * 1.2) / viewH;
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    // Camera right and ground-projected forward vectors.
    this.target.x -= (dx * cosY - dy * sinY) * scale;
    this.target.z -= (-dx * sinY - dy * cosY) * scale;
  }

  /** Zoom by a multiplicative factor (>1 = away, <1 = closer). */
  dolly(factor: number): void {
    this.distance = Math.min(
      CameraRig.MAX_DISTANCE,
      Math.max(CameraRig.MIN_DISTANCE, this.distance * factor),
    );
  }

  rotate(deltaYaw: number): void {
    this.yaw += deltaYaw;
  }
}
