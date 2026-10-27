const api = require('../../utils/api');
const speak = require('../../utils/speak');

const MODES = [
  { key: 'choice', label: '看中文选单词' },
  { key: 'meaning', label: '看单词选中文' },
  { key: 'spelling', label: '听写拼写' },
];
const COUNTS = [5, 10, 20];

Page({
  data: {
    stage: 'setup',
    modes: MODES,
    counts: COUNTS,
    mode: 'choice',
    limit: 10,
    loading: false,
    error: '',
    questions: [],
    index: 0,
    current: null,
    options: [],
    picked: '',
    spelled: '',
    judged: null,
    correct: 0,
    results: null,
  },

  setMode(e) {
    this.setData({ mode: e.currentTarget.dataset.key });
  },

  setLimit(e) {
    this.setData({ limit: Number(e.currentTarget.dataset.n) });
  },

  start() {
    this.setData({ loading: true, error: '' });
    api
      .get('/api/quiz', { mode: this.data.mode, limit: this.data.limit })
      .then((res) => {
        if (!res.questions || !res.questions.length) {
          this.setData({ loading: false, error: '这个词库词太少，先去词库页多导入一些单词吧' });
          return;
        }
        this.answers = [];
        this.startTime = Date.now();
        this.setData({ loading: false, stage: 'quiz', questions: res.questions, index: 0, correct: 0 });
        this.render(0);
      })
      .catch((e) => this.setData({ loading: false, error: e.message || '出题失败' }));
  },

  render(i) {
    const q = this.data.questions[i];
    if (!q) return this.finish();
    this.cardStart = Date.now();
    this.setData({
      stage: 'quiz',
      index: i,
      current: q,
      options: q.options || [],
      picked: '',
      spelled: '',
      judged: null,
    });
  },

  onSpell(e) {
    this.setData({ spelled: e.detail.value });
  },

  playAudio() {
    if (this.data.current) speak.speak(this.data.current.answer || this.data.current.stem);
  },

  pick(e) {
    if (this.data.judged) return;
    const value = e.currentTarget.dataset.opt;
    const q = this.data.current;
    const ok = value === q.answer;
    this.setData({ picked: value, judged: ok });
    this.record(q, value, ok);
  },

  submitSpell() {
    const q = this.data.current;
    if (!this.data.spelled.trim()) return;
    const value = this.data.spelled.trim();
    const ok = value.toLowerCase().replace(/\s+/g, '') === q.answer.toLowerCase().replace(/\s+/g, '');
    this.setData({ judged: ok });
    this.record(q, value, ok);
  },

  record(q, value, ok) {
    this.answers.push({ wordId: q.wordId, type: q.type, value, confident: ok, seconds: Math.round((Date.now() - this.cardStart) / 1000) });
    this.setData({ correct: this.data.correct + (ok ? 1 : 0) });
  },

  next() {
    if (this.data.index + 1 >= this.data.questions.length) return this.finish();
    this.render(this.data.index + 1);
  },

  finish() {
    speak.stop();
    if (this.data.stage === 'result') return;
    this.setData({ stage: 'result', loading: true });
    api
      .post('/api/quiz/answers', { answers: this.answers || [] })
      .then((res) => {
        const total = res.total || this.answers.length || 0;
        this.setData({
          loading: false,
          stage: 'result',
          results: res.results || [],
          score: { total, correct: res.correct, percent: total ? Math.round((res.correct / total) * 100) : 0, seconds: Math.round((Date.now() - this.startTime) / 1000) },
        });
      })
      .catch((e) => this.setData({ loading: false, stage: 'result', results: [], score: { total: this.answers.length, correct: this.data.correct, percent: 0 }, error: e.message }));
  },

  again() {
    this.setData({ stage: 'setup', results: null, current: null });
    this.start();
  },

  toStudy() {
    this.setData({ stage: 'setup', results: null, current: null });
  },
});
