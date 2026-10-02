import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { fabricMaterial } from './garment/fabrics';

/* Escena fija: pared, raíl (de pared o burro de suelo), luces y cámara.
   Las perchas y las prendas se montan en RackHero. */

export type Mount = 'wall' | 'floor';

export interface StageOptions {
  mount: Mount;
  railHalf: number; // semilongitud del raíl (m)
  transparent?: boolean; // sin fondo: solo las sombras sobre la pared, encima del fondo de la página
}

const FOV = 26;
const FLOOR_Y = -1.12;  // suelo del burro (m bajo el raíl)
const WALL_Z = { wall: -0.44, floor: -1.1 };
// Encuadre vertical: centro y semialtura que deben verse siempre
const FRAME = { wall: { y: -0.4, half: 0.56 }, floor: { y: -0.62, half: 0.8 } }; // el burro deja aire abajo para flechas y nombre

const chrome = new THREE.MeshStandardMaterial({ color: '#d4d4d2', metalness: 1, roughness: 0.18 });
const blackSteel = new THREE.MeshStandardMaterial({ color: '#2a2a2a', metalness: 0.9, roughness: 0.35 });
const rubber = new THREE.MeshStandardMaterial({ color: '#1c1c1c', roughness: 0.8 });
const wood = new THREE.MeshPhysicalMaterial({ color: '#8a5a35', roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.3 });

function cylinder(r: number, len: number, mat: THREE.Material, axis: 'x' | 'y' | 'z') {
  const geo = new THREE.CylinderGeometry(r, r, len, 24);
  if (axis === 'x') geo.rotateZ(Math.PI / 2);
  if (axis === 'z') geo.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Plano de yeso con UV en metros (1 repetición por metro). */
function plasterPlane(w: number, h: number, color: string) {
  const mat = fabricMaterial({ kind: 'plaster', colors: [color] }).clone();
  mat.sheen = 0;
  const geo = new THREE.PlaneGeometry(w, h);
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h);
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  return m;
}

export function createStage(canvas: HTMLCanvasElement, { mount, railHalf, transparent = false }: StageOptions) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: transparent });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  if (!transparent) scene.background = new THREE.Color('#d6d0c4');
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 40);
  const wallZ = WALL_Z[mount];
  const frame = FRAME[mount];

  // Luz principal cálida desde arriba a la izquierda: proyecta las sombras en la pared y el suelo
  const key = new THREE.DirectionalLight('#fff0dc', 2.4);
  key.position.set(-2.2, 1.7, 1.9);
  key.target.position.set(0, -0.5, wallZ);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const reach = railHalf + 1;
  Object.assign(key.shadow.camera, { left: -reach, right: reach, top: 1.2, bottom: -1.6, near: 0.5, far: 8 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.012;
  key.shadow.radius = 4;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight('#dfe8ff', 0.25);
  fill.position.set(2, 0.5, 2);
  scene.add(fill);

  // Pared grande: cubre el fondo también en pantallas estrechas (cámara lejos)
  const wall = transparent
    ? new THREE.Mesh(new THREE.PlaneGeometry(40, 24), new THREE.ShadowMaterial({ opacity: 0.16 }))
    : plasterPlane(40, 24, '#d9d3c7');
  wall.receiveShadow = true;
  wall.position.set(0, -0.6, wallZ);
  scene.add(wall);

  // Raíl
  const rail = cylinder(0.012, railHalf * 2, chrome, 'x');
  scene.add(rail);
  for (const x of [-railHalf, railHalf]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.014, 24, 16), chrome);
    cap.position.x = x;
    scene.add(cap);
  }

  if (mount === 'wall') {
    // Dos brazos a la pared
    for (const x of [-railHalf + 0.04, railHalf - 0.04]) {
      const arm = cylinder(0.009, -wallZ, chrome, 'z');
      arm.position.set(x, 0, wallZ / 2);
      const plate = cylinder(0.03, 0.008, chrome, 'z');
      plate.position.set(x, 0, wallZ + 0.004);
      scene.add(arm, plate);
    }
  } else {
    // Burro: suelo, dos postes y base en T con ruedas
    const floor = plasterPlane(40, 20, '#bfb6a8');
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, FLOOR_Y, wallZ + 10);
    scene.add(floor);
    const wheelR = 0.03;
    const baseY = FLOOR_Y + wheelR * 2 + 0.012;
    for (const x of [-railHalf, railHalf]) {
      const post = cylinder(0.013, -baseY, blackSteel, 'y');
      post.position.set(x, baseY / 2, 0);
      const foot = cylinder(0.012, 0.5, blackSteel, 'z');
      foot.position.set(x, baseY, 0);
      scene.add(post, foot);
      for (const z of [-0.23, 0.23]) {
        const wheel = cylinder(wheelR, 0.02, rubber, 'x');
        wheel.position.set(x, FLOOR_Y + wheelR, z);
        const fork = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.02), blackSteel);
        fork.position.set(x, baseY - 0.02, z);
        fork.castShadow = true;
        scene.add(wheel, fork);
      }
    }
    // Travesaño inferior entre las dos bases
    const stretcher = cylinder(0.01, railHalf * 2, blackSteel, 'x');
    stretcher.position.set(0, baseY, 0);
    scene.add(stretcher);
    rail.material = blackSteel;
  }

  /** Encaja el perchero entero en el lienzo, sea cual sea la proporción. */
  function resize(width: number, height: number) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    const t = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const halfW = railHalf + 0.1;
    const dist = Math.max(frame.half / t, halfW / (t * camera.aspect));
    camera.position.set(0, frame.y + 0.12, dist);
    camera.lookAt(0, frame.y, 0);
    camera.updateProjectionMatrix();
  }

  return { renderer, scene, camera, resize };
}

/** Percha: gancho giratorio (sigue al raíl) y cuerpo de madera (gira con la prenda).
    `trouserBar` añade la barra inferior donde se doblan los pantalones. */
export function createHanger(trouserBar = false) {
  const r = 0.0145; // radio del gancho alrededor del raíl
  const hookCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.097, 0),
    new THREE.Vector3(0, -0.05, 0.003),
    new THREE.Vector3(0, -0.02, r),
    new THREE.Vector3(0, 0, r),
    new THREE.Vector3(0, r * 0.71, r * 0.71),
    new THREE.Vector3(0, r, 0),
    new THREE.Vector3(0, r * 0.71, -r * 0.71),
    new THREE.Vector3(0, 0, -r),
    new THREE.Vector3(0, -0.011, -r * 0.8),
    new THREE.Vector3(0, -0.015, -r * 0.35),
  ]);
  const hook = new THREE.Mesh(new THREE.TubeGeometry(hookCurve, 64, 0.0024, 10, false), chrome);
  hook.castShadow = true;

  const barCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.18, -0.14, 0),
    new THREE.Vector3(-0.09, -0.11, 0),
    new THREE.Vector3(0, -0.097, 0),
    new THREE.Vector3(0.09, -0.11, 0),
    new THREE.Vector3(0.18, -0.14, 0),
  ]);
  const body = new THREE.Mesh(new THREE.TubeGeometry(barCurve, 48, 0.0075, 12, false), wood);
  body.castShadow = true;
  const frame = new THREE.Group();
  frame.add(body);
  if (trouserBar) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.36, 16).rotateZ(Math.PI / 2), wood);
    bar.position.y = -0.15;
    bar.castShadow = true;
    frame.add(bar);
  }
  return { hook, frame };
}
