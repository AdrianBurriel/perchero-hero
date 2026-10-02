import './style.css';
import { jerseys, type Jersey } from './jerseys';

/* ---------- Parámetros de la simulación (afinar a ojo) ---------- */
const GRAVITY = 38;      // rigidez del péndulo: mayor = oscila más rápido
const DAMPING = 2.4;     // fricción angular: mayor = se para antes
const COUPLING = 0;      // cuánto arrastra una percha a sus vecinas
const GAIN = 0.0006;     // rad/s de impulso por cada px/s de puntero
const MAX_OMEGA = 1;     // límite de velocidad angular (rad/s) ≈ ±9° de balanceo máximo
const WIND = 0.12;       // brisa idle muy sutil (0 para desactivar)
const STEP = 1 / 120;    // paso fijo de integración

/* Segundo muelle: el cuerpo del maillot se retrasa respecto a la percha */
const LAG_STIFF = 90;    // rigidez de la tela: mayor = sigue antes a la percha
const LAG_DAMP = 7;      // amortiguación de la tela
const LAG_INERTIA = 0.6; // cuánto se opone la tela a la aceleración de la percha
const LAG_MAX = 0.12;    // deformación máxima (rad)

/* Giro de lado → de frente al pasar por encima */
const SIDE_ANGLE = 76;   // grados de rotateY en reposo (90 = totalmente de canto)
const TURN_STIFF = 28;   // rapidez del giro: menor = más lento (~1 s con 28)
const TURN_DAMP = 11.5;  // ≥ 2·√TURN_STIFF: llega sin rebote; menor deja un pequeño rebote
const SIDE_SHADE = 0.78; // brillo de las prendas de lado (1 = sin oscurecer)
const PUSH = 0.34;       // cuánto se apartan las vecinas (en anchos de prenda)
const PUSH_FALLOFF = 0.3; // las lejanas se apartan menos: el perchero se comprime

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- SVG procedural de percha + maillot ---------- */
function jerseySVG({ color, accent }: Jersey): string {
  return `
  <svg viewBox="0 0 200 300" aria-hidden="true" focusable="false">
    <path d="M100 40 V22 a9 9 0 1 0 -9 -9" fill="none" stroke="#8a8a85" stroke-width="3" stroke-linecap="round"/>
    <path d="M100 40 L32 76 M100 40 L168 76 M32 76 H168" fill="none" stroke="#8a8a85" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <g class="jersey__body">
      <path d="M62 70 L100 82 L138 70 L188 100 L172 142 L150 130 L150 272 Q100 284 50 272 L50 130 L28 142 L12 100 Z" fill="${color}"/>
      <path d="M62 70 L100 82 L138 70 L132 64 Q100 74 68 64 Z" fill="${accent}"/>
      <rect x="50" y="196" width="100" height="14" fill="${accent}" opacity=".85"/>
    </g>
  </svg>`;
}

/* ---------- Montaje del DOM ---------- */
interface Item {
  el: HTMLButtonElement;
  body: SVGGElement;
  angle: number;
  omega: number;
  lag: number;  // deformación de la tela relativa a la percha (rad)
  lagV: number;
  turn: number; // 0 = de lado, 1 = de frente
  turnV: number;
  shift: number; // desplazamiento por el raíl, en anchos de prenda
  shiftV: number;
  shade: number; // último brillo aplicado, para no repintar el filtro sin cambios
  data: Jersey;
}

const rail = document.querySelector<HTMLElement>('#rail')!;
const detail = document.querySelector<HTMLElement>('#detail')!;
const detailName = document.querySelector<HTMLElement>('#detail-name')!;
const detailBrand = document.querySelector<HTMLElement>('#detail-brand')!;

let hovered: Item | null = null;
let focused: Item | null = null;

const items: Item[] = jerseys.map((data) => {
  const el = document.createElement('button');
  el.className = 'jersey';
  el.type = 'button';
  el.setAttribute('aria-label', `${data.name}, ${data.brand}`);
  el.innerHTML = jerseySVG(data);
  el.addEventListener('click', () => openDetail(data));
  rail.append(el);
  const body = el.querySelector<SVGGElement>('.jersey__body')!;
  const item: Item = { el, body, angle: 0, omega: 0, lag: 0, lagV: 0, turn: 0, turnV: 0, shift: 0, shiftV: 0, shade: -1, data };
  // Ratón y teclado comparten estado: la prenda activa se pone de frente
  el.addEventListener('pointerenter', () => (hovered = item));
  el.addEventListener('focus', () => (focused = item));
  el.addEventListener('blur', () => focused === item && (focused = null));
  return item;
});

