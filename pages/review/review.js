const {
  getCards,
  updateReviewResult,
  buildTodayReviewTasksFromCards,
  buildExtraReviewTasksFromCards,
  markCardReviewedToday,
  getTodayReviewedCardIds,
  getTodayReviewSummary
} = require('../../utils/recordStorage');

const REVIEW_PAGE_SESSION_PREFIX = 'reviewPageSession';

function getLocalCardsFast() {
  const cards = wx.getStorageSync('englishKnowledgeCards');

  if (!Array.isArray(cards)) {
    return [];
  }

  const cardMap = new Map();

  cards.forEach((card, index) => {
    const cardId = String((card && card.id) || `__index__${index}`);
    const currentCard = cardMap.get(cardId);
    const currentTime = Number(currentCard && (currentCard.updatedAt || currentCard.createdAt) || 0);
    const nextTime = Number(card && (card.updatedAt || card.createdAt) || 0);

    if (!currentCard || nextTime >= currentTime) {
      cardMap.set(cardId, card);
    }
  });

  return Array.from(cardMap.values()).filter((card) => !card.deleted);
}

function normalizeIdList(ids = []) {
  return (ids || []).map((id) => String(id)).filter(Boolean);
}

function getTaskList(result) {
  return Array.isArray(result && result.tasks) ? result.tasks : [];
}

function getNextExtraExcludeIds(todayTaskIds = [], extraSeenIds = []) {
  const todayIds = normalizeIdList(todayTaskIds);
  const extraIds = normalizeIdList(extraSeenIds);
  return normalizeIdList(todayIds.concat(extraIds));
}

function hasContinueTasksFromCards(cards, todayTaskIds = [], extraSeenIds = [], recentShownIds = []) {
  if (!Array.isArray(cards) || cards.length === 0) {
    return false;
  }

  const nextTodayTasks = getTaskList(
    buildTodayReviewTasksFromCards(cards, todayTaskIds)
  );

  if (nextTodayTasks.length > 0) {
    return true;
  }

  const nextExtraTasks = getTaskList(
    buildExtraReviewTasksFromCards(
      cards,
      getNextExtraExcludeIds(todayTaskIds, extraSeenIds),
      recentShownIds
    )
  );

  return nextExtraTasks.length > 0;
}

function padNumber(value) {
  return String(value).padStart(2, '0');
}

function getTodayDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = padNumber(date.getMonth() + 1);
  const day = padNumber(date.getDate());
  return `${year}-${month}-${day}`;
}

function getReviewPageSessionKey(date = new Date()) {
  return `${REVIEW_PAGE_SESSION_PREFIX}_${getTodayDateKey(date)}`;
}

function buildCardMap(cards = []) {
  const map = new Map();
  (cards || []).forEach((card) => {
    if (!card || !card.id) {
      return;
    }
    map.set(String(card.id), card);
  });
  return map;
}

