import * as THREE from 'three';
import type { GarmentData } from '../garments';
import { createStage, createHanger, type Mount } from '../stage';
import { buildGarment } from '../garment/builders';
import { bindCardCta, formatPrice } from '../ui/productCard';
import { bagAndFly, packAndFly, type Launch } from '../ui/flyer';
import { swapText, rollNumber } from '../ui/textSwap';

/* Perchero interactivo reutilizable: crea su propio DOM (lienzo, flechas, ficha) dentro del
   contenedor, sin dependencias globales. Lo usan la portada y Shop the look.
   Sin `onOpen`, la ficha resumida de la prenda seleccionada está siempre a la vista bajo el
   perchero y pasar por encima de una prenda la selecciona. Con `onOpen`, el detalle lo pone la página. */

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

// Carrusel (opción `carousel`, en lienzos estrechos): raíl de lado a lado, se ven unas 3–4 prendas
// con una cortada y se arrastra para pasarlas. La activa queda a `anchor` del borde izquierdo (0,5 = centrada).
const CAROUSEL_MAX_W = 700; // px de ancho del lienzo por debajo de los cuales se activa
// top: aire sobre el raíl (m); depth: alto bajo el raíl que debe verse entero (prendas y algo de sombra)
const CAROUSEL = { spacing: 0.2, push: 0.2, side: 62, view: 1.25, anchor: 0.5, top: 0.06, depth: 0.88 };
const TRACK_STIFF = 70;   // muelle del desplazamiento por el raíl al soltar o cambiar de prenda
const TRACK_DAMP = 16.7;  // 2·√TRACK_STIFF: llega sin rebote
const DRAG_SLOP = 6;      // px antes de considerar que es un arrastre y no un toque
const FLICK = 0.12;       // s de inercia al soltar: un gesto rápido avanza varias prendas
const EDGE_RESIST = 0.35; // más allá de la primera o la última, el arrastre cuesta más

