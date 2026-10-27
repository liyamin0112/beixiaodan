const api = require('../../utils/api');
const speak = require('../../utils/speak');

const RATINGS = [
  { label: '不认识', value: 0, cls: 'btn--danger' },
  { label: '有点忘', value: 1, cls: 'btn--ghost' },
  { label: '记得', value: 2, cls: 'btn' },
  { label: '很熟', value: 3, cls: 'btn--primary' },
];

Page({
  data: {
    loading: true,
    error: '',
    finished: false,
    card: null,
    revealed: false,
    again: [],
    seen: 0,
    right: 0,
    day: { done: 0, goal: 0 },
    percent: 0,
    ratings: RATINGS,
    checkingIn: false,
    checkedIn: false,
  },

  onLoad() {
    this.startedAt = Date.now();
    this.fetch();
  },

  onUnload() {
    speak.stop();
  },

  onHide() {
    speak.stop();
  },

  fetch() {
    if (this.data.again.length) {
      const card = this.data.again.shift();
      this.showCard(card);
      return Promise.resolve();
    }
    this.setData({ loading: true });
    return api
      .get('/api/study/queue')
      .then((res) => {
        if (!res.card) return this.setData({ loading: false, finished: true, day: res.day });
        this.setData({ loading: false, day: res.day, counts: res.counts, percent: Math.min(100, Math.round((res.day.done / res.day.goal) * 100)) });
        this.showCard(res.card);
      })
      .catch((e) => this.setData({ loading: false, error: e.message || '加载失败' }));
  },

  showCard(card) {
    this.startedAt = Date.now();
    this.setData({ card, revealed: false, loading: false, error: '' });
  },

  reveal() {
    this.setData({ revealed: true });
  },

  play() {
    if (this.data.card) speak.speak(this.data.card.word);
  },

  grade(e) {
    const rating = Number(e.currentTarget.dataset.rating);
    const card = this.data.card;
    if (!card) return;
    const seconds = Math.round((Date.now() - this.startedAt) / 1000);
    api
      .post('/api/study/grade', { wordId: card.id, rating, seconds })
      .then((res) => {
        const again = this.data.again.slice();
        const seen = this.data.seen + 1;
        const right = this.data.right + (rating >= 2 ? 1 : 0);
        if (rating === 0) {
          again.push(Object.assign({}, card, { status: res.status }));
        }
        this.setData({ again, seen, right, day: res.day });
        if (res.day.done >= res.day.goal && !again.length) return this.setData({ finished: true });
        return this.fetch();
      })
      .catch((e) => wx.showToast({ title: e.message, icon: 'none' }));
  },

  checkIn() {
    if (this.data.checkingIn) return;
    this.setData({ checkingIn: true });
    api
      .post('/api/checkin', {})
      .then((res) => {
        this.setData({ checkingIn: false, checkedIn: true, streak: res.streak });
        wx.showToast({ title: '已打卡', icon: 'success' });
      })
      .catch((e) => {
        this.setData({ checkingIn: false });
        wx.showToast({ title: e.message, icon: 'none' });
      });
  },

  restart() {
    this.setData({ finished: false, again: [] });
    this.fetch();
  },

  goQuiz() {
    wx.redirectTo({ url: '/pages/quiz/quiz' });
  },

  back() {
    wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/index/index' }) });
  },
});
