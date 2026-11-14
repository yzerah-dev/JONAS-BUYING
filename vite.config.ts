import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Version Artifact : un seul fichier JS (tout est ensuite intégré dans la page)
const artifact = !!process.env.VITE_ARTIFACT

export default defineConfig({
  base: './',
  plugins: [react()],
  build: artifact ? { rollupOptions: { output: { inlineDynamicImports: true } } } : undefined,
})
