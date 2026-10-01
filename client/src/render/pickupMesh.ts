import * as THREE from "three";
import type { Vec3 } from "@wire-lock/shared";

const CROSS_COLOR = 0x3ddc84;
const BAR_LONG = 0.5;
const BAR_SHORT = 0.16;
const FLOAT_HEIGHT = 0.7;
const BOB_HEIGHT = 0.12;
const BOB_SPEED = 2.2;
const SPIN_SPEED = 1.4;

/** A health pack: a floating, spinning green cross, hidden while it's respawning. */
export class PickupMesh {
  readonly root = new THREE.Group();
  private static material = new THREE.MeshBasicMaterial({ color: CROSS_COLOR });
  private static vertical = new THREE.BoxGeometry(BAR_SHORT, BAR_LONG, BAR_SHORT);
  private static horizontal = new THREE.BoxGeometry(BAR_LONG, BAR_SHORT, BAR_SHORT);

  constructor(scene: THREE.Scene, private readonly pos: Vec3) {
    this.root.add(new THREE.Mesh(PickupMesh.vertical, PickupMesh.material), new THREE.Mesh(PickupMesh.horizontal, PickupMesh.material));
    this.root.position.set(pos.x, pos.y + FLOAT_HEIGHT, pos.z);
    scene.add(this.root);
  }

  update(active: boolean, timeSec: number): void {
    this.root.visible = active;
    if (!active) return;
    this.root.rotation.y = timeSec * SPIN_SPEED;
    this.root.position.y = this.pos.y + FLOAT_HEIGHT + Math.sin(timeSec * BOB_SPEED) * BOB_HEIGHT;
  }

  dispose(): void {
    this.root.removeFromParent();
  }
}
