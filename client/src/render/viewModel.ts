import * as THREE from "three";
import type { Vec3 } from "@wire-lock/shared";

const GUN_SIZE = { x: 0.07, y: 0.09, z: 0.34 };
const GUN_OFFSET = { x: 0.22, y: -0.2, z: -0.42 };
const DEFAULT_COLOR = "#2a2a2a";
/** How far the gun kicks back when fired, and how fast it recovers. */
const RECOIL_KICK = 0.06;
const RECOIL_RECOVERY_MS = 60;

/** The local player's first-person gun, attached to the camera. */
export class ViewModel {
  private readonly gun: THREE.Mesh;
  private readonly muzzle = new THREE.Object3D();
  private readonly material: THREE.MeshLambertMaterial;
  private recoil = 0;

  constructor(camera: THREE.Camera) {
    this.material = new THREE.MeshLambertMaterial({ color: DEFAULT_COLOR });
    this.gun = new THREE.Mesh(new THREE.BoxGeometry(GUN_SIZE.x, GUN_SIZE.y, GUN_SIZE.z), this.material);
    this.gun.position.set(GUN_OFFSET.x, GUN_OFFSET.y, GUN_OFFSET.z);
    this.muzzle.position.z = -GUN_SIZE.z / 2;
    this.gun.add(this.muzzle);
    camera.add(this.gun);
  }

  setWeapon(color: string | undefined): void {
    this.material.color.set(color ?? DEFAULT_COLOR);
  }

  set visible(v: boolean) {
    this.gun.visible = v;
  }

  kick(): void {
    this.recoil = RECOIL_KICK;
  }

  update(frameMs: number): void {
    this.recoil *= Math.exp(-frameMs / RECOIL_RECOVERY_MS);
    this.gun.position.z = GUN_OFFSET.z + this.recoil;
  }

  muzzlePosition(): Vec3 {
    const p = this.muzzle.getWorldPosition(new THREE.Vector3());
    return { x: p.x, y: p.y, z: p.z };
  }
}
