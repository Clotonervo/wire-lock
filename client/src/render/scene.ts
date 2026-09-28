import * as THREE from "three";

const FOV = 75;
const SKY = 0x8fb8d8;

export interface SceneContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
}

/** One renderer, one camera, hemisphere + directional light, no shadows (DESIGN.md §9.1). */
export function createScene(container: HTMLElement): SceneContext {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 40, 90);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 200);
  camera.rotation.order = "YXZ";

  scene.add(new THREE.HemisphereLight(0xdfefff, 0x404040, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(12, 30, 8);
  scene.add(sun);

  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener("resize", resize);

  return { renderer, scene, camera };
}
