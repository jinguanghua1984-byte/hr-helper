// ========================================
// 配置与状态
// ========================================

// 网站配置
const SITE_CONFIGS = {
  zhipin: {
    name: 'zhipin',
    CANDIDATE_SELECTOR: '.card-item',
    NO_MORE_SELECTORS: [
      '[class*="no-more"]',
      '[class*="no_data"]',
      '[class*="no-data"]',
      '[class*="finished"]',
      '[class*="end"]',
      '[class*="load-end"]',
      '.no-more',
      '.no-data',
      '.load-finished'
    ],
    NO_MORE_PATTERNS: [
      '没有更多', '没有数据', '暂无更多',
      '已加载全部', '加载完成', '没有更多职位',
      '暂时没有更多职位', '已加载全部职位'
    ],
    LOAD_TYPE: 'scroll',  // 滚动加载
    LOAD_MORE_SELECTOR: null,  // 不需要点击按钮
    MAX_LOOPS: 100,
    WAIT_TIME: 2500,
    NO_INCREASE_THRESHOLD: 3,
    // BOSS直聘的数据提取函数
    extractData: 'extractZhipinData'
  },
  maimai: {
    name: 'maimai',
    // 脉脉的候选人卡片选择器（需要根据实际网页调整）
    CANDIDATE_SELECTOR: '.card___3gwOI',
    NO_MORE_SELECTORS: [
      '[class*="no-more"]',
      '[class*="no_data"]',
      '[class*="no-data"]',
      '[class*="finished"]',
      '[class*="end"]',
      '[class*="load-end"]',
      '.no-more',
      '.no-data',
      '.load-finished',
      '.list-end',
      '[class*="loadMore___CClgS"]'
    ],
    NO_MORE_PATTERNS: [
      '没有更多', '没有数据', '暂无更多',
      '已加载全部', '加载完成', '没有更多职位',
      '暂时没有更多职位', '已加载全部职位',
      '已到底部', '没有更多了', '到底了'
    ],
    LOAD_TYPE: 'button',  // 点击按钮加载（或 'scroll' 滚动加载）
    LOAD_MORE_SELECTOR: '[class*="load-more"], [class*="loadmore"], [class*="loadMore"], .load-more-btn, .loadmore-btn',
    LOAD_MORE_TEXT: ['加载更多', '更多', '换一批'],
    MAX_LOOPS: 100,
    WAIT_TIME: 2500,
    NO_INCREASE_THRESHOLD: 3,
    // 脉脉的数据提取函数
    extractData: 'extractMaimaiData'
  }
};

// 当前网站配置
let currentConfig = SITE_CONFIGS.zhipin;

// 检测当前网站
function detectSite() {
  const url = window.location.href;
  if (url.includes('zhipin.com')) {
    return 'zhipin';
  } else if (url.includes('maimai.cn')) {
    return 'maimai';
  }
  return 'zhipin';  // 默认
}

// 初始化配置
const siteType = detectSite();
currentConfig = SITE_CONFIGS[siteType];

// 向后兼容的 CONFIG 对象
const CONFIG = {
  get CANDIDATE_SELECTOR() { return currentConfig.CANDIDATE_SELECTOR; },
  get NO_MORE_SELECTORS() { return currentConfig.NO_MORE_SELECTORS; },
  get NO_MORE_PATTERNS() { return currentConfig.NO_MORE_PATTERNS; },
  get LOAD_TYPE() { return currentConfig.LOAD_TYPE; },
  get LOAD_MORE_SELECTOR() { return currentConfig.LOAD_MORE_SELECTOR; },
  get LOAD_MORE_TEXT() { return currentConfig.LOAD_MORE_TEXT; },
  get MAX_LOOPS() { return currentConfig.MAX_LOOPS; },
  get WAIT_TIME() { return currentConfig.WAIT_TIME; },
  get NO_INCREASE_THRESHOLD() { return currentConfig.NO_INCREASE_THRESHOLD; }
};

// 全局状态
const state = {
  isLoading: false,
  itemCount: 0,
  previousCount: 0,
  noIncreaseCount: 0
};

