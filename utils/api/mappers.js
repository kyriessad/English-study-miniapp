function asObject(value) {
  return value && typeof value === 'object' ? value : {};
}

function mapUser(value) {
  const source = asObject(value);
  return {
    id: String(source.id || source.user_id || ''),
    openid: source.openid || '',
    timezone: source.timezone || 'Asia/Shanghai',
    createdAt: source.created_at || source.createdAt || ''
  };
}

function mapAuthResponse(value) {
  const source = asObject(value);
  return {
    accessToken: String(source.access_token || source.accessToken || ''),
    user: mapUser(source.user || source),
    raw: source
  };
}

function mapCard(value) {
  const source = asObject(value);
  return {
    id: String(source.id || ''),
    englishText: source.content || source.englishText || '',
    normalizedText: source.content_normalized || source.normalizedText || '',
    category: source.card_type || source.category || '',
    participatesInReview: source.participates_in_review !== false && source.participatesInReview !== false,
    addChannel: source.add_channel || source.addChannel || 'manual',
    publicMaterialItemId: source.public_material_item_id || source.publicMaterialItemId || null,
    sourceWordbookId: source.source_wordbook_id || source.sourceWordbookId || null,
    encounters: Array.isArray(source.encounters) ? source.encounters.map((item) => ({
      id: String(item.id || ''),
      whereEncountered: item.where_encountered || item.whereEncountered || '',
      context: item.context || '',
      encounteredAt: item.encountered_at || item.encounteredAt || null
    })) : [],
    understanding: source.understanding || '',
    translation: source.translation || '',
    note: source.note || '',
    whereEncountered: source.where_encountered || source.whereEncountered || '',
    sourceContext: source.source_context || source.sourceContext || '',
    sourceUrl: source.source_url || source.sourceUrl || '',
    exampleSentence: source.example_sentence || source.exampleSentence || '',
    exampleTranslation: source.example_translation || source.exampleTranslation || '',
    analysisStatus: source.analysis_status || source.analysisStatus || '',
    isReviewReady: source.is_review_ready !== false && source.isReviewReady !== false,
    reviewState: source.review_state || source.reviewState || '',
    nextReviewAt: source.next_review_at || source.nextReviewAt || null,
    version: Number(source.version || 0),
    deletedAt: source.deleted_at || source.deletedAt || null,
    raw: source
  };
}

function mapPassage(value) {
  const source = asObject(value);
  return {
    id: String(source.id || ''),
    title: source.title || '',
    content: source.content || source.englishText || source.english_text || '',
    englishText: source.content || source.englishText || source.english_text || '',
    kind: source.kind || 'pasted',
    source: source.source || 'manual',
    understanding: source.understanding || '',
    translation: source.translation || '',
    note: source.note || '',
    whereEncountered: source.where_encountered || source.whereEncountered || '',
    audioStatus: source.audio_status || source.audioStatus || 'none',
    version: Number(source.version || 0),
    status: source.status || 'active',
    createdAt: source.created_at || source.createdAt || '',
    updatedAt: source.updated_at || source.updatedAt || '',
    raw: source
  };
}

function mapPassageListResponse(value) {
  const source = asObject(value);
  return {
    items: Array.isArray(source.items) ? source.items.map(mapPassage) : [],
    total: Number(source.total || 0),
    limit: Number(source.limit || 0),
    offset: Number(source.offset || 0),
    raw: source
  };
}

function mapCardListResponse(value) {
  const source = asObject(value);
  return {
    items: Array.isArray(source.items) ? source.items.map(mapCard) : [],
    total: Number(source.total || 0),
    limit: Number(source.limit || 0),
    offset: Number(source.offset || 0),
    syncCursor: source.sync_cursor || source.syncCursor || null,
    serverTime: source.server_time || source.serverTime || null,
    raw: source
  };
}

function mapDiscoveryPack(value) {
  const source = asObject(value);
  return {
    code: source.code || '',
    title: source.title || '',
    description: source.description || '',
    itemCount: Number(source.item_count || source.itemCount || 0),
    remainingCount: Number(source.remaining_count || source.remainingCount || 0),
    raw: source
  };
}

