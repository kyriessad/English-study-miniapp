const CATEGORY_LABELS = {
  word: '单词',
  phrase: '短语',
  sentence: '句子',
  paragraph: '段落'
};

const CATEGORY_VALUES = ['单词', '短语', '句子'];

function cleanText(value) {
  return String(value === undefined || value === null ? '' : value).trim();
}

function makeValidationKey(text, category) {
  return `${String(category || '')}\u0000${String(text || '')}`;
}

function categoryLabel(category) {
  return CATEGORY_LABELS[String(category || '').toLowerCase()] || '';
}

function friendlyInvalidMessage(message) {
  const text = cleanText(message);
  if (!text || text.includes('英文内容为空')) return '请输入要记录的英文';
  if (text.includes('不可见') || text.includes('控制字符')) return '内容中有无法识别的隐藏字符，请删除后重新输入';
  if (text.includes('中文字符')) return '英文内容里混入了中文，请删除中文后再试';
  if (text.includes('只填写数字') || text.includes('只填写数值')) return '这段内容只有数字，请补充要记录的英文';
  if (text.includes('只有符号')) return '这段内容只有符号，请输入要记录的英文';
  if (text.includes('只填写网址')) return '这里不能只放网址，请填写想记录的英文';
  if (text.includes('只填写邮箱')) return '这里不能只放邮箱地址，请填写想记录的英文';
  if (text.includes('HTML')) return '这里像网页代码，请填写想记录的英文';
  if (text.includes('代码片段')) return '这里像代码，请填写想记录的英文';
  if (text.includes('文件路径')) return '这里像文件路径，请填写想记录的英文';
  if (text.includes('单字符重复')) return '这段内容不像可学习的英文，请修改后再试';
  if (text.includes('需要包含英文')) return '请输入包含英文字母的内容';
  return text || '这段内容暂时不能作为英语卡片，请修改后再试';
}

function issue(type, severity, message, detail, extra) {
  return Object.assign({
    type,
    severity,
    message,
    detail: detail || '',
    actionType: '',
    actionLabel: '',
    actionCategory: ''
  }, extra || {});
}

function parseSpellingWarning(message) {
  const text = cleanText(message);
  const matched = /^拼写可能有误[：:]\s*(.+?)[。.]\s*你是不是想写\s*[“"]?(.+?)[”"]?[？?]?$/.exec(text);
  if (!matched) return null;
  const original = cleanText(matched[1]);
  const suggestion = cleanText(matched[2]).replace(/[？?。.]$/, '');
  return issue(
    'spelling',
    'high',
    '这个词可能拼错了',
    suggestion ? `可能想写：${suggestion}` : (original ? `请检查：${original}` : '')
  );
}

function categoryMismatchIssue(detectedCategory) {
  const label = categoryLabel(detectedCategory);
  if (!label) return null;
  const actionCategory = CATEGORY_VALUES.includes(label) ? label : '';
  const naturalLabel = {
    '单词': '一个单词',
    '短语': '一个短语',
    '句子': '一句话',
    '段落': '一段话'
  }[label] || label;
  return issue(
    'category_mismatch',
    'high',
    `这段内容更像${naturalLabel}`,
    '',
    actionCategory ? {
      actionType: 'switch_category',
      actionLabel: `切换为${actionCategory}`,
      actionCategory
    } : null
  );
}

function issueFromEvidence(item) {
  if (!item || item.polarity !== 'warning') return null;
  switch (item.type) {
    case 'spelling':
      return issue('spelling', 'high', '这里可能有拼写问题');
    case 'grammar':
      return issue('grammar', 'medium', '这句话可能有语法问题');
    case 'usage':
      return issue('usage', 'medium', '这个表达可能不太自然');
    case 'punctuation':
      return issue('punctuation', 'light', '标点可能需要检查一下');
    default:
      return issue('other', 'light', '这段表达可能需要检查一下');
  }
}

function issueFromWarning(message, detectedCategory) {
  const text = cleanText(message);
  if (!text) return null;
  const spelling = parseSpellingWarning(text);
  if (spelling) return spelling;
  if (text.includes('看起来更像')) return categoryMismatchIssue(detectedCategory);
  if (text.includes('内容较长')) return issue('long_content', 'light', '这段内容比较长', '拆成更短的卡片会更容易复习');
  if (text.includes('连续或混合标点')) return issue('punctuation', 'light', '标点可能需要检查一下');
  if (/^Harper\s+/i.test(text)) return null;
  return issue('other', 'light', '这段表达可能需要检查一下');
}

