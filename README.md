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
├── schema.sql          # D1 数据库建表脚本（可选，项目支持自动建表）
├── wrangler.toml       # Cloudflare Workers 配置（环境变量 / D1 绑定）
├── package.json
└── README.md
```

## 🚀 部署指南（GitHub 导入方式）

Cloudflare 创建 Worker 时可直接选择你的 GitHub 仓库，连接后每次 push 代码都会自动重新构建部署。

> 📌 **部署前请在仓库 `wrangler.toml` 中完成两项配置**（否则部署会报错）：
> - 创建 D1 数据库 `RememberDay`（控制台 → Workers & Pages → D1 → Create database），将返回的 **Database ID** 填入 `wrangler.toml` 的 `database_id` 字段
> - 修改 `[vars]` 段中的 `PERSON_A`、`PERSON_B`、`START_DATE` 为你的纪念日信息

### 第 1 步：创建 Worker 并导入 GitHub 仓库

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages**
2. 点击 **Create application** → **Import a repository** → **Get started**
3. 首次使用需授权 Cloudflare 访问你的 GitHub 账号，授权后选择本项目的仓库
4. 填写项目配置：

   | 配置项 | 填写内容 |
   | --- | --- |
   | **Worker name** | `rememberday`（须与 `wrangler.toml` 中的 `name` 一致） |
   | **Production branch** | `main` |
   | **Build command** | 留空（本项目无需构建步骤） |
   | **Deploy command** | `npx wrangler deploy` |

5. 点击 **Save and Deploy**

### 第 2 步：验证部署

- 在 Worker 详情页 **Deployments** 标签查看构建状态与日志
- 构建成功后访问 `https://rememberday.<你的子域>.workers.dev` 即可看到页面
- **首次访问时 Worker 会自动创建数据库表**，留言板立即可用

### 后续更新（持续集成）

连接 GitHub 后，**以后每次向 `main` 分支推送代码，Cloudflare 都会自动重新构建并部署**：

- 修改纪念日信息：编辑 `wrangler.toml` 的 `[vars]` 并提交即可
- 修改页面或功能：提交代码改动即可自动生效
- 无需再手动操作 Cloudflare 控制台

## 🖥️ 本地开发（可选）

如需在本地调试，可使用命令行：

```bash
npm install              # 安装依赖
npm run dev              # 启动本地开发服务器，访问 http://localhost:8787
```

本地开发需提前创建 D1 数据库并填好 `database_id`，或参考下方「数据库说明」手动初始化表结构：

```bash
npx wrangler d1 create RememberDay           # 创建数据库
npm run db:init                               # 本地初始化表
npm run db:init:remote                        # 远程初始化表（可选）
```

## ⚙️ 环境变量说明

| 变量名 | 说明 | 示例 |
| --- | --- | --- |
| `PERSON_A` | 主角 A 的名字 | `小明` |
| `PERSON_B` | 主角 B 的名字 | `小红` |
| `START_DATE` | 在一起的起始日期，格式 `YYYY-MM-DD` | `2020-01-01` |

配置方式（二选一）：

1. **在仓库中配置**（推荐）：编辑 `wrangler.toml` 的 `[vars]` 段，提交后自动部署生效。
2. **在控制台中配置**：Dashboard → Worker 详情 → **Settings** → **Variables & Secrets**，添加上述变量。此方式无需改代码，但注意 `wrangler.toml` 中若有同名 `[vars]` 会在部署时覆盖控制台值。

## 🗄️ 数据库说明

- 数据库类型：**Cloudflare D1**（基于 SQLite 的 Serverless 数据库）
- 数据库名：**RememberDay**
- 表名：`messages`

### 自动初始化机制

本项目内置自动建表能力，**无需手动执行 SQL**：

- Worker 处理任何 `/api/*` 请求前，会先调用 `ensureDb()` 检查表结构
- 首次访问时执行 `CREATE TABLE IF NOT EXISTS`（幂等），表已存在则跳过，**不会清空或改动已有数据**
- 同一 isolate 内只执行一次，后续请求直接放行，几乎无性能损耗
- 因此部署后**直接打开页面即自动建表完成**，留言板立即可用

### 表结构

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | INTEGER PK | 自增主键 |
| `name` | TEXT | 留言人昵称 |
| `content` | TEXT | 留言内容 |
| `parent_id` | INTEGER | 父留言 ID，顶层留言为 `NULL`，回复则指向被回复的留言 |
| `created_at` | TEXT | 留言时间，默认北京时间（UTC+8） |

建表 SQL 另见 [`schema.sql`](./schema.sql)，仅供手动初始化时参考使用。

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
- **修改纪念日信息**：编辑 `wrangler.toml` 中 `[vars]` 的值并提交到 GitHub，Cloudflare 会自动重新部署生效，无需改其他代码。

## 📄 License

MIT
