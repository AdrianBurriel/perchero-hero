import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createHanger } from '../stage';

/* Pantalla de carga: fondo oscuro en el que se abre un hoyo (como el de un green) y del que sale
   una percha en 3D, movida con muelles al estilo Framer Motion. Dura lo que tarde la página en
   estar lista y nunca menos de MIN_MS. La intro acaba con la percha quieta en el aire: en ese
   momento la página monta su perchero, que bloquea el hilo un instante sin que se note. */

const MIN_MS = 1500;      // duración mínima total (intro + espera + salida)
const EXIT_MS = 700;      // salida: la percha sale disparada, el hoyo se cierra y se funde
const HOLE_R = 0.22;      // radio del hoyo (m); la percha mide 0,36 de ancho
const CUP_DEPTH = 0.42;
const REST_Y = 0.3;       // altura de la percha en reposo (origen = arriba del gancho)
const START_Y = -CUP_DEPTH + 0.17;
const BG = '#12110f';
const SPOT = '#2a2620';   // suelo bajo el foco

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
  camera.position.set(0, 1, 3);
  camera.lookAt(0, 0.16, 0);
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    // En vertical se aleja un poco para que quepan el hoyo y el giro de la percha
    camera.zoom = Math.min(1, camera.aspect / 0.75);
    camera.updateProjectionMatrix();
  };
  resize();
  addEventListener('resize', resize);

  // Suelo: foco suave que se funde con el fondo, con el hoyo recortado (radio animado) y su labio
  const holeR = { value: 0 };
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 14).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      uniforms: { uR: holeR, uBg: { value: new THREE.Color(BG) }, uSpot: { value: new THREE.Color(SPOT) } },
      vertexShader: `varying vec2 vP;
        void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uR; uniform vec3 uBg; uniform vec3 uSpot; varying vec2 vP;
        void main() {
          float d = length(vP);
          if (d < uR) discard;
          vec3 c = mix(uSpot, uBg, smoothstep(0.0, 1.5, d));
          c *= 1.0 - 0.35 * (1.0 - smoothstep(uR, uR + 0.05, d)); // sombra en el borde del hoyo
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  scene.add(ground);

  // Taza del hoyo (por dentro): pared oscura, borde blanco como en los greens y fondo negro
  const cup = new THREE.Group();
  const wall = new THREE.MeshStandardMaterial({ color: '#2b2824', roughness: 0.9, side: THREE.BackSide });
  const liner = new THREE.MeshStandardMaterial({ color: '#e7e2d8', roughness: 0.6, side: THREE.BackSide });
  const pit = new THREE.MeshBasicMaterial({ color: '#050505' });
  const wallMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, CUP_DEPTH, 48, 1, true), wall);
  wallMesh.position.y = -CUP_DEPTH / 2;
  const linerMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.995, 0.995, 0.035, 48, 1, true), liner);
  linerMesh.position.y = -0.03;
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), pit);
  bottom.position.y = -CUP_DEPTH;
  cup.add(wallMesh, linerMesh, bottom);
  scene.add(cup);

  // La percha del perchero
  const { hook, frame } = createHanger();
  const hanger = new THREE.Group();
  hanger.add(hook, frame);
  scene.add(hanger);

  /* ---------- Movimiento ---------- */
  const hole = new Spring(0, 260, 17);          // escala del hoyo: se abre con un pequeño rebote
  const y = new Spring(START_Y, 230, 16);       // sube con rebote
  const spin = new Spring(0, 120, 15);          // da una vuelta mientras sale
  const tilt = new Spring(0, 140, 5);           // bamboleo al salir del hoyo
  let out = false;                              // ya ha cruzado el borde del hoyo
  let t = 0;                                    // tiempo de la animación (s, con dt acotado)
  let introDone: () => void;
  const intro = new Promise<void>((r) => (introDone = r));
  let introFired = false;
  let exitAt = Infinity;                        // t en que empieza la salida
  let resolveDone: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));

  let last = performance.now();
  const tick = (now: number) => {
    // Tras un bloqueo del hilo (montaje de la página) no se salta: el paso se acota
    const dt = Math.min(1 / 30, (now - last) / 1000);
    last = now;
    t += dt;

    if (t > 0.05) hole.to(1);
    if (t > 0.22 && t < exitAt) {
      y.to(REST_Y + (t > 0.9 ? 0.012 * Math.sin((t - 0.9) * 2.4) : 0)); // flota mientras espera
      spin.to(Math.PI * 2 + (t > 0.9 ? 0.22 * Math.sin((t - 0.9) * 1.3) : 0));
    }
    if (!out && y.x > -0.05) {
      out = true;
      tilt.v = 4.5; // sale del hoyo de golpe: se balancea
    }
    if (!introFired && t > 0.85) {
      introFired = true;
      introDone();
    }

    // Salida: se agacha (anticipación), sale disparada hacia arriba girando y el hoyo se cierra
    const e = t - exitAt;
    if (e >= 0) y.to(REST_Y - 0.05, 300, 22);
    if (e >= 0.13) {
      y.to(2.6, 160, 14);
      spin.to(Math.PI * 3, 90, 12);
    }
    if (e >= 0.22) hole.to(0, 320, 28);
    if (e >= 0.3 && !root.classList.contains('is-out')) reveal();
    if (e >= EXIT_MS / 1000) {
      resolveDone();
      return;
    }

    // Muelles con subpasos (estables aunque el fotograma llegue tarde)
    for (let i = 0, n = Math.ceil(dt / (1 / 240)); i < n; i++) {
      const h = dt / n;
      hole.step(h);
      y.step(h);
      spin.step(h);
      tilt.step(h);
    }

    holeR.value = HOLE_R * Math.max(0, hole.x);
    cup.scale.set(Math.max(0.001, holeR.value), 1, Math.max(0.001, holeR.value));
    cup.visible = holeR.value > 0.002;
    hanger.position.y = y.x;
    hanger.rotation.set(0, spin.x, tilt.x * 0.12);
    // Se estira al subir rápido y se aplasta al frenar (como un `scaleY` ligado a la velocidad)
    const sy = 1 + THREE.MathUtils.clamp(y.v * 0.045, -0.12, 0.18);
    hanger.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
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
      for (const m of [ground, wallMesh, linerMesh, bottom]) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
      // De la percha solo la geometría: sus materiales son los del perchero
      hanger.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      remove();
    }, 250);
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
