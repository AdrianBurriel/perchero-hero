import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* Empaquetado y vuelo a la cesta. La prenda real sale del perchero a una capa WebGL
   transparente a pantalla completa (cámara ortográfica en px CSS), se pliega (mangas
   hacia atrás y mitad inferior hacia arriba, deformando la malla en el shader), se
   envuelve en una caja de papel kraft con faja y vuela en arco hasta el icono. */

export interface Launch {
  x: number;     // origen de la prenda (punto del raíl) en pantalla, px
  y: number;
  scale: number; // px por metro con los que se ve en el perchero
  rotY: number;  // giro actual de la prenda (rad)
}

// Guion (ms desde el clic)
const T = {
  lift: [0, 380],      // se separa de la percha y se pone de frente
  sleeves: [260, 720], // mangas hacia atrás
  fold: [620, 1120],   // mitad inferior hacia arriba, por detrás
  tray: [1020, 1320],  // aparece la caja
  lid: [1180, 1580],   // se cierra la tapa
  band: [1520, 1740],  // faja
  fly: [1760, 2680],   // vuelo a la cesta
} as const;
const LIFT_PX = 14;
const ARC = 150;        // px que sube el arco
const TOP_MARGIN = 90;  // px: el arco no sube por encima de esto
const END_SCALE = 0.1;

const KRAFT = '#c4a174';

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene;
let camera: THREE.OrthographicCamera;

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
  // Misma luz que el perchero: la prenda no cambia de aspecto al pasar a esta capa
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

/* ---------- Bucle compartido: anima mientras quede algún paquete ---------- */
const tasks = new Set<(now: number) => boolean>();
function run(task: (now: number) => boolean) {
  tasks.add(task);
  if (tasks.size === 1) requestAnimationFrame(loop);
}
function loop(now: number) {
  for (const t of [...tasks]) if (!t(now)) tasks.delete(t);
  renderer!.render(scene, camera);
  if (tasks.size) requestAnimationFrame(loop);
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const phase = (ms: number, [a, b]: readonly [number, number]) => clamp01((ms - a) / (b - a));

/* ---------- Plegado en el shader ---------- */
interface FoldUniforms {
  uFold: { value: number };    // 0 = colgada, 1 = doblada
  uFoldY: { value: number };   // altura de la línea de doblez (m)
  uFoldDir: { value: number }; // 1 = hacia atrás; -1 en las mangas (ya están giradas 180°)
  uThick: { value: number };   // semiespesor: separa la mitad doblada para que no se cruce
}

/** Copia del material que dobla hacia atrás todo lo que queda por debajo de uFoldY. */
function foldable(mat: THREE.Material, u: FoldUniforms) {
  const m = mat.clone();
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uFold; uniform float uFoldY; uniform float uFoldDir; uniform float uThick;
        mat2 foldRot() { float a = uFold * PI * uFoldDir; return mat2(cos(a), sin(a), -sin(a), cos(a)); }`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        if (position.y < uFoldY) objectNormal.yz = foldRot() * objectNormal.yz;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        if (position.y < uFoldY) {
          vec2 rel = foldRot() * vec2(position.y - uFoldY, position.z);
          transformed.y = uFoldY + rel.x;
          transformed.z = rel.y - uThick * (1.0 - cos(uFold * PI)) * uFoldDir;
        }`);
  };
  m.customProgramCacheKey = () => 'fold';
  return m;
}

/* ---------- Caja de papel kraft con faja ---------- */
function bandTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 160;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1c1b19';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#f4f1ea';
  g.font = '64px "Instrument Serif", Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('E S T U D I O', c.width / 2, c.height / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildBox(w: number, h: number, d: number) {
  const kraft = new THREE.MeshStandardMaterial({ color: KRAFT, roughness: 0.88, transparent: true, opacity: 0 });
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  // Bandeja abierta por delante (cara +z invisible)
  const tray = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [kraft, kraft, kraft, kraft, hidden, kraft]);
  tray.position.z = -d / 2;
  // Tapa con bisagra en el borde inferior delantero
  const lid = new THREE.Group();
  lid.position.y = -h / 2;
  const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.004), kraft);
  lidMesh.position.set(0, h / 2, 0.002);
  lid.add(lidMesh);
  lid.rotation.x = Math.PI / 2;
  lid.visible = false;
  // Faja negra con el nombre
  const bandMat = new THREE.MeshStandardMaterial({ color: '#ffffff', map: bandTexture(), roughness: 0.6 });
  const band = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, h * 0.17, d + 0.012), bandMat);
  band.position.z = -d / 2 + 0.004;
  band.scale.x = 0.001;
  const box = new THREE.Group();
  box.add(tray, lid, band);
  const dispose = () => {
    for (const m of [tray, lidMesh, band]) m.geometry.dispose();
    kraft.dispose();
    bandMat.map?.dispose();
    bandMat.dispose();
  };
  return { box, kraft, lid, band, dispose };
}

/**
 * Pliega `body` (la prenda, ya separada de su percha), la empaqueta y la lleva hasta `to`.
 * Al terminar la prenda queda como estaba (sin pliegues ni padre) para poder volver a colgarla.
 */
