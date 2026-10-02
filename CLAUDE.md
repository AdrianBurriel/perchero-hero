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
  sudadera, cazadoras (denim, cuero, plumífero), sobrecamisa de pana, lino, americana, abrigo y pantalón
  (doblado sobre la barra inferior de la percha).

## Páginas
- `index.html` → `src/main.ts`: portada con perchero de pared y todo el catálogo.
- `shop-the-look.html` → `src/shop.ts`: foto del modelo con puntos por prenda + el mismo perchero de pared
  con las prendas del look, sin fondo propio (`transparent`: solo sombras sobre el fondo de la página).
  Puntos y perchero comparten la prenda activa (hover = previsualizar, clic = seleccionar).
  El detalle va en la parte baja de la foto, abierto desde el inicio, y sigue a la prenda activa
  (`RackHero` con `onOpen`: la página muestra el detalle en lugar del perchero).
  Encuadre de la foto con `focus` en `src/looks.ts` (punto centrado y zoom; foto y puntos se amplían juntos).
- Multipágina declarada en `vite.config.ts` (`build.rollupOptions.input`).

## Estructura
- `src/rack/RackHero.ts`: clase `RackHero(container, prendas, opciones)` reutilizable y sin globales.
  Crea su DOM (lienzo, flechas, contador, detalle). Opciones: `mount` (`'wall'` | `'floor'` = burro), `transparent`,
  `spacing`, `push`, `initial`, `onChange`. Métodos públicos: `select(i)`, `preview(i|null)`, `openDetail(i)`.
- `src/stage.ts`: renderer, cámara, luces, pared, raíl de pared o burro (postes, base, ruedas, suelo) y percha.
- `src/garment/pillow.ts`: malla "acolchada" a partir de una silueta 2D (dos caras cosidas en el canto).
- `src/garment/builders.ts`: patrones y montaje de cada tipo de prenda (mangas, cuellos, botones…).
- `src/garment/fabrics.ts`: texturas procedurales (color + normal map) por tipo de tejido.
- `src/ui/productCard.ts`: ficha de producto común (altura fija, precio, «Añadir a la cesta» y «Ver producto» simulado)
  y `toast()` para acciones simuladas (ver ficha, comprar el look).
- `src/ui/cart.ts`: cesta simulada (icono con contador en la barra superior + panel lateral), en
  localStorage para compartirla entre páginas. `mountCart(slot)`, `cartTarget()`, `addToCart(prenda)`.
- `src/ui/flyer.ts`: plegado y vuelo a la cesta en una capa WebGL transparente a pantalla completa
  (cámara ortográfica en px). La prenda real sale del perchero, pliega las mangas (piezas marcadas con
  `Kit.sleeve`) y la mitad inferior (deformación en el vertex shader) y vuela en arco. `RackHero.sendToCart(i, destino)` la lanza y deja la percha vacía;
  `RackHero.restore(i)` la vuelve a colgar (al quitarla de la cesta).
  En Shop the look, «Comprar el look» usa `pileAndFly`: las prendas salen del perchero de una
  en una (de la más ancha a la más estrecha), se pliegan deprisa mientras viajan, se apilan
  tumbadas en el centro (cada capa por delante de la anterior) y van a la cesta de arriba abajo.
  `RackHero.detach(i)` suelta una prenda cuando le toca y `setIdle(true)` deja quietas las demás;
  tiempos en `PILE`. Opción `gone` para empezar sin
  las prendas que ya están en la cesta.
- `src/ui/switcher.ts`: selector Perchero | Shop the look en el centro de la barra superior. La pastilla
  se desliza a la opción elegida antes de navegar y en la página nueva sale desde la anterior
  (sessionStorage); en hover se estira hacia la opción inactiva.
- `src/ui/stock.ts`: contador «9 / 11 prendas en percha» (colgadas / perchas) de la barra superior, alimentado por
  `RackHero` (`onStock`). Al cambiar, el número rueda y flota un «−1»/«+1».
- `src/style.css`: sistema visual común. Tipografías Instrument Serif (títulos) e Inter (texto) desde Google Fonts.
- `src/garments.ts`: catálogo ficticio con `id` y `price` (€) (`garments` = portada, `lookGarments` = prendas de los looks;
  `byId(id)` busca en ambos).
- `src/looks.ts`: looks (foto, texto y prendas con posición del punto en % sobre la foto).
- `public/looks/`: fotos de los looks (`look-01.jpg`, aportada por el usuario). Si falta, se ve el `*-placeholder.svg`.
  Las prendas 3D del look se recrean a mano a partir de la foto (colores, tejidos y detalles).

## Movimiento (`src/rack/RackHero.ts`)
- Sin balanceo (como la referencia): las prendas están quietas y de lado (`SIDE_ANGLE`).
- La prenda activa (hover por raycast o foco con Tab) gira de frente y las vecinas se apartan
  (`PUSH`, `PUSH_FALLOFF`), con muelles críticamente amortiguados (`TURN_STIFF`, `TURN_DAMP`).
- Slider: flechas ‹ › (y teclas ← →) cambian la prenda seleccionada, que gira de frente en su sitio
  (las perchas no se desplazan para centrarla). Hover y foco previsualizan otra prenda.
- La cámara encaja siempre el perchero entero (raíl y soportes, `RAIL_HALF`).
- Paso fijo de 1/120 s con acumulador. Parámetros al inicio de `src/rack/RackHero.ts`.
- El péndulo con viento y retraso de tela existió en commits anteriores (ver historial de git).

## Tareas sugeridas (en orden)
1. `npm install && npm run dev`; comprobar que el balanceo se siente natural. Afinar constantes.
2. Mejorar el realismo: la tela debe retrasarse respecto a la percha (segundo péndulo o muelle secundario para el cuerpo del maillot, o `skew` leve según velocidad).
3. Sombra dinámica sobre la pared que siga el ángulo.
4. Panel de detalle animado (GSAP): entrada/salida, foco accesible, cierre con Esc.
5. Soporte táctil: impulso por swipe con `pointermove`; probar en móvil.
6. Más realismo en las prendas: pliegues, costuras visibles, ambient occlusion, o modelos GLB propios.
7. Rendimiento: comprobar 60 fps; pausar el bucle fuera de viewport (IntersectionObserver).
8. Portar a Shopify: `RackHero` ya está encapsulada; falta montarla en una sección del tema.

## Criterios de aceptación
- 60 fps con 11 prendas en un portátil medio y en móvil de gama media.
- `prefers-reduced-motion` desactiva viento e impulso.
- Navegable con teclado (Tab, Enter/Espacio abren detalle, Esc cierra).
- Sin saltos al redimensionar la ventana.

## Convenciones
- Comentarios en español, identificadores en inglés.
- Cambios pequeños y verificables: tras cada tarea, `npm run build` debe pasar.
