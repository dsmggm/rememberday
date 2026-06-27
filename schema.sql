-- RememberDay 数据库初始化脚本
-- 用于存储留言板数据（留言与回复）

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
