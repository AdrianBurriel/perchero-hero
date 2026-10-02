import * as THREE from 'three';

/* Tejidos procedurales: cada receta pinta un mosaico repetible con color y altura.
   La altura se convierte en normal map, que es lo que da el relieve del hilo. */

export type FabricKind =
  | 'jersey' | 'stripes' | 'oxford' | 'flannel' | 'denim' | 'leather' | 'cable'
  | 'fleece' | 'nylon' | 'corduroy' | 'linen' | 'rib' | 'zip' | 'plaster'
  | 'suiting' | 'print' | 'wool';

export interface FabricSpec {
  kind: FabricKind;
  colors: string[]; // [principal, secundario, ...] en hex
}

type RGB = [number, number, number];
type Pixel = (x: number, y: number) => [number, RGB];

interface Recipe {
  size: number;      // px del mosaico
  tile: number;      // metros que cubre el mosaico
  normal: number;    // intensidad del relieve
  roughness: number;
  sheen?: number;    // brillo de terciopelo típico de la tela
  metalness?: number;
  clearcoat?: number;
  pixel: (S: number, c: RGB[], seed: number) => Pixel;
}

const hex = (s: string): RGB => {
  const n = parseInt(s.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t,
];
const shade = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
const frac = (v: number) => v - Math.floor(v);

export function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ruido de valor repetible sobre un mosaico de S px (0..1). */
function noise(S: number, cells: number, seed: number, octaves = 1) {
  const layers = Array.from({ length: octaves }, (_, o) => {
    const period = cells * 2 ** o;
    const r = mulberry32(seed * 131 + o);
    return { period, g: Float32Array.from({ length: period * period }, r) };
  });
  return (x: number, y: number) => {
    let sum = 0, norm = 0;
    layers.forEach(({ period, g }, o) => {
      const px = (x / S) * period, py = (y / S) * period;
      const xi = Math.floor(px), yi = Math.floor(py);
      const fx = px - xi, fy = py - yi;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const at = (i: number, j: number) =>
        g[(((j % period) + period) % period) * period + (((i % period) + period) % period)]!;
      const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
      const w = 0.5 ** o;
      sum += w * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      norm += w;
    });
    return sum / norm;
  };
}

/** Ligamento: devuelve altura del hilo y si en esa celda manda la urdimbre. */
function weave(x: number, y: number, cell: number, warpUp: (i: number, j: number) => boolean) {
  const i = Math.floor(x / cell), j = Math.floor(y / cell);
  const fx = frac(x / cell), fy = frac(y / cell);
  const warp = warpUp(i, j);
  const h = warp ? 0.5 + 0.5 * Math.sin(Math.PI * fx) : 0.5 + 0.5 * Math.sin(Math.PI * fy);
  return { h, warp, i, j };
}

/** Punto de media: dos lóbulos en V por puntada. */
function knit(x: number, y: number, cw: number, ch: number) {
  const fx = frac(x / cw);
  const side = fx < 0.5 ? fx : 1 - fx;
  const fy = frac((y + side * ch * 0.8) / ch);
  return Math.sin(Math.PI * frac(fx * 2)) * Math.sin(Math.PI * fy);
}

const RECIPES: Record<FabricKind, Recipe> = {
  jersey: {
    size: 256, tile: 0.035, normal: 0.5, roughness: 0.92, sheen: 0.7,
    pixel: (S, [c], seed) => {
      const n = noise(S, 8, seed, 3), sp = noise(S, 128, seed + 7);
      return (x, y) => {
        const lobe = knit(x, y, 4, 8);
        const nn = n(x, y);
        return [0.55 * lobe + 0.45 * nn, shade(c!, 0.9 + 0.08 * lobe + 0.08 * (sp(x, y) - 0.5) + 0.06 * (nn - 0.5))];
      };
    },
  },
  stripes: {
    size: 256, tile: 0.05, normal: 0.5, roughness: 0.92, sheen: 0.7,
    pixel: (S, [a, b], seed) => {
      const n = noise(S, 8, seed, 3);
      return (x, y) => {
        const lobe = knit(x, y, 4, 8);
        const band = frac(y / (S / 2)) < 0.4 ? b! : a!;
        return [0.55 * lobe + 0.45 * n(x, y), shade(band, 0.9 + 0.1 * lobe)];
      };
    },
  },
  oxford: {
    size: 256, tile: 0.03, normal: 0.25, roughness: 0.85, sheen: 0.4,
    pixel: (S, [warpC, weftC], seed) => {
      const slub = noise(S, 64, seed);
      return (x, y) => {
        const w = weave(x, y, 4, (i, j) => (i + j) % 2 === 0);
        const col = w.warp ? shade(warpC!, 0.9 + 0.16 * slub(w.i * 4 + 2, y)) : mix(weftC!, warpC!, 0.35);
        return [w.h, shade(col, 0.9 + 0.1 * w.h)];
      };
    },
  },
  flannel: {
    size: 512, tile: 0.13, normal: 0.35, roughness: 0.96, sheen: 1,
    pixel: (S, c, seed) => {
      const fuzz = noise(S, 128, seed, 2);
      // Tartán: bandas de color repetidas en urdimbre y trama
      const bands: [number, number][] = [[0, 0.26], [1, 0.1], [2, 0.05], [1, 0.1], [0, 0.26], [1, 0.06], [3, 0.02], [1, 0.06], [0, 0.09]];
      const total = bands.reduce((s, b) => s + b[1], 0);
      const sett = (t: number): RGB => {
        let acc = 0;
        for (const [ci, w] of bands) {
          acc += w / total;
          if (t < acc) return c[ci] ?? c[0]!;
        }
        return c[0]!;
      };
      return (x, y) => {
        const w = weave(x, y, 4, (i, j) => (((i + j) % 4) + 4) % 4 < 2);
        const col = w.warp ? sett(x / S) : sett(y / S);
        return [w.h * 0.6 + 0.4 * fuzz(x, y), shade(col, 0.85 + 0.15 * w.h + 0.1 * (fuzz(x, y) - 0.5))];
      };
    },
  },
  denim: {
    size: 512, tile: 0.07, normal: 0.3, roughness: 0.9, sheen: 0.3,
    pixel: (S, [indigo, ecru], seed) => {
      const slub = noise(S, 64, seed), wash = noise(S, 3, seed + 3, 2);
      return (x, y) => {
        // Sarga 3/1: diagonal característica del vaquero
        const w = weave(x, y, 4, (i, j) => (((i - j) % 4) + 4) % 4 !== 0);
        let col = w.warp ? shade(indigo!, 0.78 + 0.4 * slub(w.i * 4 + 2, y)) : mix(ecru!, indigo!, 0.35);
        col = mix(col, ecru!, Math.max(0, wash(x, y) - 0.45) * 0.5);
        return [w.h, shade(col, 0.8 + 0.2 * w.h)];
      };
    },
  },
  leather: {
    size: 256, tile: 0.05, normal: 0.8, roughness: 0.48, clearcoat: 0.3,
    pixel: (S, [c], seed) => {
      // Grano: celdas de Worley; las arrugas son los bordes entre celdas
      const G = 16, cs = S / G, r = mulberry32(seed);
      const pts = Array.from({ length: G * G }, () => [r(), r()] as const);
      const n = noise(S, 6, seed + 1, 2);
      return (x, y) => {
        const ci = Math.floor(x / cs), cj = Math.floor(y / cs);
        let f1 = Infinity, f2 = Infinity;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const i = ci + di, j = cj + dj;
            const p = pts[(((j % G) + G) % G) * G + (((i % G) + G) % G)]!;
            const d = Math.hypot(x - (i + p[0]) * cs, y - (j + p[1]) * cs);
            if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
          }
        }
        const h = Math.min(1, (f2 - f1) / (cs * 0.4));
        return [h, shade(c!, 0.82 + 0.18 * h + 0.12 * (n(x, y) - 0.5))];
      };
    },
  },
  cable: {
    size: 512, tile: 0.15, normal: 1, roughness: 0.96, sheen: 1,
    pixel: (S, [c], seed) => {
      const n = noise(S, 32, seed, 2);
      return (x, y) => {
        const cx = x % 128;
        const stitch = knit(x, y, 8, 8);
        let h: number;
        if (cx < 24 || cx >= 104) {
          // Punto del revés entre trenzas: más hundido y granulado
          h = 0.25 + 0.25 * n(x, y) + 0.1 * stitch;
        } else {
          // Ocho: dos cordones que se cruzan
          const t = (cx - 24) / 80;
          const s = Math.sin((2 * Math.PI * y) / 128);
          const d = Math.min(Math.abs(t - (0.5 + 0.28 * s)), Math.abs(t - (0.5 - 0.28 * s)));
          const strand = Math.max(0, 1 - (d / 0.22) ** 2);
          h = 0.3 + 0.7 * Math.sqrt(strand) * (0.85 + 0.15 * stitch);
        }
        return [h, shade(c!, 0.7 + 0.3 * h)];
      };
    },
  },
  fleece: {
    size: 256, tile: 0.03, normal: 0.3, roughness: 0.97, sheen: 1,
    pixel: (S, [a, b], seed) => {
      const sp = noise(S, 128, seed), n = noise(S, 32, seed + 3, 2);
      return (x, y) => [n(x, y), mix(a!, b!, sp(x, y) > 0.55 ? 0.7 : 0.1)];
    },
  },
  nylon: {
    size: 256, tile: 0.04, normal: 0.4, roughness: 0.36, clearcoat: 0.4,
    pixel: (S, [c], seed) => {
      const n = noise(S, 16, seed);
      return (x, y) => {
        const line = x % 32 < 2 || y % 32 < 2; // ripstop
        const h = line ? 1 : 0.35 + 0.15 * n(x, y);
        return [h, shade(c!, 0.95 + 0.05 * h)];
      };
    },
  },
  corduroy: {
    size: 256, tile: 0.024, normal: 1.2, roughness: 0.92, sheen: 1,
    pixel: (S, [c], seed) => {
      const n = noise(S, 16, seed, 2);
      return (x, y) => {
        const h = Math.sqrt(Math.sin(Math.PI * frac(x / 32)));
        return [h, shade(c!, 0.62 + 0.38 * h + 0.06 * (n(x, y) - 0.5))];
      };
    },
  },
  linen: {
    size: 256, tile: 0.03, normal: 0.7, roughness: 0.9, sheen: 0.6,
    pixel: (S, [c], seed) => {
      const sw = noise(S, 64, seed), sf = noise(S, 64, seed + 1);
      return (x, y) => {
        const w = weave(x, y, 4, (i, j) => (i + j) % 2 === 0);
        // Hilo irregular (slub) que da el aspecto rústico del lino
        const s = w.warp ? sw(w.i * 4 + 2, y) : sf(x, w.j * 4 + 2);
        return [w.h * (0.7 + 0.6 * s), shade(c!, 0.8 + 0.12 * w.h + 0.22 * (s - 0.5))];
      };
    },
  },
  rib: {
    size: 128, tile: 0.012, normal: 0.9, roughness: 0.95, sheen: 0.8,
    pixel: (_S, [c]) => (x) => {
      const h = Math.pow(Math.sin(Math.PI * frac(x / 16)), 0.7);
      return [h, shade(c!, 0.78 + 0.22 * h)];
    },
  },
  zip: {
    size: 64, tile: 0.006, normal: 1, roughness: 0.3, metalness: 0.9,
    pixel: (_S, [c]) => (_x, y) => {
      const h = Math.sqrt(Math.sin(Math.PI * frac(y / 32)));
      return [h, shade(c!, 0.6 + 0.4 * h)];
    },
  },
  suiting: {
    // Lana de traje: sarga 2/2 muy fina y jaspeado suave
    size: 256, tile: 0.03, normal: 0.25, roughness: 0.78, sheen: 0.6,
    pixel: (S, [c], seed) => {
      const heather = noise(S, 64, seed), n = noise(S, 6, seed + 2, 2);
      return (x, y) => {
        const w = weave(x, y, 4, (i, j) => (((i + j) % 4) + 4) % 4 < 2);
        const k = 0.9 + 0.1 * w.h + 0.08 * (heather(x, y) - 0.5) + 0.05 * (n(x, y) - 0.5);
        return [w.h, shade(c!, k)];
      };
    },
  },
  print: {
    // Popelín estampado: flores pequeñas repartidas con desorden (repetible)
    size: 512, tile: 0.08, normal: 0.2, roughness: 0.75, sheen: 0.4,
    pixel: (S, [ground, motif, dot], seed) => {
      const G = 8, cs = S / G, r = mulberry32(seed);
      const pts = Array.from({ length: G * G }, () => [0.2 + 0.6 * r(), 0.2 + 0.6 * r(), r() * Math.PI, 0.6 + 0.5 * r()] as const);
      return (x, y) => {
        const w = weave(x, y, 4, (i, j) => (i + j) % 2 === 0);
        const ci = Math.floor(x / cs), cj = Math.floor(y / cs);
        let col: RGB = ground!;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const i = ci + di, j = cj + dj;
            const p = pts[(((j % G) + G) % G) * G + (((i % G) + G) % G)]!;
            const dx = x - (i + p[0]) * cs, dy = y - (j + p[1]) * cs;
            const d = Math.hypot(dx, dy);
            const R = cs * 0.34 * p[3];
            const petals = R * (0.62 + 0.38 * Math.cos(5 * (Math.atan2(dy, dx) + p[2])));
            if (d < R * 0.22) col = dot!;
            else if (d < petals) col = motif!;
            else if (Math.abs(d - R * 1.25) < 1.2 && Math.cos(3 * (Math.atan2(dy, dx) - p[2])) > 0.55) col = mix(ground!, motif!, 0.6);
          }
        }
        return [w.h, shade(col, 0.92 + 0.08 * w.h)];
      };
    },
  },
  wool: {
    // Paño de abrigo: superficie batanada, fieltrada, sin trama visible
    size: 256, tile: 0.05, normal: 0.35, roughness: 0.97, sheen: 1,
    pixel: (S, [c], seed) => {
      const fine = noise(S, 128, seed, 2), soft = noise(S, 8, seed + 4, 3);
      return (x, y) => {
        const f = fine(x, y), s = soft(x, y);
        return [0.6 * f + 0.4 * s, shade(c!, 0.9 + 0.12 * (f - 0.5) + 0.1 * (s - 0.5))];
      };
    },
  },
  plaster: {
    size: 512, tile: 1, normal: 0.35, roughness: 0.95,
    pixel: (S, [c], seed) => {
      const n = noise(S, 8, seed, 5);
      return (x, y) => {
        const v = n(x, y);
        return [v, shade(c!, 0.96 + 0.08 * (v - 0.5))];
      };
    },
  },
};

