import './style.css';
import { byId } from './garments';
import { looks } from './looks';
import { RackHero } from './rack/RackHero';

/* Shop the look: foto del modelo con puntos sobre cada prenda + burro con esas prendas.
   Los puntos y el burro comparten la prenda activa. */

const look = looks[0]!;
const garments = look.items.map((it) => byId(it.id));

document.querySelector('#look-title')!.textContent = look.title;
document.querySelector('#look-subtitle')!.textContent = look.subtitle;

const img = document.querySelector<HTMLImageElement>('#look-img')!;
document.querySelector<HTMLElement>('.look__frame')!.style.setProperty('--ratio', String(look.ratio));

// Encuadre: la capa (foto + puntos) se amplía y se desplaza para centrar el foco, sin salirse del marco
const { x: fx, y: fy, zoom } = look.focus;
const offset = (f: number) => Math.min(0, Math.max(1 - zoom, 0.5 - (f / 100) * zoom)) * 100;
const layer = document.querySelector<HTMLElement>('.look__layer')!;
Object.assign(layer.style, { width: `${zoom * 100}%`, height: `${zoom * 100}%`, left: `${offset(fx)}%`, top: `${offset(fy)}%` });

/* ---------- Detalle sobre la foto ---------- */
const detail = document.querySelector<HTMLElement>('#look-detail')!;
const field = (id: string) => document.querySelector<HTMLElement>(`#look-detail-${id}`)!;
let detailOpen = true;

function showDetail(i: number) {
  const g = garments[i];
  if (!g) return;
  field('brand').textContent = g.brand;
  field('name').textContent = g.name;
  field('material').textContent = g.material;
  field('text').textContent = g.description;
}
function openDetail(i: number) {
  showDetail(i);
  detailOpen = true;
  detail.hidden = false;
}
document.querySelector('#look-detail-close')!.addEventListener('click', () => {
  detailOpen = false;
  detail.hidden = true;
});
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && detailOpen) {
    detailOpen = false;
    detail.hidden = true;
  }
});
img.alt = look.alt;
// Si aún no existe la foto propia, se muestra la ilustración provisional
img.addEventListener('error', () => img.src !== location.origin + look.placeholder && (img.src = look.placeholder), { once: true });
img.src = look.image;

const spots = document.querySelector<HTMLElement>('#look-spots')!;
const buttons = look.items.map((it, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'look__spot';
  b.style.left = `${it.x}%`;
  b.style.top = `${it.y}%`;
  b.setAttribute('aria-label', `${garments[i]!.name}: ver en el burro`);
  b.addEventListener('pointerenter', () => rack.preview(i));
  b.addEventListener('pointerleave', () => rack.preview(null));
  b.addEventListener('focus', () => rack.select(i));
  b.addEventListener('click', () => {
    rack.select(i);
    openDetail(i);
  });
  spots.append(b);
  return b;
});

const rack = new RackHero(document.querySelector<HTMLElement>('#look-rack')!, garments, {
  mount: 'wall', // mismo perchero que la portada
  transparent: true,
  spacing: 0.16,
  push: 0.26,
  initial: 0,
  onChange: (i) => {
    buttons.forEach((b, j) => b.classList.toggle('is-active', i === j));
    // El detalle abierto sigue a la prenda activa del perchero
    if (detailOpen) showDetail(i);
  },
  onOpen: openDetail,
});
