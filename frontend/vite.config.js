import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Surface proxy failures instead of leaving the browser with an opaque 500 /
// WebSocket error when the backend is not running.
function logProxyErrors(label, target) {
  return (proxy) => {
    proxy.on('error', (error) => {
      console.error(
        `[vite] ${label} proxy -> ${target} failed: ${error.message}. Is the backend running?`
      )
    })
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        configure: logProxyErrors('/api', 'http://localhost:5001'),
      },
      '/ws': {
        target: 'ws://localhost:5001',
        ws: true,
        configure: logProxyErrors('/ws', 'ws://localhost:5001'),
      },
    },
  },
})
