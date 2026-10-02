import './style.css';
const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
import { byId } from './garments';
import { looks } from './looks';
import { RackHero } from './rack/RackHero';
import { cardHTML, fillCard, bindCardCta, formatPrice } from './ui/productCard';
import { mountCart, cartTarget, addToCart } from './ui/cart';

/* Shop the look: foto del modelo con puntos sobre cada prenda + perchero con esas prendas.
   Puntos, perchero y detalle comparten la prenda activa. */

mountCart($('#cart-slot'));

const look = looks[0]!;
const garments = look.items.map((it) => byId(it.id));

$('#look-eyebrow').textContent = `Shop the look · 01`;
$('#look-title').textContent = look.title;
$('#look-subtitle').textContent = look.subtitle;
$('#look-count').textContent = `${garments.length} prendas`;
$('#look-total').textContent = formatPrice(garments.reduce((s, g) => s + g.price, 0));
// Comprar el look: las prendas vuelan una tras otra a la cesta
$('#buy-look').addEventListener('click', () => {
  garments.forEach((g, i) => setTimeout(() => rack.flyTo(i, cartTarget()).then(() => addToCart(g)), i * 160));
});

/* ---------- Foto ---------- */
const img = $<HTMLImageElement>('#look-img');
$('.look__frame').style.setProperty('--ratio', String(look.ratio));
img.alt = look.alt;
// Si aún no existe la foto propia, se muestra la ilustración provisional
img.addEventListener('error', () => img.src !== location.origin + look.placeholder && (img.src = look.placeholder), { once: true });
img.src = look.image;

// Encuadre: la capa (foto + puntos) se amplía y se desplaza para centrar el foco, sin salirse del marco
const { x: fx, y: fy, zoom } = look.focus;
const offset = (f: number) => Math.min(0, Math.max(1 - zoom, 0.5 - (f / 100) * zoom)) * 100;
Object.assign($('.look__layer').style, { width: `${zoom * 100}%`, height: `${zoom * 100}%`, left: `${offset(fx)}%`, top: `${offset(fy)}%` });

/* ---------- Detalle sobre la foto ---------- */
const detail = $('#look-detail');
detail.innerHTML = cardHTML('look-detail-name');
bindCardCta(detail, () => rack.flyTo(current, cartTarget()).then(() => addToCart(garments[current]!)));
let detailOpen = true;
let current = 0;

const showDetail = (i: number) => {
  const g = garments[i];
  if (!g) return;
  current = i;
  fillCard(detail, g, i, garments.length);
};
const setOpen = (open: boolean) => {
  detailOpen = open;
  detail.hidden = !open;
  if (open) showDetail(current);
};
detail.querySelector('.card__close')!.addEventListener('click', () => setOpen(false));
addEventListener('keydown', (e) => e.key === 'Escape' && setOpen(false));

/* ---------- Puntos ---------- */
const spots = $('#look-spots');
const buttons = look.items.map((it, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'look__spot';
  b.style.left = `${it.x}%`;
  b.style.top = `${it.y}%`;
  b.setAttribute('aria-label', `${garments[i]!.name}: ver en el perchero`);
  // Etiqueta al pasar por encima (lado según dónde cae el punto, para no salirse de la foto)
  const label = document.createElement('span');
  label.className = `look__spot-label${it.x > 50 ? ' is-left' : ''}`;
  label.textContent = garments[i]!.name;
  label.setAttribute('aria-hidden', 'true');
  b.append(label);
  b.addEventListener('pointerenter', () => rack.preview(i));
  b.addEventListener('pointerleave', () => rack.preview(null));
  b.addEventListener('focus', () => rack.select(i));
  b.addEventListener('click', () => {
    rack.select(i);
    current = i;
    setOpen(true);
  });
  spots.append(b);
  return b;
});

const rack = new RackHero($('#look-rack'), garments, {
  mount: 'wall', // mismo perchero que la portada
  transparent: true,
  spacing: 0.16,
  push: 0.26,
  initial: 0,
  onChange: (i) => {
    buttons.forEach((b, j) => b.classList.toggle('is-active', i === j));
    current = i;
    // El detalle abierto sigue a la prenda activa del perchero
    if (detailOpen) showDetail(i);
  },
  onOpen: (i) => {
    current = i;
    setOpen(true);
  },
});
