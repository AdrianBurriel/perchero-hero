import * as THREE from 'three';

/* Pieza de tela "acolchada": a partir de una silueta 2D genera una malla cerrada con
   volumen (cara delantera y trasera unidas en el canto, como una costura). Los pliegues
   desplazan ambas caras a la vez, así que el canto nunca se abre. */

export type Vec2 = [number, number];
export type Field = (x: number, y: number) => number;

export interface PillowOptions {
  depth: number;     // semiespesor máximo (m)
  round?: number;    // radio del canto redondeado (m)
  cell?: number;     // tamaño de celda de la malla (m)
  folds?: Field;     // desplazamiento en z común a las dos caras (pliegues)
  puff?: Field;      // multiplicador del espesor (acolchados)
  base?: Field;      // superficie sobre la que se apoya (piezas superpuestas)
  frontOnly?: boolean;
}

export interface Pillow {
  geometry: THREE.BufferGeometry;
  surface: Field; // z de la cara delantera en (x, y), para apoyar otras piezas encima
}

const zero: Field = () => 0;
const one: Field = () => 1;

/** Cierra una media silueta (de arriba en x=0 hacia abajo en x=0, lado derecho) con su espejo. */
export function mirror(half: Vec2[]): Vec2[] {
  const left = half.slice(1, -1).reverse().map(([x, y]): Vec2 => [-x, y]);
  return [...half, ...left];
}

/** Refleja una silueta completa en x (para piezas a izquierda y derecha). */
export function flipX(poly: Vec2[], side: number): Vec2[] {
  return poly.map(([x, y]): Vec2 => [x * side, y]);
}

function isInside(poly: Vec2[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function closest(poly: Vec2[], x: number, y: number): [number, number, number] {
  let bx = x, by = y, bd = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j]!;
    const [cx, cy] = poly[i]!;
    const dx = cx - ax, dy = cy - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    const px = ax + dx * t, py = ay + dy * t;
    const d = Math.hypot(x - px, y - py);
    if (d < bd) { bd = d; bx = px; by = py; }
  }
  return [bx, by, bd];
}

export function pillow(poly: Vec2[], o: PillowOptions): Pillow {
  const cell = o.cell ?? 0.0065;
  const round = o.round ?? Math.max(o.depth * 1.6, 0.008);
  const folds = o.folds ?? zero;
  const puff = o.puff ?? one;
  const base = o.base ?? zero;
  // Perfil circular del canto: 0 en el borde, depth a partir de `round` hacia dentro
  const profile = (d: number, x: number, y: number) => {
    const t = Math.min(d / round, 1);
    return o.depth * puff(x, y) * Math.sqrt(1 - (1 - t) ** 2);
  };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of poly) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const nx = Math.ceil((maxX - minX) / cell) + 2;
  const ny = Math.ceil((maxY - minY) / cell) + 2;
  const x0 = minX - cell, y0 = minY - cell;
  const W = nx + 1;
  const count = W * (ny + 1);

  // Rejilla: los vértices de fuera se proyectan al contorno para que el borde sea limpio
  const inside = new Uint8Array(count);
  const vx = new Float32Array(count), vy = new Float32Array(count), vd = new Float32Array(count);
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const k = j * W + i;
      const x = x0 + i * cell, y = y0 + j * cell;
      const [cx, cy, d] = closest(poly, x, y);
      if (isInside(poly, x, y)) {
        inside[k] = 1; vx[k] = x; vy[k] = y; vd[k] = d;
      } else {
        vx[k] = cx; vy[k] = cy; vd[k] = 0;
      }
    }
  }

  const cells: number[] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * W + i;
      if (inside[a] || inside[a + 1] || inside[a + W] || inside[a + W + 1]) cells.push(a);
    }
  }
  const used = new Int32Array(count).fill(-1);
  const order: number[] = [];
  for (const a of cells) {
    for (const k of [a, a + 1, a + W + 1, a + W]) {
      if (used[k]! < 0) { used[k] = order.length; order.push(k); }
    }
  }

  const faces = o.frontOnly ? 1 : 2;
  const n = order.length;
  const pos = new Float32Array(n * faces * 3);
  const uv = new Float32Array(n * faces * 2);
  for (let f = 0; f < faces; f++) {
    const sign = f === 0 ? 1 : -1;
    order.forEach((k, idx) => {
      const x = vx[k]!, y = vy[k]!;
      const z = base(x, y) + folds(x, y) + sign * profile(vd[k]!, x, y);
      const p = (f * n + idx) * 3;
      pos[p] = x; pos[p + 1] = y; pos[p + 2] = z;
      // UV en metros: cada tejido define su escala con texture.repeat
      const u = (f * n + idx) * 2;
      uv[u] = x; uv[u + 1] = y;
    });
  }

  const index: number[] = [];
  for (const a of cells) {
    const A = used[a]!, B = used[a + 1]!, C = used[a + W + 1]!, D = used[a + W]!;
    index.push(A, B, C, A, C, D);
    if (faces === 2) index.push(n + A, n + C, n + B, n + A, n + D, n + C);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();

  const surface: Field = (x, y) => {
    const d = isInside(poly, x, y) ? closest(poly, x, y)[2] : 0;
    return base(x, y) + folds(x, y) + profile(d, x, y);
  };
  return { geometry, surface };
}
