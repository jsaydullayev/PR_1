/* ============================================================
   Орзулар рўйхати (Bucket list)
   Биргаликда қилмоқчи бўлган нарсалар. Қўшиш / бажарилди белгилаш /
   ўчириш. Маълумот account.js даги Store орқали сақланади (синхрон).
   Иккала саҳифа (Паризода ва Жаҳонгир) бир хил рўйхатни кўради ва
   таҳрирлай олади — иккаласида бир хил кўринади.
   ============================================================ */
(function () {
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function curUser() { return (window.PJ && window.PJ.currentUser && window.PJ.currentUser()) || ''; }

  // har bir mount: ro'yxat + (ixtiyoriy) forma/input/statistika
  const MOUNTS = [
    { list: 'bucketList', form: 'bucketForm', input: 'bucketInput', stat: 'bucketStat' },
    { list: 'dashBucketList', form: 'dashBucketForm', input: 'dashBucketInput', stat: 'dashBucketStat' },
  ];
  let booted = false;

  function getItems() {
    const arr = (window.PJ && window.PJ.getBucket && window.PJ.getBucket()) || [];
    // bajarilmaganlar tepada, keyin qo'shilgan vaqt bo'yicha
    return arr.slice().sort(function (a, b) {
      if (!!a.done !== !!b.done) return a.done ? 1 : -1;
      return (a.at || 0) - (b.at || 0);
    });
  }

  function renderInto(listEl, statEl) {
    if (!listEl) return;
    const items = getItems();
    const total = items.length;
    const done = items.filter(function (i) { return i.done; }).length;

    if (statEl) {
      statEl.textContent = total
        ? (done + ' / ' + total + ' рўёбга чиқди')
        : 'Биргаликда қилмоқчи бўлган нарсаларни ёзиб бор';
    }

    if (!total) {
      listEl.innerHTML = '<div class="bucket-empty">Рўйхат ҳали бўш. Биргаликда амалга оширмоқчи бўлган биринчи орзуни ёзиб қўйинг. ✦</div>';
      return;
    }
    listEl.innerHTML = '';
    items.forEach(function (it) {
      const row = document.createElement('div');
      row.className = 'bucket-item' + (it.done ? ' done' : '');

      const check = document.createElement('button');
      check.type = 'button';
      check.className = 'bucket-check';
      check.setAttribute('aria-label', it.done ? 'Бажарилмаган деб белгилаш' : 'Бажарилди деб белгилаш');
      check.innerHTML = it.done ? '✓' : '';
      check.addEventListener('click', function () {
        const next = !it.done;
        if (window.PJ && window.PJ.updateBucket) window.PJ.updateBucket(it.id, { done: next, doneAt: next ? Date.now() : null });
        renderAll();
        if (next && typeof window.burst === 'function') {
          const r = check.getBoundingClientRect();
          window.burst(r.left + r.width / 2, r.top + r.height / 2, 8);
        }
      });

      const body = document.createElement('div');
      body.className = 'bucket-body';
      const txt = document.createElement('div');
      txt.className = 'bucket-text';
      txt.textContent = it.text || '';
      const meta = document.createElement('div');
      meta.className = 'bucket-meta';
      meta.textContent = (it.author ? it.author : '') + (it.done ? ' · рўёбга чиқди' : '');
      body.appendChild(txt);
      body.appendChild(meta);

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'bucket-del';
      del.setAttribute('aria-label', 'Ўчириш');
      del.textContent = '✕';
      del.addEventListener('click', function () {
        if (window.PJ && window.PJ.deleteBucket) window.PJ.deleteBucket(it.id);
        renderAll();
      });

      row.appendChild(check);
      row.appendChild(body);
      row.appendChild(del);
      listEl.appendChild(row);
    });
  }

  function renderAll() {
    MOUNTS.forEach(function (m) {
      renderInto(document.getElementById(m.list), document.getElementById(m.stat));
    });
  }

  function addFrom(inputEl) {
    if (!inputEl) return;
    const text = (inputEl.value || '').trim();
    if (!text) { inputEl.focus(); return; }
    if (window.PJ && window.PJ.addBucket) {
      window.PJ.addBucket({ id: uid(), text: text, done: false, author: curUser(), at: Date.now(), doneAt: null });
    }
    inputEl.value = '';
    inputEl.focus();
    renderAll();
  }

  function boot() {
    let anyList = false;
    MOUNTS.forEach(function (m) {
      const listEl = document.getElementById(m.list);
      if (listEl) anyList = true;
      const formEl = document.getElementById(m.form);
      const inputEl = document.getElementById(m.input);
      if (formEl && inputEl && !formEl.__b) {
        formEl.__b = true;
        formEl.addEventListener('submit', function (e) { e.preventDefault(); addFrom(inputEl); });
      }
    });
    if (!anyList) return;
    renderAll();
    if (!booted && window.PJ && window.PJ.onUpdate) {
      booted = true;
      window.PJ.onUpdate(function () { renderAll(); });
    }
  }

  window.BucketList = { boot: boot, render: renderAll };
  if (document.readyState !== 'loading') setTimeout(boot, 0);
  else document.addEventListener('DOMContentLoaded', boot);
})();
