/* ============================================================
   Parizoda — login + 2 sahifa + sinxron javob/rasm
   Saqlash: SERVER (FastAPI + PostgreSQL), cookie-sessiya auth.
   O'zgarish SSE (/api/events) orqali ikkala qurilmada DARHOL ko'rinadi.
   localStorage faqat tezkor ko'rsatish (kesh) uchun.
   ============================================================ */
(function () {
  // username -> view (parol endi SERVERDA, kodda emas)
  const VIEW_OF = { parizoda: 'parizoda', jaxongir: 'jaxongir' };

  let currentUserObj = null; // { username, display, view }

  /* ---------- STORE: server (FastAPI + PostgreSQL) + SSE ---------- */
  const Store = (function () {
    const BLANK = { lovePercent: null, madeUp: false, madeUpAt: null, photo: null, shart: null, shartAt: null, memories: {}, bucket: [], chat: [], updatedAt: null };
    let data = Object.assign({}, BLANK, { memories: {}, bucket: [], chat: [] });
    let cb = null;
    const mode = 'server';
    const LS = 'pj_answers';
    const listeners = [];
    const API = (window.PARI_API_BASE || '');
    let onAuth = null;     // 401 bo'lganda chaqiriladi (login ko'rsatish)
    let started = false;

    function readLS() { try { return JSON.parse(localStorage.getItem(LS) || 'null') || {}; } catch (e) { return {}; } }
    function writeLS() { try { localStorage.setItem(LS, JSON.stringify(data)); } catch (e) { try { toast('Сақлаб бўлмади — хотира тўлди'); } catch (e2) {} } }
    function normalize() { if (!data.memories || typeof data.memories !== 'object') data.memories = {}; if (!Array.isArray(data.bucket)) data.bucket = []; if (!Array.isArray(data.chat)) data.chat = []; }
    function emit() { normalize(); if (cb) cb(data); for (var i = 0; i < listeners.length; i++) { try { listeners[i](data); } catch (e) {} } }
    function toastSafe(msg) { try { toast(msg || 'Серверга сақланмади — интернетни текширинг'); } catch (e) {} }

    function handle401() { try { if (onAuth) onAuth(); } catch (e) {} }

    function apiGet(path) {
      return fetch(API + path, { headers: { 'Accept': 'application/json' }, credentials: 'same-origin' })
        .then(function (r) { if (r.status === 401) { handle401(); throw new Error('401'); } if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
    }
    function apiSend(method, path, body) {
      return fetch(API + path, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: body ? JSON.stringify(body) : undefined,
      }).then(function (r) { if (r.status === 401) { handle401(); throw new Error('401'); } if (!r.ok) throw new Error('HTTP ' + r.status); return r.json().catch(function () { return {}; }); });
    }

    // yozish xatosida: server haqiqatiga qaytaramiz (optimistik o'zgarishni bekor qilamiz)
    function onWriteError(e) {
      if (e && String(e.message) === '401') return; // login ekraniga o'tdik
      console.warn('yozishda xato:', e && e.message);
      toastSafe();
      refresh(); // serverdan qayta yuklab, saqlanmaganni qaytaramiz
    }

    function setServerState(s) { data = Object.assign({}, BLANK, s); normalize(); writeLS(); emit(); }
    function refresh() { return apiGet('/api/state').then(setServerState).catch(function (e) { if (String(e.message) !== '401') console.warn('state load xato:', e && e.message); }); }

    var es = null, pollTimer = null;
    function connectSSE() {
      try {
        if (es) es.close();
        es = new EventSource(API + '/api/events', { withCredentials: true });
        es.addEventListener('update', function () { refresh(); });
      } catch (e) { /* poll qoplaydi */ }
      clearInterval(pollTimer);
      pollTimer = setInterval(function () {
        apiGet('/api/version').then(function (v) { if (v && v.updatedAt && v.updatedAt !== data.updatedAt) refresh(); }).catch(function () {});
      }, 20000);
    }

    function init(onChange) {
      cb = onChange;
      if (started) { refresh(); return; }
      started = true;
      data = Object.assign({}, BLANK, readLS()); normalize(); setTimeout(emit, 0); // keshdan tez paint
      refresh();        // serverdan haqiqiy holat
      connectSSE();     // real-time
      console.log('%cParizoda: server rejimi (FastAPI + PostgreSQL) 💗', 'color:#D6537E');
    }
    function stop() {
      started = false;
      try { if (es) es.close(); } catch (e) {} es = null;
      clearInterval(pollTimer);
    }

    function pushAll(obj) {
      return apiSend('POST', '/api/restore', obj || readLS()).then(function () { return true; }).catch(function (e) { onWriteError(e); return false; });
    }

    function patch(p) {
      var prevVals = {}; Object.keys(p).forEach(function (k) { prevVals[k] = data[k]; }); var prevUpd = data.updatedAt;
      data = Object.assign({}, data, p, { updatedAt: Date.now() }); normalize(); writeLS(); emit();
      apiSend('PATCH', '/api/main', p).catch(function (e) {
        if (String(e.message) !== '401') { data = Object.assign({}, data, prevVals, { updatedAt: prevUpd }); normalize(); writeLS(); emit(); toastSafe(); }
      });
    }

    // ---------- xotiralar ----------
    function addMemory(dateKey, entry) {
      normalize();
      if (!data.memories[dateKey]) data.memories[dateKey] = [];
      data.memories[dateKey].push(entry); writeLS(); emit();
      apiSend('POST', '/api/memory', Object.assign({ dateKey: dateKey }, entry)).catch(onWriteError);
    }
    function updateMemory(dateKey, id, fields) {
      normalize();
      var arr = data.memories[dateKey]; if (!arr) return;
      var merged = null;
      for (var i = 0; i < arr.length; i++) if (arr[i].id === id) { arr[i] = Object.assign({}, arr[i], fields); merged = arr[i]; break; }
      writeLS(); emit();
      if (merged) apiSend('POST', '/api/memory', Object.assign({ dateKey: dateKey }, merged)).catch(onWriteError);
    }
    function deleteMemory(dateKey, id) {
      normalize();
      var arr = data.memories[dateKey]; if (!arr) return;
      data.memories[dateKey] = arr.filter(function (e) { return e.id !== id; });
      if (data.memories[dateKey].length === 0) delete data.memories[dateKey];
      writeLS(); emit();
      apiSend('DELETE', '/api/memory/' + encodeURIComponent(id)).catch(onWriteError);
    }

    // ---------- orzular (bucket) ----------
    function saveBucket() {
      writeLS(); emit();
      apiSend('PUT', '/api/bucket', { bucket: data.bucket }).catch(onWriteError);
    }
    function addBucket(item) { normalize(); data.bucket.push(item); saveBucket(); }
    function updateBucket(id, fields) { normalize(); for (var i = 0; i < data.bucket.length; i++) if (data.bucket[i].id === id) { data.bucket[i] = Object.assign({}, data.bucket[i], fields); break; } saveBucket(); }
    function deleteBucket(id) { normalize(); data.bucket = data.bucket.filter(function (b) { return b.id !== id; }); saveBucket(); }

    // ---------- maxfiy chat ----------
    function addChat(msg) {
      normalize(); data.chat.push(msg); writeLS(); emit();
      apiSend('POST', '/api/chat', msg).catch(onWriteError);
    }
    function deleteChat(id) {
      normalize(); data.chat = data.chat.filter(function (m) { return m.id !== id; }); writeLS(); emit();
      apiSend('DELETE', '/api/chat/' + encodeURIComponent(id)).catch(onWriteError);
    }
    function clearChat() {
      normalize(); data.chat = []; writeLS(); emit();
      apiSend('POST', '/api/chat/clear').catch(onWriteError);
    }

    function reloadLS() { refresh(); return true; }

    return {
      init: init, stop: stop, reloadLS: reloadLS, refresh: refresh,
      setAuthHandler: function (fn) { onAuth = fn; },
      forceUpload: function () { return pushAll(readLS()); },
      restoreToCloud: function () { return pushAll(readLS()); },
      pushAll: pushAll,
      get: function () { return data; },
      setAnswer: function (a) { patch(a); },
      setPhoto: function (url) { patch({ photo: url }); },
      setShart: function (text) { patch({ shart: text, shartAt: Date.now() }); },
      getMemories: function () { normalize(); return data.memories; },
      addMemory: addMemory, updateMemory: updateMemory, deleteMemory: deleteMemory,
      getBucket: function () { normalize(); return data.bucket; },
      addBucket: addBucket, updateBucket: updateBucket, deleteBucket: deleteBucket,
      getChat: function () { normalize(); return data.chat; },
      addChat: addChat, deleteChat: deleteChat, clearChat: clearChat,
      onUpdate: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
      get mode() { return mode; },
    };
  })();

  /* ---------- toast ---------- */
  let toastEl = null;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
  }

  /* ---------- view switching ---------- */
  function applyView(view) {
    document.body.classList.remove('locked', 'as-parizoda', 'as-jaxongir');
    document.body.classList.add('as-' + view);
    onData();
    if (view === 'parizoda') preloadSlider();
    if (view === 'jaxongir') startDashPoll();
  }
  function showLogin() {
    currentUserObj = null;
    try { Store.stop(); } catch (e) {}
    try { localStorage.removeItem('pj_answers'); } catch (e) {} // sessiya yo'q — maxfiy keshni tozalaymiz
    document.body.classList.remove('as-parizoda', 'as-jaxongir');
    document.body.classList.add('locked');
    const f = document.getElementById('loginForm'); if (f) f.reset();
    window.scrollTo(0, 0);
  }
  function startApp(user) {
    currentUserObj = user;
    applyView(user.view || VIEW_OF[user.username] || 'parizoda');
    Store.init(onData);
    if (window.MemoryCalendar && typeof window.MemoryCalendar.boot === 'function') window.MemoryCalendar.boot();
  }
  function logout() {
    fetch((window.PARI_API_BASE || '') + '/api/logout', { method: 'POST', credentials: 'same-origin' }).catch(function () {});
    showLogin();
  }

  /* ---------- login (server) ---------- */
  function setupLogin() {
    const form = document.getElementById('loginForm');
    const err = document.getElementById('loginErr');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const u = (document.getElementById('loginUser').value || '').trim().toLowerCase();
      const p = (document.getElementById('loginPass').value || '').trim();
      const btn = form.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      fetch((window.PARI_API_BASE || '') + '/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ username: u, password: p }),
      }).then(function (r) {
        if (!r.ok) throw new Error(r.status === 429 ? 'too many' : 'bad');
        return r.json();
      }).then(function (res) {
        err.classList.remove('show');
        startApp(res.user);
      }).catch(function (ex) {
        err.textContent = String(ex.message) === 'too many' ? 'Жуда кўп уриниш. Бироздан сўнг қайта уриниб кўринг.' : 'Маълумотлар нотўғри. Қайта уриниб кўринг.';
        err.classList.add('show');
        form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
      }).finally(function () { if (btn) btn.disabled = false; });
    });
    document.querySelectorAll('[data-logout]').forEach(function (b) { b.addEventListener('click', logout); });
  }

  function checkSession() {
    fetch((window.PARI_API_BASE || '') + '/api/me', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (res) { if (res && res.user) startApp(res.user); else showLogin(); })
      .catch(function () { showLogin(); });
  }

  /* ---------- Parizoda: javobni yozish ---------- */
  let sliderTouched = false;
  function preloadSlider() {
    const range = document.getElementById('loveRange');
    const d = Store.get();
    if (range && !sliderTouched && d.lovePercent != null) {
      range.value = d.lovePercent;
      range.dispatchEvent(new Event('input'));
    }
  }
  function setupParizoda() {
    const range = document.getElementById('loveRange');
    if (range) {
      range.addEventListener('input', function () { sliderTouched = true; });
      range.addEventListener('change', function () {
        Store.setAnswer({ lovePercent: +range.value });
        toast('💌 Жаҳонгирга юборилди');
      });
    }
    const yes = document.getElementById('btnYes');
    if (yes) {
      yes.addEventListener('click', function () {
        const r = document.getElementById('loveRange');
        const cur = Store.get().lovePercent;
        Store.setAnswer({ madeUp: true, madeUpAt: Date.now(), lovePercent: (cur == null && r) ? +r.value : cur });
        toast('🤍 Жаҳонгирга етказилди');
      });
    }
  }

  /* ---------- shared rasm (server-sinxron) ---------- */
  function encodeBitmap(bmp, max, q) {
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    return c.toDataURL('image/jpeg', q);
  }
  async function compressImage(file, budget) {
    budget = budget || 700 * 1024;
    const bmp = await createImageBitmap(file);
    let max = 1100, q = 0.82;
    let url = encodeBitmap(bmp, max, q);
    while (url.length > budget && (q > 0.4 || max > 480)) {
      if (q > 0.45) q -= 0.1; else max = Math.round(max * 0.85);
      url = encodeBitmap(bmp, max, q);
    }
    return url;
  }
  function openLightbox(src) {
    const lb = document.getElementById('lightbox'), im = document.getElementById('lbImg');
    if (!lb) return; im.src = src; lb.classList.add('show');
  }
  function renderPhoto() {
    const img = document.getElementById('usPhotoImg');
    const empty = document.getElementById('usPhotoEmpty');
    const change = document.getElementById('usPhotoChange');
    if (!img) return;
    const url = Store.get().photo;
    if (url) { img.src = url; img.hidden = false; empty.hidden = true; if (change) change.hidden = false; }
    else { img.hidden = true; empty.hidden = false; if (change) change.hidden = true; }
  }
  function setupPhoto() {
    const slot = document.getElementById('usPhoto');
    const input = document.getElementById('usPhotoInput');
    const change = document.getElementById('usPhotoChange');
    if (!slot || !input) return;
    const pick = function () { input.click(); };
    slot.addEventListener('click', function () {
      if (Store.get().photo) openLightbox(Store.get().photo); else pick();
    });
    slot.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); slot.click(); } });
    if (change) change.addEventListener('click', function (e) { e.stopPropagation(); pick(); });
    input.addEventListener('change', async function () {
      const f = input.files && input.files[0]; if (!f) return;
      try {
        toast('⏳ Расм юкланмоқда...');
        const url = await compressImage(f);
        Store.setPhoto(url);
        toast('💗 Расм сақланди');
      } catch (e) { toast('Расмни ўқиб бўлмади 🥺'); }
      input.value = '';
    });
  }

  /* ---------- Jaxongir: dashboard ---------- */
  let dashTimer = null;
  function fmtTime(v) {
    if (!v) return '';
    const d = new Date(v);
    const m = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
    return d.getDate() + '-' + m[d.getMonth()] + ', ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function renderDashboard() {
    const d = Store.get();
    const big = document.getElementById('dashPct');
    if (!big) return;
    const fill = document.getElementById('dashFill');
    const sub = document.getElementById('dashSub');
    const made = document.getElementById('dashMade');
    const shartEl = document.getElementById('dashShart');
    const upd = document.getElementById('dashUpd');
    const has = d.lovePercent != null;
    const pct = has ? d.lovePercent : 0;
    const isInf = pct >= 100;

    if (!has) {
      big.textContent = '—';
      fill.style.width = '0%';
      sub.textContent = 'Паризода ҳали жавоб бермаган. У ўз саҳифасида севги ўлчагични сурганда, жавоби шу ерда пайдо бўлади.';
    } else {
      big.textContent = isInf ? '∞' : pct + '%';
      fill.style.width = (isInf ? 100 : pct) + '%';
      let line;
      if (isInf) line = 'Чексиз. Севгисининг чегараси йўқ.';
      else if (pct >= 85) line = 'Сизни чиндан қаттиқ севади.';
      else if (pct >= 55) line = 'Юраги сизники — бу аниқ.';
      else if (pct >= 25) line = 'Севади — бугун бир оз эътибор кутаётгандек.';
      else line = 'Бугун кўнглига яқинроқ бўлинг — кичик эътибор катта иш қилади.';
      sub.textContent = line;
    }
    if (made) {
      if (d.madeUp) {
        made.className = 'dash-status ok';
        made.innerHTML = '<span class="ds-ico">🤍</span> Паризода ярашди!' + (d.madeUpAt ? ' <span class="ds-time">' + fmtTime(d.madeUpAt) + '</span>' : '');
      } else {
        made.className = 'dash-status wait';
        made.innerHTML = '<span class="ds-ico">⌛</span> ҳали жавоб кутилмоқда';
      }
    }
    if (shartEl) {
      if (d.shart) {
        shartEl.hidden = false;
        shartEl.innerHTML = '<div class="dsh-label">Дон-дон зики — Паризода ёзган шарт</div><div class="dsh-text"></div><div class="dsh-time"></div>';
        shartEl.querySelector('.dsh-text').textContent = '«' + d.shart + '»';
        var _t = shartEl.querySelector('.dsh-time');
        if (d.shartAt) _t.textContent = 'белгиланди: ' + fmtTime(d.shartAt); else _t.remove();
      } else {
        shartEl.hidden = true;
      }
    }
    var dPhotoWrap = document.getElementById('dashPhotoWrap');
    var dPhotoImg = document.getElementById('dashPhotoImg');
    if (dPhotoWrap && dPhotoImg) {
      if (d.photo) { dPhotoImg.src = d.photo; dPhotoWrap.hidden = false; }
      else { dPhotoImg.removeAttribute('src'); dPhotoWrap.hidden = true; }
    }
    upd.textContent = d.updatedAt ? ('охирги янгиланиш: ' + fmtTime(d.updatedAt)) : '';
  }
  function startDashPoll() {
    // Server rejimida SSE real-vaqtda yangilaydi — davriy poll shart emas.
    clearTimeout(dashTimer);
    if (Store.mode !== 'local') return;
    const poll = function () {
      if (!document.body.classList.contains('as-jaxongir')) return;
      try { Store.reloadLS(); } catch (e) {}
      dashTimer = setTimeout(poll, 3000);
    };
    dashTimer = setTimeout(poll, 3000);
  }

  /* ---------- har bir data o'zgarganda ---------- */
  function onData() {
    renderPhoto();
    if (document.body.classList.contains('as-jaxongir')) renderDashboard();
    if (document.body.classList.contains('as-parizoda')) preloadSlider();
  }

  /* ---------- boot ---------- */
  function boot() {
    setupLogin();
    setupParizoda();
    setupPhoto();
    const refreshBtn = document.getElementById('dashRefresh');
    if (refreshBtn) refreshBtn.addEventListener('click', function () {
      try { Store.refresh(); } catch (e) {}
      renderDashboard();
      if (window.BucketList && window.BucketList.render) window.BucketList.render();
      if (window.MemoryCalendar && window.MemoryCalendar.render) window.MemoryCalendar.render();
      toast('🔄 Янгиланди');
    });
    Store.setAuthHandler(showLogin); // sessiya tugasa login ekranига qaytamiz
    window.PJ = {
      setShart: function (t) { Store.setShart(t); },
      getMemories: function () { return Store.getMemories(); },
      addMemory: function (k, e) { Store.addMemory(k, e); },
      updateMemory: function (k, id, f) { Store.updateMemory(k, id, f); },
      deleteMemory: function (k, id) { Store.deleteMemory(k, id); },
      getBucket: function () { return Store.getBucket(); },
      addBucket: function (it) { Store.addBucket(it); },
      updateBucket: function (id, f) { Store.updateBucket(id, f); },
      deleteBucket: function (id) { Store.deleteBucket(id); },
      getChat: function () { return Store.getChat(); },
      addChat: function (m) { Store.addChat(m); },
      deleteChat: function (id) { Store.deleteChat(id); },
      clearChat: function () { Store.clearChat(); },
      onUpdate: function (fn) { Store.onUpdate(fn); },
      uploadLocalToCloud: function () { return Store.forceUpload(); },
      restoreToCloud: function () { return Store.restoreToCloud(); },
      mode: function () { return Store.mode; },
      currentUser: function () { return currentUserObj ? currentUserObj.display : ''; },
    };
    checkSession();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
