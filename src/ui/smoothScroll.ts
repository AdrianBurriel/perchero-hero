import Lenis from 'lenis';

/* Scroll suave con Lenis en las dos páginas (también con el dedo: syncTouch). Respeta
   prefers-reduced-motion (Lenis sigue al dispositivo 1:1 y los saltos son instantáneos).
   El panel de la cesta conserva su scroll nativo. */

export let lenis: Lenis | null = null;

export function startSmoothScroll() {
  lenis = new Lenis({
    autoRaf: true,
    lerp: 0.1,          // suavizado de la rueda/trackpad (menor = más suave, mayor = más directo)
    syncTouch: true,    // también al deslizar con el dedo en móvil
    syncTouchLerp: 0.1, // respuesta al dedo: más alto = menos esfuerzo, sigue al gesto más de cerca
    touchMultiplier: 1.15,
    prevent: (node) => !!node.closest?.('.drawer, [data-lenis-prevent]'),
  });
  return lenis;
}

/** Desplaza la página hasta `top` (px) con la animación de Lenis (o la nativa si no está). */
export function scrollToY(top: number, onComplete?: () => void) {
  if (lenis) lenis.scrollTo(top, { duration: 1.2, easing: (t) => 1 - (1 - t) ** 4, onComplete: () => onComplete?.() });
  else {
    scrollTo({ top, behavior: 'smooth' });
    onComplete?.();
  }
}