export interface RackOptions {
  mount?: Mount;     // 'wall' = raíl de pared, 'floor' = burro con ruedas
  transparent?: boolean; // sin fondo propio: se integra en el fondo de la página
  spacing?: number;  // separación entre perchas (m)
  push?: number;     // cuánto se apartan las vecinas de la activa (m)
  initial?: number;  // índice seleccionado al empezar (por defecto, el del medio)
  onChange?: (index: number) => void; // prenda activa (seleccionada o en hover)
  onOpen?: (index: number) => void;   // si se da, el detalle lo muestra la página (sin ficha fija)
  onAddToCart?: (index: number) => void; // botón "Añadir a la cesta" de la ficha fija
  gone?: (index: number) => boolean;      // prendas que empiezan fuera del perchero (ya en la cesta)
  onStock?: (hanging: number, total: number) => void; // colgadas / perchas (al empezar y cada vez que cambia)
  onRefill?: () => void; // botón «Rellenar perchero» (aparece cuando no queda ninguna colgada)
  carousel?: boolean;    // en pantallas estrechas, carrusel de lado a lado con arrastre
  // Ficha fija bajo el perchero: 'always' (por defecto sin onOpen) o solo en carrusel ('carousel',
  // p. ej. Shop the look en móvil, donde sustituye al detalle de la página)
  info?: 'always' | 'carousel';
  thumb?: { src: string; alt: string }; // miniatura a la izquierda de la ficha (la foto del look)
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
    <button class="rack__arrow" data-dir="1" type="button" aria-label="Prenda siguiente">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6l6 6-6 6" /></svg>
    </button>
  </nav>
  <button class="rack__refill" type="button" hidden>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 0 1 13.7-5.6M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.6M4 20v-4.5h4.5" /></svg>
    Rellenar perchero
  </button>
`;

// Ficha fija (resumen) de la prenda seleccionada
const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>';
const INFO = `
  <div class="rack__info">
    <div class="rack__info-text">
      <p class="rack__info-brand"></p>
      <p class="rack__info-name"></p>
    </div>
    <p class="rack__info-price"></p>
    <div class="rack__info-actions">
      <button class="btn btn--dark card__add" type="button">Añadir a la cesta</button>
      <button class="btn card__cta" type="button">Ver producto ${ARROW}</button>
    </div>
  </div>`;

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
  private lastInfo = -1;
  private lastCaption = -1;
  private readonly reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private sideRad = THREE.MathUtils.degToRad(SIDE_ANGLE);
  private push: number;
  private readonly basePush: number;
  private readonly spacing: number;
  private carousel = false;
  private track = 0;  // desplazamiento de todas las prendas por el raíl (m), solo en carrusel
  private trackV = 0;
  private drag: { id: number; x: number; track: number; moved: boolean; lastX: number; lastT: number; v: number } | null = null;
  private suppressClick = false;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly hitMeshes: THREE.Mesh[] = [];
  private readonly byMesh = new Map<THREE.Object3D, Item>();
  private readonly stage: ReturnType<typeof createStage>;
  private readonly el: {
    canvas: HTMLCanvasElement; list: HTMLElement; captionName: HTMLElement; captionBrand: HTMLElement; counter: HTMLElement;
    prev: HTMLButtonElement; next: HTMLButtonElement; info: HTMLElement | null;
  };

  constructor(private readonly container: HTMLElement, garments: GarmentData[], private readonly opts: RackOptions = {}) {
    const spacing = (this.spacing = opts.spacing ?? 0.12);
    this.push = this.basePush = opts.push ?? 0.28;
    this.selected = opts.initial ?? Math.floor(garments.length / 2);

    container.classList.add('rack');
    container.insertAdjacentHTML('beforeend', TEMPLATE);
    const q = <T extends Element>(s: string) => container.querySelector<T>(s)!;
    let info: HTMLElement | null = null;
    const infoMode = opts.info ?? (opts.onOpen ? null : 'always');
    if (infoMode) {
      container.insertAdjacentHTML('beforeend', INFO);
      container.classList.add(infoMode === 'always' ? 'has-info' : 'has-info-carousel');
      info = q<HTMLElement>('.rack__info');
      if (opts.thumb) {
        const img = document.createElement('img');
        img.className = 'rack__info-thumb';
        img.src = opts.thumb.src;
        img.alt = opts.thumb.alt;
        info.prepend(img);
        info.classList.add('has-thumb');
      }
      bindCardCta(info, () => this.opts.onAddToCart?.(this.selected));
    }
    this.el = {
      canvas: q('.rack__stage'), list: q('.rack__list'), counter: q('.rack__counter'),
      captionName: q('.rack__caption-name'), captionBrand: q('.rack__caption-brand'),
      prev: q('[data-dir="-1"]'), next: q('[data-dir="1"]'), info,
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
      this.setCarousel(!!opts.carousel && entry.contentRect.width < CAROUSEL_MAX_W);
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

  /** Cambia entre perchero entero y carrusel (raíl de lado a lado, más separación, arrastre). */
  private setCarousel(on: boolean) {
    if (on === this.carousel) return;
    this.carousel = on;
    const spacing = on ? CAROUSEL.spacing : this.spacing;
    const n = this.items.length;
    this.items.forEach((it, i) => (it.baseX = (i - (n - 1) / 2) * spacing));
    this.push = on ? CAROUSEL.push : this.basePush;
    this.sideRad = THREE.MathUtils.degToRad(on ? CAROUSEL.side : SIDE_ANGLE);
    // La cámara se corre a la derecha: la activa queda a `anchor` del borde izquierdo
    this.stage.setCarousel(on ? { view: CAROUSEL.view, anchor: CAROUSEL.anchor, top: CAROUSEL.top, depth: CAROUSEL.depth } : null);
    this.hovered = null;
    this.drag = null;
    if (on) this.select(0, 1); // el carrusel empieza por la primera prenda colgada
    this.track = on ? -this.items[this.selected]!.baseX : 0;
    this.trackV = 0;
    this.el.canvas.style.cursor = on ? 'grab' : '';
    this.container.classList.toggle('is-carousel', on);
    this.step(0, true);
  }

  /** ¿Se ve la ficha fija? (siempre, o en carrusel si es de tipo 'carousel'): entonces manda sobre `onOpen`. */
  private get infoVisible() {
    return !!this.el.info && (this.container.classList.contains('has-info') || this.carousel);
  }

  /** Prenda (índice) cuyo sitio en el raíl queda más cerca de `x`. */
  private closest(x: number) {
    let best = 0;
    this.items.forEach((it, i) => Math.abs(it.baseX - x) < Math.abs(this.items[best]!.baseX - x) && (best = i));
    return best;
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

  /** Enter sobre una prenda: el detalle de la página o, con ficha fija, su botón de añadir. */
  openDetail(i: number) {
    if (!this.items[i]) return;
    if (this.opts.onOpen && !this.infoVisible) return this.opts.onOpen(i);
    this.select(i);
    this.el.info?.querySelector<HTMLElement>('.card__add')!.focus();
  }


  /**
   * La prenda sale del perchero (queda la percha vacía), se pliega, se empaqueta y vuela hasta `to`.
   * Devuelve false si ya no estaba colgada.
   */
  sendToCart(i: number, to: { x: number; y: number }): Promise<boolean> {
    const out = this.detach(i);
    if (!out) return Promise.resolve(false);
    if (this.reduceMotion) return Promise.resolve(true);
    return packAndFly(out.body, out.launch, to).then(() => true);
  }

  /**
   * Varias prendas a la vez: se pliegan, caen en una bolsa que aparece bajo el perchero y la
   * bolsa vuela hasta `to`. Devuelve las que estaban colgadas (las que llegan a la cesta).
   */
  bagToCart(is: number[], to: { x: number; y: number }): Promise<number[]> {
    const out = is.flatMap((i) => {
      const d = this.detach(i);
      return d ? [{ i, ...d }] : [];
    });
    const sent = out.map((o) => o.i);
    if (!out.length || this.reduceMotion) return Promise.resolve(sent);
    const r = this.rect;
    return bagAndFly(out, { x: r.left + r.width / 2, y: r.bottom }, to).then(() => sent);
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
    // Perchero vacío: sin nombre de prenda; en su sitio, «Rellenar perchero» (si hay onRefill)
    const empty = hanging === 0;
    this.container.querySelector<HTMLButtonElement>('.rack__refill')!.hidden = !(empty && this.opts.onRefill);
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
    btn.addEventListener('click', () => this.openDetail(i));
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
    const { canvas, prev, next } = this.el;
    prev.addEventListener('click', () => this.select(this.selected - 1, -1));
    next.addEventListener('click', () => this.select(this.selected + 1, 1));

    addEventListener('keydown', (e) => {
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      if (e.key === 'ArrowLeft') this.select(this.selected - 1, -1);
      else if (e.key === 'ArrowRight') this.select(this.selected + 1, 1);
      else return;
      this.hovered = null; // la flecha manda sobre un hover que se haya quedado
      e.preventDefault();
    });

    // Carrusel: arrastrar desplaza las prendas por el raíl; al soltar encaja en la más cercana
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.carousel || e.button !== 0) return;
      this.drag = { id: e.pointerId, x: e.clientX, track: this.track, moved: false, lastX: e.clientX, lastT: e.timeStamp, v: 0 };
    });
    const release = (e: PointerEvent) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      this.drag = null;
      canvas.style.cursor = 'grab';
      if (!d.moved) return; // un toque: lo trata el clic
      this.suppressClick = true;
      setTimeout(() => (this.suppressClick = false), 60);
      // Con inercia: un gesto rápido sigue unas prendas más allá
      const i = this.closest(-(this.track + d.v * FLICK));
      this.select(i, d.v < 0 ? 1 : -1);
      this.trackV = d.v; // el muelle arranca con la velocidad del dedo
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    canvas.addEventListener('pointermove', (e) => {
      if (this.carousel) {
        const d = this.drag;
        if (!d || e.pointerId !== d.id) return;
        const dx = e.clientX - d.x;
        if (!d.moved && Math.abs(dx) > DRAG_SLOP) {
          d.moved = true;
          canvas.setPointerCapture(e.pointerId);
          canvas.style.cursor = 'grabbing';
        }
        if (!d.moved) return;
        const ppm = this.stage.pxPerMeter();
        let t = d.track + dx / ppm;
        const min = -this.items.at(-1)!.baseX;
        const max = -this.items[0]!.baseX;
        if (t > max) t = max + (t - max) * EDGE_RESIST;
        else if (t < min) t = min + (t - min) * EDGE_RESIST;
        const dt = (e.timeStamp - d.lastT) / 1000;
        if (dt > 0) d.v = 0.8 * ((e.clientX - d.lastX) / ppm / dt) + 0.2 * d.v;
        d.lastX = e.clientX;
        d.lastT = e.timeStamp;
        this.track = t;
        // La que pasa por su sitio se pone de frente: el carrusel va mostrando cada prenda
        const i = this.closest(-t);
        if (i !== this.selected && !this.items[i]!.gone) this.select(i);
        return;
      }
      const now = performance.now();
      const item = this.pick(e);
      if (item) {
        this.hovered = item;
        this.lastHitAt = now;
        // Con ficha fija, pasar por encima selecciona: al salir hacia la ficha se queda esa prenda
        const i = this.items.indexOf(item);
        if (this.el.info && !this.opts.onOpen && i !== this.selected) this.select(i);
      } else if (now - this.lastHitAt > HOVER_GRACE) {
        this.hovered = null;
      }
      canvas.style.cursor = item ? 'pointer' : '';
    });
    canvas.addEventListener('pointerleave', () => (this.hovered = null));
    canvas.addEventListener('click', (e) => {
      if (this.suppressClick) return; // venía de un arrastre
      const item = this.pick(e);
      if (!item) return;
      const i = this.items.indexOf(item);
      this.select(i);
      if (this.opts.onOpen && !this.infoVisible) this.opts.onOpen(i);
    });
  }

  /** Prenda que está de frente; ninguna si la seleccionada ya no está colgada. */
  private get active(): Item | null {
    const it = this.hovered ?? this.focused ?? this.items[this.selected]!;
    return it.gone ? null : it;
  }

  /* ---------- Muelles de giro y apartado ---------- */
  private step(dt: number, snap = false) {
    // Carrusel: el raíl lleva la seleccionada a su sitio (salvo mientras se arrastra)
    if (this.carousel && !this.drag?.moved) {
      const target = -this.items[this.selected]!.baseX;
      if (this.reduceMotion || snap) {
        this.track = target;
        this.trackV = 0;
      } else {
        this.trackV += (TRACK_STIFF * (target - this.track) - TRACK_DAMP * this.trackV) * dt;
        this.track += this.trackV * dt;
      }
    }
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
      it.slot.position.x = it.baseX + it.shift + this.track;
      it.turner.rotation.y = (1 - it.turn) * this.sideRad;
      // Al volver a colgarse, la prenda se desenrolla hacia abajo desde el gancho
      it.body.scale.y = 1 - (1 - it.restock) ** 3;
    }
    const active = this.active;
    const index = active ? this.items.indexOf(active) : -1;
    this.fillCaption(index);
    this.fillInfo();
    if (index !== this.lastActive) {
      this.lastActive = index;
      this.opts.onChange?.(index);
    }
    this.stage.renderer.render(this.stage.scene, this.stage.camera);
  }

  /** Nombre de la prenda activa bajo el perchero (sin ficha fija): misma persiana que la ficha. */
  private fillCaption(index: number) {
    if (this.container.classList.contains('has-info') || index < 0 || index === this.lastCaption) return;
    const caption = this.el.captionName.parentElement!;
    caption.style.setProperty('--swap-dir', index < this.lastCaption ? '-1' : '1');
    this.lastCaption = index;
    const { name, brand } = this.items[index]!.data;
    swapText(this.el.captionName, name, { byChar: true });
    swapText(this.el.captionBrand, brand, { delay: 90 });
  }

  /** Ficha fija: datos de la seleccionada (se refresca solo al cambiar: persiana en el texto, odómetro en el precio). */
  private fillInfo() {
    const info = this.el.info;
    const it = this.items[this.selected];
    if (!info || !it || it.gone || this.lastInfo === this.selected) return;
    // Sentido del slide: hacia la derecha el texto nuevo entra por abajo; hacia la izquierda, por arriba
    info.style.setProperty('--swap-dir', this.selected < this.lastInfo ? '-1' : '1');
    this.lastInfo = this.selected;
    const q = (sel: string) => info.querySelector<HTMLElement>(sel)!;
    swapText(q('.rack__info-name'), it.data.name, { byChar: true });
    swapText(q('.rack__info-brand'), it.data.brand, { delay: 90 });
    rollNumber(q('.rack__info-price'), formatPrice(it.data.price));
    q('.card__cta').dataset.product = it.data.name;
    q('.card__add').setAttribute('aria-label', `Añadir a la cesta: ${it.data.name}`);
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
