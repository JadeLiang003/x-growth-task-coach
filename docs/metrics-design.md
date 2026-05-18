# Metrics Design

更新日期：2026-05-13

## 1. 设计目标

指标体系需要同时满足 4 个要求：

1. 能指导每天执行
2. 能支撑每周复盘
3. 能判断阶段是否该切换
4. 不把第一版做成重型分析平台

## 2. 设计原则

### 2.1 过程指标和结果指标分开

过程指标回答：

> 你做了没有

结果指标回答：

> 做完有没有效果

### 2.2 阶段不同，权重不同

同一个指标，不同阶段权重可以不同。

例如：

- 回复量在冷启动期更重要
- 高价值主帖在起飞期更重要

### 2.3 指标要能落到插件记录

第一版只保留能够由以下方式记录的指标：

- 自动计数
- 手动补录
- 日复盘填写
- 周复盘汇总

## 3. 主指标

建议最终只保留 8 个主指标：

1. `weeklyNewFollowers`
2. `highValuePostsPerWeek`
3. `avgHighValuePostEngagementRate`
4. `commentsPerWeek`
5. `contentTypePerformance`
6. `postToFollowConversion`
7. `consistencyScore`
8. `validatedPatternCount`

## 4. 过程指标

### 4.1 指标清单

| 指标 | 含义 | 记录方式 | 主要阶段 |
|---|---|---|---|
| `originalPostsCount` | 原创帖数量 | 自动 / 手动 | 全阶段 |
| `repliesCount` | 回复数量 | 自动 / 手动 | 冷启动、验证期 |
| `quotesCount` | 引用转发数量 | 自动 / 手动 | 冷启动、验证期 |
| `targetAccountsTouched` | 触达重点账号数量 | 手动 / 半自动 | 全阶段 |
| `contentIdeasCaptured` | 收集的选题数量 | 手动 | 全阶段 |
| `benchmarkAccountsReviewed` | 本周完成对标拆解的账号数 | 手动 | 验证期、起飞期 |
| `viralPostsDistilled` | 提炼出的可学爆款数量 | 手动 | 验证期、起飞期 |
| `weeklyReviewCompleted` | 周复盘是否完成 | 手动 | 全阶段 |
| `consistencyScore` | 连续执行分 | 自动计算 | 全阶段 |

### 4.2 `consistencyScore`

作用：

- 判断用户是不是长期在做
- 作为阶段切换的基础信号

建议计算方式：

- 当日完成率 `>= 80%` 记为有效天
- 最近 7 天有效天数越高，连续分越高

建议区间：

| 分数 | 含义 |
|---|---|
| `0.85 - 1.0` | 连续执行稳定 |
| `0.60 - 0.84` | 基本执行 |
| `0.30 - 0.59` | 执行不稳定 |
| `< 0.30` | 几乎没形成习惯 |

## 5. 结果指标

### 5.1 指标清单

| 指标 | 含义 | 记录方式 | 主要阶段 |
|---|---|---|---|
| `weeklyNewFollowers` | 本周净涨粉 | 自动 / 手动 | 全阶段 |
| `avgHighValuePostEngagementRate` | 高价值主帖平均互动率 | 自动计算 | 验证期、起飞期 |
| `avgImpressionsPerHighValuePost` | 高价值主帖平均曝光 | 自动 / 手动 | 验证期、起飞期 |
| `avgBookmarksPerHighValuePost` | 高价值主帖平均收藏 | 自动 / 手动 | 起飞期 |
| `avgRepliesPerHighValuePost` | 高价值主帖平均收到的回复 | 自动 / 手动 | 起飞期 |
| `postToFollowConversion` | 单帖带粉能力 | 自动 / 半自动 | 验证期、起飞期 |
| `contentTypePerformance` | 各内容类型表现 | 自动汇总 | 验证期、起飞期 |
| `validatedPatternCount` | 已验证有效的内容模式数量 | 手动 / 复盘生成 | 验证期、起飞期 |

### 5.2 `postToFollowConversion`

定义：

单条内容带来的新增关注能力。

第一版不强求精确到每条 X 原生新增粉丝来源，可采用保守近似：

- 周内最佳内容与净涨粉变化联动判断
- 或记录“最佳带粉帖”

### 5.3 `contentTypePerformance`

第一版建议至少区分：

- `tutorial`
- `retrospective`
- `experiment`
- `video_story`
- `commentary`

说明：

- 不需要一开始就做太细的分类
- 分类太多会导致复盘失真

## 6. 阶段指标重点

### 6.1 `setup_foundation`

重点不是涨粉，而是建系统。

优先关注：

- `contentPillarsDefined`
- `benchmarkAccountsCollected`
- `searchTemplatesCreated`
- `seedPostsPrepared`
- `consistencyScore`

### 6.2 `cold_start_0_100`

重点是拿到首批反馈。

优先关注：

- `weeklyNewFollowers`
- `repliesCount`
- `replyLikeRate`
- `profileVisitSignal`
- `firstUsefulTopicsFound`
- `consistencyScore`

### 6.3 `growth_100_1000`

重点是验证带粉内容模式。

优先关注：

