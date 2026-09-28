import * as THREE from "three";
import { PLAYER_EYE_HEIGHT, PLAYER_HEIGHT, PLAYER_WIDTH } from "@wire-lock/shared";
import type { Vec3 } from "@wire-lock/shared";

const RADIUS = PLAYER_WIDTH / 2;
const GUN_SIZE = { x: 0.1, y: 0.1, z: 0.5 };
const GUN_OFFSET = { x: 0.25, y: -0.2, z: -0.3 };
const GUN_COLOR = 0x222222;

/** A remote player: capsule body tinted by player colour, with a gun box that follows the look direction. */
export class PlayerMesh {
  readonly root = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly muzzle = new THREE.Object3D();

  constructor(color: string) {
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(RADIUS, PLAYER_HEIGHT - 2 * RADIUS, 4, 12),
      new THREE.MeshLambertMaterial({ color }),
    );
    body.position.y = PLAYER_HEIGHT / 2;
    this.root.add(body);

    this.head.position.y = PLAYER_EYE_HEIGHT;
    this.head.rotation.order = "YXZ";
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(GUN_SIZE.x, GUN_SIZE.y, GUN_SIZE.z),
      new THREE.MeshLambertMaterial({ color: GUN_COLOR }),
    );
    gun.position.set(GUN_OFFSET.x, GUN_OFFSET.y, GUN_OFFSET.z);
    this.muzzle.position.z = -GUN_SIZE.z / 2;
    gun.add(this.muzzle);
    this.head.add(gun);
    this.root.add(this.head);
  }

  update(pos: Vec3, yaw: number, pitch: number, visible: boolean): void {
    this.root.position.set(pos.x, pos.y, pos.z);
    this.root.rotation.y = yaw;
    this.head.rotation.x = pitch;
    this.root.visible = visible;
  }

  get visible(): boolean {
    return this.root.visible;
  }

  muzzlePosition(): Vec3 {
    const p = this.muzzle.getWorldPosition(new THREE.Vector3());
    return { x: p.x, y: p.y, z: p.z };
  }

  dispose(): void {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.root.removeFromParent();
  }
}
