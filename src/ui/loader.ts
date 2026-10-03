import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createHanger } from '../stage';

/* Pantalla de carga: fondo crema (el de la web) en el que aparece una percha en 3D, movida con
   muelles al estilo Framer Motion. Dura lo que tarde la página en estar lista y nunca menos de
   MIN_MS; al final la capa sube y deja ver la página. La intro acaba con la percha quieta en el
   aire: en ese momento la página monta su perchero, que bloquea el hilo un instante sin que se note. */

const MIN_MS = 2000;      // duración mínima total (intro + espera + salida)
const EXIT_MS = 1000;     // salida: la percha toma impulso y la capa sube (CSS) de abajo arriba
const REVEAL_AT = 0.12;   // s de la salida en que empieza a subir la capa (con el salto)
const REST_Y = 0.3;       // altura de la percha en reposo (origen = arriba del gancho)
const BG = '#d6d0c4';     // --wall

/** Muelle amortiguado (como `type: "spring"` de Framer Motion). */
class Spring {
  v = 0;
  target: number;
  constructor(public x: number, public k: number, public c: number) {
    this.target = x;
  }
  step(dt: number) {
    this.v += (-this.k * (this.x - this.target) - this.c * this.v) * dt;
    this.x += this.v * dt;
  }
  to(target: number, k = this.k, c = this.c) {
    Object.assign(this, { target, k, c });
  }
}

export interface Loader {
  /** Se resuelve cuando la percha ya ha salido y está quieta: buen momento para el trabajo pesado. */
  intro: Promise<void>;
  /** La página está montada: sale en cuanto cargue todo (fuentes, imágenes) y pase el mínimo. */
  finish(): void;
}

