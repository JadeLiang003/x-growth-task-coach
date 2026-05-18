# Phase 0：仓库与 Skills 分析

## 1. 本阶段范围

本阶段只做仓库盘点和可复用性分析，不进入功能实现。

本次实际工作范围分成两层：

1. 当前 Git 仓库：`D:\myapp\ai_program\tmp\twitter-web-exporter`
2. 同一工作区内的可借用资产：`xiaohongshu-social-assistant`、`xiaohongshu-growth-playbook`、`xiaohongshu-content-ops`、`x-grok-analysis-pipeline`

说明：

- `D:\myapp\ai_program` 自身不是 Git 仓库。
- 已新建分析分支：`phase-0-repo-skills-analysis`
- 当前最适合作为后续开发基座的 Git 仓库，是 `tmp/twitter-web-exporter`

## 2. 结论先看

最值得复用的不是单一项目，而是三类能力的组合：

| 优先级 | 资产 | 结论 | 作用 |
|---|---|---|---|
| P0 | `tmp/twitter-web-exporter` | 直接复用 | 作为 X 页面数据监听、本地存储、导出和嵌入式面板基座 |
| P1 | `xiaohongshu-social-assistant` | 复用设计骨架 | 迁移“总控 + 编排 + 执行 + 评分 + 报告 + 指标”的任务系统结构 |
| P1 | `x-grok-analysis-pipeline` | 局部复用 | 迁移“多步分析流水线 + 最终报告组装”的文档与分析闭环 |
| P2 | `xiaohongshu-growth-playbook` | 借鉴方法 | 借“阶段判断 -> 每日动作 -> 检查清单 -> 风险提醒”的教练输出格式 |
| P2 | `xiaohongshu-content-ops` | 借鉴流程 | 借审核、半自动执行、发布前停手、浏览器登录保持等流程 |

一句话判断：

- **后续如果要做 Chrome Extension MVP，不建议从零起盘。**
- **最合理的路线是先以 `twitter-web-exporter` 为技术基座，再把其他目录里的任务编排、统计、导出、方法论骨架迁进来。**

## 3. 当前仓库已有 skills / 模块盘点

### 3.1 可复用资产总表

