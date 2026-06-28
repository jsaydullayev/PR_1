/* ============================================================
   Parizoda — interaktiv
   ============================================================ */

/* >>> SANALAR — agar yil/vaqt boshqacha bo'lsa, faqat shu ikki qatorni o'zgartiring <<< */
const DATES = {
  met: new Date(2026, 1, 2, 22, 0, 0),   // 2-fevral 2026, soat 22:00 (oy 0-indeksli: 1 = fevral)
  rel: new Date(2026, 3, 13, 18, 0, 0),  // 13-aprel 2026, soat 18:00
};

/* ---------- 1. Live counters ---------- */
const uzNum = (n) => n.toLocaleString('ru-RU'); // chiroyli mingliklar
function tickCounters() {
  const now = new Date();
  ['met', 'rel'].forEach((key) => {
    let diff = Math.max(0, now - DATES[key]);
    const days = Math.floor(diff / 86400000); diff -= days * 86400000;
    const h = Math.floor(diff / 3600000);     diff -= h * 3600000;
    const m = Math.floor(diff / 60000);        diff -= m * 60000;
    const s = Math.floor(diff / 1000);
    const dEl = document.querySelector(`[data-since="${key}"] .big`);
    if (dEl) dEl.textContent = uzNum(days);
    const set = (sel, val) => { const e = document.querySelector(sel); if (e) e.textContent = String(val).padStart(2, '0'); };
    set(`[data-h="${key}"]`, h);
    set(`[data-m="${key}"]`, m);
    set(`[data-s="${key}"]`, s);
  });
}
tickCounters();
setInterval(tickCounters, 1000);

/* ---------- 2. Background floating hearts ---------- */
const bg = document.getElementById('bgHearts');
const HEART_GLYPHS = ['💗', '💕', '💞', '🌸', '❤', '💖', '🩷'];
function spawnFloatHeart() {
  if (!bg) return;
  const el = document.createElement('span');
  el.className = 'float-heart';
  el.textContent = HEART_GLYPHS[Math.floor(Math.random() * HEART_GLYPHS.length)];
  el.style.left = Math.random() * 100 + 'vw';
  el.style.fontSize = (0.9 + Math.random() * 1.6) + 'rem';
  const dur = 7 + Math.random() * 7;
  el.style.animationDuration = dur + 's';
  el.style.opacity = (0.25 + Math.random() * 0.4).toFixed(2);
  bg.appendChild(el);
  setTimeout(() => el.remove(), dur * 1000 + 200);
}
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!reduceMotion) {
  for (let i = 0; i < 6; i++) setTimeout(spawnFloatHeart, i * 600);
  setInterval(spawnFloatHeart, 1400);
}

/* ---------- 3. Tap heart burst ---------- */
function tapHeart(x, y) {
  const el = document.createElement('span');
  el.className = 'tap-heart';
  el.textContent = HEART_GLYPHS[Math.floor(Math.random() * HEART_GLYPHS.length)];
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.fontSize = (1.2 + Math.random() * 1.2) + 'rem';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 950);
}
function burst(x, y, n = 6) {
  for (let i = 0; i < n; i++) {
    setTimeout(() => tapHeart(x + (Math.random() * 60 - 30), y + (Math.random() * 30 - 15)), i * 50);
  }
}
document.addEventListener('pointerdown', (e) => {
  // ignore interactive controls
  if (e.target.closest('button, input, a, image-slot, .envelope, .lightbox')) return;
  tapHeart(e.clientX, e.clientY);
}, { passive: true });

/* footer tap = bigger burst */
const footer = document.querySelector('.footer');
if (footer) footer.addEventListener('pointerdown', (e) => burst(e.clientX, e.clientY, 10), { passive: true });

/* ---------- 4. Envelope / letter ---------- */
const envelope = document.getElementById('envelope');
const letter = document.getElementById('letter');
function openLetter() {
  if (!envelope) return;
  envelope.classList.add('open');
  setTimeout(() => letter && letter.classList.add('show'), 450);
  const r = envelope.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, 8);
}
if (envelope) {
  envelope.addEventListener('click', () => { envelope.classList.contains('open') ? null : openLetter(); });
  envelope.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLetter(); } });
}

/* ---------- 5. Reveal on scroll (sections, reasons, timeline) ----------
   Base CSS state is VISIBLE. We add .pre to hide, then swap to .in (a
   @keyframes entrance). CSS transitions are frozen in some capture/preview
   environments, so we never gate visibility on a transition completing —
   removing .pre alone already reverts to the visible base style. */
const revealEls = Array.from(document.querySelectorAll('.reveal, .reason, .tl-item'));

if (!reduceMotion) {
  revealEls.forEach((el, i) => {
    el.classList.add('pre');
    if (el.classList.contains('reason') || el.classList.contains('tl-item')) {
      el.style.animationDelay = (i % 8) * 60 + 'ms';
    }
  });
}

