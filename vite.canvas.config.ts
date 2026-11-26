import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vite';
import base from './vite.config.ts';

export default mergeConfig(base, {
  resolve: {
    alias: [{
      find: './components/PhaserGame',
      replacement: fileURLToPath(new URL('./src/spikes/CanvasGame.tsx', import.meta.url)),
    }],
  },
});
