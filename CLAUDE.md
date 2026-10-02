# Perchero hero — prototipo de animación

## Objetivo
Recrear, como ejercicio técnico, la interacción de un hero de tienda de ciclismo:
un perchero con **11 maillots colgados** que reaccionan al puntero (balanceo físico)
y abren un detalle al hacer clic. Texto de referencia del original:
"11 maillots en percha · Pasa por encima de un maillot · haz clic para ver el detalle".

> No se ha inspeccionado el código real del original, solo su texto. Antes de afinar,
> abre la web de referencia en el navegador, observa el comportamiento (hover, inercia,
> si se arrastran vecinas, qué pasa al hacer clic) y apunta las diferencias en `NOTAS.md`.
> No copies imágenes ni código del sitio original: usa assets propios o placeholders.

## Stack
- Vite + TypeScript, sin framework (el hero debe poder portarse a un tema Shopify).
- Física propia en ~60 líneas (sin librerías). GSAP solo para transiciones de UI (panel de detalle), no para el balanceo.

## Modelo físico (ya implementado en `src/main.ts`)
Cada percha es un péndulo amortiguado con pivote en el gancho:
`α = -G·sin(θ) - c·ω + k·(θ₋₁ + θ₊₁ - 2θ) + viento`
- Integración semi-implícita de Euler con paso fijo (1/120 s) y acumulador.
- El puntero transfiere impulso `ω += vx · GAIN` a la percha bajo el cursor.
- Parámetros al inicio de `main.ts`; afinar a ojo.

## Tareas sugeridas (en orden)
1. `npm install && npm run dev`; comprobar que el balanceo se siente natural. Afinar constantes.
2. Mejorar el realismo: la tela debe retrasarse respecto a la percha (segundo péndulo o muelle secundario para el cuerpo del maillot, o `skew` leve según velocidad).
3. Sombra dinámica sobre la pared que siga el ángulo.
4. Panel de detalle animado (GSAP): entrada/salida, foco accesible, cierre con Esc.
5. Soporte táctil: impulso por swipe con `pointermove`; probar en móvil.
6. Sustituir los SVG procedurales por PNG/WebP recortados con alfa (propios).
7. Rendimiento: comprobar 60 fps; pausar el bucle fuera de viewport (IntersectionObserver).
8. Portar a Shopify: encapsular en una clase `RackHero(container, items)` sin dependencias globales.

## Criterios de aceptación
- 60 fps con 11 prendas en un portátil medio y en móvil de gama media.
- `prefers-reduced-motion` desactiva viento e impulso.
- Navegable con teclado (Tab, Enter/Espacio abren detalle, Esc cierra).
- Sin saltos al redimensionar la ventana.

## Convenciones
- Comentarios en español, identificadores en inglés.
- Cambios pequeños y verificables: tras cada tarea, `npm run build` debe pasar.
