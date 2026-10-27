const api = require('../../utils/api');
const cfg = require('../../utils/config');

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function fmtTime(v) {
  if (!v) return '从未登录';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '—';
  return (
    d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
  );
}

Page({
  data: {
    user: {},
    stats: {},
    conn: { ok: false, error: '' },
    baseUrl: '',
    modal: '',
    nicknameInput: '',
    pwd1: '',
    pwd2: '',
    serverInput: '',
    bookTitle: '',
    bookDesc: '',
    membersOpen: false,
    members: [],
  },

  onShow() {
    if (!api.getToken()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.setData({ baseUrl: cfg.getBaseUrl() });
    this.loadMe();
    this.loadHealth();
  },

  async onPullDownRefresh() {
    await Promise.all([this.loadMe(), this.loadHealth()]);
    wx.stopPullDownRefresh();
  },

  async loadMe() {
    try {
      const res = await api.get('/api/me');
      this.setData({ user: res.user, stats: res.stats || {} });
    } catch (e) {
      wx.showToast({ title: e.message, icon: 'none' });
    }
  },

  async loadHealth() {
    try {
      const res = await api.get('/api/health');
      this.setData({
        conn: { ok: true, wordbooks: res.wordbooks, words: res.words, error: '' },
      });
    } catch (e) {
      this.setData({ conn: { ok: false, error: e.message } });
    }
  },

  openModal(e) {
    const key = e.currentTarget.dataset.key;
    if (key === 'nickname') {
      this.setData({ modal: key, nicknameInput: this.data.user.nickname || '' });
    } else if (key === 'password') {
      this.setData({ modal: key, pwd1: '', pwd2: '' });
    } else if (key === 'server') {
      this.setData({ modal: key, serverInput: '' });
    } else if (key === 'book') {
      this.setData({ modal: key, bookTitle: '', bookDesc: '' });
    }
  },

  closeModal() {
    this.setData({ modal: '' });
  },

  stopTap() {},

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },

  async saveNickname() {
    const nickname = this.data.nicknameInput.trim();
    if (!nickname) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }
    try {
      const res = await api.post('/api/me/update', { nickname });
      this.setData({ user: res.user, modal: '' });
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: e.message, icon: 'none' });
    }
  },

  async savePassword() {
    const pwd1 = this.data.pwd1;
    const pwd2 = this.data.pwd2;
    if (pwd1.length < 6) {
      wx.showToast({ title: '密码至少 6 位', icon: 'none' });
      return;
    }
    if (pwd1 !== pwd2) {
      wx.showToast({ title: '两次输入的密码不一致', icon: 'none' });
      return;
    }
    try {
      const res = await api.post('/api/me/update', { password: pwd1 });
      this.setData({ user: res.user, modal: '', pwd1: '', pwd2: '' });
      wx.showToast({
        title: '已保存，下次可用账号 ' + res.user.account + ' + 新密码登录',
        icon: 'none',
        duration: 3000,
      });
    } catch (e) {
      wx.showToast({ title: e.message, icon: 'none' });
    }
  },

  async saveServer() {
    const value = this.data.serverInput.trim();
    if (value && !/^http/i.test(value)) {
      wx.showToast({ title: '地址需以 http 开头', icon: 'none' });
      return;
    }
    cfg.setBaseUrl(value);
    this.setData({ baseUrl: cfg.getBaseUrl(), modal: '' });
    wx.showToast({
      title: value ? '已保存' : '已恢复默认地址',
      icon: 'success',
    });
    this.loadHealth();
  },

  async createBook() {
    const title = this.data.bookTitle.trim();
    if (!title) {
      wx.showToast({ title: '请输入词库名称', icon: 'none' });
      return;
    }
    try {
      await api.post('/api/admin/books', {
        title,
        description: this.data.bookDesc.trim(),
      });
      this.setData({ modal: '', bookTitle: '', bookDesc: '' });
      wx.showToast({ title: '已创建公共词库', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: e.message, icon: 'none' });
    }
  },

  toggleMembers() {
    const open = !this.data.membersOpen;
    this.setData({ membersOpen: open });
    if (open && this.data.members.length === 0) {
      this.loadMembers();
    }
  },

  async loadMembers() {
    try {
      const res = await api.get('/api/admin/users');
      const members = (res.users || []).map((u) => ({
        ...u,
        roleText: u.role === 'admin' ? '管理员' : '普通用户',
        lastLoginText: fmtTime(u.lastLoginAt),
      }));
      this.setData({ members });
    } catch (e) {
      wx.showToast({ title: e.message, icon: 'none' });
    }
  },

  async setRole(e) {
    const userId = e.currentTarget.dataset.id;
    const current = e.currentTarget.dataset.role;
    const role = current === 'admin' ? 'user' : 'admin';
    try {
      await api.post('/api/admin/users/update', { userId, role });
      wx.showToast({ title: '已更新', icon: 'success' });
      this.loadMembers();
    } catch (e2) {
      wx.showToast({ title: e2.message, icon: 'none' });
    }
  },

  resetPassword(e) {
    const userId = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name || '该成员';
    wx.showModal({
      title: '重置密码',
      content: '确定把「' + name + '」的密码重置为 123456 吗？',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await api.post('/api/admin/users/update', { userId, resetPassword: '123456' });
          wx.showToast({ title: '已重置为 123456', icon: 'success' });
        } catch (e2) {
          wx.showToast({ title: e2.message, icon: 'none' });
        }
      },
    });
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      success: async (r) => {
        if (!r.confirm) return;
        await api.logout();
        wx.reLaunch({ url: '/pages/login/login' });
      },
    });
  },
});