function addUniqueIssue(list, item) {
  if (!item) return;
  const existingIndex = list.findIndex((current) => current.type === item.type);
  if (existingIndex < 0) {
    list.push(item);
    return;
  }
  if (!list[existingIndex].detail && item.detail) {
    list[existingIndex] = item;
  }
}

function buildWarningIssues(response) {
  const warnings = Array.isArray(response && response.warnings) ? response.warnings : [];
  const evidence = Array.isArray(response && response.evidence) ? response.evidence : [];
  const warningTypes = Array.isArray(response && response.warningTypes) ? response.warningTypes : [];
  const issues = [];

  warnings.forEach((message) => addUniqueIssue(issues, issueFromWarning(message, response.category)));
  evidence.forEach((item) => addUniqueIssue(issues, issueFromEvidence(item)));
  if (warningTypes.includes('SYSTEM_WARNING')) {
    addUniqueIssue(issues, issue('system', 'light', '校验服务暂时不完整，基础判断仍可继续使用'));
  }

  const weight = { high: 0, medium: 1, light: 2 };
  return issues.sort((left, right) => {
    const severityDelta = weight[left.severity] - weight[right.severity];
    if (severityDelta) return severityDelta;
    const order = { spelling: 0, category_mismatch: 1, grammar: 2, usage: 3, punctuation: 4, long_content: 5, system: 6, other: 7 };
    const leftOrder = Object.prototype.hasOwnProperty.call(order, left.type) ? order[left.type] : 99;
    const rightOrder = Object.prototype.hasOwnProperty.call(order, right.type) ? order[right.type] : 99;
    return leftOrder - rightOrder;
  });
}

function buildValidationView(response) {
  const data = response || {};
  const level = cleanText(data.level).toLowerCase();
  const normalizedText = String(data.normalizedText === undefined ? '' : data.normalizedText);
  const capabilities = {
    canSave: typeof data.canSave === 'boolean' ? data.canSave : undefined,
    canAnalyze: typeof data.canAnalyze === 'boolean' ? data.canAnalyze : undefined,
    canPronounce: typeof data.canPronounce === 'boolean' ? data.canPronounce : undefined
  };

  if (level === 'error') {
    const errors = Array.isArray(data.errors) ? data.errors : [];
    const messages = [];
    (errors.length ? errors : ['']).forEach((message) => {
      const friendly = friendlyInvalidMessage(message);
      if (!messages.includes(friendly)) messages.push(friendly);
    });
    const actionableMessages = messages.length > 1
      ? messages.filter((message) => message !== '请输入包含英文字母的内容')
      : messages;
    const invalidIssues = (actionableMessages.length ? actionableMessages : messages).map((message, index) => (
      issue(`invalid_${index}`, 'invalid', message)
    ));
    return {
      status: 'invalid',
      normalizedText,
      category: cleanText(data.category),
      issues: invalidIssues,
      visibleIssues: invalidIssues.slice(0, 2),
      hiddenCount: Math.max(0, invalidIssues.length - 2),
      persistent: true,
      capabilities,
      ...capabilities
    };
  }

  if (level === 'warning') {
    const warningIssues = buildWarningIssues(data);
    if (!warningIssues.length) {
      warningIssues.push(issue('other', 'light', '这段表达可能需要检查一下'));
    }
    return {
      status: 'warning',
      normalizedText,
      category: cleanText(data.category),
      issues: warningIssues,
      visibleIssues: warningIssues.slice(0, 2),
      hiddenCount: Math.max(0, warningIssues.length - 2),
      persistent: warningIssues.some((item) => item.severity !== 'light'),
      capabilities,
      ...capabilities
    };
  }

  return {
    status: 'pass',
    normalizedText,
    category: cleanText(data.category),
    issues: [],
    visibleIssues: [],
    hiddenCount: 0,
    persistent: false,
    capabilities,
    ...capabilities
  };
}

function validationResponseFromCardError(error) {
  const detail = error && error.data && error.data.detail;
  if (!detail || detail.code !== 'invalid_english_content') return null;
  return {
    level: 'error',
    category: 'unknown',
    normalizedText: String(detail.normalizedText || ''),
    warnings: [],
    errors: Array.isArray(detail.errors) && detail.errors.length
      ? detail.errors
      : [detail.message || ''],
    evidence: []
  };
}

module.exports = {
  buildValidationView,
  categoryLabel,
  friendlyInvalidMessage,
  makeValidationKey,
  validationResponseFromCardError
};
