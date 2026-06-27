/**
 * RememberDay - Cloudflare Worker 入口
 * 提供前端静态资源服务 + 留言板 API
 */

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

// 自动建表 SQL（与 schema.sql 保持一致，幂等）
const INIT_SQL = `
CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  parent_id  INTEGER DEFAULT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now', '+8 hours'))
);
CREATE INDEX IF NOT EXISTS idx_messages_parent_id ON messages(parent_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
`;

// 同一个 isolate 内只初始化一次，避免每次请求都执行建表
let dbReady = false;
let dbReadyPromise = null;

/**
 * 自动初始化 D1 数据库表结构。
 * - 首次访问时执行建表（幂等，可安全重复执行）
 * - 同一 isolate 内只执行一次，后续请求直接放行
 * - 表已存在时 CREATE TABLE IF NOT EXISTS 不会改动数据
 */
async function ensureDb(env) {
  if (dbReady) return;
  if (dbReadyPromise) return dbReadyPromise;

  dbReadyPromise = (async () => {
    try {
      if (!env.DB) {
        throw new Error('未绑定 D1 数据库，请在 wrangler.toml 中配置 [[d1_databases]]');
      }
      await env.DB.batch(INIT_SQL.trim().split(';').filter((s) => s.trim()));
      dbReady = true;
    } catch (err) {
      // 失败则重置，允许下次请求重试
      dbReadyPromise = null;
      throw err;
    }
  })();
  return dbReadyPromise;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    // API 路由：先确保数据库表已初始化
    if (pathname.startsWith('/api/')) {
      try {
        await ensureDb(env);
      } catch (err) {
        console.error('DB init error:', err);
        return json(
          { error: '数据库初始化失败：' + (err?.message || String(err)) },
          500
        );
      }
      return handleApi(request, env);
    }

    // 其余请求交给静态资源处理（前端页面）
    return env.ASSETS.fetch(request);
  },
};

/* ------------------------------------------------------------------ */
/* API 路由分发                                                        */
/* ------------------------------------------------------------------ */
async function handleApi(request, env) {
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
      return await getMessages(env);
    }

    // 发表新留言
    if (pathname === '/api/messages' && method === 'POST') {
      return await createMessage(request, env);
    }

    // 回复某条留言  /api/messages/:id/reply
    const replyMatch = pathname.match(/^\/api\/messages\/(\d+)\/reply$/);
    if (replyMatch && method === 'POST') {
      return await createReply(request, env, Number(replyMatch[1]));
    }

    return json({ error: '未找到该接口' }, 404);
  } catch (err) {
    console.error('API Error:', err);
    return json({ error: '服务器内部错误：' + (err?.message || String(err)) }, 500);
  }
}

/* ------------------------------------------------------------------ */
/* 留言业务逻辑                                                        */
/* ------------------------------------------------------------------ */

// 获取留言树：顶层留言 + 各自的回复
async function getMessages(env) {
  const { results } = await env.DB.prepare(
    'SELECT id, name, content, parent_id, created_at FROM messages ORDER BY created_at ASC'
  ).all();

  const tops = [];
  const replyMap = new Map();

  for (const row of results) {
    if (row.parent_id === null) {
      tops.push({ ...row, replies: [] });
    } else {
      if (!replyMap.has(row.parent_id)) replyMap.set(row.parent_id, []);
      replyMap.get(row.parent_id).push(row);
    }
  }

  // 把回复挂到对应顶层留言下，按时间正序
  for (const top of tops) {
    top.replies = (replyMap.get(top.id) || []).sort((a, b) =>
      a.created_at.localeCompare(b.created_at)
    );
  }

  // 顶层留言按时间倒序（最新在前）
  tops.sort((a, b) => b.created_at.localeCompare(a.created_at));

  return json({ messages: tops });
}

// 发表顶层留言
async function createMessage(request, env) {
  const body = await readJson(request);
  const name = sanitize(body.name, 30);
  const content = sanitize(body.content, 500);

  if (!content) return json({ error: '留言内容不能为空' }, 400);

  await env.DB.prepare(
    'INSERT INTO messages (name, content, parent_id) VALUES (?, ?, NULL)'
  )
    .bind(name, content)
    .run();

  return json({ ok: true }, 201);
}

// 回复留言
async function createReply(request, env, parentId) {
  const body = await readJson(request);
  const name = sanitize(body.name, 30);
  const content = sanitize(body.content, 500);

  if (!content) return json({ error: '回复内容不能为空' }, 400);

  // 确认父留言存在
  const parent = await env.DB.prepare(
    'SELECT id FROM messages WHERE id = ?'
  )
    .bind(parentId)
    .first();
  if (!parent) return json({ error: '被回复的留言不存在' }, 404);

  await env.DB.prepare(
    'INSERT INTO messages (name, content, parent_id) VALUES (?, ?, ?)'
  )
    .bind(name, content, parentId)
    .run();

  return json({ ok: true }, 201);
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
