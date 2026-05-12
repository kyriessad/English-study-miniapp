// Phase 4D-2A: 历史复习兼容 facade
//
// 用途：
//   只面向历史复习页面 (history_index.js)，导出历史页所需的兼容 API。
//
// 数据状态：
//   历史页当前读取旧本地 reviewRecords（wx.getStorageSync('reviewRecords')）；
//   新复习主链路已走后端 submitReviewFeedback，不再写入 reviewRecords，
//   因此历史页数据存在断档。
//
// 本 facade 是兼容层，不是长期最终方案。
// 本阶段只做 re-export，不接入后端历史接口。
//
// 注意：
//   - 不要在此引入卡片 CRUD、legacy review、旧微信云同步函数。
//   - 不要在此新增函数。
//   - 本 facade 是历史页的唯一导出入口；迁移完成后，历史页应不再直接依赖 recordStorage。

const {
  getHistoryCardSummaries,
  filterHistoryCardSummariesByResult,
  getHistorySummaryStats,
} = require('./recordStorage');

module.exports = {
  getHistoryCardSummaries,
  filterHistoryCardSummariesByResult,
  getHistorySummaryStats,
};