// ========================================
// DOM 工具函数
// ========================================
function getIframeDocument() {
  for (const iframe of document.querySelectorAll('iframe')) {
    try {
      if (iframe.contentDocument) return iframe.contentDocument;
    } catch {
      continue;
    }
  }
  return null;
}

function containsNoMoreText(text) {
  return CONFIG.NO_MORE_PATTERNS.some(pattern => text.toLowerCase().includes(pattern));
}

// ========================================
// 获取候选人列表
// ========================================
function getCandidateItems() {
  const iframeDoc = getIframeDocument();
  if (iframeDoc) {
    return iframeDoc.querySelectorAll(CONFIG.CANDIDATE_SELECTOR);
  }
  return document.querySelectorAll(CONFIG.CANDIDATE_SELECTOR);
}

// ========================================
// 检查是否加载完成
// ========================================
function hasNoMoreIndicator(doc) {
  for (const selector of CONFIG.NO_MORE_SELECTORS) {
    const element = doc.querySelector(selector);
    if (element && containsNoMoreText(element.textContent)) {
      return true;
    }
  }
  return false;
}

function isLoadComplete() {
  const iframeDoc = getIframeDocument();
  if (iframeDoc) {
    if (hasNoMoreIndicator(iframeDoc)) return true;
    if (containsNoMoreText(iframeDoc.body?.textContent || '')) return true;
  }
  return hasNoMoreIndicator(document) ||
         containsNoMoreText(document.body.textContent);
}

// ========================================
// 滚动控制
// ========================================
function scrollToTarget(win, doc) {
  win.scrollTo({
    top: doc.body.scrollHeight,
    behavior: 'smooth'
  });
}

function scrollToBottom() {
  const iframeDoc = getIframeDocument();
  const targetWindow = iframeDoc
    ? (iframeDoc.defaultView || iframeDoc.parentWindow)
    : window;
  const targetDoc = iframeDoc || document;

  if (targetWindow) scrollToTarget(targetWindow, targetDoc);
}

// ========================================
// 查找并点击"加载更多"按钮
// ========================================
function findLoadMoreButton(doc) {
  // 根据配置的文本查找按钮
  if (CONFIG.LOAD_MORE_TEXT) {
    const allButtons = doc.querySelectorAll('button, [class*="btn"], [class*="button"], [role="button"], a[href*="javascript"]');
    for (const btn of allButtons) {
      const text = btn.textContent.trim();
      if (CONFIG.LOAD_MORE_TEXT.some(keyword => text.includes(keyword))) {
        // 排除已禁用或不可见的按钮
        if (!btn.disabled && btn.offsetParent !== null) {
          return btn;
        }
      }
    }
  }

  // 根据选择器查找（不包含 :contains() 的部分）
  if (CONFIG.LOAD_MORE_SELECTOR) {
    // 分割选择器，过滤掉包含 :contains 的无效选择器
    const selectors = CONFIG.LOAD_MORE_SELECTOR.split(',').map(s => s.trim()).filter(s => !s.includes(':contains'));
    for (const selector of selectors) {
      try {
        const buttons = doc.querySelectorAll(selector);
        for (const btn of buttons) {
          if (!btn.disabled && btn.offsetParent !== null) {
            return btn;
          }
        }
      } catch (e) {
        // 忽略无效的选择器
        continue;
      }
    }
  }

  return null;
}

function clickLoadMoreButton() {
  const iframeDoc = getIframeDocument();
  const targetDoc = iframeDoc || document;

  const btn = findLoadMoreButton(targetDoc);
  if (btn) {
    console.log('找到"加载更多"按钮，准备点击');
    btn.click();
    return true;
  } else {
    console.log('未找到"加载更多"按钮');
    return false;
  }
}

// ========================================
// 工具函数
// ========================================
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function sendMessageToPopup(action, data = {}) {
  try {
    chrome.runtime.sendMessage({ action, ...data });
  } catch (e) {
    console.log('Popup可能已关闭:', e);
  }
}

// ========================================
// 提取候选人数据
// ========================================
function extractText(element) {
  return element ? element.textContent.trim() : '';
}

