const path = require('path');

module.exports = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || '0.0.0.0',
  root: __dirname,
  dataDir: process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data'),
  wordbookDir: path.join(__dirname, 'data', 'wordbooks'),
  get dbFile() {
    return path.join(this.dataDir, 'db.json');
  },
  // 生产环境请通过环境变量注入，用于微信 code2session
  wxAppId: process.env.WX_APPID || '',
  wxAppSecret: process.env.WX_SECRET || '',
  // 无密钥时，微信登录按 dev 账号自动绑定，方便本地联调
  wxDevFallback: process.env.WX_DEV_FALLBACK !== '0',
  defaultDailyGoal: 10,
  maxQuizSize: 20,
};
