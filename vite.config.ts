import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: true,
    allowedHosts: true,
  },
  css: {
    modules: {
      generateScopedName: '[name]__[local]'
    }
  },
  build: {
    // Increase chunk size warning limit (audio references are large)
    chunkSizeWarningLimit: 2000,
  }
})
