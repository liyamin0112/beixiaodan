const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const cfg = require('./config');
const store = require('./db');
const books = require('./books');
const auth = require('./auth');
const api = require('./api');
const webDir = path.join(__dirname, 'web');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function seed() {
  const db = store.get();
  const r = books.syncFileBooks();
  if (r.added) console.log('[wordbooks] 载入内置词库:', r.books.join(', '));
  else if (db.wordbooks.length) console.log('[wordbooks] 内置词库已就绪:', r.books.join(', '));

  // 演示账号：admin/123456（管理员）、demo/123456（普通用户）
  const demoPlan = [
    { account: 'admin', nickname: '管理员', role: 'admin', dailyGoal: 20, bookIds: firstBooks(2) },
    { account: 'demo', nickname: '演示用户', role: 'user', dailyGoal: 10, bookIds: firstBooks(1) },
  ];
  for (const plan of demoPlan) {
    let u = auth.findBy((x) => x.account === plan.account);
    if (!u) {
      u = auth.createUser(Object.assign({ account: plan.account, passwordHash: auth.hash('123456') }, plan));
      console.log(`[seed] 已创建演示账号 ${plan.account}/123456 (${plan.role})`);
    } else if (!u.passwordHash) {
      auth.setPassword(u, '123456');
    }
  }
  if (!fs.existsSync(cfg.dbFile)) store.save();
}

function firstBooks(n) {
  return store.get().wordbooks.filter((b) => b.source === 'builtin').slice(0, n).map((b) => b.id);
}

function staticFile(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const full = path.join(webDir, rel);
  if (!full.startsWith(webDir)) return notFound(res);
  fs.readFile(full, (err, buf) => {
    if (err) return notFound(res);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
  return true;
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('not found');
}

function start() {
  store.ensureDirs();
  seed();
  store.save();

  const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url, true);
    const pathname = decodeURIComponent(parsed.pathname);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Token');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
    const parts = pathname.split('/').filter(Boolean);
    if (parts[0] === 'api') {
      req.pathname = pathname;
      return api.handle(req, res, parts.slice(1), parsed.query);
    }
    if (req.method === 'GET' && staticFile(req, res, pathname)) return;
    if (pathname === '/favicon.ico') return notFound(res);
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: '接口不存在: ' + req.method + ' ' + pathname }));
  });

  server.listen(cfg.port, cfg.host, () => {
    const line = `-`.repeat(52);
    console.log(line);
    console.log('  背小单 · 背单词服务已启动');
    console.log(`  本机地址   http://127.0.0.1:${cfg.port}`);
    console.log(`  局域网地址 http://<电脑IP>:${cfg.port}  （小程序真机/开发者工具用这个）`);
    console.log(`  数据文件   ${store.path()}`);
    console.log('  演示账号   admin / 123456 （管理员）');
    console.log('             demo / 123456 （普通用户）');
    console.log(line);
  });

  const shutdown = () => {
    try {
      store.save();
    } catch (e) {}
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { start };

if (require.main === module) start();
