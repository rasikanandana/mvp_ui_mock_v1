import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base works under any GitHub Pages subpath
export default defineConfig({
  plugins: [react()],
  base: './',
})