export function startLoader(): Loader {
  const root = document.querySelector<HTMLElement>('#loader');
  const start = performance.now();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Mientras carga, la página no recibe foco ni clics
  const page = [...document.body.children].filter((el) => el !== root) as HTMLElement[];
  page.forEach((el) => (el.inert = true));

  const loaded = Promise.all([
    document.readyState === 'complete' ? null : new Promise((r) => addEventListener('load', r, { once: true })),
    document.fonts?.ready,
  ]);
  const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const reveal = () => {
    page.forEach((el) => (el.inert = false));
    root?.classList.add('is-out');
  };
  const remove = () => root?.remove();

  if (!root || reduce) {
    // Sin animación: solo se espera a que la página esté lista
    return {
      intro: Promise.resolve(),
      finish: () =>
        Promise.all([loaded, frames()]).then(() => {
          reveal();
          setTimeout(remove, 400);
        }),
    };
  }

  /* ---------- Escena ---------- */
  const canvas = root.querySelector<HTMLCanvasElement>('.loader__canvas')!;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(BG);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;
  const key = new THREE.DirectionalLight('#fff0dc', 2.6);
  key.position.set(-1.5, 2.5, 1.8);
  scene.add(key);

  const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 40);
  camera.position.set(0, 0.75, 2.3);
  camera.lookAt(0, 0.16, 0);
  const label = root.querySelector<HTMLElement>('.loader__label');
  const toPx = (p: THREE.Vector3, h: number) => ((1 - p.clone().project(camera).y) / 2) * h;
  // Centrado: el conjunto percha (gancho arriba) + sombra + texto queda en el centro vertical de la
  // capa (100dvh); el texto va justo bajo la sombra. Se desplaza la imagen con setViewOffset.
  const resize = () => {
    const w = root.clientWidth;
    const h = root.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // En vertical se aleja un poco para que quepa el giro de la percha
    camera.zoom = Math.min(1, camera.aspect / 0.75);
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    const top = toPx(new THREE.Vector3(0, REST_Y + 0.02, 0), h);   // arriba del gancho
    const floor = toPx(new THREE.Vector3(0, 0, 0.08), h);          // borde delantero de la sombra
    const labelGap = 22;
    const labelH = label?.offsetHeight ?? 14;
    const bottom = floor + labelGap + labelH;
    const dy = top - (h - (bottom - top)) / 2; // lo que hay que subir la imagen para centrar
    camera.setViewOffset(w, h, 0, dy, w, h);
    camera.updateProjectionMatrix();
    if (label) label.style.top = `${floor - dy + labelGap}px`;
  };
  resize();
  addEventListener('resize', resize);
  document.fonts?.ready.then(resize); // el alto del texto cambia al cargar la fuente

  // Sombra difusa en el suelo: crece y se oscurece cuanto más cerca está la percha
  const blob = document.createElement('canvas');
  blob.width = blob.height = 128;
  const g = blob.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(40,30,20,0.55)');
  grad.addColorStop(1, 'rgba(40,30,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const shadowTex = new THREE.CanvasTexture(blob);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.16).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false }),
  );
  scene.add(shadow);

  // La percha del perchero
  const { hook, frame } = createHanger();
  const hanger = new THREE.Group();
  hanger.add(hook, frame);
  hanger.position.y = REST_Y;
  hanger.scale.setScalar(0.001);
  scene.add(hanger);

  /* ---------- Movimiento ---------- */
  const grow = new Spring(0, 200, 13);          // aparece desde 0 con rebote
  const y = new Spring(REST_Y - 0.1, 160, 12);  // sube un poco mientras crece
  const spin = new Spring(-Math.PI, 90, 13);    // da media vuelta y queda de frente
  const tilt = new Spring(0, 140, 5);           // bamboleo al llegar
  let t = 0;                                    // tiempo de la animación (s, con dt acotado)
  let introDone: () => void;
  const intro = new Promise<void>((r) => (introDone = r));
  let introFired = false;
  let wobbled = false;
  let exitAt = Infinity;                        // t en que empieza la salida
  let resolveDone: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));

  let last = performance.now();
  const tick = (now: number) => {
    // Tras un bloqueo del hilo (montaje de la página) no se salta: el paso se acota
    const dt = Math.min(1 / 30, (now - last) / 1000);
    last = now;
    t += dt;

    if (t > 0.1 && t < exitAt) {
      grow.to(1);
      y.to(REST_Y + (t > 1 ? 0.012 * Math.sin((t - 1) * 2.4) : 0)); // flota mientras espera
      spin.to(t > 1 ? 0.22 * Math.sin((t - 1) * 1.3) : 0);
    }
    if (!wobbled && t > 0.45) {
      wobbled = true;
      tilt.v = 4.5; // llega con impulso: se balancea
    }
    if (!introFired && t > 0.9) {
      introFired = true;
      introDone();
    }

    // Salida: se agacha (anticipación), salta girando y la capa sube y se la lleva
    const e = t - exitAt;
    if (e >= 0) y.to(REST_Y - 0.05, 300, 22);
    if (e >= 0.12) {
      y.to(REST_Y + 0.22, 160, 13);
      spin.to(Math.PI, 90, 12);
    }
    if (e >= REVEAL_AT && !root.classList.contains('is-out')) reveal();
    if (e >= EXIT_MS / 1000) {
      resolveDone();
      return;
    }

    // Muelles con subpasos (estables aunque el fotograma llegue tarde)
    for (let i = 0, n = Math.ceil(dt / (1 / 240)); i < n; i++) {
      const h = dt / n;
      grow.step(h);
      y.step(h);
      spin.step(h);
      tilt.step(h);
    }

    const k = Math.max(0.001, grow.x);
    // Se estira al subir rápido y se aplasta al frenar (como un `scaleY` ligado a la velocidad)
    const sy = 1 + THREE.MathUtils.clamp(y.v * 0.045, -0.12, 0.18);
    hanger.scale.set(k / Math.sqrt(sy), k * sy, k / Math.sqrt(sy));
    hanger.position.y = y.x;
    hanger.rotation.set(0, spin.x, tilt.x * 0.12);
    // Sombra: la base de la percha está ~0,14 m bajo su origen
    const lift = Math.max(0, y.x - 0.14);
    shadow.scale.setScalar(k * (1.2 - Math.min(0.6, lift)));
    (shadow.material as THREE.MeshBasicMaterial).opacity = Math.min(1, k) * Math.max(0, 1 - lift * 1.2);
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  done.then(() => {
    // Se termina de fundir la capa (CSS) y se libera el contexto WebGL
    setTimeout(() => {
      removeEventListener('resize', resize);
      pmrem.dispose();
      scene.environment?.dispose();
      shadow.geometry.dispose();
      (shadow.material as THREE.Material).dispose();
      shadowTex.dispose();
      // De la percha solo la geometría: sus materiales son los del perchero
      hanger.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      remove();
    }, 50);
  });

  return {
    intro,
    finish() {
      Promise.all([intro, loaded, frames()]).then(() => {
        // Se sale ya, o cuando se cumpla el mínimo (contando lo que dura la salida)
        const wait = Math.max(0, start + MIN_MS - EXIT_MS - performance.now()) / 1000;
        exitAt = t + wait;
      });
    },
  };
}
