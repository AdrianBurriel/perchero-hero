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
    rack.openDetail(i, b);
  });
  spots.append(b);
  return b;
});

const rack = new RackHero(document.querySelector<HTMLElement>('#look-rack')!, garments, {
  mount: 'floor',
  spacing: 0.16,
  push: 0.26,
  initial: 0,
  onChange: (i) => buttons.forEach((b, j) => b.classList.toggle('is-active', i === j)),
});
