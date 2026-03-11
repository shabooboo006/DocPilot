import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      // @hocuspocus/provider is an optional superdoc peer dep for Hocuspocus
      // collaboration; we use y-websocket directly and don't need it at runtime.
      external: ['@hocuspocus/provider'],
    },
  },
})
