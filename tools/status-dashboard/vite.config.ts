import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' && !process.env.VERCEL ? '/monitor/' : '/',
  root: path.resolve(__dirname),
  resolve: {
    alias: {
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    },
  },
  server: {
    port: 3002,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  },
  envDir: path.resolve(__dirname),
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          recharts: ['recharts'],
        },
      },
    },
  },
}));
