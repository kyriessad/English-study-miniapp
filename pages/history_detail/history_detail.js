const { getReviewHistoryDetail } = require('../../utils/apiClient');

function formatDateTime(isoStr) {
  if (!isoStr) return '-';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '-';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return year + '-' + month + '-' + day + ' ' + hours + ':' + minutes;
  } catch (e) {
    return '-';
  }
}

function normalizeHistoryDetail(raw) {
  if (!raw) return null;

  var detail = {
    id: raw.id,
    review_log_id: raw.review_log_id,
    reviewed_at: raw.reviewed_at,
    reviewed_at_formatted: formatDateTime(raw.reviewed_at),
    result: raw.result,
    result_label: raw.result_label || '-',
    session_type: raw.session_type,
    session_type_label: raw.session_type_label || '-',
    card: null
  };

  if (raw.card) {
    var cardId = raw.card ? (raw.card.id || raw.card.card_id || '') : '';
    var cardSource = raw.card.card_source || 'current_card';
    detail.card = {
      id: cardId,
      content: raw.card.content || '',
      understanding: raw.card.understanding || '',
      note: raw.card.note || '',
      card_type: raw.card.card_type || '',
      exam_scene: raw.card.exam_scene || '',
      exam_module: raw.card.exam_module || '',
      review_state: raw.card.review_state || '',
      next_review_at: raw.card.next_review_at || null,
      next_review_at_formatted: formatDateTime(raw.card.next_review_at),
      card_source: cardSource,
      is_snapshot: cardSource === 'snapshot'
    };
    detail.card_section_title = cardSource === 'snapshot' ? '复习时卡片内容' : '卡片当前内容';
  }

  var resultTypeMap = {
    forgot: 'again',
    shaky: 'hard',
    got_it: 'good',
    fluent: 'good'
  };
  detail.resultTagType = resultTypeMap[detail.result] || 'default';

  return detail;
}

Page({
  data: {
    logId: '',
    detail: null,
    loading: false,
    refreshing: false,
    hasLoaded: false,
    error: false,
    errorMessage: ''
  },

  onLoad: function (options) {
    this._isUnmounted = false;

    var logId = options.id || options.log_id || '';

    if (!logId) {
      this.setData({
        error: true,
        errorMessage: '缺少历史记录 ID'
      });
      return;
    }

    this.setData({ logId: logId });
  },

  onShow: function () {
    if (this.data.logId) {
      this.loadDetailData();
    }
  },

  onUnload: function () {
    this._isUnmounted = true;
  },

  async loadDetailData() {
    if (this.data.loading || this.data.refreshing) return;
    if (!this.data.logId) return;

    const isInitialLoad = !this.data.hasLoaded && !this.data.detail;

    this.setData({
      loading: isInitialLoad,
      refreshing: !isInitialLoad
    });

    try {
      const raw = await getReviewHistoryDetail(this.data.logId);

      if (this._isUnmounted) return;

      const detail = normalizeHistoryDetail(raw);

      this.setData({
        detail,
        hasLoaded: true,
        error: false,
        errorMessage: ''
      });
    } catch (err) {
      if (this._isUnmounted) return;

      if (isInitialLoad) {
        const is404 = err && err.statusCode === 404;
        this.setData({
          error: true,
          errorMessage: is404 ? '这条历史记录不存在或已被删除' : '历史详情加载失败'
        });
      } else {
        wx.showToast({
          title: '最新状态同步失败',
          icon: 'none'
        });
      }
    } finally {
      if (!this._isUnmounted) {
        this.setData({ loading: false, refreshing: false });
      }
    }
  }
});
