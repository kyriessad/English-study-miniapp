const sceneCategories = {
  life: ['日常生活', '社交聊天', '职场', '校园学习', '旅行出行', '餐饮购物', '健身运动', '影视娱乐', '网络社交', '生活服务'],
  reading: ['日常阅读', '新闻资讯', '学术阅读', '职场文书']
};

const featured = [
  { id: 'f1', en: "I'll keep that in mind.", zh: '我会记住这一点。', context: '接受建议或提醒时的自然回应', category: '职场', source: '首页精选', phonetic: '/aɪl kiːp ðæt ɪn maɪnd/' },
  { id: 'f2', en: 'That makes sense.', zh: '有道理。', context: '表示理解并认同对方的解释', category: '社交聊天', source: '首页精选', phonetic: '/ðæt meɪks sens/' },
  { id: 'f3', en: 'Could you give me a hand?', zh: '你能帮我一下吗？', context: '礼貌地向同事或朋友求助', category: '日常生活', source: '首页精选', phonetic: '/kʊd juː ɡɪv mi ə hænd/' },
  { id: 'f4', en: 'The results are encouraging.', zh: '结果令人鼓舞。', context: '阅读报告或分享进展时使用', category: '新闻资讯', source: '首页精选', phonetic: '/ðə rɪˈzʌlts ɑːr ɪnˈkʌrɪdʒɪŋ/' },
  { id: 'f5', en: 'Take your time.', zh: '别着急，慢慢来。', context: '给别人时间考虑或完成任务', category: '社交聊天', source: '首页精选', phonetic: '/teɪk jɔːr taɪm/' }
];

const sceneMaterials = [
  { id: 's1', en: 'I am just browsing.', zh: '我只是随便看看。', category: '餐饮购物', type: 'life', context: '在商店暂时不需要帮助时', phonetic: '/aɪ æm dʒʌst ˈbraʊzɪŋ/' },
  { id: 's2', en: 'Let me double-check that.', zh: '让我再确认一下。', category: '职场', type: 'life', context: '发送信息前检查细节', phonetic: '/let miː ˌdʌbəl ˈtʃek ðæt/' },
  { id: 's3', en: 'I will get back to you shortly.', zh: '我很快回复你。', category: '职场', type: 'life', context: '暂时无法立即给出答案', phonetic: '/aɪ wɪl ɡet bæk tə juː ˈʃɔːrtli/' },
  { id: 's4', en: 'The city comes alive at night.', zh: '这座城市在夜晚焕发生机。', category: '日常阅读', type: 'reading', context: '描述城市生活的文章', phonetic: '/ðə ˈsɪti kʌmz əˈlaɪv æt naɪt/' },
  { id: 's5', en: 'Evidence suggests a different outcome.', zh: '证据表明结果可能不同。', category: '学术阅读', type: 'reading', context: '学术文章中的谨慎表达', phonetic: '/ˈevɪdəns səˈdʒests ə ˈdɪfrənt ˈaʊtkʌm/' },
  { id: 's6', en: 'Please find the report attached.', zh: '请查收附件中的报告。', category: '职场文书', type: 'reading', context: '邮件中发送文件', phonetic: '/pliːz faɪnd ðə rɪˈpɔːrt əˈtætʃt/' }
];

