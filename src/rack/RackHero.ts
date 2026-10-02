import * as THREE from 'three';
import type { GarmentData } from '../garments';
import { createStage, createHanger, type Mount } from '../stage';
import { buildGarment } from '../garment/builders';

/* Perchero interactivo reutilizable: crea su propio DOM (lienzo, flechas, detalle)
   dentro del contenedor, sin dependencias globales. Lo usan la portada y Shop the look. */

/* ---------- Parámetros (afinar a ojo) ---------- */
// Sin balanceo: como en la referencia, las prendas solo giran de lado a frente
const STEP = 1 / 120;    // paso fijo de integración
const SIDE_ANGLE = 76;   // grados en reposo (90 = totalmente de canto)
const TURN_STIFF = 28;   // rapidez del giro: menor = más lento (~1 s con 28)
const TURN_DAMP = 11.5;  // ≥ 2·√TURN_STIFF: llega sin rebote; menor deja un pequeño rebote
const PUSH_FALLOFF = 0.3; // las lejanas se apartan menos: el perchero se comprime
const HOVER_GRACE = 180; // ms sin tocar prenda antes de soltar la activa (evita parpadeo en huecos)
const RAIL_MARGIN = 0.24; // raíl sobrante a cada lado de la última prenda apartada (m)

export interface RackOptions {
  mount?: Mount;     // 'wall' = raíl de pared, 'floor' = burro con ruedas
  spacing?: number;  // separación entre perchas (m)
  push?: number;     // cuánto se apartan las vecinas de la activa (m)
  initial?: number;  // índice seleccionado al empezar (por defecto, el del medio)
  onChange?: (index: number) => void; // prenda activa (seleccionada o en hover)
}

interface Item {
  data: GarmentData;
  slot: THREE.Group;   // posición en el raíl (se aparta)
  turner: THREE.Group; // giro de lado a frente
  baseX: number;
  turn: number; // 0 = de lado, 1 = de frente
  turnV: number;
  shift: number; // desplazamiento por el raíl (m)
  shiftV: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

const TEMPLATE = `
  <canvas class="rack__stage" aria-hidden="true"></canvas>
  <div class="rack__list"></div>
  <p class="rack__caption" aria-hidden="true"></p>
  <nav class="rack__nav" aria-label="Pasar prendas">
    <span class="rack__counter" aria-live="polite"></span>
    <button class="rack__arrow" data-dir="-1" type="button" aria-label="Prenda anterior">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6 8.5 12l6 6" /></svg>
    </button>
    <button class="rack__arrow rack__arrow--ring" data-dir="1" type="button" aria-label="Prenda siguiente">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6l6 6-6 6" /></svg>
    </button>
  </nav>
  <aside class="detail" role="dialog" aria-labelledby="" hidden>
    <button class="detail__close" type="button" aria-label="Cerrar">×</button>
    <p class="detail__brand"></p>
    <h2 class="detail__name"></h2>
    <p class="detail__material"></p>
    <p class="detail__text"></p>
  </aside>`;

let uid = 0;

export class RackHero {
  private items: Item[];
  private hovered: Item | null = null;
  private focused: Item | null = null;
  private selected: number;
  private lastActive = -1;
  private running = true;
  private prev = performance.now();
  private accumulator = 0;
  private lastHitAt = 0;
  private returnFocus: HTMLElement | null = null;
  private readonly reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly sideRad = THREE.MathUtils.degToRad(SIDE_ANGLE);
  private readonly push: number;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly hitMeshes: THREE.Mesh[] = [];
  private readonly byMesh = new Map<THREE.Object3D, Item>();
  private readonly stage: ReturnType<typeof createStage>;
  private readonly el: {
    canvas: HTMLCanvasElement; list: HTMLElement; caption: HTMLElement; counter: HTMLElement;
    prev: HTMLButtonElement; next: HTMLButtonElement; detail: HTMLElement; close: HTMLButtonElement;
    name: HTMLElement; brand: HTMLElement; material: HTMLElement; text: HTMLElement;
  };