Page({
  data: {
    tasks: [],
    taskIds: [],
    totalCount: 0,
    finishedCount: 0,
    remainingCount: 0,
    currentTaskIndex: 0,
    currentCard: null,
    answerVisible: false,
    preserveAnswerOnNextShow: false,
    allDone: false,
    isReviewing: false,
    isSubmitting: false,

    reviewMode: 'today', // today | extra
    todayTaskIds: [],
    extraSeenIds: [],

    hasMoreExtraTasks: false,
    todayReviewedIds: [],
    todayReviewSummary: {
      total: 0,
      easy: 0,
      good: 0,
      hard: 0,
      again: 0
    },
    masteredPercent: 0,
    needStrengthenPercent: 0,
    masteredPercentText: '0%',
    needStrengthenPercentText: '0%',

    totalCardCount: 0,

    hasUnfinishedSessionPrompt: false,
    unfinishedSessionText: '',
    pendingReviewSession: null,
    againReplayCounts: {},
  },

  loadTodayReviewSummary() {
    const todayReviewSummary = getTodayReviewSummary();
    const total = todayReviewSummary.total || 0;
    const mastered = (todayReviewSummary.easy || 0) + (todayReviewSummary.good || 0);
    const needStrengthen = (todayReviewSummary.hard || 0) + (todayReviewSummary.again || 0);
  
    const masteredPercent = total > 0 ? Math.round((mastered * 100) / total) : 0;
    const needStrengthenPercent = total > 0 ? Math.round((needStrengthen * 100) / total) : 0;

    this.setData({
      todayReviewSummary,
      masteredPercent,
      needStrengthenPercent,
      masteredPercentText: `${masteredPercent}%`,
      needStrengthenPercentText: `${needStrengthenPercent}%`
    });
  },

  onShow() {
    this.setData({
      todayReviewedIds: getTodayReviewedCardIds()
    });
    this.loadTodayReviewSummary();
  
    // 从“修改当前卡片”返回时，不弹继续提示，避免刚编辑完答案区被自动收起
    if (this.data.preserveAnswerOnNextShow) {
      this.setData({
        preserveAnswerOnNextShow: false
      });
      return;
    }
  
    const unfinishedSession = this.getUnfinishedReviewSession();
  
    if (unfinishedSession) {
      this.showUnfinishedSessionPrompt(unfinishedSession);
      return;
    }
  
    const restored = this.restoreReviewSession();
  
    if (restored) {
      return;
    }
  
    this.loadTodayTasks();
  },

  saveReviewSession() {
    const sessionKey = getReviewPageSessionKey();

    wx.setStorageSync(sessionKey, {
      taskIds: this.data.taskIds || [],
      currentTaskIndex: this.data.currentTaskIndex || 0,
      finishedCount: this.data.finishedCount || 0,
      remainingCount: this.data.remainingCount || 0,
      totalCount: this.data.totalCount || 0,
      allDone: Boolean(this.data.allDone),
      answerVisible: false,
      reviewMode: this.data.reviewMode || 'today',
      todayTaskIds: this.data.todayTaskIds || [],
      extraSeenIds: this.data.extraSeenIds || [],
      hasMoreExtraTasks: Boolean(this.data.hasMoreExtraTasks),
      againReplayCounts: this.data.againReplayCounts || {},
      savedAt: Date.now()
    });
  },

  clearReviewSession() {
    const sessionKey = getReviewPageSessionKey();
    wx.removeStorageSync(sessionKey);
  },

  getUnfinishedReviewSession() {
    try {
      const sessionKey = getReviewPageSessionKey();
      const session = wx.getStorageSync(sessionKey);
  
      if (!session || !Array.isArray(session.taskIds)) {
        return null;
      }
  
      if (session.allDone) {
        return null;
      }
  
      const localCards = getLocalCardsFast();
      const cardMap = buildCardMap(localCards);
  
      const tasks = session.taskIds
        .map((id) => cardMap.get(String(id)))
        .filter(Boolean);
  
        const currentTaskIndex = Number(session.currentTaskIndex || 0);
        const finishedCount = Number(session.finishedCount || 0);
        const currentCard = tasks[currentTaskIndex] || null;
        
        // 还停在第一张，且没有完成任何反馈：不展示“继续上次复习”提示
        // 这种情况用户感知上还没有中断一轮复习，直接进入复习页更自然
        if (currentTaskIndex <= 0 && finishedCount <= 0) {
          return null;
        }
        
        if (!tasks.length || !currentCard) {
          return null;
        }
  
      return {
        ...session,
        tasks,
        currentCard,
        currentTaskIndex,
        totalCount: Number(session.totalCount || tasks.length),
        finishedCount: Number(session.finishedCount || 0),
        remainingCount: Math.max(Number(session.remainingCount || (tasks.length - currentTaskIndex)), 0),
        totalCardCount: localCards.length,
        againReplayCounts: session.againReplayCounts || {}
      };
    } catch (error) {
      return null;
    }
  },
  
  showUnfinishedSessionPrompt(session) {
    const currentNumber = Number(session.currentTaskIndex || 0) + 1;
    const totalCount = Number(session.totalCount || session.tasks.length || 0);
  
    this.setData({
      hasUnfinishedSessionPrompt: true,
      unfinishedSessionText: `上次复习到第 ${currentNumber} / ${totalCount} 张`,
      pendingReviewSession: session,
  
      tasks: session.tasks || [],
      taskIds: normalizeIdList(session.taskIds),
      totalCount,
      finishedCount: Number(session.finishedCount || 0),
      remainingCount: Math.max(Number(session.remainingCount || 0), 0),
      currentTaskIndex: Number(session.currentTaskIndex || 0),
      currentCard: null,
      answerVisible: false,
      allDone: false,
      isReviewing: false,
      isSubmitting: false,
      reviewMode: session.reviewMode || 'today',
      todayTaskIds: normalizeIdList(session.todayTaskIds),
      extraSeenIds: normalizeIdList(session.extraSeenIds),
      hasMoreExtraTasks: Boolean(session.hasMoreExtraTasks),
      totalCardCount: Number(session.totalCardCount || getLocalCardsFast().length),
      todayReviewedIds: getTodayReviewedCardIds(),
      todayReviewSummary: getTodayReviewSummary(),
      againReplayCounts: session.againReplayCounts || {}
    });
  },
  
  continueUnfinishedReview() {
    this.setData({
      hasUnfinishedSessionPrompt: false,
      unfinishedSessionText: '',
      pendingReviewSession: null
    });
  
    const restored = this.restoreReviewSession();
  
    if (!restored) {
      wx.showToast({
        title: '上次进度已失效',
        icon: 'none'
      });
  
      this.clearReviewSession();
      this.loadTodayTasks();
    }
  },
  
  restartReviewSession() {
    const session = this.data.pendingReviewSession;
  
    if (!session || !Array.isArray(session.tasks) || session.tasks.length === 0) {
      this.clearReviewSession();
  
      this.setData({
        hasUnfinishedSessionPrompt: false,
        unfinishedSessionText: '',
        pendingReviewSession: null
      });
  
      this.loadTodayTasks();
      return;
    }
  
    const tasks = session.tasks;
    const taskIds = tasks.map((card) => card.id);
    const totalCount = tasks.length;
    const currentCard = tasks[0] || null;
  
    this.setData({
      hasUnfinishedSessionPrompt: false,
      unfinishedSessionText: '',
      pendingReviewSession: null,
  
      tasks,
      taskIds,
      totalCount,
      finishedCount: 0,
      remainingCount: totalCount,
      currentTaskIndex: 0,
      currentCard,
      answerVisible: false,
      allDone: false,
      isReviewing: false,
      isSubmitting: false,
      againReplayCounts: {},
  
      reviewMode: session.reviewMode || 'today',
      todayTaskIds: normalizeIdList(session.todayTaskIds),
      extraSeenIds: normalizeIdList(session.extraSeenIds),
      hasMoreExtraTasks: Boolean(session.hasMoreExtraTasks),
      totalCardCount: Number(session.totalCardCount || getLocalCardsFast().length),
      todayReviewedIds: getTodayReviewedCardIds(),
      todayReviewSummary: getTodayReviewSummary()
    }, () => {
      this.saveReviewSession();
    });
  },

  restoreReviewSession() {
    try {
      const sessionKey = getReviewPageSessionKey();
      const session = wx.getStorageSync(sessionKey);

      if (!session || !Array.isArray(session.taskIds)) {
        return false;
      }

      const localCards = getLocalCardsFast();
      const cardMap = buildCardMap(localCards);

      const tasks = session.taskIds
        .map((id) => cardMap.get(String(id)))
        .filter(Boolean);

      // 如果是已完成态：优先恢复“今日复习总结页”。
// 进入复习页时，不应该因为还有可复习卡片就自动开启新一轮；
// 后续继续学习应交给“继续复习”按钮。
if (session.allDone) {
  const normalizedTodayTaskIds = normalizeIdList(session.todayTaskIds);
  const normalizedExtraSeenIds = normalizeIdList(session.extraSeenIds);
  const normalizedSessionTaskIds = normalizeIdList(session.taskIds);

  const todayReviewSummary = getTodayReviewSummary();
  const sessionTotalCount = Number(session.totalCount || 0);
  const todaySummaryTotal = Number(todayReviewSummary.total || 0);

  const nextTodayTasks = getTaskList(
    buildTodayReviewTasksFromCards(localCards, normalizedTodayTaskIds)
  );

  const nextExtraTasks = getTaskList(
    buildExtraReviewTasksFromCards(
      localCards,
      getNextExtraExcludeIds(normalizedTodayTaskIds, normalizedExtraSeenIds),
      normalizedSessionTaskIds
    )
  );

  const hasAvailableTasks = nextTodayTasks.length > 0 || nextExtraTasks.length > 0;

  // 防止旧的“已完成 session”挡住新添加的卡片。
  // 如果今天统计为 0，但本地已经有可复习卡片，就不要恢复完成页，交给 loadTodayTasks() 重新建任务。
  if (
    localCards.length > 0 &&
    todaySummaryTotal === 0 &&
    hasAvailableTasks
  ) {
    this.clearReviewSession();
    return false;
  }

  // 旧空完成态也不应该挡住正常复习。
  if (
    localCards.length > 0 &&
    sessionTotalCount === 0 &&
    hasAvailableTasks
  ) {
    this.clearReviewSession();
    return false;
  }

  const hasMoreExtraTasks = hasContinueTasksFromCards(
    localCards,
    normalizedTodayTaskIds,
    normalizedExtraSeenIds,
    normalizedSessionTaskIds
  );

  const total = todayReviewSummary.total || 0;
  const mastered = (todayReviewSummary.easy || 0) + (todayReviewSummary.good || 0);
  const needStrengthen = (todayReviewSummary.hard || 0) + (todayReviewSummary.again || 0);

  const masteredPercent = total > 0 ? Math.round((mastered * 100) / total) : 0;
  const needStrengthenPercent = total > 0 ? Math.round((needStrengthen * 100) / total) : 0;

  this.setData({
    hasUnfinishedSessionPrompt: false,
    unfinishedSessionText: '',
    pendingReviewSession: null,
    tasks,
    taskIds: normalizedSessionTaskIds,
    totalCount: Number(session.totalCount || tasks.length),
    finishedCount: Number(session.finishedCount || session.totalCount || tasks.length),
    remainingCount: 0,
    currentTaskIndex: Number(session.currentTaskIndex || session.totalCount || tasks.length),
    currentCard: null,
    answerVisible: false,
    allDone: true,
    isReviewing: false,
    isSubmitting: false,
    reviewMode: session.reviewMode || 'today',
    todayTaskIds: normalizedTodayTaskIds,
    extraSeenIds: normalizedExtraSeenIds,
    hasMoreExtraTasks,
    totalCardCount: localCards.length,
    todayReviewedIds: getTodayReviewedCardIds(),
    todayReviewSummary,
    againReplayCounts: session.againReplayCounts || {},
    masteredPercent,
    needStrengthenPercent,
    masteredPercentText: `${masteredPercent}%`,
    needStrengthenPercentText: `${needStrengthenPercent}%`
  });

  return true;
}

      // 非完成态：必须保证还能恢复到当前那一张卡
      const currentTaskIndex = Number(session.currentTaskIndex || 0);
      const currentCard = tasks[currentTaskIndex] || null;

      if (!tasks.length || !currentCard) {
        return false;
      }

      const hasMoreExtraTasks = hasContinueTasksFromCards(
        localCards,
        normalizeIdList(session.todayTaskIds),
        normalizeIdList(session.extraSeenIds),
        normalizeIdList(session.taskIds)
      );

      this.setData({
        hasUnfinishedSessionPrompt: false,
        unfinishedSessionText: '',
        pendingReviewSession: null,
        tasks,
        taskIds: normalizeIdList(session.taskIds),
        totalCount: Number(session.totalCount || tasks.length),
        finishedCount: Number(session.finishedCount || 0),
        remainingCount: Math.max(Number(session.remainingCount || (tasks.length - currentTaskIndex)), 0),
        currentTaskIndex,
        currentCard,
        answerVisible: false,
        allDone: false,
        isReviewing: false,
        isSubmitting: false,
        reviewMode: session.reviewMode || 'today',
        todayTaskIds: normalizeIdList(session.todayTaskIds),
        extraSeenIds: normalizeIdList(session.extraSeenIds),
        hasMoreExtraTasks,
        totalCardCount: getLocalCardsFast().length,
        todayReviewedIds: getTodayReviewedCardIds(),
        todayReviewSummary: getTodayReviewSummary(),
        againReplayCounts: session.againReplayCounts || {},
      });

      return true;
    } catch (error) {
      return false;
    }
  },

  setTaskState({
    tasks = [],
    reviewMode = 'today',
    todayTaskIds = [],
    extraSeenIds = [],
    hasMoreExtraTasks = false
  }) {
    const totalCount = tasks.length;
    const currentCard = tasks[0] || null;
    const totalCardCount = getLocalCardsFast().length;

    this.setData({
      hasUnfinishedSessionPrompt: false,
      unfinishedSessionText: '',
      pendingReviewSession: null,
    
      tasks,
      taskIds: tasks.map((card) => card.id),
      totalCount,
      finishedCount: 0,
      remainingCount: totalCount,
      currentTaskIndex: 0,
      currentCard,
      answerVisible: false,
      allDone: totalCount === 0,
      isReviewing: false,
      isSubmitting: false,
      againReplayCounts: {},
      reviewMode,
      todayTaskIds: normalizeIdList(todayTaskIds),
      extraSeenIds: normalizeIdList(extraSeenIds),
      hasMoreExtraTasks,
      totalCardCount,
      todayReviewedIds: getTodayReviewedCardIds(),
      todayReviewSummary: getTodayReviewSummary(),
    }, () => {
      this.saveReviewSession();
    });
  },

  async loadTodayTasks() {
    try {
      const localCards = getLocalCardsFast();
  
      // 1. 一张卡都没有：进入无卡片空状态
      if (!localCards.length) {
        this.setTaskState({
          tasks: [],
          reviewMode: 'today',
          todayTaskIds: [],
          extraSeenIds: [],
          hasMoreExtraTasks: false
        });
        return;
      }
  
      // 2. 先尝试今日任务：到期卡 + 新卡
      const todayResult = buildTodayReviewTasksFromCards(localCards);
      const todayTasks = getTaskList(todayResult);
      const todayTaskIds = todayTasks.map((card) => card.id);
  
      if (todayTasks.length > 0) {
        this.setTaskState({
          tasks: todayTasks,
          reviewMode: 'today',
          todayTaskIds,
          extraSeenIds: [],
          hasMoreExtraTasks: hasContinueTasksFromCards(localCards, todayTaskIds, [], [])
        });
        return;
      }
  
      // 3. 有卡，但没有今日任务：直接进入 extra review，不展示“暂无到期任务”中间页
      const extraResult = buildExtraReviewTasksFromCards(localCards, [], []);
      const extraTasks = getTaskList(extraResult);
      const extraTaskIds = extraTasks.map((card) => card.id);
  
      if (extraTasks.length > 0) {
        this.setTaskState({
          tasks: extraTasks,
          reviewMode: 'extra',
          todayTaskIds: [],
          extraSeenIds: extraTaskIds,
          hasMoreExtraTasks: hasContinueTasksFromCards(localCards, [], extraTaskIds, extraTaskIds)
        });
        return;
      }
  
      // 4. 理论兜底：有卡但 extra 也没抽到
      this.setTaskState({
        tasks: [],
        reviewMode: 'extra',
        todayTaskIds: [],
        extraSeenIds: [],
        hasMoreExtraTasks: false
      });
    } catch (error) {
      wx.showToast({
        title: '今日任务加载失败',
        icon: 'none'
      });
    }
  },

  revealAnswer() {
    if (!this.data.currentCard || this.data.answerVisible) {
      return;
    }

    this.setData({
      answerVisible: true,
      isReviewing: true
    }, () => {
      this.saveReviewSession();
    });
  },

  hideAnswer() {
    if (!this.data.currentCard || !this.data.answerVisible) {
      return;
    }
  
    this.setData({
      answerVisible: false,
      isReviewing: false
    }, () => {
      this.saveReviewSession();
    });
  },

  getReviewFeedbackText(state, replayAdded = false) {
    if (state === '没记住') {
      return replayAdded ? '本轮稍后再复习一次' : '先放一放，明天再复习';
    }
  
    if (state === '模糊') {
      return '已降低间隔，之后再巩固';
    }
  
    if (state === '记住了') {
      return '已提升熟练度';
    }
  
    if (state === '太简单') {
      return '已大幅延后复习';
    }
  
    return '复习结果已更新';
  },

  async submitReview(event) {
    const { state } = event.currentTarget.dataset;
    const {
      currentCard,
      currentTaskIndex,
      totalCount,
      tasks,
      isSubmitting
    } = this.data;

    if (!currentCard || !state || isSubmitting) {
      return;
    }

    this.setData({
      isSubmitting: true
    });

    let updatedCard = null;

    try {
      updatedCard = await updateReviewResult(currentCard.id, state);
    } catch (error) {
      this.setData({
        isSubmitting: false
      });

      wx.showToast({
        title: '复习结果更新失败',
        icon: 'none'
      });
      return;
    }

    const nextTodayReviewedIds = markCardReviewedToday(currentCard.id);

    const nextTasks = tasks.slice();
    nextTasks[currentTaskIndex] = updatedCard;

    const currentCardId = String(currentCard.id);
    const nextAgainReplayCounts = {
      ...(this.data.againReplayCounts || {})
    };

    const currentReplayCount = Math.max(Number(nextAgainReplayCounts[currentCardId] || 0), 0);

    const shouldReplayWeakCard =
      (
        state === '没记住' &&
        currentReplayCount < 2
      ) ||
      (
        state === '模糊' &&
        currentReplayCount < 1
      );

    if (shouldReplayWeakCard) {
      nextTasks.push(updatedCard);
      nextAgainReplayCounts[currentCardId] = currentReplayCount + 1;
    }

    const nextIndex = currentTaskIndex + 1;
    const nextTotalCount = nextTasks.length;
    const finishedCount = nextIndex;
    const remainingCount = Math.max(nextTotalCount - finishedCount, 0);
    const nextCard = nextTasks[nextIndex] || null;
    const allDone = !nextCard;

    
    
    const localCards = getLocalCardsFast();
    const hasMoreExtraTasks = hasContinueTasksFromCards(
      localCards,
      this.data.todayTaskIds,
      this.data.extraSeenIds,
      this.data.taskIds
    );
    
    const todayReviewSummary = getTodayReviewSummary();
    const total = todayReviewSummary.total || 0;
    const mastered = (todayReviewSummary.easy || 0) + (todayReviewSummary.good || 0);
    const needStrengthen = (todayReviewSummary.hard || 0) + (todayReviewSummary.again || 0);
    
    const masteredPercent = total > 0 ? Math.round((mastered * 100) / total) : 0;
    const needStrengthenPercent = total > 0 ? Math.round((needStrengthen * 100) / total) : 0;
    
    this.setData({
      tasks: nextTasks,
      taskIds: nextTasks.map((card) => card.id),
      totalCount: nextTotalCount,
      againReplayCounts: nextAgainReplayCounts,
      currentTaskIndex: nextIndex,
      currentCard: nextCard,
      finishedCount,
      remainingCount,
      answerVisible: false,
      allDone,
      isReviewing: !allDone,
      isSubmitting: false,
      hasMoreExtraTasks,
      totalCardCount: localCards.length,
      todayReviewedIds: nextTodayReviewedIds,
      todayReviewSummary,
      masteredPercent,
      needStrengthenPercent,
      masteredPercentText: `${masteredPercent}%`,
      needStrengthenPercentText: `${needStrengthenPercent}%`
    }, () => {
      this.saveReviewSession();
    });
  },

  async continueReview() {
    if (this.data.totalCardCount === 0) {
      return;
    }

    try {
      const localCards = getLocalCardsFast();
      const {
        reviewMode,
        todayTaskIds,
        extraSeenIds
      } = this.data;

      if (reviewMode === 'today') {
        const nextTodayResult = buildTodayReviewTasksFromCards(localCards, todayTaskIds);
        const nextTodayTasks = getTaskList(nextTodayResult);

        if (nextTodayTasks.length > 0) {
          const nextTodayTaskIds = normalizeIdList(
            todayTaskIds.concat(nextTodayTasks.map((card) => card.id))
          );

          this.setTaskState({
            tasks: nextTodayTasks,
            reviewMode: 'today',
            todayTaskIds: nextTodayTaskIds,
            extraSeenIds,
            hasMoreExtraTasks: hasContinueTasksFromCards(
              localCards,
              nextTodayTaskIds,
              extraSeenIds,
              nextTodayTasks.map((card) => card.id)
            )
          });
          return;
        }
      }

      const extraExcludeIds = getNextExtraExcludeIds(todayTaskIds, extraSeenIds);
      const extraResult = buildExtraReviewTasksFromCards(
        localCards,
        extraExcludeIds,
        this.data.taskIds
      );
      const tasks = getTaskList(extraResult);

      if (tasks.length === 0) {
        wx.showToast({
          title: '暂时没有可复习的卡片',
          icon: 'none'
        });
        this.setData({
          hasMoreExtraTasks: false
        }, () => {
          this.saveReviewSession();
        });
        return;
      }

      const nextExtraSeenIds = extraResult.didResetCycle
        ? normalizeIdList(tasks.map((card) => card.id))
        : normalizeIdList(extraExcludeIds.concat(tasks.map((card) => card.id)));

      this.setTaskState({
        tasks,
        reviewMode: 'extra',
        todayTaskIds,
        extraSeenIds: nextExtraSeenIds,
        hasMoreExtraTasks: hasContinueTasksFromCards(
          localCards,
          todayTaskIds,
          nextExtraSeenIds,
          tasks.map((card) => card.id)
        )
      });
    } catch (error) {
      wx.showToast({
        title: '继续复习加载失败',
        icon: 'none'
      });
    }
  },

  editCurrentCard() {
    const { currentCard } = this.data;
  
    if (!currentCard || !currentCard.id) {
      return;
    }
  
    this.setData({
      preserveAnswerOnNextShow: true
    });
  
    wx.navigateTo({
      url: `/pages/add/add?id=${currentCard.id}&from=review`
    });
  },

  applyEditedCardFromReview(cardId) {
    if (!cardId) {
      return;
    }

    const localCards = getLocalCardsFast();
    const updatedCard = localCards.find((card) => String(card.id) === String(cardId));

    if (!updatedCard) {
      return;
    }

    const nextTasks = (this.data.tasks || []).map((card) => {
      return String(card.id) === String(cardId) ? updatedCard : card;
    });

    const currentCard = this.data.currentCard && String(this.data.currentCard.id) === String(cardId)
      ? updatedCard
      : this.data.currentCard;

    this.setData({
      tasks: nextTasks,
      taskIds: nextTasks.map((card) => card.id),
      currentCard,
      answerVisible: true,
      isReviewing: true
    }, () => {
      this.saveReviewSession();
    });
  },


  viewTodayReviewedContent() {
    const todayReviewedIds = getTodayReviewedCardIds();

    if (!todayReviewedIds.length) {
      wx.showToast({
        title: '今天还没有复习记录',
        icon: 'none'
      });
      return;
    }

    this.saveReviewSession();

    const app = getApp();
    app.globalData = app.globalData || {};
    app.globalData.indexViewMode = {
      mode: 'today_reviewed',
      source: 'review',
      ts: Date.now()
    };

    wx.navigateTo({
      url: '/pages/index/index'
    });
  },

  viewHistoryReviewedContent() {
    this.saveReviewSession();

    wx.navigateTo({
      url: '/pages/history_reviewed/history_index'
    });
  },

  goToAddPage() {
    wx.navigateTo({
      url: '/pages/add/add'
    });
  }


});

