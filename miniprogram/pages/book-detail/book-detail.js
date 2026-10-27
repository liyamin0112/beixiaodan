const api = require('../../utils/api');
const fmt = require('../../utils/format');

const SIZE = 50;
const EMPTY_FORM = { word: '', meaning: '', phonetic: '', pos: '', example: '', exampleCn: '' };
const SAMPLE = [
  'word,meaning,phonetic,pos,example,example_cn',
  'apple,苹果,ˈæpl,n.,I eat an apple every day.,我每天吃一个苹果。',
  'bridge,桥,brɪdʒ,n.,The bridge is very old.,这座桥很旧。',
].join('\n');

function decorate(w) {
  const st = fmt.status(w.status);
  return Object.assign({}, w, {
    label: st.label,
    cls: st.cls,
    brief: (w.pos ? w.pos + ' ' : '') + (w.meaning || ''),
  });
}

Page({
  data: {
    id: '',
    title: '',
    readonly: false,
    kw: '',
    words: [],
    page: 1,
    total: 0,
    noMore: false,
    loading: false,
    error: '',
    addVisible: false,
    importVisible: false,
    form: EMPTY_FORM,
    csv: '',
    sample: SAMPLE,
    saving: false,
    importing: false,
    importResult: '',
    skippedText: '',
  },

  onLoad(options) {
    const id = options.id || '';
    let title = options.title || '';
    try {
      title = decodeURIComponent(title);
    } catch (e) {
      title = options.title || '';
    }
    this.setData({ id, title });
    if (title) wx.setNavigationBarTitle({ title });
    this.init();
  },

  onShow() {
    if (!this.inited) return;
    this.loadWords(1);
  },

  onUnload() {
    if (this.timer) clearTimeout(this.timer);
  },

  onReachBottom() {
    if (this.data.noMore || this.data.loading) return;
    this.loadWords(this.data.page + 1);
  },

  async init() {
    if (!this.data.id) {
      this.setData({ loading: false, error: '缺少词库参数，请从词库页重新进入' });
      return;
    }
    await this.loadBookFlag();
    await this.loadWords(1);
    this.inited = true;
  },

  async loadBookFlag() {
    try {
      const res = await api.get('/api/books');
      const hit = (res.books || []).filter((b) => b.id === this.data.id)[0];
      if (!hit) return;
      const title = this.data.title || hit.title;
      this.setData({ readonly: hit.source === 'builtin', title });
      if (title) wx.setNavigationBarTitle({ title });
    } catch (e) {
      wx.showToast({ title: e.message || '词库信息加载失败', icon: 'none' });
    }
  },

  async loadWords(page) {
    if (!this.data.id) return;
    this.setData({ loading: true });
    wx.showLoading({ title: '加载中' });
    try {
      const res = await api.get('/api/books/' + this.data.id + '/words', { page, size: SIZE, kw: this.data.kw });
      wx.hideLoading();
      const words = (res.words || []).map(decorate);
      const merged = page > 1 ? this.data.words.concat(words) : words;
      this.setData({
        words: merged,
        total: res.total || 0,
        page: res.page || page,
        noMore: words.length < SIZE || merged.length >= (res.total || 0),
        error: '',
        loading: false,
      });
    } catch (e) {
      wx.hideLoading();
      this.setData({ loading: false, error: page > 1 ? this.data.error : e.message || '单词加载失败' });
      wx.showToast({ title: e.message || '单词加载失败', icon: 'none' });
    }
  },

  onTapRetry() {
    this.loadWords(1);
  },

  onSearchInput(e) {
    const kw = e.detail.value;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.setData({ kw });
      this.loadWords(1);
    }, 300);
  },

  onSearchConfirm(e) {
    if (this.timer) clearTimeout(this.timer);
    this.setData({ kw: e.detail.value });
    this.loadWords(1);
  },

  onTapWord(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: '/pages/word-detail/word-detail?id=' + this.data.id + '&wordId=' + encodeURIComponent(id) + '&title=' + encodeURIComponent(this.data.title || ''),
    });
  },

  onFormInput(e) {
    const field = e.currentTarget.dataset.field;
    const form = Object.assign({}, this.data.form);
    form[field] = e.detail.value;
    this.setData({ form });
  },

  onTapAdd() {
    this.setData({ addVisible: true, form: Object.assign({}, EMPTY_FORM) });
  },

  onTapCloseAdd() {
    this.setData({ addVisible: false });
  },

  async onTapSaveWord() {
    if (this.data.saving) return;
    const f = this.data.form;
    const word = String(f.word || '').trim();
    const meaning = String(f.meaning || '').trim();
    if (!word || !meaning) {
      wx.showToast({ title: '请填写单词和释义', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    wx.showLoading({ title: '加载中' });
    try {
      await api.post('/api/books/' + this.data.id + '/words', {
        word,
        meaning,
        phonetic: String(f.phonetic || '').trim(),
        pos: String(f.pos || '').trim(),
        example: String(f.example || '').trim(),
        example_cn: String(f.exampleCn || '').trim(),
      });
      wx.hideLoading();
      this.setData({ saving: false, addVisible: false });
      wx.showToast({ title: '已添加', icon: 'none' });
      await this.loadWords(1);
    } catch (e) {
      wx.hideLoading();
      this.setData({ saving: false });
      wx.showToast({ title: e.message || '添加失败', icon: 'none' });
    }
  },

  onTapImport() {
    this.setData({ importVisible: true, importResult: '', skippedText: '' });
  },

  onTapCloseImport() {
    this.setData({ importVisible: false });
  },

  onCsvInput(e) {
    this.setData({ csv: e.detail.value });
  },

  onTapCopySample() {
    wx.setClipboardData({
      data: SAMPLE,
      success() {
        wx.showToast({ title: '示例已复制', icon: 'none' });
      },
      fail() {
        wx.showToast({ title: '复制失败', icon: 'none' });
      },
    });
  },

  async onTapSubmitImport() {
    if (this.data.importing) return;
    const data = String(this.data.csv || '').trim();
    if (!data) {
      wx.showToast({ title: '请先粘贴或输入内容', icon: 'none' });
      return;
    }
    this.setData({ importing: true });
    wx.showLoading({ title: '导入中' });
    try {
      const res = await api.post('/api/books/' + this.data.id + '/import', { data });
      wx.hideLoading();
      const skipped = res.skipped || [];
      this.setData({
        importing: false,
        csv: '',
        importResult: '新增 ' + (res.created || 0) + ' 个，更新 ' + (res.updated || 0) + ' 个',
        skippedText: skipped.length ? '已存在的单词更新了释义：' + skipped.slice(0, 8).map((s) => s.word).join('、') : '',
      });
      await this.loadWords(1);
    } catch (e) {
      wx.hideLoading();
      this.setData({ importing: false });
      wx.showToast({ title: e.message || '导入失败', icon: 'none' });
    }
  },

  noop() {},
});