  constructor(private readonly container: HTMLElement, garments: GarmentData[], private readonly opts: RackOptions = {}) {
    const spacing = opts.spacing ?? 0.12;
    this.push = opts.push ?? 0.28;
    this.selected = opts.initial ?? Math.floor(garments.length / 2);

    container.classList.add('rack');
    container.insertAdjacentHTML('beforeend', TEMPLATE);
    const q = <T extends Element>(s: string) => container.querySelector<T>(s)!;
    const nameId = `rack-detail-${++uid}`;
    this.el = {
      canvas: q('.rack__stage'), list: q('.rack__list'), caption: q('.rack__caption'), counter: q('.rack__counter'),
      prev: q('[data-dir="-1"]'), next: q('[data-dir="1"]'), detail: q('.detail'), close: q('.detail__close'),
      name: q('.detail__name'), brand: q('.detail__brand'), material: q('.detail__material'), text: q('.detail__text'),
    };
    this.el.name.id = nameId;
    this.el.detail.setAttribute('aria-labelledby', nameId);

    const railHalf = ((garments.length - 1) / 2) * spacing + this.push + RAIL_MARGIN;
    this.stage = createStage(this.el.canvas, { mount: opts.mount ?? 'wall', railHalf });

    this.items = garments.map((data, i) => this.mountItem(data, i, (i - (garments.length - 1) / 2) * spacing));
    this.bindEvents();
    this.select(this.selected);

    // Tamaño del lienzo ligado a su caja: sin saltos al redimensionar
    new ResizeObserver(([entry]) => {
      if (!entry) return;
      this.stage.resize(entry.contentRect.width, entry.contentRect.height);
      this.render();
    }).observe(this.el.canvas);
    // Fuera de pantalla no se simula ni se pinta
    new IntersectionObserver(([entry]) => {
      const visible = entry?.isIntersecting ?? true;
      if (visible && !this.running) {
        this.running = true;
        this.prev = performance.now();
        requestAnimationFrame(this.frame);
      } else if (!visible) {
        this.running = false;
      }
    }).observe(this.el.canvas);
    requestAnimationFrame(this.frame);
  }

  /** Selecciona una prenda (la pone de frente). Público para enlazarlo con otros controles. */
  select(i: number) {
    this.selected = Math.max(0, Math.min(this.items.length - 1, i));
    this.el.prev.disabled = this.selected === 0;
    this.el.next.disabled = this.selected === this.items.length - 1;
    this.el.counter.textContent = `${pad(this.selected + 1)} / ${pad(this.items.length)}`;
  }

  /** Previsualiza una prenda sin cambiar la selección (null = soltar). */
  preview(i: number | null) {
    this.hovered = i === null ? null : this.items[i] ?? null;
  }

  openDetail(i: number, from: HTMLElement | null = null) {
    const d = this.items[i]?.data;
    if (!d) return;
    this.el.name.textContent = d.name;
    this.el.brand.textContent = d.brand;
    this.el.material.textContent = d.material;
    this.el.text.textContent = d.description;
    this.el.detail.hidden = false;
    this.returnFocus = from ?? (document.activeElement as HTMLElement | null);
    this.el.close.focus();
  }

  private closeDetail() {
    if (this.el.detail.hidden) return;
    this.el.detail.hidden = true;
    this.returnFocus?.focus();
  }

