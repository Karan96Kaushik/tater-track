import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  // The secret shares the VITE_ prefix, so a .env file would otherwise ship it
  // to the browser. Lambdas read it from Amplify SSM, not from this bundle.
  define: {
    'import.meta.env.VITE_SUPABASE_SECRET_KEY_TATER': 'undefined',
  },
});
