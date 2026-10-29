// 服务地址配置：改这里即可
// 电脑换网络后 IP 会变，改这一行即可（终端里 ipconfig getifaddr en0 查看当前 IP）
// 模拟器和真机都走局域网 IP，手机需与电脑在同一 WiFi 下
// 也可以在小程序「我的 → 服务器地址」里临时修改，优先级高于这里
const DEFAULT_BASE_URL = 'http://192.168.3.58:8787';

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
