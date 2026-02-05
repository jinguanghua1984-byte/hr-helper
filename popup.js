// ========================================
// 全局状态管理
// ========================================
const candidateState = {
  candidates: [],
  filteredCandidates: [],
  currentPage: 1,
  itemsPerPage: 10
};

// 页面加载状态
let isChecking = false;

// 状态常量
const STATUS = {
  LOADING: 'loading',
  COMPLETE: 'complete',
  READY: 'ready',
  ERROR: 'error',
  NOT_AVAILABLE: 'not-available'
};

// DOM 元素
const dom = {
  // 职位加载相关
  loadAllBtn: document.getElementById('loadAllBtn'),
  loadStatus: document.getElementById('loadStatus'),
  loadCount: document.getElementById('loadCount'),

  // 人选数据相关
  loadCandidatesBtn: document.getElementById('loadCandidatesBtn'),
  candidateList: document.getElementById('candidateList'),
  prevBtn: document.getElementById('prevBtn'),
  nextBtn: document.getElementById('nextBtn'),
  pageInfo: document.getElementById('pageInfo'),
  detailPanel: document.getElementById('detailPanel'),
  detailTitle: document.getElementById('detailTitle'),
  detailContent: document.getElementById('detailContent'),
  detailCloseBtn: document.getElementById('detailCloseBtn')
};

// ========================================
// 职位加载功能
// ========================================
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendMessageToTab(message) {
  const tab = await getActiveTab();
  if (!tab) throw new Error('未找到活动标签页');
  return chrome.tabs.sendMessage(tab.id, message);
}

// 初始化职位加载
document.addEventListener('DOMContentLoaded', checkPageStatus);
chrome.tabs.onActivated.addListener(checkPageStatus);

function isSupportedUrl(url) {
  return url.includes('zhipin.com') || url.includes('maimai.cn');
}

function getSiteName(url) {
  if (url.includes('zhipin.com')) return 'BOSS直聘';
  if (url.includes('maimai.cn')) return '脉脉';
  return '当前网站';
}

async function checkPageStatus() {
  if (isChecking) return;
  isChecking = true;

  try {
    const tab = await getActiveTab();
    if (!tab?.url) return;

    const url = tab.url;
    if (!isSupportedUrl(url)) {
      updateLoadStatus(STATUS.NOT_AVAILABLE, 0);
      return;
    }

    try {
      const response = await sendMessageToTab({ action: 'getStatus' });
      const status = response?.isLoading ? STATUS.LOADING : STATUS.READY;
      updateLoadStatus(status, response?.count || 0);
    } catch {
      setTimeout(checkPageStatus, 500);
    }
  } finally {
    isChecking = false;
  }
}

const messageHandlers = {
  loadingProgress: (request) => updateLoadStatus(STATUS.LOADING, request.count),
  loadingComplete: (request) => {
    updateLoadStatus(STATUS.COMPLETE, request.count);
    showNotification(`全部数据加载完成。共加载 ${request.count} 条数据`);
  },
  loadingError: (request) => updateLoadStatus(STATUS.ERROR, request.count)
};

chrome.runtime.onMessage.addListener((request) => {
  const handler = messageHandlers[request.action];
  if (handler) handler(request);
  return true;
});

function showNotification(body) {
  if (Notification.permission === 'granted') {
    new Notification('HR Helper', { body, icon: 'icons/icon48.png' });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') showNotification(body);
    });
  }
}

const STATUS_CONFIG = {
  [STATUS.LOADING]: {
    html: '<span class="loading-spinner"></span>加载中...',
    btnDisabled: true,
    btnText: '加载中...'
  },
  [STATUS.COMPLETE]: {
    text: '加载完成',
    color: '#4CAF50',
    btnDisabled: false,
    btnText: '再次加载'
  },
  [STATUS.READY]: {
    text: '准备就绪',
    btnDisabled: false,
    btnText: '加载全部职位'
  },
  [STATUS.ERROR]: {
    text: '加载失败',
    color: '#f44336',
    btnDisabled: false,
    btnText: '重试'
  },
  [STATUS.NOT_AVAILABLE]: {
    text: '请在支持的网站使用',
    className: 'not-available',
    btnDisabled: true,
    btnText: '加载全部职位'
  }
};

