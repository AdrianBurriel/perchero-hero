import './style.css';
import { garments } from './garments';
import { RackHero } from './rack/RackHero';
import { mountCart, cartTarget, addToCart } from './ui/cart';

mountCart(document.querySelector<HTMLElement>('#cart-slot')!);

// Portada: perchero de pared con todo el catálogo
const rack = new RackHero(document.querySelector<HTMLElement>('#rack')!, garments, {
  mount: 'wall',
  // La prenda vuela a la cesta y se suma al aterrizar
  onAddToCart: (i) => rack.flyTo(i, cartTarget()).then(() => addToCart(garments[i]!)),
});