function mapDiscoveryItem(value) {
  const source = asObject(value);
  return {
    id: String(source.id || ''),
    content: source.content || '',
    translation: source.translation || source.chinese || '',
    chinese: source.chinese || source.translation || '',
    cardType: source.card_type || source.cardType || 'phrase',
    sourceLabel: source.source_label || source.sourceLabel || '',
    packCode: source.pack_code || source.packCode || '',
    packTitle: source.pack_title || source.packTitle || '',
    domain: source.domain || '',
    categoryCode: source.category_code || source.categoryCode || '',
    categoryTitle: source.category_title || source.categoryTitle || '',
    known: Boolean(source.known),
    inLibrary: Boolean(source.in_library || source.inLibrary),
    raw: source
  };
}

function mapDiscoveryCategory(value) {
  const source = asObject(value);
  return {
    code: source.code || '',
    title: source.title || '',
    description: source.description || '',
    sortOrder: Number(source.sort_order || source.sortOrder || 0),
    itemCount: Number(source.item_count || source.itemCount || 0),
    children: Array.isArray(source.children) ? source.children.map(mapDiscoveryCategory) : [],
    raw: source
  };
}

function mapDiscoveryCategoryListResponse(value) {
  const source = asObject(value);
  return {
    items: Array.isArray(source.items) ? source.items.map(mapDiscoveryCategory) : [],
    raw: source
  };
}

function mapDiscoveryCursorResponse(value) {
  const source = asObject(value);
  return {
    category: mapDiscoveryCategory(source.category),
    items: Array.isArray(source.items) ? source.items.map(mapDiscoveryItem) : [],
    limit: Number(source.limit || 0),
    nextCursor: source.next_cursor || source.nextCursor || null,
    hasMore: Boolean(source.has_more || source.hasMore),
    raw: source
  };
}

function mapPublicMaterialDetail(value) {
  const source = asObject(value);
  return {
    item: mapDiscoveryItem(source.item),
    analysisStatus: source.analysis_status || source.analysisStatus || 'not_generated',
    reference: source.reference || null,
    analysisError: source.analysis_error || source.analysisError || null,
    raw: source
  };
}

function mapDailyDiscovery(value) {
  const source = asObject(value);
  const items = Array.isArray(source.items) ? source.items.map(mapDiscoveryItem) : [];
  return {
    displayDate: source.display_date || source.displayDate || '',
    timezone: source.timezone || 'Asia/Shanghai',
    batchKey: source.batch_key || source.batchKey || '',
    items,
    item: items[0] || mapDiscoveryItem(source.item),
    raw: source
  };
}

function mapDiscoveryListResponse(value) {
  const source = asObject(value);
  return {
    items: Array.isArray(source.items) ? source.items.map(mapDiscoveryItem) : [],
    total: Number(source.total || 0),
    raw: source
  };
}

function mapReviewItem(value) {
  const source = asObject(value);
  return {
    sessionItemId: String(source.session_item_id || source.sessionItemId || ''),
    cardId: String(source.card_id || source.cardId || ''),
    questionId: String(source.question_id || source.questionId || ''),
    content: source.content || '',
    cardType: source.card_type || source.cardType || 'auto',
    translation: source.translation || '',
    note: source.note || '',
    whereEncountered: source.where_encountered || source.whereEncountered || '',
    sourceContext: source.source_context || source.sourceContext || '',
    exampleSentence: source.example_sentence || source.exampleSentence || '',
    exampleTranslation: source.example_translation || source.exampleTranslation || '',
    understanding: source.understanding || '',
    options: Array.isArray(source.options) ? source.options.map((option) => ({
      optionId: option.option_id || option.optionId || '',
      text: option.text || ''
    })) : [],
    isRepeat: Boolean(source.is_repeat || source.isRepeat),
    attemptNo: Number(source.attempt_no || source.attemptNo || 1),
    flowState: source.flow_state || source.flowState || 'question',
    wrongCount: Number(source.wrong_count || source.wrongCount || 0),
    raw: source
  };
}

