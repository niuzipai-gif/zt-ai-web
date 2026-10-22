import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { voiceVadAssets } from './tools/voice-vad-assets.mjs'
import { gatewayWarmup } from './tools/gateway-warmup.mjs'

export default defineConfig({
  plugins: [react(), voiceVadAssets(), gatewayWarmup()],
  base: process.env.GITHUB_PAGES_BUILD === 'true' || process.env.GITHUB_ACTIONS ? '/zt-ai-web/' : '/',
  server: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    proxy: { '/api': process.env.VITE_GATEWAY_URL || 'http://localhost:8790' },
  },
})
