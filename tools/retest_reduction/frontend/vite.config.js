import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const retestApi = {
  '/api': {
    target: 'http://127.0.0.1:8002',
    changeOrigin: true,
  },
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5175,
    strictPort: true,
    proxy: retestApi,
  },
  preview: {
    host: '127.0.0.1',
    port: 5175,
    strictPort: true,
    proxy: retestApi,
  },
})
