import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 8080,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true
      }
    }
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/main.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: (assetInfo) => {
          const originalName = assetInfo.names && assetInfo.names[0] ? assetInfo.names[0] : assetInfo.name || '';
          if (originalName.endsWith('.css')) {
            return 'assets/main.css';
          }
          return 'assets/[name]-[hash][extname]';
        }
      },
    }
  }
});
