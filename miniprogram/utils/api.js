const cfg = require('./config');

const TOKEN_KEY = 'bx_token';

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || '';
}

function setToken(token) {
  if (token) wx.setStorageSync(TOKEN_KEY, token);
  else wx.removeStorageSync(TOKEN_KEY);
}

function raw(method, path, data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: cfg.getBaseUrl() + path,
      method,
      data,
      header: { 'Content-Type': 'application/json', 'X-Token': getToken() },
      timeout: 12000,
      success(res) {
        const body = res.data || {};
        if (res.statusCode >= 200 && res.statusCode < 300 && body.ok !== false) return resolve(body);
        const err = new Error(body.error || `请求失败(${res.statusCode})`);
        err.status = res.statusCode;
        err.code = body.code;
        reject(err);
      },
      fail(err) {
        const e = new Error('连不上服务器，请确认后端已启动、地址正确');
        e.status = 0;
        e.detail = err && err.errMsg;
        reject(e);
      },
    });
  });
}

async function request(method, path, data, allowRetry) {
  try {
    return await raw(method, path, data);
  } catch (e) {
    if (e.status === 401 && allowRetry !== false && !path.startsWith('/api/auth/')) {
      setToken('');
      await ensureLogin();
      return request(method, path, data, false);
    }
    throw e;
  }
}

function wxLogin() {
  return new Promise((resolve, reject) => {
    wx.login({ success: (r) => resolve(r.code), fail: reject });
  });
}

let pendingLogin = null;

function ensureLogin() {
  if (getToken()) return Promise.resolve({ token: getToken() });
  if (pendingLogin) return pendingLogin;
  pendingLogin = wxLogin()
    .then((code) => raw('POST', '/api/auth/wx-login', { code }))
    .then((res) => {
      setToken(res.token);
      getApp().globalData.user = res.user;
      return res;
    })
    .finally(() => {
      pendingLogin = null;
    });
  return pendingLogin;
}

function logout() {
  return raw('POST', '/api/auth/logout', {}).catch(() => {}).then(() => setToken(''));
}

module.exports = {
  getToken,
  setToken,
  request,
  ensureLogin,
  logout,
  get: (p, q) => request('GET', p + buildQuery(q)),
  post: (p, d) => request('POST', p, d || {}),
};

function buildQuery(obj) {
  if (!obj) return '';
  const parts = Object.keys(obj)
    .filter((k) => obj[k] !== undefined && obj[k] !== null && obj[k] !== '')
    .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]));
  return parts.length ? '?' + parts.join('&') : '';
}
