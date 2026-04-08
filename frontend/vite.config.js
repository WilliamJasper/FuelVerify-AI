import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const configDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, configDir, '')
  let raw = env.VITE_BASE_PATH || process.env.VITE_BASE_PATH || '/'
  if (mode === 'iis' && (raw === '/' || raw === '')) {
    raw = '/FuelVerifyAI/'
  }
  if (raw !== '/' && raw !== '' && !raw.endsWith('/')) {
    raw = `${raw}/`
  }
  const base = raw === '' ? '/' : raw

  return {
    base,
    plugins: [react()],
    server: {
      port: 5175,
      strictPort: true,
      proxy: {
        '/upload': { target: 'http://127.0.0.1:5004', changeOrigin: true },
        '/upload-slip': { target: 'http://127.0.0.1:5004', changeOrigin: true },
        '/upload-slip-progress': { target: 'http://127.0.0.1:5004', changeOrigin: true },
      },
    },
  }
})
