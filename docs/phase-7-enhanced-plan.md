# Phase 7 增强版计划

更新日期：2026-05-14

## 1. 这份文档的作用

这份文档用于整合两部分内容：

1. 总执行计划里原本的 `Phase 7`
2. 基于 `Phase 6` 现状新增的增强版需求

它的目标不是立刻写代码，而是先把 `Phase 7` 的范围、目标、边界、拆分方式和验收口径定清楚，供最终审核。

---

## 2. 原始 Phase 7 内容

根据总执行计划，原始 `Phase 7` 是：

### 2.1 目标

帮助用户找到每天该互动的内容，并形成复盘。

### 2.2 原始任务

- 实现搜索模板
- 支持打开 X 搜索 URL
- 实现每日复盘生成
- 支持复制复盘为 X 草稿
- 支持记录最佳帖子 / 最佳回复 URL

### 2.3 原始交付物

- 搜索模板库
- 每日复盘卡片
- 可复制的 build in public 文案

---

## 3. 为什么需要增强版 Phase 7

`Phase 6` 已经完成了：

- 粉丝快照
- 账号池
- 基于账号池分类的半自动互动记账

但当前仍有一个明显问题：

> 账号池虽然已经能用，但主要还依赖手工录入。

这会直接影响后续体验：

- 半自动互动记账命中率不够高
- 今日推荐互动对象池扩充太慢
- 搜索模板虽然能帮你找内容，但不能快速沉淀成可复用对象池

所以增强版 `Phase 7` 应该同时解决两件事：

1. 帮用户更快找到“该互动什么内容”
2. 帮用户更快沉淀“该跟踪哪些账号”

---

## 4. Phase 7 增强版总目标

增强版 `Phase 7` 的一句话目标：

> 在原有“搜索模板 + 每日复盘”基础上，新增“关注关系候选导入与标签建议系统”，把搜索、对象池和复盘串成一条可执行链路。

也就是说，`Phase 7` 不再只是“看内容和写复盘”，而是会变成：

- 找内容
- 找对象
- 建候选池
- 建账号池
- 做复盘

---

## 5. Phase 7 增强版范围

### 5.1 保留原始内容

必须继续包含：

- 搜索模板
- 打开 X 搜索 URL
- 每日复盘生成
- 复制复盘为 X 草稿
- 最佳帖子 / 最佳回复 URL 记录

### 5.2 新增增强内容

新增：

- Following / Followers 候选账号采集
- 候选池
- 标签建议
- 批量确认加入账号池
- 忽略和去重机制
- 搜索模板与账号池联动

---

## 6. 增强版设计原则

### 6.1 不做黑箱自动分类

插件不应该直接替用户决定谁是：

- 大 V
- 同生态
- 选题来源

更稳的方式是：

- 自动采集
- 自动建议
- 用户确认

### 6.2 不做后台无感批量扫描

为了降低风险，候选账号采集应采用：

- 用户主动打开 Following / Followers 页面
- 用户主动滚动页面
- 插件被动采集已经加载出来的数据

不做：

- 后台自动完整扫描整个关系网络
- 自动翻页跑全量账号
- 隐蔽批量抓取

### 6.3 搜索、对象池、复盘三者联动

`Phase 7` 不应该再做成几个孤立功能，而要形成链路：

1. 用搜索模板找内容和对象
2. 把候选对象导入候选池
3. 把高价值对象确认进账号池
4. 在复盘里记录哪些对象和动作有效

---

## 7. Phase 7 增强版功能拆分

建议拆成两段：

## 7A：搜索模板与复盘主线

这是原始 `Phase 7` 的核心交付。

### 7A.1 搜索模板

目标：

- 保存常用查询
- 支持一键打开 X 搜索 URL
- 用分类帮助用户快速找到：
  - 热门内容
  - 问题帖
  - 同赛道内容
  - 大 V 近期帖子
  - 最近内容

建议分类：

- `viral`
- `questions`
- `niche`
- `creator`
- `recent`
- `custom`

建议每个模板至少包含：

- 名称
- 描述
- 查询语句
- 分类
- 是否常用

### 7A.2 每日复盘

目标：

