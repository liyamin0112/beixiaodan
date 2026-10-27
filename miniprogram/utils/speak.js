let ctx = null;

function getCtx() {
  if (!ctx) {
    ctx = wx.createInnerAudioContext();
    ctx.obeyMuteSwitch = false;
  }
  return ctx;
}

// 发音：走有道公开词典音频，无需自备文件；失败时静默提示
exports.speak = function (word) {
  if (!word) return;
  const audio = getCtx();
  audio.src = 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(word) + '&type=1';
  audio.play();
  audio.onError(() => {
    wx.showToast({ title: '发音加载失败', icon: 'none' });
  });
};

exports.stop = function () {
  if (ctx) ctx.stop();
};
