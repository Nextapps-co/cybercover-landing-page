import { defineConfig } from 'vitest/config';

// Note: no @vitejs/plugin-react here — Phase 1-3 tests cover only lib/ (.ts files,
// no JSX). If component tests get added later, install plugin-react then. The
// Astro project itself uses vite 7 (bundled with astro); keeping plugin-react at
// top level forces vite 8 and breaks @tailwindcss/vite compatibility.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});
