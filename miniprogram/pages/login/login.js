const api = require('../../utils/api');

Page({
  data: {
    formOpen: false,
    account: '',
    password: '',
    err: '',
  },

  toggleForm() {
    this.setData({ formOpen: !this.data.formOpen });
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },

  wxLogin() {
    wx.showLoading({ title: '登录中' });
    this.setData({ err: '' });
    getApp()
      .login()
      .then(() => {
        wx.hideLoading();
        wx.switchTab({ url: '/pages/index/index' });
      })
      .catch((e) => {
        wx.hideLoading();
        const msg = e.message || '登录失败，请稍后再试';
        this.setData({ err: msg });
        wx.showToast({ title: msg, icon: 'none' });
      });
  },

  validate() {
    const account = this.data.account.trim();
    const password = this.data.password;
    if (account.length < 3) {
      wx.showToast({ title: '账号至少 3 个字符', icon: 'none' });
      return null;
    }
    if (password.length < 6) {
      wx.showToast({ title: '密码至少 6 位', icon: 'none' });
      return null;
    }
    return { account, password };
  },

  async doLogin() {
    const form = this.validate();
    if (!form) return;
    wx.showLoading({ title: '登录中' });
    try {
      const res = await api.post('/api/auth/login', form);
      this.afterAuth(res);
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: e.message, icon: 'none' });
    }
  },

  async doRegister() {
    const form = this.validate();
    if (!form) return;
    wx.showLoading({ title: '注册中' });
    try {
      const res = await api.post('/api/auth/register', {
        account: form.account,
        password: form.password,
        nickname: '',
      });
      this.afterAuth(res);
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: e.message, icon: 'none' });
    }
  },

  afterAuth(res) {
    wx.hideLoading();
    api.setToken(res.token);
    getApp().globalData.user = res.user;
    wx.switchTab({ url: '/pages/index/index' });
  },
});