function parseSalary(salaryText) {
  const text = salaryText.trim();
  if (text === '面议') return '面议';

  const match = text.match(/(\d+)(?:-(\d+))?K/i);
  if (match) {
    if (match[2]) {
      return `${match[1]}-${match[2]}K`;
    }
    if (parseInt(match[1]) < 3) return '3K以下';
    if (parseInt(match[1]) < 5) return '3-5K';
    if (parseInt(match[1]) < 10) return '5-10K';
    if (parseInt(match[1]) < 20) return '10-20K';
    if (parseInt(match[1]) < 50) return '20-50K';
    return '50K以上';
  }
  return text;
}

function extractAge(text) {
  const match = text.match(/(\d+)岁/);
  return match ? `${match[1]}岁` : '未知';
}

function extractEducation(text) {
  const patterns = ['博士', '硕士', '本科', '大专', '中专/中技', '高中', '初中'];
  for (const pattern of patterns) {
    if (text.includes(pattern)) return pattern;
  }
  return '未知';
}

function extractExperience(text) {
  const exps = [];

  if (text.includes('应届生')) {
    exps.push('在校/应届');
    return exps;
  }

  const match = text.match(/(\d+)年/);
  if (match) {
    const years = parseInt(match[1]);
    if (years < 1) exps.push('1年以内');
    else if (years < 3) exps.push('1-3年');
    else if (years < 5) exps.push('3-5年');
    else if (years < 10) exps.push('5-10年');
    else exps.push('10年以上');
  }

  return exps.length > 0 ? exps : ['未知'];
}

function extractWorkExperience(text) {
  if (text.includes('应届生')) return text;
  const match = text.match(/(\d+)年/);
  if (match) return `${match[1]}年`;
  return '未知';
}

function extractJobIntent(text) {
  const patterns = [
    '离职-随时到岗',
    '在职-月内到岗',
    '在职-考虑机会',
    '在职-暂不考虑'
  ];
  for (const pattern of patterns) {
    if (text.includes(pattern)) return pattern;
  }
  return ''; // 没有匹配返回空字符串
}

// 从候选人卡片中提取当前状态
function extractJobIntentFromItem(item) {
  // 先尝试用原有的选择器
  const oldSelector = item.querySelector('.col-3 .content');
  if (oldSelector) {
    const text = extractText(oldSelector);
    // 检查是否包含状态关键词
    if (text && (text.includes('到岗') || text.includes('离职') || text.includes('在职'))) {
      return extractJobIntent(text);
    }
  }

  // 如果旧选择器不对，遍历查找包含关键词的元素
  const allElements = item.querySelectorAll('*');
  for (const el of allElements) {
    const text = extractText(el).trim();
    if (text.includes('离职-随时到岗') ||
        text.includes('在职-月内到岗') ||
        text.includes('在职-考虑机会') ||
        text.includes('在职-暂不考虑')) {
      return extractJobIntent(text);
    }
  }
  return '';
}

function extractUniversity(text) {
  // 从教育经历中提取第一个学校名称
  const lines = text.split('\n').filter(l => l.trim());
  for (const line of lines) {
    // 过滤掉学位和专业，保留学校名
    const school = line.replace(/博士|硕士|本科|大专|中专|高中|初中/g, '').trim();
    if (school && !school.includes('年')) return school;
  }
  return ''; // 没有找到返回空字符串
}

function parseTimeline(contentElement) {
  const items = [];
  const timeElements = contentElement.querySelectorAll('.timeline-item');

  timeElements.forEach(item => {
    const timeElement = item.querySelector('.time');
    const contentElement = item.querySelector('.content');

    if (!contentElement || contentElement.textContent.trim() === '未填写工作经历') {
      return;
    }

    const timeText = timeElement ? timeElement.textContent.trim() : '';
    const contentText = contentElement.textContent.trim();

    // 解析工作经历
    if (timeElement) {
      items.push({
        period: timeText,
        company: contentText
      });
    }
  });

  return items;
}