function updateLoadStatus(status, count) {
  dom.loadCount.textContent = count;
  const config = STATUS_CONFIG[status] || { text: status, btnDisabled: false };

  if (config.html) {
    dom.loadStatus.innerHTML = config.html;
  } else {
    dom.loadStatus.textContent = config.text || '';
  }

  dom.loadStatus.style.color = config.color || '';
  dom.loadStatus.className = config.className || '';
  dom.loadAllBtn.disabled = config.btnDisabled;
  dom.loadAllBtn.textContent = config.btnText || '加载全部职位';
}

// ========================================
// 人选数据功能
// ========================================

// 采集人选数据
async function loadCandidatesData() {
  console.log('开始采集人选数据...');
  dom.loadCandidatesBtn.disabled = true;
  dom.loadCandidatesBtn.textContent = '采集中...';

  try {
    const tab = await getActiveTab();
    console.log('当前标签页:', tab?.id, tab?.url);

    if (!tab) {
      console.error('未找到活动标签页');
      alert('未找到活动标签页');
      dom.loadCandidatesBtn.disabled = false;
      dom.loadCandidatesBtn.textContent = '采集人选数据';
      return;
    }

    const response = await sendMessageToTab({ action: 'collectCandidates' });
    console.log('收到响应:', response);

    if (!response) {
      console.error('没有收到响应');
      alert('没有收到响应，请确保在zhipin.com页面');
      dom.loadCandidatesBtn.disabled = false;
      dom.loadCandidatesBtn.textContent = '采集人选数据';
      return;
    }

    if (!response.success) {
      console.error('采集失败:', response.error);
      alert('采集失败: ' + (response.error || '未知错误'));
      dom.loadCandidatesBtn.disabled = false;
      dom.loadCandidatesBtn.textContent = '采集人选数据';
      return;
    }

    candidateState.candidates = response.candidates;
    console.log('采集到的人选数量:', candidateState.candidates.length);

    // 直接使用所有候选人数据（不再筛选）
    candidateState.filteredCandidates = candidateState.candidates;

    if (candidateState.filteredCandidates.length === 0) {
      dom.candidateList.innerHTML = '<div class="empty">没有符合条件的人选</div>';
      console.log('没有符合条件的人选');
    } else {
      renderCandidates();
      console.log('渲染人选列表成功');
    }

    // 自动导出Excel
    await exportToExcel(candidateState.candidates);

    dom.loadCandidatesBtn.disabled = false;
    dom.loadCandidatesBtn.textContent = '重新采集';
  } catch (err) {
    console.error('采集过程出错:', err);
    alert('采集出错: ' + err.message);
    dom.loadCandidatesBtn.disabled = false;
    dom.loadCandidatesBtn.textContent = '采集人选数据';
  }
}

// 导出为CSV（Excel格式，可用Excel直接打开）
async function exportToExcel(candidates) {
  console.log('开始导出Excel...');

  if (!candidates || candidates.length === 0) {
    console.log('没有人选数据，跳过导出');
    return;
  }

  try {
    // 获取当前标签页URL，判断是脉脉还是boss直聘
    const tab = await getActiveTab();
    const isMaimai = tab?.url?.includes('maimai.cn');

    // CSV 表头（带BOM，让Excel正确识别中文）
    const BOM = '\uFEFF';
    let headers;
    let rows;

    if (isMaimai) {
      // 脉脉表头（按逻辑分组）
      headers = ['姓名', '性别', '年龄', '城市', '学历', '活跃度', '工作年限', '现任职位', '标签', '就职', '学校'].join(',');

      // 准备数据行 - 脉脉字段
      rows = candidates.map(candidate => {
        return [
          escapeCSV(candidate.name || ''),
          escapeCSV(candidate.gender || ''),
          escapeCSV(candidate.age || ''),
          escapeCSV(candidate.city || ''),
          escapeCSV(candidate.education || ''),
          escapeCSV(candidate.activity || ''),
          escapeCSV(candidate.workExperience || ''),
          escapeCSV(candidate.currentPosition || ''),
          escapeCSV(Array.isArray(candidate.tags) ? candidate.tags.join('、') : candidate.tags || ''),
          escapeCSV(candidate.employment || ''),
          escapeCSV(candidate.school || '')
        ].join(',');
      });
    } else {
      // boss直聘表头（保持原样）
      headers = ['姓名', '活跃度', '年龄', '学历', '工作年限', '当前状态', '期望职位', '薪资期望', '最近公司', '技术栈与核心优势', '毕业院校', '工作经历', '教育经历'].join(',');

      // 准备数据行 - boss直聘字段
      rows = candidates.map(candidate => {
        // 处理工作经历（确保是数组）
        const workHistory = (candidate.workHistory || [])
          .map(w => `${w.period || ''} ${w.company || ''}`)
          .join('；');

        // 处理教育经历（确保是数组）
        const educationHistory = (candidate.educationHistory || [])
          .map(e => `${e.period || ''} ${e.eduInfo || e.school || ''}`)
          .join('；');

        return [
          escapeCSV(candidate.name || ''),
          escapeCSV(candidate.activity || ''),
          escapeCSV(candidate.age || ''),
          escapeCSV(candidate.education || ''),
          escapeCSV(candidate.workExperience || ''),
          escapeCSV(candidate.jobIntent || ''),
          escapeCSV(candidate.targetPosition || ''),
          escapeCSV(candidate.salary || ''),
          escapeCSV(candidate.lastCompany || ''),
          escapeCSV(candidate.advantage || ''),
          escapeCSV(candidate.university || ''),
          escapeCSV(workHistory),
          escapeCSV(educationHistory)
        ].join(',');
      });
    }

    // 组合CSV内容
    const csvContent = BOM + headers + '\n' + rows.join('\n');

    // 生成文件名
    const now = new Date();
    const dateStr = now.getFullYear() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') + '_' +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');
    const sitePrefix = isMaimai ? '脉脉' : 'BOSS直聘';
    const fileName = `${sitePrefix}_采集人选数据_${dateStr}.csv`;

    // 创建Blob并下载
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);

    console.log('Excel导出完成:', fileName);
  } catch (err) {
    console.error('Excel导出失败:', err);
    alert('Excel导出失败: ' + err.message);
  }
}

