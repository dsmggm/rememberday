# RememberDay 💕

一个基于 **Cloudflare Workers + D1** 的纪念日主页应用：显示「在一起 X 年 X 月 X 天」，集成多搜索引擎搜索框、可回复的留言板，并提供「设为主页」按钮。同时适配桌面端与移动端。

## ✨ 功能特性

| 功能 | 说明 |
| --- | --- |
| 纪念日展示 | 显示 `A 与 B 已经在一起 X 年 X 月 X 天`，下方小字显示「在一起 XXXX 天」，根据环境变量自动计算 |
| 搜索框 | 中部搜索框，默认百度，可切换 Bing / Google，记忆用户上次选择 |
| 留言板 | 所有人可留言、可回复，留言按时间排列，数据持久化到 Cloudflare D1 |
| 设为主页 | 右上角按钮，引导将本页设为浏览器主页 |
| 响应式 | 移动端 / 桌面端自适应布局 |

## 📁 项目结构

```
rememberday/
├── public/             # 前端静态资源（由 Workers Static Assets 托管）
│   ├── index.html      # 页面结构
│   ├── style.css       # 样式
│   └── app.js          # 前端交互逻辑
├── src/
│   └── index.js        # Worker 入口：API 路由 + 静态资源分发
├── schema.sql          # D1 数据库建表脚本
├── wrangler.toml       # Cloudflare Workers 配置（环境变量 / D1 绑定）
├── package.json
└── README.md
```

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

> 也可以直接使用全局安装的 wrangler：`npm i -g wrangler`

### 2. 登录 Cloudflare

```bash
npx wrangler login
```

### 3. 创建 D1 数据库（名为 RememberDay）

```bash
npx wrangler d1 create RememberDay
```

执行后会输出类似如下内容：

```
✅ Successfully created DB 'RememberDay'
[[d1_databases]]
binding = "DB"
database_name = "RememberDay"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"   # ← 复制这个 ID
```

**将输出的 `database_id` 填入 `wrangler.toml` 的 `[[d1_databases]]` 段：**

```toml
[[d1_databases]]
binding = "DB"
database_name = "RememberDay"
database_id = "把上面复制的 ID 粘贴到这里"
```

> 也可用快捷命令一步创建：`npm run db:create`

### 4. 初始化数据库表

```bash
# 本地（开发环境）
npm run db:init

# 远程（生产环境）
npm run db:init:remote
```

### 5. 配置纪念日环境变量

编辑 `wrangler.toml` 中的 `[vars]` 段，修改为你自己的信息：

```toml
[vars]
PERSON_A = "小明"        # 第一位主角名字
PERSON_B = "小红"        # 第二位主角名字
START_DATE = "2020-01-01" # 在一起的起始日期（YYYY-MM-DD）
```

页面会根据 `START_DATE` 与当前日期自动计算「在一起 X 年 X 月 X 天」及总天数。修改后重新部署即可更新显示。

### 6. 本地开发

```bash
npm run dev
```

浏览器打开 `http://localhost:8787` 预览。

### 7. 部署到 Cloudflare

```bash
npm run deploy
```

部署成功后会得到一个 `https://rememberday.<你的子域>.workers.dev` 地址，即可作为主页使用。

## ⚙️ 环境变量说明

| 变量名 | 说明 | 示例 |
| --- | --- | --- |
| `PERSON_A` | 主角 A 的名字 | `小明` |
| `PERSON_B` | 主角 B 的名字 | `小红` |
| `START_DATE` | 在一起的起始日期，格式 `YYYY-MM-DD` | `2020-01-01` |

以上变量均在 `wrangler.toml` 的 `[vars]` 段中配置。也可通过 Dashboard 的 Workers → 设置 → 变量 页面配置（敏感或需动态调整时推荐）。

## 🗄️ 数据库说明

- 数据库类型：**Cloudflare D1**（基于 SQLite 的 Serverless 数据库）
- 数据库名：**RememberDay**
- 表名：`messages`

### 表结构

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | INTEGER PK | 自增主键 |
| `name` | TEXT | 留言人昵称 |
| `content` | TEXT | 留言内容 |
| `parent_id` | INTEGER | 父留言 ID，顶层留言为 `NULL`，回复则指向被回复的留言 |
| `created_at` | TEXT | 留言时间，默认本地时间 |

建表 SQL 见 [`schema.sql`](./schema.sql)。

## 🔌 API 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/config` | 获取纪念日配置（名字、起始日期） |
| `GET` | `/api/messages` | 获取全部留言（含回复，树形结构） |
| `POST` | `/api/messages` | 发表留言，body: `{ "name": "", "content": "" }` |
| `POST` | `/api/messages/:id/reply` | 回复指定留言，body: `{ "name": "", "content": "" }` |

## 📝 使用提示

- **切换搜索引擎**：点击搜索框左侧「百度 / Bing / Google」按钮即可，选择会被浏览器本地记忆。
- **设为主页**：因现代浏览器安全限制，无法通过脚本直接修改主页，点击右上角按钮后会给出对应浏览器的手动设置指引。
- **修改纪念日信息**：仅需改 `wrangler.toml` 中 `[vars]` 的值并重新 `npm run deploy`，无需改代码。

## 📄 License

MIT