export function packAndFly(body: THREE.Group, from: Launch, to: { x: number; y: number }): Promise<void> {
  ensure();
  body.position.set(0, 0, 0);
  body.rotation.set(0, 0, 0);
  body.scale.set(1, 1, 1);
  body.updateMatrixWorld(true);

  // Medidas en el espacio de la prenda (solo el cuerpo; las mangas se recogen dentro)
  const meshes: THREE.Mesh[] = [];
  body.traverse((o) => o instanceof THREE.Mesh && meshes.push(o));
  const bodyBox = new THREE.Box3();
  for (const m of meshes) if (m.userData.part === 'body') bodyBox.expandByObject(m);
  const top = bodyBox.max.y;
  const foldY = (top + bodyBox.min.y) / 2;
  const thick = (bodyBox.max.z - bodyBox.min.z) / 2;

  // Materiales plegables (copias); se restauran al final
  const uBody: FoldUniforms = { uFold: { value: 0 }, uFoldY: { value: foldY }, uFoldDir: { value: 1 }, uThick: { value: thick } };
  const uSleeve: FoldUniforms = { ...uBody, uFold: { value: 0 }, uFoldDir: { value: -1 } };
  const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  for (const m of meshes) {
    originals.set(m, m.material);
    m.material = foldable(m.material as THREE.Material, m.userData.part === 'body' ? uBody : uSleeve);
  }

  // Cada manga gira alrededor de su costura del hombro (borde interior)
  const hinges: { group: THREE.Group; sign: number; members: THREE.Mesh[]; px: number }[] = [];
  for (const [part, sign] of [['sleeveR', 1], ['sleeveL', -1]] as const) {
    const members = meshes.filter((m) => m.userData.part === part);
    if (!members.length) continue;
    const b = new THREE.Box3();
    for (const m of members) b.expandByObject(m);
    const px = sign === 1 ? b.min.x : b.max.x;
    const group = new THREE.Group();
    group.position.x = px;
    body.add(group);
    for (const m of members) {
      m.position.x -= px;
      group.add(m);
    }
    hinges.push({ group, sign, members, px });
  }

  // Caja a medida de la prenda doblada
  const w = (bodyBox.max.x - bodyBox.min.x) * 1.06;
  const h = (top - foldY) * 1.1;
  const d = thick * 4 + 0.03;
  const cy = (top + foldY) / 2;
  const pkg = buildBox(w, h, d);
  pkg.box.position.set(0, cy, thick + 0.006);

  // Jerarquía: holder (px en pantalla) → center (centro del paquete) → spin → pack
  const holder = new THREE.Group();
  const center = new THREE.Group();
  const spin = new THREE.Group();
  const pack = new THREE.Group();
  center.position.y = cy;
  pack.position.y = -cy;
  pack.add(body, pkg.box);
  spin.add(pack);
  center.add(spin);
  holder.add(center);
  scene.add(holder);

  const start = performance.now();
  const fromCenter = { x: from.x, y: from.y - cy * from.scale }; // centro del paquete en pantalla
  const ctrl = { x: (fromCenter.x + to.x) / 2, y: Math.max(TOP_MARGIN, Math.min(fromCenter.y, to.y) - ARC) };

  return new Promise((resolve) => {
    run((now) => {
      const ms = now - start;

      const lift = easeOut(phase(ms, T.lift));
      spin.rotation.y = from.rotY * (1 - lift);
      let s = from.scale * (1 + 0.04 * lift);
      let cx = fromCenter.x;
      let cyPx = fromCenter.y - LIFT_PX * lift;

      const sl = easeInOut(phase(ms, T.sleeves));
      for (const hg of hinges) {
        hg.group.rotation.y = hg.sign * (Math.PI - 0.06) * sl;
        hg.group.position.z = -thick * 1.6 * sl; // se recogen por detrás del cuerpo
      }
      uBody.uFold.value = uSleeve.uFold.value = easeInOut(phase(ms, T.fold));

      const tray = easeOut(phase(ms, T.tray));
      pkg.kraft.opacity = tray;
      pkg.box.scale.setScalar(0.92 + 0.08 * tray);
      const lid = easeInOut(phase(ms, T.lid));
      pkg.lid.visible = lid > 0;
      pkg.lid.rotation.x = (Math.PI / 2) * (1 - lid);
      pkg.band.scale.x = Math.max(0.001, easeOut(phase(ms, T.band)));

      const f = phase(ms, T.fly);
      if (f > 0) {
        const e = easeInOut(f);
        const u = 1 - e;
        const sx = fromCenter.x, sy = fromCenter.y - LIFT_PX;
        cx = u * u * sx + 2 * u * e * ctrl.x + e * e * to.x;
        cyPx = u * u * sy + 2 * u * e * ctrl.y + e * e * to.y;
        s *= 1 - (1 - END_SCALE) * Math.pow(e, 1.5);
        spin.rotation.set(-0.2 * Math.sin(Math.PI * f), e * Math.PI * 2, 0.25 * Math.sin(Math.PI * f));
      }

      // holder en el raíl: el centro del paquete queda en (cx, cyPx)
      holder.position.set(cx, -(cyPx + cy * s), 0);
      holder.scale.setScalar(s);

      if (f < 1) return true;
      // Fin: se desmonta todo y la prenda vuelve a su estado original (sin padre)
      scene.remove(holder);
      pack.remove(body);
      for (const hg of hinges) {
        for (const m of hg.members) {
          m.position.x += hg.px;
          body.add(m);
        }
        body.remove(hg.group);
      }
      for (const [m, mat] of originals) {
        (m.material as THREE.Material).dispose();
        m.material = mat;
      }
      pkg.dispose();
      resolve();
      return false;
    });
  });
}
