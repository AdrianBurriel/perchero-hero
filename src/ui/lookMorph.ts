import type Lenis from 'lenis';
import Snap from 'lenis/snap';
import { scrollToY } from './smoothScroll';

/* Shop the look en móvil: la foto del look, a ancho completo bajo el título, se convierte con el
   scroll en la miniatura de la ficha del perchero. Una copia fija de la foto interpola posición y
   tamaño entre su hueco en la página (arriba del todo) y la miniatura (al final del scroll, con el
   perchero ocupando la pantalla). El progreso sigue al scroll con amortiguación (DAMP) y una curva
   suave, así el viaje no va pegado al dedo. Al subir vuelve a su sitio; tocarla lleva al otro
   extremo. Con Lenis, la página se asienta arriba o en el perchero (snap de proximidad).
   Solo cuando el perchero está en carrusel; si no, no hace nada. */

const DAMP = 0.16; // fracción por fotograma con la que el progreso mostrado alcanza al del scroll
const ease = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2; // seno: arranque y llegada suaves
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function mountLookMorph(opts: {
  slot: HTMLElement;              // hueco de la foto grande en la página
  rack: HTMLElement;              // contenedor del perchero (para saber si está en carrusel)
  thumb: () => HTMLElement | null; // miniatura de la ficha (destino)
  src: string;
  alt: string;
  lenis?: Lenis | null;
}) {
  const img = document.createElement('img');
  img.className = 'look__morph';
  img.src = opts.src;
  img.alt = opts.alt;
  document.body.append(img);

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const maxScroll = () => document.documentElement.scrollHeight - innerHeight;
  let target = 0; // progreso según el scroll (0 = arriba, 1 = perchero)
  let shown = 0;  // progreso mostrado (alcanza a `target` con amortiguación)
  let running = false;

  // Snap de Lenis: arriba del todo y al final (perchero a pantalla completa); se recalcula al cambiar el alto
  const snap = opts.lenis ? new Snap(opts.lenis, { type: 'proximity', duration: 0.9, debounce: 180 }) : null;
  let removeSnaps: (() => void)[] = [];
  const updateSnaps = (on: boolean) => {
    removeSnaps.forEach((r) => r());
    removeSnaps = on && snap ? [snap.add(0), snap.add(maxScroll())] : [];
  };

  const place = () => {
    const thumb = opts.thumb();
    if (!thumb) return;
    const t = ease(shown);
    const a = opts.slot.getBoundingClientRect();
    const b = thumb.getBoundingClientRect();
    img.style.width = `${lerp(a.width, b.width, t)}px`;
    img.style.height = `${lerp(a.height, b.height, t)}px`;
    img.style.transform = `translate3d(${lerp(a.left, b.left, t)}px, ${lerp(a.top, b.top, t)}px, 0)`;
    // Al acercarse a la miniatura toma su sombra
    img.style.boxShadow = `0 6px 16px -8px rgba(0, 0, 0, ${(0.45 * t).toFixed(3)})`;
  };

  // Bucle mientras el progreso mostrado no haya alcanzado al del scroll (se para solo)
  const tick = () => {
    shown = reduce ? target : shown + (target - shown) * DAMP;
    if (Math.abs(target - shown) < 0.0005) shown = target;
    place();
    if (shown !== target) requestAnimationFrame(tick);
    else running = false;
  };
  const wake = () => {
    if (running) return;
    running = true;
    requestAnimationFrame(tick);
  };

  let active = false;
  const update = () => {
    const on = opts.rack.classList.contains('is-carousel') && !!opts.thumb();
    img.classList.toggle('is-on', on);
    document.body.classList.toggle('has-look-morph', on);
    if (on !== active) {
      active = on;
      updateSnaps(on);
    }
    if (!on) return;
    const max = maxScroll();
    target = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 1;
    wake();
  };
  const relayout = () => {
    if (active) updateSnaps(true); // el final del scroll cambia con el alto de la página
    update();
    place();
  };

  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', relayout);
  new ResizeObserver(relayout).observe(opts.rack);
  new ResizeObserver(relayout).observe(opts.slot);
  // La clase de carrusel la pone el perchero al medirse: se vigila para activar/desactivar
  new MutationObserver(update).observe(opts.rack, { attributes: true, attributeFilter: ['class'] });

  // Tocarla lleva al otro extremo: desde la miniatura vuelve arriba (foto grande) y viceversa
  img.addEventListener('click', () => scrollToY(target > 0.5 ? 0 : maxScroll()));
  update();
}