- 基于当天任务完成情况
- 基于粉丝快照变化
- 基于互动对象和内容表现
- 生成一张简短复盘卡片

建议最小结构：

1. 今日完成度
2. 粉丝变化
3. 最佳动作
4. 最值得继续的对象或内容
5. 明日建议

### 7A.3 可复制草稿

目标：

- 把每日复盘转成可复制文本
- 偏 build in public 风格
- 方便用户二次编辑后发到 X

注意：

- 只生成草稿
- 不自动发布

---

## 7B：关注关系候选导入与标签建议

这是增强版新增的重点。

### 7B.1 核心目标

降低账号池维护成本，并提高后续半自动记账命中率。

### 7B.2 候选账号采集

来源：

- 用户打开自己的 `Following` 页面
- 用户打开自己的 `Followers` 页面

采集方式：

- 利用当前仓库已有的 `Following/Followers` 拦截能力
- 只采集用户主动滚动后已加载的数据

候选记录建议字段：

- `handle`
- `displayName`
- `followersCount`
- `followingCount`
- `verified`
- `bio`
- `source`
  - `from_following`
  - `from_followers`
- `capturedAt`

### 7B.3 候选池

候选池不是账号池。

候选池的作用是：

- 先临时收集候选账号
- 给出标签建议
- 让用户筛选和批量确认

它不应该默认直接写入正式账号池。

### 7B.4 标签建议

建议标签包括：

- 建议 `big_creator`
- 建议 `peer`
- 建议 `potential_mutual`
- 建议 `topic_source`
- 暂无明确建议

建议只做“推荐”，不做最终结果。

建议规则优先采用：

- 粉丝量级
- 是否认证
- bio 关键词
- overlay 相关关键词
- 与已有账号池的主题重合

第一版不要上复杂 AI 分类。

### 7B.5 批量确认加入账号池

用户应支持：

- 单个加入账号池
- 多选批量加入
- 批量指定分类
- 保留推荐分类后直接导入
- 忽略不需要的候选

### 7B.6 去重和忽略机制

必须支持：

- 已在账号池中的账号不重复导入
- 已忽略账号可以不再频繁提示
- 同一个候选账号多次采集后合并更新

---

## 8. 与当前 Phase 6 的联动

增强版 `Phase 7` 最核心的价值，不是多一个页面，而是增强现有链路：

### 8.1 强化账号池

现在账号池依赖手工输入。

`Phase 7` 做完后，账号池会从：

- 手工录入

升级为：

- 手工录入 + 候选导入 + 批量确认

### 8.2 强化半自动记账

当前 `Phase 6` 已支持：

- 回复命中 `big_creator` 时补记“大 V 互动”
- 引用命中 `peer` 时补记“同生态互动”

`Phase 7` 会提升它的命中率，因为账号池更容易扩充。

### 8.3 强化推荐互动对象

当前推荐对象依赖已有账号池。

`Phase 7` 做完后：

- 推荐池会更丰富
- 用户能更快补齐重点对象

---

## 9. 技术路线建议

### 9.1 优先复用当前仓库能力

最值得复用的是当前仓库已有的：

- [manager.ts](/D:/myapp/ai_program/tmp/twitter-web-exporter/src/core/extensions/manager.ts)
- [following/api.ts](/D:/myapp/ai_program/tmp/twitter-web-exporter/src/modules/following/api.ts)
- [followers/api.ts](/D:/myapp/ai_program/tmp/twitter-web-exporter/src/modules/followers/api.ts)

结论：

- 不需要从零写一套 following/followers 采集逻辑
- 可以复用现有的 GraphQL/XHR 拦截思路
- 但要把数据落到新扩展自己的本地存储结构里

### 9.2 外部仓库只参考，不直接依赖

可参考：

