// 服务地址配置：改这里即可
// 1) 开发者工具本机调试用 127.0.0.1
// 2) 真机预览时把 127.0.0.1 换成运行 server 那台电脑的局域网 IP，例如 http://192.168.1.10:8787
// 也可以在小程序「我的 → 服务器地址」里临时修改，优先级高于这里
const DEFAULT_BASE_URL = 'http://127.0.0.1:8787';

exports.getBaseUrl = function () {
  const saved = wx.getStorageSync('serverUrl');
  return (saved && saved.trim()) || DEFAULT_BASE_URL;
};

exports.setBaseUrl = function (url) {
  const clean = String(url || '').trim().replace(/\/+$/, '');
  if (!clean) {
    wx.removeStorageSync('serverUrl');
    return DEFAULT_BASE_URL;
  }
  wx.setStorageSync('serverUrl', clean);
  return clean;
};

exports.DEFAULT_BASE_URL = DEFAULT_BASE_URL;