const books = [
  { id: 'cet4', title: 'CET4 核心词汇', exam: '大学英语四级', count: 4500, learned: 12, color: '#eaf5ed', description: '覆盖四级考试高频词，适合日常积累与基础复习。', entries: [
    { id: 'b1', en: 'achieve', zh: '实现；达到', phonetic: '/əˈtʃiːv/', sentence: 'Small steps help us achieve big goals.' },
    { id: 'b2', en: 'benefit', zh: '好处；受益', phonetic: '/ˈbenɪfɪt/', sentence: 'Regular reading has many benefits.' },
    { id: 'b3', en: 'curious', zh: '好奇的；求知欲强的', phonetic: '/ˈkjʊəriəs/', sentence: 'Children are naturally curious.' }
  ] },
  { id: 'cet6', title: 'CET6 高频词汇', exam: '大学英语六级', count: 5500, learned: 28, color: '#edf2fa', description: '六级阅读与听力高频词，帮助理解复杂语境。', entries: [
    { id: 'b4', en: 'subtle', zh: '微妙的；不明显的', phonetic: '/ˈsʌtl/', sentence: 'There is a subtle difference between them.' },
    { id: 'b5', en: 'inevitable', zh: '不可避免的', phonetic: '/ɪnˈevɪtəbl/', sentence: 'Change is inevitable.' },
    { id: 'b6', en: 'sustain', zh: '维持；支撑', phonetic: '/səˈsteɪn/', sentence: 'The plan is hard to sustain.' }
  ] },
  { id: 'postgrad', title: '考研英语词汇', exam: '研究生入学考试', count: 5500, learned: 6, color: '#fff3e6', description: '围绕考研真题语境组织的核心词汇。', entries: [
    { id: 'b7', en: 'convey', zh: '传达；表达', phonetic: '/kənˈveɪ/', sentence: 'Words cannot always convey feelings.' },
    { id: 'b8', en: 'decline', zh: '下降；拒绝', phonetic: '/dɪˈklaɪn/', sentence: 'The report shows a decline in sales.' }
  ] },
  { id: 'ielts', title: 'IELTS Academic', exam: '雅思学术类', count: 3000, learned: 0, color: '#f3edfa', description: '学术阅读与写作中常见的高价值词汇。', entries: [
    { id: 'b9', en: 'allocate', zh: '分配；拨出', phonetic: '/ˈæləkeɪt/', sentence: 'We need to allocate more time to research.' },
    { id: 'b10', en: 'coherent', zh: '连贯的；一致的', phonetic: '/koʊˈhɪrənt/', sentence: 'Please present a coherent argument.' }
  ] },
  { id: 'toefl', title: 'TOEFL Essential', exam: '托福核心词汇', count: 3500, learned: 0, color: '#e9f4f5', description: '托福听说读写通用词汇，强化学术场景表达。', entries: [
    { id: 'b11', en: 'hypothesis', zh: '假设；假说', phonetic: '/haɪˈpɑːθəsɪs/', sentence: 'The experiment tests the hypothesis.' },
    { id: 'b12', en: 'enhance', zh: '增强；提高', phonetic: '/ɪnˈhæns/', sentence: 'Music can enhance the learning experience.' }
  ] }
];

const personalCards = [
  { id: 'p1', en: "I'll keep that in mind.", zh: '我会记住这一点。', my: '', note: '会议中听到', category: '生活英语', source: '首页精选', addedAt: 5, participate: true },
  { id: 'p2', en: 'curious', zh: '好奇的；求知欲强的', my: '对新事物有兴趣，想了解更多', note: '阅读文章', category: '阅读英语', source: 'CET4 词汇书', addedAt: 3, participate: true },
  { id: 'p3', en: 'take action', zh: '采取行动', my: '不要只想，要开始做', note: '自己添加', category: '自己添加', source: '自己添加', addedAt: 1, participate: true },
  { id: 'p4', en: 'It is what it is.', zh: '事情就是这样。', my: '', note: '播客里听到', category: '生活英语', source: '社交聊天', addedAt: 2, participate: false }
];

const reviewCards = [
  { id: 'p1', en: "I'll keep that in mind.", answer: '我会记住这一点。', context: '会议中听到', example: "I'll keep that in mind when we make the decision.", options: ['我会记住这一点。', '我会尽快回复你。', '这取决于具体情况。', '我只是随便看看。'] },
  { id: 'p2', en: 'curious', answer: '好奇的；求知欲强的', context: '阅读文章', example: 'Children are naturally curious about the world around them.', options: ['好奇的；求知欲强的', '不可避免的', '微妙的；不明显的', '采取行动'] },
  { id: 'p3', en: 'take action', answer: '采取行动', context: '自己添加', example: 'We need to take action before the problem gets worse.', options: ['采取行动', '分配；拨出', '实现；达到', '维持；支撑'] }
];

function clone(value) { return JSON.parse(JSON.stringify(value)); }

module.exports = { sceneCategories, featured, sceneMaterials, books, personalCards, reviewCards, clone };
