/* ============================================================
   Don-don ziki (Tosh-Qaychi-Qog'oz)
   Jaxongir DOIM yutadi: opponent har doim o'yinchining
   tanlovini yengadigan harakatni tanlaydi.
   Yutgach — romantik "qayta yarashish" sharti chiqadi.
   ============================================================ */
(function () {
  const EMO = { tosh: '✊', qaychi: '✌️', qogoz: '✋' };
  const NAME = { tosh: 'Тош', qaychi: 'Қайчи', qogoz: 'Қоғоз' };
  // o'yinchining harakatini yengadigan harakat (Jaxongir tanlaydi)
  const BEATS = { tosh: 'qogoz', qaychi: 'tosh', qogoz: 'qaychi' };

  // har g'alabada navbatma-navbat chiqadigan romantik shartlar
  const SHARTLAR = [
    'Бугун менга қўнғироқ қилиб, овозингни эшиттирасан.',
    'Аразни бир четга суриб, яна аввалгидек гаплашамиз.',
    'Менга самимий табассумингни қайтариб берасан.',
    'Бир-биримизга «кечир» деб, ҳаммасини орқада қолдирамиз.',
    'Эртага биргаликда вақт ўтказамиз — фақат иккимиз.',
    'Ҳозир менга «Сизни севаман» деб ёзасан.',
    'Бундан кейин аразни узоқка чўзмасликка келишамиз.',
    'Мени маҳкам қучоқлаб, ҳаммасини унутамиз.',
  ];

  let shartIdx = 0;
  let busy = false;
  let currentShart = '';
  let lastShart = -1;

  // shartni tanlash: "qucho'qlab..." (oxirgisi) bilinmas darajada ko'proq chiqadi
  const SHART_W = [1, 1, 1, 1, 1, 1, 1, 1.8];
  function pickShart() {
    var total = 0, i;
    for (i = 0; i < SHARTLAR.length; i++) if (i !== lastShart) total += SHART_W[i];
    var r = Math.random() * total, idx = 0;
    for (i = 0; i < SHARTLAR.length; i++) {
      if (i === lastShart) continue;
      r -= SHART_W[i];
      if (r <= 0) { idx = i; break; }
    }
    lastShart = idx;
    return SHARTLAR[idx];
  }

  const youHand = document.getElementById('rpsYou');
  const meHand = document.getElementById('rpsMe');
  const countEl = document.getElementById('rpsCount');
  const choicesWrap = document.getElementById('rpsChoices');
  const result = document.getElementById('rpsResult');
  const verdict = document.getElementById('rpsVerdict');
  const shartText = document.getElementById('shartText');
  const accept = document.getElementById('shartAccept');
  const again = document.getElementById('rpsAgain');
  const doneMsg = document.getElementById('rpsDone');
  if (!choicesWrap) return;

  const choiceBtns = Array.from(choicesWrap.querySelectorAll('.rps-choice'));

  function setDisabled(v) { choiceBtns.forEach((b) => { b.disabled = v; }); }
  function reduceMotion() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  function play(move) {
    if (busy) return;
    busy = true;
    // reset previous result
    result.classList.remove('show');
    doneMsg.classList.remove('show');
    choiceBtns.forEach((b) => b.classList.toggle('picked', b.dataset.move === move));
    setDisabled(true);

    const oppMove = BEATS[move]; // har doim yutadi
    const rm = reduceMotion();

    // "don-don-ziki" sanoq + qo'l silkitish
    youHand.textContent = '✊';
    meHand.textContent = '✊';
    if (!rm) { youHand.classList.add('shake-hand'); meHand.classList.add('shake-hand'); }

    const words = ['дон...', 'дон...', 'зики!'];
    let i = 0;
    countEl.textContent = words[0];
    const step = rm ? 120 : 520;
    const timer = setInterval(() => {
      i++;
      if (i < words.length) {
        countEl.textContent = words[i];
      } else {
        clearInterval(timer);
        reveal(move, oppMove);
      }
    }, step);
  }

  function reveal(move, oppMove) {
    youHand.classList.remove('shake-hand');
    meHand.classList.remove('shake-hand');
    youHand.textContent = EMO[move];
    meHand.textContent = EMO[oppMove];
    countEl.textContent = NAME[move] + ' × ' + NAME[oppMove];

    // romantik shart
    currentShart = pickShart();
    shartText.textContent = currentShart;

    verdict.textContent = 'Мен ютдим';
    result.classList.add('show');
    setDisabled(false);
    busy = false;

    // yuraklar otilsin (app.js dagi global burst)
    if (typeof window.burst === 'function') {
      const r = meHand.getBoundingClientRect();
      window.burst(r.left + r.width / 2, r.top + r.height / 2, 8);
    }
  }

  choiceBtns.forEach((b) => b.addEventListener('click', () => play(b.dataset.move)));

  if (accept) accept.addEventListener('click', () => {
    doneMsg.classList.add('show');
    // Jaxongir sahifasiga shartni yuborish (uning shaxsiy sahifasida ko'rinadi)
    if (window.PJ && typeof window.PJ.setShart === 'function' && currentShart) {
      window.PJ.setShart(currentShart);
    }
    if (typeof window.burst === 'function') {
      window.burst(window.innerWidth / 2, window.innerHeight * 0.6, 16);
    }
  });

  if (again) again.addEventListener('click', () => {
    result.classList.remove('show');
    doneMsg.classList.remove('show');
    choiceBtns.forEach((b) => b.classList.remove('picked'));
    countEl.textContent = 'танлашингни кутяпман...';
    youHand.textContent = '✊';
    meHand.textContent = '✊';
  });
})();
