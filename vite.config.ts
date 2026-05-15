import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

// Post-build plugin: fix HTML output paths and copy manifest + icons
const postBuildPlugin = {
  name: 'post-build-fix',
  closeBundle() {
    // Move HTML files from dist/src/viewer/ to dist/viewer/
    const moves = [
      {
        from: 'dist/src/viewer/viewer.html',
        to: 'dist/viewer/viewer.html',
      },
      {
        from: 'dist/src/sidepanel/sidepanel.html',
        to: 'dist/sidepanel/sidepanel.html',
      },
      {
        from: 'dist/src/popup/popup.html',
        to: 'dist/popup/popup.html',
      },
    ];

    for (const { from, to } of moves) {
      if (existsSync(from)) {
        mkdirSync(to.split('/').slice(0, -1).join('/'), { recursive: true });
        copyFileSync(from, to);
        console.log(`✓ Moved ${from} → ${to}`);
      }
    }
  },
};

export default defineConfig({
  plugins: [react(), postBuildPlugin],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  // publicDir maps to dist root automatically
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        viewer: resolve(__dirname, 'src/viewer/viewer.html'),
        sidepanel: resolve(__dirname, 'src/sidepanel/sidepanel.html'),
        popup: resolve(__dirname, 'src/popup/popup.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') return 'background/index.js';
          if (chunkInfo.name === 'viewer') return 'viewer/index.js';
          if (chunkInfo.name === 'sidepanel') return 'sidepanel/index.js';
          if (chunkInfo.name === 'popup') return 'popup/index.js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  optimizeDeps: {
    exclude: ['pdfjs-dist'],
  },
});
