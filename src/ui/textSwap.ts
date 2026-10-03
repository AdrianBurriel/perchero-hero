/* Cambios de texto animados para la ficha fija del perchero.
   - swapText: persiana enmascarada. El texto anterior sale y el nuevo entra (por letras o en bloque);
     el sentido lo da `--swap-dir` en un ancestro (1 = el nuevo entra por abajo, -1 = por arriba).
   - rollNumber: odómetro. Cada cifra rueda hasta su nuevo valor.
   Los lectores de pantalla leen el texto completo de un span oculto (.sr-only). */

const OUT_MS = 650; // lo que tarda en irse el texto anterior (se quita del DOM al acabar)

/** Span .sr-only con el texto entero (lo crea la primera vez). */
function spoken(el: HTMLElement, text: string) {
  let sr = el.querySelector<HTMLElement>(':scope > .sr-only');
  if (!sr) {
    sr = document.createElement('span');
    sr.className = 'sr-only';
    el.prepend(sr);
  }
  sr.textContent = text;
}

/** Cambia el texto de `el` con una persiana; `byChar` lo parte en letras escalonadas. */
export function swapText(el: HTMLElement, text: string, { byChar = false, delay = 0 } = {}) {
  spoken(el, text);
  // Lo que estuviera saliendo se quita ya; lo visible pasa a salir
  el.querySelectorAll(':scope > .swap.is-old').forEach((o) => o.remove());
  const prev = el.querySelector<HTMLElement>(':scope > .swap');
  if (prev) {
    prev.classList.add('is-old');
    setTimeout(() => prev.remove(), OUT_MS);
  }
  const next = document.createElement('span');
  next.className = 'swap';
  next.setAttribute('aria-hidden', 'true');
  next.style.setProperty('--delay', `${delay}ms`);
  for (const [i, part] of (byChar ? [...text] : [text]).entries()) {
    const c = document.createElement('span');
    c.className = 'swap__c';
    c.textContent = part;
    c.style.setProperty('--i', String(i));
    next.append(c);
  }
  // Primera vez: sin texto anterior, el nuevo también entra
  el.append(next);
}

/** Pone `text` en `el` haciendo rodar cada cifra (los demás caracteres cambian sin animar). */
export function rollNumber(el: HTMLElement, text: string) {
  spoken(el, text);
  const pattern = text.replace(/\d/g, '0');
  let row = el.querySelector<HTMLElement>(':scope > .odo');
  if (!row || row.dataset.pattern !== pattern) {
    // Otra forma (más o menos cifras): se monta de nuevo y las cifras ruedan desde 0
    row?.remove();
    row = document.createElement('span');
    row.className = 'odo';
    row.setAttribute('aria-hidden', 'true');
    row.dataset.pattern = pattern;
    for (const ch of text) {
      const cell = document.createElement('span');
      if (/\d/.test(ch)) {
        cell.className = 'odo__digit';
        cell.innerHTML = `<span class="odo__col">${'0123456789'.split('').map((d) => `<span>${d}</span>`).join('')}</span>`;
      } else {
        cell.className = 'odo__char';
        cell.textContent = ch;
      }
      row.append(cell);
    }
    el.append(row);
    void row.offsetWidth; // fija el 0 de partida para que la transición arranque
  }
  const digits = [...text].filter((ch) => /\d/.test(ch));
  row.querySelectorAll<HTMLElement>('.odo__col').forEach((col, i) => {
    col.style.setProperty('--n', digits[i]!);
    col.style.setProperty('--i', String(i)); // de izquierda a derecha, escalonadas
  });
}
