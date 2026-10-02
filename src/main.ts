import './style.css';
import * as THREE from 'three';
import { garments, type GarmentData } from './garments';
import { createStage, createHanger } from './stage';
import { buildGarment } from './garment/builders';

/* ---------- Parámetros (afinar a ojo) ---------- */
// Sin balanceo: como en la referencia, las prendas solo giran de lado a frente
const STEP = 1 / 120;    // paso fijo de integración
const SIDE_ANGLE = 76;   // grados en reposo (90 = totalmente de canto)
const TURN_STIFF = 28;   // rapidez del giro: menor = más lento (~1 s con 28)
const TURN_DAMP = 11.5;  // ≥ 2·√TURN_STIFF: llega sin rebote; menor deja un pequeño rebote
const SPACING = 0.12;    // separación entre perchas en el raíl (m)
const PUSH = 0.28;       // cuánto se apartan las vecinas (m)
const PUSH_FALLOFF = 0.3; // las lejanas se apartan menos: el perchero se comprime
const HOVER_GRACE = 180; // ms sin tocar prenda antes de soltar la activa (evita parpadeo en huecos)

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Escena ---------- */
const canvas = document.querySelector<HTMLCanvasElement>('#stage')!;
const list = document.querySelector<HTMLElement>('#rail')!;
const caption = document.querySelector<HTMLElement>('#caption')!;
const detail = document.querySelector<HTMLElement>('#detail')!;
const detailName = document.querySelector<HTMLElement>('#detail-name')!;
const detailBrand = document.querySelector<HTMLElement>('#detail-brand')!;
const detailMaterial = document.querySelector<HTMLElement>('#detail-material')!;
const detailText = document.querySelector<HTMLElement>('#detail-text')!;
const detailClose = document.querySelector<HTMLButtonElement>('#detail-close')!;

const { renderer, scene, camera, resize } = createStage(canvas);

interface Item {
  data: GarmentData;
  slot: THREE.Group;   // posición en el raíl (se aparta)
  turner: THREE.Group; // giro de lado a frente
  hit: THREE.Mesh[];
  baseX: number;
  turn: number; // 0 = de lado, 1 = de frente
  turnV: number;
  shift: number; // desplazamiento por el raíl (m)
  shiftV: number;
}

let hovered: Item | null = null;
let focused: Item | null = null;
const byMesh = new Map<THREE.Object3D, Item>();

const items: Item[] = garments.map((data, i) => {
  const slot = new THREE.Group();
  const turner = new THREE.Group();
  const { hook, frame } = createHanger();
  const garment = buildGarment(data, i + 1);
  turner.add(frame, garment.body);
  slot.add(hook, turner);
  const baseX = (i - (garments.length - 1) / 2) * SPACING;
  slot.position.x = baseX;
  scene.add(slot);

  const item: Item = {
    data, slot, turner, hit: garment.hit, baseX,
    turn: 0, turnV: 0, shift: 0, shiftV: 0,
  };
  for (const m of garment.hit) byMesh.set(m, item);

  // Botón accesible (invisible) por prenda: Tab la pone de frente, Enter abre el detalle
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = `${data.name}, ${data.brand}`;
  btn.addEventListener('focus', () => (focused = item));
  btn.addEventListener('blur', () => focused === item && (focused = null));
  btn.addEventListener('click', () => openDetail(item.data, btn));
  list.append(btn);
  return item;
});
const hitMeshes = items.flatMap((it) => it.hit);

/* ---------- Detalle ---------- */
let returnFocus: HTMLElement | null = null;
function openDetail(d: GarmentData, from: HTMLElement | null = null) {
  detailName.textContent = d.name;
  detailBrand.textContent = d.brand;
  detailMaterial.textContent = d.material;
  detailText.textContent = d.description;
  detail.hidden = false;
  returnFocus = from ?? (document.activeElement as HTMLElement | null);
  detailClose.focus();
}
function closeDetail() {
  if (detail.hidden) return;
  detail.hidden = true;
  returnFocus?.focus();
}
detailClose.addEventListener('click', closeDetail);
addEventListener('keydown', (e) => e.key === 'Escape' && closeDetail());

/* ---------- Entrada: raycast sobre las prendas ---------- */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let lastHitAt = 0;

function pick(e: MouseEvent): Item | null {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(hitMeshes, false)[0];
  return hit ? byMesh.get(hit.object) ?? null : null;
}

canvas.addEventListener('pointermove', (e) => {
  const now = performance.now();
  const item = pick(e);
  if (item) {
    hovered = item;
    lastHitAt = now;
  } else if (now - lastHitAt > HOVER_GRACE) {
    hovered = null;
  }
  canvas.style.cursor = item ? 'pointer' : '';
});
canvas.addEventListener('pointerleave', () => (hovered = null));
canvas.addEventListener('click', (e) => {
  const item = pick(e);
  if (item) openDetail(item.data);
});

/* ---------- Muelles de giro y apartado ---------- */
function step(dt: number) {
  const active = hovered ?? focused;
  const activeIndex = active ? items.indexOf(active) : -1;
  items.forEach((it, i) => {
    // Muelle del giro hacia su objetivo (de frente si está activa)
    const target = it === active ? 1 : 0;
    // Las vecinas se apartan a cada lado de la activa, menos cuanto más lejos
    const d = activeIndex < 0 ? 0 : i - activeIndex;
    const shiftTarget = d === 0 ? 0 : Math.sign(d) * PUSH / (1 + PUSH_FALLOFF * (Math.abs(d) - 1));
    if (reduceMotion) {
      it.turn = target;
      it.turnV = 0;
      it.shift = shiftTarget;
      it.shiftV = 0;
    } else {
      it.turnV += (TURN_STIFF * (target - it.turn) - TURN_DAMP * it.turnV) * dt;
      it.turn += it.turnV * dt;
      it.shiftV += (TURN_STIFF * (shiftTarget - it.shift) - TURN_DAMP * it.shiftV) * dt;
      it.shift += it.shiftV * dt;
    }
  });
}

/* ---------- Bucle ---------- */
const sideRad = THREE.MathUtils.degToRad(SIDE_ANGLE);

function apply() {
  for (const it of items) {
    it.slot.position.x = it.baseX + it.shift;
    it.turner.rotation.y = (1 - it.turn) * sideRad;
  }
  const active = hovered ?? focused;
  const text = active ? `${active.data.name} · ${active.data.brand}` : '';
  if (caption.textContent !== text) caption.textContent = text;
}

let prev = performance.now();
let accumulator = 0;
let running = true;

function frame(now: number) {
  if (!running) return;
  accumulator += Math.min((now - prev) / 1000, 0.05);
  prev = now;
  while (accumulator >= STEP) {
    step(STEP);
    accumulator -= STEP;
  }
  apply();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// Tamaño del lienzo ligado a su caja: sin saltos al redimensionar
new ResizeObserver(([entry]) => {
  if (!entry) return;
  const { width, height } = entry.contentRect;
  resize(width, height);
  renderer.render(scene, camera);
}).observe(canvas);

// Fuera de pantalla no se simula ni se pinta
new IntersectionObserver(([entry]) => {
  const visible = entry?.isIntersecting ?? true;
  if (visible && !running) {
    running = true;
    prev = performance.now();
    requestAnimationFrame(frame);
  } else if (!visible) {
    running = false;
  }
}).observe(canvas);

requestAnimationFrame(frame);
