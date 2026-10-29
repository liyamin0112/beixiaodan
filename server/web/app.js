'use strict';

/* ============================================================
   背小单 H5 版
   与微信小程序共用同一套后端接口与账号数据，无任何外部依赖。
   ============================================================ */

const TOKEN_KEY = 'bx_token';

const appEl = document.getElementById('app');
const tabbarEl = document.getElementById('tabbar');
const toastEl = document.getElementById('toast');
const modalRoot = document.getElementById('modal-root');

const state = {
  user: null,
  loginMode: 'login',
};

let renderSeq = 0;
let scrollHandler = null;
let sheetClose = null;

/* ---------------- 图标 ---------------- */

const ICONS = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18 6a8.5 8.5 0 0 1 0 12"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.6 2.6L16 9.5"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M14 6l3 3"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="10" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V12M10 20V5M16 20v-6M22 20H2"/></svg>',
  server: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.5a3 3 0 0 1 0 5.8M17 14a5.5 5.5 0 0 1 4 5.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
};

/* ---------------- 基础工具 ---------------- */

function token() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

function setToken(value) {
  if (value) localStorage.setItem(TOKEN_KEY, value);
  else localStorage.removeItem(TOKEN_KEY);
}

function clearAuth() {
  setToken('');
  state.user = null;
}

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
  });
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch (e) {
    return value;
  }
}

function errText(e) {
  return (e && e.message) || '操作失败，请稍后重试';
}

function statusOf(status) {
  const map = {
    new: { label: '未学', cls: 'gray' },
    learning: { label: '学习中', cls: 'orange' },
    review: { label: '复习中', cls: 'blue' },
    mastered: { label: '已掌握', cls: 'green' },
  };
  return map[status] || map.new;
}

function md(dateStr) {
  return dateStr ? String(dateStr).slice(5).replace('-', '/') : '';
}

function dayText(ts) {
  if (!ts) return '还没安排复习';
  const diff = ts - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  if (mins < 60) return diff > 0 ? mins + ' 分钟后' : mins + ' 分钟前';
  const days = Math.round(abs / 86400000);
  if (days < 1) return diff > 0 ? '稍后' : '已到期';
  if (days === 1) return diff > 0 ? '明天' : '昨天';
  if (days < 30) return diff > 0 ? days + ' 天后' : days + ' 天前';
  const months = Math.round(days / 30);
  return diff > 0 ? months + ' 个月后' : months + ' 个月前';
}

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

function fmtDateTime(ts) {
  if (!ts) return '从未登录';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

function todayLabel() {
  const d = new Date();
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  return d.getMonth() + 1 + ' 月 ' + d.getDate() + ' 日 · 周' + week;
}

function audioUrl(word) {
  return 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(word) + '&type=1';
}

let audioEl = null;

function speak(url) {
  if (!url) return;
  try {
    if (audioEl) audioEl.pause();
    audioEl = new Audio(url);
    const playing = audioEl.play();
    if (playing && playing.catch) {
      playing.catch(function () {
        toast('发音加载失败，请检查网络');
      });
    }
  } catch (e) {
    toast('当前浏览器不支持播放');
  }
}

/* ---------------- 接口 ---------------- */

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const t = token();
  if (t) headers['X-Token'] = t;

  let res;
  try {
    res = await fetch(path, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    const err = new Error('连不上服务器，请确认后端已启动');
    err.status = 0;
    throw err;
  }

  let data = {};
  try {
    data = await res.json();
  } catch (e) {
    data = {};
  }

  if (res.status === 401 && path.indexOf('/api/auth/') !== 0 && path.indexOf('/api/health') !== 0) {
    clearAuth();
    if (location.hash !== '#/login') location.hash = '#/login';
    const err = new Error(data.error || '登录已过期，请重新登录');
    err.status = 401;
    throw err;
  }

  if (!res.ok || data.ok === false) {
    const err = new Error(data.error || '请求失败(' + res.status + ')');
    err.status = res.status;
    throw err;
  }
  return data;
}

function apiGet(path) {
  return request('GET', path);
}

function apiPost(path, body) {
  return request('POST', path, body || {});
}

/* ---------------- 渲染与提示 ---------------- */

function render(html, opts) {
  opts = opts || {};
  if (scrollHandler) {
    window.removeEventListener('scroll', scrollHandler);
    scrollHandler = null;
  }
  appEl.className = 'app' + (opts.tab ? '' : ' app--notab') + (opts.login ? ' app--login' : '');
  appEl.innerHTML = html;
  tabbarEl.hidden = !opts.tab;
  if (opts.tab) {
    Array.prototype.forEach.call(tabbarEl.querySelectorAll('.tab'), function (el) {
      el.classList.toggle('active', el.dataset.tab === opts.tabKey);
    });
  }
  window.scrollTo(0, 0);
}

let toastTimer = null;

function toast(message, kind) {
  toastEl.textContent = message;
  toastEl.className = 'toast show' + (kind ? ' toast--' + kind : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    toastEl.className = 'toast';
  }, 2200);
}

function setBusy(btn, busy, text) {
  if (!btn) return;
  if (busy) {
    if (btn.dataset.idle == null) btn.dataset.idle = btn.textContent;
    btn.disabled = true;
    btn.textContent = text || '请稍候…';
  } else {
    btn.disabled = false;
    if (btn.dataset.idle != null) {
      btn.textContent = btn.dataset.idle;
      delete btn.dataset.idle;
    }
  }
}

function openSheet(title, body, mount) {
  closeSheet();
  const mask = document.createElement('div');
  mask.className = 'sheet-mask';
  mask.innerHTML =
    '<div class="sheet" role="dialog" aria-modal="true">' +
    '<div class="sheet__head"><h2>' + esc(title) + '</h2><button class="icon-btn" type="button" data-sheet-close aria-label="关闭">×</button></div>' +
    '<div class="sheet__body">' + body + '</div>' +
    '</div>';
  modalRoot.appendChild(mask);

  const close = function () {
    if (mask.parentNode) mask.parentNode.removeChild(mask);
    if (sheetClose === close) sheetClose = null;
  };
  sheetClose = close;

  mask.addEventListener('click', function (e) {
    if (e.target === mask) close();
  });
  mask.querySelector('[data-sheet-close]').addEventListener('click', close);

  if (mount) mount(mask.querySelector('.sheet'), close);

  const firstInput = mask.querySelector('input, textarea');
  if (firstInput) {
    setTimeout(function () {
      firstInput.focus();
    }, 140);
  }
  return close;
}

function closeSheet() {
  if (sheetClose) sheetClose();
}

function confirmBox(title, message, okText) {
  return new Promise(function (resolve) {
    const wrap = document.createElement('div');
    wrap.className = 'sheet-mask sheet-mask--top';
    wrap.innerHTML =
      '<div class="sheet sheet--confirm">' +
      '<h2 class="sheet__title">' + esc(title) + '</h2>' +
      '<p class="confirm-text">' + esc(message) + '</p>' +
      '<div class="sheet__actions">' +
      '<button class="btn btn--ghost" type="button" data-no>取消</button>' +
      '<button class="btn btn--danger" type="button" data-yes>' + esc(okText || '确定') + '</button>' +
      '</div></div>';
    modalRoot.appendChild(wrap);

    let done = false;
    const finish = function (value) {
      if (done) return;
      done = true;
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      resolve(value);
    };
    wrap.addEventListener('click', function (e) {
      if (e.target === wrap) finish(false);
    });
    wrap.querySelector('[data-no]').addEventListener('click', function () {
      finish(false);
    });
    wrap.querySelector('[data-yes]').addEventListener('click', function () {
      finish(true);
    });
  });
}

function topbar(title, meta) {
  return (
    '<header class="topbar">' +
    '<button class="icon-btn" type="button" data-back aria-label="返回">' + ICONS.back + '</button>' +
    '<h1>' + esc(title) + '</h1>' +
    (meta ? '<span class="topbar__meta">' + esc(meta) + '</span>' : '') +
    '</header>'
  );
}

function renderError(e) {
  render(
    '<div class="center-screen">' +
      '<div class="empty-icon">!</div>' +
      '<p class="empty-title">暂时打不开</p>' +
      '<p class="empty-text">' + esc(errText(e)) + '</p>' +
      '<button class="btn btn--primary" type="button" id="err-retry" style="margin-top:14px">重试</button>' +
      '</div>',
    { tab: false }
  );
  const btn = document.getElementById('err-retry');
  if (btn) btn.onclick = function () { route(); };
}

/* ---------------- 路由 ---------------- */

function currentRoute() {
  const raw = (location.hash || '#/today').replace(/^#/, '');
  const clean = raw.split('?')[0];
  const seg = clean.split('/').filter(Boolean);
  return { page: seg[0] || 'today', seg: seg };
}

async function route() {
  const seq = ++renderSeq;
  const alive = function () { return seq === renderSeq; };
  closeSheet();

  const r = currentRoute();
  if (r.page === 'login') {
    renderLogin(alive);
    return;
  }
  if (!token()) {
    renderLogin(alive);
    return;
  }

  try {
    if (!state.user) {
      const me = await apiGet('/api/me');
      if (!alive()) return;
      state.user = me.user;
    }
  } catch (e) {
    if (!alive()) return;
    if (e.status === 401) {
      clearAuth();
      renderLogin(alive);
      return;
    }
    renderError(e);
    return;
  }

  switch (r.page) {
    case 'today':
      viewToday(alive);
      break;
    case 'study':
      viewStudy(alive);
      break;
    case 'quiz':
      viewQuiz(alive);
      break;
    case 'books':
      viewBooks(alive);
      break;
    case 'book':
      viewBook(alive, safeDecode(r.seg[1] || ''));
      break;
    case 'word':
      viewWord(alive, safeDecode(r.seg[1] || ''), safeDecode(r.seg[2] || ''));
      break;
    case 'stats':
      viewStats(alive);
      break;
    case 'mine':
      viewMine(alive);
      break;
    default:
      location.hash = '#/today';
  }
}

/* ============================================================
   登录 / 注册
   ============================================================ */

function renderLogin(alive) {
  document.title = '登录 · 背小单';
  const isReg = state.loginMode === 'register';

  render(
    '<section class="login">' +
      '<div class="login__logo">背</div>' +
      '<h1 class="login__title">背小单</h1>' +
      '<p class="login__sub">每天一点点，单词记得牢</p>' +
      '<div class="card login__card">' +
        '<div class="seg">' +
          '<button class="seg__item' + (isReg ? '' : ' active') + '" type="button" data-mode="login">登录</button>' +
          '<button class="seg__item' + (isReg ? ' active' : '') + '" type="button" data-mode="register">注册</button>' +
        '</div>' +
        '<label class="field"><span>账号</span><input id="login-acc" class="input" autocomplete="username" placeholder="至少 3 个字符" maxlength="24"></label>' +
        '<label class="field"><span>密码</span><input id="login-pwd" class="input" type="password" autocomplete="' + (isReg ? 'new-password' : 'current-password') + '" placeholder="至少 6 位"></label>' +
        (isReg ? '<label class="field"><span>昵称（可选）</span><input id="login-nick" class="input" placeholder="怎么称呼你" maxlength="24"></label>' : '') +
        '<p id="login-err" class="form-err" hidden></p>' +
        '<button class="btn btn--primary btn--block" type="button" id="login-submit" style="margin-top:18px">' + (isReg ? '注册并登录' : '登录') + '</button>' +
        '<div class="login__demo">' +
          '<p class="muted">没有账号？先用演示账号体验：</p>' +
          '<div class="login__demo-btns">' +
            '<button class="btn btn--ghost btn--sm" type="button" data-demo="demo">演示用户 demo</button>' +
            '<button class="btn btn--ghost btn--sm" type="button" data-demo="admin">管理员 admin</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<p class="login__foot">H5 版 · 与微信小程序共用同一份账号和学习记录</p>' +
    '</section>',
    { tab: false, login: true }
  );

  const accEl = document.getElementById('login-acc');
  const pwdEl = document.getElementById('login-pwd');
  const nickEl = document.getElementById('login-nick');
  const errEl = document.getElementById('login-err');
  const submitEl = document.getElementById('login-submit');

  function showError(message) {
    errEl.textContent = message;
    errEl.hidden = false;
  }

  async function submit(account, password, nickname) {
    if (!account || account.length < 3) {
      showError('账号至少 3 个字符');
      return;
    }
    if (!password || password.length < 6) {
      showError('密码至少 6 位');
      return;
    }
    errEl.hidden = true;
    setBusy(submitEl, true, isReg ? '注册中…' : '登录中…');
    try {
      const res = isReg
        ? await apiPost('/api/auth/register', { account: account, password: password, nickname: nickname || '' })
        : await apiPost('/api/auth/login', { account: account, password: password });
      setToken(res.token);
      state.user = res.user;
      state.loginMode = 'login';
      toast('欢迎回来，' + (res.user.nickname || res.user.account || '学习者'), 'ok');
      if (location.hash === '#/today') route();
      else location.hash = '#/today';
    } catch (e) {
      setBusy(submitEl, false);
      showError(errText(e));
    }
  }

  document.querySelectorAll('[data-mode]').forEach(function (btn) {
    btn.onclick = function () {
      state.loginMode = btn.dataset.mode;
      renderLogin(alive);
    };
  });

  submitEl.onclick = function () {
    submit((accEl.value || '').trim(), pwdEl.value || '', nickEl ? (nickEl.value || '').trim() : '');
  };

  [accEl, pwdEl, nickEl].forEach(function (el) {
    if (!el) return;
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submitEl.click();
    });
  });

  document.querySelectorAll('[data-demo]').forEach(function (btn) {
    btn.onclick = function () {
      accEl.value = btn.dataset.demo;
      pwdEl.value = '123456';
      submit(btn.dataset.demo, '123456', '');
    };
  });
}

