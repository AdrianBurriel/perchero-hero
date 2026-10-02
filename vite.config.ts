import { defineConfig } from 'vite';

// Dos páginas: portada (perchero) y Shop the look
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        shop: 'shop-the-look.html',
      },
    },
  },
});
