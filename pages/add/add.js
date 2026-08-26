const {
  addCard,
  getCardById,
  updateCard,
  deleteCard,
  updateBackendCardSyncState,
  DEFAULT_EXAM_SCENE,
  DEFAULT_EXAM_MODULE
} = require('../../utils/cardStorageFacade');

const {
  updateBackendCard,
  analyzeEnglishDirect,
  analyzeEnglishDirectStream
} = require('../../utils/apiClient');

const {
  createPronunciationController,
  getStoredVoice,
  DEFAULT_VOICE
} = require('../../utils/pronunciation');

const {
  CARD_CATEGORIES
} = require('../../utils/cardOptions');
const {
  getInputContext,
  saveInputContext
} = require('../../utils/inputContext');
const PAGE_ANIMATION_SAFE_DELAY = 0;

const ANALYZE_CACHE_STORAGE_KEY = 'englishAnalyzeCache_v2';
const ANALYZE_CACHE_MAX_ITEMS = 200;
const ANALYZE_CACHE_MAX_AGE = 1000 * 60 * 60 * 24 * 30; // 30 天
const STREAM_DIAGNOSTIC_VERSION = 'ai-stream-diag-20260824-1';

const LAST_ENCOUNTER_CONTEXT_KEY = 'englishCard.lastEncounterContext.v1';
const BACKEND_CARD_TYPE_MAP = {
  '单词': 'word',
  '短语': 'phrase',
  '句子': 'sentence'
};

const BACKEND_ANALYSIS_STATUSES = ['pending', 'done', 'failed'];
const BACKEND_UNDERSTANDING_SOURCES = ['local', 'machine', 'ai', 'user'];

function logAiStreamDiagnostic(event, details = {}) {
  console.log('[AI_STREAM_DIAG]', JSON.stringify({ event, ...details }));
}






function endsWithWhitespace(text) {
  return /\s$/.test(String(text || ''));
}

function normalizeEnglishText(text) {
  var result = String(text || '');

  // 1. 弯引号 → 直引号
  result = result.replace(/[‘’]/g, '\'');
  result = result.replace(/[“”]/g, '"');

  // 2. 各种 dash → 英文连字符
  result = result.replace(/[‐-―−–—]/g, '-');

  // 3. 中文标点 → 英文标点
  result = result.replace(/，/g, ',');
  result = result.replace(/。/g, '.');
  result = result.replace(/！/g, '!');
  result = result.replace(/？/g, '?');
  result = result.replace(/；/g, ';');
  result = result.replace(/：/g, ':');

  // 4. 特殊空白 → 普通空格
  result = result.replace(/\u00A0/g, ' ');
  result = result.replace(/\u3000/g, ' ');
  result = result.replace(/[\t\n\r]+/g, ' ');

  // 5. 合并连续空白
  result = result.replace(/\s{2,}/g, ' ');

  // 5b. 修复分裂缩写中间空格（he ' s → he 's）
  result = result.replace(/'\s+(s|m|t|ve|ll|re|d)\b/gi, '\'$1');

  // 6. 修复分裂缩写 / 所有格（he 's → he's）
  result = result.replace(/\s+'(s|m|t|ve|ll|re|d)\b/gi, '\'$1');

  // 7. 删除标点前多余空格
  result = result.replace(/\s+([,.!?;:])/g, '$1');

  // 8. 清理括号内侧多余空格
  result = result.replace(/\(\s+/g, '(');
  result = result.replace(/\s+\)/g, ')');
  result = result.replace(/\[\s+/g, '[');
  result = result.replace(/\s+\]/g, ']');

  // 9. 再次合并连续空白
  result = result.replace(/\s{2,}/g, ' ');

  // 10. 去除前后空格
  result = result.trim();

  return result;
}

function normalizePlainText(text) {
  return String(text || '').trim();
}

/**
 * Format a synonym/similarPhrase pair list into a display string:
 * "gathering 聚会  party 派对" (joined by two spaces, no punctuation).
 */
function formatPairList(list) {
  if (!Array.isArray(list)) return '';
  return list
    .map(function (item) {
      const english = normalizePlainText(item && item.english);
      const chinese = normalizePlainText(item && item.chinese);
      if (!english) return '';
      return chinese ? (english + ' ' + chinese) : english;
    })
    .filter(Boolean)
    .join('  ');
}

/**
 * Map a backend expressionType enum to a light Chinese display tag.
 * literal and unknown/empty return '' (no tag shown).
 */
var EXPRESSION_TYPE_LABELS = {
  idiom: '习语',
  slang: '俚语',
  phrasal_verb: '短语动词',
  fixed_expression: '固定表达',
  colloquial: '口语',
  polysemy: '多义'
};

function getExpressionTypeLabel(type) {
  var key = String(type || '').trim().toLowerCase();
  return EXPRESSION_TYPE_LABELS[key] || '';
}

/**
 * Normalize alternativeMeanings into display-safe items (meaning / note as text).
 */
function normalizeAlternativeMeanings(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map(function (item) {
      if (!item || typeof item !== 'object') return null;
      return {
        meaning: normalizePlainText(item.meaning),
        note: normalizePlainText(item.note)
      };
    })
    .filter(function (item) {
      return item && item.meaning;
    })
    .slice(0, 2);
}

/**
 * Normalize a backend dialogue {english: [...], chinese: [...]} into two display-safe
 * string arrays (max 3 turns each). Returns {english: [], chinese: []} when unusable.
 */
function normalizeDialogue(dialogue) {
  if (!dialogue || typeof dialogue !== 'object') {
    return { english: [], chinese: [] };
  }

  function lines(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .map(normalizePlainText)
      .filter(Boolean)
      .slice(0, 3);
  }

  var english = lines(dialogue.english);
  var chinese = lines(dialogue.chinese);

  if (!english.length || !chinese.length) {
    return { english: [], chinese: [] };
  }

  return { english: english, chinese: chinese };
}

/**
 * Merge synonyms + similarPhrases into one "近义表达" display list (max 5 items).
 */
function buildRelatedDisplay(synonyms, similarPhrases) {
  var list = []
    .concat(Array.isArray(synonyms) ? synonyms : [])
    .concat(Array.isArray(similarPhrases) ? similarPhrases : [])
    .slice(0, 5);

  return formatPairList(list);
}

/**
 * Extract the English example sentence from a "补充备注" notes string.
 * The example is stored as "exampleSentence\nexampleTranslation" (written by
 * adoptAllReference), so we return the first English-looking line (letters +
 * space, no CJK) as a best-effort pronunciation target.
 */
function extractEnglishExampleFromNotes(notes) {
  const lines = String(notes || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    if (trimmed.indexOf(' ') > 0 && /[A-Za-z]/.test(trimmed) && !/[㐀-鿿]/.test(trimmed)) {
      return trimmed;
    }
  }
  return '';
}

function mapBackendCardType(category) {
  return BACKEND_CARD_TYPE_MAP[category] || 'word';
}

function normalizeBackendAnalysisStatus(status) {
  return BACKEND_ANALYSIS_STATUSES.includes(status) ? status : 'pending';
}

function normalizeUnderstandingSource(source, hasUserUnderstanding) {
  if (hasUserUnderstanding) return 'user';

  const normalized = String(source || '').trim().toLowerCase();

  if (BACKEND_UNDERSTANDING_SOURCES.includes(normalized)) {
    return normalized;
  }

  // 具体供应商 / 机器翻译别名统一归一化为 machine
  if (['argos', 'tencent', 'translation', 'translate', 'mt', 'machine_translation'].includes(normalized)) {
    return 'machine';
  }

  return 'local';
}

function normalizeBackendUnderstandingSource(source) {
  return normalizeUnderstandingSource(source, false);
}

