import * as THREE from "three";
import { PLAYER_EYE_HEIGHT, PLAYER_HEIGHT, PLAYER_WIDTH, getWeapon } from "@wire-lock/shared";
import type { Vec3 } from "@wire-lock/shared";
import { buildWeaponModel, disposeWeaponModel, type WeaponModel } from "./weaponModels";

const RADIUS = PLAYER_WIDTH / 2;
const GUN_OFFSET = { x: 0.25, y: -0.25, z: -0.2 };
/** Weapons are drawn a bit bigger than true scale on other players so you can tell what they hold. */
const GUN_SCALE = 1.3;
const XRAY_OPACITY = 0.55;
const XRAY_RENDER_ORDER = 999;
const BURN_GLOW = 0xff5a00;

/** A remote player: capsule body tinted by player colour, holding their current weapon's model, aimed where they look. */
export class PlayerMesh {
  readonly root = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly gunHolder = new THREE.Group();
  private gun: WeaponModel | null = null;
  private weaponId: string | null = null;
  private readonly bodyMaterial: THREE.MeshLambertMaterial;
  private xray = false;
  private burning = false;

  constructor(color: string) {
    this.bodyMaterial = new THREE.MeshLambertMaterial({ color });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(RADIUS, PLAYER_HEIGHT - 2 * RADIUS, 4, 12), this.bodyMaterial);
    body.position.y = PLAYER_HEIGHT / 2;
    this.root.add(body);

    this.head.position.y = PLAYER_EYE_HEIGHT;
    this.head.rotation.order = "YXZ";
    this.gunHolder.position.set(GUN_OFFSET.x, GUN_OFFSET.y, GUN_OFFSET.z);
    this.gunHolder.scale.setScalar(GUN_SCALE);
    this.head.add(this.gunHolder);
    this.root.add(this.head);
    this.setWeapon("pistol");
  }

  /** Swaps the held model when their weapon changes. */
  setWeapon(id: string): void {
    if (id === this.weaponId) return;
    this.weaponId = id;
    if (this.gun) disposeWeaponModel(this.gun);
    const w = getWeapon(id);
    this.gun = buildWeaponModel(w?.view.model, w?.view.color);
    this.gunHolder.add(this.gun.root);
    if (this.xray) this.applyXRay(this.gun.root, true);
  }

  update(pos: Vec3, yaw: number, pitch: number, visible: boolean): void {
    this.root.position.set(pos.x, pos.y, pos.z);
    this.root.rotation.y = yaw;
    this.head.rotation.x = pitch;
    this.root.visible = visible;
  }

  /** Radar: draw through walls, slightly see-through so it reads as "sensed", not seen. */
  setXRay(on: boolean): void {
    if (on === this.xray) return;
    this.xray = on;
    this.applyXRay(this.root, on);
  }

  private applyXRay(root: THREE.Object3D, on: boolean): void {
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const m = o.material as THREE.Material;
      m.depthTest = !on;
      m.transparent = on;
      m.opacity = on ? XRAY_OPACITY : 1;
      o.renderOrder = on ? XRAY_RENDER_ORDER : 0;
    });
  }

  /** Afterburn: glow orange while burning. */
  setBurning(on: boolean): void {
    if (on === this.burning) return;
    this.burning = on;
    this.bodyMaterial.emissive.set(on ? BURN_GLOW : 0x000000);
  }

  get visible(): boolean {
    return this.root.visible;
  }

  muzzlePosition(): Vec3 {
    const p = (this.gun?.muzzle ?? this.gunHolder).getWorldPosition(new THREE.Vector3());
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
