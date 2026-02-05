# 问题排查记录

本文档记录在开发 HR Helper Chrome 扩展时遇到的问题及解决方案。

---

## 1. CSP (Content Security Policy) 错误

**错误信息：**
```
Executing inline event handler violates the following Content Security Policy directive 'script-src 'self''. Either the 'unsafe-inline' keyword, a hash ('sha256-...'), or a nonce ('nonce-...') is required to enable inline execution.
```

**原因：**
Chrome 扩展的 CSP 不允许使用内联事件处理器（`onclick="..."`）。

**解决方案：**
- 移除 HTML 中的所有内联事件处理器
- 改用 JavaScript 的 `addEventListener` 添加事件监听器

**修改文件：**
- `popup.html`: 移除所有 `onclick`、`onchange` 等内联属性
- `popup.js`: 使用 `addEventListener` 绑定事件

**示例：**
```html
<!-- 错误写法 -->
<button onclick="doSomething()">点击</button>

<!-- 正确写法 -->
<button id="myButton">点击</button>

<script>
document.getElementById('myButton').addEventListener('click', doSomething);
</script>
```

---

## 2. "当前状态"数据取不到

**现象：**
即使页面上有"离职-随时到岗"等状态信息，扩展采集后显示为空。

**原因：**
选择器 `.col-3 .content` 选中的是工作经历的时间线元素，而不是"当前状态"元素。

**解决方案：**
1. 添加调试函数 `debugJobStatus()`，遍历候选人卡片查找包含状态关键词的元素
2. 修改提取逻辑，如果原选择器的内容不包含状态关键词，则遍历所有子元素查找

**修改文件：**
- `content.js`: 添加 `extractJobIntentFromItem()` 函数和 `debugJobStatus()` 调试函数

**调试方法：**
在页面控制台执行：
```javascript
debugJobStatus()
```

---

## 3. SheetJS 库无法加载

**错误信息：**
```
Loading script 'https://...' violates the following Content Security Policy directive: "script-src 'self'".
XLSX is not defined
```

**原因：**
Chrome 扩展的 CSP 不允许：
1. 加载外部脚本（CDN）
2. 使用内联脚本

**解决方案：**
改用 CSV 格式导出，不依赖外部库：
- 使用原生 JavaScript 创建 CSV
- 添加 BOM (`\uFEFF`) 让 Excel 正确识别中文
- 使用 Blob 和 `<a>` 标签触发下载

**修改文件：**
- `popup.html`: 移除 SheetJS 的 `<script>` 标签
- `popup.js`: 重写 `exportToExcel()` 函数，改用 CSV 格式
- `manifest.json`: 添加 `downloads` 权限

**导出功能实现：**
```javascript
function exportToExcel(candidates) {
  // CSV 表头（带BOM）
  const BOM = '\uFEFF';
  const headers = ['姓名', '活跃度', '年龄', ...].join(',');

  // 准备数据行
  const rows = candidates.map(candidate => {
    // 处理包含逗号、引号的字段
    return [escapeCSV(field1), escapeCSV(field2), ...].join(',');
  });

  // 组合CSV内容
  const csvContent = BOM + headers + '\n' + rows.join('\n');

  // 创建Blob并下载
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
```

---

## 4. 数据格式化问题

**问题：**
多个信息块的内容连接在一起，难以阅读。例如：`四川大学计算机科学与技术硕士`

**解决方案：**
使用明显的分隔符：
- 时间：`2021 - 2025`（用 ` - ` 分隔起止日期）
- 工作经历：`智谱华章|研究员`（用 `|` 分隔公司+职位）
- 教育经历：`深圳大学|管理科学与工程|硕士`（用 `|` 分隔学校+专业+学位）

**修改文件：**
- `content.js`: 修改 `parseTimeline()` 和工作/教育经历的提取逻辑

---

## 5. 去除无意义信息

**问题：**
很多字段显示"未知"，如"未知(未知)"。

**解决方案：**
- "当前状态"等字段：没有匹配时返回空字符串 `''` 而不是 `'未知'`
- 其他字段：过滤掉纯"未知"的值

---

## 常用调试技巧

### 查找选择器
```javascript
// 在页面控制台执行
debugHRHelper()  // 查找候选人卡片的可能选择器
debugJobStatus()  // 查找"当前状态"的提取问题
```

### 检查元素
```javascript
document.querySelectorAll('.card-item')  // 检查候选人卡片
document.querySelectorAll('[class*="job"]')  // 模糊匹配包含job的class
element.outerHTML  // 查看元素的完整HTML
```

### 查看控制台
- **页面控制台**（F12）：查看 `content.js` 的日志
- **弹窗控制台**（右键扩展图标 -> 检查）：查看 `popup.js` 的日志

---

## Chrome 扩展 CSP 限制总结

Chrome 扩展的 CSP 默认配置：
```
script-src 'self'
```

这意味：
- ✅ 只能加载扩展包内的脚本
- ❌ 不能加载外部 CDN 的脚本
- ❌ 不能使用内联事件处理器
- ❌ 不能使用内联脚本

**解决方案：**
1. 将所有依赖的库文件放到扩展包内
2. 使用 `addEventListener` 替代内联事件
3. 如需外部脚本，需要在 `manifest.json` 中配置 CSP（不推荐）

---

## 快速参考清单

遇到类似问题时，按以下顺序排查：

| 问题 | 检查点 | 参考章节 |
|------|----------|----------|
| 按钮无反应 | 1. 检查事件监听器是否正确绑定<br>2. 查看控制台是否有报错 | #1, #3 |
| 数据取不到 | 1. 选择器是否正确<br>2. 查找实际元素的 class 名称<br>3. 使用 `debugHRHelper()` 调试 | #2 |
| 下载失败 | 1. 检查 CSP 限制<br>2. 改用原生实现<br>3. 检查网络连接 | #3 |
| 中文乱码 | 1. 确认添加 BOM (`\uFEFF`)<br>2. 检查编码是否为 utf-8 | #3 |
| 格式错误 | 1. 检查分隔符是否正确<br>2. 检查数据转义 | #4 |

---

## 更新日期
- 2026-02-01: 初始化项目
- 2026-02-01: 解决 CSP 内联事件问题
- 2026-02-01: 解决"当前状态"提取问题
- 2026-02-01: 实现 CSV 导出功能（绕过 CSP 限制）
- 2026-02-01: 优化数据格式化
- 2026-02-01: 去除无意义"未知"信息
