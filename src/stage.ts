import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { fabricMaterial } from './garment/fabrics';

/* Escena fija: pared, raíl, luces y cámara. La percha y las prendas se montan en main. */

export const WALL_Z = -0.44;
export const RAIL_HALF = 1.12; // cabe la fila con una prenda de frente en cualquier extremo
const FOV = 26;
const TARGET = new THREE.Vector3(0, -0.4, 0);

const chrome = new THREE.MeshStandardMaterial({ color: '#d4d4d2', metalness: 1, roughness: 0.18 });
const wood = new THREE.MeshPhysicalMaterial({ color: '#8a5a35', roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.3 });

export function createStage(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#d6d0c4');
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 20);

  // Luz principal cálida desde arriba a la izquierda: proyecta las sombras en la pared
  const key = new THREE.DirectionalLight('#fff0dc', 2.4);
  key.position.set(-2.2, 1.7, 1.9);
  key.target.position.set(0, -0.45, WALL_Z);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -2.2, right: 2.2, top: 1.0, bottom: -1.3, near: 0.5, far: 7 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.012;
  key.shadow.radius = 4;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight('#dfe8ff', 0.25);
  fill.position.set(2, 0.5, 2);
  scene.add(fill);

  // Pared de yeso
  const wallMat = fabricMaterial({ kind: 'plaster', colors: ['#d9d3c7'] }).clone();
  wallMat.sheen = 0;
  // Grande para cubrir el fondo también en pantallas estrechas (cámara lejos)
  const WALL_W = 40, WALL_H = 24;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(WALL_W, WALL_H), wallMat);
  wall.position.set(0, -0.6, WALL_Z);
  wall.receiveShadow = true;
  // UV de plano en 0..1: escalar para que el yeso tenga ~1 m por repetición
  const uv = wall.geometry.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * WALL_W, uv.getY(i) * WALL_H);
  scene.add(wall);

  // Raíl cromado con dos brazos a la pared
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, RAIL_HALF * 2, 32).rotateZ(Math.PI / 2), chrome);
  rail.castShadow = true;
  scene.add(rail);
  for (const x of [-RAIL_HALF + 0.04, RAIL_HALF - 0.04]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, -WALL_Z, 20).rotateX(Math.PI / 2), chrome);
    arm.position.set(x, 0, WALL_Z / 2);
    arm.castShadow = true;
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 32).rotateX(Math.PI / 2), chrome);
    plate.position.set(x, 0, WALL_Z + 0.004);
    scene.add(arm, plate);
  }
  for (const x of [-RAIL_HALF, RAIL_HALF]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.014, 24, 16), chrome);
    cap.position.x = x;
    scene.add(cap);
  }

  /** Encaja el perchero entero (raíl y soportes) en el lienzo, sea cual sea la proporción. */
  function resize(width: number, height: number) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    const t = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const halfW = RAIL_HALF + 0.1;
    const halfH = 0.56;
    const dist = Math.max(halfH / t, halfW / (t * camera.aspect));
    camera.position.set(0, TARGET.y + 0.12, dist);
    camera.lookAt(TARGET);
    camera.updateProjectionMatrix();
  }

  return { renderer, scene, camera, resize };
}

/** Percha: gancho giratorio (sigue al raíl) y cuerpo de madera (gira con la prenda). */
export function createHanger() {
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
  const frame = new THREE.Mesh(new THREE.TubeGeometry(barCurve, 48, 0.0075, 12, false), wood);
  frame.castShadow = true;
  return { hook, frame };
}
