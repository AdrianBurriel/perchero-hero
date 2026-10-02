import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* Vuelo 3D a la cesta: una capa WebGL transparente a pantalla completa (por encima de todo)
   donde una copia de la prenda viaja en arco hasta el icono, girando y encogiéndose.
   Cámara ortográfica en píxeles de pantalla: 1 unidad = 1 px CSS. */

export interface FlyFrom {
  x: number;      // centro de la prenda en pantalla (px)
  y: number;
  scale: number;  // px por metro con los que se ve la prenda en el perchero
  rotY: number;   // giro actual de la prenda (rad)
}

const DURATION = 1000; // ms
const LIFT = 160;      // px que sube el arco por encima de la recta
const END_SCALE = 0.07;
const TOP_MARGIN = 90; // px: el punto más alto del arco no sube más que esto

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene;
let camera: THREE.OrthographicCamera;
let flights = 0;

function ensure() {
  if (renderer) return renderer;
  const canvas = document.createElement('canvas');
  canvas.className = 'flyer';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;

  scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  // Misma dirección de luz que el perchero para que la copia no cambie de aspecto al despegar
  const key = new THREE.DirectionalLight('#fff0dc', 2.4);
  key.position.set(-2.2, 1.7, 1.9);
  const fill = new THREE.DirectionalLight('#dfe8ff', 0.25);
  fill.position.set(2, 0.5, 2);
  scene.add(key, fill);

  camera = new THREE.OrthographicCamera(0, 1, 0, -1, -4000, 4000);
  const resize = () => {
    renderer!.setSize(innerWidth, innerHeight, false);
    Object.assign(camera, { left: 0, right: innerWidth, top: 0, bottom: -innerHeight });
    camera.updateProjectionMatrix();
  };
  resize();
  addEventListener('resize', resize);
  return renderer;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Lanza `object` (copia de la prenda, en metros) desde `from` hasta el punto `to` de pantalla. */
export function fly(object: THREE.Object3D, from: FlyFrom, to: { x: number; y: number }): Promise<void> {
  const r = ensure();
  // Centrar la copia en su caja para que gire sobre sí misma
  const box = new THREE.Box3().setFromObject(object);
  object.position.sub(box.getCenter(new THREE.Vector3()));
  const holder = new THREE.Group();
  const spin = new THREE.Group();
  spin.add(object);
  holder.add(spin);
  scene.add(holder);
  flights++;

  // Control del arco: a medio camino y por encima de los dos extremos, sin salirse por arriba
  const cx = (from.x + to.x) / 2;
  const cy = Math.max(TOP_MARGIN, Math.min(from.y, to.y) - LIFT);
  const start = performance.now();

  return new Promise((resolve) => {
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      const e = easeInOut(t);
      const u = 1 - e;
      const x = u * u * from.x + 2 * u * e * cx + e * e * to.x;
      const y = u * u * from.y + 2 * u * e * cy + e * e * to.y;
      // Despega con un leve "pop" y se encoge al acercarse a la cesta
      const pop = 1 + 0.08 * Math.sin(Math.min(1, t / 0.25) * Math.PI);
      const s = from.scale * pop * (1 - (1 - END_SCALE) * Math.pow(e, 1.6));
      holder.position.set(x, -y, 0);
      holder.scale.setScalar(s);
      spin.rotation.set(-0.25 * Math.sin(Math.PI * t), from.rotY + e * Math.PI * 2, 0.3 * Math.sin(Math.PI * t));
      r.render(scene, camera);
      if (t < 1) return requestAnimationFrame(tick);
      scene.remove(holder);
      flights--;
      // Limpia el último fotograma cuando ya no queda ninguna en vuelo
      if (flights === 0) r.render(scene, camera);
      resolve();
    };
    requestAnimationFrame(tick);
  });
}