/* ============================================================
   今天
   ============================================================ */

async function viewToday(alive) {
  document.title = '今天 · 背小单';
  const nick = (state.user && state.user.nickname) || '学习者';

  render(
    '<div class="page-head"><div><p class="page-head__hi">' + greeting() + '</p><h1>' + esc(nick) + '</h1></div></div>' +
    '<div class="view"><div class="card loading-card">正在加载今日任务…</div></div>',
    { tab: true, tabKey: 'today' }
  );

  let q;
  let booksRes;
  let meRes;
  try {
    const out = await Promise.all([
      apiGet('/api/study/queue'),
      apiGet('/api/books').catch(function () { return null; }),
      apiGet('/api/me').catch(function () { return null; }),
    ]);
    q = out[0];
    booksRes = out[1];
    meRes = out[2];
  } catch (e) {
    if (!alive()) return;
    render(
      '<div class="page-head"><div><p class="page-head__hi">' + greeting() + '</p><h1>今天</h1></div></div>' +
      '<div class="view"><div class="card center-block">' +
        '<div class="empty-icon">!</div><p class="empty-title">加载失败</p><p class="empty-text">' + esc(errText(e)) + '</p>' +
        '<button class="btn btn--primary" type="button" id="today-retry" style="margin-top:12px">重试</button>' +
      '</div></div>',
      { tab: true, tabKey: 'today' }
    );
    const retry = document.getElementById('today-retry');
    if (retry) retry.onclick = function () { route(); };
    return;
  }

  if (!alive()) return;
  if (meRes && meRes.user) {
    state.user = meRes.user;
  }

  const books = (booksRes && booksRes.books) || [];
  const selected = books.filter(function (b) { return b.selected; });
  const wordTotal = selected.reduce(function (n, b) { return n + (b.count || 0); }, 0);
  const day = q.day || { goal: 0, done: 0, checkIn: false };
  const counts = q.counts || {};
  const pct = day.goal ? Math.min(100, Math.round((day.done / day.goal) * 100)) : 0;
  const goalDone = day.goal > 0 && day.done >= day.goal;
  const bookLine = selected.length
    ? selected.map(function (b) { return b.title; }).join('、')
    : '还没有选择词库';
  const remainText = goalDone
    ? '今日目标已完成，继续巩固效果更好'
    : q.remaining
      ? '当前队列还剩 ' + q.remaining + ' 张卡片'
      : '准备好就开始今天的学习';

  render(
    '<div class="page-head"><div><p class="page-head__hi">' + greeting() + '，' + esc(nick) + '</p><h1>今天</h1></div>' +
      '<button class="mini-btn" type="button" id="today-refresh">刷新</button></div>' +
    '<div class="view">' +
      '<section class="card hero">' +
        '<div class="hero__top">' +
          '<div><p class="eyebrow">今日任务</p><p class="hero__date">' + todayLabel() + '</p></div>' +
          '<span class="tag ' + (q.streak ? 'green' : 'gray') + '">连续 ' + (q.streak || 0) + ' 天</span>' +
        '</div>' +
        '<div class="hero__body">' +
          '<div class="ring" style="--p:' + pct + '%"><div class="ring__inner"><strong>' + day.done + '</strong><span>目标 ' + day.goal + ' 个</span></div></div>' +
          '<div class="hero__side">' +
            '<div class="hero__line"><span>待复习</span><b>' + (counts.due || 0) + '</b></div>' +
            '<div class="hero__line"><span>新词可学</span><b>' + (counts.fresh || 0) + '</b></div>' +
            '<div class="hero__line"><span>已掌握</span><b>' + (counts.mastered || 0) + '</b></div>' +
          '</div>' +
        '</div>' +
        '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
        '<p class="muted" style="margin:9px 0 0">' + esc(remainText) + '</p>' +
        '<div class="hero__actions">' +
          '<button class="btn btn--primary" type="button" id="go-study"' + (goalDone ? ' disabled' : '') + '>' + (goalDone ? '今日已完成' : '开始学习') + '</button>' +
          '<button class="btn btn--ghost" type="button" id="go-quiz">随堂测验</button>' +
        '</div>' +
        (day.checkIn
          ? '<div class="checked-tag">' + ICONS.check + ' 今日已打卡</div>'
          : '<button class="btn btn--checkin" type="button" id="today-checkin"' + (day.done > 0 ? '' : ' disabled') + '>今日打卡</button>') +
      '</section>' +
      '<section class="card">' +
        '<div class="row-between"><h2 class="card-title">当前词库</h2><a class="link" href="#/books">管理</a></div>' +
        '<p class="books-line">' + esc(bookLine) + '</p>' +
        '<p class="muted" style="margin:4px 0 0">' + selected.length + ' 本 · 共 ' + wordTotal + ' 词</p>' +
      '</section>' +
      '<section class="card tip-card">' +
        '<h2 class="card-title">记忆曲线小提示</h2>' +
        '<p>答“记得 / 很熟”会把复习间隔拉长；答“不认识”的单词会在本轮末尾再出现一次，10 分钟后重新进入复习队列。</p>' +
      '</section>' +
    '</div>',
    { tab: true, tabKey: 'today' }
  );

  const refresh = document.getElementById('today-refresh');
  if (refresh) refresh.onclick = function () { route(); };

  document.getElementById('go-study').onclick = function () {
    location.hash = '#/study';
  };
  document.getElementById('go-quiz').onclick = function () {
    location.hash = '#/quiz';
  };

  const checkin = document.getElementById('today-checkin');
  if (checkin) {
    checkin.onclick = async function () {
      setBusy(checkin, true, '打卡中…');
      try {
        const res = await apiPost('/api/checkin', {});
        toast('已打卡，连续 ' + res.streak + ' 天', 'ok');
        viewToday(alive);
      } catch (e) {
        setBusy(checkin, false);
        toast(errText(e), 'err');
      }
    };
  }
}

/* ============================================================
   背单词
   ============================================================ */

const RATINGS = [
  { value: 0, label: '不认识', hint: '10 分钟后', cls: 'rating--0' },
  { value: 1, label: '有点忘', hint: '明天再复习', cls: 'rating--1' },
  { value: 2, label: '记得', hint: '间隔拉长', cls: 'rating--2' },
  { value: 3, label: '很熟', hint: '更久再见', cls: 'rating--3' },
];

function viewStudy(alive) {
  document.title = '背单词 · 背小单';
  const st = {
    loading: true,
    error: '',
    finished: false,
    card: null,
    revealed: false,
    again: [],
    seen: 0,
    right: 0,
    day: null,
    streak: 0,
    busy: false,
    startedAt: 0,
  };
  loadStudyQueue(st, alive);
}

function renderStudy(st, alive) {
  const day = st.day || { goal: 0, done: 0, checkIn: false };
  const pct = day.goal ? Math.min(100, Math.round((day.done / day.goal) * 100)) : 0;
  let body = '';

  if (st.loading) {
    body = '<div class="center-block"><div class="spinner"></div><p class="muted">正在准备卡片…</p></div>';
  } else if (st.error) {
    body =
      '<div class="center-block"><div class="empty-icon">!</div><p class="empty-title">加载失败</p><p class="empty-text">' +
      esc(st.error) +
      '</p><button class="btn btn--primary" type="button" data-act="retry" style="margin-top:12px">重试</button></div>';
  } else if (st.finished) {
    body = studyFinishHtml(st);
  } else if (st.card) {
    body = studyCardHtml(st);
  }

  render(
    '<section class="study">' +
      '<header class="topbar">' +
        '<button class="icon-btn" type="button" data-back aria-label="返回">' + ICONS.back + '</button>' +
        '<h1>背单词</h1>' +
        '<span class="topbar__meta">今日 ' + day.done + ' / ' + day.goal + '</span>' +
      '</header>' +
      '<div class="study__bar"><div class="bar"><i style="width:' + pct + '%"></i></div></div>' +
      '<div class="study__body">' + body + '</div>' +
    '</section>',
    { tab: false }
  );

  wireStudy(st, alive);
}

