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

module.exports = {
  mapAuthResponse,
  mapUser,
  mapCard,
  mapCardListResponse,
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
  mapWordbookProgress
};
