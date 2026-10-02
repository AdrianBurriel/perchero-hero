import * as THREE from 'three';
import type { GarmentData } from '../garments';
import { createStage, createHanger, type Mount } from '../stage';
import { buildGarment } from '../garment/builders';
import { cardHTML, fillCard, bindCardCta } from '../ui/productCard';
import { packAndFly, type Launch } from '../ui/flyer';

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
const RESTOCK = 0.7;      // s que tarda una prenda devuelta en volver a colgarse (se desenrolla desde el gancho)

export interface RackOptions {
  mount?: Mount;     // 'wall' = raíl de pared, 'floor' = burro con ruedas
  transparent?: boolean; // sin fondo propio: se integra en el fondo de la página
  spacing?: number;  // separación entre perchas (m)
  push?: number;     // cuánto se apartan las vecinas de la activa (m)
  initial?: number;  // índice seleccionado al empezar (por defecto, el del medio)
  onChange?: (index: number) => void; // prenda activa (seleccionada o en hover)
  onOpen?: (index: number) => void;   // si se da, el detalle lo muestra la página y no el perchero
  onAddToCart?: (index: number) => void; // botón "Añadir a la cesta" de la ficha del perchero
  gone?: (index: number) => boolean;      // prendas que empiezan fuera del perchero (ya en la cesta)
  onStock?: (hanging: number, total: number) => void; // colgadas / perchas (al empezar y cada vez que cambia)
  onRefill?: () => void; // botón «Rellenar perchero» (aparece cuando no queda ninguna colgada)
}

interface Item {
  data: GarmentData;
  slot: THREE.Group;   // posición en el raíl (se aparta)
  turner: THREE.Group; // giro de lado a frente
  body: THREE.Group;   // la prenda (sin percha): es la que se pliega y viaja a la cesta
  btn: HTMLButtonElement;
  baseX: number;
  gone: boolean;   // fuera del perchero (en la cesta): queda la percha vacía
  restock: number; // 0..1 mientras vuelve a colgarse
  turn: number; // 0 = de lado, 1 = de frente
  turnV: number;
  shift: number; // desplazamiento por el raíl (m)
  shiftV: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

const TEMPLATE = `
  <canvas class="rack__stage" aria-hidden="true"></canvas>
  <div class="rack__list"></div>
  <p class="rack__caption" aria-hidden="true"><span class="rack__caption-name"></span><span class="rack__caption-brand"></span></p>
  <nav class="rack__nav" aria-label="Pasar prendas">
    <span class="rack__counter" aria-live="polite"></span>
    <button class="rack__arrow" data-dir="-1" type="button" aria-label="Prenda anterior">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6 8.5 12l6 6" /></svg>
    </button>
    <button class="rack__arrow rack__arrow--ring" data-dir="1" type="button" aria-label="Prenda siguiente">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6l6 6-6 6" /></svg>
    </button>
  </nav>
  <button class="rack__refill" type="button" hidden>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 0 1 13.7-5.6M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.6M4 20v-4.5h4.5" /></svg>
    Rellenar perchero
  </button>
  <aside class="detail" role="dialog" hidden></aside>`;

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
  private detailIndex = 0;
  private idle = false; // en pausa: ninguna prenda se pone de frente (p. ej. durante "Comprar el look")
  private readonly reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly sideRad = THREE.MathUtils.degToRad(SIDE_ANGLE);
  private readonly push: number;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly hitMeshes: THREE.Mesh[] = [];
  private readonly byMesh = new Map<THREE.Object3D, Item>();
  private readonly stage: ReturnType<typeof createStage>;
  private readonly el: {
    canvas: HTMLCanvasElement; list: HTMLElement; captionName: HTMLElement; captionBrand: HTMLElement; counter: HTMLElement;
    prev: HTMLButtonElement; next: HTMLButtonElement; detail: HTMLElement; close: HTMLButtonElement;
  };

