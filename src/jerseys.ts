// Datos de prueba. Sustituye `color`/`accent` por imágenes recortadas (WebP con alfa)
// cuando quieras pasar de SVG procedural a producto real.
export interface Jersey {
  name: string;
  brand: string;
  color: string;
  accent: string;
}

export const jerseys: Jersey[] = [
  { name: 'Maillot 01', brand: 'Marca A', color: '#c8553d', accent: '#f2e8cf' },
  { name: 'Maillot 02', brand: 'Marca B', color: '#264653', accent: '#e9c46a' },
  { name: 'Maillot 03', brand: 'Marca C', color: '#e9c46a', accent: '#264653' },
  { name: 'Maillot 04', brand: 'Marca D', color: '#f1f1ee', accent: '#1d3557' },
  { name: 'Maillot 05', brand: 'Marca E', color: '#2a9d8f', accent: '#f1f1ee' },
  { name: 'Maillot 06', brand: 'Marca F', color: '#1d1d1f', accent: '#e63946' },
  { name: 'Maillot 07', brand: 'Marca G', color: '#7b6d8d', accent: '#f4e3b2' },
  { name: 'Maillot 08', brand: 'Marca H', color: '#a8c686', accent: '#2f3e46' },
  { name: 'Maillot 09', brand: 'Marca I', color: '#e76f51', accent: '#fdf0d5' },
  { name: 'Maillot 10', brand: 'Marca J', color: '#457b9d', accent: '#f1faee' },
  { name: 'Maillot 11', brand: 'Marca K', color: '#d9d4c7', accent: '#6b4f3a' },
];