- `weeklyNewFollowers`
- `highValuePostsPerWeek`
- `avgEngagementRate`
- `contentTypePerformance`
- `validatedPatternCount`
- `replyRatio`

### 6.4 `scale_1000_5000`

重点是放大有效模式。

优先关注：

- `weeklyNewFollowers`
- `highValuePostsPerWeek`
- `avgHighValuePostEngagementRate`
- `postToFollowConversion`
- `contentTypePerformance`
- `validatedPatternCount`
- `consistencyScore`

## 7. 高价值帖判定

### 7.1 第一版定义

高价值帖不追求复杂模型，先用可解释规则：

满足以下任一条件即可进入候选：

- 用户手动标记
- 本周互动率位于前 `20%`
- 本周新增粉丝贡献最高
- 被周复盘选入“最佳内容”

### 7.2 为什么要保守

因为第一版最重要的是：

- 让用户理解为什么它被算高价值
- 不是搞一个黑箱分数

## 8. 每周复盘结构

每周复盘固定为 6 块：

1. `结果面板`
2. `最佳内容`
3. `失效内容`
4. `模式判断`
5. `问题判断`
6. `下周动作`

### 8.1 结果面板

字段：

- `weeklyNewFollowers`
- `highValuePostsPerWeek`
- `avgHighValuePostEngagementRate`
- `commentsPerWeek`
- `consistencyScore`

### 8.2 最佳内容

固定选 3 条：

- 最能涨粉的
- 互动最高的
- 最值得复刻的

### 8.3 失效内容

固定选 2 条：

- 做了但没反应的
- 做了很多但不带粉的

### 8.4 模式判断

示例：

- 真实结果 + 踩坑 + 可复制步骤
- 图卡 + 明确行动点
- 轻教程 + 真实案例

### 8.5 问题判断

问题分类：

- `content_quality`
- `interaction_density`
- `timing`
- `execution_stability`
- `positioning_drift`

### 8.6 下周动作

限制为 3 条：

- `continue`
- `stop`
- `double_down`

## 9. 执行评分

### 9.1 用途

执行评分不是成绩单，而是告诉用户：

- 计划是不是脱离现实
- 是执行没跟上，还是方法本身有问题

### 9.2 建议等级

| 等级 | 执行率 | 含义 |
|---|---|---|
| `A` | `>= 0.85` | 严格执行，数据可信 |
| `B` | `0.60 - 0.84` | 基本执行，结论可参考 |
| `C` | `0.30 - 0.59` | 执行不稳定，谨慎下结论 |
| `D` | `< 0.30` | 先修执行，再谈优化 |

### 9.3 第一版计算逻辑

建议公式：

`executionScore = postTargetRate * 0.4 + interactionTargetRate * 0.3 + reviewCompletionRate * 0.2 + consistencyScore * 0.1`

说明：

- 不同阶段权重可以不同
- 但第一版先保持简单、可解释

## 10. 阶段切换信号

### 10.1 不只看粉丝数

阶段切换必须同时满足：

- 粉丝区间接近阶段目标
- `consistencyScore` 达标
- `validatedPatternCount` 达标
- 回复依赖降低或增长来源改善

### 10.2 推荐阈值

#### `setup_foundation -> cold_start_0_100`

- 内容支柱已明确
- 搜索模板与账号池已建立
- 最近 7 天持续有动作

#### `cold_start_0_100 -> growth_100_1000`

- 粉丝接近 `100`
- 已出现第一批有效互动对象
- 有初步有效内容方向

#### `growth_100_1000 -> scale_1000_5000`

- 粉丝接近 `1000`
- 至少有 `2` 个已验证内容模式
- 主帖开始稳定带粉
- 回复不再是唯一增长来源

## 11. 数据结构映射

### 11.1 `dailyExecutionLog`

记录过程指标：

- `date`
- `playbookId`
- `originalPostsCount`
- `repliesCount`
- `quotesCount`
- `targetAccountsTouched`
- `contentIdeasCaptured`
- `completionScore`
- `manualNotes`

### 11.2 `contentRecord`

记录内容结果：

- `contentId`
- `date`
- `contentType`
- `format`
- `isHighValuePost`
- `impressions`
- `engagements`
- `bookmarks`
- `replies`
- `newFollowers`
- `engagementRate`
- `followConversionRate`

### 11.3 `weeklyReview`

记录复盘：

- `weekStart`
- `weekEnd`
- `playbookId`
- `processMetrics`
- `resultMetrics`
- `topContents`
- `weakContents`
- `winningPatterns`
- `losingPatterns`
- `nextWeekActions`
- `summary`

### 11.4 `accountPassport`

记录长期状态：

- `handle`
- `stage`
- `baselineMetrics`
- `currentMetrics`
- `milestones`
- `validatedPatterns`
- `failedPatterns`
- `reviewHistory`

## 12. 第一版不做的指标

为了控制范围，第一版不做：

- 完整粉丝画像
- 长期归因模型
- 云端多账号聚合
- 自动抓取所有历史推文做深度分析
- 复杂机器学习打分

## 13. 当前建议

如果指标体系与 playbook 冲突，优先遵循：

1. 阶段目标
2. 可解释性
3. 用户能否每天记录
4. 用户能否每周复盘

