/* ============================================================
   Xotiralar taqvimi (Memory Calendar)
   Har kunga xotira yozish/o'qish — matn + ixtiyoriy rasm.
   Ma'lumot account.js dagi Store orqali saqlanadi (sinxron).
   ============================================================ */
(function () {
  const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const WD = ['Душ', 'Сеш', 'Чор', 'Пай', 'Жум', 'Шан', 'Якш']; // Mon..Sun
  // muhim sanalar (oy 0-indeksli) — har yili belgilanadi
  const SPECIAL = {
    '1-2': { icon: '✦', label: 'Биринчи учрашувимиз' },   // 2-fevral
    '3-13': { icon: '❥', label: 'Бирга бўлишга қарор қилган кунимиз' }, // 13-aprel
  };

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function keyOf(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // ---------- shared modal ----------
  let modal, mTitle, mList, mText, mPhotoInput, mPhotoPrev, mSaveBtn;
  let activeKey = null, editingId = null, pendingPhoto = null;

  function buildModal() {
    modal = document.createElement('div');
    modal.className = 'cal-modal';
    modal.innerHTML =
      '<div class="cal-sheet">' +
        '<button class="cal-close" aria-label="Ёпиш">✕</button>' +
        '<div class="cal-modal-date" id="calMDate"></div>' +
        '<div class="cal-mem-list" id="calMList"></div>' +
        '<div class="cal-add">' +
          '<textarea id="calMText" rows="3" placeholder="Бу кун ҳақида хотира ёзинг..."></textarea>' +
          '<div class="cal-add-row">' +
            '<label class="cal-photo-btn"><input type="file" id="calMPhoto" accept="image/*" hidden>📷 Расм</label>' +
            '<img id="calMPhotoPrev" class="cal-photo-prev" alt="" hidden>' +
            '<button class="btn btn-yes cal-save" id="calMSave">Сақлаш</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    mTitle = modal.querySelector('#calMDate');
    mList = modal.querySelector('#calMList');
    mText = modal.querySelector('#calMText');
    mPhotoInput = modal.querySelector('#calMPhoto');
    mPhotoPrev = modal.querySelector('#calMPhotoPrev');
    mSaveBtn = modal.querySelector('#calMSave');

    modal.querySelector('.cal-close').addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    mSaveBtn.addEventListener('click', saveEntry);
    mPhotoInput.addEventListener('change', onPhotoPick);
  }

  function encode(bmp, max, q) {
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    return c.toDataURL('image/jpeg', q);
  }
  // Har xotira alohida Firestore hujjati (1 MiB limit) -> ~900KB budjetga sig'guncha kichraytiramiz.
  async function compress(file) {
    const budget = 900 * 1024;
    const bmp = await createImageBitmap(file);
    let max = 1000, q = 0.8;
    let url = encode(bmp, max, q);
    while (url.length > budget && (q > 0.4 || max > 480)) {
      if (q > 0.45) q -= 0.1; else max = Math.round(max * 0.85);
      url = encode(bmp, max, q);
    }
    return url;
  }
  async function onPhotoPick() {
    const f = mPhotoInput.files && mPhotoInput.files[0]; if (!f) return;
    try { pendingPhoto = await compress(f); mPhotoPrev.src = pendingPhoto; mPhotoPrev.hidden = false; }
    catch (e) {}
    mPhotoInput.value = '';
  }

  function fmtLong(key) {
    const p = key.split('-'); const d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d.getDate() + '-' + MONTHS[d.getMonth()].toLowerCase() + ', ' + d.getFullYear();
  }
  function fmtWhen(at) {
    if (!at) return '';
    const d = new Date(at);
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
  }

  function openModal(key) {
    activeKey = key; editingId = null; pendingPhoto = null;
    mTitle.textContent = fmtLong(key);
    mText.value = ''; mPhotoPrev.hidden = true; mPhotoPrev.removeAttribute('src');
    mSaveBtn.textContent = 'Сақлаш';
    renderList();
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    modal.classList.remove('show');
    document.body.style.overflow = '';
    activeKey = null; editingId = null; pendingPhoto = null;
  }

  function renderList() {
    const mem = (window.PJ && window.PJ.getMemories && window.PJ.getMemories()) || {};
    const arr = (mem[activeKey] || []).slice().sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
    if (!arr.length) {
      mList.innerHTML = '<div class="cal-empty">Бу кунга ҳали хотира йўқ. Биринчисини ёзиб қўйинг. 💗</div>';
      return;
    }
    mList.innerHTML = '';
    arr.forEach(function (e) {
      const card = document.createElement('div');
      card.className = 'cal-mem';
      let html = '';
      if (e.photo) html += '<img class="cal-mem-img" src="' + e.photo + '" alt="">';
      html += '<div class="cal-mem-body">';
      if (e.text) html += '<p class="cal-mem-text"></p>';
      html += '<div class="cal-mem-meta"><span class="cm-author">' + (e.author || '') + '</span><span class="cm-when">' + fmtWhen(e.at) + '</span></div>';
      html += '<div class="cal-mem-actions"><button class="cm-edit" type="button">таҳрир</button><button class="cm-del" type="button">ўчириш</button></div>';
      html += '</div>';
      card.innerHTML = html;
      if (e.text) card.querySelector('.cal-mem-text').textContent = e.text;
      if (e.photo) card.querySelector('.cal-mem-img').addEventListener('click', function () { lightbox(e.photo); });
      card.querySelector('.cm-edit').addEventListener('click', function () { startEdit(e); });
      card.querySelector('.cm-del').addEventListener('click', function () { doDelete(e.id); });
      mList.appendChild(card);
    });
  }

  function lightbox(src) {
    const lb = document.getElementById('lightbox'), im = document.getElementById('lbImg');
    if (lb && im) { im.src = src; lb.classList.add('show'); }
  }

  function startEdit(e) {
    editingId = e.id; pendingPhoto = e.photo || null;
    mText.value = e.text || '';
    if (e.photo) { mPhotoPrev.src = e.photo; mPhotoPrev.hidden = false; } else { mPhotoPrev.hidden = true; }
    mSaveBtn.textContent = 'Янгилаш';
    mText.focus();
  }
  function doDelete(id) {
    if (window.PJ && window.PJ.deleteMemory) window.PJ.deleteMemory(activeKey, id);
    renderList();
  }
  function saveEntry() {
    const text = (mText.value || '').trim();
    if (!text && !pendingPhoto) { mText.focus(); return; }
    if (editingId) {
      window.PJ.updateMemory(activeKey, editingId, { text: text, photo: pendingPhoto || null });
      editingId = null;
    } else {
      window.PJ.addMemory(activeKey, {
        id: uid(), text: text, photo: pendingPhoto || null,
        author: (window.PJ.currentUser && window.PJ.currentUser()) || '', at: Date.now(),
      });
    }
    mText.value = ''; pendingPhoto = null; mPhotoPrev.hidden = true; mPhotoPrev.removeAttribute('src');
    mSaveBtn.textContent = 'Сақлаш';
    renderList();
  }

  // ---------- calendar instances ----------
  const instances = [];
  function makeInstance(el) {
    const now = new Date();
    const inst = { el: el, y: now.getFullYear(), m: now.getMonth() };
    el.innerHTML =
      '<div class="cal-head">' +
        '<button class="cal-nav" data-dir="-1" aria-label="Олдинги ой">‹</button>' +
        '<div class="cal-month"></div>' +
        '<button class="cal-nav" data-dir="1" aria-label="Кейинги ой">›</button>' +
      '</div>' +
      '<div class="cal-grid cal-wd"></div>' +
      '<div class="cal-grid cal-days"></div>';
    el.querySelectorAll('.cal-nav').forEach(function (b) {
      b.addEventListener('click', function () {
        inst.m += +b.dataset.dir;
        if (inst.m < 0) { inst.m = 11; inst.y--; }
        if (inst.m > 11) { inst.m = 0; inst.y++; }
        renderInstance(inst);
      });
    });
    const wd = el.querySelector('.cal-wd');
    WD.forEach(function (w) { const c = document.createElement('div'); c.className = 'cal-wd-cell'; c.textContent = w; wd.appendChild(c); });
    instances.push(inst);
    renderInstance(inst);
  }

  function renderInstance(inst) {
    inst.el.querySelector('.cal-month').textContent = MONTHS[inst.m] + ' ' + inst.y;
    const grid = inst.el.querySelector('.cal-days');
    grid.innerHTML = '';
    const first = new Date(inst.y, inst.m, 1);
    let lead = (first.getDay() + 6) % 7; // Monday-first
    const days = new Date(inst.y, inst.m + 1, 0).getDate();
    const mem = (window.PJ && window.PJ.getMemories && window.PJ.getMemories()) || {};
    const today = new Date(); const tKey = keyOf(today.getFullYear(), today.getMonth(), today.getDate());

    for (let i = 0; i < lead; i++) { const c = document.createElement('div'); c.className = 'cal-cell empty'; grid.appendChild(c); }
    for (let d = 1; d <= days; d++) {
      const key = keyOf(inst.y, inst.m, d);
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cal-cell';
      const sp = SPECIAL[inst.m + '-' + d];
      const has = mem[key] && mem[key].length;
      if (key === tKey) cell.classList.add('today');
      if (sp) cell.classList.add('special');
      if (has) cell.classList.add('has-mem');
      let inner = '<span class="cal-num">' + d + '</span>';
      if (sp) inner += '<span class="cal-sp" title="' + sp.label + '">' + sp.icon + '</span>';
      if (has) inner += '<span class="cal-dot">' + (mem[key].length > 1 ? mem[key].length : '') + '</span>';
      cell.innerHTML = inner;
      cell.addEventListener('click', function () { openModal(key); });
      grid.appendChild(cell);
    }
  }

  function renderAll() { instances.forEach(renderInstance); renderAlbum(); }

  // ---------- memory album (vaqt bo'yicha) ----------
  let albumEl = null;
  function renderAlbum() {
    if (!albumEl) albumEl = document.getElementById('memoryAlbum');
    if (!albumEl) return;
    const mem = (window.PJ && window.PJ.getMemories && window.PJ.getMemories()) || {};
    const items = [];
    Object.keys(mem).forEach(function (k) {
      (mem[k] || []).forEach(function (e) { if (e.photo) items.push({ key: k, e: e }); });
    });
    if (!items.length) {
      albumEl.innerHTML = '<div class="album-empty">Ҳали расмли хотира йўқ. Тақвимда кунга расм қўшсанг, улар шу ерда вақт бўйича тахланиб боради. 💗</div>';
      return;
    }
    // eng yangi yuqorida: sana bo'yicha kamayish tartibida
    items.sort(function (a, b) {
      if (a.key !== b.key) return a.key < b.key ? 1 : -1;
      return (b.e.at || 0) - (a.e.at || 0);
    });
    // oy-yil bo'yicha guruhlash
    const groups = []; const idx = {};
    items.forEach(function (it) {
      const p = it.key.split('-'); const gkey = p[0] + '-' + p[1];
      const gname = MONTHS[+p[1] - 1] + ' ' + p[0];
      if (idx[gkey] == null) { idx[gkey] = groups.length; groups.push({ name: gname, items: [] }); }
      groups[idx[gkey]].items.push(it);
    });
    albumEl.innerHTML = '';
    groups.forEach(function (g) {
      const gt = document.createElement('div'); gt.className = 'album-group-title'; gt.textContent = g.name;
      albumEl.appendChild(gt);
      const grid = document.createElement('div'); grid.className = 'album-grid';
      g.items.forEach(function (it) {
        const card = document.createElement('div'); card.className = 'album-card';
        const img = document.createElement('img'); img.src = it.e.photo; img.alt = '';
        img.addEventListener('click', function () { lightbox(it.e.photo); });
        card.appendChild(img);
        const body = document.createElement('div'); body.className = 'ac-body';
        const dp = it.key.split('-');
        let h = '<div class="ac-date">' + (+dp[2]) + '-' + MONTHS[+dp[1] - 1].toLowerCase() + '</div>';
        if (it.e.text) h += '<div class="ac-text"></div>';
        if (it.e.author) h += '<div class="ac-author">' + it.e.author + '</div>';
        body.innerHTML = h;
        if (it.e.text) body.querySelector('.ac-text').textContent = it.e.text;
        card.appendChild(body);
        grid.appendChild(card);
      });
      albumEl.appendChild(grid);
    });
  }

  let booted = false;
  function boot() {
    if (!modal) buildModal();
    const els = document.querySelectorAll('.memory-calendar');
    els.forEach(function (el) { if (!el.__cal) { el.__cal = true; makeInstance(el); } });
    renderAlbum();
    if (!booted && window.PJ && window.PJ.onUpdate) {
      booted = true;
      window.PJ.onUpdate(function () { renderAll(); if (modal && modal.classList.contains('show')) renderList(); });
    }
  }

  window.MemoryCalendar = { boot: boot, render: renderAll };
  if (document.readyState !== 'loading') setTimeout(boot, 0);
  else document.addEventListener('DOMContentLoaded', boot);
})();