// 脉脉数据提取
function extractMaimaiData(item) {
  try {
    // 姓名 - 使用精确的选择器
    const nameElement = item.querySelector('.font-weight-bold');
    const name = extractText(nameElement) || '未知';

    // 活跃度 - 查找活跃度文本（"今日活跃"、"近1周活跃"等）
    let activity = '未知';
    const allText = item.textContent;
    const activityPatterns = ['今日活跃', '近1周活跃', '近1月活跃', '刚刚活跃', '本周活跃', '本月活跃'];
    for (const pattern of activityPatterns) {
      if (allText.includes(pattern)) {
        activity = pattern;
        break;
      }
    }

    // 城市 - 脉脉特有字段
    const cityPatterns = ['北京', '上海', '深圳', '杭州', '广州', '成都', '南京', '武汉'];
    let city = '未知';
    for (const pattern of cityPatterns) {
      if (allText.includes(pattern)) {
        city = pattern;
        break;
      }
    }

    // 性别 - 脉脉特有字段
    let gender = '未知';
    if (allText.includes('/ 男') || allText.includes('/ 女')) {
      gender = allText.includes('/ 男') ? '男' : '女';
    }

    // 年龄 - 脉脉特有字段
    let age = '未知';
    const ageMatch = allText.match(/(\d+)岁/);
    if (ageMatch) {
      age = `${ageMatch[1]}岁`;
    }

    // 学历 - 从基本信息行提取
    const eduPatterns = ['博士', '硕士', '本科', '大专', '中专', '高中', '初中'];
    let education = '未知';
    for (const pattern of eduPatterns) {
      if (allText.includes(pattern)) {
        education = pattern;
        break;
      }
    }

    // 工作年限 - 从基本信息行提取
    let workExperience = '未知';
    const expMatch = allText.match(/(\d+)年/);
    if (expMatch) {
      workExperience = `${expMatch[1]}年`;
    }

    // 现任职位 - 从"现任"字段提取
    let currentPosition = '未知';
    // 查找包含公司信息的元素
    const jobItems = item.querySelectorAll('.item___pCPU7');
    for (const jobItem of jobItems) {
      const label = jobItem.querySelector('.label___3pw_V');
      const labelValue = extractText(label);
      if (labelValue === '现任' || labelValue === '就职') {
        const content = jobItem.querySelector('.ellipsis.content___2ANbn');
        const value = extractText(content);
        if (value && value.length > 2 && !value.includes(' / ')) {
          currentPosition = value;
          break;
        }
      }
    }

    // 标签 - 脉脉特有字段
    let tags = [];
    const tagElement = item.querySelector('.ellipsis.tag___2hH1V');
    if (tagElement) {
      const tagText = extractText(tagElement);
      if (tagText) {
        // 用"、分割标签
        tags = tagText.split('、').map(t => t.trim()).filter(t => t);
      }
    }

    // 就职 - 脉脉特有字段，直接抓取"就职"后面的内容
    let employment = '未知';
    for (const jobItem of jobItems) {
      const label = jobItem.querySelector('.label___3pw_V');
      const labelValue = extractText(label);
      if (labelValue === '就职') {
        const content = jobItem.querySelector('.ellipsis.content___2ANbn');
        const value = extractText(content);
        if (value) {
          employment = value;
          break;
        }
      }
    }

    // 学校 - 脉脉特有字段，直接抓取"学校"后面的内容
    let school = '未知';
    for (const jobItem of jobItems) {
      const label = jobItem.querySelector('.label___3pw_V');
      const labelValue = extractText(label);
      if (labelValue === '学校') {
        const content = jobItem.querySelector('.ellipsis.content___2ANbn');
        const value = extractText(content);
        if (value) {
          school = value;
          break;
        }
      }
    }

    return {
      name,
      activity,
      city,
      gender,
      age,
      education,
      workExperience,
      currentPosition,
      tags,
      employment,  // 就职（脉脉特有）
      school       // 学校（脉脉特有）
    };
  } catch (e) {
    console.error('提取脉脉候选人数据失败:', e);
    return null;
  }
}

