# Phase 1：竞品与开源仓库评估

更新日期：2026-05-07

## 1. 评估范围

本阶段只回答四件事：

1. 哪个开源仓库最值得参考或借用
2. 哪个仓库不适合第一版直接 fork
3. 竞品里哪些功能值得第一版做
4. 哪些功能有明显合规风险，第一版不要做

## 2. 开源仓库评估

### 2.1 总表

| 仓库 | 技术栈 | License | 核心功能 | 可复用模块 | 不建议复用部分 | 改造成本项目难度 | 推荐优先级 |
|---|---|---|---|---|---|---|---|
| `neonwatty/x-search-pro` | 原生 MV3 + JavaScript/TypeScript 工具链 + `chrome.storage.sync` + Playwright 测试 | MIT | X 搜索模板库、分类、颜色、侧边栏、Popup、自动更新时间窗口 | `manifest.json` 结构、Popup、Sidebar、搜索模板、分类与颜色体系、Playwright 测试方式 | 只围绕搜索库设计，缺少任务系统、行为计数、热力图、粉丝快照 | 中 | **第一优先级参考** |
| `affaan-m/x-algorithm-score` | React 18 + TypeScript + Vite + CRXJS + Tailwind + MV3 | MIT | 发帖前评分、实时 overlay、Popup、设置页、可选 AI 深度分析 | Composer 检测、站内 overlay、评分面板结构、Popup 信息架构 | 算法评分逻辑过重，依赖“发帖优化”而不是“每日执行系统”；可选 AI 分析不是第一版重点 | 低到中 | **第二优先级参考** |
| `ibrahimahmed/growthmate` | Next.js 16 + React 19 + TypeScript + Tailwind 4 + NextAuth + PostgreSQL + Redis + X API v2 | MIT | AI 回复、内容生成、排程、趋势发现、分析仪表盘、监控账号 | 信息架构、页面路由、分析页模块拆分、监控账号概念 | 依赖 X OAuth / X API / Postgres / Redis / AI Key；是完整 SaaS，不是轻量插件 | 高 | **中长期参考，不建议第一版 fork** |
| `MarsX-dev/GrowthX` | 轻量 MV3 + 原生 JS/CSS/HTML | MIT | 在回复时自动插入对方名字 | Manifest 最小骨架、极轻量 content script 思路 | 功能过窄，几乎不覆盖本项目目标；README 与仓库名存在偏差，成熟度有限 | 低，但价值低 | **低优先级，不建议作为基础** |

### 2.2 结构与依赖判断

| 仓库 | 是否 Chrome Extension | 是否 Manifest V3 | 是否有 Popup | 是否有 Sidebar / Content Script | 本地存储 | 是否有 X 页面 DOM 交互 | 是否有搜索模板 | 是否有 analytics dashboard | 是否依赖 X API | 是否依赖数据库/后端/OAuth | 是否适合作为第一版基础 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `x-search-pro` | 是 | 是 | 是 | 是 | `chrome.storage.sync` | 是 | 是 | 否 | 否 | 否 | **适合作为结构参考，但不建议直接 fork 成最终产品** |
| `x-algorithm-score` | 是 | 是 | 是 | 是 | `chrome.storage.local` | 是 | 否 | 轻量，仅发帖评分相关 | 否 | 否，只有可选 Claude API | **适合局部借鉴** |
| `growthmate` | 否，Web App | 否 | 不适用 | 不适用 | PostgreSQL + Redis | 主要通过 API，不是站内扩展 | 有搜索页，但不是模板型侧边栏 | 是 | 是 | 是 | **不适合第一版基础** |
| `GrowthX` | 是 | 是 | 是 | 是 | 推测为浏览器本地存储，仓库未体现复杂数据层 | 是 | 否 | 否 | 否 | 否 | **不适合作为基础** |

### 2.3 逐个判断

#### 2.3.1 `neonwatty/x-search-pro`

结论：

- 你的初步判断基本正确。
- 它是四个仓库里最接近“Chrome 插件 MVP 骨架”的一个。
- 但它更适合做“参考模板”，不适合原样 fork 成最终产品。

原因：

1. 它已经是标准 MV3 扩展，直接具备 `popup`、`background service worker`、`content_scripts`。
2. 它已经把“侧边栏 + Popup + 搜索模板 + 本地存储 + 测试”这条链路跑通了。
3. 它的数据层用的是 `chrome.storage.sync`，更适合保存搜索模板，不适合承载后续的每日记录、热力图、复盘历史。
4. 它没有解决本项目最核心的三件事：发帖 / 回复 / 引用行为计数、粉丝快照、任务完成度。

最值得借的部分：

- MV3 目录结构
- 搜索模板与分类管理
- 站内侧边栏交互
- Popup 和 Sidebar 的双入口设计
- Playwright 测试体系

不建议直接照搬的部分：

