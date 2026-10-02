import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* Plegado y vuelo a la cesta. La prenda real sale del perchero a una capa WebGL
   transparente a pantalla completa (cámara ortográfica en px CSS), se pliega (mangas
   hacia atrás y mitad inferior hacia arriba, deformando la malla en el shader) y vuela
   en arco hasta el icono. */

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
  fly: [1080, 2000],   // vuelo a la cesta
} as const;
const LIFT_PX = 14;
const ARC = 150;        // px que sube el arco
const TOP_MARGIN = 90;  // px: el arco no sube por encima de esto
const END_SCALE = 0.1;

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

/* ---------- Preparación del plegado (común a las dos animaciones) ---------- */
interface Folding {
  holder: THREE.Group; // px en pantalla
  spin: THREE.Group;   // giro alrededor del centro de la prenda doblada
  cy: number;          // y (m) del centro de la prenda doblada respecto a su origen
  width: number;       // ancho de la prenda doblada (m)
  depth: number;       // grosor de la prenda doblada (m)
  height: number;      // alto de la prenda doblada (m)
  /** Mangas y doblez según `ms` desde que empieza a plegarse. */
  fold(ms: number): void;
  /** Coloca el centro de la prenda doblada en (x, y) px con escala `s` px/m. */
  place(x: number, y: number, s: number): void;
  /** Deshace todo: la prenda vuelve a su estado original y sin padre. */
  teardown(): void;
}