| Skill / 模块 | 路径 | 主要能力 | 是否适合本项目 | 可复用方式 | 风险 / 注意事项 |
|---|---|---|---|---|---|
| `twitter-web-exporter` 核心仓库 | `tmp/twitter-web-exporter` | X 网页端数据监听、悬浮面板、IndexedDB、本地导出 | 高 | 直接作为 Phase 3 之前的主基座 | 这是 Userscript，不是 Chrome Extension；后续要补 MV3 包装或迁移 |
| `ExtensionManager` | `tmp/twitter-web-exporter/src/core/extensions/manager.ts` | 拦截 XHR、模块注册、启停控制 | 高 | 直接复用模块注册和拦截思路 | 依赖 X 当前网页请求结构，平台改动会失效 |
| `DatabaseManager` | `tmp/twitter-web-exporter/src/core/database/manager.ts` | Dexie/IndexedDB、版本迁移、按账号分库、导入导出 | 高 | 直接改造成 DailyRecord / AccountPool / SearchTemplate 存储层 | 现有表结构围绕 tweet/user/capture，需重建业务 schema |
| `AppOptionsManager` | `tmp/twitter-web-exporter/src/core/options/manager.ts` | 本地设置、版本迁移、主题语言配置 | 高 | 直接改造成 playbook、目标设置、开关项管理 | 当前基于 `localStorage`，复杂设置后续可能要并入 IndexedDB |
| `App` 悬浮面板 | `tmp/twitter-web-exporter/src/core/app.tsx` | 页面内嵌面板、开关入口、模块容器 | 高 | 直接复用交互壳子 | 当前 UI 面向“导出工具”，信息架构需要重排 |
| `Settings` | `tmp/twitter-web-exporter/src/core/settings.tsx` | 设置弹窗、模块启停、数据库维护 | 高 | 直接改造成“目标设置 / 导出 / 数据维护”入口 | 当前文案和操作都围绕导出场景 |
| 表格与导出组件 | `tmp/twitter-web-exporter/src/components`、`src/utils/exporter.ts` | 表格预览、CSV/JSON/HTML 导出 | 高 | 直接复用数据导出和列表展示 | HTML 导出价值不高，CSV/JSON 更重要 |
| 搜索页模块 | `tmp/twitter-web-exporter/src/modules/search-timeline` | 识别搜索页数据流 | 高 | 直接作为“搜索模板”和“互动对象池”输入层 | 目前只采集，不负责任务推荐 |
| 用户 / 粉丝模块 | `tmp/twitter-web-exporter/src/modules/followers`、`following`、`user-detail` | 采集粉丝、关注、账号详情 | 中高 | 可作为粉丝快照、账号池来源 | 现有目标是导出，不是每日快照 |
| runtime logs | `tmp/twitter-web-exporter/src/modules/runtime-logs` | 运行日志面板 | 中 | 可作为调试和失败兜底模块 | 用户版 MVP 不一定需要直接暴露 |
| `xiaohongshu-social-assistant` 总体架构 | `xiaohongshu-social-assistant/SKILL.md` | L0/L1/L2 分层、任务路由、编排、质量门禁 | 高 | 迁移为 X Growth Task Coach 的“教练总控”设计蓝图 | 当前是 skill 文档和 Python 脚本，不是浏览器端代码 |
| `social-commander` / orchestrators | `xiaohongshu-social-assistant/L0`、`L1` | 总控、编排、复杂度分级、流程拆解 | 高 | 用来定义后续插件的任务体系 | 要改写成 X 场景，不能直接照抄业务定义 |
| `profile-scorer` / `dynamic-scorer` / `leaderboard-manager` | `xiaohongshu-social-assistant/scripts` | 评分、动态权重、排行榜、报告 | 中高 | 可迁移成账号池优先级、每日完成度、连续打卡统计 | 现有评分逻辑是小红书社交匹配，不可直接沿用 |
| `data-exporter` | `xiaohongshu-social-assistant/L2/extended/data-exporter/SKILL.md` | JSON / CSV / Excel / Markdown 导出规范 | 高 | 直接指导插件导出能力设计 | 目前是说明文档，不是前端可直接调用的模块 |
| `statistics-analyzer` | `xiaohongshu-social-assistant/L2/extended/statistics-analyzer/SKILL.md` | 趋势、分布、洞察、建议 | 高 | 直接借用“日报 / 周报 / 洞察”结构 | 还不是现成前端统计组件 |
| `metrics-tracker` | `xiaohongshu-social-assistant/infra/metrics-tracker/SKILL.md` | 指标、成功率、性能、异常统计 | 中高 | 可变成插件内部事件埋点与诊断面板 | 当前更像后端/工具侧监控，不是用户功能 |
| `skill-registry` | `xiaohongshu-social-assistant/infra/skill-registry/SKILL.md` | 模块注册、状态、依赖与晋升规则 | 中 | 可借鉴模块注册表与 feature flag 设计 | 适合内部架构，不是 MVP 首要功能 |
| `x-grok-analysis-pipeline` | `x-grok-analysis-pipeline` | 多步分析、固定输入输出、最终报告组装 | 中高 | 迁移成“每日复盘生成”和“分析报告”流程 | 现有脚本和提示词绑定当前个人数据路径 |
| `xiaohongshu-growth-playbook` | `xiaohongshu-growth-playbook` | 账号阶段判断、动作建议、风险边界 | 中 | 借产品方法论结构 | 平台内容是小红书，不可直接使用 |
| `xiaohongshu-content-ops` | `xiaohongshu-content-ops` | 内容生产、审核、半自动发布、浏览器操作流程 | 中 | 借“发布前停手”和“半自动确认”原则 | 页面逻辑和资产格式都绑定小红书 |
| `.playwright-mcp` | `.playwright-mcp` | 浏览器快照和控制台日志 | 低 | 仅可做排障样本 | 不是可复用模块 |
| `.baoyu-skills` | `.baoyu-skills` | 图片和微信发布相关资产 | 低 | 基本不建议本项目复用 | 与 X Growth Task Coach 关联弱，且含敏感配置 |
| `tmp/browser-automation` | `tmp/browser-automation` | Playwright 依赖壳子 | 低 | 只可作为后续自动化底座参考 | 没有业务脚本，不能当成方案 |

