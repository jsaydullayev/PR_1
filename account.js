/* ============================================================
   Parizoda — login + 2 sahifa + sinxron javob/rasm
   Saqlash: Firebase Firestore (config to'ldirilgan bo'lsa) yoki
   localStorage (zaxira). Firebase'da javob va rasm ikkala
   qurilmada real-vaqtda sinxron ko'rinadi.
   ============================================================ */
(function () {
  const LS_SESSION = 'pj_session';

  const USERS = {
    parizoda: { pw: 'parizodam', view: 'parizoda' },
    jaxongir: { pw: 'parizodam', view: 'jaxongir' },
  };

  /* ---------- STORE: Firebase yoki localStorage ---------- */
  const Store = (function () {
    const BLANK = { lovePercent: null, madeUp: false, madeUpAt: null, photo: null, shart: null, shartAt: null, memories: {}, bucket: [], chat: [], updatedAt: null };
    let data = Object.assign({}, BLANK, { memories: {}, bucket: [], chat: [] });
    let cb = null;
    let mode = 'local';
    let fbRef = null;
    let memCol = null, chatCol = null;   // Firestore subkolleksiyalar (1 MiB limitni chetlab o'tish uchun)
    let mainSeen = false, migrated = false;
    // XAVFSIZLIK: remote -> localStorage ko'zgu faqat migratsiya hal bo'lgach yoqiladi,
    // aks holda bo'sh remote birinchi snapshotda localStorage tarixini o'chirib yuboradi.
    let lsMirrorReady = false;
    let lsCorrupt = false;   // pj_answers buzilgan bo'lsa — ko'zgu/migratsiya to'xtaydi (xom nusxa saqlanadi)
    const LS = 'pj_answers';
    const MIGR_FLAG = 'pj_fb_migrated';
    const listeners = [];

    function readLS() {
      var raw = null;
      try { raw = localStorage.getItem(LS); } catch (e) { return {}; }
      if (!raw) return {};
      try { return JSON.parse(raw) || {}; }
      catch (e) {
        lsCorrupt = true;
        try { if (!localStorage.getItem('pj_answers_corrupt')) localStorage.setItem('pj_answers_corrupt', raw); } catch (e2) {}
        console.warn('pj_answers buzilgan — xom nusxa pj_answers_corrupt ga saqlandi');
        return {};
      }
    }
    function writeLS() {
      // XAVFSIZLIK: firebase rejimida migratsiya tasdiqlanguncha localStorage'ga TEGMAYMIZ
      // (bo'sh/qisman in-memory data tarixni o'chirib yubormasligi uchun).
      if (mode === 'firebase' && !lsMirrorReady) return;
      try { localStorage.setItem(LS, JSON.stringify(data)); }
      catch (e) {
        try { if (typeof toast === 'function') toast('Сақлаб бўлмади — хотира тўлди'); } catch (e2) {}
        console.warn('writeLS xato:', e && e.name);
      }
    }
    function normalize() { if (!data.memories || typeof data.memories !== 'object') data.memories = {}; if (!Array.isArray(data.bucket)) data.bucket = []; if (!Array.isArray(data.chat)) data.chat = []; }
    function emit() { normalize(); if (cb) cb(data); for (var i = 0; i < listeners.length; i++) { try { listeners[i](data); } catch (e) {} } }

    // Migratsiyadan oldin remote snapshot seed (localStorage) ustiga yozilmasligi uchun union:
    // id bo'yicha birlashtiramiz, 'at' kattasi (yangirog'i) yutadi. Hech narsa yo'qolmaydi.
    function unionMemories(a, b) {
      const byId = {};
      function add(map) {
        Object.keys(map || {}).forEach(function (k) {
          (map[k] || []).forEach(function (e) {
            if (!e) return;
            const id = e.id ? String(e.id) : ('x_' + k + '_' + (e.at || 0));
            const prev = byId[id];
            if (!prev || (e.at || 0) >= (prev.e.at || 0)) byId[id] = { k: k, e: e };
          });
        });
      }
      add(a); add(b);
      const out = {};
      Object.keys(byId).forEach(function (id) { var x = byId[id]; (out[x.k] = out[x.k] || []).push(x.e); });
      return out;
    }
    function unionChat(a, b) {
      const byId = {};
      (a || []).concat(b || []).forEach(function (m) {
        if (!m) return;
        const id = m.id ? String(m.id) : ('x_' + (m.at || 0));
        const prev = byId[id];
        if (!prev || (m.at || 0) >= (prev.at || 0)) byId[id] = m;
      });
      return Object.keys(byId).map(function (id) { return byId[id]; }).sort(function (x, y) { return (x.at || 0) - (y.at || 0); });
    }

    // Firebase main hujjatdan FAQAT skalyar maydonlar; memories/chat subkolleksiyalardan keladi (1 MiB limit uchun).
    function applyMain(v) {
      data.lovePercent = (v.lovePercent != null) ? v.lovePercent : null;
      data.madeUp = !!v.madeUp;
      data.madeUpAt = (v.madeUpAt != null) ? v.madeUpAt : null;
      data.photo = (v.photo != null) ? v.photo : null;
      data.shart = (v.shart != null) ? v.shart : null;
      data.shartAt = (v.shartAt != null) ? v.shartAt : null;
      data.bucket = Array.isArray(v.bucket) ? v.bucket : [];
      if (v.updatedAt != null) data.updatedAt = v.updatedAt;
    }

    function init(onChange) {
      cb = onChange;
      const cfg = window.FIREBASE_CONFIG || {};
      const ready = cfg.apiKey && cfg.apiKey.length > 10 && window.firebase && firebase.firestore;
      if (ready) {
        try {
          if (!firebase.apps.length) firebase.initializeApp(cfg);
          const d = window.COUPLE_DOC || { collection: 'couple', id: 'us' };
          fbRef = firebase.firestore().collection(d.collection).doc(d.id);
          memCol = fbRef.collection('memories');
          chatCol = fbRef.collection('chat');
          mode = 'firebase';
          // Darhol mavjud (localStorage) ma'lumotni ko'rsatamiz; snapshot keyin aniqlashtiradi.
          data = Object.assign({}, BLANK, readLS()); normalize();
          // 1) asosiy hujjat \u2014 skalyar maydonlar + asosiy rasm + bucket
          fbRef.onSnapshot(function (snap) {
            var remoteMain = snap.exists ? snap.data() : null;
            if (!mainSeen) { mainSeen = true; maybeMigrate(remoteMain); }
            // Bo'sh remote'ni (migratsiyadan oldin) seed ma'lumot ustiga yozmaymiz.
            if (remoteMain || lsMirrorReady) applyMain(remoteMain || {});
            writeLS(); emit(); // writeLS o'zi gated (migratsiyadan oldin yozmaydi)
          }, function (err) { console.warn('Firestore main xato:', err && err.code); });

          // 2) memories subkolleksiya \u2014 har xotira alohida hujjat
          memCol.onSnapshot(function (qs) {
            const map = {};
            var maxAt = 0;
            qs.forEach(function (doc) {
              const e = doc.data() || {};
              const k = e.dateKey || '0000-00-00';
              if ((e.at || 0) > maxAt) maxAt = e.at || 0;
              (map[k] = map[k] || []).push({
                id: e.id || doc.id, text: e.text || '', photo: e.photo || null,
                author: e.author || '', at: e.at || 0,
              });
            });
            // Migratsiya tasdiqlangach remote = haqiqat; undan oldin seed'ni saqlab union qilamiz.
            data.memories = lsMirrorReady ? map : unionMemories(data.memories, map);
            if (maxAt > (data.updatedAt || 0)) data.updatedAt = maxAt;
            writeLS(); emit();
          }, function (err) { console.warn('Firestore memories xato:', err && err.code); });

          // 3) chat subkolleksiya \u2014 har xabar alohida hujjat
          chatCol.onSnapshot(function (qs) {
            const arr = [];
            var maxAt = 0;
            qs.forEach(function (doc) { var m = doc.data() || {}; m.id = m.id || doc.id; if ((m.at || 0) > maxAt) maxAt = m.at || 0; arr.push(m); });
            arr.sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
            data.chat = lsMirrorReady ? arr : unionChat(data.chat, arr);
            if (maxAt > (data.updatedAt || 0)) data.updatedAt = maxAt;
            writeLS(); emit();
          }, function (err) { console.warn('Firestore chat xato:', err && err.code); });
          console.log('%cParizoda: Firebase rejimi yoqildi 💗', 'color:#D6537E');
        } catch (e) { console.warn('Firebase init xato, localStorage rejimi:', e); mode = 'local'; }
      }
      if (mode === 'local') {
        data = Object.assign({}, BLANK, readLS());
        window.addEventListener('storage', function (e) { if (e.key === LS) { data = Object.assign({}, BLANK, readLS()); emit(); } });
        setTimeout(emit, 0);
      }
    }

    // ---------- migratsiya: localStorage -> Firebase (union-merge, qurilmaga bir marta) ----------
    // Local ma'lumot Firebase'ga qo'shiladi (id bo'yicha union — hech narsa o'chmaydi).
    // localStorage faqat remote to'la bo'lgach ko'zgu qilinadi; HECH QACHON bo'sh remote bilan o'chmaydi.
    function maybeMigrate(remoteMain) {
      if (migrated) return;
      migrated = true;
      if (lsCorrupt) { console.warn('localStorage buzilgan — migratsiya/ko\'zgu to\'xtatildi (xom nusxa saqlandi)'); return; }
      var already = false; try { already = !!localStorage.getItem(MIGR_FLAG); } catch (e) {}
      const ls = readLS(); // localStorage hali butun (writeLS gate bilan to'xtatilgan)
      const hasLocal = ls && (ls.updatedAt || ls.photo || ls.shart || ls.lovePercent != null ||
        (ls.memories && Object.keys(ls.memories).length) || (ls.chat && ls.chat.length) || (ls.bucket && ls.bucket.length));
      // Bu qurilmada allaqachon yuklangan, YOKI yuklaydigan local ma'lumot yo'q -> remote'ni qabul qilamiz.
      if (already || !hasLocal) {
        lsMirrorReady = true;
        if (remoteMain) { try { localStorage.setItem(MIGR_FLAG, '1'); } catch (e) {} }
        return;
      }
      // Local ma'lumot bor va bu qurilmada hali yuklanmagan -> additiv union-merge.
      // Tartibdan qat'i nazar hech qaysi tomon ma'lumoti yo'qolmaydi (skalyarlar newest-wins).
      uploadAll(ls, remoteMain); // muvaffaqiyatdan keyin lsMirrorReady = true va MIGR_FLAG = 1
    }

    // localStorage'dagi ma'lumotni Firebase'ga ADDITIV yuklash. Skalyarlar: bo'sh qiymat bilan
    // remote'ni o'chirmaymiz va eski local yangi remote'ni bosmaydi. memories/chat: merge (union).
    function uploadAll(ls, remoteMain) {
      if (mode !== 'firebase' || !fbRef) return Promise.resolve(false);
      try {
        const batch = firebase.firestore().batch();
        const remoteNewer = remoteMain && (remoteMain.updatedAt || 0) > (ls.updatedAt || 0);
        if (!remoteNewer) {
          var mainOut = {};
          if (ls.lovePercent != null) mainOut.lovePercent = ls.lovePercent;
          if (ls.madeUp) { mainOut.madeUp = true; if (ls.madeUpAt) mainOut.madeUpAt = ls.madeUpAt; }
          if (ls.photo) mainOut.photo = ls.photo;
          if (ls.shart) { mainOut.shart = ls.shart; if (ls.shartAt) mainOut.shartAt = ls.shartAt; }
          if (Array.isArray(ls.bucket) && ls.bucket.length) mainOut.bucket = ls.bucket;
          mainOut.updatedAt = ls.updatedAt || Date.now();
          batch.set(fbRef, mainOut, { merge: true });
        }
        const mem = ls.memories || {};
        Object.keys(mem).forEach(function (k) {
          (mem[k] || []).forEach(function (e) {
            if (!e || !e.id) return;
            batch.set(memCol.doc(String(e.id)), {
              dateKey: k, id: e.id, text: e.text || '', photo: e.photo || null,
              author: e.author || '', at: e.at || 0,
            }, { merge: true });
          });
        });
        (ls.chat || []).forEach(function (m) { if (m && m.id) batch.set(chatCol.doc(String(m.id)), m, { merge: true }); });
        return batch.commit().then(function () {
          try { localStorage.setItem(MIGR_FLAG, '1'); } catch (e) {}
          lsMirrorReady = true; // endi remote to'la — localStorage'ni ko'zgu qilsa xavfsiz
          console.log('%cParizoda: localStorage -> Firebase migratsiya bajarildi', 'color:#1a9');
          return true;
        }).catch(function (e) {
          migrated = false; // qayta urinishga ruxsat (boshqa marta init bo'lganda)
          // UI bo'sh qolmasin: in-memory'ni localStorage'dan qayta tiklaymiz. Ko'zgu yopiq qoladi -> LS xavfsiz.
          data = Object.assign({}, BLANK, readLS()); normalize(); emit();
          console.warn('Migratsiya xato (localStorage saqlanib qoldi):', e && e.code);
          return false;
        });
      } catch (e) {
        migrated = false;
        data = Object.assign({}, BLANK, readLS()); normalize(); emit();
        console.warn('Migratsiya xato:', e);
        return Promise.resolve(false);
      }
    }
    function forceUpload() { return uploadAll(readLS(), null); }

    // RESTORE: bulutni localStorage nusxasiga TENGLASHTIRADI — backup'da yo'q hujjatlar O'CHIRILADI.
    // (Oddiy uploadAll faqat qo'shadi; restore esa avtoritar — o'chirishlar ham ko'chsin.)
    function restoreToCloud(ls) {
      if (mode !== 'firebase' || !fbRef) return Promise.resolve(false);
      ls = ls || readLS();
      var memIds = {}, chatIds = {};
      var mem = ls.memories || {};
      Object.keys(mem).forEach(function (k) { (mem[k] || []).forEach(function (e) { if (e && e.id) memIds[String(e.id)] = true; }); });
      (ls.chat || []).forEach(function (m) { if (m && m.id) chatIds[String(m.id)] = true; });
      return Promise.all([memCol.get(), chatCol.get()]).then(function (snaps) {
        var batch = firebase.firestore().batch();
        batch.set(fbRef, {
          lovePercent: ls.lovePercent != null ? ls.lovePercent : null,
          madeUp: !!ls.madeUp, madeUpAt: ls.madeUpAt || null,
          photo: ls.photo || null, shart: ls.shart || null, shartAt: ls.shartAt || null,
          bucket: Array.isArray(ls.bucket) ? ls.bucket : [],
          updatedAt: ls.updatedAt || Date.now(),
        }, { merge: true });
        snaps[0].forEach(function (doc) { if (!memIds[doc.id]) batch.delete(doc.ref); });
        snaps[1].forEach(function (doc) { if (!chatIds[doc.id]) batch.delete(doc.ref); });
        Object.keys(mem).forEach(function (k) {
          (mem[k] || []).forEach(function (e) {
            if (!e || !e.id) return;
            batch.set(memCol.doc(String(e.id)), { dateKey: k, id: e.id, text: e.text || '', photo: e.photo || null, author: e.author || '', at: e.at || 0 });
          });
        });
        (ls.chat || []).forEach(function (m) { if (m && m.id) batch.set(chatCol.doc(String(m.id)), m); });
        return batch.commit();
      }).then(function () {
        try { localStorage.setItem(MIGR_FLAG, '1'); } catch (e) {}
        lsMirrorReady = true;
        return true;
      }).catch(function (e) { console.warn('Restore (cloud) xato:', e && e.code); return false; });
    }

    function patch(p) {
      const stamp = Date.now();
      data = Object.assign({}, data, p, { updatedAt: stamp });
      normalize();
      if (mode === 'firebase' && fbRef) {
        var out = {}; for (var k in p) if (p.hasOwnProperty(k)) out[k] = p[k];
        out.updatedAt = stamp;
        fbRef.set(out, { merge: true }).catch(function (e) { console.warn('Saqlashda xato:', e && e.code); });
        writeLS(); // localStorage'ni ham yangilab boramiz (zaxira)
        // onSnapshot keyin yangilangan data bilan emit qiladi
      } else {
        writeLS(); emit();
      }
    }

    // ---------- xotiralar (memories subkolleksiya — har biri alohida hujjat) ----------
    function addMemory(dateKey, entry) {
      normalize();
      if (!data.memories[dateKey]) data.memories[dateKey] = [];
      data.memories[dateKey].push(entry);
      data.updatedAt = Date.now(); writeLS();
      if (mode === 'firebase' && memCol) {
        memCol.doc(String(entry.id)).set({
          dateKey: dateKey, id: entry.id, text: entry.text || '', photo: entry.photo || null,
          author: entry.author || '', at: entry.at || 0,
        }).catch(function (e) { console.warn('Xotira saqlashda xato:', e && e.code); });
      }
      emit();
    }
    function updateMemory(dateKey, id, fields) {
      normalize();
      var arr = data.memories[dateKey]; if (!arr) return;
      for (var i = 0; i < arr.length; i++) if (arr[i].id === id) { arr[i] = Object.assign({}, arr[i], fields); break; }
      data.updatedAt = Date.now(); writeLS();
      if (mode === 'firebase' && memCol) {
        memCol.doc(String(id)).set(Object.assign({ dateKey: dateKey, id: id }, fields), { merge: true }).catch(function (e) { console.warn('Xotira yangilashda xato:', e && e.code); });
      }
      emit();
    }
    function deleteMemory(dateKey, id) {
      normalize();
      var arr = data.memories[dateKey]; if (!arr) return;
      data.memories[dateKey] = arr.filter(function (e) { return e.id !== id; });
      if (data.memories[dateKey].length === 0) delete data.memories[dateKey];
      data.updatedAt = Date.now(); writeLS();
      if (mode === 'firebase' && memCol) {
        memCol.doc(String(id)).delete().catch(function (e) { console.warn('Xotira ochirishda xato:', e && e.code); });
      }
      emit();
    }

    // ---------- orzular ro'yxati (bucket) ----------
    function saveBucket() {
      const stamp = Date.now();
      data.updatedAt = stamp;
      writeLS();
      if (mode === 'firebase' && fbRef) {
        fbRef.set({ bucket: data.bucket, updatedAt: stamp }, { merge: true })
          .catch(function (e) { console.warn('Orzu saqlashda xato:', e && e.code); });
        emit();
      } else { emit(); }
    }
    function addBucket(item) { normalize(); data.bucket.push(item); saveBucket(); }
    function updateBucket(id, fields) {
      normalize();
      for (var i = 0; i < data.bucket.length; i++) if (data.bucket[i].id === id) { data.bucket[i] = Object.assign({}, data.bucket[i], fields); break; }
      saveBucket();
    }
    function deleteBucket(id) { normalize(); data.bucket = data.bucket.filter(function (b) { return b.id !== id; }); saveBucket(); }

    // ---------- maxfiy chat (chat subkolleksiya — har xabar alohida hujjat) ----------
    function addChat(msg) {
      normalize();
      data.chat.push(msg);
      data.updatedAt = Date.now(); writeLS();
      if (mode === 'firebase' && chatCol) {
        chatCol.doc(String(msg.id)).set(msg).catch(function (e) { console.warn('Chat saqlashda xato:', e && e.code); });
      }
      emit();
    }
    function deleteChat(id) {
      normalize();
      data.chat = data.chat.filter(function (m) { return m.id !== id; });
      data.updatedAt = Date.now(); writeLS();
      if (mode === 'firebase' && chatCol) {
        chatCol.doc(String(id)).delete().catch(function (e) { console.warn('Chat ochirishda xato:', e && e.code); });
      }
      emit();
    }
    function clearChat() {
      normalize();
      var ids = data.chat.map(function (m) { return m.id; });
      data.chat = [];
      data.updatedAt = Date.now(); writeLS();
      if (mode === 'firebase' && chatCol) {
        var batch = firebase.firestore().batch();
        ids.forEach(function (id) { if (id) batch.delete(chatCol.doc(String(id))); });
        batch.commit().catch(function (e) { console.warn('Chat tozalashda xato:', e && e.code); });
      }
      emit();
    }

    function reloadLS() {
      if (mode !== 'local') return false;
      const fresh = readLS();
      if (fresh && fresh.updatedAt && fresh.updatedAt !== data.updatedAt) {
        data = Object.assign({}, BLANK, fresh);
        emit();
        return true;
      }
      return false;
    }

    return {
      init: init,
      reloadLS: reloadLS,
      forceUpload: forceUpload,       // localStorage -> Firebase ADDITIV yuklash (promise)
      restoreToCloud: restoreToCloud, // localStorage -> Firebase AVTORITAR (o'chirishlar bilan, promise)
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
        toast('\ud83d\udc8c \u0416\u0430\u04b3\u043e\u043d\u0433\u0438\u0440\u0433\u0430 \u044e\u0431\u043e\u0440\u0438\u043b\u0434\u0438');
      });
    }
    const yes = document.getElementById('btnYes');
    if (yes) {
      yes.addEventListener('click', function () {
        const r = document.getElementById('loveRange');
        const cur = Store.get().lovePercent;
        Store.setAnswer({ madeUp: true, madeUpAt: Date.now(), lovePercent: (cur == null && r) ? +r.value : cur });
        toast('\ud83e\udd0d \u0416\u0430\u04b3\u043e\u043d\u0433\u0438\u0440\u0433\u0430 \u0435\u0442\u043a\u0430\u0437\u0438\u043b\u0434\u0438');
      });
    }
  }

  /* ---------- shared rasm (Firebase-sinxron) ---------- */
  function encodeBitmap(bmp, max, q) {
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    return c.toDataURL('image/jpeg', q);
  }
  // Firestore hujjati 1 MiB bilan cheklangan -> rasmni budjetga sig'guncha kichraytiramiz.
  async function compressImage(file, budget) {
    budget = budget || 700 * 1024; // asosiy rasm uchun ~700KB (skalyar/bucket'ga joy qoldiramiz)
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
        toast('\u23f3 \u0420\u0430\u0441\u043c \u044e\u043a\u043b\u0430\u043d\u043c\u043e\u049b\u0434\u0430...');
        const url = await compressImage(f);
        Store.setPhoto(url);
        toast('\ud83d\udc97 \u0420\u0430\u0441\u043c \u0441\u0430\u049b\u043b\u0430\u043d\u0434\u0438');
      } catch (e) { toast('\u0420\u0430\u0441\u043c\u043d\u0438 \u045e\u049b\u0438\u0431 \u0431\u045e\u043b\u043c\u0430\u0434\u0438 \ud83e\udd7a'); }
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
      big.textContent = '\u2014';
      fill.style.width = '0%';
      sub.textContent = '\u041f\u0430\u0440\u0438\u0437\u043e\u0434\u0430 \u04b3\u0430\u043b\u0438 \u0436\u0430\u0432\u043e\u0431 \u0431\u0435\u0440\u043c\u0430\u0433\u0430\u043d. \u0423 \u045e\u0437 \u0441\u0430\u04b3\u0438\u0444\u0430\u0441\u0438\u0434\u0430 \u0441\u0435\u0432\u0433\u0438 \u045e\u043b\u0447\u0430\u0433\u0438\u0447\u043d\u0438 \u0441\u0443\u0440\u0433\u0430\u043d\u0434\u0430, \u0436\u0430\u0432\u043e\u0431\u0438 \u0448\u0443 \u0435\u0440\u0434\u0430 \u043f\u0430\u0439\u0434\u043e \u0431\u045e\u043b\u0430\u0434\u0438.';
    } else {
      big.textContent = isInf ? '\u221e' : pct + '%';
      fill.style.width = (isInf ? 100 : pct) + '%';
      let line;
      if (isInf) line = '\u0427\u0435\u043a\u0441\u0438\u0437. \u0421\u0435\u0432\u0433\u0438\u0441\u0438\u043d\u0438\u043d\u0433 \u0447\u0435\u0433\u0430\u0440\u0430\u0441\u0438 \u0439\u045e\u049b.';
      else if (pct >= 85) line = 'Сизни чиндан қаттиқ севади.';
      else if (pct >= 55) line = 'Юраги сизники — бу аниқ.';
      else if (pct >= 25) line = 'Севади — бугун бир оз эътибор кутаётгандек.';
      else line = 'Бугун кўнглига яқинроқ бўлинг — кичик эътибор катта иш қилади.';
      sub.textContent = line;
    }
    if (made) {
      if (d.madeUp) {
        made.className = 'dash-status ok';
        made.innerHTML = '<span class="ds-ico">\ud83e\udd0d</span> \u041f\u0430\u0440\u0438\u0437\u043e\u0434\u0430 \u044f\u0440\u0430\u0448\u0434\u0438!' + (d.madeUpAt ? ' <span class="ds-time">' + fmtTime(d.madeUpAt) + '</span>' : '');
      } else {
        made.className = 'dash-status wait';
        made.innerHTML = '<span class="ds-ico">\u231b</span> \u04b3\u0430\u043b\u0438 \u0436\u0430\u0432\u043e\u0431 \u043a\u0443\u0442\u0438\u043b\u043c\u043e\u049b\u0434\u0430';
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
    upd.textContent = d.updatedAt ? ('\u043e\u0445\u0438\u0440\u0433\u0438 \u044f\u043d\u0433\u0438\u043b\u0430\u043d\u0438\u0448: ' + fmtTime(d.updatedAt)) : '';
  }
  function startDashPoll() {
    // Firebase rejimida onSnapshot real-vaqtda yangilaydi; localStorage
    // rejimida boshqa qurilmadan o'qish uchun davriy yangilab turamiz.
    clearTimeout(dashTimer);
    if (Store.mode === 'firebase') return;
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
      try { Store.reloadLS(); } catch (e) {}
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
      uploadLocalToCloud: function () { return Store.forceUpload(); },   // additiv (promise)
      restoreToCloud: function () { return Store.restoreToCloud(); },    // avtoritar restore (promise)
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
