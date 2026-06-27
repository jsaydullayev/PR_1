/* ============================================================
   backup.js — ma'lumotni eksport/import (XAVFSIZ)
   ------------------------------------------------------------
   localStorage'ni FAQAT O'QIYDI (eksport hech narsani o'zgartirmaydi).
   Faqat "Restore" (import) — tasdiqdan keyin — yozadi.
   Tugma "backup" deb nomlanadi; ichida ortiqcha izoh yo'q, faqat tugmalar.
   ============================================================ */
(function () {
  'use strict';

  var KEYS = ['pj_answers', 'pj_session', 'pj_theme', 'pj_chat_seen'];

  function readAll() {
    var out = {};
    for (var i = 0; i < KEYS.length; i++) {
      try {
        var v = localStorage.getItem(KEYS[i]);
        if (v !== null) out[KEYS[i]] = v;
      } catch (e) {}
    }
    return out;
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function stamp() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
           '_' + pad(d.getHours()) + pad(d.getMinutes());
  }

  function buildBackupObject() {
    return {
      _app: 'parizoda',
      _backup_version: 1,
      exportedAt: new Date().toISOString(),
      keys: readAll(),
    };
  }
  function toJSON() { return JSON.stringify(buildBackupObject(), null, 2); }

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
      '.bkp-pri{background:#e85d92;color:#fff}' +
      '.bkp-sec{background:#fbe7f0;color:#c84d7c}' +
      '.bkp-ghost{background:#f4f4f6;color:#777}' +
      '.bkp-hr{border:0;border-top:1px solid #f0dde6;margin:16px 0}';
    document.head.appendChild(s);
  }

  var ov, box;
  function buildModal() {
    ov = document.createElement('div');
    ov.className = 'bkp-ov';
    box = document.createElement('div');
    box.className = 'bkp-box';
    ov.appendChild(box);
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
  }

  function open() {
    injectStyle();
    if (!ov) buildModal();
    var json = toJSON();

    box.innerHTML = '';
    var h = document.createElement('h3'); h.textContent = 'backup'; box.appendChild(h);

    var dl = document.createElement('button'); dl.className = 'bkp-btn bkp-pri';
    dl.textContent = 'Download';
    dl.addEventListener('click', function () { doDownload(json); });
    box.appendChild(dl);

    if (navigator.share) {
      var sh = document.createElement('button'); sh.className = 'bkp-btn bkp-sec';
      sh.textContent = 'Share';
      sh.addEventListener('click', function () { doShare(json); });
      box.appendChild(sh);
    }

    var cp = document.createElement('button'); cp.className = 'bkp-btn bkp-ghost';
    cp.textContent = 'Copy';
    cp.addEventListener('click', function () { doCopy(json, cp); });
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

  function doDownload(json) {
    try {
      var blob = new Blob([json], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = 'backup-' + stamp() + '.json';
      document.body.appendChild(a); a.click();
      setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
    } catch (e) { alert('Failed. Use Copy.'); }
  }

  async function doShare(json) {
    try {
      var fname = 'backup-' + stamp() + '.json';
      if (navigator.canShare) {
        try {
          var file = new File([json], fname, { type: 'application/json' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: 'backup' });
            return;
          }
        } catch (e) {}
      }
      await navigator.share({ title: 'backup', text: json });
    } catch (e) { /* bekor qilingan bo'lishi mumkin — jim */ }
  }

  // jim nusxalash — ma'lumot ekranda ko'rinmaydi
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
      var keys = obj && obj.keys;
      if (!keys || typeof keys !== 'object' || typeof keys.pj_answers === 'undefined') {
        alert('Invalid file.'); return;
      }
      if (!confirm('Restore from this file? Current data will be overwritten.')) return;
      try {
        for (var k in keys) { if (keys.hasOwnProperty(k)) localStorage.setItem(k, keys[k]); }
        alert('Done.');
        location.reload();
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

  // qo'shimcha maxfiy ochish (URL #zaxira yoki yuqori-chap burchakka 6 marta bosish)
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
      taps.push(now);
      taps = taps.filter(function (t) { return now - t < WIN; });
      if (taps.length >= NEED) { taps.length = 0; reveal(true); }
    }, true);
  }

  function boot() {
    injectStyle();
    addFab();            // "backup" tugmasi doim ko'rinadi
    armSecretGesture();
    if (unlockedByUrl()) open();
  }
  if (document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);

  window.PJBackup = { open: open, reveal: reveal, json: toJSON };
})();
