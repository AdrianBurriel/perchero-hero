import './style.css';
import { garments } from './garments';
import { RackHero } from './rack/RackHero';

// Portada: perchero de pared con todo el catálogo
new RackHero(document.querySelector<HTMLElement>('#rack')!, garments, { mount: 'wall' });