function studyCardHtml(st) {
  const c = st.card;
  const stInfo = statusOf(c.status);
  const longCls = String(c.word || '').length > 16 ? ' flash__word--long' : '';
  const meaningBlock = st.revealed
    ? '<div class="flash__divider"></div>' +
      '<div class="flash__meaning">' + esc(c.meaning) + '</div>' +
      (c.example ? '<p class="flash__example">' + esc(c.example) + '</p>' : '') +
      (c.exampleCn ? '<p class="flash__example-cn">' + esc(c.exampleCn) + '</p>' : '')
    : '<p class="flash__hint">先在心里想一想，再显示释义</p>';

  const actions = st.revealed
    ? '<div class="ratings">' +
        RATINGS.map(function (r) {
          return (
            '<button class="rating ' + r.cls + '" type="button" data-rating="' + r.value + '">' +
              r.label + '<span>' + r.hint + '</span>' +
            '</button>'
          );
        }).join('') +
      '</div>'
    : '<button class="btn btn--primary btn--block" type="button" data-act="reveal" style="margin-top:16px">显示释义</button>';

  return (
    '<div class="study__meta">' +
      '<span class="tag ' + stInfo.cls + '">' + stInfo.label + '</span>' +
      (c.pos ? '<span class="tag gray">' + esc(c.pos) + '</span>' : '') +
    '</div>' +
    '<article class="flash' + (st.revealed ? ' flash--revealed' : '') + '">' +
      '<div class="flash__word' + longCls + '">' + esc(c.word) + '</div>' +
      (c.phonetic ? '<div class="flash__phon">' + esc(c.phonetic) + '</div>' : '') +
      '<button class="speak-btn" type="button" data-act="speak">' + ICONS.sound + ' 发音</button>' +
      meaningBlock +
    '</article>' +
    actions +
    '<p class="study__tip">评分越准确，下次复习时间安排得越贴合你的记忆</p>'
  );
}

function studyFinishHtml(st) {
  const day = st.day || { goal: 0, done: 0, checkIn: false };
  const goalDone = day.goal > 0 && day.done >= day.goal;
  const canCheckIn = day.done > 0 && !day.checkIn;
  return (
    '<div class="finish">' +
      '<div class="finish__icon">' + ICONS.check + '</div>' +
      '<h2>' + (goalDone ? '今日目标完成' : '这批卡片学完了') + '</h2>' +
      '<p class="muted">' + (goalDone ? '今天已经学了 ' + day.done + ' 个，保持节奏。' : '当前词库暂时没有更多可学的卡片。') + '</p>' +
      '<div class="finish__stats">' +
        '<div><b>' + day.done + '</b><span>今日完成</span></div>' +
        '<div><b>' + st.seen + '</b><span>过卡次数</span></div>' +
        '<div><b>' + st.right + '</b><span>记得 / 很熟</span></div>' +
        '<div><b>' + (st.streak || 0) + '</b><span>连续天数</span></div>' +
      '</div>' +
      (canCheckIn
        ? '<button class="btn btn--primary btn--block" type="button" data-act="checkin" style="max-width:340px">完成打卡</button>'
        : day.checkIn
          ? '<div class="checked-tag">' + ICONS.check + ' 今日已打卡</div>'
          : '') +
      '<div class="finish__actions" style="margin-top:14px">' +
        '<button class="btn btn--ghost" type="button" data-act="to-quiz">去随堂测验</button>' +
        '<button class="btn btn--ghost" type="button" data-act="to-home">回首页</button>' +
      '</div>' +
    '</div>'
  );
}

function wireStudy(st, alive) {
  const speakBtn = appEl.querySelector('[data-act="speak"]');
  if (speakBtn) {
    speakBtn.onclick = function () {
      if (st.card) speak(st.card.audio || audioUrl(st.card.word));
    };
  }

  const reveal = appEl.querySelector('[data-act="reveal"]');
  if (reveal) {
    reveal.onclick = function () {
      st.revealed = true;
      renderStudy(st, alive);
    };
  }

  appEl.querySelectorAll('[data-rating]').forEach(function (btn) {
    btn.onclick = function () {
      gradeStudy(st, Number(btn.dataset.rating), alive);
    };
  });

  const retry = appEl.querySelector('[data-act="retry"]');
  if (retry) {
    retry.onclick = function () {
      loadStudyQueue(st, alive);
    };
  }

  const checkin = appEl.querySelector('[data-act="checkin"]');
  if (checkin) {
    checkin.onclick = async function () {
      setBusy(checkin, true, '打卡中…');
      try {
        const res = await apiPost('/api/checkin', {});
        st.day = Object.assign({}, st.day, { checkIn: true });
        st.streak = res.streak || st.streak;
        toast('已打卡，连续 ' + (res.streak || 0) + ' 天', 'ok');
        renderStudy(st, alive);
      } catch (e) {
        setBusy(checkin, false);
        toast(errText(e), 'err');
      }
    };
  }

  const toQuiz = appEl.querySelector('[data-act="to-quiz"]');
  if (toQuiz) toQuiz.onclick = function () { location.hash = '#/quiz'; };
  const toHome = appEl.querySelector('[data-act="to-home"]');
  if (toHome) toHome.onclick = function () { location.hash = '#/today'; };
}

async function loadStudyQueue(st, alive) {
  st.loading = true;
  st.error = '';
  st.finished = false;
  renderStudy(st, alive);

  try {
    const res = await apiGet('/api/study/queue');
    if (!alive()) return;
    st.day = res.day;
    st.streak = res.streak || 0;
    st.loading = false;
    if (!res.card) {
      if (st.again.length) {
        st.card = st.again.shift();
        st.revealed = false;
        st.startedAt = Date.now();
      } else {
        st.card = null;
        st.finished = true;
      }
    } else {
      st.card = res.card;
      st.revealed = false;
      st.startedAt = Date.now();
    }
    renderStudy(st, alive);
  } catch (e) {
    if (!alive()) return;
    st.loading = false;
    st.error = errText(e);
    renderStudy(st, alive);
  }
}

async function gradeStudy(st, rating, alive) {
  if (st.busy || !st.card) return;
  st.busy = true;

  const card = st.card;
  const seconds = Math.max(0, Math.round((Date.now() - (st.startedAt || Date.now())) / 1000));
  appEl.querySelectorAll('[data-rating]').forEach(function (btn) {
    btn.disabled = true;
  });

  try {
    const res = await apiPost('/api/study/grade', { wordId: card.id, rating: rating, seconds: seconds });
    if (!alive()) return;

    st.busy = false;
    st.day = {
      date: (st.day && st.day.date) || '',
      goal: res.day.goal,
      done: res.day.done,
      checkIn: res.day.checkIn,
    };
    st.seen += 1;
    if (rating >= 2) st.right += 1;
    if (rating === 0) st.again.push(Object.assign({}, card, { status: res.status }));

    if (st.again.length && (st.day.done >= st.day.goal || !res.hasNext)) {
      st.card = st.again.shift();
      st.revealed = false;
      st.startedAt = Date.now();
      renderStudy(st, alive);
      return;
    }
    if (st.day.done >= st.day.goal || !res.hasNext) {
      st.card = null;
      st.finished = true;
      renderStudy(st, alive);
      return;
    }
    loadStudyQueue(st, alive);
  } catch (e) {
    if (!alive()) return;
    st.busy = false;
    toast(errText(e), 'err');
    renderStudy(st, alive);
  }
}

/* ============================================================
   随堂测验
   ============================================================ */

const QUIZ_MODES = [
  { key: 'choice', label: '看中文选单词', desc: '给出中文释义，从 4 个英文单词里选' },
  { key: 'meaning', label: '看单词选中文', desc: '给出英文单词，选出正确的中文释义' },
  { key: 'spelling', label: '听写拼写', desc: '看释义和提示，把单词拼出来' },
];

const QUIZ_COUNTS = [5, 10, 20];

function viewQuiz(alive) {
  document.title = '随堂测验 · 背小单';
  const st = {
    stage: 'setup',
    mode: 'choice',
    limit: 10,
    loading: false,
    error: '',
    questions: [],
    index: 0,
    answers: [],
    correct: 0,
    startedAt: 0,
    cardStart: 0,
    elapsed: 0,
    judged: null,
    result: null,
  };
  renderQuiz(st, alive);
}

function modeLabel(key) {
  const hit = QUIZ_MODES.filter(function (m) { return m.key === key; })[0];
  return hit ? hit.label : '随堂测验';
}

function renderQuiz(st, alive) {
  let html;
  if (st.stage === 'setup') html = quizSetupHtml(st);
  else if (st.stage === 'quiz') html = quizQuestionHtml(st);
  else html = quizResultHtml(st);

  render(html, { tab: false });
  wireQuiz(st, alive);
}

function quizSetupHtml(st) {
  return (
    topbar('随堂测验') +
    '<div class="view">' +
      '<div class="card">' +
        '<h2 class="card-title">选择题型</h2>' +
        '<div class="mode-grid">' +
          QUIZ_MODES.map(function (m) {
            return (
              '<button class="mode' + (st.mode === m.key ? ' active' : '') + '" type="button" data-mode="' + m.key + '">' +
                '<b>' + m.label + '</b><span>' + m.desc + '</span>' +
              '</button>'
            );
          }).join('') +
        '</div>' +
        '<h2 class="card-title mt">题目数量</h2>' +
        '<div class="chips">' +
          QUIZ_COUNTS.map(function (n) {
            return '<button class="chip' + (st.limit === n ? ' active' : '') + '" type="button" data-limit="' + n + '">' + n + ' 题</button>';
          }).join('') +
        '</div>' +
        '<p class="muted" style="margin:14px 0 0">题目从当前选中的词库随机抽取，答完会立即更新记忆曲线和今日进度。</p>' +
        (st.error ? '<p class="form-err">' + esc(st.error) + '</p>' : '') +
        '<button class="btn btn--primary btn--block" type="button" data-quiz-start style="margin-top:16px"' + (st.loading ? ' disabled' : '') + '>' +
          (st.loading ? '出题中…' : '开始测验') +
        '</button>' +
      '</div>' +
    '</div>'
  );
}

function quizQuestionHtml(st) {
  const q = st.questions[st.index];
  if (!q) return quizSetupHtml(st);
  const total = st.questions.length;
  const pct = Math.round((st.index / total) * 100);
  const isSpell = q.type === 'spelling';
  const wordStem = q.type === 'meaning';

  const answerArea = isSpell
    ? '<div>' +
        '<input id="spell-input" class="input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="输入英文单词" style="margin-top:16px;font-size:20px;letter-spacing:1px"' +
        (st.judged ? ' disabled value="' + esc(st.judged.value) + '"' : '') + '>' +
        '<p class="spell-hint">提示：' + esc(q.hint || '') + '</p>' +
        (st.judged ? '' : '<button class="btn btn--primary btn--block" type="button" data-spell-submit style="margin-top:12px">提交答案</button>') +
      '</div>'
    : '<div>' +
        (q.options || []).map(function (opt, i) {
          let cls = 'option';
          if (st.judged) {
            if (opt === q.answer) cls += ' correct';
            else if (i === st.judged.idx) cls += ' wrong';
          }
          return (
            '<button class="' + cls + '" type="button" data-opt="' + i + '"' + (st.judged ? ' disabled' : '') + '>' +
              '<span class="option__idx">' + 'ABCD'[i] + '</span>' +
              '<span class="option__text">' + esc(opt) + '</span>' +
            '</button>'
          );
        }).join('') +
      '</div>';

  const feedback = st.judged
    ? '<div class="feedback ' + (st.judged.ok ? 'feedback--ok' : 'feedback--bad') + '">' +
        '<div>' + (st.judged.ok ? '答对了' : '答错了') +
          (!st.judged.ok ? '<br><span>正确答案：' + esc(q.answer) + '</span>' : '') +
        '</div>' +
        '<button class="mini-btn" type="button" data-quiz-next>' + (st.index + 1 >= total ? '查看结果' : '下一题') + '</button>' +
      '</div>'
    : '';

  return (
    '<header class="topbar">' +
      '<button class="icon-btn" type="button" data-quiz-back aria-label="返回">' + ICONS.back + '</button>' +
      '<h1>随堂测验</h1>' +
      '<span class="topbar__meta">' + (st.index + 1) + ' / ' + total + '</span>' +
    '</header>' +
    '<div class="quiz-top"><div class="bar"><i style="width:' + pct + '%"></i></div></div>' +
    '<div class="view">' +
      '<p class="eyebrow">' + modeLabel(st.mode) + '</p>' +
      '<div class="card quiz-card">' +
        '<div class="quiz-stem' + (wordStem ? ' quiz-stem--word' : '') + '">' + esc(q.stem) + '</div>' +
        (q.pos ? '<div class="quiz-tags"><span class="tag gray">' + esc(q.pos) + '</span></div>' : '') +
        '<button class="speak-btn" type="button" data-quiz-speak>' + ICONS.sound + ' 听发音</button>' +
        answerArea +
      '</div>' +
      feedback +
    '</div>'
  );
}