- 以“搜索库”为中心的信息架构
- 仅靠 `chrome.storage.sync` 承载全部业务数据

#### 2.3.2 `affaan-m/x-algorithm-score`

结论：

- 你的初步判断也基本正确。
- 它不适合当主基础，但很适合作为“发帖前质量检查”和“站内 overlay 体验”的参考。

原因：

1. 它也是标准 MV3 扩展，工程结构清晰。
2. 它最有价值的不是算法分数本身，而是“在 X 发帖输入框附近实时给反馈”的交互方式。
3. 这正好能迁移成你后续的“发帖前提醒”“是否达到今日原创帖目标”“质量检查提示”。
4. 但它本质上是“单贴评分器”，不是“每日任务教练”。

最值得借的部分：

- Composer 监听
- Overlay 面板
- Popup 三栏信息架构
- 站内轻提示而不是跳到单独后台

不建议直接照搬的部分：

- 复杂算法评分体系
- 可选 AI 深度分析作为第一版主卖点

#### 2.3.3 `ibrahimahmed/growthmate`

结论：

- 你的判断正确。
- 它明显更重，适合中长期参考，不适合第一版直接 fork。

原因：

1. 它不是浏览器扩展，而是完整 Web 应用。
2. 它依赖 X Developer OAuth、`twitter-api-v2`、Postgres、Redis、AI Key。
3. 它要解决的是“完整增长平台”，而你第一版要解决的是“每天该做什么、做了多少、结果怎样”。
4. 它的重量和运行门槛都明显高于你的 MVP 目标。

最值得借的部分：

- 路由拆分思路
- “监控账号”概念
- 分析页与趋势页模块命名

不建议第一版复用的部分：

- OAuth 与 API 依赖
- 数据库和缓存基础设施
- AI 写作、排程、趋势、分析全家桶

#### 2.3.4 `MarsX-dev/GrowthX`

结论：

- 它不适合作为第一版基础。
- 你的“待评估”结论需要下调优先级。

原因：

1. 仓库虽然名叫 `GrowthX`，但 README 实际功能是 `NameInserter`，只做回复时自动插入名字。
2. 目录很轻，只有 `manifest.json`、`background.js`、`popup.html`、`scripts`、`styles`。
3. 没有搜索模板、没有数据层、没有任务系统、没有热力图、没有分析能力。
4. 可用性像一个小功能插件，不像可扩展基础。

最值得借的部分：

- 极简 MV3 清单
- 最小 content script 结构

不建议作为基础的原因：

- 能力范围太窄
- 产品目标与本项目差距太大

### 2.4 对你当前倾向的验证

| 你的原判断 | 结论 | 我的判断 |
|---|---|---|
| 第一优先级参考 / fork：`x-search-pro` | 基本正确 | **参考正确，fork 不建议过早决定** |
| 第二优先级参考：`x-algorithm-score` | 正确 | **非常适合借 overlay 与发帖前提醒** |
| 中长期参考：`growthmate` | 正确 | **第一版不要 fork** |
| `GrowthX` 待评估 | 已可下结论 | **优先级下调，不建议作为基础** |

## 3. 竞品拆解

### 3.1 竞品功能表

| 竞品 | 值得模仿的功能 | 第一版是否做 | 后续版本再做 | 合规风险 |
|---|---|---|---|---|
| `StreakX` | 连续打卡、每日目标、GitHub 风格热力图、侧边栏常驻、本地记录 | **做** | 更长期的趋势分析 | 低 |
| `XSight` | 活动热力图、日目标、增长侧边栏、轻量护栏 | **做简化版**：热力图、目标、进度、提醒 | 快速关注、关注额度保护 | 中 |
| `SuperX` | 今日该回谁、今日该发什么、站内灵感流、站内增长信息层 | **做简化版**：今日建议、互动对象建议、轻分析 | Auto DM、Auto Plug、完整排程、自动删除 | 高 |
| `BlackMagic` | 重点联系人、过往互动记录、提醒跟进、站内关系管理 | **做简化版**：账号池、互动记录、跟进提醒 | 私密备注、完整 CRM、周报邮件 | 中 |
| `Typefully` | 排程体验、日历、推荐发布时间、AI 改写、内容草稿流 | **做最小版**：推荐发布时间、草稿/复盘复制 | 多平台发布、完整日历、团队协作 | 中 |
| `Hypefury` | 灵感库、模板库、内容复用、自动化变现 | **只借灵感库思路** | 自动复投、Auto DM、Auto-plug、跨平台自动分发 | 高 |

### 3.2 本项目最该模仿的竞品组合

建议不是模仿某一个竞品，而是做一个“轻组合”：

1. 用 `StreakX` 的连续打卡和热力图，建立每天打开就有反馈的感觉
2. 用 `XSight` 的站内侧边栏和轻量进度反馈，减少跳出成本
3. 用 `SuperX` 的“今日建议”思路，但只保留人工执行提示
4. 用 `BlackMagic` 的轻关系管理，做账号池和跟进提醒
5. 用 `Typefully` 的推荐发布时间和草稿复制体验，帮助执行但不自动代发

