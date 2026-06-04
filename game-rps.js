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
    'Ҳозироқ менга қўнғироқ қилиб, «яраштик» дейсан 💗',
    'Аразни бир четга суриб, мени маҳкам қучоқлайсан 🤗',
    'Менга энг ширин табассумингни совға қиласан 😊',
    'Бир-биримизга «кечир» деб, ҳаммасини унутамиз 🤍',
    'Эртага биргаликда сайр қиламиз — фақат иккимиз 🌸',
    'Ҳозир менга «Сизни севаман» деб ёзасан 💌',
    'Қайта аразлашмасликка ваъда берамиз — мана шу қўл билан 🤝💗',
  ];

  let shartIdx = 0;
  let busy = false;
  let currentShart = '';

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

    const words = ['дон...', 'дон...', 'зики! 🎉'];
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
    currentShart = SHARTLAR[shartIdx % SHARTLAR.length];
    shartText.textContent = currentShart;
    shartIdx++;

    verdict.textContent = 'Жаҳонгир ютди! 🏆';
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
