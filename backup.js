/* ============================================================
   ZAXIRA (Backup / Restore) — XAVFSIZ vosita
   ------------------------------------------------------------
   MAQSAD: Parizoda telefonidagi (localStorage) xotira/rasm/orzu
   ma'lumotini fayl qilib saqlash — Firebase'ga o'tishdan oldin
   yo'qolib qolmasligi uchun.

   MUHIM: Bu fayl ma'lumotni FAQAT O'QIYDI. Eksport hech narsani
   o'zgartirmaydi/o'chirmaydi. Faqat "Tiklash" (import) tugmasi —
   ataylab bosilganda, tasdiqdan keyin — localStorage'ga yozadi.
   Firebase bilan hech qanday aloqasi yo'q.
   ============================================================ */
(function () {
  'use strict';

  // Saytda ishlatiladigan barcha localStorage kalitlari
  var KEYS = ['pj_answers', 'pj_session', 'pj_theme', 'pj_chat_seen'];
  var DATA_KEY = 'pj_answers';

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

  function parseAnswers(raw) {
    try { return JSON.parse(raw.pj_answers || 'null') || {}; } catch (e) { return {}; }
  }

  // Ma'lumot xulosasi (necha xotira, rasm, orzu...) — ishonch uchun
  function summarize(d) {
    var days = 0, mems = 0, photos = 0;
    var mem = d && d.memories;
    if (mem && typeof mem === 'object') {
      var ks = Object.keys(mem);
      days = ks.length;
      for (var i = 0; i < ks.length; i++) {
        var arr = mem[ks[i]] || [];
        if (Array.isArray(arr)) {
          mems += arr.length;
          for (var j = 0; j < arr.length; j++) if (arr[j] && arr[j].photo) photos++;
        }
      }
    }
    var bucket = Array.isArray(d && d.bucket) ? d.bucket.length : 0;
    var chat = Array.isArray(d && d.chat) ? d.chat.length : 0;
    var hasPhoto = !!(d && d.photo);
    return { days: days, mems: mems, photos: photos, bucket: bucket, chat: chat, hasPhoto: hasPhoto };
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function stamp() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
           '_' + pad(d.getHours()) + pad(d.getMinutes());
  }

  function buildBackupObject() {
    var raw = readAll();
    return {
      _app: 'parizoda',
      _backup_version: 1,
      exportedAt: new Date().toISOString(),
      keys: raw,            // barcha pj_* kalitlar (string ko'rinishida)
    };
  }

  function toJSON() {
    return JSON.stringify(buildBackupObject(), null, 2);
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
      '.bkp-box{background:#fff;border-radius:18px;max-width:440px;width:100%;' +
      'max-height:88vh;overflow:auto;padding:20px;box-shadow:0 16px 50px rgba(0,0,0,.3)}' +
      '.bkp-box h3{margin:0 0 4px;color:#c84d7c;font-size:19px}' +
      '.bkp-sub{color:#8a6a78;font-size:13px;margin:0 0 14px}' +
      '.bkp-sum{background:#fff4f8;border:1px solid #f5d6e3;border-radius:12px;' +
      'padding:12px 14px;font-size:14px;color:#5b3b48;line-height:1.7;margin-bottom:14px}' +
      '.bkp-sum b{color:#c84d7c}' +
      '.bkp-btn{display:block;width:100%;border:0;border-radius:12px;padding:13px;' +
      'font-size:15px;font-family:inherit;font-weight:600;cursor:pointer;margin-bottom:9px}' +
      '.bkp-pri{background:#e85d92;color:#fff}' +
      '.bkp-sec{background:#fbe7f0;color:#c84d7c}' +
      '.bkp-ghost{background:#f4f4f6;color:#777}' +
      '.bkp-ta{width:100%;height:90px;border:1px solid #eccdda;border-radius:10px;' +
      'padding:9px;font-size:11px;font-family:monospace;color:#555;resize:vertical;margin-bottom:9px}' +
      '.bkp-hr{border:0;border-top:1px solid #f0dde6;margin:16px 0}' +
      '.bkp-danger{color:#b23;font-size:12px;margin:0 0 8px}' +
      '.bkp-note{font-size:12px;color:#9a7c88;margin:10px 0 0;line-height:1.5}';
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
    if (!ov) buildModal();
    var d = parseAnswers(readAll());
    var s = summarize(d);
    var json = toJSON();
    var sizeKB = Math.round((json.length / 1024));

    box.innerHTML = '';
    var h = document.createElement('h3'); h.textContent = '💾 Ma\'lumot zaxirasi'; box.appendChild(h);
    var sub = document.createElement('p'); sub.className = 'bkp-sub';
    sub.textContent = 'Telefondagi barcha xotira/rasm/orzularingni faylga saqla. Hech narsa o\'chmaydi.';
    box.appendChild(sub);

    var sum = document.createElement('div'); sum.className = 'bkp-sum';
    sum.innerHTML =
      '🗓️ Xotira kunlari: <b>' + s.days + '</b><br>' +
      '✍️ Jami yozuvlar: <b>' + s.mems + '</b><br>' +
      '🖼️ Rasmli xotiralar: <b>' + s.photos + '</b><br>' +
      '✦ Orzular: <b>' + s.bucket + '</b> · 💬 Xabarlar: <b>' + s.chat + '</b><br>' +
      '📦 Fayl hajmi: <b>' + sizeKB + ' KB</b>';
    box.appendChild(sum);

    // Yuklab olish
    var dl = document.createElement('button'); dl.className = 'bkp-btn bkp-pri';
    dl.textContent = '📥 Faylga yuklab olish';
    dl.addEventListener('click', function () { doDownload(json); });
    box.appendChild(dl);

    // Ulashish (mobil uchun qulay)
    if (navigator.share) {
      var sh = document.createElement('button'); sh.className = 'bkp-btn bkp-sec';
      sh.textContent = '📤 Ulashish (Telegram, ...)';
      sh.addEventListener('click', function () { doShare(json); });
      box.appendChild(sh);
    }

    // Nusxalash (zaxira yo'l)
    var ta = document.createElement('textarea'); ta.className = 'bkp-ta'; ta.readOnly = true; ta.value = json;
    var cp = document.createElement('button'); cp.className = 'bkp-btn bkp-ghost';
    cp.textContent = '📋 Matnni nusxalash';
    cp.addEventListener('click', function () {
      ta.select();
      try { navigator.clipboard ? navigator.clipboard.writeText(json) : document.execCommand('copy'); cp.textContent = '✓ Nusxalandi'; }
      catch (e) { try { document.execCommand('copy'); cp.textContent = '✓ Nusxalandi'; } catch (e2) {} }
      setTimeout(function () { cp.textContent = '📋 Matnni nusxalash'; }, 2000);
    });
    box.appendChild(cp);
    box.appendChild(ta);

    // ----- Tiklash (import) -----
    box.appendChild(hr());
    var dn = document.createElement('p'); dn.className = 'bkp-danger';
    dn.textContent = '⚠️ Tiklash: faylдан ma\'lumotni qaytaradi (hozirgisi ustiga yoziladi).';
    box.appendChild(dn);
    var fi = document.createElement('input'); fi.type = 'file'; fi.accept = '.json,application/json';
    fi.style.cssText = 'width:100%;margin-bottom:9px;font-size:13px';
    box.appendChild(fi);
    var rs = document.createElement('button'); rs.className = 'bkp-btn bkp-ghost';
    rs.textContent = '♻️ Fayldan tiklash';
    rs.addEventListener('click', function () { doRestore(fi); });
    box.appendChild(rs);

    var note = document.createElement('p'); note.className = 'bkp-note';
    note.textContent = 'Maslahat: faylni yuklab olgach, o\'zingга Telegram/pochta orqali yuborib qo\'y — ikkinchi nusxa bo\'lsin.';
    box.appendChild(note);

    var cl = document.createElement('button'); cl.className = 'bkp-btn bkp-ghost'; cl.style.marginTop = '6px';
    cl.textContent = 'Yopish';
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
      a.href = url; a.download = 'parizoda-zaxira-' + stamp() + '.json';
      document.body.appendChild(a); a.click();
      setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
    } catch (e) { alert('Yuklab bo\'lmadi: ' + e.message + '\nO\'rniga "Matnni nusxalash"dan foydalaning.'); }
  }

  async function doShare(json) {
    try {
      var fname = 'parizoda-zaxira-' + stamp() + '.json';
      if (navigator.canShare) {
        try {
          var file = new File([json], fname, { type: 'application/json' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: 'Parizoda zaxira' });
            return;
          }
        } catch (e) {}
      }
      // fayl ulashib bo'lmasa — matn (kichik bo'lsa)
      await navigator.share({ title: 'Parizoda zaxira', text: json });
    } catch (e) { /* foydalanuvchi bekor qilgan bo'lishi mumkin — jim */ }
  }

  function doRestore(fileInput) {
    var f = fileInput && fileInput.files && fileInput.files[0];
    if (!f) { alert('Avval fayl tanlang.'); return; }
    var rd = new FileReader();
    rd.onload = function () {
      var obj;
      try { obj = JSON.parse(rd.result); } catch (e) { alert('Fayl o\'qib bo\'lmadi (noto\'g\'ri format).'); return; }
      var keys = obj && obj.keys;
      if (!keys || typeof keys !== 'object' || typeof keys.pj_answers === 'undefined') {
        alert('Bu Parizoda zaxira fayli emas (pj_answers topilmadi).'); return;
      }
      // xulosa ko'rsatib tasdiqlash
      var d; try { d = JSON.parse(keys.pj_answers || '{}'); } catch (e) { d = {}; }
      var s = summarize(d);
      var ok = confirm('Tiklanadi:\n• Xotira kunlari: ' + s.days + '\n• Yozuvlar: ' + s.mems +
        '\n• Rasmlar: ' + s.photos + '\n• Orzular: ' + s.bucket +
        '\n\nHozirgi ma\'lumot ustiga yoziladi. Davom etamizmi?');
      if (!ok) return;
      try {
        for (var k in keys) { if (keys.hasOwnProperty(k)) localStorage.setItem(k, keys[k]); }
        alert('✓ Tiklandi. Sahifa yangilanadi.');
        location.reload();
      } catch (e) { alert('Tiklashda xato: ' + e.message); }
    };
    rd.readAsText(f);
  }

  function addFab() {
    if (document.getElementById('bkp-fab')) return;
    var b = document.createElement('button');
    b.id = 'bkp-fab'; b.className = 'bkp-fab'; b.type = 'button';
    b.innerHTML = '💾 <span>Zaxira</span>';
    b.addEventListener('click', open);
    document.body.appendChild(b);
  }

  function boot() { injectStyle(); addFab(); }
  if (document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);

  // tashqaridan ochish uchun (ixtiyoriy)
  window.PJBackup = { open: open, json: toJSON };
})();
