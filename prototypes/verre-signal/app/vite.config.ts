import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  css: { postcss: {} }, // Tailwind passe par son plugin ; sans ça Vite irait chercher le postcss.config de Leon plus haut
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
