import * as THREE from "three";

/**
 * Low-poly weapon models, shared by the first-person view, other players and
 * weapon pickups. Each is built from a handful of flat-shaded primitives so the
 * silhouettes read at a glance. Frame: forward is -Z, origin is the grip hand,
 * units are metres. Every call builds fresh geometry and materials, because
 * callers change materials (Radar x-ray) and dispose them.
 */
export interface WeaponModel {
  root: THREE.Group;
  /** Where shots and tracers come out. */
  muzzle: THREE.Object3D;
}

const METAL = "#2b2f36";
const STEEL = "#9aa3ad";
const RUBBER = "#b03a2e";
const HAZARD = "#d8a400";
const RADIAL_SEGMENTS = 8;

type Parts = { mat: (color: string) => THREE.MeshLambertMaterial; root: THREE.Group };

function parts(): Parts {
  const cache = new Map<string, THREE.MeshLambertMaterial>();
  return {
    root: new THREE.Group(),
    mat: (color) => {
      let m = cache.get(color);
      if (!m) {
        m = new THREE.MeshLambertMaterial({ color, flatShading: true });
        cache.set(color, m);
      }
      return m;
    },
  };
}

/** A box of size (w, h, d) centred at (x, y, z). */
function box(p: Parts, color: string, w: number, h: number, d: number, x: number, y: number, z: number, tiltX = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), p.mat(color));
  m.position.set(x, y, z);
  m.rotation.x = tiltX;
  p.root.add(m);
  return m;
}

/** A cylinder along Z, of length `len`, centred at (x, y, z). */
function tube(p: Parts, color: string, r: number, len: number, x: number, y: number, z: number, rEnd = r, segments = RADIAL_SEGMENTS): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rEnd, r, len, segments), p.mat(color));
  m.rotation.x = -Math.PI / 2; // cylinder's +Y (top, rEnd) points to -Z (forward)
  m.position.set(x, y, z);
  p.root.add(m);
  return m;
}

function muzzleAt(p: Parts, x: number, y: number, z: number): THREE.Object3D {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  p.root.add(o);
  return o;
}

/** Slide, frame, raked grip, trigger guard and sights. Tinted slide (gold for the Chamber Pistol). */
function pistol(color: string): WeaponModel {
  const p = parts();
  box(p, color, 0.05, 0.05, 0.24, 0, 0.055, -0.07); // slide
  box(p, METAL, 0.044, 0.035, 0.2, 0, 0.015, -0.06); // frame
  box(p, METAL, 0.044, 0.13, 0.065, 0, -0.045, 0.02, -0.28); // grip, raked back
  box(p, METAL, 0.012, 0.012, 0.06, 0, -0.025, -0.06); // trigger guard bottom
  box(p, METAL, 0.012, 0.03, 0.012, 0, -0.012, -0.09); // trigger guard front
  tube(p, METAL, 0.012, 0.03, 0, 0.055, -0.2); // barrel tip
  box(p, METAL, 0.01, 0.014, 0.012, 0, 0.087, -0.18); // front sight
  box(p, METAL, 0.036, 0.014, 0.012, 0, 0.087, 0.035); // rear sight
  return { root: p.root, muzzle: muzzleAt(p, 0, 0.055, -0.22) };
}

/** Double barrel over a wooden pump, receiver and a dropped stock. */
function shotgun(color: string): WeaponModel {
  const p = parts();
  tube(p, METAL, 0.02, 0.56, -0.021, 0.06, -0.33); // barrels
  tube(p, METAL, 0.02, 0.56, 0.021, 0.06, -0.33);
  box(p, color, 0.09, 0.05, 0.17, 0, 0.02, -0.3); // pump
  box(p, METAL, 0.08, 0.1, 0.2, 0, 0.04, -0.02); // receiver
  box(p, METAL, 0.012, 0.012, 0.07, 0, -0.03, 0); // trigger guard
  box(p, color, 0.065, 0.11, 0.24, 0, -0.01, 0.19, 0.22); // stock, dropping toward the shoulder
  box(p, METAL, 0.012, 0.016, 0.012, 0, 0.088, -0.6); // bead sight
  return { root: p.root, muzzle: muzzleAt(p, 0, 0.06, -0.62) };
}

/** Big tube on the shoulder: flared muzzle, exhaust bell, hazard band, sight and two grips. */
function rocket(color: string): WeaponModel {
  const p = parts();
  tube(p, color, 0.07, 0.68, 0, 0.11, -0.12); // main tube
  tube(p, METAL, 0.075, 0.09, 0, 0.11, -0.49, 0.095); // flared muzzle
  tube(p, METAL, 0.072, 0.08, 0, 0.11, 0.26, 0.06); // exhaust bell (wider at the back)
  tube(p, HAZARD, 0.073, 0.045, 0, 0.11, -0.36); // hazard band
  box(p, METAL, 0.03, 0.045, 0.12, 0.045, 0.185, -0.12); // sight, sitting on the tube
  box(p, METAL, 0.04, 0.12, 0.05, 0, 0.0, 0.0, -0.2); // trigger grip
  box(p, METAL, 0.04, 0.1, 0.045, 0, 0.01, -0.28, -0.2); // front grip
  return { root: p.root, muzzle: muzzleAt(p, 0, 0.11, -0.55) };
}

/** Rubber-gripped handle with an open jaw at the end. Held pointing forward and up. */
function wrench(color: string): WeaponModel {
  const p = parts();
  box(p, RUBBER, 0.055, 0.045, 0.15, 0, 0, 0.02); // grip sleeve
  box(p, color, 0.042, 0.03, 0.32, 0, 0, -0.19); // shaft
  box(p, color, 0.12, 0.05, 0.05, 0, 0, -0.37); // jaw base
  box(p, color, 0.035, 0.05, 0.1, -0.043, 0, -0.44); // jaw prongs, the lower one longer
  box(p, color, 0.035, 0.05, 0.07, 0.043, 0, -0.425);
  tube(p, METAL, 0.018, 0.05, 0, 0.03, -0.31, 0.018, 6); // adjuster knurl
  p.root.rotation.x = 0.25; // head up
  return { root: p.root, muzzle: muzzleAt(p, 0, 0, -0.46) };
}

/** Fallback for anything without its own model. */
function generic(color: string): WeaponModel {
  const p = parts();
  box(p, color, 0.07, 0.09, 0.34, 0, 0, -0.1);
  return { root: p.root, muzzle: muzzleAt(p, 0, 0, -0.27) };
}

const BUILDERS: Record<string, (color: string) => WeaponModel> = { pistol, shotgun, rocket, wrench };

/** Builds the model named by a weapon's `view.model`, tinted with its `view.color`. */
export function buildWeaponModel(model: string | undefined, color: string | undefined): WeaponModel {
  const build = (model && BUILDERS[model]) || generic;
  return build(color ?? (model === "wrench" ? STEEL : METAL));
}

export function disposeWeaponModel(m: WeaponModel): void {
  m.root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
  m.root.removeFromParent();
}
