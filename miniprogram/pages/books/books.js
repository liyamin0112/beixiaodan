const api = require('../../utils/api');

Page({
  data: {
    loading: true,
    error: '',
    bookCount: 0,
    wordCount: 0,
    builtinBooks: [],
    myBooks: [],
    createVisible: false,
    form: { title: '', description: '' },
    saving: false,
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  async load() {
    wx.showLoading({ title: '加载中' });
    try {
      const res = await api.get('/api/books');
      wx.hideLoading();
      const books = res.books || [];
      let wordCount = 0;
      books.forEach((b) => {
        wordCount += b.count || 0;
      });
      this.setData({
        builtinBooks: books.filter((b) => b.source === 'builtin'),
        myBooks: books.filter((b) => b.source !== 'builtin'),
        bookCount: books.length,
        wordCount,
        error: '',
        loading: false,
      });
    } catch (e) {
      wx.hideLoading();
      this.setData({ loading: false, error: e.message || '词库加载失败' });
      wx.showToast({ title: e.message || '词库加载失败', icon: 'none' });
    }
  },

  onTapRetry() {
    this.load();
  },

  onTapBook(e) {
    const id = e.currentTarget.dataset.id;
    const title = e.currentTarget.dataset.title || '';
    wx.navigateTo({ url: '/pages/book-detail/book-detail?id=' + id + '&title=' + encodeURIComponent(title) });
  },

  async onTapSelect(e) {
    const id = e.currentTarget.dataset.id;
    const all = this.data.builtinBooks.concat(this.data.myBooks);
    const hit = all.filter((b) => b.id === id)[0];
    if (!hit) return;
    const want = !hit.selected;
    const bookIds = all.filter((b) => (b.id === id ? want : b.selected)).map((b) => b.id);
    if (!bookIds.length) {
      wx.showToast({ title: '至少选一本', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '加载中' });
    try {
      await api.post('/api/me/update', { bookIds });
      wx.hideLoading();
      this.applySelected(bookIds);
      wx.showToast({ title: '已切换', icon: 'none' });
    } catch (e2) {
      wx.hideLoading();
      wx.showToast({ title: e2.message || '切换失败', icon: 'none' });
    }
  },

  applySelected(bookIds) {
    const mark = (b) => Object.assign({}, b, { selected: bookIds.indexOf(b.id) >= 0 });
    this.setData({
      builtinBooks: this.data.builtinBooks.map(mark),
      myBooks: this.data.myBooks.map(mark),
    });
  },

  onTapCreate() {
    this.setData({ createVisible: true, form: { title: '', description: '' } });
  },

  onTapCloseCreate() {
    this.setData({ createVisible: false });
  },

  onFormField(e) {
    const field = e.currentTarget.dataset.field;
    const form = Object.assign({}, this.data.form);
    form[field] = e.detail.value;
    this.setData({ form });
  },

  async onTapSubmitCreate() {
    if (this.data.saving) return;
    const title = String(this.data.form.title || '').trim();
    if (!title) {
      wx.showToast({ title: '请填写词库名称', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    wx.showLoading({ title: '加载中' });
    try {
      await api.post('/api/books', { title, description: String(this.data.form.description || '').trim() });
      wx.hideLoading();
      this.setData({ saving: false, createVisible: false });
      wx.showToast({ title: '已创建', icon: 'none' });
      await this.load();
    } catch (e) {
      wx.hideLoading();
      this.setData({ saving: false });
      wx.showToast({ title: e.message || '创建失败', icon: 'none' });
    }
  },

  noop() {},
});
