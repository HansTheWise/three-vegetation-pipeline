import { MathUtils, PerspectiveCamera, Vector3 } from 'three';

type FirstPersonCameraControllerOptions = Readonly<{
  camera: PerspectiveCamera;
  canvas: HTMLCanvasElement;
  upAxis: Vector3;
  horizontalForwardAxis: Vector3;
  movementSpeed: number;
}>;

const MAXIMUM_PITCH = Math.PI * 0.5 - 0.01;
const MOUSE_SENSITIVITY = 0.002;

export class FirstPersonCameraController {
  readonly #canvas: HTMLCanvasElement;
  readonly #upAxis: Vector3;
  readonly #horizontalForwardAxis: Vector3;
  readonly #horizontalRightAxis: Vector3;
  readonly #movementSpeed: number;
  readonly #pressedKeys = new Set<string>();
  readonly #horizontalForward = new Vector3();
  readonly #right = new Vector3();
  readonly #forward = new Vector3();
  readonly #movement = new Vector3();
  readonly #lookTarget = new Vector3();

  #camera: PerspectiveCamera;
  #yaw = 0;
  #pitch = 0;

  constructor(options: FirstPersonCameraControllerOptions) {
    this.#camera = options.camera;
    this.#canvas = options.canvas;
    this.#upAxis = options.upAxis.clone().normalize();
    this.#horizontalForwardAxis = options.horizontalForwardAxis.clone().normalize();
    this.#horizontalRightAxis = new Vector3()
      .crossVectors(this.#horizontalForwardAxis, this.#upAxis)
      .normalize();
    this.#movementSpeed = options.movementSpeed;
    this.setCamera(options.camera);

    this.#canvas.addEventListener('click', this.#captureMouse);
    document.addEventListener('mousemove', this.#rotateCamera);
    window.addEventListener('keydown', this.#pressKey);
    window.addEventListener('keyup', this.#releaseKey);
    window.addEventListener('blur', this.#clearKeys);
  }

  setCamera(camera: PerspectiveCamera): void {
    this.#camera = camera;
    camera.up.copy(this.#upAxis);
    camera.getWorldDirection(this.#forward);
    this.#pitch = Math.asin(MathUtils.clamp(this.#forward.dot(this.#upAxis), -1, 1));
    this.#horizontalForward
      .copy(this.#forward)
      .addScaledVector(this.#upAxis, -this.#forward.dot(this.#upAxis))
      .normalize();
    this.#yaw = Math.atan2(
      this.#horizontalForward.dot(this.#horizontalRightAxis),
      this.#horizontalForward.dot(this.#horizontalForwardAxis),
    );
    this.#applyRotation();
  }

  update(deltaSeconds: number): void {
    this.#movement.set(0, 0, 0);
    if (this.#pressedKeys.has('KeyW')) this.#movement.add(this.#horizontalForward);
    if (this.#pressedKeys.has('KeyS')) this.#movement.sub(this.#horizontalForward);
    if (this.#pressedKeys.has('KeyD')) this.#movement.add(this.#right);
    if (this.#pressedKeys.has('KeyA')) this.#movement.sub(this.#right);
    if (this.#pressedKeys.has('Space')) this.#movement.add(this.#upAxis);
    if (this.#pressedKeys.has('ShiftLeft') || this.#pressedKeys.has('ShiftRight')) {
      this.#movement.sub(this.#upAxis);
    }

    if (this.#movement.lengthSq() > 0) {
      this.#camera.position.addScaledVector(
        this.#movement.normalize(),
        this.#movementSpeed * deltaSeconds,
      );
      this.#applyRotation();
    }
  }

  dispose(): void {
    this.#canvas.removeEventListener('click', this.#captureMouse);
    document.removeEventListener('mousemove', this.#rotateCamera);
    window.removeEventListener('keydown', this.#pressKey);
    window.removeEventListener('keyup', this.#releaseKey);
    window.removeEventListener('blur', this.#clearKeys);
  }

  readonly #captureMouse = (): void => {
    void this.#canvas.requestPointerLock();
  };

  readonly #rotateCamera = (event: MouseEvent): void => {
    if (document.pointerLockElement !== this.#canvas) return;
    this.#yaw += event.movementX * MOUSE_SENSITIVITY;
    this.#pitch = MathUtils.clamp(
      this.#pitch - event.movementY * MOUSE_SENSITIVITY,
      -MAXIMUM_PITCH,
      MAXIMUM_PITCH,
    );
    this.#applyRotation();
  };

  readonly #pressKey = (event: KeyboardEvent): void => {
    if (isMovementKey(event.code)) event.preventDefault();
    this.#pressedKeys.add(event.code);
  };

  readonly #releaseKey = (event: KeyboardEvent): void => {
    this.#pressedKeys.delete(event.code);
  };

  readonly #clearKeys = (): void => {
    this.#pressedKeys.clear();
  };

  #applyRotation(): void {
    this.#horizontalForward
      .copy(this.#horizontalForwardAxis)
      .multiplyScalar(Math.cos(this.#yaw))
      .addScaledVector(this.#horizontalRightAxis, Math.sin(this.#yaw))
      .normalize();
    this.#right.crossVectors(this.#horizontalForward, this.#upAxis).normalize();
    this.#forward
      .copy(this.#horizontalForward)
      .multiplyScalar(Math.cos(this.#pitch))
      .addScaledVector(this.#upAxis, Math.sin(this.#pitch))
      .normalize();
    this.#lookTarget.copy(this.#camera.position).add(this.#forward);
    this.#camera.lookAt(this.#lookTarget);
  }
}

function isMovementKey(code: string): boolean {
  return code === 'KeyW'
    || code === 'KeyA'
    || code === 'KeyS'
    || code === 'KeyD'
    || code === 'Space'
    || code === 'ShiftLeft'
    || code === 'ShiftRight';
}
