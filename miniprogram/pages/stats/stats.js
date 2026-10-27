const api = require('../../utils/api');
const fmt = require('../../utils/format');

const STATUS_KEYS = ['new', 'learning', 'review', 'mastered'];
const STATUS_COLORS = {
  new: '#C9CFDB',
  learning: '#F0A44B',
  review: '#7E97F5',
  mastered: '#2FAE6A',
};
const CHART_H = 190;
const COL_W = 70;
const GOAL_MIN = 5;
const GOAL_MAX = 200;
const GOAL_STEP = 5;
const LIMIT_MIN = 0;
const LIMIT_MAX = 100;
const LIMIT_STEP = 1;

Page({
  data: {
    loading: true,
    error: '',
    streak: 0,
    hasToday: false,
    todayText: '',
    todayDetail: '',
    todayPct: 0,
    todayTag: '',
    todayTagCls: 'tag--gray',
    bars: [],
    chartWidth: 0,
    hasHistory: false,
    segments: [],
    legend: [],
    total: 0,
    cells: [],
    dailyGoal: 10,
    newWordLimit: 10,
    goalDownDisabled: false,
    goalUpDisabled: false,
    limitDownDisabled: false,
    limitUpDisabled: false,
    saving: false,
    saveDisabled: true,
  },

  onLoad() {
    this.fetching = false;
    this.loadedOnce = false;
    this.originGoal = 10;
    this.originLimit = 10;
    this.fetch(false);
  },

  onShow() {
    if (this.loadedOnce) this.fetch(true);
  },

  onPullDownRefresh() {
    const done = () => wx.stopPullDownRefresh();
    this.fetch(true).then(done, done);
  },

  fetch(silent) {
    if (this.fetching) return Promise.resolve();
    this.fetching = true;
    if (!silent) {
      this.setData({ loading: true, error: '' });
      wx.showLoading({ title: '加载中', mask: true });
    }
    return Promise.all([api.get('/api/stats'), api.get('/api/me')])
      .then((res) => {
        this.fetching = false;
        this.loadedOnce = true;
        if (!silent) wx.hideLoading();
        this.applyStats(res[0]);
        this.applyMe(res[1]);
      })
      .catch((e) => {
        this.fetching = false;
        const msg = (e && e.message) || '加载失败，请稍后重试';
        if (!silent) {
          wx.hideLoading();
          this.setData({ loading: false, error: msg });
        } else if (this.loadedOnce) {
          wx.showToast({ title: msg, icon: 'none' });
        } else {
          this.setData({ loading: false, error: msg });
        }
      });
  },

  applyStats(res) {
    const s = res || {};
    const today = s.today || null;
    const chart = this.buildChart(s.history || []);
    const dist = this.buildDist(s.byStatus || {}, s.total || 0);
    const patch = {
      loading: false,
      error: '',
      streak: s.streak || 0,
      hasToday: !!today,
      todayText: '',
      todayDetail: '',
      todayPct: 0,
      todayTag: '',
      todayTagCls: 'tag--gray',
      bars: chart.bars,
      chartWidth: chart.width,
      hasHistory: chart.bars.length > 0,
      segments: dist.segments,
      legend: dist.legend,
      total: s.total || 0,
      cells: [
        { label: '累计学习', value: String(s.learned || 0) },
        { label: '已掌握', value: String(s.mastered || 0) },
        { label: '待复习', value: String(s.due || 0) },
        { label: '总准确率', value: (s.accuracy || 0) + '%' },
        { label: '打卡天数', value: String(s.totalDays || 0) },
        {
          label: '今日时长',
          value: today ? fmt.minutes(today.seconds) + ' 分钟' : '0 分钟',
        },
      ],
    };
    if (today) {
      patch.todayText = today.done + '/' + today.goal + ' 个';
      patch.todayDetail = '对 ' + today.correct + ' · 错 ' + today.wrong;
      patch.todayPct = fmt.percent(today.done, today.goal);
      patch.todayTag = today.checkIn ? '已打卡' : '未打卡';
      patch.todayTagCls = today.checkIn ? 'tag--green' : 'tag--gray';
    }
    this.setData(patch);
  },

  buildChart(history) {
    let max = 0;
    history.forEach((it) => {
      if (it.done > max) max = it.done;
    });
    const bars = history.map((it, i) => {
      let height = 6;
      if (max > 0 && it.done > 0) {
        height = Math.max(6, Math.round((it.done / max) * CHART_H));
      }
      let cls = 'chart__bar--none';
      if (it.done > 0) cls = it.done >= it.goal ? 'chart__bar--good' : 'chart__bar--part';
      const showLabel = i % 5 === 4 || i === history.length - 1;
      return {
        date: it.date,
        height: height,
        cls: cls,
        label: showLabel ? fmt.md(it.date) : '',
        tip: fmt.md(it.date) + ' · 学 ' + it.done + ' 个 · 对 ' + it.correct + ' 错 ' + it.wrong,
      };
    });
    return { bars: bars, width: bars.length * COL_W };
  },

  buildDist(byStatus, total) {
    const segments = [];
    const legend = [];
    let acc = 0;
    STATUS_KEYS.forEach((k, idx) => {
      const count = (byStatus && byStatus[k]) || 0;
      let pct = 0;
      if (total > 0) {
        pct = idx === STATUS_KEYS.length - 1 ? 100 - acc : Math.round((count / total) * 1000) / 10;
        acc += pct;
      }
      if (count > 0 && pct > 0) {
        segments.push({
          key: k,
          style: 'width:' + pct + '%;background:' + STATUS_COLORS[k],
        });
      }
      legend.push({
        key: k,
        label: fmt.status(k).label,
        count: count,
        dotStyle: 'background:' + STATUS_COLORS[k],
      });
    });
    return { segments: segments, legend: legend };
  },

  applyMe(res) {
    const u = (res && res.user) || {};
    const goal = u.dailyGoal == null ? 10 : u.dailyGoal;
    const limit = u.newWordLimit == null ? 10 : u.newWordLimit;
    this.originGoal = goal;
    this.originLimit = limit;
    this.setData({ dailyGoal: goal, newWordLimit: limit, saving: false });
    this.syncSteps();
  },

  syncSteps() {
    const g = this.data.dailyGoal;
    const l = this.data.newWordLimit;
    this.setData({
      goalDownDisabled: g <= GOAL_MIN,
      goalUpDisabled: g >= GOAL_MAX,
      limitDownDisabled: l <= LIMIT_MIN,
      limitUpDisabled: l >= LIMIT_MAX,
      saveDisabled: this.data.saving || (g === this.originGoal && l === this.originLimit),
    });
  },

  onStep(e) {
    const field = e.currentTarget.dataset.field;
    const dir = Number(e.currentTarget.dataset.dir);
    if (field === 'goal') {
      const next = this.data.dailyGoal + dir * GOAL_STEP;
      if (next < GOAL_MIN || next > GOAL_MAX) return;
      this.setData({ dailyGoal: next });
    } else {
      const next = this.data.newWordLimit + dir * LIMIT_STEP;
      if (next < LIMIT_MIN || next > LIMIT_MAX) return;
      this.setData({ newWordLimit: next });
    }
    this.syncSteps();
  },

  onSave() {
    if (this.data.saveDisabled || this.data.saving) return;
    this.setData({ saving: true });
    this.syncSteps();
    wx.showLoading({ title: '保存中', mask: true });
    api
      .post('/api/me/update', {
        dailyGoal: this.data.dailyGoal,
        newWordLimit: this.data.newWordLimit,
      })
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '已保存', icon: 'success' });
        this.fetch(true);
      })
      .catch((e) => {
        wx.hideLoading();
        this.setData({ saving: false });
        this.syncSteps();
        wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' });
      });
  },

  onTapBar(e) {
    const bar = this.data.bars[e.currentTarget.dataset.i];
    if (bar) wx.showToast({ title: bar.tip, icon: 'none' });
  },

  onRetry() {
    this.fetch(false);
  },
});