function mapReviewSessionResponse(value) {
  const source = asObject(value);
  return {
    sessionId: String(source.session_id || source.sessionId || ''),
    domain: source.domain || 'personal',
    resumeToken: source.resume_token || source.resumeToken || null,
    sessionType: source.session_type || source.sessionType || '',
    status: source.status || '',
    progress: {
      reviewed: Number(source.progress && source.progress.reviewed || 0),
      total: Number(source.progress && source.progress.total || 0)
    },
    items: Array.isArray(source.items) ? source.items.map(mapReviewItem) : [],
    currentItem: source.current_item || source.currentItem
      ? mapReviewItem(source.current_item || source.currentItem)
      : null,
    transition: source.transition || null,
    navigation: source.navigation || null,
    detailDelayMs: Number(source.detail_delay_ms || source.detailDelayMs || 0),
    raw: source
  };
}

function mapWordbookReviewItem(value) {
  const source = asObject(value);
  return {
    sessionItemId: String(source.session_item_id || source.sessionItemId || ''),
    materialItemId: String(source.material_item_id || source.materialItemId || ''),
    questionToken: source.question_token || source.questionToken || null,
    content: source.content || '',
    chinese: source.chinese || '',
    attemptNo: Number(source.attempt_no || source.attemptNo || 1),
    wrongCount: Number(source.wrong_count || source.wrongCount || 0),
    itemKind: source.item_kind || source.itemKind || 'review',
    flowState: source.flow_state || source.flowState || 'question',
    options: Array.isArray(source.options) ? source.options.map((option) => ({
      optionId: option.option_id || option.optionId || '',
      text: option.text || ''
    })) : [],
    raw: source
  };
}

function mapWordbookReviewSession(value) {
  const source = asObject(value);
  return {
    domain: source.domain || 'wordbook',
    bookId: String(source.book_id || source.bookId || ''),
    bookCode: source.book_code || source.bookCode || '',
    sessionId: String(source.session_id || source.sessionId || ''),
    resumeToken: source.resume_token || source.resumeToken || null,
    status: source.status || '',
    plannedNewCount: Number(source.planned_new_count || source.plannedNewCount || 0),
    plannedReviewCount: Number(source.planned_review_count || source.plannedReviewCount || 0),
    progress: {
      completed: Number(source.progress && source.progress.completed || 0),
      total: Number(source.progress && source.progress.total || 0)
    },
    currentItem: source.current_item || source.currentItem
      ? mapWordbookReviewItem(source.current_item || source.currentItem)
      : null,
    recap: source.recap || null,
    transition: source.transition || null,
    navigation: source.navigation || null,
    detailDelayMs: Number(source.detail_delay_ms || source.detailDelayMs || 0),
    isCorrect: typeof source.is_correct === 'boolean' ? source.is_correct : source.isCorrect,
    raw: source
  };
}

function mapReviewOverview(value) {
  const source = asObject(value);
  return {
    suggested: source.suggested || {},
    completedSuggested: source.completed_suggested || source.completedSuggested || {},
    extraToday: source.extra_today || source.extraToday || {},
    goalProgress: source.goal_progress || source.goalProgress || null,
    activeSession: source.active_session || source.activeSession || null,
    raw: source
  };
}

function mapWordbook(value) {
  const source = asObject(value);
  const userState = asObject(source.user_state || source.userState);
  return {
    id: String(source.id || ''),
    code: source.code || '',
    title: source.title || '',
    description: source.description || '',
    itemCount: Number(source.item_count || source.itemCount || 0),
    userState: {
      state: userState.state || 'not_started',
      learnedCount: Number(userState.learned_count || userState.learnedCount || 0),
      itemCount: Number(userState.item_count || userState.itemCount || source.item_count || source.itemCount || 0),
      unlearnedCount: Number(userState.unlearned_count || userState.unlearnedCount || 0),
      dueCount: Number(userState.due_count || userState.dueCount || 0),
      upcomingNewCount: Number(userState.upcoming_new_count || userState.upcomingNewCount || 0),
      newWordsPerSession: Number(userState.new_words_per_session || userState.newWordsPerSession || 20),
      hasActiveSession: Boolean(userState.has_active_session || userState.hasActiveSession),
      nextPosition: userState.next_position === null || userState.nextPosition === null
        ? null
        : Number(userState.next_position || userState.nextPosition || 0) || null,
      startedAt: userState.started_at || userState.startedAt || null,
      lastAccessedAt: userState.last_accessed_at || userState.lastAccessedAt || null
    },
    raw: source
  };
}

