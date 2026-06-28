/* ============================================================
   Boshqaruv paneli (Jaxongir) — musiqa, asosiy rasm, shart matni.
   Hammasi window.PJ orqali serverга yoziladi (sinxron).
   Faqat Jaxongir ko'rinishida (body.as-jaxongir) ko'rinadi.
   ============================================================ */
(function () {
  'use strict';

  function injectStyle() {
    if (document.getElementById('adm-style')) return;
    var s = document.createElement('style');
    s.id = 'adm-style';
    s.textContent =
      '.adm-fab{position:fixed;right:14px;bottom:84px;z-index:99998;background:#fff;' +
      'border:1px solid #f0c3d6;color:#c84d7c;border-radius:999px;width:46px;height:46px;' +
      'font-size:20px;box-shadow:0 4px 14px rgba(200,77,124,.18);cursor:pointer;display:none;' +
      'align-items:center;justify-content:center}' +
      'body.as-jaxongir .adm-fab{display:flex}' +
      '.adm-fab:active{transform:scale(.95)}' +
      '.adm-ov{position:fixed;inset:0;z-index:100001;background:rgba(40,10,25,.5);' +
      'display:none;align-items:center;justify-content:center;padding:16px}' +
      '.adm-ov.show{display:flex}' +
      '.adm-box{background:#fff;border-radius:18px;max-width:420px;width:100%;max-height:88vh;' +
      'overflow:auto;padding:20px;box-shadow:0 16px 50px rgba(0,0,0,.3)}' +
      '.adm-box h3{margin:0 0 4px;color:#c84d7c;font-size:19px;text-align:center}' +
      '.adm-box .adm-sub{margin:0 0 16px;text-align:center;color:#999;font-size:13px}' +
      '.adm-sec{border:1px solid #f3e1ea;border-radius:14px;padding:14px;margin-bottom:12px}' +
      '.adm-sec h4{margin:0 0 10px;font-size:14px;color:#a84a72}' +
      '.adm-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}' +
      '.adm-file{flex:1;min-width:140px;font-size:13px}' +
      '.adm-ta{width:100%;border:1px solid #eccdda;border-radius:10px;padding:9px;font-family:inherit;font-size:14px;resize:vertical;min-height:60px}' +
      '.adm-btn{border:0;border-radius:10px;padding:10px 14px;font-size:14px;font-family:inherit;font-weight:600;cursor:pointer;background:#e85d92;color:#fff}' +
      '.adm-btn.sec{background:#fbe7f0;color:#c84d7c}' +
      '.adm-btn.ghost{background:#f4f4f6;color:#777}' +
      '.adm-btn[disabled]{opacity:.6}' +
      '.adm-note{font-size:12px;color:#aa6;margin-top:8px;min-height:16px}' +
      '.adm-close{display:block;width:100%;margin-top:6px}';
    document.head.appendChild(s);
  }

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function fmtMB(n) { return (n / 1048576).toFixed(1) + ' MB'; }
  function pj() { return window.PJ || {}; }

  var ov, box, note;
  function setNote(msg, color) { if (note) { note.textContent = msg || ''; note.style.color = color || '#aa6'; } }

  function build() {
    injectStyle();
    ov = el('div', 'adm-ov');
    box = el('div', 'adm-box');
    ov.appendChild(box);
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    render();
  }

  function render() {
    box.innerHTML = '';
    box.appendChild(el('h3', null, '⚙ Бошқарув'));
    box.appendChild(el('p', 'adm-sub', 'Мусиқа, расм ва матнни шу ердан ўзгартиринг'));

    // --- MUSIQA ---
    var m = el('div', 'adm-sec'); m.appendChild(el('h4', null, '🎵 Мусиқа (қўшиқ файли)'));
    var mrow = el('div', 'adm-row');
    var mfile = el('input', 'adm-file'); mfile.type = 'file'; mfile.accept = 'audio/*,.mp3,.m4a,.ogg';
    var mbtn = el('button', 'adm-btn', 'Юклаш');
    mbtn.addEventListener('click', function () {
      var f = mfile.files && mfile.files[0];
      if (!f) { setNote('Аввал файл танланг', '#c00'); return; }
      if (f.size > 20 * 1048576) { setNote('Жуда катта (' + fmtMB(f.size) + '). 20MB гача.', '#c00'); return; }
      mbtn.disabled = true; setNote('Юкланмоқда... ' + fmtMB(f.size));
      pj().uploadMusic(f).then(function () {
        setNote('✓ Мусиқа алмаштирилди — иккала телефонда янгиланади', '#1a8a4a');
        mfile.value = '';
      }).catch(function (e) {
        setNote('Хато: ' + (e && e.message === '401' ? 'қайта киринг' : 'юкланмади'), '#c00');
      }).finally(function () { mbtn.disabled = false; });
    });
    mrow.appendChild(mfile); mrow.appendChild(mbtn); m.appendChild(mrow);
    box.appendChild(m);

    // --- ASOSIY RASM ---
    var ph = el('div', 'adm-sec'); ph.appendChild(el('h4', null, '🖼 Асосий расм'));
    var prow = el('div', 'adm-row');
    var pfile = el('input', 'adm-file'); pfile.type = 'file'; pfile.accept = 'image/*';
    var pbtn = el('button', 'adm-btn', 'Юклаш');
    pbtn.addEventListener('click', function () {
      var f = pfile.files && pfile.files[0];
      if (!f) { setNote('Аввал расм танланг', '#c00'); return; }
      pbtn.disabled = true; setNote('Расм юкланмоқда...');
      Promise.resolve(pj().setPhotoFile(f)).then(function () {
        setNote('✓ Расм алмаштирилди', '#1a8a4a'); pfile.value = '';
      }).catch(function () { setNote('Расмни ўқиб бўлмади', '#c00'); }).finally(function () { pbtn.disabled = false; });
    });
    prow.appendChild(pfile); prow.appendChild(pbtn); ph.appendChild(prow);
    box.appendChild(ph);

    // --- SHART MATNI ---
    var sh = el('div', 'adm-sec'); sh.appendChild(el('h4', null, '✍ Шарт матни'));
    var ta = el('textarea', 'adm-ta'); ta.placeholder = 'Паризода ёзган шарт...';
    var cur = (pj().get && pj().get()) || {};
    ta.value = cur.shart || '';
    var srow = el('div', 'adm-row'); srow.style.marginTop = '8px';
    var sbtn = el('button', 'adm-btn sec', 'Сақлаш');
    sbtn.addEventListener('click', function () { pj().setShart((ta.value || '').trim()); setNote('✓ Шарт сақланди', '#1a8a4a'); });
    var dbtn = el('button', 'adm-btn ghost', 'Ўчириш');
    dbtn.addEventListener('click', function () { ta.value = ''; pj().setShart(''); setNote('Шарт ўчирилди'); });
    srow.appendChild(sbtn); srow.appendChild(dbtn);
    sh.appendChild(ta); sh.appendChild(srow);
    box.appendChild(sh);

    note = el('div', 'adm-note'); box.appendChild(note);
    var cl = el('button', 'adm-btn ghost adm-close', 'Ёпиш'); cl.addEventListener('click', close); box.appendChild(cl);
  }

  function open() { if (!ov) build(); else { render(); } ov.classList.add('show'); }
  function close() { if (ov) ov.classList.remove('show'); }

  function addFab() {
    if (document.getElementById('adm-fab')) return;
    injectStyle();
    var b = el('button', 'adm-fab'); b.id = 'adm-fab'; b.type = 'button'; b.title = 'Бошқарув'; b.textContent = '⚙';
    b.addEventListener('click', open);
    document.body.appendChild(b);
  }

  function boot() { addFab(); }
  if (document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);

  window.PJAdmin = { open: open };
})();
