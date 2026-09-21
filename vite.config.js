import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(() => {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'client/src'),
      },
    },
    server: {
      port,
      host: '0.0.0.0',
      allowedHosts: true,
      strictPort: false,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    preview: {
      port,
      host: '0.0.0.0',
      allowedHosts: true,
      strictPort: false,
    },
  };
});