function quizResultHtml(st) {
  const r = st.result;
  const total = r ? r.total : st.answers.length;
  const correct = r ? r.correct : st.correct;
  const pct = total ? Math.round((correct / total) * 100) : 0;

  if (st.loading) {
    return (
      topbar('测验结果') +
      '<div class="view"><div class="card loading-card"><div class="spinner" style="margin:0 auto 10px"></div>正在判分并更新记忆曲线…</div></div>'
    );
  }

  const results = (r && r.results) || [];
  return (
    topbar('测验结果') +
    '<div class="view">' +
      '<div class="card score">' +
        '<div class="score__ring" style="--p:' + pct + '%"><div class="score__inner"><strong>' + pct + '</strong><span>得分</span></div></div>' +
        '<p>答对 ' + correct + ' / ' + total + ' 题' + (st.elapsed ? ' · 用时 ' + st.elapsed + ' 秒' : '') + '</p>' +
      '</div>' +
      (results.length
        ? '<div class="card"><h2 class="card-title">答题详情</h2>' +
            results.map(function (item) {
              return (
                '<div class="result-row">' +
                  '<div class="grow">' +
                    '<div class="result-row__word">' + esc(item.word || '') + '</div>' +
                    '<div class="result-row__meaning">' + esc(item.meaning || '') + '</div>' +
                    (!item.correct ? '<div class="result-row__your">你的答案：' + esc(item.yourAnswer || '未作答') + '</div>' : '') +
                  '</div>' +
                  '<span class="tag ' + (item.correct ? 'green' : 'red') + '">' + (item.correct ? '对' : '错') + '</span>' +
                '</div>'
              );
            }).join('') +
          '</div>'
        : '<div class="card"><p class="empty-text">没有作答记录，回去再试一组吧。</p></div>') +
      (st.error ? '<p class="form-err">' + esc(st.error) + '</p>' : '') +
      '<div class="actions-col">' +
        '<button class="btn btn--primary btn--block" type="button" data-quiz-again>再测一组</button>' +
        '<button class="btn btn--ghost btn--block" type="button" data-quiz-study>去背单词</button>' +
        '<button class="btn btn--ghost btn--block" type="button" data-quiz-home>回首页</button>' +
      '</div>' +
    '</div>'
  );
}

function wireQuiz(st, alive) {
  if (st.stage === 'setup') {
    appEl.querySelectorAll('[data-mode]').forEach(function (btn) {
      btn.onclick = function () {
        st.mode = btn.dataset.mode;
        renderQuiz(st, alive);
      };
    });
    appEl.querySelectorAll('[data-limit]').forEach(function (btn) {
      btn.onclick = function () {
        st.limit = Number(btn.dataset.limit);
        renderQuiz(st, alive);
      };
    });
    const start = appEl.querySelector('[data-quiz-start]');
    if (start) start.onclick = function () { startQuiz(st, alive); };
    return;
  }

  if (st.stage === 'quiz') {
    const back = appEl.querySelector('[data-quiz-back]');
    if (back) {
      back.onclick = async function () {
        if (st.answers.length) {
          const ok = await confirmBox('退出测验', '已经答了 ' + st.answers.length + ' 题，退出后本次作答不会保存。', '退出');
          if (!ok) return;
        }
        st.stage = 'setup';
        st.questions = [];
        st.answers = [];
        st.judged = null;
        st.error = '';
        renderQuiz(st, alive);
      };
    }

    const speakBtn = appEl.querySelector('[data-quiz-speak]');
    if (speakBtn) {
      speakBtn.onclick = function () {
        const q = st.questions[st.index];
        if (q) speak(q.audio || audioUrl(q.answer));
      };
    }

    appEl.querySelectorAll('[data-opt]').forEach(function (btn) {
      btn.onclick = function () {
        quizPick(st, Number(btn.dataset.opt), alive);
      };
    });

    const spellBtn = appEl.querySelector('[data-spell-submit]');
    if (spellBtn) spellBtn.onclick = function () { quizSpell(st, alive); };

    const input = document.getElementById('spell-input');
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') quizSpell(st, alive);
      });
      if (!st.judged) setTimeout(function () { input.focus(); }, 80);
    }

    const next = appEl.querySelector('[data-quiz-next]');
    if (next) next.onclick = function () { quizNext(st, alive); };
    return;
  }

  const again = appEl.querySelector('[data-quiz-again]');
  if (again) {
    again.onclick = function () {
      st.stage = 'setup';
      st.result = null;
      st.questions = [];
      st.answers = [];
      st.correct = 0;
      st.judged = null;
      st.error = '';
      renderQuiz(st, alive);
      startQuiz(st, alive);
    };
  }
  const toStudy = appEl.querySelector('[data-quiz-study]');
  if (toStudy) toStudy.onclick = function () { location.hash = '#/study'; };
  const toHome = appEl.querySelector('[data-quiz-home]');
  if (toHome) toHome.onclick = function () { location.hash = '#/today'; };
}

async function startQuiz(st, alive) {
  if (st.loading) return;
  st.loading = true;
  st.error = '';
  renderQuiz(st, alive);
  try {
    const res = await apiGet('/api/quiz?mode=' + encodeURIComponent(st.mode) + '&limit=' + st.limit);
    if (!alive()) return;
    if (!res.questions || !res.questions.length) {
      throw new Error('当前词库题目太少，先去多学几个单词吧');
    }
    st.questions = res.questions;
    st.index = 0;
    st.answers = [];
    st.correct = 0;
    st.judged = null;
    st.result = null;
    st.startedAt = Date.now();
    st.cardStart = Date.now();
    st.loading = false;
    st.stage = 'quiz';
    renderQuiz(st, alive);
  } catch (e) {
    if (!alive()) return;
    st.loading = false;
    st.error = errText(e);
    renderQuiz(st, alive);
  }
}

function quizPick(st, idx, alive) {
  if (st.judged) return;
  const q = st.questions[st.index];
  const value = (q.options || [])[idx];
  if (value === undefined) return;
  finishQuizAnswer(st, value, value === q.answer, idx, alive);
}

function quizSpell(st, alive) {
  if (st.judged) return;
  const input = document.getElementById('spell-input');
  const raw = input ? input.value : '';
  const value = String(raw || '').trim();
  if (!value) {
    toast('请先输入答案');
    return;
  }
  const q = st.questions[st.index];
  const norm = function (s) {
    return String(s || '').toLowerCase().replace(/\s+/g, '');
  };
  finishQuizAnswer(st, value, norm(value) === norm(q.answer), -1, alive);
}

