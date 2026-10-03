import Lenis from 'lenis';

/* Scroll suave con Lenis en las dos páginas (también con el dedo: syncTouch). Respeta
   prefers-reduced-motion (Lenis sigue al dispositivo 1:1 y los saltos son instantáneos).
   El panel de la cesta conserva su scroll nativo. */

export let lenis: Lenis | null = null;

export function startSmoothScroll() {
  lenis = new Lenis({
    autoRaf: true,
    lerp: 0.085,        // suavizado de la rueda/trackpad (menor = más suave)
    syncTouch: true,    // también al deslizar con el dedo en móvil
    syncTouchLerp: 0.07,
    touchMultiplier: 1,
    prevent: (node) => !!node.closest?.('.drawer, [data-lenis-prevent]'),
  });
  return lenis;
}

/** Desplaza la página hasta `top` (px) con la animación de Lenis (o la nativa si no está). */
export function scrollToY(top: number) {
  if (lenis) lenis.scrollTo(top, { duration: 1.3, easing: (t) => 1 - (1 - t) ** 4 });
  else scrollTo({ top, behavior: 'smooth' });
}