  constructor(private readonly container: HTMLElement, garments: GarmentData[], private readonly opts: RackOptions = {}) {
    const spacing = opts.spacing ?? 0.12;
    this.push = opts.push ?? 0.28;
    this.selected = opts.initial ?? Math.floor(garments.length / 2);

    container.classList.add('rack');
    container.insertAdjacentHTML('beforeend', TEMPLATE);
    const q = <T extends Element>(s: string) => container.querySelector<T>(s)!;
    const nameId = `rack-detail-${++uid}`;
    const detail = q<HTMLElement>('.detail');
    detail.innerHTML = cardHTML(nameId);
    detail.setAttribute('aria-labelledby', nameId);
    bindCardCta(detail, () => {
      this.closeDetail(); // la prenda se va: su ficha se cierra
      this.opts.onAddToCart?.(this.detailIndex);
    });
    this.el = {
      canvas: q('.rack__stage'), list: q('.rack__list'), counter: q('.rack__counter'),
      captionName: q('.rack__caption-name'), captionBrand: q('.rack__caption-brand'),
      prev: q('[data-dir="-1"]'), next: q('[data-dir="1"]'), detail, close: q('.card__close'),
    };

    const railHalf = ((garments.length - 1) / 2) * spacing + this.push + RAIL_MARGIN;
    this.stage = createStage(this.el.canvas, { mount: opts.mount ?? 'wall', railHalf, transparent: opts.transparent });

    this.items = garments.map((data, i) => this.mountItem(data, i, (i - (garments.length - 1) / 2) * spacing));
    this.items.forEach((it, i) => opts.gone?.(i) && this.takeOff(it, false));
    this.notifyStock();
    this.bindEvents();
    container.querySelector('.rack__refill')!.addEventListener('click', () => opts.onRefill?.());
    this.select(this.selected);
    this.step(0, true); // arranca ya en su sitio: la seleccionada de frente, sin animación inicial

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
  select(i: number, dir = 0) {
    this.selected = this.nearest(Math.max(0, Math.min(this.items.length - 1, i)), dir);
    this.el.prev.disabled = this.nearestIn(this.selected - 1, -1) < 0;
    this.el.next.disabled = this.nearestIn(this.selected + 1, 1) < 0;
    this.el.counter.textContent = `${pad(this.selected + 1)} / ${pad(this.items.length)}`;
  }

  /** Primera prenda colgada desde `i` avanzando en `dir` (-1 si no hay). */
  private nearestIn(i: number, dir: number) {
    for (let j = i; j >= 0 && j < this.items.length; j += dir) if (!this.items[j]!.gone) return j;
    return -1;
  }

  /** Prenda colgada más cercana a `i`, preferentemente en `dir` (si no queda ninguna, `i`). */
  private nearest(i: number, dir: number) {
    if (!this.items[i]?.gone) return i;
    const order = dir < 0 ? [-1, 1] : [1, -1];
    for (const d of order) {
      const j = this.nearestIn(i + d, d);
      if (j >= 0) return j;
    }
    return i;
  }

  /** Previsualiza una prenda sin cambiar la selección (null = soltar). */
  preview(i: number | null) {
    this.hovered = i === null ? null : this.items[i] ?? null;
  }

  openDetail(i: number, from: HTMLElement | null = null) {
    const d = this.items[i]?.data;
    if (!d) return;
    if (this.opts.onOpen) return this.opts.onOpen(i);
    this.detailIndex = i;
    fillCard(this.el.detail, d, i, this.items.length);
    this.el.detail.hidden = false;
    this.returnFocus = from ?? (document.activeElement as HTMLElement | null);
    this.el.close.focus();
  }

  /**
   * La prenda sale del perchero (queda la percha vacía), se pliega, se empaqueta y vuela hasta `to`.
   * Devuelve false si ya no estaba colgada.
   */
  sendToCart(i: number, to: { x: number; y: number }, speed = 1, onHalfway?: () => void): Promise<boolean> {
    const out = this.detach(i);
    if (!out) {
      onHalfway?.();
      return Promise.resolve(false);
    }
    if (this.reduceMotion) {
      onHalfway?.();
      return Promise.resolve(true);
    }
    return packAndFly(out.body, out.launch, to, speed, onHalfway).then(() => true);
  }

  /**
   * Saca la prenda del perchero (queda la percha vacía) y devuelve la prenda con su posición
   * en pantalla, para que otra animación se haga cargo. null si ya no estaba colgada.
   */
  detach(i: number): { body: THREE.Group; launch: Launch } | null {
    const it = this.items[i];
    if (!it || it.gone) return null;
    const { camera } = this.stage;
    // Origen de la prenda (punto del raíl) en pantalla y px por metro a esa profundidad
    const origin = it.body.getWorldPosition(new THREE.Vector3());
    const ndc = origin.clone().project(camera);
    const r = this.el.canvas.getBoundingClientRect();
    const viewH = 2 * camera.position.distanceTo(origin) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const launch = {
      x: r.left + ((ndc.x + 1) / 2) * r.width,
      y: r.top + ((1 - ndc.y) / 2) * r.height,
      scale: r.height / viewH,
      rotY: it.turner.rotation.y,
    };
    this.takeOff(it);
    if (this.items[this.selected] === it) this.select(this.selected, 1);
    this.render(); // la prenda desaparece del perchero en el mismo fotograma en que aparece en la capa
    return { body: it.body, launch };
  }

  /** Pausa el giro y el apartado: las colgadas se quedan de lado mientras otra animación trabaja. */
  setIdle(idle: boolean) {
    this.idle = idle;
  }

  /** Caja del lienzo del perchero en pantalla. */
  get rect() {
    return this.el.canvas.getBoundingClientRect();
  }


  /** Vuelve a colgar una prenda que estaba fuera (p. ej. al quitarla de la cesta). */
  restore(i: number) {
    const it = this.items[i];
    if (!it?.gone) return;
    it.gone = false;
    it.btn.disabled = false;
    it.restock = this.reduceMotion ? 1 : 0;
    it.turner.add(it.body);
    this.select(this.selected);
    this.notifyStock();
  }

  private notifyStock() {
    const hanging = this.items.filter((it) => !it.gone).length;
    this.opts.onStock?.(hanging, this.items.length);
    // Perchero vacío: aparece «Rellenar perchero» donde va el nombre de la prenda
    const refill = this.container.querySelector<HTMLButtonElement>('.rack__refill')!;
    const empty = hanging === 0 && !!this.opts.onRefill;
    if (empty === !refill.hidden) return;
    refill.hidden = !empty;
    this.container.classList.toggle('is-empty', empty);
  }

  private takeOff(it: Item, notify = true) {
    it.gone = true;
    if (notify) queueMicrotask(() => this.notifyStock());
    it.btn.disabled = true;
    it.turner.remove(it.body);
    if (this.hovered === it) this.hovered = null;
    if (this.focused === it) this.focused = null;
  }

  private closeDetail() {
    if (this.el.detail.hidden) return;
    this.el.detail.hidden = true;
    this.returnFocus?.focus();
  }

  private mountItem(data: GarmentData, i: number, baseX: number): Item {
    const slot = new THREE.Group();
    const turner = new THREE.Group();
    const { hook, frame } = createHanger(data.type === 'trousers');
    const garment = buildGarment(data, i + 1);
    turner.add(frame, garment.body);
    slot.add(hook, turner);
    slot.position.x = baseX;
    this.stage.scene.add(slot);

    const btn = document.createElement('button');
    const item: Item = {
      data, slot, turner, body: garment.body, btn, baseX, gone: false, restock: 1,
      turn: 0, turnV: 0, shift: 0, shiftV: 0,
    };
    for (const m of garment.hit) {
      this.byMesh.set(m, item);
      this.hitMeshes.push(m);
    }

    // Botón accesible (invisible) por prenda: Tab la selecciona, Enter abre el detalle
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
    const hit = this.raycaster.intersectObjects(this.hitMeshes, false).find((h) => !this.byMesh.get(h.object)?.gone);
    return hit ? this.byMesh.get(hit.object) ?? null : null;
  }

  private bindEvents() {
    const { canvas, prev, next, close } = this.el;
    prev.addEventListener('click', () => this.select(this.selected - 1, -1));
    next.addEventListener('click', () => this.select(this.selected + 1, 1));
    close.addEventListener('click', () => this.closeDetail());

    addEventListener('keydown', (e) => {
      if (e.key === 'Escape') return this.closeDetail();
      if (!this.el.detail.hidden || e.altKey || e.metaKey || e.ctrlKey) return;
      if (e.key === 'ArrowLeft') this.select(this.selected - 1, -1);
      else if (e.key === 'ArrowRight') this.select(this.selected + 1, 1);
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

  /** Prenda que está de frente; ninguna si la seleccionada ya no está colgada. */
  private get active(): Item | null {
    if (this.idle) return null;
    const it = this.hovered ?? this.focused ?? this.items[this.selected]!;
    return it.gone ? null : it;
  }

  /* ---------- Muelles de giro y apartado ---------- */
  private step(dt: number, snap = false) {
    const active = this.active;
    const activeIndex = active ? this.items.indexOf(active) : -1;
    this.items.forEach((it, i) => {
      if (it.restock < 1) it.restock = Math.min(1, it.restock + dt / RESTOCK);
      // Muelle del giro hacia su objetivo (de frente si está activa)
      const target = i === activeIndex ? 1 : 0;
      // Las vecinas se apartan a cada lado de la activa, menos cuanto más lejos
      const d = i - activeIndex;
      const shiftTarget = activeIndex < 0 || d === 0 ? 0 : (Math.sign(d) * this.push) / (1 + PUSH_FALLOFF * (Math.abs(d) - 1));
      if (this.reduceMotion || snap) {
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
      // Al volver a colgarse, la prenda se desenrolla hacia abajo desde el gancho
      it.body.scale.y = 1 - (1 - it.restock) ** 3;
    }
    const active = this.active;
    const name = active?.data.name ?? '';
    if (this.el.captionName.textContent !== name) {
      this.el.captionName.textContent = name;
      this.el.captionBrand.textContent = active?.data.brand ?? '';
    }
    const index = active ? this.items.indexOf(active) : -1;
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
