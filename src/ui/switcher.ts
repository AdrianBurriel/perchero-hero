/* Selector Perchero | Shop the look. Una pastilla marca la sección actual:
   al elegir la otra se desliza hasta ella antes de navegar, y en la página nueva
   termina el gesto saliendo desde la opción anterior. */

const KEY = 'switch-from';
const LEAVE_MS = 320; // lo que tarda la pastilla en llegar antes de cambiar de página

export function mountSwitch(root: HTMLElement) {
  const pill = root.querySelector<HTMLElement>('.switch__pill')!;
  const opts = [...root.querySelectorAll<HTMLAnchorElement>('.switch__opt')];
  const current = Math.max(0, opts.findIndex((a) => a.getAttribute('aria-current') === 'page'));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const place = (i: number) => {
    const a = opts[i]!;
    pill.style.setProperty('--x', `${a.offsetLeft}px`);
    pill.style.setProperty('--w', `${a.offsetWidth}px`);
    opts.forEach((o, j) => o.classList.toggle('is-on', j === i));
  };

  // Llegada: si venimos de la otra opción, la pastilla sale de allí y se desliza
  let from: number | null = null;
  try {
    const v = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (v !== null) from = Number(v);
  } catch {
    /* sin sessionStorage: sin animación de llegada */
  }
  root.classList.add('is-static');
  place(from !== null && from !== current && !reduce ? from : current);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      root.classList.remove('is-static');
      place(current);
    }),
  );

  // Salida: la pastilla viaja a la opción elegida y luego se navega
  opts.forEach((a, i) => {
    a.addEventListener('click', (e) => {
      if (i === current || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      try {
        sessionStorage.setItem(KEY, String(current));
      } catch {
        /* sin sessionStorage */
      }
      place(i);
      root.classList.add('is-leaving');
      setTimeout(() => (location.href = a.href), reduce ? 0 : LEAVE_MS);
    });
    // Hover: la pastilla se estira un poco hacia la opción inactiva
    a.addEventListener('pointerenter', () => i !== current && root.style.setProperty('--lean', i > current ? '6px' : '-6px'));
    a.addEventListener('pointerleave', () => root.style.setProperty('--lean', '0px'));
  });

  // Las fuentes web cambian el ancho de las opciones al cargar
  document.fonts?.ready.then(() => place(root.classList.contains('is-leaving') ? opts.findIndex((o) => o.classList.contains('is-on')) : current));
  addEventListener('resize', () => place(current));
}
