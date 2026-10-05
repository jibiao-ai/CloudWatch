import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 开发代理目标可通过环境变量覆盖；生产由 nginx 反代 /api
const proxy = { '/api': { target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8080', changeOrigin: true } };
export default defineConfig({
  plugins: [react()],
  server: { host: '0.0.0.0', port: 3000, allowedHosts: true, proxy },
  preview: { host: '0.0.0.0', port: 3000, allowedHosts: true, proxy },
  build: {
    target: ['chrome80', 'edge80', 'firefox78', 'safari13'], // 兼容内网旧版浏览器（转译 ||= 等新语法）
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
