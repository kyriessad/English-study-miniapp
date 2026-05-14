// Phase 4D-2A: 卡片存储 facade
//
// 用途：
//   只面向首页 (index.js) 和新增/编辑页 (add.js) 以及部分工具模块，
//   导出 recordStorage 的稳定卡片 CRUD API。
//
// 本阶段只做 re-export，不重写逻辑。
//
// 注意：
//   - 不要在此引入 legacy review、history review、旧微信云同步函数。
//   - 不要在此新增函数，所有稳定卡片 API 应保持从 recordStorage re-export。
//   - 本 facade 是卡片 CRUD 的唯一导出入口；迁移完成后，页面应不再直接依赖 recordStorage。

const {
  getCards,
  refreshCardsCacheFromBackend,
  syncPendingCardsToBackend,
  addCard,
  updateCard,
  deleteCard,
  deleteCards,
  updateCardsMeta,
  getCardById,
  updateBackendCardSyncState,
  DEFAULT_EXAM_SCENE,
  DEFAULT_EXAM_MODULE,
} = require('./recordStorage');

module.exports = {
  getCards,
  refreshCardsCacheFromBackend,
  syncPendingCardsToBackend,
  addCard,
  updateCard,
  deleteCard,
  deleteCards,
  updateCardsMeta,
  getCardById,
  updateBackendCardSyncState,
  DEFAULT_EXAM_SCENE,
  DEFAULT_EXAM_MODULE,
};