// BOSS直聘数据提取
function extractZhipinData(item) {
  try {
    // 姓名
    const nameElement = item.querySelector('.name');
    const name = extractText(nameElement) || '未知';

    // 活跃度
    const activeElement = item.querySelector('.active-text');
    const activity = extractText(activeElement) || '未知';

    // 基本信息（年龄、学历、工作年限）
    const baseInfoElement = item.querySelector('.base-info');
    const baseInfoText = extractText(baseInfoElement);
    const age = extractAge(baseInfoText);
    const education = extractEducation(baseInfoText);
    const experience = extractExperience(baseInfoText);
    const workExperience = extractWorkExperience(baseInfoText);

    // 薪资
    const salaryElement = item.querySelector('.salary-wrap');
    const salary = parseSalary(extractText(salaryElement));

    // 求职意向/当前状态
    const jobIntent = extractJobIntentFromItem(item);

    // 期望职位
    const targetPositionElements = item.querySelectorAll('.row-flex');
    let targetPosition = '';
    for (const row of targetPositionElements) {
      const label = row.querySelector('.label');
      if (label && extractText(label).includes('期望')) {
        const content = extractText(row.querySelector('.content'));
        if (content && content !== '未知') {
          targetPosition = content;
        }
        break;
      }
    }

    // 技术栈与核心优势
    const advantageElement = item.querySelector('.geek-desc .content');
    const tagsElement = item.querySelector('.tags-wrap');
    let advantage = extractText(advantageElement) + ' ' + extractText(tagsElement);
    // 清理多余空格和"未知"内容
    advantage = advantage.replace(/  +/g, ' ').replace(/\s*未知\(未知\)\s*/g, '').trim();

    // 当前公司/最近公司
    const workExpsElement = item.querySelector('.work-exps');
    const timelineItems = workExpsElement?.querySelectorAll('.timeline-item') || [];
    let lastCompany = '';
    if (timelineItems.length > 0) {
      const companyText = extractText(timelineItems[0].querySelector('.content'));
      if (companyText && !companyText.includes('未填写') && companyText !== '未知') {
        lastCompany = companyText.split('·')[0].trim();
      }
    }

    // 毕业院校
    const eduExpsElement = item.querySelector('.edu-exps');
    const eduItems = eduExpsElement?.querySelectorAll('.timeline-item') || [];
    let university = '';
    if (eduItems.length > 0) {
      const eduContent = extractText(eduItems[0].querySelector('.content'));
      university = extractUniversity(eduContent);
    }

    // 工作经历
    const workHistory = [];
    const workTimeline = workExpsElement?.querySelectorAll('.timeline-item') || [];
    workTimeline.forEach(item => {
      const timeElement = item.querySelector('.time');
      const timeText = extractText(timeElement);
      const contentText = extractText(item.querySelector('.content'));
      if (timeText && contentText && !contentText.includes('未填写')) {
        // 起止日期中间用" - "分隔，公司+职位用"|"分隔
        const period = timeText.replace(/\s*-\s*/g, ' - ');
        const company = contentText.split('·').map(p => p.trim()).filter(p => p).join('|');
        workHistory.push({
          period,
          company
        });
      }
    });

    // 教育经历
    const educationHistory = [];
    if (eduItems.length > 0) {
      eduItems.forEach(item => {
        const timeElement = item.querySelector('.time');
        const timeText = extractText(timeElement);
        const contentText = extractText(item.querySelector('.content'));
        if (timeText && contentText) {
          const parts = contentText.split('·').map(p => p.trim()).filter(p => p);
          const period = timeText.replace(/\s*-\s*/g, ' - ');
          const eduInfo = parts.join('|'); // 学校+学院+学位用"|"分隔
          educationHistory.push({
            period,
            school: parts[0] || '',
            major: parts[1] || '',
            degree: parts[2] || '',
            eduInfo // 用于显示的格式化信息
          });
        }
      });
    }

    return {
      name,
      activity,
      age,
      education,
      experience,
      workExperience,
      jobIntent,
      targetPosition,
      salary,
      lastCompany,
      advantage: advantage.trim(),
      university,
      workHistory,
      educationHistory
    };
  } catch (e) {
    console.error('提取候选人数据失败:', e);
    return null;
  }
}

// ========================================
// 采集候选人数据
// ========================================
function collectCandidates() {
  const items = getCandidateItems();
  const candidates = [];

  console.log(`开始采集候选人数据，共 ${items.length} 个候选人`);
  console.log(`当前网站: ${currentConfig.name}, 使用提取函数: ${currentConfig.extractData}`);

  items.forEach((item, index) => {
    // 根据当前网站选择对应的提取函数
    const extractFunc = currentConfig.extractData === 'extractMaimaiData' ? extractMaimaiData : extractZhipinData;
    const candidate = extractFunc(item);
    if (candidate) {
      candidates.push(candidate);
    }
    console.log(`已采集 ${index + 1}/${items.length}`);
  });

  console.log(`采集完成，共采集 ${candidates.length} 条数据`);
  return candidates;
}

