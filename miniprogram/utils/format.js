const STATUS = {
  new: { label: '未学', cls: 'tag--gray' },
  learning: { label: '学习中', cls: 'tag--orange' },
  review: { label: '复习中', cls: '' },
  mastered: { label: '已掌握', cls: 'tag--green' },
};

exports.status = (s) => STATUS[s] || STATUS.new;

exports.dayText = (ts) => {
  if (!ts) return '';
  const diff = ts - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  if (mins < 60) return `${diff > 0 ? mins + ' 分钟后' : mins + ' 分钟前'}`;
  const days = Math.round(abs / 86400000);
  if (days < 1) return diff > 0 ? '稍后' : '已到期';
  if (days === 1) return diff > 0 ? '明天' : '昨天';
  if (days < 30) return diff > 0 ? `${days} 天后` : `${days} 天前`;
  const months = Math.round(days / 30);
  return diff > 0 ? `${months} 个月后` : `${months} 个月前`;
};

exports.md = (dateStr) => (dateStr || '').slice(5).replace('-', '/');

exports.minutes = (seconds) => Math.max(1, Math.round((seconds || 0) / 60));

exports.percent = (done, goal) => (goal ? Math.min(100, Math.round((done / goal) * 100)) : 0);