function finishQuizAnswer(st, value, ok, idx, alive) {
  const q = st.questions[st.index];
  st.judged = { value: value, ok: ok, idx: idx };
  st.answers.push({
    wordId: q.wordId,
    type: q.type,
    value: value,
    confident: ok,
    seconds: Math.max(0, Math.round((Date.now() - (st.cardStart || Date.now())) / 1000)),
  });
  if (ok) st.correct += 1;
  renderQuiz(st, alive);
  const feedback = appEl.querySelector('.feedback');
  if (feedback) feedback.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function quizNext(st, alive) {
  if (!st.judged) return;
  if (st.index + 1 >= st.questions.length) {
    finishQuiz(st, alive);
    return;
  }
  st.index += 1;
  st.judged = null;
  st.cardStart = Date.now();
  renderQuiz(st, alive);
}

async function finishQuiz(st, alive) {
  if (st.stage === 'result' && !st.loading) return;
  st.elapsed = Math.max(0, Math.round((Date.now() - (st.startedAt || Date.now())) / 1000));
  st.stage = 'result';
  st.loading = true;
  st.error = '';
  renderQuiz(st, alive);

  try {
    const res = await apiPost('/api/quiz/answers', { answers: st.answers });
    if (!alive()) return;
    st.loading = false;
    st.result = res;
    renderQuiz(st, alive);
  } catch (e) {
    if (!alive()) return;
    st.loading = false;
    st.result = { total: st.answers.length, correct: st.correct, results: [] };
    st.error = errText(e);
    renderQuiz(st, alive);
  }
}

/* ============================================================
   词库列表
   ============================================================ */

async function viewBooks(alive) {
  document.title = '词库 · 背小单';
  render(
    '<div class="page-head"><div><p class="page-head__hi">选择要背的词库</p><h1>词库</h1></div></div>' +
    '<div class="view"><div class="card loading-card">正在加载词库…</div></div>',
    { tab: true, tabKey: 'books' }
  );

  let books;
  try {
    const res = await apiGet('/api/books');
    if (!alive()) return;
    books = res.books || [];
  } catch (e) {
    if (!alive()) return;
    render(
      '<div class="page-head"><div><p class="page-head__hi">选择要背的词库</p><h1>词库</h1></div></div>' +
      '<div class="view"><div class="card center-block">' +
        '<div class="empty-icon">!</div><p class="empty-title">加载失败</p><p class="empty-text">' + esc(errText(e)) + '</p>' +
        '<button class="btn btn--primary" type="button" id="books-retry" style="margin-top:12px">重试</button>' +
      '</div></div>',
      { tab: true, tabKey: 'books' }
    );
    const retry = document.getElementById('books-retry');
    if (retry) retry.onclick = function () { route(); };
    return;
  }

  const builtin = books.filter(function (b) { return b.source === 'builtin'; });
  const globalBooks = books.filter(function (b) { return b.source === 'global'; });
  const mine = books.filter(function (b) { return b.source === 'user'; });
  const wordTotal = books.reduce(function (n, b) { return n + (b.count || 0); }, 0);
  const selectedCount = books.filter(function (b) { return b.selected; }).length;

  render(
    '<div class="page-head">' +
      '<div><p class="page-head__hi">' + books.length + ' 本 · ' + wordTotal + ' 词 · 已选 ' + selectedCount + ' 本</p><h1>词库</h1></div>' +
      '<button class="mini-btn" type="button" id="new-book">' + ICONS.plus + ' 新建</button>' +
    '</div>' +
    '<div class="view">' +
      '<div class="section-title"><span>内置词库</span><span>' + builtin.length + ' 本</span></div>' +
      builtin.map(bookItemHtml).join('') +
      (globalBooks.length
        ? '<div class="section-title"><span>公共词库</span><span>' + globalBooks.length + ' 本</span></div>' +
          globalBooks.map(bookItemHtml).join('')
        : '') +
      '<div class="section-title"><span>我的词库</span><span>' + mine.length + ' 本</span></div>' +
      (mine.length
        ? mine.map(bookItemHtml).join('')
        : '<div class="card"><p class="empty-text">还没有自己的词库。点右上角「新建」，或打开一本词库导入 CSV。</p></div>') +
      '<p class="muted center" style="margin-top:14px">打开右侧开关即可加入每日学习，至少保留一本</p>' +
    '</div>',
    { tab: true, tabKey: 'books' }
  );

  appEl.querySelectorAll('[data-open]').forEach(function (btn) {
    btn.onclick = function () {
      location.hash = '#/book/' + encodeURIComponent(btn.dataset.open);
    };
  });

  appEl.querySelectorAll('[data-select]').forEach(function (cb) {
    cb.onchange = function () {
      toggleBook(cb, books, alive);
    };
  });

  const newBook = document.getElementById('new-book');
  if (newBook) newBook.onclick = function () { openNewBookSheet(alive); };
}

function bookItemHtml(b) {
  return (
    '<div class="book-item">' +
      '<button class="book-item__body" type="button" data-open="' + esc(b.id) + '">' +
        '<span class="book-item__mark' + (b.source === 'builtin' ? '' : ' mine') + '">' + esc(String(b.title || '词')[0]) + '</span>' +
        '<span class="grow">' +
          '<span class="book-item__title">' + esc(b.title) + '</span>' +
          (b.description ? '<span class="book-item__desc">' + esc(b.description) + '</span>' : '') +
          '<span class="book-item__meta"><span>' + (b.count || 0) + ' 词</span>' +
            (b.selected ? '<span class="tag blue">学习中</span>' : '<span class="tag gray">未选</span>') +
          '</span>' +
        '</span>' +
      '</button>' +
      '<label class="switch"><input type="checkbox" data-select="' + esc(b.id) + '"' + (b.selected ? ' checked' : '') + '><span></span></label>' +
    '</div>'
  );
}

async function toggleBook(cb, books, alive) {
  const id = cb.dataset.select;
  const wanted = cb.checked;
  const ids = books
    .filter(function (b) { return b.id === id ? wanted : b.selected; })
    .map(function (b) { return b.id; });

  if (!ids.length) {
    cb.checked = !wanted;
    toast('至少保留一本词库');
    return;
  }

  cb.disabled = true;
  try {
    await apiPost('/api/me/update', { bookIds: ids });
    toast(wanted ? '已加入每日学习' : '已移出每日学习');
    viewBooks(alive);
  } catch (e) {
    cb.checked = !wanted;
    cb.disabled = false;
    toast(errText(e), 'err');
  }
}

function openNewBookSheet(alive) {
  openSheet(
    '新建词库',
    '<label class="field"><span>词库名称</span><input id="nb-title" class="input" maxlength="30" placeholder="例如：五年级下册"></label>' +
    '<label class="field"><span>简介（可选）</span><input id="nb-desc" class="input" maxlength="80" placeholder="几句话说明这个词库"></label>' +
    '<button class="btn btn--primary btn--block" type="button" id="nb-save" style="margin-top:18px">创建</button>',
    function (sheet, done) {
      const btn = sheet.querySelector('#nb-save');
      const titleEl = sheet.querySelector('#nb-title');
      const descEl = sheet.querySelector('#nb-desc');
      btn.onclick = async function () {
        const title = (titleEl.value || '').trim();
        if (!title) {
          toast('请填写词库名称');
          return;
        }
        setBusy(btn, true, '创建中…');
        try {
          await apiPost('/api/books', { title: title, description: (descEl.value || '').trim() });
          done();
          toast('已创建「' + title + '」', 'ok');
          viewBooks(alive);
        } catch (e) {
          setBusy(btn, false);
          toast(errText(e), 'err');
        }
      };
    }
  );
}

/* ============================================================
   词库详情
   ============================================================ */

async function viewBook(alive, bookId) {
  document.title = '词库详情 · 背小单';
  render(topbar('词库') + '<div class="view"><div class="card loading-card">正在加载词库…</div></div>', { tab: false });

  let books;
  let first;
  try {
    const out = await Promise.all([
      apiGet('/api/books'),
      apiGet('/api/books/' + encodeURIComponent(bookId) + '/words?page=1&size=50'),
    ]);
    books = out[0].books || [];
    first = out[1];
  } catch (e) {
    if (!alive()) return;
    render(
      topbar('词库') +
      '<div class="view"><div class="card center-block"><div class="empty-icon">!</div><p class="empty-title">加载失败</p>' +
      '<p class="empty-text">' + esc(errText(e)) + '</p>' +
      '<button class="btn btn--primary" type="button" id="book-retry" style="margin-top:12px">重试</button></div></div>',
      { tab: false }
    );
    const retry = document.getElementById('book-retry');
    if (retry) retry.onclick = function () { viewBook(alive, bookId); };
    return;
  }

  if (!alive()) return;

  const meta = books.filter(function (b) { return b.id === bookId; })[0];
  const editable = !!(meta && (meta.source === 'user' || (meta.source === 'global' && state.user && state.user.role === 'admin')));
  const readonlyTip = meta && meta.source === 'global'
    ? '公共词库由管理员维护。想修改某个单词，可在单词详情里加入「我的词库」。'
    : '内置词库为只读。想修改某个单词，可在单词详情里加入「我的词库」。';
  const title = (meta && meta.title) || '词库详情';
  const initialTotal = first.total || 0;
  const bookTotal = (meta && meta.count) || initialTotal;

  render(
    '<header class="topbar">' +
      '<button class="icon-btn" type="button" data-back aria-label="返回">' + ICONS.back + '</button>' +
      '<h1>' + esc(title) + '</h1>' +
      '<span class="tag gray" id="book-total-tag">' + initialTotal + ' 词</span>' +
    '</header>' +
    '<div class="view">' +
      (editable
        ? '<div class="toolbar"><button class="btn btn--sm btn--primary" type="button" id="add-word">添加单词</button>' +
            '<button class="btn btn--sm btn--ghost" type="button" id="import-words">批量导入</button></div>'
        : '<p class="readonly-tip">' + esc(readonlyTip) + '</p>') +
      '<div class="search">' + ICONS.search + '<input id="book-search" class="input" type="search" placeholder="搜索单词或释义" autocomplete="off"></div>' +
      '<p class="muted" id="book-count" style="margin:10px 2px">共 ' + initialTotal + ' 个单词</p>' +
      '<div id="word-list"></div>' +
      '<div class="more" id="book-more"></div>' +
    '</div>',
    { tab: false }
  );

  const listEl = document.getElementById('word-list');
  const moreEl = document.getElementById('book-more');
  let page = first.page || 1;
  let total = initialTotal;
  let noMore = !(first.words || []).length || (first.words || []).length >= total;
  let loading = false;
  let kw = '';
  let searchSeq = 0;

  function wordRow(w) {
    const st = statusOf(w.status);
    return (
      '<button class="word-row" type="button" data-wid="' + esc(w.id) + '">' +
        '<span class="grow">' +
          '<span class="word-row__word">' + esc(w.word) +
            (w.phonetic ? '<span class="word-row__phon">' + esc(w.phonetic) + '</span>' : '') +
          '</span>' +
          '<span class="word-row__meaning">' + esc((w.pos ? w.pos + ' ' : '') + w.meaning) + '</span>' +
        '</span>' +
        '<span class="tag ' + st.cls + '">' + st.label + '</span>' +
      '</button>'
    );
  }

  function updateHead() {
    const countEl = document.getElementById('book-count');
    if (countEl) countEl.textContent = kw ? '找到 ' + total + ' 个单词' : '共 ' + total + ' 个单词';
    const tagEl = document.getElementById('book-total-tag');
    if (tagEl) tagEl.textContent = bookTotal + ' 词';
  }

  listEl.innerHTML = (first.words || []).map(wordRow).join('');
  if (moreEl) moreEl.textContent = total === 0 ? '这个词库还没有单词' : noMore ? '' : '上滑加载更多';

  listEl.addEventListener('click', function (e) {
    const row = e.target.closest('[data-wid]');
    if (!row) return;
    location.hash = '#/word/' + encodeURIComponent(bookId) + '/' + encodeURIComponent(row.dataset.wid);
  });

  async function loadMore() {
    if (loading || noMore) return;
    loading = true;
    if (moreEl) moreEl.textContent = '加载中…';
    const mySeq = searchSeq;
    try {
      const res = await apiGet(
        '/api/books/' + encodeURIComponent(bookId) + '/words?page=' + (page + 1) + '&size=50' +
          (kw ? '&kw=' + encodeURIComponent(kw) : '')
      );
      if (!alive() || mySeq !== searchSeq) return;
      page = res.page || page + 1;
      total = res.total || 0;
      listEl.insertAdjacentHTML('beforeend', (res.words || []).map(wordRow).join(''));
      const shown = listEl.querySelectorAll('[data-wid]').length;
      noMore = (res.words || []).length < 50 || shown >= total;
      updateHead();
      if (moreEl) moreEl.textContent = noMore ? '' : '上滑加载更多';
    } catch (e) {
      if (alive() && moreEl) moreEl.textContent = '加载失败，上滑重试';
    }
    loading = false;
  }

  async function search(text) {
    kw = String(text || '').trim();
    searchSeq += 1;
    const mySeq = searchSeq;
    loading = true;
    if (moreEl) moreEl.textContent = '搜索中…';
    try {
      const res = await apiGet(
        '/api/books/' + encodeURIComponent(bookId) + '/words?page=1&size=50' +
          (kw ? '&kw=' + encodeURIComponent(kw) : '')
      );
      if (!alive() || mySeq !== searchSeq) return;
      page = 1;
      total = res.total || 0;
      listEl.innerHTML = (res.words || []).map(wordRow).join('');
      noMore = (res.words || []).length < 50 || (res.words || []).length >= total;
      updateHead();
      if (moreEl) moreEl.textContent = total === 0 ? '没有找到匹配的单词' : noMore ? '' : '上滑加载更多';
    } catch (e) {
      if (alive()) toast(errText(e), 'err');
    }
    loading = false;
  }

  const searchEl = document.getElementById('book-search');
  let timer = null;
  if (searchEl) {
    searchEl.addEventListener('input', function () {
      clearTimeout(timer);
      const value = searchEl.value;
      timer = setTimeout(function () { search(value); }, 300);
    });
  }

  scrollHandler = function () {
    if (loading || noMore) return;
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 260) loadMore();
  };
  window.addEventListener('scroll', scrollHandler, { passive: true });

  const addBtn = document.getElementById('add-word');
  if (addBtn) {
    addBtn.onclick = function () {
      openWordFormSheet({
        title: '添加单词',
        submitText: '保存单词',
        onSubmit: async function (fields, btn, done) {
          setBusy(btn, true, '保存中…');
          try {
            await apiPost('/api/books/' + encodeURIComponent(bookId) + '/words', fields);
            done();
            toast('已添加「' + fields.word + '」', 'ok');
            viewBook(alive, bookId);
          } catch (e) {
            setBusy(btn, false);
            toast(errText(e), 'err');
          }
        },
      });
    };
  }

  const importBtn = document.getElementById('import-words');
  if (importBtn) {
    importBtn.onclick = function () {
      openImportSheet(bookId, alive);
    };
  }
}

