# Perchero hero — prototipo de animación

## Objetivo
Recrear, como ejercicio técnico, la interacción de un hero de tienda de ciclismo:
un perchero con **11 prendas colgadas** que reaccionan al puntero (balanceo físico)
y abren un detalle al hacer clic. Texto de referencia del original:
"11 maillots en percha · Pasa por encima de un maillot · haz clic para ver el detalle".

> No se ha inspeccionado el código real del original, solo su texto. Antes de afinar,
> abre la web de referencia en el navegador, observa el comportamiento (hover, inercia,
> si se arrastran vecinas, qué pasa al hacer clic) y apunta las diferencias en `NOTAS.md`.
> No copies imágenes ni código del sitio original: usa assets propios o placeholders.

## Stack
- Vite + TypeScript, sin framework (el hero debe poder portarse a un tema Shopify).
- Render 3D con **three.js (WebGL)**: luz física, sombras sobre la pared, entorno `RoomEnvironment`.
- Física propia (sin librerías). GSAP solo para transiciones de UI (panel de detalle), no para el balanceo.
- Prendas y tejidos **procedurales** (sin assets externos), inventados: camisetas, camisas, jersey,
  sudadera, cazadoras (denim, cuero, plumífero), sobrecamisa de pana, lino.

## Estructura
- `src/main.ts`: parámetros, física, entrada (raycast), bucle y detalle.
- `src/stage.ts`: renderer, cámara, luces, pared, raíl y percha (gancho giratorio + barra de madera).
- `src/garment/pillow.ts`: malla "acolchada" a partir de una silueta 2D (dos caras cosidas en el canto).
- `src/garment/builders.ts`: patrones y montaje de cada tipo de prenda (mangas, cuellos, botones…).
- `src/garment/fabrics.ts`: texturas procedurales (color + normal map) por tipo de tejido.
- `src/garments.ts`: catálogo ficticio (nombre, marca, material, tejido, colores).

## Movimiento (`src/main.ts`)
- Sin balanceo (como la referencia): las prendas están quietas y de lado (`SIDE_ANGLE`).
- La prenda activa (hover por raycast o foco con Tab) gira de frente y las vecinas se apartan
  (`PUSH`, `PUSH_FALLOFF`), con muelles críticamente amortiguados (`TURN_STIFF`, `TURN_DAMP`).
- Paso fijo de 1/120 s con acumulador. Parámetros al inicio de `main.ts`.
- El péndulo con viento y retraso de tela existió en commits anteriores (ver historial de git).

## Tareas sugeridas (en orden)
1. `npm install && npm run dev`; comprobar que el balanceo se siente natural. Afinar constantes.
2. Mejorar el realismo: la tela debe retrasarse respecto a la percha (segundo péndulo o muelle secundario para el cuerpo del maillot, o `skew` leve según velocidad).
3. Sombra dinámica sobre la pared que siga el ángulo.
4. Panel de detalle animado (GSAP): entrada/salida, foco accesible, cierre con Esc.
5. Soporte táctil: impulso por swipe con `pointermove`; probar en móvil.
6. Más realismo en las prendas: pliegues, costuras visibles, ambient occlusion, o modelos GLB propios.
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
