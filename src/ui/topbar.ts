/* Cabecera fija: al hacer scroll toma fondo (.is-scrolled) para no mezclarse con el contenido. */
export function mountTopbar(bar: HTMLElement) {
  const update = () => bar.classList.toggle('is-scrolled', scrollY > 4);
  addEventListener('scroll', update, { passive: true });
  update();
}
