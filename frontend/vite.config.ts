import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset URLs: pywebview serves dist/ from its own little HTTP server.
  base: './',
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true },
  // One local bundle loaded from disk: chunk size doesn't matter here.
  build: { chunkSizeWarningLimit: 1500 },
})
