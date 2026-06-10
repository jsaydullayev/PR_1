/* ============================================================
   Иккимиз — махфий чат (private chat)
   Фақат Паризода ва Жаҳонгир ўртасида. Реал вақтда синхрон
   (account.js даги Store орқали — Firebase бўлса иккала
   қурилмада дарров кўринади, бўлмаса localStorage).
   ============================================================ */
(function () {
  const SEEN_KEY = 'pj_chat_seen';
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function curUser() { return (window.PJ && window.PJ.currentUser && window.PJ.currentUser()) || ''; }

  let fab, dot, panel, listEl, inputEl, formEl, closeBtn, booted = false, open = false;

  function getMsgs() {
    const arr = (window.PJ && window.PJ.getChat && window.PJ.getChat()) || [];
    return arr.slice().sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
  }
  function lastSeen() { try { return +localStorage.getItem(SEEN_KEY) || 0; } catch (e) { return 0; } }
  function markSeen() { try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch (e) {} }

  function fmtTime(at) {
    if (!at) return '';
    const d = new Date(at);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function dayLabel(at) {
    const d = new Date(at); const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const yest = new Date(now); yest.setDate(now.getDate() - 1);
    if (sameDay) return 'Бугун';
    if (d.toDateString() === yest.toDateString()) return 'Кеча';
    const M = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    return d.getDate() + '-' + M[d.getMonth()];
  }

  function updateDot() {
    if (!dot) return;
    const me = curUser();
    const msgs = getMsgs();
    const seen = lastSeen();
    const unread = msgs.some(function (m) { return m.author !== me && (m.at || 0) > seen; });
    dot.style.display = (unread && !open) ? 'block' : 'none';
  }

  function render() {
    if (!listEl) return;
    const me = curUser();
    const msgs = getMsgs();
    if (!msgs.length) {
      listEl.innerHTML = '<div class="chat-empty">Бу — фақат иккимизга тегишли жой. 💗<br>Биринчи хабарни ёзиб қўй.</div>';
      return;
    }
    listEl.innerHTML = '';
    let lastDay = '';
    msgs.forEach(function (m) {
      const dl = dayLabel(m.at);
      if (dl !== lastDay) {
        lastDay = dl;
        const sep = document.createElement('div');
        sep.className = 'chat-day';
        sep.innerHTML = '<span></span>';
        sep.querySelector('span').textContent = dl;
        listEl.appendChild(sep);
      }
      const mine = m.author === me;
      const row = document.createElement('div');
      row.className = 'chat-row ' + (mine ? 'me' : 'them');
      const bub = document.createElement('div');
      bub.className = 'chat-bub';
      const txt = document.createElement('div');
      txt.className = 'chat-txt';
      txt.textContent = m.text || '';
      const t = document.createElement('div');
      t.className = 'chat-time';
      t.textContent = fmtTime(m.at);
      bub.appendChild(txt);
      bub.appendChild(t);
      if (mine) {
        const del = document.createElement('button');
        del.type = 'button'; del.className = 'chat-del'; del.setAttribute('aria-label', 'Ўчириш'); del.textContent = '✕';
        del.addEventListener('click', function () { if (window.PJ && window.PJ.deleteChat) window.PJ.deleteChat(m.id); render(); });
        bub.appendChild(del);
      }
      row.appendChild(bub);
      listEl.appendChild(row);
    });
    scrollBottom();
  }

  function scrollBottom() {
    requestAnimationFrame(function () { listEl.scrollTop = listEl.scrollHeight; });
  }

  function send() {
    const text = (inputEl.value || '').trim();
    if (!text) return;
    if (window.PJ && window.PJ.addChat) {
      window.PJ.addChat({ id: uid(), text: text, author: curUser(), at: Date.now() });
    }
    inputEl.value = '';
    inputEl.style.height = 'auto';
    inputEl.focus();
    markSeen();
    render();
  }

  function openPanel() {
    open = true;
    panel.classList.add('show');
    document.body.style.overflow = 'hidden';
    markSeen();
    updateDot();
    render();
    setTimeout(function () { inputEl && inputEl.focus(); }, 250);
  }
  function closePanel() {
    open = false;
    panel.classList.remove('show');
    document.body.style.overflow = '';
    markSeen();
    updateDot();
  }

  function build() {
    fab = document.createElement('button');
    fab.className = 'chat-fab';
    fab.setAttribute('aria-label', 'Иккимиз — чат');
    fab.innerHTML = '<span class="cf-ico">✉</span><span class="chat-dot" style="display:none"></span>';
    document.body.appendChild(fab);
    dot = fab.querySelector('.chat-dot');

    panel = document.createElement('div');
    panel.className = 'chat-panel';
    panel.innerHTML =
      '<div class="chat-head">' +
        '<div class="chat-head-t"><span class="chat-head-title">Суҳбатимиз</span>' +
        '<span class="chat-head-sub">иккимиз орасида</span></div>' +
        '<button class="chat-close" aria-label="Ёпиш">✕</button>' +
      '</div>' +
      '<div class="chat-list" id="chatList"></div>' +
      '<form class="chat-input-bar" id="chatForm" autocomplete="off">' +
        '<textarea id="chatInput" rows="1" placeholder="Хабар ёз..." maxlength="2000"></textarea>' +
        '<button class="chat-send" type="submit" aria-label="Юбориш">➤</button>' +
      '</form>';
    document.body.appendChild(panel);

    listEl = panel.querySelector('#chatList');
    inputEl = panel.querySelector('#chatInput');
    formEl = panel.querySelector('#chatForm');
    closeBtn = panel.querySelector('.chat-close');

    fab.addEventListener('click', openPanel);
    closeBtn.addEventListener('click', closePanel);
    formEl.addEventListener('submit', function (e) { e.preventDefault(); send(); });
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    inputEl.addEventListener('input', function () {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
    });
  }

  function boot() {
    if (!fab) build();
    render();
    updateDot();
    if (!booted && window.PJ && window.PJ.onUpdate) {
      booted = true;
      window.PJ.onUpdate(function () {
        if (open) { render(); markSeen(); }
        updateDot();
      });
    }
  }

  window.CoupleChat = { boot: boot };
  if (document.readyState !== 'loading') setTimeout(boot, 0);
  else document.addEventListener('DOMContentLoaded', boot);
})();