// CSV字段转义（处理逗号、引号、换行）
function escapeCSV(value) {
  if (!value) return '';
  const text = String(value);
  // 如果包含逗号、引号或换行，需要用引号包裹
  if (text.includes(',') || text.includes('"') || text.includes('\n') || text.includes('\r')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

// 渲染人选列表
function renderCandidates() {
  const start = (candidateState.currentPage - 1) * candidateState.itemsPerPage;
  const end = start + candidateState.itemsPerPage;
  const pageCandidates = candidateState.filteredCandidates.slice(start, end);

  if (pageCandidates.length === 0) {
    dom.candidateList.innerHTML = '<div class="empty">没有数据</div>';
    updatePaginationButtons();
    return;
  }

  dom.candidateList.innerHTML = pageCandidates.map((candidate, index) => {
    const totalIndex = start + index;
    const candidateElement = createCandidateElement(candidate, totalIndex);
    return candidateElement;
  }).join('');

  updatePaginationButtons();
}

// 创建人选元素（统一显示方式）
function createCandidateElement(candidate, index) {
  // 根据数据源判断显示哪些字段
  const isMaimai = candidate.city !== undefined; // 脉脉有city字段

  let infoFields = '';

  if (isMaimai) {
    // 脉脉数据显示
    infoFields = `
      <span>性别: ${candidate.gender || '未知'}</span>
      <span>年龄: ${candidate.age || '未知'}</span>
      <span>城市: ${candidate.city || '未知'}</span>
      <span>学历: ${candidate.education || '未知'}</span>
      <span>活跃度: ${candidate.activity || '未知'}</span>
    `;
  } else {
    // boss直聘数据显示
    infoFields = `
      <span>年龄: ${candidate.age || '未知'}</span>
      <span>学历: ${candidate.education || '未知'}</span>
      <span>工作年限: ${candidate.workExperience || '未知'}</span>
      <span>当前状态: ${candidate.jobIntent || ''}</span>
      <span>期望薪资: ${candidate.salary || '面议'}</span>
    `;
  }

  return `
    <div class="candidate-item" data-index="${index}">
      <div class="candidate-name">${candidate.name || '未知'}</div>
      <div class="candidate-info">
        ${infoFields}
      </div>
    </div>
  `;
}

// 显示详情面板
function showCandidateDetail(index) {
  const candidate = candidateState.filteredCandidates[index];

  dom.detailTitle.textContent = candidate.name;

  dom.detailContent.innerHTML = `
    <div class="detail-section">
      <div class="detail-field">
        <div class="detail-field-label">姓名</div>
        <div class="detail-field-value">${candidate.name}</div>
      </div>
      <div class="detail-field">
        <div class="detail-field-label">活跃度</div>
        <div class="detail-field-value">${candidate.activity}</div>
      </div>
      <div class="detail-field">
        <div class="detail-field-label">年龄</div>
        <div class="detail-field-value">${candidate.age}</div>
      </div>
      <div class="detail-field">
        <div class="detail-field-label">学历</div>
        <div class="detail-field-value">${candidate.education}</div>
      </div>
      <div class="detail-field">
        <div class="detail-field-label">工作年限</div>
        <div class="detail-field-value">${candidate.workExperience}</div>
      </div>
      <div class="detail-field">
        <div class="detail-field-label">当前状态</div>
        <div class="detail-field-value">${candidate.jobIntent || ''}</div>
      </div>
      <div class="detail-field">
        <div class="detail-field-label">期望职位</div>
        <div class="detail-field-value">${candidate.targetPosition}</div>
      </div>
      <div class="detail-field">
        <div class="detail-field-label">薪资期望</div>
        <div class="detail-field-value">${candidate.salary}</div>
      </div>
      <div class="detail-field">
        <div class="detail-field-label">当前公司/最近公司</div>
        <div class="detail-field-value">${candidate.lastCompany}</div>
      </div>
      <div class="detail-field">
        <div class="detail-field-label">技术栈与核心优势</div>
        <div class="detail-field-value">${candidate.advantage}</div>
      </div>
      <div class="detail-field">
        <div class="detail-field-label">毕业院校</div>
        <div class="detail-field-value">${candidate.university}</div>
      </div>
      <div class="detail-field">
        <div class="detail-field-label">工作经历</div>
        <div class="detail-field-value">
          ${candidate.workHistory.map(work => `
            <div class="timeline-item">
              <div class="timeline-time">${work.period}</div>
              <div class="timeline-content">${work.company}</div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="detail-field">
        <div class="detail-field-label">教育经历</div>
        <div class="detail-field-value">
          ${candidate.educationHistory.map(edu => `
            <div class="timeline-item">
              <div class="timeline-time">${edu.period}</div>
              <div class="timeline-content">${edu.eduInfo || ''}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  dom.detailPanel.classList.add('show');
}

// 关闭详情面板
function closeDetail() {
  dom.detailPanel.classList.remove('show');
}

// 分页控制
function goToPage(direction) {
  const totalPages = Math.ceil(candidateState.filteredCandidates.length / candidateState.itemsPerPage);
  const newPage = candidateState.currentPage + direction;

  if (newPage >= 1 && newPage <= totalPages) {
    candidateState.currentPage = newPage;
    renderCandidates();

    // 滚动到顶部
    dom.candidateList.scrollTop = 0;
  }
}

// 更新分页按钮状态
function updatePaginationButtons() {
  const totalPages = Math.ceil(candidateState.filteredCandidates.length / candidateState.itemsPerPage);

  dom.prevBtn.disabled = candidateState.currentPage <= 1;
  dom.nextBtn.disabled = candidateState.currentPage >= totalPages || totalPages === 0;
  dom.pageInfo.textContent = `第 ${candidateState.currentPage} 页 / 共 ${totalPages} 页`;
}

// 初始化事件监听器
document.addEventListener('DOMContentLoaded', () => {
  // 职位加载相关
  dom.loadAllBtn.addEventListener('click', async () => {
    dom.loadAllBtn.disabled = true;
    updateLoadStatus(STATUS.LOADING, 0);

    try {
      await sendMessageToTab({ action: 'startLoadingAll' });
    } catch (err) {
      console.error('发送消息失败:', err);
      updateLoadStatus(STATUS.ERROR, 0);
      dom.loadAllBtn.disabled = false;
    }
  });

  // 采集按钮
  dom.loadCandidatesBtn.addEventListener('click', loadCandidatesData);

  // 分页按钮
  dom.prevBtn.addEventListener('click', () => goToPage(-1));
  dom.nextBtn.addEventListener('click', () => goToPage(1));

  // 详情关闭按钮
  dom.detailCloseBtn.addEventListener('click', closeDetail);

  // 候选人列表点击（事件委托）
  dom.candidateList.addEventListener('click', (e) => {
    const item = e.target.closest('.candidate-item');
    if (item) {
      const index = parseInt(item.dataset.index);
      if (!isNaN(index)) {
        showCandidateDetail(index);
      }
    }
  });
});

checkPageStatus();
