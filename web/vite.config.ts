import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@devcon-plus/supabase': path.resolve(__dirname, 'src/types'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/react-router') ||
            id.includes('/node_modules/scheduler/')
          ) return 'vendor-react'

          if (
            id.includes('/node_modules/framer-motion/') ||
            id.includes('/node_modules/@motionone/')
          ) return 'vendor-motion'

          if (id.includes('/node_modules/@supabase/')) return 'vendor-supabase'
        },
      },
    },
  },
})