function openWordFormSheet(opts) {
  const fields = opts.fields || {};
  openSheet(
    opts.title,
    '<label class="field"><span>单词 *</span><input id="wf-word" class="input" maxlength="120" placeholder="例如：apple" value="' + esc(fields.word || '') + '"></label>' +
    '<label class="field"><span>释义 *</span><input id="wf-meaning" class="input" maxlength="300" placeholder="例如：苹果" value="' + esc(fields.meaning || '') + '"></label>' +
    '<label class="field"><span>音标</span><input id="wf-phonetic" class="input" maxlength="120" placeholder="例如：ˈæpl" value="' + esc(fields.phonetic || '') + '"></label>' +
    '<label class="field"><span>词性 / 单元</span><input id="wf-pos" class="input" maxlength="60" placeholder="例如：n. · Unit 3" value="' + esc(fields.pos || '') + '"></label>' +
    '<label class="field"><span>例句</span><input id="wf-example" class="input" maxlength="300" placeholder="英文例句" value="' + esc(fields.example || '') + '"></label>' +
    '<label class="field"><span>例句翻译</span><input id="wf-example-cn" class="input" maxlength="300" placeholder="中文翻译" value="' + esc(fields.exampleCn || '') + '"></label>' +
    '<button class="btn btn--primary btn--block" type="button" id="wf-save" style="margin-top:18px">' + esc(opts.submitText || '保存') + '</button>',
    function (sheet, done) {
      const btn = sheet.querySelector('#wf-save');
      btn.onclick = function () {
        const get = function (id) {
          const el = sheet.querySelector('#' + id);
          return el ? String(el.value || '').trim() : '';
        };
        const payload = {
          word: get('wf-word'),
          meaning: get('wf-meaning'),
          phonetic: get('wf-phonetic'),
          pos: get('wf-pos'),
          example: get('wf-example'),
          example_cn: get('wf-example-cn'),
        };
        if (!payload.word || !payload.meaning) {
          toast('请填写单词和释义');
          return;
        }
        opts.onSubmit(payload, btn, done);
      };
    }
  );
}

function openImportSheet(bookId, alive) {
  const sample = 'word,meaning,phonetic,pos,example,example_cn\napple,苹果,ˈæpl,n.,I eat an apple every day.,我每天吃一个苹果。\nbridge,桥,brɪdʒ,n.,The bridge is very old.,这座桥很旧。';
  openSheet(
    '批量导入',
    '<p class="sheet__note">第一行是表头：word,meaning,phonetic,pos,example,example_cn。也可以直接粘贴每行「单词,释义」。</p>' +
    '<textarea id="import-csv" class="textarea" placeholder="' + esc(sample) + '"></textarea>' +
    '<button class="btn btn--ghost btn--sm" type="button" id="import-sample" style="margin-top:10px">填入示例</button>' +
    '<button class="btn btn--primary btn--block" type="button" id="import-save" style="margin-top:14px">开始导入</button>' +
    '<p id="import-result" class="sheet__result" hidden></p>',
    function (sheet, done) {
      const csv = sheet.querySelector('#import-csv');
      const result = sheet.querySelector('#import-result');
      sheet.querySelector('#import-sample').onclick = function () {
        csv.value = sample;
        csv.focus();
      };
      const btn = sheet.querySelector('#import-save');
      btn.onclick = async function () {
        const data = String(csv.value || '').trim();
        if (!data) {
          toast('请先粘贴要导入的内容');
          return;
        }
        setBusy(btn, true, '导入中…');
        result.hidden = true;
        try {
          const res = await apiPost('/api/books/' + encodeURIComponent(bookId) + '/import', { data: data });
          result.hidden = false;
          result.className = 'sheet__result';
          result.textContent = '导入完成：新增 ' + (res.created || 0) + ' 个，更新 ' + (res.updated || 0) + ' 个，共 ' + (res.count || 0) + ' 个单词。';
          csv.value = '';
          setBusy(btn, false);
          toast('导入成功', 'ok');
          setTimeout(function () {
            done();
            viewBook(alive, bookId);
          }, 900);
        } catch (e) {
          result.hidden = false;
          result.className = 'sheet__result sheet__result--err';
          result.textContent = errText(e);
          setBusy(btn, false);
        }
      };
    }
  );
}

/* ============================================================
   单词详情
   ============================================================ */

async function viewWord(alive, bookId, wordId) {
  document.title = '单词详情 · 背小单';
  render(topbar('单词详情') + '<div class="view"><div class="card loading-card">正在加载单词…</div></div>', { tab: false });

  let res;
  try {
    res = await apiGet('/api/books/' + encodeURIComponent(bookId) + '/words/' + encodeURIComponent(wordId));
  } catch (e) {
    if (!alive()) return;
    render(
      topbar('单词详情') +
      '<div class="view"><div class="card center-block"><div class="empty-icon">!</div><p class="empty-title">加载失败</p>' +
      '<p class="empty-text">' + esc(errText(e)) + '</p>' +
      '<button class="btn btn--primary" type="button" id="word-retry" style="margin-top:12px">重试</button></div></div>',
      { tab: false }
    );
    const retry = document.getElementById('word-retry');
    if (retry) retry.onclick = function () { viewWord(alive, bookId, wordId); };
    return;
  }

  if (!alive()) return;

  const w = res.word || {};
  const book = res.book || {};
  const st = statusOf(w.status);

  render(
    topbar(w.word || '单词详情') +
    '<div class="view">' +
      '<div class="card word-detail">' +
        '<div class="word-detail__word">' + esc(w.word) + '</div>' +
        (w.phonetic ? '<div class="flash__phon">' + esc(w.phonetic) + '</div>' : '') +
        '<button class="speak-btn" type="button" data-speak>' + ICONS.sound + ' 发音</button>' +
        '<div class="word-detail__tags">' +
          '<span class="tag ' + st.cls + '">' + st.label + '</span>' +
          (w.pos ? '<span class="tag gray">' + esc(w.pos) + '</span>' : '') +
        '</div>' +
        '<p class="word-detail__meaning">' + esc(w.meaning) + '</p>' +
        (w.example
          ? '<div class="word-detail__example"><p>' + esc(w.example) + '</p><p class="muted">' + esc(w.exampleCn || '') + '</p></div>'
          : '') +
        '<div class="word-detail__due">' + (w.due ? '下次复习：' + dayText(w.due) : '这个单词还没有学习记录') + '</div>' +
      '</div>' +
      '<div class="actions-col">' +
        (book.editable
          ? '<button class="btn btn--ghost btn--block" type="button" id="edit-word">编辑单词</button>' +
            '<button class="btn btn--danger btn--block" type="button" id="delete-word">删除单词</button>'
          : '<button class="btn btn--primary btn--block" type="button" id="add-to-mine">加入我的词库</button>') +
      '</div>' +
      '<p class="muted center" style="margin-top:14px">来自「' + esc(book.title || '词库') + '」' + (book.source === 'builtin' ? ' · 内置词库' : book.source === 'global' ? ' · 公共词库' : '') + '</p>' +
    '</div>',
    { tab: false }
  );

  const speakBtn = appEl.querySelector('[data-speak]');
  if (speakBtn) {
    speakBtn.onclick = function () {
      speak(w.audio || audioUrl(w.word));
    };
  }

  const editBtn = document.getElementById('edit-word');
  if (editBtn) {
    editBtn.onclick = function () {
      openWordFormSheet({
        title: '编辑单词',
        submitText: '保存修改',
        fields: {
          word: w.word,
          meaning: w.meaning,
          phonetic: w.phonetic,
          pos: w.pos,
          example: w.example,
          exampleCn: w.exampleCn,
        },
        onSubmit: async function (fields, btn, done) {
          setBusy(btn, true, '保存中…');
          try {
            await apiPost('/api/words/update', Object.assign({ wordId: w.id }, fields));
            done();
            toast('已保存', 'ok');
            viewWord(alive, bookId, wordId);
          } catch (e) {
            setBusy(btn, false);
            toast(errText(e), 'err');
          }
        },
      });
    };
  }

  const deleteBtn = document.getElementById('delete-word');
  if (deleteBtn) {
    deleteBtn.onclick = async function () {
      const ok = await confirmBox('删除单词', '确定要把「' + w.word + '」从词库里删掉吗？', '删除');
      if (!ok) return;
      try {
        await apiPost('/api/words/delete', { wordId: w.id });
        toast('已删除', 'ok');
        location.hash = '#/book/' + encodeURIComponent(bookId);
      } catch (e) {
        toast(errText(e), 'err');
      }
    };
  }

  const addMine = document.getElementById('add-to-mine');
  if (addMine) {
    addMine.onclick = async function () {
      setBusy(addMine, true, '加入中…');
      try {
        const list = await apiGet('/api/books');
        const target = (list.books || []).filter(function (b) { return b.source === 'user'; })[0];
        if (!target) {
          setBusy(addMine, false);
          toast('请先在词库页新建自己的词库');
          return;
        }
        await apiPost('/api/books/' + encodeURIComponent(target.id) + '/words', {
          word: w.word,
          meaning: w.meaning,
          phonetic: w.phonetic,
          pos: w.pos,
          example: w.example,
          example_cn: w.exampleCn,
        });
        setBusy(addMine, false);
        toast('已加入「' + target.title + '」', 'ok');
      } catch (e) {
        setBusy(addMine, false);
        toast(errText(e), 'err');
      }
    };
  }
}

/* ============================================================
   统计
   ============================================================ */

const STATUS_META = [
  { key: 'new', label: '未学', color: '#c9cfdb' },
  { key: 'learning', label: '学习中', color: '#f0a44b' },
  { key: 'review', label: '复习中', color: '#7e97f5' },
  { key: 'mastered', label: '已掌握', color: '#2fae6a' },
];