function show(el) {
  el.classList.remove('pre');   // back to visible base immediately
  el.classList.add('in');       // keyframe entrance (progressive enhancement)
}

function revealNearViewport() {
  const vh = window.innerHeight || document.documentElement.clientHeight;
  let remaining = false;
  revealEls.forEach((el) => {
    if (el.classList.contains('in')) return;
    const r = el.getBoundingClientRect();
    if (r.top < vh * 0.92 && r.bottom > 0) show(el);
    else remaining = true;
  });
  return remaining;
}

// Primary: IntersectionObserver (smooth staggered reveal where supported)
let io = null;
try {
  io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) { show(en.target); io.unobserve(en.target); }
    });
  }, { threshold: 0.12 });
  revealEls.forEach((el) => io.observe(el));
} catch (e) { io = null; }

// Fallback: scroll/resize listeners + load + guaranteed timers.
// IO does not fire in every environment, so never leave content hidden.
window.addEventListener('scroll', revealNearViewport, { passive: true });
window.addEventListener('resize', revealNearViewport);
window.addEventListener('load', revealNearViewport);
revealNearViewport();
setTimeout(revealNearViewport, 300);
// Last-resort safety net: reveal everything still hidden.
setTimeout(() => { revealEls.forEach(show); }, 2200);

/* ---------- 6. Gallery lightbox ---------- */
const lightbox = document.getElementById('lightbox');
const lbImg = document.getElementById('lbImg');
const lbClose = document.getElementById('lbClose');
document.querySelectorAll('.gallery image-slot, .single-photo image-slot').forEach((slot) => {
  slot.addEventListener('click', () => {
    // image-slot stores the filled image as a background or inner img — find a usable src
    const inner = slot.shadowRoot && slot.shadowRoot.querySelector('img');
    let src = '';
    if (inner && inner.src && !inner.src.endsWith('#')) src = inner.src;
    if (!src) {
      const bgImg = slot.style.backgroundImage || (inner && getComputedStyle(inner).backgroundImage);
      const mm = bgImg && bgImg.match(/url\(["']?(.*?)["']?\)/);
      if (mm) src = mm[1];
    }
    if (src) {
      lbImg.src = src;
      lightbox.classList.add('show');
    }
  });
});
function closeLightbox() { lightbox.classList.remove('show'); lbImg.removeAttribute('src'); }
if (lbClose) lbClose.addEventListener('click', closeLightbox);
if (lightbox) lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });

/* ---------- 7. Game: love meter ---------- */
const range = document.getElementById('loveRange');
const meterOut = document.getElementById('meterOut');
const meterMsg = document.getElementById('meterMsg');
function meterUpdate() {
  const v = +range.value;
  if (v >= 100) {
    meterOut.textContent = '∞';
    meterMsg.textContent = 'санаб бўлмайди — чегараси йўқ';
  } else {
    meterOut.textContent = v + '%';
    if (v < 25) meterMsg.textContent = 'биламан, бундан кўпроқ';
    else if (v < 55) meterMsg.textContent = 'яхши — лекин яна борига-чи?';
    else if (v < 85) meterMsg.textContent = 'мана буни севги дейдилар';
    else meterMsg.textContent = 'деярли юрагимча...';
  }
}
if (range) { range.addEventListener('input', meterUpdate); meterUpdate(); }

/* ---------- 8. Game: Yes / No ---------- */
const btnYes = document.getElementById('btnYes');
const btnNo = document.getElementById('btnNo');
const ynResult = document.getElementById('ynResult');
let dodge = 0;
const NO_TAUNTS = ['Йўқ', 'Аниқми?', 'Ўйлаб кўр 🙂', 'Йўғ-е', 'Расданми?', 'Қайтадан ўйла', 'Жиддиймисан?'];
function dodgeNo() {
  dodge++;
  const dx = (Math.random() * 200 - 100);
  const dy = (Math.random() * 90 - 45);
  btnNo.style.transform = `translate(${dx}px, ${dy}px)`;
  btnNo.textContent = NO_TAUNTS[dodge % NO_TAUNTS.length];
  // Yes grows
  const scale = Math.min(1 + dodge * 0.12, 1.9);
  btnYes.style.transform = `scale(${scale})`;
}
if (btnNo) {
  btnNo.addEventListener('mouseenter', dodgeNo);
  btnNo.addEventListener('touchstart', (e) => { e.preventDefault(); dodgeNo(); }, { passive: false });
  btnNo.addEventListener('click', (e) => { e.preventDefault(); dodgeNo(); });
}
function sayYes() {
  ynResult.classList.add('show');
  const r = btnYes.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top, 14);
  setTimeout(() => burst(window.innerWidth / 2, window.innerHeight / 2, 16), 200);
  if (btnNo) btnNo.style.display = 'none';
}
if (btnYes) btnYes.addEventListener('click', sayYes);