// ========================================
// 加载逻辑
// ========================================
async function startLoadingAll() {
  if (state.isLoading) return;

  state.isLoading = true;
  state.itemCount = getCandidateItems().length;
  state.previousCount = state.itemCount;
  state.noIncreaseCount = 0;

  console.log(`开始加载全部职位 [网站: ${currentConfig.name}], 初始职位数:`, state.itemCount);
  console.log(`加载方式: ${CONFIG.LOAD_TYPE === 'scroll' ? '滚动加载' : '点击按钮加载'}`);
  sendMessageToPopup('loadingProgress', { count: state.itemCount });

  // 初始为0时先触发加载
  if (state.itemCount === 0) {
    console.log('初始职位数为0，先触发加载');
    if (CONFIG.LOAD_TYPE === 'scroll') {
      scrollToBottom();
    } else {
      clickLoadMoreButton();
    }
    await wait(2000);
    state.itemCount = getCandidateItems().length;
    sendMessageToPopup('loadingProgress', { count: state.itemCount });
  }

  let loopCount = 0;
  let clickFailedCount = 0;  // 记录点击失败次数

  while (loopCount < CONFIG.MAX_LOOPS && state.isLoading) {
    loopCount++;

    // 根据加载方式触发加载
    if (CONFIG.LOAD_TYPE === 'scroll') {
      // 滚动加载
      scrollToBottom();
      console.log(`第 ${loopCount} 次滚动`);
    } else {
      // 点击按钮加载
      const clicked = clickLoadMoreButton();
      if (clicked) {
        clickFailedCount = 0;
        console.log(`第 ${loopCount} 次点击"加载更多"按钮`);
      } else {
        clickFailedCount++;
        console.log(`第 ${loopCount} 次点击失败，失败次数: ${clickFailedCount}`);
        // 如果连续多次找不到按钮，说明可能已经到底部
        if (clickFailedCount >= 2) {
          console.log('⚠️ 连续多次找不到"加载更多"按钮，认为已到底部');
          break;
        }
      }
    }

    // 等待
    await wait(CONFIG.WAIT_TIME);

    // 检查是否加载完成
    const isComplete = isLoadComplete();
    if (isComplete) {
      console.log('⚠️ 检测到"没有更多"提示，停止加载');
      console.log('详细检查：');
      // 输出找到的"没有更多"元素
      for (const selector of CONFIG.NO_MORE_SELECTORS) {
        const element = document.querySelector(selector);
        if (element) {
          console.log(`  找到元素 ${selector}:`, element.textContent.substring(0, 50));
        }
      }
      // 检查body文本
      const bodyText = document.body.textContent;
      for (const pattern of CONFIG.NO_MORE_PATTERNS) {
        if (bodyText.includes(pattern)) {
          console.log(`  文本匹配: "${pattern}"`);
        }
      }
      break;
    }

    // 获取当前数量
    state.itemCount = getCandidateItems().length;
    console.log(`  当前职位数: ${state.itemCount}, 上次: ${state.previousCount}, 未增加次数: ${state.noIncreaseCount}`);
    sendMessageToPopup('loadingProgress', { count: state.itemCount });

    // 检查数量是否增加
    if (state.itemCount === state.previousCount) {
      state.noIncreaseCount++;
      console.log(`  数量未增加，计数: ${state.noIncreaseCount}/${CONFIG.NO_INCREASE_THRESHOLD}`);
      if (state.noIncreaseCount >= CONFIG.NO_INCREASE_THRESHOLD) {
        console.log('⚠️ 连续N次数量未增加，认为已到底部');
        break;
      }
    } else {
      state.noIncreaseCount = 0;
      state.previousCount = state.itemCount;
    }
  }

  state.isLoading = false;
  console.log(`====== 加载完成 ======`);
  console.log(`总共循环次数: ${loopCount}`);
  console.log(`最终职位数: ${state.itemCount}`);
  const stopReason = loopCount >= CONFIG.MAX_LOOPS ? '达到最大循环次数' :
                    state.noIncreaseCount >= CONFIG.NO_INCREASE_THRESHOLD ? '连续未增加' :
                    '检测到"没有更多"';
  console.log(`停止原因: ${stopReason}`);
  sendMessageToPopup('loadingComplete', { count: state.itemCount });
}

