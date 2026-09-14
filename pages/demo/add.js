const api = require('../../utils/api/index');
const { validateEnglish } = require('../../utils/apiClient');
const { buildValidationView, validationResponseFromCardError } = require('../../utils/englishValidation');
const { errorMessage } = require('../../utils/coreViewModels');

function fallbackCardType(text) {
  const value = String(text || '').trim();
  if (/[.!?]$/.test(value) || value.split(/\s+/).length > 5) return 'sentence';
  if (/\s/.test(value)) return 'phrase';
  return 'word';
}

Page({
  data: { safeTop: 20, english: '', understanding: '', where: '', note: '', other: '', normalized: '', saved: false, saving: false, error: '' },
  onLoad() { this.setData({ safeTop: (wx.getWindowInfo ? wx.getWindowInfo().statusBarHeight : wx.getSystemInfoSync().statusBarHeight) || 20 }); },
  onEnglishInput(e) { const english = e.detail.value; this.setData({ english, normalized: english.trim().replace(/\s+/g, ' ') }); },
  useExample(e) { this.setData({ english: e.currentTarget.dataset.value, normalized: e.currentTarget.dataset.value }); },
  onUnderstandingInput(e) { this.setData({ understanding: e.detail.value }); }, onWhereInput(e) { this.setData({ where: e.detail.value }); }, onNoteInput(e) { this.setData({ note: e.detail.value }); },
  onOtherInput(e) { this.setData({ other: e.detail.value }); },
  async save() {
    if (this.data.saving) return;
    if (!this.data.normalized) {
      this.setData({ error: '请输入英文内容' });
      return;
    }
    this.setData({ saving: true, error: '' });
    try {
      const validation = buildValidationView(await validateEnglish(this.data.normalized, 'auto'));
      if (validation.status === 'invalid' || validation.canSave === false) {
        const issue = validation.visibleIssues && validation.visibleIssues[0];
        this.setData({ error: issue ? issue.message : '这段内容暂时不能保存' });
        return;
      }
      const content = validation.normalizedText || this.data.normalized;
      const cardType = ['word', 'phrase', 'sentence'].includes(validation.category)
        ? validation.category
        : fallbackCardType(content);
      const card = await api.cards.create({
        content,
        card_type: cardType,
        understanding: this.data.understanding.trim() || null,
        where_encountered: this.data.where.trim() || null,
        note: this.data.note.trim() || null,
        source_context: this.data.other.trim() || null,
        participates_in_review: true,
        add_channel: 'manual',
        analysis_status: 'done',
        understanding_source: 'user'
      });
      this.setData({ saved: true });
      wx.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => {
        wx.redirectTo({ url: '/pages/demo/detail?id=' + card.id + '&source=personal' });
      }, 250);
    } catch (error) {
      const validationResponse = validationResponseFromCardError(error);
      if (validationResponse) {
        const view = buildValidationView(validationResponse);
        const issue = view.visibleIssues && view.visibleIssues[0];
        this.setData({ error: issue ? issue.message : '请检查英文内容' });
      } else {
        this.setData({ error: errorMessage(error, '保存失败，请重试') });
      }
    } finally {
      this.setData({ saving: false });
    }
  },
  goBack() { wx.navigateBack({ delta: 1 }); }
});