function prepare(body: THREE.Group): Folding {
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

  // Piezas colocadas con su propia posición (botones, tirador): el shader pliega según las
  // coordenadas de la malla, así que se hornea la posición en una copia de la geometría
  const baked: { m: THREE.Mesh; geo: THREE.BufferGeometry; pos: THREE.Vector3; quat: THREE.Quaternion }[] = [];
  for (const m of meshes) {
    if (m.position.lengthSq() === 0 && m.quaternion.equals(new THREE.Quaternion())) continue;
    m.updateMatrix();
    baked.push({ m, geo: m.geometry, pos: m.position.clone(), quat: m.quaternion.clone() });
    m.geometry = m.geometry.clone().applyMatrix4(m.matrix);
    m.position.set(0, 0, 0);
    m.quaternion.identity();
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

  // Jerarquía: holder (px en pantalla) → center (centro de la prenda doblada) → spin → pack
  const cy = (top + foldY) / 2;
  const holder = new THREE.Group();
  const center = new THREE.Group();
  const spin = new THREE.Group();
  const pack = new THREE.Group();
  center.position.y = cy;
  pack.position.y = -cy;
  pack.add(body);
  spin.add(pack);
  center.add(spin);
  holder.add(center);
  scene.add(holder);

  return {
    holder,
    spin,
    cy,
    width: bodyBox.max.x - bodyBox.min.x,
    depth: thick * 4,
    height: top - foldY,
    fold(ms) {
      const sl = easeInOut(phase(ms, T.sleeves));
      for (const hg of hinges) {
        hg.group.rotation.y = hg.sign * (Math.PI - 0.06) * sl;
        // Se recogen por detrás del cuerpo y se aplanan para quedar dentro del grosor de la
        // prenda doblada (si no, asoman por debajo cuando se tumba en el montón)
        hg.group.position.z = -thick * 1.2 * sl;
        hg.group.scale.z = 1 - 0.6 * sl;
      }
      uBody.uFold.value = uSleeve.uFold.value = easeInOut(phase(ms, T.fold));
    },
    place(x, y, s) {
      holder.position.set(x, -(y + cy * s), 0);
      holder.scale.setScalar(s);
    },
    teardown() {
      scene.remove(holder);
      pack.remove(body);
      for (const hg of hinges) {
        for (const m of hg.members) {
          m.position.x += hg.px;
          body.add(m);
        }
        body.remove(hg.group);
      }
      for (const b of baked) {
        b.m.geometry.dispose();
        b.m.geometry = b.geo;
        b.m.position.copy(b.pos);
        b.m.quaternion.copy(b.quat);
      }
      for (const [m, mat] of originals) {
        (m.material as THREE.Material).dispose();
        m.material = mat;
      }
    },
  };
}

type Point = { x: number; y: number };

/** Punto de un arco cuadrático entre `a` y `b` que sube hasta `lift` px (sin salirse por arriba). */
function arc(a: Point, b: Point, e: number, lift = ARC): Point {
  const c = { x: (a.x + b.x) / 2, y: Math.max(TOP_MARGIN, Math.min(a.y, b.y) - lift) };
  const u = 1 - e;
  return { x: u * u * a.x + 2 * u * e * c.x + e * e * b.x, y: u * u * a.y + 2 * u * e * c.y + e * e * b.y };
}

/**
 * Pliega `body` (la prenda, ya separada de su percha) y la lleva hasta `to`.
 * Al terminar la prenda queda como estaba (sin pliegues ni padre) para poder volver a colgarla.
 */
export function packAndFly(body: THREE.Group, from: Launch, to: Point): Promise<void> {
  const f0 = prepare(body);
  const start = performance.now();
  const fromCenter = { x: from.x, y: from.y - f0.cy * from.scale }; // centro de la prenda doblada en pantalla

  return new Promise((resolve) => {
    run((now) => {
      const ms = now - start;
      const lift = easeOut(phase(ms, T.lift));
      f0.spin.rotation.y = from.rotY * (1 - lift);
      let s = from.scale * (1 + 0.04 * lift);
      let p: Point = { x: fromCenter.x, y: fromCenter.y - LIFT_PX * lift };
      f0.fold(ms);

      const f = phase(ms, T.fly);
      if (f > 0) {
        const e = easeInOut(f);
        p = arc({ x: fromCenter.x, y: fromCenter.y - LIFT_PX }, to, e);
        s *= 1 - (1 - END_SCALE) * Math.pow(e, 1.5);
        f0.spin.rotation.set(-0.2 * Math.sin(Math.PI * f), e * Math.PI * 2, 0.25 * Math.sin(Math.PI * f));
      }
      f0.place(p.x, p.y, s);

      if (f < 1) return true;
      f0.teardown();
      resolve();
      return false;
    });
  });
}

/* ---------- Comprar el look: montón de ropa doblada y, después, a la cesta de una en una ---------- */
const PILE = {
  stagger: 160,    // ms entre que empieza a plegarse una prenda y la siguiente
  travel: 620,     // ms del viaje de cada prenda doblada hasta el montón
  rest: 420,       // ms de pausa con el montón completo
  gap: 380,        // ms entre que sale una prenda del montón y la siguiente
  fly: 860,        // ms de cada vuelo a la cesta
  tilt: 0.42,      // rad: inclinación de la cara superior hacia el espectador
} as const;

/**
 * Pliega todas las prendas a la vez (escalonadas), las apila tumbadas en `pile` (base del
 * montón, px) y luego las manda a `to` de una en una, de arriba abajo. `onLand(k)` avisa
 * cuando aterriza la k-ésima de `items`.
 */
export function pileAndFly(items: { body: THREE.Group; from: Launch }[], pile: Point, to: Point, onLand: (k: number) => void): Promise<void> {
  const jobs = items.map(({ body, from }, k) => ({ k, from, f: prepare(body) }));
  // Las más anchas abajo; un poco de desorden para que parezca ropa apilada a mano
  const stack = [...jobs].sort((a, b) => b.f.width - a.f.width);
  const lay = -(Math.PI / 2 - PILE.tilt); // tumbada: la cara delantera mira hacia arriba
  const slot = new Map<number, { x: number; y: number; ry: number; rz: number }>();
  const scale = jobs[0]?.from.scale ?? 1;
  let height = 0;
  stack.forEach((j, level) => {
    // Centro de la pieza apilada: la base de esta capa más medio grosor
    const y = pile.y - (height + (j.f.depth * Math.cos(PILE.tilt)) / 2) * scale;
    height += j.f.depth * Math.cos(PILE.tilt) * 0.92;
    const r = Math.sin(level * 12.9898 + j.k * 78.233);
    slot.set(j.k, { x: pile.x + r * 8, y, ry: r * 0.12, rz: r * 0.03 });
  });
  const foldEnd = T.fold[1];
  const arriveLast = (jobs.length - 1) * PILE.stagger + foldEnd + PILE.travel;
  const leaveAt = arriveLast + PILE.rest;
  // Sale primero la de arriba del montón
  const order = [...stack].reverse().map((j) => j.k);
  const start = performance.now();

  return new Promise((resolve) => {
    let landed = 0;
    for (const j of jobs) {
      const from = j.from;
      const fromCenter = { x: from.x, y: from.y - j.f.cy * from.scale };
      const at = slot.get(j.k)!;
      const t0 = j.k * PILE.stagger;
      const tLeave = leaveAt + order.indexOf(j.k) * PILE.gap;
      run((now) => {
        const ms = now - start - t0;
        if (ms < 0) {
          j.f.place(fromCenter.x, fromCenter.y, from.scale);
          j.f.spin.rotation.y = from.rotY;
          return true;
        }
        // 1. Se separa de la percha y se pliega en su sitio
        const lift = easeOut(phase(ms, T.lift));
        let p: Point = { x: fromCenter.x, y: fromCenter.y - LIFT_PX * lift };
        let s = from.scale;
        j.f.spin.rotation.set(0, from.rotY * (1 - lift), 0);
        j.f.fold(ms);

        // 2. Viaja al montón y se tumba
        const g = phase(ms, [foldEnd, foldEnd + PILE.travel]);
        if (g > 0) {
          const e = easeInOut(g);
          p = arc({ x: fromCenter.x, y: fromCenter.y - LIFT_PX }, at, e, 60);
          s = from.scale + (scale - from.scale) * e;
          j.f.spin.rotation.set(lay * e, at.ry * e, at.rz * e);
          // Pequeño asentamiento al caer sobre el montón
          if (g >= 1) p.y += Math.sin(Math.min(1, (ms - foldEnd - PILE.travel) / 180) * Math.PI) * 3;
        }

        // 3. Del montón a la cesta
        const fl = clamp01((now - start - tLeave) / PILE.fly);
        if (fl > 0) {
          const e = easeInOut(fl);
          p = arc(at, to, e);
          s = scale * (1 - (1 - END_SCALE) * Math.pow(e, 1.5));
          j.f.spin.rotation.set(lay * (1 - e) - 0.2 * Math.sin(Math.PI * fl), at.ry + e * Math.PI * 2, at.rz + 0.25 * Math.sin(Math.PI * fl));
        }
        j.f.place(p.x, p.y, s);

        if (fl < 1) return true;
        j.f.teardown();
        onLand(j.k);
        if (++landed === jobs.length) resolve();
        return false;
      });
    }
  });
}
