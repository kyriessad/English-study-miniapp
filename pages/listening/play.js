const api = require('../../utils/api/index');
const { downloadListeningAudio } = require('../../utils/apiClient');
const { errorMessage, newClientActionId } = require('../../utils/coreViewModels');

function clock(ms) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
}

function resolveActivePosition(segments, currentMs, fallback) {
  const rows = segments || [];
  let current = fallback || 0;
  for (let i = 0; i < rows.length; i++) {
    const start = rows[i].startMs;
    if (start == null) continue;
    if (currentMs < start) return current;
    current = rows[i].position;
  }
  return current;
}

function sentenceViewId(position) {
  return position ? 'listen-sentence-' + position : '';
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
    difficulty: '',
    durationLabel: '',
    contentTags: [],
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
    addingPosition: 0,
    scrollIntoView: ''
  },

  onLoad(options) {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.isPageUnloaded = false;
    this.pageHidden = false;
    this.sourceId = String(options.id || '');
    this.audioPath = '';
    this.audio = null;
    this.setData({ safeTop: info.statusBarHeight || 20, sourceId: this.sourceId });
    this.load();
  },

  onShow() { this.pageHidden = false; },
  onHide() {
    this.pageHidden = true;
    if (this.audio) this.audio.pause();
    this.setData({ playing: false });
  },
  onUnload() {
    this.isPageUnloaded = true;
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
        difficulty: item.difficulty,
        durationLabel: item.durationLabel,
        contentTags: item.contentTags || [],
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
  goHome() { wx.switchTab({ url: '/pages/index/index' }); },

  bindAudio() {
    if (this.audio) return this.audio;
    const audio = wx.createInnerAudioContext();
    audio.obeyMuteSwitch = false;
    audio.onTimeUpdate(() => {
      const durationMs = Math.round((audio.duration || 0) * 1000) || this.data.durationMs;
      const currentMs = Math.round((audio.currentTime || 0) * 1000);
      const progress = durationMs ? Math.min(100, Math.round(currentMs * 100 / durationMs)) : 0;
      const prevActive = this.data.activePosition;
      const activePosition = resolveActivePosition(this.data.segments, currentMs, prevActive);
      const sentenceChanged = activePosition !== prevActive;
      const now = Date.now();
      if (!sentenceChanged && now - (this._lastTick || 0) < 200) return;
      this._lastTick = now;
      const patch = {
        currentMs,
        durationMs,
        progress,
        currentLabel: clock(currentMs),
        durationClock: clock(durationMs),
        activePosition
      };
      if (sentenceChanged && this.data.transcriptOpen) {
        patch.scrollIntoView = sentenceViewId(activePosition);
      }
      this.setData(patch);
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
    if (this.isPageUnloaded) return '';
    this.audioPath = path;
    try {
      const item = await api.listening.get(this.sourceId);
      if (this.isPageUnloaded) return '';
      const durationMs = Number(item.durationMs || 0);
      this.setData({
        segments: Array.isArray(item.segments) ? item.segments : this.data.segments,
        durationMs: durationMs || this.data.durationMs,
        durationClock: durationMs ? clock(durationMs) : (item.durationLabel || this.data.durationClock)
      });
    } catch (_) {
      // Audio generation is already complete; a metadata refresh failure
      // should not prevent playback.
    }
    if (this.isPageUnloaded) return '';
    const audio = this.bindAudio();
    audio.src = path;
    this.setData({ audioLoading: false });
    return path;
  },

  async togglePlay() {
    if (this.data.audioLoading) return;
    try {
      await this.ensureAudio();
      if (this.isPageUnloaded || this.pageHidden) return;
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
    const transcriptOpen = !this.data.transcriptOpen;
    const patch = { transcriptOpen, scrollIntoView: '' };
    this.setData(patch);
    if (!transcriptOpen || !this.data.activePosition) return;
    const id = sentenceViewId(this.data.activePosition);
    const apply = () => this.setData({ scrollIntoView: id });
    if (typeof wx.nextTick === 'function') wx.nextTick(apply);
    else setTimeout(apply, 32);
  },

  onSentenceTap(event) {
    const position = Number(event.currentTarget.dataset.position || 0);
    const segments = this.data.segments.map((row) => (
      row.position === position ? Object.assign({}, row, { showChinese: !row.showChinese }) : row
    ));
    const row = segments.find((item) => item.position === position);
    const patch = { segments };
    if (this.audio && row && row.startMs != null) {
      patch.activePosition = position;
      patch.scrollIntoView = sentenceViewId(position);
      this.audio.seek(row.startMs / 1000);
    }
    this.setData(patch);
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
