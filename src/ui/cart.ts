import type { GarmentData } from '../garments';
import { formatPrice, toast } from './productCard';

/* Cesta simulada: icono con contador en la barra superior y panel lateral.
   Se guarda en localStorage (solo comodidad del visitante; si falla, vive en memoria). */

interface Line {
  id: string;
  name: string;
  brand: string;
  price: number;
  qty: number;
}

const KEY = 'perchero-cart';
const BAG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1.2 12H6.2L5 8Z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></svg>';
const CROSS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>';

function load(): Line[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Line[];
  } catch {
    return [];
  }
}
function save(lines: Line[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    /* sin almacenamiento: la cesta dura lo que la página */
  }
}

let lines = load();
let button: HTMLButtonElement;
let badge: HTMLElement;
let live: HTMLElement;
let drawer: HTMLElement;
let returnFocus: HTMLElement | null = null;

const count = () => lines.reduce((s, l) => s + l.qty, 0);
const removeListeners: ((id: string) => void)[] = [];

/** ¿Está ya en la cesta? (al cargar, esas prendas no se cuelgan en el perchero) */
export const inCart = (id: string) => lines.some((l) => l.id === id);
/** Avisa cuando se quita una prenda de la cesta (para devolverla al perchero). */
export const onCartRemove = (fn: (id: string) => void) => removeListeners.push(fn);

function render() {
  const n = count();
  badge.textContent = String(n);
  badge.hidden = n === 0;
  button.setAttribute('aria-label', `Cesta, ${n} ${n === 1 ? 'prenda' : 'prendas'}`);

  const list = drawer.querySelector<HTMLElement>('.drawer__lines')!;
  list.replaceChildren(
    ...lines.map((l) => {
      const li = document.createElement('li');
      li.className = 'drawer__line';
      li.innerHTML = `
        <div class="drawer__line-info">
          <p class="drawer__line-brand"></p>
          <p class="drawer__line-name"></p>
          <button class="drawer__remove" type="button">Devolver al perchero</button>
        </div>
        <div class="drawer__line-meta">
          <p class="drawer__line-price"></p>
          <p class="drawer__line-qty"></p>
        </div>`;
      li.querySelector('.drawer__line-brand')!.textContent = l.brand;
      li.querySelector('.drawer__line-name')!.textContent = l.name;
      li.querySelector('.drawer__line-price')!.textContent = formatPrice(l.price * l.qty);
      li.querySelector('.drawer__line-qty')!.textContent = l.qty > 1 ? `${l.qty} × ${formatPrice(l.price)}` : '';
      const back = li.querySelector<HTMLElement>('.drawer__remove')!;
      back.setAttribute('aria-label', `Devolver ${l.name} al perchero`);
      back.addEventListener('click', () => remove(l.id));
      return li;
    }),
  );
  drawer.querySelector<HTMLElement>('.drawer__empty')!.hidden = lines.length > 0;
  drawer.querySelector<HTMLElement>('.drawer__foot')!.hidden = lines.length === 0;
  drawer.querySelector('.drawer__subtotal strong')!.textContent = formatPrice(lines.reduce((s, l) => s + l.price * l.qty, 0));
  drawer.querySelector('.drawer__count')!.textContent = n ? `(${n})` : '';
}

/** Vacía la cesta sin devolver nada a las perchas (se usa al cambiar de sección: la otra
    página empieza con su perchero lleno). */
export function clearCart() {
  lines = [];
  save(lines);
}

/** Saca una prenda de la cesta (vuelve a su percha a través de onCartRemove). */
export const removeFromCart = (id: string) => remove(id);

function remove(id: string) {
  lines = lines.filter((l) => l.id !== id);
  save(lines);
  render();
  removeListeners.forEach((fn) => fn(id));
}

function open() {
  returnFocus = document.activeElement as HTMLElement | null;
  drawer.hidden = false;
  requestAnimationFrame(() => drawer.classList.add('is-open'));
  button.setAttribute('aria-expanded', 'true');
  drawer.querySelector<HTMLElement>('.drawer__close')!.focus();
}
function close() {
  if (drawer.hidden) return;
  drawer.classList.remove('is-open');
  button.setAttribute('aria-expanded', 'false');
  setTimeout(() => (drawer.hidden = true), 350);
  returnFocus?.focus();
}

/** Monta el icono en `slot` (barra superior) y el panel en el body. */
export function mountCart(slot: HTMLElement) {
  button = document.createElement('button');
  button.type = 'button';
  button.className = 'cart-btn';
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = `${BAG}<span class="cart-btn__badge" hidden></span>`;
  badge = button.querySelector('.cart-btn__badge')!;
  button.addEventListener('click', open);
  slot.append(button);

  live = document.createElement('p');
  live.className = 'sr-only';
  live.setAttribute('aria-live', 'polite');
  document.body.append(live);

  drawer = document.createElement('div');
  drawer.className = 'drawer';
  drawer.hidden = true;
  drawer.innerHTML = `
    <div class="drawer__backdrop"></div>
    <aside class="drawer__panel" role="dialog" aria-modal="true" aria-labelledby="cart-title">
      <header class="drawer__head">
        <h2 class="drawer__title" id="cart-title">Tu cesta <span class="drawer__count"></span></h2>
        <button class="drawer__close" type="button" aria-label="Cerrar cesta">${CROSS}</button>
      </header>
      <ul class="drawer__lines"></ul>
      <p class="drawer__empty">Tu cesta está vacía.</p>
      <footer class="drawer__foot">
        <p class="drawer__subtotal"><span>Subtotal</span><strong></strong></p>
        <button class="btn btn--dark drawer__checkout" type="button">Finalizar compra</button>
        <p class="drawer__note">Envío y devoluciones gratuitos · Simulación</p>
      </footer>
    </aside>`;
  document.body.append(drawer);
  drawer.querySelector('.drawer__backdrop')!.addEventListener('click', close);
  drawer.querySelector('.drawer__close')!.addEventListener('click', close);
  drawer.querySelector('.drawer__checkout')!.addEventListener('click', () => toast('Simulación: aquí empezaría el pago'));
  addEventListener('keydown', (e) => e.key === 'Escape' && close());
  render();
}

/** Centro del icono en pantalla: destino del vuelo. */
export function cartTarget() {
  const r = button.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Suma la prenda (al aterrizar el vuelo) con un pequeño salto del icono. */
export function addToCart(g: GarmentData) {
  const line = lines.find((l) => l.id === g.id);
  if (line) line.qty++;
  else lines.push({ id: g.id, name: g.name, brand: g.brand, price: g.price, qty: 1 });
  save(lines);
  render();
  live.textContent = `Añadido a la cesta: ${g.name}`;
  button.classList.remove('is-bump');
  void button.offsetWidth; // reinicia la animación si llegan varias seguidas
  button.classList.add('is-bump');
}
