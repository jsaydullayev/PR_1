/* ============================================================
   FIREBASE CONFIG  —  faqat shu faylni to'ldiring!
   ------------------------------------------------------------
   1. https://console.firebase.google.com  -> "Add project"
   2. Project ichida: Build -> Firestore Database -> Create database
      (Production yoki Test mode — keyin qoidalarni DEPLOY.md dan qo'ying)
   3. Project Settings (⚙️) -> "Your apps" -> Web (</>) ilovasi qo'shing
   4. Ko'rsatilgan firebaseConfig qiymatlarini pastga ko'chiring.

   Agar bu yer bo'sh qolsa (apiKey = "") — sayt localStorage rejimida
   ishlaydi (faqat shu qurilmada saqlanadi, sinxron emas). Domenda
   ikkala telefonda ko'rinishi uchun pastni TO'LDIRING.
   ============================================================ */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyBSJA_mVOyPzjjZLaE7wJ_RQtUt7Rg22FM",
  authDomain: "parizoda-e7d5f.firebaseapp.com",
  projectId: "parizoda-e7d5f",
  storageBucket: "parizoda-e7d5f.firebasestorage.app",
  messagingSenderId: "13337907654",
  appId: "1:13337907654:web:01323f457719f39a2c22c7",
  measurementId: "G-Z5NBSC3B6D"
};

/* Juftlik uchun bitta hujjat manzili — o'zgartirish shart emas */
window.COUPLE_DOC = { collection: "couple", id: "jaxongir-parizoda" };
