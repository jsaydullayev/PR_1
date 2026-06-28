/* ============================================================
   backup.js — ma'lumotni eksport/import + Telegram bot orqali yuborish
   ------------------------------------------------------------
   localStorage'ni FAQAT O'QIYDI. "Restore" (import) — tasdiqdan keyin — yozadi.
   "Send" — faylni Telegram bot orqali beradigan chat'ga yuboradi.
   Bot token + chat id KODDA TURMAYDI — havola orqali beriladi:
     ...?backup&tg_token=<TOKEN>&tg_chat=<CHATID>[&tg_auto=1]
   ============================================================ */
(function () {
  'use strict';

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  // To'liq, o'qiladigan JSON
  function buildBackupObject() {
    var answersRaw = lsGet('pj_answers');
    var data = null;
    try { data = JSON.parse(answersRaw || 'null'); } catch (e) { data = answersRaw; }
    var meta = {};
    var t = lsGet('pj_theme'); if (t) meta.pj_theme = t;
    var c = lsGet('pj_chat_seen'); if (c) meta.pj_chat_seen = c;
    return { _app: 'parizoda', _backup_version: 2, exportedAt: new Date().toISOString(), data: data, meta: meta };
  }
  function toJSON() { return JSON.stringify(buildBackupObject(), null, 2); }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function stamp() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes());
  }
  function fileName() { return 'backup-' + stamp() + '.json'; }

  // ---------- URL parametrlari (token/chat shu yerdan) ----------
  function getParam(name) {
    var hash = (location.hash || '');
    var src = (location.search || '') + '&' + (hash.indexOf('=') >= 0 ? hash.replace(/^#/, '&') : '');
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(src);
    return m ? decodeURIComponent(m[1]) : '';
  }
  // Telegram token/chat KODDA TURMAYDI (xavfsizlik). Faqat havola orqali beriladi:
  //   ...?backup&tg_token=<TOKEN>&tg_chat=<CHATID>
  // (Eski commitlardagi token @BotFather'da revoke qilingan bo'lsin.)
  function getTgConfig() {
    return { token: getParam('tg_token'), chat: getParam('tg_chat') };
  }

  // ---------- UI ----------
  function injectStyle() {
    if (document.getElementById('bkp-style')) return;
    var s = document.createElement('style');
    s.id = 'bkp-style';
    s.textContent =
      '.bkp-fab{position:fixed;left:14px;bottom:14px;z-index:99999;background:#fff;' +
      'border:1px solid #f0c3d6;color:#c84d7c;border-radius:999px;padding:9px 13px;' +
      'font-size:14px;font-family:inherit;box-shadow:0 4px 14px rgba(200,77,124,.18);' +
      'cursor:pointer;display:flex;align-items:center;gap:6px}' +
      '.bkp-fab:active{transform:scale(.96)}' +
      '.bkp-ov{position:fixed;inset:0;z-index:100000;background:rgba(40,10,25,.5);' +
      'display:none;align-items:center;justify-content:center;padding:16px}' +
      '.bkp-ov.show{display:flex}' +
      '.bkp-box{background:#fff;border-radius:18px;max-width:380px;width:100%;' +
      'max-height:88vh;overflow:auto;padding:20px;box-shadow:0 16px 50px rgba(0,0,0,.3)}' +
      '.bkp-box h3{margin:0 0 14px;color:#c84d7c;font-size:18px;text-align:center}' +
      '.bkp-btn{display:block;width:100%;border:0;border-radius:12px;padding:13px;' +
      'font-size:15px;font-family:inherit;font-weight:600;cursor:pointer;margin-bottom:9px}' +
      '.bkp-btn[disabled]{opacity:.6}' +
      '.bkp-pri{background:#e85d92;color:#fff}' +
      '.bkp-sec{background:#fbe7f0;color:#c84d7c}' +
      '.bkp-ghost{background:#f4f4f6;color:#777}' +
      '.bkp-hr{border:0;border-top:1px solid #f0dde6;margin:16px 0}';
    document.head.appendChild(s);
  }

  var ov, box;
  function buildModal() {
    ov = document.createElement('div'); ov.className = 'bkp-ov';
    box = document.createElement('div'); box.className = 'bkp-box';
    ov.appendChild(box); document.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
  }

  function open() {
    injectStyle();
    if (!ov) buildModal();
    // MUHIM: har bosishda localStorage'dan ENG YANGI ma'lumotni o'qiymiz
    // (Send va Download endi aynan bir xil to'liq ma'lumotni beradi).

    box.innerHTML = '';
    var h = document.createElement('h3'); h.textContent = 'backup'; box.appendChild(h);

    var sn = document.createElement('button'); sn.className = 'bkp-btn bkp-pri';
    sn.textContent = 'Send';
    sn.addEventListener('click', function () { doSendTelegram(toJSON(), sn); });
    box.appendChild(sn);

    var dl = document.createElement('button'); dl.className = 'bkp-btn bkp-sec';
    dl.textContent = 'Download';
    dl.addEventListener('click', function () { doDownload(toJSON()); });
    box.appendChild(dl);

    var cp = document.createElement('button'); cp.className = 'bkp-btn bkp-ghost';
    cp.textContent = 'Copy';
    cp.addEventListener('click', function () { doCopy(toJSON(), cp); });
    box.appendChild(cp);

    box.appendChild(hr());

    var fi = document.createElement('input'); fi.type = 'file'; fi.accept = '.json,application/json';
    fi.style.cssText = 'width:100%;margin-bottom:9px;font-size:13px';
    box.appendChild(fi);
    var rs = document.createElement('button'); rs.className = 'bkp-btn bkp-ghost';
    rs.textContent = 'Restore';
    rs.addEventListener('click', function () { doRestore(fi); });
    box.appendChild(rs);

    var cl = document.createElement('button'); cl.className = 'bkp-btn bkp-ghost'; cl.style.marginTop = '6px';
    cl.textContent = 'Close';
    cl.addEventListener('click', close);
    box.appendChild(cl);

    ov.classList.add('show');
  }
  function hr() { var h = document.createElement('hr'); h.className = 'bkp-hr'; return h; }
  function close() { if (ov) ov.classList.remove('show'); }

  // ---------- Telegram bot orqali yuborish ----------
  function makeFd(json, chat) {
    var fd = new FormData();
    fd.append('chat_id', chat);
    fd.append('document', new Blob([json], { type: 'application/json' }), fileName());
    fd.append('caption', 'backup');
    return fd;
  }
  async function doSendTelegram(json, btn) {
    var cfg = getTgConfig();
    if (!cfg.token || !cfg.chat) { alert('Token / chat id kerak.'); return; }
    var sizeKB = Math.round(json.length / 1024);
    if (btn) { btn.disabled = true; btn.textContent = 'Sending ' + sizeKB + 'KB...'; }
    var url = 'https://api.telegram.org/bot' + cfg.token + '/sendDocument';
    try {
      var res = await fetch(url, { method: 'POST', body: makeFd(json, cfg.chat) });
      var txt = ''; try { txt = await res.text(); } catch (e) {}
      var ok = false; try { ok = !!JSON.parse(txt).ok; } catch (e) {}
      if (ok) alert('Sent OK (' + sizeKB + ' KB)');
      else alert('TG error (' + sizeKB + ' KB) HTTP ' + res.status + ':\n' + String(txt).slice(0, 400));
    } catch (e) {
      alert('Network/CORS error (' + sizeKB + ' KB):\n' + (e && e.message));
    } finally { if (btn) { btn.disabled = false; btn.textContent = 'Send'; } }
  }

  function doDownload(json) {
    try {
      var blob = new Blob([json], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a'); a.href = url; a.download = fileName();
      document.body.appendChild(a); a.click();
      setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
    } catch (e) { alert('Failed. Use Copy.'); }
  }

  function doCopy(json, btn) {
    var done = function () { if (btn) { btn.textContent = 'OK'; setTimeout(function () { btn.textContent = 'Copy'; }, 1500); } };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(json).then(done, function () { fallbackCopy(json); done(); });
        return;
      }
    } catch (e) {}
    fallbackCopy(json); done();
  }
  function fallbackCopy(json) {
    try {
      var ta = document.createElement('textarea');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      ta.value = json; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    } catch (e) {}
  }

  function doRestore(fileInput) {
    var f = fileInput && fileInput.files && fileInput.files[0];
    if (!f) { alert('Select a file.'); return; }
    var rd = new FileReader();
    rd.onload = function () {
      var obj;
      try { obj = JSON.parse(rd.result); } catch (e) { alert('Invalid file.'); return; }
      var hasV2 = obj && Object.prototype.hasOwnProperty.call(obj, 'data');
      var hasV1 = obj && obj.keys && typeof obj.keys === 'object';
      if (!hasV2 && !hasV1) { alert('Invalid file.'); return; }
      if (!confirm('Restore from this file? Current data will be overwritten.')) return;
      try {
        if (hasV2) {
          if (obj.data != null) localStorage.setItem('pj_answers', typeof obj.data === 'string' ? obj.data : JSON.stringify(obj.data));
          var meta = obj.meta || {};
          for (var mk in meta) { if (meta.hasOwnProperty(mk)) localStorage.setItem(mk, meta[mk]); }
        } else {
          for (var k in obj.keys) { if (obj.keys.hasOwnProperty(k)) localStorage.setItem(k, obj.keys[k]); }
        }
        // Firebase rejimida: localStorage yetarli emas — bulutga AVTORITAR yozamiz
        // (backup'da yo'q yozuvlar o'chiriladi) va commit TUGAGACH qayta yuklaymiz,
        // aks holda eski remote yangi localStorage'ni bosib ketadi.
        var fbMode = false;
        try { fbMode = window.PJ && PJ.mode && PJ.mode() === 'firebase'; } catch (e) {}
        if (fbMode && PJ.restoreToCloud) {
          var p = null; try { p = PJ.restoreToCloud(); } catch (e) {}
          if (p && p.then) {
            p.then(function (ok) { alert(ok ? 'Done (cloud).' : 'Cloud xato — qayta urinib ko\'ring.'); location.reload(); });
          } else { alert('Done.'); location.reload(); }
        } else {
          alert('Done.'); location.reload();
        }
      } catch (e) { alert('Error: ' + e.message); }
    };
    rd.readAsText(f);
  }

  function addFab() {
    if (document.getElementById('bkp-fab')) return;
    var b = document.createElement('button');
    b.id = 'bkp-fab'; b.className = 'bkp-fab'; b.type = 'button';
    b.textContent = 'backup';
    b.addEventListener('click', open);
    document.body.appendChild(b);
  }

  function unlockedByUrl() {
    var s = ((location.hash || '') + ' ' + (location.search || '')).toLowerCase();
    return s.indexOf('zaxira') !== -1 || s.indexOf('backup') !== -1;
  }
  function reveal(autoOpen) { injectStyle(); addFab(); if (autoOpen) open(); }
  function armSecretGesture() {
    var taps = [], CORNER = 60, NEED = 6, WIN = 3000;
    document.addEventListener('pointerdown', function (e) {
      if (e.clientX > CORNER || e.clientY > CORNER) return;
      var now = (new Date()).getTime();
      taps.push(now); taps = taps.filter(function (t) { return now - t < WIN; });
      if (taps.length >= NEED) { taps.length = 0; reveal(true); }
    }, true);
  }

  function boot() {
    injectStyle(); addFab(); armSecretGesture();
    if (unlockedByUrl()) open();
    // havolada tg_auto=1 bo'lsa — bir marta avtomatik yuborish (token/chat default'dan)
    if (getParam('tg_auto') === '1') {
      var c = getTgConfig();
      if (c.token && c.chat) setTimeout(function () { doSendTelegram(toJSON(), null); }, 500);
    }
  }
  if (document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);

  window.PJBackup = { open: open, reveal: reveal, json: toJSON, send: function () { doSendTelegram(toJSON(), null); } };
})();