function bake(size: number, pixel: Pixel) {
  const H = new Float32Array(size * size);
  const color = document.createElement('canvas');
  const normal = document.createElement('canvas');
  color.width = color.height = normal.width = normal.height = size;
  const ci = new ImageData(size, size), ni = new ImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const [h, c] = pixel(x, y);
      H[i] = h;
      ci.data[i * 4] = c[0] * 255; ci.data[i * 4 + 1] = c[1] * 255; ci.data[i * 4 + 2] = c[2] * 255;
      ci.data[i * 4 + 3] = 255;
    }
  }
  const at = (x: number, y: number) => H[((y + size) % size) * size + ((x + size) % size)]!;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Fila 0 = v alto (flipY): el gradiente en v va de abajo a arriba
      const nx = (at(x - 1, y) - at(x + 1, y)) * 1.5;
      const ny = (at(x, y + 1) - at(x, y - 1)) * 1.5;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      ni.data[i] = (nx / len * 0.5 + 0.5) * 255;
      ni.data[i + 1] = (ny / len * 0.5 + 0.5) * 255;
      ni.data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      ni.data[i + 3] = 255;
    }
  }
  color.getContext('2d')!.putImageData(ci, 0, 0);
  normal.getContext('2d')!.putImageData(ni, 0, 0);
  return { color, normal };
}

