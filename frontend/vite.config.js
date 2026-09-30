import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 开发代理目标可通过环境变量覆盖；生产由 nginx 反代 /api
const proxy = { '/api': { target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8080', changeOrigin: true } };
export default defineConfig({
  plugins: [react()],
  server: { host: '0.0.0.0', port: 3000, allowedHosts: true, proxy },
  preview: { host: '0.0.0.0', port: 3000, allowedHosts: true, proxy },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
        },
      },
    },
  },
});
