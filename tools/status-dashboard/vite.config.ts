import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: path.resolve(__dirname),
  server: { port: 3001, open: true },
  envDir: path.resolve(__dirname),
});
