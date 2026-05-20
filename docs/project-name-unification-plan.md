# 项目命名统一方案

## 1. 当前问题

现在这个项目同时存在三套名字：

1. 用户看到的插件名  
   - `X 增长助手`
2. 对外英文品牌名  
   - `X Growth Task Coach`
3. 历史工程名  
   - `twitter-web-exporter`

这会带来两个实际问题：

- 用户界面里已经是新产品名，但工程层和导出层还会冒出旧名字
- 后面打包、分发、README、GitHub 仓库说明时，名字口径不统一

---

## 2. 这次要达成的目标

这次不重建项目、不改目录结构，只做**不影响当前功能和使用**的命名统一。

统一目标：

- 中文产品名：`X 增长助手`
- 英文产品名：`X Growth Task Coach`
- 工程英文名：`x-growth-task-coach`

其中：

- 用户看到的地方继续使用 `X 增长助手`
- 设置页继续同时显示英文和中文
- 工程层逐步从 `twitter-web-exporter` 收口到 `x-growth-task-coach`

---

## 3. 为什么现在还会看到 `twitter-web-exporter`

根因不是插件显示名没改，而是历史工程基座来自原项目，下面这些位置还保留着旧名字：

### 3.1 工程包名
- 文件：`package.json`
- 当前：`"name": "twitter-web-exporter"`

### 3.2 项目主页和问题反馈地址
- 文件：`package.json`
- 当前：
  - `"homepage": "https://github.com/prinsss/twitter-web-exporter"`
  - `"bugs": "https://github.com/prinsss/twitter-web-exporter/issues"`

### 3.3 导出数据库文件名
- 文件：`src/core/settings.tsx`
- 当前：
  - `twitter-web-exporter-${Date.now()}.json`

### 3.4 控制台日志前缀
- 文件：`src/utils/logger.ts`
- 当前：
  - `[twitter-web-exporter]`

### 3.5 工程目录名
- 当前目录：
  - `D:\myapp\ai_program\tmp\twitter-web-exporter`

这几个地方里，真正会影响用户感知的，主要是：

- 导出文件名
- GitHub 链接
- package 名称（某些打包或构建界面会看到）

---

## 4. 本轮建议只改的部分

这轮建议只改**低风险、不会影响功能**的地方。

### 4.1 `package.json`

文件：
- `D:\myapp\ai_program\tmp\twitter-web-exporter\package.json`

建议修改：

- `name`
  - 当前：`twitter-web-exporter`
  - 改为：`x-growth-task-coach`

- `homepage`
  - 当前：`https://github.com/prinsss/twitter-web-exporter`
  - 改为：`https://github.com/JadeLiang003/x-growth-task-coach`

- `bugs`
  - 当前：`https://github.com/prinsss/twitter-web-exporter/issues`
  - 改为：`https://github.com/JadeLiang003/x-growth-task-coach/issues`

说明：

- 这是工程元信息改名
- 不影响插件运行逻辑
- 能解决“项目本体还是旧仓库名”的问题

---

### 4.2 `package-lock.json`

文件：
- `D:\myapp\ai_program\tmp\twitter-web-exporter\package-lock.json`

建议修改：

- 顶层 `name`
  - 当前：`twitter-web-exporter`
  - 改为：`x-growth-task-coach`

说明：

- 这是锁文件同步项
- 目的是让包名和 `package.json` 一致
- 不改业务逻辑

---

### 4.3 `bun.lock`

文件：
- `D:\myapp\ai_program\tmp\twitter-web-exporter\bun.lock`

建议修改：

- 顶层包名
  - 当前：`twitter-web-exporter`
  - 改为：`x-growth-task-coach`

说明：

- 和 `package-lock.json` 一样，属于锁文件同步项
- 目的是避免后面出现两套工程名

---

### 4.4 导出数据库文件名

文件：
- `D:\myapp\ai_program\tmp\twitter-web-exporter\src\core\settings.tsx`