// ========================================
// 消息处理
// ========================================
const messageHandlers = {
  startLoadingAll: (_, sendResponse) => {
    startLoadingAll();
    sendResponse({ success: true });
    return false; // 同步响应
  },
  getStatus: (_, sendResponse) => {
    sendResponse({
      isLoading: state.isLoading,
      count: getCandidateItems().length
    });
    return false; // 同步响应
  },
  stopLoadingAll: (_, sendResponse) => {
    state.isLoading = false;
    sendResponse({ success: true });
    return false; // 同步响应
  },
  collectCandidates: (_, sendResponse) => {
    try {
      const items = getCandidateItems();
      const candidates = [];

      console.log(`开始采集候选人数据，当前网站: ${currentConfig.name}, 使用提取函数: ${currentConfig.extractData}`);

      items.forEach((item, index) => {
        // 根据当前网站选择对应的提取函数
        const extractFunc = currentConfig.extractData === 'extractMaimaiData' ? extractMaimaiData : extractZhipinData;
        const candidate = extractFunc(item);
        if (candidate) {
          candidates.push(candidate);
        }
        console.log(`已采集 ${index + 1}/${items.length}`);
      });

      console.log(`采集完成，共采集 ${candidates.length} 条数据`);
      sendResponse({ success: true, candidates });
    } catch (e) {
      console.error('采集候选人失败:', e);
      sendResponse({ success: false, error: e.message });
    }
    return false; // 同步响应
  }
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('收到消息:', request.action);
  const handler = messageHandlers[request.action];
  if (handler) {
    // 返回值决定是否需要异步响应
    return handler(request, sendResponse);
  }
  return false;
});

// ========================================
// 初始化
// ========================================
console.log('HR Helper content script 已加载');
console.log('当前页面:', window.location.href);
console.log('当前网站:', currentConfig.name);
console.log('加载方式:', CONFIG.LOAD_TYPE === 'scroll' ? '滚动加载' : '点击按钮加载');
console.log('使用的选择器:', CONFIG.CANDIDATE_SELECTOR);
const initialItems = getCandidateItems();
console.log('找到的候选人数量:', initialItems.length);
if (initialItems.length > 0) {
  console.log('候选人元素示例:', initialItems[0].outerHTML.substring(0, 200));
} else {
  console.log('未找到候选人元素，尝试查找可能的选择器...');
  console.log('=== 查找可能的候选人卡片 ===');

  // 尝试常见的选择器
  const possibleSelectors = [
    '.job-card-wrapper',
    '.job-card',
    '[class*="job-item"]',
    '[class*="position-item"]',
    '[class*="job-list-item"]',
    '.job-list-card',
    'li.job-item',
    '.card-item',
    '.candidate-card',
    '[class*="candidate"]',
    '[class*="resume"]',
    '.resume-card',
    'li[class*="item"]'
  ];

  possibleSelectors.forEach(selector => {
    const items = document.querySelectorAll(selector);
    if (items.length > 0) {
      console.log(`✓ ${selector}: 找到 ${items.length} 个元素`);
      console.log('  示例HTML:', items[0].outerHTML.substring(0, 150));
    } else {
      console.log(`✗ ${selector}: 无`);
    }
  });

  // 检查 iframe
  const iframes = document.querySelectorAll('iframe');
  console.log('\n=== 页面中的iframe ===');
  console.log('iframe数量:', iframes.length);
  iframes.forEach((iframe, index) => {
    console.log(`iframe ${index}:`, iframe.src);
  });
}

