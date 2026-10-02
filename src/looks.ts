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
  image: string;       // foto propia (no incluida): public/looks/...
  placeholder: string; // ilustración provisional mientras no exista la foto
  alt: string;
  items: LookItem[];
}

export const looks: Look[] = [
  {
    title: 'Look 01 · Capas de otoño',
    subtitle: 'Vaquera sobre oxford y camiseta de algodón, con el jersey de ochos a mano.',
    image: '/looks/look-01.jpg',
    placeholder: '/looks/look-01-placeholder.svg',
    alt: 'Modelo con cazadora vaquera, camisa oxford azul, camiseta blanca y jersey de ochos al hombro',
    items: [
      { id: 'cazadora-trucker', x: 30, y: 36 },
      { id: 'camisa-oxford', x: 55, y: 30 },
      { id: 'camiseta-pima', x: 50, y: 22 },
      { id: 'jersey-ochos', x: 68, y: 18 },
    ],
  },
];