### 3.2 哪些 skills 可以直接调用

- `twitter-web-exporter` 的数据监听、本地存储、导出、面板结构
- `xiaohongshu-social-assistant` 的任务分层、编排、评分/报告框架
- `x-grok-analysis-pipeline` 的多步分析与汇总流程

### 3.3 哪些 skills 需要改造

- `twitter-web-exporter`：要从 Userscript 过渡到 Manifest V3 插件结构
- `xiaohongshu-social-assistant`：要把小红书社交逻辑改成 X 起号任务逻辑
- `statistics-analyzer` / `data-exporter`：要把字段和图表改成每日任务、粉丝快照、账号池、复盘记录
- `xiaohongshu-growth-playbook`：要改写成 X 起号方法论模板

### 3.4 哪些能力仓库中没有，需要新写

- Manifest V3 结构：`manifest.json`、`background`、`popup`、`options`
- X 发帖 / 回复 / 引用行为计数逻辑
- 今日任务系统与 streak heatmap
- 账号池推荐逻辑
- `growth_playbooks.json`
- 粉丝数每日快照与趋势
- 每日复盘文案生成

### 3.5 第一阶段最应该复用哪个模块

第一优先级应复用：`tmp/twitter-web-exporter`

原因：

- 它是当前工作区里唯一真正面向 X 网页端、且已有成熟源码的项目
- 它已经打通了“页面监听 -> 数据入库 -> 本地展示 -> 导出”
- 这正好覆盖了 X Growth Task Coach 最难、也最容易踩坑的底层部分

## 4. 当前仓库结构摘要

### 4.1 当前 Git 仓库：`tmp/twitter-web-exporter`

技术判断：

| 项目项 | 现状 | 判断 |
|---|---|---|
| 技术栈 | TypeScript + Preact + Vite + Tailwind + daisyUI | 适合继续做前端面板 |
| 包管理 | `bun.lock` 存在，`package.json` 标准 | 更像 Bun/NPM 皆可使用 |
| 前端框架 | Preact | 能继续用；若后续统一 React，需要迁移成本 |
| 数据存储 | Dexie + IndexedDB + localStorage | 很适合本项目 |
| 扩展结构 | 无 `manifest.json`，使用 `vite-plugin-monkey` | 当前是 Userscript，不是 Chrome Extension |
| 测试框架 | 未发现单元测试 / E2E 测试 | 测试基础偏弱 |
| lint / build | 已有 `eslint`、`build`、`preview` | 工程基础够用 |
| CI | 未发现 workflow | 需后补 |

目录摘要：

```text
tmp/twitter-web-exporter/
  docs/
  src/
    components/
    core/
      database/
      extensions/
      options/
    i18n/
    modules/
    types/
    utils/
  package.json
  vite.config.ts
  tsconfig.json
  eslint.config.js
  tailwind.config.js
```

关键判断：

- **它适合直接作为“第一版技术基座”，但不适合原样当成最终插件结构。**
- 最现实的路线不是推倒重来，而是先复用它的 `src` 侧业务骨架，再逐步迁移到 MV3 目录。

### 4.2 工作区相关目录摘要