async function viewStats(alive) {
  document.title = '统计 · 背小单';
  render(
    '<div class="page-head"><div><p class="page-head__hi">看看这一个月的变化</p><h1>统计</h1></div></div>' +
    '<div class="view"><div class="card loading-card">正在加载统计…</div></div>',
    { tab: true, tabKey: 'stats' }
  );

  let s;
  let me;
  try {
    const out = await Promise.all([apiGet('/api/stats'), apiGet('/api/me')]);
    s = out[0];
    me = out[1];
  } catch (e) {
    if (!alive()) return;
    render(
      '<div class="page-head"><div><p class="page-head__hi">看看这一个月的变化</p><h1>统计</h1></div></div>' +
      '<div class="view"><div class="card center-block"><div class="empty-icon">!</div><p class="empty-title">加载失败</p>' +
      '<p class="empty-text">' + esc(errText(e)) + '</p>' +
      '<button class="btn btn--primary" type="button" id="stats-retry" style="margin-top:12px">重试</button></div></div>',
      { tab: true, tabKey: 'stats' }
    );
    const retry = document.getElementById('stats-retry');
    if (retry) retry.onclick = function () { route(); };
    return;
  }

  if (!alive()) return;
  if (me && me.user) state.user = me.user;

  const today = s.today;
  const user = (me && me.user) || state.user || {};
  let goal = user.dailyGoal == null ? 10 : user.dailyGoal;
  let limit = user.newWordLimit == null ? 10 : user.newWordLimit;
  const origin = { goal: goal, limit: limit };
  const todaySec = today ? today.seconds || 0 : 0;

  const metricCells = [
    { label: '累计学习', value: String(s.learned || 0) },
    { label: '已掌握', value: String(s.mastered || 0) },
    { label: '待复习', value: String(s.due || 0) },
    { label: '总准确率', value: (s.accuracy || 0) + '%' },
    { label: '打卡天数', value: String(s.totalDays || 0) },
    { label: '今日时长', value: todaySec ? Math.max(1, Math.round(todaySec / 60)) + ' 分钟' : '0 分钟' },
  ];

  render(
    '<div class="page-head"><div><p class="page-head__hi">看看这一个月的变化</p><h1>统计</h1></div></div>' +
    '<div class="view">' +
      '<section class="card today-card">' +
        '<div class="grow">' +
          '<p class="eyebrow">' + (today ? '今天 ' + md(today.date) : '今天') + '</p>' +
          '<div class="today-card__num">' + (today ? today.done : 0) + '<span> / ' + (today ? today.goal : user.dailyGoal || 10) + ' 个</span></div>' +
          '<div class="today-card__detail">' + (today ? '答对 ' + today.correct + ' · 答错 ' + today.wrong : '今天还没有学习记录') + '</div>' +
        '</div>' +
        '<span class="tag ' + (today && today.checkIn ? 'green' : 'gray') + '">' + (today && today.checkIn ? '已打卡' : '未打卡') + '</span>' +
      '</section>' +
      '<section class="card metrics">' +
        metricCells.map(function (m) {
          return '<div class="metric"><b>' + esc(m.value) + '</b><span>' + m.label + '</span></div>';
        }).join('') +
      '</section>' +
      '<section class="card">' +
        '<div class="row-between"><h2 class="card-title">最近 30 天</h2><span class="muted">连续 ' + (s.streak || 0) + ' 天</span></div>' +
        chartHtml(s.history || []) +
      '</section>' +
      '<section class="card">' +
        '<h2 class="card-title">学习状态分布</h2>' +
        distHtml(s.byStatus || {}, s.total || 0) +
      '</section>' +
      '<section class="card">' +
        '<h2 class="card-title">学习设置</h2>' +
        '<div class="setting-row">' +
          '<div class="setting-row__label"><b>每日学习目标</b><span>每天计划完成多少张卡片</span></div>' +
          '<div class="stepper">' +
            '<button type="button" data-step="goal" data-dir="-1" id="goal-minus">−</button>' +
            '<b id="goal-val">' + goal + '</b>' +
            '<button type="button" data-step="goal" data-dir="1" id="goal-plus">+</button>' +
          '</div>' +
        '</div>' +
        '<div class="setting-row">' +
          '<div class="setting-row__label"><b>每日新词上限</b><span>控制每天最多认识几个新词</span></div>' +
          '<div class="stepper">' +
            '<button type="button" data-step="limit" data-dir="-1" id="limit-minus">−</button>' +
            '<b id="limit-val">' + limit + '</b>' +
            '<button type="button" data-step="limit" data-dir="1" id="limit-plus">+</button>' +
          '</div>' +
        '</div>' +
        '<button class="btn btn--primary btn--block" type="button" id="goal-save" style="margin-top:14px" disabled>保存设置</button>' +
      '</section>' +
    '</div>',
    { tab: true, tabKey: 'stats' }
  );

  const goalVal = document.getElementById('goal-val');
  const limitVal = document.getElementById('limit-val');
  const goalMinus = document.getElementById('goal-minus');
  const goalPlus = document.getElementById('goal-plus');
  const limitMinus = document.getElementById('limit-minus');
  const limitPlus = document.getElementById('limit-plus');
  const saveBtn = document.getElementById('goal-save');

  function syncSettings() {
    goalVal.textContent = goal;
    limitVal.textContent = limit;
    goalMinus.disabled = goal <= 5;
    goalPlus.disabled = goal >= 200;
    limitMinus.disabled = limit <= 0;
    limitPlus.disabled = limit >= 100;
    saveBtn.disabled = goal === origin.goal && limit === origin.limit;
  }

  appEl.querySelectorAll('[data-step]').forEach(function (btn) {
    btn.onclick = function () {
      const dir = Number(btn.dataset.dir);
      if (btn.dataset.step === 'goal') {
        goal = Math.min(200, Math.max(5, goal + dir * 5));
      } else {
        limit = Math.min(100, Math.max(0, limit + dir));
      }
      syncSettings();
    };
  });

  saveBtn.onclick = async function () {
    if (saveBtn.disabled) return;
    setBusy(saveBtn, true, '保存中…');
    try {
      const res = await apiPost('/api/me/update', { dailyGoal: goal, newWordLimit: limit });
      state.user = res.user;
      toast('设置已保存', 'ok');
      viewStats(alive);
    } catch (e) {
      setBusy(saveBtn, false);
      syncSettings();
      toast(errText(e), 'err');
    }
  };

  syncSettings();
}

function chartHtml(history) {
  if (!history.length) return '<p class="empty-text" style="padding:18px 0">还没有学习记录，去背几个单词吧。</p>';
  const max = Math.max.apply(null, history.map(function (h) { return h.done || 0; }).concat([1]));
  const bars = history.map(function (h) {
    const done = h.done || 0;
    const height = done > 0 ? Math.max(6, Math.round((done / max) * 126)) : 4;
    const cls = done <= 0 ? 'none' : h.goal && done >= h.goal ? 'good' : 'part';
    const title = md(h.date) + ' · 学 ' + done + ' 个 · 对 ' + (h.correct || 0) + ' 错 ' + (h.wrong || 0);
    return '<div class="chart__col" title="' + esc(title) + '"><div class="chart__bar chart__bar--' + cls + '" style="height:' + height + 'px"></div></div>';
  }).join('');
  const first = md(history[0].date);
  const mid = md(history[Math.floor(history.length / 2)].date);
  const last = md(history[history.length - 1].date);
  return (
    '<div class="chart">' +
      '<div class="chart__bars">' + bars + '</div>' +
      '<div class="chart__axis"><span>' + first + '</span><span>' + mid + '</span><span>' + last + '</span></div>' +
    '</div>'
  );
}

function distHtml(byStatus, total) {
  if (!total) return '<p class="empty-text" style="padding:14px 0">还没有选择词库或开始学习。</p>';
  const segments = STATUS_META.map(function (m) {
    const count = byStatus[m.key] || 0;
    if (!count) return '';
    const pct = Math.max(0, Math.round((count / total) * 1000) / 10);
    return '<div class="dist__seg" style="width:' + pct + '%;background:' + m.color + '"></div>';
  }).join('');

  const legend = STATUS_META.map(function (m) {
    return (
      '<div class="dist__item"><span class="dist__dot" style="background:' + m.color + '"></span>' +
        m.label + ' <b>' + (byStatus[m.key] || 0) + '</b>' +
      '</div>'
    );
  }).join('');

  return '<div class="dist"><div class="dist__bar">' + segments + '</div><div class="dist__legend">' + legend + '</div></div>';
}

/* ============================================================
   我的
   ============================================================ */

async function viewMine(alive) {
  document.title = '我的 · 背小单';
  render(
    '<div class="page-head"><div><p class="page-head__hi">账号与设置</p><h1>我的</h1></div></div>' +
    '<div class="view"><div class="card loading-card">正在加载账号信息…</div></div>',
    { tab: true, tabKey: 'mine' }
  );

  let me;
  let s;
  let health;
  try {
    const out = await Promise.all([
      apiGet('/api/me'),
      apiGet('/api/stats'),
      apiGet('/api/health').catch(function () { return null; }),
    ]);
    me = out[0];
    s = out[1];
    health = out[2];
  } catch (e) {
    if (!alive()) return;
    render(
      '<div class="page-head"><div><p class="page-head__hi">账号与设置</p><h1>我的</h1></div></div>' +
      '<div class="view"><div class="card center-block"><div class="empty-icon">!</div><p class="empty-title">加载失败</p>' +
      '<p class="empty-text">' + esc(errText(e)) + '</p>' +
      '<button class="btn btn--primary" type="button" id="mine-retry" style="margin-top:12px">重试</button></div></div>',
      { tab: true, tabKey: 'mine' }
    );
    const retry = document.getElementById('mine-retry');
    if (retry) retry.onclick = function () { route(); };
    return;
  }

  if (!alive()) return;
  state.user = me.user;
  const u = me.user || {};
  const roleText = u.role === 'admin' ? '管理员' : '普通用户';
  const roleCls = u.role === 'admin' ? 'blue' : 'gray';
  const isAdmin = u.role === 'admin';
  const healthText = health
    ? health.words + ' 词 · ' + health.wordbooks + ' 本词库 · 连接正常'
    : '暂时无法获取服务器状态';

  render(
    '<div class="page-head"><div><p class="page-head__hi">账号与设置</p><h1>我的</h1></div></div>' +
    '<div class="view">' +
      '<section class="card profile">' +
        '<div class="avatar">' + esc(String(u.nickname || '学')[0]) + '</div>' +
        '<div class="grow">' +
          '<div class="profile__name">' + esc(u.nickname || '学习者') + '</div>' +
          '<div class="profile__meta">' + (u.account ? '@' + esc(u.account) : '微信用户') + ' · ' + roleText + '</div>' +
        '</div>' +
        '<span class="tag ' + roleCls + '">' + roleText + '</span>' +
      '</section>' +
      '<section class="card profile-stats">' +
        '<div><b>' + (s.streak || 0) + '</b><span>连续打卡</span></div>' +
        '<div><b>' + (s.learned || 0) + '</b><span>累计学习</span></div>' +
        '<div><b>' + (s.mastered || 0) + '</b><span>已掌握</span></div>' +
        '<div><b>' + (s.due || 0) + '</b><span>待复习</span></div>' +
      '</section>' +
      '<section class="card menu">' +
        menuLink('#/stats', ICONS.chart, '学习设置', '每日目标 ' + (u.dailyGoal == null ? 10 : u.dailyGoal) + ' 个 · 新词上限 ' + (u.newWordLimit == null ? 10 : u.newWordLimit) + ' 个') +
        menuButton('mine-edit-nick', ICONS.edit, '修改昵称', esc(u.nickname || '')) +
        menuButton('mine-edit-pwd', ICONS.lock, '修改密码', '建议使用 6 位以上密码') +
        menuButton('mine-health', ICONS.server, '服务器状态', healthText) +
        menuButton('mine-about', ICONS.info, '关于背小单', 'H5 版 · 与小程序共用数据') +
      '</section>' +
      (isAdmin
        ? '<section class="card menu">' +
            '<div class="section-title" style="margin:2px 2px 4px"><span>管理员</span></div>' +
            menuButton('mine-members', ICONS.users, '成员管理', '查看成员、调整权限、重置密码') +
            menuButton('mine-create-book', ICONS.plus, '创建公共词库', '所有成员都能看到') +
          '</section>'
        : '') +
      '<button class="btn btn--danger btn--block" type="button" id="mine-logout" style="margin-top:4px">退出登录</button>' +
      '<p class="muted center" style="margin-top:14px">背小单 · 当前账号创建于 ' + fmtDateTime(u.createdAt) + '</p>' +
    '</div>',
    { tab: true, tabKey: 'mine' }
  );

  const editNick = document.getElementById('mine-edit-nick');
  if (editNick) editNick.onclick = function () { openNicknameSheet(alive); };

  const editPwd = document.getElementById('mine-edit-pwd');
  if (editPwd) editPwd.onclick = function () { openPasswordSheet(); };

  const healthBtn = document.getElementById('mine-health');
  if (healthBtn) healthBtn.onclick = function () { openHealthSheet(health); };

  const aboutBtn = document.getElementById('mine-about');
  if (aboutBtn) aboutBtn.onclick = function () { openAboutSheet(); };

  const membersBtn = document.getElementById('mine-members');
  if (membersBtn) membersBtn.onclick = function () { openMembersSheet(); };

  const createBookBtn = document.getElementById('mine-create-book');
  if (createBookBtn) createBookBtn.onclick = function () { openCreatePublicBookSheet(alive); };

  const logoutBtn = document.getElementById('mine-logout');
  if (logoutBtn) logoutBtn.onclick = async function () {
    const ok = await confirmBox('退出登录', '退出后需要重新登录才能继续学习。', '退出');
    if (!ok) return;
    try {
      await apiPost('/api/auth/logout', {});
    } catch (e) {
      // 忽略网络异常，本地照样退出
    }
    clearAuth();
    toast('已退出登录');
    location.hash = '#/login';
    if (location.hash === '#/login') route();
  };
}

