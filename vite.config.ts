import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy WebSocket upgrade requests to the Node.js server
      '/': {
        target: 'http://localhost:3000',
        ws: true,
        configure: (proxy) => {
          proxy.on('upgrade', () => {
            console.log('WebSocket upgrade request proxied to Node.js server');
          });
        },
      },
    },
  },
})
