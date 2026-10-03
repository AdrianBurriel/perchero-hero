import type { GarmentData } from '../garments';
import { swapText, rollNumber } from './textSwap';

/* Ficha breve de producto: misma estructura y altura en la portada y en Shop the look. */

// es-ES no agrupa los miles con 4 cifras (1291 €); de-DE usa el mismo formato pero siempre agrupa (1.291 €)
const thousands = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
export const formatPrice = (n: number) => `${thousands.format(n)} €`;
const pad = (n: number) => String(n).padStart(2, '0');

const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>';
const CROSS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>';

export const cardHTML = (nameId: string) => `
  <div class="card">
    <div class="card__head">
      <p class="card__brand"></p>
      <p class="card__index"></p>
      <button class="card__close" type="button" aria-label="Cerrar detalle">${CROSS}</button>
    </div>
    <div class="card__main">
      <div class="card__titles">
        <h2 class="card__name" id="${nameId}"></h2>
        <p class="card__material"></p>
      </div>
      <p class="card__price"></p>
    </div>
    <p class="card__text"></p>
    <div class="card__actions">
      <button class="btn btn--dark card__add" type="button">Añadir a la cesta</button>
      <button class="btn card__cta" type="button">Ver producto ${ARROW}</button>
    </div>
  </div>`;

/** Cambio de prenda como en una baraja: una copia de la tarjeta actual sale hacia un lado
    (y se elimina) mientras la tarjeta, ya con la prenda nueva, entra desde el otro. */
function dealCard(root: HTMLElement): boolean {
  const card = root.querySelector<HTMLElement>('.card:not(.card--ghost)');
  if (!card) return false;
  root.querySelectorAll('.card--ghost').forEach((g) => g.remove());
  const ghost = card.cloneNode(true) as HTMLElement;
  ghost.classList.add('card--ghost');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  ghost.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  ghost.querySelectorAll('.swap.is-old').forEach((el) => el.remove()); // solo el texto que se veía
  card.after(ghost); // detrás en el DOM: los querySelector de la ficha siguen dando con la tarjeta real
  setTimeout(() => ghost.remove(), 600);
  return true;
}

/** Rellena una ficha ya montada con los datos de la prenda. Al cambiar de prenda, el texto se anima
    (la tarjeta cambia como en una baraja; dentro, persiana en nombre y marca, odómetro en contador
    y precio, fundido en material y descripción), en el sentido del slide. */
export function fillCard(root: HTMLElement, g: GarmentData, index: number, total: number, inBag = false) {
  const q = (sel: string) => root.querySelector<HTMLElement>(sel)!;
  if (root.dataset.id !== g.id) {
    const prev = Number(root.dataset.index ?? index);
    root.style.setProperty('--swap-dir', index < prev ? '-1' : '1');
    // La tarjeta anterior se va con su texto: en la nueva solo entra el texto nuevo
    const replace = !!root.dataset.id && dealCard(root);
    root.dataset.id = g.id;
    root.dataset.index = String(index);
    swapText(q('.card__name'), g.name, { byChar: true, delay: replace ? 120 : 0, replace });
    swapText(q('.card__brand'), g.brand, { delay: replace ? 180 : 60, replace });
    rollNumber(q('.card__index'), `${pad(index + 1)} / ${pad(total)}`);
    rollNumber(q('.card__price'), formatPrice(g.price));
    q('.card__material').textContent = g.material;
    q('.card__text').textContent = g.description;
    root.classList.remove('is-swap');
    void root.offsetWidth; // reinicia el fundido
    root.classList.add('is-swap');
  }
  q('.card__cta').dataset.product = g.name;
  const add = root.querySelector<HTMLButtonElement>('.card__add')!;
  add.disabled = inBag;
  add.textContent = inBag ? 'En la cesta' : 'Añadir a la cesta';
}

/** Aviso breve para acciones simuladas (ficha, compra). */
let toastEl: HTMLElement | null = null;
let toastTimer = 0;
export function toast(message: string) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.setAttribute('role', 'status');
    document.body.append(toastEl);
  }
  toastEl.textContent = message;
  toastEl.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl?.classList.remove('is-visible'), 2600);
}

/** Botones de la ficha: "Añadir a la cesta" llama a `onAdd`; "Ver producto" es simulado y solo avisa. */
export function bindCardCta(root: HTMLElement, onAdd: () => void) {
  root.querySelector<HTMLElement>('.card__add')!.addEventListener('click', onAdd);
  root.querySelector<HTMLElement>('.card__cta')!.addEventListener('click', (e) => {
    const name = (e.currentTarget as HTMLElement).dataset.product ?? '';
    toast(`Simulación: aquí se abriría la ficha de «${name}»`);
  });
}
