import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  server: {
    allowedHosts: true, // This allows your Cloudflare tunnel to connect safely!
    proxy: {
      // Local dev equivalent of what Caddy does in production: forwards
      // relative /api/* calls to the local `dotnet run` process instead of
      // needing an absolute URL baked into the frontend. Port must match
      // backend/BucketSolutionsAPI/Properties/launchSettings.json.
      '/api': {
        target: 'http://localhost:5284',
        changeOrigin: true,
      }
    }
  }
})