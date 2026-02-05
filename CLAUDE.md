# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HR Helper is a Chrome Extension (Manifest V3) that enhances recruitment platforms (BOSS直聘/zhipin.com and 脉脉/maimai.cn) by:
- Automatically scrolling/clicking to load all candidate/job data
- Extracting and displaying candidate information in a paginated view
- Exporting collected data to CSV (Excel-compatible format)

## Development Workflow

### Loading the Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (top-right toggle)
3. Click "Load unpacked"
4. Select the `hr-helper` folder

### After Code Changes

To test changes, reload the extension by clicking the refresh icon on the extension card at `chrome://extensions/`. No build process is required.

## Architecture

### Core Components

**`manifest.json`**: Extension configuration. Permissions: `activeTab`, `notifications`, `downloads`. Host permissions for both `https://www.zhipin.com/*` and `https://maimai.cn/*`.

**`content.js`**: Multi-site content script with site-specific configurations:
- `SITE_CONFIGS`: Object containing configurations for `zhipin` and `maimai` sites
- Site detection via `detectSite()` function (checks URL)
- Supports both scroll-based loading (zhipin) and button-click loading (maimai)
- Separate data extraction functions: `extractZhipinData()` and `extractMaimaiData()`
- Message handlers for `startLoadingAll`, `getStatus`, `stopLoadingAll`, `collectCandidates`

**`popup.js`**: Popup interface logic. Handles:
- Site detection (`isSupportedUrl()`, `getSiteName()`) - supports both zhipin.com and maimai.cn
- Status checking via `checkPageStatus()`
- Job loading controls and status display
- Candidate data collection and CSV export (via `exportToExcel()`)
- Pagination and detail panel display

**`popup.html`**: 320px width popup containing:
- Load status section (shows ready/loading/complete/error states)
- "采集人选数据" (Collect Candidate Data) button
- Candidate list with pagination
- Slide-out detail panel

### Data Flow - Loading

1. User clicks "加载全部职位" (Load All Jobs) in popup
2. `popup.js` sends `startLoadingAll` message to `content.js`
3. `content.js` executes loading loop based on `CONFIG.LOAD_TYPE`:
   - **Scroll mode** (zhipin): Scrolls to bottom, waits, counts items
   - **Button mode** (maimai): Clicks "Load More" button via `findLoadMoreButton()`, waits
   - Checks for "no more" indicators via `isLoadComplete()`
   - Stops when: max loops reached, no increase for N iterations, or "no more" detected
4. Progress updates sent back to popup via `chrome.runtime.sendMessage`
5. Completion notification displayed

### Data Flow - Collection

1. User clicks "采集人选数据" (Collect Candidate Data) in popup
2. `popup.js` sends `collectCandidates` message to `content.js`
3. `content.js` calls appropriate extract function based on `currentConfig.extractData`
4. Data returned to popup, displayed in paginated list, and auto-exported to CSV

### Site Configuration System

**`SITE_CONFIGS` in `content.js` (lines 6-66)**: Each site config contains:
- `CANDIDATE_SELECTOR`: CSS selector for candidate cards
- `NO_MORE_SELECTORS`: Array of CSS selectors for end-of-list indicators
- `NO_MORE_PATTERNS`: Array of text patterns (Chinese)
- `LOAD_TYPE`: `'scroll'` or `'button'`
- `LOAD_MORE_SELECTOR`: CSS selector for load-more button (button mode)
- `LOAD_MORE_TEXT`: Array of button text keywords (button mode)
- `MAX_LOOPS`: Maximum iterations (default: 100)
- `WAIT_TIME`: Delay between operations in ms (default: 2500)
- `NO_INCREASE_THRESHOLD`: Consecutive non-increases before stopping (default: 3)
- `extractData`: Function name for data extraction

**Zhipin selectors** (`.card-item`):
- `.name` - candidate name
- `.active-text` - activity status
- `.base-info` - age, education, experience
- `.salary-wrap` - salary expectations
- `.col-3 .content` / keyword search - job intent ("离职-随时到岗", etc.)
- `.row-flex` - target position (with label check)
- `.geek-desc .content` + `.tags-wrap` - technical advantages
- `.work-exps .timeline-item` - work history
- `.edu-exps .timeline-item` - education history

**Maimai selectors** (`.card___3gwOI`):
- `.font-weight-bold` - name
- Text pattern matching - activity ("今日活跃", etc.), city, gender
- `.item___pCPU7` with `.label___3pw_V` - structured fields (current position, employment, school)
- `.ellipsis.tag___2hH1V` - tags (split by `、`)

### CSV Export

CSV files are generated with BOM (`\uFEFF`) for Excel compatibility. Exported data varies by site:
- **Zhipin**: 姓名, 活跃度, 年龄, 学历, 工作年限, 当前状态, 期望职位, 薪资期望, 最近公司, 技术栈与核心优势, 毕业院校, 工作经历, 教育经历
- **Maimai**: 姓名, 性别, 年龄, 城市, 学历, 活跃度, 工作年限, 现任职位, 标签, 就职, 学校

## CSP Considerations

The extension does NOT use external libraries (no CDN scripts) due to Chrome Extension CSP restrictions:
- All event handlers use `addEventListener` (no inline `onclick`)
- CSV export uses native JavaScript (no SheetJS/xlsx library)
- All scripts are loaded from the extension package (`'self'` source)

See `TROUBLESHOOTING.md` for more details on CSP-related issues and solutions.

## Debugging

**Content script console** (F12 on zhipin.com/maimai.cn page):
- `debugHRHelper()` - Find candidate card selectors
- `debugJobStatus()` - Debug "current status" extraction (zhipin)
- `debugSiteConfig()` - Show current site configuration
- `debugMaimaiExtract([index])` - Test maimai data extraction

**Popup console** (right-click extension icon → Inspect):
- View `popup.js` logs for collection/export progress

**Common issues**:
- If selectors break: Use `debugHRHelper()` to find updated selectors
- If data extraction fails: Check DOM structure with browser DevTools
- If "no more" detection fails: Update `NO_MORE_SELECTORS`/`NO_MORE_PATTERNS`
