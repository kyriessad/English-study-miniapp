const {
  addCard,
  getCardById,
  updateCard,
  deleteCard,
  updateBackendCardSyncState,
  DEFAULT_EXAM_SCENE,
  DEFAULT_EXAM_MODULE
} = require('../../utils/cardStorageFacade');

const { updateBackendCard } = require('../../utils/apiClient');

const {
  CARD_CATEGORIES,
  EXAM_SCENE_OPTIONS,
  EXAM_MODULE_OPTIONS
} = require('../../utils/cardOptions');
const {
  getInputContext,
  saveInputContext
} = require('../../utils/inputContext');
const PAGE_ANIMATION_SAFE_DELAY = 0;

const ANALYZE_CACHE_STORAGE_KEY = 'englishAnalyzeCache_v2';
const ANALYZE_CACHE_MAX_ITEMS = 200;
const ANALYZE_CACHE_MAX_AGE = 1000 * 60 * 60 * 24 * 30; // 30 天

const BACKEND_CARD_TYPE_MAP = {
  '单词': 'word',
  '短语': 'phrase',
  '句子': 'sentence'
};

const BACKEND_ANALYSIS_STATUSES = ['pending', 'done', 'failed'];
const BACKEND_UNDERSTANDING_SOURCES = ['local', 'machine', 'ai', 'user'];






function normalizeEnglishText(text) {
  return String(text || '')
    .replace(/[‘’]/g, '\'')
    .replace(/[“”]/g, '"')
    .replace(/[‐-‒–—―]/g, '-')
    .replace(/\u00A0/g, ' ')
    .trim();
}

