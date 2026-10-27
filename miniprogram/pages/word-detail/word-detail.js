const api = require('../../utils/api');
const fmt = require('../../utils/format');
const speak = require('../../utils/speak');

const EMPTY_FORM = { word: '', meaning: '', phonetic: '', pos: '', example: '', exampleCn: '' };

function clean(v) {
  return String(v || '').trim();
}

Page({
  data: {
    bookId: '',
    wordId: '',
    bookTitle: '',
    word: null,
    book: null,
    st: null,
    dueText: '',
    loading: true,
    error: '',
    editVisible: false,
    form: EMPTY_FORM,
    saving: false,
    adding: false,
  },

  onLoad(options) {
    let title = options.title || '';
    try {
      title = decodeURIComponent(title);
    } catch (e) {
      title = options.title || '';
    }
    this.setData({
      bookId: options.id || '',
      wordId: clean(options.wordId),
      bookTitle: title,
    });
    this.load();
  },

  async load() {
    if (!this.data.bookId || !this.data.wordId) {
      this.setData({ loading: false, error: '缺少单词参数，请从词库页重新进入' });
      return;
    }
    this.setData({ loading: true });
    wx.showLoading({ title: '加载中' });
    try {
      const res = await api.get('/api/books/' + this.data.bookId + '/words/' + encodeURIComponent(this.data.wordId));
      wx.hideLoading();
      const w = res.word || {};
      const book = res.book || {};
      this.setData({
        word: w,
        book,
        st: fmt.status(w.status),
        dueText: w.due ? fmt.dayText(w.due) : '',
        error: '',
        loading: false,
      });
      if (w.word) wx.setNavigationBarTitle({ title: w.word });
    } catch (e) {
      wx.hideLoading();
      this.setData({ loading: false, error: e.message || '单词加载失败' });
      wx.showToast({ title: e.message || '单词加载失败', icon: 'none' });
    }
  },

  onTapRetry() {
    this.load();
  },

  onTapSpeak() {
    if (this.data.word) speak.speak(this.data.word.word);
  },

  async onTapAddToMine() {
    if (this.data.adding || !this.data.word) return;
    const w = this.data.word;
    this.setData({ adding: true });
    wx.showLoading({ title: '加载中' });
    try {
      const res = await api.get('/api/books');
      const target = (res.books || []).filter((b) => b.source === 'user')[0];
      if (!target) {
        wx.hideLoading();
        this.setData({ adding: false });
        wx.showToast({ title: '请先在词库页新建自己的词库', icon: 'none' });
        return;
      }
      await api.post('/api/books/' + target.id + '/words', {
        word: w.word,
        meaning: w.meaning,
        phonetic: w.phonetic,
        pos: w.pos,
        example: w.example,
        example_cn: w.exampleCn,
      });
      wx.hideLoading();
      this.setData({ adding: false });
      wx.showToast({ title: '已加入我的词库', icon: 'none' });
    } catch (e) {
      wx.hideLoading();
      this.setData({ adding: false });
      wx.showToast({ title: e.message || '加入失败', icon: 'none' });
    }
  },

  onTapEdit() {
    const w = this.data.word || {};
    this.setData({
      editVisible: true,
      form: {
        word: w.word || '',
        meaning: w.meaning || '',
        phonetic: w.phonetic || '',
        pos: w.pos || '',
        example: w.example || '',
        exampleCn: w.exampleCn || '',
      },
    });
  },

  onTapCloseEdit() {
    this.setData({ editVisible: false });
  },

  onFormInput(e) {
    const field = e.currentTarget.dataset.field;
    const form = Object.assign({}, this.data.form);
    form[field] = e.detail.value;
    this.setData({ form });
  },

  async onTapSaveEdit() {
    if (this.data.saving || !this.data.word) return;
    const f = this.data.form;
    const word = clean(f.word);
    const meaning = clean(f.meaning);
    if (!word || !meaning) {
      wx.showToast({ title: '请填写单词和释义', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    wx.showLoading({ title: '加载中' });
    try {
      await api.post('/api/words/update', {
        wordId: this.data.word.id,
        word,
        meaning,
        phonetic: clean(f.phonetic),
        pos: clean(f.pos),
        example: clean(f.example),
        example_cn: clean(f.exampleCn),
      });
      wx.hideLoading();
      this.setData({ saving: false, editVisible: false });
      wx.showToast({ title: '已保存', icon: 'none' });
      await this.load();
    } catch (e) {
      wx.hideLoading();
      this.setData({ saving: false });
      wx.showToast({ title: e.message || '保存失败', icon: 'none' });
    }
  },

  onTapDelete() {
    if (!this.data.word) return;
    const wordText = this.data.word.word || '';
    wx.showModal({
      title: '删除单词',
      content: '确定要把「' + wordText + '」从词库里删掉吗？',
      confirmText: '删除',
      confirmColor: '#D94B4B',
      success: (r) => {
        if (r.confirm) this.doDelete();
      },
      fail: () => {
        wx.showToast({ title: '操作失败', icon: 'none' });
      },
    });
  },

  async doDelete() {
    wx.showLoading({ title: '加载中' });
    try {
      await api.post('/api/words/delete', { wordId: this.data.word.id });
      wx.hideLoading();
      wx.showToast({ title: '已删除', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: e.message || '删除失败', icon: 'none' });
    }
  },

  noop() {},
});
