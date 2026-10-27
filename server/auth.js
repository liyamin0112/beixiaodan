const crypto = require('crypto');
const store = require('./db');

const SALT = 'beixiaodan::v1::';

function hash(password) {
  return crypto.createHash('sha256').update(SALT + String(password)).digest('hex');
}

function random(len) {
  return crypto.randomBytes(len || 16).toString('hex');
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    nickname: u.nickname,
    avatar: u.avatar || '',
    role: u.role,
    account: u.account || '',
    hasPassword: !!u.passwordHash,
    boundWx: !!u.openid,
    bookIds: u.bookIds || [],
    dailyGoal: u.dailyGoal,
    newWordLimit: u.newWordLimit,
    createdAt: u.createdAt,
  };
}

function ensureCustomBook(userId) {
  const db = store.get();
  const id = 'me-' + userId;
  if (!db.wordbooks.find((b) => b.id === id)) {
    db.wordbooks.push({
      id,
      title: '我的词库',
      description: '自己录入或导入的单词',
      source: 'user',
      ownerId: userId,
      count: 0,
      createdAt: Date.now(),
    });
  }
  db.words[id] = db.words[id] || {};
  return id;
}

function createUser(fields) {
  const db = store.get();
  const id = 'u' + store.nextId();
  const user = Object.assign(
    {
      id,
      nickname: '学习者' + id.slice(1),
      avatar: '',
      role: Object.keys(db.users).length === 0 ? 'admin' : 'user',
      account: '',
      passwordHash: '',
      openid: '',
      tokens: {},
      bookIds: [],
      customBookId: ensureCustomBook(id),
      dailyGoal: 10,
      newWordLimit: 10,
      createdAt: Date.now(),
      lastLoginAt: Date.now(),
    },
    fields || {}
  );
  if (!user.customBookId) user.customBookId = ensureCustomBook(id);
  db.users[user.id] = user;
  store.touch();
  return user;
}

function findBy(fn) {
  const db = store.get();
  return Object.values(db.users).find(fn) || null;
}

function issueToken(user) {
  const db = store.get();
  const token = `${user.id}.${random(24)}`;
  db.users[user.id].tokens = db.users[user.id].tokens || {};
  db.users[user.id].tokens[token] = Date.now();
  store.touch();
  return token;
}

function userByToken(token) {
  if (!token) return null;
  const db = store.get();
  const userId = String(token).split('.')[0];
  const user = db.users[userId];
  if (!user || !user.tokens || !user.tokens[token]) return null;
  return user;
}

function dropToken(user, token) {
  const db = store.get();
  if (db.users[user.id] && db.users[user.id].tokens) {
    delete db.users[user.id].tokens[token];
    store.touch();
  }
}

function setPassword(user, password) {
  const db = store.get();
  db.users[user.id].passwordHash = hash(password);
  store.touch();
}

module.exports = { norm: (s) => String(s == null ? '' : s).trim(), hash, random, publicUser, createUser, findBy, issueToken, userByToken, dropToken, setPassword, ensureCustomBook };
