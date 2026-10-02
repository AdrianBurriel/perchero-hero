import * as THREE from 'three';
import { pillow, mirror, flipX, type Vec2, type Field, type PillowOptions } from './pillow';
import { fabricMaterial, type FabricSpec } from './fabrics';
import type { GarmentData } from '../garments';

/* Construcción de prendas: piezas acolchadas (cuerpo, mangas) + piezas superpuestas
   (cuello, tapeta, bolsillos, puños) apoyadas sobre la superficie de la pieza de debajo.
   Coordenadas en metros; y = 0 es el raíl, la percha queda por debajo. */

export const SHOULDER_Y = -0.1; // pivote de la tela para el retraso respecto a la percha

export interface BuiltGarment {
  body: THREE.Group;
  hit: THREE.Mesh[];
}

/* ---------- Patrones (medias siluetas, lado derecho) ---------- */
const TEE: Vec2[] = [
  [0, -0.135], [0.045, -0.122], [0.075, -0.09], [0.2, -0.132], [0.318, -0.212],
  [0.276, -0.315], [0.226, -0.298], [0.232, -0.5], [0.242, -0.8], [0.12, -0.808], [0, -0.81],
];
const TEE_BACK_NECK: Vec2[] = [[0, -0.08], [0.07, -0.088], [0.074, -0.096], [0.05, -0.14], [0, -0.15]];

const SHIRT: Vec2[] = [
  [0, -0.118], [0.07, -0.085], [0.215, -0.14], [0.238, -0.25], [0.232, -0.55],
  [0.24, -0.76], [0.17, -0.79], [0.08, -0.825], [0, -0.835],
];
const SHIRT_SLEEVE: Vec2[] = [
  [0.2, -0.14], [0.25, -0.155], [0.285, -0.45], [0.3, -0.66], [0.237, -0.675], [0.218, -0.45], [0.205, -0.25],
];
const SHIRT_CUFF: Vec2[] = [[0.232, -0.6], [0.294, -0.6], [0.3, -0.66], [0.237, -0.675]];
const SHIRT_COLLAR: Vec2[] = [[0.004, -0.104], [0.072, -0.08], [0.09, -0.098], [0.052, -0.162], [0.012, -0.136]];
const COLLAR_BACK: Vec2[] = [[0, -0.07], [0.072, -0.068], [0.076, -0.086], [0, -0.094]];
const CHEST_POCKET: Vec2[] = [[0.06, -0.24], [0.15, -0.24], [0.15, -0.345], [0.105, -0.36], [0.06, -0.345]];

const SWEATER: Vec2[] = [
  [0, -0.128], [0.042, -0.117], [0.072, -0.088], [0.222, -0.142], [0.242, -0.25], [0.236, -0.69], [0, -0.695],
];
const SWEATER_SLEEVE: Vec2[] = [
  [0.205, -0.142], [0.258, -0.158], [0.29, -0.45], [0.296, -0.7], [0.232, -0.712], [0.216, -0.45], [0.208, -0.25],
];
const SWEATER_CUFF: Vec2[] = [[0.229, -0.65], [0.294, -0.648], [0.296, -0.7], [0.232, -0.712]];
const KNIT_BACK_NECK: Vec2[] = [[0, -0.076], [0.068, -0.084], [0.072, -0.094], [0.045, -0.13], [0, -0.14]];
const HOOD: Vec2[] = [[0, -0.028], [0.09, -0.04], [0.14, -0.1], [0.125, -0.2], [0.06, -0.25], [0, -0.26]];
const KANGAROO: Vec2[] = [[0, -0.455], [0.13, -0.455], [0.17, -0.6], [0.17, -0.625], [0, -0.625]];

