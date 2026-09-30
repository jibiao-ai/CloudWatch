// PM2 配置（仅沙箱预览用）：托管 vite preview（先 npm run build）
module.exports = {
  apps: [{
    name: 'cloudwatch-web',
    script: 'npx',
    args: 'vite preview --host 0.0.0.0 --port 3000 --strictPort',
    cwd: __dirname,
    env: { NODE_ENV: 'production' },
    watch: false, instances: 1, exec_mode: 'fork',
  }],
};
