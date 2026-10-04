# Perchero hero

Prototipo de un *hero* interactivo para tienda de moda: un **perchero 3D** con prendas colgadas
que reaccionan al puntero, se pueden recorrer como un slider y añadir a una cesta simulada.
Es un ejercicio técnico, pensado para poder portarse más adelante a un tema de Shopify.

**Demo:** https://perchero-hero.vercel.app

## Qué hace

### Portada — Perchero (`index.html`)
- Perchero de pared con **11 prendas** generadas por código (camisetas, camisas, jersey, sudadera,
  cazadoras de denim, cuero y plumífero, sobrecamisa de pana, lino, americana, abrigo y un pantalón
  doblado sobre la barra de la percha).
- Las prendas cuelgan de lado; la que está bajo el puntero (o con el foco del teclado) **gira de frente**
  y las vecinas se apartan, con muelles amortiguados.
- Flechas ‹ › y teclas ← → para cambiar de prenda. Bajo el perchero, una ficha resumida (marca, nombre,
  precio, «Añadir a la cesta» y «Ver producto») cuyo texto cambia con animaciones de persiana y odómetro.
- **Añadir a la cesta**: la prenda real sale de la percha, pliega mangas y bajo y vuela en arco hasta el
  icono de la cesta. Al quitarla de la cesta vuelve a colgarse. Con el perchero vacío aparece
  «Rellenar perchero».
- Contador «9 / 11 prendas en percha» en la cabecera, que rueda al cambiar.

### Shop the look (`shop-the-look.html`)
- Foto de un look con puntos sobre cada prenda y, al lado, el mismo perchero con esas prendas
  (sin fondo propio, solo sombras sobre la página).
- Puntos y perchero comparten la prenda activa: *hover* previsualiza, clic selecciona. Una tarjeta de
  detalle sobre la foto sigue a la prenda activa y cambia como una baraja de cartas.
- **Comprar el look**: aparece una bolsa de papel, las prendas se pliegan y caen dentro, y la bolsa vuela
  a la cesta. Después se pueden devolver todas al perchero.

### Móvil
- El perchero pasa a **carrusel**: se arrastra con el dedo, encaja en la prenda más cercana con inercia
  y la prenda centrada gira de frente.
- En Shop the look, la foto grande se convierte en una miniatura al hacer scroll, hasta que la fila de
  compra y el perchero llenan la pantalla.

### Común
- Pantalla de carga con una percha 3D que aparece con rebote, gira y descubre la página.
- Cesta simulada compartida entre páginas (localStorage); cambiar de sección la vacía.
- Selector Perchero | Shop the look con pastilla deslizante entre páginas.
- Scroll suave, cabecera fija translúcida, navegación con teclado y respeto de `prefers-reduced-motion`.

## Tecnologías

| Área | Tecnología |
| --- | --- |
| Lenguaje | **TypeScript** (estricto), sin framework de UI |
| Build y servidor de desarrollo | **Vite 6** (multipágina, `target: es2022`) |
| Render 3D | **three.js** (WebGL): luz física, sombras sobre la pared, entorno `RoomEnvironment` |
| Prendas y tejidos | Geometría y texturas **procedurales** (color + *normal map*), sin modelos ni imágenes externas |
| Física y animación | Muelles y paso fijo propios (1/120 s), sin librerías; animaciones de UI con CSS y JS |
| Plegado y vuelo a la cesta | Capa WebGL transparente a pantalla completa con deformación en el *vertex shader* |
| Scroll | **Lenis** (scroll suave y *snap*) |
| Estilos | CSS propio con variables; tipografías **Instrument Serif** e **Inter** (Google Fonts) |
| Despliegue | **Vercel**, publicado en cada push a `main` |

Dependencias de ejecución: solo `three` y `lenis`.

## Estructura

```
index.html, shop-the-look.html   Páginas (entrada en vite.config.ts)
src/
  main.ts, shop.ts               Arranque de cada página
  stage.ts                       Renderer, cámara, luces, pared, raíl o burro y perchas
  rack/RackHero.ts               Componente reutilizable del perchero (sin globales)
  garment/
    pillow.ts                    Malla «acolchada» a partir de una silueta 2D
    builders.ts                  Patrones y montaje de cada tipo de prenda
    fabrics.ts                   Texturas procedurales por tejido
  garments.ts, looks.ts          Catálogo ficticio y looks
  ui/                            Cesta, vuelo a la cesta, ficha, carga, selector,
                                 contador, scroll, cabecera y animaciones de texto
  style.css                      Sistema visual común
public/                          Favicons y fotos de los looks
```

`RackHero(container, prendas, opciones)` encapsula el perchero: crea su propio DOM y admite opciones
como `mount` (`'wall'` o `'floor'`), `transparent`, `carousel`, `onChange`, `onOpen` u `onAddToCart`,
y métodos como `select(i)`, `preview(i)`, `sendToCart(i, destino)` o `restore(i)`.

## Uso

```bash
npm install
npm run dev      # servidor de desarrollo en http://localhost:5173
npm run build    # comprobación de tipos + build de producción en dist/
npm run preview  # sirve el build
```

## Notas

- Todo el catálogo, los precios y la cesta son ficticios; no hay backend ni pagos.
- Las prendas 3D se modelan por código; no se usan imágenes ni código de terceros.
- Más detalle técnico y convenciones en [`CLAUDE.md`](CLAUDE.md).
