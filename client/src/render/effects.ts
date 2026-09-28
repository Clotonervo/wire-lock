import * as THREE from "three";
import type { Vec3 } from "@wire-lock/shared";

const TRACER_MS = 80;
const FLASH_MS = 50;
const IMPACT_MS = 250;
const FLASH_SIZE = 0.12;
const IMPACT_SIZE = 0.08;
const IMPACT_GROWTH = 2.5;
const TRACER_COLOR = 0xfff2a8;
const FLASH_COLOR = 0xffd24a;
const IMPACT_COLOR = 0xcfcfcf;
const EXPLOSION_MS = 350;
const EXPLOSION_COLOR = 0xff8a2a;
/** Explosion sphere starts at this fraction of the splash radius and grows to the full radius. */
const EXPLOSION_START = 0.25;

interface Effect {
  object: THREE.Mesh | THREE.Line;
  material: THREE.Material;
  born: number;
  lifeMs: number;
  /** Scale multiplier reached at the end of the effect's life. */
  grow: number;
}

/** Short-lived cosmetic effects (DESIGN.md §9.1): tracers, muzzle flashes, impact puffs. */
export class Effects {
  private active: Effect[] = [];
  private readonly sphere = new THREE.SphereGeometry(1, 8, 6);

  constructor(private readonly scene: THREE.Scene) {}

  tracer(from: Vec3, to: Vec3, now: number): void {
    const geo = new THREE.BufferGeometry().setFromPoints([toV(from), toV(to)]);
    const mat = new THREE.LineBasicMaterial({ color: TRACER_COLOR, transparent: true });
    this.add(new THREE.Line(geo, mat), mat, now, TRACER_MS, 1);
  }

  muzzleFlash(at: Vec3, now: number): void {
    this.puff(at, FLASH_SIZE, FLASH_COLOR, now, FLASH_MS, 1);
  }

  impact(at: Vec3, now: number): void {
    this.puff(at, IMPACT_SIZE, IMPACT_COLOR, now, IMPACT_MS, IMPACT_GROWTH);
  }

  explosion(at: Vec3, radius: number, now: number): void {
    this.puff(at, radius * EXPLOSION_START, EXPLOSION_COLOR, now, EXPLOSION_MS, 1 / EXPLOSION_START);
  }

  update(now: number): void {
    this.active = this.active.filter((e) => {
      const f = (now - e.born) / e.lifeMs;
      if (f >= 1) {
        e.object.removeFromParent();
        if (e.object instanceof THREE.Line) e.object.geometry.dispose();
        e.material.dispose();
        return false;
      }
      e.material.opacity = 1 - f;
      if (e.grow !== 1) e.object.scale.setScalar(e.object.userData.size * (1 + (e.grow - 1) * f));
      return true;
    });
  }

  private puff(at: Vec3, size: number, color: number, now: number, lifeMs: number, grow: number): void {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(this.sphere, mat);
    mesh.position.copy(toV(at));
    mesh.scale.setScalar(size);
    mesh.userData.size = size;
    this.add(mesh, mat, now, lifeMs, grow);
  }

  private add(object: THREE.Mesh | THREE.Line, material: THREE.Material, now: number, lifeMs: number, grow: number) {
    this.scene.add(object);
    this.active.push({ object, material, born: now, lifeMs, grow });
  }
}

function toV(v: Vec3): THREE.Vector3 {
  return new THREE.Vector3(v.x, v.y, v.z);
}
