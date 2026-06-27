/* =================================================================
   RememberDay 前端逻辑
   - 读取配置并计算在一起时长
   - 搜索引擎切换与跳转
   - 留言板的加载 / 发布 / 回复
   - 设为主页
   ================================================================= */

/* ---------------- 配置与纪念日 ---------------- */
async function initAnniversary() {
  try {
    const res = await fetch('/api/config');
    const cfg = await res.json();

    document.getElementById('personA').textContent = cfg.personA;
    document.getElementById('personB').textContent = cfg.personB;

    const { years, months, days, totalDays } = calcDuration(cfg.startDate);
    document.getElementById('years').textContent = years;
    document.getElementById('months').textContent = months;
    document.getElementById('days').textContent = days;
    document.getElementById('totalDays').textContent = totalDays.toLocaleString();
  } catch (e) {
    console.error('读取配置失败', e);
  }
}

// 计算从 startDate 到今天 的 年/月/天 与 总天数
function calcDuration(startDate) {
  const start = new Date(startDate + 'T00:00:00');
  const now = new Date();

  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  let days = now.getDate() - start.getDate();

  if (days < 0) {
    months -= 1;
    // 上个月的天数
    const prevMonthDays = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    days += prevMonthDays;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const totalDays = Math.max(0, Math.floor((now - start) / 86400000));
  return { years, months, days, totalDays };
}

/* ---------------- 搜索 ---------------- */
const ENGINES = {
  baidu:  { url: 'https://www.baidu.com/s?wd=',  name: '百度' },
  bing:   { url: 'https://www.bing.com/search?q=', name: 'Bing' },
  google: { url: 'https://www.google.com/search?q=', name: 'Google' },
};
let currentEngine = localStorage.getItem('rd_engine') || 'baidu';

function initSearch() {
  const btns = document.querySelectorAll('.engine-btn');
  const form = document.getElementById('searchForm');
  const input = document.getElementById('searchInput');

  // 恢复上次选择
  btns.forEach((b) => b.classList.toggle('active', b.dataset.engine === currentEngine));

  btns.forEach((b) => {
    b.addEventListener('click', () => {
      currentEngine = b.dataset.engine;
      localStorage.setItem('rd_engine', currentEngine);
      btns.forEach((x) => x.classList.toggle('active', x === b));
      input.focus();
    });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    const engine = ENGINES[currentEngine] || ENGINES.baidu;
    window.open(engine.url + encodeURIComponent(q), '_blank');
  });
}

/* ---------------- 留言板 ---------------- */
async function loadMessages() {
  const list = document.getElementById('msgList');
  try {
    const res = await fetch('/api/messages');
    const data = await res.json();
    renderMessages(data.messages || []);
  } catch (e) {
    list.innerHTML = '<p class="loading-tip">留言加载失败，请稍后重试</p>';
  }
}

function renderMessages(messages) {
  const list = document.getElementById('msgList');

  if (!messages.length) {
    list.innerHTML = '<p class="loading-tip">还没有留言，快来抢沙发吧 🛋️</p>';
    return;
  }

  list.innerHTML = '';
  messages.forEach((msg) => list.appendChild(buildMsgNode(msg)));
}

function buildMsgNode(msg) {
  const node = document.createElement('div');
  node.className = 'msg-item card';

  const repliesHtml = (msg.replies || [])
    .map((r) => replyTemplate(r))
    .join('');

  node.innerHTML = `
    <div class="msg-head">
      <div class="avatar" style="background:${avatarColor(msg.name)}">${initial(msg.name)}</div>
      <div class="msg-meta">
        <span class="msg-name">${escapeHtml(msg.name || '匿名')}</span>
        <span class="msg-date">${formatDate(msg.created_at)}</span>
      </div>
    </div>
    <div class="msg-content">${escapeHtml(msg.content)}</div>
    <div class="msg-actions">
      <button class="btn-reply" data-id="${msg.id}">回复</button>
    </div>
    <div class="replies">${repliesHtml}</div>
    <div class="reply-form" data-id="${msg.id}">
      <input type="text" class="reply-name" placeholder="昵称（选填）" maxlength="30" />
      <textarea class="reply-content" placeholder="写下你的回复…" maxlength="500" rows="2"></textarea>
      <div class="reply-form-foot">
        <button class="btn-cancel">取消</button>
        <button class="btn-send">发送</button>
      </div>
    </div>
  `;

  bindReplyEvents(node, msg.id);
  return node;
}

function replyTemplate(r) {
  return `
    <div class="reply-item">
      <div class="msg-head">
        <div class="avatar" style="background:${avatarColor(r.name)}">${initial(r.name)}</div>
        <div class="msg-meta">
          <span class="msg-name">${escapeHtml(r.name || '匿名')}</span>
          <span class="msg-date">${formatDate(r.created_at)}</span>
        </div>
      </div>
      <div class="msg-content">${escapeHtml(r.content)}</div>
    </div>
  `;
}

function bindReplyEvents(node, msgId) {
  const replyBtn = node.querySelector('.btn-reply');
  const form = node.querySelector('.reply-form');
  const cancelBtn = node.querySelector('.btn-cancel');
  const sendBtn = node.querySelector('.btn-send');

  replyBtn.addEventListener('click', () => {
    form.classList.toggle('open');
    if (form.classList.contains('open')) form.querySelector('.reply-content').focus();
  });
  cancelBtn.addEventListener('click', () => form.classList.remove('open'));
  sendBtn.addEventListener('click', async () => {
    const name = form.querySelector('.reply-name').value.trim();
    const content = form.querySelector('.reply-content').value.trim();
    if (!content) { showToast('回复内容不能为空'); return; }

    sendBtn.disabled = true;
    try {
      const res = await fetch(`/api/messages/${msgId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, content }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '回复失败');
      }
      await loadMessages();
    } catch (e) {
      showToast(e.message);
    } finally {
      sendBtn.disabled = false;
    }
  });
}

function initMessageForm() {
  const form = document.getElementById('msgForm');
  const content = document.getElementById('msgContent');
  const count = document.getElementById('charCount');

  content.addEventListener('input', () => {
    count.textContent = `${content.value.length}/500`;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('msgName').value.trim();
    const text = content.value.trim();
    if (!text) { showToast('留言内容不能为空'); return; }

    const btn = form.querySelector('.btn-primary');
    btn.disabled = true;
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, content: text }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '发布失败');
      }
      form.reset();
      count.textContent = '0/500';
      await loadMessages();
      showToast('留言成功 ❤');
    } catch (e) {
      showToast(e.message);
    } finally {
      btn.disabled = false;
    }
  });
}

/* ---------------- 设为主页 ---------------- */
function initSetHome() {
  const btn = document.getElementById('setHomeBtn');
  btn.addEventListener('click', () => {
    const ua = navigator.userAgent.toLowerCase();
    const url = location.href;

    // Edge / Chrome (Chromium) 新版通过设置面板手动设置
    if (ua.includes('edg')) {
      showToast('请在弹出的设置中点击“将此页设为主页”');
      try { window.location.href = 'edge://settings/onStartup'; } catch (_) {}
      return;
    }
    // 老版 IE
    if (document.all && ua.includes('msie')) {
      try { document.body.style.behavior = 'url(#default#homepage)'; document.body.setHomePage(url); } catch (_) {}
      return;
    }
    // Firefox
    if (ua.includes('firefox')) {
      showToast('Firefox 需在 选项→主页 中手动设置主页地址');
      return;
    }
    // Chrome / 其他 Chromium
    showToast('请在浏览器 设置→启动时 选择“打开特定网页”并粘贴本页地址');
  });
}

/* ---------------- 工具函数 ---------------- */
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function initial(name) {
  const n = (name || '匿').trim();
  return n.charAt(0).toUpperCase();
}

function avatarColor(name) {
  const colors = ['#ff6b9d', '#ffa07a', '#9b7cf6', '#4dc4ff', '#ffb84d', '#5bc890'];
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function formatDate(str) {
  if (!str) return '';
  // 兼容 "YYYY-MM-DD HH:MM:SS" 格式，截取到分钟
  return String(str).slice(0, 16).replace('T', ' ');
}

let toastTimer = null;
function showToast(msg) {
  const tip = document.getElementById('homeTip');
  tip.textContent = msg;
  tip.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { tip.hidden = true; }, 2600);
}

/* ---------------- 启动 ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  initAnniversary();
  initSearch();
  initMessageForm();
  initSetHome();
  loadMessages();
});
