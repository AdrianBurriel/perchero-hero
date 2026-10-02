import type { FabricSpec } from './garment/fabrics';

// Catálogo inventado: marcas y prendas ficticias para el prototipo.
export type GarmentType = 'tee' | 'shirt' | 'sweater' | 'hoodie' | 'jacket' | 'blazer' | 'coat' | 'trousers';

export interface GarmentData {
  id: string;
  name: string;
  brand: string;
  material: string;
  description: string;
  type: GarmentType;
  fabric: FabricSpec;
  variant?: 'denim' | 'leather' | 'puffer' | 'overshirt';
  buttons?: { color: string; metal?: boolean };
  accent?: string; // detalle de color (p. ej. pañuelo de bolsillo)
}

export const garments: GarmentData[] = [
  {
    id: 'camiseta-pima', name: 'Camiseta Pima', brand: 'Taller Norte', type: 'tee',
    material: '100 % algodón pima, punto liso 180 g',
    description: 'Camiseta de cuello redondo con canalé fino y caída suave.',
    fabric: { kind: 'jersey', colors: ['#f2f0ea'] },
  },
  {
    id: 'camisa-oxford', name: 'Camisa Oxford', brand: 'Brisa & Co.', type: 'shirt',
    material: 'Oxford de algodón, urdimbre azul y trama blanca',
    description: 'Camisa clásica de cuello con botones y bolsillo de pecho.',
    fabric: { kind: 'oxford', colors: ['#5b82b5', '#f4f2ee'] },
    buttons: { color: '#f3f0e8' },
  },
  {
    id: 'cazadora-trucker', name: 'Cazadora Trucker', brand: 'Índigo 71', type: 'jacket', variant: 'denim',
    material: 'Denim 13 oz de sarga 3/1, botones de cobre',
    description: 'Cazadora vaquera de corte corto con bolsillos de solapa.',
    fabric: { kind: 'denim', colors: ['#27406b', '#d9d2bf'] },
    buttons: { color: '#b87333', metal: true },
  },
  {
    id: 'jersey-ochos', name: 'Jersey de Ochos', brand: 'Lanar', type: 'sweater',
    material: 'Lana merino con trenzas, puños de canalé',
    description: 'Jersey grueso de cuello redondo con trenzas en todo el cuerpo.',
    fabric: { kind: 'cable', colors: ['#e6dcc6'] },
  },
  {
    id: 'franela-lenador', name: 'Franela Leñador', brand: 'Taller Norte', type: 'shirt',
    material: 'Franela de algodón perchada, cuadros tartán',
    description: 'Camisa de franela cálida con dos bolsillos de pecho.',
    fabric: { kind: 'flannel', colors: ['#7e231f', '#1d1a19', '#2d4a3a', '#cdbf9c'] },
    buttons: { color: '#2a2420' },
  },
  {
    id: 'biker-cuero', name: 'Biker de Cuero', brand: 'Marea Negra', type: 'jacket', variant: 'leather',
    material: 'Piel de vacuno con grano natural, cremallera metálica',
    description: 'Cazadora de cuero de solapas anchas y cintura ajustada.',
    fabric: { kind: 'leather', colors: ['#1b1918'] },
  },
  {
    id: 'sudadera-capucha', name: 'Sudadera Capucha', brand: 'Brisa & Co.', type: 'hoodie',
    material: 'Felpa de algodón jaspeada, 340 g',
    description: 'Sudadera con capucha, bolsillo canguro y cordones.',
    fabric: { kind: 'fleece', colors: ['#8d8e8c', '#bdbcb8'] },
  },
  {
    id: 'marinera', name: 'Marinera', brand: 'Costa Brava', type: 'tee',
    material: 'Punto de algodón a rayas',
    description: 'Camiseta de rayas marineras con cuello redondo.',
    fabric: { kind: 'stripes', colors: ['#efe9dc', '#1f2a44'] },
  },
  {
    id: 'plumifero-ligero', name: 'Plumífero Ligero', brand: 'Cumbre', type: 'jacket', variant: 'puffer',
    material: 'Nylon ripstop con relleno de plumón',
    description: 'Chaqueta acolchada por canales con cuello alto.',
    fabric: { kind: 'nylon', colors: ['#4f5a3a'] },
  },
  {
    id: 'sobrecamisa-pana', name: 'Sobrecamisa de Pana', brand: 'Lanar', type: 'shirt', variant: 'overshirt',
    material: 'Pana de canutillo ancho, botones de asta',
    description: 'Sobrecamisa gruesa de pana con bolsillos de parche.',
    fabric: { kind: 'corduroy', colors: ['#a4713d'] },
    buttons: { color: '#4a3526' },
  },
  {
    id: 'camisa-lino', name: 'Camisa de Lino', brand: 'Costa Brava', type: 'shirt',
    material: '100 % lino lavado',
    description: 'Camisa ligera de lino con textura irregular y caída fresca.',
    fabric: { kind: 'linen', colors: ['#cdbb97'] },
    buttons: { color: '#efe8da' },
  },
];

// Prendas del look 01 (Shop the look), recreadas a partir de la foto del modelo
export const lookGarments: GarmentData[] = [
  {
    id: 'americana-camel', name: 'Americana Camel', brand: 'Sastrería Sur', type: 'blazer',
    material: 'Lana fría de sarga, forro de viscosa',
    description: 'Americana de un botón con solapa de muesca y pañuelo azul en el bolsillo de pecho.',
    fabric: { kind: 'suiting', colors: ['#8c6f50'] },
    buttons: { color: '#3b2a1e' },
    accent: '#9cc3d9',
  },
  {
    id: 'camisa-estampada', name: 'Camisa Estampada', brand: 'Brisa & Co.', type: 'shirt',
    material: 'Popelín de algodón con estampado floral',
    description: 'Camisa de fondo petróleo con flores menudas en azul claro.',
    fabric: { kind: 'print', colors: ['#183646', '#86b8d0', '#e2ebf0'] },
    buttons: { color: '#e9edf0' },
  },
  {
    id: 'pantalon-traje', name: 'Pantalón de Traje', brand: 'Sastrería Sur', type: 'trousers',
    material: 'Lana fría de sarga, a juego con la americana',
    description: 'Pantalón de pinzas con raya marcada y bajo con vuelta.',
    fabric: { kind: 'suiting', colors: ['#8c6f50'] },
  },
  {
    id: 'abrigo-pano', name: 'Abrigo de Paño', brand: 'Lanar', type: 'coat',
    material: 'Paño de lana batanada',
    description: 'Abrigo largo azul marino de solapa ancha y tres botones.',
    fabric: { kind: 'wool', colors: ['#1d2a39'] },
    buttons: { color: '#1b1f26' },
  },
];

export const byId = (id: string): GarmentData => {
  const g = [...garments, ...lookGarments].find((x) => x.id === id);
  if (!g) throw new Error(`Prenda desconocida: ${id}`);
  return g;
};
