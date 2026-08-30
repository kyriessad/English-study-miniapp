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
  validateEnglish,
  analyzeEnglishDirect,
  analyzeEnglishDirectStream,
  downloadDiagnosticTestAudio,
  getLastTtsRequestId,
  logTtsDiagnostic
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
const {
  buildValidationView,
  makeValidationKey,
  validationResponseFromCardError
} = require('../../utils/englishValidation');
const PAGE_ANIMATION_SAFE_DELAY = 0;
const ENGLISH_VALIDATION_DELAY_MS = 1000;
const LIGHT_VALIDATION_VISIBLE_MS = 5000;
const FORMAT_HINT_VISIBLE_MS = 2500;

const ANALYZE_CACHE_STORAGE_KEY = 'englishAnalyzeCache_v2';
const ANALYZE_CACHE_MAX_ITEMS = 200;
const ANALYZE_CACHE_MAX_AGE = 1000 * 60 * 60 * 24 * 30;
const STREAM_DIAGNOSTIC_VERSION = 'ai-stream-diag-20260824-1';

function audioState(audio) {
  if (!audio) {
    return {};
  }
  return {
    requestId: getLastTtsRequestId(),
    src: String(audio.src || ''),
    volume: Number(audio.volume),
    duration: Number(audio.duration),
    currentTime: Number(audio.currentTime),
    paused: Boolean(audio.paused)
  };
}