function toBackendIsoString(value) {
  if (!value) {
    return new Date().toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function buildBackendAnalysisMessages(card = {}) {
  return []
    .concat(Array.isArray(card.analysisErrors) ? card.analysisErrors : [])
    .concat(Array.isArray(card.analysisWarnings) ? card.analysisWarnings : [])
    .map((item) => normalizePlainText(item))
    .filter(Boolean);
}

function getBackendAnalysisLevel(card = {}) {
  if (Array.isArray(card.analysisErrors) && card.analysisErrors.length > 0) {
    return 'error';
  }

  if (Array.isArray(card.analysisWarnings) && card.analysisWarnings.length > 0) {
    return 'warning';
  }

  return 'pass';
}

function buildBackendCardPayload(card = {}) {
  const content = normalizeEnglishText(card.englishText);

  return {
    local_temp_id: card.local_temp_id,
    content,
    english: content,
    card_type: mapBackendCardType(card.category),
    exam_scene: normalizePlainText(card.examScene) || null,
    exam_module: normalizePlainText(card.examModule) || null,
    understanding: normalizePlainText(card.myUnderstanding) || null,
    note: normalizePlainText(card.notes) || null,
    where_encountered: normalizePlainText(card.whereEncountered) || null,
    analysis_status: normalizeBackendAnalysisStatus(card.analysisStatus),
    analysis_level: getBackendAnalysisLevel(card),
    analysis_messages: buildBackendAnalysisMessages(card),
    understanding_source: normalizeBackendUnderstandingSource(card.understandingSource),
    source: 'wechat_miniapp',
    client_created_at: toBackendIsoString(card.createdAt || card.dateTime)
  };
}

function getBackendCardId(result = {}) {
  return normalizePlainText(
    result.id || result.card_id || result.backend_card_id || result.backendCardId || ''
  );
}

function formatBackendCardSyncError(error) {
  if (!error) {
    return 'sync_failed';
  }

  if (typeof error === 'string') {
    return normalizePlainText(error).slice(0, 500) || 'sync_failed';
  }

  const statusCode = error.statusCode ? `status ${error.statusCode}: ` : '';
  const data = error.data || {};
  const detail = normalizePlainText(data.detail || data.message || error.errMsg || error.message || '');

  if (detail) {
    return `${statusCode}${detail}`.slice(0, 500);
  }

  try {
    return `${statusCode}${JSON.stringify(error)}`.slice(0, 500);
  } catch (stringifyError) {
    return 'sync_failed';
  }
}

function saveBackendCardSyncSuccess(card, backendCardId) {
  if (!card || !card.id) {
    return;
  }

  try {
    updateBackendCardSyncState(card.id, {
      backend_card_id: backendCardId,
      backend_sync_status: 'synced',
      backend_synced_at: new Date().toISOString(),
      backend_sync_error: ''
    });
  } catch (error) {
    console.warn('[backend-card] failed to persist backend sync success state', error);
  }
}

function saveBackendCardSyncFailure(card, error) {
  if (!card || !card.id) {
    return;
  }

  try {
    updateBackendCardSyncState(card.id, {
      backend_sync_status: 'failed',
      backend_sync_error: formatBackendCardSyncError(error)
    });
  } catch (persistError) {
    console.warn('[backend-card] failed to persist backend sync failure state', persistError);
  }
}

function getLatinLetterPattern() {
  // A-Za-z + 常见拉丁扩展字符，用于兼容 Beyoncé / José / São Paulo 等专名
  return 'A-Za-zÀ-ÖØ-öø-ÿ';
}

function hasLatinLetter(text) {
  return new RegExp(`[${getLatinLetterPattern()}]`).test(String(text || ''));
}

function getNormalizedWordList(text) {
  const latinPattern = getLatinLetterPattern();

  return normalizeEnglishText(text)
    .split(/[\s,.!?;:]+/)
    .map((word) => {
      const trimRegex = new RegExp(`^[^${latinPattern}]+|[^${latinPattern}]+$`, 'g');
      return word.replace(trimRegex, '');
    })
    .filter(Boolean);
}

function detectEnglishCategory(text) {
  const normalizedText = normalizeEnglishText(text);

  if (!normalizedText) {
    return '';
  }

  if (/[.!?]$/.test(normalizedText)) {
    // 末尾标点可能是句末标点，也可能是缩写句点（U.S. / e.g. / Dr.）
    // 去掉末尾标点后如果无空格 → 单词/缩写，否则 → 句子
    var withoutEnding = normalizedText.replace(/[.!?]+$/, '');
    if (withoutEnding && withoutEnding.indexOf(' ') === -1) {
      return '单词';
    }
    return '句子';
  }

  const words = getNormalizedWordList(normalizedText);

  if (words.length >= 6) {
    return '句子';
  }

  if (words.length <= 1) {
    return '单词';
  }

  return '短语';
}

function prioritizeWarnings(warnings, category) {
  return Array.isArray(warnings) ? warnings.slice() : [];
}

function isDictionaryUnrecognizedWarning(message) {
  const text = String(message || '');

  return (
    text.includes('词典未收录') ||
    text.includes('部分词未识别') ||
    text.includes('未识别到') ||
    text.includes('词典里没有找到') ||
    (text.includes('检查') && text.includes('专有名词'))
  );
}

function filterWarningsByCategory(warnings, category) {
  return Array.isArray(warnings) ? warnings.slice() : [];
}

function filterDictionaryWarningsWhenSuggestionWorks(warnings, suggestion) {
  const warningList = Array.isArray(warnings) ? warnings.slice() : [];
  const normalizedSuggestion = normalizeEnglishText(suggestion);

  if (!normalizedSuggestion) {
    return warningList;
  }

  // 机器翻译已经给出有效中文参考时，隐藏”词典未收录/未识别”类提醒
  return warningList.filter((item) => !isDictionaryUnrecognizedWarning(item));
}

var MAX_ENGLISH_CHARS = 500;  // > 500 字符 = 过长 (error, 阻止保存)

// 检查文本中是否包含中文汉字（CJK 表意文字，不含全角标点）
function hasChineseChar(text) {
  return /[一-鿿㐀-䶿豈-﫿]/.test(String(text || ''));
}

// 拼写提示变换：有 correction → hint 文案；无 correction → 隐藏
var SPELL_WITH_CORRECTION_RE = /^拼写疑似有误：(.+?)。你是不是想写\s*”(.+?)”/;
var SPELL_NO_CORRECTION_RE = /^拼写疑似有误：/;

function transformSpellingWarning(w) {
  var m = SPELL_WITH_CORRECTION_RE.exec(w);
  if (m) {
    return { text: '也可能是：' + m[2] + '。确认原词没问题的话，可以继续保存', isHint: true };
  }
  if (SPELL_NO_CORRECTION_RE.test(w)) {
    return null;
  }
  return { text: w, isHint: false };
}

function buildRecentWhereEncounteredOptions() {
  var seen = Object.create(null);
  var result = [];
  try {
    var raw = wx.getStorageSync('cardsCache');
    var cards = Array.isArray(raw) ? raw : [];
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (!card || card.deleted) continue;
      var src = String(card.whereEncountered || card.where_encountered || '').trim();
      if (!src || seen[src]) continue;
      seen[src] = true;
      result.push(src);
      if (result.length >= 5) break;
    }
  } catch (e) {}
  return result;
}

function getLastEncounterContext() {
  try {
    const value = wx.getStorageSync(LAST_ENCOUNTER_CONTEXT_KEY);
    return normalizePlainText(value);
  } catch (_) {
    return '';
  }
}

function saveLastEncounterContext(value) {
  try {
    wx.setStorageSync(LAST_ENCOUNTER_CONTEXT_KEY, normalizePlainText(value));
  } catch (_) {}
}

function createEmptyForm() {
  return {
    category: '单词',
    examScene: DEFAULT_EXAM_SCENE,
    examModule: DEFAULT_EXAM_MODULE,
    englishText: '',
    whereEncountered: '',
    myUnderstanding: '',
    notes: ''
  };
}

function refreshPreviousPage() {
  const pages = getCurrentPages();
  const previousPage = pages[pages.length - 2];

  if (!previousPage) {
    return;
  }

  if (typeof previousPage.loadInputContext === 'function') {
    previousPage.loadInputContext();
  }

  if (typeof previousPage.loadCards === 'function') {
    previousPage.loadCards();
  }
}

function isFromReviewPage(options = {}) {
  return String(options.from || '') === 'review';
}

function isFromTodayReviewedPage(options = {}) {
  return String(options.from || '') === 'today_reviewed';
}

function isFromHistoryPage(options = {}) {
  return String(options.from || '') === 'history';
}

function isReadonlyDetailMode(options = {}) {
  return isFromHistoryPage(options);
}

function getPageNavigationTitle({
  isEdit = false,
  isFromReviewMode = false,
  isFromTodayReviewedMode = false,
  isFromHistoryMode = false
} = {}) {
  if (isEdit && isFromHistoryMode) {
    return '卡片详情';
  }

  if (isEdit && (isFromReviewMode || isFromTodayReviewedMode)) {
    return '修改当前卡片';
  }

  if (isEdit) {
    return '编辑卡片';
  }

  return '添加卡片';
}

function getLocalValidationResult(text, category) {
  const normalizedText = normalizeEnglishText(text);
  const errors = [];
  const warnings = [];
  const info = [];

  // 规则 1：空内容
  if (!normalizedText) {
    errors.push('英文内容为空');
    return { normalizedText, errors, warnings, info, words: [] };
  }

  // 规则 7：超过 500 字符
  if (normalizedText.length > MAX_ENGLISH_CHARS) {
    errors.push('内容较长，建议拆分后再保存');
    return { normalizedText, errors, warnings, info, words: [] };
  }

  // 规则 2：包含中文汉字 → error（中文解释请写到"我的理解/补充备注/场景"字段）
  if (hasChineseChar(normalizedText)) {
    errors.push('英文内容请只填写英文');
    return { normalizedText, errors, warnings, info, words: [] };
  }

  // 规则 3：完全无英文（纯数字 / 纯符号）
  if (!hasLatinLetter(normalizedText)) {
    errors.push('请输入英文内容');
    return { normalizedText, errors, warnings, info, words: [] };
  }

  const words = getNormalizedWordList(normalizedText);

  // 规则 5：类别=单词但多个词
  if (category === '单词' && words.length !== 1) {
    errors.push('单词类别请只填一个词');
  }

  // 规则 6：类别=短语但只有一个词
  if (category === '短语' && words.length < 2) {
    errors.push('短语类别至少需要两个词');
  }

  return {
    normalizedText,
    errors,
    warnings,
    info,
    words
  };
}


Page({
  data: {
    pageTitle: '',
    isEdit: false,
    isFromReviewMode: false,
    isFromTodayReviewedMode: false,
    isFromHistoryMode: false,
    isReadonlyDetailMode: false,
    cardId: '',
    categoryOptions: CARD_CATEGORIES,
    categoryIndex: 0,
    inheritedContextText: '',
    defaultUnderstandingPlaceholder: '写下你自己的理解、翻译或拆解，不求标准，但要对自己有帮助',
    englishValidationMessage: '',
    englishValidationType: 'hint',
    isValidatingEnglish: false,
    suggestionText: '',
    suggestionSourceText: '',
    showSuggestion: false,
    translating: false,
    isAnalyzing: false,
    isRegenerating: false,
    autoFocusUnderstanding: false,
    isUnderstandingFocused: false,
    deferNonCriticalReady: false,
    showNotesField: false,
    form: createEmptyForm(),

    validationResult: null,      // 最近一次校验结果
    understandingSuggestion: '', // 最近一次参考理解
    understandingVisible: false, // 是否显示参考理解
    validateLoading: false,
    suggestLoading: false,

    latestEnglishForSuggest: '', // 防止旧请求回写
    hasUserChangedCategory: false,
    isLeavingPage: false,
    isSaving: false,
    recentSources: [],
    aiExampleSentence: '',
    aiExampleTranslation: '',
    aiSynonymsDisplay: '',
    aiSimilarPhrasesDisplay: '',
    aiExpressionTypeLabel: '',
    aiAlternativeMeanings: [],
    aiUsageScenario: '',
    aiDialogueEnglish: [],
    aiDialogueChinese: [],
    aiRelatedDisplay: '',
    aiAnalysisSource: '',
    aiAnalysisModel: '',
    notesExamplePlaying: false,
    notesExampleLoading: false,
    notesExampleAvailable: false,
    referenceApplied: false,
    editPhoneticDisplay: '',
    editPhoneticLoading: false,
    editPhoneticLoaded: false,
    editPronunciationAvailable: false,
    editPronunciationLoading: false,
    editPronunciationPlaying: false,
    editPronunciationVoice: DEFAULT_VOICE,
    editPronunciationText: '',




  },

  mapBackendAnalyzeResult(backendResp, text, category, cacheKey) {
    const categoryMap = { word: '单词', phrase: '短语', sentence: '句子', paragraph: '句子', unknown: '' };
    const mappedCategory = categoryMap[backendResp.category] || category;
    const words = getNormalizedWordList(text);

    var analysisSource = normalizePlainText(backendResp.analysisSource || '');
    var analysisModel = normalizePlainText(backendResp.analysisModel || '');
    var expressionType = normalizePlainText(backendResp.expressionType || '');

    console.log(
      '[English Analysis]\n' +
      'input: ' + text + '\n' +
      'category: ' + (backendResp.category || '') + '\n' +
      'source: ' + analysisSource + '\n' +
      'model: ' + analysisModel + '\n' +
      'expressionType: ' + expressionType
    );
    console.log('[AI TRACE 8] frontend response.data =', JSON.stringify(backendResp));

    return {
      ok: backendResp.ok !== false,
      text: backendResp.normalizedText || text,
      normalizedText: backendResp.normalizedText || text,
      category: mappedCategory,
      analysisStatus: backendResp.level === 'failed' ? 'failed' : 'done',
      validation: {
        errors: Array.isArray(backendResp.errors) ? backendResp.errors : [],
        warnings: Array.isArray(backendResp.warnings) ? backendResp.warnings : [],
        normalizedText: backendResp.normalizedText || text
      },
      understanding: {
        candidate: backendResp.translation || backendResp.understanding || '',
        source: backendResp.provider || 'local'
      },
      cacheKey: cacheKey || `${mappedCategory}::${text.toLowerCase()}::${words.map(function(w) { return normalizeEnglishText(w).toLowerCase(); }).filter(Boolean).join('|')}`,
      fromCache: Boolean(backendResp.cacheHit),
      backend: {
        level: backendResp.level || '',
        category: backendResp.category || '',
        provider: backendResp.provider || '',
        translation: backendResp.translation || '',
        understanding: backendResp.understanding || ''
      },
      exampleSentence: normalizePlainText(backendResp.exampleSentence || ''),
      exampleTranslation: normalizePlainText(backendResp.exampleTranslation || ''),
      synonyms: Array.isArray(backendResp.synonyms) ? backendResp.synonyms : [],
      similarPhrases: Array.isArray(backendResp.similarPhrases) ? backendResp.similarPhrases : [],
      expressionType: expressionType,
      alternativeMeanings: Array.isArray(backendResp.alternativeMeanings) ? backendResp.alternativeMeanings : [],
      usageScenario: normalizePlainText(backendResp.usageScenario || ''),
      dialogue: normalizeDialogue(backendResp.dialogue),
      analysisSource: analysisSource,
      analysisModel: analysisModel
    };
  },

  async callBackendAnalyzeDirect(text, category, cacheKey, forceRefresh = false, idempotencyKey = '') {
    // Let errors propagate so the caller can tell a busy backend (503) or a
    // network outage (statusCode 0) apart from a real AI failure, instead of
    // collapsing every failure into a generic "网络暂时不稳".
    const backendResp = await analyzeEnglishDirect(text, category, forceRefresh, idempotencyKey);
    return this.mapBackendAnalyzeResult(backendResp, text, category, cacheKey);
  },

  _isCurrentStreamPreview(sourceText, requestGeneration) {
    if (this.data.isLeavingPage) {
      return false;
    }

    if (
      typeof requestGeneration === 'number' &&
      requestGeneration !== this.analysisGeneration
    ) {
      return false;
    }

    const normalizedText = normalizeEnglishText(sourceText);
    const currentRaw = this.data.form.englishText;
    if (endsWithWhitespace(currentRaw) || normalizeEnglishText(currentRaw) !== normalizedText) {
      return false;
    }

    return true;
  },

  _clearStreamPreviewTimer() {
    if (this._streamPreviewTimer) {
      clearTimeout(this._streamPreviewTimer);
      this._streamPreviewTimer = null;
    }
  },

  _beginStreamPreview(sourceText, requestGeneration, startedAt) {
    this._clearStreamPreviewTimer();
    this._streamProvisional = Object.create(null);
    this._streamPendingFields = Object.create(null);
    this._streamLastDeltaSeq = Object.create(null);
    this._streamAttempt = 0;
    this._streamPreviewSourceText = normalizeEnglishText(sourceText);
    this._streamPreviewGeneration = requestGeneration;
    this._streamPreviewStartedAt = startedAt || Date.now();
    this._streamFirstVisibleTextLogged = false;
    this._streamFirstVisibleTextPending = false;
  },

  _discardStreamPreview() {
    this._clearStreamPreviewTimer();
    this._streamProvisional = Object.create(null);
    this._streamPendingFields = Object.create(null);
    this._streamLastDeltaSeq = Object.create(null);
    this._streamAttempt = 0;
  },

  _emptyAiAnalysisDisplayPatch() {
    const notes = this.data && this.data.form ? this.data.form.notes : '';
    return {
      validationResult: null,
      englishValidationMessage: '',
      englishValidationType: 'hint',
      suggestionText: '',
      suggestionSourceText: '',
      showSuggestion: false,
      understandingSuggestion: '',
      understandingVisible: false,
      aiExampleSentence: '',
      aiExampleTranslation: '',
      aiSynonymsDisplay: '',
      aiSimilarPhrasesDisplay: '',
      aiExpressionTypeLabel: '',
      aiAlternativeMeanings: [],
      aiUsageScenario: '',
      aiDialogueEnglish: [],
      aiDialogueChinese: [],
      aiRelatedDisplay: '',
      aiAnalysisSource: '',
      aiAnalysisModel: '',
      notesExampleAvailable: Boolean(extractEnglishExampleFromNotes(notes)),
      referenceApplied: false
    };
  },

  _resetStreamPreview(sourceText, requestGeneration, attempt) {
    if (!this._isCurrentStreamPreview(sourceText, requestGeneration)) {
      return;
    }

    this._clearStreamPreviewTimer();
    this._streamProvisional = Object.create(null);
    this._streamPendingFields = Object.create(null);
    this._streamLastDeltaSeq = Object.create(null);
    this._streamAttempt = Number(attempt) || 0;
    this._streamRawSynonyms = [];
    this._streamRawSimilarPhrases = [];

    // Retry attempt 2 must not visually inherit any provisional content from
    // attempt 1. Loading flags stay unchanged while the same request continues.
    this.setData(this._emptyAiAnalysisDisplayPatch());
  },

  applyStreamFieldPreview(field, value, sourceText, requestGeneration, meta) {
    if (!this._isCurrentStreamPreview(sourceText, requestGeneration)) {
      logAiStreamDiagnostic('stale_callback_ignored', {
        oldGenerationId: requestGeneration,
        currentGenerationId: this.analysisGeneration || 0,
        callbackType: 'setData_preview'
      });
      return;
    }

    var patch = {};
    var visibleText = '';
    const isDeltaPreview = meta && meta.eventType === 'delta';
    const displayText = function (rawValue) {
      const text = String(rawValue || '');
      // Keep a trailing space while more deltas are arriving; trimming it on
      // every 60ms flush can make word boundaries briefly disappear.
      return isDeltaPreview ? text.replace(/^\s+/, '') : text.trim();
    };

    if (field === 'meaning') {
      const meaning = displayText(value);
      patch.suggestionText = meaning;
      patch.showSuggestion = Boolean(meaning);
      visibleText = meaning;
    } else if (field === 'expressionType') {
      patch.aiExpressionTypeLabel = getExpressionTypeLabel(value);
    } else if (field === 'alternativeMeanings') {
      patch.aiAlternativeMeanings = normalizeAlternativeMeanings(value);
    } else if (field === 'usageScenario') {
      patch.aiUsageScenario = displayText(value);
      visibleText = patch.aiUsageScenario;
    } else if (field === 'exampleSentence') {
      patch.aiExampleSentence = displayText(value);
      visibleText = patch.aiExampleSentence;
    } else if (field === 'exampleTranslation') {
      patch.aiExampleTranslation = displayText(value);
      visibleText = patch.aiExampleTranslation;
    } else if (field === 'dialogue') {
      const dialogue = normalizeDialogue(value);
      patch.aiDialogueEnglish = dialogue.english;
      patch.aiDialogueChinese = dialogue.chinese;
    } else if (field === 'synonyms') {
      const synonyms = Array.isArray(value) ? value : [];
      this._streamRawSynonyms = synonyms;
      patch.aiSynonymsDisplay = formatPairList(synonyms);
      patch.aiRelatedDisplay = buildRelatedDisplay(
        synonyms,
        Array.isArray(this._streamRawSimilarPhrases) ? this._streamRawSimilarPhrases : []
      );
    } else if (field === 'similarPhrases') {
      const similarPhrases = Array.isArray(value) ? value : [];
      this._streamRawSimilarPhrases = similarPhrases;
      patch.aiSimilarPhrasesDisplay = formatPairList(similarPhrases);
      patch.aiRelatedDisplay = buildRelatedDisplay(
        Array.isArray(this._streamRawSynonyms) ? this._streamRawSynonyms : [],
        similarPhrases
      );
    }

    if (Object.keys(patch).length > 0) {
      const shouldLogFirstVisible = Boolean(visibleText) &&
        !this._streamFirstVisibleTextLogged &&
        !this._streamFirstVisibleTextPending;
      if (shouldLogFirstVisible) {
        this._streamFirstVisibleTextPending = true;
      }

      this.setData(patch, () => {
        if (!shouldLogFirstVisible) return;
        this._streamFirstVisibleTextPending = false;
        if (
          this._streamFirstVisibleTextLogged ||
          !this._isCurrentStreamPreview(sourceText, requestGeneration)
        ) {
          return;
        }
        this._streamFirstVisibleTextLogged = true;
        const startedAt = meta && meta.startedAt ? meta.startedAt : this._streamPreviewStartedAt;
        logAiStreamDiagnostic('first_visible_text', {
          generationId: requestGeneration,
          field,
          elapsedMs: Date.now() - startedAt
        });
        console.log(
          '[stream perf] first_visible_text=' + (Date.now() - startedAt) + 'ms' +
          ' | field=' + field +
          ' | attempt=' + ((meta && meta.attempt) || this._streamAttempt || 1) +
          ' | input=' + normalizeEnglishText(sourceText)
        );
      });
    }
  },

  _flushStreamPreview(sourceText, requestGeneration, meta) {
    this._streamPreviewTimer = null;
    if (!this._isCurrentStreamPreview(sourceText, requestGeneration)) {
      logAiStreamDiagnostic('stale_callback_ignored', {
        oldGenerationId: requestGeneration,
        currentGenerationId: this.analysisGeneration || 0,
        callbackType: 'flush_timer'
      });
      this._streamPendingFields = Object.create(null);
      return;
    }

    const pendingFields = this._streamPendingFields || Object.create(null);
    this._streamPendingFields = Object.create(null);
    Object.keys(pendingFields).forEach((field) => {
      this.applyStreamFieldPreview(
        field,
        this._streamProvisional[field] || '',
        sourceText,
        requestGeneration,
        meta
      );
    });
  },

  _scheduleStreamPreviewFlush(sourceText, requestGeneration, meta) {
    if (this._streamPreviewTimer) {
      return;
    }
    this._streamPreviewTimer = setTimeout(() => {
      this._flushStreamPreview(sourceText, requestGeneration, meta);
    }, 60);
  },

  handleStreamAnalysisEvent(event, sourceText, requestGeneration, startedAt) {
    if (!event || typeof event !== 'object') return;
    if (!this._isCurrentStreamPreview(sourceText, requestGeneration)) {
      logAiStreamDiagnostic('stale_callback_ignored', {
        oldGenerationId: requestGeneration,
        currentGenerationId: this.analysisGeneration || 0,
        callbackType: String(event.type || 'stream_event')
      });
      return;
    }

    const attempt = Number(event.attempt) || this._streamAttempt || 1;
    const meta = { startedAt: startedAt, attempt: attempt, eventType: event.type };

    if (event.type === 'reset') {
      this._resetStreamPreview(sourceText, requestGeneration, attempt);
      return;
    }

    if (event.type === 'delta') {
      const field = String(event.field || '');
      if (
        field !== 'meaning' &&
        field !== 'usageScenario' &&
        field !== 'exampleSentence' &&
        field !== 'exampleTranslation'
      ) {
        return;
      }

      if (this._streamAttempt && attempt > this._streamAttempt) {
        // Defensive compatibility if a backend retry omits the reset event.
        this._resetStreamPreview(sourceText, requestGeneration, attempt);
      }
      this._streamAttempt = attempt;

      const seq = Number(event.seq);
      if (Number.isFinite(seq)) {
        const seqKey = attempt + ':' + field;
        if (Number.isFinite(this._streamLastDeltaSeq[seqKey]) && seq <= this._streamLastDeltaSeq[seqKey]) {
          return;
        }
        this._streamLastDeltaSeq[seqKey] = seq;
      }

      const text = typeof event.text === 'string' ? event.text : '';
      if (!text) return;
      this._streamProvisional[field] = (this._streamProvisional[field] || '') + text;
      this._streamPendingFields[field] = true;
      this._scheduleStreamPreviewFlush(sourceText, requestGeneration, meta);
      return;
    }

    if (event.type === 'field') {
      const field = String(event.field || '');
      if (
        field === 'meaning' ||
        field === 'usageScenario' ||
        field === 'exampleSentence' ||
        field === 'exampleTranslation'
      ) {
        this._streamProvisional[field] = typeof event.value === 'string' ? event.value : '';
        delete this._streamPendingFields[field];
      }
      this.applyStreamFieldPreview(field, event.value, sourceText, requestGeneration, meta);
      return;
    }

    if (event.type === 'final' || event.type === 'done') {
      // The authoritative result is applied by applyAnalysisToPage after done.
      // Stop any older throttled provisional update from racing with it.
      this._clearStreamPreviewTimer();
      this._streamPendingFields = Object.create(null);
    }
  },

  async callBackendAnalyzeStream(text, category, cacheKey, onStreamEvent, requestGeneration, forceRefresh = false, idempotencyKey = '') {
    const startedAt = Date.now();
    this._beginStreamPreview(text, requestGeneration, startedAt);
    this._streamRawSynonyms = [];
    this._streamRawSimilarPhrases = [];
    let gotFinal = false;
    let gotAnyField = false;
    let finalResult = null;
    let aborted = false;
    let errorStatus = 0;

    const taskHolder = {
      task: null,
      cacheKey: cacheKey,
      generationId: requestGeneration,
      idempotencyKey: idempotencyKey
    };
    this._activeStreamTask = taskHolder;
    this._activeStreamText = normalizeEnglishText(text);
    this._activeStreamCategory = category || '';

    try {
      const finalData = await analyzeEnglishDirectStream(text, category, (event) => {
        if (!event || typeof event !== 'object') return;
        if (event.type === 'field' || event.type === 'delta') {
          gotAnyField = true;
        }
        if (typeof onStreamEvent === 'function') {
          onStreamEvent(event, startedAt);
        }
      }, forceRefresh, taskHolder, idempotencyKey, { generationId: requestGeneration });

      gotFinal = finalData !== null && typeof finalData === 'object';
      if (gotFinal) {
        finalResult = this.mapBackendAnalyzeResult(finalData, text, category, cacheKey);
        console.log(
          '[stream perf] input: ' + text +
          ' | first_field=' + (gotAnyField ? 'yes' : 'no') +
          ' | elapsed=' + (Date.now() - startedAt) + 'ms'
        );
      }
    } catch (error) {
      if (error && error.aborted) {
        aborted = true;
      } else {
        errorStatus = error && error.statusCode ? error.statusCode : 0;
        console.warn('[add] stream analyze failed:', error);
      }
    } finally {
      // A cancelled request can settle after the user has already started a
      // new stream. Only the holder that still owns the page state may clear
      // the active preview/task; stale finally blocks must not erase the new
      // request's provisional buffer or timer.
      if (this._activeStreamTask === taskHolder) {
        this._discardStreamPreview();
        this._activeStreamTask = null;
        this._activeStreamText = '';
        this._activeStreamCategory = '';
      } else {
        logAiStreamDiagnostic('stale_callback_ignored', {
          oldGenerationId: requestGeneration,
          currentGenerationId: this.analysisGeneration || 0,
          callbackType: 'stream_finally'
        });
      }
    }

    return {
      ok: gotFinal && !!finalResult,
      result: finalResult,
      gotAnyField: gotAnyField,
      aborted: aborted,
      errorStatus: errorStatus
    };
  },

  async callAnalyzeEnglish(englishText, category, options = {}) {
    const text = normalizeEnglishText(englishText);
    const forceRefresh = options.forceRefresh === true;
    const useCache = options.useCache !== false && !forceRefresh;
    const cacheKey = this.makeAnalyzeCacheKey(text, category);
    logAiStreamDiagnostic('frontend_cache_lookup', {
      generationId: Number(options.requestGeneration) || 0,
      idempotencyKey: options.idempotencyKey || '',
      result: useCache ? 'lookup' : 'bypass',
      forceRefresh
    });

    if (!text) {
      return {
        ok: false,
        validation: {
          errors: ['英文内容为空'],
          warnings: []
        },
        understanding: {
          candidate: '',
          source: 'local'
        },
        cacheKey
      };
    }

    if (useCache) {
      const cached = this.getAnalyzeCacheItem(cacheKey);

      if (cached) {
        logAiStreamDiagnostic('frontend_cache_lookup', {
          generationId: Number(options.requestGeneration) || 0,
          idempotencyKey: options.idempotencyKey || '',
          result: 'hit',
          forceRefresh
        });
        return {
          ...cached,
          fromCache: true,
          cacheKey
        };
      }

      // In-flight dedup: blur + save can both call analyzeEnglish for the same
      // text before the first request finishes. Without this, concurrent calls
      // fire duplicate backend requests and hit 429 (rate limit) / 503
      // (ai_global_concurrency=1 queue timeout), then each fails over to the
      // cloud function. Share one in-flight request per cacheKey instead.
      if (this._inflightAnalyze && this._inflightAnalyze[cacheKey]) {
        logAiStreamDiagnostic('frontend_inflight_reuse', {
          generationId: Number(options.requestGeneration) || 0,
          idempotencyKey: options.idempotencyKey || '',
          result: 'reused'
        });
        return this._inflightAnalyze[cacheKey];
      }
    }

    const promise = this._performAnalyzeEnglish(
      text,
      category,
      cacheKey,
      options.onStreamEvent,
      options.requestGeneration,
      forceRefresh,
      options.idempotencyKey || ''
    );
    if (!this._inflightAnalyze) {
      this._inflightAnalyze = Object.create(null);
    }
    this._inflightAnalyze[cacheKey] = promise;

    try {
      return await promise;
    } finally {
      if (this._inflightAnalyze[cacheKey] === promise) {
        delete this._inflightAnalyze[cacheKey];
      }
    }
  },

  async _performAnalyzeEnglish(text, category, cacheKey, onStreamEvent, requestGeneration, forceRefresh = false, idempotencyKey = '') {
    let streamErrorStatus = 0;

    // Interactive auto-analysis uses the streaming endpoint so the reference
    // area fills in progressively from a single qwen3:8b request. Save paths
    // (no onStreamEvent) skip streaming and keep the existing direct chain.
    if (typeof onStreamEvent === 'function') {
      const streamOutcome = await this.callBackendAnalyzeStream(
        text,
        category,
        cacheKey,
        onStreamEvent,
        requestGeneration,
        forceRefresh,
        idempotencyKey
      );
      const staleGeneration =
        typeof requestGeneration === 'number' &&
        requestGeneration !== this.analysisGeneration;
      if (streamOutcome.aborted || staleGeneration) {
        // The request was cancelled (newer analysis or page unload). Don't fall
        // back to direct even if this WeChat runtime reports abort as a generic
        // transport failure, and don't treat the cancel as an AI error.
        console.log('[add] stream analyze aborted, skipping fallback');
        logAiStreamDiagnostic('direct_fallback', {
          generationId: Number(requestGeneration) || 0,
          idempotencyKey,
          result: 'skipped',
          reason: streamOutcome.aborted ? 'aborted' : 'stale_generation'
        });
        return {
          ok: false,
          aborted: true,
          validation: {
            errors: [],
            warnings: []
          },
          understanding: {
            candidate: '',
            source: 'local'
          },
          cacheKey
        };
      }
      if (streamOutcome.ok) {
        console.log('[add] analyze source: stream backend');
        if (
          streamOutcome.result.ok !== false &&
          (typeof requestGeneration !== 'number' || requestGeneration === this.analysisGeneration)
        ) {
          this.setAnalyzeCacheItem(cacheKey, streamOutcome.result);
        }
        return streamOutcome.result;
      }
      streamErrorStatus = streamOutcome.errorStatus || 0;
      // Stream failed → fall through to the existing direct chain once
      // (never retries the stream again, so at most one extra fallback request).
      console.log('[add] stream backend unavailable, falling back to direct');
      logAiStreamDiagnostic('direct_fallback', {
        generationId: Number(requestGeneration) || 0,
        idempotencyKey,
        result: 'started',
        streamErrorStatus
      });
    }

    // Try direct backend (the only AI path now that cloud functions are removed).
    let directErrorStatus = 0;
    try {
      const directResult = await this.callBackendAnalyzeDirect(text, category, cacheKey, forceRefresh, idempotencyKey);
      if (directResult) {
        console.log('[add] analyze source: direct backend');
        console.log('[add] exampleSentence received:', Boolean(directResult.exampleSentence));
        if (
          directResult.ok !== false &&
          (typeof requestGeneration !== 'number' || requestGeneration === this.analysisGeneration)
        ) {
          this.setAnalyzeCacheItem(cacheKey, directResult);
        }
        return directResult;
      }
    } catch (directError) {
      directErrorStatus = directError && directError.statusCode ? directError.statusCode : 0;
      console.log('[add] direct backend unavailable');
    }

    // Unified failure handling: keep the user's input and don't fake an AI
    // result, but tell the caller WHY it failed so the UI can show an accurate
    // message (busy vs network vs AI) instead of a blanket "网络暂时不稳".
    return this._buildAnalysisUnavailableResult(cacheKey, streamErrorStatus, directErrorStatus);
  },

  _buildAnalysisUnavailableResult(cacheKey, streamErrorStatus, directErrorStatus) {
    // statusCode 0    -> request never reached the backend (network / ngrok)
    // statusCode 503  -> backend reachable but the single AI slot was busy
    // other 4xx/5xx   -> backend reachable but the AI service failed
    const status = directErrorStatus || streamErrorStatus || 0;
    let failureKind = 'network';
    if (status === 503) {
      failureKind = 'busy';
    } else if (status > 0) {
      failureKind = 'ai';
    }

    return {
      ok: false,
      failureKind: failureKind,
      validation: {
        errors: [],
        warnings: []
      },
      understanding: {
        candidate: '',
        source: 'local'
      },
      cacheKey
    };
  },


  
  async safeAnalyzeEnglish(englishText, category) {
    try {
      const result = await this.callAnalyzeEnglish(englishText, category, {
        useCache: true
      });
      if (result && result.ok !== false) {
        return { ok: true, data: result };
      }
      return { ok: false, error: result };
    } catch (err) {
      console.warn('[add] safeAnalyzeEnglish failed:', err);
      return { ok: false, error: err };
    }
  },

  makeAnalyzeCacheKey(englishText, category) {
    const text = normalizeEnglishText(englishText).toLowerCase();
    const words = getNormalizedWordList(text)
      .map((word) => normalizeEnglishText(word).toLowerCase())
      .filter(Boolean)
      .join('|');
  
    return `${category || '单词'}::${text}::${words}`;
  },

  getAnalyzeCache() {
    try {
      const cache = wx.getStorageSync(ANALYZE_CACHE_STORAGE_KEY);
      return cache && typeof cache === 'object' ? cache : {};
    } catch (error) {
      return {};
    }
  },
  
  getAnalyzeCacheItem(cacheKey) {
    if (!cacheKey) {
      return null;
    }
  
    const cache = this.getAnalyzeCache();
    const item = cache[cacheKey];
  
    if (!item || !item.savedAt) {
      return null;
    }
  
    const isExpired = Date.now() - Number(item.savedAt || 0) > ANALYZE_CACHE_MAX_AGE;

    if (isExpired) {
      delete cache[cacheKey];
      wx.setStorageSync(ANALYZE_CACHE_STORAGE_KEY, cache);
      return null;
    }

    // Discard stale word/phrase/sentence entries that have no example sentence.
    // Word/phrase ones were written before the Phase 8D-hotfix; sentence ones were
    // written before sentences started routing to Qwen. Either would permanently hide
    // the example + usage scenario + dialogue + synonyms that now generate.
    var backendCategory = String((item.backend && item.backend.category) || '');
    var frontendCategory = String(item.category || '');
    var itemNeedsExample = (
      backendCategory === 'word' || backendCategory === 'phrase' || backendCategory === 'sentence' ||
      frontendCategory === '单词' || frontendCategory === '短语' || frontendCategory === '句子'
    );
    if (itemNeedsExample && !normalizePlainText(item.exampleSentence || '')) {
      delete cache[cacheKey];
      wx.setStorageSync(ANALYZE_CACHE_STORAGE_KEY, cache);
      return null;
    }

    return item;
  },
  
  setAnalyzeCacheItem(cacheKey, result) {
    if (!cacheKey || !result || result.ok === false) {
      return;
    }

    // Don't cache word/phrase/sentence results that have no example sentence.
    // A temporary Ollama/Hunyuan failure would otherwise seal an empty-example result
    // for the full 30-day TTL, hiding successfully-generated examples (and the
    // scenario/dialogue/synonyms that come with them) after recovery.
    var backendCategory = String((result.backend && result.backend.category) || '');
    var frontendCategory = String(result.category || '');
    var itemNeedsExample = (
      backendCategory === 'word' || backendCategory === 'phrase' || backendCategory === 'sentence' ||
      frontendCategory === '单词' || frontendCategory === '短语' || frontendCategory === '句子'
    );
    if (itemNeedsExample && !normalizePlainText(result.exampleSentence || '')) {
      return;
    }

    try {
      const cache = this.getAnalyzeCache();
  
      cache[cacheKey] = {
        ...result,
        cacheKey,
        savedAt: Date.now()
      };
  
      const keys = Object.keys(cache);
  
      if (keys.length > ANALYZE_CACHE_MAX_ITEMS) {
        keys
          .sort((a, b) => Number(cache[a].savedAt || 0) - Number(cache[b].savedAt || 0))
          .slice(0, keys.length - ANALYZE_CACHE_MAX_ITEMS)
          .forEach((key) => {
            delete cache[key];
          });
      }
  
      wx.setStorageSync(ANALYZE_CACHE_STORAGE_KEY, cache);
    } catch (error) {
      console.warn('写入分析缓存失败', error);
    }
  },


  getBasePageState({
    isEdit = false,
    isFromReviewMode = false,
    isFromTodayReviewedMode = false,
    isFromHistoryMode = false
  } = {}) {
    return {
      pageTitle: '',
      isEdit,
      isFromReviewMode,
      isFromTodayReviewedMode,
      isFromHistoryMode,
      isReadonlyDetailMode: isReadonlyDetailMode(this.pageOptions || {}),
      cardId: '',
      categoryIndex: 0,
      inheritedContextText: '',
      englishValidationMessage: '',
      englishValidationType: 'hint',
      isValidatingEnglish: false,
      suggestionText: '',
      suggestionSourceText: '',
      showSuggestion: false,
      translating: false,
      isAnalyzing: false,
      autoFocusUnderstanding: false,
      isUnderstandingFocused: false,
      deferNonCriticalReady: false,
      showNotesField: false,
      form: createEmptyForm(),

      validationResult: null,
      understandingSuggestion: '',
      understandingVisible: false,
      validateLoading: false,
      suggestLoading: false,
      latestEnglishForSuggest: '',
      hasUserChangedCategory: false,
      isLeavingPage: false,
      isSaving: false,
      recentSources: []

    };
  },

  getDefaultFormState() {
    const inputContext = getInputContext();
    const lastEncounterContext = getLastEncounterContext();
  
    return {
      cardId: '',
      categoryIndex: 0,
      inheritedContextText: '',
      hasUserChangedCategory: false,
      form: {
        ...createEmptyForm(),
        examScene: inputContext.examScene,
        examModule: inputContext.examModule,
        whereEncountered: lastEncounterContext
      }
    };
  },

  getFormStateFromCard(card, cardId) {
    if (!card) {
      return {};
    }

    const category = card.category || '单词';
    const examScene = card.examScene || DEFAULT_EXAM_SCENE;
    const examModule = card.examModule || DEFAULT_EXAM_MODULE;
    const notes = card.notes || '';

    return {
      cardId: cardId || card.id || '',
      categoryIndex: Math.max(CARD_CATEGORIES.indexOf(category), 0),
      inheritedContextText: '',
      showNotesField: Boolean(notes),
      notesExampleAvailable: Boolean(extractEnglishExampleFromNotes(notes)),
      form: {
        category,
        examScene,
        examModule,
        englishText: card.englishText || '',
        whereEncountered: card.whereEncountered || '',
        myUnderstanding: card.myUnderstanding || '',
        notes
      }
    };
  },

  // ===== Edit pronunciation helpers =====

  _getCurrentEditEnglish() {
    return String(
      this.data.form && this.data.form.englishText
        ? this.data.form.englishText
        : this.data.editPronunciationText || ''
    ).trim();
  },

  onLoad(options) {
    logAiStreamDiagnostic('frontend_code_identity', {
      diagnosticVersion: STREAM_DIAGNOSTIC_VERSION
    });
    console.log('[edit-pronunciation] implementation version: edit-audio-fix-20260704-2');
    console.log('[edit-pronunciation] onLoad options', JSON.stringify(options));

    this.pageOptions = options || {};
    this.suggestionCache = Object.create(null);
    this.englishValidationTimer = null;
    this.suggestionTimer = null;
    this.postRenderTimer = null;
    this.delayedLoadCardTimer = null;
    this.deferNonCriticalTimer = null;
    this.analysisGeneration = 0;
    this._editPhoneticRequestId = 0;
    this._editPhoneticTimer = null;
    this._editPronunciationSafetyTimer = null;

    // Only create pronunciation controller for edit mode
    if (Boolean(options.id)) {
      this.pronunciationController = createPronunciationController(this);
    }

    const isFromReviewMode = isFromReviewPage(this.pageOptions);
    const isFromTodayReviewedMode = isFromTodayReviewedPage(this.pageOptions);
    const isFromHistoryMode = isFromHistoryPage(this.pageOptions);
    const isEdit = Boolean(options.id);

    let initialData = this.getBasePageState({
      isEdit,
      isFromReviewMode,
      isFromTodayReviewedMode,
      isFromHistoryMode
    });

    var cachedCard = null;
    if (isEdit) {
      const app = getApp();
      cachedCard = app.globalData && app.globalData.pendingEditCard;

      if (cachedCard && String(cachedCard.id) === String(options.id)) {
        initialData = {
          ...initialData,
          ...this.getFormStateFromCard(cachedCard, options.id)
        };

        app.globalData.pendingEditCard = null;

        this.delayedLoadCardTimer = setTimeout(() => {
          this.loadCard(options.id, { silent: true,deferHeavyTasks: false });
        }, PAGE_ANIMATION_SAFE_DELAY);
      } else {
        this.delayedLoadCardTimer = setTimeout(() => {
          this.loadCard(options.id, { silent: false, deferHeavyTasks: false });
        }, PAGE_ANIMATION_SAFE_DELAY);
      }
    } else {
      initialData = {
        ...initialData,
        ...this.getDefaultFormState()
      };
    }

    initialData.recentSources = buildRecentWhereEncounteredOptions();
    if (isEdit) {
      initialData.editPronunciationVoice = getStoredVoice();
    }

    this.setData(initialData, () => {
      this.setNavigationTitle();

      const englishText = initialData.form && initialData.form.englishText
        ? initialData.form.englishText
        : '';
      const category = initialData.form && initialData.form.category
        ? initialData.form.category
        : '单词';

      console.log('[edit-pronunciation] onLoad setData callback', {
        isEdit: isEdit,
        cardId: options.id || '',
        formEnglish: englishText || '(empty)',
        isReadonlyDetailMode: initialData.isReadonlyDetailMode,
        hasCachedCard: Boolean(cachedCard)
      });

        // Always keep editPronunciationText in sync with form English text
        // so the pronunciation button is never disabled due to stale data
        if (englishText && isEdit) {
          var patch = { editPronunciationText: englishText };
          this.setData(patch);
          console.log('[edit-pronunciation] onLoad: synced editPronunciationText from form', { editPronunciationText: englishText });
        }

        // 不再自动调用 AI 分析：等用户点击「AI 分析」按钮。编辑模式下保留原有发音初始化。

        // Edit mode: load phonetics for the initial English text
        if (isEdit && englishText && !initialData.isReadonlyDetailMode) {
          console.log('[edit-pronunciation] calling _loadEditPhonetic from onLoad, text:', englishText);
          this._loadEditPhonetic(englishText);
        } else if (isEdit && !englishText && !initialData.isReadonlyDetailMode) {
          console.log('[edit-pronunciation] onLoad: englishText empty, deferring to loadCard');
        }
    });
  },

  onReady() {
    this.setData({
      deferNonCriticalReady: true
    });
  },

  onUnload() {
    this.invalidatePendingAnalysis();
    this.abortActiveAnalysis();
    this._destroyEditAudio();

    if (this.pronunciationController) {
      this.pronunciationController.destroy();
      this.pronunciationController = null;
    }

    if (this.englishValidationTimer) {
      clearTimeout(this.englishValidationTimer);
      this.englishValidationTimer = null;
    }

    if (this.suggestionTimer) {
      clearTimeout(this.suggestionTimer);
      this.suggestionTimer = null;
    }

    if (this.postRenderTimer) {
      clearTimeout(this.postRenderTimer);
      this.postRenderTimer = null;
    }

    if (this.delayedLoadCardTimer) {
      clearTimeout(this.delayedLoadCardTimer);
      this.delayedLoadCardTimer = null;
    }

    if (this.deferNonCriticalTimer) {
      clearTimeout(this.deferNonCriticalTimer);
      this.deferNonCriticalTimer = null;
    }
  },

  setNavigationTitle() {
    const title = getPageNavigationTitle({
      isEdit: this.data.isEdit,
      isFromReviewMode: this.data.isFromReviewMode,
      isFromTodayReviewedMode: this.data.isFromTodayReviewedMode,
      isFromHistoryMode: this.data.isFromHistoryMode
    });

    wx.setNavigationBarTitle({
      title
    });
  },

  scrollToEnglishSection() {
    const query = wx.createSelectorQuery();

    query.select('#english-section').boundingClientRect();
    query.selectViewport().scrollOffset();

    query.exec((res) => {
      const sectionRect = res[0];
      const viewport = res[1];

      if (!sectionRect || !viewport) {
        return;
      }

      const targetTop = Math.max(sectionRect.top + viewport.scrollTop - 80, 0);

      wx.pageScrollTo({
        scrollTop: targetTop,
        duration: 250
      });
    });
  },

  invalidatePendingAnalysis() {
    this.analysisGeneration = (this.analysisGeneration || 0) + 1;
  },

  abortActiveAnalysis() {
    const holder = this._activeStreamTask;
    this._activeStreamTask = null;
    this._activeStreamText = '';
    this._activeStreamCategory = '';
    this._discardStreamPreview();

    // wx.request abort settles asynchronously. Remove the exact cancelled
    // request from page-level in-flight dedup immediately, otherwise a rapid
    // second click for the same text reuses the aborted Promise and never
    // creates a new RequestTask. The old Promise's identity-checked finally
    // cannot delete a newer request that is installed under the same key.
    const cacheKey = holder && holder.cacheKey;
    if (cacheKey && this._inflightAnalyze && this._inflightAnalyze[cacheKey]) {
      delete this._inflightAnalyze[cacheKey];
    }

    if (holder && holder.task && typeof holder.task.abort === 'function') {
      try {
        holder.task.abort();
      } catch (_) {
        // Ignore abort errors — the request is already settling via its fail callback.
      }
    }
  },

  clearAnalysisTimers() {
    if (this.englishValidationTimer) {
      clearTimeout(this.englishValidationTimer);
      this.englishValidationTimer = null;
    }

    if (this.suggestionTimer) {
      clearTimeout(this.suggestionTimer);
      this.suggestionTimer = null;
    }
  },

  async setDefaultForm() {
    const nextData = {
      ...this.getBasePageState({
        isEdit: false,
        isFromReviewMode: this.data.isFromReviewMode,
        isFromTodayReviewedMode: this.data.isFromTodayReviewedMode,
        isFromHistoryMode: this.data.isFromHistoryMode
      }),
      ...this.getDefaultFormState(),
      deferNonCriticalReady: this.data.deferNonCriticalReady
    };

    this.setData(nextData, () => {
      this.setNavigationTitle();
    });
  },

  clearSuggestion() {
    this.setData({
      suggestionText: '',
      suggestionSourceText: '',
      showSuggestion: false,
      translating: false,
      understandingSuggestion: '',
      understandingVisible: false,
      suggestLoading: false,
      validationResult: null,
      aiExampleSentence: '',
      aiExampleTranslation: '',
      aiSynonymsDisplay: '',
      aiSimilarPhrasesDisplay: '',
      aiExpressionTypeLabel: '',
      aiAlternativeMeanings: [],
      aiUsageScenario: '',
      aiDialogueEnglish: [],
      aiDialogueChinese: [],
      aiRelatedDisplay: '',
      notesExampleAvailable: false,
      referenceApplied: false
    });
  },

  clearTransientFeedbackBeforeLeave() {
    this.invalidatePendingAnalysis();

    if (this.englishValidationTimer) {
      clearTimeout(this.englishValidationTimer);
      this.englishValidationTimer = null;
    }
  
    if (this.suggestionTimer) {
      clearTimeout(this.suggestionTimer);
      this.suggestionTimer = null;
    }
  
    this.setData({
      isLeavingPage: true,
  
      englishValidationMessage: '',
      englishValidationType: 'hint',
      isValidatingEnglish: false,
  
      suggestionText: '',
      suggestionSourceText: '',
      showSuggestion: false,
      translating: false,
  
      validationResult: null,
      understandingSuggestion: '',
      understandingVisible: false,
      validateLoading: false,
      suggestLoading: false,
      latestEnglishForSuggest: '',
      aiExampleSentence: '',
      aiExampleTranslation: '',
      aiSynonymsDisplay: '',
      aiSimilarPhrasesDisplay: '',
      aiExpressionTypeLabel: '',
      aiAlternativeMeanings: [],
      aiUsageScenario: '',
      aiDialogueEnglish: [],
      aiDialogueChinese: [],
      aiRelatedDisplay: '',
      notesExampleAvailable: false,
      referenceApplied: false
    });
  },

  buildDisplayState({
    localErrors = [],
    cloudErrors = [],
    cloudWarnings = [],
    spellHints = [],
    cloudInfo = [],
    onlineValidationUnavailable = false,
    unavailableMessage = ''
  } = {}) {
    // 只有前端本地 error 才真正阻止保存，显示红色
    if (localErrors.length > 0) {
      return {
        displayMessage: localErrors[0],
        displayMessageType: 'error'
      }
    }

    // 后端 error 不展示（异步分析结果，不阻止保存，不透传原文）

    if (cloudWarnings.length > 0) {
      return {
        displayMessage: cloudWarnings[0],
        displayMessageType: 'warning'
      }
    }

    // 拼写 hint（有 correction 时），以 hint 样式展示
    if (spellHints.length > 0) {
      return {
        displayMessage: spellHints[0],
        displayMessageType: 'hint'
      }
    }

    if (cloudInfo.length > 0) {
      return {
        displayMessage: cloudInfo[0],
        displayMessageType: 'hint'
      }
    }

    if (onlineValidationUnavailable) {
      return {
        displayMessage: unavailableMessage || '网络或分析服务暂时不可用',
        displayMessageType: 'hint'
      }
    }

    return {
      displayMessage: '检查通过',
      displayMessageType: 'success'
    }
  },

  _classifyUnavailableMessage(analyzeResult) {
    // Map an analysis failure to an accurate, non-technical message instead of
    // a blanket "网络暂时不稳":
    //   aborted           -> cancelled by a newer input, not an error
    //   failureKind=busy  -> backend reachable but the single AI slot was busy
    //   failureKind=ai    -> backend reachable but the AI service failed
    //   failureKind=network -> request never reached the backend
    //   ok:false + errors -> Qwen/analyzer's own clean user-facing message
    if (!analyzeResult || analyzeResult.ok !== false || analyzeResult.aborted) {
      return '';
    }
    if (analyzeResult.failureKind === 'busy') {
      return '分析服务暂时繁忙，请稍后重试';
    }
    if (analyzeResult.failureKind === 'ai') {
      return 'AI 分析暂时不可用，请稍后重试';
    }
    if (analyzeResult.failureKind === 'network') {
      return '网络或分析服务暂时不可用';
    }
    const errors = analyzeResult.validation && analyzeResult.validation.errors;
    if (Array.isArray(errors) && errors.length > 0) {
      return errors[0];
    }
    return '网络或分析服务暂时不可用';
  },

  async analyzeEnglishInput(text, category, {
    needSuggestion = true,
    needCloudValidation = true,
    onStreamEvent = null,
    requestGeneration = null,
    forceRefresh = false,
    idempotencyKey = ''
  } = {}) {
    const normalizedText = normalizeEnglishText(text)

    if (!normalizedText) {
      return {
        normalizedText: '',
        localErrors: ['英文内容为空'],
        localWarnings: [],
        localInfo: [],
        cloudErrors: [],
        cloudWarnings: [],
        cloudInfo: [],
        suggestion: '',
        shouldShowSuggestion: false,
        canSave: false,
        onlineValidationUnavailable: false,
        displayMessage: '英文内容为空',
        displayMessageType: 'error'
      }
    }

    const localResult = getLocalValidationResult(normalizedText, category)
    const localErrors = localResult.errors || []
    const localWarnings = localResult.warnings || []
    const localInfo = localResult.info || []

    let cloudErrors = []
    let cloudWarnings = []
    let spellHints = []
    let cloudInfo = []
    let onlineValidationUnavailable = false
    let unavailableMessage = ''
    let suggestion = ''
    let backendNormalizedText = normalizedText
    let aiExampleSentence = ''
    let aiExampleTranslation = ''
    let aiSynonymsDisplay = ''
    let aiSimilarPhrasesDisplay = ''
    let aiExpressionTypeLabel = ''
    let aiAlternativeMeanings = []
    let aiUsageScenario = ''
    let aiDialogueEnglish = []
    let aiDialogueChinese = []
    let aiRelatedDisplay = ''
    let aiAnalysisSource = ''
    let aiAnalysisModel = ''

    if ((needCloudValidation || needSuggestion) && localErrors.length === 0) {
      const analyzeResult = await this.callAnalyzeEnglish(normalizedText, category, {
        onStreamEvent,
        requestGeneration,
        forceRefresh,
        idempotencyKey
      })

      const validation = analyzeResult.validation || {}
      const understanding = analyzeResult.understanding || {}
      backendNormalizedText = normalizeEnglishText(
        analyzeResult.normalizedText ||
        validation.normalizedText ||
        analyzeResult.text ||
        normalizedText
      )

      cloudErrors = Array.isArray(validation.errors) ? validation.errors : []

      // 分离拼写 hint（有 correction）和普通 warning
      var rawBackendWarnings = Array.isArray(validation.warnings) ? validation.warnings : []
      var filteredBackendWarnings = []
      rawBackendWarnings.forEach(function(w) {
        var transformed = transformSpellingWarning(w)
        if (!transformed) return  // 无 correction 的拼写提示：隐藏
        if (transformed.isHint) {
          spellHints.push(transformed.text)  // 有 correction：hint 样式
        } else {
          filteredBackendWarnings.push(transformed.text)
        }
      })

      cloudWarnings = prioritizeWarnings(
        filterWarningsByCategory(filteredBackendWarnings, category),
        category
      )

      cloudInfo = Array.isArray(validation.info) ? validation.info : []

      suggestion = normalizeEnglishText(
        understanding.candidate ||
        analyzeResult.candidate ||
        analyzeResult.suggestion ||
        ''
      )

      onlineValidationUnavailable = analyzeResult.ok === false
      unavailableMessage = this._classifyUnavailableMessage(analyzeResult)

      aiExampleSentence = normalizePlainText(analyzeResult.exampleSentence || '')
      aiExampleTranslation = normalizePlainText(analyzeResult.exampleTranslation || '')
      aiSynonymsDisplay = formatPairList(analyzeResult.synonyms || [])
      aiSimilarPhrasesDisplay = formatPairList(analyzeResult.similarPhrases || [])
      aiExpressionTypeLabel = getExpressionTypeLabel(analyzeResult.expressionType || '')
      aiAlternativeMeanings = normalizeAlternativeMeanings(analyzeResult.alternativeMeanings || [])
      aiUsageScenario = normalizePlainText(analyzeResult.usageScenario || '')
      var dialogueResult = normalizeDialogue(analyzeResult.dialogue)
      aiDialogueEnglish = dialogueResult.english
      aiDialogueChinese = dialogueResult.chinese
      aiRelatedDisplay = buildRelatedDisplay(analyzeResult.synonyms, analyzeResult.similarPhrases)
      aiAnalysisSource = normalizePlainText(analyzeResult.analysisSource || '')
      aiAnalysisModel = normalizePlainText(analyzeResult.analysisModel || '')
    }

    const hasDictionaryWarning = cloudWarnings.some((item) => {
      return isDictionaryUnrecognizedWarning(item)
    })

    // 单词模式下：如果在线词典都没收录，不要再展示机器翻译建议。
    // 机器翻译不是词典，不能用“翻译成功”证明这个单词有效。
    const shouldSkipMachineSuggestionForUnknownSingleWord =
      category === '单词' && hasDictionaryWarning

    const hasAnyError = localErrors.length > 0 || cloudErrors.length > 0
    const shouldBlockSuggestion =
      hasAnyError ||
      shouldSkipMachineSuggestionForUnknownSingleWord

    if (!needSuggestion || shouldBlockSuggestion) {
      suggestion = ''
    }

    // 单词：词典未收录时，不用机器翻译来”证明”它有效。
    // 句子：允许生成机器翻译参考，但保留”部分词未识别”的 warning，提醒用户自行判断。
    // 短语：可以继续弱化词典未识别提醒，避免小短语频繁打扰。
    if (suggestion && category === '短语') {
      cloudWarnings = filterDictionaryWarningsWhenSuggestionWorks(cloudWarnings, suggestion)
    }

    const shouldShowSuggestion = !shouldBlockSuggestion && !!suggestion
    // 只有前端本地 error 才真正阻止保存
    const canSave = localErrors.length === 0

    const displayState = this.buildDisplayState({
      localErrors,
      cloudErrors,
      cloudWarnings,
      spellHints,
      cloudInfo,
      onlineValidationUnavailable,
      unavailableMessage
    })

    return {
      normalizedText,
      backendNormalizedText,
      localErrors,
      localWarnings,
      localInfo,
      cloudErrors,
      cloudWarnings,
      cloudInfo,
      suggestion,
      shouldShowSuggestion,
      canSave,
      onlineValidationUnavailable,
      aiExampleSentence,
      aiExampleTranslation,
      aiSynonymsDisplay,
      aiSimilarPhrasesDisplay,
      aiExpressionTypeLabel,
      aiAlternativeMeanings,
      aiUsageScenario,
      aiDialogueEnglish,
      aiDialogueChinese,
      aiRelatedDisplay,
      aiAnalysisSource,
      aiAnalysisModel,
      displayMessage: displayState.displayMessage,
      displayMessageType: displayState.displayMessageType
    }
  },

  applyAnalysisToPage(analysis, sourceText, requestGeneration) {
    if (this.data.isLeavingPage) {
      logAiStreamDiagnostic('stale_callback_ignored', {
        oldGenerationId: requestGeneration,
        currentGenerationId: this.analysisGeneration || 0,
        callbackType: 'final_page_leaving'
      });
      return
    }

    if (
      typeof requestGeneration === 'number' &&
      requestGeneration !== this.analysisGeneration
    ) {
      logAiStreamDiagnostic('stale_callback_ignored', {
        oldGenerationId: requestGeneration,
        currentGenerationId: this.analysisGeneration || 0,
        callbackType: 'final_setData'
      });
      return
    }

    var normalizedText = normalizeEnglishText(sourceText)
    var currentRaw = this.data.form.englishText
    if (endsWithWhitespace(currentRaw) || normalizeEnglishText(currentRaw) !== normalizedText) {
      logAiStreamDiagnostic('stale_callback_ignored', {
        oldGenerationId: requestGeneration,
        currentGenerationId: this.analysisGeneration || 0,
        callbackType: 'final_input_changed'
      });
      return
    }

    this._discardStreamPreview()

    var nextData = {
      validationResult: {
        localErrors: analysis.localErrors,
        localWarnings: analysis.localWarnings,
        localInfo: analysis.localInfo,
        cloudErrors: analysis.cloudErrors,
        cloudWarnings: analysis.cloudWarnings,
        cloudInfo: analysis.cloudInfo,
        canSave: analysis.canSave
      },
      englishValidationMessage: analysis.displayMessage,
      englishValidationType: analysis.displayMessageType,
      suggestionText: analysis.shouldShowSuggestion ? analysis.suggestion : '',
      suggestionSourceText: normalizedText,
      showSuggestion: analysis.shouldShowSuggestion,
      understandingSuggestion: analysis.shouldShowSuggestion ? analysis.suggestion : '',
      understandingVisible: analysis.shouldShowSuggestion,
      aiExampleSentence: analysis.aiExampleSentence || '',
      aiExampleTranslation: analysis.aiExampleTranslation || '',
      aiSynonymsDisplay: analysis.aiSynonymsDisplay || '',
      aiSimilarPhrasesDisplay: analysis.aiSimilarPhrasesDisplay || '',
      aiExpressionTypeLabel: analysis.aiExpressionTypeLabel || '',
      aiAlternativeMeanings: analysis.aiAlternativeMeanings || [],
      aiUsageScenario: analysis.aiUsageScenario || '',
      aiDialogueEnglish: analysis.aiDialogueEnglish || [],
      aiDialogueChinese: analysis.aiDialogueChinese || [],
      aiRelatedDisplay: analysis.aiRelatedDisplay || '',
      aiAnalysisSource: analysis.aiAnalysisSource || '',
      aiAnalysisModel: analysis.aiAnalysisModel || '',
      notesExampleAvailable: this.computeNotesExampleAvailable(
        analysis.aiExampleSentence || '',
        this.data.form.notes
      ),
      referenceApplied: this.computeReferenceApplied(
        analysis.shouldShowSuggestion ? analysis.suggestion : '',
        analysis.aiExampleSentence || '',
        analysis.aiExampleTranslation || ''
      ),
      translating: false,
      isAnalyzing: false,
      isValidatingEnglish: false,
      validateLoading: false,
      suggestLoading: false
    }

    console.log('[AI TRACE 9] reference data before render =', JSON.stringify({
      suggestionText: nextData.suggestionText,
      aiExampleSentence: nextData.aiExampleSentence,
      aiExampleTranslation: nextData.aiExampleTranslation,
      aiUsageScenario: nextData.aiUsageScenario,
      aiDialogueEnglish: nextData.aiDialogueEnglish,
      aiDialogueChinese: nextData.aiDialogueChinese,
      aiRelatedDisplay: nextData.aiRelatedDisplay,
      aiAlternativeMeanings: nextData.aiAlternativeMeanings,
      aiAnalysisSource: nextData.aiAnalysisSource,
      aiAnalysisModel: nextData.aiAnalysisModel
    }));

    this.setData(nextData, () => {
      logAiStreamDiagnostic('final_visible', {
        generationId: requestGeneration,
        currentGenerationId: this.analysisGeneration || 0
      });
    })
  },

  _createIdempotencyKey() {
    return 'ai-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  },

  onAnalyzeTap() {
    if (this.data.isReadonlyDetailMode || this.data.isAnalyzing) {
      return;
    }

    const englishText = normalizeEnglishText(this.data.form.englishText || '');
    const category = this.data.form.category || '单词';

    if (!englishText) {
      this.setData({
        englishValidationMessage: '英文内容为空',
        englishValidationType: 'error'
      });
      return;
    }

    const localResult = getLocalValidationResult(englishText, category);
    if (localResult.errors.length > 0) {
      this.setData({
        englishValidationMessage: localResult.errors[0],
        englishValidationType: 'error'
      });
      return;
    }

    this.runInputAnalysis(englishText, category);
  },

  onCancelAnalyzeTap() {
    // 用户主动取消：作废当前 generation 和所有临时/旧结果，回到干净的 idle 状态。
    const holder = this._activeStreamTask;
    logAiStreamDiagnostic('stream_cancel', {
      generationId: holder && holder.generationId
        ? holder.generationId
        : (this.analysisGeneration || 0),
      idempotencyKey: holder && holder.idempotencyKey ? holder.idempotencyKey : ''
    });
    this.invalidatePendingAnalysis();
    this.abortActiveAnalysis();
    this.setData({
      ...this._emptyAiAnalysisDisplayPatch(),
      isAnalyzing: false,
      translating: false,
      suggestLoading: false,
      isValidatingEnglish: false,
      validateLoading: false,
      isRegenerating: false
    });
  },

  async runInputAnalysis(englishText, category) {
    const normalizedText = normalizeEnglishText(englishText)

    // A blur (or save) for the exact same text+category that is already
    // streaming must not abort the in-flight request and re-run it. Doing so
    // aborts a healthy request, reuses the already-aborted promise via the
    // in-flight dedup, and surfaces a false "网络暂时不稳" without ever firing
    // a new request. Let the in-flight analysis finish and apply itself.
    if (
      this._activeStreamTask &&
      normalizedText &&
      normalizedText === this._activeStreamText &&
      (category || '') === (this._activeStreamCategory || '')
    ) {
      return;
    }

    this.abortActiveAnalysis();
    const requestGeneration = (this.analysisGeneration || 0) + 1
    this.analysisGeneration = requestGeneration
    const idempotencyKey = this._createIdempotencyKey();
    logAiStreamDiagnostic('generation_start', {
      generationId: requestGeneration,
      idempotencyKey,
      forceRefresh: true,
      action: 'analyze'
    });

    var patch = {
      ...this._emptyAiAnalysisDisplayPatch(),
      latestEnglishForSuggest: normalizedText,
      translating: !!normalizedText,
      isAnalyzing: !!normalizedText,
      isRegenerating: false,
      isValidatingEnglish: !!normalizedText,
      suggestLoading: !!normalizedText
    }

    this.setData(patch)

    if (!normalizedText) {
      this.clearSuggestion()
      this.setData({
        isAnalyzing: false,
        englishValidationMessage: '',
        englishValidationType: 'hint',
        isValidatingEnglish: false,
        validateLoading: false,
        suggestLoading: false
      })
      return
    }

    const t0 = Date.now()
    const perf = { firstDelta: null, firstField: null, meaning: null, exampleSentence: null }

    const onStreamEvent = (event, startedAt) => {
      const now = Date.now()
      const field = event && event.field
      if (event && event.type === 'delta' && perf.firstDelta === null) {
        perf.firstDelta = now
      }
      if (event && event.type === 'field' && perf.firstField === null) {
        perf.firstField = now
      }
      if (field === 'meaning' && perf.meaning === null) {
        perf.meaning = now
      }
      if (field === 'exampleSentence' && perf.exampleSentence === null) {
        perf.exampleSentence = now
      }
      this.handleStreamAnalysisEvent(event, normalizedText, requestGeneration, startedAt || t0)
    }

    const analysis = await this.analyzeEnglishInput(normalizedText, category, {
      needSuggestion: true,
      needCloudValidation: true,
      onStreamEvent,
      requestGeneration,
      forceRefresh: true,
      idempotencyKey
    })

    if (perf.firstDelta !== null || perf.firstField !== null) {
      const sec = (ms) => ((ms - t0) / 1000).toFixed(2)
      console.log(
        '[stream perf] ' + normalizedText +
        ' | first_delta=' + (perf.firstDelta ? sec(perf.firstDelta) + 's' : 'n/a') +
        ' | first_field=' + (perf.firstField ? sec(perf.firstField) + 's' : 'n/a') +
        ' | primary_meaning=' + (perf.meaning ? sec(perf.meaning) + 's' : 'n/a') +
        ' | example_sentence=' + (perf.exampleSentence ? sec(perf.exampleSentence) + 's' : 'n/a') +
        ' | complete=' + ((Date.now() - t0) / 1000).toFixed(2) + 's'
      )
    }

    if (this.data.isLeavingPage || requestGeneration !== this.analysisGeneration) {
      logAiStreamDiagnostic('stale_callback_ignored', {
        oldGenerationId: requestGeneration,
        currentGenerationId: this.analysisGeneration || 0,
        callbackType: 'analysis_complete'
      });
      return
    }

    const currentRaw = this.data.form.englishText
    if (endsWithWhitespace(currentRaw) || normalizeEnglishText(currentRaw) !== normalizedText) {
      return
    }

    this.applyAnalysisToPage(analysis, normalizedText, requestGeneration)
  },

  async regenerateAnalysis() {
    // 重新生成：跳过前端 + 后端缓存，强制重新调用 AI，保留英文输入并显示加载中。
    if (this.data.isRegenerating || this.data.translating) {
      return;
    }

    const englishText = normalizeEnglishText(this.data.form.englishText || '');
    const category = this.data.form.category || '单词';

    if (!englishText) {
      return;
    }

    this.abortActiveAnalysis();
    const requestGeneration = (this.analysisGeneration || 0) + 1;
    this.analysisGeneration = requestGeneration;
    // 重新分析属于新的用户操作：生成全新的 Idempotency-Key，允许真正重新生成。
    const idempotencyKey = this._createIdempotencyKey();
    logAiStreamDiagnostic('generation_start', {
      generationId: requestGeneration,
      idempotencyKey,
      forceRefresh: true,
      action: 'regenerate'
    });

    this.setData({
      ...this._emptyAiAnalysisDisplayPatch(),
      translating: true,
      isAnalyzing: true,
      isRegenerating: true,
      isValidatingEnglish: true,
      suggestLoading: true
    });

    const streamStartedAt = Date.now();
    const onStreamEvent = (event, startedAt) => {
      this.handleStreamAnalysisEvent(event, englishText, requestGeneration, startedAt || streamStartedAt);
    };

    try {
      const analysis = await this.analyzeEnglishInput(englishText, category, {
        needSuggestion: true,
        needCloudValidation: true,
        onStreamEvent,
        requestGeneration,
        forceRefresh: true,
        idempotencyKey
      });

      if (this.data.isLeavingPage || requestGeneration !== this.analysisGeneration) {
        logAiStreamDiagnostic('stale_callback_ignored', {
          oldGenerationId: requestGeneration,
          currentGenerationId: this.analysisGeneration || 0,
          callbackType: 'regenerate_complete'
        });
        return;
      }

      const currentRaw = this.data.form.englishText;
      if (endsWithWhitespace(currentRaw) || normalizeEnglishText(currentRaw) !== englishText) {
        return;
      }

      this.applyAnalysisToPage(analysis, englishText, requestGeneration);
    } finally {
      if (requestGeneration === this.analysisGeneration) {
        this.setData({ isRegenerating: false });
      }
    }
  },


  async loadCard(cardId, options = {}) {
    const {
      silent = false,
      deferHeavyTasks = false
    } = options;

    let card = null;

    try {
      card = await getCardById(cardId);
    } catch (error) {
      card = null;
    }

    if (!card) {
      if (!silent) {
        wx.showToast({
          title: '未找到卡片',
          icon: 'none'
        });

        setTimeout(() => {
          wx.navigateBack();
        }, 500);
      }
      return;
    }

    const nextData = {
      ...this.getFormStateFromCard(card, cardId),
      pageTitle: '',
      isEdit: true,
      suggestionText: '',
      suggestionSourceText: '',
      showSuggestion: false,
      translating: false,
      autoFocusUnderstanding: false,
      isUnderstandingFocused: false
    };

    this.setData(nextData, () => {
      this.setNavigationTitle();
    });

    const englishText = nextData.form.englishText || '';
    const category = nextData.form.category || '单词';

    console.log('[edit-pronunciation] loadCard completed', {
      cardId: cardId,
      formEnglish: englishText || '(empty)',
      editPronunciationText: this.data.editPronunciationText || '(empty)',
      isReadonlyDetailMode: this.data.isReadonlyDetailMode
    });

    if (this.data.isReadonlyDetailMode) {
      return;
    }

    if (englishText) {
      // Sync editPronunciationText immediately so the button is never disabled
      this.setData({ editPronunciationText: englishText });
      console.log('[edit-pronunciation] loadCard: synced editPronunciationText from form', { editPronunciationText: englishText });

      // 不再自动调用 AI 分析：等用户点击「AI 分析」按钮。

      // Initialize pronunciation: ensure editPronunciationText is set and load phonetics
      if (!this.data.isReadonlyDetailMode) {
        console.log('[edit-pronunciation] loadCard calling _loadEditPhonetic, text:', englishText);
        this._loadEditPhonetic(englishText);
      }
    } else {
      console.log('[edit-pronunciation] loadCard: englishText empty, skipping pronunciation init');
    }
  },

  updateField(fieldName, value) {
    this.setData({
      [`form.${fieldName}`]: value
    });
  },

  getAutoCategoryForEnglishText(text) {
    const detectedCategory = detectEnglishCategory(text);
  
    if (!detectedCategory) {
      return '';
    }
  
    if (!CARD_CATEGORIES.includes(detectedCategory)) {
      return '';
    }
  
    return detectedCategory;
  },

  onCategoryChange(event) {
    if (this.data.isReadonlyDetailMode) return;
    const categoryIndex = Number(event.detail.value) || 0;
    const category = CARD_CATEGORIES[categoryIndex] || CARD_CATEGORIES[0];
    this.invalidatePendingAnalysis();
    // 类别变化：取消在途分析，不自动重新分析，等用户再次点击「AI 分析」。
    this.abortActiveAnalysis();

    const englishText = normalizeEnglishText(this.data.form.englishText || '');
    const localResult = englishText ? getLocalValidationResult(englishText, category) : null;
    const hasLocalError = !!localResult && localResult.errors.length > 0;

    this.setData({
      categoryIndex,
      'form.category': category,
      hasUserChangedCategory: true,
      suggestionText: '',
      suggestionSourceText: '',
      showSuggestion: false,
      understandingSuggestion: '',
      understandingVisible: false,
      validationResult: null,
      aiExampleSentence: '',
      aiExampleTranslation: '',
      aiSynonymsDisplay: '',
      aiSimilarPhrasesDisplay: '',
      aiExpressionTypeLabel: '',
      aiAlternativeMeanings: [],
      aiUsageScenario: '',
      aiDialogueEnglish: [],
      aiDialogueChinese: [],
      aiRelatedDisplay: '',
      notesExampleAvailable: false,
      referenceApplied: false,
      englishValidationMessage: hasLocalError ? localResult.errors[0] : '输入有效，可点击「AI 分析」',
      englishValidationType: hasLocalError ? 'error' : 'hint',
      isValidatingEnglish: false,
      isAnalyzing: false,
      translating: false
    });
  },


  onEnglishInput(event) {
    if (this.data.isReadonlyDetailMode) return;
    const nextValue = event.detail.value;
    const normalizedNextText = normalizeEnglishText(nextValue);
    const previousText = normalizeEnglishText(this.data.form.englishText);

    const nextData = {
      'form.englishText': nextValue
    };

    if (normalizedNextText !== previousText) {
      this.invalidatePendingAnalysis();
      // 用户修改已提交分析的英文内容：取消旧分析，不自动分析新内容，等用户再次点击「AI 分析」。
      this.abortActiveAnalysis();
      nextData.isAnalyzing = false;
      nextData.translating = false;
    }

    // 新增卡片时，英文内容每次变化都按内容自动识别类别，不被 hasUserChangedCategory 阻止
    let categoryForAnalysis = this.data.form.category;
    const autoCategory = this.getAutoCategoryForEnglishText(normalizedNextText);
    const shouldAutoUpdateCategory = (
      !this.data.isEdit &&
      autoCategory &&
      autoCategory !== this.data.form.category
    );

    if (shouldAutoUpdateCategory) {
      categoryForAnalysis = autoCategory;
      nextData.categoryIndex = Math.max(CARD_CATEGORIES.indexOf(autoCategory), 0);
      nextData['form.category'] = autoCategory;
    }

    if (normalizedNextText !== this.data.suggestionSourceText) {
      nextData.suggestionText = '';
      nextData.suggestionSourceText = '';
      nextData.showSuggestion = false;
      nextData.understandingSuggestion = '';
      nextData.understandingVisible = false;
      nextData.validationResult = null;
      nextData.aiExampleSentence = '';
      nextData.aiExampleTranslation = '';
      nextData.aiExpressionTypeLabel = '';
      nextData.aiAlternativeMeanings = [];
      nextData.aiUsageScenario = '';
      nextData.aiDialogueEnglish = [];
      nextData.aiDialogueChinese = [];
      nextData.aiRelatedDisplay = '';
      nextData.referenceApplied = false;
      nextData.translating = false;
    }

    this.setData(nextData);

    // Edit mode: schedule phonetic lookup on text change
    if (this.data.isEdit) {
      this._scheduleEditPhonetic(normalizedNextText);
    }

    if (!normalizedNextText) {
      if (this.englishValidationTimer) {
        clearTimeout(this.englishValidationTimer);
        this.englishValidationTimer = null;
      }

      if (this.suggestionTimer) {
        clearTimeout(this.suggestionTimer);
        this.suggestionTimer = null;
      }

      this.clearSuggestion();
      this.setData({
        isAnalyzing: false,
        englishValidationMessage: '英文内容为空',
        englishValidationType: 'error',
        isValidatingEnglish: false
      });
      return;
    }

    // 输入过程中只做轻量本地检查（空内容 / 无英文字符 / 长度限制等），不调用 Qwen；
    // 用户点击「AI 分析」才启动后端正式分析。
    const localResult = getLocalValidationResult(normalizedNextText, categoryForAnalysis);
    if (localResult.errors.length > 0) {
      this.setData({
        englishValidationMessage: localResult.errors[0],
        englishValidationType: 'error',
        isValidatingEnglish: false
      });
    } else {
      this.setData({
        englishValidationMessage: '输入有效，可点击「AI 分析」',
        englishValidationType: 'hint',
        isValidatingEnglish: false
      });
    }
  },

  onEnglishBlur(event) {
    if (this.data.isReadonlyDetailMode) return;
    if (this.englishValidationTimer) {
      clearTimeout(this.englishValidationTimer);
      this.englishValidationTimer = null;
    }

    if (this.suggestionTimer) {
      clearTimeout(this.suggestionTimer);
      this.suggestionTimer = null;
    }

    const rawText = event.detail.value;
    const normalizedText = normalizeEnglishText(rawText);

    if (rawText !== normalizedText) {
      this.setData({ 'form.englishText': normalizedText });
    }

    // 失焦也不再自动调用 AI：只保留轻量本地检查状态，分析由「AI 分析」按钮触发。
    if (!normalizedText) {
      this.setData({
        isAnalyzing: false,
        englishValidationMessage: '英文内容为空',
        englishValidationType: 'error',
        isValidatingEnglish: false
      });
      return;
    }

    const localResult = getLocalValidationResult(normalizedText, this.data.form.category);
    if (localResult.errors.length > 0) {
      this.setData({
        englishValidationMessage: localResult.errors[0],
        englishValidationType: 'error',
        isValidatingEnglish: false
      });
    }
  },

  onUnderstandingInput(event) {
    if (this.data.isReadonlyDetailMode) return;
    this.setData({
      'form.myUnderstanding': event.detail.value
    });
    this.refreshReferenceApplied();
  },

  // ===== Edit-mode pronunciation (only active when isEdit && !isReadonlyDetailMode) =====

  _loadEditPhonetic(text) {
    var cardId = this.data.cardId || (this.data.form && this.data.form.cardId) || '';
    console.log('[edit-pronunciation] _loadEditPhonetic entered', {
      cardId: cardId || '(unknown)',
      text: String(text || '').trim() || '(empty)',
      hasController: Boolean(this.pronunciationController),
      isEdit: this.data.isEdit,
      isReadonlyDetailMode: this.data.isReadonlyDetailMode
    });

    if (!this.pronunciationController || !this.data.isEdit || this.data.isReadonlyDetailMode) {
      console.log('[edit-pronunciation] _loadEditPhonetic blocked by guard');
      return;
    }

    var normalizedText = String(text || '').trim();
    // Use a dedicated request ID to prevent stale responses
    this._editPhoneticRequestId += 1;
    var requestId = this._editPhoneticRequestId;

    if (!normalizedText) {
      console.log('[edit-pronunciation] _loadEditPhonetic: empty text, clearing');
      this.setData({
        editPhoneticDisplay: '',
        editPhoneticLoaded: true,
        editPhoneticLoading: false,
        editPronunciationAvailable: false,
        editPronunciationText: ''
      });
      return;
    }

    console.log('[edit-pronunciation] lexical request', { text: normalizedText, requestId: requestId });

    this.setData({
      editPhoneticLoading: true,
      editPhoneticLoaded: false,
      editPhoneticDisplay: '',
      editPronunciationAvailable: false,
      editPronunciationText: normalizedText
    });

    console.log('[edit-pronunciation] after setData (before API)', {
      editPronunciationText: this.data.editPronunciationText,
      editPronunciationLoading: this.data.editPronunciationLoading,
      editPronunciationAvailable: this.data.editPronunciationAvailable
    });

    // Use the controller's internal load (but map to edit-prefixed data keys)
    // We need to directly call getLexicalInfo to get edit-specific keys
    var self = this;
    var getLexicalInfo = require('../../utils/apiClient').getLexicalInfo;
    var resolvePhoneticDisplay = require('../../utils/pronunciation').resolvePhoneticDisplay;

    getLexicalInfo(normalizedText).then(function (info) {
      if (requestId !== self._editPhoneticRequestId) {
        console.log('[edit-pronunciation] lexical response stale, requestId:', requestId, 'current:', self._editPhoneticRequestId);
        return;
      }

      console.log('[edit-pronunciation] lexical response', {
        text: (info && info.text) || normalizedText,
        phonetic: (info && info.phonetic) || '(none)',
        wordPhonetics: (info && info.wordPhonetics) ? JSON.stringify(info.wordPhonetics) : '(none)',
        pronunciationAvailable: Boolean(info && info.pronunciationAvailable)
      });

      var resolved = resolvePhoneticDisplay(info);
      self.setData({
        editPhoneticDisplay: resolved.phoneticDisplay,
        editPhoneticLoaded: true,
        editPhoneticLoading: false,
        editPronunciationAvailable: Boolean(info && info.pronunciationAvailable),
        editPronunciationText: (info && info.text) || normalizedText
      });

      console.log('[edit-pronunciation] after API success setData', {
        editPhoneticDisplay: self.data.editPhoneticDisplay || '(empty)',
        editPronunciationText: self.data.editPronunciationText,
        editPronunciationAvailable: self.data.editPronunciationAvailable
      });
    }).catch(function (err) {
      if (requestId !== self._editPhoneticRequestId) {
        console.log('[edit-pronunciation] lexical error stale, requestId:', requestId);
        return;
      }

      console.log('[edit-pronunciation] lexical error', String(err && err.errMsg || err || 'unknown'));
      self.setData({
        editPhoneticDisplay: '',
        editPhoneticLoaded: true,
        editPhoneticLoading: false,
        editPronunciationAvailable: false,
        editPronunciationText: normalizedText
      });

      console.log('[edit-pronunciation] after API error setData', {
        editPronunciationText: self.data.editPronunciationText,
        editPronunciationAvailable: self.data.editPronunciationAvailable
      });
    });
  },

  _scheduleEditPhonetic(text) {
    if (!this.data.isEdit || this.data.isReadonlyDetailMode) return;

    if (this._editPhoneticTimer) {
      clearTimeout(this._editPhoneticTimer);
      this._editPhoneticTimer = null;
    }

    // Clear old phonetics immediately
    var normalizedText = String(text || '').trim();
    console.log('[edit-pronunciation] _scheduleEditPhonetic', { text: normalizedText || '(empty)' });

    if (!normalizedText) {
      this.setData({
        editPhoneticDisplay: '',
        editPhoneticLoaded: false,
        editPhoneticLoading: false,
        editPronunciationAvailable: false,
        editPronunciationText: ''
      });
      console.log('[edit-pronunciation] _scheduleEditPhonetic: text empty, button now disabled');
      return;
    }

    // Clear old display while waiting for debounce, but update text immediately
    this.setData({
      editPhoneticDisplay: '',
      editPhoneticLoaded: false,
      editPhoneticLoading: true,
      editPronunciationText: normalizedText
    });

    var self = this;
    this._editPhoneticTimer = setTimeout(function () {
      self._editPhoneticTimer = null;
      self._loadEditPhonetic(text);
    }, 400);
  },

  onEditPronunciationTap() {
    var text = this._getCurrentEditEnglish();
    var cardId = this.data.cardId || (this.data.form && this.data.form.cardId) || '';
    var voice = this.data.editPronunciationVoice || DEFAULT_VOICE;

    console.log('[edit-pronunciation] tap entered', {
      cardId: cardId || '(unknown)',
      text: text || '(empty)',
      editPronunciationText: this.data.editPronunciationText || '(empty)',
      formEnglishText: (this.data.form && this.data.form.englishText) || '(empty)',
      editPronunciationAvailable: this.data.editPronunciationAvailable,
      editPronunciationLoading: this.data.editPronunciationLoading,
      editPronunciationPlaying: this.data.editPronunciationPlaying,
      voice: voice
    });

    if (!this.pronunciationController) {
      console.log('[edit-pronunciation] tap blocked: no pronunciationController');
      return;
    }
    if (!text) {
      console.log('[edit-pronunciation] tap blocked: text is empty');
      return;
    }

    console.log('[edit-pronunciation] proceeding to play', { text: text, voice: voice });

    // ---- loading safety timeout: prevent permanent "加载中" ----
    var self = this;
    if (this._editPronunciationSafetyTimer) {
      clearTimeout(this._editPronunciationSafetyTimer);
      this._editPronunciationSafetyTimer = null;
    }
    this._editPronunciationSafetyTimer = setTimeout(function () {
      self._editPronunciationSafetyTimer = null;
      if (self.data.editPronunciationLoading) {
        console.log('[edit-pronunciation] SAFETY: loading timeout, forcing reset');
        self.setData({ editPronunciationLoading: false, editPronunciationPlaying: false });
        wx.showToast({ title: '发音加载超时，请重试', icon: 'none' });
      }
    }, 15000);
    // --------------------------------------------------------

    try {
      var downloadPronunciationAudio = require('../../utils/apiClient').downloadPronunciationAudio;
      var audioContext = null;

      // Create a temporary audio context for edit playback
      if (!this._editAudioContext) {
        console.log('[edit-pronunciation] creating new _editAudioContext');
        this._editAudioContext = wx.createInnerAudioContext();
        this._editAudioContext.obeyMuteSwitch = false;

        this._editAudioContext.onPlay(function () {
          console.log('[edit-pronunciation] audio onPlay fired');
          if (self._editPronunciationSafetyTimer) {
            clearTimeout(self._editPronunciationSafetyTimer);
            self._editPronunciationSafetyTimer = null;
          }
          self.setData({ editPronunciationLoading: false, editPronunciationPlaying: true });
        });
        this._editAudioContext.onEnded(function () {
          console.log('[edit-pronunciation] audio onEnded fired');
          if (self._editPronunciationSafetyTimer) {
            clearTimeout(self._editPronunciationSafetyTimer);
            self._editPronunciationSafetyTimer = null;
          }
          self.setData({ editPronunciationLoading: false, editPronunciationPlaying: false });
        });
        this._editAudioContext.onStop(function () {
          console.log('[edit-pronunciation] audio onStop fired');
          if (self._editPronunciationSafetyTimer) {
            clearTimeout(self._editPronunciationSafetyTimer);
            self._editPronunciationSafetyTimer = null;
          }
          self.setData({ editPronunciationLoading: false, editPronunciationPlaying: false });
        });
        this._editAudioContext.onError(function (err) {
          console.log('[edit-pronunciation] audio onError fired', String(err && err.errMsg || err || 'unknown'));
          if (self._editPronunciationSafetyTimer) {
            clearTimeout(self._editPronunciationSafetyTimer);
            self._editPronunciationSafetyTimer = null;
          }
          self.setData({ editPronunciationLoading: false, editPronunciationPlaying: false });
          wx.showToast({ title: '本地发音暂不可用', icon: 'none' });
        });
      }

      audioContext = this._editAudioContext;

      if (this.data.editPronunciationPlaying || this.data.editPronunciationLoading) {
        console.log('[edit-pronunciation] stopping previous playback');
        try { audioContext.stop(); } catch (_) {}
      }

      this.setData({ editPronunciationLoading: true, editPronunciationPlaying: false });
      downloadPronunciationAudio(text, voice)
        .then(function (tempFilePath) {
          audioContext.src = tempFilePath;
          audioContext.play();
        })
        .catch(function (err) {
          console.log('[edit-pronunciation] audio download failed', String(err && err.errMsg || err || 'unknown'));
          if (self._editPronunciationSafetyTimer) {
            clearTimeout(self._editPronunciationSafetyTimer);
            self._editPronunciationSafetyTimer = null;
          }
          self.setData({ editPronunciationLoading: false, editPronunciationPlaying: false });
          wx.showToast({ title: '本地发音暂不可用', icon: 'none' });
        });
    } catch (err) {
      console.log('[edit-pronunciation] exception during playback setup', String(err && err.message || err));
      if (this._editPronunciationSafetyTimer) {
        clearTimeout(this._editPronunciationSafetyTimer);
        this._editPronunciationSafetyTimer = null;
      }
      this.setData({ editPronunciationLoading: false, editPronunciationPlaying: false });
      wx.showToast({ title: '本地发音暂不可用', icon: 'none' });
    }
  },

  onEditVoiceSwitchMale() {
    if (!this.pronunciationController) return;
    this.pronunciationController.setVoice('male');
    this.setData({ editPronunciationVoice: 'male' });
  },

  onEditVoiceSwitchFemale() {
    if (!this.pronunciationController) return;
    this.pronunciationController.setVoice('female');
    this.setData({ editPronunciationVoice: 'female' });
  },

  _destroyEditAudio() {
    this._editPhoneticRequestId += 1;
    if (this._editPhoneticTimer) {
      clearTimeout(this._editPhoneticTimer);
      this._editPhoneticTimer = null;
    }
    if (this._editPronunciationSafetyTimer) {
      clearTimeout(this._editPronunciationSafetyTimer);
      this._editPronunciationSafetyTimer = null;
    }
    if (this._editAudioContext) {
      try { this._editAudioContext.stop(); } catch (_) {}
      try { this._editAudioContext.destroy(); } catch (_) {}
      this._editAudioContext = null;
    }
    if (this._notesExampleAudioContext) {
      try { this._notesExampleAudioContext.stop(); } catch (_) {}
      try { this._notesExampleAudioContext.destroy(); } catch (_) {}
      this._notesExampleAudioContext = null;
    }
  },

  onUnderstandingFocus() {},

  onUnderstandingBlur(event) {
    if (this.data.isReadonlyDetailMode) return;
    this.setData({
      'form.myUnderstanding': event.detail.value || ''
    });
  },

  computeReferenceApplied(suggestionOverride, exampleSentenceOverride, exampleTranslationOverride) {
    const understanding = normalizeEnglishText(
      arguments.length >= 1 ? (suggestionOverride || '') : (this.data.understandingSuggestion || this.data.suggestionText)
    );
    const exampleSentence = normalizePlainText(
      arguments.length >= 2 ? (exampleSentenceOverride || '') : this.data.aiExampleSentence
    );

    const currentUnderstanding = normalizeEnglishText(this.data.form.myUnderstanding || '');
    const currentNotes = this.data.form.notes || '';

    const understandingOk = !understanding || currentUnderstanding === understanding;

    let exampleOk = true;
    if (exampleSentence) {
      exampleOk = currentNotes.includes(exampleSentence);
    }

    return understandingOk && exampleOk;
  },

  refreshReferenceApplied() {
    this.setData({ referenceApplied: this.computeReferenceApplied() });
  },

  adoptAllReference() {
    if (this.data.isReadonlyDetailMode) return;
    if (this.data.translating) return;

    const understanding = normalizeEnglishText(this.data.understandingSuggestion || this.data.suggestionText);
    const exampleSentence = normalizePlainText(this.data.aiExampleSentence);
    const exampleTranslation = normalizePlainText(this.data.aiExampleTranslation);

    const currentUnderstanding = normalizeEnglishText(this.data.form.myUnderstanding || '');
    const currentNotes = this.data.form.notes || '';

    const nextData = {};

    // Fill understanding if not already set
    if (understanding && currentUnderstanding !== understanding) {
      nextData['form.myUnderstanding'] = understanding;
    }

    // Fill note with example (no labels)
    if (exampleSentence && !currentNotes.includes(exampleSentence)) {
      const exampleNote = exampleTranslation
        ? `${exampleSentence}\n${exampleTranslation}`
        : exampleSentence;
      const newNotes = currentNotes ? `${currentNotes}\n\n${exampleNote}` : exampleNote;
      nextData['form.notes'] = newNotes;
    }

    // Only setData if there's something to fill
    if (Object.keys(nextData).length > 0) {
      this.setData(nextData, () => {
        this.refreshReferenceApplied();
      });
    } else {
      this.refreshReferenceApplied();
    }
  },


  onNotesInput(event) {
    if (this.data.isReadonlyDetailMode) return;
    this.setData({
      'form.notes': event.detail.value,
      notesExampleAvailable: this.computeNotesExampleAvailable(
        this.data.aiExampleSentence,
        event.detail.value
      )
    });
    this.refreshReferenceApplied();
  },

  computeNotesExampleAvailable(exampleSentence, notes) {
    return Boolean(normalizePlainText(exampleSentence) || extractEnglishExampleFromNotes(notes));
  },

  getExampleSentenceForPronunciation() {
    const fromAnalysis = normalizePlainText(this.data.aiExampleSentence);
    if (fromAnalysis) return fromAnalysis;
    return extractEnglishExampleFromNotes(this.data.form.notes || '');
  },

  onNotesExamplePronunciationTap() {
    const exampleSentence = this.getExampleSentenceForPronunciation();
    if (!exampleSentence) {
      wx.showToast({ title: '暂无英文例句可发音', icon: 'none' });
      return;
    }

    const voice = this.data.editPronunciationVoice || getStoredVoice() || DEFAULT_VOICE;
    const self = this;
    const downloadPronunciationAudio = require('../../utils/apiClient').downloadPronunciationAudio;

    // Reuse the same download → local temp file → InnerAudioContext pattern as the
    // word pronunciation (onEditPronunciationTap). No second TTS, no direct URL playback.
    if (!this._notesExampleAudioContext) {
      this._notesExampleAudioContext = wx.createInnerAudioContext();
      this._notesExampleAudioContext.obeyMuteSwitch = false;
      this._notesExampleAudioContext.onPlay(function () {
        self.setData({ notesExampleLoading: false, notesExamplePlaying: true });
      });
      this._notesExampleAudioContext.onEnded(function () {
        self.setData({ notesExampleLoading: false, notesExamplePlaying: false });
      });
      this._notesExampleAudioContext.onStop(function () {
        self.setData({ notesExampleLoading: false, notesExamplePlaying: false });
      });
      this._notesExampleAudioContext.onError(function () {
        self.setData({ notesExampleLoading: false, notesExamplePlaying: false });
        wx.showToast({ title: '本地发音暂不可用', icon: 'none' });
      });
    }

    const audioContext = this._notesExampleAudioContext;
    if (this.data.notesExamplePlaying || this.data.notesExampleLoading) {
      try { audioContext.stop(); } catch (_) {}
    }

    this.setData({ notesExampleLoading: true, notesExamplePlaying: false });
    downloadPronunciationAudio(exampleSentence, voice)
      .then(function (tempFilePath) {
        audioContext.src = tempFilePath;
        audioContext.play();
      })
      .catch(function () {
        self.setData({ notesExampleLoading: false, notesExamplePlaying: false });
        wx.showToast({ title: '本地发音暂不可用', icon: 'none' });
      });
  },

  onWhereEncounteredInput(event) {
    if (this.data.isReadonlyDetailMode) return;
    this.setData({
      'form.whereEncountered': event.detail.value
    });
  },

  onSourceSuggestionTap(event) {
    if (this.data.isReadonlyDetailMode) return;
    const value = String(event.currentTarget.dataset.value || '');
    if (!value) return;
    this.setData({ 'form.whereEncountered': value });
  },


  resetFormForContinuousAdd(savedForm) {
    this.invalidatePendingAnalysis();
    this.clearAnalysisTimers();

    const nextForm = {
      ...createEmptyForm(),
      category: savedForm.category,
      examScene: savedForm.examScene,
      examModule: savedForm.examModule,
      englishText: '',
      whereEncountered: normalizePlainText(savedForm.whereEncountered || ''),
      myUnderstanding: '',
      notes: ''
    };

    this.setData({
      categoryIndex: Math.max(CARD_CATEGORIES.indexOf(nextForm.category), 0),
      inheritedContextText: '',
      hasUserChangedCategory: false,
      englishValidationMessage: '',
      englishValidationType: 'hint',
      isValidatingEnglish: false,
      suggestionText: '',
      suggestionSourceText: '',
      showSuggestion: false,
      translating: false,
      autoFocusUnderstanding: false,
      isUnderstandingFocused: false,
      showNotesField: false,
      validationResult: null,
      understandingSuggestion: '',
      understandingVisible: false,
      validateLoading: false,
      suggestLoading: false,
      latestEnglishForSuggest: '',
      aiExampleSentence: '',
      aiExampleTranslation: '',
      aiSynonymsDisplay: '',
      aiSimilarPhrasesDisplay: '',
      aiExpressionTypeLabel: '',
      aiAlternativeMeanings: [],
      aiUsageScenario: '',
      aiDialogueEnglish: [],
      aiDialogueChinese: [],
      aiRelatedDisplay: '',
      notesExampleAvailable: false,
      referenceApplied: false,
      isLeavingPage: false,
      isSaving: false,
      recentSources: buildRecentWhereEncounteredOptions(),
      form: nextForm,
    });
  },

  async saveCard(nextForm, saveMode) {
    const { isEdit, cardId } = this.data;
    const shouldContinue = saveMode === 'continue' && !isEdit;

    let savedCard = null;
    let pendingSync = false;

    try {
      if (isEdit) {
        savedCard = await updateCard(cardId, nextForm);
      } else {
        savedCard = await addCard(nextForm);
        saveInputContext({
          examScene: nextForm.examScene,
          examModule: nextForm.examModule
        });
      }
      saveLastEncounterContext(nextForm.whereEncountered);
      pendingSync = savedCard && savedCard.backend_sync_status === 'pending';
    } catch (error) {
      wx.showToast({
        title: isEdit ? '更新失败' : '保存失败',
        icon: 'none'
      });
      return false;
    }

    if (shouldContinue) {
      wx.showToast({
        title: '已保存',
        icon: 'success'
      });

      this.resetFormForContinuousAdd(nextForm);
      return savedCard;
    }

    this.clearTransientFeedbackBeforeLeave();

    // Signal homepage that session may need restart (new cards added)
    try { wx.setStorageSync('reviewSessionNeedsRestart', true); } catch (e) { /* ignore */ }

    wx.showToast({
      title: isEdit ? '已更新' : '已保存',
      icon: 'success'
    });

    setTimeout(() => {
      if (isFromReviewPage(this.pageOptions)) {
        wx.navigateBack({ delta: 1 });
        return;
      }

      if (isFromTodayReviewedPage(this.pageOptions)) {
        try { wx.setStorageSync('todayReviewedNeedsRefresh', true); } catch (e) { /* ignore */ }
        wx.navigateBack({ delta: 1 });
        return;
      }

      if (isFromHistoryPage(this.pageOptions)) {
        wx.navigateBack({ delta: 1 });
        return;
      }

      wx.navigateBack({ delta: 1 });
    }, 100);

    return savedCard;
  },

  async submitCard(saveMode) {
    if (this.data.isReadonlyDetailMode) return;

    if (this.data.isSaving) {
      return;
    }

    const { form, isEdit, cardId } = this.data;

    this.setData({
      isSaving: true,
      validateLoading: true,
      isValidatingEnglish: true,
      englishValidationMessage: '正在检查英文内容...',
      englishValidationType: 'hint'
    });

    try {
      // 1. 表单校验
      const localResult = getLocalValidationResult(form.englishText, form.category);

      if (localResult.errors.length > 0) {
        this.setData({
          englishValidationMessage: localResult.errors[0],
          englishValidationType: 'error'
        });
        this.scrollToEnglishSection();
        return;
      }

      // 2. 检查编辑模式是否复用已有分析结果
      let currentCard = null;

      if (isEdit && cardId) {
        try {
          currentCard = await getCardById(cardId);
        } catch (error) {
          currentCard = null;
        }
      }

      const nextAnalyzeCacheKey = this.makeAnalyzeCacheKey(
        localResult.normalizedText,
        form.category
      );

      const currentText = normalizeEnglishText(currentCard && currentCard.englishText);
      const currentCategory = currentCard && currentCard.category ? currentCard.category : '';
      const currentAnalyzeCacheKey = currentCard && currentCard.analyzeCacheKey
        ? currentCard.analyzeCacheKey
        : '';

      const isSameAnalyzedContent = (
        currentCard &&
        currentCard.analysisStatus === 'done' &&
        currentText === localResult.normalizedText &&
        currentCategory === form.category &&
        currentAnalyzeCacheKey === nextAnalyzeCacheKey
      );

      // 3. 组装 nextForm（不含 await analyzeEnglish）
      let nextForm;
      let shouldBackgroundAnalyze = false;

      if (isSameAnalyzedContent) {
        // 编辑模式且内容未变：保留原 analysisStatus 和原分析结果，不触发后台分析
        nextForm = {
          ...form,
          englishText: localResult.normalizedText,
          analysisStatus: currentCard.analysisStatus,
          analysisWarnings: currentCard.analysisWarnings || [],
          analysisErrors: currentCard.analysisErrors || [],
          analysisSource: currentCard.analysisSource || '',
          understandingSource: currentCard.understandingSource || '',
          analyzeCacheKey: currentAnalyzeCacheKey,
          analyzedAt: currentCard.analyzedAt || ''
        };
      } else {
        // 新增卡片或内容变化：analysisStatus = pending，保存后触发后台分析
        nextForm = {
          ...form,
          englishText: localResult.normalizedText,
          analysisStatus: 'pending',
          analysisWarnings: [],
          analysisErrors: [],
          analysisSource: '',
          understandingSource: normalizeUnderstandingSource('local', !!form.myUnderstanding),
          analyzeCacheKey: nextAnalyzeCacheKey,
          analyzedAt: ''
        };
        shouldBackgroundAnalyze = true;
      }

      // 4. 先保存卡片（不再 await analyzeEnglish）
      const savedCard = await this.saveCard(nextForm, saveMode);

      // 5. 保存成功后 fire-and-forget 触发后台分析
      if (shouldBackgroundAnalyze && savedCard && savedCard.id) {
        const analysisTextSnapshot = localResult.normalizedText;
        const analysisCategory = form.category;

        this.runBackgroundEnglishCheck(
          savedCard.id,
          analysisTextSnapshot,
          analysisCategory
        ).catch(function (err) {
          console.warn('[add-save] background analyze fire-and-forget error:', err);
        });
      }
    } catch (error) {
      console.error('submitCard failed:', error);
      wx.showToast({
        title: '保存失败，请重试',
        icon: 'none'
      });
    } finally {
      this.setData({
        isSaving: false,
        validateLoading: false,
        isValidatingEnglish: false
      });
    }
  },

  async runBackgroundEnglishCheck(cardId, analysisTextSnapshot, analysisCategory) {
    if (!cardId) {
      console.warn('[add-save] skip background analyze: missing saved card id');
      return;
    }

    const sourceText = normalizeEnglishText(analysisTextSnapshot);
    const sourceCategory = analysisCategory || '单词';

    if (!sourceText) {
      return;
    }

    const safeAnalyze = this.safeAnalyzeEnglish.bind(this);
    const makeKey = this.makeAnalyzeCacheKey.bind(this);

    try {
      const result = await safeAnalyze(sourceText, sourceCategory);

      // 读取最新卡片 — snapshot guard + 合并基底
      const latestCard = await getCardById(cardId);
      if (!latestCard) {
        console.warn('[add-save] background analyze skipped: card not found', cardId);
        return;
      }

      const latestText = normalizeEnglishText(latestCard.englishText);

      // snapshot guard：用户已改英文内容，丢弃本次旧分析结果
      if (latestText !== sourceText) {
        console.warn('[add-save] analysis discarded due to content change', cardId);
        return;
      }

      let analysisLocalPatch;

      if (result.ok) {
        const data = result.data;
        const validation = data.validation || {};
        const understanding = data.understanding || {};

        const warnings = Array.isArray(validation.warnings) ? validation.warnings : [];
        const errors = Array.isArray(validation.errors) ? validation.errors : [];

        analysisLocalPatch = {
          analysisStatus: 'done',
          analysisWarnings: warnings,
          analysisErrors: errors,
          analysisSource: data.fromCache ? 'cache' : 'analyzeEnglish',
          understandingSource: normalizeUnderstandingSource(understanding.source, !!latestCard.myUnderstanding),
          analyzeCacheKey: makeKey(sourceText, sourceCategory),
          analyzedAt: new Date().toISOString()
        };
      } else {
        // A transient failure (network down / AI slot busy) must not be
        // persisted as a permanent "failed" analysis status. Keep it "pending"
        // so it re-evaluates on the next edit/save, without auto-retrying
        // infinitely here. A real AI failure (Qwen down) stays "failed".
        const failureKind = result.error && result.error.failureKind;
        const isTransient = failureKind === 'network' || failureKind === 'busy';
        analysisLocalPatch = {
          analysisStatus: isTransient ? 'pending' : 'failed',
          analysisWarnings: [],
          analysisErrors: [],
          analysisSource: 'analyzeEnglish',
          analyzeCacheKey: makeKey(sourceText, sourceCategory),
          analyzedAt: new Date().toISOString()
        };
      }

      // 只 PATCH 分析字段到后端
      const analysisBackendPatch = {
        analysis_status: analysisLocalPatch.analysisStatus,
        analysis_level: getBackendAnalysisLevel(analysisLocalPatch),
        analysis_messages: buildBackendAnalysisMessages(analysisLocalPatch)
      };

      try {
        await updateBackendCard(cardId, analysisBackendPatch);
      } catch (backendPatchError) {
        console.warn('[add-save] backend analysis patch failed', backendPatchError);
      }

      // 通过 updateCard 同步本地 cardsCache
      const mergedForm = { ...latestCard, ...analysisLocalPatch };
      await updateCard(cardId, mergedForm);
    } catch (error) {
      console.error('[add-save] background analyze failed:', error);

      try {
        const latestCard = await getCardById(cardId);
        if (!latestCard) return;

        const latestText = normalizeEnglishText(latestCard.englishText);
        if (latestText !== sourceText) {
          console.warn('[add-save] analysis discarded due to content change', cardId);
          return;
        }

        const failedLocalPatch = {
          analysisStatus: 'failed',
          analysisWarnings: [],
          analysisErrors: [],
          analysisSource: 'analyzeEnglish',
          analyzedAt: new Date().toISOString()
        };

        const failedBackendPatch = {
          analysis_status: 'failed',
          analysis_level: getBackendAnalysisLevel(failedLocalPatch),
          analysis_messages: buildBackendAnalysisMessages(failedLocalPatch)
        };

        try {
          await updateBackendCard(cardId, failedBackendPatch);
        } catch (backendPatchError) {
          console.warn('[add-save] backend failed patch error', backendPatchError);
        }

        const mergedForm = { ...latestCard, ...failedLocalPatch };
        await updateCard(cardId, mergedForm);
      } catch (updateError) {
        console.error('[add-save] mark analysis failed failed:', updateError);
      }
    }
  },

  async handleSubmitAndBack() {
    if (this.data.isReadonlyDetailMode) return;
    await this.submitCard('back');
  },
  
  async handleSubmitAndContinue() {
    if (this.data.isReadonlyDetailMode) return;
    await this.submitCard('continue');
  },

  handleDelete() {
    if (this.data.isReadonlyDetailMode) return;
    const { isEdit, cardId } = this.data;

    if (!isEdit) {
      return;
    }

    wx.showModal({
      title: '删除卡片',
      content: '确定删除这张英语卡片吗？',
      success: async (result) => {
        if (!result.confirm) {
          return;
        }

        try {
          await deleteCard(cardId);
        } catch (error) {
          wx.showToast({
            title: '删除失败',
            icon: 'none'
          });
          return;
        }

        refreshPreviousPage();

        wx.showToast({
          title: '已删除',
          icon: 'success'
        });

        setTimeout(() => {
          wx.navigateBack({ delta: 1 });
        }, 800);
      }
    });
  }
});
