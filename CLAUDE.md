# 星际塔罗师 (Intuitive Tarot)

互动式塔罗牌占卜 Web 应用，支持 3D 星环选牌、手势识别、AI 解读。

## 项目结构

```
tarot-project/
├── index.html                 # 单页应用主入口（HTML + 内联 CSS，~2570 行）
├── css/                       # 外部样式规范（variables/base/layout/components/animations）
├── js/
│   ├── main.js                # 应用主入口，页面流程，事件处理
│   ├── config.js              # 配置常量，AI Prompt 模板
│   ├── state.js               # AppState 单例，发布-订阅
│   ├── three-scene.js         # Three.js 场景初始化
│   ├── star-ring.js           # 星环 3D 牌卡排列、洗牌动画
│   ├── card-animations.js     # 粒子汇聚、翻牌、飞入卡槽
│   ├── mouse-controller.js    # 鼠标/触摸拖拽、Raycaster 选牌
│   ├── gesture.js             # MediaPipe 手势识别
│   ├── ai-service.js          # Claude/Gemini API 调用、流式响应
│   ├── tarot-data.js          # 塔罗牌 JSON 加载
│   ├── storage.js             # LocalStorage 封装
│   └── debug-controls.js      # 调试面板
├── data/tarot-cards.json      # 78 张塔罗牌数据
├── assets/                    # 静态资源
├── backup/                    # 旧版本备份
├── dev-log.md                 # 开发日志
└── 需求文档.md                 # 产品需求文档
```

## 技术栈

- 原生 HTML/CSS/JS，无框架，无构建工具（无 package.json）
- Three.js 0.160.0（unpkg CDN，Import Map）
- MediaPipe Hands（CDN）
- marked.js（jsDelivr CDN）
- AI 后端：Claude claude-sonnet-4-20250514 / Gemini gemini-2.0-flash
- ES Module（`<script type="module">`）

## 代码风格约定

### CSS
- **实际样式全部内联在 index.html 的 `<style>` 中**，`css/` 目录是设计规范参考
- 移动端 4 层媒体查询断点：
  - `max-width: 768px` — 手机/平板竖屏
  - `max-width: 375px` — iPhone SE 超小屏
  - `max-height: 500px` + `orientation: landscape` — 手机横屏
  - `min-width: 768px` ~ `max-width: 1366px` + `orientation: landscape` — iPad 横屏
- 颜色变量：`--bg-page`、`--btn-primary`（#7B5EA7 紫）、`--btn-secondary`（#C9A962 金）
- 页面切换用 `display: none` / 类名切换

### JavaScript
- ES Module，类用 PascalCase，函数变量用 camelCase
- 中文注释，日志格式 `console.log('[module] message')`
- DOM 元素在 main.js 顶部集中声明
- 调试模式：`const DEBUG_MODE = false`
- **缓存刷新**：无构建工具，靠 `?v=N` 查询参数破缓存。Vercel 对 `/js/*` 设置了 `immutable` 长缓存，所以**所有** JS 文件间的 import 都必须带 `?v=N`（不只是 main.js）。每次修改 `js/` 下的文件后，必须同步将以下位置的 `?v=N` 版本号统一 +1：
  1. `index.html` 的 `<script src="js/main.js?v=N">`
  2. `main.js` 中所有 import 语句
  3. 子模块中的跨文件 import（如 `ai-service.js` 中的 `import { CONFIG } from './config.js?v=N'`）

### 状态管理
- `AppState` 单例（state.js），六阶段：IDLE → QUESTION → SELECTING → READING → RESULT / INTUITION
- LocalStorage 三个 key：`tarot_settings`、`tarot_intuition_records`、`tarot_reading_history`


## Git 规范

- 每次完成改动后，询问我是否 commit 和 push
- 得到确认后再执行 git add、commit、push
- push 时必须同时推两个 remote：`git push origin main && git push gitee main`（Vercel 绑 GitHub origin，代码备份在 Gitee）
- commit message 格式：`vX.X: 简短描述`

## 不要动的文件

- `css/` 目录 — 设计规范参考，不被实际引用，不要修改
- `backup/` — 旧版备份，不要修改或删除
- `data/tarot-cards.json` — 78 张牌数据，除非明确要求不要改
- `js/debug-controls.js` — 调试工具，正常开发不需要动
- `需求文档.md` — 产品需求，除非明确要求不要改
