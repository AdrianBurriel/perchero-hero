import './style.css';
import { garments } from './garments';
import { RackHero } from './rack/RackHero';
import { mountCart, cartTarget, addToCart, inCart, onCartRemove } from './ui/cart';
import { mountSwitch } from './ui/switcher';
import { mountStock } from './ui/stock';

mountSwitch(document.querySelector<HTMLElement>('.switch')!);
mountCart(document.querySelector<HTMLElement>('#cart-slot')!);

// Portada: perchero de pared con todo el catálogo. Lo que ya está en la cesta no se cuelga.
const rack = new RackHero(document.querySelector<HTMLElement>('#rack')!, garments, {
  mount: 'wall',
  gone: (i) => inCart(garments[i]!.id),
  onStock: mountStock(document.querySelector<HTMLElement>('#stock')!),
  // La prenda se pliega, se empaqueta y vuela a la cesta; se suma al aterrizar
  onAddToCart: (i) => rack.sendToCart(i, cartTarget()).then((ok) => ok && addToCart(garments[i]!)),
});
// Quitar de la cesta la devuelve a su percha
onCartRemove((id) => rack.restore(garments.findIndex((g) => g.id === id)));
