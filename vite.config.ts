import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Hosted on Vercel, served from the domain root, so this defaults to "/" and
// normally doesn't need setting. VITE_BASE_PATH is kept as an escape hatch in
// case this ever needs to serve from a subpath (e.g. a GitHub Pages project site).
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
