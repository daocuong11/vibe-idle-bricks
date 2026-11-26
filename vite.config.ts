import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/vibe-idle-bricks/',
  build: {
    // Phaser is a deferred engine chunk; the startup bundle stays small. The
    // limit covers the engine chunk itself, which is loaded behind Suspense.
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'phaser-engine', test: /node_modules[\\/]phaser/ },
            { name: 'game-engine', test: /src[\\/]game[\\/]|src[\\/]components[\\/]PhaserGame/ },
          ],
        },
      },
    },
  },
})
