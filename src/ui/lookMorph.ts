/* Shop the look en móvil: la foto del look, a ancho completo bajo el título, se convierte con el
   scroll en la miniatura de la ficha del perchero. Una copia fija de la foto interpola posición y
   tamaño entre su hueco en la página (arriba del todo) y la miniatura (al final del scroll, con el
   perchero ocupando la pantalla). Al subir vuelve a su sitio; tocarla lleva al otro extremo.
   Solo cuando el perchero está en carrusel; si no, no hace nada. */

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function mountLookMorph(opts: {
  slot: HTMLElement;              // hueco de la foto grande en la página
  rack: HTMLElement;              // contenedor del perchero (para saber si está en carrusel)
  thumb: () => HTMLElement | null; // miniatura de la ficha (destino)
  src: string;
  alt: string;
}) {
  const img = document.createElement('img');
  img.className = 'look__morph';
  img.src = opts.src;
  img.alt = opts.alt;
  document.body.append(img);

  let progress = 0;
  let queued = false;

  const update = () => {
    queued = false;
    const thumb = opts.thumb();
    const on = opts.rack.classList.contains('is-carousel') && !!thumb;
    img.classList.toggle('is-on', on);
    document.body.classList.toggle('has-look-morph', on);
    if (!on || !thumb) return;
    const max = document.documentElement.scrollHeight - innerHeight;
    progress = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 1;
    const t = ease(progress);
    const a = opts.slot.getBoundingClientRect();
    const b = thumb.getBoundingClientRect();
    const w = lerp(a.width, b.width, t);
    const h = lerp(a.height, b.height, t);
    img.style.width = `${w}px`;
    img.style.height = `${h}px`;
    img.style.transform = `translate(${lerp(a.left, b.left, t)}px, ${lerp(a.top, b.top, t)}px)`;
    // Al acercarse a la miniatura toma su sombra
    img.style.boxShadow = `0 6px 16px -8px rgba(0, 0, 0, ${(0.45 * t).toFixed(3)})`;
  };
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };

  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue);
  new ResizeObserver(queue).observe(opts.rack);
  new ResizeObserver(queue).observe(opts.slot);
  // La clase de carrusel la pone el perchero al medirse: se vigila para activar/desactivar
  new MutationObserver(queue).observe(opts.rack, { attributes: true, attributeFilter: ['class'] });

  // Tocarla lleva al otro extremo: desde la miniatura vuelve arriba (foto grande) y viceversa
  img.addEventListener('click', () => {
    const top = progress > 0.5 ? 0 : document.documentElement.scrollHeight - innerHeight;
    scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
  queue();
}
