const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const store = require('./db');

const FILE_BOOKS = ['gr5-upper', 'xiaoxue', 'zhongkao', 'gaokao', 'cet4', 'hotel'];

function norm(s) {
  return String(s == null ? '' : s).trim();
}

function slugifyWord(word) {
  const base = norm(word).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return (base || 'word').slice(0, 40);
}

function makeWord(bookId, raw, index) {
  const w = norm(raw.word).replace(/\s+/g, ' ');
  if (!w) return null;
  const key = `${bookId}:${slugifyWord(w)}:${index}`;
  return {
    id: key,
    bookId,
    word: w,
    phonetic: norm(raw.phonetic),
    pos: norm(raw.pos),
    meaning: norm(raw.meaning || raw.translation),
    example: norm(raw.example),
    exampleCn: norm(raw.example_cn || raw.exampleCn),
    custom: bookId === 'custom',
  };
}

function registerBook(db, meta) {
  const existing = db.wordbooks.find((b) => b.id === meta.id);
  if (existing) {
    Object.assign(existing, { title: meta.title, description: meta.description, source: meta.source });
    return existing;
  }
  const book = {
    id: meta.id,
    title: meta.title,
    description: meta.description || '',
    source: meta.source || 'builtin',
    ownerId: meta.ownerId || null,
    createdAt: Date.now(),
  };
  db.wordbooks.push(book);
  return book;
}

function syncFileBooks() {
  const db = store.get();
  db.meta.loadedBooks = db.meta.loadedBooks || {};
  let added = 0;
  for (const file of FILE_BOOKS) {
    const p = path.join(cfg.wordbookDir, file + '.json');
    if (!fs.existsSync(p)) continue;
    const stamp = fs.statSync(p).mtimeMs;
    const bookId = 'bk-' + file;
    let data;
    try {
      data = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
      console.error(`[wordbooks] ${file}.json 解析失败: ${e.message}`);
      continue;
    }
    const book = registerBook(db, {
      id: bookId,
      title: data.title || file,
      description: data.description || '',
      source: 'builtin',
    });
    book.count = (data.words || []).length;
    book.file = file;
    book.fileMtime = stamp;
    const loaded = db.meta.loadedBooks[bookId];
    if (loaded && loaded.mtime === stamp) continue; // 文件未变，不重复写入

    db.words[bookId] = {};
    (data.words || []).forEach((raw, i) => {
      const w = makeWord(bookId, raw, i + 1);
      if (w) db.words[bookId][w.id] = w;
      added += w ? 1 : 0;
    });
    db.meta.loadedBooks[bookId] = { mtime: stamp, count: Object.keys(db.words[bookId]).length };
  }
  if (added) store.touch();
  return { added, books: db.wordbooks.filter((b) => b.source === 'builtin').map((b) => `${b.title}:${b.count}`) };
}

const CSV_DEFAULT_COLS = ['word', 'meaning', 'phonetic', 'pos', 'example', 'example_cn'];
const CSV_ALIASES = {
  word: ['word', '单词', '英文'],
  meaning: ['meaning', 'translation', '释义', '意思', '中文'],
  phonetic: ['phonetic', '音标', 'ipa'],
  pos: ['pos', '词性', 'part of speech'],
  example: ['example', '例句'],
  example_cn: ['example_cn', 'examplecn', '例句翻译', '例句中文', '翻译'],
};

function headerColumns(headerLine) {
  const cells = splitCsvLine(headerLine).map((c) => c.toLowerCase().replace(/\s+/g, '_'));
  const map = {};
  for (const key of CSV_DEFAULT_COLS) {
    const idx = cells.findIndex((c) => (CSV_ALIASES[key] || []).includes(c));
    if (idx >= 0) map[key] = idx;
  }
  return map.word !== undefined && map.meaning !== undefined ? map : null;
}

function parseCsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim() && !/^\s*#/.test(l));
  if (!lines.length) return [];
  const cols = headerColumns(lines[0]) || {};
  const get = (cells, key, fallback) => {
    const idx = cols[key] !== undefined ? cols[key] : fallback;
    return idx === null || idx === undefined ? '' : norm(cells[idx]);
  };
  const out = [];
  for (let i = cols.word !== undefined || cols.meaning !== undefined ? 1 : 0; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const item = {
      word: get(cells, 'word', 0),
      meaning: get(cells, 'meaning', 1),
      phonetic: get(cells, 'phonetic', 2),
      pos: get(cells, 'pos', 3),
      example: get(cells, 'example', 4),
      example_cn: get(cells, 'example_cn', 5),
    };
    if (item.word && item.meaning) out.push(item);
  }
  return out;
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let quote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quote = false;
      } else cur += c;
    } else if (c === '"') quote = true;
    else if (c === ',') {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

function normalizeImport(input) {
  const raw = typeof input === 'string' ? parseCsv(input) : Array.isArray(input) ? input : [];
  const out = [];
  for (const item of raw) {
    const w = makeWord('tmp', item, 1);
    if (!w || !w.meaning) continue;
    if (w.meaning.toLowerCase() === w.word.toLowerCase()) continue;
    out.push({
      word: w.word,
      phonetic: w.phonetic,
      pos: w.pos,
      meaning: w.meaning,
      example: w.example,
      example_cn: w.exampleCn,
    });
  }
  return out;
}

function importIntoBook(bookId, words) {
  const db = store.get();
  db.words[bookId] = db.words[bookId] || {};
  const book = db.wordbooks.find((b) => b.id === bookId);
  let index = Object.keys(db.words[bookId]).length;
  let created = 0;
  const skipped = [];
  for (const raw of words) {
    index += 1;
    const w = makeWord(bookId, raw, index);
    if (!w) continue;
    const dup = Object.values(db.words[bookId]).find((x) => x.word.toLowerCase() === w.word.toLowerCase());
    if (dup) {
      Object.assign(dup, { phonetic: w.phonetic || dup.phonetic, pos: w.pos || dup.pos, meaning: w.meaning, example: w.example, exampleCn: w.exampleCn });
      skipped.push({ word: w.word, reason: '已存在，已更新释义' });
      continue;
    }
    db.words[bookId][w.id] = w;
    created += 1;
  }
  if (book) book.count = Object.keys(db.words[bookId]).length;
  store.touch();
  return { created, skipped };
}

function bookWords(bookId) {
  const db = store.get();
  return Object.values(db.words[bookId] || {});
}

function findWord(wordId) {
  const db = store.get();
  for (const book of db.wordbooks) {
    if (wordId.startsWith(book.id + ':')) return (db.words[book.id] || {})[wordId] || null;
  }
  return null;
}

function allWordIds(bookIds) {
  const db = store.get();
  const out = [];
  for (const b of bookIds) {
    for (const id of Object.keys(db.words[b] || {})) out.push(id);
  }
  return out;
}

module.exports = {
  FILE_BOOKS,
  syncFileBooks,
  parseCsv,
  normalizeImport,
  importIntoBook,
  registerBook,
  bookWords,
  findWord,
  allWordIds,
  slugifyWord,
  norm,
};
