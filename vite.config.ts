import { defineConfig } from 'vite';

// Dos páginas: portada (perchero) y Shop the look
export default defineConfig({
  build: {
    target: 'es2022', // await en el nivel superior: la página espera a la intro de la carga
    rollupOptions: {
      input: {
        main: 'index.html',
        shop: 'shop-the-look.html',
      },
    },
  },
});
