// Looks de Shop the look: foto del modelo + prendas que lleva, con su punto sobre la foto.
// x/y en % de la foto: ajústalos cuando pongas la imagen real.
export interface LookItem {
  id: string; // id de la prenda en garments.ts
  x: number;
  y: number;
}

export interface Look {
  title: string;
  subtitle: string;
  image: string;       // foto del look: public/looks/...
  ratio: number;       // ancho / alto de la foto, para que los puntos caigan siempre en su sitio
  focus: { x: number; y: number; zoom: number }; // encuadre: punto (en %) que queda centrado y ampliación
  placeholder: string; // ilustración provisional mientras no exista la foto
  alt: string;
  items: LookItem[];
}

export const looks: Look[] = [
  {
    title: 'Traje camel en la ciudad',
    subtitle: 'Traje camel con camisa estampada y abrigo de paño azul al brazo.',
    image: '/looks/look-01.jpg',
    ratio: 686 / 1031,
    // Acerca al modelo y lo sube: deja sitio abajo para el detalle de la prenda
    focus: { x: 53, y: 52, zoom: 1.3 },
    placeholder: '/looks/look-01-placeholder.svg',
    alt: 'Modelo caminando bajo un paso elevado con traje camel, camisa estampada azul y un abrigo azul marino al brazo',
    items: [
      { id: 'americana-camel', x: 43, y: 31 },
      { id: 'camisa-estampada', x: 50.5, y: 26 },
      { id: 'pantalon-traje', x: 45, y: 46 },
      { id: 'abrigo-pano', x: 58, y: 40 },
    ],
  },
];
