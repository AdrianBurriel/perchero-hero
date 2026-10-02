/* Contador de prendas colgadas en la barra superior. Al cambiar, el número rueda
   (sube al quitar, baja al devolver) y un "−1" / "+1" flota y se desvanece. */

const DURATION = 1200; // ms que dura el aviso "−1"

export function mountStock(el: HTMLElement, prefix = '') {
  el.innerHTML = `${prefix}<span class="stock"><span class="stock__roll"><span class="stock__num"></span></span><span class="stock__delta" aria-hidden="true"></span></span> <span class="stock__noun"></span>`;
  const roll = el.querySelector<HTMLElement>('.stock__roll')!;
  const noun = el.querySelector<HTMLElement>('.stock__noun')!;
  const delta = el.querySelector<HTMLElement>('.stock__delta')!;
  let value: number | null = null;
  let timer = 0;

  return (n: number) => {
    noun.textContent = `${n === 1 ? 'prenda' : 'prendas'} en percha`;
    if (value === null || value === n) {
      roll.querySelector('.stock__num')!.textContent = String(n);
      value = n;
      return;
    }
    const down = n < value; // quitar: el número sube y se va
    // Rodillo: el número viejo sale y el nuevo entra desde el lado contrario
    const old = roll.querySelector<HTMLElement>('.stock__num:last-child')!;
    const next = document.createElement('span');
    next.className = `stock__num is-in ${down ? 'from-below' : 'from-above'}`;
    next.textContent = String(n);
    old.className = `stock__num is-out ${down ? 'to-above' : 'to-below'}`;
    roll.append(next);
    old.addEventListener('animationend', () => old.remove(), { once: true });
    // Aviso flotante
    delta.textContent = `${down ? '−' : '+'}${Math.abs(n - value)}`;
    delta.classList.remove('is-show', 'is-up', 'is-down');
    void delta.offsetWidth; // reinicia la animación si llegan varios seguidos
    delta.classList.add('is-show', down ? 'is-down' : 'is-up');
    clearTimeout(timer);
    timer = window.setTimeout(() => delta.classList.remove('is-show'), DURATION);
    // Leve resalte de la barra al cambiar
    el.classList.remove('is-changed');
    void el.offsetWidth;
    el.classList.add('is-changed');
    value = n;
  };
}
