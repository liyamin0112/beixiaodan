// 接口回归自测：node test/api.test.js
// 使用临时数据目录，不会影响正式 data/db.json
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const PORT = 8791;
const BASE = `http://127.0.0.1:${PORT}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bxd-test-'));

function req(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const r = http.request(
      `${BASE}${urlPath}`,
      {
        method,
        headers: Object.assign(
          { 'Content-Type': 'application/json' },
          token ? { 'X-Token': token } : {},
          data ? { 'Content-Length': data.length } : {}
        ),
      },
      (res) => {
        let buf = '';
        res.on('data', (d) => (buf += d));
        res.on('end', () => {
          let json;
          try {
            json = JSON.parse(buf);
          } catch (e) {
            return reject(new Error(`${method} ${urlPath} 返回非 JSON: ${buf.slice(0, 120)}`));
          }
          json.__status = res.statusCode;
          resolve(json);
        });
      }
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

let passed = 0;
const failed = [];
function check(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed.push(name);
    console.log(`  ✗ ${name}${detail ? ' → ' + JSON.stringify(detail).slice(0, 200) : ''}`);
  }
}

async function waitReady() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await req('GET', '/api/health');
      if (r.ok) return r;
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('服务未启动');
}

(async () => {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: tmp }),
    stdio: 'ignore',
  });
  let token = '';
  let adminToken = '';
  try {
    const health = await waitReady();
    console.log('\n[1] 服务与内置词库');
    check('健康检查通过', health.ok && health.users >= 2);
    check('内置词库已载入', health.wordbooks >= 5, health);
    check('单词总量 > 800', health.words > 800, { words: health.words });

    console.log('\n[2] 登录与账号');
    const login = await req('POST', '/api/auth/login', { account: 'demo', password: '123456' });
    token = login.token;
    check('demo/123456 登录成功', login.ok && !!token, login);
    check('错误密码被拒绝', (await req('POST', '/api/auth/login', { account: 'demo', password: 'bad' })).__status === 401);
    check('未登录访问被拒绝', (await req('GET', '/api/books')).__status === 401);
    const reg = await req('POST', '/api/auth/register', { account: 'zhangsan', password: 'abc123', nickname: '张三' });
    adminToken = (await req('POST', '/api/auth/login', { account: 'admin', password: '123456' })).token;
    check('新账号注册成功', reg.ok && reg.user.role === 'user', reg);
    check('重复注册被拒绝', (await req('POST', '/api/auth/register', { account: 'zhangsan', password: 'abc123' })).__status === 409);
    const wx = await req('POST', '/api/auth/wx-login', { code: 'mock-code' });
    check('无密钥时微信登录退化为演示账号', wx.ok && wx.mode === 'demo');

    console.log('\n[3] 词库与学习清单');
    const list = await req('GET', '/api/books', undefined, token);
    const first = list.books.find((b) => b.source === 'builtin');
    check('词库列表返回', list.ok && list.books.length >= 4);
    check('默认选中第一个内置词库', !!first && first.selected);
    const words = await req('GET', `/api/books/${first.id}/words?page=1&size=20`, undefined, token);
    check('单词分页正常', words.ok && words.words.length === 20 && words.total > 100, { len: words.words && words.words.length, total: words.total });
    check('搜索可用', (await req('GET', `/api/books/${first.id}/words?kw=apple`, undefined, token)).words.every((w) => /apple|苹果/.test(w.word + w.meaning)));

    const queue = await req('GET', '/api/study/queue', undefined, token);
    check('今日任务生成 10 张卡', queue.ok && queue.day.goal === 10 && queue.remaining === 10, queue.day);

    await req('POST', '/api/me/update', { bookIds: ['bk-xiaoxue', 'bk-hotel'] }, token);
    const q2 = await req('GET', '/api/study/queue', undefined, token);
    const overlap = await req('GET', '/api/me', undefined, token);
    check('多本词库自动去重', q2.counts.total < 120 + 180 && overlap.stats.total === q2.counts.total, {
      total: q2.counts.total,
      me: overlap.stats.total,
    });
    await req('POST', '/api/me/update', { bookIds: ['bk-xiaoxue'] }, token);
    check('卡片字段完整', !!queue.card && !!queue.card.word && !!queue.card.meaning && !!queue.card.audio, queue.card);

    console.log('\n[4] 记忆曲线');
    const w1 = queue.card.id;
    const g1 = await req('POST', '/api/study/grade', { wordId: w1, rating: 2 }, token);
    check('认识 → 1 天后复习', g1.ok && g1.intervalDays === 1, g1);
    const g2 = await req('POST', '/api/study/grade', { wordId: w1, rating: 2 }, token);
    check('连续答对间隔变长', g2.intervalDays > g1.intervalDays, { g1: g1.intervalDays, g2: g2.intervalDays });
    const g3 = await req('POST', '/api/study/grade', { wordId: w1, rating: 0 }, token);
    check('答错 → 立即回炉', g3.status === 'learning' && g3.intervalDays === 0, g3);
    check('进度被记录', (await req('POST', '/api/study/grade', { wordId: w1, rating: 3 }, token)).status);

    console.log('\n[5] 测试题');
    const quiz = await req('GET', '/api/quiz?mode=choice&limit=5', undefined, token);
    check('选择题 5 题', quiz.ok && quiz.questions.length === 5, quiz.questions && quiz.questions.length);
    const q0 = quiz.questions[0];
    check('选项含唯一正确答案', q0.options.filter((o) => o === q0.answer).length === 1 && q0.options.length === 4, q0);
    check('选项无重复', new Set(q0.options).size === 4, q0.options);
    const spell = await req('GET', '/api/quiz?mode=spelling&limit=3', undefined, token);
    check('拼写题给出释义提示', spell.questions.length === 3 && !!spell.questions[0].stem && !!spell.questions[0].hint);
    const ans = await req(
      'POST',
      '/api/quiz/answers',
      { answers: [{ wordId: q0.wordId, type: 'choice', value: q0.answer }, { wordId: q0.wordId, type: 'choice', value: q0.options.find((o) => o !== q0.answer) }] },
      token
    );
    check('判分正确（一对一错）', ans.ok && ans.total === 2 && ans.correct === 1, ans);

    console.log('\n[6] 导入与自定义词库');
    const mine = list.books.find((b) => b.source === 'user');
    const imp = await req(
      'POST',
      `/api/books/${mine.id}/import`,
      { data: 'word,meaning,phonetic,pos,example,example_cn\nreservation,预订；预约,/rezərˈveɪʃn/,n.,I have a reservation.,我有一个预订。\nguest,客人,,n.,The guest arrived late.,客人迟到了。\nnomeaning,,,n.,,\nreservation,预约（重复行覆盖前面的）,,n.,,\n' },
      token
    );
    check('CSV 导入 2 条有效', imp.ok && imp.created === 2, imp);
    check('文件内重复行提示为更新', imp.updated === 1, imp);
    const jsonImp = await req('POST', `/api/books/${mine.id}/import`, { data: [{ word: 'deposit', meaning: '押金', example: 'Pay a deposit.', example_cn: '付押金。' }] }, token);
    check('JSON 数组导入成功', jsonImp.created === 1, jsonImp);
    const after = await req('GET', `/api/books/${mine.id}/words`, undefined, token);
    check('导入结果可查询', after.total === 3 && after.words.some((w) => w.word === 'deposit'), after.total);
    const upd = await req('POST', '/api/words/update', { wordId: after.words[0].id, meaning: '预订（已修改）' }, token);
    check('可编辑自建单词', upd.ok && upd.word.meaning === '预订（已修改）');
    const del = await req('POST', '/api/words/delete', { wordId: after.words[0].id }, token);
    check('可删除自建单词', del.ok && del.count === 2, del);
    check('内置词库只读', (await req('POST', `/api/books/${first.id}/words`, { word: 'hack', meaning: '测试' }, token)).__status === 403);

    console.log('\n[7] 打卡与统计');
    check('学过的词可打卡', (await req('POST', '/api/checkin', {}, token)).streak === 1);
    const me = await req('GET', '/api/me', undefined, token);
    check('我的页数据完整', me.ok && me.stats.streak === 1 && me.stats.learned >= 1, me.stats);
    const st = await req('GET', '/api/stats', undefined, token);
    check('统计含 30 天曲线', st.ok && st.history.length >= 1 && st.today.done >= 1, st.today);
    check('准确率已计算', st.accuracy > 0 && st.accuracy <= 100, st.accuracy);
    const set = await req('POST', '/api/me/update', { dailyGoal: 20, newWordLimit: 5, bookIds: [first.id, mine.id] }, token);
    check('可修改每日目标', set.user.dailyGoal === 20 && set.user.newWordLimit === 5);
    check('新目标生效', (await req('GET', '/api/study/queue', undefined, token)).day.goal === 20);

    console.log('\n[8] 管理员');
    check('普通用户越权被拒绝', (await req('GET', '/api/admin/users', undefined, token)).__status === 403);
    const users = await req('GET', '/api/admin/users', undefined, adminToken);
    check('管理员可查看成员', users.ok && users.users.length >= 3, users.users && users.users.length);
    const target = users.users.find((u) => u.account === 'zhangsan');
    check('管理员可重置密码', (await req('POST', '/api/admin/users/update', { userId: target.id, resetPassword: '654321' }, adminToken)).user.hasPassword);
    check('新密码可登录', (await req('POST', '/api/auth/login', { account: 'zhangsan', password: '654321' })).ok);
    check('管理员可建公共词库', (await req('POST', '/api/admin/books', { title: '员工服务英语' }, adminToken)).ok);

    console.log('\n[9] 健壮性');
    check('不存在的接口 404', (await req('GET', '/api/nope', undefined, token)).__status === 404);
    check('坏 JSON 返回 400', (await req('GET', '/api/me', undefined, 'bad.token')).__status === 401);
    check('未知单词 404', (await req('POST', '/api/study/grade', { wordId: 'no:such:1', rating: 2 }, token)).__status === 404);
  } catch (e) {
    failed.push('异常中断: ' + e.message);
    console.error('测试异常:', e);
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log(`\n结果：${passed} 项通过，${failed.length} 项失败`);
  if (failed.length) {
    failed.forEach((f) => console.log('  - ' + f));
    process.exit(1);
  }
  process.exit(0);
})();
