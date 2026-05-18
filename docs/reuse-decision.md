# Phase 1：复用路线决策

更新日期：2026-05-07

## 1. 本阶段要回答的问题

到底该怎么开始：

1. fork 哪个外部仓库？
2. 参考哪个仓库？
3. 还是继续在当前仓库里新增 extension？

## 2. 选项判断

### 选项 A：直接 fork `neonwatty/x-search-pro`

优点：

- 已经是标准 MV3 扩展
- 已有 `popup`、`sidebar`、`search templates`
- 已有 `chrome.storage` 和 Playwright 测试

缺点：

- 核心目标是“搜索库”，不是“每日任务教练”
- 缺少行为计数、热力图、粉丝快照、复盘系统
- 数据层偏轻，不适合承载后续较多日记录

结论：

- **适合高强度参考**
- **不建议直接作为最终 fork 基础**

### 选项 B：直接 fork `affaan-m/x-algorithm-score`

优点：

- MV3 完整
- React + TypeScript + Vite 结构清晰
- 发帖输入区 overlay 很适合借

缺点：

- 核心是“发帖评分器”
- 不具备搜索模板、账号池、任务系统、热力图

结论：

- **适合局部参考**
- **不适合做主基础**

### 选项 C：直接 fork `ibrahimahmed/growthmate`

优点：

- 功能完整
- 有搜索、内容生成、分析、监控、排程

缺点：

- 太重
- 依赖 X API / OAuth / Postgres / Redis / AI Key
- 产品路线偏 SaaS，不是轻量插件

结论：

- **不建议第一版 fork**

### 选项 D：直接 fork `MarsX-dev/GrowthX`

优点：

- 很轻
- MV3 最小骨架简单

缺点：

- 真实功能只有回复插名
- 与本项目目标差距过大

结论：

- **不建议 fork**

### 选项 E：继续在当前仓库推进，并新增 extension 结构

当前仓库优势：

- 已有最强的 X 页面监听和数据抓取能力
- 已有本地存储与导出经验
- 已完成 Phase 0 的复用梳理

当前仓库不足：

- 现在是 Userscript，不是标准 MV3
- 还没有 `popup / options / background` 的插件结构

结论：

- **这是当前最合理的路线**

## 3. 最终决策

### 3.1 推荐路线

最终建议：

**不直接 fork 外部仓库。**

**继续在当前仓库中推进，并新增一个面向 Chrome Extension 的结构。**

同时：

1. 以 `x-search-pro` 作为 MV3 结构、搜索模板、侧边栏与测试的主要参考
2. 以 `x-algorithm-score` 作为 composer overlay 和站内提示交互的参考
3. 以当前仓库 `twitter-web-exporter` 作为 X 页面数据监听、存储、导出能力的主要来源

### 3.2 为什么不是直接 fork `x-search-pro`

因为它解决的是“如何保存和调用搜索”，不是“如何把起号方法论变成每日任务”。

如果直接 fork，后续还是要大改这些核心部分：

- 数据模型
- 信息架构
- 今日任务系统
- 粉丝快照
- 热力图
- 复盘系统

这样做看似快，实际容易被原项目结构牵着走。

### 3.3 为什么不是直接 fork `growthmate`

因为它太重，方向也偏了。

你现在要的是：

- 轻量
- 本地优先
- 站内辅助
- 可自用
- 可截图分享

而不是：

- 完整内容平台
- 多账号 SaaS
- OAuth + 数据库 + 缓存 + AI 服务堆栈

## 4. 具体复用策略

### 4.1 直接借代码或结构

| 来源 | 直接借什么 | 用途 |
|---|---|---|
| 当前仓库 `twitter-web-exporter` | X 页面监听、数据抓取、本地导出思路 | 行为计数、粉丝快照、导出 |
| `x-search-pro` | MV3 目录结构、Sidebar、Popup、搜索模板、Playwright 测试 | 插件骨架、搜索模板、站内入口 |
| `x-algorithm-score` | Composer 检测、Overlay UI、Popup 内信息分栏 | 发帖前提醒、站内任务提示 |

### 4.2 只借思路

| 来源 | 借什么思路 | 暂不直接复用的原因 |
|---|---|---|
| `growthmate` | 页面拆分、监控账号概念、分析页布局 | 依赖太重 |
| `SuperX` | 今日建议、互动对象建议 | 自动化部分风险高 |
| `BlackMagic` | 轻关系管理、跟进提醒 | 完整 CRM 不是第一版重点 |
| `Typefully` | 推荐发布时间、草稿体验 | 多平台排程不是第一版重点 |

## 5. 第一版开发方向的明确边界

### 5.1 第一版要做

1. 今日任务面板
2. 每日目标设置
3. posts / replies / quotes 计数
4. 粉丝数快照
5. 互动账号池
6. 搜索模板
7. 每日复盘
8. 热力图
9. CSV / JSON 导出

### 5.2 第一版不做

1. Auto DM
2. Auto Plug
3. Auto Retweet
4. 批量关注
5. 自动评论
6. 多平台排程
7. 云同步
8. 复杂 CRM

## 6. 推荐后的下一步

进入 Phase 2 时，建议按这个顺序推进：

1. 固定产品定位与 MVP 边界
2. 设计 `growth_playbooks.json`
3. 设计任务系统与数据结构
4. 确定插件目录蓝图

## 7. 一句话结论

**路线不是“fork 某个现成仓库直接改名开干”，而是“以当前仓库为主场，参考 `x-search-pro` 搭 MV3 外壳，参考 `x-algorithm-score` 做站内提示，再把任务系统做成自己的核心能力”。**

