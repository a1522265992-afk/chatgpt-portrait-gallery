import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(() => {
  return {
    base: '/', // ai.photooapp.com 自定义域名部署在根路径（github.io/prompt-gallery/ 已 301 至该域名）
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: false,
      rollupOptions: {
        output: {
          // 按依赖拆分 chunk，提升缓存命中率
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('react') || id.includes('scheduler') || id.includes('react-router')) return 'react-vendor';
            if (id.includes('motion')) return 'motion';
            if (id.includes('lucide')) return 'icons';
            return undefined;
          },
        },
      },
    },
  };
});
