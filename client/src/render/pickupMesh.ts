import * as THREE from "three";
import { getWeapon } from "@wire-lock/shared";
import type { Vec3 } from "@wire-lock/shared";
import { buildWeaponModel } from "./weaponModels";

const CROSS_COLOR = 0x3ddc84;
const BAR_LONG = 0.5;
const BAR_SHORT = 0.16;
const FLOAT_HEIGHT = 0.7;
const BOB_HEIGHT = 0.12;
const BOB_SPEED = 2.2;
const SPIN_SPEED = 1.4;
/** Weapon pickups are shown larger than in the hand so they're easy to spot. */
const WEAPON_SCALE = 1.8;
const RING_RADIUS = 0.55;
const RING_OPACITY = 0.45;
const RING_LIFT = 0.03;
const RING_COLOR = 0xffc94d;

/**
 * A map pickup, hidden while it's respawning: a floating, spinning green cross
 * for health, or the weapon itself over a glowing ring for weapon pickups.
 */
export class PickupMesh {
  readonly root = new THREE.Group();
  private readonly spinner = new THREE.Group();
  private static crossMaterial = new THREE.MeshBasicMaterial({ color: CROSS_COLOR });
  private static vertical = new THREE.BoxGeometry(BAR_SHORT, BAR_LONG, BAR_SHORT);
  private static horizontal = new THREE.BoxGeometry(BAR_LONG, BAR_SHORT, BAR_SHORT);

  constructor(scene: THREE.Scene, pos: Vec3, kind: string, weaponId: string) {
    if (kind === "weapon") {
      const w = getWeapon(weaponId);
      const model = buildWeaponModel(w?.view.model, w?.view.color);
      model.root.scale.setScalar(WEAPON_SCALE);
      model.root.rotation.y = Math.PI / 2; // side-on, so the silhouette shows
      this.spinner.add(model.root);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(RING_RADIUS * 0.75, RING_RADIUS, 24),
        new THREE.MeshBasicMaterial({ color: RING_COLOR, transparent: true, opacity: RING_OPACITY, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = RING_LIFT;
      this.root.add(ring);
    } else {
      this.spinner.add(new THREE.Mesh(PickupMesh.vertical, PickupMesh.crossMaterial), new THREE.Mesh(PickupMesh.horizontal, PickupMesh.crossMaterial));
    }
    this.root.add(this.spinner);
    this.root.position.set(pos.x, pos.y, pos.z);
    scene.add(this.root);
  }

  update(active: boolean, timeSec: number): void {
    this.root.visible = active;
    if (!active) return;
    this.spinner.rotation.y = timeSec * SPIN_SPEED;
    this.spinner.position.y = FLOAT_HEIGHT + Math.sin(timeSec * BOB_SPEED) * BOB_HEIGHT;
  }

  dispose(): void {
    this.root.removeFromParent();
  }
}