### 3.3 第一版建议直接做的功能

1. 今日任务面板
2. 连续天数
3. 30 天 / 90 天热力图
4. posts / replies / quotes 计数
5. 粉丝数每日快照
6. 搜索模板
7. 互动账号池
8. 今日建议
9. 每日复盘
10. CSV / JSON 导出

### 3.4 第一版不要做的功能

1. 自动私信
2. 自动关注
3. 自动点赞
4. 自动转发
5. 自动评论
6. 自动插推广评论
7. 自动删除低表现内容
8. 多平台排程
9. 团队协作
10. 服务端同步

## 4. 合规边界判断

### 4.1 低风险，第一版可以做

- 本地记录
- 今日目标
- 连续打卡
- 热力图
- 粉丝数手动 / 半自动记录
- 搜索模板
- 复盘生成
- CSV / JSON 导出
- AI 回复草稿，但由用户手动确认

### 4.2 中风险，只做保守版本

- 重点账号池
- 跟进提醒
- 最佳发布时间建议
- 站内轻量互动建议
- 过往互动历史记录

### 4.3 高风险，第一版明确不做

- Auto DM
- Auto Plug
- Auto Retweet
- 批量关注或快速关注系统
- 任何模拟真人批量互动的自动化

## 5. Phase 1 结论

### 5.1 对开源仓库的结论

- **最值得参考：`x-search-pro`**
- **最值得局部借鉴：`x-algorithm-score`**
- **中长期参考：`growthmate`**
- **不建议作为基础：`GrowthX`**

### 5.2 对竞品的结论

第一版最该学的是：

- `StreakX` 的任务感
- `XSight` 的站内反馈
- `SuperX` 的今日建议
- `BlackMagic` 的轻关系管理
- `Typefully` 的发布时间建议与草稿体验

第一版最不该学的是：

- `SuperX` / `Hypefury` 的自动化增长动作
- `Typefully` / `Hypefury` 的完整排程平台路线

## 6. 主要来源

### 6.1 开源仓库

- [`neonwatty/x-search-pro`](https://github.com/neonwatty/x-search-pro)
- [`neonwatty/x-search-pro` manifest](https://github.com/neonwatty/x-search-pro/blob/main/manifest.json)
- [`neonwatty/x-search-pro` package](https://github.com/neonwatty/x-search-pro/blob/main/package.json)
- [`neonwatty/x-search-pro` storage](https://github.com/neonwatty/x-search-pro/blob/main/lib/storage.js)
- [`affaan-m/x-algorithm-score`](https://github.com/affaan-m/x-algorithm-score)
- [`affaan-m/x-algorithm-score` manifest](https://github.com/affaan-m/x-algorithm-score/blob/main/manifest.json)
- [`affaan-m/x-algorithm-score` package](https://github.com/affaan-m/x-algorithm-score/blob/main/package.json)
- [`ibrahimahmed/growthmate`](https://github.com/ibrahimahmed/growthmate)
- [`ibrahimahmed/growthmate` package](https://github.com/ibrahimahmed/growthmate/blob/main/package.json)
- [`ibrahimahmed/growthmate` docker-compose](https://github.com/ibrahimahmed/growthmate/blob/main/docker-compose.yml)
- [`MarsX-dev/GrowthX`](https://github.com/MarsX-dev/GrowthX)
- [`MarsX-dev/GrowthX` manifest](https://github.com/MarsX-dev/GrowthX/blob/main/src/manifest.json)

### 6.2 竞品

- [StreakX 官网](https://streakx.egmn.dev/)
- [StreakX Chrome Web Store](https://chromewebstore.google.com/detail/streakx/pkgehkldgijpfabkighebomfamcfaeki)
- [XSight Chrome Web Store](https://chromewebstore.google.com/detail/xsight/opngnicgjjdngogboecljgniclpgkdao)
- [SuperX 官网](https://superx.so/)
- [SuperX Chrome Web Store](https://chromewebstore.google.com/detail/superx-twitter-analytics/bjobgelaoehgbnklgcaaehdpckmhkplk?hl=en)
- [BlackMagic 官网](https://blackmagic.so/)
- [Typefully 官网](https://typefully.com/)
- [Typefully Analytics 文档](https://support.typefully.com/en/articles/8718148-analytics-page-metrics)
- [Typefully Scheduling 文档](https://support.typefully.com/en/articles/9210135-scheduling-queue-and-calendar)
- [Typefully AI Quick Edits](https://support.typefully.com/en/articles/8717738-typefully-ai-rewrites-ideas/)
- [Hypefury 官网](https://hypefury.com/)
- [Hypefury 功能与定价](https://hypefury.com/features-pricing)