const JACKET: Vec2[] = [
  [0, -0.125], [0.08, -0.084], [0.222, -0.136], [0.252, -0.24], [0.248, -0.6], [0.244, -0.665], [0, -0.672],
];
const JACKET_SLEEVE: Vec2[] = [
  [0.212, -0.136], [0.268, -0.152], [0.302, -0.42], [0.318, -0.66], [0.246, -0.68], [0.232, -0.42], [0.22, -0.25],
];
const JACKET_CUFF: Vec2[] = [[0.242, -0.625], [0.315, -0.62], [0.318, -0.66], [0.246, -0.68]];
const DENIM_COLLAR: Vec2[] = [[0.006, -0.11], [0.082, -0.078], [0.112, -0.1], [0.08, -0.19], [0.016, -0.15]];
const LAPEL: Vec2[] = [[0.01, -0.13], [0.082, -0.08], [0.14, -0.12], [0.118, -0.16], [0.135, -0.2], [0.06, -0.33], [0.016, -0.34]];
const STAND_COLLAR: Vec2[] = [[0, -0.072], [0.088, -0.066], [0.094, -0.112], [0, -0.14]];
const FLAP: Vec2[] = [[0.07, -0.215], [0.17, -0.215], [0.17, -0.255], [0.12, -0.275], [0.07, -0.255]];

/* ---------- Pliegues ---------- */
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Caída por gravedad: pliegues verticales que crecen hacia el bajo + tirones desde los hombros. */
function drape(seed: number, amp: number, top = -0.12, bottom = -0.8): Field {
  const s = seed * 1.37;
  return (x, y) => {
    const t = Math.min(1, Math.max(0, (top - y) / (top - bottom)));
    const p = x * 52 + Math.sin(y * 7 + s) * 1.6 + s;
    const wave = Math.sin(p) * 0.6 + Math.sin(x * 91 - y * 5 + s * 2.3) * 0.4;
    let drag = 0;
    for (const sx of [-0.2, 0.2]) {
      const dx = x - sx, dy = y + 0.14;
      const d = Math.hypot(dx, dy);
      drag += Math.exp(-d / 0.09) * smooth(0, 0.03, d) * Math.sin(Math.atan2(dy, dx) * 9 + s);
    }
    return amp * (Math.pow(t, 0.7) * wave + 0.5 * drag);
  };
}

/* ---------- Utilidades de montaje ---------- */
class Kit {
  body = new THREE.Group();
  hit: THREE.Mesh[] = [];

  add(geo: THREE.BufferGeometry, mat: THREE.Material, hit = false) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    this.body.add(m);
    if (hit) this.hit.push(m);
    return m;
  }

  piece(poly: Vec2[], o: PillowOptions, mat: THREE.Material, hit = false): Field {
    const p = pillow(poly, o);
    this.add(p.geometry, mat, hit);
    return p.surface;
  }

  /** Pieza superpuesta (solo cara delantera) que sigue la superficie de otra. */
  overlay(poly: Vec2[], on: Field, depth: number, mat: THREE.Material, lift = 0.0012): Field {
    return this.piece(poly, { depth, base: (x, y) => on(x, y) + lift, frontOnly: true, cell: 0.004 }, mat);
  }

  tube(points: [number, number, number][], radius: number, mat: THREE.Material) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    this.add(new THREE.TubeGeometry(curve, 48, radius, 10, false), mat);
  }

  buttons(ys: number[], x: number, on: Field, spec: GarmentData['buttons']) {
    if (!spec) return;
    const mat = new THREE.MeshPhysicalMaterial({
      color: spec.color,
      roughness: spec.metal ? 0.35 : 0.3,
      metalness: spec.metal ? 1 : 0,
      clearcoat: spec.metal ? 0 : 0.6,
    });
    const geo = new THREE.CylinderGeometry(0.0058, 0.0058, 0.0026, 24).rotateX(Math.PI / 2);
    for (const y of ys) {
      const b = this.add(geo, mat);
      b.position.set(x, y, on(x, y) + 0.0014);
    }
  }
}

const spaced = (from: number, to: number, step: number) => {
  const out: number[] = [];
  for (let y = from; y > to; y -= step) out.push(y);
  return out;
};

const sameColor = (f: FabricSpec, kind: FabricSpec['kind']): FabricSpec => ({ kind, colors: [f.colors[0]!] });

