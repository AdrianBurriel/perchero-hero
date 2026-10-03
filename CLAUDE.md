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
  Crea su DOM (lienzo, flechas, contador y, sin `onOpen`, la ficha fija). Opciones: `mount` (`'wall'` | `'floor'` = burro), `transparent`,
  `spacing`, `push`, `initial`, `onChange`, `onOpen`, `onAddToCart`. Métodos públicos: `select(i)`, `preview(i|null)`, `openDetail(i)`.
  Portada (sin `onOpen`): bajo el perchero, siempre visible e integrada (sin caja, en el sitio del nombre), la ficha resumida de la prenda seleccionada
  (`.rack__info`: marca, nombre, precio, «Añadir a la cesta» y «Ver producto»), sin modal. Ahí pasar por encima
  de una prenda la selecciona (al bajar a la ficha se queda la última). En cada cambio (`src/ui/textSwap.ts`), el nombre
  hace una persiana enmascarada letra a letra (`swapText`: primero sale el anterior y luego entra el nuevo, sin montarse), la marca la misma en bloque y el precio rueda como un
  odómetro (`rollNumber`); hacia la izquierda el texto entra por arriba (`--swap-dir`). Los botones no se animan. El texto de ayuda va arriba, bajo el selector.
  Shop the look (`onOpen`) usa su propio detalle; allí el nombre bajo el perchero hace la misma persiana y la ficha
  de detalle (`fillCard`) se anima al cambiar de prenda: la tarjeta cambia como una baraja (`dealCard`: una copia sale
  girando hacia un lado y la tarjeta entra desde el otro) y dentro, persiana en nombre y marca, odómetro en contador y precio,
  fundido en material y descripción. Las flechas ‹ › son iguales (aro y relleno al pasar por encima).
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
  En Shop the look, «Comprar el look» usa `RackHero.bagToCart(indices, destino)` (`bagAndFly` en el flyer):
  aparece una bolsa de papel bajo el perchero, las prendas se pliegan y caen dentro escalonadas
  (asomando por la boca) y la bolsa vuela a la cesta (~2 s; guion en `B`). Todas se suman al aterrizar.
  Con el look entero en la cesta aparece el enlace «Devolver al perchero» bajo «Look en la cesta»
  y, bajo el perchero vacío, «Ver otros percheros» (lleva a la portada).
  En la portada, con el perchero vacío, aparece el botón «Rellenar perchero» (`onRefill`).
  Ambos devuelven las prendas a sus perchas una tras otra y las sacan de la cesta (`removeFromCart`). Opción `gone` para empezar sin
  las prendas que ya están en la cesta.
- `src/ui/switcher.ts`: selector Perchero | Shop the look en el centro de la barra superior. La pastilla
  se desliza a la opción elegida antes de navegar y en la página nueva sale desde la anterior
  (sessionStorage); en hover se estira hacia la opción inactiva. Cambiar de sección (selector o
  «Ver otros percheros», `leaveSection`) vacía la cesta (`clearCart`): cada página empieza con su perchero lleno.
- `src/ui/loader.ts`: pantalla de carga (marcado `#loader` en cada HTML, con fondo inline para el primer pintado).
  Fondo crema (`--wall`) con una percha 3D (`createHanger`) que aparece desde 0 con rebote, gira y se balancea,
  con muelles estilo Framer Motion (`Spring`) y sombra difusa en el suelo. `startLoader()` → `await loader.intro`
  (la percha queda quieta y la página monta su `RackHero`, que bloquea el hilo un instante) → `loader.finish()`:
  cuando hay `load`, fuentes y primer fotograma, la percha toma impulso y la capa sube (CSS `translateY(-100%)`),
  descubriendo la página de abajo arriba. Nunca dura menos de `MIN_MS` (2 s). Necesita `build.target: 'es2022'` (await en el nivel superior).
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
  (las perchas no se desplazan para centrarla). En Shop the look hover y foco previsualizan otra prenda;
  en la portada la seleccionan.
- La cámara encaja siempre el perchero entero (raíl y soportes, `RAIL_HALF`), salvo en carrusel.
- Carrusel (opción `carousel`, solo en la portada, lienzo de menos de `CAROUSEL_MAX_W` = 700 px): raíl de lado a lado
  sin brazos ni topes (`stage.setCarousel`), más separación y prendas menos de canto (`CAROUSEL`). Se ven unas 3–4
  prendas con una cortada; la activa queda a `anchor` del borde izquierdo. Arrastrar desliza las prendas por el raíl
  (`track`), la que pasa por su sitio gira de frente y al soltar encaja en la más cercana con inercia (`FLICK`);
  flechas y teclado también deslizan. Sin hover en este modo. Empieza por la primera prenda colgada; contador y
  flechas van encima de la ficha (`.rack.is-carousel`). En carrusel la portada no ocupa toda la pantalla: lienzo más
  bajo (`--stage-h`, va con el ancho) a `--stage-top` de la cabecera, sin pared ni fondo (solo sombras, fundidas abajo con una
  máscara) y con el raíl arriba (`CAROUSEL.top`); debajo, contador y flechas y la ficha, en flujo. El contador «9 / 11 prendas en percha» (oculto en la barra
  en móvil) va encima del perchero. El relleno de las
  flechas al pasar por encima es solo con ratón (`@media (hover: hover)`).
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

## Despliegue
- Vercel conectado al repo de GitHub (privado): cada push a `main` se publica en https://perchero-hero.vercel.app.
- Plan Hobby: Vercel solo despliega commits cuyo autor sea el dueño (AdrianBurriel). Por eso este repo
  firma con el correo noreply de GitHub de AdrianBurriel (`git config user.email` local, no global).
  Si un push sale «Deployment was blocked», revisa el autor del commit.

## Criterios de aceptación
- 60 fps con 11 prendas en un portátil medio y en móvil de gama media.
- `prefers-reduced-motion` desactiva viento e impulso.
- Navegable con teclado (Tab, Enter/Espacio abren detalle, Esc cierra).
- Sin saltos al redimensionar la ventana.

## Convenciones
- Comentarios en español, identificadores en inglés.
- Cambios pequeños y verificables: tras cada tarea, `npm run build` debe pasar.
