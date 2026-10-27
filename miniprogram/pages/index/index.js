const api = require('../../utils/api');
const fmt = require('../../utils/format');

Page({
  data: {
    loading: true,
    error: '',
    hello: '',
    greeting: '',
    day: null,
    counts: null,
    streak: 0,
    percent: 0,
    bookNames: '',
    canCheckIn: false,
    checking: false,
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    const hour = new Date().getHours();
    this.setData({
      loading: true,
      error: '',
      greeting: hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好',
    });
    return Promise.all([api.get('/api/study/queue'), api.get('/api/books'), api.get('/api/me').catch(() => null)])
      .then(([q, b, me]) => {
        const selected = (b.books || []).filter((x) => x.selected);
        this.setData({
          loading: false,
          day: q.day,
          counts: q.counts,
          streak: q.streak || (me && me.stats && me.stats.streak) || 0,
          percent: fmt.percent(q.day.done, q.day.goal),
          remaining: q.remaining,
          bookNames: selected.map((x) => x.title).join('、') || '还没有选择词库',
          canCheckIn: q.day.done > 0 && !q.day.checkIn,
          hello: me && me.user ? me.user.nickname || '学习者' : '学习者',
        });
      })
      .catch((e) => {
        this.setData({ loading: false, error: e.message || '加载失败' });
      });
  },

  startStudy() {
    if (!this.data.day) return;
    wx.navigateTo({ url: '/pages/study/study' });
  },

  startQuiz() {
    wx.navigateTo({ url: '/pages/quiz/quiz' });
  },

  goBooks() {
    wx.switchTab({ url: '/pages/books/books' });
  },

  goStats() {
    wx.switchTab({ url: '/pages/stats/stats' });
  },

  checkIn() {
    if (this.data.checking) return;
    this.setData({ checking: true });
    api
      .post('/api/checkin', {})
      .then((res) => {
        wx.showToast({ title: `已打卡 ${res.streak} 天`, icon: 'none' });
        this.setData({ checking: false });
        return this.load();
      })
      .catch((e) => {
        this.setData({ checking: false });
        wx.showToast({ title: e.message, icon: 'none' });
      });
  },
});