/* ---------- Prendas ---------- */
function tee(d: GarmentData, seed: number): BuiltGarment {
  const k = new Kit();
  const mat = fabricMaterial(d.fabric, { seed });
  const folds = drape(seed, 0.008);
  k.piece(mirror(TEE), { depth: 0.013, folds }, mat, true);
  k.piece(mirror(TEE_BACK_NECK), { depth: 0.002, base: () => -0.009, frontOnly: true }, fabricMaterial(d.fabric, { seed, inner: true }));
  const rib = fabricMaterial(sameColor(d.fabric, 'rib'));
  const front: Vec2[] = [[-0.075, -0.09], [-0.045, -0.122], [0, -0.135], [0.045, -0.122], [0.075, -0.09]];
  k.tube(front.map(([x, y]) => [x, y, folds(x, y) + 0.002]), 0.0035, rib);
  k.tube([[-0.075, -0.09, -0.009], [0, -0.081, -0.009], [0.075, -0.09, -0.009]], 0.003, rib);
  return k;
}

function shirt(d: GarmentData, seed: number): BuiltGarment {
  const k = new Kit();
  const mat = fabricMaterial(d.fabric, { seed });
  const heavy = d.variant === 'overshirt';
  const surf = k.piece(mirror(SHIRT), { depth: heavy ? 0.02 : 0.014, folds: drape(seed, heavy ? 0.006 : 0.01) }, mat, true);
  for (const side of [1, -1]) {
    const sleeve = k.piece(
      flipX(SHIRT_SLEEVE, side),
      { depth: heavy ? 0.016 : 0.012, base: () => -0.004, folds: drape(seed + side * 3, 0.007, -0.15, -0.67) },
      mat, true,
    );
    k.overlay(flipX(SHIRT_CUFF, side), sleeve, 0.003, mat);
    k.overlay(flipX(SHIRT_COLLAR, side), surf, 0.003, mat, 0.0018);
    if (side === 1 || heavy || d.fabric.kind === 'flannel') k.overlay(flipX(CHEST_POCKET, side), surf, 0.002, mat);
  }
  k.piece(mirror(COLLAR_BACK), { depth: 0.003, base: () => -0.007, frontOnly: true }, mat);
  const placket = k.overlay([[-0.016, -0.115], [0.016, -0.115], [0.016, -0.815], [-0.016, -0.815]], surf, 0.0025, mat);
  k.buttons(spaced(-0.15, -0.79, 0.09), 0, placket, d.buttons);
  return k;
}

function knitTop(k: Kit, d: GarmentData, seed: number): Field {
  const mat = fabricMaterial(d.fabric, { seed });
  const rib = fabricMaterial(sameColor(d.fabric, 'rib'));
  const depth = d.type === 'hoodie' ? 0.026 : 0.03;
  const folds = drape(seed, 0.006, -0.12, -0.7);
  const surf = k.piece(mirror(SWEATER), { depth, folds }, mat, true);
  for (const side of [1, -1]) {
    const sleeve = k.piece(
      flipX(SWEATER_SLEEVE, side),
      { depth: depth * 0.75, base: () => -0.006, folds: drape(seed + side * 5, 0.004, -0.15, -0.7) },
      mat, true,
    );
    k.overlay(flipX(SWEATER_CUFF, side), sleeve, 0.004, rib);
  }
  k.overlay([[-0.236, -0.635], [0.236, -0.635], [0.236, -0.695], [-0.236, -0.695]], surf, 0.004, rib);
  k.piece(mirror(KNIT_BACK_NECK), { depth: 0.002, base: () => -depth * 0.6, frontOnly: true }, fabricMaterial(d.fabric, { seed, inner: true }));
  const neck: Vec2[] = [[-0.072, -0.088], [-0.042, -0.117], [0, -0.128], [0.042, -0.117], [0.072, -0.088]];
  k.tube(neck.map(([x, y]) => [x, y, folds(x, y) + 0.004]), 0.0075, rib);
  return surf;
}

function sweater(d: GarmentData, seed: number): BuiltGarment {
  const k = new Kit();
  knitTop(k, d, seed);
  return k;
}

