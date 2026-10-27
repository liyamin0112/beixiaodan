const https = require('https');
const cfg = require('./config');
const store = require('./db');
const auth = require('./auth');
const books = require('./books');
const srs = require('./srs');

const DAY = srs.DAY;

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra || null;
  }
}

function send(res, status, payload) {
  const body = JSON.stringify(payload === undefined ? { ok: true } : payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 8 * 1024 * 1024) {
        reject(new HttpError(413, '请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new HttpError(400, 'JSON 解析失败: ' + e.message));
      }
    });
    req.on('error', reject);
  });
}

function wxCode2Session(code) {
  return new Promise((resolve, reject) => {
    if (!cfg.wxAppId || !cfg.wxAppSecret) return reject(new HttpError(501, '未配置 WX_APPID / WX_SECRET'));
    const path = `/sns/jscode2session?appid=${encodeURIComponent(cfg.wxAppId)}&secret=${encodeURIComponent(
      cfg.wxAppSecret
    )}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
    const req = https.request({ host: 'api.weixin.qq.com', path, method: 'GET', timeout: 8000 }, (res) => {
      let buf = '';
      res.on('data', (d) => (buf += d));
      res.on('end', () => {
        try {
          const j = JSON.parse(buf);
          if (j.errcode) return reject(new HttpError(401, `微信登录失败: ${j.errmsg}`));
          resolve(j);
        } catch (e) {
          reject(new HttpError(502, '微信返回解析失败'));
        }
      });
    });
    req.on('error', (e) => reject(new HttpError(502, '微信接口请求失败: ' + e.message)));
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.end();
  });
}

/* ---------------- 用户与学习数据 ---------------- */

function getUser(req) {
  const token = req.headers['x-token'] || (req.query && req.query.token);
  const user = auth.userByToken(token);
  if (!user) throw new HttpError(401, '请先登录');
  return user;
}

function progressOf(user, wordId) {
  const db = store.get();
  return (db.progress[user.id] || {})[wordId] || null;
}

function setProgress(user, wordId, state) {
  const db = store.get();
  db.progress[user.id] = db.progress[user.id] || {};
  db.progress[user.id][wordId] = state;
  store.touch();
}

function userBookIds(user) {
  const db = store.get();
  const ids = (user.bookIds || []).filter((b) => db.wordbooks.find((x) => x.id === b));
  if (!ids.length) {
    const first = db.wordbooks.find((b) => b.source === 'builtin');
    if (first) ids.push(first.id);
  }
  return ids;
}

function userWordIds(user) {
  const db = store.get();
  const prog = db.progress[user.id] || {};
  const byWord = new Map();
  for (const bookId of userBookIds(user)) {
    const words = db.words[bookId] || {};
    for (const id of Object.keys(words)) {
      const key = words[id].word.toLowerCase();
      const prev = byWord.get(key);
      if (!prev) {
        byWord.set(key, id);
      } else if (!prog[prev] || prog[prev].status === 'new') {
        // 同一个词出现在多本词库时，优先保留已有学习记录的那条
        byWord.set(key, id);
      }
    }
  }
  return [...byWord.values()];
}

function ensureDay(user, ts) {
  const db = store.get();
  const key = srs.dayKey(ts);
  db.days[user.id] = db.days[user.id] || {};
  const goal = user.dailyGoal || cfg.defaultDailyGoal;
  const newTarget = Math.min(user.newWordLimit == null ? 10 : user.newWordLimit, goal);
  if (!db.days[user.id][key]) {
    db.days[user.id][key] = {
      date: key,
      goal,
      newTarget,
      newDone: 0,
      reviewDone: 0,
      correct: 0,
      wrong: 0,
      checkIn: false,
      seconds: 0,
    };
    store.touch();
  }
  const rec = db.days[user.id][key];
  // 当天修改目标立即生效，已完成数保留
  if (rec.goal !== goal || rec.newTarget !== newTarget) {
    rec.goal = goal;
    rec.newTarget = newTarget;
    store.touch();
  }
  return rec;
}

function dayAggregate(user, ts) {
  const db = store.get();
  const key = srs.dayKey(ts);
  const entries = Object.values(db.days[user.id] || {});
  const totals = entries.reduce(
    (acc, d) => {
      acc.done += d.newDone + d.reviewDone;
      acc.correct += d.correct || 0;
      acc.wrong += d.wrong || 0;
      acc.seconds += d.seconds || 0;
      return acc;
    },
    { done: 0, correct: 0, wrong: 0, seconds: 0 }
  );
  const booked = userWordIds(user);
  const prog = db.progress[user.id] || {};
  const learned = booked.filter((id) => prog[id] && prog[id].status !== 'new');
  const mastered = booked.filter((id) => prog[id] && prog[id].status === 'mastered');
  const due = booked.filter((id) => {
    const p = prog[id];
    return p && p.status !== 'new' && p.due <= ts;
  });
  const fresh = booked.filter((id) => !prog[id] || prog[id].status === 'new');
  return { key, totals, learned: learned.length, mastered: mastered.length, due: due.length, fresh: fresh.length };
}

function streak(user, ts) {
  const db = store.get();
  const days = db.days[user.id] || {};
  let count = 0;
  let cursor = srs.startOfDay(ts);
  if (!days[srs.dayKey(cursor)] || !days[srs.dayKey(cursor)].checkIn) cursor -= DAY;
  while (days[srs.dayKey(cursor)] && days[srs.dayKey(cursor)].checkIn) {
    count += 1;
    cursor -= DAY;
  }
  return count;
}

/* ---------------- 任务队列 ---------------- */

function buildQueue(user, ts) {
  const db = store.get();
  const booked = userWordIds(user);
  const prog = db.progress[user.id] || {};
  const day = ensureDay(user, ts);
  const newSlots = Math.max(0, day.newTarget - day.newDone);

  const due = [];
  const fresh = [];
  for (const id of booked) {
    const p = prog[id];
    if (!p || p.status === 'new') fresh.push(id);
    else if (p.due <= ts) due.push(id);
    else if (p.nextView && p.nextView <= ts) due.push(id);
  }
  // 到期的按到期时间先后，新词按词库顺序
  due.sort((a, b) => (prog[a].due || 0) - (prog[b].due || 0));
  const queue = due.slice(0, Math.max(0, day.goal - day.newDone - day.reviewDone)).concat(fresh.slice(0, newSlots));
  return { queue, day, dueCount: due.length, freshCount: fresh.length };
}

function refreshQueue(user, ts) {
  const db = store.get();
  const built = buildQueue(user, ts);
  user.session = { wordIds: built.queue.slice(), index: 0, generatedAt: ts };
  store.touch();
  return Object.assign(built, { session: user.session });
}

function nextFromSession(user, ts) {
  const db = store.get();
  const sess = user.session;
  if (!sess || !sess.wordIds || Date.now() - sess.generatedAt > 6 * 3600 * 1000 || sess.index >= sess.wordIds.length) {
    refreshQueue(user, ts);
  }
  const s = user.session;
  while (s.index < s.wordIds.length) {
    const id = s.wordIds[s.index];
    const w = books.findWord(id);
    if (!w) {
      s.index += 1;
      continue;
    }
    return w;
  }
  return null;
}

function payloadForWord(w, user, withOptions) {
  const p = progressOf(user, w.id);
  const out = {
    id: w.id,
    word: w.word,
    phonetic: w.phonetic,
    pos: w.pos,
    meaning: w.meaning,
    example: w.example,
    exampleCn: w.exampleCn,
    status: p ? p.status : 'new',
    due: p ? p.due : 0,
    audio: 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(w.word) + '&type=1',
  };
  if (withOptions) out.options = optionsFor(w, 4);
  return out;
}

function optionsFor(word, count, field) {
  const key = field === 'word' ? 'word' : 'meaning';
  const db = store.get();
  // 单词卡与整句卡分开出题，避免把整句当干扰项（选项长度差异过大时无法作答）
  const sameClass = (list) => {
    const isShort = String(word[key] || '').length <= 24;
    const hit = list.filter((w) => (String(w[key] || '').length <= 24) === isShort);
    return hit.length >= count ? hit : list;
  };
  const pool = sameClass(books.bookWords(word.bookId).filter((w) => w.id !== word.id && w[key]));
  const fallback = pool.length < count
    ? sameClass(Object.values(db.words).flatMap((b) => Object.values(b)).filter((w) => w.id !== word.id && w[key]))
    : pool;
  const picked = [];
  const used = new Set([word.id]);
  let guard = 0;
  while (picked.length < count - 1 && guard < 400) {
    guard += 1;
    const w = fallback[Math.floor(Math.random() * fallback.length)];
    if (!w || used.has(w.id)) continue;
    used.add(w.id);
    picked.push(w[key]);
  }
  const all = picked.concat(word[key]).filter(Boolean);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}

/* ---------------- 路由处理 ---------------- */

const routes = {
  'GET /api/health': () => {
    const db = store.get();
    return {
      ok: true,
      app: '背小单',
      time: Date.now(),
      users: Object.keys(db.users).length,
      wordbooks: db.wordbooks.length,
      words: Object.values(db.words).reduce((n, b) => n + Object.keys(b).length, 0),
    };
  },

  'POST /api/auth/wx-login': async (body) => {
    let openid = '';
    try {
      const r = await wxCode2Session(body.code);
      openid = r.openid;
    } catch (e) {
      if (!cfg.wxDevFallback || e.status !== 501) throw e;
      openid = ''; // 本地联调：无密钥时退化为演示账号
    }
    if (!openid) {
      const demo = auth.findBy((u) => u.account === 'demo');
      const user = demo || auth.createUser({ account: 'demo', nickname: '演示用户' });
      if (!user.passwordHash) auth.setPassword(user, '123456');
      return { ok: true, token: auth.issueToken(user), user: auth.publicUser(user), mode: 'demo', hint: '当前为本地演示账号，可在"我的"里改密码' };
    }
    let user = auth.findBy((u) => u.openid === openid);
    if (!user) user = auth.createUser({ openid, nickname: '微信用户' });
    store.get().users[user.id].lastLoginAt = Date.now();
    store.touch();
    return { ok: true, token: auth.issueToken(user), user: auth.publicUser(user), mode: 'wechat' };
  },

  'POST /api/auth/register': async (body, req) => {
    const account = auth.norm(body.account);
    const password = String(body.password || '');
    if (!account || account.length < 3) throw new HttpError(400, '账号至少 3 个字符');
    if (password.length < 6) throw new HttpError(400, '密码至少 6 位');
    if (auth.findBy((u) => u.account === account)) throw new HttpError(409, '该账号已存在');
    const user = auth.createUser({ account, passwordHash: auth.hash(password), nickname: body.nickname || account });
    return { ok: true, token: auth.issueToken(user), user: auth.publicUser(user) };
  },

  'POST /api/auth/login': async (body) => {
    const account = auth.norm(body.account);
    const user = auth.findBy((u) => u.account === account);
    if (!user || !user.passwordHash || user.passwordHash !== auth.hash(body.password || '')) {
      throw new HttpError(401, '账号或密码不正确');
    }
    store.get().users[user.id].lastLoginAt = Date.now();
    store.touch();
    return { ok: true, token: auth.issueToken(user), user: auth.publicUser(user) };
  },

  'POST /api/auth/logout': async (body, req) => {
    const user = getUser(req);
    auth.dropToken(user, req.headers['x-token']);
    return { ok: true };
  },

  'GET /api/me': async (body, req) => {
    const user = getUser(req);
    const agg = dayAggregate(user, Date.now());
    return {
      ok: true,
      user: auth.publicUser(user),
      stats: {
        streak: streak(user, Date.now()),
        learned: agg.learned,
        mastered: agg.mastered,
        due: agg.due,
        total: userWordIds(user).length,
      },
    };
  },

  'POST /api/me/update': async (body, req) => {
    const user = getUser(req);
    const db = store.get();
    const u = db.users[user.id];
    if (body.nickname !== undefined) u.nickname = auth.norm(body.nickname).slice(0, 24) || u.nickname;
    if (body.dailyGoal !== undefined) u.dailyGoal = clampInt(body.dailyGoal, 5, 200);
    if (body.newWordLimit !== undefined) u.newWordLimit = clampInt(body.newWordLimit, 0, 100);
    if (body.bookIds !== undefined) u.bookIds = Array.isArray(body.bookIds) ? body.bookIds.filter((id) => db.wordbooks.find((b) => b.id === id)) : u.bookIds;
    if (body.password !== undefined) {
      const p = String(body.password);
      if (p.length < 6) throw new HttpError(400, '密码至少 6 位');
      u.passwordHash = auth.hash(p);
      if (!u.account) u.account = 'u' + u.id;
    }
    store.touch();
    return { ok: true, user: auth.publicUser(u) };
  },

  'GET /api/books': async (body, req) => {
    const user = getUser(req);
    const db = store.get();
    const selected = new Set(userBookIds(user));
    return {
      ok: true,
      books: db.wordbooks
        .filter((b) => b.source === 'builtin' || b.ownerId === user.id)
        .map((b) => ({
          id: b.id,
          title: b.title,
          description: b.description,
          source: b.source,
          count: Object.keys(db.words[b.id] || {}).length,
          selected: selected.has(b.id),
        })),
    };
  },

  'GET /api/books/:id/words': async (body, req) => {
    const user = getUser(req);
    const book = mustBook(req.params.id, user);
    const db = store.get();
    const kw = auth.norm(req.query.kw).toLowerCase();
    let list = books.bookWords(book.id);
    if (kw) list = list.filter((w) => w.word.toLowerCase().includes(kw) || w.meaning.includes(kw));
    const prog = db.progress[user.id] || {};
    list = list
      .slice()
      .sort((a, b) => a.word.localeCompare(b.word))
      .map((w) => {
        const p = prog[w.id];
        return {
          id: w.id,
          word: w.word,
          phonetic: w.phonetic,
          pos: w.pos,
          meaning: w.meaning,
          status: p ? p.status : 'new',
          due: p ? p.due : 0,
          reps: p ? p.reps : 0,
        };
      });
    const page = clampInt(intOr(req.query.page, 1) - 1, 0, 100000);
    const size = clampInt(intOr(req.query.size, 50), 1, 500);
    return { ok: true, total: list.length, page: page + 1, size, words: list.slice(page * size, page * size + size) };
  },

  'GET /api/books/:id/words/:wordId': async (body, req) => {
    const user = getUser(req);
    const book = mustBook(req.params.id, user);
    const w = (store.get().words[book.id] || {})[auth.norm(req.params.wordId)];
    if (!w) throw new HttpError(404, '单词不存在');
    return { ok: true, word: payloadForWord(w, user, false), book: { id: book.id, title: book.title, source: book.source, editable: book.source !== 'builtin' } };
  },

  'POST /api/books': async (body, req) => {
    const user = getUser(req);
    const title = auth.norm(body.title).slice(0, 30);
    if (!title) throw new HttpError(400, '请填写词库名称');
    const db = store.get();
    const id = 'bk-' + store.nextId();
    db.wordbooks.push({ id, title, description: auth.norm(body.description).slice(0, 80), source: 'user', ownerId: user.id, count: 0, createdAt: Date.now() });
    db.words[id] = {};
    store.touch();
    return { ok: true, book: { id, title, count: 0 } };
  },

  'POST /api/books/:id/words': async (body, req) => {
    const user = getUser(req);
    const book = mustBook(req.params.id, user, true);
    const list = books.normalizeImport(body.words && Array.isArray(body.words) ? body.words : [body]);
    if (!list.length) throw new HttpError(400, '缺少 word 或 meaning 字段');
    const r = books.importIntoBook(book.id, list);
    if (r.created) book.count = Object.keys(store.get().words[book.id]).length;
    store.touch();
    return { ok: true, created: r.created, updated: r.skipped.length, count: book.count };
  },

  'POST /api/books/:id/import': async (body, req) => {
    const user = getUser(req);
    const book = mustBook(req.params.id, user, true);
    const list = books.normalizeImport(body.data);
    if (!list.length) throw new HttpError(400, '没有解析到有效单词，请检查格式（第一行表头：word,meaning,phonetic,pos,example,example_cn）');
    const r = books.importIntoBook(book.id, list);
    book.count = Object.keys(store.get().words[book.id]).length;
    if (!user.bookIds.includes(book.id)) {
      store.get().users[user.id].bookIds = user.bookIds.concat(book.id);
    }
    store.touch();
    return { ok: true, created: r.created, updated: r.skipped.length, count: book.count, skipped: r.skipped.slice(0, 20) };
  },

  'POST /api/words/update': async (body, req) => {
    const user = getUser(req);
    const w = mustWordWritable(body.wordId, user);
    const db = store.get();
    const fields = ['word', 'phonetic', 'pos', 'meaning', 'example', 'exampleCn'];
    for (const f of fields) {
      const key = f === 'exampleCn' ? 'example_cn' : f;
      if (body[key] !== undefined) w[f] = auth.norm(body[key]);
    }
    db.words[w.bookId][w.id] = w;
    store.touch();
    return { ok: true, word: w };
  },

  'POST /api/words/delete': async (body, req) => {
    const user = getUser(req);
    const w = mustWordWritable(body.wordId, user);
    const db = store.get();
    delete db.words[w.bookId][w.id];
    if (db.progress[user.id]) delete db.progress[user.id][w.id];
    const book = db.wordbooks.find((b) => b.id === w.bookId);
    if (book) book.count = Object.keys(db.words[w.bookId] || {}).length;
    store.touch();
    return { ok: true, count: book ? book.count : 0 };
  },

  'GET /api/study/queue': async (body, req) => {
    const user = getUser(req);
    const now = Date.now();
    const built = refreshQueue(user, now);
    const day = built.day;
    const word = nextFromSession(user, now);
    const agg = dayAggregate(user, now);
    return {
      ok: true,
      day: {
        date: day.date,
        goal: day.goal,
        newTarget: day.newTarget,
        newDone: day.newDone,
        reviewDone: day.reviewDone,
        done: day.newDone + day.reviewDone,
        checkIn: day.checkIn,
      },
      counts: { due: agg.due, fresh: agg.fresh, learned: agg.learned, mastered: agg.mastered, total: userWordIds(user).length },
      streak: streak(user, now),
      hasNext: !!word,
      remaining: Math.max(0, user.session.wordIds.length - user.session.index),
      card: word ? payloadForWord(word, user, false) : null,
    };
  },

  'POST /api/study/grade': async (body, req) => {
    const user = getUser(req);
    const now = Date.now();
    const wordId = auth.norm(body.wordId);
    if (!books.findWord(wordId)) throw new HttpError(404, '单词不存在');
    const prev = progressOf(user, wordId);
    const rating = body.rating !== undefined ? clampInt(body.rating, 0, 3) : srs.fromAnswer(!!body.correct, body.confident !== false);
    const next = srs.grade(prev, rating, now);
    setProgress(user, wordId, next);
    const day = ensureDay(user, now);
    if (prev && prev.status !== 'new') day.reviewDone += 1;
    else day.newDone += 1;
    if (rating === srs.RATING.AGAIN) day.wrong += 1;
    else day.correct += 1;
    day.seconds += clampInt(body.seconds, 0, 600);
    if (user.session) {
      user.session.index += 1;
      if (!user.session.wordIds.includes(wordId)) user.session.wordIds.push(wordId);
    }
    store.touch();
    const word = books.findWord(wordId);
    const done = day.newDone + day.reviewDone;
    return {
      ok: true,
      status: next.status,
      intervalDays: Math.round(next.interval / DAY),
      due: next.due,
      word: payloadForWord(word, user, false),
      day: { goal: day.goal, done, checkIn: day.checkIn },
      canCheckIn: done > 0 && !day.checkIn,
      hasNext: !!nextFromSession(user, now),
    };
  },

  'GET /api/quiz': async (body, req) => {
    const user = getUser(req);
    const now = Date.now();
    const mode = ['choice', 'spelling', 'meaning'].includes(req.query.mode) ? req.query.mode : 'choice';
    const limit = clampInt(intOr(req.query.limit, 10), 1, cfg.maxQuizSize);
    const ids = pickQuizIds(user, now, limit);
    const questions = ids.map((id, i) => {
      const w = books.findWord(id);
      const base = { qid: `${i}:${id}`, wordId: id, answer: w.word };
      if (mode === 'spelling') {
        return Object.assign(base, { type: 'spelling', stem: w.meaning, pos: w.pos, phonetic: w.phonetic, hint: w.word[0] + w.word.slice(1).replace(/[aeiou]/gi, '·'), meaning: w.meaning, audio: audioUrl(w.word) });
      }
      if (mode === 'meaning') {
        return Object.assign(base, { type: 'meaning', stem: w.word, answer: w.meaning, options: optionsFor(w, 4, 'meaning'), askMeaning: true, audio: audioUrl(w.word) });
      }
      return Object.assign(base, { type: 'choice', stem: w.meaning, answer: w.word, options: optionsFor(w, 4, 'word'), askMeaning: false, audio: audioUrl(w.word) });
    });
    return { ok: true, mode, questions };
  },

  'POST /api/quiz/answers': async (body, req) => {
    const user = getUser(req);
    const now = Date.now();
    const answers = Array.isArray(body.answers) ? body.answers.slice(0, cfg.maxQuizSize) : [];
    const results = [];
    let correct = 0;
    for (const a of answers) {
      const wordId = auth.norm(a.wordId);
      const w = books.findWord(wordId);
      if (!w) continue;
      const given = auth.norm(a.value).toLowerCase().replace(/\s+/g, '');
      const want = String(a.type === 'meaning' ? w.meaning : w.word).toLowerCase().replace(/\s+/g, '');
      const isOk = !!given && given === want;
      const prev = progressOf(user, wordId);
      const next = srs.grade(prev, srs.fromAnswer(isOk, a.confident !== false), now);
      setProgress(user, wordId, next);
      const day = ensureDay(user, now);
      if (prev && prev.status !== 'new') day.reviewDone += 1;
      else day.newDone += 1;
      if (isOk) {
        correct += 1;
        day.correct += 1;
      } else day.wrong += 1;
      results.push({ wordId, word: w.word, meaning: w.meaning, correct: isOk, yourAnswer: a.value, status: next.status });
    }
    store.touch();
    return { ok: true, total: results.length, correct, results };
  },

  'POST /api/checkin': async (body, req) => {
    const user = getUser(req);
    const now = Date.now();
    const day = ensureDay(user, now);
    if (day.newDone + day.reviewDone <= 0) throw new HttpError(400, '今天还没有背单词，先学几个再来打卡');
    day.checkIn = true;
    store.touch();
    return { ok: true, date: day.date, streak: streak(user, now) };
  },

  'GET /api/stats': async (body, req) => {
    const user = getUser(req);
    const now = Date.now();
    const db = store.get();
    const days = Object.values(db.days[user.id] || {}).sort((a, b) => (a.date < b.date ? -1 : 1));
    const recent = days.slice(-30).map((d) => ({
      date: d.date,
      done: d.newDone + d.reviewDone,
      goal: d.goal,
      correct: d.correct,
      wrong: d.wrong,
      checkIn: d.checkIn,
      seconds: d.seconds,
    }));
    const agg = dayAggregate(user, now);
    let totalCorrect = 0;
    let totalWrong = 0;
    days.forEach((d) => {
      totalCorrect += d.correct || 0;
      totalWrong += d.wrong || 0;
    });
    return {
      ok: true,
      today: recent[recent.length - 1] || null,
      streak: streak(user, now),
      totalDays: days.filter((d) => d.checkIn).length,
      learned: agg.learned,
      mastered: agg.mastered,
      due: agg.due,
      total: userWordIds(user).length,
      accuracy: totalCorrect + totalWrong ? Math.round((totalCorrect / (totalCorrect + totalWrong)) * 100) : 0,
      history: recent,
      byStatus: statusBreakdown(user),
    };
  },

  'GET /api/admin/users': async (body, req) => {
    const user = mustAdmin(getUser(req));
    const db = store.get();
    return {
      ok: true,
      users: Object.values(db.users).map((u) => {
        const a = dayAggregate(u, Date.now());
        return Object.assign(auth.publicUser(u), {
          learned: a.learned,
          due: a.due,
          streak: streak(u, Date.now()),
          totalDone: a.totals.done,
          books: (u.bookIds || []).length,
          lastLoginAt: u.lastLoginAt,
        });
      }),
    };
  },

  'POST /api/admin/users/update': async (body, req) => {
    mustAdmin(getUser(req));
    const db = store.get();
    const target = db.users[auth.norm(body.userId)];
    if (!target) throw new HttpError(404, '用户不存在');
    if (body.role === 'admin' || body.role === 'user') target.role = body.role;
    if (body.dailyGoal !== undefined) target.dailyGoal = clampInt(body.dailyGoal, 5, 200);
    if (body.resetPassword) {
      target.passwordHash = auth.hash(String(body.resetPassword).length >= 6 ? body.resetPassword : '123456');
      if (!target.account) target.account = 'u' + target.id;
    }
    store.touch();
    return { ok: true, user: auth.publicUser(target) };
  },

  'POST /api/admin/books': async (body, req) => {
    const admin = mustAdmin(getUser(req));
    const title = auth.norm(body.title).slice(0, 30);
    if (!title) throw new HttpError(400, '请填写词库名称');
    const db = store.get();
    const id = 'bk-' + store.nextId();
    db.wordbooks.push({ id, title, description: auth.norm(body.description).slice(0, 80), source: 'global', ownerId: admin.id, count: 0, createdAt: Date.now() });
    db.words[id] = {};
    store.touch();
    return { ok: true, book: { id, title } };
  },
};

/* ---------------- 辅助 ---------------- */

function audioUrl(word) {
  return 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(word) + '&type=1';
}

function intOr(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function clampInt(v, min, max) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function mustBook(id, user, writable) {
  const db = store.get();
  const book = db.wordbooks.find((b) => b.id === auth.norm(id));
  if (!book) throw new HttpError(404, '词库不存在');
  if (writable && book.source === 'builtin') throw new HttpError(403, '内置词库不可修改，请导入到"我的词库"');
  if (writable && book.source === 'user' && book.ownerId !== user.id) throw new HttpError(403, '无权修改他人词库');
  return book;
}

function mustWordWritable(wordId, user) {
  const w = books.findWord(auth.norm(wordId));
  if (!w) throw new HttpError(404, '单词不存在');
  const db = store.get();
  const book = db.wordbooks.find((b) => b.id === w.bookId);
  if (!book || book.source === 'builtin') throw new HttpError(403, '内置词库不可修改');
  if (book.ownerId !== user.id && book.source !== 'global') throw new HttpError(403, '无权修改该单词');
  return w;
}

function mustAdmin(user) {
  if (user.role !== 'admin') throw new HttpError(403, '需要管理员权限');
  return user;
}

function statusBreakdown(user) {
  const db = store.get();
  const prog = db.progress[user.id] || {};
  const ids = userWordIds(user);
  const out = { new: 0, learning: 0, review: 0, mastered: 0 };
  for (const id of ids) {
    const p = prog[id];
    if (!p) out.new += 1;
    else out[p.status] = (out[p.status] || 0) + 1;
  }
  return out;
}

function pickQuizIds(user, now, limit) {
  const db = store.get();
  const prog = db.progress[user.id] || {};
  const all = userWordIds(user);
  const due = all.filter((id) => prog[id] && prog[id].status !== 'new' && prog[id].due <= now);
  const pool = due.length >= limit ? due : all.filter((id) => !prog[id] || prog[id].status !== 'mastered');
  const use = pool.length ? pool : all;
  const shuffled = use.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(limit, shuffled.length));
}

/* ---------------- 分发 ---------------- */

const COMPILED = Object.keys(routes).map((pattern) => {
  const [method, full] = pattern.split(' ');
  return { method, segments: full.split('/').slice(2), handler: routes[pattern] };
});

async function handle(req, res, params, query) {
  const matched = COMPILED.find((r) => r.method === req.method && r.segments.length === params.length && r.segments.every((s, i) => s.startsWith(':') || s === params[i]));
  if (!matched) {
    send(res, 404, { ok: false, error: '接口不存在: ' + req.method + ' ' + req.pathname });
    return;
  }
  req.params = {};
  matched.segments.forEach((s, i) => {
    if (s.startsWith(':')) req.params[s.slice(1)] = decodeURIComponent(params[i]);
  });
  req.query = query || {};
  try {
    const body = req.method === 'GET' ? {} : await readBody(req);
    const out = await matched.handler(body, req);
    send(res, 200, out);
  } catch (e) {
    if (e instanceof HttpError) {
      send(res, e.status, { ok: false, error: e.message, extra: e.extra });
    } else {
      console.error('[api] 未处理异常', req.method, req.pathname, e && e.stack);
      send(res, 500, { ok: false, error: '服务器内部错误: ' + (e && e.message) });
    }
  }
}

module.exports = { handle, routes };