function mapWordbookEntry(value) {
  const source = asObject(value);
  return {
    id: String(source.id || ''),
    position: Number(source.position || 0),
    englishText: source.content || source.englishText || '',
    chinese: source.chinese || '',
    category: source.card_type || source.category || 'word',
    sourceLabel: source.source_label || source.sourceLabel || '',
    progressState: source.progress_state || source.progressState || 'not_started',
    inLibrary: Boolean(source.in_library || source.inLibrary),
    raw: source
  };
}

function mapWordbookDetail(value) {
  const source = asObject(value);
  return {
    book: mapWordbook(source.book),
    nextEntry: source.next_entry || source.nextEntry
      ? mapWordbookEntry(source.next_entry || source.nextEntry)
      : null,
    raw: source
  };
}

function mapWordbookEntryList(value) {
  const source = asObject(value);
  return {
    book: mapWordbook(source.book),
    items: Array.isArray(source.items) ? source.items.map(mapWordbookEntry) : [],
    total: Number(source.total || 0),
    limit: Number(source.limit || 0),
    offset: Number(source.offset || 0),
    nextOffset: source.next_offset === null || source.nextOffset === null
      ? null
      : Number(source.next_offset || source.nextOffset || 0),
    raw: source
  };
}

function mapWordbookProgress(value) {
  const source = asObject(value);
  return {
    book: mapWordbook(source.book),
    entry: mapWordbookEntry(source.entry),
    raw: source
  };
}

function mapWordbookNeighbor(value) {
  const source = asObject(value);
  const id = String(source.id || '');
  const content = source.content || source.englishText || '';
  if (!id || !content) return null;
  return { id, content };
}

function mapWordbookCollocation(value) {
  const source = asObject(value);
  const en = String(source.en || source.english || '').trim();
  if (!en) return null;
  return { en, zh: String(source.zh || source.chinese || '').trim() };
}

function mapWordbookEntryDetail(value) {
  const source = asObject(value);
  const rank = source.unmastered_rank == null && source.unmasteredRank == null
    ? null
    : Number(source.unmastered_rank || source.unmasteredRank || 0);
  return {
    book: mapWordbook(source.book),
    entry: mapWordbookEntry(source.entry),
    unmasteredRank: rank,
    unmasteredTotal: Number(source.unmastered_total || source.unmasteredTotal || 0),
    prevEntry: mapWordbookNeighbor(source.prev_entry || source.prevEntry),
    nextEntry: mapWordbookNeighbor(source.next_entry || source.nextEntry),
    collocations: Array.isArray(source.collocations)
      ? source.collocations.map(mapWordbookCollocation).filter(Boolean)
      : [],
    exampleEn: source.example_en || source.exampleEn || '',
    exampleZh: source.example_zh || source.exampleZh || '',
    collocationStatus: source.collocation_status || source.collocationStatus || 'pending',
    usageNote: source.usage_note || source.usageNote || '',
    raw: source
  };
}

function formatListeningDuration(item) {
  const ms = Number(item.duration_ms || item.durationMs || 0);
  const seconds = ms > 0 ? Math.round(ms / 1000) : Number(item.estimated_duration_seconds || item.estimatedDurationSeconds || 0);
  const mins = Math.floor(seconds / 60);
  const secs = Math.max(0, seconds % 60);
  return mins + ':' + String(secs).padStart(2, '0');
}

function mapListeningTag(value) {
  const source = asObject(value);
  const code = String(source.code || source.title || '').trim();
  if (!code) return null;
  const kind = source.kind || 'tag';
  return {
    code,
    title: source.title || code,
    kind,
    key: kind + ':' + code
  };
}

function fallbackListeningTags(source, typeLabels) {
  const tags = [];
  const type = source.material_type || source.materialType || '';
  const pushTag = (kind, code, title) => {
    if (!code) return;
    tags.push({ code, title: title || code, kind, key: kind + ':' + code });
  };
  if (type) pushTag('material_type', type, typeLabels[type] || type);
  const context = source.context || '';
  if (context) pushTag('context', context, source.category || context);
  const topic = source.topic || '';
  if (topic) pushTag('topic', topic, String(topic).replace(/[_-]/g, ' '));
  const rawTags = Array.isArray(source.tags) ? source.tags : [];
  rawTags.forEach((tag) => {
    const text = String(tag || '').trim();
    if (text) pushTag('tag', text, text.replace(/-/g, ' '));
  });
  return tags;
}

