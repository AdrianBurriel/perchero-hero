import './style.css';
import { garments } from './garments';
import { RackHero } from './rack/RackHero';
import { mountCart, cartTarget, addToCart, inCart, onCartRemove, removeFromCart } from './ui/cart';
import { mountTopbar } from './ui/topbar';
import { mountSwitch } from './ui/switcher';
import { mountStock } from './ui/stock';
import { startLoader } from './ui/loader';

const loader = startLoader();

mountTopbar(document.querySelector<HTMLElement>('.topbar')!);
mountSwitch(document.querySelector<HTMLElement>('.switch')!);
mountCart(document.querySelector<HTMLElement>('#cart-slot')!);

const REFILL_GAP = 110; // ms entre una prenda y la siguiente al rellenar

// El perchero se monta cuando la percha de la carga ya está quieta (el montaje bloquea un instante)
await loader.intro;

// Portada: perchero de pared con todo el catálogo. Lo que ya está en la cesta no se cuelga.
const rack = new RackHero(document.querySelector<HTMLElement>('#rack')!, garments, {
  mount: 'wall',
  carousel: true, // en móvil: raíl de lado a lado y arrastre
  gone: (i) => inCart(garments[i]!.id),
  onStock: mountStock(document.querySelector<HTMLElement>('#stock')!),
  // Rellenar: cada prenda vuelve a su percha (y sale de la cesta), una tras otra
  onRefill: () => garments.forEach((g, i) => setTimeout(() => removeFromCart(g.id), i * REFILL_GAP)),
  // La prenda se pliega, se empaqueta y vuela a la cesta; se suma al aterrizar
  onAddToCart: (i) => rack.sendToCart(i, cartTarget()).then((ok) => ok && addToCart(garments[i]!)),
});
// Quitar de la cesta la devuelve a su percha
onCartRemove((id) => rack.restore(garments.findIndex((g) => g.id === id)));
loader.finish();
