/* ============================================================
   Don-don ziki (Tosh-Qaychi-Qog'oz)
   ADOLATLI o'yin (50/50): raqib tasodifiy tanlaydi.
   Shartni SAYT EMAS — o'yinchining o'zi yozadi (Parizoda yoki Jaxongir).
   ============================================================ */
(function () {
  const EMO = { tosh: '✊', qaychi: '✌️', qogoz: '✋' };
  const NAME = { tosh: 'Тош', qaychi: 'Қайчи', qogoz: 'Қоғоз' };
  const MOVES = ['tosh', 'qaychi', 'qogoz'];
  // kalit qiymatni yengadi: tosh>qaychi, qaychi>qogoz, qogoz>tosh
  const WINS = { tosh: 'qaychi', qaychi: 'qogoz', qogoz: 'tosh' };

  let busy = false;

  const youHand = document.getElementById('rpsYou');
  const meHand = document.getElementById('rpsMe');
  const countEl = document.getElementById('rpsCount');
  const choicesWrap = document.getElementById('rpsChoices');
  const result = document.getElementById('rpsResult');
  const verdict = document.getElementById('rpsVerdict');
  const tease = document.getElementById('rpsTease');
  const shartBox = document.querySelector('.shart-box');
  const shartInput = document.getElementById('shartInput');
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
    result.classList.remove('show');
    doneMsg.classList.remove('show');
    choiceBtns.forEach((b) => b.classList.toggle('picked', b.dataset.move === move));
    setDisabled(true);

    const oppMove = MOVES[Math.floor(Math.random() * 3)]; // adolatli: tasodifiy
    const rm = reduceMotion();

    youHand.textContent = '✊';
    meHand.textContent = '✊';
    if (!rm) { youHand.classList.add('shake-hand'); meHand.classList.add('shake-hand'); }

    const words = ['дон...', 'дон...', 'зики!'];
    let i = 0;
    countEl.textContent = words[0];
    const step = rm ? 120 : 520;
    const timer = setInterval(() => {
      i++;
      if (i < words.length) { countEl.textContent = words[i]; }
      else { clearInterval(timer); reveal(move, oppMove); }
    }, step);
  }

  function reveal(move, oppMove) {
    youHand.classList.remove('shake-hand');
    meHand.classList.remove('shake-hand');
    youHand.textContent = EMO[move];
    meHand.textContent = EMO[oppMove];
    countEl.textContent = NAME[move] + ' × ' + NAME[oppMove];

    var outcome; // 'win' = Sen yutding, 'lose' = Man yutdim, 'draw'
    if (move === oppMove) outcome = 'draw';
    else if (WINS[move] === oppMove) outcome = 'win';
    else outcome = 'lose';

    if (outcome === 'win') {
      verdict.textContent = 'Сиз ютдингиз!';
      if (tease) tease.textContent = 'Ютган — сиз. Жаҳонгирга шартингизни ўзингиз ёзинг:';
    } else if (outcome === 'lose') {
      verdict.textContent = 'Мен ютдим';
      if (tease) tease.textContent = 'Қоидамизга кўра, шартни ёзаман — шу ерга ёзиб қўйинг:';
    } else {
      verdict.textContent = 'Дуранг!';
      if (tease) tease.textContent = 'Иккимиз ҳам тенг чиқдик — биргаликда бир шарт ёзинг:';
    }

    // shartni o'yinchi yozadi — saytdan avtomatik berilmaydi
    if (shartBox) shartBox.style.display = '';
    if (accept) { accept.style.display = ''; accept.disabled = false; accept.textContent = 'Шартни белгилаш'; }
    if (shartText) { shartText.hidden = true; shartText.textContent = ''; }
    if (shartInput) { shartInput.hidden = false; shartInput.value = ''; }

    result.classList.add('show');
    setDisabled(false);
    busy = false;

    if (typeof window.burst === 'function') {
      const r = meHand.getBoundingClientRect();
      window.burst(r.left + r.width / 2, r.top + r.height / 2, 8);
    }
  }

  choiceBtns.forEach((b) => b.addEventListener('click', () => play(b.dataset.move)));

  if (accept) accept.addEventListener('click', () => {
    const txt = (shartInput && shartInput.value || '').trim();
    if (!txt) { if (shartInput) shartInput.focus(); return; }
    // yozilgan shartni ko'rsatamiz va saqlaymiz (sinxron)
    if (shartText) { shartText.textContent = '«' + txt + '»'; shartText.hidden = false; }
    if (shartInput) shartInput.hidden = true;
    accept.style.display = 'none';
    doneMsg.classList.add('show');
    if (window.PJ && typeof window.PJ.setShart === 'function') window.PJ.setShart(txt);
    if (typeof window.burst === 'function') window.burst(window.innerWidth / 2, window.innerHeight * 0.6, 14);
  });

  if (again) again.addEventListener('click', () => {
    result.classList.remove('show');
    doneMsg.classList.remove('show');
    choiceBtns.forEach((b) => b.classList.remove('picked'));
    countEl.textContent = 'танлашингизни кутяпман...';
    youHand.textContent = '✊';
    meHand.textContent = '✊';
    if (shartInput) { shartInput.value = ''; shartInput.hidden = false; }
    if (shartText) { shartText.hidden = true; shartText.textContent = ''; }
    if (accept) { accept.style.display = ''; accept.textContent = 'Шартни белгилаш'; }
  });
})();