  private mountItem(data: GarmentData, i: number, baseX: number): Item {
    const slot = new THREE.Group();
    const turner = new THREE.Group();
    const { hook, frame } = createHanger();
    const garment = buildGarment(data, i + 1);
    turner.add(frame, garment.body);
    slot.add(hook, turner);
    slot.position.x = baseX;
    this.stage.scene.add(slot);

    const item: Item = { data, slot, turner, baseX, turn: 0, turnV: 0, shift: 0, shiftV: 0 };
    for (const m of garment.hit) {
      this.byMesh.set(m, item);
      this.hitMeshes.push(m);
    }

    // Botón accesible (invisible) por prenda: Tab la selecciona, Enter abre el detalle
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = `${data.name}, ${data.brand}`;
    btn.addEventListener('focus', () => {
      this.focused = item;
      this.select(i);
    });
    btn.addEventListener('blur', () => this.focused === item && (this.focused = null));
    btn.addEventListener('click', () => this.openDetail(i, btn));
    this.el.list.append(btn);
    return item;
  }

  private pick(e: MouseEvent): Item | null {
    const r = this.el.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.stage.camera);
    const hit = this.raycaster.intersectObjects(this.hitMeshes, false)[0];
    return hit ? this.byMesh.get(hit.object) ?? null : null;
  }

  private bindEvents() {
    const { canvas, prev, next, close } = this.el;
    prev.addEventListener('click', () => this.select(this.selected - 1));
    next.addEventListener('click', () => this.select(this.selected + 1));
    close.addEventListener('click', () => this.closeDetail());

    addEventListener('keydown', (e) => {
      if (e.key === 'Escape') return this.closeDetail();
      if (!this.el.detail.hidden || e.altKey || e.metaKey || e.ctrlKey) return;
      if (e.key === 'ArrowLeft') this.select(this.selected - 1);
      else if (e.key === 'ArrowRight') this.select(this.selected + 1);
      else return;
      this.hovered = null; // la flecha manda sobre un hover que se haya quedado
      e.preventDefault();
    });

    canvas.addEventListener('pointermove', (e) => {
      const now = performance.now();
      const item = this.pick(e);
      if (item) {
        this.hovered = item;
        this.lastHitAt = now;
      } else if (now - this.lastHitAt > HOVER_GRACE) {
        this.hovered = null;
      }
      canvas.style.cursor = item ? 'pointer' : '';
    });
    canvas.addEventListener('pointerleave', () => (this.hovered = null));
    canvas.addEventListener('click', (e) => {
      const item = this.pick(e);
      if (!item) return;
      const i = this.items.indexOf(item);
      this.select(i);
      this.openDetail(i);
    });
  }

  private get active(): Item {
    return this.hovered ?? this.focused ?? this.items[this.selected]!;
  }

  /* ---------- Muelles de giro y apartado ---------- */
  private step(dt: number) {
    const activeIndex = this.items.indexOf(this.active);
    this.items.forEach((it, i) => {
      // Muelle del giro hacia su objetivo (de frente si está activa)
      const target = i === activeIndex ? 1 : 0;
      // Las vecinas se apartan a cada lado de la activa, menos cuanto más lejos
      const d = i - activeIndex;
      const shiftTarget = d === 0 ? 0 : (Math.sign(d) * this.push) / (1 + PUSH_FALLOFF * (Math.abs(d) - 1));
      if (this.reduceMotion) {
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

  private render() {
    for (const it of this.items) {
      it.slot.position.x = it.baseX + it.shift;
      it.turner.rotation.y = (1 - it.turn) * this.sideRad;
    }
    const active = this.active;
    const text = `${active.data.name} · ${active.data.brand}`;
    if (this.el.caption.textContent !== text) this.el.caption.textContent = text;
    const index = this.items.indexOf(active);
    if (index !== this.lastActive) {
      this.lastActive = index;
      this.opts.onChange?.(index);
    }
    this.stage.renderer.render(this.stage.scene, this.stage.camera);
  }

  private frame = (now: number) => {
    if (!this.running) return;
    this.accumulator += Math.min((now - this.prev) / 1000, 0.05);
    this.prev = now;
    while (this.accumulator >= STEP) {
      this.step(STEP);
      this.accumulator -= STEP;
    }
    this.render();
    requestAnimationFrame(this.frame);
  };
}
