import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    open: false,
    host: true,
    proxy: {
      '/api': 'http://localhost:3001',
      '/hooks': 'http://localhost:3001',
    },
  },
});
