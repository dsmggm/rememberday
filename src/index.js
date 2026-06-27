/**
 * RememberDay - Cloudflare Worker 入口
 *
 * 存储方案：Durable Objects + SQLite 存储后端
 * - 部署时自动创建，无需手动建库或填写任何 ID
 * - 留言数据存于 DO 内嵌的 SQLite 数据库，首次访问自动建表
 */

import { DurableObject } from 'cloudflare:workers';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

/* ================================================================== */
/* Durable Object：留言板存储（内嵌 SQLite 数据库）                   */
/* ================================================================== */
export class MessagesDB extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.initPromise = null;
  }

  // 自动建表（幂等，同一 DO 实例内只执行一次）
  async ensureTable() {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS messages (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          name       TEXT    NOT NULL,
          content    TEXT    NOT NULL,
          parent_id  INTEGER DEFAULT NULL,
          created_at TEXT    NOT NULL DEFAULT (datetime('now', '+8 hours'))
        )
      `);
      this.ctx.storage.sql.exec(
        'CREATE INDEX IF NOT EXISTS idx_messages_parent_id ON messages(parent_id)'
      );
      this.ctx.storage.sql.exec(
        'CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)'
      );
    })();
    return this.initPromise;
  }

  // 读取全部留言（树形：顶层留言 + 各自回复）
  async getMessages() {
    await this.ensureTable();
    const cursor = this.ctx.storage.sql.exec(
      'SELECT id, name, content, parent_id, created_at FROM messages ORDER BY created_at ASC'
    );

    const rows = [];
    for (const row of cursor) {
      rows.push({
        id: row.id,
        name: row.name,
        content: row.content,
        parent_id: row.parent_id,
        created_at: row.created_at,
      });
    }

    const tops = [];
    const replyMap = new Map();

    for (const row of rows) {
      if (row.parent_id === null) {
        tops.push({ ...row, replies: [] });
      } else {
        if (!replyMap.has(row.parent_id)) replyMap.set(row.parent_id, []);
        replyMap.get(row.parent_id).push(row);
      }
    }

    for (const top of tops) {
      top.replies = (replyMap.get(top.id) || []).sort((a, b) =>
        String(a.created_at).localeCompare(String(b.created_at))
      );
    }
    tops.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

    return { messages: tops };
  }

  // 发表顶层留言
  async addMessage(name, content) {
    await this.ensureTable();
    this.ctx.storage.sql.exec(
      'INSERT INTO messages (name, content, parent_id) VALUES (?, ?, NULL)',
      name,
      content
    );
    return { ok: true };
  }

  // 回复指定留言
  async addReply(parentId, name, content) {
    await this.ensureTable();

    // 确认父留言存在
    const cursor = this.ctx.storage.sql.exec(
      'SELECT id FROM messages WHERE id = ?',
      parentId
    );
    let exists = false;
    for (const _ of cursor) {
      exists = true;
      break;
    }
    if (!exists) return { error: '被回复的留言不存在' };

    this.ctx.storage.sql.exec(
      'INSERT INTO messages (name, content, parent_id) VALUES (?, ?, ?)',
      name,
      content,
      parentId
    );
    return { ok: true };
  }
}

/* ================================================================== */
/* Worker 入口                                                        */
/* ================================================================== */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    // API 路由：转发给 Durable Object 处理
    if (pathname.startsWith('/api/')) {
      // 用固定名称获取唯一的留言板 DO 实例
      const id = env.MESSAGES.idFromName('global');
      const stub = env.MESSAGES.get(id);
      return handleApi(request, env, stub);
    }

    // 其余请求交给静态资源处理（前端页面）
    return env.ASSETS.fetch(request);
  },
};

/* ------------------------------------------------------------------ */
/* API 路由分发                                                        */
/* ------------------------------------------------------------------ */
async function handleApi(request, env, stub) {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method;

  try {
    // 前端配置（纪念日信息）
    if (pathname === '/api/config' && method === 'GET') {
      return json({
        personA: env.PERSON_A || 'A',
        personB: env.PERSON_B || 'B',
        startDate: env.START_DATE || '2020-01-01',
      });
    }

    // 获取全部留言（含回复，树形结构）
    if (pathname === '/api/messages' && method === 'GET') {
      return json(await stub.getMessages());
    }

    // 发表新留言
    if (pathname === '/api/messages' && method === 'POST') {
      const body = await readJson(request);
      const name = sanitize(body.name, 30);
      const content = sanitize(body.content, 500);
      if (!content) return json({ error: '留言内容不能为空' }, 400);

      const res = await stub.addMessage(name, content);
      return json(res, 201);
    }

    // 回复某条留言  /api/messages/:id/reply
    const replyMatch = pathname.match(/^\/api\/messages\/(\d+)\/reply$/);
    if (replyMatch && method === 'POST') {
      const body = await readJson(request);
      const name = sanitize(body.name, 30);
      const content = sanitize(body.content, 500);
      if (!content) return json({ error: '回复内容不能为空' }, 400);

      const res = await stub.addReply(Number(replyMatch[1]), name, content);
      if (res.error) return json(res, 404);
      return json(res, 201);
    }

    return json({ error: '未找到该接口' }, 404);
  } catch (err) {
    console.error('API Error:', err);
    return json({ error: '服务器内部错误：' + (err?.message || String(err)) }, 500);
  }
}

/* ------------------------------------------------------------------ */
/* 工具函数                                                            */
/* ------------------------------------------------------------------ */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

// 去除首尾空白 + 截断长度，防御性处理用户输入
function sanitize(value, maxLen) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}
