import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

const API_TARGET = process.env.VITE_API_PROXY ?? 'http://localhost:4000';

// REST calls and the Socket.IO connection are both proxied in development,
// mirroring production where Express serves the client from the same origin.
const proxy = {
  '/api': API_TARGET,
  '/health': API_TARGET,
  '/socket.io': { target: API_TARGET, ws: true },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5175, proxy },
  preview: { port: 4175, proxy },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /node_modules[\/](react|react-dom|scheduler|react-router)[\/]/,
            },
            {
              name: 'data',
              test: /node_modules[\/](@tanstack|zod|react-hook-form|@hookform)[\/]/,
            },
            { name: 'socket', test: /node_modules[\/](socket\.io-client|engine\.io|@socket\.io)/ },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
