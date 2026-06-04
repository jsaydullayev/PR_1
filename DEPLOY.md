# parizodam.uz — Firebase + domen + 24/7 hosting qo'llanmasi

Sayt **statik** (HTML/CSS/JS). Javob va rasm endi **Firebase Firestore**'da
saqlanadi — shu sabab ikkala telefonda real-vaqtda sinxron ko'rinadi.
`firebase-config.js` bo'sh bo'lsa sayt **localStorage** rejimida ishlaydi
(faqat shu qurilmada, sinxron emas).

---

## 1-qadam — Firebase loyihasi yaratish

1. https://console.firebase.google.com → **Add project** → nom bering (mas. `parizodam`).
   Google Analytics shart emas, o'tkazib yuboring.
2. Chap menyu: **Build → Firestore Database → Create database**.
   - Joylashuv: `eur3` yoki yaqin region.
   - **Production mode** ni tanlang (qoidalarni 3-qadamda qo'yamiz).
3. ⚙️ (yuqorida) → **Project settings → General → Your apps** →
   `</>` (Web) belgisini bosing → ilovaga nom bering → **Register app**.
4. Ko'rsatilgan `firebaseConfig` obyektini ko'chiring.

## 2-qadam — config'ni qo'yish

`firebase-config.js` faylini oching va qiymatlarni to'ldiring:

```js
window.FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "parizodam.firebaseapp.com",
  projectId: "parizodam",
  storageBucket: "parizodam.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};
```

Saqlang. Tamom — endi javob/rasm Firebase'ga yoziladi.

## 3-qadam — Firestore xavfsizlik qoidalari

Firebase konsol → **Firestore Database → Rules** → quyidagini qo'ying va **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Faqat sizning bitta hujjatingiz o'qiladi/yoziladi
    match /couple/jaxongir-parizoda {
      allow read, write: if true;
    }
    // Boshqa hamma narsa yopiq
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

> ⚠️ Bu qoida o'sha bitta hujjatni hammaga ochiq qiladi (login paroli
> kodda turgani uchun chin himoya emas). Shaxsiy sovg'a uchun yetarli —
> **havolani maxfiy tuting**. Kuchliroq himoya kerak bo'lsa, menga ayting,
> Firebase Authentication qo'shamiz.

---

## 4-qadam — 24/7 onlayn hosting (Cloudflare Pages — tekin)

Eng oson yo'l:

1. https://dash.cloudflare.com → **Workers & Pages → Create → Pages →
   Upload assets**.
2. Loyihaning **barcha fayllarini** (index.html, styles.css, app.js,
   account.js, firebase-config.js) bitta papka qilib **drag & drop** qiling.
3. **Deploy**. Bir necha soniyada `https://<nom>.pages.dev` manzili tayyor —
   doimiy 24/7 onlayn, tekin HTTPS bilan.

> Netlify (https://app.netlify.com/drop) ham xuddi shunday — papkani
> tashlaysiz, bo'ldi.

## 5-qadam — `parizodam.uz` domenini ulash

1. `.uz` domenni Cctld.uz akkreditatsiyasidagi rasmiy registrator orqali
   ro'yxatdan o'tkazing (ba'zan hujjat so'rashadi).
2. Cloudflare Pages → loyihangiz → **Custom domains → Set up a custom
   domain** → `parizodam.uz` kiriting.
3. Cloudflare bergan **DNS yozuvlarini** (CNAME / A) domeningizning DNS
   sozlamalariga qo'ying (registrator panelida).
4. 10–60 daqiqada ulanadi, SSL avtomatik beriladi.

---

## Maxfiylik maslahatlari

- **Havolani hech qaerga commit qilmang/yozmang** — faqat ikkangizda bo'lsin.
- Google qidiruvda chiqmasligi uchun `index.html`ning `<head>` ichiga
  qo'shing (xohlasangiz men qo'yib beraman):
  ```html
  <meta name="robots" content="noindex, nofollow">
  ```
- Firebase'da faqat 3-qadamdagi qoidani ishlating — boshqa hujjatlar yopiq.

## Fayllar ro'yxati (hammasini yuklang)

```
index.html
styles.css
app.js
account.js
firebase-config.js   ← shu yerga config'ni qo'yasiz
```

Savol bo'lsa yoki Firebase Auth / noindex qo'shishni xohlasangiz — ayting. 💗