建议修改：

- 当前：
  - `twitter-web-exporter-${Date.now()}.json`
- 改为：
  - `x-growth-task-coach-${Date.now()}.json`

说明：

- 这是用户能直接看到的内容
- 改完后，导出的数据库文件会更像你自己的产品，而不是原项目

---

## 5. 本轮建议先不要改的部分

这些地方虽然也带着旧名字，但这轮建议**不动**，避免影响当前功能和路径稳定性。

### 5.1 工程目录名

当前：
- `D:\myapp\ai_program\tmp\twitter-web-exporter`

先不改为：
- `D:\myapp\ai_program\tmp\x-growth-task-coach`

原因：

- 目录改名会影响：
  - 本地脚本路径
  - 自动化脚本路径
  - 文档里的绝对路径
  - 你已经在用的工作目录
- 这是高风险改动
- 当前没有必要为了名字先动目录

---

### 5.2 控制台日志前缀

文件：
- `D:\myapp\ai_program\tmp\twitter-web-exporter\src\utils\logger.ts`

当前：
- `[twitter-web-exporter]`

先不改。

原因：

- 这是开发调试层，不是用户主要看到的内容
- 现在优先级低
- 先不影响当前排障习惯

---

### 5.3 历史文档、README、CHANGELOG、旧计划文档

例如：
- `README.md`
- `docs/README.zh-Hans.md`
- `CHANGELOG.md`
- 旧的 phase 计划文档

先不改。

原因：

- 改动量大
- 很多是历史来源文档，不是当前插件运行面向用户的主入口
- 容易把这轮改名范围拉得过大

---

### 5.4 `dist` 产物和 `node_modules`

例如：
- `dist/extension/assets/options.js`
- `node_modules/.package-lock.json`

先不直接手改。

原因：

- `dist` 是构建产物，应该通过源码和重新构建更新
- `node_modules` 不属于手工修改范围

---

## 6. 这轮实施顺序

建议按这个顺序做：

1. 改 `package.json`
2. 同步 `package-lock.json`
3. 同步 `bun.lock`
4. 改 `src/core/settings.tsx` 的导出文件名
5. 重新构建
6. 验证：
   - 插件功能是否正常
   - 导出数据库文件名是否已更新
   - `package.json` 信息是否一致

---

## 7. 这轮不应该碰的内容

为了确保不影响当前功能，本轮不应该修改：

- `public/manifest.json` 里的插件显示名  
  当前已经是 `X 增长助手`，不需要再动

- `src/extension/options/options-app.tsx` 和 `src/extension/popup/popup-app.tsx` 的名称显示  
  当前已经按产品名收好，不要再次改动

- 所有识别逻辑、统计逻辑、账号工作台逻辑、搜索模板逻辑

- 工程目录名

- Git 历史和旧文档大规模替换

---

## 8. 风险评估

### 低风险
- `package.json` 的 `name` / `homepage` / `bugs`
- `package-lock.json` 顶层 `name`
- `bun.lock` 顶层包名
- 导出数据库文件名

### 中风险
- 日志前缀
- README / CHANGELOG 大规模替换

### 高风险
- 直接重命名项目目录
- 新建一个全新工程再迁移代码

结论：

> 当前最稳的做法不是重建项目，而是在现有项目上做一轮低风险命名统一。

---

## 9. 最终建议

这轮只做下面 4 个改动：

1. `package.json`
2. `package-lock.json`
3. `bun.lock`
4. `src/core/settings.tsx`

这样做完之后：

- 插件显示名继续保持现在的产品名
- 工程名不再继续显示成 `twitter-web-exporter`
- 导出文件名也变成你的项目名
- 不会影响当前插件的正常功能和使用

---

## 10. 后续再考虑的事

如果后面你想彻底品牌化，再考虑第二轮：

1. 改日志前缀
2. 改 README / CHANGELOG
3. 改目录名

但这些都不应该放在现在这轮。
