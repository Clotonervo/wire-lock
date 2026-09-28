import * as THREE from "three";
import type { Vec3 } from "@wire-lock/shared";

const BODY_SIZE = { x: 0.12, y: 0.12, z: 0.45 };
const BODY_COLOR = 0x3a3a3a;
const GLOW_RADIUS = 0.13;
const GLOW_COLOR = 0xffb347;

/** A rocket: a dark body pointing along its velocity with a glowing exhaust. */
export class ProjectileMesh {
  readonly root = new THREE.Group();
  private static bodyGeo = new THREE.BoxGeometry(BODY_SIZE.x, BODY_SIZE.y, BODY_SIZE.z);
  private static glowGeo = new THREE.SphereGeometry(GLOW_RADIUS, 8, 6);
  private static bodyMat = new THREE.MeshLambertMaterial({ color: BODY_COLOR });
  private static glowMat = new THREE.MeshBasicMaterial({ color: GLOW_COLOR });
  private readonly target = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    const body = new THREE.Mesh(ProjectileMesh.bodyGeo, ProjectileMesh.bodyMat);
    const glow = new THREE.Mesh(ProjectileMesh.glowGeo, ProjectileMesh.glowMat);
    glow.position.z = BODY_SIZE.z / 2; // +Z is the tail (see update)
    this.root.add(body, glow);
    scene.add(this.root);
  }

  update(pos: Vec3, vel: Vec3): void {
    this.root.position.set(pos.x, pos.y, pos.z);
    // Object3D.lookAt points +Z at the target for non-cameras, so aim +Z backwards to leave the glow trailing.
    this.target.set(pos.x - vel.x, pos.y - vel.y, pos.z - vel.z);
    this.root.lookAt(this.target);
  }

  dispose(): void {
    this.root.removeFromParent();
  }
}