- [Scweet](https://github.com/Altimis/Scweet)
- [Twikit](https://github.com/d60/twikit)
- [XActions](https://github.com/nirholas/XActions)

但它们主要能帮助：

- 采集字段设计
- 浏览器侧抓取思路
- 关系数据建模

它们不能直接提供：

- 起号阶段业务分类
- 适合本插件的低风险本地工作流

---

## 10. 建议新增的数据结构

为支持增强版 `Phase 7`，建议新增：

### 10.1 `searchTemplate`

```ts
interface SearchTemplate {
  id: string;
  name: string;
  description?: string;
  query: string;
  category: "viral" | "questions" | "niche" | "creator" | "recent" | "custom";
  createdAt: string;
  updatedAt: string;
}
```

### 10.2 `candidateAccount`

```ts
interface CandidateAccount {
  id: string;
  handle: string;
  displayName?: string;
  followersCount?: number;
  followingCount?: number;
  verified?: boolean;
  bio?: string;
  source: "from_following" | "from_followers";
  suggestedCategory?: "big_creator" | "peer" | "potential_mutual" | "topic_source";
  suggestionReason?: string;
  confidence?: number;
  ignored?: boolean;
  importedToAccountPool?: boolean;
  capturedAt: string;
  updatedAt: string;
}
```

### 10.3 `dailyReviewDraft`

```ts
interface DailyReviewDraft {
  date: string;
  completionRate: number;
  followersDelta?: number;
  bestAction?: string;
  bestPostUrl?: string;
  bestReplyUrl?: string;
  summary: string;
  suggestedNextAction: string;
  xDraft?: string;
  createdAt: string;
  updatedAt: string;
}
```

---

## 11. UI 建议

增强版 `Phase 7` 建议增加或扩展 3 个页面区域：

### 11.1 搜索模板区

建议放在：

- popup 的简版入口
- options 或独立页面的完整管理区

能力：

- 新建模板
- 编辑模板
- 打开 X 搜索
- 标记常用

### 11.2 候选池区

建议放在：

- options 页的一个独立区域

能力：

- 查看最近采集候选
- 按建议标签筛选
- 按来源筛选
- 批量加入账号池
- 忽略候选

### 11.3 每日复盘区

建议先做：

- popup 里的简版卡片
- options 页或详情页里的完整版本

---

## 12. 合规边界

增强版 `Phase 7` 必须继续坚持：

- 不自动关注
- 不自动点赞
- 不自动评论
- 不自动批量互动
- 不自动抓全量关系图谱
- 不后台无感持续扫用户网络

允许：

- 用户主动浏览时的被动采集
- 本地候选整理
- 本地建议标签
- 用户确认后导入账号池

---

## 13. 建议交付物

如果按增强版 `Phase 7` 实施，建议交付物包括：

1. `docs/phase-7-enhanced-plan.md`
2. 搜索模板数据结构和管理页
3. 候选池数据结构和管理页
4. Following / Followers 被动采集接入
5. 标签建议规则
6. 批量加入账号池
7. 每日复盘卡片
8. 可复制复盘草稿
9. 更新后的测试文档
10. `Phase 7` 自动化冒烟脚本

---

## 14. 验收标准

增强版 `Phase 7` 完成后，至少应满足：

1. 用户可以保存并打开搜索模板
2. 用户可以生成每日复盘卡片
3. 用户可以复制复盘草稿
4. 用户主动浏览 Following / Followers 页面后，候选池能出现账号
5. 候选池能显示建议标签
6. 用户可以批量把候选账号加入账号池
7. 已存在账号池的账号不会重复导入
8. 导入后的账号能继续被 `Phase 6` 半自动记账逻辑利用
9. 插件不执行任何高风险自动互动动作

---

## 15. 实施顺序建议

建议按下面顺序实施：

### Step 1

先做搜索模板和每日复盘基础版。

原因：

- 这是原始 `Phase 7` 的主线
- 风险低
- 容易先形成可见成果

### Step 2

接入候选账号数据结构和候选池 UI。

原因：

- 先把容器建好
- 再接采集逻辑更稳

### Step 3

复用现有 Following / Followers 拦截能力，接被动采集。

### Step 4

加建议标签和批量确认导入。

### Step 5

把复盘、搜索模板、账号池三者做联动优化。

---

## 16. 一句话结论

增强版 `Phase 7` 不再只是“搜索模板与复盘报告”，而应该升级为：

> **搜索模板 + 每日复盘 + 关注关系候选导入与标签建议系统**

它既延续总执行计划原本的 `Phase 7` 主线，也顺着当前 `Phase 6` 的账号池和半自动记账能力继续往前推进，是下一阶段最合理的扩展方向。
