const { getTodayReviewed } = require('../../utils/apiClient');

const TODAY_REVIEWED_CACHE_KEY = 'todayReviewedCache';

const CARD_TYPE_MAP = {
  word: '单词',
  phrase: '短语',
  sentence: '句子'
};

const RESULT_LABELS = {
  forgot: '没想起',
  shaky: '有点模糊',
  got_it: '记得',
  fluent: '很熟'
};

const RESULT_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'weak', label: '有点忘了' },
  { key: 'mastered', label: '记得' }
];

function isWeakResult(r) { return r === 'forgot' || r === 'shaky'; }
function isMasteredResult(r) { return r === 'got_it' || r === 'fluent'; }

function applyResultFilter(items, filterKey) {
  if (filterKey === 'all' || !filterKey) return items;
  if (filterKey === 'weak') return items.filter(function (item) { return isWeakResult(item.lastResult); });
  if (filterKey === 'mastered') return items.filter(function (item) { return isMasteredResult(item.lastResult); });
  return items;
}

function computeResultFilterCounts(items) {
  var allCount = 0;
  var weakCount = 0;
  var masteredCount = 0;
  for (var i = 0; i < items.length; i++) {
    var r = items[i].lastResult;
    allCount++;
    if (isWeakResult(r)) weakCount++;
    else if (isMasteredResult(r)) masteredCount++;
  }
  return { all: allCount, weak: weakCount, mastered: masteredCount };
}

Page({
  data: {
    safeTop: 20,
    items: [],
    filteredItems: [],
    loading: true,
    empty: false,
    offline: false,
    loadFailed: false,
    resultFilter: 'all',
    resultFilterOptions: RESULT_FILTERS.map(function (f) { return { key: f.key, label: f.label, count: 0 }; }),
    menuRightInset: 96
  },

  onLoad() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    let menuRightInset = 96;
    try {
      const menu = wx.getMenuButtonBoundingClientRect && wx.getMenuButtonBoundingClientRect();
      if (menu && menu.left) menuRightInset = Math.max(info.windowWidth - menu.left + 10, 0);
    } catch (_) {}
    this.setData({
      safeTop: info.statusBarHeight || 20,
      menuRightInset
    });
    this._fetch();
  },

  goBack() {
    wx.navigateBack({ fail() { wx.switchTab({ url: '/pages/review/index' }); } });
  },

  onShow() {
    this._fetch();
  },

  _applyResultFilter() {
    var items = this.data.items || [];
    var filterKey = this.data.resultFilter || 'all';
    var filtered = applyResultFilter(items, filterKey);
    var counts = computeResultFilterCounts(items);
    var options = RESULT_FILTERS.map(function (f) {
      return { key: f.key, label: f.label, count: counts[f.key] || 0 };
    });
    this.setData({
      filteredItems: filtered,
      resultFilterOptions: options
    });
  },

  onResultFilterTap(e) {
    var key = e.currentTarget.dataset.key;
    if (!key || key === this.data.resultFilter) return;
    this.setData({ resultFilter: key });
    this._applyResultFilter();
  },

  async _fetch() {
    this.setData({ loading: true, offline: false, loadFailed: false });

    try {
      const res = await getTodayReviewed();
      const items = (res && (res.items || (res.data && res.data.items))) || [];

      const mapped = items.map(item => ({
        cardId: String(item.card_id || item.cardId || ''),
        content: item.content || '',
        understanding: item.understanding || '',
        whereEncountered: item.where_encountered || item.whereEncountered || '',
        cardType: CARD_TYPE_MAP[item.card_type || item.cardType] || '单词',
        todayReviewCount: item.today_review_count || item.todayReviewCount || 1,
        lastResultLabel: RESULT_LABELS[item.last_result || item.lastResult] || item.last_result_label || item.lastResultLabel || '',
        lastResult: item.last_result || item.lastResult || ''
      }));

      this.setData({
        items: mapped,
        empty: mapped.length === 0,
        loading: false,
        offline: false,
        loadFailed: false
      });

      this._applyResultFilter();
      wx.setStorageSync(TODAY_REVIEWED_CACHE_KEY, mapped);
      this._initialLoadDone = true;
    } catch (error) {
      console.warn('[today-reviewed] fetch failed', error);
      const cached = wx.getStorageSync(TODAY_REVIEWED_CACHE_KEY) || [];
      const hasCache = Array.isArray(cached) && cached.length > 0;

      this.setData({
        items: hasCache ? cached : [],
        empty: !hasCache,
        loading: false,
        offline: hasCache,
        loadFailed: !hasCache
      });

      if (hasCache) this._applyResultFilter();
      this._initialLoadDone = true;
    }
  },

  onRetryTap() {
    this._fetch();
  },

  onCardTap(e) {
    const cardId = e.currentTarget.dataset.id;
    if (!cardId) return;
    wx.navigateTo({
      url: `/pages/add/add?id=${cardId}&from=today_reviewed`
    });
  },

  onHistoryLinkTap() {
    wx.navigateTo({ url: '/pages/history_reviewed/history_index' });
  }
});