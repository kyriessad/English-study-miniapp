/**
 * Phase 4B 首页验收测试脚本
 *
 * 用法：在微信开发者工具 Console 中，复制整个文件内容粘贴运行。
 * 不需要 import / require，自执行。
 *
 * 功能：
 * - 检查当前是否在首页
 * - 检查首页核心数据结构
 * - 检查 reviewOverview / cardStats / libraryTabs 字段完整性
 * - 兼容 reviewOverview 新旧两种结构（flat / nested）
 * - 检查 reviewActions 按钮状态
 * - 检查卡片状态合法性（只允许 new / reviewing / strengthening / mastered）
 * - 检查当前 Tab 列表是否混入错误状态
 * - 检查缓存是否存在
 * - 检查卡片显示状态标签
 * - 输出 PASS / WARNING / FAIL 汇总
 */

(() => {
  'use strict';

  // ===== 辅助函数 =====

  const results = { pass: 0, warn: 0, fail: 0 };

  function PASS(msg) {
    results.pass += 1;
    console.log('[PASS] ' + msg);
  }

  function WARN(msg) {
    results.warn += 1;
    console.log('[WARN] ' + msg);
  }

  function FAIL(msg) {
    results.fail += 1;
    console.log('%c[FAIL] ' + msg, 'color: #d9534f; font-weight: bold;');
  }

  function INFO(msg) {
    console.log('[INFO] ' + msg);
  }

  function fmt(obj) {
    try {
      return JSON.stringify(obj, null, 2);
    } catch (_) {
      return String(obj);
    }
  }

  function isValidState(s) {
    return s === 'new' || s === 'reviewing' || s === 'strengthening' || s === 'mastered';
  }

  const VALID_STATES = ['new', 'reviewing', 'strengthening', 'mastered'];
  const TAB_LABELS = {
    all: '全部',
    new: '未学习',
    reviewing: '学习中',
    strengthening: '需加强',
    mastered: '已掌握'
  };

  // ===== 归一化 reviewOverview =====
  //
  // 兼容旧结构（flat）:
  //   { total_today, to_new, to_review, strengthening_in_review, active_session }
  //
  // 兼容新结构（nested）:
  //   { suggested: { total, total_today, new, to_new, review, to_review, strengthening, strengthening_in_review },
  //     completed_suggested: {...}, extra_today: {...}, is_all_done, active_session }
  //
  // 同时容忍驼峰/蛇形命名混用。

  function normalizeReviewOverview(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const result = {
      totalToday: undefined,
      toNew: undefined,
      toReview: undefined,
      strengtheningInReview: undefined,
      activeSession: null,
      sourceShape: 'unknown'
    };

    // 判断结构类型
    const s = (raw.suggested && typeof raw.suggested === 'object') ? raw.suggested : null;
    if (s) {
      result.sourceShape = 'nested';
    } else if ('total_today' in raw || 'to_new' in raw || 'totalToday' in raw || 'toNew' in raw) {
      result.sourceShape = 'flat';
    }

    // 从候选列表中返回第一个有定义且非 null 的值
    function val() {
      for (let i = 0; i < arguments.length; i++) {
        const c = arguments[i];
        if (c !== undefined && c !== null) return c;
      }
      return undefined;
    }

    // toNew — 容忍多种命名
    result.toNew = val(
      raw.to_new, raw.toNew, raw.new, raw.new_count,
      s && s.new, s && s.new_count, s && s.to_new, s && s.toNew
    );

    // toReview — 容忍多种命名
    result.toReview = val(
      raw.to_review, raw.toReview, raw.review, raw.review_count, raw.due, raw.due_count,
      s && s.review, s && s.review_count, s && s.due, s && s.due_count,
      s && s.to_review, s && s.toReview
    );

    // strengtheningInReview — 容忍多种命名
    result.strengtheningInReview = val(
      raw.strengthening_in_review, raw.strengtheningInReview, raw.strengthening, raw.strengthening_count,
      s && s.strengthening, s && s.strengthening_count, s && s.strengthening_in_review, s && s.strengtheningInReview
    );

    // totalToday — 优先直接从字段读取，失败则降级为 toNew + toReview + strengtheningInReview
    result.totalToday = val(
      raw.total_today, raw.totalToday, raw.total, raw.today_total,
      s && s.total, s && s.total_today, s && s.totalToday, s && s.today_total,
      s && s.count, s && s.task_count, s && s.total_count
    );
    if (result.totalToday === undefined &&
        result.toNew !== undefined &&
        result.toReview !== undefined &&
        result.strengtheningInReview !== undefined) {
      result.totalToday = result.toNew + result.toReview + result.strengtheningInReview;
    }

    // activeSession
    result.activeSession = raw.active_session || raw.activeSession || null;

    return result;
  }

  console.log('');
  console.log('%c========== Phase 4B 首页验收测试 ==========', 'font-size: 16px; font-weight: bold;');
  console.log('');

  // ===== A. 检查当前页面 =====

  console.log('%c--- A. 页面检查 ---', 'font-weight: bold;');

  let page = null;
  try {
    const pages = getCurrentPages();
    if (!pages || pages.length === 0) {
      FAIL('getCurrentPages() 返回空，可能不在页面环境中');
      console.log('%c❌ 测试终止：无法获取页面栈', 'color: #d9534f; font-size: 14px;');
      return;
    }
    page = pages[pages.length - 1];
    const route = page && page.route;
    if (!route) {
      FAIL('当前页面没有 route 属性');
      console.log('%c❌ 测试终止：无法判断当前页面', 'color: #d9534f; font-size: 14px;');
      return;
    }
    if (!route.includes('pages/index/index')) {
      FAIL('当前不在首页，当前 route: ' + route);
      INFO('请先在微信开发者工具中打开首页（pages/index/index），然后再运行此脚本');
      console.log('%c❌ 测试终止：不在首页', 'color: #d9534f; font-size: 14px;');
      return;
    }
    PASS('当前在首页，route: ' + route);
  } catch (e) {
    FAIL('获取当前页面时出错: ' + e.message);
    console.log('%c❌ 测试终止：页面获取异常', 'color: #d9534f; font-size: 14px;');
    return;
  }

  // ===== B. 检查核心数据结构 =====

  console.log('');
  console.log('%c--- B. 核心数据结构检查 ---', 'font-weight: bold;');

  const data = page && page.data;
  if (!data) {
    FAIL('page.data 不存在');
    return;
  }

  const coreFields = ['reviewOverview', 'cardStats', 'libraryTabs', 'currentLibraryTab', 'cards', 'filteredCards'];
  const existence = {};
  coreFields.forEach((field) => {
    if (field in data) {
      existence[field] = true;
      PASS(field + ' 存在');
    } else {
      existence[field] = false;
      FAIL(field + ' 不存在');
    }
  });

  // 如果核心字段缺失，终止
  if (coreFields.some((f) => !existence[f])) {
    FAIL('核心数据结构不完整，跳过后续部分检查');
    console.log('%c❌ 测试终止：核心数据缺失', 'color: #d9534f; font-size: 14px;');
    return;
  }

  // ===== C. 检查 reviewOverview（兼容新旧结构） =====

  console.log('');
  console.log('%c--- C. reviewOverview 字段检查 ---', 'font-weight: bold;');

  let normalizedOverview = null;
  const overview = data.reviewOverview;
  if (overview === null || overview === undefined) {
    WARN('reviewOverview 为 null（可能后端未响应，不影响页面展示；只要 cards / filteredCards 正常即可）');
  } else if (typeof overview !== 'object') {
    FAIL('reviewOverview 不是对象，实际类型: ' + typeof overview);
  } else {
    // 调试：输出原始 reviewOverview 完整结构
    console.log('[INFO] raw reviewOverview =', overview);
    console.log('[INFO] reviewOverview keys =', Object.keys(overview));
    if (overview.suggested) {
      console.log('[INFO] reviewOverview.suggested =', overview.suggested);
      console.log('[INFO] suggested keys =', Object.keys(overview.suggested));
    }

    normalizedOverview = normalizeReviewOverview(overview);
    if (!normalizedOverview) {
      FAIL('reviewOverview 无法归一化，原始值: ' + fmt(overview));
    } else {
      INFO('reviewOverview sourceShape: ' + normalizedOverview.sourceShape);
      INFO('normalized: totalToday=' + normalizedOverview.totalToday +
           ', toNew=' + normalizedOverview.toNew +
           ', toReview=' + normalizedOverview.toReview +
           ', strengtheningInReview=' + normalizedOverview.strengtheningInReview +
           ', activeSession=' + (normalizedOverview.activeSession ? '存在' : 'null'));

      // 输出原始结构摘要辅助调试
      INFO('reviewOverview 原始键: ' + Object.keys(overview).join(', '));
      if (overview.suggested) {
        INFO('reviewOverview.suggested 键: ' + Object.keys(overview.suggested).join(', '));
      }

      // 检查四个核心字段是否为 number（0 是合法值）
      const numFields = [
        { key: 'totalToday', label: 'totalToday' },
        { key: 'toNew', label: 'toNew' },
        { key: 'toReview', label: 'toReview' },
        { key: 'strengtheningInReview', label: 'strengtheningInReview' }
      ];
      const missingFields = [];
      numFields.forEach((f) => {
        if (typeof normalizedOverview[f.key] === 'number') {
          PASS('reviewOverview.' + f.label + ' = ' + normalizedOverview[f.key] + ' 是合法数字');
        } else {
          missingFields.push(f.label);
        }
      });

      if (missingFields.length === 0) {
        PASS('reviewOverview 四个核心字段归一化成功，均为数字');
      } else {
        const isNested = normalizedOverview.sourceShape === 'nested';
        const hasReviewActions = data.reviewActions && typeof data.reviewActions === 'object';

        if (isNested) {
          // nested 结构：字段缺失说明后端省略了 0 字段，缺省为 0 并 WARNING
          missingFields.forEach((label) => {
            normalizedOverview[label] = 0;
            WARN('reviewOverview.' + label + ' 在 suggested 中未找到，缺省为 0（后端可能省略 0 字段，不影响展示）');
          });
        } else if (hasReviewActions) {
          // reviewActions 已存在：页面正常，不阻断
          missingFields.forEach((label) => {
            WARN('reviewOverview.' + label + ' 未找到，但 reviewActions 已存在，页面可能正常');
          });
        } else {
          // 无法降级：FAIL
          missingFields.forEach((label) => {
            FAIL('reviewOverview.' + label + ' 不是数字，实际: ' + typeof normalizedOverview[label] + ' = ' + normalizedOverview[label]);
          });
        }
      }
    }
  }

  // ===== C2. 检查 reviewActions =====

  console.log('');
  console.log('%c--- C2. reviewActions 检查 ---', 'font-weight: bold;');

  const reviewActions = data.reviewActions;
  if (!reviewActions || typeof reviewActions !== 'object') {
    WARN('reviewActions 不存在或不是对象（未实现复习按钮时不阻断）');
  } else {
    PASS('reviewActions 存在');
    const actionKeys = ['daily', 'newOnly', 'strengthening'];
    const requiredActionFields = ['enabled', 'label'];
    let allActionsOk = true;

    actionKeys.forEach((key) => {
      const action = reviewActions[key];
      if (!action || typeof action !== 'object') {
        FAIL('reviewActions.' + key + ' 不存在或不是对象');
        allActionsOk = false;
        return;
      }
      requiredActionFields.forEach((rf) => {
        if (!(rf in action)) {
          FAIL('reviewActions.' + key + ' 缺少字段: ' + rf);
          allActionsOk = false;
        }
      });
    });

    if (allActionsOk) {
      PASS('reviewActions daily / newOnly / strengthening 均包含 enabled 和 label');

      // 输出 label
      INFO('reviewActions labels: daily="' + (reviewActions.daily.label || '') +
           '", newOnly="' + (reviewActions.newOnly.label || '') +
           '", strengthening="' + (reviewActions.strengthening.label || '') + '"');

      // 当全部为零且无 activeSession 时，enabled 必须为 false
      if (normalizedOverview &&
          normalizedOverview.totalToday === 0 &&
          normalizedOverview.toNew === 0 &&
          normalizedOverview.toReview === 0 &&
          normalizedOverview.strengtheningInReview === 0 &&
          !normalizedOverview.activeSession) {
        actionKeys.forEach((key) => {
          if (reviewActions[key].enabled !== false) {
            FAIL('reviewActions.' + key + '.enabled 应为 false（全部为零且无 activeSession 时），实际为 ' + fmt(reviewActions[key].enabled));
          }
        });
      }
    }
  }

  // ===== D. 检查 cardStats =====

  console.log('');
  console.log('%c--- D. cardStats 字段检查 ---', 'font-weight: bold;');

  const stats = data.cardStats;
  if (stats === null || stats === undefined) {
    WARN('cardStats 为 null（可能后端未响应）');
  } else if (typeof stats !== 'object') {
    FAIL('cardStats 不是对象，实际类型: ' + typeof stats);
  } else {
    const statsFields = ['total', 'new', 'reviewing', 'strengthening', 'mastered'];
    const statsOk = {};
    statsFields.forEach((f) => {
      if (f in stats) {
        statsOk[f] = true;
      } else {
        statsOk[f] = false;
        FAIL('cardStats 缺少字段: ' + f);
      }
    });
    if (statsFields.every((f) => statsOk[f])) {
      PASS('cardStats 包含全部必要字段');
    }

    // 检查 total 一致性
    if (statsOk.total && statsOk.new && statsOk.reviewing && statsOk.strengthening && statsOk.mastered) {
      const sum =
        Number(stats.new || 0) +
        Number(stats.reviewing || 0) +
        Number(stats.strengthening || 0) +
        Number(stats.mastered || 0);
      const total = Number(stats.total || 0);
      if (total === sum) {
        PASS('cardStats total=' + total + ' 等于 new+reviewing+strengthening+mastered=' + sum);
      } else {
        WARN('cardStats total 不一致: total=' + total + ', 子项之和=' + sum + '（可能因过滤/软删除导致，注意检查）');
      }
    }

    INFO('cardStats 当前值:');
    console.table([
      { stat: 'total', count: stats.total },
      { stat: 'new', count: stats.new },
      { stat: 'reviewing', count: stats.reviewing },
      { stat: 'strengthening', count: stats.strengthening },
      { stat: 'mastered', count: stats.mastered }
    ]);
  }

  // ===== E. 检查 libraryTabs =====

  console.log('');
  console.log('%c--- E. libraryTabs 检查 ---', 'font-weight: bold;');

  const tabs = data.libraryTabs;
  if (!Array.isArray(tabs)) {
    FAIL('libraryTabs 不是数组，实际类型: ' + typeof tabs);
  } else {
    const tabKeys = tabs.map((t) => t.key);
    const tabLabels = tabs.reduce((acc, t) => { acc[t.key] = t.label; return acc; }, {});
    const expectedKeys = ['all', 'new', 'reviewing', 'strengthening', 'mastered'];
    const expectedLabels = { all: '全部', new: '未学习', reviewing: '学习中', strengthening: '需加强', mastered: '已掌握' };
    let allOk = true;

    expectedKeys.forEach((key) => {
      if (!tabKeys.includes(key)) {
        FAIL('libraryTabs 缺少 key="' + key + '" 的 tab');
        allOk = false;
      } else if (tabLabels[key] !== expectedLabels[key]) {
        FAIL('libraryTabs key="' + key + '" 的标题应为 "' + expectedLabels[key] + '"，实际为 "' + tabLabels[key] + '"');
        allOk = false;
      }
    });

    if (allOk && tabKeys.length === expectedKeys.length) {
      PASS('libraryTabs 包含全部 5 个正确 Tab');
    } else if (allOk && tabKeys.length > expectedKeys.length) {
      WARN('libraryTabs 包含多余 tab: ' + tabKeys.filter((k) => !expectedKeys.includes(k)).join(', '));
    }

    INFO('libraryTabs 当前状态:');
    console.table(tabs.map((t) => ({ key: t.key, label: t.label, count: t.count })));
  }

  // ===== F. 检查 currentLibraryTab =====

  console.log('');
  console.log('%c--- F. currentLibraryTab 检查 ---', 'font-weight: bold;');

  const currentTab = data.currentLibraryTab;
  if (VALID_STATES.includes(currentTab) || currentTab === 'all') {
    PASS('currentLibraryTab = "' + currentTab + '" 合法');
  } else {
    FAIL('currentLibraryTab 值非法: "' + currentTab + '"，应为 all / new / reviewing / strengthening / mastered');
  }
  INFO('currentLibraryTab = "' + currentTab + '"');

  // ===== G. 检查 cards / filteredCards =====

  console.log('');
  console.log('%c--- G. cards / filteredCards 检查 ---', 'font-weight: bold;');

  if (!Array.isArray(data.cards)) {
    FAIL('cards 不是数组');
    INFO('  typeof cards: ' + typeof data.cards);
    INFO('  cards constructor name: ' + (data.cards && data.cards.constructor && data.cards.constructor.name) || 'N/A');
    INFO('  可用 data keys（前 20 个）: ' + Object.keys(data).slice(0, 20).join(', '));
    if (data.cards && typeof data.cards.then === 'function') {
      INFO('  cards 是一个 Promise（说明 getCards() 的结果未 await）');
    }
  } else {
    PASS('cards 是数组，长度: ' + data.cards.length);
  }

  if (!Array.isArray(data.filteredCards)) {
    FAIL('filteredCards 不是数组');
    INFO('  typeof filteredCards: ' + typeof data.filteredCards);
    if (data.filteredCards && typeof data.filteredCards.then === 'function') {
      INFO('  filteredCards 是一个 Promise');
    }
  } else {
    PASS('filteredCards 是数组，长度: ' + data.filteredCards.length);
  }

  // ===== H. 卡片状态合法性 =====

  console.log('');
  console.log('%c--- H. 卡片状态合法性检查 ---', 'font-weight: bold;');

  const allReviewableCards = []
    .concat(Array.isArray(data.cards) ? data.cards : [])
    .concat(Array.isArray(data.filteredCards) ? data.filteredCards : [])
    .filter(Boolean);

  // 去重（按 id）
  const seenIds = new Set();
  const uniqueCards = allReviewableCards.filter((c) => {
    const id = String(c && c.id || '');
    if (!id || seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  });

  if (uniqueCards.length === 0) {
    WARN('没有卡片可检查状态（空库正常）');
  } else {
    const badCards = [];
    uniqueCards.forEach((c) => {
      const stateV2 = c.reviewStateV2 || c.review_state || '';
      if (!stateV2) {
        badCards.push({
          id: c.id,
          englishText: (c.englishText || c.englishPreview || '').slice(0, 30),
          problem: '缺少 reviewStateV2 和 review_state'
        });
      } else if (!isValidState(stateV2)) {
        badCards.push({
          id: c.id,
          englishText: (c.englishText || c.englishPreview || '').slice(0, 30),
          problem: '非法状态: "' + stateV2 + '"'
        });
      }
    });

    if (badCards.length === 0) {
      PASS('所有 ' + uniqueCards.length + ' 张卡片状态合法');
    } else {
      WARN('发现 ' + badCards.length + ' 张卡片状态异常（前 10 张）:');
      console.table(badCards.slice(0, 10));
    }
  }

  // ===== I. Tab 列表一致性 =====

  console.log('');
  console.log('%c--- I. Tab 列表一致性检查 ---', 'font-weight: bold;');

  if (currentTab && currentTab !== 'all' && VALID_STATES.includes(currentTab)) {
    const filtered = Array.isArray(data.filteredCards) ? data.filteredCards : [];
    if (filtered.length === 0) {
      INFO('当前 Tab "' + currentTab + '" 列表为空，跳过一致性检查');
    } else {
      const mismatched = [];
      filtered.forEach((c) => {
        const stateV2 = c.reviewStateV2 || c.review_state || '';
        if (stateV2 !== currentTab) {
          mismatched.push({
            id: c.id,
            englishText: (c.englishText || c.englishPreview || '').slice(0, 30),
            expectedState: currentTab,
            actualState: stateV2 || '(空)'
          });
        }
      });

      if (mismatched.length === 0) {
        PASS('filteredCards 全部匹配 currentLibraryTab="' + currentTab + '"');
      } else {
        FAIL('filteredCards 中有 ' + mismatched.length + ' 张不匹配 Tab="' + currentTab + '"（前 10 张）:');
        console.table(mismatched.slice(0, 10));
      }
    }
  } else if (currentTab === 'all') {
    PASS('currentTab=all，不检查列表一致性（全部状态均可出现）');
  } else {
    WARN('currentTab 无效，跳过 Tab 一致性检查');
  }

  // ===== J. 缓存检查 =====

  console.log('');
  console.log('%c--- J. 缓存检查 ---', 'font-weight: bold;');

  const cacheKeys = ['reviewOverviewCache', 'cardStatsCache', 'cardsFirstPageCache'];
  cacheKeys.forEach((key) => {
    try {
      const cached = wx.getStorageSync(key);
      if (cached !== undefined && cached !== null && cached !== '') {
        PASS('缓存 "' + key + '" 存在');
        if (typeof cached === 'object' && cached !== null) {
          const summary = {};
          Object.keys(cached).slice(0, 5).forEach((k) => { summary[k] = typeof cached[k] === 'object' ? '[object]' : cached[k]; });
          INFO('  ' + key + ' 结构摘要: ' + fmt(summary));
        }
      } else {
        INFO('缓存 "' + key + '" 不存在（首次加载或后端未响应时正常）');
      }
    } catch (e) {
      INFO('读取缓存 "' + key + '" 时出错: ' + e.message + '（首次运行正常）');
    }
  });

  // 额外：检查一页卡片缓存是否存在
  try {
    const cardsCache = wx.getStorageSync('cardsCache');
    if (cardsCache !== undefined && cardsCache !== null && cardsCache !== '') {
      const cardCount = Array.isArray(cardsCache) ? cardsCache.length : '非数组';
      INFO('cardsCache 存在，长度: ' + cardCount);
    } else {
      INFO('cardsCache 不存在');
    }
  } catch (e) {
    INFO('读取 cardsCache 时出错: ' + e.message);
  }

  // ===== K. 卡片数量一致性检查 =====

  console.log('');
  console.log('%c--- K. 卡片数量一致性检查 ---', 'font-weight: bold;');

  const cardsArr = Array.isArray(data.cards) ? data.cards : [];
  const filteredCardsArr = Array.isArray(data.filteredCards) ? data.filteredCards : [];
  const tabsArr = Array.isArray(data.libraryTabs) ? data.libraryTabs : [];

  INFO('cards.length = ' + cardsArr.length);
  INFO('filteredCards.length = ' + filteredCardsArr.length);

  // 检查 cardsCache
  try {
    const cardsCache = wx.getStorageSync('cardsCache');
    const cacheCards = Array.isArray(cardsCache) ? cardsCache : (Array.isArray(cardsCache && cardsCache.cards) ? cardsCache.cards : []);
    const cacheLen = cacheCards.length;
    INFO('cardsCache 解析后长度: ' + cacheLen);

    if (cacheLen > 0 && cardsArr.length === 0) {
      FAIL('cardsCache 有 ' + cacheLen + ' 张卡片，但 page.data.cards 为空');
    } else if (cacheLen > 0) {
      PASS('cardsCache (' + cacheLen + ') 与 page.data.cards (' + cardsArr.length + ') 一致（有卡片）');
    }
  } catch (e) {
    INFO('解析 cardsCache 时出错: ' + e.message);
  }

  // 检查搜索词和筛选条件
  const searchKw = data.searchKeyword || '';
  const catFilter = data.selectedCategoryFilter || '全部';
  const sceneFilter = data.selectedExamSceneFilter || '全部';
  const modFilter = data.selectedExamModuleFilter || '全部';
  INFO('搜索词: "' + searchKw + '"');
  INFO('筛选条件: category="' + catFilter + '", examScene="' + sceneFilter + '", examModule="' + modFilter + '"');

  // 检查 filteredCards 在无筛选时不应为空
  const noSearch = !searchKw.trim();
  const noFilters = catFilter === '全部' && sceneFilter === '全部' && modFilter === '全部';
  const curTab = data.currentLibraryTab || 'all';

  if (curTab === 'all' && noSearch && noFilters && cardsArr.length > 0 && filteredCardsArr.length === 0) {
    FAIL('currentLibraryTab=all，无搜索/筛选，cards.length=' + cardsArr.length + ' 但 filteredCards 为空');
  } else if (curTab === 'all' && noSearch && noFilters && cardsArr.length > 0) {
    PASS('currentLibraryTab=all 无筛选，filteredCards.length=' + filteredCardsArr.length + ' 匹配 cards.length=' + cardsArr.length);
  }

  // 检查 libraryTabs all.count
  if (cardsArr.length > 0 && tabsArr.length > 0) {
    const allTab = tabsArr.find(function(t) { return t.key === 'all'; });
    if (allTab) {
      INFO('libraryTabs all.count = ' + allTab.count);
      if (allTab.count === 0) {
        FAIL('cards.length=' + cardsArr.length + ' 但 libraryTabs 的 all.count=0');
      } else {
        PASS('libraryTabs all.count=' + allTab.count + ' 与 cards.length=' + cardsArr.length + ' 匹配');
      }
    } else {
      FAIL('libraryTabs 缺少 key="all" 的 tab');
    }
  }

  // ===== L. 卡片显示状态标签检查（非阻断） =====

  console.log('');
  console.log('%c--- L. 卡片显示状态标签检查 ---', 'font-weight: bold;');

  const cardsForLabelCheck = Array.isArray(data.cards) ? data.cards : [];
  if (cardsForLabelCheck.length === 0) {
    INFO('没有卡片，跳过显示状态标签检查');
  } else {
    const anomalousLabels = [];
    cardsForLabelCheck.forEach((c) => {
      // 检查 pending 无时间戳的卡片是否显示 "待重试"
      const isPending = c.analysisStatus === 'pending' || c.analysis_status === 'pending';
      const hasTimestamp = 'updated_at' in c || 'updatedAt' in c ||
                           'created_at' in c || 'createdAt' in c ||
                           'analysisUpdatedAt' in c || 'analysis_updated_at' in c;

      if (isPending && !hasTimestamp) {
        if (c.displayStatusLabel !== '待重试') {
          anomalousLabels.push({
            id: c.id,
            englishText: (c.englishText || c.englishPreview || '').slice(0, 30),
            expected: '待重试',
            actual: c.displayStatusLabel || '(无)'
          });
        }
      }
    });

    if (anomalousLabels.length === 0) {
      PASS('卡片显示状态标签检查通过');
    } else {
      WARN('发现 ' + anomalousLabels.length + ' 张 pending 无时间戳但 displayStatusLabel 不是"待重试"（前 10 张）:');
      console.table(anomalousLabels.slice(0, 10));
    }

    // 统计 displayStatusLabel / displayStatusClass 覆盖率
    let hasLabelCount = 0;
    let hasClassCount = 0;
    cardsForLabelCheck.forEach((c) => {
      if ('displayStatusLabel' in c) hasLabelCount++;
      if ('displayStatusClass' in c) hasClassCount++;
    });
    INFO('displayStatusLabel 覆盖率: ' + hasLabelCount + '/' + cardsForLabelCheck.length);
    INFO('displayStatusClass 覆盖率: ' + hasClassCount + '/' + cardsForLabelCheck.length);
  }

  // ===== M. 最终汇总 =====

  console.log('');
  console.log('%c========== Phase 4B Home Check Result ==========', 'font-size: 16px; font-weight: bold;');
  console.log('');
  console.log('PASS: ' + results.pass);
  console.log('WARNING: ' + results.warn);
  console.log('FAIL: ' + results.fail);
  console.log('');

  if (results.fail === 0) {
    console.log('%c✅ Phase 4B 首页基础结构检查通过，可以继续手动交互验收。', 'color: #28a745; font-size: 14px; font-weight: bold;');
  } else {
    console.log('%c❌ Phase 4B 首页基础结构存在阻断问题，请先修复 FAIL 项。', 'color: #d9534f; font-size: 14px; font-weight: bold;');
  }

  console.log('');
  console.log('复查建议:');
  console.log('  - 如果 FAIL > 0: 先修复阻断问题');
  console.log('  - 如果只有 WARNING: 注意检查 WARNING 项，但通常不影响核心功能');
  console.log('  - 如果全部 PASS: 进入微信开发者工具手动验收');
  console.log('');
  console.log('手动验收 Checklist:');
  console.log('  1. 今日任务看板显示总任务数、新卡、到期复习、需加强');
  console.log('  2. 无 active_session 时显示"开始今日复习"，有时显示"继续复习"');
  console.log('  3. 卡片库 5 个 Tab 点击切换正常');
  console.log('  4. Tab 列表只显示对应状态的卡片');
  console.log('  5. 搜索只筛选当前 Tab 卡片');
  console.log('  6. 断开后端后首页不白屏');
  console.log('');
})();