function normalizePlainText(text) {
  return String(text || '').trim();
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
  if (['tencent', 'translation', 'translate', 'mt', 'machine_translation'].includes(normalized)) {
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

  const words = getNormalizedWordList(normalizedText);

  if (/[.!?]$/.test(normalizedText)) {
    return '句子';
  }

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

  // 机器翻译已经给出有效中文参考时，隐藏“词典未收录/未识别”类提醒
  return warningList.filter((item) => !isDictionaryUnrecognizedWarning(item));
}

function createEmptyForm() {
  return {
    category: '单词',
    examScene: DEFAULT_EXAM_SCENE,
    examModule: DEFAULT_EXAM_MODULE,
    englishText: '',
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

  if (!normalizedText) {
    errors.push('英文内容为空');
    return { normalizedText, errors, warnings, info, words: [] };
  }

  const words = getNormalizedWordList(normalizedText);

  // 前端只做最低限度判断：必须包含英文字母
  if (!hasLatinLetter(normalizedText)) {
    errors.push('英文内容里至少要包含英文字母。');
  }

  // 类别硬限制只保留最明显的情况
  if (category === '单词' && words.length !== 1) {
    errors.push('卡片类别是“单词”时，英文内容只能填写一个英文单词。');
  }

  if (category === '短语' && words.length < 2) {
    errors.push('卡片类别是“短语”时，至少需要两个英文单词。');
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
    examSceneOptions: EXAM_SCENE_OPTIONS,
    examModuleOptions: EXAM_MODULE_OPTIONS,
    categoryIndex: 0,
    examSceneIndex: EXAM_SCENE_OPTIONS.length - 1,
    examModuleIndex: EXAM_MODULE_OPTIONS.length - 1,
    inheritedContextText: '',
    defaultUnderstandingPlaceholder: '写下你自己的理解、翻译或拆解，不求标准，但要对自己有帮助',
    englishValidationMessage: '正在检查当前内容...',
    englishValidationType: 'hint',
    isValidatingEnglish: false,
    suggestionText: '',
    suggestionSourceText: '',
    showSuggestion: false,
    translating: false,
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




  },

  async callAnalyzeEnglish(englishText, category, options = {}) {
    const text = normalizeEnglishText(englishText);
    const useCache = options.useCache !== false;
    const cacheKey = this.makeAnalyzeCacheKey(text, category);

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
        return {
          ...cached,
          fromCache: true,
          cacheKey
        };
      }
    }

    if (!wx.cloud) {
      return {
        ok: false,
        validation: {
          errors: [],
          warnings: ['网络不可用，暂未完成增强分析。']
        },
        understanding: {
          candidate: '',
          source: 'local'
        },
        cacheKey
      };
    }

    try {
      const response = await wx.cloud.callFunction({
        name: 'analyzeEnglish',
        data: {
          text,
          category,
          words: getNormalizedWordList(text),
          cacheKey
        }
      });

      const result = response && response.result ? response.result : {};

      const normalizedResult = {
        ...result,
        cacheKey
      };

      // 归一化云函数返回的 understanding.source，防止 tencent 等供应商名透传到后端
      if (normalizedResult.understanding && normalizedResult.understanding.source) {
        normalizedResult.understanding = {
          ...normalizedResult.understanding,
          source: normalizeUnderstandingSource(normalizedResult.understanding.source, false)
        };
      }

      if (normalizedResult.ok !== false) {
        this.setAnalyzeCacheItem(cacheKey, normalizedResult);
      }

      return normalizedResult;
    } catch (error) {
      console.error('analyzeEnglish 调用失败:', error);

      return {
        ok: false,
        validation: {
          errors: [],
          warnings: ['请检查网络，可先保存。']
        },
        understanding: {
          candidate: '',
          source: 'local'
        },
        cacheKey
      };
    }
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
  
    return item;
  },
  
  setAnalyzeCacheItem(cacheKey, result) {
    if (!cacheKey || !result || result.ok === false) {
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
      examSceneIndex: EXAM_SCENE_OPTIONS.length - 1,
      examModuleIndex: EXAM_MODULE_OPTIONS.length - 1,
      inheritedContextText: '',
      englishValidationMessage: '正在检查当前内容...',
      englishValidationType: 'hint',
      isValidatingEnglish: false,
      suggestionText: '',
      suggestionSourceText: '',
      showSuggestion: false,
      translating: false,
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
      isSaving: false

    };
  },

  getDefaultFormState() {
    const inputContext = getInputContext();
  
    return {
      cardId: '',
      categoryIndex: 0,
      examSceneIndex: Math.max(EXAM_SCENE_OPTIONS.indexOf(inputContext.examScene), 0),
      examModuleIndex: Math.max(EXAM_MODULE_OPTIONS.indexOf(inputContext.examModule), 0),
      inheritedContextText: '',
      hasUserChangedCategory: false,
      form: {
        ...createEmptyForm(),
        examScene: inputContext.examScene,
        examModule: inputContext.examModule
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
      examSceneIndex: Math.max(EXAM_SCENE_OPTIONS.indexOf(examScene), 0),
      examModuleIndex: Math.max(EXAM_MODULE_OPTIONS.indexOf(examModule), 0),
      inheritedContextText: '',
      showNotesField: Boolean(notes),
      form: {
        category,
        examScene,
        examModule,
        englishText: card.englishText || '',
        myUnderstanding: card.myUnderstanding || '',
        notes
      }
    };
  },

  onLoad(options) {
    this.pageOptions = options || {};
    this.suggestionCache = Object.create(null);
    this.englishValidationTimer = null;
    this.suggestionTimer = null;
    this.postRenderTimer = null;
    this.delayedLoadCardTimer = null;
    this.deferNonCriticalTimer = null;

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

    if (isEdit) {
      const app = getApp();
      const cachedCard = app.globalData && app.globalData.pendingEditCard;

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

    this.setData(initialData, () => {
      this.setNavigationTitle();

      const englishText = initialData.form && initialData.form.englishText
        ? initialData.form.englishText
        : '';
      const category = initialData.form && initialData.form.category
        ? initialData.form.category
        : '单词';

        if (englishText && !this.data.isReadonlyDetailMode) {
          setTimeout(() => {
            this.runInputAnalysis(englishText, category);
          }, 0);
        }
    });
  },

  onReady() {
    this.setData({
      deferNonCriticalReady: true
    });
  },

  onUnload() {
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

  scheduleSuggestionUpdate(englishText, category, delay) {
    if (this.suggestionTimer) {
      clearTimeout(this.suggestionTimer);
      this.suggestionTimer = null;
    }

    this.suggestionTimer = setTimeout(() => {
      this.suggestionTimer = null;
      this.runInputAnalysis(englishText, category);
    }, delay);
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
      validationResult: null
    });
  },

  clearTransientFeedbackBeforeLeave() {
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
      latestEnglishForSuggest: ''
    });
  },

  buildDisplayState({
    localErrors = [],
    cloudErrors = [],
    cloudWarnings = [],
    cloudInfo = [],
    onlineValidationUnavailable = false
  } = {}) {
    if (localErrors.length > 0) {
      return {
        displayMessage: localErrors[0],
        displayMessageType: 'error'
      }
    }
  
    if (cloudErrors.length > 0) {
      return {
        displayMessage: cloudErrors[0],
        displayMessageType: 'error'
      }
    }
  
    if (cloudWarnings.length > 0) {
      return {
        displayMessage: cloudWarnings[0],
        displayMessageType: 'warning'
      }
    }

    if (cloudInfo.length > 0) {
      return {
        displayMessage: cloudInfo[0],
        displayMessageType: 'warning'
      }
    }
  
    if (onlineValidationUnavailable) {
      return {
        displayMessage: '暂未发现明显问题，请检查您的网络，可先保存。',
        displayMessageType: 'hint'
      }
    }
  
    return {
      displayMessage: '检查通过',
      displayMessageType: 'success'
    }
  },

  async analyzeEnglishInput(text, category, {
    needSuggestion = true,
    needCloudValidation = true
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
    let cloudInfo = []
    let onlineValidationUnavailable = false
    let suggestion = ''
    let backendNormalizedText = normalizedText

    if ((needCloudValidation || needSuggestion) && localErrors.length === 0) {
      const analyzeResult = await this.callAnalyzeEnglish(normalizedText, category)

      const validation = analyzeResult.validation || {}
      const understanding = analyzeResult.understanding || {}
      backendNormalizedText = normalizeEnglishText(
        analyzeResult.normalizedText ||
        validation.normalizedText ||
        analyzeResult.text ||
        normalizedText
      )

      cloudErrors = Array.isArray(validation.errors) ? validation.errors : []

      cloudWarnings = prioritizeWarnings(
        filterWarningsByCategory(
          Array.isArray(validation.warnings) ? validation.warnings : [],
          category
        ),
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

    // 单词：词典未收录时，不用机器翻译来“证明”它有效。
    // 句子：允许生成机器翻译参考，但保留“部分词未识别”的 warning，提醒用户自行判断。
    // 短语：可以继续弱化词典未识别提醒，避免小短语频繁打扰。
    if (suggestion && category === '短语') {
      cloudWarnings = filterDictionaryWarningsWhenSuggestionWorks(cloudWarnings, suggestion)
    }

    const shouldShowSuggestion = !shouldBlockSuggestion && !!suggestion
    const canSave = !hasAnyError
    
    const displayState = this.buildDisplayState({
      localErrors,
      cloudErrors,
      cloudWarnings,
      cloudInfo,
      onlineValidationUnavailable
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
      displayMessage: displayState.displayMessage,
      displayMessageType: displayState.displayMessageType
    }
  },

  applyAnalysisToPage(analysis, sourceText) {
    if (this.data.isLeavingPage) {
      return
    }
  
    const normalizedText = normalizeEnglishText(sourceText)
    const currentEnglishText = String(
      this.data.form && this.data.form.englishText
        ? this.data.form.englishText
        : ''
    )
  
    const backendNormalizedText = normalizeEnglishText(
      analysis.backendNormalizedText ||
      normalizedText
    )
  
    const shouldApplyBackendNormalizedText =
      analysis.canSave &&
      backendNormalizedText &&
      backendNormalizedText !== currentEnglishText
  
    const nextData = {
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
      suggestionSourceText: shouldApplyBackendNormalizedText
        ? backendNormalizedText
        : normalizedText,
      showSuggestion: analysis.shouldShowSuggestion,
      understandingSuggestion: analysis.shouldShowSuggestion ? analysis.suggestion : '',
      understandingVisible: analysis.shouldShowSuggestion,
      translating: false,
      isValidatingEnglish: false,
      validateLoading: false,
      suggestLoading: false
    }
  
    // 后端检测完成后，把 auto-fix 后的英文写回输入框
    if (shouldApplyBackendNormalizedText) {
      nextData['form.englishText'] = backendNormalizedText
    }
  
    this.setData(nextData)
  },

  async runInputAnalysis(englishText, category) {
    const normalizedText = normalizeEnglishText(englishText)

    this.setData({
      latestEnglishForSuggest: normalizedText,
      translating: !!normalizedText,
      isValidatingEnglish: !!normalizedText,
      suggestLoading: !!normalizedText
    })

    if (!normalizedText) {
      this.clearSuggestion()
      this.setData({
        englishValidationMessage: '英文内容为空',
        englishValidationType: 'error',
        isValidatingEnglish: false,
        validateLoading: false,
        suggestLoading: false
      })
      return
    }

    const analysis = await this.analyzeEnglishInput(normalizedText, category, {
      needSuggestion: true,
      needCloudValidation: true
    })
    
    if (this.data.isLeavingPage) {
      return
    }
    
    if (normalizeEnglishText(this.data.form.englishText) !== normalizedText) {
      return
    }

    this.applyAnalysisToPage(analysis, normalizedText)
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

    if (this.data.isReadonlyDetailMode) {
      return;
    }

    const runHeavyTasks = () => {
      this.runInputAnalysis(englishText, category);
    };

    if (englishText) {
      runHeavyTasks();
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
  
    this.setData({
      categoryIndex,
      'form.category': category,
      hasUserChangedCategory: true,
      englishValidationMessage: '正在检查英文内容...',
      englishValidationType: 'hint',
      isValidatingEnglish: true
    });
  
    this.scheduleSuggestionUpdate(this.data.form.englishText, category, 200);
  },


  onExamSceneChange(event) {
    if (this.data.isReadonlyDetailMode) return;
    const examSceneIndex = Number(event.detail.value) || 0;
    const examScene = EXAM_SCENE_OPTIONS[examSceneIndex] || DEFAULT_EXAM_SCENE;

    this.setData({
      examSceneIndex,
      'form.examScene': examScene
    });
  },

  onExamModuleChange(event) {
    if (this.data.isReadonlyDetailMode) return;
    const examModuleIndex = Number(event.detail.value) || 0;
    const examModule = EXAM_MODULE_OPTIONS[examModuleIndex] || DEFAULT_EXAM_MODULE;

    this.setData({
      examModuleIndex,
      'form.examModule': examModule
    });
  },

  onEnglishInput(event) {
    if (this.data.isReadonlyDetailMode) return;
    const nextValue = event.detail.value;
    const normalizedNextText = normalizeEnglishText(nextValue);
  
    let categoryForAnalysis = this.data.form.category;
    const autoCategory = this.getAutoCategoryForEnglishText(normalizedNextText);
    const shouldAutoUpdateCategory = (
      !this.data.isEdit &&
      !this.data.hasUserChangedCategory &&
      autoCategory &&
      autoCategory !== this.data.form.category
    );
  
    const nextData = {
      'form.englishText': nextValue
    };
  
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
      nextData.translating = Boolean(normalizedNextText);
    }
  
    this.setData(nextData);
  
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
        englishValidationMessage: '英文内容为空',
        englishValidationType: 'error',
        isValidatingEnglish: false
      });
      return;
    }
  
    this.setData({
      englishValidationMessage: '正在检查英文内容...',
      englishValidationType: 'hint',
      isValidatingEnglish: true
    });
  
    this.scheduleSuggestionUpdate(nextValue, categoryForAnalysis, 500);
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

    this.runInputAnalysis(event.detail.value, this.data.form.category);
  },

  onUnderstandingInput(event) {
    if (this.data.isReadonlyDetailMode) return;
    this.setData({
      'form.myUnderstanding': event.detail.value
    });
  },

  onUnderstandingFocus() {},

  onUnderstandingBlur(event) {
    if (this.data.isReadonlyDetailMode) return;
    this.setData({
      'form.myUnderstanding': event.detail.value || ''
    });
  },

  adoptUnderstandingReference() {
    if (this.data.isReadonlyDetailMode) return;
    const suggestionText = normalizeEnglishText(
      this.data.understandingSuggestion || this.data.suggestionText
    )

    if (!suggestionText || this.data.translating) {
      return
    }

    this.setData({
      'form.myUnderstanding': suggestionText,
      showSuggestion: false,
      understandingVisible: false
    })
  },


  onNotesInput(event) {
    if (this.data.isReadonlyDetailMode) return;
    this.setData({
      'form.notes': event.detail.value
    });
  },


  resetFormForContinuousAdd(savedForm) {
    const nextForm = {
      ...createEmptyForm(),
      category: savedForm.category,
      examScene: savedForm.examScene,
      examModule: savedForm.examModule,
      englishText: '',
      myUnderstanding: '',
      notes: ''
    };

    this.setData({
      categoryIndex: Math.max(CARD_CATEGORIES.indexOf(nextForm.category), 0),
      examSceneIndex: Math.max(EXAM_SCENE_OPTIONS.indexOf(nextForm.examScene), 0),
      examModuleIndex: Math.max(EXAM_MODULE_OPTIONS.indexOf(nextForm.examModule), 0),
      inheritedContextText: '',
      hasUserChangedCategory: false,
      englishValidationMessage: '正在检查当前内容...',
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
      isLeavingPage: false,
      isSaving: false,
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
        title: pendingSync ? '已保存到本地，待同步' : '已保存到本地，继续新增',
        icon: pendingSync ? 'none' : 'success'
      });

      this.resetFormForContinuousAdd(nextForm);
      return savedCard;
    }

    this.clearTransientFeedbackBeforeLeave();

    // Signal homepage that session may need restart (new cards added)
    try { wx.setStorageSync('reviewSessionNeedsRestart', true); } catch (e) { /* ignore */ }

    wx.showToast({
      title: pendingSync
        ? (isEdit ? '已更新到本地，待同步' : '已保存到本地，待同步')
        : (isEdit ? '已更新到本地' : '已保存到本地'),
      icon: pendingSync ? 'none' : 'success'
    });

    setTimeout(() => {
      if (isFromReviewPage(this.pageOptions)) {
        const pages = getCurrentPages();
        const previousPage = pages[pages.length - 2];

        if (previousPage && typeof previousPage.applyEditedCardFromReview === 'function') {
          previousPage.applyEditedCardFromReview(this.data.cardId);
        }

        wx.navigateBack({ delta: 1 });
        return;
      }

      if (isFromTodayReviewedPage(this.pageOptions)) {
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
        analysisLocalPatch = {
          analysisStatus: 'failed',
          analysisWarnings: ['分析暂时失败，可稍后重试'],
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
          analysisWarnings: ['请检查网络，可先保存。'],
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
