import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  publicDir: 'public',
  // Use relative paths for Electron
  base: './',
  build: {
    copyPublicDir: true,
    outDir: 'dist'
  }
})