function openDetail(j: Jersey) {
  detailName.textContent = j.name;
  detailBrand.textContent = j.brand;
  detail.hidden = false;
}
document.querySelector('#detail-close')!.addEventListener('click', () => (detail.hidden = true));
addEventListener('keydown', (e) => e.key === 'Escape' && (detail.hidden = true));

/* ---------- Entrada: el puntero transfiere impulso a la percha que toca ---------- */
let lastX = 0;
let lastT = 0;
rail.addEventListener('pointermove', (e) => {
  const now = performance.now();
  const vx = lastT ? ((e.clientX - lastX) / Math.max(now - lastT, 1)) * 1000 : 0; // px/s
  lastX = e.clientX;
  lastT = now;

  const hit = (e.target as HTMLElement).closest<HTMLElement>('.jersey');
  const item = items.find((i) => i.el === hit);
  if (!item || reduceMotion) return;
  item.omega = Math.max(-MAX_OMEGA, Math.min(MAX_OMEGA, item.omega + vx * GAIN));
});
// Se suelta al salir del perchero, no de cada prenda: así no parpadea al cruzar los huecos
rail.addEventListener('pointerleave', () => {
  lastT = 0;
  hovered = null;
});

/* ---------- Física: péndulos amortiguados acoplados con vecinas ---------- */
function step(dt: number, t: number) {
  const active = hovered ?? focused;
  const activeIndex = active ? items.indexOf(active) : -1;
  const acc = items.map((it, i) => {
    const left = items[i - 1]?.angle ?? it.angle;
    const right = items[i + 1]?.angle ?? it.angle;
    const wind = reduceMotion ? 0 : WIND * Math.sin(t * 0.9 + i * 0.7);
    return (
      -GRAVITY * Math.sin(it.angle) -
      DAMPING * it.omega +
      COUPLING * (left + right - 2 * it.angle) +
      wind
    );
  });
  items.forEach((it, i) => {
    const a = acc[i] ?? 0;
    it.omega += a * dt; // Euler semi-implícito
    it.angle += it.omega * dt;

    // La tela reacciona por inercia a la aceleración de la percha y vuelve con su propio muelle
    const lagAcc = -LAG_STIFF * it.lag - LAG_DAMP * it.lagV - LAG_INERTIA * a;
    it.lagV += lagAcc * dt;
    it.lag = Math.max(-LAG_MAX, Math.min(LAG_MAX, it.lag + it.lagV * dt));

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

// El ancho se lee solo al redimensionar; el desplazamiento va en anchos de prenda para no saltar
let itemWidth = 0;
new ResizeObserver(() => (itemWidth = items[0]?.el.offsetWidth ?? 0)).observe(rail);

let prev = performance.now();
let accumulator = 0;
let clock = 0;

function frame(now: number) {
  accumulator += Math.min((now - prev) / 1000, 0.05);
  prev = now;
  while (accumulator >= STEP) {
    clock += STEP;
    step(STEP, clock);
    accumulator -= STEP;
  }
  for (const it of items) {
    const side = (1 - it.turn) * SIDE_ANGLE;
    const x = it.shift * itemWidth;
    it.el.style.transform = `translateX(${x}px) perspective(900px) rotate(${it.angle}rad) rotateY(${side}deg)`;
    // La que gira queda por encima de sus vecinas
    it.el.style.zIndex = String(1 + Math.round(Math.max(0, it.turn) * 10));
    const shade = Math.round((SIDE_SHADE + (1 - SIDE_SHADE) * Math.min(1, Math.max(0, it.turn))) * 100) / 100;
    if (shade !== it.shade) {
      it.shade = shade;
      it.el.style.setProperty('--shade', String(shade));
    }
    // skewX en vez de rotate: el bajo se desplaza más que los hombros y queda horizontal, como la tela
    it.body.style.transform = `skewX(${-it.lag}rad)`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
