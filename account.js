/* ============================================================
   Parizoda — login + 2 sahifa + sinxron javob/rasm
   Saqlash: SERVER (FastAPI + PostgreSQL). Ma'lumot serverdagi bazada;
   o'zgarish SSE (/api/events) orqali ikkala qurilmada DARHOL ko'rinadi.
   localStorage faqat tezkor ko'rsatish (kesh) uchun ishlatiladi.
   ============================================================ */
(function () {
  const LS_SESSION = 'pj_session';

  const USERS = {
    parizoda: { pw: 'parizodam', view: 'parizoda' },
    jaxongir: { pw: 'parizodam', view: 'jaxongir' },
  };

  /* ---------- STORE: server (FastAPI + PostgreSQL) + SSE real-time ---------- */
  const Store = (function () {
    const BLANK = { lovePercent: null, madeUp: false, madeUpAt: null, photo: null, shart: null, shartAt: null, memories: {}, bucket: [], chat: [], updatedAt: null };
    let data = Object.assign({}, BLANK, { memories: {}, bucket: [], chat: [] });
    let cb = null;
    const mode = 'server';
    const LS = 'pj_answers';                 // mahalliy kesh (tezkor ko'rsatish + offline ko'rinish)
    const listeners = [];
    const API = (window.PARI_API_BASE || '');
    const TOKEN = (window.PARI_API_TOKEN || '');

    function readLS() { try { return JSON.parse(localStorage.getItem(LS) || 'null') || {}; } catch (e) { return {}; } }
    function writeLS() { try { localStorage.setItem(LS, JSON.stringify(data)); } catch (e) { try { toast('Сақлаб бўлмади — хотира тўлди'); } catch (e2) {} } }
    function normalize() { if (!data.memories || typeof data.memories !== 'object') data.memories = {}; if (!Array.isArray(data.bucket)) data.bucket = []; if (!Array.isArray(data.chat)) data.chat = []; }
    function emit() { normalize(); if (cb) cb(data); for (var i = 0; i < listeners.length; i++) { try { listeners[i](data); } catch (e) {} } }
    function toastSafe(msg) { try { toast(msg || 'Серверга сақланмади — интернетни текширинг'); } catch (e) {} }

    function apiGet(path) {
      return fetch(API + path, { headers: { 'Accept': 'application/json' } })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
    }
    function apiSend(method, path, body) {
      return fetch(API + path, {
        method: method,
        headers: { 'Content-Type': 'application/json', 'X-Auth': TOKEN },
        body: body ? JSON.stringify(body) : undefined,
      }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json().catch(function () { return {}; }); });
    }

    function setServerState(s) {
      data = Object.assign({}, BLANK, s);
      normalize();
      writeLS();          // keshni yangilab boramiz
      emit();
    }
    function refresh() {
      return apiGet('/api/state').then(setServerState).catch(function (e) { console.warn('state load xato:', e && e.message); });
    }

    // --- real-time: SSE (server push) + xavfsizlik uchun kam-chastotali version-poll ---
    var es = null, pollTimer = null;
    function connectSSE() {
      try {
        es = new EventSource(API + '/api/events');
        es.addEventListener('update', function () { refresh(); });
        // EventSource xato bo'lsa o'zi qayta ulanadi — alohida ishlov shart emas.
      } catch (e) { /* brauzer SSE'ni qo'llamasa — quyidagi poll qoplaydi */ }
      clearInterval(pollTimer);
      pollTimer = setInterval(function () {
        apiGet('/api/version').then(function (v) {
          if (v && v.updatedAt && v.updatedAt !== data.updatedAt) refresh();
        }).catch(function () {});
      }, 20000);
    }

    function init(onChange) {
      cb = onChange;
      // 1) keshdan darhol ko'rsatamiz (instant paint)
      data = Object.assign({}, BLANK, readLS()); normalize(); setTimeout(emit, 0);
      // 2) serverdan haqiqiy holat
      refresh();
      // 3) real-time ulanish
      connectSSE();
      console.log('%cParizoda: server rejimi (FastAPI + PostgreSQL) 💗', 'color:#D6537E');
    }

    // To'liq ma'lumotni serverga yozish (restore / seed) — avtoritar (o'chirishlar ham).
    function pushAll(obj) {
      var payload = obj || readLS();
      return apiSend('POST', '/api/restore', payload).then(function () { return true; })
        .catch(function (e) { console.warn('restore xato:', e && e.message); return false; });
    }

    function patch(p) {
      data = Object.assign({}, data, p, { updatedAt: Date.now() }); normalize(); writeLS(); emit(); // optimistik
      apiSend('PATCH', '/api/main', p).catch(function (e) { console.warn('saqlashda xato:', e && e.message); toastSafe(); });
    }

    // ---------- xotiralar ----------
    function addMemory(dateKey, entry) {
      normalize();
      if (!data.memories[dateKey]) data.memories[dateKey] = [];
      data.memories[dateKey].push(entry); writeLS(); emit();
      apiSend('POST', '/api/memory', Object.assign({ dateKey: dateKey }, entry))
        .catch(function (e) { console.warn('xotira saqlash xato:', e && e.message); toastSafe(); });
    }
    function updateMemory(dateKey, id, fields) {
      normalize();
      var arr = data.memories[dateKey]; if (!arr) return;
      var merged = null;
      for (var i = 0; i < arr.length; i++) if (arr[i].id === id) { arr[i] = Object.assign({}, arr[i], fields); merged = arr[i]; break; }
      writeLS(); emit();
      if (merged) apiSend('POST', '/api/memory', Object.assign({ dateKey: dateKey }, merged))
        .catch(function (e) { console.warn('xotira yangilash xato:', e && e.message); toastSafe(); });
    }
    function deleteMemory(dateKey, id) {
      normalize();
      var arr = data.memories[dateKey]; if (!arr) return;
      data.memories[dateKey] = arr.filter(function (e) { return e.id !== id; });
      if (data.memories[dateKey].length === 0) delete data.memories[dateKey];
      writeLS(); emit();
      apiSend('DELETE', '/api/memory/' + encodeURIComponent(id))
        .catch(function (e) { console.warn('xotira ochirish xato:', e && e.message); toastSafe(); });
    }

    // ---------- orzular (bucket) ----------
    function saveBucket() {
      writeLS(); emit();
      apiSend('PUT', '/api/bucket', { bucket: data.bucket })
        .catch(function (e) { console.warn('orzu saqlash xato:', e && e.message); toastSafe(); });
    }
    function addBucket(item) { normalize(); data.bucket.push(item); saveBucket(); }
    function updateBucket(id, fields) {
      normalize();
      for (var i = 0; i < data.bucket.length; i++) if (data.bucket[i].id === id) { data.bucket[i] = Object.assign({}, data.bucket[i], fields); break; }
      saveBucket();
    }
    function deleteBucket(id) { normalize(); data.bucket = data.bucket.filter(function (b) { return b.id !== id; }); saveBucket(); }

    // ---------- maxfiy chat ----------
    function addChat(msg) {
      normalize(); data.chat.push(msg); writeLS(); emit();
      apiSend('POST', '/api/chat', msg).catch(function (e) { console.warn('chat saqlash xato:', e && e.message); toastSafe(); });
    }
    function deleteChat(id) {
      normalize(); data.chat = data.chat.filter(function (m) { return m.id !== id; }); writeLS(); emit();
      apiSend('DELETE', '/api/chat/' + encodeURIComponent(id)).catch(function (e) { console.warn('chat ochirish xato:', e && e.message); });
    }
    function clearChat() {
      normalize(); data.chat = []; writeLS(); emit();
      apiSend('POST', '/api/chat/clear').catch(function (e) { console.warn('chat tozalash xato:', e && e.message); });
    }

    // server rejimida "qayta yuklash" = serverdan yangilash
    function reloadLS() { refresh(); return true; }

    return {
      init: init,
      reloadLS: reloadLS,
      forceUpload: function () { return pushAll(readLS()); },   // keshni serverga (avtoritar)
      restoreToCloud: function () { return pushAll(readLS()); },
      pushAll: pushAll,
      refresh: refresh,
      get: function () { return data; },
      setAnswer: function (a) { patch(a); },
      setPhoto: function (url) { patch({ photo: url }); },
      setShart: function (text) { patch({ shart: text, shartAt: Date.now() }); },
      getMemories: function () { normalize(); return data.memories; },
      addMemory: addMemory,
      updateMemory: updateMemory,
      deleteMemory: deleteMemory,
      getBucket: function () { normalize(); return data.bucket; },
      addBucket: addBucket,
      updateBucket: updateBucket,
      deleteBucket: deleteBucket,
      getChat: function () { normalize(); return data.chat; },
      addChat: addChat,
      deleteChat: deleteChat,
      clearChat: clearChat,
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
  function logout() {
    localStorage.removeItem(LS_SESSION);
    document.body.classList.remove('as-parizoda', 'as-jaxongir');
    document.body.classList.add('locked');
    const f = document.getElementById('loginForm'); if (f) f.reset();
    window.scrollTo(0, 0);
  }

  /* ---------- login ---------- */
  function setupLogin() {
    const form = document.getElementById('loginForm');
    const err = document.getElementById('loginErr');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const u = (document.getElementById('loginUser').value || '').trim().toLowerCase();
      const p = (document.getElementById('loginPass').value || '').trim();
      const rec = USERS[u];
      if (rec && rec.pw === p) {
        err.classList.remove('show');
        localStorage.setItem(LS_SESSION, u);
        applyView(rec.view);
      } else {
        err.classList.add('show');
        form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
      }
    });
    document.querySelectorAll('[data-logout]').forEach(function (b) { b.addEventListener('click', logout); });
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
  // Tarmoq/saqlash uchun rasmni oqilona o'lchamga (~700KB) keltiramiz.
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
    const refresh = document.getElementById('dashRefresh');
    if (refresh) refresh.addEventListener('click', function () {
      try { Store.refresh(); } catch (e) {}
      renderDashboard();
      if (window.BucketList && window.BucketList.render) window.BucketList.render();
      if (window.MemoryCalendar && window.MemoryCalendar.render) window.MemoryCalendar.render();
      toast('🔄 Янгиланди');
    });
    Store.init(onData);
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
      currentUser: function () {
        if (document.body.classList.contains('as-jaxongir')) return 'Жаҳонгир';
        if (document.body.classList.contains('as-parizoda')) return 'Паризода';
        return '';
      },
    };
    if (window.MemoryCalendar && typeof window.MemoryCalendar.boot === 'function') window.MemoryCalendar.boot();
    const sess = localStorage.getItem(LS_SESSION);
    if (sess && USERS[sess]) applyView(USERS[sess].view);
    else document.body.classList.add('locked');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