const cache = new Map<string, THREE.MeshPhysicalMaterial>();

export function fabricMaterial(spec: FabricSpec, opts: { inner?: boolean; seed?: number } = {}): THREE.MeshPhysicalMaterial {
  const key = JSON.stringify([spec, opts]);
  const hit = cache.get(key);
  if (hit) return hit;
  if (opts.inner) {
    // Interior de la prenda: mismo tejido, en sombra
    const m = fabricMaterial(spec, { seed: opts.seed }).clone();
    m.color.setScalar(0.55);
    cache.set(key, m);
    return m;
  }
  const r = RECIPES[spec.kind];
  const colors = spec.colors.map(hex);
  const { color, normal } = bake(r.size, r.pixel(r.size, colors, opts.seed ?? 1));
  const tex = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / r.tile, 1 / r.tile);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const base = colors[0]!;
  const m = new THREE.MeshPhysicalMaterial({
    map: tex(color, true),
    normalMap: tex(normal, false),
    normalScale: new THREE.Vector2(r.normal, r.normal),
    roughness: r.roughness,
    metalness: r.metalness ?? 0,
    clearcoat: r.clearcoat ?? 0,
    clearcoatRoughness: 0.5,
    sheen: r.sheen ?? 0,
    sheenRoughness: 0.75,
    sheenColor: new THREE.Color().setRGB(...mix(base, [1, 1, 1], 0.35), THREE.SRGBColorSpace),
  });
  cache.set(key, m);
  return m;
}
