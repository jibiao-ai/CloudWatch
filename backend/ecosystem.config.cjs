// 本地 / 沙箱预览用：仅引导项走环境变量，业务参数都在「系统配置」页面录入并存库。
module.exports = {
  apps: [{
    name: 'cloudwatch-api',
    script: './bin/cloudwatch-api',
    cwd: __dirname,
    env: {
      CW_ADDR: ':8080',
      CW_DB_DSN: 'cloudwatch:cloudwatch_dev@tcp(127.0.0.1:3306)/cloudwatch',
      CW_SEED_DEMO: 'true',
    },
    autorestart: true, watch: false,
  }],
};