function menuLink(href, icon, title, sub) {
  return (
    '<a class="menu-row" href="' + href + '">' +
      '<span class="menu-row__icon">' + icon + '</span>' +
      '<span class="menu-row__body"><b>' + title + '</b><span>' + sub + '</span></span>' +
      '<span class="menu-row__arrow">›</span>' +
    '</a>'
  );
}

function menuButton(id, icon, title, sub) {
  return (
    '<button class="menu-row" type="button" id="' + id + '">' +
      '<span class="menu-row__icon">' + icon + '</span>' +
      '<span class="menu-row__body"><b>' + title + '</b><span>' + sub + '</span></span>' +
      '<span class="menu-row__arrow">›</span>' +
    '</button>'
  );
}

function openNicknameSheet(alive) {
  const current = (state.user && state.user.nickname) || '';
  openSheet(
    '修改昵称',
    '<label class="field"><span>新昵称</span><input id="nick-input" class="input" maxlength="24" placeholder="怎么称呼你" value="' + esc(current) + '"></label>' +
    '<button class="btn btn--primary btn--block" type="button" id="nick-save" style="margin-top:18px">保存</button>',
    function (sheet, done) {
      const input = sheet.querySelector('#nick-input');
      const btn = sheet.querySelector('#nick-save');
      btn.onclick = async function () {
        const nickname = (input.value || '').trim();
        if (!nickname) {
          toast('请输入昵称');
          return;
        }
        setBusy(btn, true, '保存中…');
        try {
          const res = await apiPost('/api/me/update', { nickname: nickname });
          state.user = res.user;
          done();
          toast('昵称已更新', 'ok');
          viewMine(alive);
        } catch (e) {
          setBusy(btn, false);
          toast(errText(e), 'err');
        }
      };
    }
  );
}

function openPasswordSheet() {
  openSheet(
    '修改密码',
    '<label class="field"><span>新密码</span><input id="pwd1" class="input" type="password" autocomplete="new-password" placeholder="至少 6 位"></label>' +
    '<label class="field"><span>确认新密码</span><input id="pwd2" class="input" type="password" autocomplete="new-password" placeholder="再输入一次"></label>' +
    '<p class="sheet__note" style="margin-top:12px">修改后请用新密码登录一次确认。</p>' +
    '<button class="btn btn--primary btn--block" type="button" id="pwd-save" style="margin-top:6px">保存</button>',
    function (sheet, done) {
      const p1 = sheet.querySelector('#pwd1');
      const p2 = sheet.querySelector('#pwd2');
      const btn = sheet.querySelector('#pwd-save');
      btn.onclick = async function () {
        const password = p1.value || '';
        if (password.length < 6) {
          toast('密码至少 6 位');
          return;
        }
        if (password !== (p2.value || '')) {
          toast('两次输入的密码不一致');
          return;
        }
        setBusy(btn, true, '保存中…');
        try {
          await apiPost('/api/me/update', { password: password });
          done();
          toast('密码已修改', 'ok');
        } catch (e) {
          setBusy(btn, false);
          toast(errText(e), 'err');
        }
      };
    }
  );
}

function openHealthSheet(health) {
  openSheet(
    '服务器状态',
    '<div class="card card--flat" style="box-shadow:none;margin:0;background:#f8faff">' +
      '<div class="setting-row"><span class="sub">连接状态</span><b>' + (health ? '正常' : '异常') + '</b></div>' +
      '<div class="setting-row"><span class="sub">词库数量</span><b>' + (health ? health.wordbooks : '—') + '</b></div>' +
      '<div class="setting-row"><span class="sub">单词总数</span><b>' + (health ? health.words : '—') + '</b></div>' +
      '<div class="setting-row"><span class="sub">当前地址</span><b style="font-size:12px;word-break:break-all">' + esc(location.origin) + '</b></div>' +
    '</div>' +
    '<p class="sheet__note" style="margin-top:12px">H5 页面与接口由同一个服务提供，手机和电脑在同一网络即可访问。</p>'
  );
}

function openAboutSheet() {
  openSheet(
    '关于背小单',
    '<p class="sheet__note" style="font-size:13px;color:#4a5266">背小单是一个轻量的背单词工具，按记忆曲线安排复习，支持看中文选词、看词选义和听写拼写。</p>' +
    '<div class="card card--flat" style="box-shadow:none;margin:12px 0 0;background:#f8faff">' +
      '<div class="setting-row"><span class="sub">当前版本</span><b>H5 移动端</b></div>' +
      '<div class="setting-row"><span class="sub">数据来源</span><b>与小程序共用</b></div>' +
      '<div class="setting-row"><span class="sub">复习算法</span><b>简化 SM-2</b></div>' +
    '</div>' +
    '<p class="sheet__note" style="margin-top:12px">所有学习记录都保存在你自己的服务器上，不会上传到第三方。</p>'
  );
}

function openMembersSheet() {
  openSheet('成员管理', '<div id="member-list"><div class="loading-card">加载中…</div></div>', function (sheet) {
    const listEl = sheet.querySelector('#member-list');

    async function load() {
      listEl.innerHTML = '<div class="loading-card">加载中…</div>';
      try {
        const res = await apiGet('/api/admin/users');
        const users = res.users || [];
        listEl.innerHTML = users.length
          ? users.map(memberRow).join('')
          : '<p class="empty-text">暂时没有其他成员。</p>';
      } catch (e) {
        listEl.innerHTML = '<p class="sheet__result sheet__result--err">' + esc(errText(e)) + '</p>';
      }
    }

    listEl.addEventListener('click', async function (e) {
      const roleBtn = e.target.closest('[data-role-id]');
      if (roleBtn) {
        const id = roleBtn.dataset.roleId;
        const role = roleBtn.dataset.roleCur === 'admin' ? 'user' : 'admin';
        roleBtn.disabled = true;
        try {
          await apiPost('/api/admin/users/update', { userId: id, role: role });
          toast('权限已更新', 'ok');
          load();
        } catch (err) {
          roleBtn.disabled = false;
          toast(errText(err), 'err');
        }
        return;
      }

      const resetBtn = e.target.closest('[data-reset-id]');
      if (resetBtn) {
        const name = resetBtn.dataset.resetName || '该成员';
        const ok = await confirmBox('重置密码', '确定把「' + name + '」的密码重置为 123456 吗？', '重置');
        if (!ok) return;
        try {
          await apiPost('/api/admin/users/update', { userId: resetBtn.dataset.resetId, resetPassword: '123456' });
          toast('已重置为 123456', 'ok');
          load();
        } catch (err) {
          toast(errText(err), 'err');
        }
      }
    });

    load();
  });
}

function memberRow(u) {
  const isSelf = state.user && state.user.id === u.id;
  const role = u.role === 'admin' ? 'admin' : 'user';
  const actions = isSelf
    ? '<span class="tag gray">当前账号</span>'
    : '<div class="member__actions">' +
        '<button class="mini-btn" type="button" data-role-id="' + esc(u.id) + '" data-role-cur="' + role + '">' +
          (role === 'admin' ? '设为用户' : '设为管理员') +
        '</button>' +
        '<button class="mini-btn mini-btn--gray" type="button" data-reset-id="' + esc(u.id) + '" data-reset-name="' + esc(u.nickname || u.account || '') + '">重置密码</button>' +
      '</div>';

  return (
    '<div class="member">' +
      '<div class="grow">' +
        '<div class="member__name">' + esc(u.nickname || '未命名') +
          '<span class="tag ' + (role === 'admin' ? 'blue' : 'gray') + '">' + (role === 'admin' ? '管理员' : '普通用户') + '</span>' +
        '</div>' +
        '<div class="member__meta">' + (u.account ? '@' + esc(u.account) + ' · ' : '') + '连续 ' + (u.streak || 0) + ' 天 · 学习 ' + (u.learned || 0) + ' 词</div>' +
      '</div>' +
      actions +
    '</div>'
  );
}

function openCreatePublicBookSheet(alive) {
  openSheet(
    '创建公共词库',
    '<label class="field"><span>词库名称</span><input id="pb-title" class="input" maxlength="30" placeholder="例如：旅馆常用句"></label>' +
    '<label class="field"><span>简介（可选）</span><input id="pb-desc" class="input" maxlength="80" placeholder="这个词库用来做什么"></label>' +
    '<p class="sheet__note" style="margin-top:12px">公共词库创建后，所有成员都能在词库列表里看到。</p>' +
    '<button class="btn btn--primary btn--block" type="button" id="pb-save">创建</button>',
    function (sheet, done) {
      const titleEl = sheet.querySelector('#pb-title');
      const descEl = sheet.querySelector('#pb-desc');
      const btn = sheet.querySelector('#pb-save');
      btn.onclick = async function () {
        const title = (titleEl.value || '').trim();
        if (!title) {
          toast('请填写词库名称');
          return;
        }
        setBusy(btn, true, '创建中…');
        try {
          await apiPost('/api/admin/books', { title: title, description: (descEl.value || '').trim() });
          done();
          toast('公共词库已创建', 'ok');
        } catch (e) {
          setBusy(btn, false);
          toast(errText(e), 'err');
        }
      };
    }
  );
}

/* ============================================================
   启动
   ============================================================ */

tabbarEl.addEventListener('click', function (e) {
  const btn = e.target.closest('[data-tab]');
  if (!btn) return;
  const target = '#/' + btn.dataset.tab;
  if (location.hash === target) route();
  else location.hash = target;
});

appEl.addEventListener('click', function (e) {
  const target = e.target instanceof Element ? e.target : null;
  if (!target) return;
  const back = target.closest('[data-back]');
  if (back) {
    if (history.length > 1) history.back();
    else location.hash = '#/today';
  }
});

window.addEventListener('hashchange', function () {
  route();
});

if (!location.hash) {
  history.replaceState(null, '', '#/today');
}

route();
