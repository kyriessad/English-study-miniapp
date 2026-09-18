const api = require('../../utils/api/index');
const { downloadListeningAudio } = require('../../utils/apiClient');
const { errorMessage, newClientActionId } = require('../../utils/coreViewModels');

function clock(ms) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
}

Page({
  data: {
    safeTop: 20,
    loading: true,
    error: '',
    sourceId: '',
    title: '',
    category: '',
    typeLabel: '',
    durationLabel: '',
    summary: '',
    segments: [],
    transcriptOpen: false,
    playing: false,
    audioLoading: false,
    currentMs: 0,
    durationMs: 0,
    currentLabel: '0:00',
    durationClock: '0:00',
    progress: 0,
    activePosition: 0,
    addingPosition: 0
  },

  onLoad(options) {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.sourceId = String(options.id || '');
    this.audioPath = '';
    this.audio = null;
    this.setData({ safeTop: info.statusBarHeight || 20, sourceId: this.sourceId });
    this.load();
  },

  onUnload() {
    this.destroyAudio();
  },

  destroyAudio() {
    if (!this.audio) return;
    try { this.audio.stop(); } catch (_) {}
    try { this.audio.destroy(); } catch (_) {}
    this.audio = null;
  },

  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const item = await api.listening.get(this.sourceId);
      const durationMs = Number(item.durationMs || 0);
      this.setData({
        loading: false,
        title: item.title,
        category: item.category,
        typeLabel: item.typeLabel,
        durationLabel: item.durationLabel,
        summary: item.chineseSummary,
        segments: item.segments || [],
        durationMs,
        durationClock: durationMs ? clock(durationMs) : item.durationLabel
      });
    } catch (error) {
      this.setData({ loading: false, error: errorMessage(error, '听力详情加载失败') });
    }
  },

  retryLoad() { this.load(); },
  goBack() { wx.navigateBack(); },

  bindAudio() {
    if (this.audio) return this.audio;
    const audio = wx.createInnerAudioContext();
    audio.obeyMuteSwitch = false;
    audio.onTimeUpdate(() => {
      const durationMs = Math.round((audio.duration || 0) * 1000) || this.data.durationMs;
      const currentMs = Math.round((audio.currentTime || 0) * 1000);
      const progress = durationMs ? Math.min(100, Math.round(currentMs * 100 / durationMs)) : 0;
      let activePosition = 0;
      (this.data.segments || []).forEach((row) => {
        if (row.startMs != null && row.endMs != null && currentMs >= row.startMs && currentMs < row.endMs) {
          activePosition = row.position;
        }
      });
      this.setData({
        currentMs,
        durationMs,
        progress,
        currentLabel: clock(currentMs),
        durationClock: clock(durationMs),
        activePosition
      });
    });
    audio.onPlay(() => this.setData({ playing: true, audioLoading: false }));
    audio.onPause(() => this.setData({ playing: false }));
    audio.onStop(() => this.setData({ playing: false, progress: 0, currentMs: 0, currentLabel: '0:00' }));
    audio.onEnded(() => this.setData({ playing: false, progress: 100 }));
    audio.onError(() => {
      this.setData({ playing: false, audioLoading: false });
      wx.showToast({ title: '播放失败', icon: 'none' });
    });
    this.audio = audio;
    return audio;
  },

  async ensureAudio() {
    if (this.audioPath) return this.audioPath;
    this.setData({ audioLoading: true });
    const path = await downloadListeningAudio(this.sourceId);
    this.audioPath = path;
    const audio = this.bindAudio();
    audio.src = path;
    this.setData({ audioLoading: false });
    return path;
  },

  async togglePlay() {
    if (this.data.audioLoading) return;
    try {
      await this.ensureAudio();
      const audio = this.bindAudio();
      if (this.data.playing) audio.pause();
      else audio.play();
    } catch (error) {
      this.setData({ audioLoading: false, playing: false });
      wx.showToast({ title: errorMessage(error, '音频还没准备好'), icon: 'none' });
    }
  },

  onSeek(event) {
    const value = Number(event.detail.value || 0);
    const durationMs = this.data.durationMs;
    if (!this.audio || !durationMs) return;
    this.audio.seek((durationMs * value) / 100000);
  },

  toggleTranscript() {
    this.setData({ transcriptOpen: !this.data.transcriptOpen });
  },

  onSentenceTap(event) {
    const position = Number(event.currentTarget.dataset.position || 0);
    const segments = this.data.segments.map((row) => (
      row.position === position ? Object.assign({}, row, { showChinese: !row.showChinese }) : row
    ));
    this.setData({ segments });
    const row = segments.find((item) => item.position === position);
    if (this.audio && row && row.startMs != null) {
      this.audio.seek(row.startMs / 1000);
    }
  },

  async onAddTap(event) {
    const position = Number(event.currentTarget.dataset.position || 0);
    const row = this.data.segments.find((item) => item.position === position);
    if (!row || row.inLibrary || this.data.addingPosition) return;
    this.setData({ addingPosition: position });
    try {
      await api.listening.addSegment(this.sourceId, position, newClientActionId('listen'));
      const segments = this.data.segments.map((item) => (
        item.position === position ? Object.assign({}, item, { inLibrary: true }) : item
      ));
      this.setData({ segments, addingPosition: 0 });
      wx.showToast({ title: '已加入', icon: 'none' });
    } catch (error) {
      this.setData({ addingPosition: 0 });
      wx.showToast({ title: errorMessage(error, '加入失败，请重试'), icon: 'none' });
    }
  }
});
