import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  envDir: path.resolve(__dirname, '..'),
  plugins: [react(), tailwindcss()],
  server: {
    port: 6173,
  },
  build: {
    rollupOptions: {
      // @hocuspocus/provider is an optional superdoc peer dep for Hocuspocus
      // collaboration; we use y-websocket directly and don't need it at runtime.
      external: ['@hocuspocus/provider'],
    },
  },
})