function mapListeningItem(value) {
  const source = asObject(value);
  const type = source.material_type || source.materialType || source.item_type || source.itemType || '';
  const typeLabels = {
    dialogue: '对话',
    monologue: '独白',
    informational: '讲解',
    quick_exchange: '短回应',
    everyday_service_conversation: '日常 / 服务对话',
    extended_conversation: '长对话',
    public_announcement: '公共说明 / 通知',
    news_report: '新闻 / 报道',
    listening_passage: '听力篇章',
    educational_discussion: '学习 / 校园讨论',
    academic_talk: '学术 / 知识讲解'
  };
  const difficultyCode = source.target_difficulty || source.targetDifficulty || source.difficulty || '';
  const difficultyLabels = { basic: '基础', intermediate: '中级', advanced: '进阶', high: '高阶' };
  const mappedTags = Array.isArray(source.content_tags || source.contentTags)
    ? (source.content_tags || source.contentTags).map(mapListeningTag).filter(Boolean)
    : [];
  return {
    id: String(source.id || ''),
    sourceId: source.source_id || source.sourceId || '',
    title: source.title || '',
    category: source.category || '',
    itemType: type,
    materialType: source.material_type || source.materialType || type,
    context: source.context || '',
    topic: source.topic || '',
    typeLabel: typeLabels[type] || '听力',
    targetDifficulty: difficultyCode,
    difficulty: source.difficulty_label || source.difficultyLabel || difficultyLabels[difficultyCode] || difficultyCode,
    contentTags: mappedTags.length ? mappedTags : fallbackListeningTags(source, typeLabels),
    wordCount: Number(source.word_count || source.wordCount || 0),
    durationLabel: formatListeningDuration(source),
    durationMs: Number(source.duration_ms || source.durationMs || 0),
    chineseSummary: source.chinese_summary || source.chineseSummary || '',
    audioStatus: source.audio_status || source.audioStatus || 'none',
    script: source.script || '',
    segments: Array.isArray(source.segments) ? source.segments.map((row, index) => ({
      position: Number(row.position || index + 1),
      speaker: row.speaker || '',
      text: row.text || '',
      chinese: row.chinese || '',
      startMs: row.start_ms == null ? null : Number(row.start_ms),
      endMs: row.end_ms == null ? null : Number(row.end_ms),
      inLibrary: Boolean(row.in_library || row.inLibrary),
      showChinese: false
    })) : [],
    raw: source
  };
}

function mapListeningListResponse(value) {
  const source = asObject(value);
  const defaultFilters = [
    { code: 'basic', title: '基础' },
    { code: 'intermediate', title: '中级' },
    { code: 'advanced', title: '进阶' },
    { code: 'high', title: '高阶' }
  ];
  const filters = Array.isArray(source.difficulty_filters || source.difficultyFilters)
    ? (source.difficulty_filters || source.difficultyFilters)
      .map((row) => ({ code: String(row.code || ''), title: row.title || row.code || '' }))
      .filter((row) => row.code)
    : defaultFilters;
  return {
    items: Array.isArray(source.items) ? source.items.map(mapListeningItem) : [],
    total: Number(source.total || 0),
    difficultyFilters: filters.length ? filters : defaultFilters,
    raw: source
  };
}

module.exports = {
  mapAuthResponse,
  mapUser,
  mapCard,
  mapCardListResponse,
  mapPassage,
  mapPassageListResponse,
  mapListeningItem,
  mapListeningListResponse,
  mapDiscoveryPack,
  mapDiscoveryItem,
  mapDiscoveryListResponse,
  mapDiscoveryCategory,
  mapDiscoveryCategoryListResponse,
  mapDiscoveryCursorResponse,
  mapPublicMaterialDetail,
  mapDailyDiscovery,
  mapReviewItem,
  mapReviewSessionResponse,
  mapWordbookReviewItem,
  mapWordbookReviewSession,
  mapReviewOverview,
  mapWordbook,
  mapWordbookEntry,
  mapWordbookDetail,
  mapWordbookEntryList,
  mapWordbookProgress,
  mapWordbookEntryDetail
};
