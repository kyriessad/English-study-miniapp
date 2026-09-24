// Shared presentation of the existing personal-review contract. Counts are not mastery scores.
function dailyGoal() {
  try {
    const value = Number(wx.getStorageSync('dailyGoal'));
    if ([3, 5, 10, 15].includes(value)) return value;
  } catch (_) {}
  return 5;
}

function overviewView(overview) {
  const goal = overview.goalProgress || {};
  const suggested = overview.suggested || {};
  const active = overview.activeSession || {};
  const read = (object, snake, camel) => object[snake] !== undefined ? object[snake] : object[camel];
  const today = Number(read(goal, 'completed_unique_today', 'completedUniqueToday') || 0);
  const hasReviewable = read(goal, 'has_any_reviewable_cards', 'hasAnyReviewableCards');
  const goalMet = read(goal, 'is_goal_met', 'isGoalMet') === true;
  const activeSessionId = active.id || active.session_id || '';
  const reviewCount = Number(read(suggested, 'review_count', 'reviewCount') || 0);
  const newCount = Number(read(suggested, 'new_count', 'newCount') || 0);
  return {
    today, activeSessionId, reviewCount, newCount, goalMet,
    hasReviewable: hasReviewable !== false,
    overviewReady: true,
    reviewHeading: activeSessionId ? '接着上次，继续记住' : hasReviewable === false ? '从一句想记住的英语开始' : goalMet ? '今天的目标已完成' : '让想记住的英语留下来',
    reviewAction: activeSessionId ? '继续上次复习' : hasReviewable === false ? '去挑一句英语' : goalMet ? '再练一轮（可选）' : '开始今日复习'
  };
}

module.exports = { dailyGoal, overviewView };
