const fs = require('fs');
const path = require('path');
const cfg = require('./config');

const EMPTY = {
  version: 1,
  seq: 1,
  users: {},
  wordbooks: [],
  words: {},
  progress: {},
  days: {},
  meta: { loadedBooks: {} },
};

let db = null;
let writeTimer = null;
let writing = false;

function load() {
  if (db) return db;
  if (fs.existsSync(cfg.dbFile)) {
    try {
      db = Object.assign({}, EMPTY, JSON.parse(fs.readFileSync(cfg.dbFile, 'utf8')));
    } catch (e) {
      const backup = cfg.dbFile + '.broken-' + Date.now();
      fs.renameSync(cfg.dbFile, backup);
      console.error('[db] db.json 解析失败，已备份到', backup, e.message);
      db = JSON.parse(JSON.stringify(EMPTY));
    }
  } else {
    db = JSON.parse(JSON.stringify(EMPTY));
  }
  return db;
}

function flushNow() {
  if (!db) return;
  const tmp = cfg.dbFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, cfg.dbFile);
}

function scheduleWrite() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    if (writing) {
      scheduleWrite();
      return;
    }
    writing = true;
    try {
      flushNow();
    } catch (e) {
      console.error('[db] 写入失败', e.message);
    }
    writing = false;
  }, 150);
}

function ensureDirs() {
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  fs.mkdirSync(cfg.wordbookDir, { recursive: true });
}

function nextId() {
  load();
  return String(db.seq++);
}

function touch() {
  scheduleWrite();
}

function save() {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  flushNow();
}

module.exports = {
  ensureDirs,
  load,
  get: () => load(),
  set: (next) => {
    db = next;
    scheduleWrite();
  },
  nextId,
  touch: scheduleWrite,
  save,
  path: () => path.relative(process.cwd(), cfg.dbFile),
};
