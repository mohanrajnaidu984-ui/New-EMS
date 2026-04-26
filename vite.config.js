import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  /** Must match `PORT` in server/.env (Express). Default 5001. */
  const apiPort = String(env.VITE_API_PORT || env.VITE_DEV_API_PORT || '5001').trim() || '5001'
  const apiTarget = `http://127.0.0.1:${apiPort}`

  return {
    plugins: [react()],
    server: {
      /** Stable URL for bookmarks; if busy Vite tries the next port (strictPort: false). */
      port: 5174,
      strictPort: false,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
          /** Quote PDF (Puppeteer) can run longer than the default proxy timeout */
          timeout: 600000,
          proxyTimeout: 600000,
        },
        '/uploads': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})
