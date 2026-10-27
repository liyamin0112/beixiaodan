const api = require('./utils/api');

App({
  globalData: {
    user: null,
    launchError: '',
  },

  onLaunch() {
    this.login();
  },

  // 静默用微信身份登录；后端没配 AppID 时会自动落到演示账号，方便本地先看效果
  login() {
    return api
      .ensureLogin()
      .then((res) => {
        this.globalData.user = res.user;
        this.globalData.launchError = '';
        return res;
      })
      .catch((e) => {
        this.globalData.launchError = e.message || '登录失败';
        console.warn('[app] 登录失败', e);
        throw e;
      });
  },
});