// 添加全局函数供手动调试
window.debugHRHelper = function() {
  console.log('=== HR Helper 调试信息 ===');
  console.log('当前选择器:', CONFIG.CANDIDATE_SELECTOR);
  console.log('找到的候选人数量:', getCandidateItems().length);

  // 查找所有可能包含"候选人"、"简历"、"求职者"等关键词的元素
  console.log('\n=== 搜索包含关键词的元素 ===');
  const keywords = ['候选人', '简历', '求职者', 'geek', 'candidate', 'resume'];
  const allElements = document.querySelectorAll('[class]');
  const foundElements = new Set();

  allElements.forEach(el => {
    const className = el.className;
    if (typeof className === 'string' && className) {
      keywords.forEach(keyword => {
        if (className.toLowerCase().includes(keyword.toLowerCase()) && el.children.length > 0) {
          foundElements.add(className);
        }
      });
    }
  });

  if (foundElements.size > 0) {
    console.log('找到的可能相关的class:');
    foundElements.forEach(cls => {
      const items = document.querySelectorAll('.' + cls.split(' ')[0]);
      console.log(`  .${cls}: ${items.length} 个`);
    });
  } else {
    console.log('未找到包含关键词的class');
  }
};

// 添加调试"当前状态"的函数
window.debugJobStatus = function() {
  const items = getCandidateItems();
  if (items.length === 0) {
    console.log('没有找到候选人，请先滚动加载');
    return;
  }

  const firstItem = items[0];
  console.log('=== 调试"当前状态"提取 ===');
  const jobIntent = extractJobIntentFromItem(firstItem);
  console.log('提取结果:', jobIntent || '未找到');

  // 尝试各种可能的选择器
  const selectors = [
    '.col-3 .content',
    '[class*="col"] [class*="content"]',
    '[class*="job"] [class*="status"]',
    '[class*="status"]',
    '[class*="intent"]',
    '[class*="current"]',
    '[class*="search"]',
    '[class*="geek"]',
    '.job-intent',
    '.status-text',
    '.col-content'
  ];

  console.log('\n尝试选择器:');
  selectors.forEach(sel => {
    const el = firstItem.querySelector(sel);
    if (el) {
      const text = el.textContent.trim();
      console.log(`✓ ${sel}: "${text.substring(0, 50)}"`);
    } else {
      console.log(`✗ ${sel}: 无`);
    }
  });

  // 查找所有包含"到岗"的文本元素
  console.log('\n查找包含"到岗"的元素:');
  const allWithStatus = firstItem.querySelectorAll('*');
  allWithStatus.forEach(el => {
    const text = el.textContent.trim();
    if (text.includes('到岗') || text.includes('离职') || text.includes('在职')) {
      console.log(`  class="${el.className}": "${text.substring(0, 80)}"`);
    }
  });
};

console.log('提示: 在控制台输入 debugHRHelper() 可以查看候选人调试信息');
console.log('提示: 在控制台输入 debugJobStatus() 可以查看"当前状态"调试信息');
console.log('提示: 在控制台输入 debugSiteConfig() 可以查看当前网站配置');
console.log('提示: 在控制台输入 debugMaimaiExtract() 可以测试脉脉数据提取');

// 添加调试配置的函数
window.debugSiteConfig = function() {
  console.log('=== 当前网站配置 ===');
  console.log('当前页面 URL:', window.location.href);
  console.log('检测到的网站类型:', detectSite());
  console.log('当前配置名称:', currentConfig.name);
  console.log('候选人选择器:', CONFIG.CANDIDATE_SELECTOR);
  console.log('加载方式:', CONFIG.LOAD_TYPE === 'scroll' ? '滚动加载' : '点击按钮加载');
  console.log('数据提取函数:', currentConfig.extractData);
  console.log('最大循环次数:', CONFIG.MAX_LOOPS);
  console.log('等待时间:', CONFIG.WAIT_TIME);
  console.log('找到的候选人数量:', getCandidateItems().length);
  return currentConfig;
};

// 添加调试脉脉数据提取的函数
window.debugMaimaiExtract = function(index = 0) {
  const items = getCandidateItems();
  if (items.length === 0) {
    console.log('没有找到候选人，请先滚动加载');
    return;
  }

  const item = items[index] || items[0];
  console.log('=== 调试脉脉数据提取 ===');
  console.log('候选人卡片HTML:', item.outerHTML.substring(0, 500));

  const candidate = extractMaimaiData(item);
  if (candidate) {
    console.log('提取结果:', candidate);
  } else {
    console.log('提取失败');
  }

  return candidate;
};
