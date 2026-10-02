import type { GarmentData } from '../garments';

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

/** Rellena una ficha ya montada con los datos de la prenda. */
export function fillCard(root: HTMLElement, g: GarmentData, index: number, total: number, inBag = false) {
  const set = (sel: string, text: string) => (root.querySelector<HTMLElement>(sel)!.textContent = text);
  set('.card__brand', g.brand);
  set('.card__index', `${pad(index + 1)} / ${pad(total)}`);
  set('.card__name', g.name);
  set('.card__material', g.material);
  set('.card__price', formatPrice(g.price));
  set('.card__text', g.description);
  root.querySelector<HTMLElement>('.card__cta')!.dataset.product = g.name;
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