function hoodie(d: GarmentData, seed: number): BuiltGarment {
  const k = new Kit();
  const surf = knitTop(k, d, seed);
  const mat = fabricMaterial(d.fabric, { seed });
  // Capucha caída por detrás del cuello
  k.piece(mirror(HOOD), { depth: 0.02, base: () => -0.05, folds: drape(seed + 9, 0.003, -0.05, -0.25) }, mat);
  k.overlay(mirror(KANGAROO), surf, 0.006, mat);
  const cord = new THREE.MeshPhysicalMaterial({ color: '#efeee9', roughness: 0.8, sheen: 1 });
  for (const x of [-0.03, 0.03]) {
    k.tube([[x, -0.118, surf(x, -0.12) + 0.006], [x * 1.1, -0.2, surf(x, -0.2) + 0.006], [x * 1.25, -0.31, surf(x, -0.31) + 0.005]], 0.0024, cord);
  }
  return k;
}

function jacket(d: GarmentData, seed: number): BuiltGarment {
  const k = new Kit();
  const mat = fabricMaterial(d.fabric, { seed });
  const v = d.variant;
  const depth = v === 'puffer' ? 0.05 : v === 'leather' ? 0.026 : 0.022;
  // Plumífero: el espesor se estrangula en las costuras de cada canal
  const puff: Field | undefined = v === 'puffer'
    ? (_x, y) => 0.35 + 0.65 * (1 - Math.pow(1 - Math.abs(Math.sin((Math.PI * y) / 0.085)), 8))
    : undefined;
  const folds = drape(seed, v === 'leather' ? 0.007 : 0.005, -0.12, -0.67);
  const surf = k.piece(mirror(JACKET), { depth, folds, puff, round: depth * 1.4 }, mat, true);
  for (const side of [1, -1]) {
    const sleeve = k.piece(
      flipX(JACKET_SLEEVE, side),
      { depth: depth * 0.8, base: () => -0.006, folds: drape(seed + side * 7, 0.004, -0.15, -0.68), puff },
      mat, true,
    );
    k.overlay(flipX(JACKET_CUFF, side), sleeve, 0.004, v === 'puffer' ? fabricMaterial({ kind: 'rib', colors: ['#2a2d24'] }) : mat);
    if (v === 'denim') {
      k.overlay(flipX(DENIM_COLLAR, side), surf, 0.004, mat, 0.002);
      const flap = k.overlay(flipX(FLAP, side), surf, 0.004, mat);
      k.buttons([-0.255], 0.12 * side, flap, d.buttons);
    }
    if (v === 'leather') k.overlay(flipX(LAPEL, side), surf, 0.005, mat, 0.002);
  }
  if (v === 'puffer') k.overlay(mirror(STAND_COLLAR), surf, 0.012, mat, 0.001);
  else k.overlay([[-0.246, -0.61], [0.246, -0.61], [0.244, -0.665], [-0.244, -0.672]], surf, 0.004, mat);

  if (v === 'denim') {
    const placket = k.overlay([[-0.018, -0.13], [0.018, -0.13], [0.018, -0.668], [-0.018, -0.668]], surf, 0.003, mat);
    k.buttons(spaced(-0.17, -0.64, 0.09), 0, placket, d.buttons);
  } else {
    const zipColor = v === 'leather' ? '#c9c7c2' : '#1e1f1c';
    k.overlay([[-0.006, v === 'puffer' ? -0.07 : -0.33], [0.006, v === 'puffer' ? -0.07 : -0.33], [0.006, -0.668], [-0.006, -0.668]],
      surf, 0.0015, fabricMaterial({ kind: 'zip', colors: [zipColor] }), 0.003);
    const pull = k.add(new THREE.BoxGeometry(0.008, 0.026, 0.003), new THREE.MeshStandardMaterial({ color: zipColor, metalness: 1, roughness: 0.3 }));
    const py = v === 'puffer' ? -0.1 : -0.35;
    pull.position.set(0, py, surf(0, py) + 0.006);
  }
  return k;
}

const BUILDERS = { tee, shirt, sweater, hoodie, jacket } satisfies Record<GarmentData['type'], unknown>;

export function buildGarment(d: GarmentData, seed: number): BuiltGarment {
  return BUILDERS[d.type](d, seed);
}