const LAST_ENCOUNTER_CONTEXT_KEY = 'englishCard.lastEncounterContext.v1';
const BACKEND_CARD_TYPE_MAP = {
  '单词': 'word',
  '短语': 'phrase',
  '句子': 'sentence'
};
const BACKEND_CATEGORY_FORM_MAP = {
  word: CARD_CATEGORIES[0],
  phrase: CARD_CATEGORIES[1],
  sentence: CARD_CATEGORIES[2]
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

  if (typeof result.normalize === 'function') {
    result = result.normalize('NFKC');
  }

  result = result.replace(/[\u2018\u2019\u201B\u2032`]/g, '\'');
  result = result.replace(/[\u201C\u201D\u201F\u2033]/g, '"');
  result = result.replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, '-');
  result = result.replace(/\u3002/g, '.');
  result = result.replace(/[\uFF0C\u3001]/g, ',');
  result = result.replace(/\uFF01/g, '!');
  result = result.replace(/\uFF1F/g, '?');
  result = result.replace(/\uFF1B/g, ';');
  result = result.replace(/\uFF1A/g, ':');

  result = result.replace(/\u00A0/g, ' ');
  result = result.replace(/\u3000/g, ' ');
  result = result.replace(/[\t\n\r]+/g, ' ');
  result = result.replace(/\s{2,}/g, ' ');
  result = result.replace(/\b([A-Za-z]+s)\s+'\s+(?=[A-Za-z])/g, "$1' ");
  result = result.replace(/\b([A-Za-z]+)\s*'\s+(s|m|t|ve|ll|re|d)\b/gi, "$1'$2");
  result = result.replace(/\b([A-Za-z]+)\s+'\s*(s|m|t|ve|ll|re|d)\b/gi, "$1'$2");
  result = result.replace(/,{2,}/g, ',');
  result = result.replace(/(?<!\.)\.\.(?!\.)/g, '.');
  result = result.replace(/\s+([,.;:?!)\]}])/g, '$1');
  result = result.replace(/([\[({])\s+/g, '$1');
  result = result.replace(/\s+([\])}])/g, '$1');
  result = result.replace(/([,;:])([A-Za-z0-9])/g, function(_, punctuation, nextChar, offset, source) {
    var previousChar = offset > 0 ? source.charAt(offset - 1) : '';
    if ((punctuation === ',' || punctuation === ':') && /\d/.test(previousChar) && /\d/.test(nextChar)) {
      return punctuation + nextChar;
    }
    return punctuation + ' ' + nextChar;
  });
  result = result.replace(/([.!?])([A-Z])/g, function(_, punctuation, nextChar, offset, source) {
    var previousChar = offset > 0 ? source.charAt(offset - 1) : '';
    if (punctuation === '.' && /[A-Z]/.test(previousChar) && /[A-Z]/.test(nextChar)) {
      return punctuation + nextChar;
    }
    return punctuation + ' ' + nextChar;
  });
  result = result.replace(/\s{2,}/g, ' ');

  return result.trim();
}

function normalizePlainText(text) {
  return String(text || '').trim();
}

/**
 * Format a synonym/similarPhrase pair list into a display string:
 * "gathering 鑱氫細  party 娲惧" (joined by two spaces, no punctuation).
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
 * Merge synonyms + similarPhrases into one "杩戜箟琛ㄨ揪" display list (max 5 items).
 */
function buildRelatedDisplay(synonyms, similarPhrases) {
  var list = []
    .concat(Array.isArray(synonyms) ? synonyms : [])
    .concat(Array.isArray(similarPhrases) ? similarPhrases : [])
    .slice(0, 5);

  return formatPairList(list);
}

/**
 * Extract the English example sentence from a "琛ュ厖澶囨敞" notes string.
 * The example is stored as "exampleSentence\nexampleTranslation" (written by
 * adoptAllReference), so we return the first English-looking line (letters +
 * space, no CJK) as a best-effort pronunciation target.
 */
function extractEnglishExampleFromNotes(notes) {
  const lines = String(notes || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    if (trimmed.indexOf(' ') > 0 && /[A-Za-z]/.test(trimmed) && !/[\u4E00-\u9FFF]/.test(trimmed)) {
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

  // 鍏蜂綋渚涘簲鍟?/ 鏈哄櫒缈昏瘧鍒悕缁熶竴褰掍竴鍖栦负 machine
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

function getBackendEnglishValidationMessage(error) {
  const detail = error && error.data && error.data.detail;
  if (!detail || typeof detail !== 'object' || detail.code !== 'invalid_english_content') {
    return '';
  }
  return normalizePlainText(detail.message || (Array.isArray(detail.errors) && detail.errors[0]) || '');
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
  // A-Za-z plus common Latin accented letters used by names and loanwords.
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
    // 鏈熬鏍囩偣鍙兘鏄彞鏈爣鐐癸紝涔熷彲鑳芥槸缂╁啓鍙ョ偣锛圲.S. / e.g. / Dr.锛?    // 鍘绘帀鏈熬鏍囩偣鍚庡鏋滄棤绌烘牸 鈫?鍗曡瘝/缂╁啓锛屽惁鍒?鈫?鍙ュ瓙
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
    text.includes('\u8bcd\u5178\u672a\u6536\u5f55') ||
    text.includes('\u90e8\u5206\u8bcd\u672a\u8bc6\u522b') ||
    text.includes('\u672a\u8bc6\u522b\u5230') ||
    text.includes('\u8bcd\u5178\u91cc\u6ca1\u6709\u627e\u5230') ||
    (text.includes('\u68c0\u67e5') && text.includes('\u4e13\u6709\u540d\u8bcd'))
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

  // 鏈哄櫒缈昏瘧宸茬粡缁欏嚭鏈夋晥涓枃鍙傝€冩椂锛岄殣钘忊€濊瘝鍏告湭鏀跺綍/鏈瘑鍒€濈被鎻愰啋
  return warningList.filter((item) => !isDictionaryUnrecognizedWarning(item));
}


// 鎷煎啓鎻愮ず鍙樻崲锛氭湁 correction 鈫?hint 鏂囨锛涙棤 correction 鈫?闅愯棌
var SPELL_WITH_CORRECTION_RE = /^\u62fc\u5199\u7591\u4f3c\u6709\u8bef\uff1a(.+?)\u3002\u4f60\u662f\u4e0d\u662f\u60f3\u5199\s*["\u201c](.+?)["\u201d]/;
var SPELL_NO_CORRECTION_RE = /^\u62fc\u5199\u7591\u4f3c\u6709\u8bef\uff1a/;

function transformSpellingWarning(w) {
  var m = SPELL_WITH_CORRECTION_RE.exec(w);
  if (m) {
    return { text: '\u4e5f\u53ef\u80fd\u662f\uff1a' + m[2] + '\u3002\u786e\u8ba4\u539f\u8bcd\u6ca1\u95ee\u9898\u7684\u8bdd\uff0c\u53ef\u4ee5\u7ee7\u7eed\u4fdd\u5b58', isHint: true };
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

  if (!normalizedText) {
    errors.push('英文内容为空');
    return { normalizedText, errors, warnings, info, words: [] };
  }

  return {
    normalizedText,
    errors,
    warnings,
    info,
    words: getNormalizedWordList(normalizedText)
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
    defaultUnderstandingPlaceholder: '写下自己的理解、翻译或拆解，方便以后复习',
    validationStatus: 'idle',
    validationIssues: [],
    validationVisibleIssues: [],
    validationHiddenCount: 0,
    validationInputKey: '',
    validationNormalizedText: '',
    validationFormatMessage: '',
    validationUnavailableMessage: '',
    validationCanSave: null,
    validationCanAnalyze: null,
    validationCanPronounce: null,
    englishInputFocus: false,
    aiServiceMessage: '',
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

    validationResult: null,      // 鏈€杩戜竴娆℃牎楠岀粨鏋?    understandingSuggestion: '', // 鏈€杩戜竴娆″弬鑰冪悊瑙?    understandingVisible: false, // 鏄惁鏄剧ず鍙傝€冪悊瑙?    validateLoading: false,
    suggestLoading: false,

    latestEnglishForSuggest: '', // 闃叉鏃ц姹傚洖鍐?    hasUserChangedCategory: false,
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
    aiAnalysisCategory: '',
    aiParagraphAnalysis: '',
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
        normalizedText: backendResp.normalizedText || text,
        evidence: Array.isArray(backendResp.evidence) ? backendResp.evidence : []
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
      analysisModel: analysisModel,
      analysisCategory: normalizePlainText(backendResp.category || ''),
      paragraphAnalysis: backendResp.category === 'paragraph'
        ? normalizePlainText(backendResp.understanding || '')
        : ''
    };
  },

  async callBackendAnalyzeDirect(text, category, cacheKey, forceRefresh = false, idempotencyKey = '') {
    // Let errors propagate so the caller can tell a busy backend (503) or a
    // network outage (statusCode 0) apart from a real AI failure, instead of
    // collapsing every failure into a generic "缃戠粶鏆傛椂涓嶇ǔ".
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
      aiAnalysisCategory: '',
      aiParagraphAnalysis: '',
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
          errors: ['鑻辨枃鍐呭涓虹┖'],
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
      // Stream failed 鈫?fall through to the existing direct chain once
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
    // message (busy vs network vs AI) instead of a blanket "缃戠粶鏆傛椂涓嶇ǔ".
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
  
    return `${category || CARD_CATEGORIES[0]}::${text}::${words}`;
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
      console.warn('鍐欏叆鍒嗘瀽缂撳瓨澶辫触', error);
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
      validationStatus: 'idle',
      validationIssues: [],
      validationVisibleIssues: [],
      validationHiddenCount: 0,
      validationInputKey: '',
      validationNormalizedText: '',
      validationFormatMessage: '',
      validationUnavailableMessage: '',
      validationCanSave: null,
      validationCanAnalyze: null,
      validationCanPronounce: null,
      englishInputFocus: false,
      aiServiceMessage: '',
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

    const category = CARD_CATEGORIES.includes(card.category) ? card.category : CARD_CATEGORIES[0];
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
    this.validationGeneration = 0;
    this._validationPromise = null;
    this._validationPresentationTimer = null;
    this._validationFormatTimer = null;
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
        : CARD_CATEGORIES[0];

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

        // 涓嶅啀鑷姩璋冪敤 AI 鍒嗘瀽锛氱瓑鐢ㄦ埛鐐瑰嚮銆孉I 鍒嗘瀽銆嶆寜閽€傜紪杈戞ā寮忎笅淇濈暀鍘熸湁鍙戦煶鍒濆鍖栥€?
        // Edit mode: load phonetics for the initial English text
        if (isEdit && englishText && !initialData.isReadonlyDetailMode) {
          console.log('[edit-pronunciation] calling _loadEditPhonetic from onLoad, text:', englishText);
          this._loadEditPhonetic(englishText);
        } else if (isEdit && !englishText && !initialData.isReadonlyDetailMode) {
          console.log('[edit-pronunciation] onLoad: englishText empty, deferring to loadCard');
        }

        if (englishText && !initialData.isReadonlyDetailMode) {
          this.scheduleEnglishValidation();
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

    this.validationGeneration = (this.validationGeneration || 0) + 1;
    this._validationPromise = null;
    if (this._validationPresentationTimer) {
      clearTimeout(this._validationPresentationTimer);
      this._validationPresentationTimer = null;
    }
    if (this._validationFormatTimer) {
      clearTimeout(this._validationFormatTimer);
      this._validationFormatTimer = null;
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

  _clearValidationPresentationTimers() {
    if (this._validationPresentationTimer) {
      clearTimeout(this._validationPresentationTimer);
      this._validationPresentationTimer = null;
    }
    if (this._validationFormatTimer) {
      clearTimeout(this._validationFormatTimer);
      this._validationFormatTimer = null;
    }
  },

  clearEnglishValidationForEdit() {
    if (this.englishValidationTimer) {
      clearTimeout(this.englishValidationTimer);
      this.englishValidationTimer = null;
    }
    this.validationGeneration = (this.validationGeneration || 0) + 1;
    this._validationPromise = null;
    this._clearValidationPresentationTimers();
    this.setData({
      validationStatus: 'idle',
      validationIssues: [],
      validationVisibleIssues: [],
      validationHiddenCount: 0,
      validationInputKey: '',
      validationNormalizedText: '',
      validationFormatMessage: '',
      validationUnavailableMessage: '',
      validationCanSave: null,
      validationCanAnalyze: null,
      validationCanPronounce: null,
      englishValidationMessage: '',
      englishValidationType: 'hint'
    });
  },

  scheduleEnglishValidation(delayMs = ENGLISH_VALIDATION_DELAY_MS) {
    if (this.data.isReadonlyDetailMode || this.data.isLeavingPage) return;
    if (this.englishValidationTimer) clearTimeout(this.englishValidationTimer);
    const self = this;
    this.englishValidationTimer = setTimeout(function () {
      self.englishValidationTimer = null;
      self.ensureEnglishValidation({ force: true, trigger: 'debounce' });
    }, Math.max(0, Number(delayMs) || 0));
  },

  _focusEnglishValidationError() {
    this.scrollToEnglishSection();
    this.setData({ englishInputFocus: false }, () => {
      this.setData({ englishInputFocus: true });
      setTimeout(() => this.setData({ englishInputFocus: false }), 300);
    });
  },

  _applyValidationResponse(response, rawText, category, requestGeneration) {
    if (requestGeneration !== this.validationGeneration || this.data.isLeavingPage) return null;
    if (makeValidationKey(this.data.form.englishText, this.data.form.category) !== makeValidationKey(rawText, category)) {
      return null;
    }

    const view = buildValidationView(response);
    const normalizedText = String(view.normalizedText || '');
    const textChangedByNormalization = normalizedText !== String(rawText || '');
    const nextText = textChangedByNormalization ? normalizedText : String(rawText || '');
    const backendCategory = String(view.category || '').trim().toLowerCase();
    const nextCategory = BACKEND_CATEGORY_FORM_MAP[backendCategory] || category;
    const patch = {
      validationStatus: view.status,
      validationIssues: view.issues,
      validationVisibleIssues: view.visibleIssues,
      validationHiddenCount: view.hiddenCount,
      validationInputKey: makeValidationKey(nextText, nextCategory),
      validationNormalizedText: nextText,
      validationUnavailableMessage: '',
      validationCanSave: view.capabilities.canSave,
      validationCanAnalyze: view.capabilities.canAnalyze,
      validationCanPronounce: view.capabilities.canPronounce,
      validationFormatMessage: textChangedByNormalization ? '已自动整理格式' : '',
      englishValidationMessage: '',
      englishValidationType: 'hint',
      isValidatingEnglish: false
    };

    if (textChangedByNormalization) {
      patch['form.englishText'] = nextText;
      if (this.data.isEdit) patch.editPronunciationText = nextText;
    }

    if (nextCategory !== category) {
      patch['form.category'] = nextCategory;
      patch.categoryIndex = Math.max(CARD_CATEGORIES.indexOf(nextCategory), 0);
    }

    this._clearValidationPresentationTimers();
    this.setData(patch);

    if (textChangedByNormalization) {
      const currentKey = patch.validationInputKey;
      this._validationFormatTimer = setTimeout(() => {
        this._validationFormatTimer = null;
        if (this.data.validationInputKey === currentKey) {
          this.setData({ validationFormatMessage: '' });
        }
      }, FORMAT_HINT_VISIBLE_MS);
    }

    if (view.status === 'warning' && !view.persistent) {
      const currentKey = patch.validationInputKey;
      this._validationPresentationTimer = setTimeout(() => {
        this._validationPresentationTimer = null;
        if (this.data.validationInputKey === currentKey && this.data.validationStatus === 'warning') {
          this.setData({ validationVisibleIssues: [], validationHiddenCount: 0 });
        }
      }, LIGHT_VALIDATION_VISIBLE_MS);
    }

    return view;
  },

  async ensureEnglishValidation({ force = false, trigger = 'action' } = {}) {
    if (this.data.isReadonlyDetailMode) {
      return { status: 'pass', normalizedText: String(this.data.form.englishText || '') };
    }

    if (this.englishValidationTimer) {
      clearTimeout(this.englishValidationTimer);
      this.englishValidationTimer = null;
    }

    const rawText = String(this.data.form.englishText || '');
    const category = this.data.form.category || CARD_CATEGORIES[0];
    const key = makeValidationKey(rawText, category);
    const reusable = !force ? this.getReusableEnglishValidation() : null;
    if (reusable) return reusable;

    if (this._validationPromise && this._validationPromise.key === key) {
      return this._validationPromise.promise;
    }

    const requestGeneration = (this.validationGeneration || 0) + 1;
    this.validationGeneration = requestGeneration;
    this._clearValidationPresentationTimers();
    this.setData({
      validationStatus: 'checking',
      validationIssues: [],
      validationVisibleIssues: [],
      validationHiddenCount: 0,
      validationFormatMessage: '',
      validationUnavailableMessage: '',
      isValidatingEnglish: true
    });

    const promise = validateEnglish(rawText, 'auto')
      .then((response) => this._applyValidationResponse(response, rawText, category, requestGeneration))
      .catch((error) => {
        if (requestGeneration !== this.validationGeneration || this.data.isLeavingPage) return null;
        if (makeValidationKey(this.data.form.englishText, this.data.form.category) !== key) return null;
        console.warn('[english-validation] preflight unavailable', error);
        this.setData({
          validationStatus: 'unavailable',
          validationIssues: [],
          validationVisibleIssues: [],
          validationHiddenCount: 0,
          validationInputKey: key,
          validationNormalizedText: rawText,
          validationUnavailableMessage: trigger === 'debounce'
            ? '暂时无法检查，你仍可以继续'
            : '暂时无法预先检查，你仍可以继续',
          validationCanSave: null,
          validationCanAnalyze: null,
          validationCanPronounce: null,
          isValidatingEnglish: false
        });
        return { status: 'unavailable', normalizedText: rawText, issues: [] };
      });

    this._validationPromise = { key, promise };
    try {
      return await promise;
    } finally {
      if (this._validationPromise && this._validationPromise.promise === promise) {
        this._validationPromise = null;
      }
    }
  },

  getReusableEnglishValidation() {
    const key = makeValidationKey(this.data.form.englishText, this.data.form.category);
    if (
      this.data.validationInputKey !== key ||
      !['pass', 'warning', 'invalid'].includes(this.data.validationStatus)
    ) {
      return null;
    }
    return {
      status: this.data.validationStatus,
      normalizedText: this.data.validationNormalizedText,
      issues: this.data.validationIssues,
      canSave: this.data.validationCanSave,
      canAnalyze: this.data.validationCanAnalyze,
      canPronounce: this.data.validationCanPronounce
    };
  },

  applyCardValidationError(error) {
    const response = validationResponseFromCardError(error);
    if (!response) return false;
    const rawText = String(this.data.form.englishText || '');
    const category = this.data.form.category || CARD_CATEGORIES[0];
    const requestGeneration = (this.validationGeneration || 0) + 1;
    this.validationGeneration = requestGeneration;
    this._applyValidationResponse(response, rawText, category, requestGeneration);
    this._focusEnglishValidationError();
    return true;
  },

  onValidationActionTap(event) {
    const actionType = String(event.currentTarget.dataset.action || '');
    const category = String(event.currentTarget.dataset.category || '');
    if (actionType !== 'switch_category' || !CARD_CATEGORIES.includes(category)) return;
    this.invalidatePendingAnalysis();
    this.abortActiveAnalysis();
    this.clearEnglishValidationForEdit();
    this.setData({
      categoryIndex: CARD_CATEGORIES.indexOf(category),
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
      aiAnalysisCategory: '',
      aiParagraphAnalysis: '',
      notesExampleAvailable: false,
      referenceApplied: false,
      aiServiceMessage: '',
      isAnalyzing: false,
      translating: false
    }, () => this.scheduleEnglishValidation(0));
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
        // Ignore abort errors 鈥?the request is already settling via its fail callback.
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
    this.validationGeneration = (this.validationGeneration || 0) + 1;
    this._validationPromise = null;
    this._clearValidationPresentationTimers();
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
      aiAnalysisCategory: '',
      aiParagraphAnalysis: '',
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
      validationStatus: 'idle',
      validationIssues: [],
      validationVisibleIssues: [],
      validationHiddenCount: 0,
      validationInputKey: '',
      validationNormalizedText: '',
      validationFormatMessage: '',
      validationUnavailableMessage: '',
      englishInputFocus: false,
      aiServiceMessage: '',
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
      aiAnalysisCategory: '',
      aiParagraphAnalysis: '',
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
    // 鍙湁鍓嶇鏈湴 error 鎵嶇湡姝ｉ樆姝繚瀛橈紝鏄剧ず绾㈣壊
    if (localErrors.length > 0) {
      return {
        displayMessage: localErrors[0],
        displayMessageType: 'error'
      }
    }

    // 鍚庣 error 涓嶅睍绀猴紙寮傛鍒嗘瀽缁撴灉锛屼笉闃绘淇濆瓨锛屼笉閫忎紶鍘熸枃锛?
    if (cloudWarnings.length > 0) {
      return {
        displayMessage: cloudWarnings[0],
        displayMessageType: 'warning'
      }
    }

    // 鎷煎啓 hint锛堟湁 correction 鏃讹級锛屼互 hint 鏍峰紡灞曠ず
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
        displayMessage: unavailableMessage || '缃戠粶鎴栧垎鏋愭湇鍔℃殏鏃朵笉鍙敤',
        displayMessageType: 'hint'
      }
    }

    return {
      displayMessage: '',
      displayMessageType: 'hint'
    }
  },

  _classifyUnavailableMessage(analyzeResult) {
    // Map an analysis failure to an accurate, non-technical message instead of
    // a blanket "缃戠粶鏆傛椂涓嶇ǔ":
    //   aborted           -> cancelled by a newer input, not an error
    //   failureKind=busy  -> backend reachable but the single AI slot was busy
    //   failureKind=ai    -> backend reachable but the AI service failed
    //   failureKind=network -> request never reached the backend
    //   ok:false + errors -> Qwen/analyzer's own clean user-facing message
    if (!analyzeResult || analyzeResult.ok !== false || analyzeResult.aborted) {
      return '';
    }
    if (analyzeResult.failureKind === 'busy') {
      return 'AI 分析暂时繁忙，请稍后重试';
    }
    if (analyzeResult.failureKind === 'ai') {
      return 'AI 分析暂时不可用，请稍后重试';
    }
    if (analyzeResult.failureKind === 'network') {
      return '网络连接失败，暂时无法使用 AI 分析';
    }
    const errors = analyzeResult.validation && analyzeResult.validation.errors;
    if (Array.isArray(errors) && errors.length > 0) {
      return errors[0];
    }
    return 'AI 分析暂时不可用，请稍后重试';
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
        localErrors: ['鑻辨枃鍐呭涓虹┖'],
        localWarnings: [],
        localInfo: [],
        cloudErrors: [],
        cloudWarnings: [],
        cloudInfo: [],
        suggestion: '',
        shouldShowSuggestion: false,
        canSave: false,
        onlineValidationUnavailable: false,
        displayMessage: '鑻辨枃鍐呭涓虹┖',
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
    let aiAnalysisCategory = ''
    let aiParagraphAnalysis = ''
    let backendLevel = ''
    let failureKind = ''

    if ((needCloudValidation || needSuggestion) && localErrors.length === 0) {
      const analyzeResult = await this.callAnalyzeEnglish(normalizedText, category, {
        onStreamEvent,
        requestGeneration,
        forceRefresh,
        idempotencyKey
      })

      const validation = analyzeResult.validation || {}
      const understanding = analyzeResult.understanding || {}
      backendLevel = normalizePlainText((analyzeResult.backend && analyzeResult.backend.level) || '')
      failureKind = normalizePlainText(analyzeResult.failureKind || '')
      backendNormalizedText = normalizeEnglishText(
        analyzeResult.normalizedText ||
        validation.normalizedText ||
        analyzeResult.text ||
        normalizedText
      )

      cloudErrors = Array.isArray(validation.errors) ? validation.errors : []

      // 鍒嗙鎷煎啓 hint锛堟湁 correction锛夊拰鏅€?warning
      var rawBackendWarnings = Array.isArray(validation.warnings) ? validation.warnings : []
      var filteredBackendWarnings = []
      rawBackendWarnings.forEach(function(w) {
        var transformed = transformSpellingWarning(w)
        if (!transformed) return  // 鏃?correction 鐨勬嫾鍐欐彁绀猴細闅愯棌
        if (transformed.isHint) {
          spellHints.push(transformed.text)  // 鏈?correction锛歨int 鏍峰紡
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

      onlineValidationUnavailable = analyzeResult.ok === false && backendLevel !== 'error'
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
      aiAnalysisCategory = normalizePlainText(
        analyzeResult.analysisCategory || (analyzeResult.backend && analyzeResult.backend.category) || ''
      )
      aiParagraphAnalysis = normalizePlainText(analyzeResult.paragraphAnalysis || '')

      if (aiAnalysisCategory === 'paragraph') {
        aiExampleSentence = ''
        aiExampleTranslation = ''
        aiSynonymsDisplay = ''
        aiSimilarPhrasesDisplay = ''
        aiExpressionTypeLabel = ''
        aiAlternativeMeanings = []
        aiUsageScenario = ''
        aiDialogueEnglish = []
        aiDialogueChinese = []
        aiRelatedDisplay = ''
      }
    }

    const hasDictionaryWarning = cloudWarnings.some((item) => {
      return isDictionaryUnrecognizedWarning(item)
    })

    const shouldSkipMachineSuggestionForUnknownSingleWord =
      category === '单词' && hasDictionaryWarning

    const hasAnyError = localErrors.length > 0 || cloudErrors.length > 0
    const shouldBlockSuggestion =
      hasAnyError ||
      shouldSkipMachineSuggestionForUnknownSingleWord

    if (!needSuggestion || shouldBlockSuggestion) {
      suggestion = ''
    }

    if (suggestion && category === '单词') {
      cloudWarnings = filterDictionaryWarningsWhenSuggestionWorks(cloudWarnings, suggestion)
    }

    const shouldShowSuggestion = !shouldBlockSuggestion && !!suggestion
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
      aiAnalysisCategory,
      aiParagraphAnalysis,
      backendLevel,
      failureKind,
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

    if (analysis.backendLevel === 'error') {
      const validationGeneration = (this.validationGeneration || 0) + 1;
      this.validationGeneration = validationGeneration;
      this._applyValidationResponse({
        level: 'error',
        category: analysis.aiAnalysisCategory || 'unknown',
        normalizedText: analysis.backendNormalizedText || normalizedText,
        warnings: [],
        errors: analysis.cloudErrors || [],
        evidence: []
      }, currentRaw, this.data.form.category || CARD_CATEGORIES[0], validationGeneration);
      this._focusEnglishValidationError();
    }

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
      aiAnalysisCategory: analysis.aiAnalysisCategory || '',
      aiParagraphAnalysis: analysis.aiParagraphAnalysis || '',
      aiServiceMessage: analysis.onlineValidationUnavailable
        ? this._classifyUnavailableMessage({
          ok: false,
          failureKind: analysis.failureKind,
          validation: { errors: analysis.cloudErrors || [] }
        })
        : '',
      notesExampleAvailable: this.computeNotesExampleAvailable(
        analysis.aiExampleSentence || '',
        this.data.form.notes
      ),
      referenceApplied: this.computeReferenceApplied(
        analysis.aiParagraphAnalysis || (analysis.shouldShowSuggestion ? analysis.suggestion : ''),
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

    this.setData({ aiServiceMessage: '' });
    const continueWithValidation = (validation) => {
      if (!validation) return;
      if (validation.status === 'invalid') {
        this._focusEnglishValidationError();
        return;
      }
      if (validation.canAnalyze === false) {
        wx.showToast({ title: '请先修改英文内容', icon: 'none' });
        return;
      }
      const englishText = String(validation.normalizedText || this.data.form.englishText || '');
      const category = this.data.form.category || CARD_CATEGORIES[0];
      this.runInputAnalysis(englishText, category);
    };

    const reusable = this.getReusableEnglishValidation();
    if (reusable) {
      continueWithValidation(reusable);
      return;
    }
    if (this._pendingAiValidationAction) return;
    this._pendingAiValidationAction = true;
    this.ensureEnglishValidation({ force: false, trigger: 'ai' })
      .then(continueWithValidation)
      .finally(() => { this._pendingAiValidationAction = false; });
  },

  onCancelAnalyzeTap() {
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
    // in-flight dedup, and surfaces a false "缃戠粶鏆傛椂涓嶇ǔ" without ever firing
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
    if (this.data.isRegenerating || this.data.translating) {
      return;
    }

    const validation = this.getReusableEnglishValidation() ||
      await this.ensureEnglishValidation({ force: false, trigger: 'ai' });
    if (!validation || validation.status === 'invalid' || validation.canAnalyze === false) {
      if (validation && validation.status === 'invalid') this._focusEnglishValidationError();
      return;
    }

    const englishText = String(validation.normalizedText || this.data.form.englishText || '');
    const category = this.data.form.category || CARD_CATEGORIES[0];

    if (!englishText) {
      return;
    }

    this.abortActiveAnalysis();
    const requestGeneration = (this.analysisGeneration || 0) + 1;
    this.analysisGeneration = requestGeneration;
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
          title: '卡片不存在',
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
    const category = nextData.form.category || CARD_CATEGORIES[0];

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

      // 涓嶅啀鑷姩璋冪敤 AI 鍒嗘瀽锛氱瓑鐢ㄦ埛鐐瑰嚮銆孉I 鍒嗘瀽銆嶆寜閽€?
      // Initialize pronunciation: ensure editPronunciationText is set and load phonetics
      if (!this.data.isReadonlyDetailMode) {
        console.log('[edit-pronunciation] loadCard calling _loadEditPhonetic, text:', englishText);
        this._loadEditPhonetic(englishText);
      }
      this.clearEnglishValidationForEdit();
      this.scheduleEnglishValidation();
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
    this.abortActiveAnalysis();
    this.clearEnglishValidationForEdit();

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
      aiAnalysisCategory: '',
      aiParagraphAnalysis: '',
      notesExampleAvailable: false,
      referenceApplied: false,
      aiServiceMessage: '',
      englishValidationMessage: '',
      englishValidationType: 'hint',
      isValidatingEnglish: false,
      isAnalyzing: false,
      translating: false
    }, () => this.scheduleEnglishValidation());
  },


  onEnglishInput(event) {
    if (this.data.isReadonlyDetailMode) return;
    const nextValue = event.detail.value;
    const normalizedNextText = normalizeEnglishText(nextValue);
    const previousText = normalizeEnglishText(this.data.form.englishText);

    this.clearEnglishValidationForEdit();

    const nextData = {
      'form.englishText': nextValue,
      aiServiceMessage: ''
    };

    if (normalizedNextText !== previousText) {
      this.invalidatePendingAnalysis();
      this.abortActiveAnalysis();
      nextData.isAnalyzing = false;
      nextData.translating = false;
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
      nextData.aiAnalysisCategory = '';
      nextData.aiParagraphAnalysis = '';
      nextData.referenceApplied = false;
      nextData.translating = false;
    }

    this.setData(nextData, () => this.scheduleEnglishValidation());

    // Edit mode: schedule phonetic lookup on text change
    if (this.data.isEdit) {
      this._scheduleEditPhonetic(normalizedNextText);
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

    this.ensureEnglishValidation({ force: false, trigger: 'blur' });
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

  async onEditPronunciationTap() {
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
    if (text.length > 300) {
      wx.showToast({ title: '内容较长，暂不支持整段发音', icon: 'none' });
      return;
    }

    const validation = await this.ensureEnglishValidation({ force: false, trigger: 'tts' });
    if (!validation) return;
    if (validation.status === 'invalid') {
      this._focusEnglishValidationError();
      wx.showToast({ title: '请先修改英文内容', icon: 'none' });
      return;
    }
    if (validation.canPronounce === false) {
      wx.showToast({ title: '请先修改英文内容', icon: 'none' });
      return;
    }
    text = String(validation.normalizedText || this._getCurrentEditEnglish());

    console.log('[edit-pronunciation] proceeding to play', { text: text, voice: voice });

    // ---- loading safety timeout: prevent permanent "鍔犺浇涓? ----
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

        this._editAudioContext.onCanplay(function () {
          logTtsDiagnostic('edit_audio_on_canplay', audioState(self._editAudioContext));
        });
        this._editAudioContext.onPlay(function () {
          logTtsDiagnostic('edit_audio_on_play', audioState(self._editAudioContext));
          console.log('[edit-pronunciation] audio onPlay fired');
          if (self._editPronunciationSafetyTimer) {
            clearTimeout(self._editPronunciationSafetyTimer);
            self._editPronunciationSafetyTimer = null;
          }
          self.setData({ editPronunciationLoading: false, editPronunciationPlaying: true });
        });
        this._editAudioContext.onEnded(function () {
          logTtsDiagnostic('edit_audio_on_ended', audioState(self._editAudioContext));
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
        this._editAudioContext.onWaiting(function () {
          logTtsDiagnostic('edit_audio_on_waiting', audioState(self._editAudioContext));
        });
        this._editAudioContext.onError(function (err) {
          logTtsDiagnostic('edit_audio_on_error', {
            ...audioState(self._editAudioContext),
            errCode: err && err.errCode ? err.errCode : '',
            errMsg: String(err && err.errMsg || err || 'unknown')
          });
          console.log('[edit-pronunciation] audio onError fired', String(err && err.errMsg || err || 'unknown'));
          if (self._editPronunciationSafetyTimer) {
            clearTimeout(self._editPronunciationSafetyTimer);
            self._editPronunciationSafetyTimer = null;
          }
          self.setData({ editPronunciationLoading: false, editPronunciationPlaying: false });
          wx.showToast({ title: '发音暂时不可用', icon: 'none' });
        });
      }

      audioContext = this._editAudioContext;

      if (this.data.editPronunciationPlaying || this.data.editPronunciationLoading) {
        console.log('[edit-pronunciation] stopping previous playback');
        try { audioContext.stop(); } catch (_) {}
      }

      this.setData({ editPronunciationLoading: true, editPronunciationPlaying: false });
      logTtsDiagnostic('edit_button_clicked', {
        voice: voice,
        hasText: Boolean(text)
      });
      downloadPronunciationAudio(text, voice)
        .then(function (tempFilePath) {
          logTtsDiagnostic('edit_audio_src_set', {
            tempFilePath: tempFilePath,
            src: tempFilePath,
            requestId: getLastTtsRequestId()
          });
          audioContext.src = tempFilePath;
          logTtsDiagnostic('edit_audio_play_called', audioState(audioContext));
          audioContext.play();
        })
        .catch(function (err) {
          console.log('[edit-pronunciation] audio download failed', String(err && err.errMsg || err || 'unknown'));
          if (self._editPronunciationSafetyTimer) {
            clearTimeout(self._editPronunciationSafetyTimer);
            self._editPronunciationSafetyTimer = null;
          }
          self.setData({ editPronunciationLoading: false, editPronunciationPlaying: false });
          wx.showToast({ title: '发音暂时不可用', icon: 'none' });
        });
    } catch (err) {
      console.log('[edit-pronunciation] exception during playback setup', String(err && err.message || err));
      if (this._editPronunciationSafetyTimer) {
        clearTimeout(this._editPronunciationSafetyTimer);
        this._editPronunciationSafetyTimer = null;
      }
      this.setData({ editPronunciationLoading: false, editPronunciationPlaying: false });
      wx.showToast({ title: '发音暂时不可用', icon: 'none' });
    }
  },

  onEditPronunciationLongPress() {
    const self = this;
    try {
      if (!this._editAudioContext) {
        this._editAudioContext = wx.createInnerAudioContext();
        this._editAudioContext.obeyMuteSwitch = false;
        this._editAudioContext.onCanplay(function () {
          logTtsDiagnostic('edit_audio_on_canplay', audioState(self._editAudioContext));
        });
        this._editAudioContext.onPlay(function () {
          logTtsDiagnostic('edit_audio_on_play', audioState(self._editAudioContext));
          self.setData({ editPronunciationLoading: false, editPronunciationPlaying: true });
        });
        this._editAudioContext.onWaiting(function () {
          logTtsDiagnostic('edit_audio_on_waiting', audioState(self._editAudioContext));
        });
        this._editAudioContext.onEnded(function () {
          logTtsDiagnostic('edit_audio_on_ended', audioState(self._editAudioContext));
          self.setData({ editPronunciationLoading: false, editPronunciationPlaying: false });
        });
        this._editAudioContext.onStop(function () {
          self.setData({ editPronunciationLoading: false, editPronunciationPlaying: false });
        });
        this._editAudioContext.onError(function (err) {
          logTtsDiagnostic('edit_audio_on_error', {
            ...audioState(self._editAudioContext),
            errCode: err && err.errCode ? err.errCode : '',
            errMsg: String(err && err.errMsg || err || 'unknown')
          });
          self.setData({ editPronunciationLoading: false, editPronunciationPlaying: false });
        });
      }

      const audioContext = this._editAudioContext;
      try { audioContext.stop(); } catch (_) {}
      audioContext.volume = 1;
      this.setData({ editPronunciationLoading: true, editPronunciationPlaying: false });
      logTtsDiagnostic('test_mp3_button_clicked', {
        requestId: getLastTtsRequestId(),
        applyInnerAudioOption: false
      });
      downloadDiagnosticTestAudio()
        .then(function (tempFilePath) {
          audioContext.src = tempFilePath;
          logTtsDiagnostic('test_mp3_audio_src_set', audioState(audioContext));
          logTtsDiagnostic('test_mp3_audio_play_called', audioState(audioContext));
          audioContext.play();
        })
        .catch(function (err) {
          logTtsDiagnostic('test_mp3_audio_download_failed', {
            requestId: getLastTtsRequestId(),
            errMsg: String(err && err.errMsg || err || 'unknown')
          });
          self.setData({ editPronunciationLoading: false, editPronunciationPlaying: false });
        });
    } catch (err) {
      logTtsDiagnostic('test_mp3_audio_exception', {
        requestId: getLastTtsRequestId(),
        errMsg: String(err && err.message || err || 'unknown')
      });
      this.setData({ editPronunciationLoading: false, editPronunciationPlaying: false });
    }
    setTimeout(() => {
      if (typeof wx.setInnerAudioOption === 'function') {
        wx.setInnerAudioOption({
          obeyMuteSwitch: false,
          speakerOn: true,
          mixWithOther: true,
          success(res) {
            logTtsDiagnostic('set_inner_audio_option_success', {
              requestId: getLastTtsRequestId(),
              errMsg: String(res && res.errMsg || '')
            });
          },
          fail(err) {
            logTtsDiagnostic('set_inner_audio_option_fail', {
              requestId: getLastTtsRequestId(),
              errMsg: String(err && err.errMsg || err || 'unknown')
            });
          }
        });
      }
      this.onEditPronunciationLongPressWithoutOptionReplay();
    }, 2000);
  },

  onEditPronunciationLongPressWithoutOptionReplay() {
    const self = this;
    const audioContext = this._editAudioContext;
    if (!audioContext) {
      return;
    }
    try { audioContext.stop(); } catch (_) {}
    audioContext.volume = 1;
    this.setData({ editPronunciationLoading: true, editPronunciationPlaying: false });
    logTtsDiagnostic('test_mp3_button_clicked', {
      requestId: getLastTtsRequestId(),
      applyInnerAudioOption: true
    });
    downloadDiagnosticTestAudio()
      .then(function (tempFilePath) {
        audioContext.src = tempFilePath;
        logTtsDiagnostic('test_mp3_audio_src_set', audioState(audioContext));
        logTtsDiagnostic('test_mp3_audio_play_called', audioState(audioContext));
        audioContext.play();
      })
      .catch(function (err) {
        logTtsDiagnostic('test_mp3_audio_download_failed', {
          requestId: getLastTtsRequestId(),
          errMsg: String(err && err.errMsg || err || 'unknown')
        });
        self.setData({ editPronunciationLoading: false, editPronunciationPlaying: false });
      });
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

    const understanding = normalizeEnglishText(
      this.data.aiParagraphAnalysis || this.data.understandingSuggestion || this.data.suggestionText
    );
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
      wx.showToast({ title: '暂无可播放的例句', icon: 'none' });
      return;
    }

    const voice = this.data.editPronunciationVoice || getStoredVoice() || DEFAULT_VOICE;
    const self = this;
    const downloadPronunciationAudio = require('../../utils/apiClient').downloadPronunciationAudio;
    const logTtsDiagnostic = require('../../utils/apiClient').logTtsDiagnostic;

    // Reuse the same download 鈫?local temp file 鈫?InnerAudioContext pattern as the
    // word pronunciation (onEditPronunciationTap). No second TTS, no direct URL playback.
    if (!this._notesExampleAudioContext) {
      this._notesExampleAudioContext = wx.createInnerAudioContext();
      this._notesExampleAudioContext.obeyMuteSwitch = false;
      this._notesExampleAudioContext.onCanplay(function () {
        logTtsDiagnostic('notes_example_audio_on_canplay', {
          src: String(self._notesExampleAudioContext && self._notesExampleAudioContext.src || '')
        });
      });
      this._notesExampleAudioContext.onPlay(function () {
        logTtsDiagnostic('notes_example_audio_on_play', {
          src: String(self._notesExampleAudioContext && self._notesExampleAudioContext.src || '')
        });
        self.setData({ notesExampleLoading: false, notesExamplePlaying: true });
      });
      this._notesExampleAudioContext.onWaiting(function () {
        logTtsDiagnostic('notes_example_audio_on_waiting', {
          src: String(self._notesExampleAudioContext && self._notesExampleAudioContext.src || '')
        });
      });
      this._notesExampleAudioContext.onEnded(function () {
        logTtsDiagnostic('notes_example_audio_on_ended', {
          src: String(self._notesExampleAudioContext && self._notesExampleAudioContext.src || '')
        });
        self.setData({ notesExampleLoading: false, notesExamplePlaying: false });
      });
      this._notesExampleAudioContext.onStop(function () {
        self.setData({ notesExampleLoading: false, notesExamplePlaying: false });
      });
      this._notesExampleAudioContext.onError(function (err) {
        logTtsDiagnostic('notes_example_audio_on_error', {
          src: String(self._notesExampleAudioContext && self._notesExampleAudioContext.src || ''),
          errCode: err && err.errCode ? err.errCode : '',
          errMsg: String(err && err.errMsg || err || 'unknown')
        });
        self.setData({ notesExampleLoading: false, notesExamplePlaying: false });
        wx.showToast({ title: '发音暂时不可用', icon: 'none' });
      });
    }

    const audioContext = this._notesExampleAudioContext;
    if (this.data.notesExamplePlaying || this.data.notesExampleLoading) {
      try { audioContext.stop(); } catch (_) {}
    }

    this.setData({ notesExampleLoading: true, notesExamplePlaying: false });
    logTtsDiagnostic('notes_example_button_clicked', {
      voice: voice,
      hasText: Boolean(exampleSentence)
    });
    downloadPronunciationAudio(exampleSentence, voice)
      .then(function (tempFilePath) {
        logTtsDiagnostic('notes_example_audio_src_set', {
          tempFilePath: tempFilePath,
          src: tempFilePath
        });
        audioContext.src = tempFilePath;
        logTtsDiagnostic('notes_example_audio_play_called', {
          src: String(audioContext.src || '')
        });
        audioContext.play();
      })
      .catch(function () {
        self.setData({ notesExampleLoading: false, notesExamplePlaying: false });
        wx.showToast({ title: '发音暂时不可用', icon: 'none' });
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
      validationStatus: 'idle',
      validationIssues: [],
      validationVisibleIssues: [],
      validationHiddenCount: 0,
      validationInputKey: '',
      validationNormalizedText: '',
      validationFormatMessage: '',
      validationUnavailableMessage: '',
      englishInputFocus: false,
      aiServiceMessage: '',
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
      aiAnalysisCategory: '',
      aiParagraphAnalysis: '',
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
      if (validationResponseFromCardError(error)) {
        throw error;
      }
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
      aiServiceMessage: ''
    });

    try {
      const validation = await this.ensureEnglishValidation({ force: false, trigger: 'save' });
      if (!validation) return;
      if (validation.status === 'invalid') {
        this._focusEnglishValidationError();
        return;
      }
      if (validation.canSave === false) {
        this._focusEnglishValidationError();
        return;
      }
      const currentForm = this.data.form;
      const normalizedForSave = String(
        validation.normalizedText || normalizeEnglishText(currentForm.englishText)
      );
      const categoryForSave = currentForm.category || CARD_CATEGORIES[0];

      let currentCard = null;

      if (isEdit && cardId) {
        try {
          currentCard = await getCardById(cardId);
        } catch (error) {
          currentCard = null;
        }
      }

      const nextAnalyzeCacheKey = this.makeAnalyzeCacheKey(
        normalizedForSave,
        categoryForSave
      );

      const currentText = normalizeEnglishText(currentCard && currentCard.englishText);
      const currentCategory = currentCard && currentCard.category ? currentCard.category : '';
      const currentAnalyzeCacheKey = currentCard && currentCard.analyzeCacheKey
        ? currentCard.analyzeCacheKey
        : '';

      const isSameAnalyzedContent = (
        currentCard &&
        currentCard.analysisStatus === 'done' &&
        currentText === normalizedForSave &&
        currentCategory === categoryForSave &&
        currentAnalyzeCacheKey === nextAnalyzeCacheKey
      );

      let nextForm;
      let shouldBackgroundAnalyze = false;

      if (isSameAnalyzedContent) {
        // 缂栬緫妯″紡涓斿唴瀹规湭鍙橈細淇濈暀鍘?analysisStatus 鍜屽師鍒嗘瀽缁撴灉锛屼笉瑙﹀彂鍚庡彴鍒嗘瀽
        nextForm = {
          ...currentForm,
          englishText: normalizedForSave,
          analysisStatus: currentCard.analysisStatus,
          analysisWarnings: currentCard.analysisWarnings || [],
          analysisErrors: currentCard.analysisErrors || [],
          analysisSource: currentCard.analysisSource || '',
          understandingSource: currentCard.understandingSource || '',
          analyzeCacheKey: currentAnalyzeCacheKey,
          analyzedAt: currentCard.analyzedAt || ''
        };
      } else {
        // 新增卡片或内容变化：只有允许分析时才进入 pending，否则直接收口为 failed。
        nextForm = {
          ...currentForm,
          englishText: normalizedForSave,
          analysisStatus: validation.canAnalyze === false ? 'failed' : 'pending',
          analysisWarnings: [],
          analysisErrors: [],
          analysisSource: '',
          understandingSource: normalizeUnderstandingSource('local', !!currentForm.myUnderstanding),
          analyzeCacheKey: nextAnalyzeCacheKey,
          analyzedAt: ''
        };
        shouldBackgroundAnalyze = validation.canAnalyze !== false;
      }

      const savedCard = await this.saveCard(nextForm, saveMode);

      // 5. 淇濆瓨鎴愬姛鍚?fire-and-forget 瑙﹀彂鍚庡彴鍒嗘瀽
      if (shouldBackgroundAnalyze && savedCard && savedCard.id) {
        const analysisTextSnapshot = normalizedForSave;
        const analysisCategory = nextForm.category;

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
      if (this.applyCardValidationError(error)) {
        return;
      }
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
    const sourceCategory = analysisCategory || CARD_CATEGORIES[0];

    if (!sourceText) {
      return;
    }

    const safeAnalyze = this.safeAnalyzeEnglish.bind(this);
    const makeKey = this.makeAnalyzeCacheKey.bind(this);

    try {
      const result = await safeAnalyze(sourceText, sourceCategory);

      // 璇诲彇鏈€鏂板崱鐗?鈥?snapshot guard + 鍚堝苟鍩哄簳
      const latestCard = await getCardById(cardId);
      if (!latestCard) {
        console.warn('[add-save] background analyze skipped: card not found', cardId);
        return;
      }

      const latestText = normalizeEnglishText(latestCard.englishText);

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

      // 閫氳繃 updateCard 鍚屾鏈湴 cardsCache
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
