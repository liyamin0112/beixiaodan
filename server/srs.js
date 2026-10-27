// 简化版 SM-2 间隔重复：以"天"为最小粒度，够用且易解释
const DAY = 86400000;
const RATING = { AGAIN: 0, HARD: 1, GOOD: 2, EASY: 3 };

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function today(ts) {
  return startOfDay(ts || Date.now());
}

function dayKey(ts) {
  const d = new Date(ts || Date.now());
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 新词第一次答对的间隔阶梯
const NEW_LADDER = [DAY, 2 * DAY, 4 * DAY, 7 * DAY, 15 * DAY];

function initialState(now) {
  return {
    status: 'new',
    reps: 0,
    lapses: 0,
    ease: 2.5,
    interval: 0,
    step: 0,
    due: 0,
    last: 0,
    nextView: null,
  };
}

function grade(p, rating, now) {
  const st = Object.assign(initialState(), p || {});
  const t = now || Date.now();
  st.last = t;
  st.reps += 1;

  if (rating === RATING.AGAIN) {
    st.lapses += 1;
    st.ease = Math.max(1.3, st.ease - 0.25);
    st.step = 0;
    st.interval = 0;
    st.status = 'learning';
    st.due = t + 10 * 60000; // 10 分钟内回炉
    st.nextView = null;
    return st;
  }

  if (st.status === 'new' || st.interval === 0) {
    st.interval = NEW_LADDER[Math.min(st.step, NEW_LADDER.length - 1)];
    st.step += 1;
  } else if (rating === RATING.HARD) {
    st.ease = Math.max(1.3, st.ease - 0.15);
    st.interval = Math.max(DAY, Math.round(st.interval * 1.2));
  } else if (rating === RATING.GOOD) {
    st.interval = Math.round(st.interval * st.ease);
  } else {
    st.ease = Math.min(3.2, st.ease + 0.12);
    st.interval = Math.round(st.interval * st.ease * 1.3);
  }

  st.interval = Math.min(st.interval, 180 * DAY);
  st.status = st.interval >= 30 * DAY ? 'mastered' : 'review';
  st.due = t + st.interval;
  st.nextView = st.status === 'mastered' ? t + 180 * DAY : null;
  return st;
}

// 题目难度反馈：答对=GOOD，答错=AGAIN（模糊按钮走 HARD）
function fromAnswer(correct, confident) {
  if (!correct) return RATING.AGAIN;
  return confident ? RATING.GOOD : RATING.HARD;
}

module.exports = { DAY, RATING, grade, initialState, fromAnswer, today, dayKey, startOfDay };