```text
D:\myapp\ai_program/
  .baoyu-skills/
  .playwright-mcp/
  tmp/
    twitter-web-exporter/
    browser-automation/
  x-grok-analysis-pipeline/
  xiaohongshu-content-ops/
  xiaohongshu-growth-playbook/
  xiaohongshu-social-assistant/
```

其中最相关的目录作用如下：

| 目录 | 作用 | 适合程度 |
|---|---|---|
| `tmp/twitter-web-exporter` | X 网页端采集与导出基座 | 最高 |
| `xiaohongshu-social-assistant` | 任务编排、评分、导出、统计设计骨架 | 高 |
| `x-grok-analysis-pipeline` | 分析流水线和最终报告组装 | 中高 |
| `xiaohongshu-growth-playbook` | 方法论和阶段化建议模板 | 中 |
| `xiaohongshu-content-ops` | 半自动执行和审核流程参考 | 中 |
| `.playwright-mcp` | 日志/快照 | 低 |
| `.baoyu-skills` | 图片/微信发布相关 | 低 |

## 5. 对本项目的复用判断

### 5.1 可以直接沿用的部分

- X 请求监听和模块注册方式
- 本地 IndexedDB 管理方式
- 数据导出方式
- 页面内悬浮面板形式
- 模块启停和设置管理
- 多步分析与最终汇总流程

### 5.2 只能借思路的部分

- 小红书的编排器命名和业务评分逻辑
- 小红书的内容生产、审核和半自动发布流程
- 小红书起号手册中的阶段判断结构

### 5.3 不建议第一版复用的部分

- 与小红书页面强绑定的自动化脚本
- 与微信发布相关的技能目录
- `.playwright-mcp` 的运行痕迹目录
- 任何自动关注、自动点赞、自动评论方向的逻辑

## 6. 第一版技术路线建议

### 6.1 推荐路线

建议路线：

1. 以 `twitter-web-exporter` 作为代码基座
2. 保留其 `src/core`、`src/modules`、`src/utils` 的组织方式
3. 新增一套面向 X Growth Task Coach 的业务目录
4. 先做可自用 MVP，再决定是否完全迁移到 Manifest V3

### 6.2 推荐的新目录方向

如果继续在当前仓库推进，建议后续逐步演进为：

```text
tmp/twitter-web-exporter/
  docs/
  src/
    analytics/
    components/
    content/
    core/
    options/
    playbooks/
    popup/
    sidebar/
    storage/
    tasks/
    utils/
```

说明：

- `content/`：保留 X 页面观察和行为计数
- `storage/`：重建 DailyRecord / AccountPool / SearchTemplate
- `tasks/`：今日任务生成、进度更新、streak 计算
- `analytics/`：复盘生成、粉丝变化、热力图数据
- `playbooks/`：存放 `growth_playbooks.json`

### 6.3 先别做的事

- 不要现在就把整个仓库强行改成完整 MV3
- 不要现在就接入云端、数据库、OAuth、Redis
- 不要做任何自动互动动作
- 不要把小红书目录整块复制进来

## 7. Phase 0 最终建议

### 7.1 本阶段结论

- 当前最可用的代码资产是 `tmp/twitter-web-exporter`
- 当前最可用的系统设计资产是 `xiaohongshu-social-assistant`
- 当前最可用的分析闭环资产是 `x-grok-analysis-pipeline`
- 当前最可用的方法论模板资产是 `xiaohongshu-growth-playbook`

### 7.2 下一阶段建议

进入 Phase 1 时，重点回答两个问题：

1. 外部开源仓库里，谁最适合当 Chrome Extension 参考基座
2. 当前仓库是继续在 `twitter-web-exporter` 上改，还是另开一个 `extension/` 目录更稳

### 7.3 当前推荐判断

在未完成 Phase 1 之前，我的初步推荐是：

- **优先参考 / 改造 `twitter-web-exporter` 的现有结构**
- **不要在工作区根目录直接新起一个全空项目**
- **除非外部仓库评估结果明显更好，否则先沿当前仓库继续推进**

