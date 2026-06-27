-- RememberDay 建表 SQL（参考）
--
-- 说明：本项目使用 Durable Objects + 内嵌 SQLite 存储留言数据，
-- 上述建表语句已内置于 src/index.js 的 MessagesDB.ensureTable() 中，
-- 首次访问留言板时自动执行（CREATE TABLE IF NOT EXISTS，幂等）。
--
-- 本文件仅作为表结构参考，无需手动运行。

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  parent_id  INTEGER DEFAULT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

-- 加速按父留言查询回复
CREATE INDEX IF NOT EXISTS idx_messages_parent_id ON messages(parent_id);

-- 加速按时间排序
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