/* ---------- 9. Music: real song file + gentle synth fallback ---------- */
const musicBtn = document.getElementById('musicBtn');
const musicHint = document.getElementById('musicHint');

/* >>> QO'SHIQ: "song.mp3" = Vafodorim.
       Fayl bo'lmasa, yumshoq kuy avtomatik chalinadi. <<< */
const SONG_SRC = (window.__resources && window.__resources.song) || 'song.mp3';

const songAudio = new Audio();
songAudio.src = SONG_SRC;
songAudio.loop = true;
songAudio.preload = 'auto';
songAudio.load();
let songOk = true;            // fayl yuklanadimi
songAudio.addEventListener('error', () => { songOk = false; });

let musicOn = false;
let audioCtx = null, schedTimer = null, masterGain = null; // synth fallback

// soft romantic progression (synth fallback) — C - G - Am - F
const PROG = [
  [261.63, 329.63, 392.00, 523.25],
  [196.00, 293.66, 392.00, 493.88],
  [220.00, 329.63, 440.00, 523.25],
  [174.61, 261.63, 349.23, 440.00],
];
let chordIdx = 0, noteIdx = 0;

function playNote(freq, time, dur) {
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = 'sine'; osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(0.16, time + 0.06);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  osc.connect(g); g.connect(masterGain);
  osc.start(time); osc.stop(time + dur + 0.05);
  const o2 = audioCtx.createOscillator();
  const g2 = audioCtx.createGain();
  o2.type = 'triangle'; o2.frequency.value = freq * 2;
  g2.gain.setValueAtTime(0.0001, time);
  g2.gain.exponentialRampToValueAtTime(0.04, time + 0.06);
  g2.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  o2.connect(g2); g2.connect(masterGain);
  o2.start(time); o2.stop(time + dur + 0.05);
}
function schedule() {
  const step = 0.42;
  const lookahead = audioCtx.currentTime + 0.2;
  const chord = PROG[chordIdx];
  const pattern = [0, 1, 2, 3, 2, 1];
  playNote(chord[pattern[noteIdx % pattern.length]], lookahead, step * 1.6);
  if (noteIdx % pattern.length === 0) playNote(chord[0] / 2, lookahead, step * 3);
  noteIdx++;
  if (noteIdx % pattern.length === 0) chordIdx = (chordIdx + 1) % PROG.length;
  schedTimer = setTimeout(schedule, step * 1000);
}
function startSynth() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.0;
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2600;
    masterGain.connect(lp); lp.connect(audioCtx.destination);
  }
  audioCtx.resume();
  masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
  masterGain.gain.setValueAtTime(masterGain.gain.value, audioCtx.currentTime);
  masterGain.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 1.2);
  schedule();
}
function stopSynth() {
  if (!audioCtx) return;
  masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
  masterGain.gain.setValueAtTime(masterGain.gain.value, audioCtx.currentTime);
  masterGain.gain.linearRampToValueAtTime(0.0, audioCtx.currentTime + 0.4);
  clearTimeout(schedTimer);
}

function setPlayingUI(on) {
  musicOn = on;
  if (!musicBtn) return;
  musicBtn.classList.toggle('playing', on);
  musicBtn.querySelector('.ico').textContent = on ? '🎶' : '🎵';
}
function startMusic() {
  // standalone bund'da song manzili kech tayyor bo'lishi mumkin
  var resolved = (window.__resources && window.__resources.song) || SONG_SRC;
  // faqat haqiqatan boshqa fayl bo'lsa src'ni yangilaymiz (aks holda qayta yuklab uzilib qoladi)
  if (resolved && songAudio.src.indexOf(resolved) === -1 && !/song\.mp3$/.test(songAudio.src)) {
    try { songAudio.src = resolved; songAudio.load(); } catch (e) {}
  }
  // avval haqiqiy qo'shiqni urinib ko'ramiz
  const p = songAudio.play();
  if (p && p.then) {
    p.then(() => { songOk = true; stopSynth(); setPlayingUI(true); })
     .catch(() => { songOk = false; startSynth(); setPlayingUI(true); });
  } else {
    setPlayingUI(true);
  }
}
function stopMusic() {
  try { songAudio.pause(); } catch (e) {}
  stopSynth();
  setPlayingUI(false);
}
if (musicBtn) {
  musicBtn.addEventListener('click', () => { musicOn ? stopMusic() : startMusic(); });
}
/* music hint peek */
setTimeout(() => musicHint && musicHint.classList.add('show'), 1800);
setTimeout(() => musicHint && musicHint.classList.remove('show'), 6000);
