import * as THREE from "three";
import type { Vec3, WeaponDef } from "@wire-lock/shared";
import { buildWeaponModel, disposeWeaponModel, type WeaponModel } from "./weaponModels";

/** Where each model sits in front of the camera (right hand, below the crosshair). */
const POSES: Record<string, { x: number; y: number; z: number }> = {
  pistol: { x: 0.2, y: -0.19, z: -0.36 },
  shotgun: { x: 0.19, y: -0.21, z: -0.3 },
  rocket: { x: 0.25, y: -0.27, z: -0.36 },
  wrench: { x: 0.24, y: -0.22, z: -0.4 },
};
const DEFAULT_POSE = { x: 0.22, y: -0.2, z: -0.42 };
/** How far the gun kicks back when fired, and how fast it recovers. */
const RECOIL_KICK = 0.06;
const RECOIL_RECOVERY_MS = 60;

/** The local player's first-person weapon, attached to the camera. */
export class ViewModel {
  private readonly holder = new THREE.Group();
  private model: WeaponModel | null = null;
  private modelKey = "";
  private pose = DEFAULT_POSE;
  private recoil = 0;

  constructor(camera: THREE.Camera) {
    camera.add(this.holder);
  }

  /** Shows `weapon`'s model (rebuilt only when it changes). */
  setWeapon(weapon: WeaponDef | undefined): void {
    const key = weapon ? `${weapon.view.model}:${weapon.view.color ?? ""}` : "";
    if (key === this.modelKey) return;
    this.modelKey = key;
    if (this.model) disposeWeaponModel(this.model);
    this.model = buildWeaponModel(weapon?.view.model, weapon?.view.color);
    this.holder.add(this.model.root);
    this.pose = POSES[weapon?.view.model ?? ""] ?? DEFAULT_POSE;
    this.holder.position.set(this.pose.x, this.pose.y, this.pose.z);
  }

  set visible(v: boolean) {
    this.holder.visible = v;
  }

  kick(): void {
    this.recoil = RECOIL_KICK;
  }

  update(frameMs: number): void {
    this.recoil *= Math.exp(-frameMs / RECOIL_RECOVERY_MS);
    this.holder.position.z = this.pose.z + this.recoil;
  }

  muzzlePosition(): Vec3 {
    const p = (this.model?.muzzle ?? this.holder).getWorldPosition(new THREE.Vector3());
    return { x: p.x, y: p.y, z: p.z };
  }
}
