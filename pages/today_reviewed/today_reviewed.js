const { getTodayReviewed } = require('../../utils/apiClient');

const TODAY_REVIEWED_CACHE_KEY = 'todayReviewedCache';

const CARD_TYPE_MAP = {
  word: '单词',
  phrase: '短语',
  sentence: '句子'
};

const RESULT_LABELS = {
  forgot: '想不起来',
  shaky: '不太稳',
  got_it: '基本掌握',
  fluent: '很熟了'
};

const RESULT_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'weak', label: '待加强' },
  { key: 'mastered', label: '已掌握' }
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
    items: [],
    filteredItems: [],
    loading: true,
    empty: false,
    offline: false,
    loadFailed: false,
    resultFilter: 'all',
    resultFilterOptions: RESULT_FILTERS.map(function (f) { return { key: f.key, label: f.label, count: 0 }; })
  },

  onLoad() {
    this._fetch();
  },

  onShow() {
    if (!this._initialLoadDone) return;

    const needsRefresh = wx.getStorageSync('todayReviewedNeedsRefresh');
    if (needsRefresh) {
      wx.removeStorageSync('todayReviewedNeedsRefresh');
      this._fetch();
    }
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
      const items = (res && res.items) ? res.items : [];

      const mapped = items.map(item => ({
        cardId: String(item.card_id),
        content: item.content || '',
        understanding: item.understanding || '',
        whereEncountered: item.where_encountered || '',
        cardType: CARD_TYPE_MAP[item.card_type] || '单词',
        todayReviewCount: item.today_review_count || 1,
        lastResultLabel: RESULT_LABELS[item.last_result] || item.last_result_label || '',
        lastResult: item.last_result || ''
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
    } catch (_) {
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